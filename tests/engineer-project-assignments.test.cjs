const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createFixture}=require('./engineer-assignment-preview-fixture.cjs');
const context={window:{}};for(const name of ['shared/display','core/permissions','features/projects/project-scope'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app/'+name+'.js'),'utf8'),context);
const scope=context.window.MCPAProjectScope,ids=rows=>Array.from(rows,r=>r.id);
const setup=()=>{const f=createFixture();return {f,user:f.actors.sky,data:{...f.handle('sky',{rpc:'mcpa_movement_snapshot'}).data,history:f.history}};};
test('Casa Buena is explicitly assigned to Pau; Sky has a different assigned project',()=>{
 const {f,user,data}=setup();assert.equal(f.sites.casa.assigned_engineer_id,f.actors.pau.id);assert.notEqual(f.sites.casa.assigned_engineer_id,user.id);
 const before=JSON.stringify(data),result=scope.projectSnapshot(data,user);
 assert.deepEqual(ids(result.sites),[f.sites.sky.id]);assert.ok(result.tools.every(t=>t.siteId===f.sites.sky.id&&t.holderId===user.id));assert.ok(result.history.every(h=>h.project_id===f.sites.sky.id));assert.equal(JSON.stringify(data),before);
});
test('Engineer inventory admits only own custody at assigned projects and excludes Casa Buena and unheld Office stock',()=>{
 const {f,user,data}=setup(),projects=scope.projectSnapshot(data,user),inventory=scope.engineerInventory(data,user,{eligible:t=>t.status==='available'});
 assert.deepEqual(ids(projects.tools),['SYN-004']);assert.deepEqual(ids(inventory.tools),['SYN-004']);assert.deepEqual(ids(inventory.sites),[f.sites.sky.id]);
});
test('No assigned projects produces empty sites, tools, history and inventory',()=>{
 const {f,data}=setup(),user=f.actors.unassigned,result=scope.projectSnapshot(data,user);
 for(const key of ['sites','tools','history'])assert.equal(result[key].length,0);
 const inventory=scope.engineerInventory(data,user,{eligible:t=>t.status==='available'});assert.deepEqual(ids(inventory.tools),[]);assert.equal(inventory.sites.length,0);
});
test('Name collisions, missing IDs and demo labels never authorize Engineer projects or custody',()=>{
 const {user}=setup(),data={officeId:'office',sites:[{id:'false',name:'Casa Buena',assigned_engineer:user.name,is_active:true},{id:'other',assigned_engineer_id:'other',assigned_engineer:user.name,is_active:true}],tools:[{id:'false',siteId:'false',holder:user.name,status:'available'}],history:[]};
 assert.equal(scope.projects(data.sites,user,true).length,0);assert.equal(scope.projectSnapshot(data,user).tools.length,0);assert.equal(scope.engineerInventory(data,user,{demo:true,eligible:()=>true}).tools.length,0);
 assert.equal(scope.projectSnapshot({sites:[{id:'id',assigned_engineer_id:user.id}]},{...user,id:null}).sites.length,0);
});
test('Authoritative Office ID excludes renamed Office stock even if a stale response assigns it',()=>{
 const {f,user,data}=setup();data.sites.find(s=>s.id===data.officeId).assigned_engineer_id=user.id;data.sites.find(s=>s.id===data.officeId).name='Sky Assigned Project';
 assert.ok(!scope.projectSnapshot(data,user).sites.some(s=>s.id===data.officeId));assert.ok(!scope.engineerInventory(data,user,{eligible:()=>true}).tools.some(t=>t.id==='SYN-003'));
});
test('Reassignment and repeated refresh remove reassigned project details, counts and tools',()=>{
 const {f,user,data}=setup();data.sites.find(s=>s.id===f.sites.sky.id).assigned_engineer_id=f.actors.pau.id;
 assert.equal(scope.projectSnapshot(data,user).sites.length,0);const once=scope.engineerInventory(data,user,{eligible:t=>t.status==='available'});assert.deepEqual(ids(once.tools),[]);assert.deepEqual(ids(scope.engineerInventory(once,user,{eligible:()=>true}).tools),[]);
});
test('Admin project snapshot remains unchanged; Office contributes to equipment request availability',()=>{
 const {f,data}=setup();assert.equal(scope.projectSnapshot(data,f.actors.admin),data);assert.equal(f.groups()[0].available_quantity,5);
 assert.ok(f.tools.some(t=>t.siteId===f.sites.office.id&&t.status==='available'));assert.equal(scope.projects(data.sites,f.actors.admin).length,5);
});
test('Synthetic reader enforces the same IDs and rejects requests to unassigned Casa',()=>{
 const {f}=setup();assert.deepEqual(ids(f.handle('sky',{rpc:'mcpa_project_snapshot'}).data.sites),[f.sites.sky.id]);assert.deepEqual(ids(f.handle('sky',{rpc:'mcpa_engineer_equipment_snapshot'}).data.tools),['SYN-004']);
 assert.equal(f.handle('sky',{rpc:'mcpa_wa_submit_equipment',args:{p_site_id:f.sites.casa.id}}).error.code,'42501');
 assert.deepEqual(ids(f.handle('pau',{rpc:'mcpa_project_snapshot'}).data.sites),[f.sites.casa.id]);assert.deepEqual(ids(f.handle('pau',{rpc:'mcpa_engineer_equipment_snapshot'}).data.tools),['SYN-005','SYN-008','SYN-011']);
});
test('Unexecuted inventory v2 draft and project reader use the documented ID relationship',()=>{
 const draft=fs.readFileSync(path.join(__dirname,'../supabase/drafts/engineer-ui/00-engineer-inventory.sql'),'utf8');
 assert.match(draft,/assigned_site\.assigned_engineer_id=p\.id/);assert.match(draft,/e\.current_holder_id=p\.id/);assert.match(draft,/e\.site_id<>office_id/);
 const reader=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100001_engineer_portal.sql'),'utf8');assert.match(reader,/s\.assigned_engineer_id=p\.id/);
});
