// Disposable PostgreSQL only: no remote accounts, assignments, custody or records.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs'),{configure}=require('./office-return-fixture.cjs');
const act=(f,actor,action,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
async function setup(full=false){
 const f=await authDatabase({engineerPortal:true});
 if(full){for(const file of ['202610100004_movement_cancellation.sql','202610100006_monitoring.sql','202610120001_request_turnover_notifications.sql'])await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));await configure(f);}
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.pau.id,f.sites.main]);
 return f;
}
const records=async f=>Object.fromEntries(await Promise.all(['sites','profiles','equipment','mcpa_movements','mcpa_movement_operations','mcpa_movement_reservations'].map(async table=>[table,(await f.db.query('select * from '+table+' order by 1')).rows])));

for(const full of [false,true])test('existing '+(full?'Office/cancellation':'deployed portal')+' gateway authorizes request projects by permanent profile ID, never Auth UUID/name or forged receiver',async()=>{
 const f=await setup(full),a=f.actors;
 try{
  await f.db.query("update profiles set name='Same Display Name' where id in ($1,$2)",[a.sky.id,a.pau.id]);
  const before=await records(f);
  for(const [person,siteId,otherId]of [[a.sky,f.sites.casa,f.sites.main],[a.pau,f.sites.main,f.sites.casa]]){
   assert.notEqual(person.id,person.authId);
   const profile=await f.rpc(person,'mcpa_my_profile'),snapshot=await f.rpc(person,'mcpa_movement_snapshot');
   assert.equal(profile.id,person.id);assert.equal(profile.name,'Same Display Name');
   assert.equal(snapshot.sites.find(s=>s.id===siteId).assigned_engineer_id,person.id);
   assert.equal(snapshot.sites.find(s=>s.id===otherId).assigned_engineer_id,null,'Other assignment identities stay redacted');
   const other=snapshot.sites.find(s=>s.id===otherId),own=snapshot.sites.find(s=>s.id===siteId);
   await assert.rejects(act(f,person,'createRequest',{toolIds:['TOOL-001'],destination:other.name,receiverId:person.id,actor:{id:a.admin.id,role:'admin',name:a.admin.name},purpose:'Forged project'}),e=>e.code==='42501');
   assert.deepEqual(await records(f),before,'Rejected request changes no data');
   const request=await act(f,person,'createRequest',{toolIds:['TOOL-001'],destination:own.name,destinationId:otherId,receiverId:person===a.sky?a.pau.id:a.sky.id,purpose:'Verified assigned project'});
   assert.equal(request.destinationId,siteId,'Canonical site is resolved from authorized destination');assert.equal(request.receiverId,person.id,'Receiver is bound to authenticated company profile');
   // Save the latest baseline before the other person's rejected action.
   Object.assign(before,await records(f));
  }
  assert.deepEqual((await records(f)).sites,before.sites);
 }finally{await f.close();}
});

test('no-assignment, archived and name-only project links cannot authorize requests; Architect uses the same checks',async()=>{
 const f=await setup(),a=f.actors;
 try{
  await f.db.query('update sites set assigned_engineer_id=null where id=$1',[f.sites.casa]);
  // Legacy assigned_engineer text still says Engineer A; it grants no authority.
  const before=await records(f);
  await assert.rejects(act(f,a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'No assigned project'}),e=>e.code==='42501');
  await assert.rejects(act(f,a.architect,'createRequest',{toolIds:['TOOL-001'],destination:'Main Warehouse',purpose:'Unauthorized Architect project'}),e=>e.code==='42501');
  assert.deepEqual(await records(f),before);
  await f.db.query('update sites set assigned_engineer_id=$1,is_active=false where id=$2',[a.architect.id,f.sites.casa]);
  const archived=await records(f);await assert.rejects(act(f,a.architect,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Archived project'}),e=>e.code==='42501');assert.deepEqual(await records(f),archived);
  await f.db.query('update sites set is_active=true where id=$1',[f.sites.casa]);
  const request=await act(f,a.architect,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Assigned Architect project'});assert.equal(request.receiverId,a.architect.id);assert.equal(request.destinationId,f.sites.casa);
 }finally{await f.close();}
});

test('assigned request approval/release/notification/tested receipt preserve existing history and project assignments',async()=>{
 const f=await setup(true),a=f.actors;
 try{
  const before=await records(f),request=await act(f,a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Assigned request lifecycle'});
  assert.equal(request.status,'pending');assert.deepEqual((await records(f)).equipment,before.equipment);
  await act(f,a.admin,'approveRequest',{id:request.id});assert.deepEqual((await records(f)).equipment,before.equipment);
  const transfer=await act(f,a.admin,'releaseRequest',{id:request.id});assert.deepEqual((await records(f)).equipment,before.equipment);
  assert.ok((await f.rpc(a.sky,'mcpa_monitoring_snapshot')).notifications.some(n=>n.entityId===transfer.id&&n.title==='Equipment Pending Turnover'));
  assert.ok(!(await f.rpc(a.pau,'mcpa_monitoring_snapshot')).notifications.some(n=>n.entityId===transfer.id));
  await act(f,a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]});
  const snapshot=await f.rpc(a.sky,'mcpa_movement_snapshot');assert.equal(snapshot.requests.find(r=>r.id===request.id).status,'received');assert.equal(snapshot.tools.find(t=>t.id==='TOOL-001').holderId,a.sky.id);
  assert.ok(snapshot.activity.some(r=>r.action==='receiveTransfer'&&r.entityId===transfer.id));assert.deepEqual((await records(f)).sites,before.sites);assert.deepEqual((await records(f)).profiles,before.profiles);
  const saved=await records(f);await assert.rejects(act(f,a.pau,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Other Engineer project'}),e=>e.code==='42501');assert.deepEqual(await records(f),saved,'Historical movement/custody records unchanged by invalid request');
 }finally{await f.close();}
});
