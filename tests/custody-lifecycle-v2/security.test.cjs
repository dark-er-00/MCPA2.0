const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture,migration,randomUUID,root}=require('./fixture.cjs');
test('migration fails closed on unreviewed custody engine and preserves unsafe-state evidence',async t=>{
  const f=await fixture(t,{apply:false});
  const definition=(await f.db.query("select pg_get_functiondef('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) as value")).rows[0].value;
  await f.db.exec(definition.replace('begin','begin /* unreviewed drift */'));
  await assert.rejects(f.db.exec(migration),/unreviewed custody engine/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regclass('public.mcpa_b_return_items') as value")).rows[0].value,null);
  assert.equal((await f.tool('TOOL-002')).status,'IN_USE');
});
test('new function grants exclude anonymous and private execution, with immutable history',async t=>{
  const f=await fixture(t),a=f.actors;
  const rows=(await f.db.query("select n.nspname,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'mcpa_b_%') or (n.nspname='mcpa_auth_private' and p.proname like 'b_%')")).rows;
  assert.ok(rows.length>10);assert.ok(rows.every(r=>!r.anon));assert.ok(rows.filter(r=>r.nspname==='mcpa_auth_private').every(r=>!r.authenticated));
  const b=await f.submit();await f.inspect(b.id,[{assetId:'TOOL-002',outcome:'missing',physicallyReceived:false,notes:'Follow up'}]);
  for(const table of ['mcpa_b_events','mcpa_b_operations']){
    await assert.rejects(f.db.exec(`delete from public.${table}`),/immutable/);
    await assert.rejects(f.db.exec(`truncate public.${table} cascade`),/immutable/);
  }
  await assert.rejects(f.action(a.admin,'inspectReturn',{id:b.id,inspections:[{assetId:'TOOL-002',outcome:'good',physicallyReceived:null}]}));
  assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
});
test('cancelled transfer keeps original movement/audit records and permits later authorized work',async t=>{
  const f=await fixture(t),a=f.actors;
  const tr=await f.action(a.sky,'createTransfer',{assetIds:['TOOL-002'],destinationId:f.sites.main,receiverId:a.pau.id});
  await f.rpc(a.sky,'mcpa_movement_action',{p_action:'cancelTransfer',p_payload:{id:tr.id,reason:'Unit not dispatched',confirmed:true},p_operation_id:randomUUID()});
  const retained=(await f.db.query('select * from mcpa_movements where id=$1',[tr.id])).rows[0];
  assert.equal(retained.data.status,'canceled');assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
  assert.ok((await f.db.query('select 1 from mcpa_movement_assets where movement_id=$1',[tr.id])).rows.length);
  await f.submit(['TOOL-002']);
});
test('frontend and SQL source remain inside the reserved paths and share movement locking',()=>{
  assert.match(migration,/pg_advisory_xact_lock\(672341,2026\)/);
  assert.match(migration,/order by id for update/);
  assert.doesNotMatch(migration,/create or replace function public\.mcpa_movement_action/);
  assert.doesNotMatch(migration,/drop policy|disable row level security|alter function public\.mcpa_movement_action/i);
  for(const file of ['api.mjs','composer.mjs','ui.mjs']){
    const source=fs.readFileSync(path.join(root,'js/upgrades/custody-lifecycle',file),'utf8');
    assert.doesNotMatch(source,/service_role|sb_secret_|supabase\.co|localStorage/);
  }
});
