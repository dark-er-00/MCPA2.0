const assert=require('node:assert/strict');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,calls,shot})=>{
 const a=f.actors;
 await command('Page.navigate',{url:base+'/index.html'});await login('admin');await wait("MCPAAuth.profile?.role==='admin'");
 await go('dashboard');await wait("document.querySelector('[data-nav-group=equipment]')");
 assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),0);
 await click('[data-nav-group=equipment] .nav-parent');assert.equal(await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').getAttribute('aria-expanded')"),'true');
 assert.ok((await evaluate("document.querySelector('[data-nav-group=equipment]').textContent")).includes('Register Equipment'));
 assert.equal(await evaluate("document.querySelectorAll('[data-nav-group=equipment] [data-target=\"asset-retirement-v2\"]').length"),1);
 for(const route of ['repair','missing']){assert.equal(await evaluate(`document.querySelectorAll('[data-nav-group=equipment] [data-target="${route}"]').length`),1);assert.equal(await evaluate(`document.querySelectorAll('[data-nav-group=movements] [data-target="${route}"]').length`),0);}
 await click('[data-nav-group=movements] .nav-parent');assert.equal(await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').getAttribute('aria-expanded')"),'false');
 await click('[data-nav-group=movements] .nav-parent');assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),0);
 await go('sites');await wait("document.querySelector('.site-card')");
 assert.equal(await evaluate("document.querySelectorAll('#nav-list > [data-target=sites][aria-current=page]').length"),1);
 assert.equal(await evaluate("document.querySelector('[data-nav-group=projects]')"),null);
 await click(`[data-action=open-site][data-id="${f.sites.casa}"]`);await click('[data-action=edit-site]');
 assert.deepEqual(await evaluate("[...document.querySelector('#site-profession').options].filter(o=>!o.hidden).map(o=>o.text)"),['Engr','Architect']);
 assert.equal(await evaluate("document.querySelector('#site-engineer').value"),a.sky.id);
 await fill('#site-profession','architect');assert.equal(await evaluate("document.querySelector('#site-engineer').value"),'');
 assert.ok(await evaluate("[...document.querySelector('#site-engineer').options].filter(o=>o.value&&!o.disabled).every(o=>o.dataset.profession==='architect')"));
 await fill('#site-engineer',a.architect.id);await submit('#sites-form');await wait("!document.querySelector('#sites-dialog').open");
 assert.equal((await f.db.query('select assigned_engineer_id from sites where id=$1',[f.sites.casa])).rows[0].assigned_engineer_id,a.architect.id);
 assert.ok((await evaluate("document.querySelector('[data-action=open-site][data-id=\""+f.sites.casa+"\"] .eng').textContent")).includes('Architect'));
 await click('[data-action=edit-site]');assert.equal(await evaluate("document.querySelector('#site-profession').value"),'architect');assert.equal(await evaluate("document.querySelector('#site-engineer').value"),a.architect.id);
 for(const dark of [false,true]){
  await command('Emulation.setDeviceMetricsOverride',{width:393,height:950,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.body.classList.toggle('dark',${dark})`);
  assert.ok(await evaluate("(()=>{const s=document.querySelector('#site-profession'),d=document.querySelector('#sites-dialog');return s.getBoundingClientRect().width>0&&d.scrollWidth<=d.clientWidth+1&&getComputedStyle(s).color!==getComputedStyle(s).backgroundColor})()"),'Profession select remains visible and fits its mobile dialog in both themes');
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});await evaluate("document.body.classList.remove('dark')");
 await fill('#site-profession','engineer');await fill('#site-engineer',a.sky.id);await submit('#sites-form');await wait("!document.querySelector('#sites-dialog').open");
 console.log('PASS Profession choices, profile filtering, SQL-backed assignment persistence and edit restoration');
 await require('./legacy-profession.browser-checks.cjs').verify({fixture:f,evaluate,wait,click,fill,submit,go});
 await go('masterlist?mode=register');await wait("document.querySelector('#equipmentModal')?.classList.contains('open') || document.querySelector('#equipmentModal')?.classList.contains('show') || document.querySelector('#equipmentModal')?.style.display==='flex'");
 // Re-navigation closes any equipment dialog through the incumbent module lifecycle.
 await go('transfer');await wait("document.querySelector('[data-new-transfer]')");
 await click('[data-new-transfer]');await fill('[data-transfer-create] [name=recipient]',a.pau.id);await fill('[data-transfer-create] [name=destination]',f.sites.main);
 await click('[data-transfer-create] [name=asset][value="TOOL-001"]');await submit('[data-transfer-create]');
 await wait("document.querySelector('[data-transfer-feedback]').textContent.includes('requested')");
 let records=(await f.db.query("select * from mcpa_movements where kind='transfer' and data @> '{\"transferVersion\":3}' order by created_at desc")).rows;
 const adminTransfer=records[0].id;assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
 await logout();await login('pau');await wait("MCPAAuth.profile?.role==='engineer'");await go('transfer');await wait("document.querySelector('[data-transfer-record]')");
 await click(`[data-transfer-record="${adminTransfer}"] summary`);await fill(`[data-transfer-record="${adminTransfer}"] [name=condition]`,'good');await click(`[data-transfer-record="${adminTransfer}"] [name=tested]`);await submit(`[data-transfer-record="${adminTransfer}"] form`);
 await wait("document.querySelector('[data-transfer-feedback]').textContent.includes('accepted')");assert.equal((await f.tool('TOOL-001')).current_holder_id,a.pau.id);
 const tr=await f.rpc(a.sky,'mcpa_movement_action',{p_action:'createTransfer',p_payload:{toolIds:['TOOL-002'],receiverId:a.pau.id,destinationId:f.sites.main,notes:'Recipient review fixture'},p_operation_id:require('node:crypto').randomUUID()});
 await click('[data-transfer-refresh]');await wait(`document.querySelector('[data-transfer-record="${tr.id}"]')`);
 await click(`[data-transfer-record="${tr.id}"] summary`);await click(`[data-transfer-record="${tr.id}"] [data-decision=refuseTransfer]`);await fill('[data-confirm-decision] [name=reason]','Wrong physical item presented');await submit('[data-confirm-decision]');
 await wait("document.querySelector('[data-transfer-feedback]').textContent.includes('Decision recorded')");assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
 assert.equal((await f.db.query('select data->>\'status\' status from mcpa_movements where id=$1',[tr.id])).rows[0].status,'rejected');
 console.log('PASS Full browser-to-SQL Admin initiation, named recipient acceptance, recipient rejection and unchanged source custody before decision');
 const toAdmin=await f.rpc(a.sky,'mcpa_movement_action',{p_action:'createTransfer',p_payload:{toolIds:['TOOL-002'],receiverId:a.admin.id,destinationId:f.sites.office},p_operation_id:require('node:crypto').randomUUID()});
 await logout();await login('admin');await wait("MCPAAuth.profile?.role==='admin'");await go('transfer');await wait(`document.querySelector('[data-transfer-record="${toAdmin.id}"]')`);
 await click(`[data-transfer-record="${toAdmin.id}"] summary`);await fill(`[data-transfer-record="${toAdmin.id}"] [name=condition]`,'good');await click(`[data-transfer-record="${toAdmin.id}"] [name=tested]`);await submit(`[data-transfer-record="${toAdmin.id}"] form`);
 await wait("document.querySelector('[data-transfer-feedback]').textContent.includes('accepted')");assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
 console.log('PASS Admin incoming review and explicit acceptance of their own addressed transfer');
 await logout();await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await go('transfer?view=send');await wait("document.querySelector('[data-transfer-record]')");
 assert.equal(await evaluate("document.querySelector('[data-transfer-view=send]').getAttribute('aria-pressed')"),'true');
 assert.equal(await evaluate("document.querySelector('#nav-list [data-target=\"masterlist?mode=register\"]')"),null);
 await command('Page.reload');await wait("document.querySelector('[data-transfer-record]')");
 assert.equal(await evaluate("document.querySelector('[data-nav-group=movements] .nav-parent').getAttribute('aria-expanded')"),'true');
 assert.equal(await evaluate("document.querySelector('#nav-list [data-target=transfer]').getAttribute('aria-current')"),'page');
 await wait("parseFloat(getComputedStyle(document.querySelector('.transfer-workspace .btn')).minHeight)>=44");
 // Single batched visual pass across theme and viewport combinations.
 for(const dark of [false,true])for(const width of [393,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.body.classList.toggle('dark',${dark})`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No page overflow');
  // Measure after screen/theme animations settle; keep the full 44px requirement.
  await wait("(()=>{const screen=document.querySelector('#screen-transfer');return getComputedStyle(screen).transform==='none'&&screen.getAnimations({subtree:true}).every(animation=>animation.playState!=='running');})()");
  const targets=await evaluate("(()=>[...document.querySelectorAll('.transfer-workspace button')].filter(button=>button.getClientRects().length).map(button=>({text:button.textContent,height:button.getBoundingClientRect().height,offsetHeight:button.offsetHeight,minHeight:getComputedStyle(button).minHeight})))()");
  assert.ok(targets.every(button=>button.height>=44),JSON.stringify({width,dark,targets}));
  if(width<768){
   await click('.mobile-menu-btn');assert.equal(await evaluate("document.querySelector('#sidebar').getAttribute('aria-modal')"),'true');
   await click('[data-nav-group=equipment] .nav-parent');assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),1);
   await click('[data-nav-group=equipment] .nav-parent');assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),0);
   await click('.drawer-close');assert.equal(await evaluate("document.querySelector('.mobile-menu-btn').getAttribute('aria-expanded')"),'false');
  }
  await shot(`recipient-transfers-${width}-${dark?'dark':'light'}`,true);
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').focus()");
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 assert.equal(await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').getAttribute('aria-expanded')"),'true');
 await fill('[data-transfer-search]','no-such-local-transfer');assert.equal(await evaluate("[...document.querySelectorAll('[data-transfer-record]')].filter(x=>!x.hidden).length"),0);await fill('[data-transfer-search]','');
 await evaluate("window.__savedTransferRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());EquipmentTracking.client().rpc=async(name,args)=>name==='mcpa_transfer_snapshot'?{error:{code:'PGRST202'}}:__savedTransferRpc(name,args)");
 await go('dashboard');await go('transfer');await wait("document.querySelector('[data-transfer-feedback]').textContent.includes('administrator review')");
 assert.equal(await evaluate("document.querySelector('[data-new-transfer]')"),null,'Missing migration fails closed');
 await evaluate('EquipmentTracking.client().rpc=__savedTransferRpc');await click('[data-transfer-refresh]');await wait("document.querySelector('[data-new-transfer]')");
 console.log('PASS Accordion exclusivity/toggle/keyboard, active and refreshed child routes, role navigation, 393/1440 widths, both themes and 44px actions');
 await require('./transfer-deep-links.browser-checks.cjs').verify({fixture:f,evaluate,command,wait,click,go,login,logout,calls});
};
