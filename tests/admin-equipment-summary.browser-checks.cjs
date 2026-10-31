const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,shot,artifactDirectory,base})=>{
 const output=path.join(__dirname,'../documentation/admin-projects-equipment-2026-10-23/screenshots');fs.mkdirSync(output,{recursive:true});
 const screenshot=async name=>{await shot(name,true);const file=path.join(artifactDirectory,name+'.png');if(fs.existsSync(file))fs.copyFileSync(file,path.join(output,name+'.png'));};
 // Optional archive metadata is present in some deployments. Exercise both
 // fields locally without applying any migration or contacting Supabase.
 await f.db.exec('alter table equipment add column if not exists is_active boolean default true; alter table equipment add column if not exists archived_at timestamptz');
 const cases=[
  ['S-AVAILABLE','AVAILABLE',null,null,'Good',4,true],
  ['S-INUSE','IN_USE',null,null,'Good',3,true],
  ['S-SITE','IN_USE',f.actors.sky.id,f.sites.casa,'Good',2,true],
  ['S-REPAIR','REPAIR',null,null,'Damaged',5,true],
  ['S-MISSING','MISSING',null,null,'Good',6,true],
  ['S-DISPOSED','DISPOSED',null,null,'Good',1,true],
  ['S-HELD','AVAILABLE',f.actors.sky.id,f.sites.casa,'Good',7,true],
  ['S-DAMAGED','AVAILABLE',null,null,'Damaged',2,true],
  ['S-ZERO','AVAILABLE',null,null,'Good',0,true],
  ['S-ARCHIVED','AVAILABLE',null,null,'Good',8,false],
  ['S-RESERVED','AVAILABLE',null,f.sites.main,'Good',9,true]
 ];
 for(const [asset,status,holder,site,condition,qty,active] of cases)await f.db.query('insert into equipment(id,asset_id,name,category,status,current_holder_id,site_id,condition,quantity,is_active) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),asset,asset+' fixture','Summary fixture',status,holder,site,condition,qty,active]);
 const action=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
 const reservation=await action(f.actors.sky,'createRequest',{toolIds:['S-RESERVED'],destination:'Casa Buena',purpose:'Isolated summary regression'});
 await action(f.actors.admin,'approveRequest',{id:reservation.id});
 const dashboardCounts=()=>evaluate("[...document.querySelectorAll('#screen-dashboard .overview-kpis .num')].slice(0,3).map(el=>Number(el.textContent))");
 const counts=()=>evaluate("[...document.querySelectorAll('[data-equipment-count]')].map(el=>Number(el.textContent))");
 const rows=()=>evaluate("filteredEquipment().map(item=>item.assetId)");
 const selected=()=>evaluate("[...document.querySelectorAll('[data-equipment-status][aria-pressed=true]')].map(el=>el.dataset.equipmentStatus)");
 const settled=()=>wait("window.MCPANavigation && !MCPANavigation.restoring && document.querySelector('#statusFilter') && document.querySelector('[data-equipment-count=total]').textContent!=='…'");
 const expectStatus=async(value,key)=>{await settled();assert.equal(await evaluate("document.querySelector('#statusFilter').value"),value);assert.deepEqual(await selected(),key?[key]:[]);};
 await go('activity');await go('dashboard');await wait("document.querySelector('.overview-kpis .num')");const initial=await dashboardCounts();
 assert.equal(initial.length,3);assert.ok(initial[0]>initial[1]+initial[2],'Other conditions remain part of Total');
 await screenshot('dashboard-shortcuts-light');
 // A delayed first equipment read must finish before the route applies status.
 await evaluate("window.__summaryReadAll=EquipmentTracking.readAll;EquipmentTracking.readAll=async(...args)=>{if(args[0]==='equipment')await new Promise(resolve=>setTimeout(resolve,250));return __summaryReadAll(...args)}");
 await click('[data-go="masterlist?status=available"]');await expectStatus('Available','available');
 assert.deepEqual(await counts(),initial);let visible=await rows();assert.ok(visible.includes('S-AVAILABLE'));
 for(const [asset] of cases.filter(row=>row[0]!=='S-AVAILABLE'))assert.ok(!visible.includes(asset),asset+' excluded from Available');
 await screenshot('equipment-available-light');
 await evaluate('EquipmentTracking.readAll=__summaryReadAll');
 await click('[data-equipment-status=inuse]');await expectStatus('In Use','inuse');visible=await rows();
 assert.ok(visible.includes('S-INUSE')&&visible.includes('S-SITE'),'Deployed includes unassigned and project equipment');
 for(const [asset]of cases.filter(row=>!['S-INUSE','S-SITE'].includes(row[0])))assert.ok(!visible.includes(asset),asset+' excluded from Deployed');
 await screenshot('equipment-inuse-light');
 await click('[data-equipment-status=all]');await expectStatus('','all');assert.equal((await rows()).length,await evaluate('equipmentList.length'));
 await fill('#statusFilter','For Repair');await expectStatus('For Repair',null);assert.ok((await rows()).includes('S-REPAIR'));
 await fill('#statusFilter','Available');await expectStatus('Available','available');
 await fill('#typeFilter','Summary fixture');await fill('#searchEquipment','S-AVAILABLE');assert.deepEqual(await rows(),['S-AVAILABLE']);
 await fill('#siteFilter','Casa Buena');assert.deepEqual(await rows(),[]);assert.deepEqual(await counts(),initial);
 await click('[data-equipment-status=inuse]');await expectStatus('In Use','inuse');assert.deepEqual(await rows(),[]);
 assert.equal(await evaluate("document.querySelector('#searchEquipment').value"),'S-AVAILABLE','Status shortcuts preserve search');
 await fill('#searchEquipment','');assert.deepEqual(await rows(),['S-SITE']);
 await fill('#siteFilter','');assert.deepEqual((await rows()).sort(),['S-INUSE','S-SITE']);
 // Back/forward restores status, category, project, and search for each visit.
 await go('dashboard');await click('[data-go="masterlist?status=available"]');await expectStatus('Available','available');
 await evaluate('history.back()');await wait("document.querySelector('#screen-dashboard.active') && !MCPANavigation.restoring");
 await evaluate('history.back()');await expectStatus('In Use','inuse');assert.equal(await evaluate("document.querySelector('#typeFilter').value"),'Summary fixture');
 await evaluate('history.forward()');await wait("document.querySelector('#screen-dashboard.active') && !MCPANavigation.restoring");
 await click('[data-go="masterlist?status=inuse"]');await expectStatus('In Use','inuse');assert.deepEqual(await counts(),initial);
 await command('Page.reload');await expectStatus('In Use','inuse');
 await command('Page.navigate',{url:base+'/MCPA/2-engr/index.html#masterlist?status=available'});await expectStatus('Available','available');
 await go('dashboard');await click('[data-go="masterlist?status=all"]');await expectStatus('','all');
 await screenshot('equipment-summary-light');
 // Native button keyboard activation and visible focus.
 const key=async(key,code,n)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n,text:key==='Enter'?'\r':' '});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});};
 await evaluate("document.querySelector('[data-equipment-status=available]').focus()");await key('Enter','Enter',13);await expectStatus('Available','available');
 assert.ok(await evaluate("(()=>{const el=document.activeElement;return el.matches('[data-equipment-status=available]:focus-visible')&&getComputedStyle(el).outlineStyle!=='none'})()"));
 await evaluate("document.querySelector('[data-equipment-status=inuse]').focus()");await key(' ','Space',32);await expectStatus('In Use','inuse');
 // Data refresh changes both global quantities and filtered rows, preserving filters.
 await f.db.query("update equipment set status='IN_USE',quantity=6 where asset_id='S-AVAILABLE'");
 await evaluate('initMasterlist()');await expectStatus('In Use','inuse');assert.ok((await rows()).includes('S-AVAILABLE'));
 const updated=await counts();assert.equal(updated[0],initial[0]+2);assert.equal(updated[1],initial[1]-4);assert.equal(updated[2],initial[2]+6);
 await go('dashboard');await wait("document.querySelector('.overview-kpis .num')");assert.deepEqual(await dashboardCounts(),updated);
 await screenshot('dashboard-navigation-updated-light');await click('[data-go="masterlist?status=inuse"]');await expectStatus('In Use','inuse');
 let matrix=0;
 for(const dark of [false,true])for(const width of [375,768,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await evaluate(`applyTheme(${dark},false)`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal page overflow '+width);
  const layout=await evaluate("(()=>{const cards=[...document.querySelectorAll('.equipment-summary button')];return cards.map(el=>{const b=el.getBoundingClientRect();return {height:b.height,top:b.top,left:b.left,right:b.right,overflow:el.scrollWidth>el.clientWidth+1}})})()");
  assert.equal(layout.length,3);assert.ok(layout.every(c=>c.left>=0&&c.right<=width+1&&!c.overflow));assert.ok(Math.max(...layout.map(c=>c.height))-Math.min(...layout.map(c=>c.height))<2);
  if(width===1440)assert.ok(layout.every(c=>Math.abs(c.top-layout[0].top)<1),'Desktop row');
  await screenshot(`equipment-summary-${width}-${dark?'dark':'light'}`);matrix++;
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('applyTheme(false,false)');
 // An initial failed read must not present unknown global totals as zero.
 await go('dashboard');
 await evaluate("window.__summaryReadAll=EquipmentTracking.readAll;EquipmentTracking.readAll=async(...args)=>{if(args[0]==='equipment')throw new Error('Isolated initial read failure');return __summaryReadAll(...args)}");
 await click('[data-go="masterlist?status=available"]');await expectStatus('Available','available');
 assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-equipment-count]')].map(el=>el.textContent)"),['—','—','—']);
 assert.match(await evaluate("document.querySelector('#inventory-sync').textContent"),/Equipment could not load/);
 await evaluate('EquipmentTracking.readAll=__summaryReadAll;initMasterlist()');await expectStatus('Available','available');assert.deepEqual(await counts(),updated);
 // Role routing still chooses each role's original read-only inventory.
 for(const account of ['sky','architect','handler']){
  await logout();await login(account);await wait(`MCPAAuth.profile?.role===${JSON.stringify(f.actors[account].role)}`);await go('masterlist?status=available');await wait("document.querySelector('#overview-status') && !MCPANavigation.restoring");
  assert.equal(await evaluate("document.querySelectorAll('[data-equipment-status]').length"),0);assert.equal(await evaluate("document.querySelector('#overview-status').value"),'');
  assert.equal(await evaluate("document.querySelector('#openAddEquipment')"),null);
 }
 console.log(`PASS Admin summary: global quantity parity, reservation/custody/archive/damage/zero eligibility, location-independent In Use, dropdown/cards, combined filters, delayed initialization, repeated dashboard shortcuts, back/forward/reload/direct subpath, keyboard Enter/Space/focus, refresh, ${matrix} responsive/theme combinations and three restricted roles`);
};
