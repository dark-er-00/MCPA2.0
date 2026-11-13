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
 {id:'unrelated-stock',siteId:'other',status:'available',holderId:null},
 {id:'own-custody',siteId:'other',status:'repair',holderId:'sky'},
 {id:'other-custodian',siteId:'assigned',status:'available',holderId:'pau',holder:'Same Name'},
 {id:'unrelated-repair',siteId:'assigned',status:'repair',holderId:null},
 {id:'archived-stock',siteId:'archived',status:'available',holderId:null},
 {id:'label-only-stock',site:'Same project label',status:'available',holderId:null}
]};
const scope=data=>context.window.MCPAProjectScope.engineerInventory(data,user,{eligible:tool=>tool.status==='available'});
const ids=rows=>Array.from(rows,row=>row.id);
test('Engineer scope admits assigned available stock and own custody, excluding Office and unrelated records by IDs',()=>{
 const before=JSON.stringify(snapshot),result=scope(snapshot);assert.deepEqual(ids(result.tools),['assigned-stock','own-custody']);assert.deepEqual(ids(result.sites),['assigned']);assert.equal(JSON.stringify(snapshot),before);
});
test('Unknown Office configuration fails closed for stock while preserving confirmed own custody',()=>{
 assert.deepEqual(ids(scope({...snapshot,officeId:undefined}).tools),['own-custody']);
});
test('Project reassignment removes available stock immediately but never drops own custody',()=>{
 const data={...snapshot,sites:snapshot.sites.map(s=>s.id==='assigned'?{...s,assigned_engineer_id:'pau'}:s)};assert.deepEqual(ids(scope(data).tools),['own-custody']);assert.deepEqual(ids(scope(data).sites),[]);
});
test('Applying scope repeatedly cannot reintroduce excluded records',()=>{const once=scope(snapshot);assert.deepEqual(ids(scope(once).tools),ids(once.tools));});
