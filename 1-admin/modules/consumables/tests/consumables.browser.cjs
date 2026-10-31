// Real module + actual setup.sql in local PostgreSQL; only SDK transport is substituted.
// Node 22+ and Chrome/Edge required. No live Supabase access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { database } = require('./database.cjs');
const workspace = path.resolve(__dirname, '../../..');
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to Chrome or Edge.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-consumables-test-'));
const calls = [];
let testDb, failReads = null, failWrites = null, delay = 0, loseNextReply = false;
const sdk = `
window.__timers = new Map();
const originalInterval = window.setInterval, originalClear = window.clearInterval;
window.setInterval = (callback, ms) => { const id = originalInterval(callback, ms); window.__timers.set(id, callback); return id; };
window.clearInterval = id => { window.__timers.delete(id); originalClear(id); };
window.supabase = {createClient() {return {
  rpc(name, parameters) {return fetch('/__db', {method:'POST',body:JSON.stringify({rpc:name,parameters})}).then(r=>r.json());},
  from(table) {
    const query={table}; const builder={
      select() {return this;}, order() {return this;},
      range(start,end) {query.start=start; query.end=end; return this;},
      eq(column,value) {query.filter=[column,value]; return this;},
      then(resolve,reject) {return fetch('/__db',{method:'POST',body:JSON.stringify(query)}).then(r=>r.json()).then(resolve,reject);}
    }; return builder;
  }
}}};`;
const server = http.createServer(async (request, response) => {
  if (request.url === '/__db') {
    let body=''; for await (const chunk of request) body+=chunk;
    const query=JSON.parse(body); calls.push(query);
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    let data=null, count=null, error=null;
    try {
      if (query.rpc) {
        if (failWrites) throw failWrites;
        data=await testDb.rpc(query.rpc,query.parameters);
        if (loseNextReply) { loseNextReply=false; throw {message:'Simulated lost save response'}; }
      } else {
        if (failReads) throw failReads;
        assert.ok(['consumables','consumable_requests','consumable_stock_movements'].includes(query.table));
        assert.ok(!query.filter || query.filter[0]==='consumable_id');
        const where=query.filter ? ' where consumable_id=$1' : '';
        const values=query.filter ? [query.filter[1]] : [];
        const rows=(await testDb.asRole('anon',`select to_jsonb(t) as value from ${query.table} t${where} order by id`,values)).rows.map(row=>row.value);
        count=rows.length;
        // Small server cap verifies pagination follows returned counts, not requested limits.
        data=rows.slice(query.start||0,Math.min((query.end??499)+1,(query.start||0)+2));
      }
    } catch (err) {error={code:err.code,message:err.message};}
    response.writeHead(200,{'Content-Type':'application/json'}); response.end(JSON.stringify({data,count,error})); return;
  }
  if (request.url==='/__sdk.js') {response.writeHead(200,{'Content-Type':'text/javascript'}); response.end(sdk); return;}
  const file=path.resolve(workspace,'.'+new URL(request.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if (!file.startsWith(workspace+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()) {response.writeHead(404); response.end(); return;}
  let content=fs.readFileSync(file);
  if (file.endsWith('index.html')) content=content.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
  response.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'text/plain'}); response.end(content);
});

let chrome;
let socket;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  testDb = await database();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  console.log('Starting isolated browser');
  const base = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = fs.readFileSync(file, 'utf8').split('\n')[0]; break; }
    await pause(100);
  }
  assert.ok(port, 'Browser debugging port did not start.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await Promise.race([once(socket, 'open'), pause(10000).then(() => { throw new Error('Browser socket did not open'); })]);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 10000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result.description);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(50); }
    throw new Error('Timed out: ' + expression);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); console.log('PASS ' + name); };
  const screenshot = async name => {
    await pause(350); // Let the shared screen/theme transitions finish.
    const { data } = await command('Page.captureScreenshot', { format: 'png' });
    const destination = path.join(profile, name + '.png'); fs.writeFileSync(destination, Buffer.from(data, 'base64')); console.log('SCREENSHOT ' + destination);
  };
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['https://*'] });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await waitFor("typeof enterApp === 'function'");
  await evaluate('enterApp()');
  await waitFor("document.querySelector('#screen-dashboard.active')");


  failReads = {code:'PGRST205'};
  await evaluate("showScreen('consumables')");
  await waitFor("document.querySelector('#consumables-feedback')?.textContent.includes('setup is incomplete')");
  await check('Missing setup shows actionable error and disables writes', "document.querySelector('[data-action=add]').disabled && !document.querySelector('[data-action=refresh]').disabled");
  failReads=null;
  await click('[data-action=refresh]');
  await waitFor("document.querySelector('#consumables-rows').textContent.includes('No consumables yet')");
  await click('[data-action=add]');
  await fill('#cons-name','  '); await fill('#cons-unit','kg');
  await click('#consumables-form [type=submit]');
  await check('Whitespace validation preserves the form', "document.querySelector('#consumables-form-error').textContent.includes('blank spaces')");
  await fill('#cons-name','Welding Rods'); await fill('#cons-minimum','10'); await fill('#cons-opening','4');
  await click('#consumables-form [type=submit]');
  await waitFor("!document.querySelector('#consumables-dialog').open");
  const item=(await testDb.db.query('select to_jsonb(c) as value from consumables c')).rows[0].value;
  const itemRow=`[data-item-id="${item.id}"]`;
  await check('Saved stock drives low-stock notification', "document.querySelector('#consumables-alert').textContent.includes('1 consumable needs restocking')");
  await fill('#consumables-search','no match');
  await check('Search empty state', "document.querySelector('#consumables-rows').textContent.includes('No consumables match')");
  await fill('#consumables-search','');
  await click(`${itemRow} [data-action=request]`);
  await check('Purchase Required prefills the correct item and shortage', `document.querySelector('#cons-item').value === '${item.id}' && document.querySelector('#cons-quantity').value === '6'`);
  await fill('#cons-requester','Engineer A');
  failWrites={code:'42501'};
  await click('#consumables-form [type=submit]');
  await waitFor("document.querySelector('#consumables-form-error').textContent.includes('permissions')");
  await check('Failed request keeps values', "document.querySelector('#cons-requester').value === 'Engineer A' && document.querySelector('#consumables-dialog').open");
  failWrites=null; delay=100;
  const before=calls.filter(call=>call.rpc).length;
  await evaluate("document.querySelector('#consumables-form').requestSubmit(); document.querySelector('#consumables-form').requestSubmit()");
  await waitFor("!document.querySelector('#consumables-dialog').open"); delay=0;
  assert.equal(calls.filter(call=>call.rpc).length,before+1);
  const request=(await testDb.db.query('select to_jsonb(r) as value from consumable_requests r')).rows[0].value;
  const requestRow=`[data-request-id="${request.id}"]`;
  await check('Open requests replace purchase buttons without changing stock', `document.querySelector('${itemRow} [data-action=view-request]') && document.querySelector('${itemRow} td:nth-child(2)').textContent === '4'`);
  await click(`${requestRow} [data-action=receive]`);
  await fill('#cons-quantity','7'); await fill('#cons-note','DR-1');
  await click('#consumables-form [type=submit]');
  await check('Over-receipt is rejected in the form', "document.querySelector('#cons-quantity').validity.rangeOverflow && document.querySelector('#consumables-dialog').open");
  await fill('#cons-quantity','2.5'); loseNextReply=true;
  await click('#consumables-form [type=submit]');
  await waitFor("document.querySelector('#consumables-form-error').textContent.includes('lost save response')");
  await click('#consumables-form [type=submit]');
  await waitFor("!document.querySelector('#consumables-dialog').open");
  await check('Retry after lost receipt response adds stock once', `document.querySelector('${itemRow} td:nth-child(2)').textContent === '6.5' && document.querySelector('${requestRow}').textContent.includes('Partially Received')`);
  await click(`${requestRow} [data-action=receive]`);
  await fill('#cons-note','DR-2'); await click('#consumables-form [type=submit]');
  await waitFor("!document.querySelector('#consumables-dialog').open");
  await check('Full delivery clears the alert and open request', `document.querySelector('${itemRow} td:nth-child(2)').textContent === '10' && !document.querySelector('${requestRow}') && document.querySelector('#consumables-alert').classList.contains('is-ok')`);
  await fill('#consumables-request-filter','received');
  await click(`${requestRow} [data-action=view-request]`);
  await check('Request details retain quantities and requester', "document.querySelector('#consumables-dialog-content').textContent.includes('Engineer A') && document.querySelector('#consumables-dialog-content').textContent.includes('6 kg') && !document.querySelector('#consumables-dialog [data-action=receive]')");
  await click('#consumables-dialog [data-action=close]');
  await click(`${itemRow} [data-action=stock]`); await fill('#cons-quantity','10'); await fill('#cons-note','Issued to crew');
  await click('#consumables-form [type=submit]'); await waitFor("!document.querySelector('#consumables-dialog').open");
  await check('Usage updates stock and out-of-stock alert', `document.querySelector('${itemRow}').textContent.includes('Out of Stock') && document.querySelector('#consumables-alert').textContent.includes('1 out of stock')`);
  await click('.page-head-actions [data-action=request]'); await fill('#cons-requester','Engineer B');
  await click('#consumables-form [type=submit]'); await waitFor("!document.querySelector('#consumables-dialog').open");
  await fill('#consumables-request-filter','open');
  await click('#consumables-request-rows [data-action=cancel-request]'); await fill('#cons-reason','Revised requirement');
  await click('#consumables-form [type=submit]'); await waitFor("!document.querySelector('#consumables-dialog').open");
  await fill('#consumables-request-filter','cancelled'); await click('#consumables-request-rows [data-action=view-request]');
  await check('Cancellation retains reason and history', "document.querySelector('#consumables-dialog-content').textContent.includes('Revised requirement')");
  await click('#consumables-dialog [data-action=close]');
  await click(`${itemRow} [data-action=edit]`);
  const current=(await testDb.db.query('select to_jsonb(c) as value from consumables c where id=$1',[item.id])).rows[0].value;
  await testDb.rpc('consumables_save_item',{p_id:item.id,p_version:current.version,p_name:'Updated Elsewhere',p_unit:'kg',p_minimum:8,p_opening:0});
  await fill('#cons-name','Stale name'); await click('#consumables-form [type=submit]');
  await waitFor("document.querySelector('#consumables-form-error').textContent.includes('changed')");
  await click('#consumables-dialog [data-action=close]'); await click('[data-action=refresh]');
  await waitFor("document.querySelector('#consumables-rows').textContent.includes('Updated Elsewhere')");
  await click(`${itemRow} [data-action=edit]`); await fill('#cons-name','<img src=x onerror=alert(1)> Rods');
  await click('#consumables-form [type=submit]'); await waitFor("!document.querySelector('#consumables-dialog').open");
  await check('Stored text is escaped', "document.querySelector('#consumables-rows').textContent.includes('<img src=x') && !document.querySelector('#consumables-rows img')");
  await click(`${itemRow} [data-action=history]`);
  await waitFor("document.querySelector('#consumables-dialog-content').textContent.includes('Issued to crew')");
  await check('History paginates all actual PostgreSQL movements', "document.querySelectorAll('#consumables-dialog-content tbody tr').length === 4");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await check('Escape closes dialog', "!document.querySelector('#consumables-dialog').open");
  for (let index=0;index<4;index++) await testDb.rpc('consumables_save_item',{p_id:randomUUID(),p_version:null,p_name:`Material ${index}`,p_unit:'pieces',p_minimum:5,p_opening:index?10:0});
  await evaluate('for (const callback of window.__timers.values()) callback()');
  await waitFor("document.querySelectorAll('#consumables-rows tr').length === 5");
  await check('Background refresh loads all server pages', "document.querySelector('#consumables-count').textContent === '5 of 5 items'");
  await fill('#consumables-filter','out');
  await check('Stock filter works', "document.querySelectorAll('#consumables-rows tr').length === 2");
  await fill('#consumables-filter',''); await fill('#consumables-request-filter','');
  await screenshot('consumables-desktop');
  await evaluate('toggleTheme()');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await check('Mobile layout does not overflow the viewport', "document.documentElement.scrollWidth <= window.innerWidth");
  await screenshot('consumables-mobile-dark');
  await click('[data-action=add]');
  await check('Mobile dialog fits viewport', "document.querySelector('#consumables-dialog').getBoundingClientRect().right <= window.innerWidth");
  await screenshot('consumables-mobile-dialog'); await click('#consumables-dialog [data-action=close]');
  await evaluate("showScreen('dashboard')"); await waitFor("document.querySelector('#screen-dashboard.active')");
  await check('Navigating away removes the poll timer', 'window.__timers.size === 0');
  await evaluate("showScreen('consumables')"); await waitFor("document.querySelectorAll('#consumables-rows tr').length === 5");
  await check('Module re-entry preserves data without duplicate polling', 'window.__timers.size === 1');
  await command('Page.reload'); await waitFor("typeof enterApp === 'function'"); await evaluate('enterApp()'); await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('consumables')"); await waitFor("document.querySelectorAll('#consumables-rows tr').length === 5");
  await check('Page reload retains database records', "document.querySelector('#consumables-request-count').textContent.includes('2 total')");
  failReads={message:'Connection unavailable'}; await click('[data-action=refresh]');
  await waitFor("document.querySelector('#consumables-feedback').textContent.includes('out of date')");
  await check('Failed refresh keeps records and disables stale writes', "document.querySelectorAll('#consumables-rows tr').length === 5 && document.querySelector('[data-action=add]').disabled");
  failReads=null; await click('[data-action=refresh]'); await waitFor("!document.querySelector('[data-action=add]').disabled");
  assert.deepEqual(errors,[],'No uncaught browser errors');
  assert.ok(calls.every(call=>!call.rpc || call.rpc.startsWith('consumables_')),'Only module RPCs used');
  console.log('PASS All Consumables browser checks using actual setup.sql; no live database writes.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  socket?.close(); chrome?.kill(); server.closeAllConnections(); server.close(); await testDb?.db.close();
  console.log('Temporary browser profile and screenshots: '+profile);
});
