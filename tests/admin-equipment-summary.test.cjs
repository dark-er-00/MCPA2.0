const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto'),{authDatabase}=require('./auth-test-db.cjs'),{upgrade}=require('./project-construction-fixture.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('status route accepts only existing masterlist statuses',()=>{
 const c=vm.createContext({window:{},URLSearchParams});vm.runInContext(read('js/navigation.js'),c);
 for(const status of ['all','available','inuse','repair','missing','sold','disposed'])assert.equal(c.window.MCPAMovementLinks.parse('#masterlist?status='+status).status,status);
 for(const route of ['#users?status=available','#masterlist?status=deployed','#masterlist?status=<script>','#masterlist'])assert.equal(c.window.MCPAMovementLinks.parse(route).status,undefined);
});

test('Admin dashboard shortcuts carry statuses while other roles keep existing targets',()=>{
 const c=vm.createContext({window:{},icon:()=>'<svg></svg>'});
 for(const file of ['display','equipment-tracking','project-scope','dashboard-view']){vm.runInContext(read('js/'+file+'.js'),c);c.EquipmentTracking=c.window.EquipmentTracking;}
 const data={tools:[],sites:[],activity:[],transfers:[],requests:[],repairs:[],missing:[]},state={query:'',status:'',site:'',condition:''};
 const render=role=>c.window.DashboardView.render(data,{role},state,()=>'',()=>'',x=>x);
 for(const key of ['all','available','inuse'])assert.match(render('admin'),new RegExp('data-go="masterlist\\?status='+key+'"'));
 for(const role of ['engineer','architect','tool_handler'])assert.doesNotMatch(render(role),/masterlist\?status=/);
});

test('metadata edits preserve every existing operational status, archive state and history meaning; creation uses RPC default',async()=>{
 const f=await authDatabase({engineerPortal:true});try{
  await upgrade(f);
  const save=(id,version,patch)=>f.rpc(f.actors.admin,'mcpa_save_project',{p_id:id,p_version:version,p_operation_id:randomUUID(),p_patch:patch,p_reason:'Metadata only fixture'});
  for(const status of ['active','discrepancy','verified','turnover','idle','planning','completed']){
   await f.query(f.actors.admin,'update sites set status=$1 where id=$2',[status,f.sites.casa]);
   const before=(await f.db.query('select * from sites where id=$1',[f.sites.casa])).rows[0];
   const saved=await save(before.id,before.project_version,{location:'Edited '+status});
   assert.equal(saved.status,status);assert.equal(saved.is_active,before.is_active);assert.equal(saved.project_stage,before.project_stage);assert.equal(saved.construction_work_areas,before.construction_work_areas);
   const event=(await f.db.query('select * from project_history where project_id=$1 order by changed_at desc,id desc limit 1',[before.id])).rows[0];
   assert.ok(!event.change_types.includes('status'));assert.equal(event.before_values.status,event.after_values.status);
  }
  const created=await save(null,null,{name:'No operational dropdown',location:'Local fixture',assigned_engineer_id:f.actors.sky.id});
  assert.equal(created.status,'planning');assert.equal(created.is_active,true);
  const archived=await save(created.id,created.project_version,{is_active:false});assert.equal(archived.status,'planning');assert.equal(archived.is_active,false);
  const restored=await save(created.id,archived.project_version,{is_active:true});assert.equal(restored.status,'planning');assert.equal(restored.is_active,true);
 }finally{await f.close();}
});
