const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,id}=require('./database-fixture.cjs');
async function setup(t){const f=await fixture();t.after(()=>f.close());return f;}
const catalog=f=>f.wa(f.actors.sky,'mcpa_wa_equipment_catalog');
const submit=(f,type,qty=2,extra={})=>f.wa(f.actors.sky,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:type,p_site_id:f.sites.casa,p_quantity:qty,p_purpose:'',...extra});
const allocate=(f,r,assets,op=id())=>f.wa(f.actors.admin,'mcpa_wa_allocate_equipment',{p_operation_id:op,p_request_id:r.id,p_asset_ids:assets});

test('additive installation preserves existing inventory, procurement and lifecycle definitions; RLS drift aborts atomically',async t=>{
  const f=await fixture({workstream:false});t.after(()=>f.close());await f.seedEquipment({},2);await f.seedConsumable();
  const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../supabase/migrations/202610250001_quantity_material_requests.sql'),'utf8');
  const snapshot=async()=> (await f.db.query(`select jsonb_build_object(
    'equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),
    'stock',(select jsonb_agg(to_jsonb(c) order by id) from consumables c),
    'ledger',(select jsonb_agg(to_jsonb(m) order by id) from consumable_stock_movements m),
    'imports',(select jsonb_agg(to_jsonb(i) order by operation_id) from mcpa_equipment_imports i),
    'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),
    'sites',(select jsonb_agg(to_jsonb(s) order by id) from sites s),
    'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p
      where p.oid in ('public.mcpa_movement_action(text,jsonb,uuid)'::regprocedure,'mcpa_auth_private.inventory_lock(uuid)'::regprocedure,
      'public.mcpa_import_equipment(uuid,jsonb)'::regprocedure,'public.consumables_adjust_stock(uuid,uuid,integer,text,numeric,text)'::regprocedure))) as value`)).rows[0].value;
  const before=await snapshot();await f.db.exec('alter table consumables disable row level security');
  await assert.rejects(f.db.exec(migration),/retain enabled RLS/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regclass('public.mcpa_wa_operations') value")).rows[0].value,null);
  await f.db.exec('alter table consumables enable row level security');await f.db.exec(migration);assert.deepEqual(await snapshot(),before);
  const grants=(await f.db.query(`select n.nspname,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='mcpa_auth_private' and p.proname like 'wa_%')
    or (n.nspname='public' and (p.proname like 'mcpa_wa_%' or p.proname like 'mcpa_import_equipment_v2%'))`)).rows;
  assert.ok(grants.length>=20);assert.ok(grants.every(g=>!g.anon&&!g.service));
  assert.ok(grants.every(g=>g.authenticated===(g.nspname==='public')));
  const tables=(await f.db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('mcpa_wa_operations','mcpa_wa_equipment_requests','mcpa_wa_material_requests','mcpa_wa_material_items','mcpa_wa_material_issues','mcpa_wa_import_operations')")).rows;
  assert.equal(tables.length,6);assert.ok(tables.every(r=>r.relrowsecurity));
});

test('exact equipment groups count available, reserved and deployed separately; Bulk and variants stay separate',async t=>{
  const f=await setup(t);await f.seedEquipment({},4);await f.seedEquipment({model:'Narrow'},1);await f.seedEquipment({tracking_type:'Bulk',quantity:225,unit:'Pieces'},1);
  let c=await catalog(f),shovels=c.groups.filter(g=>g.name==='Shovel (Pala, Lapad)');
  assert.equal(shovels.length,3);const group=shovels.find(g=>g.tracking_type==='Individual'&&g.model==='');
  assert.equal(group.available_quantity,4);assert.equal(group.physical_records,4);assert.equal(group.requestable,true);
  const bulk=shovels.find(g=>g.tracking_type==='Bulk');assert.equal(bulk.available_quantity,225);assert.equal(bulk.requestable,false);
  const r=await submit(f,group.type_id),suggestion=await f.wa(f.actors.admin,'mcpa_wa_suggest_equipment',{p_request_id:r.id});
  assert.equal(suggestion.eligible_assets.length,4);assert.equal(suggestion.suggested_asset_ids.length,2);
  // Admin can adjust proposed selection, without choosing another variant.
  const selected=suggestion.eligible_assets.slice(-2).map(a=>a.id),op=id(),approved=await allocate(f,r,selected,op);
  assert.equal(approved.status,'approved');assert.equal(approved.approved_quantity,2);assert.equal(approved.assets.length,2);
  assert.deepEqual(new Set(approved.assets.map(a=>a.id)),new Set(selected));assert.equal(new Set(approved.assets.map(a=>a.asset_id)).size,2);
  assert.deepEqual(await allocate(f,r,selected,op),approved);
  const reservations=(await f.db.query('select * from mcpa_movement_reservations where movement_id=$1',[approved.movement_id])).rows;
  assert.deepEqual(new Set(reservations.map(a=>a.equipment_id)),new Set(selected));
  c=await catalog(f);const after=c.groups.find(g=>g.type_id===group.type_id);assert.equal(after.available_quantity,2);assert.equal(after.reserved_quantity,2);assert.equal(after.deployed_quantity,0);
  await assert.rejects(allocate(f,r,selected),/pending/);
  await assert.rejects(submit(f,bulk.type_id,1),/Individual/);
});

test('invalid counts, duplicate IDs, mismatched variants and stale availability roll back without partial movements',async t=>{
  const f=await setup(t);const physical=await f.seedEquipment({},3),variant=await f.seedEquipment({model:'Variant'},1);
  const type=(await catalog(f)).groups.find(g=>g.name==='Shovel (Pala, Lapad)'&&g.model==='').type_id;
  for(const qty of [0,-1,101,null,4])await assert.rejects(submit(f,type,qty));
  for(const extra of [{p_operation_id:null},{p_type_id:null},{p_type_id:'unknown compatibility group'},{p_site_id:null},{p_site_id:id()}])await assert.rejects(submit(f,type,1,extra));
  const r=await submit(f,type),before=(await f.db.query('select count(*) n from mcpa_movements')).rows[0].n;
  for(const assets of [[physical.assets[0].id],[physical.assets[0].id,physical.assets[0].id],[physical.assets[0].id,variant.assets[0].id],[physical.assets[0].id,id()]])await assert.rejects(allocate(f,r,assets));
  assert.equal((await f.db.query('select count(*) n from mcpa_movements')).rows[0].n,before);
  assert.equal((await f.db.query('select count(*) n from mcpa_movement_reservations')).rows[0].n,0);
  await f.db.query("update equipment set condition='Damaged' where id=$1",[physical.assets[0].id]);
  await assert.rejects(allocate(f,r,physical.assets.slice(0,2).map(a=>a.id)),/unavailable or incompatible/);
});

test('competing submissions and the legacy workflow share authoritative reservation protection',async t=>{
  const f=await setup(t);const items=await f.seedEquipment({},2),type=(await catalog(f)).groups.find(g=>g.name==='Shovel (Pala, Lapad)').type_id;
  const legacy=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:items.assets.map(a=>a.asset_id),destination:'Casa Buena'},p_operation_id:id()});
  const a=await submit(f,type),b=await submit(f,type),assets=items.assets.map(a=>a.id);
  // PGlite fixture serializes sessions. This probes retry/conflict behavior,
  // not real PostgreSQL parallel transaction scheduling (see contract).
  const results=await Promise.allSettled([allocate(f,a,assets),allocate(f,b,assets)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  await assert.rejects(f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:'approveRequest',p_payload:{id:legacy.id},p_operation_id:id()}),/reserved|unavailable/);
  assert.equal((await f.db.query('select count(*) n from mcpa_movement_reservations')).rows[0].n,2);
  const winner=results.find(r=>r.status==='fulfilled').value;
  const transfer=await f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:'releaseRequest',p_payload:{id:winner.movement_id},p_operation_id:id()});
  assert.equal(transfer.requestId,winner.movement_id);
  assert.equal((await f.wa(f.actors.sky,'mcpa_wa_equipment_requests')).find(r=>r.id===winner.id).status,'released');
  assert.equal((await catalog(f)).groups.find(g=>g.type_id===type).available_quantity,0);
});

test('Engineer/Architect scope, role checks, immutable receipts, rejection and payload binding are enforced by SQL',async t=>{
  const f=await setup(t);await f.seedEquipment({},3);const type=(await catalog(f)).groups.find(g=>g.name==='Shovel (Pala, Lapad)').type_id;
  const operation=id(),r=await submit(f,type,1,{p_operation_id:operation});
  assert.deepEqual(await submit(f,type,1,{p_operation_id:operation}),r);
  await assert.rejects(submit(f,type,2,{p_operation_id:operation}),/different/);
  for(const actor of [null,f.actors.inactive,f.actors.secretary,f.actors.handler])await assert.rejects(f.wa(actor,'mcpa_wa_equipment_catalog'));
  await assert.rejects(f.wa({authId:id()},'mcpa_wa_equipment_catalog'),/active authorized account/);
  await f.db.query('update profiles set role=null where id=$1',[f.actors.sky.id]);
  await assert.rejects(f.wa(f.actors.sky,'mcpa_wa_equipment_catalog'),/active authorized account/);
  assert.equal((await f.query(f.actors.sky,'select * from mcpa_wa_equipment_requests')).rows.length,0);
  await f.db.query("update profiles set role='engineer' where id=$1",[f.actors.sky.id]);
  await assert.rejects(f.wa(f.actors.admin,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:type,p_site_id:f.sites.casa,p_quantity:1,p_purpose:''}));
  await assert.rejects(submit(f,type,1,{p_site_id:f.sites.main}),/assigned/);
  await assert.rejects(f.wa(f.actors.sky,'mcpa_wa_suggest_equipment',{p_request_id:r.id}),/permitted/);
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.architect.id,f.sites.main]);
  const architect=await f.wa(f.actors.architect,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:type,p_site_id:f.sites.main,p_quantity:1,p_purpose:'Architect tools'});
  assert.equal(architect.requester_id,f.actors.architect.id);
  assert.equal((await f.wa(f.actors.architect,'mcpa_wa_equipment_requests')).length,1);
  assert.equal((await f.query(f.actors.pau,'select * from mcpa_wa_equipment_requests')).rows.length,0);
  await assert.rejects(f.query(f.actors.sky,'update mcpa_wa_equipment_requests set requested_quantity=100'),/permission denied/);
  await assert.rejects(f.query(f.actors.admin,'select mcpa_auth_private.wa_equipment_request($1)',[r.id]),/permission denied/);
  const rejected=await f.wa(f.actors.admin,'mcpa_wa_reject_equipment',{p_operation_id:id(),p_request_id:r.id,p_reason:'Another project takes priority'});
  assert.equal(rejected.status,'rejected');assert.match(rejected.rejection_reason,/priority/);
  await assert.rejects(f.db.exec('delete from mcpa_wa_operations'),/immutable/);
});
