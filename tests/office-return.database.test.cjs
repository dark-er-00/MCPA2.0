// Real PostgreSQL/RLS in disposable local fixtures. Never calls live Supabase.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs'),{configure,withOfficeId}=require('./office-return-fixture.cjs');
const act=(f,a,p,id=randomUUID())=>f.rpc(a,'mcpa_movement_action',{p_action:'createReturn',p_payload:p,p_operation_id:id});
const inspect=(id,condition='good',notes='')=>({toolId:id,condition,notes});
const tables=['profiles','sites','equipment','mcpa_movements','mcpa_movement_assets','mcpa_movement_sites','mcpa_movement_operations'];
const snapshot=async f=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await f.db.query('select * from '+table+' order by 1,2')).rows])));
const sql=file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8');
for(const optionalFirst of [true,false])test('Office returns preserve optional purpose with '+(optionalFirst?'already-installed live patch':'chronological migrations'),async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  await f.db.exec(sql('202610100004_movement_cancellation.sql'));
  await f.db.exec(sql('202610100006_monitoring.sql'));
  await f.db.exec(sql('202610120001_request_turnover_notifications.sql'));
  const optional=sql('202610120003_optional_request_purpose.sql');
  const definition=async()=>(await f.db.query("select pg_get_functiondef('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) as value")).rows[0].value;
  if(optionalFirst)await f.db.exec(optional);
  const before=await definition();await configure(f);
  assert.equal(await definition(),before,'Office installation never replaces the private lifecycle');
  if(!optionalFirst)await f.db.exec(optional);
  const patched=await definition(),baseline=await snapshot(f);
  const preflight=(await f.db.query(fs.readFileSync(path.join(__dirname,'../supabase/office-return-preflight.sql'),'utf8'))).rows[0].office_return_preflight;
  assert.equal(preflight.reviewed_lifecycle_compatible,true);assert.equal(preflight.optional_purpose_installed,true);assert.equal(preflight.stable_recipient_preserved,true);
  const verification=(await f.db.query(fs.readFileSync(path.join(__dirname,'../supabase/merge-integration-verification.sql'),'utf8'))).rows[0].merge_integration_verification;
  for(const [key,value]of Object.entries(verification))assert.equal(value,!key.endsWith('_execute'),key);
  await f.db.exec(withOfficeId(f.sites.office));
  assert.equal(await definition(),patched,'Reapplying Office preserves optional purpose');assert.deepEqual(await snapshot(f),baseline);
  const request=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:''},p_operation_id:randomUUID()});
  assert.equal(request.purpose,'');assert.equal(request.receiverId,f.actors.sky.id);
  for(const [action,payload]of [['approveRequest',{id:request.id}],['releaseRequest',{id:request.id}]])await f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  assert.ok((await f.rpc(f.actors.sky,'mcpa_monitoring_snapshot')).notifications.some(n=>n.title==='Equipment Pending Turnover'));
  await assert.rejects(act(f,f.actors.sky,{toolIds:['TOOL-002'],destination:'Casa Buena',conditions:[inspect('TOOL-002')]}),e=>e.code==='22023');
  const returned=await act(f,f.actors.sky,{toolIds:['TOOL-002'],conditions:[inspect('TOOL-002')]});assert.equal(returned.destinationId,f.sites.office);
  // The compatibility allowance must not accept unrelated private-function drift.
  await f.db.exec(patched.replace('Select an application role.','Unexpected changed role validation.'));
  await assert.rejects(f.db.exec(withOfficeId(f.sites.office)),/return lifecycle differs/);await f.db.exec('rollback');
 }finally{await f.close();}
});
async function setup(cancellation=false){const f=await authDatabase({engineerPortal:true});if(cancellation)await f.db.exec(sql('202610100004_movement_cancellation.sql'));await f.db.exec(sql('202610100006_monitoring.sql'));await configure(f);return f;}

test('unconfigured Office refuses installation without creating a location or rewriting existing data',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  const before=await snapshot(f);
  await assert.rejects(f.db.exec(withOfficeId(null)),/verified existing Office UUID/);await f.db.exec('rollback');
  assert.deepEqual(await snapshot(f),before);
  assert.equal((await f.db.query("select to_regclass('mcpa_auth_private.return_office') as relation")).rows[0].relation,null);
  const preflight=(await f.db.query(fs.readFileSync(path.join(__dirname,'../supabase/office-return-preflight.sql'),'utf8'))).rows[0].office_return_preflight;
  assert.equal(preflight.movement_gateway_source_md5,'582ea68af753d0fdd81461c537dbf9ab');
  assert.equal(preflight.return_implementation_source_md5,'5b94b3b5642f26981a80382a2b1b6be7');
  assert.equal(preflight.office_return_installed,false);assert.equal(preflight.anonymous_movement_execute,false);
 }finally{await f.close();}
});

test('manual Office location configuration requires a real address and creates no duplicate or person assignment',async()=>{
 const f=await authDatabase({engineerPortal:true,missingProjectHistory:true});
 try{
  const configuration=fs.readFileSync(path.join(__dirname,'../supabase/office-location-configuration.sql'),'utf8')
    .replace(/verified_office_address constant text := [^\r\n]*; -- ACTUAL_OFFICE_ADDRESS/,'verified_office_address constant text := null; -- ACTUAL_OFFICE_ADDRESS'),before=await snapshot(f);
  await assert.rejects(f.db.exec(configuration),/actual company equipment-receiving Office address/);await f.db.exec('rollback');assert.deepEqual(await snapshot(f),before);
  const supplied=configuration.replace('null; -- ACTUAL_OFFICE_ADDRESS',"'Local receiving Office fixture'; -- ACTUAL_OFFICE_ADDRESS");
  await f.db.exec(supplied);
  const offices=(await f.db.query("select * from sites where name='Office'")).rows;assert.equal(offices.length,1);assert.equal(offices[0].assigned_engineer_id,null);assert.equal(offices[0].assigned_engineer,'Unassigned');
  const after=await snapshot(f);for(const table of tables)assert.deepEqual(table==='sites'?after[table].filter(r=>r.id!==offices[0].id):after[table],before[table]);
  await f.db.exec(supplied);assert.deepEqual(await snapshot(f),after,'Configuration retry never duplicates the Office');
 }finally{await f.close();}
});

for(const role of ['sky','architect'])test(role+' inspected returns send actual equipment to the pinned Office and preserve missing-item accountability',async()=>{
 const f=await setup(role==='architect'),a=f.actors[role];
 try{
  if(role==='architect')await f.db.query("update equipment set current_holder_id=$1 where asset_id in ('TOOL-002','TOOL-003','TOOL-004')",[a.id]);
  assert.notEqual(a.id,a.authId);
  const office=await f.rpc(a,'mcpa_return_destination');assert.equal(office.id,f.sites.office);assert.equal(office.name,'Main Office');assert.equal(office.label,'Office');
  const source=(await f.db.query("select * from equipment where asset_id in ('TOOL-002','TOOL-003','TOOL-004') order by asset_id")).rows;
  const returned=await act(f,a,{toolIds:['TOOL-002','TOOL-003','TOOL-004'],conditions:[inspect('TOOL-002'),inspect('TOOL-003','damaged','Guard damaged; delivered to Office'),inspect('TOOL-004','lost','Not physically returned')],notes:'Inspected at company receiving Office',actor:{id:f.actors.pau.id,role:'admin',name:'Forged actor'}});
  assert.equal(returned.destinationId,office.id);assert.equal(returned.destination,office.name);assert.equal(returned.returnedBy,a.name);
  assert.ok(returned.source.every(item=>item.holderId===a.id&&item.siteId===f.sites.casa));
  const tools=(await f.db.query("select * from equipment where asset_id in ('TOOL-002','TOOL-003','TOOL-004') order by asset_id")).rows;
  assert.equal(tools[0].site_id,office.id);assert.equal(tools[0].current_holder_id,null);assert.equal(tools[0].status,'AVAILABLE');
  assert.equal(tools[1].site_id,office.id);assert.equal(tools[1].current_holder_id,null);assert.equal(tools[1].status,'REPAIR');
  assert.equal(tools[2].site_id,source[2].site_id);assert.equal(tools[2].current_holder_id,a.id);assert.equal(tools[2].status,'MISSING');
  const personal=await f.rpc(a,'mcpa_personal_equipment_snapshot');assert.ok(!personal.tools.some(t=>['TOOL-002','TOOL-003'].includes(t.id)));assert.ok(personal.tools.some(t=>t.id==='TOOL-004'&&t.status==='missing'));
  const admin=await f.rpc(f.actors.admin,'mcpa_movement_snapshot');assert.ok(admin.returns.some(r=>r.id===returned.id&&r.destination==='Main Office'));assert.ok(admin.repairs.some(r=>r.sourceId===returned.id));assert.ok(admin.missing.some(r=>r.sourceId===returned.id));assert.ok(admin.activity.some(r=>r.action==='createReturn'&&r.entityId===returned.id));
  const history=(await f.db.query('select site_id from mcpa_movement_sites where movement_id=$1',[returned.id])).rows.map(r=>r.site_id);assert.ok(history.includes(f.sites.casa)&&history.includes(office.id));
 }finally{await f.close();}
});

test('project, forged ID, invalid inspections and wrong-custody returns are rejected atomically; private APIs remain denied',async()=>{
 const f=await setup(),a=f.actors;
 try{
  const good={toolIds:['TOOL-002'],conditions:[inspect('TOOL-002')]},before=await snapshot(f);
  for(const extra of [{destination:'Casa Buena'},{destination:'MCPA Development Transfer Test A'},{destination:'Office'},{destination:[]},{destination:{}},{destinationId:f.sites.casa},{destinationId:'not-a-uuid'}])await assert.rejects(act(f,a.sky,{...good,...extra}),e=>e.code==='22023');
  await assert.rejects(act(f,a.sky,{toolIds:['TOOL-002','TOOL-003'],conditions:[inspect('TOOL-002')]}),e=>e.code==='22023');
  await assert.rejects(act(f,a.sky,{...good,conditions:[inspect('TOOL-002','damaged')]}),e=>e.code==='22023');
  await assert.rejects(act(f,a.sky,{toolIds:['TOOL-002','TOOL-003'],conditions:[inspect('TOOL-002'),inspect('TOOL-003','invalid')]}),e=>e.code==='22023');
  await assert.rejects(act(f,a.pau,good),e=>e.code==='42501');
  for(const actor of [null,a.admin,a.handler,a.secretary,a.inactive]){
   await assert.rejects(act(f,actor,good));await assert.rejects(f.rpc(actor,'mcpa_return_destination'));
  }
  assert.deepEqual(await snapshot(f),before,'Failed actions preserve records/custody/history');
  for(const actor of [a.sky,a.admin]){
   await assert.rejects(f.query(actor,'select * from mcpa_auth_private.return_office'),e=>e.code==='42501');
   await assert.rejects(f.query(actor,'select mcpa_auth_private.office_return_site()'),e=>e.code==='42501');
   await assert.rejects(f.query(actor,"select mcpa_auth_private.movement_before_office_returns('createReturn',$1,$2)",[good,randomUUID()]),e=>e.code==='42501');
  }
  await f.db.query('update sites set is_active=false where id=$1',[f.sites.office]);
  const inactive=await snapshot(f);await assert.rejects(act(f,a.sky,good),/Office return destination is unavailable/);assert.deepEqual(await snapshot(f),inactive);
 }finally{await f.close();}
});

test('migration preserves historical returns/retries; new retries survive Office rename without duplicate actions',async()=>{
 const f=await authDatabase({engineerPortal:true}),a=f.actors;
 try{
  const oldPayload={toolIds:['TOOL-002'],destination:'Main Warehouse',conditions:[inspect('TOOL-002')]},oldOperation=randomUUID();
  const old=await act(f,a.sky,oldPayload,oldOperation);
  const officeId=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer) values($1,'Office','Local receiving fixture','Office test receiver')",[officeId]);
  const bound=withOfficeId(officeId),before=await snapshot(f);
  await f.db.exec(bound);assert.deepEqual(await snapshot(f),before,'Migration changes definitions/configuration only');
  assert.deepEqual(await act(f,a.sky,oldPayload,oldOperation),old);assert.deepEqual(await snapshot(f),before,'Legacy retry neither rewrites result nor touches current custody');
  const payload={toolIds:['TOOL-003'],conditions:[inspect('TOOL-003')]},operation=randomUUID(),returned=await act(f,a.sky,payload,operation);
  const saved=await snapshot(f);assert.deepEqual(await act(f,a.sky,payload,operation),returned);assert.deepEqual(await snapshot(f),saved);
  await f.db.query("update sites set name='Official Company Receiving Office' where id=$1",[officeId]);
  assert.equal((await f.rpc(a.sky,'mcpa_return_destination')).id,officeId);
  assert.deepEqual(await act(f,a.sky,payload,operation),returned);
  const renamed=await snapshot(f);await assert.rejects(act(f,a.sky,{...payload,destination:'Casa Buena'},operation),e=>e.code==='40001');assert.deepEqual(await snapshot(f),renamed);
  await f.db.exec(bound);assert.deepEqual(await snapshot(f),renamed,'Installation rerun cannot backfill or rebind');
  const next=await act(f,a.sky,{toolIds:['TOOL-004'],conditions:[inspect('TOOL-004')]});assert.equal(next.destination,'Official Company Receiving Office');assert.equal(next.destinationId,officeId);
 }finally{await f.close();}
});

test('returns remain transactional and existing receiving QR/project transfers still use their authorized destinations',async()=>{
 const f=await setup(true),a=f.actors;
 try{
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.pau.id,f.sites.main]);
  const qr=await f.rpc(a.pau,'mcpa_create_receiving_qr',{p_site_id:f.sites.main});
  const context=await f.rpc(a.sky,'mcpa_resolve_receiving_qr',{p_token:qr.token});assert.equal(context.site_id,f.sites.main);
  const transfer=await f.rpc(a.sky,'mcpa_movement_action',{p_action:'createTransfer',p_payload:{toolIds:['TOOL-002'],receiverId:a.pau.id,destination:'Main Warehouse',receivingToken:qr.token},p_operation_id:randomUUID()});
  assert.equal(transfer.destinationId,f.sites.main);assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0].current_holder_id,a.sky.id);
  await f.rpc(a.pau,'mcpa_movement_action',{p_action:'receiveTransfer',p_payload:{id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]},p_operation_id:randomUUID()});
  assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0].current_holder_id,a.pau.id);
  const before=await snapshot(f),notices=(await f.db.query('select * from mcpa_notifications order by id')).rows;
  await f.db.exec('begin');await act(f,a.pau,{toolIds:['TOOL-002'],conditions:[inspect('TOOL-002','damaged','Delivered to Office for repair')]});await f.db.exec('rollback');
  assert.deepEqual(await snapshot(f),before);assert.deepEqual((await f.db.query('select * from mcpa_notifications order by id')).rows,notices);
 }finally{await f.close();}
});
