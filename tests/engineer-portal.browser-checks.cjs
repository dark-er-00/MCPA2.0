const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot})=>{
 const key=async name=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:name==='Escape'?27:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:name==='Escape'?27:9});};
 const viewport=async width=>{await command('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:width<=768});await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
 await logout();await login('pau');await wait("MCPAAuth.profile?.role==='engineer' && document.querySelector('.overview-actions')");
 await go('sites');await wait("document.querySelector('#sites-list').textContent.includes('No projects assigned')");
 assert.equal(await evaluate("document.querySelectorAll('[data-action=add-site]').length"),0);
 await go('masterlist');await wait("document.querySelector('#overview-results').textContent.includes('No equipment is currently assigned to you.')");
 await go('transfer');await wait("document.querySelector('[data-transfer-tab=receive]')");await click('[data-transfer-tab=receive]');
 await wait("document.querySelector('[data-receiving-projects]').textContent.includes('No assigned receiving project')");
 const receivingSite=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Receiving fixture project','Local test only',$2,$3)",[receivingSite,f.actors.pau.name,f.actors.pau.id]);
 await go('sites');await wait("document.querySelector('.site-card')");assert.ok(await evaluate("!document.querySelector('#sites-feedback').textContent.includes('project is not defined')"));
 await click('.site-card');await wait("document.querySelector('#screen-site-detail.active')");assert.ok(await evaluate("document.querySelector('#site-detail-content').textContent.includes('Engr Pau')"));
 assert.equal(await evaluate("document.querySelectorAll('[data-action=add-site],[data-action=edit-site],[data-action=archive-site]').length"),0);
 // Model the existing scanner transport only; backend calls use real PostgreSQL.
 await evaluate(`window.__scanners=[];window.__cameraDenied=false;window.__lastQr='';
 window.QRCode=class{constructor(host,options){window.__lastQr=options.text;host.textContent='QR encoding transport fixture';}};
 window.Html5Qrcode=class{constructor(id){this.id=id;this.isScanning=false;__scanners.push(this);}async start(camera,options,success){if(__cameraDenied)throw new Error('NotAllowedError');this.isScanning=true;this.scan=success;}async stop(){this.isScanning=false;}clear(){this.cleared=true;}};`);
 await go('transfer');await wait("document.querySelector('[data-transfer-tab=receive]')");await click('[data-transfer-tab=receive]');await wait("document.querySelector('[data-action=generate-receiver]')");
 assert.equal(await evaluate("document.querySelector('#mv-receiving-site').disabled"),true);
 await viewport(393);await shot('portal-receive-393',true);
 const secondSite=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Another receiving project','Local test only',$2,$3)",[secondSite,f.actors.pau.name,f.actors.pau.id]);
 await go('sites');await wait("document.querySelectorAll('.site-card').length===2");await go('transfer');await wait("document.querySelector('[data-transfer-tab=receive]')");await click('[data-transfer-tab=receive]');await wait("document.querySelector('#mv-receiving-site') && !document.querySelector('#mv-receiving-site').disabled");await fill('#mv-receiving-site',receivingSite);
 await click('[data-action=generate-receiver]');await wait("window.__lastQr.startsWith('MCPA-RECEIVER:')");const qr=await evaluate('__lastQr');
 const baseline=(await f.db.query('select id,current_holder_id,site_id,status from equipment order by id')).rows;
 await logout();await login('sky');await wait("document.querySelector('.overview-actions')");
 const before=calls.length;await go('masterlist');await wait("document.querySelector('#overview-results [data-tool]')");
 assert.ok(calls.slice(before).some(c=>c.rpc==='mcpa_personal_equipment_snapshot'));assert.ok(!calls.slice(before).some(c=>c.rpc==='mcpa_movement_snapshot'),'Personal view never calls broad movement/catalog snapshot');
 assert.ok(await evaluate("!document.querySelector('#overview-mine') && !document.querySelector('#overview-results').textContent.includes('TOOL-001') && document.querySelector('#overview-results').textContent.includes('TOOL-002')"));
 await go('sites');await wait("document.querySelector('.site-card')");assert.ok(await evaluate("!document.querySelector('#sites-list').textContent.includes('Receiving fixture project')"));
 await go('transfer');await wait("document.querySelector('[data-form=create]')");
 assert.equal(await evaluate("[...document.querySelectorAll('[data-transfer-panel]')].filter(el=>!el.hidden).length"),1);
 assert.equal(await evaluate("document.querySelector('[data-transfer-panel=receive]').hidden"),true);
 const recipientText=await evaluate("document.querySelector('[name=receiverId]').textContent");assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(recipientText));
 await fill('[name=notes]','Unsaved transfer notes');await click('[data-transfer-tab=history]');await click('[data-transfer-tab=send]');assert.equal(await evaluate("document.querySelector('[name=notes]').value"),'Unsaved transfer notes');
 for(const width of [393,430,1440]){
  await viewport(width);if(width<900){
   await click('.mobile-menu-btn');await wait("document.querySelector('#sidebar').classList.contains('open')");await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
   assert.ok(await evaluate("(()=>{const r=document.querySelector('#sidebar').getBoundingClientRect(),f=document.querySelector('.sidebar-foot').getBoundingClientRect();return r.left===0 && r.right<=innerWidth && r.width<=290 && f.bottom<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth})()"));
   assert.ok(await evaluate("document.querySelector('#main-col').inert && !document.querySelector('#sidebar').inert"));
   assert.ok(await evaluate("!document.querySelector('.nav-item[data-target=users]') && document.querySelector('.nav-item[data-target=settings]')"));
   if(width===393)await shot('portal-drawer-393',true);
   await key('Escape');assert.equal(await evaluate('document.activeElement.classList.contains("mobile-menu-btn")'),true);
   await click('.mobile-menu-btn');await click('.drawer-backdrop');assert.ok(await evaluate("!document.querySelector('#sidebar').classList.contains('open') && !document.querySelector('#main-col').inert"));
  }
  if(width===393)await evaluate("document.body.classList.add('dark')");else await evaluate("document.body.classList.remove('dark')");
  await shot('portal-send-'+width,true);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 }
 await viewport(393);
 await submit('[data-form=create]');await wait("document.querySelector('[data-notice]').textContent.includes('Scan a receiving QR')");
 await click('[data-action=manual-receiver]');await fill('[name=receiverId]',f.actors.pau.id);await fill('[name=destination]','Receiving fixture project');
 assert.ok(await evaluate("!document.querySelector('[data-receiver-fields]').hidden && document.querySelector('[name=receiverId]').required"));
 await evaluate('__cameraDenied=true');await click('[data-action=scan-receiver]');await wait("document.querySelector('[data-scanner-error]').textContent.includes('Camera could not start')");await click('[data-action=close-scanner]');
 await evaluate('__cameraDenied=false');await click('[data-action=scan-receiver]');await wait('__scanners.at(-1).isScanning');
 await evaluate("__scanners.at(-1).scan('TRF-00001')");await wait("document.querySelector('[data-scanner-error]').textContent.includes('not a receiving QR')");assert.equal(await evaluate('__scanners.some(s=>s.isScanning)'),false);
 await click('[data-action=scan-receiver]');await wait('__scanners.at(-1).isScanning');await evaluate('__scanners.at(-1).scan('+JSON.stringify(qr)+')');
 await wait("!document.querySelector('[data-scanner-dialog]').open && document.querySelector('[name=destination]').value==='Receiving fixture project'");
 assert.equal(await evaluate("document.querySelector('[name=receiverId]').value"),f.actors.pau.id);
 assert.equal(await evaluate('__scanners.some(s=>s.isScanning)'),false);
 assert.deepEqual((await f.db.query('select id,current_holder_id,site_id,status from equipment order by id')).rows,baseline,'Scan does not mutate custody');
 await click('[name=toolIds][value="TOOL-002"]');await submit('[data-form=create]');await wait("document.querySelector('[data-detail][open]')?.textContent.includes('TRF-')");
 const id=await evaluate("document.querySelector('[data-detail] h2').textContent");
 assert.equal((await f.db.query("select current_holder_id from equipment where asset_id='TOOL-002'")).rows[0].current_holder_id,f.actors.sky.id);
 await shot('portal-transfer-dialog-393',true);await key('Escape');await wait("!document.querySelector('[data-detail]').open");
 await click('[data-transfer-tab=history]');await click('.mv-transfer-card button[data-action=view]');await wait("document.querySelector('[data-detail]').open");await click('[data-action=close-detail]');
 // Navigation cancels even an in-flight camera and restores drawer/modal state.
 await click('[data-transfer-tab=send]');await click('[data-action=scan-receiver]');await wait('__scanners.at(-1).isScanning');await go('request');await wait("document.querySelector('[name=purpose]')");await wait('!__scanners.some(s=>s.isScanning)');
 assert.ok(await evaluate("document.querySelector('[name=toolIds][value=\"TOOL-001\"]')"),'Requestable catalog remains separate');
 await logout();await login('pau');await wait("document.querySelector('.overview-actions')");await go('transfer');await wait("document.querySelector('[data-transfer-tab=receive]')");await click('[data-transfer-tab=receive]');
 await wait("document.querySelector('[data-incoming]').textContent.includes("+JSON.stringify(id)+")");await click('[data-incoming] [data-action=view]');await wait("document.querySelector('[data-form=receive]')");
 await fill('[data-condition]','good');await fill('[data-condition-notes]','Inspected in isolated fixture');await click('[data-tested]');
 await evaluate('window.__confirm=window.confirm;window.__confirmCalls=0;window.confirm=()=>{window.__confirmCalls++;return false}');await key('Escape');assert.deepEqual(await evaluate("({open:document.querySelector('[data-detail]').open,notes:document.querySelector('[data-condition-notes]')?.value,confirm:window.__confirmCalls})"),{open:true,notes:'Inspected in isolated fixture',confirm:1});await evaluate('window.confirm=window.__confirm');
 await submit('[data-form=receive]');await wait("document.querySelector('[data-detail]').textContent.includes('Received / Completed')");assert.equal((await f.db.query("select current_holder_id from equipment where asset_id='TOOL-002'")).rows[0].current_holder_id,f.actors.pau.id);
 await click('[data-action=close-detail]');await go('masterlist');await wait("document.querySelector('#overview-results')?.textContent.includes('TOOL-002')");assert.equal(await evaluate("document.querySelectorAll('#overview-results tbody tr').length"),1);
 await click('[data-tool]');await wait("document.querySelector('dialog[open]')");assert.ok(await evaluate("document.querySelector('dialog[open]').textContent.includes("+JSON.stringify(id)+")"));
 console.log('PASS Assigned Projects, own-custody backend reads, no-project state, responsive drawer/tabs, clean recipients, QR generation/autofill/errors/camera cleanup, unchanged custody on scan/dispatch, modal dirty-close protection, authorized receipt and history');
};
