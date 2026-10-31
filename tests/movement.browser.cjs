// Actual screens and shipped SQL, served locally. HTTPS and live writes are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {database} = require('./movement-test-db.cjs');
const workspace = path.resolve(__dirname, '..');
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
assert.ok(browser, 'Set CHROME_PATH to Chrome or Edge.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-movement-'));
let db, chrome, socket, failSnapshot = false, loseReply = false;
const errors = [], calls = [];
const sdk = `window.supabase={createClient(){return {rpc(name,parameters){return fetch('/__db',{method:'POST',body:JSON.stringify({rpc:name,parameters})}).then(r=>r.json())},from(table){const query={table};return {select(){return this},order(){return this},range(start,end){query.start=start;query.end=end;return this},eq(key,value){query.filter=[key,value];return this},limit(value){query.end=value-1;return this},then(resolve,reject){return fetch('/__db',{method:'POST',body:JSON.stringify(query)}).then(r=>r.json()).then(resolve,reject)}}}}}};`;
const server = http.createServer(async (req,res) => {
  if(req.url==='/__sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(sdk);return;}
  if(req.url==='/__db'){
    let body='';for await(const part of req)body+=part;
    const query=JSON.parse(body);calls.push(query);let data=null,error=null,count=null;
    try {
      if(query.rpc){
        if(failSnapshot && query.rpc==='mcpa_movement_snapshot')throw {code:'PGRST202',message:'Missing setup'};
        data=await db.rpc(query.rpc,query.parameters);
        if(loseReply && query.rpc==='mcpa_movement_action'){loseReply=false;throw new Error('Simulated lost response. Retry the same form.');}
      }else{
        assert.ok(['equipment','sites','profiles'].includes(query.table));
        let rows=(await db.db.query(`select * from ${query.table} order by id`)).rows;
        if(query.filter)rows=rows.filter(r=>r[query.filter[0]]===query.filter[1]);
        count=rows.length;data=rows.slice(query.start||0,(query.end??999)+1);
      }
    }catch(e){error={message:e.message,code:e.code};}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data,error,count}));return;
  }
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(workspace,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(workspace+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(file);
  if(file.endsWith('index.html'))content=content.toString().replace(/<script src="https:[^"]+"[^>]*><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'text/plain'});res.end(content);
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  db=await database(); server.listen(0,'127.0.0.1');await once(server,'listening');
  console.log('Starting isolated movement browser');
  const base=`http://127.0.0.1:${server.address().port}`;
  chrome=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<100;i++){const p=path.join(profile,'DevToolsActivePort');if(fs.existsSync(p)){port=fs.readFileSync(p,'utf8').split('\n')[0];break;}await pause(100);}
  assert.ok(port,'Chrome debugging did not start.');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(8000)})).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await Promise.race([once(socket,'open'),pause(10000).then(()=>{throw new Error('Browser socket did not open');})]);
  console.log('Connected to isolated browser');
  let next=0;const pending=new Map();
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},10000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await pause(50);}throw new Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText'));};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,value)=>evaluate(`(()=>{const x=document.querySelector(${JSON.stringify(selector)});x.value=${JSON.stringify(value)};x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
  const go=async id=>{await evaluate(`showScreen(${JSON.stringify(id)})`);await wait(`document.querySelector('#screen-${id}.active') && document.querySelector('${id==='masterlist'?'#equipmentTableBody, [data-mode]':['dashboard','activity'].includes(id)?'[data-mode]':'[data-list]'}')`);};
  const navigate=async (portal,screen)=>{await command('Page.navigate',{url:base+(portal==='engineer'?'/2-engr/index.html':'/index.html')+'#'+screen});if(portal==='admin'){await wait("typeof enterApp==='function' && document.querySelector('#userInput')");await evaluate('enterApp()');}await wait(`document.querySelector('#screen-${screen}.active') && document.querySelector('[data-list]')`);};
  const check=async (name,expression)=>{assert.ok(await evaluate(expression),name);console.log('PASS '+name);};
  const snapshot=()=>db.rpc('mcpa_movement_snapshot');
  const shot=async name=>{const {data}=await command('Page.captureScreenshot',{format:'png'});const file=path.join(profile,name+'.png');fs.writeFileSync(file,Buffer.from(data,'base64'));console.log('SCREENSHOT '+file);};
  await command('Runtime.enable');await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('engineer','request');
  await click('[name="toolIds"][value="TOOL-001"]');await fill('[name="destination"]','Casa Buena');await fill('[name="purpose"]','Column work <img src=x onerror="window.__injected=1">');
  loseReply=true;await submit('[data-form="create"]');await wait("document.querySelector('[data-notice]').textContent.includes('lost response')");
  assert.equal((await snapshot()).requests.length,1);await submit('[data-form="create"]');await wait("document.querySelector('[data-notice]').textContent.includes('saved successfully')");
  let data=await snapshot(), request=data.requests[0];assert.equal(data.requests.length,1);assert.equal(data.tools.find(t=>t.id==='TOOL-001').holder,'—');
  await check('Request saves once after lost response; unsafe purpose stays text',"!window.__injected && document.querySelector('[data-detail]').textContent.includes('<img')");
  await navigate('admin','request');await fill('#movement-profile',db.actors.admin.id);await click(`[data-action="view"][data-id="${request.id}"]`);await click('[data-action="approve"]');await wait("document.querySelector('[data-action=release]')");await click('[data-action="release"]');await wait("document.querySelector('[data-action=open-transfer]')");
  data=await snapshot();const transfer=data.transfers[0];assert.equal(data.tools.find(t=>t.id==='TOOL-001').holder,'—');console.log('PASS Admin review reserves and releases without premature custody change');
  await shot('admin-release');
  await navigate('engineer','transfer');await fill('[name="code"]','TRF-NOT-REAL');await submit('[data-form="lookup"]');await wait("document.querySelector('[data-notice]').textContent.includes('No transfer found')");
  await fill('[name="code"]',transfer.code);await submit('[data-form="lookup"]');await wait("document.querySelector('[data-form=receive]')");await submit('[data-form="receive"]');assert.equal((await snapshot()).transfers[0].status,'pending');
  await fill('[data-condition]','good');await submit('[data-form="receive"]');await wait("document.querySelector('[data-notice]').textContent.includes('Receipt confirmed')");
  data=await snapshot();assert.equal(data.tools.find(t=>t.id==='TOOL-001').holder,'Engr Sky');assert.equal(data.tools.find(t=>t.id==='TOOL-001').site,'Casa Buena');console.log('PASS Valid transfer lookup and mandatory inspection update location and custody');
  await go('dashboard');await check('Dashboard reflects received custody',"document.querySelector('#screen-dashboard').textContent.includes('TOOL-001')");await go('masterlist');await fill('#movement-inventory-search','TOOL-001');await click('[data-tool="TOOL-001"]');await check('Inventory details show saved movement history',"document.querySelector('dialog').textContent.includes('Transfer Received')");await click('[data-close]');
  await go('return');await click('[name="toolIds"][value="TOOL-001"]');await fill('[name="destination"]','Main Warehouse');await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Blade guard broken');await submit('[data-form=create]');await wait("document.querySelector('[data-notice]').textContent.includes('saved successfully')");
  data=await snapshot();const repair=data.repairs.find(r=>r.toolId==='TOOL-001');assert.ok(repair);assert.equal(data.tools.find(t=>t.id==='TOOL-001').status,'repair');console.log('PASS Damaged return opens a linked repair and keeps accountability');
  await navigate('admin','repair');await click(`[data-action=view][data-id="${repair.id}"]`);await click('[data-action=start-repair]');await wait("document.querySelector('[data-form=complete-repair]')");await fill('[name=repairDestination]','Main Warehouse');await fill('#mv-resolution','Guard replaced and tested');await submit('[data-form=complete-repair]');await wait("document.querySelector('[data-notice]').textContent.includes('Repair completed')");assert.equal((await snapshot()).tools.find(t=>t.id==='TOOL-001').status,'available');
  await navigate('engineer','missing');await fill('[name=toolId]','TOOL-002');await fill('[name=notes]','Not found during site inventory');await submit('[data-form=create]');await wait("document.querySelector('[data-notice]').textContent.includes('saved successfully')");const missing=(await snapshot()).missing[0];
  await navigate('admin','missing');await click(`[data-action=view][data-id="${missing.id}"]`);await fill('[name=condition]','good');await fill('[name=recoveryDestination]','Main Warehouse');await fill('[data-form=recover] [name=notes]','Located and inspected');await submit('[data-form=recover]');await wait("document.querySelector('[data-notice]').textContent.includes('Recovery recorded')");assert.equal((await snapshot()).tools.find(t=>t.id==='TOOL-002').status,'available');console.log('PASS Admin repair completion and missing recovery restore usable inventory');
  await go('masterlist');await wait("document.querySelector('#equipmentTableBody')?.textContent.includes('TOOL-001')");await go('request');await go('masterlist');await wait("document.querySelector('#equipmentTableBody')?.textContent.includes('TOOL-001')");console.log('PASS Admin masterlist can be revisited without script redeclaration errors');
  await go('activity');await check('Activity reads database records',"document.querySelector('#screen-activity').textContent.includes('recoverMissing')");
  await navigate('engineer','request');await evaluate("showScreen('sites')");await wait("document.querySelector('#projects-scope')");await fill('#projects-scope','all');await wait("document.querySelectorAll('#sites-list [data-action=open-site]').length===2");
  await click(`[data-action=open-site][data-id="${db.sites.casa}"]`);await wait("document.querySelector('#screen-site-detail.active') && document.querySelector('[data-last-movement]')?.textContent!=='Loading…'");
  await check('Engineer Sites loads shared module and remains read-only',"document.querySelector('[data-action=edit-site]').hidden && document.querySelector('[data-last-movement]').textContent!=='Not recorded'");
  await click('[data-action=view-movements]');await wait("document.querySelector('#sites-dialog').open");await check('Site history includes actual inbound and outbound movement',"document.querySelector('#sites-dialog').textContent.includes('TOOL-001') && document.querySelector('#sites-dialog').textContent.includes('Main Warehouse')");await click('#sites-dialog [data-action=close-dialog]');
  failSnapshot=true;await command('Page.navigate',{url:base+'/2-engr/index.html?setup-test=1#request'});await wait("document.querySelector('[data-action=demo]')");await check('Missing setup is actionable',"document.querySelector('#content').textContent.includes('setup.sql')");await click('[data-action=demo]');await wait("document.querySelector('.mv-demo-banner')");await check('Demo is explicit and isolated from live inventory',"MovementStore.mode==='demo' && MovementStore.getState().tools.some(t=>t.id==='GRD-002') && !MovementStore.getState().tools.some(t=>t.id==='TOOL-001')");
  await click('[name=toolIds][value="GRD-002"]');await fill('[name=destination]','Metropolis');await fill('[name=purpose]','Demo request persistence');await submit('[data-form=create]');await wait("document.querySelector('[data-notice]').textContent.includes('saved successfully')");
  await command('Page.reload');await wait("document.querySelector('[data-list]')?.textContent.includes('GRD-002')");console.log('PASS Demo changes survive reload without contacting live storage');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('toggleTheme()');await shot('engineer-mobile-dark');await check('Mobile page fits viewport',"document.documentElement.scrollWidth<=window.innerWidth+1");
  failSnapshot=false;await fill('[data-mode]','live');await wait("document.querySelector('[data-mode]')?.value==='live' && document.querySelector('[data-form=create]')");await check('Switching back to live restores project data',"MovementStore.getState().tools.some(t=>t.id==='TOOL-001') && !MovementStore.getState().tools.some(t=>t.id==='GRD-002')");
  assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS All movement browser checks; no live database writes.');
})().catch(error=>{console.error(error);console.error('Browser errors:',JSON.stringify(errors));process.exitCode=1;}).finally(async()=>{socket?.close();chrome?.kill();server.closeAllConnections();server.close();await db?.close();console.log('Temporary screenshots and browser profile: '+profile);});
