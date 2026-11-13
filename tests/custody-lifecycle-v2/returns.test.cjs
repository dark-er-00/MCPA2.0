const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,migration,randomUUID}=require('./fixture.cjs');
test('migration preserves existing custody, histories, RPC definitions and grants',async t=>{
  const f=await fixture(t,{apply:false});
  const legacy=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createReturn',p_payload:{toolIds:['TOOL-005'],conditions:[{toolId:'TOOL-005',condition:'good'}]},p_operation_id:randomUUID()});
  const capture=async()=>({equipment:(await f.db.query('select * from equipment order by id')).rows,movements:(await f.db.query('select * from mcpa_movements order by id')).rows,
    operations:(await f.db.query('select * from mcpa_movement_operations order by id')).rows,
    functions:(await f.db.query("select oid::text,prosrc,proacl::text from pg_proc where oid in ('public.mcpa_movement_action(text,jsonb,uuid)'::regprocedure,'mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure,'public.mcpa_movement_snapshot()'::regprocedure) order by oid")).rows});
  const before=await capture();await f.db.exec(migration);assert.deepEqual(await capture(),before);
  assert.equal((await f.tool('TOOL-005')).status,'AVAILABLE');assert.equal(legacy.toolIds[0],'TOOL-005');
  await assert.rejects(f.db.exec(migration),/already exists/);await f.db.exec('rollback');
  assert.deepEqual(await capture(),before);
});
test('Engineer batch retains custody and stock exclusion; Admin receives notification',async t=>{
  const f=await fixture(t),op=randomUUID();const payload={assetIds:['TOOL-002','TOOL-003'],destinationId:f.sites.office,notes:''};
  const b=await f.action(f.actors.sky,'submitReturn',payload,op);
  assert.equal(b.status,'pendingInspection');assert.equal((await f.tool('TOOL-002')).current_holder_id,f.actors.sky.id);
  assert.equal((await f.snapshot(f.actors.sky)).returns[0].items.length,2);
  assert.equal((await f.rpc(f.actors.admin,'mcpa_movement_snapshot')).tools.find(v=>v.id==='TOOL-002').movementLock,'reserved');
  assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[b.id])).rows[0].n,2);
  assert.ok((await f.db.query('select 1 from mcpa_notifications where recipient_id=$1 and entity_id=$2',[f.actors.admin.id,b.id])).rows.length);
  assert.deepEqual(await f.action(f.actors.sky,'submitReturn',payload,op),b);
  await assert.rejects(f.action(f.actors.sky,'submitReturn',{...payload,notes:'changed'},op),/different/);
  await assert.rejects(f.action(f.actors.pau,'submitReturn',payload,op));
  await assert.rejects(f.submit(['TOOL-002']),/unavailable/);
  await assert.rejects(f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createTransfer',p_payload:{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:f.actors.pau.id},p_operation_id:randomUUID()}),/reserved/);
  assert.equal((await f.snapshot(f.actors.pau)).returns.length,0);
});
test('Good, Damaged, Missing and Disputed decisions support partial acceptance and later recovery',async t=>{
  const f=await fixture(t),b=await f.submit(['TOOL-002','TOOL-003','TOOL-004','TOOL-005']);
  await assert.rejects(f.action(f.actors.sky,'inspectReturn',{id:b.id,inspections:[]}),/Admin/);
  const inspections=[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true},{assetId:'TOOL-003',outcome:'damaged',physicallyReceived:true,notes:'Cracked handle'},
    {assetId:'TOOL-004',outcome:'missing',physicallyReceived:false,notes:'Not delivered'},{assetId:'TOOL-005',outcome:'disputed',physicallyReceived:false,notes:'Wrong unit presented'}];
  const op=randomUUID();const result=await f.inspect(b.id,inspections,op);
  assert.equal(result.status,'partialInspection');assert.equal(result.unresolvedCount,2);
  const good=await f.tool('TOOL-002'),bad=await f.tool('TOOL-003'),missing=await f.tool('TOOL-004');
  assert.equal(good.status,'AVAILABLE');assert.equal(good.current_holder_id,null);assert.equal(good.site_id,f.sites.office);
  assert.equal(bad.status,'REPAIR');assert.equal(bad.current_holder_id,null);assert.equal(bad.condition,'Damaged');
  assert.equal(missing.current_holder_id,f.actors.sky.id);assert.equal(missing.status,'IN_USE');assert.equal(missing.site_id,f.sites.casa);
  assert.equal((await f.db.query("select count(*)::int n from mcpa_movements where kind='repair' and data->>'toolId'='TOOL-003'")).rows[0].n,1);
  assert.deepEqual(await f.inspect(b.id,inspections,op),result);
  await assert.rejects(f.inspect(b.id,[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true}]),/changed/);
  await assert.rejects(f.db.query("update equipment set status='AVAILABLE',current_holder_id=null where asset_id='TOOL-004'"),/individual Admin/);
  await f.inspect(b.id,[{assetId:'TOOL-004',outcome:'good',physicallyReceived:true}]);
  assert.equal((await f.tool('TOOL-004')).status,'AVAILABLE');assert.equal((await f.snapshot(f.actors.sky)).returns[0].unresolvedCount,1);
  const repair=(await f.db.query("select id from mcpa_movements where kind='repair' and data->>'toolId'='TOOL-003'")).rows[0];
  await f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:'startRepair',p_payload:{id:repair.id},p_operation_id:randomUUID()});
  await f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:'completeRepair',p_payload:{id:repair.id},p_operation_id:randomUUID()});
  assert.equal((await f.tool('TOOL-003')).status,'AVAILABLE');
  assert.equal((await f.tool('TOOL-003')).condition,'Good');
  const requested=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-003'],destination:'Casa Buena',purpose:'Verified repaired unit'},p_operation_id:randomUUID()});
  assert.equal(requested.status,'pending','Repair completion restores requestability, including descriptive condition');
});
test('malformed inspection rolls back every decision',async t=>{
  const f=await fixture(t),b=await f.submit(['TOOL-002','TOOL-003']);
  await assert.rejects(f.inspect(b.id,[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true},{assetId:'TOOL-003',outcome:'good',physicallyReceived:false}]),/receipt/);
  assert.equal((await f.tool('TOOL-002')).status,'IN_USE');
  assert.ok((await f.snapshot(f.actors.admin)).returns[0].items.every(v=>v.outcome==='pending'));
  for(const checks of [[{assetId:'OUTSIDE',outcome:'good',physicallyReceived:true}],[{assetId:'TOOL-002',outcome:'missing',physicallyReceived:false}]])await assert.rejects(f.inspect(b.id,checks));
});
test('legacy return bypass and direct table writes are denied',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createReturn',p_payload:{toolIds:['TOOL-002'],conditions:[{toolId:'TOOL-002',condition:'good'}]},p_operation_id:randomUUID()}),/inspection v2/);
  for(const table of ['mcpa_b_return_items','mcpa_b_retirements','mcpa_b_evidence','mcpa_b_events'])await assert.rejects(f.query(f.actors.admin,`select * from public.${table}`),/permission denied/);
  for(const actor of [null,f.actors.secretary,f.actors.handler,f.actors.inactive])await assert.rejects(f.snapshot(actor));
  assert.equal((await f.tool('TOOL-002')).current_holder_id,f.actors.sky.id);
});
test('conflicting submissions and repeated acceptance admit one winner',async t=>{
  const f=await fixture(t);
  // Single-connection PGlite verifies stale-state rejection, not independent
  // PostgreSQL-session lock contention. See the implementation report.
  const results=await Promise.allSettled([f.submit(),f.submit()]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);
  const b=results.find(v=>v.status==='fulfilled').value;
  const outcomes=await Promise.allSettled([f.inspect(b.id,[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true}]),f.inspect(b.id,[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true}])]);
  assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
});
