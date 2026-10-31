const assert=require('node:assert/strict');
exports.verify=async({evaluate,wait,fill,click,command,login,logout,fixture,shot,calls})=>{
  const search=async value=>{await evaluate("if(matchMedia('(max-width:900px)').matches&&!document.querySelector('#global-search-panel').classList.contains('is-open'))openMobileSearch()");await fill('#global-search-input',value);await wait("!document.querySelector('#global-search-results').hidden && !document.querySelector('.global-search-status').textContent.startsWith('Searching')");};
  const rows=()=>evaluate("[...document.querySelectorAll('#global-search-list [role=option]')].map(n=>({key:n.dataset.key,text:n.textContent}))");
  const key=async value=>command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value});
  await search('TOOL-001');assert.ok((await rows()).some(r=>r.key==='masterlist:TOOL-001'));
  assert.equal(await evaluate('location.hash'),'#dashboard','Typing never navigates');
  const reads=calls.length;await search('TOOL-002');await search('TOOL-001');assert.equal(calls.length,reads,'Repeated queries reuse the authorized cache');
  await evaluate("showScreen('masterlist')");await wait("document.querySelector('#searchEquipment')");
  await fill('#searchEquipment','independent');await search('TOOL-001');
  assert.equal(await evaluate("document.querySelector('#searchEquipment').value"),'independent');
  await click('.global-search-clear');assert.equal(await evaluate("document.querySelector('#searchEquipment').value"),'independent');
  await search('TOOL-001');await key('ArrowDown');assert.ok(await evaluate("!!document.querySelector('#global-search-input').getAttribute('aria-activedescendant')"));await key('Enter');
  await wait("location.hash==='#masterlist?record=TOOL-001' && document.querySelector('#profileContent')?.textContent.includes('TOOL-001')");
  await evaluate('history.back()');await wait("location.hash==='#masterlist' && document.querySelector('#searchEquipment')?.value==='independent'");
  await evaluate('history.forward()');await wait("location.hash==='#masterlist?record=TOOL-001'");
  await evaluate("showScreen('dashboard')");await wait("document.querySelector('.admin-review')");
  await search('Casa');const project=(await rows()).find(r=>r.key.startsWith('sites:'));assert.ok(project);
  await click('[data-key="'+project.key+'"]');await wait("location.hash.startsWith('#site-detail?record=') && document.querySelector('#screen-site-detail.active')");
  await evaluate("showScreen('activity')");await wait("document.querySelector('#overview-results')");
  const act=(action,payload)=>fixture.rpc(fixture.actors.sky,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:require('node:crypto').randomUUID()});
  const request=await act('createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Search regression'});
  await fixture.db.query('update sites set assigned_engineer_id=$1 where id=$2',[fixture.actors.pau.id,fixture.sites.main]);
  const transfer=await act('createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:fixture.actors.pau.id});
  const repair=await act('reportRepair',{toolId:'TOOL-003',notes:'Search regression'});
  await evaluate('MovementStore.refresh()');
  for(const [kind,record] of [['request',request],['transfer',transfer],['repair',repair]]){
    await search(record.id);assert.ok((await rows()).some(r=>r.key===kind+':'+record.id));
    await click('[data-key="'+kind+':'+record.id+'"]');
    await wait(`location.hash===${JSON.stringify('#'+kind+'?record='+record.id)} && !!document.querySelector('dialog[open]')`);
    await evaluate("showScreen('activity')");await wait("document.querySelector('#overview-results')");
  }
  const uuid=require('node:crypto').randomUUID, material=uuid(), purchase=uuid();
  await fixture.db.query("insert into consumables(id,name,unit,current_stock) values($1,'Search material','pcs',8)",[material]);
  await fixture.rpc(fixture.actors.secretary,'mcpa_save_purchase',{p_id:purchase,p_version:null,p_operation_id:uuid(),p_record:{supplier:'Search supplier',reference:'SEARCH-INVOICE',purchase_date:'2026-10-15',items:[{description:'Search material',quantity:'2',unit_price:'10'}]}});
  await evaluate('MCPAGlobalSearch.reset()');
  for(const [query,route,record] of [['Search supplier','purchase',purchase],['Search material','consumables',material]]){
    await search(query);await click('[data-key="'+route+':'+record+'"]');
    await wait(`location.hash===${JSON.stringify('#'+route+'?record='+record)} && !!document.querySelector('dialog[open]')`);
    await evaluate('history.back()');await wait("location.hash==='#activity' && !MCPANavigation.restoring");
  }
  await search('Current inventory report');await click('[data-key="reports:current"]');
  await wait("location.hash==='#reports?record=current' && document.querySelector('#report-kind')?.value==='current'");
  await evaluate('history.back()');await wait("location.hash==='#activity' && !MCPANavigation.restoring");
  await evaluate("(()=>{const style=document.createElement('style');style.id='scroll-fixture';style.textContent='#overview-results{min-height:2200px}';document.head.append(style)})()");
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:900,y:500,deltaX:0,deltaY:450});await wait('scrollY>0');
  await search('TOOL-001');const scroll=await evaluate('scrollY');assert.ok(scroll>0);
  await click('[data-key="masterlist:TOOL-001"]');await wait("location.hash==='#masterlist?record=TOOL-001' && !MCPANavigation.restoring");
  await evaluate('history.back()');await wait(`location.hash==='#activity' && !MCPANavigation.restoring && Math.abs(scrollY-${scroll})<2`);
  await evaluate("document.querySelector('#scroll-fixture').remove();scrollTo(0,0)");
  const listenerCount=async()=>{const response=await command('Runtime.evaluate',{expression:"getEventListeners(document.querySelector('#global-search-input')).keydown.length",includeCommandLineAPI:true,returnByValue:true});return response.result.value;};
  assert.equal(await listenerCount(),1,'Module reloads do not duplicate search keyboard listeners');
  await evaluate(`(()=>{const original=EquipmentTracking.snapshot;window.__restoreInventory=()=>{EquipmentTracking.snapshot=original;MCPAGlobalSearch.reset()};EquipmentTracking.snapshot=async()=>({tools:Array.from({length:1201},(_,i)=>({id:'LARGE-'+i,name:'Large fixture'}))});MCPAGlobalSearch.reset()})()`);
  await search('Large fixture');assert.equal((await rows()).length,40);await click('.global-search-more');assert.equal((await rows()).length,80);
  await search('LARGE-1200');assert.equal((await rows())[0].key,'masterlist:LARGE-1200');await evaluate('__restoreInventory()');
  // The index uses stable IDs even when labels collide, and searches all rows before display pagination.
  assert.deepEqual(await evaluate(`(()=>{const data={inventory:Array.from({length:1501},(_,i)=>({id:'X-'+i,name:'Duplicate'}))};const rows=MCPAGlobalSearch.index(data,MCPAAuth.profile);return [MCPAGlobalSearch.match(rows,'Duplicate').length,MCPAGlobalSearch.match(rows,'X-1500')[0].id,new Set(rows.map(r=>r.key)).size]})()`),[1501,'X-1500',1504]);
  for(const width of [375,393,430])for(const dark of [false,true]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`applyTheme(${dark},false)`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await search('TOOL-001');assert.ok((await rows()).length);
    const layout=await evaluate("(()=>{const r=document.querySelector('#global-search-results').getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,page:document.documentElement.scrollWidth,heights:[...document.querySelectorAll('.global-search-option')].map(n=>n.getBoundingClientRect().height)}})()");
    assert.ok(layout.left>=0&&layout.right<=layout.viewport&&layout.page<=layout.viewport&&layout.heights.every(h=>h>=44),JSON.stringify(layout));
    if(width===393)await shot('global-search-'+width+'-'+(dark?'dark':'light'),true);
    await key('Escape');assert.ok(await evaluate("document.querySelector('#global-search-results').hidden"));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await search('TOOL');await shot('global-search-desktop',true);
  await search('<img onerror=alert(1)>');assert.equal((await rows()).length,0);assert.equal(await evaluate("document.querySelectorAll('#global-search-results img').length"),0);
  for(const account of ['sky','architect','handler','secretary']){
    await logout();await login(account);await wait(`MCPAAuth.profile?.id===${JSON.stringify(fixture.actors[account].id)} && document.querySelector('#screen-${account==='secretary'?'consumables':'dashboard'}.active') && !MCPANavigation.restoring`);await search('TOOL');
    const found=await rows();
    if(['sky','architect'].includes(account)){
      assert.ok(found.every(r=>!r.key.startsWith('purchase:')&&!r.key.startsWith('reports:')&&!r.key.startsWith('consumables:')));
      const owned=await evaluate("EquipmentTracking.client().rpc('mcpa_personal_equipment_snapshot').then(r=>r.data.tools.map(t=>t.id))");
      assert.ok(found.filter(r=>r.key.startsWith('masterlist:')).every(r=>owned.includes(r.key.slice(11))));
    }
    if(account==='secretary')assert.ok(found.every(r=>r.key.startsWith('purchase:')||r.key.startsWith('consumables:')));
    if(account==='handler')assert.ok(found.every(r=>!r.key.startsWith('request:')));
  }
  await logout();await login('sky');await wait("MCPAAuth.profile?.role==='engineer' && document.querySelector('#screen-dashboard.active') && !MCPANavigation.restoring");
  await evaluate(`(()=>{const c=EquipmentTracking.client(),old=c.rpc;window.__restoreSearchRead=()=>c.rpc=old;c.rpc=function(...args){return args[0]==='mcpa_personal_equipment_snapshot'?Promise.resolve({error:{code:'42501'}}):old.apply(this,args)};MCPAGlobalSearch.reset()})()`);
  await search('TOOL');assert.ok((await rows()).every(r=>!r.key.startsWith('masterlist:')),'Personal read failures do not expose the request catalog');
  assert.ok(await evaluate("document.querySelector('.global-search-status').textContent.includes('Equipment')"));await evaluate('__restoreSearchRead()');
  await search('TOOL');assert.ok((await rows()).some(r=>r.key.startsWith('masterlist:')),'A failed source can retry immediately');
  await evaluate('MCPAGlobalSearch.reset()');
  await evaluate(`(()=>{const c=EquipmentTracking.client(),old=c.rpc;let release;const gate=new Promise(r=>release=r);window.__releaseSearch=()=>{c.rpc=old;release()};c.rpc=function(...args){return args[0]==='mcpa_personal_equipment_snapshot'?gate.then(()=>old.apply(this,args)):old.apply(this,args)};})()`);
  await fill('#global-search-input','TOOL');await new Promise(r=>setTimeout(r,220));await fill('#global-search-input','no-match-latest');await evaluate('__releaseSearch()');
  await wait("document.querySelector('.global-search-status').textContent.startsWith('No matching')");assert.equal((await rows()).length,0);
  await logout();assert.equal(await evaluate("document.querySelector('#global-search-input').value"),'');assert.ok(await evaluate("document.querySelector('#global-search-results').hidden"));
};
