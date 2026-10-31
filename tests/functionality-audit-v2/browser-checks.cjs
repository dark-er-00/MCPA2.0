const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,shot})=>{
 const a=f.actors;
 const saveItem=(unit,category)=>f.call(a.admin,'consumables_save_item',{p_id:id(),p_version:null,p_name:'Audit browser '+unit,p_unit:unit,p_minimum:2,p_opening:30,p_category:category,p_specification:'',p_item_code:null});
 const pcs=await saveItem('pcs','Cutting'),kg=await saveItem('kg','Welding');
 await command('Page.navigate',{url:base+'/2-engr/index.html'});await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');
 await go('outward-materials');await wait('document.querySelector("[data-request-form]")');
 const sites=await evaluate('[...document.querySelector("[data-field=site_id]").options].map(o=>o.value)');assert.ok(sites.includes(f.sites.casa));assert.ok(!sites.includes(f.sites.main));
 assert.deepEqual((await evaluate('[...document.querySelector("[data-field=category]").options].map(o=>o.value)')).sort(),['','Cutting','Welding']);
 const p=`[data-quantity="${pcs.id}"]`,k=`[data-quantity="${kg.id}"]`;
 assert.deepEqual(await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(p)});return [input.min,input.step,input.inputMode];})()`),['1','1','numeric']);
 await fill('[data-field=site_id]',f.sites.casa);
 // Real browser number input: typed fractions, pasted text, native spinner,
 // and the JS submit boundary when native constraint validation is bypassed.
 await evaluate(`document.querySelector(${JSON.stringify(p)}).focus()`);await command('Input.insertText',{text:'0.002'});
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(p)}).checkValidity()`),false);
 await evaluate(`document.querySelector('[data-request-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
 await wait('document.querySelector(".wa-message").textContent.includes("whole number")');
 for(const value of ['0','-2','1.5']){await fill(p,value);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(p)}).checkValidity()`),false);}
 await fill(p,'1');await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(p)});input.stepUp();input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(p)}).value`),'2');
 await fill(p,'5');await fill('[data-field=category]','Welding');assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(p)})`),false);
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(k)}).step`),'0.001');await fill(k,'0.125');
 await fill('[data-field=category]','Cutting');assert.equal(await evaluate(`document.querySelector(${JSON.stringify(p)}).value`),'5');
 await shot('audit-engineer-quantities',true);await submit('[data-request-form]');await wait('document.querySelector(".wa-message").textContent.includes("saved")');
 const request=(await f.call(a.sky,'mcpa_wa_consumables_snapshot')).requests[0];assert.equal(request.items.length,2);
 // Own profile: persistence, unique usernames, protected fields and header.
 await go('settings');await wait('document.querySelector("#profile-form")');
 assert.equal(await evaluate('document.querySelector("#profile-email").value'),'sky@example.test');
 assert.equal(await evaluate('document.querySelector("#profile-email").readOnly'),true);
 await fill('#profile-name','Engineer Sky Updated');await fill('#profile-username','sky.updated');await submit('#profile-form');await wait('document.querySelector("#profile-feedback").textContent==="Profile saved."');
 assert.equal(await evaluate('document.querySelector(".account-name").textContent'),'Engineer Sky Updated');assert.equal(await evaluate('document.querySelector(".sidebar-foot .name").textContent'),'Engineer Sky Updated');
 await shot('audit-profile-desktop',true);await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('audit-profile-mobile');
 await command('Page.reload');await wait('window.MCPAAuth?.profile?.username==="sky.updated"');await go('settings');await wait('document.querySelector("#profile-username")?.value==="sky.updated"');
 assert.equal(await evaluate('MCPAAuth.profile.role'),'engineer');
 await logout();await login('admin');await wait('MCPAAuth.profile?.role==="admin"');await go('settings');await wait('document.querySelector("#profile-form")');
 await fill('#profile-username','SKY.UPDATED');await submit('#profile-form');await wait('document.querySelector("#profile-feedback").textContent.includes("already in use")');
 // Admin approval/issuance uses each request line's registered unit.
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await go('outward-materials');await wait('document.querySelector("[data-open]")');await click('[data-open]');
 const pcsLine=request.items.find(x=>x.consumable_id===pcs.id),kgLine=request.items.find(x=>x.consumable_id===kg.id),pcApproval=`[data-line="${pcsLine.id}"]`,kgApproval=`[data-line="${kgLine.id}"]`;
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(pcApproval)}).step`),'1');assert.equal(await evaluate(`document.querySelector(${JSON.stringify(kgApproval)}).step`),'0.001');
 await fill(pcApproval,'1.5');await evaluate('document.querySelector("[data-review]").dispatchEvent(new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:document.querySelector("[data-decision=approve]")}))');
 await wait('document.querySelector(".wa-message").textContent.includes("whole number")');
 await fill(pcApproval,'5');await click('[data-decision=approve]');await wait('document.querySelector("[data-decision=issue]")');await fill(pcApproval,'5');await fill(kgApproval,'0.125');await click('[data-decision=issue]');await wait('document.querySelector(".wa-message").textContent.includes("Issuance recorded")');
 assert.equal(Number((await f.db.query('select current_stock from consumables where id=$1',[pcs.id])).rows[0].current_stock),25);
 const rejected=await f.call(a.sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'',p_items:[{consumable_id:pcs.id,unit:'pcs',quantity:5}]});
 await click('[data-action=refresh]');await wait(`document.querySelector('[data-open="${rejected.id}"]')`);await click(`[data-open="${rejected.id}"]`);
 await fill(`[data-line="${rejected.items[0].id}"]`,'1.5');await fill('[data-note]','No longer needed');await click('[data-decision=reject]');await wait('document.querySelector(".wa-message").textContent.includes("Request rejected")');
 // Both retired dispositions share the existing DISPOSED DB status.
 const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Browser retired audit',category:'Hand Tools',condition:'Good',tracking_type:'Individual',quantity:2}]});
 for(const [index,disposition]of ['sold','disposed'].entries()){const asset=imported.assets[index];const r=await f.action(a.admin,'proposeRetirement',{assetId:asset.asset_id,disposition,reason:'Audited retirement',effectiveDate:'2026-10-01'});await f.action(a.admin2,'approveRetirement',{id:r.id});}
 await go('masterlist?status=disposed');await wait('window.AdminEquipment?.loaded && document.querySelector("#statusFilter").value==="Disposed"');
 assert.ok(await evaluate(`document.querySelector('#equipmentTableBody').textContent.includes(${JSON.stringify(imported.assets[1].asset_id)})`));
 assert.ok(await evaluate(`!document.querySelector('#equipmentTableBody').textContent.includes(${JSON.stringify(imported.assets[0].asset_id)})`));
 await shot('audit-disposed-masterlist',true);await fill('#statusFilter','Sold');await wait('location.hash.includes("status=sold")');
 assert.ok(await evaluate(`document.querySelector('#equipmentTableBody').textContent.includes(${JSON.stringify(imported.assets[0].asset_id)})`));
 await command('Page.reload');await wait('window.AdminEquipment?.loaded && document.querySelector("#statusFilter").value==="Sold"');
 await go('asset-retirement-v2');await wait('document.querySelector("[data-retirement-list]")');assert.ok(await evaluate(`document.querySelector('[data-retirement-list]').textContent.includes(${JSON.stringify(imported.assets[1].asset_id)})`));
 // The original account form works even when the optional Edge service is unavailable.
 await evaluate('EquipmentTracking.client().functions.invoke=async()=>({error:{}})');
 await go('users');await wait('document.querySelector("#accounts-list tbody tr")');
 await wait('document.querySelector("#account-availability").textContent.includes("unavailable")');
 assert.equal(await evaluate('!!document.querySelector("#account-panel") && document.querySelector("#account-panel").getBoundingClientRect().height>0'),true);
 assert.equal(await evaluate('document.querySelector("#account-form button[type=submit]").disabled'),false);
 await click('[data-open-account]');assert.equal(await evaluate('document.activeElement.id'),'account-name');
 assert.equal(await evaluate('document.querySelector("#account-name").readOnly'),false);
 assert.equal(await evaluate('document.querySelector("#account-profile").value'),'__new');
 await fill('#account-name','Restored inactive profile');await fill('#account-role','secretary');await submit('#account-form');
 await wait('document.querySelector("#accounts-feedback").textContent==="Account added."');
 const original=(await f.db.query('select * from profiles where name=$1',['Restored inactive profile'])).rows[0];
 assert.equal(original.account_status,'inactive');assert.equal(original.auth_user_id,null);
 // Duplicate submission is refused, preserving one company identity.
 await fill('#account-name','Restored inactive profile');await fill('#account-role','secretary');await submit('#account-form');
 await wait('document.querySelector("#accounts-feedback").textContent.includes("person with this name exists")');
 assert.equal((await f.db.query('select count(*)::int n from profiles where name=$1',['Restored inactive profile'])).rows[0].n,1);
 await fill('#account-profile',original.id);await fill('#account-status','active');
 assert.equal(await evaluate('document.querySelector("#account-auth-id").checkValidity()'),false);
 await fill('#account-auth-id',id());await submit('#account-form');await wait('document.querySelector("#accounts-feedback").textContent.includes("verified Auth account first")');
 const linkedAuth=id();await f.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[linkedAuth,'restored-profile@example.test']);
 await fill('#account-auth-id',linkedAuth);await submit('#account-form');await wait('document.querySelector("#accounts-feedback").textContent.includes("Account access saved")');
 const linked=(await f.db.query('select * from profiles where id=$1',[original.id])).rows[0];assert.equal(linked.auth_user_id,linkedAuth);assert.equal(linked.account_status,'active');
 // New active accounts use an existing verified Auth user ID through the original RPC.
 const activeAuth=id();await f.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[activeAuth,'restored-active@example.test']);
 await click('[data-open-account]');await fill('#account-name','Restored active account');await fill('#account-role','tool_handler');await fill('#account-auth-id',activeAuth);await fill('#account-status','active');await submit('#account-form');
 await wait('document.querySelector("#accounts-feedback").textContent==="Account added."');
 const active=(await f.db.query('select * from profiles where auth_user_id=$1',[activeAuth])).rows[0];assert.equal(active.role,'tool_handler');assert.equal(active.account_status,'active');
 await command('Page.reload');await wait('window.MCPAAuth?.profile?.role==="admin" && document.querySelector("#accounts-list tbody tr")');
 await fill('#account-profile',original.id);assert.equal(await evaluate('document.querySelector("#account-auth-id").value'),linkedAuth);assert.equal(await evaluate('document.querySelector("#account-auth-id").readOnly'),true);
 await click('[data-open-account]');assert.equal(await evaluate('document.querySelector("#account-profile").value'),'__new');assert.equal(await evaluate('document.querySelector("#account-name").value'),'');
 assert.equal(await evaluate('document.querySelector("#account-form-title").getBoundingClientRect().top>=document.querySelector("#topbar").getBoundingClientRect().bottom'),true);await shot('restored-add-account-desktop',true);
 // Removed invitation controls leave access editing available.
 await go('users');await wait('document.querySelector("#accounts-list tbody tr")');
 assert.equal(await evaluate('!!document.querySelector("[data-open-invite],#invite-panel,#invitation-link-panel,[data-invite],[data-resend],[data-retry],[data-revoke]")'),false);
 await click('[data-edit]');await wait('!document.querySelector("#edit-panel").hidden');await shot('audit-accounts-desktop',true);await click('[data-close-edit]');
 // Remaining account editor saves access, and gated test-account creation works.
 await click('[data-edit]');await wait('!document.querySelector("#edit-panel").hidden');await submit('#edit-form');await wait('document.querySelector("#accounts-feedback").textContent.includes("Account access updated")');
 await wait('!document.querySelector("#development-panel").hidden');
 await fill('#development-name','Removal regression engineer');await fill('#development-email','removal-test@example.test');await fill('#development-password','Test account password 2026!');
 await click('#development-password-toggle');assert.equal(await evaluate('document.querySelector("#development-password").type'),'text');await click('#development-password-toggle');
 await submit('#development-form');await wait('document.querySelector("#accounts-feedback").textContent.includes("Test account created")');
 assert.equal(await evaluate('document.querySelector("#development-password").value'),'');assert.equal(await evaluate('document.querySelector("#development-password").type'),'password');
 assert.equal(await evaluate('!!document.querySelector("[data-open-invite],#invite-panel")'),false);
 await logout();await login('removal-test','Test account password 2026!');await wait('MCPAAuth.profile?.name==="Removal regression engineer"');assert.equal(await evaluate('MCPAAuth.profile.role'),'engineer');await logout();
 // Legacy links and interrupted old setup sessions cannot enter the app.
 for(const mode of ['link','saved']){
  await evaluate('localStorage.setItem("fixture.account","sky")');
  if(mode==='saved')await evaluate('sessionStorage.setItem("mcpa.password-setup",JSON.stringify({userId:"sky",kind:"invite"}))');
  await command('Page.navigate',{url:base+'/index.html'+(mode==='link'?'?account_setup=invite#type=invite':'')});
  await wait('document.querySelector("#auth-feedback")?.textContent.includes("no longer supported")');
  assert.equal(await evaluate('MCPAAuth.profile'),null);assert.equal(await evaluate('localStorage.getItem("fixture.account")'),null);
 }
 // Password reset still opens the password form and survives reload.
 await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');
 await evaluate('window.__authEvent("PASSWORD_RECOVERY")');await wait('document.querySelector("#auth-password")?.autocomplete==="new-password"');
 await command('Page.reload');await wait('document.querySelector("#auth-password")?.autocomplete==="new-password"');
 await fill('#auth-password','Recovered password 2026!');await submit('#auth-form');await wait('document.querySelector("#auth-feedback")?.textContent.includes("Password saved")');
 await login('sky','Recovered password 2026!');await wait('MCPAAuth.profile?.role==="engineer"');await logout();
 for(const key of ['architect','secretary','handler']){
  await login(key);await wait('window.MCPAAuth?.profile');await go('settings');await wait('document.querySelector("#profile-form")');
  await fill('#profile-name','Updated '+key);await fill('#profile-username','audit_'+key);await submit('#profile-form');await wait('document.querySelector("#profile-feedback")?.textContent==="Profile saved."');
  assert.equal(await evaluate('document.querySelector(".account-name").textContent'),'Updated '+key);assert.equal(await evaluate('MCPAAuth.profile.role'),key==='handler'?'tool_handler':key);await logout();
 }
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await login('admin');await wait('MCPAAuth.profile?.role==="admin"');await go('users');await wait('document.querySelector("#accounts-list tbody tr")');await click('[data-edit]');await wait('!document.querySelector("#edit-panel").hidden');
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await click('[data-close-edit]');await click('[data-open-account]');assert.equal(await evaluate('document.querySelector("#account-name").readOnly'),false);assert.equal(await evaluate('document.querySelector("#account-form-title").getBoundingClientRect().top>=Math.max(document.querySelector("#topbar").getBoundingClientRect().bottom,document.querySelector(".mobile-history").getBoundingClientRect().bottom)'),true);await shot('restored-add-account-mobile');
 await logout();assert.equal(await evaluate('document.querySelector("#content").children.length'),0);
 console.log('PASS Audit UI: authorized dropdowns, whole/measured quantities, profile edits for all five roles and duplicate handling, disposed/sold discovery, original Add Account with inactive/active creation, verified linking, duplicate handling and Edge outage, account access, password recovery, desktop/mobile and logout');
};
