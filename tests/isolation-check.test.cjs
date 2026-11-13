const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verifyIsolation}=require('./isolation-check.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-isolation-regression-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'public/app/core'),{recursive:true});fs.mkdirSync(path.join(root,'tests/fixtures'),{recursive:true});
  for(const f of ['tests/auth.browser.cjs','tests/fixtures/offline-config.js'])fs.copyFileSync(path.join(__dirname,'..',f),path.join(root,f));
  return root;
}
test('exported source isolation check works with no .env, Git metadata, credentials or installed dependencies',t=>{
  assert.ok(verifyIsolation(fixture(t)));
});
test('isolation ignores real-runtime configuration and leaves local .env untouched',t=>{
  const root=fixture(t),env='SUPABASE_URL=https://unused.invalid\nSUPABASE_PUBLISHABLE_KEY=not-a-credential\n';
  fs.writeFileSync(path.join(root,'.env'),env);fs.mkdirSync(path.join(root,'.git'));
  fs.writeFileSync(path.join(root,'public/app/core/config.js'),"throw Error('real runtime config must never execute in fixtures');");
  assert.ok(verifyIsolation(root));assert.equal(fs.readFileSync(path.join(root,'.env'),'utf8'),env);
});
test('missing browser allowlist or a changed fixture origin fails closed',t=>{
  const root=fixture(t),file=path.join(root,'tests/auth.browser.cjs');
  const browser=fs.readFileSync(file,'utf8');fs.writeFileSync(file,browser.replace("await command('Fetch.enable'","await command('Fetch.disabled'"));
  assert.throws(()=>verifyIsolation(root),/request guard/);fs.writeFileSync(file,browser);
  const config=path.join(root,'tests/fixtures/offline-config.js');fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace('https://offline.mcpa.invalid','https://wrong.invalid'));
  assert.throws(()=>verifyIsolation(root),/offline origin/);
});
