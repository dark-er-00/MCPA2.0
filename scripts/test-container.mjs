import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Every request runs inside an isolated container. No host .env, live Supabase,
// database, migration, published port or Docker socket is mounted into it.
const root = fileURLToPath(new URL('../', import.meta.url));
const image = 'mcpa-render-local';
const prefix = `mcpa-render-test-${process.pid}-${randomUUID().slice(0, 8)}`;
const publicKey = 'sb_publishable_container_fixture';
const upstream = 'http://127.0.0.1:18082';
const appUrl = 'https://staging-app.example.test/index.html';
const containers = new Set();
let temporary;

function docker(args, {allowFailure = false, ...options} = {}) {
  const result = spawnSync('docker', args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024, ...options,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(result.error?.message || result.stderr?.trim() || `docker ${args[0]} failed (${result.status}).`);
  }
  return result;
}

function php(source, args = []) {
  const result = docker(['exec', prefix, 'php', '-r', source, ...args]);
  return JSON.parse(result.stdout);
}

function request(route, {method = 'GET', headers = {}, body} = {}) {
  return php(String.raw`
    $input = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
    $headers = [];
    foreach ($input['headers'] as $key => $value) $headers[] = $key . ': ' . $value;
    $responseHeaders = [];
    $handle = curl_init('http://127.0.0.1:18081' . $input['route']);
    curl_setopt_array($handle, [
      CURLOPT_CUSTOMREQUEST => $input['method'], CURLOPT_HTTPHEADER => $headers,
      CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 5,
      CURLOPT_FOLLOWLOCATION => false, CURLOPT_NOBODY => $input['method'] === 'HEAD',
      CURLOPT_HEADERFUNCTION => static function ($handle, $line) use (&$responseHeaders) {
        if (str_contains($line, ':')) {
          [$name, $value] = explode(':', $line, 2);
          $responseHeaders[strtolower(trim($name))][] = trim($value);
        }
        return strlen($line);
      },
    ]);
    if (isset($input['body'])) curl_setopt($handle, CURLOPT_POSTFIELDS, $input['body']);
    $body = curl_exec($handle);
    if ($body === false) { fwrite(STDERR, curl_error($handle)); exit(1); }
    echo json_encode(['status' => curl_getinfo($handle, CURLINFO_RESPONSE_CODE),
      'headers' => $responseHeaders, 'body' => base64_encode($body)], JSON_THROW_ON_ERROR);
  `, [JSON.stringify({route, method, headers, body})]);
}

const bytes = response => Buffer.from(response.body, 'base64');
const text = response => bytes(response).toString('utf8');
const header = (response, name) => response.headers[name]?.join(', ') || '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function eventually(check, description) {
  let failure;
  const deadline = Date.now() + 15_000;
  do {
    try { return check(); } catch (error) { failure = error; }
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(`${description}: ${failure?.message || 'timed out'}`);
}

function api(route, options = {}) {
  return request('/api/index.php?route=' + encodeURIComponent(route), {
    ...options,
    headers: {Host: 'staging-app.example.test', Origin: 'https://staging-app.example.test',
      'X-MCPA-Request': '1', ...options.headers},
  });
}

function failsToStart(suffix, env) {
  const name = `${prefix}-${suffix}`;
  containers.add(name);
  const result = docker(['run', '--name', name, '--network', 'none',
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]), image],
  {allowFailure: true, timeout: 15_000});
  assert.ok(!result.error, `${suffix}: startup must terminate promptly (${result.error?.message}).`);
  assert.notEqual(result.status, 0, `${suffix}: invalid configuration was accepted.`);
  const state = JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]).stdout);
  assert.equal(state.Running, false, `${suffix}: failed container must be stopped.`);
  docker(['rm', name]);
  containers.delete(name);
}

try {
  const version = docker(['version', '--format', '{{.Server.Version}}'], {allowFailure: true});
  if (version.error || version.status !== 0 || !version.stdout?.trim()) {
    throw new Error('Docker Engine is unavailable. Install/start Docker Desktop with Linux containers, then rerun npm run test:container. No container checks passed.');
  }
  console.log('Building the Render image; only synthetic fixture credentials are used.');
  docker(['build', '-t', image, '.'], {stdio: 'inherit', timeout: 600_000});
  temporary = mkdtempSync(path.join(tmpdir(), 'mcpa-container-fixture-'));
  writeFileSync(path.join(temporary, 'upstream.php'), String.raw`<?php
    declare(strict_types=1);
    header('Content-Type: application/json');
    $route = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $authorized = ($_SERVER['HTTP_AUTHORIZATION'] ?? '') === 'Bearer container-fixture-user';
    $user = ['id' => '00000000-0000-4000-8000-000000000001', 'email' => 'fixture@example.test'];
    if (($_SERVER['HTTP_APIKEY'] ?? '') !== 'sb_publishable_container_fixture') {
      http_response_code(598); echo '{"error":"Fixture API key mismatch"}';
    } elseif ($route === '/auth/v1/settings') {
      echo '{"disable_signup":true,"fixture":true}';
    } elseif ($route === '/auth/v1/token' && ($input['email'] ?? '') === 'fixture@example.test'
      && ($input['password'] ?? '') === 'fixture-password') {
      echo json_encode(['access_token' => 'container-fixture-user', 'refresh_token' => 'fixture-refresh',
        'token_type' => 'bearer', 'expires_in' => 3600, 'user' => $user]);
    } elseif ($route === '/auth/v1/user' && $authorized) {
      echo json_encode($user);
    } elseif ($route === '/rest/v1/equipment' && $authorized) {
      echo '[{"id":"fixture-only"}]';
    } else {
      http_response_code(598); echo '{"error":"Unexpected fixture request"}';
    }
  `);
  containers.add(prefix);
  docker(['run', '--detach', '--name', prefix, '--network', 'none',
    '--health-interval=1s', '--health-start-period=0s', '--health-retries=3',
    '--env', 'PORT=18081', '--env', `SUPABASE_URL=${upstream}`,
    '--env', `SUPABASE_PUBLISHABLE_KEY=${publicKey}`, '--env', `MCPA_APP_URL=${appUrl}`,
    '--env', 'RENDER=true', '--mount', `type=bind,source=${temporary},target=/fixture,readonly`, image]);
  await eventually(() => assert.equal(request('/healthz').status, 200), 'Apache startup failed');
  docker(['exec', '--detach', prefix, 'php', '-S', '127.0.0.1:18082', '/fixture/upstream.php']);
  await eventually(() => assert.equal(api('/auth/v1/settings').status, 200), 'Local Auth fixture did not start');

  const shell = readFileSync(path.join(root, 'public/index.html'));
  for (const route of ['/', '/index.html', '/index.php']) {
    const response = request(route);
    assert.equal(response.status, 200, route);
    assert.deepEqual(bytes(response), shell, `${route}: frontend shell changed`);
  }
  assert.equal(request('/index.html', {method: 'POST'}).status, 405);
  for (const [asset, type] of [
    ['app/core/paths.js', /javascript/], ['app/features/custody-lifecycle/api.mjs', /javascript/],
    ['assets/styles/global.css', /text\/css/], ['assets/images/favicon.svg', /image\/svg\+xml/],
    ['assets/images/login-slideshow/project-10.jpg', /image\/jpeg/], ['2-engr/index.html', /text\/html/],
  ]) {
    const response = request('/' + asset);
    assert.equal(response.status, 200, asset);
    assert.match(header(response, 'content-type'), type, asset);
    assert.deepEqual(bytes(response), readFileSync(path.join(root, 'public', asset)), asset);
  }
  const publicConfig = request('/app/core/config.js');
  assert.equal(publicConfig.status, 200);
  assert.match(header(publicConfig, 'cache-control'), /no-store/);
  const window = {};
  vm.runInNewContext(text(publicConfig), {window});
  assert.equal(window.MCPA_CONFIG.supabaseUrl, upstream);
  assert.equal(window.MCPA_CONFIG.supabasePublishableKey, publicKey);
  assert.deepEqual(Object.keys(window.MCPA_CONFIG).sort(), ['supabasePublishableKey', 'supabaseUrl']);
  assert.doesNotMatch(text(publicConfig), /sb_secret_|service_role|SUPABASE_SECRET/);
  assert.equal(request('/api/?route=' + encodeURIComponent('/auth/v1/settings'),
    {headers: {Host: 'staging-app.example.test', 'X-MCPA-Request': '1'}}).status, 200);
  console.log('PASS PHP entry routes, unchanged frontend assets, engineer entry and runtime browser configuration.');

  const login = api('/auth/v1/token?grant_type=password', {method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'fixture@example.test', password: 'fixture-password'})});
  assert.equal(login.status, 200, text(login));
  assert.equal(JSON.parse(text(login)).access_token, 'container-fixture-user');
  const cookie = header(login, 'set-cookie');
  for (const pattern of [/MCPA_SESSION=/, /;\s*Secure(?:;|$)/i, /;\s*HttpOnly(?:;|$)/i, /SameSite=Lax/i, /path=\//i]) {
    assert.match(cookie, pattern);
  }
  assert.equal(api('/auth/v1/user', {headers: {Authorization: 'Bearer container-fixture-user'}}).status, 200);
  const authorized = api('/rest/v1/equipment', {headers: {Authorization: 'Bearer container-fixture-user'}});
  assert.equal(authorized.status, 200);
  assert.equal(JSON.parse(text(authorized))[0].id, 'fixture-only');
  for (const token of ['', publicKey, 'sb_secret_rejected_fixture']) {
    assert.equal(api('/rest/v1/equipment', {headers: token ? {Authorization: `Bearer ${token}`} : {}}).status, 401);
  }
  assert.equal(api('/rest/v1/equipment', {headers: {Authorization: 'Bearer container-fixture-user', Origin: 'https://other.example.test'}}).status, 403);
  assert.equal(api('/rest/v1/equipment', {headers: {'X-MCPA-Request': '0'}}).status, 403);
  assert.equal(api('/auth/v1/admin/users').status, 404);
  assert.equal(api('/rest/v1/equipment', {headers: {Host: 'other.example.test'}}).status, 403);
  console.log('PASS synthetic authentication, Secure/HttpOnly/SameSite cookies, bearer forwarding and existing permission/origin rejection.');

  const health = request('/healthz');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(text(health)).status, 'ok');
  assert.ok(!text(health).includes(publicKey) && !text(health).includes(upstream));
  await eventually(() => {
    const state = JSON.parse(docker(['inspect', '--format', '{{json .State.Health}}', prefix]).stdout);
    assert.equal(state.Status, 'healthy');
  }, 'Docker HEALTHCHECK did not become healthy');
  for (const route of ['/.env', '/.git/config', '/server/Config.php', '/supabase/config.toml',
    '/tests/auth-test-db.cjs', '/package.json', '/Dockerfile', '/api/.htaccess', '/assets/images/']) {
    assert.ok([403, 404].includes(request(route).status), `${route}: private path or listing exposed`);
  }
  const runtime = php(String.raw`
    $extensions = [];
    foreach (['curl','mbstring','json','fileinfo','session','openssl'] as $name) $extensions[$name] = extension_loaded($name);
    $absent = [];
    foreach (['.env','.env.example','.git','.codex','.agents','node_modules','supabase','tests','scripts','docs','public/app/core/config.js'] as $name)
      $absent[$name] = !file_exists('/var/www/html/' . $name);
    $listening = preg_match('/\b00000000:46A1\s+00000000:0000\s+0A\b/', file_get_contents('/proc/net/tcp')) === 1;
    echo json_encode(['extensions'=>$extensions, 'absent'=>$absent, 'listening'=>$listening,
      'upload'=>ini_get('upload_max_filesize'), 'post'=>ini_get('post_max_size'),
      'display_errors'=>ini_get('display_errors'), 'log_errors'=>ini_get('log_errors'),
      'curl_ca'=>is_readable(ini_get('curl.cainfo')), 'openssl_ca'=>is_readable(ini_get('openssl.cafile'))], JSON_THROW_ON_ERROR);
  `);
  for (const [name, loaded] of Object.entries(runtime.extensions)) assert.equal(loaded, true, `${name} extension`);
  for (const [name, absent] of Object.entries(runtime.absent)) assert.equal(absent, true, `${name} entered the image`);
  assert.equal(runtime.listening, true, 'HTTP must bind to 0.0.0.0:$PORT (18081), not a fixed/default port');
  assert.equal(runtime.upload, '10M');
  assert.equal(runtime.post, '16M');
  assert.ok(['', '0', 'Off'].includes(runtime.display_errors));
  assert.ok(['1', 'On'].includes(runtime.log_errors));
  assert.equal(runtime.curl_ca, true);
  assert.equal(runtime.openssl_ca, true);
  console.log('PASS HTTP/Docker health, private path denial, required extensions, CA configuration, upload limits, image exclusions and 0.0.0.0:$PORT binding.');

  const fixtureEnv = {PORT: '18081', SUPABASE_URL: upstream, SUPABASE_PUBLISHABLE_KEY: publicKey, RENDER: 'true'};
  failsToStart('missing-url', {...fixtureEnv, SUPABASE_URL: ''});
  failsToStart('missing-key', {...fixtureEnv, SUPABASE_PUBLISHABLE_KEY: ''});
  failsToStart('invalid-port', {...fixtureEnv, PORT: 'not-a-port'});
  failsToStart('out-of-range-port', {...fixtureEnv, PORT: '65536'});
  console.log('PASS startup rejects missing configuration and invalid PORT values.');
  console.log('Container validation passed using local synthetic fixtures only. No Supabase connection or database operation occurred.');
} catch (error) {
  console.error(`Container validation failed: ${error.message}`);
  if (containers.has(prefix)) {
    const logs = docker(['logs', '--tail', '40', prefix], {allowFailure: true});
    if (logs.stdout?.trim()) console.error(logs.stdout.trim());
    if (logs.stderr?.trim()) console.error(logs.stderr.trim());
  }
  process.exitCode = 1;
} finally {
  for (const name of containers) docker(['rm', '--force', name], {allowFailure: true});
  if (temporary) {
    const resolved = path.resolve(temporary);
    assert.ok(path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('mcpa-container-fixture-'));
    rmSync(resolved, {recursive: true, force: true});
  }
}
