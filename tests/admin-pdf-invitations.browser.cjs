const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.verify=async c=>{
 const {fixture:f,evaluate,command,wait,click,fill,submit,go,base,shot,artifactDirectory}=c;
 await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/drafts/admin-pdf/03-registration-invitations.sql'),'utf8'));
 f.invites=await require('./admin-pdf-invitation-fixture.cjs').open(f,{appUrl:base});
 await evaluate('window.__invitationTransport=true');await go('dashboard');await go('users');await wait("!document.querySelector('[data-invite]').disabled");await click('[data-invite]');await wait("!document.querySelector('#invite-name').disabled");
 await fill('#invite-name','Synthetic UI Invitee');await fill('#invite-email','ui-invited@example.test');await fill('#invite-role','architect');await submit('[data-invite-form]');await wait("document.querySelector('#invite-link')");
 const link=await evaluate("document.querySelector('#invite-link').value");assert.equal(new URL(link).origin,base);
 await command('Browser.grantPermissions',{origin:base,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await command('Emulation.setFocusEmulationEnabled',{enabled:true});await command('Page.bringToFront');await click('[data-copy-invite]');await wait("document.querySelector('[data-copy-invite]').textContent==='Copied'");assert.equal(await evaluate('navigator.clipboard.readText()'),link);
 const out=path.join(__dirname,'../docs/admin-pdf-review/screenshots/after');
 async function captures(name){if(process.argv.includes('--no-captures'))return;for(const width of [1440,393])for(const dark of [false,true]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<900});await evaluate(`applyTheme(${dark},false)`);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const file=`p11-${name}-${width}-${dark?'dark':'light'}`;await shot(file,true);fs.copyFileSync(path.join(artifactDirectory,file+'.png'),path.join(out,file+'.png'));}}
 await captures('invite-enabled');
 await command('Page.navigate',{url:link});await wait("document.querySelector('#registration-form')");assert.equal(await evaluate("document.querySelector('#app-shell').classList.contains('hidden')"),true);assert.equal(await evaluate('location.hash'),'');
 await captures('registration');await fill('#registration-password','Synthetic-UI-Registration-2026!');await fill('#registration-confirm','Different-Synthetic-Password');await submit('#registration-form');await wait("document.querySelector('#auth-feedback').textContent.includes('match')");assert.equal(f.invites.mails.length,0);
 await fill('#registration-confirm','Synthetic-UI-Registration-2026!');await submit('#registration-form');await wait("document.querySelector('#auth-feedback').textContent.includes('Check the invited email')");assert.equal(f.invites.mails.length,1);
 const row=(await f.db.query("select * from mcpa_registration_invites where email='ui-invited@example.test'")).rows[0];assert.equal(row.state,'awaiting_verification');assert.equal((await f.db.query('select account_status from profiles where id=$1',[row.profile_id])).rows[0].account_status,'inactive');
 const key=f.invites.identities.get('ui-invited@example.test');
 // Email confirmation is modeled only in Auth fixture storage; no real email/account.
 await f.db.query('update auth.users set email_confirmed_at=now() where id=$1',[row.auth_user_id]);
 await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.__invitationTransport=true;"});
 await evaluate(`localStorage.setItem('fixture.account',${JSON.stringify(key)})`);await command('Page.navigate',{url:base+'/index.html?registration=verify'});await wait("window.MCPAAuth?.profile?.role==='architect'");assert.equal((await f.db.query('select state from mcpa_registration_invites where id=$1',[row.id])).rows[0].state,'completed');
 await evaluate("showScreen('users')");await wait("document.querySelector('#content').textContent.includes('not available for your account')");
 await evaluate("localStorage.setItem('fixture.account','admin');location.reload()");await wait("window.MCPAAuth?.profile?.role==='admin'");await go('users');await wait("!document.querySelector('[data-invite]').disabled");await click('[data-invite]');await click('[data-review-invitations]');await wait("document.querySelector('[data-invitation-review]').textContent.includes('completed')");
 await click('[data-close-lifecycle]');
 console.log('PASS Actual invitation UI -> real PHP -> SQL/RLS -> synthetic Auth/email -> verified callback activation; copy, password mismatch, non-Admin route denial; desktop/mobile both themes');
};
