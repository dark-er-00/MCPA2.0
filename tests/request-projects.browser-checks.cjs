// Separate browser sessions with real fixture RPCs; external HTTPS is blocked.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {create}=require('./browser-session.cjs');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,port,base,errors,artifactDirectory})=>{
 const a=f.actors,quote=JSON.stringify,empty='No assigned project site. Please contact your administrator.';
 const choices='Array.from(document.querySelector("#screen-request [name=destination]").options).filter(o=>o.value).map(o=>o.value).sort()';
 const request=(actor,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:'createRequest',p_payload:payload,p_operation_id:randomUUID()});
 const movementRows=()=>f.db.query('select * from mcpa_movements order by id').then(r=>r.rows);
 let other;
 // Only this disposable fixture is configured; never a live project assignment.
 await f.db.query("update sites set assigned_engineer_id=null where name='MCPA Development Transfer Test'");
 await f.db.query('update sites set assigned_engineer_id=$1,assigned_engineer=$2 where id=$3',[a.pau.id,a.pau.name,f.sites.main]);
 const bExtra=randomUUID(),aExtra=randomUUID(),archSite=randomUUID();
 await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id,is_active) values($1,$2,'Local fixture',$3,$4,true),($5,'Engineer A additional project','Local fixture',$6,null,true),($7,'Architect project','Local fixture',$8,null,true),($9,'Archived Engineer A site','Local fixture',$6,$10,false)",[bExtra,'Engineer B project with a long descriptive name for assigned destination selection',a.pau.name,a.pau.id,aExtra,a.sky.name,archSite,a.architect.name,randomUUID(),a.sky.id]);
 for(const id of ['ASSIGNED-B-STOCK','ASSIGNED-DRAFT-STOCK'])await f.db.query("insert into equipment(id,asset_id,name,quantity,status,site_id) values($1,$2,$3,2,'AVAILABLE',$4)",[randomUUID(),id,'Local '+id,f.sites.main]);
 const aSites=(await f.rpc(a.sky,'mcpa_movement_snapshot')).sites.filter(s=>s.is_active&&s.assigned_engineer_id===a.sky.id),bSites=(await f.rpc(a.pau,'mcpa_movement_snapshot')).sites.filter(s=>s.is_active&&s.assigned_engineer_id===a.pau.id);
 assert.equal(aSites.length,1);assert.equal(bSites.length,2);
 const aName=aSites[0].name,bName=bSites.find(s=>s.id===bExtra).name;
 const originalEquipment=(await f.db.query('select * from equipment order by id')).rows;
 const assignments=()=>f.db.query('select id,assigned_engineer_id,is_active from sites order by id').then(r=>r.rows);
 const originalAssignments=await assignments();
 try{
  await logout();await login('sky');await wait('document.querySelector(".dashboard-turnovers")');await go('request');await wait('document.querySelector("[data-request-submit]")');
  assert.equal(await evaluate('MCPAAuth.profile.id'),a.sky.id);assert.notEqual(a.sky.id,a.sky.authId);
  assert.deepEqual(await evaluate(choices),[aName]);assert.equal(await evaluate('document.querySelector("#screen-request [name=destination]").value'),aName,'One site is automatically selected');
  other=await create({port,base,errors});await other.login('pau');await other.wait('document.querySelector(".dashboard-turnovers")');await other.go('request');await other.wait('document.querySelector("[data-request-submit]")');
  assert.deepEqual(await other.evaluate(choices),bSites.map(s=>s.name).sort());assert.equal(await other.evaluate('document.querySelector("#screen-request [name=destination]").value'),'','Multiple sites require a choice');
  assert.equal(await evaluate('MCPAAuth.profile.id'),a.sky.id,'Engineer B login does not replace Engineer A session');
  for(const [width,dark]of [[1440,false],[1440,true],[393,false],[393,true]]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate('applyTheme('+dark+',false)');
   await wait('matchMedia("(max-width:768px)").matches==='+String(width<768));
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   await wait('document.querySelector("#screen-request [name=destination]").getBoundingClientRect().height>=44');
   if(width<600)assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector("#screen-request [name=destination]")).fontSize)>=16'));
   await evaluate('document.querySelector("#screen-request [name=destination]").scrollIntoView({block:"center"})');
   await shot('request-assigned-a-'+width+'-'+(dark?'night':'light'),true);
  }
  await other.command('Emulation.setDeviceMetricsOverride',{width:393,height:1000,deviceScaleFactor:1,mobile:true});await other.evaluate('applyTheme(true,false)');
  await other.fill('#mv-destination',bName);assert.ok(await other.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await other.wait('document.querySelector("#screen-request [name=destination]").getBoundingClientRect().height>=44');
  await other.evaluate('document.querySelector("#screen-request [name=destination]").focus()');
  for(const key of ['Home','End']){await other.command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Home'?36:35});await other.command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Home'?36:35});}
  assert.equal(await other.evaluate('document.querySelector("#screen-request [name=destination]").value'),bSites.map(s=>s.name).sort().at(-1),'Native keyboard choice uses assigned options');
  await other.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await other.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await other.fill('#mv-destination',bName);
  if(process.env.MCPA_SKIP_SCREENSHOTS!=='1'){await other.evaluate('document.querySelector("#screen-request [name=destination]").scrollIntoView({block:"center"})');await new Promise(resolve=>setTimeout(resolve,300));const capture=await other.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifactDirectory,'request-assigned-b-393-night.png'),Buffer.from(capture.data,'base64'));}
  assert.deepEqual((await f.db.query('select * from equipment order by id')).rows,originalEquipment,'Selecting projects changes no custody');assert.deepEqual(await assignments(),originalAssignments);
  await click('[name=toolIds][value="TOOL-001"]');await fill('#mv-purpose','Engineer A assigned project request');await submit('[data-form=create]');await wait('document.querySelector("#screen-request [data-detail][open] h2")');
  const aRequest=await evaluate('document.querySelector("#screen-request [data-detail][open] h2").textContent');
  await other.click('[name=toolIds][value="ASSIGNED-B-STOCK"]');await other.fill('#mv-purpose','Engineer B assigned project request');await other.evaluate('document.querySelector("[data-form=create]").requestSubmit()');await other.wait('document.querySelector("#screen-request [data-detail][open] h2")');
  const bRequest=await other.evaluate('document.querySelector("#screen-request [data-detail][open] h2").textContent');
  const rowA=(await f.rpc(a.sky,'mcpa_movement_snapshot')).requests.find(r=>r.id===aRequest),rowB=(await f.rpc(a.pau,'mcpa_movement_snapshot')).requests.find(r=>r.id===bRequest);
  assert.equal(rowA.destinationId,aSites[0].id);assert.equal(rowA.receiverId,a.sky.id);assert.equal(rowB.destinationId,bExtra);assert.equal(rowB.receiverId,a.pau.id);
  // Each person attempts the other's actual site through a direct authenticated RPC.
  const beforeAttacks=await movementRows();for(const [actor,destination]of [[a.sky,bName],[a.pau,aName]])await assert.rejects(request(actor,{toolIds:['ASSIGNED-DRAFT-STOCK'],destination,purpose:'Forged project'}),e=>e.code==='42501');assert.deepEqual(await movementRows(),beforeAttacks);
  // Existing Admin approval/release and intended-recipient inspection remain intact.
  await other.logout();await other.login('admin');await other.wait('document.querySelector(".admin-review")');await other.go('request?record='+aRequest);await other.wait('document.querySelector("[data-action=approve]")');await other.click('[data-action=approve]');await other.wait('document.querySelector("[data-action=release]")');await other.click('[data-action=release]');await other.wait('document.querySelector("[data-action=open-transfer]")');
  const transfer=await other.evaluate('document.querySelector("[data-action=open-transfer]").dataset.id');
  assert.ok((await f.rpc(a.sky,'mcpa_monitoring_snapshot')).notifications.some(n=>n.entityId===transfer&&n.title==='Equipment Pending Turnover'));
  await evaluate('showScreen('+quote('transfer?record='+transfer)+')');await wait('document.querySelector("#screen-transfer.active [data-form=receive]")');await fill('[data-condition]','good');await click('[data-tested]');await submit('[data-form=receive]');await wait('document.querySelector("[data-notice]").textContent.includes("Receipt confirmed")');
  assert.equal((await f.rpc(a.sky,'mcpa_personal_equipment_snapshot')).tools.find(t=>t.id==='TOOL-001').holderId,a.sky.id);
  await go('request');await wait('document.querySelector("[data-request-submit]")');await click('[name=toolIds][value="ASSIGNED-DRAFT-STOCK"]');await fill('#mv-purpose','Draft must survive assignment refresh');
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.sky.id,aExtra]);await evaluate('__tickSync()');await wait('document.querySelector("#screen-request [name=destination]").options.length===3');
  assert.equal(await evaluate('document.querySelector("#screen-request [name=destination]").value'),aName,'A valid draft selection survives new assignments');
  await fill('#mv-destination','Engineer A additional project');await f.db.query('update sites set assigned_engineer_id=null where id=$1',[aExtra]);await evaluate('__tickSync()');await wait('document.querySelector("#screen-request [name=destination]").options.length===1');assert.equal(await evaluate('document.querySelector("#screen-request [name=destination]").value'),aName);
  await f.db.query('update sites set assigned_engineer_id=null where id=$1',[f.sites.casa]);await evaluate('__tickSync()');await wait('document.querySelector("[data-request-submit]").disabled');
  assert.equal(await evaluate('document.querySelector("#mv-request-project-status").textContent'),empty);assert.ok(await evaluate('document.querySelector("#screen-request [name=destination]").disabled'));
  assert.equal(await evaluate('document.querySelector("#mv-purpose").value'),'Draft must survive assignment refresh');assert.ok(await evaluate('document.querySelector("[name=toolIds][value=ASSIGNED-DRAFT-STOCK]").checked'));
  const historical=await movementRows(),writes=calls.filter(c=>c.rpc==='mcpa_movement_action').length;
  await evaluate('(()=>{const select=document.querySelector("#screen-request [name=destination]");select.disabled=false;select.add(new Option('+quote(bName)+','+quote(bName)+'));select.value='+quote(bName)+';document.querySelector("[data-request-submit]").disabled=false;document.querySelector("[data-form=create]").requestSubmit();})()');
  await wait('document.querySelector("[data-notice]").textContent.includes('+quote(empty)+')');assert.equal(calls.filter(c=>c.rpc==='mcpa_movement_action').length,writes);assert.deepEqual(await movementRows(),historical);
  await evaluate('__tickSync()');await wait('document.querySelector("[data-request-submit]").disabled');
  for(const dark of [false,true]){await evaluate('applyTheme('+dark+',false);document.querySelector("#mv-request-project-status").scrollIntoView({block:"center"})');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('request-no-project-393-'+(dark?'night':'light'),true);}
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.sky.id,f.sites.casa]);await evaluate('__tickSync()');await wait('!document.querySelector("[data-request-submit]").disabled');assert.equal(await evaluate('document.querySelector("#screen-request [name=destination]").value'),aName);
  await logout();await login('architect');await wait('document.querySelector(".dashboard-turnovers")');await go('request');await wait('document.querySelector("[data-request-submit]")');assert.ok(await evaluate('document.querySelector("[data-request-submit]").disabled'));assert.equal(await evaluate('document.querySelector("#mv-request-project-status").textContent'),empty);
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,archSite]);await evaluate('__tickSync()');await wait('!document.querySelector("[data-request-submit]").disabled');assert.equal(await evaluate('document.querySelector("#screen-request [name=destination]").value'),'Architect project');await click('[name=toolIds][value="ASSIGNED-DRAFT-STOCK"]');await fill('#mv-purpose','Architect assigned project request');await submit('[data-form=create]');await wait('document.querySelector("#screen-request [data-detail][open] h2")');
  await f.db.query('update sites set assigned_engineer_id=null where id=$1',[archSite]);assert.deepEqual(await assignments(),originalAssignments,'All controlled assignment changes were restored; no unrelated assignments changed');
  console.log('PASS independent Engineer A/B assigned options, single auto-selection, multiple native choice, Architect no-site/assigned request, tampered RPC/form rejection, draft-preserving assignment refresh, approval/release/notice/tested receipt, desktop/mobile themes and unchanged saved history');
 }finally{await other?.close();}
};
