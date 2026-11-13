import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {once} from 'node:events';
import {createStaticServer} from '../scripts/serve.mjs';

test('application paths resolve at the domain root and under a hosted project subpath', () => {
  const source = readFileSync(new URL('../public/app/core/paths.js', import.meta.url), 'utf8');
  for (const prefix of ['/', '/MCPA/']) {
    const context = {URL, window:{}, document:{currentScript:{src:`https://example.test${prefix}app/core/paths.js`}}};
    vm.runInNewContext(source, context);
    const paths = context.window.MCPAPaths;
    assert.equal(paths.module('admin', 'masterlist'), `https://example.test${prefix}app/portals/admin/masterlist/masterlist`);
    assert.equal(paths.url('index.html').href, `https://example.test${prefix}index.html`);
  }
});

test('the legacy engineer entry preserves the query and route while using the canonical shell', () => {
  const source = readFileSync(new URL('../public/2-engr/index.html', import.meta.url), 'utf8');
  let redirected;
  vm.runInNewContext(source.match(/<script>(.*?)<\/script>/s)[1], {URL, location:{href:'https://example.test/MCPA/2-engr/index.html?reset=1#request', search:'?reset=1', hash:'#request', replace:value => {redirected=value;}}});
  assert.equal(redirected, 'https://example.test/MCPA/index.html?reset=1#request');
});

test('the application server serves public assets and excludes private files, SQL and test sources', async t => {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /app\/core\/paths.js/);
  const asset = await fetch(origin + '/app/core/paths.js', {method:'HEAD'});
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  for (const name of ['/.env', '/package.json', '/supabase/config.toml', '/tests/auth-test-db.cjs', '/%2e%2e%2fsupabase/config.toml', '/%2e%2e%5csupabase/config.toml']) assert.equal((await fetch(origin + name)).status, 404, name);
  assert.equal((await fetch(origin + '/index.html', {method:'POST'})).status, 405);
});
