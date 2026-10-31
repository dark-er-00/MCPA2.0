// Browser integration checks use a local fake transport; no live database access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-inventory-'));
const browser = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const db = {
  sites: [{id:'p1',name:'Casa Buena',location:'Manila',assigned_engineer:'Engr Pau',assigned_engineer_id:'u1',phase:'Structure',progress:40,status:'active',is_active:true,archived_at:null,updated_at:'1'}, {id:'p2',name:'Archived project',is_active:false,archived_at:'2026-01-01'}],
  equipment: [{id:'e1',asset_id:'DRILL-001',name:'Drill',category:'Power Tool',brand:'Bosch',quantity:3,status:'IN_USE',site_id:'p1',current_holder_id:'u1',image_url:'/missing-photo.png'}, {id:'e2',asset_id:'GRIND-001',name:'Grinder',quantity:2,status:'AVAILABLE',site_id:null}, {id:'e3',asset_id:'ZERO',name:'Zero quantity tool',quantity:0,status:'IN_USE',site_id:'p1'}],
  profiles: [{id:'u1',name:'Engr Pau',role:'engineer'}], project_history: []
};
const writes=[], errors=[];
let chrome, socket;
const sdk = `window.__channels=[];window.__emit=table=>window.__channels.forEach(c=>c.listeners.filter(l=>l.filter.table===table).forEach(l=>l.fn({})));window.supabase={createClient(){return {
auth:{getSession:async()=>({data:{session:{user:{id:'fixture-admin'}}}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})},
channel(){const c={listeners:[],on(type,filter,fn){this.listeners.push({filter,fn});return this;},subscribe(fn){setTimeout(()=>fn('SUBSCRIBED'),0);return this;}};window.__channels.push(c);return c;},removeChannel(c){window.__channels=window.__channels.filter(x=>x!==c);return Promise.resolve();},
rpc(name){if(name==='mcpa_my_profile')return Promise.resolve({data:{id:'u1',name:'Engr Pau',role:'admin',account_status:'active'}});return Promise.resolve({data:{tools:[],sites:[],users:[{id:'u1',name:'Engr Pau'}],requests:[],transfers:[],returns:[],repairs:[],missing:[],activity:[]}});},
from(table){const q={table,filters:[]};return {select(){return this;},order(){return this;},range(start,end){q.start=start;q.end=end;return this;},eq(key,value){q.filters.push([key,value]);return this;},update(values){q.values=values;return this;},then(resolve,reject){return fetch('/__db',{method:'POST',body:JSON.stringify(q)}).then(r=>r.json()).then(resolve,reject);}}}
}}};`;
const server=http.createServer(async(req,res)=>{
  if(req.url==='/__sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk);return;}
  if(req.url==='/__db'){
    let body='';for await(const chunk of req)body+=chunk;
    const q=JSON.parse(body);let rows=db[q.table]||[];
    rows=rows.filter(r=>q.filters.every(([key,value])=>r[key]===value));
    if(q.values){writes.push(q);rows.forEach(r=>Object.assign(r,q.values,{updated_at:String(Number(r.updated_at)+1)}));}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:rows.slice(q.start||0,(q.end??999)+1),count:rows.length}));return;
  }
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(file);
  if(file.endsWith('index.html'))content=content.toString().replace(/<script src="https:[^"]+"[^>]*><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(content);
});
(async()=>{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  chrome=spawn(browser,['--headless=new',...(process.env.MCPA_CHROME_NO_SANDBOX==='1'?['--no-sandbox']:[]),'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<100;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0];break;}await pause(100);}
  assert.ok(port,'Browser started');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>reject(new Error('CDP timeout '+method)),10000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.result.description);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(80);}throw new Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText'));};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot=async name=>{const {data}=await command('Page.captureScreenshot',{format:'png'});const file=path.join(profile,name+'.png');fs.writeFileSync(file,Buffer.from(data,'base64'));console.log('SCREENSHOT '+file);};
  await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
  await wait("window.MCPAAuth?.profile?.role==='admin'");
  await wait("document.querySelector('.dashboard-projects') && !MCPANavigation.restoring");
  assert.equal(await evaluate("document.querySelector('.overview-kpis .num').textContent"),'5');
  assert.ok(await evaluate("document.querySelector('.dashboard-projects').textContent.includes('Drill: 3') && !document.querySelector('.dashboard-projects').textContent.includes('Zero quantity tool') && !document.querySelector('.dashboard-projects').textContent.includes('Archived project')"));
  assert.ok(await evaluate("![...document.querySelectorAll('#content button')].some(b=>b.textContent.trim()==='Refresh')"));
  await wait("!document.querySelector('.equipment-thumbnail img')");
  db.equipment[0].quantity=7;await evaluate("__emit('equipment')");
  await wait("document.querySelector('.overview-kpis .num').textContent==='9'");
  await shot('dashboard-desktop');
  await click('[data-status="available"]');
  assert.ok(await evaluate("document.querySelector('#overview-results').textContent.includes('GRIND-001') && !document.querySelector('#overview-results').textContent.includes('DRILL-001')"),'Available filter follows request eligibility');
  await click('[data-status="inuse"]');
  await click('[data-tool="DRILL-001"]');await wait("document.querySelector('#profileContent')?.textContent.includes('DRILL-001') && !MCPANavigation.restoring");
  assert.ok(await evaluate("document.querySelector('#profileContent').textContent.includes('Engr Pau')"),'Dashboard Details opens current custody');
  await evaluate('history.back()');await wait("document.querySelector('#screen-dashboard.active') && !MCPANavigation.restoring");
  await click('[data-status=""]');
  await evaluate("document.querySelector('#dashboard-search').value='Grinder';document.querySelector('#dashboard-search').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.ok(await evaluate("!document.querySelector('#overview-results').textContent.includes('DRILL-001')"),'Inventory search filters rows');
  await evaluate("document.querySelector('#dashboard-search').value='';document.querySelector('#dashboard-search').dispatchEvent(new Event('input',{bubbles:true}));toggleTheme()");
  assert.equal(await evaluate("getComputedStyle(document.body).getPropertyValue('--background').trim()"),'#0f0f0e');
  assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),'dark');
  await pause(300); // Let the existing theme transition finish before capture.
  await shot('dashboard-desktop-dark');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Dashboard fits laptop');
  await shot('dashboard-laptop-dark');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('dashboard-mobile-dark');
  await evaluate('toggleTheme()');
  await shot('dashboard-mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Dashboard fits mobile');
  console.log('PASS Dashboard sums quantities, auto-updates, hides zero entries and archived projects');
  await evaluate("showScreen('masterlist')");await wait("document.querySelector('#equipmentTableBody')?.textContent.includes('DRILL-001')");
  assert.equal(await evaluate('__channels.length'),1,'Only one inventory subscription after navigation');
  await evaluate("document.querySelector('#searchEquipment').value='Drill';filterAndResetPage()");
  db.equipment[0].name='Drill updated';await evaluate("__emit('equipment')");
  await wait("document.querySelector('#equipmentTableBody').textContent.includes('Drill updated')");
  assert.equal(await evaluate("document.querySelector('#searchEquipment').value"),'Drill');
  await shot('equipment-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});await shot('equipment-desktop');
  console.log('PASS Equipment visuals, realtime reload and filter preservation');
  await evaluate("showScreen('sites')");await wait("document.querySelectorAll('#sites-list [data-action=open-site]').length===1");
  await click('[data-action=open-site]');await wait("document.querySelector('#screen-site-detail.active [data-action=archive-site]:not(:disabled)')");
  await click('#screen-site-detail.active [data-action=archive-site]');
  await wait("document.querySelector('#sites-dialog[open] [data-action=confirm-archive]:not(:disabled)')");
  await click('#sites-dialog[open] [data-action=confirm-archive]');
  await wait("!document.querySelectorAll('#sites-list [data-action=open-site]').length && !document.querySelector('#sites-dialog').open");
  assert.equal(db.sites[0].is_active,false);assert.equal(db.equipment[0].site_id,'p1');assert.equal(writes[0].table,'sites');assert.equal(writes[0].values.is_active,false);
  await evaluate("showScreen('dashboard')");await wait("document.querySelector('.dashboard-projects')?.textContent.includes('No active projects')");
  assert.equal(await evaluate('__channels.length'),1);
  console.log('PASS Archive writes is_active=false, preserves assignments and disappears from dashboard');
  await evaluate("showScreen('sites')");await wait("document.querySelector('#projects-archived') && !document.querySelector('#sites-list').getAttribute('aria-busy').includes('true')");
  await click('#projects-archived');await wait("document.querySelector('[data-action=open-site][data-id=p1]')");
  await click('[data-action=open-site][data-id=p1]');
  // Initial/realtime reads can still be in flight after the list appears.
  // Wait for the enabled mutation control before opening its confirmation.
  await wait("document.querySelector('#screen-site-detail.active [data-action=archive-site]:not(:disabled)')");
  await click('#screen-site-detail.active [data-action=archive-site]');
  await wait("document.querySelector('#sites-dialog[open] [data-action=confirm-archive]:not(:disabled)')");
  await click('#sites-dialog[open] [data-action=confirm-archive]');
  await wait("!document.querySelector('#sites-dialog').open");assert.equal(db.sites[0].is_active,true);
  await evaluate("showScreen('dashboard')");await wait("document.querySelector('.dashboard-projects')?.textContent.includes('Casa Buena')");
  db.sites[0].name='Renamed project';await evaluate("__emit('sites')");await wait("document.querySelector('.dashboard-projects').textContent.includes('Renamed project')");
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Restore, project rename propagation and no browser exceptions');
})().catch(error=>{console.error(error);console.error(errors);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();server.closeAllConnections();server.close();console.log('Browser artifacts: '+profile);});
