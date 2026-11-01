import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'mcpa-php-'));
const publishable = 'sb_publishable_local_fixture_only';
const secret = 'sb_secret_local_fixture_only';
const requests = [];
let database, upstream, php, base, upstreamUrl, failFinish = false, failAuth = false, stderr = '';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
function reply(response, body, status = 200, headers = {}) {
  response.writeHead(status, {'content-type':'application/json', ...headers});
  response.end(JSON.stringify(body));
}
async function request(route, {method = 'POST', actor = 'admin', body = {}, headers = {}, raw = false} = {}) {
  const defaults = {'x-mcpa-request':'1', ...(actor ? {authorization:`Bearer ${actor}`} : {})};
  if (!raw && body !== undefined && !['GET','HEAD'].includes(method)) defaults['content-type'] = 'application/json';
  return fetch(base + '/api/index.php?route=' + encodeURIComponent(route), {
    method, headers:{...defaults, ...headers},
    ...(!['GET','HEAD'].includes(method) && body !== undefined ? {body:raw ? body : JSON.stringify(body)} : {}),
  });
}
function adapter(prefix = '/') {
  const window = {
    MCPAPaths:{url:relative => new URL(relative, base + prefix)},
    MCPA_CONFIG:{supabaseUrl:upstreamUrl}, fetch,
  };
  vm.runInNewContext(readFileSync(path.join(root, 'public/app/core/server-api.js'), 'utf8'), {window, Request, Headers, URL, FormData});
  return window.MCPAServer;
}

before(async () => {
  database = await require('./auth-test-db.cjs').authDatabase({engineerPortal:true});
  upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), text = bytes.toString();
    const url = new URL(req.url, 'http://fixture');
    const actorKey = req.headers.authorization?.replace(/^Bearer /, '');
    const actor = database.actors[actorKey];
    // Retain only fixture credentials. The production environment is overridden.
    requests.push({method:req.method, url:req.url, headers:req.headers, bytes});
    let input;
    try {
      input = text && req.headers['content-type']?.includes('application/json') ? JSON.parse(text) : {};
      if (url.pathname === '/auth/v1/token') {
        const key = input.email?.split('@')[0] || (input.refresh_token === 'refresh-admin' ? 'admin' : null);
        const person = database.actors[key];
        if (!person || (url.searchParams.get('grant_type') === 'password' && input.password !== 'fixture-password')) return reply(res, {code:'invalid_credentials', message:'Invalid login credentials'}, 400);
        return reply(res, {access_token:key, refresh_token:'refresh-' + key, token_type:'bearer', expires_in:3600, user:{id:person.authId, email:key + '@example.test'}});
      }
      if (url.pathname === '/auth/v1/user') return actor ? reply(res, {id:actor.authId, email:actorKey+'@example.test'}) : reply(res, {message:'Invalid session'}, 401);
      if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
      if (url.pathname === '/auth/v1/recover') return reply(res, {});
      if (url.pathname === '/auth/v1/admin/users') {
        assert.equal(req.headers.apikey, secret);
        assert.equal(req.headers.authorization, undefined, 'A modern secret key is not sent as a JWT');
        if (failAuth) return reply(res, {message:'Do not expose passwords or upstream errors'}, 429);
        const id = randomUUID();
        await database.db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)', [id,input.email,input.app_metadata]);
        return reply(res, {id,email:input.email});
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1);
        if (name === 'mcpa_development_account_step') {
          assert.equal(req.headers.apikey, secret);
          if (input.p_action === 'finish' && failFinish) { failFinish=false; return reply(res, {code:'TEST',message:'Interrupted'}, 503); }
          await database.db.exec('set role service_role');
          try {
            const result = await database.db.query('select mcpa_development_account_step($1,$2,$3) value', [input.p_actor,input.p_action,input.p_payload]);
            return reply(res, result.rows[0].value);
          } finally { await database.db.exec('reset role'); }
        }
        assert.equal(req.headers.apikey, publishable);
        if (!actor) return reply(res, {code:'PGRST301',message:'Invalid JWT'}, 401);
        if (name === 'mcpa_php_conflict_fixture') return reply(res, {code:'40001',message:'Retry the same operation',details:null,hint:null}, 409, {'retry-after':'1'});
        const result = await database.rpc(actor, name, input);
        return reply(res, result);
      }
      if (url.pathname === '/rest/v1/equipment') {
        assert.equal(req.headers.apikey, publishable);
        if (!actor) return reply(res, {code:'PGRST301',message:'Invalid JWT'}, 401);
        const result = await database.query(actor, 'select id from equipment order by id limit 1');
        if (req.method === 'HEAD') { res.writeHead(200, {'content-range':'0-0/2'}); return res.end(); }
        return reply(res, result.rows, 206, {'content-range':'0-0/2', 'range-unit':'items', 'preference-applied':'count=exact'});
      }
      if (url.pathname.startsWith('/storage/v1/object/')) {
        assert.equal(req.headers.apikey, publishable);
        assert.equal(actorKey, 'admin');
        return reply(res, url.pathname.includes('/sign/') ? {signedURL:'/object/sign/private?token=fixture'} : {Key:url.pathname});
      }
      reply(res, {message:'Unexpected fixture route'}, 404);
    } catch (error) {
      reply(res, {code:error.code || 'TEST', message:error.message}, error.code === '42501' ? 403 : 400);
    }
  });
  upstreamUrl = await listen(upstream);
  const reservation = createServer();
  base = await listen(reservation);
  await stop(reservation);
  const port = new URL(base).port;
  php = spawn(process.env.PHP_BINARY || 'php', [
    '-d','display_errors=0','-d','log_errors=1','-d',`session.save_path="${temporary.replaceAll('\\','/')}"`,
    '-d','upload_max_filesize=10M','-d','post_max_size=16M',
    '-S',`127.0.0.1:${port}`,'-t','public','server/router.php',
  ], {cwd:root, windowsHide:true, stdio:['ignore','ignore','pipe'], env:{...process.env,
    SUPABASE_URL:upstreamUrl, SUPABASE_PUBLISHABLE_KEY:publishable, MCPA_SUPABASE_SECRET_KEY:secret,
    MCPA_ENABLE_DEVELOPMENT_ACCOUNTS:'true', MCPA_APP_URL:'',
  }});
  let startError;
  php.on('error', error => { startError=error; });
  php.stderr.on('data', chunk => { stderr+=chunk; });
  for (let attempt=0; attempt<100; attempt++) {
    if (startError) throw startError;
    if (php.exitCode !== null) throw Error('PHP exited: '+stderr);
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('PHP did not start: '+stderr);
});

after(async () => {
  if (php && php.exitCode === null) { php.kill(); await once(php, 'exit'); }
  await stop(upstream);
  await database?.close();
  const resolved = path.resolve(temporary);
  assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep) && path.basename(resolved).startsWith('mcpa-php-'));
  rmSync(resolved, {recursive:true, force:true});
  assert.doesNotMatch(stderr, /PHP (?:Warning|Fatal error|Deprecated)/, stderr);
});

test('PHP serves the existing shell unchanged, dynamic public config and safe assets', async () => {
  const html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
  for (const route of ['/', '/index.html', '/index.php']) {
    const response = await fetch(base+route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
  }
  const config = await (await fetch(base+'/app/core/config.js')).text();
  const window = {};
  vm.runInNewContext(config, {window});
  assert.equal(window.MCPA_CONFIG.supabaseUrl, upstreamUrl);
  assert.equal(window.MCPA_CONFIG.supabasePublishableKey, publishable);
  assert.ok(!config.includes(secret));
  const module = await fetch(base+'/app/features/custody-lifecycle/api.mjs');
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base+'/2-engr/index.html')).status, 200);
  for (const route of ['/.env','/.git/config','/server/Config.php','/supabase/config.toml','/tests/auth-test-db.cjs','/%2e%2e%5c.env','/api/../../.env']) {
    assert.equal((await fetch(base+route)).status, 404, route);
  }
  assert.equal((await fetch(base+'/index.html',{method:'POST'})).status, 405);
});

test('PHP rejects invalid routes, malformed JSON, cross-origin calls and untrusted credentials before data writes', async () => {
  const start = requests.length;
  for (const [route, options, status] of [
    ['/rest/v1/rpc/mcpa_movement_snapshot',{body:'{invalid',raw:true,headers:{'content-type':'application/json'}},400],
    ['/rest/v1/rpc/mcpa_movement_snapshot',{body:[]},400],
    ['/rest/v1/equipment',{method:'GET',actor:null},401],
    ['/rest/v1/equipment',{method:'GET',actor:publishable},401],
    ['/rest/v1/equipment',{method:'GET',actor:secret},401],
    ['/rest/v1/equipment',{method:'GET',headers:{origin:'https://evil.example'}},403],
    ['/rest/v1/equipment',{method:'GET',headers:{'x-mcpa-request':'0'}},403],
    ['/rest/v1/equipment',{method:'GET',headers:{'accept-profile':'auth'}},403],
    ['/rest/v1/rpc/mcpa_development_account_step',{},403],
    ['/auth/v1/admin/users',{},404],
    ['/auth/v1/signup',{},404],
    ['https://evil.example/rest/v1/equipment',{method:'GET'},404],
    ['//evil.example/rest/v1/equipment',{method:'GET'},404],
    ['/storage/v1/object/equipment-photos/%2e%2e/secret',{method:'GET'},404],
    ['/storage/v1/object/equipment-photos/%252e%252e/secret',{method:'GET'},404],
  ]) {
    const result = await request(route, options);
    assert.equal(result.status,status, route+' '+await result.text());
  }
  assert.equal(requests.length,start);
});

test('PHP authenticates, refreshes, tracks HttpOnly session metadata and accepts an empty logout body', async () => {
  const signIn = await request('/auth/v1/token?grant_type=password', {actor:null,body:{email:'admin@example.test',password:'fixture-password'}});
  assert.equal(signIn.status,200);
  assert.equal((await signIn.json()).access_token,'admin');
  const cookie = signIn.headers.get('set-cookie');
  assert.match(cookie,/MCPA_SESSION=/);
  assert.match(cookie,/HttpOnly/i);
  assert.match(cookie,/SameSite=Lax/i);
  // The real SDK supplies the modern public key as its unsigned-in fallback.
  const sdkLogin = await request('/auth/v1/token?grant_type=password', {actor:publishable,body:{email:'admin@example.test',password:'fixture-password'}});
  assert.equal(sdkLogin.status,200);
  assert.equal(requests.at(-1).headers.authorization,undefined);
  const refresh = await request('/auth/v1/token?grant_type=refresh_token', {actor:null,body:{refresh_token:'refresh-admin'},headers:{cookie:cookie.split(';')[0]}});
  assert.equal(refresh.status,200);
  const recover = await request('/auth/v1/recover?redirect_to='+encodeURIComponent(base+'/index.html'), {actor:null,body:{email:'admin@example.test'}});
  assert.equal(recover.status,200);
  const badRedirect = await request('/auth/v1/recover?redirect_to=https%3A%2F%2Fevil.example', {actor:null,body:{email:'admin@example.test'}});
  assert.equal(badRedirect.status,400);
  const logout = await request('/auth/v1/logout?scope=local', {body:null, raw:true,headers:{cookie:cookie.split(';')[0]}});
  assert.equal(logout.status,204);
  assert.match(logout.headers.get('set-cookie'),/MCPA_SESSION=deleted/);
});

test('the browser transport reaches PHP, preserving JSON operation IDs, database authorization, counts and errors', async () => {
  const transport = adapter();
  const response = await transport.fetch(upstreamUrl+'/rest/v1/rpc/mcpa_my_profile', {method:'POST',headers:{authorization:'Bearer admin','content-type':'application/json'},body:'{}'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).role,'admin');
  const snapshot = await transport.fetch(upstreamUrl+'/rest/v1/rpc/mcpa_movement_snapshot', {method:'POST',headers:{authorization:'Bearer sky','content-type':'application/json'},body:'{}'});
  assert.equal(snapshot.status,200);
  assert.ok(Array.isArray((await snapshot.json()).tools));
  const invalid = await request('/rest/v1/rpc/mcpa_movement_snapshot',{actor:'invalid'});
  assert.equal(invalid.status,401);
  const inactive = await request('/rest/v1/rpc/mcpa_movement_snapshot',{actor:'inactive'});
  assert.equal(inactive.status,403);
  const count = await transport.fetch(upstreamUrl+'/rest/v1/equipment?select=id&limit=1', {headers:{authorization:'Bearer admin',prefer:'count=exact',range:'0-0'}});
  assert.equal(count.status,206);
  assert.equal(count.headers.get('content-range'),'0-0/2');
  const head = await request('/rest/v1/equipment?select=id', {method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-range'),'0-0/2');
  assert.equal(await head.text(),'');
  const operation = {p_operation_id:randomUUID(),p_payload:{ids:['TOOL-001'],note:'Keep exact JSON 🛠'}};
  const json = JSON.stringify(operation);
  const conflict = await transport.fetch(upstreamUrl+'/rest/v1/rpc/mcpa_php_conflict_fixture', {method:'POST',headers:{authorization:'Bearer admin','content-type':'application/json'},body:json});
  assert.equal(conflict.status,409);
  assert.equal(conflict.headers.get('retry-after'),'1');
  assert.equal((await conflict.json()).code,'40001');
  assert.equal(requests.at(-1).bytes.toString(),json);
  assert.equal(requests.at(-1).headers.apikey,publishable);
  assert.equal(requests.at(-1).headers.cookie,undefined);
  await assert.rejects(transport.fetch('https://evil.example/rest/v1/equipment'),/does not belong/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(transport.fetch(upstreamUrl+'/rest/v1/equipment',{signal:abort.signal}),{name:'AbortError'});
});

test('private attachments survive multipart and binary transport; PHP rejects mismatched types and oversize photos', async () => {
  const transport=adapter();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const form=new FormData();
  form.append('cacheControl','3600');
  form.append('',new Blob([png],{type:'image/png'}),'photo.png');
  const upload=await transport.fetch(upstreamUrl+'/storage/v1/object/equipment-photos/TOOL-001/fixture.png',{method:'POST',headers:{authorization:'Bearer admin','x-upsert':'false'},body:form});
  assert.equal(upload.status,200,await upload.clone().text());
  assert.ok(requests.at(-1).bytes.includes(png));
  assert.match(requests.at(-1).headers['content-type'],/multipart\/form-data; boundary=/);
  assert.equal(requests.at(-1).headers['x-upsert'],'false');
  const binary=await transport.fetch(upstreamUrl+'/storage/v1/object/mcpa-movement-evidence-v2/fixture.png',{method:'POST',headers:{authorization:'Bearer admin','content-type':'image/png'},body:png});
  assert.equal(binary.status,200);
  assert.deepEqual(requests.at(-1).bytes,png);
  const signed=await request('/storage/v1/object/sign/equipment-photos/TOOL-001/fixture.png',{body:{expiresIn:60}});
  assert.equal(signed.status,200);
  assert.match((await signed.json()).signedURL,/token=fixture/);
  const removed=await request('/storage/v1/object/equipment-photos',{method:'DELETE',body:{prefixes:['TOOL-001/fixture.png']}});
  assert.equal(removed.status,200);
  const bad=await request('/storage/v1/object/equipment-photos/fixture.png',{raw:true,headers:{'content-type':'image/png'},body:'<?php echo "bad";'});
  assert.equal(bad.status,400);
  const big=await request('/storage/v1/object/equipment-photos/fixture.png',{raw:true,headers:{'content-type':'image/png'},body:Buffer.alloc(5*1024*1024+1)});
  assert.equal(big.status,400);
  const receipt=await request('/storage/v1/object/purchase-receipts/fixture.pdf',{raw:true,headers:{'content-type':'application/pdf'},body:'%PDF-1.7\nfixture\n%%EOF'});
  assert.equal(receipt.status,200);
});

test('the PHP account service uses verified identities and rejects forbidden actors and input before privileged effects', async () => {
  const route='/functions/v1/manage-accounts';
  for (const actor of ['invalid','sky','architect','secretary','handler','inactive']) {
    const start=requests.length;
    const result=await request(route,{actor,body:{action:'capabilities'}});
    assert.ok([401,403].includes(result.status),actor);
    assert.ok(requests.slice(start).every(call=>call.headers.apikey===publishable));
  }
  const input={action:'createDevelopmentAccount',id:randomUUID(),name:'PHP Fixture Person',email:'php-fixture@example.test',role:'engineer',password:'Fixture-only-password-2026!'};
  for (const change of [{action:'invite'},{role:'admin'},{password:'short'},{password:' '.repeat(12)},{password:'a'.repeat(129)},{profile_id:randomUUID()},{email:'invalid'}]) {
    const start=requests.length;
    const result=await request(route,{body:{...input,...change}});
    assert.equal(result.status,400,JSON.stringify(change));
    assert.ok(requests.slice(start).every(call=>call.headers.apikey===publishable));
  }
  const result=await request(route,{body:{action:'capabilities'}});
  assert.equal(result.status,200);
  assert.equal((await result.json()).development_enabled,true);
});

test('PHP preserves account creation leases, recovery after a lost finish, and original passwords on retry', async () => {
  const route='/functions/v1/manage-accounts';
  const input={action:'createDevelopmentAccount',id:randomUUID(),name:'PHP Retry Engineer',email:'php-retry@example.test',role:'engineer',password:'Fixture-only-password-2026!'};
  failFinish=true;
  const first=await request(route,{body:input});
  assert.equal(first.status,503);
  const pending=await (await request(route,{body:{action:'capabilities'}})).json();
  assert.ok(pending.pending_development_accounts.some(job=>job.id===input.id));
  const start=requests.length;
  const second=await request(route,{body:{...input,password:'Changed-must-not-be-applied!'}});
  assert.equal(second.status,200);
  const result=await second.json();
  assert.match(result.message,/original creation/);
  assert.ok(requests.slice(start).every(call=>!call.url.includes('/auth/v1/admin/users')));
  const record=(await database.db.query('select * from profiles where id=$1',[result.profile_id])).rows[0];
  assert.equal(record.role,'engineer');
  assert.equal(record.account_status,'active');
  const again=await request(route,{body:input});
  assert.equal(again.status,200);
  assert.match((await again.json()).message,/already exists/);
  const privileged=requests.filter(call=>call.headers.apikey===secret && call.url.startsWith('/rest/'));
  assert.ok(privileged.every(call=>!call.bytes.toString().includes(input.password)),'Passwords never enter database RPC arguments');
  assert.ok(privileged.every(call=>JSON.parse(call.bytes).p_actor===database.actors.admin.authId),'Browser actor IDs are not trusted');
  failAuth=true;
  const rateLimited=await request(route,{body:{...input,id:randomUUID(),name:'PHP Rate Limited',email:'php-rate@example.test'}});
  failAuth=false;
  assert.equal(rateLimited.status,503);
  const failure=await rateLimited.text();
  assert.match(failure,/rate limited/);
  assert.ok(!failure.includes(input.password));
});

test('the same transport resolves the PHP endpoint under an existing hosted subpath', async () => {
  let received;
  const window={MCPA_CONFIG:{supabaseUrl:upstreamUrl},MCPAPaths:{url:relative=>new URL(relative,'https://app.example/MCPA/')},
    fetch:async(url,options)=>{received={url:String(url),options};return new Response('{}');}};
  vm.runInNewContext(readFileSync(path.join(root,'public/app/core/server-api.js'),'utf8'),{window,Request,Headers,URL});
  await window.MCPAServer.fetch(upstreamUrl+'/rest/v1/equipment?select=id&name=eq.A%26B',{headers:{authorization:'Bearer fixture'}});
  const target=new URL(received.url);
  assert.equal(target.origin,'https://app.example');
  assert.equal(target.pathname,'/MCPA/api/index.php');
  assert.equal(target.searchParams.get('route'),'/rest/v1/equipment?select=id&name=eq.A%26B');
  assert.equal(received.options.credentials,'same-origin');
});
