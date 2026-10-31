const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {create}=require('./browser-session.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.verify=async ({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,port,base,errors})=>{
 const a=fixture.actors,quote=JSON.stringify;let admin;
 const until=async(expression,timeout=40000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(100);}throw Error('Turnover check timed out: '+expression);};
 const data=async() => fixture.rpc(a.sky,'mcpa_movement_snapshot');
 const notices=async() => (await fixture.db.query("select * from mcpa_notifications where recipient_id=$1 order by id",[a.sky.id])).rows;
 const ids=['BROWSER-TURNOVER-A','BROWSER-TURNOVER-B'];
 for(const [i,id]of ids.entries())await fixture.db.query("insert into equipment(id,asset_id,name,quantity,status) values($1,$2,$3,$4,'AVAILABLE')",[randomUUID(),id,i?'Long construction equipment name '+('for field handover '.repeat(6)):'Training drill',i?3:1]);
 const originalProjects=(await fixture.db.query('select * from sites order by id')).rows;
 const existingRequest=await fixture.rpc(a.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Existing request for automatic My Requests synchronization'},p_operation_id:randomUUID()});
 await fixture.db.query("insert into equipment(id,asset_id,name,quantity,status) values($1,'BROWSER-REJECTED','Training rejected request tool',1,'AVAILABLE')",[randomUUID()]);
 const rejectedRequest=await fixture.rpc(a.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['BROWSER-REJECTED'],destination:'Casa Buena',purpose:'Request rejection visibility'},p_operation_id:randomUUID()});
 try{
  await logout();await login('sky');await wait('document.querySelector(".dashboard-requests")');
  assert.notEqual(await evaluate('MCPAAuth.profile.id'),a.sky.authId,'Company profile and Auth UUID differ');
  await go('request');await wait('document.querySelector("[data-form=create]")');
  for(const id of ids)await click('[name=toolIds][value="'+id+'"]');await fill('#mv-destination','Casa Buena');await fill('#mv-purpose','Isolated cross-device turnover test');await submit('[data-form=create]');
  await wait('document.querySelector("[data-detail][open]")');
  const requestId=await evaluate('document.querySelector("[data-detail][open] h2").textContent');
  assert.equal((await data()).requests.find(r=>r.id===requestId).status,'pending');
  await go('dashboard');await wait('document.querySelector("[data-request-id='+requestId+']")');
  assert.ok(await evaluate('document.querySelector("[data-request-id='+requestId+']").textContent.includes("Pending Review")'));
  assert.ok(await evaluate('document.querySelector(".dashboard-turnovers").textContent.includes("No equipment is currently awaiting your confirmation")'));
  admin=await create({port,base,errors});await admin.login('admin');await admin.wait('document.querySelector(".admin-review")');
  assert.equal(await evaluate('MCPAAuth.profile.role'),'engineer','Independent Admin login does not change Engineer session');
  await evaluate('window.__fixtureRealtime=false');await admin.go('request?record='+encodeURIComponent(requestId));await admin.wait('document.querySelector("[data-detail][open] [data-action=approve]")');
  const approvedAt=Date.now();await admin.click('[data-action=approve]');await admin.wait('document.querySelector("[data-detail][open] [data-action=release]")');
  // No __tickSync, focus event, browser reload or notification transport trigger:
  // wait for the actual existing 30-second foreground fallback timer.
  await until('document.querySelector("[data-request-id='+requestId+']")?.textContent.includes("Approved")');
  const fallbackMs=Date.now()-approvedAt;assert.ok(fallbackMs<40000,'Foreground fallback is bounded');
  console.log('PASS independent Engineer/Admin sessions; approval auto-refreshed via actual 30-second fallback in '+fallbackMs+' ms');
  await evaluate('window.__fixtureRealtime=true');await wait('window.__fixtureRealtimeReady');
  await admin.click('[data-action=release]');await admin.wait('document.querySelector("[data-detail][open] [data-action=open-transfer]")');
  const transferId=await admin.evaluate('document.querySelector("[data-detail][open] [data-action=open-transfer]").dataset.id');
  await wait('document.querySelector("[data-turnover-id='+transferId+']")');
  assert.ok(await evaluate('document.querySelector("[data-request-id='+requestId+']").textContent.includes("Released / Awaiting Receipt")'));
  const turnoverNotice=(await notices()).find(n=>n.entity_id===transferId&&n.title==='Equipment Pending Turnover');assert.ok(turnoverNotice);assert.equal(turnoverNotice.recipient_id,a.sky.id);
  await wait('MCPAMonitoring.getState().notifications.some(n=>n.id==='+quote(turnoverNotice.id)+')');
  assert.ok(!(await fixture.rpc(a.sky,'mcpa_personal_equipment_snapshot')).tools.some(t=>ids.includes(t.id)),'Released stock is not confirmed personal custody');
  const sourceTools=(await fixture.db.query("select * from equipment where asset_id in ($1,$2) order by id",ids)).rows;
  assert.ok(sourceTools.every(t=>t.current_holder_id===null&&t.status==='AVAILABLE'));
  assert.ok(!calls.some(c=>c.actor==='sky'&&c.table==='equipment'),'Field dashboard avoids direct company equipment fetches');
  const operation=(await fixture.db.query("select id from mcpa_movement_operations where action='releaseRequest' and result->>'id'=$1",[transferId])).rows[0].id;
  await fixture.rpc(a.admin,'mcpa_movement_action',{p_action:'releaseRequest',p_payload:{id:requestId},p_operation_id:operation});
  await evaluate('window.__tickSync()');await wait('document.querySelector("[data-turnover-id='+transferId+']")');assert.equal((await notices()).filter(n=>n.entity_id===transferId&&n.data.action==='releaseRequest').length,1);
  const baseline=await data(),writes=()=>calls.filter(c=>c.rpc==='mcpa_movement_action').length;
  for(const [width,dark]of [[1440,false],[1440,true],[393,false],[393,true]]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate('applyTheme('+dark+',false)');
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Dashboard fits '+width+' '+dark);
   await wait('matchMedia("(max-width:600px)").matches==='+String(width<600));
   await wait('document.getElementById("dashboard-turnover-'+transferId+'").getBoundingClientRect().height>='+String(width<600?44:40));
   const controls=await evaluate('(()=>{const e=document.getElementById("dashboard-turnover-'+transferId+'");const r=e.getBoundingClientRect();return {height:r.height,minHeight:getComputedStyle(e).minHeight,width:innerWidth,font:parseFloat(getComputedStyle(e).fontSize)};})()');assert.ok(controls.height>=(width<600?44:40),JSON.stringify(controls));
   if(width===393)await evaluate('document.querySelector(".dashboard-workflow").scrollIntoView({block:"start"})');
   await shot('turnover-dashboard-'+width+'-'+(dark?'night':'light'),true);
  }
  assert.deepEqual(await data(),baseline,'Theme/responsive review preserves movements');
  await command('Emulation.setDeviceMetricsOverride',{width:393,height:1000,deviceScaleFactor:1,mobile:true});
  for(const dark of [false,true]){
   await evaluate('applyTheme('+dark+',false);document.querySelector(".bell-wrap").click()');await wait('document.querySelector("#monitoring-dialog[open]")');
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Notification dialog fits mobile');
   await wait('document.querySelector('+quote('[data-monitoring-notice="'+turnoverNotice.id+'"]')+').getBoundingClientRect().height>=44');
   await shot('turnover-notification-mobile-'+(dark?'night':'light'),true);await click('[data-monitoring-close]');
  }
  await evaluate('MCPAMonitoring.open()');await wait('document.querySelector("#monitoring-dialog[open]")');
  const writesBefore=writes();await click('[data-monitoring-notice="'+turnoverNotice.id+'"]');
  await wait('document.querySelector("#screen-transfer.active [data-detail][open] h2")?.textContent==='+quote(transferId));
  assert.equal(await evaluate('document.querySelector("[data-transfer-tab=receive]").getAttribute("aria-selected")'),'true');
  assert.ok(await evaluate('document.querySelector("[data-form=receive]")!==null'));
  assert.equal(writes(),writesBefore,'Notification click does not perform receipt');
  assert.deepEqual((await fixture.db.query("select * from equipment where asset_id in ($1,$2) order by id",ids)).rows,sourceTools);
  assert.ok((await notices()).find(n=>n.id===turnoverNotice.id).read_at,'Read state persists');
  await shot('turnover-receipt-mobile',true);
  // Permission checks use a second authenticated Engineer, not just UI filters.
  await admin.logout();await admin.login('pau');await admin.go('dashboard');await admin.wait('document.querySelector(".dashboard-turnovers")');
  assert.ok(await admin.evaluate('!document.querySelector("[data-turnover-id='+transferId+']")'));
  await admin.go('transfer?record='+encodeURIComponent(transferId));await admin.wait('document.querySelector("[data-notice]")?.textContent.includes("unavailable")');
  assert.ok(await admin.evaluate('!document.querySelector("[data-detail][open]")'));
  const denied=await admin.evaluate('EquipmentTracking.client().rpc("mcpa_movement_action",{p_action:"receiveTransfer",p_payload:{id:'+quote(transferId)+',receiverId:'+quote(a.sky.id)+',inspections:[{toolId:'+quote(ids[0])+',condition:"good",tested:true},{toolId:'+quote(ids[1])+',condition:"good",tested:true}]},p_operation_id:crypto.randomUUID()})');assert.equal(denied.error.code,'42501');
  for(const id of ids)await fill('[data-inspection="'+id+'"] [data-condition]','good');
  await submit('[data-form=receive]');await wait('document.querySelector("[data-modal-feedback]")?.textContent.includes("Test each received tool")');
  assert.deepEqual((await fixture.db.query("select * from equipment where asset_id in ($1,$2) order by id",ids)).rows,sourceTools,'Untested UI receipt keeps custody');
  for(const id of ids)await click('[data-inspection="'+id+'"] [data-tested]');await submit('[data-form=receive]');
  await wait('document.querySelector("[data-detail][open]")?.textContent.includes("Receipt confirmed")');
  await go('dashboard');await wait('document.querySelector(".dashboard-turnovers")');assert.ok(await evaluate('!document.querySelector("[data-turnover-id='+transferId+']")'));
  assert.ok(await evaluate('document.querySelector("[data-request-id='+requestId+']")?.textContent.includes("Received / Completed")'));
  await go('request');await wait('document.querySelector("[data-list]")');assert.ok(await evaluate('document.querySelector("[data-list]").textContent.includes("Received / Completed")'));
  await go('masterlist');await wait('document.querySelector("#movement-inventory-search")');
  const personal=await fixture.rpc(a.sky,'mcpa_personal_equipment_snapshot');assert.ok(ids.every(id=>personal.tools.some(t=>t.id===id&&t.holderId===a.sky.id)));
  assert.ok(await evaluate(ids.map(id=>'document.body.innerText.includes('+quote(id)+')').join('&&')));
  await go('activity');await wait('document.querySelector("#movement-activity-search")');assert.ok(await evaluate('document.body.innerText.includes("Transfer Received")&&document.body.innerText.includes('+quote(transferId)+')'));
  await evaluate('MCPAMonitoring.open()');await wait('document.querySelector("#monitoring-dialog[open]")');await click('[data-monitoring-notice="'+turnoverNotice.id+'"]');
  await wait('document.querySelector("[data-detail][open] h2")?.textContent==='+quote(transferId));assert.ok(await evaluate('!document.querySelector("[data-form=receive]")'),'Old notice opens completed detail without receipt action');assert.equal(await evaluate('document.querySelector("[data-transfer-tab=history]").getAttribute("aria-selected")'),'true');
  await admin.logout();await admin.login('admin');await go('request');await wait('document.querySelector("[data-list]")');
  await admin.go('request?record='+encodeURIComponent(rejectedRequest.id));await admin.wait('document.querySelector("[data-form=reject]")');await admin.fill('#mv-reason','Isolated test: different equipment required');await admin.evaluate('document.querySelector("[data-form=reject]").requestSubmit()');
  await wait('document.querySelector("[data-list]").textContent.includes("Rejected")');
  await admin.go('request?record='+encodeURIComponent(existingRequest.id));await admin.wait('document.querySelector("[data-action=approve]")');await admin.click('[data-action=approve]');
  await wait('MovementStore.getState().requests.find(r=>r.id==='+quote(existingRequest.id)+')?.status==="approved" && document.querySelector("[data-list]").textContent.includes("Approved")');
  await admin.wait('document.querySelector("[data-action=release]")');await admin.click('[data-action=release]');
  await wait('MovementStore.getState().requests.find(r=>r.id==='+quote(existingRequest.id)+')?.status==="released" && document.querySelector("[data-list]").textContent.includes("Released / Awaiting Receipt")');
  console.log('PASS My Requests updates rejection/approval/release while it remains open, through modeled own-notification Realtime');
  await go('dashboard');await wait('document.querySelector(".dashboard-turnovers")');await click('[data-turnover-inbox]');await wait('document.querySelector("[data-transfer-tab=receive]")?.getAttribute("aria-selected")==="true"');
  for(const route of ['dashboard','request','transfer','masterlist','dashboard']){await go(route);await wait('document.querySelector("#screen-'+route+'.active")');await pause(100);assert.ok(await evaluate('__channels.size<=2&&__syncTimers.size<=2'),'Navigation does not accumulate subscriptions/timers');}
  await logout();await login('architect');await wait('document.querySelector(".dashboard-turnovers")');assert.ok(await evaluate('document.querySelector(".dashboard-turnovers").textContent.includes("No equipment is currently awaiting your confirmation")'));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await shot('turnover-architect-empty',true);
  assert.deepEqual((await fixture.db.query('select * from sites order by id')).rows,originalProjects,'Project assignments are preserved');
  console.log('PASS request/release/notification/exact mobile record/testing/receipt/history; wrong profile denied; duplicate-safe notices; desktop/mobile in both themes; Architect empty state; subscription cleanup');
 }finally{await admin?.close();}
};
