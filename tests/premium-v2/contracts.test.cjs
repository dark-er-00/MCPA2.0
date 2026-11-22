'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createFixture}=require('./engineer-assignment-preview-fixture.cjs');
const root=path.resolve(__dirname,'../..');
function setup(){
 // Badge DOM parsing is covered by the real-browser suite. The VM checks data contracts.
 const c=vm.createContext({window:{MCPAAuth:{isDemo:false}},document:{addEventListener(){},createElement(){return {content:{querySelector(){return {outerHTML:'<span class="badge"></span>'}}}}}},icon:()=>'<svg></svg>'});
 for(const name of ['shared/display','core/permissions','features/equipment/equipment-tracking','features/equipment/equipment-visual','features/projects/project-scope','features/dashboard/dashboard-view','features/dashboard/premium-dashboard']){
  vm.runInContext(fs.readFileSync(path.join(root,'public/app',name+'.js'),'utf8'),c);
  Object.assign(c,c.window);
 }
 const f=createFixture(),data=f.handle('admin',{rpc:'mcpa_movement_snapshot',args:{}}).data;
 const view=c.window.DashboardView,state={query:'',site:'',status:'',condition:''};
 const render=(user=f.actors.admin,input=data)=>view.render(input,user,state,()=>'',()=>'',v=>String(v||''));
 return {c,f,data,view,state,render};
}
test('premium rendering works on main with the merged project scope',()=>{
 const {c,f,render}=setup();assert.equal(typeof c.window.MCPAProjectScope.engineerInventory,'function');
 for(const who of ['admin','sky','architect','handler'])assert.match(render(f.actors[who]),/data-pie-chart/);
});
test('live field inventory is confirmed custody, never label-only ownership or assigned stock',()=>{
 const {f,data,view,state}=setup();
 for(const [who,own,stock] of [['sky','SYN-004','SYN-001'],['architect','SYN-010','SYN-009']]){
  const html=view.inventory(data,f.actors[who],state);assert.match(html,new RegExp('data-tool="'+own+'"'));assert.doesNotMatch(html,new RegExp('data-tool="'+stock+'"'));
  const none=view.inventory(data,{...f.actors[who],id:'different'},state);assert.doesNotMatch(none,/data-tool=/);
 }
});
test('demo name-only custody remains usable and never grants live custody',()=>{
 const {c,data,view,state}=setup();data.tools=[{id:'demo',name:'Example',holder:'Demo person',qty:2,status:'inuse'}];
 c.window.MCPAAuth.isDemo=true;assert.match(view.inventory(data,{role:'engineer',name:'Demo person'},state),/data-tool="demo"/);
 c.window.MCPAAuth.isDemo=false;assert.doesNotMatch(view.inventory(data,{role:'engineer',name:'Demo person'},state),/data-tool=/);
});
test('quantity-based Admin and asset-based field charts reconcile without mutating snapshots',()=>{
 const {data,render,f}=setup();data.tools[0].qty=4;data.tools[3].qty=9;const before=JSON.stringify(data);
 assert.match(render(),/breakdown: 23 total units/);
 assert.match(render(f.actors.sky),/breakdown: 1 total assets/);assert.equal(JSON.stringify(data),before);
});
test('project identifiers override stale names and duplicate labels do not merge groups',()=>{
 const {data,f,view,state,render}=setup();data.tools[0].site='Casa Buena';data.sites.find(s=>s.id===f.sites.casa.id).name=f.sites.sky.name;
 const html=render();assert.equal((html.match(/class="site-bar v2-site-row /g)||[]).length,5);
 state.site=f.sites.sky.id;const table=view.inventory(data,f.actors.admin,state);for(const id of ['SYN-001','SYN-005','SYN-007'])assert.match(table,new RegExp('data-tool="'+id+'"'));assert.doesNotMatch(table,/data-tool="SYN-002"/);
});
test('untrusted location and equipment text is escaped in premium tables and charts',()=>{
 const {data,render}=setup();data.tools[0].name='<img src=x onerror=alert(1)>';data.sites[0].name='<script>bad</script>';
 const html=render();assert.doesNotMatch(html,/<img src=x|<script>bad/);assert.match(html,/&lt;img/);
});
test('requests and incoming turnover retain receiver ID authorization and original action links',()=>{
 const {data,render,f}=setup();data.requests=[{id:'OWN',receiverId:f.actors.sky.id,status:'released',toolIds:[]},{id:'OTHER',receiverId:f.actors.pau.id,requester:f.actors.sky.name,status:'released'}];
 data.transfers=[{id:'TRF-OWN',receiverId:f.actors.sky.id,status:'pending',toolIds:['SYN-005']},{id:'TRF-OTHER',receiverId:f.actors.pau.id,receiver:f.actors.sky.name,status:'pending'}];
 const html=render(f.actors.sky);assert.match(html,/data-turnover-id="TRF-OWN"/);assert.doesNotMatch(html,/data-turnover-id="TRF-OTHER"|data-request-id="OTHER"/);assert.match(html,/data-go="transfer\?record=TRF-OWN"/);
});
test('role parity and Admin protections remain those of main',()=>{
 const {c}=setup(),p=c.window.MCPAPermissions;
 for(const route of ['dashboard','request','transfer','return','repair','sites','users','reports','consumables','settings'])assert.equal(p.route('engineer',route),p.route('architect',route));
 assert.equal(p.route('engineer','users'),false);assert.equal(p.route('admin','users'),true);
});
test('production entry uses premium assets without any test SDK, fixture API or preview toolbar',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 assert.match(html,/app\/features\/dashboard\/premium-dashboard.js/);assert.doesNotMatch(html,/__sdk|__fixture|offline-sdk|fixture=|prototype-toolbar/);
 const script=fs.readFileSync(path.join(root,'public/app/features/dashboard/premium-dashboard.js'),'utf8');assert.doesNotMatch(script,/\.rpc\(|fetch\(|createFixture|SYN-00|supabaseUrl/);
});
