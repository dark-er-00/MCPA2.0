import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {once} from 'node:events';
import {spawn, spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const php = process.env.PHP_BINARY || 'php';
const temporary = mkdtempSync(path.join(tmpdir(), 'mcpa-connection-'));
const publicKey = 'sb_publishable_connection_fixture';
const serverKey = 'sb_secret_connection_fixture';
let upstream, port;

async function consoleCommand(args, env = {}) {
  const child = spawn(php, args, {cwd:root, windowsHide:true, env:{...process.env,
    SUPABASE_URL:`https://127.0.0.1:${port}`, SUPABASE_PUBLISHABLE_KEY:publicKey,
    MCPA_SUPABASE_SECRET_KEY:serverKey, MCPA_APP_URL:'', ...env,
  }, stdio:['ignore','pipe','pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const [code] = await once(child, 'exit');
  assert.ok(!stdout.includes(publicKey) && !stdout.includes(serverKey));
  assert.ok(!stderr.includes(publicKey) && !stderr.includes(serverKey));
  return {code, stdout, stderr};
}

before(async () => {
  const config = path.join(temporary, 'openssl.cnf');
  writeFileSync(config, '[req]\ndistinguished_name=dn\nx509_extensions=server\n[dn]\n[server]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
  const generated = spawnSync(php, ['-r', `
    $options=['config'=>$argv[1],'private_key_bits'=>2048,'digest_alg'=>'sha256'];
    $key=openssl_pkey_new($options);
    $csr=openssl_csr_new(['commonName'=>'127.0.0.1'],$key,$options);
    $cert=openssl_csr_sign($csr,null,$key,1,$options);
    if (!$cert || !openssl_pkey_export($key,$private,null,$options) || !openssl_x509_export($cert,$public)) exit(1);
    echo json_encode(['key'=>$private,'cert'=>$public],JSON_THROW_ON_ERROR);
  `, config], {encoding:'utf8', windowsHide:true});
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const credentials = JSON.parse(generated.stdout);
  writeFileSync(path.join(temporary, 'ca.pem'), credentials.cert);
  upstream = createServer(credentials, (request, response) => {
    assert.equal(request.url, '/auth/v1/settings');
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.apikey, publicKey);
    assert.equal(request.headers.authorization, undefined);
    response.writeHead(200, {'content-type':'application/json'}).end('{"disable_signup":true}');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  port = upstream.address().port;
});

after(async () => {
  if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
  const resolved = path.resolve(temporary);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('mcpa-connection-'));
  rmSync(resolved, {recursive:true, force:true});
});

const caArguments = () => { const ca = path.join(temporary,'ca.pem').split(path.sep).join('/'); return ['-d', 'curl.cainfo=' + ca, '-d', 'openssl.cafile=' + ca]; };

test('PHP diagnostics connect over verified HTTPS with an explicitly trusted local CA', async () => {
  const result = await consoleCommand([...caArguments(), 'server/console.php', 'doctor']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Supabase Auth connection succeeded/);
  assert.equal(result.stderr, '');
});

test('the PHP client continues to reject an untrusted HTTPS certificate with a useful diagnostic', async () => {
  const result = await consoleCommand(['-d','curl.cainfo=','-d','openssl.cafile=', 'server/console.php','doctor']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /certificate configuration/);
  assert.match(result.stderr, /cURL error 60/);
  assert.doesNotMatch(result.stdout, /connection succeeded/);
});

test('trusting a CA does not disable HTTPS hostname verification', async () => {
  const result = await consoleCommand([...caArguments(), 'server/console.php','doctor'], {SUPABASE_URL:`https://localhost:${port}`});
  assert.equal(result.code, 1);
  assert.match(result.stderr, /certificate configuration/);
  assert.doesNotMatch(result.stdout, /connection succeeded/);
});

test('startup preflight checks configuration without requiring a reachable data service', async () => {
  const result = await consoleCommand(['server/console.php','preflight'], {SUPABASE_URL:'https://127.0.0.1:1'});
  assert.equal(result.code, 0, result.stderr);
  const invalid = await consoleCommand(['server/console.php','preflight'], {SUPABASE_PUBLISHABLE_KEY:''});
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /SUPABASE_PUBLISHABLE_KEY/);
});

test('static preview responses become actionable JSON errors without bypassing PHP', async () => {
  const source = readFileSync(path.join(root,'public/app/core/server-api.js'),'utf8');
  for (const [status, type, marker, expected] of [
    [200,'text/html',null,'MCPA_HOSTING'], [404,'text/plain',null,'MCPA_HOSTING'],
    [200,'application/x-httpd-php',null,'MCPA_HOSTING'], [200,'application/x-php',null,'MCPA_HOSTING'],
    [405,'text/plain',null,'MCPA_HOSTING'], [404,'application/json','php','original'],
    [503,'application/json','php','original'],
  ]) {
    let calls = 0;
    const window = {MCPAPaths:{url:relative=>new URL(relative,'https://app.example/MCPA/')},
      MCPA_CONFIG:{supabaseUrl:'https://data.example'}, fetch:async (url) => {
        calls++;
        assert.equal(new URL(url).origin, 'https://app.example');
        return new Response('{"code":"original"}', {status, headers:{'content-type':type,...(marker?{'x-mcpa-backend':marker}:{})}});
      }};
    vm.runInNewContext(source, {window, URL, Request, Response, Headers, FormData});
    const response = await window.MCPAServer.fetch('https://data.example/auth/v1/token?grant_type=password',
      {method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const body = await response.json();
    assert.equal(body.code, expected);
    if (expected === 'MCPA_HOSTING') {
      assert.equal(response.status, 500);
      assert.equal(body.error_code, expected, 'Supabase Auth recognizes legacy JSON error codes');
      assert.match(body.message, /npm start/);
    } else assert.equal(response.status, status);
    assert.equal(calls, 1, 'The transport does not fall back to direct database access');
  }
});
