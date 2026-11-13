// Uses the existing local PostgreSQL/Auth fixture. HTTPS remains blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,base,calls})=>{
  const directory=path.join(__dirname,'artifacts/terminology');fs.mkdirSync(directory,{recursive:true});
  const action=(actor,name,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:randomUUID()});
  const request=await action(f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Local terminology regression'});
  await action(f.actors.admin,'approveRequest',{id:request.id});
  const transfer=await action(f.actors.admin,'releaseRequest',{id:request.id});
  await action(f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true,disposition:'accepted'}]});
  await f.db.query('insert into mcpa_account_audit(actor_id,profile_id,event) values($1,$2,$3)',[f.actors.admin.id,f.actors.sky.id,'person_renamed']);
  const original=(await f.db.query("select status,current_holder_id,site_id from equipment where asset_id='TOOL-001'")).rows;
  await command('Page.navigate',{url:base+'/index.html'});await login('admin');
  await wait('document.querySelector(".admin-review")');
  const titles=['Equipment Request Submitted','Equipment Request Approved','Equipment Released for Transfer','Transfer Received'];
  const noRaw=async selector=>{
    const text=await evaluate('document.querySelector('+JSON.stringify(selector)+').innerText');
    assert.doesNotMatch(text,/\b(?:createRequest|approveRequest|releaseRequest|receiveTransfer|person_renamed|tool_handler)\b/);
    return text;
  };
  for(const title of titles)assert.ok((await noRaw('.asset-timeline')).includes(title),title);
  await go('activity');await wait('document.querySelector(".activity-record-link")');
  let text=await noRaw('#overview-results');for(const title of titles)assert.ok(text.includes(title),title);
  assert.ok(text.includes(f.actors.sky.name));assert.ok(text.includes(request.id));assert.match(text,/\d+:\d+:\d+/);
  await fill('#movement-activity-search','Transfer Received');await wait('document.querySelectorAll("#overview-results tbody tr").length===1');
  assert.ok((await noRaw('#overview-results')).includes('inspection and receipt outcome'));
  await fill('#movement-activity-search','');
  for(const [width,mobile]of [[1440,false],[393,true]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile});
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'Activity page width '+width);
    const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(directory,'activity-'+width+'.png'),Buffer.from(data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const events=await evaluate('MovementStore.getState().activity');
  assert.ok(events.some(e=>e.action==='receiveTransfer'),'Repository keeps the original API action');
  await go('masterlist?record=TOOL-001');await wait('document.querySelector(".timeline")?.textContent.includes("Transfer Received")');
  await noRaw('.timeline');
  await go('reports');await wait('document.querySelector("#report-results").getAttribute("aria-busy")==="false"');
  await fill('#report-kind','activity');text=await noRaw('#report-results');
  for(const title of titles)assert.ok(text.includes(title),'Report: '+title);
  const pdfRows=await evaluate('SiteTracePDF.activityRows(MovementStore.getState().activity)');
  assert.ok(pdfRows.some(row=>row[1]==='Transfer Received'));assert.doesNotMatch(JSON.stringify(pdfRows),/receiveTransfer|approveRequest/);
  await go('users');await wait('document.querySelector("[data-audit]")');
  await evaluate('document.querySelector("[data-audit]").closest("details").open=true');await click('[data-audit]');
  await wait('document.querySelector("#account-audit").textContent.includes("Person Name Updated")');
  text=await noRaw('#account-audit');assert.ok(text.includes(f.actors.sky.name));
  assert.ok(!text.includes(f.actors.sky.id));assert.ok(!text.includes(f.actors.admin.id));
  await go('site-detail?record='+f.sites.casa);await wait('document.querySelector("[data-action=project-history]")');
  await click('[data-action=project-history]');await wait('document.querySelector("#project-history-events")');
  text=await noRaw('#project-history-events');assert.doesNotMatch(text,/assigned_engineer_id|\{\s*"/);
  await click('#sites-dialog [data-action=close-dialog]');
  await go('dashboard');await wait('document.querySelector(".asset-timeline")');
  for(const [width,mobile]of [[1440,false],[393,true]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile});
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'Dashboard width '+width);
    const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(directory,'dashboard-'+width+'.png'),Buffer.from(data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const [key,role]of [['sky','engineer'],['architect','architect'],['secretary','secretary'],['handler','tool_handler']]){
    await logout();await login(key);await wait('MCPAAuth.profile?.role==='+JSON.stringify(role)+' && !document.querySelector("#app-shell").classList.contains("hidden")');
    await noRaw('#app-shell');
    if(key==='sky'){
      await go('activity');await wait('document.querySelector(".activity-record-link")');
      assert.ok((await noRaw('#overview-results')).includes('Transfer Received'));
      await go('request');await wait('document.querySelector("[data-list]")?.textContent.includes("Received / Completed")');
      const status=await evaluate('document.querySelector("[data-list]").innerText');assert.doesNotMatch(status,/received|inuse/);
    }
    assert.equal(await evaluate('MCPAAuth.canRoute("users")'),false,'User management remains restricted for '+role);
  }
  assert.deepEqual((await f.db.query("select status,current_holder_id,site_id from equipment where asset_id='TOOL-001'")).rows,original,'Viewing records never alters inventory or custody');
  assert.ok(!calls.some(c=>['architect','secretary'].includes(c.actor)&&c.table==='mcpa_account_audit'));
  console.log('PASS terminology: real request/approval/release/receipt; histories, search, reports/PDF, accounts, projects, five roles and desktop/mobile layouts');
};
