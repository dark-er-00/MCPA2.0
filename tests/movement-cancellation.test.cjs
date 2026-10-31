// Isolated PostgreSQL and browser-memory fixtures only. No live database/API use.
// The user's later authorization permits implementation and isolated fixture tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100004_movement_cancellation.sql'),'utf8');
const action=(f,actor,name,payload,operation=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{
  p_action:name,p_payload:payload,p_operation_id:operation
});
async function preserved(f){
  const result={};
  for(const table of ['profiles','equipment','sites','mcpa_movements','mcpa_movement_assets','mcpa_movement_sites','mcpa_movement_reservations','mcpa_movement_operations']){
    result[table]=(await f.db.query(`select to_jsonb(t) as value from public.${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}
test('Cancellation migration is repeatable and preserves every existing record and activity event',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    const protectedRequest=await action(f,f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected mock request'});
    assert.equal(protectedRequest.id,'REQ-00001');
    const before=await preserved(f);
    await f.db.exec(migration);
    await f.db.exec(migration);
    assert.deepEqual(await preserved(f),before);
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_cancellations')).rows[0].n,0);
    const projected=(await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).requests.find(r=>r.id===protectedRequest.id);
    assert.equal(projected.status,'pending');
    assert.equal(projected.requesterId,f.actors.sky.id);
    assert.equal((await f.rpc(f.actors.pau,'mcpa_movement_snapshot')).requests.length,0,'Enrichment cannot broaden record visibility');
  }finally{await f.close();}
});
test('Cancellation audit refuses edits/deletion/truncation and has no direct browser write access',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    await f.db.exec(migration);
    const req=await action(f,f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Separate audit fixture'});
    const op=randomUUID();
    await f.db.query("insert into public.mcpa_movement_operations(id,action,payload,result,activity) values($1,'withdrawRequest','{}',$2,'{}')",[op,req]);
    await f.db.query("insert into public.mcpa_movement_cancellations values($1,$2,'withdrawRequest',$3,$4,'engineer','Mock audit reason',now(),$5,$6)",[op,req.id,f.actors.sky.id,f.actors.sky.name,req,{...req,status:'withdrawn'}]);
    const before=(await f.db.query('select to_jsonb(c) as value from public.mcpa_movement_cancellations c')).rows;
    for(const sql of ["update public.mcpa_movement_cancellations set reason='Changed'",'delete from public.mcpa_movement_cancellations','truncate public.mcpa_movement_cancellations']){
      await assert.rejects(f.db.exec(sql),/immutable/);
    }
    for(const actor of [null,f.actors.admin,f.actors.sky,f.actors.handler]){
      await assert.rejects(f.query(actor,'select * from public.mcpa_movement_cancellations'));
      await assert.rejects(f.query(actor,"update public.mcpa_movement_cancellations set reason='Forbidden'"));
    }
    assert.deepEqual((await f.db.query('select to_jsonb(c) as value from public.mcpa_movement_cancellations c')).rows,before);
  }finally{await f.close();}
});
test('Cloud cancellation binds retries to the same operation and preserves permission checks',async()=>{
  const calls=[],window=new EventTarget();
  let failure=true,allowed=true;
  window.MCPAAuth={profile:{id:'mock-user',name:'Mock User',role:'engineer'},canAction:()=>allowed,requireLive:()=>{}};
  window.supabaseClient={rpc:async(name,args)=>{
    if(name==='mcpa_movement_snapshot')return {data:{tools:[],requests:[],transfers:[]}};
    calls.push(args);
    if(failure)return {error:{code:'NETWORK'}};
    return {data:{id:args.p_payload.id,status:'withdrawn'}};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/movement-cloud.js'),'utf8'),{window,TOOLS:[],crypto:webcrypto,CustomEvent});
  const store=window.MovementStore,values={reason:'Duplicate fixture request',confirmed:true};
  await assert.rejects(store.withdrawRequest('REQ-MOCK',values));
  failure=false;await store.withdrawRequest('REQ-MOCK',values);
  assert.equal(calls[0].p_operation_id,calls[1].p_operation_id);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].p_payload)),{id:'REQ-MOCK',reason:values.reason,confirmed:true});
  assert.ok(!Object.hasOwn(calls[1].p_payload,'actor'),'Actor always comes from server authentication');
  allowed=false;
  for(const name of ['withdrawRequest','cancelReservation','cancelTransfer'])await assert.rejects(store[name]('REQ-MOCK',values),/not permitted/);
  assert.equal(calls.length,2,'Denied actions never contact the API');
});
test('Field request owners can withdraw/cancel; Admin and other roles cannot interrupt',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    const {sky:owner,pau:other,admin,architect,handler,secretary}=f.actors;
    const protectedRequest=await action(f,owner,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected mock transaction'});
    const protectedBefore=(await f.db.query('select to_jsonb(m) as value from public.mcpa_movements m where id=$1',[protectedRequest.id])).rows;
    const initialOperation=(await f.db.query('select to_jsonb(o) as value from public.mcpa_movement_operations o order by id')).rows;
    await f.db.exec(migration);
    const pending=await action(f,owner,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Independent withdrawal fixture'});
    const payload={id:pending.id,reason:'No longer needed',confirmed:true};
    const before=await preserved(f);
    for(const actor of [other,admin,architect,handler,secretary,null])await assert.rejects(action(f,actor,'withdrawRequest',payload));
    for(const invalid of [{reason:' '},{reason:'x'.repeat(2001)},{reason:42},{confirmed:false},{confirmed:'true'}]){
      await assert.rejects(action(f,owner,'withdrawRequest',{...payload,...invalid}));
    }
    assert.deepEqual(await preserved(f),before,'All rejected actions leave rows untouched');
    const op=randomUUID(),withdrawn=await action(f,owner,'withdrawRequest',{...payload,actor:{id:admin.id}},op);
    assert.equal(withdrawn.status,'withdrawn');assert.equal(withdrawn.canceledById,owner.id);
    assert.deepEqual(await action(f,owner,'withdrawRequest',payload,op),withdrawn,'Same-account retry is safe');
    await assert.rejects(action(f,other,'withdrawRequest',payload,op));
    await assert.rejects(action(f,owner,'withdrawRequest',{...payload,reason:'Changed reason'},op));
    await f.db.query('update profiles set name=$1 where id=$2',[owner.name,other.id]);
    await assert.rejects(action(f,other,'withdrawRequest',{...payload,id:protectedRequest.id}),'Identical names cannot impersonate the requester');
    await f.db.query('update profiles set name=$1 where id=$2',[other.name,other.id]);
    await assert.rejects(action(f,owner,'approveRequest',{id:pending.id}));
    const approved=await action(f,owner,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Reservation fixture'});
    await action(f,admin,'approveRequest',{id:approved.id});
    await assert.rejects(action(f,admin,'cancelReservation',{...payload,id:approved.id}));
    await assert.rejects(action(f,other,'cancelReservation',{...payload,id:approved.id}));
    const stock=(await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows;
    const canceled=await action(f,owner,'cancelReservation',{...payload,id:approved.id});
    assert.equal(canceled.status,'canceled');
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations')).rows[0].n,0);
    assert.deepEqual((await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows,stock,'Cancel never rewrites stock/custody');
    const snapshot=await f.rpc(owner,'mcpa_movement_snapshot');
    assert.ok(snapshot.activity.some(event=>event.action==='withdrawRequest'&&event.entityId===pending.id));
    assert.ok((await f.rpc(admin,'mcpa_movement_snapshot')).activity.some(event=>event.action==='cancelReservation'),'Admin receives monitoring activity');
    assert.deepEqual((await f.db.query('select to_jsonb(m) as value from public.mcpa_movements m where id=$1',[protectedRequest.id])).rows,protectedBefore);
    for(const old of initialOperation){assert.deepEqual((await f.db.query('select to_jsonb(o) as value from public.mcpa_movement_operations o where id=$1',[old.value.id])).rows[0],old);}
  }finally{await f.close();}
});
test('Requester can cancel an unreceived initial release and preserves both histories and custody',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    await f.db.exec(migration);
    const {sky:owner,admin,pau:other}=f.actors;
    const req=await action(f,owner,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Linked release fixture'});
    await action(f,admin,'approveRequest',{id:req.id});
    const transfer=await action(f,admin,'releaseRequest',{id:req.id});
    const before=(await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows;
    const payload={id:transfer.id,reason:'Project rescheduled',confirmed:true},op=randomUUID();
    for(const actor of [admin,other])await assert.rejects(action(f,actor,'cancelTransfer',payload));
    await assert.rejects(action(f,owner,'cancelReservation',{...payload,id:req.id}),'Released requests cannot cancel as reservations');
    const canceled=await action(f,owner,'cancelTransfer',payload,op);
    assert.equal(canceled.status,'canceled');assert.equal(canceled.requestId,req.id);
    const snapshot=await f.rpc(owner,'mcpa_movement_snapshot');
    const closed=snapshot.requests.find(r=>r.id===req.id);
    assert.equal(closed.status,'canceled');assert.equal(closed.transferId,transfer.id);
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_cancellations where operation_id=$1',[op])).rows[0].n,2);
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations')).rows[0].n,0);
    assert.deepEqual((await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows,before);
    await assert.rejects(action(f,owner,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]}));
    const handlerTransfer=await action(f,f.actors.handler,'createTransfer',{toolIds:['TOOL-001'],destination:'Casa Buena',receiverId:owner.id});
    const handlerBefore=await preserved(f);
    await assert.rejects(action(f,owner,'refuseTransfer',{id:handlerTransfer.id,reason:'Fixture damage',confirmed:true,inspections:[{toolId:'TOOL-001',condition:'damaged',notes:'Guard cracked',tested:true,disposition:'declined'}]}),'No new refusal can create a hold without authorized field resolution');
    assert.deepEqual(await preserved(f),handlerBefore);
    const receiverSnapshot=await f.rpc(owner,'mcpa_movement_snapshot');
    assert.ok(!receiverSnapshot.transfers.find(t=>t.id===handlerTransfer.id).allowedActions.includes('refuseTransfer'));
    await action(f,owner,'receiveTransfer',{id:handlerTransfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]});
    assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-001'])).rows[0].current_holder_id,owner.id,'Existing Tool Handler dispatch acceptance stays functional');
  }finally{await f.close();}
});
test('Named receiver refusal holds custody and locks; only original field sender reopens or cancels',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    await f.db.exec(migration);
    const {sky:sender,pau:receiver,admin,architect,handler}=f.actors;
    await f.db.query('update public.sites set assigned_engineer_id=$1 where id=$2',[receiver.id,f.sites.main]);
    const direct=await action(f,sender,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:receiver.id});
    const before=(await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows;
    const reservationBefore=(await f.db.query('select * from public.mcpa_movement_reservations order by equipment_id')).rows;
    const refusal={id:direct.id,reason:'Cracked guard; needs sender review',confirmed:true,inspections:[{toolId:'TOOL-002',condition:'damaged',notes:'Cracked guard',disposition:'declined',tested:true}]};
    for(const actor of [sender,admin,architect,handler])await assert.rejects(action(f,actor,'refuseTransfer',refusal));
    for(const inspections of [[],[{...refusal.inspections[0],tested:false}],[{...refusal.inspections[0],notes:''}],[{...refusal.inspections[0],toolId:'TOOL-003'}],[{toolId:'TOOL-002',condition:'good',tested:true}]]){
      await assert.rejects(action(f,receiver,'refuseTransfer',{...refusal,inspections}));
    }
    const op=randomUUID(),refused=await action(f,receiver,'refuseTransfer',refusal,op);
    assert.equal(refused.status,'refused');assert.equal(refused.refusedById,receiver.id);
    assert.deepEqual(await action(f,receiver,'refuseTransfer',refusal,op),refused);
    assert.deepEqual((await f.db.query('select * from public.mcpa_movement_reservations order by equipment_id')).rows,reservationBefore);
    assert.deepEqual((await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows,before);
    assert.equal((await f.rpc(sender,'mcpa_movement_snapshot')).repairs.length,0,'Refusal records condition without changing equipment into repair');
    assert.ok((await f.rpc(sender,'mcpa_movement_snapshot')).activity.some(event=>event.action==='refuseTransfer'&&event.entityId===direct.id));
    assert.ok((await f.rpc(receiver,'mcpa_movement_snapshot')).tools.some(tool=>tool.id==='TOOL-002'),'Refused tools remain in the named receiver inspection context');
    await assert.rejects(action(f,receiver,'receiveTransfer',{id:direct.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]}));
    const resolve={id:direct.id,reason:'Guard replaced; inspect again',confirmed:true};
    for(const actor of [receiver,admin,architect,handler])await assert.rejects(action(f,actor,'reopenTransfer',resolve));
    const reopened=await action(f,sender,'reopenTransfer',resolve);
    assert.equal(reopened.status,'pending');assert.equal(reopened.refusalReason,refusal.reason,'Earlier refusal remains visible');
    assert.deepEqual((await f.db.query('select * from public.mcpa_movement_reservations order by equipment_id')).rows,reservationBefore);
    await assert.rejects(action(f,admin,'cancelTransfer',resolve));
    await assert.rejects(action(f,receiver,'cancelTransfer',resolve));
    const canceled=await action(f,sender,'cancelTransfer',{...resolve,reason:'Use separate handover instead'});
    assert.equal(canceled.status,'canceled');
    assert.deepEqual((await f.db.query('select to_jsonb(e) as value from public.equipment e order by id')).rows,before);
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations')).rows[0].n,0);
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_refusals')).rows[0].n,2);
    await assert.rejects(f.db.exec("update public.mcpa_movement_refusals set reason='Rewrite'"),/immutable/);
    const newTransfer=await action(f,sender,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:receiver.id});
    await action(f,receiver,'refuseTransfer',{...refusal,id:newTransfer.id});
    await action(f,sender,'reopenTransfer',{...resolve,id:newTransfer.id});
    await action(f,receiver,'receiveTransfer',{id:newTransfer.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]});
    assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0].current_holder_id,receiver.id);
    await assert.rejects(action(f,sender,'cancelTransfer',{...resolve,id:newTransfer.id}),'Completed handovers cannot be canceled');
    const race=await action(f,receiver,'createTransfer',{toolIds:['TOOL-002'],destination:'Casa Buena',receiverId:sender.id});
    const raced=await Promise.allSettled([
      action(f,receiver,'cancelTransfer',{...resolve,id:race.id}),
      action(f,sender,'receiveTransfer',{id:race.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]})
    ]);
    assert.equal(raced.filter(result=>result.status==='fulfilled').length,1,'Cancellation and receipt cannot both commit');
    const final=(await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0];
    assert.equal(final.current_holder_id,receiver.id,'Cancellation won this deterministic fixture race and kept original custody');
    assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations where movement_id=$1',[race.id])).rows[0].n,0);
  }finally{await f.close();}
});
test('Demo cancellation and refusal preserve custody, locks, audit and failed-write atomicity',()=>{
  const saved=new Map();let failWrite=false;
  const window={MCPAAuth:{isDemo:true,profile:{role:'engineer',name:'Engr Sky'}},console,
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>{if(failWrite)throw Error('Fixture quota');saved.set(key,value);}},
    addEventListener:()=>{},dispatchEvent:()=>{},CustomEvent:class{}};
  const tools=[{id:'DEMO-STOCK',name:'Fixture stock',site:'Origin',holder:'\u2014',status:'available',qty:1},
    {id:'DEMO-HELD',name:'Fixture held',site:'Origin',holder:'Engr Sky',status:'inuse',qty:1},
    {id:'DEMO-RECEIVER',name:'Other receiver fixture',site:'Destination',holder:'Engineer Receiver',status:'inuse',qty:1}];
  const sandbox=vm.createContext({window,console,TOOLS:tools});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/movement-store.js'),'utf8'),sandbox);
  const store=window.MovementDemoStore;store.activate();
  const setUser=(role,name)=>{window.MCPAAuth.profile={role,name};};
  const change={reason:'Schedule changed',confirmed:true};
  const request=store.createRequest({toolIds:['DEMO-STOCK'],destination:'Origin',purpose:'Fixture'});
  const baseline=JSON.stringify(store.getState());
  failWrite=true;assert.throws(()=>store.withdrawRequest(request.id,change),/nothing was changed/);failWrite=false;
  assert.equal(JSON.stringify(store.getState()),baseline);
  assert.equal(store.withdrawRequest(request.id,change).status,'withdrawn');
  const second=store.createRequest({toolIds:['DEMO-STOCK'],destination:'Origin',purpose:'Another fixture'});
  setUser('admin','Engr Pau');store.approveRequest(second.id);
  assert.throws(()=>store.cancelReservation(second.id,change),/accountable/);
  setUser('architect','Engr Sky');assert.equal(store.cancelReservation(second.id,change).status,'canceled');
  const direct=store.createTransfer({toolIds:['DEMO-HELD'],destination:'Destination',receiver:'Engineer Receiver'});
  const source=JSON.stringify(store.getState().tools);
  setUser('engineer','Engineer Receiver');
  const refusal={...change,inspections:[{toolId:'DEMO-HELD',condition:'damaged',notes:'Cracked guard',tested:true,disposition:'declined'}]};
  assert.equal(store.refuseTransfer(direct.id,refusal).status,'refused');
  assert.equal(JSON.stringify(store.getState().tools),source);
  setUser('engineer','Engr Sky');
  assert.throws(()=>store.createTransfer({toolIds:['DEMO-HELD'],destination:'Destination',receiver:'Engineer Receiver'}),/sender follow-up/);
  assert.equal(store.reopenTransfer(direct.id,change).status,'pending');
  assert.equal(store.cancelTransfer(direct.id,change).status,'canceled');
  assert.equal(JSON.stringify(store.getState().tools),source);
  assert.equal(store.getState().refusalHistory.length,2);
  assert.equal(store.getState().cancellationHistory.length,3);
});
