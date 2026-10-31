/* Isolated mounts over real disposable PGlite RPCs/RLS. Does not load or modify either application shell. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const root = path.resolve(__dirname, '../..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-wa-browser-'));
const screenshots = path.join(root, 'documentation/workstream-a/screenshots');
const scripts = [
  '/js/upgrades/quantity-requests/client.js', '/js/upgrades/quantity-requests/view.js',
  '/2-engr/modules/quantity-requests-v2/index.js', '/1-admin/modules/quantity-allocation-v2/index.js',
  '/js/upgrades/consumables-requests/core.js', '/js/upgrades/consumables-requests/analytics.js',
  '/2-engr/modules/consumables-requests-v2/consumables-requests.js', '/1-admin/modules/consumables-usage-v2/consumables-usage.js'
];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workstream A isolated mount verification</title><link rel="stylesheet" href="/css/global.css"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/js/upgrades/quantity-requests/styles.css"><link rel="stylesheet" href="/js/upgrades/consumables-requests/styles.css"><style>main{padding:24px;max-width:1320px;margin:auto}@media(max-width:480px){main{padding:16px}}</style></head><body><main id="mount"></main>${scripts.map(src => `<script src="${src}"></script>`).join('')}<script>
window.__rpcCalls=[];window.__controller=null;
window.__client={async rpc(name,args={}){__rpcCalls.push({name,args});const result=await fetch('/__rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Actor':__actor},body:JSON.stringify({name,args})}).then(response=>response.json());if(window.__dropResponseOnce===name&&!result.error){window.__dropResponseOnce=null;throw Error('Isolated response lost after database commit. Retry the interrupted action.');}return result;}};
window.__mount=async(mode,actor)=>{__controller?.destroy();__actor=actor;const root=document.getElementById('mount');if(mode==='quantity-engineer'){__controller=MCPAQuantityEngineer.mount({root,supabase:__client});await __controller.ready;}if(mode==='quantity-admin'){__controller=MCPAQuantityAdmin.mount({root,supabase:__client});await __controller.ready;}if(mode==='consumables-engineer')__controller=await MCPAConsumablesRequesterV2.mount({root,client:__client});if(mode==='consumables-admin')__controller=await MCPAConsumablesUsageV2.mount({root,client:__client});return true;};
</script></body></html>`;
let fixture, chrome, socket, server;
const errors = [], calls = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fixture = await require('./database-fixture.cjs').fixture();
  await fixture.seedEquipment({}, 6);
  await fixture.seedEquipment({ model: 'Narrow variant' }, 2);
  await fixture.seedEquipment({ name: 'GI Pipes', tracking_type: 'Bulk', quantity: 225, unit: 'Pieces' }, 1);
  const cement = await fixture.seedConsumable({ p_name: 'Fixture Cement', p_opening: 30, p_minimum: 26 });
  const screws = await fixture.seedConsumable({ p_name: 'Fixture Screws', p_unit: 'pieces', p_opening: 100, p_minimum: 10 });
  await fixture.db.query('update sites set assigned_engineer_id=$1 where id=$2', [fixture.actors.architect.id, fixture.sites.main]);
  server = http.createServer(async (request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    if (request.url === '/__rpc') {
      let raw = ''; for await (const piece of request) raw += piece;
      try {
        const { name, args } = JSON.parse(raw), actor = fixture.actors[request.headers['x-fixture-actor']];
        calls.push({ actor: actor?.role, name, args });
        const sqlArgs = { ...args };
        for (const key of ['p_items', 'p_rows']) if (Array.isArray(sqlArgs[key])) sqlArgs[key] = JSON.stringify(sqlArgs[key]);
        const data = await fixture.wa(actor, name, sqlArgs);
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data, error: null }));
      } catch (error) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: null, error: { code: error.code, message: error.message } })); }
      return;
    }
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', path.extname(file) === '.css' ? 'text/css' : 'text/javascript'); response.end(fs.readFileSync(file));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', ...(process.env.MCPA_CHROME_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox'] : []), '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) { const file = path.join(profile, 'DevToolsActivePort'); if (fs.existsSync(file)) { port = fs.readFileSync(file, 'utf8').split('\n')[0]; break; } await pause(100); }
  assert.ok(port, 'Local Chrome starts');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await once(socket, 'open');
  let next = 0; const pending = new Map();
  socket.addEventListener('message', event => { const value = JSON.parse(event.data); if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails); const item = pending.get(value.id); if (item) { pending.delete(value.id); clearTimeout(item.timer); value.error ? item.reject(Error(value.error.message)) : item.resolve(value.result); } });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const value = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw Error(value.result.description); return value.result.value; };
  const wait = async expression => { for (let attempt = 0; attempt < 160; attempt++) { if (await evaluate(expression)) return; await pause(50); } throw Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText')); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const mount = (mode, actor) => evaluate(`__mount(${JSON.stringify(mode)},${JSON.stringify(actor)})`);
  const viewport = async (width, dark = false) => { await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 }); await evaluate(`document.body.classList.toggle('dark',${dark})`); await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `No page overflow at ${width}px, dark=${dark}`); };
  const withinViewport = selector => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;const rect=element.getBoundingClientRect();return rect.width>0&&rect.left>=0&&rect.right<=innerWidth;})()`);
  const shot = async name => { await evaluate('scrollTo(0,0)'); await pause(100); fs.mkdirSync(screenshots, { recursive: true }); const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); const file = path.join(screenshots, name + '.png'); fs.writeFileSync(file, Buffer.from(data, 'base64')); console.log('SCREENSHOT ' + file); };
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable'); await command('Network.setBlockedURLs', { urls: ['https://*'] });
  await command('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port }); await wait('window.__mount');
  await viewport(1440); await mount('quantity-engineer', 'sky');
  const catalog = await fixture.wa(fixture.actors.sky, 'mcpa_wa_equipment_catalog');
  const group = catalog.groups.find(item => item.name === 'Shovel (Pala, Lapad)' && item.model === '');
  assert.equal(await evaluate("document.querySelectorAll('[name=assetId]').length"), 0, 'Engineer never selects physical IDs');
  assert.ok(await evaluate("[...document.querySelectorAll('[data-q-type]')].find(button=>button.textContent.includes('Unavailable'))?.disabled"), 'Bulk disabled');
  await fill('[data-q-search]', 'Shovel');
  assert.equal(await evaluate("document.querySelectorAll('[data-q-type]').length"), 2, 'Exact model variants stay separate');
  await click(`[data-q-type="${group.type_id}"]`); await fill('[name=quantity]', '2'); await fill('[name=purpose]', 'Foundation works');
  await viewport(393); await shot('quantity-engineer-393-light');
  assert.equal(await withinViewport('[name=quantity]'), true, 'Equipment quantity field fits mobile viewport');
  await viewport(430, true); await shot('quantity-engineer-430-dark');
  await evaluate("document.querySelector('[data-q-form]').requestSubmit()");
  await wait("document.querySelector('[data-q-feedback]').textContent.includes('Quantity request submitted')");
  let requests = await fixture.wa(fixture.actors.sky, 'mcpa_wa_equipment_requests');
  assert.equal(requests.length, 1); const request = requests[0]; assert.equal(request.requested_quantity, 2);
  await click('.wa-q-history summary');
  await evaluate("document.querySelector('.wa-q-history-detail').insertAdjacentHTML('beforeend',MCPAQuantityView.details({id:'untrusted-display-fixture',requested_quantity:1,status:'pending',approved_quantity:0,purpose:'<img src=x onerror=alert(1)>'}))");
  assert.equal(await evaluate("document.querySelectorAll('#mount img').length"), 0, 'History escapes untrusted purpose');
  await viewport(1440); await mount('quantity-admin', 'admin');
  assert.equal(await evaluate("document.querySelectorAll('[name=assetId]:checked').length"), 2);
  await click('[name=assetId]:checked');
  assert.equal(await evaluate("document.querySelector('[data-q-approve]').disabled"), true, 'Exact quantity required');
  await click('[name=assetId]:not(:checked)');
  // Replace one suggested ID with the final eligible ID.
  await click('[name=assetId]:checked');
  await evaluate("document.querySelectorAll('[name=assetId]')[5].click()");
  const selected = await evaluate("[...document.querySelectorAll('[name=assetId]:checked')].map(input=>input.value)");
  assert.equal(selected.length, 2); assert.equal(new Set(selected).size, 2);
  await shot('quantity-admin-1440-light');
  await click('[data-q-approve]'); await wait("document.querySelector('[data-q-feedback]').textContent.includes('individual Asset IDs reserved')");
  requests = await fixture.wa(fixture.actors.sky, 'mcpa_wa_equipment_requests');
  assert.equal(requests[0].status, 'approved'); assert.deepEqual(new Set(requests[0].assets.map(asset => asset.id)), new Set(selected)); assert.ok(requests[0].movement_id);
  const after = (await fixture.wa(fixture.actors.sky, 'mcpa_wa_equipment_catalog')).groups.find(item => item.type_id === group.type_id);
  assert.equal(after.available_quantity, 4); assert.equal(after.reserved_quantity, 2);
  await mount('quantity-engineer', 'sky'); await click(`[data-q-type="${group.type_id}"]`); await evaluate("document.querySelector('[data-q-form]').requestSubmit()");
  await wait("document.querySelector('[data-q-feedback]').textContent.includes('Quantity request submitted')");
  const second = (await fixture.wa(fixture.actors.sky, 'mcpa_wa_equipment_requests')).find(item => item.status === 'pending');
  await mount('quantity-admin', 'admin'); await click(`[data-q-request="${second.id}"]`); await fill('[name=reason]', 'Allocation postponed until project schedule is confirmed.');
  await evaluate("document.querySelector('[data-q-reject-form]').requestSubmit()"); await wait("document.querySelector('[data-q-feedback]').textContent.includes('Request rejected')");
  await mount('quantity-engineer', 'sky'); await fill('[data-q-filter]', 'rejected'); await click('.wa-q-history summary');
  assert.match(await evaluate("document.querySelector('[data-q-history]').textContent"), /Allocation postponed/);
  await mount('quantity-engineer', 'architect'); await click(`[data-q-type="${group.type_id}"]`); await evaluate("document.querySelector('[data-q-form]').requestSubmit()"); await wait("document.querySelector('[data-q-feedback]').textContent.includes('Quantity request submitted')");
  assert.equal((await fixture.wa(fixture.actors.architect, 'mcpa_wa_equipment_requests')).length, 1, 'Architect own history');
  await mount('quantity-admin', 'sky'); assert.equal(await evaluate("document.querySelectorAll('[data-q-allocate-form]').length"), 0, 'Engineer gets no Admin controls');
  console.log('PASS quantity mounts: exact variants, Bulk exclusion, quantity entry, roles, assigned site, history escaping, adjusted physical allocation, stock/reservation changes, rejection, Architect scope');

  await mount('consumables-engineer', 'sky'); await fill('[data-field=site_id]', fixture.sites.casa);
  await fill(`[data-quantity="${cement.id}"]`, '12'); await fill(`[data-quantity="${screws.id}"]`, '20'); await fill('[data-field=purpose]', 'Foundation and formwork materials');
  await viewport(393);
  assert.equal(await withinViewport(`[data-quantity="${cement.id}"]`), true, 'Consumables quantity input fits 393px viewport');
  assert.equal(await withinViewport(`[data-quantity="${screws.id}"]`), true, 'Second consumable quantity input fits viewport');
  await shot('consumables-engineer-393-light');
  await evaluate("__dropResponseOnce='mcpa_wa_submit_consumables';document.querySelector('[data-request-form]').requestSubmit()");
  await wait("document.querySelector('[data-action=recover]') && document.querySelector('.wa-message').textContent.includes('response lost')");
  const submissionOperation = calls.filter(call => call.name === 'mcpa_wa_submit_consumables').at(-1).args.p_operation_id;
  assert.equal((await fixture.wa(fixture.actors.sky, 'mcpa_wa_consumables_snapshot')).requests.length, 1, 'Request committed despite lost response');
  await mount('consumables-engineer', 'sky'); await click('[data-action=recover]');
  await wait("document.querySelector('.wa-details')?.textContent.includes('Pending') && !document.querySelector('[data-action=recover]')");
  assert.equal(calls.filter(call => call.name === 'mcpa_wa_submit_consumables').at(-1).args.p_operation_id, submissionOperation, 'Submission recovered with same operation after remount');
  let consumables = await fixture.wa(fixture.actors.sky, 'mcpa_wa_consumables_snapshot');
  const materials = consumables.requests.find(item => item.purpose === 'Foundation and formwork materials'); assert.equal(materials.items.length, 2);
  assert.equal(await evaluate("document.querySelector('.wa-details').textContent.includes('Awaiting review')"), true);
  await viewport(1440); await mount('consumables-admin', 'admin'); await click(`[data-open="${materials.id}"]`); await click('[data-decision=approve]');
  await wait("document.querySelector('.wa-message').textContent.includes('Request approved') && document.querySelector('[data-decision=issue]')");
  const balances = async () => (await fixture.db.query('select id,current_stock from consumables where id in ($1,$2) order by id', [cement.id, screws.id])).rows;
  let stock = await balances(); assert.equal(Number(stock.find(item => item.id === cement.id).current_stock), 30, 'Approval does not deduct stock');
  const cementLine = materials.items.find(item => item.consumable_id === cement.id), screwsLine = materials.items.find(item => item.consumable_id === screws.id);
  await fill(`[data-line="${cementLine.id}"][data-kind=issue]`, '5'); await evaluate("__dropResponseOnce='mcpa_wa_issue_consumables'"); await click('[data-decision=issue]');
  await wait("document.querySelector('[data-action=recover]') && document.querySelector('.wa-message').textContent.includes('response lost')");
  const issueOperation = calls.filter(call => call.name === 'mcpa_wa_issue_consumables').at(-1).args.p_operation_id;
  stock = await balances(); assert.equal(Number(stock.find(item => item.id === cement.id).current_stock), 25, 'Issuance committed once before response loss');
  await mount('consumables-admin', 'admin'); await click('[data-action=recover]');
  await wait("document.querySelector('.wa-message').textContent.includes('Interrupted action recovered') && !document.querySelector('[data-action=recover]')");
  assert.equal(calls.filter(call => call.name === 'mcpa_wa_issue_consumables').at(-1).args.p_operation_id, issueOperation, 'Issuance recovered with same operation after remount');
  await click(`[data-open="${materials.id}"]`);
  stock = await balances(); assert.equal(Number(stock.find(item => item.id === cement.id).current_stock), 25); assert.equal(Number(stock.find(item => item.id === screws.id).current_stock), 100);
  consumables = await fixture.wa(fixture.actors.admin, 'mcpa_wa_consumables_snapshot');
  const partial = consumables.requests.find(item => item.id === materials.id); assert.ok(['partial', 'partially_fulfilled'].includes(partial.status)); assert.equal(partial.issues.length, 1);
  const report = await evaluate("(async()=>MCPAConsumablesAnalytics.report(await __client.rpc('mcpa_wa_consumables_snapshot',{}).then(result=>result.data),{}))()");
  const cementSummary = report.summary.find(item => item.consumable_id === cement.id); assert.equal(cementSummary.requested, 12); assert.equal(cementSummary.approved, 12); assert.equal(cementSummary.issued, 5);
  assert.equal(report.transactions.length, 1); assert.ok(report.lowStock.some(item => item.id === cement.id));
  assert.match(await evaluate("document.querySelector('.wa-details').textContent"), /Not recorded/);
  await shot('consumables-admin-1440-light'); await viewport(393);
  assert.equal(await withinViewport(`[data-line="${cementLine.id}"][data-kind=issue]`), true, 'Admin issue field fits 393px viewport');
  await viewport(430, true);
  assert.equal(await withinViewport(`[data-line="${screwsLine.id}"][data-kind=issue]`), true, 'Admin issue field fits 430px dark viewport');
  await shot('consumables-admin-430-dark');
  await fill(`[data-line="${cementLine.id}"][data-kind=issue]`, '7'); await fill(`[data-line="${screwsLine.id}"][data-kind=issue]`, '20'); await click('[data-decision=issue]');
  await wait("document.querySelector('.wa-message').textContent.includes('Issuance recorded') && !document.querySelector('[data-decision=issue]')");
  stock = await balances(); assert.equal(Number(stock.find(item => item.id === cement.id).current_stock), 18); assert.equal(Number(stock.find(item => item.id === screws.id).current_stock), 80);
  await mount('consumables-engineer', 'sky'); await click(`[data-open="${materials.id}"]`); assert.match(await evaluate("document.querySelector('.wa-details').textContent"), /Issued/);
  assert.equal((await fixture.wa(fixture.actors.sky, 'mcpa_wa_consumables_snapshot')).requests.find(item => item.id === materials.id).issues.length, 3);
  await viewport(1440); await viewport(393, true);
  console.log('PASS consumables mounts: multi-item submit, committed-response-loss recovery after remount for submit and partial issuance, exact operation replay without duplicate requests/issues/deductions, pending history, Admin approval without stock deduction, partial/full issue, exact stock balances, requested/approved/issued analytics, low stock, unrecorded consumption, mobile quantity/issue controls, responsive light/dark');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  assert.ok(calls.every(call => call.name.startsWith('mcpa_wa_')), 'Only additive Workstream A RPCs used by mounts');
  console.log(`PASS isolated browser harness (${calls.length} real local RPC calls; full application route wiring remains untested)`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); chrome?.kill(); if (server) await new Promise(resolve => server.close(resolve)); if (fixture) await fixture.close();
});
