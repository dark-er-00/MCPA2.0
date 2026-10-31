const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,shot})=>{
  const q=JSON.stringify;
  await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'MCPA Development Receiving Test A','Isolated local fixture','Engr Pau',$2)",[randomUUID(),f.actors.pau.id]);
  await f.db.exec("alter type equipment_status add value if not exists 'IN_OFFICE'");
  const cases=[
    ['T-8861','Pala','AVAILABLE',null,f.sites.main,'Good',1,'available'],
    ['T-8862','Welding Machine','AVAILABLE',null,null,'Good',1,'transfer'],
    ['T-6254','Metal Tube','AVAILABLE',null,f.sites.office,'Good',1,'available'],
    ['T-RESERVED','Reserved drill','AVAILABLE',null,f.sites.main,'Good',1,'reserved'],
    ['T-HANDOVER','Pending handover','AVAILABLE',null,f.sites.main,'Good',1,'transfer'],
    ['T-ASSIGNED','Recorded available but held','AVAILABLE',f.actors.sky.id,f.sites.casa,'Good',1,'assigned'],
    ['T-MISSING','Missing stock','MISSING',null,null,'Good',1,'missing'],
    ['T-DAMAGED','Damaged stock','AVAILABLE',null,null,'Damaged',1,'damaged'],
    ['T-INUSE','Assigned tool','IN_USE',f.actors.sky.id,f.sites.casa,'Good',1,'deployed'],
    ['T-ZERO','Zero stock','AVAILABLE',null,null,'Good',0,'empty'],
    ['T-OFFICE','Legacy office stock','IN_OFFICE',null,f.sites.main,'Good',1,'status']
  ];
  for(const [asset,name,status,holder,site,condition,quantity] of cases)await f.db.query('insert into equipment(id,asset_id,name,status,current_holder_id,site_id,condition,quantity) values($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),asset,name,status,holder,site,condition,quantity]);
  const action=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
  let weldingRequest;
  for(const asset of ['T-RESERVED','T-HANDOVER','T-8862']){
    if(asset==='T-8862')await f.db.exec("select setval('mcpa_movement_number',12)");
    const request=await action(f.actors.sky,'createRequest',{toolIds:[asset],destination:'Casa Buena',purpose:'Private inventory fixture'});
    await action(f.actors.admin,'approveRequest',{id:request.id});
    if(asset!=='T-RESERVED')await action(f.actors.admin,'releaseRequest',{id:request.id});
    if(asset==='T-8862')weldingRequest=request;
  }
  await go('masterlist');await wait('equipmentList.length>=9');
  await evaluate('itemsPerPage=50;renderTable()');
  for(const [asset,,,,,,,code] of cases){
    const actual=await evaluate(`(()=>{const row=[...document.querySelectorAll('#equipmentTableBody tr')].find(row=>row.querySelector('.tool-id-chip')?.textContent===${q(asset)});return {code:row?.querySelector('[data-requestability]')?.dataset.requestability,text:row?.textContent};})()`);
    assert.equal(actual.code,code,asset);assert.match(actual.text,/Recorded status/);assert.match(actual.text,/New requests/);
  }
  for(const width of [375,393,430,768,1440])for(const dark of [false,true]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1000});
    await evaluate(`applyTheme(${dark},false)`);await fill('#searchEquipment','T-8861');await evaluate('filterAndResetPage()');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'No page overflow '+width);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#equipmentTableBody .tool-id-chip')).whiteSpace"),'nowrap');
    const sizing=await evaluate("(()=>{const el=document.querySelector('.equipment-status');return {width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+1};})()");
    assert.ok(sizing.width>=190&&!sizing.overflow,'Readable status labels '+width);
    await evaluate("document.querySelector('#equipmentTableBody .equipment-status').scrollIntoView({block:'center',inline:'end'})");
    if([375,1440].includes(width))await shot(`inventory-status-${width}-${dark?'dark':'light'}`,true);
  }
  await fill('#searchEquipment','T-8862');await evaluate('filterAndResetPage()');
  await shot('admin-welding-pending-receipt',true);
  await go('tool-profile?record=T-RESERVED');
  assert.equal(await evaluate("document.querySelector('#profileContent [data-requestability]').dataset.requestability"),'reserved');
  const picker=()=>evaluate("[...document.querySelectorAll('[data-form=create] input[name=toolIds]')].map(el=>el.value)");

  await logout();await login('pau');await wait("MCPAAuth.profile?.id==="+q(f.actors.pau.id));await go('request');
  await wait("document.querySelector('[data-form=create]')");
  assert.ok(!(await evaluate('MovementStore.getState().requests')).some(r=>r.toolIds.includes('T-RESERVED')),'Another engineer cannot see the private reservation');
  for(const asset of ['T-8861','T-6254'])assert.ok((await picker()).includes(asset));
  for(const [asset,,,,,,,code] of cases.filter(row=>row[7]!=='available'))assert.ok(!(await picker()).includes(asset),asset+' excluded: '+code);
  await shot('engineer-verified-availability',true);
  await evaluate(`window.__legacyAvailability=true;MovementStore.refresh()`);
  await wait("document.querySelector('[data-availability-warning]')?.textContent.includes('server did not provide')");
  assert.equal((await picker()).length,0,'Legacy scoped RPC cannot prove unreserved stock');
  assert.ok(await evaluate("document.querySelector('[data-summary]').textContent.includes('Unverified')"));
  assert.ok(await evaluate("document.querySelector('.mv-empty-tools').textContent.includes('not been confirmed unavailable')"));
  await evaluate('window.__legacyAvailability=false;MovementStore.refresh()');await wait("document.querySelector('[name=toolIds][value=\"T-6254\"]')");
  await click('[name=toolIds][value="T-6254"]');await fill('#mv-purpose','Retain this draft during a verification failure');
  await evaluate('window.__failReads=true;MovementStore.refresh().catch(()=>{})');
  await wait("document.querySelector('[data-availability-warning]')?.textContent.includes('verification failed')");
  assert.equal((await picker()).length,0,'Cached inventory is disabled after failed verification');
  assert.equal(await evaluate("document.querySelector('#mv-purpose').value"),'Retain this draft during a verification failure');
  await shot('engineer-availability-verification-failed',true);
  await evaluate('window.__failReads=false;MovementStore.refresh()');await wait("document.querySelector('[name=toolIds][value=\"T-6254\"]')");
  await logout();await login('sky');await wait("MCPAAuth.profile?.id==="+q(f.actors.sky.id));await go('masterlist');
  await wait("document.querySelector('[data-tool=\"T-ASSIGNED\"]')");
  assert.equal(await evaluate("document.querySelector('[data-tool=\"T-ASSIGNED\"]').closest('tr').querySelector('[data-requestability]').dataset.requestability"),'assigned');
  await click('[data-tool="T-ASSIGNED"]');await wait("document.querySelector('#equipment-detail')?.open && !MCPANavigation.restoring");
  assert.equal(await evaluate("document.querySelector('#equipment-detail [data-requestability]').dataset.requestability"),'assigned');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
  await go('request');await wait("document.querySelector('[data-list]')?.textContent.includes('Released / Awaiting Receipt')");
  await click(`[data-action="view"][data-id="${weldingRequest.id}"]`);
  await wait("document.querySelector('[data-detail][open]')");
  await shot('welding-released-awaiting-receipt',true);
  console.log('PASS Admin/Engineer inventory, details and Request Tools share stock rules; hidden locks, custody, condition, quantity and project locations verified at 375/393/430/768/1440 in both themes');
};
