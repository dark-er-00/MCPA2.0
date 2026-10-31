// Catalog diagnostics use disposable PostgreSQL fixtures, never live Supabase.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs'),{configure}=require('./office-return-fixture.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8');
async function diagnostics(f){
 await f.db.exec('begin read only');
 try{return {
  preflight:(await f.db.query(read('office-return-preflight.sql'))).rows[0].office_return_preflight,
  catalog:(await f.db.query(read('release-compatibility-diagnostics.sql'))).rows[0].release_compatibility_diagnostics
 };}finally{await f.db.exec('rollback');}
}
for(const cancellation of [false,true])test('read-only diagnostics classify Office over '+(cancellation?'cancellation':'portal')+' and preserve working movements',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  if(cancellation)await f.db.exec(read('migrations/202610100004_movement_cancellation.sql'));
  await f.db.exec(read('migrations/202610120003_optional_request_purpose.sql'));
  await configure(f);
  const {preflight:p,catalog:c}=await diagnostics(f);
  assert.equal(p.gateway_architecture,cancellation?'office_over_cancellation_over_portal':'office_over_portal_without_cancellation');
  assert.equal(p.cancellation_gateway_installed,cancellation);
  for(const entry of c.expected_functions){
   const optional=/movement_before_cancellation|can_adjust_movement|cancellation_audit_immutable|movement_snapshot_before_cancellation|can_view_tool_before_exceptions/.test(entry.signature);
   assert.equal(entry.reviewed_source,cancellation||!optional,entry.signature);
   if(entry.oid){
    assert.equal(entry.anon_execute,false,entry.signature);
    assert.equal(entry.authenticated_execute,entry.signature.startsWith('public.'),entry.signature);
    assert.ok(entry.proconfig.includes('search_path=""'),entry.signature);
   }
  }
  await f.db.exec('begin read only');
  const configuration=(await f.db.query(read('office-configuration-verification.sql'))).rows;
  await f.db.exec('rollback');
  assert.equal(configuration.length,1);assert.equal(configuration[0].site_id,f.sites.office);
  assert.equal(configuration[0].exactly_one_configuration,true);assert.equal(configuration[0].unique_destination_name,true);
  const request=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:''},p_operation_id:randomUUID()});
  assert.equal(request.receiverId,f.actors.sky.id);
  const visible=(await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).requests.find(r=>r.id===request.id);
  assert.equal(!!visible.allowedActions?.includes('withdrawRequest'),cancellation);
  if(cancellation){
   const withdrawn=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'withdrawRequest',p_payload:{id:request.id,reason:'Local regression',confirmed:true},p_operation_id:randomUUID()});
   assert.equal(withdrawn.status,'withdrawn');
  }
  const returned=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createReturn',p_payload:{toolIds:['TOOL-002'],conditions:[{toolId:'TOOL-002',condition:'good',notes:''}]},p_operation_id:randomUUID()});
  assert.equal(returned.destinationId,f.sites.office);
 }finally{await f.close();}
});
test('diagnostics distinguish absence, wrong signature and a broken Office delegate without calling movements',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  let d=await diagnostics(f);
  assert.equal(d.preflight.gateway_architecture,'portal_without_office_or_cancellation');
  assert.equal(d.preflight.cancellation_delegate_name_present,false);
  assert.equal(d.catalog.relations.find(r=>r.name==='mcpa_auth_private.return_office').exists,false);
  await configure(f);
  await f.db.exec("create function mcpa_auth_private.movement_before_cancellation(text,jsonb) returns jsonb language sql as 'select null::jsonb'");
  d=await diagnostics(f);
  assert.equal(d.preflight.cancellation_gateway_installed,false);
  assert.equal(d.preflight.cancellation_delegate_name_present,true);
  assert.ok(d.catalog.candidates.some(p=>p.name==='movement_before_cancellation'&&p.arguments==='text, jsonb'));
  await f.db.exec('drop function mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)');
  d=await diagnostics(f);
  assert.equal(d.preflight.office_return_installed,true,'RPC presence alone is insufficient');
  assert.equal(d.preflight.gateway_architecture,'office_with_missing_or_unreviewed_delegate');
 }finally{await f.close();}
});
test('diagnostics expose changed helpers, grants and invalid Office designation',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  await configure(f);
  await f.db.exec("create or replace function mcpa_auth_private.office_return_site() returns public.sites language sql security definer set search_path='' as 'select * from public.sites limit 1'; grant execute on function mcpa_auth_private.office_return_site() to authenticated");
  const d=await diagnostics(f),helper=d.catalog.expected_functions.find(x=>x.signature==='mcpa_auth_private.office_return_site()');
  assert.equal(helper.reviewed_source,false);assert.equal(helper.authenticated_execute,true);
  await f.db.query('update public.sites set is_active=false where id=$1',[f.sites.office]);
  assert.equal((await f.db.query(read('office-configuration-verification.sql'))).rows[0].is_active,false);
 }finally{await f.close();}
});
