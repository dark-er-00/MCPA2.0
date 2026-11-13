import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// No database, migrations or live Supabase: every upstream is a loopback fixture.
const root = fileURLToPath(new URL('../', import.meta.url));
const key = 'sb_publishable_render_runtime_fixture';
const secret = 'sb_secret_render_runtime_fixture';
let upstream, base, upstreamUrl, hits = 0;
const children = [];

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function start(overrides = {}) {
  const reservation = createServer();
  const url = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.env.PHP_BINARY || 'php', [
    '-d', 'display_errors=0', '-d', 'log_errors=1',
    '-S', `127.0.0.1:${new URL(url).port}`, '-t', 'public', 'server/router.php',
  ], {cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: {...process.env,
    SUPABASE_URL: upstreamUrl, SUPABASE_PUBLISHABLE_KEY: key,
    MCPA_SUPABASE_SECRET_KEY: secret, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
    MCPA_ENABLE_DEVELOPMENT_ACCOUNTS: 'false', MCPA_APP_URL: url + '/index.html', ...overrides,
  }});
  children.push(child);
  let errors = '', failure;
  child.stderr.on('data', chunk => { errors += chunk; });
  child.on('error', error => { failure = error; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (failure) throw failure;
    if (child.exitCode !== null) throw Error(errors);
    try { if ((await fetch(url)).status === 200) return url; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('PHP startup timed out. ' + errors);
}

before(async () => {
  upstream = createServer(async (request, response) => {
    hits++;
    assert.equal(request.headers.apikey, key);
    const route = new URL(request.url, 'http://fixture').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (route === '/auth/v1/settings') return response.end('{"disable_signup":true}');
    if (route === '/auth/v1/token') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.email, 'fixture@example.test');
      assert.equal(body.password, 'fixture-password');
      return response.end(JSON.stringify({access_token: 'fixture-user', refresh_token: 'fixture-refresh',
        user: {id: '00000000-0000-4000-8000-000000000001'}}));
    }
    assert.equal(route, '/rest/v1/equipment');
    assert.equal(request.headers.authorization, 'Bearer fixture-user');
    response.end('[{"id":"fixture-only"}]');
  });
  upstreamUrl = await listen(upstream);
  base = await start();
});

after(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.pid) { child.kill(); await once(child, 'exit'); }
  }
  if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});

function api(route, {headers, ...options} = {}) {
  return fetch(base + '/api/index.php?route=' + encodeURIComponent(route), {
    ...options, headers: {'X-MCPA-Request': '1', Origin: base, ...headers},
  });
}

test('health validates PHP and configuration without reaching Supabase or exposing values', async () => {
  const before = hits;
  for (const route of ['/healthz', '/healthz.php']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), {status: 'ok'});
  }
  const head = await fetch(base + '/healthz', {method: 'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base + '/healthz', {method: 'POST'})).status, 405);
  assert.equal(hits, before);
  const invalid = await start({SUPABASE_PUBLISHABLE_KEY: ''});
  const failure = await fetch(invalid + '/healthz');
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), {status: 'unavailable'});
  assert.equal((await fetch(invalid + '/app/core/config.js')).status, 503);
  assert.equal(hits, before);
});

test('PHP entry points, frontend bytes, modules and runtime configuration are preserved', async () => {
  const shell = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const route of ['/', '/index.html', '/index.php']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), shell);
  }
  for (const asset of ['app/core/paths.js', 'app/features/custody-lifecycle/api.mjs', '2-engr/index.html']) {
    const response = await fetch(base + '/' + asset);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), readFileSync(new URL('../public/' + asset, import.meta.url), 'utf8'));
    if (asset.endsWith('.mjs')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  const config = await (await fetch(base + '/app/core/config.js')).text();
  const window = {};
  vm.runInNewContext(config, {window});
  assert.equal(window.MCPA_CONFIG.supabaseUrl, upstreamUrl);
  assert.equal(window.MCPA_CONFIG.supabasePublishableKey, key);
  assert.ok(!config.includes(secret));
});

test('synthetic authentication, token forwarding and permission/origin guards remain active', async () => {
  const login = await api('/auth/v1/token?grant_type=password', {method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'fixture@example.test', password: 'fixture-password'})});
  assert.equal(login.status, 200);
  assert.equal((await login.json()).access_token, 'fixture-user');
  assert.match(login.headers.get('set-cookie'), /MCPA_SESSION=.*HttpOnly.*SameSite=Lax/i);
  const data = await api('/rest/v1/equipment', {headers: {Authorization: 'Bearer fixture-user'}});
  assert.equal(data.status, 200);
  assert.deepEqual(await data.json(), [{id: 'fixture-only'}]);
  const before = hits;
  for (const token of ['', key, secret]) {
    assert.equal((await api('/rest/v1/equipment', {headers: token ? {Authorization: 'Bearer ' + token} : {}})).status, 401);
  }
  assert.equal((await api('/auth/v1/settings', {headers: {Origin: 'https://other.example.test'}})).status, 403);
  assert.equal((await api('/auth/v1/settings', {headers: {'X-MCPA-Request': '0'}})).status, 403);
  assert.equal((await api('/auth/v1/admin/users')).status, 404);
  assert.equal(hits, before, 'Rejected requests never reached the upstream fixture.');
  for (const route of ['/.env', '/.git/config', '/server/Config.php', '/supabase/config.toml', '/tests/auth-test-db.cjs']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});
