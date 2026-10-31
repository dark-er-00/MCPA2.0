const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture,randomUUID:id,root}=require('./fixture.cjs');
const correction=fs.readFileSync(path.join(root,'supabase/migrations/202610250004_read_rpc_authorization.sql'),'utf8');

test('seven complete readers work in READ ONLY, retain role boundaries and preserve mutation SQL/RLS/ACLs',{timeout:60000},async t=>{
  const f=await fixture(t,{applyReadFix:false}),a=f.actors;
  const receipt="select public.mcpa_import_equipment_v2_receipt('00000000-0000-4000-8000-000000000001') value";
  async function read(actor,sql){
    await f.db.exec('begin read only;set local role '+(actor?'authenticated':'anon'));
    try{
      await f.db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor?.authId||'']);
      return (await f.db.query(sql)).rows[0].value;
    }finally{await f.db.exec('rollback');}
  }
  await assert.rejects(read(a.admin,receipt),e=>e.code==='25006');
  const functions=async()=> (await f.db.query("select p.oid,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mcpa_auth_private') and p.prokind='f' order by p.oid")).rows;
  const boundaries=async()=>({
    policies:(await f.db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,
    tables:(await f.db.query("select oid,relrowsecurity,relforcerowsecurity,relacl::text from pg_class where relnamespace in ('public'::regnamespace,'mcpa_auth_private'::regnamespace) order by oid")).rows
  });
  const before=await functions(),security=await boundaries();
  // A late precondition failure rolls back the helper and earlier reader replacements.
  await f.db.exec('alter function public.mcpa_import_equipment_v2_receipt(uuid) volatile');
  await assert.rejects(f.db.exec(correction),/Expected STABLE SECURITY DEFINER/);
  await f.db.exec('rollback');
  assert.equal((await f.db.query("select to_regprocedure('mcpa_auth_private.wa_read_actor(text[])') value")).rows[0].value,null);
  await f.db.exec('alter function public.mcpa_import_equipment_v2_receipt(uuid) stable');
  assert.deepEqual(await functions(),before);
  await f.db.exec(correction);
  const names=['mcpa_wa_equipment_catalog','mcpa_wa_equipment_requests','mcpa_wa_suggest_equipment','mcpa_wa_consumables_catalog','mcpa_wa_consumables_snapshot','mcpa_wa_consumables_analytics','mcpa_import_equipment_v2_receipt'];
  const after=await functions();
  assert.equal(after.length,before.length+1);
  for(const old of before){
    const next=after.find(v=>v.oid===old.oid);assert.ok(next);
    assert.deepEqual({...next,definition:old.definition},old,'owner/settings/ACL preserved: '+old.proname);
    assert.equal(next.definition,names.includes(old.proname)?old.definition.replace('mcpa_auth_private.wa_actor(','mcpa_auth_private.wa_read_actor('):old.definition,'only seven authorization calls change: '+old.proname);
  }
  assert.deepEqual(await boundaries(),security);
  for(const role of ['anon','authenticated','service_role']){
    assert.equal((await f.db.query("select has_function_privilege($1,'mcpa_auth_private.wa_read_actor(text[])','EXECUTE') value",[role])).rows[0].value,false);
  }
  // Real mutation RPCs still lock and produce a pending request for the suggestion reader.
  const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Read RPC regression drill',category:'Power Tools',tracking_type:'Individual',quantity:2,condition:'Good'}]});
  const catalog=await read(a.sky,'select public.mcpa_wa_equipment_catalog() value');
  const group=catalog.groups.find(g=>g.type_name==='Read RPC regression drill');
  const request=await f.call(a.sky,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:2,p_purpose:'Read-only suggestion regression'});
  const readers=[
    ['mcpa_wa_equipment_catalog','select public.mcpa_wa_equipment_catalog() value',true],
    ['mcpa_wa_equipment_requests','select public.mcpa_wa_equipment_requests() value',true],
    ['mcpa_wa_suggest_equipment',"select public.mcpa_wa_suggest_equipment('"+request.id+"') value",false],
    ['mcpa_wa_consumables_catalog','select public.mcpa_wa_consumables_catalog() value',true],
    ['mcpa_wa_consumables_snapshot','select public.mcpa_wa_consumables_snapshot() value',true],
    ['mcpa_wa_consumables_analytics',"select public.mcpa_wa_consumables_analytics('2026-10-01','2026-11-01') value",false],
    ['mcpa_import_equipment_v2_receipt',receipt,false]
  ];
  for(const [name,sql,borrower] of readers){
    await read(a.admin,sql);
    for(const actor of [a.sky,a.architect]){
      if(borrower)await read(actor,sql);else await assert.rejects(read(actor,sql),e=>e.code==='42501',name);
    }
    for(const actor of [a.secretary,a.handler,a.inactive,null])await assert.rejects(read(actor,sql),e=>e.code==='42501',name);
  }
  assert.equal(await read(a.admin,receipt),null);
  const suggestion=await read(a.admin,readers[2][1]);
  assert.equal(suggestion.eligible_assets.length,2);
  assert.equal(new Set(imported.assets.map(v=>v.asset_id)).size,2);
  // Inactivate the actual Admin in this disposable local fixture only.
  await f.db.query("update profiles set account_status='inactive' where id=$1",[a.admin.id]);
  for(const [,sql] of readers)await assert.rejects(read(a.admin,sql),e=>e.code==='42501');
});
