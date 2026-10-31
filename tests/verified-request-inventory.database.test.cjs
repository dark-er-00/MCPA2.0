const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
// Exercise the canonical Git SQL bytes on Windows too. This historical patch
// compares a literal guard against normalized prosrc during repeated installs.
// Its CRLF repeat-install limitation is separately covered below; no migration
// history or expected fingerprint is changed by this fixture normalization.
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610200001_verified_request_inventory.sql'),'utf8').replace(/\r/g,'');
const read=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
const action=(f,actor,p_action,p_payload,operation=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:operation});
async function setup(t,{oldMetadata=false}={}){
  const f=await authDatabase({engineerPortal:true});t.after(()=>f.close());
  await f.db.exec(read('202610100004_movement_cancellation.sql'));
  await f.db.exec(read('202610120003_optional_request_purpose.sql'));
  await require('./office-return-fixture.cjs').configure(f);
  await f.db.exec(read('202610120004_equipment_office_default.sql'));
  if(oldMetadata)await f.db.exec(read('202610150001_inventory_availability.sql'));
  return f;
}
async function records(f){return (await f.db.query(`select jsonb_build_object(
  'equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),
  'movements',(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m),
  'assets',(select jsonb_agg(to_jsonb(a) order by movement_id,equipment_id) from mcpa_movement_assets a),
  'reservations',(select jsonb_agg(to_jsonb(r) order by equipment_id) from mcpa_movement_reservations r),
  'history',(select jsonb_agg(to_jsonb(o) order by id) from mcpa_movement_operations o),
  'sites',(select jsonb_agg(to_jsonb(s) order by id) from sites s)) as value`)).rows[0].value;}

for(const oldMetadata of [false,true])test(`verified catalog installs over ${oldMetadata?'v1 metadata':'legacy scoped reader'} without record changes and is retry safe`,async t=>{
  const f=await setup(t,{oldMetadata}),before=await records(f);
  await f.db.exec(migration);await f.db.exec(migration);assert.deepEqual(await records(f),before);
  const data=await f.rpc(f.actors.sky,'mcpa_movement_snapshot');
  assert.equal(data.inventoryVerificationRevision,2);assert.equal(data.inventoryAvailabilityVersion,1);
  assert.equal(data.tools.find(t=>t.id==='TOOL-001').movementLock,null);
  for(const actor of [null,f.actors.secretary,f.actors.inactive])await assert.rejects(f.rpc(actor,'mcpa_movement_snapshot'));
  await assert.rejects(f.query(f.actors.sky,"select mcpa_auth_private.inventory_lock($1)",[f.tools['TOOL-001']]));
});

test('historical CRLF repeat installation fails closed without rewriting inventory',async t=>{
  const f=await setup(t),before=await records(f),crlf=migration.replace(/\n/g,'\r\n');
  await f.db.exec(crlf);
  await assert.rejects(f.db.exec(crlf),/lifecycle differs/);await f.db.exec('rollback');
  assert.deepEqual(await records(f),before);
});

test('Office stock is discoverable for Engineers and Architects; restricted project custody and private movement details stay scoped',async t=>{
  const f=await setup(t);await f.db.exec(migration);
  await f.db.query("insert into equipment(id,asset_id,name,quantity) values($1,'OFFICE-STOCK','Office stock',3)",[randomUUID()]);
  for(const actor of [f.actors.pau,f.actors.architect]){
    const snapshot=await f.rpc(actor,'mcpa_movement_snapshot'),stock=snapshot.tools.find(t=>t.id==='OFFICE-STOCK');
    assert.equal(stock.siteId,f.sites.office);assert.equal(stock.movementLock,null);
    assert.equal(snapshot.tools.some(t=>t.id==='TOOL-002'),false,'Unrelated project custody is restricted');
    assert.equal((await f.query(actor,'select * from equipment')).rows.length,0,'RLS denies direct field access to the Admin inventory table');
  }
  // The incumbent authorization explicitly permits unheld AVAILABLE stock across
  // projects; location alone is not an access denial. Do not expand that rule.
  assert.ok((await f.rpc(f.actors.pau,'mcpa_movement_snapshot')).tools.some(t=>t.id==='TOOL-001'));
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.architect.id,f.sites.main]);
  const request=await action(f,f.actors.architect,'createRequest',{toolIds:['OFFICE-STOCK'],destination:'Main Warehouse'});
  assert.equal(request.receiverId,f.actors.architect.id);
  await assert.rejects(action(f,f.actors.pau,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena'}),e=>e.code==='42501');
});

test('T-8862 / REQ-00013 release retains AVAILABLE, unknown site and reservations until tested authorized receipt; history and retry identity survive',async t=>{
  const f=await setup(t);
  // Reproduce the supplied production finding before installing prospective defaults.
  const id=randomUUID();await f.db.query("insert into equipment(id,asset_id,name,quantity) values($1,'T-8862','Welding Machine',1)",[id]);
  await f.db.query('update equipment set site_id=null where id=$1',[id]);
  await f.db.exec("select setval('mcpa_movement_number',12)");
  const request=await action(f,f.actors.sky,'createRequest',{toolIds:['T-8862'],destination:'Casa Buena'});
  assert.equal(request.id,'REQ-00013');await action(f,f.actors.admin,'approveRequest',{id:request.id});
  const transfer=await action(f,f.actors.admin,'releaseRequest',{id:request.id});
  const released=await records(f);await f.db.exec(migration);assert.deepEqual(await records(f),released);
  assert.equal(released.equipment.find(e=>e.id===id).status,'AVAILABLE');assert.equal(released.equipment.find(e=>e.id===id).site_id,null);
  assert.equal(released.reservations.find(r=>r.equipment_id===id).movement_id,transfer.id);
  const privateView=await f.rpc(f.actors.pau,'mcpa_movement_snapshot');
  assert.equal(privateView.tools.find(t=>t.id==='T-8862').movementLock,'transfer');
  assert.equal(privateView.requests.some(r=>r.id===request.id),false);assert.equal(privateView.transfers.some(r=>r.id===transfer.id),false);
  await assert.rejects(action(f,f.actors.sky,'createRequest',{toolIds:['T-8862'],destination:'Casa Buena'}),/reserved, pending receipt/);
  await assert.rejects(action(f,f.actors.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'T-8862',condition:'good',tested:true}]}));
  await assert.rejects(action(f,f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'T-8862',condition:'good',tested:false}]}));
  await assert.rejects(f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/equipment-office-confirmed-correction.sql'),'utf8')),/active custody\/workflow/);await f.db.exec('rollback');
  assert.deepEqual(await records(f),released,'Failed requests, receipts and Office correction preserve every record');
  const op=randomUUID(),payload={id:transfer.id,inspections:[{toolId:'T-8862',condition:'good',tested:true}]};
  await action(f,f.actors.sky,'receiveTransfer',payload,op);const received=await records(f);
  await action(f,f.actors.sky,'receiveTransfer',payload,op);assert.deepEqual(await records(f),received);
  const tool=received.equipment.find(e=>e.id===id);assert.equal(tool.current_holder_id,f.actors.sky.id);assert.equal(tool.site_id,f.sites.casa);assert.equal(tool.status,'IN_USE');assert.equal(tool.quantity,1);
  assert.ok(!(received.reservations||[]).some(r=>r.equipment_id===id));assert.equal(received.movements.find(m=>m.id===request.id).data.status,'received');
  assert.deepEqual(received.assets,released.assets);assert.ok(released.history.every(o=>received.history.some(n=>n.id===o.id)));
});

test('orphaned active handovers and stale reservation rows fail closed without being deleted; damaged stock cannot be requested',async t=>{
  const f=await setup(t);await f.db.exec(migration);
  const request=await action(f,f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena'});
  await action(f,f.actors.admin,'approveRequest',{id:request.id});const transfer=await action(f,f.actors.admin,'releaseRequest',{id:request.id});
  // Deliberate isolated inconsistency, never production repair.
  await f.db.query('delete from mcpa_movement_reservations where movement_id=$1',[transfer.id]);
  assert.equal((await f.rpc(f.actors.pau,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-001').movementLock,'transfer');
  await assert.rejects(action(f,f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena'}),/reserved, pending receipt/);
  await f.db.query("update mcpa_movements set data=data||'{\"status\":\"received\"}' where id in ($1,$2)",[request.id,transfer.id]);
  await f.db.query('insert into mcpa_movement_reservations(equipment_id,movement_id) values($1,$2)',[f.tools['TOOL-001'],transfer.id]);
  const before=await records(f);assert.equal((await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-001').movementLock,'transfer');assert.deepEqual(await records(f),before);
  await f.db.query("insert into equipment(id,asset_id,name,condition) values($1,'DAMAGED','Damaged stock','Damaged')",[randomUUID()]);
  await assert.rejects(action(f,f.actors.sky,'createRequest',{toolIds:['DAMAGED'],destination:'Casa Buena'}),/unavailable condition/);
});

test('read-only preflight preserves records; unreviewed snapshot drift aborts migration without replacing authorization',async t=>{
  const f=await setup(t),before=await records(f);
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/inventory-movement-preflight.sql'),'utf8'));
  assert.deepEqual(await records(f),before);
  const definition=(await f.db.query("select pg_get_functiondef('public.mcpa_movement_snapshot()'::regprocedure) as value")).rows[0].value;
  await f.db.exec(definition.replace('begin','begin /* unreviewed fixture change */'));
  await assert.rejects(f.db.exec(migration),/scoped snapshot reader differs/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') as value")).rows[0].value,null);
  assert.deepEqual(await records(f),before);
});

test('authorized cancellation resolves an unreceived release through immutable audit; request retries replay safely while reserved',async t=>{
  const f=await setup(t);await f.db.exec(migration);
  const payload={toolIds:['TOOL-001'],destination:'Casa Buena'},op=randomUUID();
  const request=await action(f,f.actors.sky,'createRequest',payload,op);
  await action(f,f.actors.admin,'approveRequest',{id:request.id});
  const transfer=await action(f,f.actors.admin,'releaseRequest',{id:request.id});
  const before=await records(f);
  assert.deepEqual(await action(f,f.actors.sky,'createRequest',payload,op),request,'Retry precedes current-stock validation');
  assert.deepEqual(await records(f),before);
  await assert.rejects(action(f,f.actors.admin,'cancelTransfer',{id:transfer.id,reason:'Unauthorized interruption',confirmed:true}));
  await action(f,f.actors.sky,'cancelTransfer',{id:transfer.id,reason:'Local authorized business decision',confirmed:true});
  const after=await records(f);
  assert.deepEqual(after.equipment,before.equipment);assert.deepEqual(after.assets,before.assets);
  assert.ok(before.history.every(o=>after.history.some(n=>n.id===o.id)));
  assert.equal(after.movements.find(m=>m.id===transfer.id).data.status,'canceled');
  assert.equal((await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-001').movementLock,null);
  assert.equal((await f.db.query('select count(*) as n from mcpa_movement_cancellations')).rows[0].n,2,'Both linked records retain cancellation audit');
  assert.equal((await action(f,f.actors.sky,'createRequest',payload)).status,'pending');
});
