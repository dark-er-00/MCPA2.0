// Opt-in live login/read-only UI verification. Does not load .env or any server key.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), { spawn } = require('node:child_process'), { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-live-login-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, socket, runtimeErrors = 0;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname.slice(1) || 'index.html';
  // Expose application assets only; never serve .env, scripts, Git or dependencies.
  if (!/^(index\.html|(?:js|css|1-admin|2-engr|modules)\/[\w./-]+\.(?:html|js|css|png|svg|webp|jpg|woff2))$/.test(relative) || relative.split('/').some(part => part.startsWith('.'))) {
    res.writeHead(404); res.end(); return;
  }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async () => {
  const { accounts } = await import('./seed-test-users.mjs');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    const file = path.join(profileDir, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = fs.readFileSync(file, 'utf8').split('\n')[0]; break; }
    await pause(100);
  }
  if (!port) throw new Error('Chrome startup failed');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let next = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors++;
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); callback(message); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 15000);
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error('Browser command failed')) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(200); }
    throw new Error(label + ' timed out');
  };
  await command('Runtime.enable'); await command('Page.enable');
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  await command('Page.navigate', { url });
  for (const account of accounts) {
    await wait("document.querySelector('#auth-email')", 'Login form');
    await evaluate(`(()=>{document.querySelector('#auth-email').value=${JSON.stringify(account.email)};document.querySelector('#auth-password').value=${JSON.stringify(account.password)};document.querySelector('#auth-form').requestSubmit();})()`);
    const role = JSON.stringify(account.role);
    const ready = `window.MCPAAuth?.profile?.role===${role} && !MCPAAuth.isDemo && !document.querySelector('#app-shell').classList.contains('hidden')`;
    await wait(ready, account.role + ' live login');
    const dashboard = account.role === 'admin' ? "document.querySelector('.admin-review')" : "document.querySelector('.dashboard-toolbar .overview-actions')";
    await wait(dashboard, account.role + ' dashboard');
    const hasSession = await evaluate('(async()=>{const r=await EquipmentTracking.client().auth.getSession();return !r.error&&!!r.data.session;})()');
    if (!hasSession) throw new Error(account.role + ' session missing');
    await command('Page.reload'); await wait(ready, account.role + ' refresh persistence'); await wait(dashboard, account.role + ' refreshed dashboard');
    if (account.role === 'engineer') {
      await evaluate("showScreen('users')"); await wait("document.querySelector('#content').textContent.includes('Access restricted')", 'Engineer route guard');
    } else if (await evaluate("!!document.querySelector('.dashboard-toolbar .overview-actions')")) throw new Error('Admin has borrower quick actions');
    await evaluate('MCPAAuth.logout()');
    await wait("document.querySelector('#auth-email') && document.querySelector('#app-shell').classList.contains('hidden')", 'Logout');
    if (!await evaluate('(async()=>{const r=await EquipmentTracking.client().auth.getSession();return !r.error&&!r.data.session;})()')) throw new Error('Logout retained session');
    await command('Page.reload'); await wait("document.querySelector('#auth-email') && document.querySelector('#app-shell').classList.contains('hidden')", 'Signed-out refresh');
    console.log(`PASS ${account.role}: real login form, session, dashboard, refresh, role UI and logout`);
  }
  if (runtimeErrors) throw new Error('Browser runtime errors detected');
  console.log('PASS no uncaught JavaScript errors. Live business records were not modified.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  // Attempt logout even on a failed assertion without printing session data.
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: 'Runtime.evaluate', params: { expression: "window.EquipmentTracking?.client().auth.signOut({scope:'local'})", awaitPromise: true } }));
    await pause(1000); socket.close();
  }
  if (chrome && chrome.exitCode === null) { const closed = once(chrome, 'exit'); chrome.kill(); await Promise.race([closed, pause(5000)]); }
  server.close();
  // This exact directory was created above under the system temp directory.
  if (path.dirname(profileDir) === os.tmpdir() && path.basename(profileDir).startsWith('mcpa-live-login-')) {
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { console.error('Temporary Chrome profile cleanup failed.'); }
  }
});
