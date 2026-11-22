const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{}};for(const name of ['shared/display','core/permissions','features/projects/project-scope'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app/'+name+'.js'),'utf8'),context);
const user={id:'sky',name:'Same Name',role:'engineer'};
const snapshot={officeId:'office',sites:[
 {id:'assigned',name:'Same project label',assigned_engineer_id:'sky',is_active:true},
 {id:'other',name:'Same project label',assigned_engineer_id:'pau',is_active:true},
 {id:'office',name:'Office renamed',assigned_engineer_id:'sky',is_active:true},
 {id:'archived',name:'Old',assigned_engineer_id:'sky',is_active:true,archived_at:'2026-11-13'},
 {id:'label-only',name:'Name-only',assigned_engineer:'Same Name',is_active:true}
],tools:[
 {id:'assigned-stock',siteId:'assigned',status:'available',holderId:null},
 {id:'office-stock',siteId:'office',site:'Same project label',status:'available',holderId:null},
 {id:'office-custody',siteId:'office',status:'inuse',holderId:'sky'},
 {id:'unrelated-stock',siteId:'other',status:'available',holderId:null},
 {id:'assigned-own-custody',siteId:'assigned',status:'inuse',holderId:'sky'},
 {id:'other-project-custody',siteId:'other',status:'repair',holderId:'sky'},
 {id:'other-custodian',siteId:'assigned',status:'inuse',holderId:'pau',holder:'Same Name'},
 {id:'unrelated-repair',siteId:'assigned',status:'repair',holderId:null},
 {id:'archived-custody',siteId:'archived',status:'inuse',holderId:'sky'},
 {id:'label-only-stock',site:'Same project label',status:'available',holderId:null}
]};
const scope=data=>context.window.MCPAProjectScope.engineerInventory(data,user,{eligible:tool=>tool.status==='available'});
const ids=rows=>Array.from(rows,row=>row.id);
test('Engineer scope admits only own custody at active assigned projects, excluding unheld stock, Office and unrelated projects by IDs',()=>{
 const before=JSON.stringify(snapshot),result=scope(snapshot);assert.deepEqual(ids(result.tools),['assigned-own-custody']);assert.deepEqual(ids(result.sites),['assigned']);assert.equal(JSON.stringify(snapshot),before);
});
test('Unknown Office configuration fails closed for project inventory',()=>{
 assert.deepEqual(ids(scope({...snapshot,officeId:undefined}).tools),[]);
});
test('Project reassignment removes tools at reassigned projects immediately',()=>{
 const data={...snapshot,sites:snapshot.sites.map(s=>s.id==='assigned'?{...s,assigned_engineer_id:'pau'}:s)};assert.deepEqual(ids(scope(data).tools),[]);assert.deepEqual(ids(scope(data).sites),[]);
});
test('Applying scope repeatedly cannot reintroduce excluded records',()=>{const once=scope(snapshot);assert.deepEqual(ids(scope(once).tools),ids(once.tools));});

test('legacy inventory composes authorized readers and requires a verified Office ID',async()=>{
 const scope=context.window.MCPAProjectScope, missing={error:{code:'PGRST202'}};
 const results={mcpa_engineer_equipment_snapshot:missing,mcpa_personal_equipment_snapshot:{data:snapshot},
  mcpa_project_snapshot:{data:{sites:snapshot.sites}},mcpa_inventory_office:{data:{id:snapshot.officeId}}};
 const client={rpc:async name=>results[name]};
 assert.deepEqual(ids((await scope.readEngineerInventory(client,user)).tools),['assigned-own-custody']);
 results.mcpa_inventory_office={data:null};
 await assert.rejects(scope.readEngineerInventory(client,user),/authorization could not be verified/);
 results.mcpa_engineer_equipment_snapshot={error:{code:'42501'}};
 await assert.rejects(scope.readEngineerInventory(client,user),error=>error.code==='42501');
});
