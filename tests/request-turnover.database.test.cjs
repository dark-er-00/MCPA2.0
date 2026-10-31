// Real SQL/RLS in disposable PGlite only. No remote Auth, email or Supabase.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8');
const change=read('migrations/202610120001_request_turnover_notifications.sql');
async function setup(){const f=await authDatabase({engineerPortal:true});for(const file of ['202610100004_movement_cancellation.sql','202610100006_monitoring.sql'])await f.db.exec(read('migrations/'+file));return f;}
const action=(f,actor,name,payload,id=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:id});
const noticeRows=f=>f.db.query('select * from public.mcpa_notifications order by id').then(r=>r.rows);
async function addTool(f,id,quantity=1){await f.db.query("insert into equipment(id,asset_id,name,quantity,status) values($1,$2,$3,$4,'AVAILABLE')",[randomUUID(),id,'Training '+id,quantity]);}

test('existing release notifications already use company profile IDs; copy migration preserves all existing records and deduplicates future releases',async()=>{
 const f=await setup(),{db,actors:a}=f;
 try{
  assert.notEqual(a.sky.id,a.sky.authId);
  await db.query('update auth.users set email=$1 where id=$2',['turnover-fixture-'+randomUUID()+'@gmail.com',a.sky.authId]);
  await db.query('update profiles set name=$1 where id in ($2,$3)',['Same Display Name',a.sky.id,a.pau.id]);
  const old=await action(f,a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Pre-existing isolated handover'});
  await action(f,a.admin,'approveRequest',{id:old.id});const oldTransfer=await action(f,a.admin,'releaseRequest',{id:old.id});
  const oldRelease=(await noticeRows(f)).find(n=>n.recipient_id===a.sky.id && n.data.action==='releaseRequest');
  assert.equal(oldRelease.entity_id,oldTransfer.id);assert.equal(oldRelease.title,'Tools released','Baseline monitoring already produces releases');
  const before={};for(const table of ['equipment','profiles','sites','mcpa_movements','mcpa_movement_operations','mcpa_notifications'])before[table]=(await db.query('select * from '+table+' order by id')).rows;
  await db.exec(change);
  for(const table of Object.keys(before))assert.deepEqual((await db.query('select * from '+table+' order by id')).rows,before[table],'Migration preserves '+table);
  const preflight=(await db.query(read('request-turnover-preflight.sql'))).rows[0].request_turnover_preflight;
  assert.equal(preflight.recipient_turnover_copy,true);assert.equal(preflight.notification_trigger_enabled,true);assert.equal(preflight.notification_rls,true);assert.equal(preflight.anonymous_movement_execute,false);
  assert.ok((await f.rpc(a.sky,'mcpa_movement_snapshot')).transfers.some(t=>t.id===oldTransfer.id&&t.status==='pending'),'Existing pending turnover visible without notification backfill');
  await addTool(f,'RELEASE-A');await addTool(f,'RELEASE-B',3);
  const request=await action(f,a.sky,'createRequest',{toolIds:['RELEASE-A','RELEASE-B'],destination:'Casa Buena',purpose:'Multiple whole records with independent identity'});
  const failedBefore=await noticeRows(f);
  await assert.rejects(action(f,a.admin,'releaseRequest',{id:request.id}),e=>e.code==='40001');assert.deepEqual(await noticeRows(f),failedBefore,'Failed release adds no notification');
  await action(f,a.admin,'approveRequest',{id:request.id});
  const operation=randomUUID(),transfer=await action(f,a.admin,'releaseRequest',{id:request.id},operation);
  const notices=(await noticeRows(f)).filter(n=>n.data.operationId===operation);
  assert.equal(notices.length,1);assert.equal(notices[0].recipient_id,a.sky.id);assert.notEqual(notices[0].recipient_id,a.sky.authId);
  assert.equal(notices[0].title,'Equipment Pending Turnover');assert.equal(notices[0].entity_id,transfer.id);assert.equal(notices[0].data.route,'transfer');assert.equal(notices[0].data.requestId,request.id);
  assert.ok(notices[0].message.includes(request.id)&&notices[0].message.includes('RELEASE-A')&&notices[0].message.includes('RELEASE-B'));
  const reserved=(await db.query("select * from mcpa_movement_reservations where movement_id=$1",[transfer.id])).rows;assert.equal(reserved.length,2);
  for(const tool of (await db.query("select current_holder_id,status from equipment where asset_id in ('RELEASE-A','RELEASE-B')")).rows){assert.equal(tool.current_holder_id,null);assert.equal(tool.status,'AVAILABLE');}
  const retry=await action(f,a.admin,'releaseRequest',{id:request.id},operation);assert.deepEqual(retry,transfer);
  for(let i=0;i<3;i++)await f.rpc(a.sky,'mcpa_monitoring_snapshot');assert.equal((await noticeRows(f)).filter(n=>n.data.operationId===operation).length,1);
  const mine=(await f.rpc(a.sky,'mcpa_monitoring_snapshot')).notifications;assert.ok(mine.some(n=>n.id===notices[0].id));
  for(const actor of [a.pau,a.architect,a.handler,a.admin]){
    assert.ok(!(await f.rpc(actor,'mcpa_monitoring_snapshot')).notifications.some(n=>n.id===notices[0].id),'Another profile cannot see recipient turnover');
    await assert.rejects(f.rpc(actor,'mcpa_monitoring_mark_read',{p_id:notices[0].id}),e=>e.code==='42501');
  }
  assert.ok(!(await f.rpc(a.pau,'mcpa_movement_snapshot')).transfers.some(t=>t.id===transfer.id),'Duplicate name does not authorize handover details');
  await assert.rejects(action(f,a.pau,'receiveTransfer',{id:transfer.id,receiverId:a.sky.id,inspections:[{toolId:'RELEASE-A',condition:'good',tested:true},{toolId:'RELEASE-B',condition:'good',tested:true}]}),e=>e.code==='42501');
  const custodyBefore=(await db.query("select * from equipment where asset_id in ('RELEASE-A','RELEASE-B') order by id")).rows;
  await f.rpc(a.sky,'mcpa_monitoring_mark_read',{p_id:notices[0].id});assert.deepEqual((await db.query("select * from equipment where asset_id in ('RELEASE-A','RELEASE-B') order by id")).rows,custodyBefore,'Opening/marking read never receives equipment');
  await assert.rejects(action(f,a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'RELEASE-A',condition:'good',tested:true}]}),e=>e.code==='22023');
  await assert.rejects(action(f,a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'RELEASE-A',condition:'good',tested:false},{toolId:'RELEASE-B',condition:'good',tested:true}]}),e=>e.code==='22023');
  assert.deepEqual((await db.query("select * from equipment where asset_id in ('RELEASE-A','RELEASE-B') order by id")).rows,custodyBefore,'Partial/untested receipt does not change custody');
  await action(f,a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'RELEASE-A',condition:'good',tested:true},{toolId:'RELEASE-B',condition:'good',tested:true}]});
  const state=await f.rpc(a.sky,'mcpa_movement_snapshot');assert.equal(state.requests.find(r=>r.id===request.id).status,'received');assert.equal(state.transfers.find(t=>t.id===transfer.id).status,'received');
  const personal=await f.rpc(a.sky,'mcpa_personal_equipment_snapshot');assert.ok(['RELEASE-A','RELEASE-B'].every(id=>personal.tools.some(t=>t.id===id&&t.holderId===a.sky.id)));
  assert.equal((await db.query('select * from mcpa_movement_reservations where movement_id=$1',[transfer.id])).rows.length,0);
  assert.ok(state.activity.some(row=>row.action==='receiveTransfer'&&row.entityId===transfer.id));
  assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[old.id])).rows,[before.mcpa_movements.find(row=>row.id===old.id)],'Prior pending workflow untouched');
  const secondBefore=await noticeRows(f);await db.exec(change);assert.deepEqual(await noticeRows(f),secondBefore,'Migration rerun does not backfill/duplicate');
 }finally{await f.close();}
});

test('release notices roll back with transactions and Architect receipt retains the same safeguards',async()=>{
 const f=await setup(),{db,actors:a}=f;
 try{
  const observer={id:randomUUID(),authId:randomUUID(),name:'Second Admin',role:'admin'};
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[observer.authId,'second-admin@example.test']);
  await db.query("insert into profiles(id,name,auth_user_id,role,account_status) values($1,$2,$3,'admin','active')",[observer.id,observer.name,observer.authId]);
  await db.exec(change);await db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,f.sites.main]);
  await addTool(f,'ARCHITECT-TURNOVER');
  const req=await action(f,a.architect,'createRequest',{toolIds:['ARCHITECT-TURNOVER'],destination:'Main Warehouse',purpose:'Architect turnover regression'});await action(f,a.admin,'approveRequest',{id:req.id});
  const before=await noticeRows(f),movements=(await db.query('select * from mcpa_movements order by id')).rows;
  await db.exec('begin');await action(f,a.admin,'releaseRequest',{id:req.id});assert.ok((await noticeRows(f)).length>before.length);await db.exec('rollback');
  assert.deepEqual(await noticeRows(f),before);assert.deepEqual((await db.query('select * from mcpa_movements order by id')).rows,movements);
  const transfer=await action(f,a.admin,'releaseRequest',{id:req.id});assert.ok((await f.rpc(a.architect,'mcpa_monitoring_snapshot')).notifications.some(n=>n.title==='Equipment Pending Turnover'&&n.entityId===transfer.id));
  const observerNotice=(await f.rpc(observer,'mcpa_monitoring_snapshot')).notifications.find(n=>n.entityId===transfer.id);
  assert.equal(observerNotice.title,'Tools released','Other Admin observers do not get personal turnover wording');
  await action(f,a.architect,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'ARCHITECT-TURNOVER',condition:'damaged',tested:true,disposition:'accepted',notes:'Pre-existing damage in local fixture'}]});
  const state=await f.rpc(a.architect,'mcpa_movement_snapshot');assert.equal(state.tools.find(t=>t.id==='ARCHITECT-TURNOVER').holderId,a.architect.id);assert.equal(state.tools.find(t=>t.id==='ARCHITECT-TURNOVER').status,'repair');assert.ok(state.repairs.some(r=>r.toolId==='ARCHITECT-TURNOVER'));
 }finally{await f.close();}
});

test('turnover migration refuses missing monitoring instead of installing tables or widening permissions',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  const before=(await f.db.query('select * from profiles order by id')).rows;
  const result=(await f.db.query(read('request-turnover-preflight.sql'))).rows[0].request_turnover_preflight;
  assert.equal(result.notification_table,false);assert.equal(result.monitoring_snapshot_rpc,false);
  await assert.rejects(f.db.exec(change),/Existing authenticated monitoring setup is required/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regclass('public.mcpa_notifications') as relation")).rows[0].relation,null);
  assert.deepEqual((await f.db.query('select * from profiles order by id')).rows,before);
 }finally{await f.close();}
});
