const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function verifyIsolation(root=path.resolve(__dirname,'..')){
  // The fixture server overrides the canonical runtime config before serving
  // public files. Never read .env, shell credentials or the real config.js here.
  const fixture=fs.readFileSync(path.join(root,'tests/fixtures/offline-config.js'),'utf8');
  const context={window:{}};vm.runInNewContext(fixture,context,{timeout:1000});
  assert.ok(context.window.MCPA_CONFIG?.supabaseUrl==='https://offline.mcpa.invalid','Fixture must use the offline origin');
  assert.ok(context.window.MCPA_CONFIG?.supabasePublishableKey==='sb_publishable_offline_fixture','Fixture must use only the synthetic key');
  function walk(folder){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const file=path.join(folder,entry.name);
      if(entry.isDirectory())walk(file);
      else if(/\.(?:js|mjs|php|html)$/.test(file)&&path.relative(root,file).replaceAll('\\','/')!=='public/app/core/config.js'){
        const text=fs.readFileSync(file,'utf8');
        assert.ok(!/https:\/\/[a-z0-9]+\.supabase\.co/.test(text),'Live Supabase fallback outside canonical runtime configuration: '+path.relative(root,file));
        for(const match of text.matchAll(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g))assert.ok(match[0]==='sb_publishable_offline_fixture','Non-fixture key outside canonical configuration');
      }
    }
  }
  walk(path.join(root,'public'));
  const browser=fs.readFileSync(path.join(root,'tests/auth.browser.cjs'),'utf8');
  const guardAt=browser.indexOf("await command('Fetch.enable'"),runAt=browser.indexOf("if(process.argv.includes('--recipient-ux')){await require('./recipient-ux.browser-checks.cjs')");
  assert.ok(guardAt>=0&&runAt>=0&&guardAt<runAt,'Browser request guard must exist before application navigation');
  assert.ok(browser.includes("url.port===String(server.address().port)"),'Only the current ephemeral loopback port may be used');
  assert.ok(browser.includes("if(pathname==='/app/core/config.js')")&&browser.includes("path.join(root,'tests/fixtures/offline-config.js')"),'Fixture server must override the canonical browser configuration');
  return true;
}
module.exports={verifyIsolation};
if(require.main===module){
  verifyIsolation();
  console.log('PASS Offline fixture configuration and SDK; no .env or credentials read; no live fallback outside overridden runtime configuration; exact browser loopback allowlist before navigation.');
}
