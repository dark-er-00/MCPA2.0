// Isolated PostgreSQL only; no remote credentials, accounts or business records.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs'),{upgrade,areas,labels,migration,read}=require('./project-construction-fixture.cjs');
async function fixture(){const f=await authDatabase({engineerPortal:true});await upgrade(f);return f;}
const save=(f,patch={},version=1,id=f.sites.casa,operation=randomUUID(),actor=f.actors.admin,reason=null)=>f.rpc(actor,'mcpa_save_project',{p_id:id,p_version:version,p_operation_id:operation,p_patch:patch,p_reason:reason});
const updates=(f,args={},actor=f.actors.admin)=>f.rpc(actor,'mcpa_add_site_update',{p_project_id:f.sites.casa,p_operation_id:randomUUID(),p_type:'Milestone',p_description:'Inspected and complete',...args});
const history=async f=>(await f.db.query('select * from project_history where project_id=$1 order by changed_at desc,id desc',[f.sites.casa])).rows;

for(const isActive of [true,false])test(`Project creation rejects is_active=${isActive} without persisting data or consuming the retry key`,async()=>{
 const f=await fixture();try{
  const operation=randomUUID(),patch={name:`Creation state fixture ${isActive}`,location:'Isolated',assigned_engineer_id:f.actors.sky.id};
  const tables=['sites','project_history','mcpa_auth_private.project_operations'],before={};
  for(const table of tables)before[table]=(await f.db.query(`select * from ${table} order by 1`)).rows;
  for(let attempt=0;attempt<2;attempt++){
   await assert.rejects(save(f,{...patch,is_active:isActive},null,null,operation),error=>{
    assert.equal(error.code,'23514');
    assert.equal(error.message,'is_active cannot be set during project creation. Use archive/restore after creation.');
    return true;
   });
   for(const table of tables)assert.deepEqual((await f.db.query(`select * from ${table} order by 1`)).rows,before[table],`${table} unchanged after rejected creation`);
  }
  // Removing the rejected field can reuse the key for an ordinary creation.
  const created=await save(f,patch,null,null,operation);
  assert.equal(created.is_active,true);assert.equal(created.archived_at,null);
  assert.deepEqual(await save(f,patch,null,null,operation),created);
  assert.equal((await f.db.query('select count(*)::int as n from sites where id=$1',[created.id])).rows[0].n,1);
  const events=(await f.db.query('select * from project_history where project_id=$1',[created.id])).rows;
  assert.equal(events.length,1);assert.deepEqual(events[0].change_types,['created']);
  const operations=(await f.db.query('select * from mcpa_auth_private.project_operations where operation_id=$1',[operation])).rows;
  assert.equal(operations.length,1);assert.equal(operations[0].result.id,created.id);
 }finally{await f.close();}
});

test('Additive migration preserves legacy rows, history, policies, assignments and equipment; rerun fails safely',async()=>{
 const f=await authDatabase({engineerPortal:true});try{
  await f.db.query("update sites set phase='Legacy unusual phase',progress=73,status='active' where id=$1",[f.sites.casa]);
  const tables=['sites','project_history','equipment','profiles','mcpa_movements'];const before={};
  for(const t of tables)before[t]=(await f.db.query(`select * from ${t} order by id`)).rows;
  const policies=(await f.db.query("select * from pg_policies where tablename in ('sites','project_history') order by policyname")).rows;
  const snapshot=(await f.db.query("select pg_get_functiondef('mcpa_project_snapshot()'::regprocedure) as value")).rows;
  await upgrade(f);
  for(const t of tables){const rows=(await f.db.query(`select * from ${t} order by id`)).rows;assert.deepEqual(rows.map(row=>Object.fromEntries(Object.keys(before[t][0]||{}).map(key=>[key,row[key]]))),before[t],t);}
  assert.deepEqual((await f.db.query("select * from pg_policies where tablename in ('sites','project_history') order by policyname")).rows,policies);
  assert.deepEqual((await f.db.query("select pg_get_functiondef('mcpa_project_snapshot()'::regprocedure) as value")).rows,snapshot);
  const s=(await f.db.query('select * from sites where id=$1',[f.sites.casa])).rows[0];assert.equal(s.project_version,1);assert.equal(s.progress,73);assert.equal(s.phase,'Legacy unusual phase');assert.equal(s.construction_completion,null);
  await assert.rejects(f.db.exec(migration),/already installed/);await f.db.exec('rollback');
 }finally{await f.close();}
});

test('Weighted formula, two-decimal rounding, N/A redistribution and per-project weights',async()=>{
 const f=await fixture();try{
  const one=await save(f,{construction_work_areas:areas()});assert.equal(Number(one.construction_completion),45);assert.equal(one.progress,0);assert.equal(one.project_stage,null);
  const other=areas([33.33,25.25,99.99,3.33,5.55,77.77],[33.33,16.67,10,10,10,20]);
  const result=await save(f,{construction_work_areas:other},one.project_version);
  assert.equal(Number(result.construction_completion),41.76);
  const na=areas([100,0,0,0,0,0],[50,0,20,10,0,20]);na.Mechanical.applicable=false;na['Fire Safety'].applicable=false;
  assert.equal(Number((await save(f,{construction_work_areas:na},result.project_version)).construction_completion),50);
  const second=await save(f,{construction_work_areas:areas([0,100,0,0,0,0],[0,100,0,0,0,0])},1,f.sites.main);
  assert.equal(Number(second.construction_completion),100);assert.equal(second.project_stage,null);
  const rounding=await save(f,{construction_work_areas:areas([0.01,0,0,0,0,0],[50,50,0,0,0,0])},second.project_version,f.sites.main);
  assert.equal(Number(rounding.construction_completion),0.01,'Half-cent rounds up consistently');
 }finally{await f.close();}
});

test('Invalid progress, names, stages and untrusted fields rejected atomically',async()=>{
 const f=await fixture();try{
  const before=await history(f);
  const bad=[];
  for(const [field,value]of [['completion',-1],['completion',101],['completion',0.001],['completion','20'],['completion',null],['weight',-1],['weight',101],['weight',10.111],['applicable',null],['note',null]]){const a=areas();a.Structural[field]=value;bad.push(a);}
  bad.push({...areas(),Unknown:{completion:0,weight:0,applicable:false,note:''}}, {}, [], null);
  const missing=areas();delete missing.Plumbing;bad.push(missing);
  const wrongTotal=areas();wrongTotal.Structural.weight=29.99;bad.push(wrongTotal);
  const wrongNA=areas();wrongNA.Structural.applicable=false;bad.push(wrongNA);
  for(const a of bad)await assert.rejects(save(f,{construction_work_areas:a}),e=>e.code==='23514');
  for(const patch of [{project_stage:'Active'},{current_work_area:'Concrete'},{progress:99},{construction_completion:100},{phase:'Replace legacy'},{updated_at:'2026-01-01'},{status:'Archived'},{is_active:null}])await assert.rejects(save(f,patch),e=>e.code==='23514');
  assert.deepEqual(await history(f),before);
  const configured=await save(f,{construction_work_areas:areas()});
  await assert.rejects(save(f,{construction_work_areas:null},configured.project_version),e=>e.code==='23514');
  await f.query(f.actors.admin,'update sites set construction_completion=99,project_version=1000 where id=$1',[f.sites.casa]);
  const row=(await f.db.query('select * from sites where id=$1',[f.sites.casa])).rows[0];assert.equal(Number(row.construction_completion),45);assert.equal(Number(row.project_version),3);
 }finally{await f.close();}
});

test('Project creation, all meaningful changes, actors, notes, archive/restore and ordered immutable history',async()=>{
 const f=await fixture();try{
  const existing=await history(f);
  const a=await save(f,{name:'New name',location:'New location',assigned_engineer_id:f.actors.architect.id,project_stage:'Construction Phase',current_work_area:labels[5],status:'active',last_inventory_check:'2026-01-01',construction_work_areas:areas()},1,f.sites.casa,randomUUID(),f.actors.admin,'Reviewed on site.');
  const event=(await history(f))[0];assert.equal(event.actor_id,f.actors.admin.id);assert.notEqual(event.actor_id,f.actors.admin.authId);assert.equal(event.actor_name,f.actors.admin.name);assert.equal(event.reason,'Reviewed on site.');assert.ok(event.changed_at);
  assert.equal(event.before_values.name,'Casa Buena');assert.equal(event.after_values.name,'New name');assert.equal(event.before_values.assigned_engineer_id,f.actors.sky.id);assert.equal(event.after_values.assigned_engineer_id,f.actors.architect.id);assert.equal(event.after_values.construction_work_areas.Structural.completion,100);
  for(const kind of ['name','location','engineer','project_stage','current_work_area','status','last_inventory_check','construction_progress','weights'])assert.ok(event.change_types.includes(kind),kind);
  const archived=await save(f,{is_active:false},a.project_version);assert.equal(archived.is_active,false);assert.ok(archived.archived_at);
  const restored=await save(f,{is_active:true},archived.project_version);assert.equal(restored.archived_at,null);
  assert.deepEqual((await history(f)).slice(0,2).map(h=>h.change_types),[['restored'],['archived']]);
  const after=await history(f);assert.equal(after.length,existing.length+3);assert.deepEqual(after.find(h=>h.id===event.id),event);
  assert.equal((await f.rpc(f.actors.sky,'mcpa_project_snapshot')).sites.length,0);assert.equal((await f.rpc(f.actors.architect,'mcpa_project_snapshot')).sites[0].id,f.sites.casa);
  const created=await save(f,{name:'Created fixture',location:'Isolated',assigned_engineer_id:f.actors.sky.id,project_stage:'Permitting'},null,null);
  const h=(await f.db.query('select * from project_history where project_id=$1',[created.id])).rows;assert.equal(h.length,1);assert.deepEqual(h[0].change_types,['created']);assert.equal(h[0].before_values,null);assert.equal(h[0].actor_name,f.actors.admin.name);
  assert.equal((await f.rpc(f.actors.sky,'mcpa_project_snapshot')).history.length,1);
 }finally{await f.close();}
});

test('Retries deduplicate creates, updates, site notes and corrections; stale competing edits cannot overwrite',async()=>{
 const f=await fixture();try{
  const op=randomUUID(),patch={project_stage:'Groundbreaking'};
  const a=await save(f,patch,1,f.sites.casa,op);const count=(await history(f)).length;
  assert.deepEqual(await save(f,patch,1,f.sites.casa,op),a);assert.equal((await history(f)).length,count);
  await assert.rejects(save(f,{project_stage:'Turnover'},1,f.sites.casa,op),e=>e.code==='23514');
  const concurrent=await Promise.allSettled([save(f,{construction_work_areas:areas()},a.project_version),save(f,{name:'Stale overwrite'},a.project_version)]);
  assert.deepEqual(concurrent.map(x=>x.status),['fulfilled','rejected']);assert.equal(concurrent[1].reason.code,'40001');
  const createOp=randomUUID(),createPatch={name:'Retry fixture',location:'Isolated',assigned_engineer_id:f.actors.sky.id};
  const created=await save(f,createPatch,null,null,createOp);assert.equal((await save(f,createPatch,null,null,createOp)).id,created.id);
  const siteOp=randomUUID(),note=await updates(f,{p_operation_id:siteOp});assert.deepEqual(await updates(f,{p_operation_id:siteOp}),note);
  const correction=await updates(f,{p_type:'Correction',p_description:'Corrected inspection note',p_correction_of:note.id});assert.equal(correction.correction_of,note.id);
  await assert.rejects(updates(f,{p_correction_of:created.id}),e=>e.code==='23514');
  assert.ok((await history(f)).some(h=>h.id===note.id));
 }finally{await f.close();}
});

test('Role boundaries, RLS, direct audit writes and privileged mutations/truncation denied',async()=>{
 const f=await fixture();try{
  const note=await updates(f,{p_work_area:'Structural'});assert.equal(note.actor_id,f.actors.admin.id);assert.deepEqual(note.change_types,['site_update']);
  for(const actor of [null,f.actors.sky,f.actors.pau,f.actors.architect,f.actors.handler,f.actors.secretary,f.actors.inactive]){
   await assert.rejects(save(f,{},1,f.sites.casa,randomUUID(),actor),e=>e.code==='42501');await assert.rejects(updates(f,{},actor),e=>e.code==='42501');
  }
  for(const actor of [null,f.actors.admin,f.actors.sky,f.actors.handler])for(const sql of ["insert into project_history(project_id,change_types,after_values) values('"+f.sites.casa+"','{forged}','{}')","update project_history set actor_name='Forgery'",'delete from project_history','truncate project_history','select * from mcpa_auth_private.project_operations'])await assert.rejects(f.query(actor,sql),e=>e.code==='42501');
  for(const sql of ["update project_history set actor_name='Forgery'",'delete from project_history','truncate project_history'])await assert.rejects(f.db.exec(sql),e=>e.code==='42501');
  assert.equal((await f.query(f.actors.pau,'select * from project_history')).rows.length,0);assert.ok((await f.query(f.actors.handler,'select * from project_history')).rows.length>0);
  await assert.rejects(updates(f,{p_type:'Invented'}),e=>e.code==='23514');await assert.rejects(updates(f,{p_description:'  '}),e=>e.code==='23514');await assert.rejects(updates(f,{p_work_area:'Invented'}),e=>e.code==='23514');
 }finally{await f.close();}
});

test('Read-only deployment scripts compare unchanged legacy fingerprints and verify effective security',async()=>{
 const f=await authDatabase({engineerPortal:true});try{
  const before=await f.db.exec(read('supabase/project-construction-preflight.sql'));
  const fingerprints=before.find(r=>r.rows?.[0]?.legacy_fingerprint).rows;
  await upgrade(f);
  const after=await f.db.exec(read('supabase/project-construction-verify.sql'));
  assert.deepEqual(after.find(r=>r.rows?.[0]?.legacy_fingerprint).rows,fingerprints);
  const access=after.find(r=>r.rows?.[0]?.role).rows;
  for(const row of access){assert.equal(row.forbidden_history_write,false);assert.equal(row.forbidden_operations_access,false);assert.equal(row.forbidden_trigger_execute,false);assert.equal(row.save_rpc,row.role==='authenticated');assert.equal(row.site_update_rpc,row.role==='authenticated');}
  assert.equal(after.find(r=>r.rows?.[0]?.calculation_mismatches!==undefined).rows[0].calculation_mismatches,0);
 }finally{await f.close();}
});

test('Every stage/work area persists independently; legacy writers remain audited; no-op saves produce no duplicate audit',async()=>{
 const f=await fixture();try{
  let s=(await f.db.query('select * from sites where id=$1',[f.sites.casa])).rows[0];
  for(const stage of ['Planning/Designing','Permitting','Groundbreaking','Construction Phase','Turnover']){s=await save(f,{project_stage:stage},s.project_version);assert.equal(s.project_stage,stage);assert.equal(s.status,'planning');}
  for(const area of labels){s=await save(f,{current_work_area:area},s.project_version);assert.equal(s.current_work_area,area);}
  let h=await history(f);const count=h.length;
  s=await save(f,{current_work_area:labels[5]},s.project_version);assert.equal((await history(f)).length,count);
  await f.query(f.actors.admin,"update sites set phase='Legacy client update',progress=59 where id=$1 and updated_at=$2",[f.sites.casa,s.updated_at]);
  h=await history(f);assert.equal(h.length,count+1);assert.equal(h[0].before_values.progress,0);assert.equal(h[0].after_values.progress,59);assert.ok(h[0].change_types.includes('phase'));assert.ok(h[0].change_types.includes('progress'));
  await assert.rejects(save(f,{name:'Stale new client'},s.project_version),e=>e.code==='40001');
  await f.db.exec('begin');await save(f,{project_stage:'Permitting'},s.project_version+1);await f.db.exec('rollback');assert.equal((await history(f)).length,count+1,'Project/audit/operation roll back together');
 }finally{await f.close();}
});

test('Projects coexists with deployed consumable SKU/archive and receipt/purchase upgrades without touching stock, policy or custody',async()=>{
 const {fixture:catalogFixture,rpc:catalogRpc}=require('./consumables-upgrade-fixture.cjs');
 const f=await catalogFixture({ledger:true});try{
  await f.db.exec(read('supabase/migrations/202610100001_engineer_portal.sql'));
  const item=await catalogRpc(f,f.actors.admin,'consumables_save_item',{p_id:randomUUID(),p_version:null,p_name:'Project regression disc',p_unit:'pcs',p_minimum:5,p_opening:20,p_category:'Cutting',p_specification:'4 inch',p_item_code:null});
  const tables=['equipment','consumables','consumable_stock_movements','consumable_requests','mcpa_purchases','mcpa_purchase_history','mcpa_movements','mcpa_movement_operations','profiles','storage.objects'];
  const before={};for(const table of tables)before[table]=(await f.db.query(`select * from ${table} order by 1`)).rows;
  const policies=(await f.db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
  await upgrade(f);await save(f,{construction_work_areas:areas(),project_stage:'Construction Phase'});await updates(f);
  for(const table of tables)assert.deepEqual((await f.db.query(`select * from ${table} order by 1`)).rows,before[table],table);
  assert.deepEqual((await f.db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,policies);
  const adjusted=await catalogRpc(f,f.actors.admin,'consumables_adjust_stock',{p_operation_id:randomUUID(),p_item_id:item.id,p_version:item.version,p_kind:'restock',p_quantity:2,p_note:'Post-upgrade fixture'});assert.equal(Number(adjusted.current_stock),22);
  assert.ok((await f.rpc(f.actors.admin,'mcpa_movement_snapshot')).tools.length>0);
  const request=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_operation_id:randomUUID(),p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Project upgrade coexistence fixture'}});assert.equal(request.receiverId,f.actors.sky.id);
 }finally{await f.close();}
});
