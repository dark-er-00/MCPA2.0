const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{}};vm.createContext(context);
for(const name of ['display','permissions','project-scope'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),context);
context.MCPAPermissions=context.window.MCPAPermissions;context.MCPAProjectScope=context.window.MCPAProjectScope;
const source=fs.readFileSync(path.join(__dirname,'../js/global-search.js'),'utf8');
vm.runInContext(source.slice(0,source.indexOf('  let generation ='))+'window.searchTest={index,match};})();',context);
const {index,match}=context.window.searchTest;
const user=role=>({id:'person-a',name:'Same Name',role});
const data={inventory:[{id:'T-8861',name:'Pala',serial:'Serial',category:'Tools',brand:'Brand',site:'Casa'}],tools:[{id:'T-8861',name:'Pala'}],projects:[{id:'p1',name:'Casa Buena',location:'Manila',assigned_engineer_id:'person-a'},{id:'p2',name:'Casa Buena',assigned_engineer_id:'person-b',assigned_engineer:'Same Name'}],requests:[{id:'REQ-00001',toolIds:['T-8861'],status:'pending'}],transfers:[{id:'TRF-00010',toolIds:['T-8861'],status:'pending'}],repairs:[{id:'REP-00011',toolId:'T-8861',status:'reported'}],returns:[{id:'RET-1',toolIds:['T-8861']}],missing:[{id:'MIS-1',toolId:'T-8861'}],activity:[{id:'ACT-1',entityId:'REP-00011',action:'reportRepair',summary:'Pala'}],purchases:[{id:'purchase1',supplier:'Supplier',purchase_number:1,items:[{description:'Pala'}]}],materials:[{id:'material1',name:'Pala'}]};
test('Admin indexes real records across modules and exact reference routes',()=>{
 const rows=index(data,user('admin'));for(const ref of ['T-8861','TRF-00010','REP-00011','REQ-00001'])assert.ok(match(rows,ref).some(r=>r.route.endsWith('record='+ref)));
 assert.ok(match(rows,'Pala').length>=7);assert.equal(match(rows,'Casa Buena').filter(r=>r.module==='sites').length,2);assert.equal(match(rows,'no-match').length,0);
 for(const field of ['serial','brand','tools'])assert.ok(match(rows,field).some(r=>r.module==='masterlist'));
});
test('Archived consumables are excluded from active search while historical request references remain available',()=>{
 const rows=index({materials:[{id:'sample',name:'Archived sample',archived_at:'2026-10-22T00:00:00Z'},{id:'active',name:'Active disc'}],materialRequests:[{id:'old-request',item_name:'Historical request',request_number:1,status:'cancelled'}]},user('admin'));
 assert.equal(rows.some(r=>r.id==='sample'),false);assert.equal(rows.some(r=>r.id==='active'),true);assert.equal(rows.some(r=>r.id==='old-request'),true);
});
test('Engineer and Architect assignments use IDs, never ambiguous display names',()=>{
 for(const role of ['engineer','architect']){const rows=index(data,user(role));assert.equal(rows.filter(r=>r.module==='sites').length,1);assert.ok(rows.every(r=>!['purchase','reports','consumables'].includes(r.module)));}
});
test('Secretary and Tool Handler module restrictions',()=>{
 assert.ok(index(data,user('secretary')).every(r=>['purchase','consumables'].includes(r.module)));
 assert.ok(index(data,user('tool_handler')).every(r=>!['request','purchase','reports','consumables'].includes(r.module)));
 assert.equal(index(data,user('unknown')).length,0);
});
test('Demo movements and activity are scoped before counts and snippets',()=>{
 const rows=index(data,user('engineer'),true);assert.equal(rows.filter(r=>['request','transfer','repair','activity','masterlist'].includes(r.module)).length,0);
});
test('Large result sets and duplicate names retain stable identities',()=>{
 const rows=index({inventory:Array.from({length:2001},(_,i)=>({id:'asset-'+i,name:'Duplicate'}))},user('admin'));
 assert.equal(match(rows,'Duplicate').length,2001);assert.equal(match(rows,'asset-2000')[0].id,'asset-2000');
});
test('Input is literal, whitespace tolerant and all terms must match',()=>{
 const rows=index(data,user('admin'));assert.equal(match(rows,'  cAsA   bUeNa ').length,2);assert.equal(match(rows,'[.*').length,0);assert.equal(match(rows,'').length,0);
});
