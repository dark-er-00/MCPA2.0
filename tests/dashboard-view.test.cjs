const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const context=vm.createContext({window:{},icon:()=>'<svg></svg>'});
  for(const file of ['display.js','equipment-tracking.js','project-scope.js','dashboard-view.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
    context.EquipmentTracking=context.window.EquipmentTracking;
  }
  const data={tools:[
    {id:'A',name:'Drill',qty:3,status:'inuse',site:'Site One',holder:'Engineer'},
    {id:'B',name:'Grinder',qty:2,status:'available',site:'Unassigned',holder:''},
    {id:'C',name:'Saw',qty:1,status:'underrepair',site:'Site One',holder:'Engineer'},
    {id:'D',name:'Hidden zero',qty:0,status:'available'},
  ],sites:[{id:'s1',name:'Site One',is_active:true},{id:'s2',name:'Archived site',is_active:false}],activity:[],requests:[],transfers:[],repairs:[],missing:[]};
  const state={query:'',status:'',site:'',condition:''};
  const view=context.window.DashboardView;
  const render=(user={role:'admin'},input=data)=>view.render(input,user,state,()=>'',tools=>tools.map(t=>t.id).join(','),date=>date);
  return {data,state,view,render,context};
}
test('dashboard preserves Admin quantities and counts Engineer assets within custody scope',()=>{
  const {render}=setup();
  const html=render();
  assert.match(html,/<span class="num">6<\/span>/);
  assert.match(html,/No equipment movements recorded in this period/);
  assert.doesNotMatch(html,/Hidden zero/);
  assert.doesNotMatch(html.split('command-panel dashboard-projects')[1],/Archived site/);
  assert.match(render({role:'engineer',name:'Engineer'}),/<span class="num">2<\/span>/);
  assert.match(render({role:'engineer',name:''}),/<span class="num">0<\/span>/);
});
test('Consumables navigation shortcut has no large total and only displays current singular/plural stock warnings',()=>{
 const {view,render,data}=setup();
 assert.doesNotMatch(view.consumablesCard({count:0}),/consumables-warning|class="num"/);
 assert.match(view.consumablesCard({count:1}),/1 item low stock/);assert.match(view.consumablesCard({count:2}),/2 items low stock/);
 assert.match(view.consumablesCard({error:true}),/Stock status unavailable/);
 assert.match(view.consumablesCard({count:0}),/<button type="button"[^>]*data-go="consumables"/);
 assert.match(render({role:'admin'},{...data,consumablesSummary:{count:3}}),/3 items low stock/);
 assert.doesNotMatch(render({role:'engineer',name:'Engineer'}),/consumables-shortcut/);
});
test('dashboard combines search, project, status and condition filters without changing the snapshot',()=>{
  const {data,state,view}=setup(), before=JSON.stringify(data);
  const read=()=>view.inventory(data,{role:'admin'},state,rows=>rows.map(t=>t.id).join(','));
  state.status='repair'; assert.ok(read().startsWith('C<'));
  state.site='Unassigned'; assert.match(read(),/No matching equipment/);
  state.status='available';state.site='__unassigned';state.condition='available';assert.ok(read().startsWith('B<'));
  state.query='Drill';assert.match(read(),/No matching equipment/);
  assert.equal(JSON.stringify(data),before);
});
test('live and demo audit names populate the same seven-day chart and exclude old events',()=>{
  const {data,render}=setup();
  data.activity=['createRequest','releaseRequest','createTransfer','receiveTransfer','createReturn','request_created','transfer_created','transfer_received','return_created'].map((action,i)=>({id:String(i),action,createdAt:new Date().toISOString(),summary:'Saved event',actor:'Engineer'}));
  data.activity.push({action:'createRequest',createdAt:'2000-01-01T00:00:00Z',summary:'Old event',actor:'Engineer'});
  const html=render();
  assert.match(html,/<title>Requests: 2/);
  assert.match(html,/<title>Releases: 3/);
  assert.match(html,/<title>Receipts: 2/);
  assert.match(html,/<title>Returns: 2/);
  assert.doesNotMatch(html,/No equipment movements recorded in this period/);
});
test('untrusted project and activity text is escaped',()=>{
  const {data,render}=setup();
  data.sites[0].name='<img src=x onerror=alert(1)>';
  data.activity=[{action:'createRequest',createdAt:new Date().toISOString(),actor:'<script>',summary:'<svg onload=alert(1)>'}];
  const html=render();
  assert.doesNotMatch(html,/<img src=x|<script>|<svg onload/);
  assert.match(html,/&lt;img/);
});


test('live dashboard custody and incoming transfers distinguish duplicate display names',()=>{
  const {data,state,view,render,context}=setup();
  context.window.MCPAAuth={isDemo:false};
  data.tools[0].holderId='person-a';data.tools[2].holderId='person-b';
  data.transfers=[{id:'TRF-OTHER',status:'pending',receiver:'Engineer',receiverId:'person-b',toolIds:['C']}];
  const html=render({id:'person-a',name:'Engineer',role:'engineer'});
  assert.match(html,/<span class="num">1<\/span>/);
  const inventory=view.inventory(data,{id:'person-a',name:'Engineer',role:'engineer'},state,rows=>rows.map(t=>t.id).join(','));
  assert.ok(inventory.startsWith('A<'));
});

test('Engineer dashboard preserves each request phase and opens released turnover by stable reference',()=>{
  const {data,render,context}=setup();
  context.window.MCPAAuth={isDemo:false};
  const person={id:'person-a',name:'Engineer',role:'engineer'};
  data.requests=['pending','approved','rejected','released','received'].map((status,i)=>({id:'REQ-PHASE-'+i,status,receiverId:person.id,requester:person.name,toolIds:['B'],destination:'Site One',createdAt:'2026-10-12T08:00:00Z'}));
  data.requests.push({id:'REQ-OTHER-PERSON',status:'released',receiverId:'person-b',requester:person.name,toolIds:['C']});
  data.transfers=[{id:'TRF-TURNOVER',requestId:'REQ-PHASE-3',status:'pending',receiverId:person.id,receiver:person.name,toolIds:['B'],destination:'Site One',source:[{site:'Main warehouse'}],createdAt:'2026-10-12T08:00:00Z'}];
  const before=JSON.stringify(data),html=render(person);
  for(const request of data.requests.slice(0,5))assert.ok(html.includes(request.id),'Request stays visible: '+request.status);
  assert.match(html,/Pending Equipment Turnover/);
  assert.match(html,/View Turnover/);
  assert.match(html,/data-go="transfer\?record=TRF-TURNOVER"/);
  assert.match(html,/Released \/ Awaiting Receipt/);
  assert.match(html,/Received \/ Completed/);
  assert.doesNotMatch(html,/REQ-OTHER-PERSON/);
  assert.equal(JSON.stringify(data),before,'Dashboard does not alter backend state');
});

test('turnover panel excludes another receiver and received/canceled handovers; Architect empty state remains usable',()=>{
  const {data,render,context}=setup();context.window.MCPAAuth={isDemo:false};
  const person={id:'person-a',name:'Engineer',role:'architect'};
  data.transfers=[{id:'TRF-OTHER',status:'pending',receiverId:'person-b',receiver:person.name,toolIds:['C']},{id:'TRF-DONE',status:'received',receiverId:person.id,toolIds:['B']},{id:'TRF-CANCELED',status:'canceled',receiverId:person.id,toolIds:['B']}];
  const html=render(person);
  assert.match(html,/No equipment is currently awaiting your confirmation/);
  assert.doesNotMatch(html,/data-go="transfer\?record=TRF-(OTHER|DONE|CANCELED)"/);
  assert.doesNotMatch(render({id:'admin-id',role:'admin'}),/Pending Equipment Turnover/);
});

test('project KPI, cards and chart share stable assignment rules for seven company projects',()=>{
  const {data,render,context}=setup(); context.window.MCPAAuth={isDemo:false};
  data.sites=Array.from({length:7},(_,i)=>({id:'p'+i,name:'Project '+i,is_active:true,assigned_engineer_id:i===0?'mike':'other',assigned_engineer:'Mike'}));
  const count=html=>Number(html.match(/<span class="lbl">Active Projects<\/span><span class="num">(\d+)/)[1]);
  for (const role of ['engineer','architect']) {
    const html=render({id:'mike',name:'Mike',role});
    assert.equal(count(html),1);
    assert.match(html,/1 active project assigned to you/);
    assert.doesNotMatch(html,/Project [1-6]/,'Unassigned projects cannot appear in cards, charts or filters');
    assert.equal(count(render({id:'nobody',name:'Mike',role})),0,'Duplicate names never imply assignments');
    assert.equal(count(render({name:'Mike',role})),0,'Missing profile IDs never imply assignments');
  }
  for(const role of ['admin','tool_handler'])assert.equal(count(render({id:'admin',role})),7);
  data.activeProjects=[...data.sites,{id:'archived',is_active:true,archived_at:'2026-10-14',assigned_engineer_id:'mike'},{id:'inactive',is_active:false,assigned_engineer_id:'mike'}];
  assert.equal(count(render({id:'mike',role:'engineer'})),1,'Even precomputed activeProjects must exclude archived/inactive entries');
});

test('name-only project assignments require explicit demo mode and never override an assigned ID',()=>{
  const {data,render,context}=setup();
  data.sites=[{id:'demo',name:'Demo site',assigned_engineer:'Mike'},{id:'wrong',name:'Other site',is_active:true,assigned_engineer:'Mike',assigned_engineer_id:'someone-else'}];
  const person={id:'demo-mike',name:'Mike',role:'engineer'};
  assert.doesNotMatch(render(person),/Demo site/);
  context.window.MCPAAuth={isDemo:true};
  const html=render(person);
  assert.match(html,/1 active project assigned to you/); assert.match(html,/Demo site/); assert.doesNotMatch(html,/Other site/);
  data.sites[0].is_active=false;assert.match(render(person),/0 active projects assigned to you/);
});

test('field dashboards count assets consistently in KPIs, charts, filters and project summaries',()=>{
  const {data,render,context}=setup();
  context.window.MCPAAuth={isDemo:false};
  data.sites[0].assigned_engineer_id='person-a';
  for(const tool of [data.tools[0],data.tools[2]])tool.holderId='person-a';
  const before=JSON.stringify(data);
  for(const role of ['engineer','architect']){
    const html=render({id:'person-a',role});
    assert.match(html,/<span class="lbl">Total Equipment<\/span><span class="num">2<\/span>/);
    assert.match(html,/All equipment <span>2<\/span>/);
    assert.match(html,/<strong>2<\/strong><span>Assets<\/span>/);
    assert.match(html,/2 assigned assets/);
    assert.match(html,/Drill · A/);assert.match(html,/Saw · C/);
    assert.doesNotMatch(html,/Quantities|assigned units|Equipment quantities/);
  }
  assert.match(render({role:'tool_handler'}),/<span class="lbl">Total Equipment<\/span><span class="num">6<\/span>/);
  assert.equal(JSON.stringify(data),before);
});

test('dashboard tolerates unknown or absent activity identifiers and timestamps without printing technical values',()=>{
  const {data,render}=setup();
  data.activity=[null,undefined,'__proto__','newEventType'].map((action,i)=>({id:String(i),action,summary:action,createdAt:i?'2026-10-24T00:01:02Z':null,actor:'c41e1c31-9892-4e4d-991e-17d5d48c4f0c'}));
  const before=JSON.stringify(data),html=render();
  assert.equal((html.match(/Activity Recorded/g)||[]).length,4);
  assert.doesNotMatch(html,/__proto__|newEventType|c41e1c31/);
  assert.equal(JSON.stringify(data),before);
});
