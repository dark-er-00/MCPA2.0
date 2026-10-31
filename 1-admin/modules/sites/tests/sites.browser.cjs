// Dependency-free browser regression check. Node 22+ and Chrome/Edge are required.
// Runs against a local mock database; never calls or changes the Supabase project.
// Usage: node modules/sites/tests/sites.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const workspace = path.resolve(__dirname, '../../..');
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to a Chrome or Edge executable.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-sites-test-'));
const calls = [];
let failure = null;
let delay = 0;
let apiPageLimit = 500;
let serial = 0;
const site = (id, name) => ({ id, name, location: 'Batangas', assigned_engineer: 'Eng. Mark Reyes', phase: 'Structural Phase', status: 'active', progress: 62, last_inventory_check: '2026-08-25', updated_at: '2026-09-01T00:00:00Z' });
const db = {
  sites: [site('casa', 'Casa Buena'), site('empty', 'Empty Site')],
  profiles: [{ id: 'holder-a', name: 'Team A' }],
  equipment: [
    { id: 'one', asset_id: 'GRD-002', name: 'Grinder', site_id: 'casa', quantity: 1, status: 'AVAILABLE', brand: 'Bosch', tracking_type: 'Individual' },
    { id: 'two', asset_id: 'SCF-010', name: 'Scaffolding Set', site_id: 'casa', quantity: 5, status: 'IN_USE', current_holder_id: 'holder-a', unit: 'Sets' },
    { id: 'three', asset_id: 'CMP-001', name: 'Compressor', site_id: 'casa', quantity: 2, status: 'UNDER_REPAIR' },
    { id: 'zero', asset_id: 'ZERO-1', name: 'Zero stock', site_id: 'casa', quantity: 0, status: 'AVAILABLE' },
    { id: 'unassigned', asset_id: 'U-1', name: 'Unassigned', site_id: null, quantity: 99, status: 'AVAILABLE' }
  ]
};
const sdk = `window.supabase = { createClient() { return { from(table) {
  const query = { table, method: 'read', filters: [] };
  const builder = {
    select(columns, options) { query.columns = columns; query.count = options?.count; return this; },
    order(column) { query.order = column; return this; },
    range(from, to) { query.range = [from, to]; return this; },
    limit(value) { query.limit = value; return this; },
    eq(column, value) { query.filters.push([column, value]); return this; },
    insert(values) { query.method = 'insert'; query.values = values; return this; },
    update(values) { query.method = 'update'; query.values = values; return this; },
    delete() { query.method = 'delete'; return this; },
    then(resolve, reject) { return fetch('/__db', {method: 'POST', body: JSON.stringify(query)}).then(r => r.json()).then(resolve, reject); }
  }; return builder;
} }; } };`;

const server = http.createServer(async (request, response) => {
  if (request.url === '/__db') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const query = JSON.parse(body);
    calls.push(query);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    let data = null;
    let count = null;
    let error = failure;
    if (!error) {
      let rows = (db[query.table] || []).filter(row => query.filters.every(([key, value]) => row[key] === value));
      if (query.method === 'read') {
        rows = [...rows].sort((a, b) => String(a[query.order]).localeCompare(String(b[query.order])));
        if (query.count === 'exact') count = rows.length;
        if (query.range) rows = rows.slice(query.range[0], Math.min(query.range[1] + 1, query.range[0] + apiPageLimit));
        if (query.limit) rows = rows.slice(0, query.limit);
        data = rows;
      } else if (query.method === 'insert') {
        const row = { ...query.values, id: 'new-' + ++serial, updated_at: new Date().toISOString() };
        db[query.table].push(row); data = [row];
      } else if (query.method === 'update') {
        rows.forEach(row => Object.assign(row, query.values, { updated_at: new Date().toISOString() })); data = rows;
      } else if (query.method === 'delete') {
        if (rows.some(row => db.equipment.some(item => item.site_id === row.id))) error = { code: '23503' };
        else { db[query.table] = db[query.table].filter(row => !rows.includes(row)); data = rows; }
      }
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data, count, error }));
    return;
  }
  if (request.url === '/__sdk.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(sdk); return;
  }
  const file = path.resolve(workspace, '.' + new URL(request.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html'));
  if (!file.startsWith(workspace + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
  let content = fs.readFileSync(file);
  if (file.endsWith('index.html')) {
    content = content.toString().replace(/<script src="https:[^"]+"><\/script>/g, '').replace('</head>', '<script src="/__sdk.js"></script></head>');
  }
  response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'text/plain' });
  response.end(content);
});

let chrome;
let socket;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
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
  delay = 250;
  await evaluate("showScreen('sites')");
  await waitFor("document.querySelector('#sites-list[aria-busy=true]')");
  await check('Add Site waits for initial data to prevent refresh overwriting a new site', "document.querySelector('[data-action=add-site]').disabled");
  await waitFor("document.querySelectorAll('#sites-list .site-card').length === 2");
  delay = 0;
  await check('Counts use assigned quantity, including bulk and repair statuses', "document.querySelector('[data-id=casa] .site-stat-row').innerText.replace(/\\s+/g,' ').trim() === '8 TOTAL 1 AVAIL. 5 IN USE 2 REPAIR'");
  await screenshot('sites-desktop');
  await click('[data-id=casa]');
  await check('Correct site details and hidden zero quantities', "document.querySelector('#site-heading').textContent === 'Casa Buena' && document.querySelectorAll('#site-detail-content tbody tr').length === 3");
  await check('Holder names are resolved from profiles', "document.querySelector('#site-detail-content tbody').textContent.includes('Team A') && !document.querySelector('#site-detail-content tbody').textContent.includes('holder-a')");
  await click('[data-action=review-tools]');
  await check('Review includes zero-quantity records', "document.querySelectorAll('#sites-review-results tbody tr').length === 4");
  await fill('#sites-tool-search', 'SCF-010');
  await check('Search filters by asset ID', "document.querySelectorAll('#sites-review-results [data-action=view-tool]').length === 1");
  await click('#sites-review-results [data-action=view-tool]');
  await waitFor("document.querySelector('#sites-dialog-title').textContent === 'Scaffolding Set'");
  await check('Equipment detail shows correct record and read-only movement', "document.querySelector('#sites-dialog-content').textContent.includes('SCF-010') && !document.querySelector('#sites-dialog input') && document.querySelector('#sites-dialog-content').textContent.includes('No movement records available')");
  await click('#sites-dialog [data-action=review-tools]');
  await check('Returning from equipment details retains the search', "document.querySelector('#sites-tool-search').value === 'SCF-010' && document.querySelectorAll('#sites-review-results [data-action=view-tool]').length === 1");
  await fill('#sites-tool-search', '');
  await fill('#sites-tool-status', 'underrepair');
  await check('Status filtering handles UNDER_REPAIR', "document.querySelector('#sites-review-results').textContent.includes('CMP-001') && document.querySelectorAll('#sites-review-results [data-action=view-tool]').length === 1");
  await fill('#sites-tool-search', 'no match');
  await check('Filtered empty state', "document.querySelector('#sites-review-results').textContent.includes('No equipment matches')");
  await click('#sites-dialog [data-action=close-dialog]');
  await click('#site-detail-content [data-action=view-tool]');
  await waitFor("document.querySelector('#sites-dialog').open");
  await check('Direct equipment view does not inherit a closed review dialog', "!document.querySelector('#sites-dialog [data-action=review-tools]')");
  await click('#sites-dialog [data-action=close-dialog]');
  await click('[data-action=delete-site]');
  await check('Linked equipment blocks site deletion', "!document.querySelector('[data-action=confirm-delete]') && document.querySelector('#sites-dialog-content').textContent.includes('4 linked equipment')");
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await check('Escape closes dialog', "!document.querySelector('#sites-dialog').open");
  await click('[data-action=edit-site]');
  await fill('#site-name', '  EMPTY   SITE  ');
  await click('#sites-form [type=submit]');
  await check('Duplicate normalized names are rejected', "document.querySelector('#sites-form-error').textContent.includes('already exists')");
  await fill('#site-name', '   ');
  await click('#sites-form [type=submit]');
  await check('Whitespace-only names are rejected', "document.querySelector('#sites-form-error').textContent.includes('Blank spaces')");
  await fill('#site-name', 'Casa Renamed');
  await fill('#site-progress', '101');
  await click('#sites-form [type=submit]');
  await check('Out-of-range completion is rejected', "document.querySelector('#site-progress').validity.rangeOverflow && document.querySelector('#sites-dialog').open");
  await fill('#site-progress', '62');
  await fill('#site-check', '2999-01-01');
  await click('#sites-form [type=submit]');
  await check('Future inventory date is rejected', "document.querySelector('#site-check').validity.rangeOverflow && document.querySelector('#sites-dialog').open");
  await fill('#site-check', '2026-08-25');
  failure = { code: '42501' };
  await click('#sites-form [type=submit]');
  await waitFor("document.querySelector('#sites-form-error').textContent.includes('Sites access update')");
  await check('Failed save keeps form and values', "document.querySelector('#sites-dialog').open && document.querySelector('#site-name').value === 'Casa Renamed'");
  failure = null;
  delay = 200;
  const writes = calls.filter(call => call.method === 'update').length;
  await evaluate("document.querySelector('#sites-form').requestSubmit(); document.querySelector('#sites-form').requestSubmit()");
  await waitFor("!document.querySelector('#sites-dialog').open"); delay = 0;
  assert.equal(calls.filter(call => call.method === 'update').length, writes + 1, 'Double submit must write once');
  await check('Rename retains equipment through site ID', "document.querySelector('#site-heading').textContent === 'Casa Renamed' && document.querySelectorAll('#site-detail-content tbody tr').length === 3");
  await click('[data-action=edit-site]');
  db.sites.find(item => item.id === 'casa').updated_at = '2026-09-02T00:00:00Z';
  await click('#sites-form [type=submit]');
  await waitFor("document.querySelector('#sites-form-error').textContent.includes('changed')");
  await click('#sites-dialog [data-action=close-dialog]');
  await click('[data-action=all-sites]');
  await click('[data-action=add-site]');
  const dangerousName = '<img src=x onerror=alert(1)> Test';
  await fill('#site-name', dangerousName);
  await fill('#site-location', 'Test location');
  await fill('#site-engineer', 'Test Engineer');
  await click('#sites-form [type=submit]');
  await waitFor("!document.querySelector('#sites-dialog').open");
  await check('User content is escaped', "!document.querySelector('#sites-list img') && document.querySelector('#sites-list').textContent.includes('<img src=x')");
  await command('Page.reload');
  await waitFor("document.querySelector('#login-screen') && typeof enterApp === 'function'");
  await evaluate('enterApp()'); await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('sites')"); await waitFor("document.querySelectorAll('#sites-list .site-card').length === 3");
  await check('Saved site survives page reload', "document.querySelector('#sites-list').textContent.includes('<img src=x')");
  await click('[data-id=new-1]'); await click('[data-action=delete-site]');
  await click('#sites-dialog [data-action=close-dialog]');
  assert.equal(db.sites.length, 3, 'Cancel must retain site');
  await click('[data-action=delete-site]'); await click('[data-action=confirm-delete]');
  await waitFor("document.querySelectorAll('#sites-list .site-card').length === 2");
  assert.equal(db.sites.length, 2);
  console.log('PASS Create, reload, cancel, and delete');
  await click('[data-id=empty]');
  await check('Empty site inventory', "document.querySelector('#site-detail-content').textContent.includes('No equipment is currently assigned')");
  await click('[data-action=delete-site]');
  db.equipment.push({ id: 'late-assignment', site_id: 'empty', quantity: 0, status: 'AVAILABLE' });
  await click('[data-action=confirm-delete]');
  await waitFor("document.querySelector('#sites-form-error').textContent.includes('linked equipment')");
  assert.ok(db.sites.some(record => record.id === 'empty'));
  console.log('PASS Delete rechecks equipment assigned after the dialog was opened');
  db.equipment = db.equipment.filter(record => record.id !== 'late-assignment');
  await click('#sites-dialog [data-action=close-dialog]');
  await click('[data-action=view-movements]');
  await check('Movement has no mutation controls', "document.querySelector('#sites-dialog-content').textContent.includes('read-only') && !document.querySelector('#sites-dialog-content input, #sites-dialog-content select')");
  await click('#sites-dialog [data-action=close-dialog]');
  await evaluate("showScreen('dashboard')"); await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('site-detail')"); await waitFor("document.querySelector('#site-heading')");
  await check('Direct dashboard link and repeated module loading', "document.querySelector('#screen-site-detail.active') && document.querySelectorAll('#sites-module').length === 1");
  await evaluate('toggleTheme()');
  await click('[data-action=edit-site]');
  await screenshot('sites-dark-dialog');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('sites-mobile-dialog');
  await check('Mobile dialog stays in viewport', "document.querySelector('#sites-dialog').getBoundingClientRect().right <= innerWidth && document.querySelector('#sites-dialog').getBoundingClientRect().left >= 0");
  await click('#sites-dialog [data-action=close-dialog]');
  await click('[data-action=all-sites]');
  await screenshot('sites-mobile');
  await check('Mobile page has no horizontal overflow', 'document.documentElement.scrollWidth <= innerWidth');
  // Verify pagination beyond the API page size and zero quantity retained in deletion checks.
  for (let i = 0; i < 505; i++) db.equipment.push({ id: 'page-' + i, site_id: 'empty', name: 'Paged equipment', quantity: 1, status: 'AVAILABLE' });
  apiPageLimit = 200;
  await click('[data-action=refresh]');
  await waitFor("document.querySelector('[data-id=empty] .site-stat .n').textContent === '505'");
  console.log('PASS Inventory pagination also handles a server limit smaller than the requested page');
  failure = { code: 'PGRST205' };
  await evaluate("showScreen('dashboard')"); await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('sites')"); await waitFor("document.querySelector('#sites-list')?.textContent.includes('Unable to load')");
  await check('Database setup errors are actionable', "document.querySelector('#sites-feedback').textContent.includes('not set up')");
  failure = null;
  await click('#sites-list [data-action=refresh]');
  await waitFor("document.querySelectorAll('#sites-list .site-card').length === 2");
  console.log('PASS Retry recovers after a database error');
  await click('[data-id=empty]');
  db.sites = db.sites.filter(record => record.id !== 'empty');
  await click('#site-detail-content [data-action=refresh]');
  await waitFor("document.querySelector('#screen-sites.active') && document.querySelectorAll('#sites-list .site-card').length === 1");
  await check('Refreshing a deleted site returns to the list instead of showing another site', "document.querySelector('#sites-feedback').textContent.includes('no longer available')");
  db.sites = [];
  await click('#screen-sites [data-action=refresh]');
  await waitFor("document.querySelector('#sites-list').textContent.includes('No sites yet')");
  await click('#sites-list [data-action=add-site]');
  await fill('#site-name', 'Fresh Site');
  await fill('#site-location', 'Batangas');
  await fill('#site-engineer', 'Eng. Test');
  await click('#sites-form [type=submit]');
  await waitFor("!document.querySelector('#sites-dialog').open");
  await check('Add Site works from an empty database', "document.querySelectorAll('#sites-list .site-card').length === 1 && document.querySelector('#sites-list').textContent.includes('Fresh Site')");
  assert.equal(calls.filter(call => call.table !== 'sites' && call.method !== 'read').length, 0, 'Equipment and movement must never be mutated');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS All Sites regression checks; no live database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close();
  chrome?.kill();
  server.closeAllConnections();
  server.close();
  console.log('Temporary browser profile and screenshots: ' + profile);
});
