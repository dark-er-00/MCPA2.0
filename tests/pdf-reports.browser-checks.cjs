/* Real local SQL permissions + actual Chromium downloads. External HTTPS blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {capture,compact,parse,assertLayout,render}=require('./pdf-test-utils.cjs');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,calls,shot,enter,artifactDirectory,base})=>{
 const harness={evaluate,click,wait},artifacts=path.join(artifactDirectory,'pdf-reports');fs.mkdirSync(artifacts,{recursive:true});
 await logout();
 const today=(await f.query(f.actors.admin,"select to_char(current_timestamp at time zone 'Asia/Manila','YYYY-MM-DD') as day")).rows[0].day;
 const protectedTables=['equipment','sites','mcpa_movements','mcpa_movement_operations','mcpa_movement_reservations'];
 const records=async()=>Object.fromEntries(await Promise.all(protectedTables.map(async table=>[table,(await f.db.query('select * from '+table+' order by 1')).rows])));
 const privateRequests={};
 for(const key of ['sky','pau','architect']){
  const actor=f.actors[key],site='PDF private project '+key,asset='PDF-ASSET-'+key;
  await f.query(f.actors.admin,'insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,$2,$3,$4,$5)',[randomUUID(),site,'Local PDF fixture',actor.name,actor.id]);
  await f.query(f.actors.admin,"insert into equipment(id,asset_id,name,quantity,status) values($1,$2,$3,1,'AVAILABLE')",[randomUUID(),asset,'Concrete drill José Niño ₱ – '+key]);
  privateRequests[key]=await f.rpc(actor,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:[asset],destination:site,purpose:'Private report fixture '+key},p_operation_id:randomUUID()});
  // Additional local audit events exercise complete export rather than a page slice.
  for(let i=0;i<26;i++){
   const createdAt=today+'T00:'+String(i).padStart(2,'0')+':01.123Z';
   const activity={createdAt,entityId:privateRequests[key].id,action:'createRequest',actor:actor.name,toolIds:[asset],summary:'Scope '+key+' marker '+i+' – Café Niño ₱25.00 & concrete equipment'};
   await f.db.query('insert into mcpa_movement_operations(id,action,payload,result,activity,created_at) values($1,$2,$3,$4,$5,$6)',[randomUUID(),'createRequest',{},privateRequests[key],activity,createdAt]);
  }
 }
 const baseline=await records(),writeCalls=calls.filter(call=>call.write||call.rpc==='mcpa_movement_action').length;
 await login('admin');await wait("MCPAAuth.profile?.role==='admin'");
 const date=await evaluate('SiteTracePDF.dateKey(new Date())');
 await go('reports');await wait("!document.querySelector('#report-export').disabled");
 assert.equal(await evaluate("document.querySelector('#report-export').textContent.trim()"),'Export PDF');
 await command('Network.setBlockedURLs',{urls:['https://*','*/vendor/pdf/*']});
 await click('#report-export');await wait("!SiteTracePDF.busy && document.querySelector('#report-feedback').getAttribute('role')==='alert'");
 assert.match(await evaluate("document.querySelector('#report-feedback').textContent"),/PDF resources could not load/);
 await command('Network.setBlockedURLs',{urls:['https://*']});
 // Real desktop download initiated through keyboard activation, with no Blob interception.
 await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts});
 await enter('#report-export');await wait('!SiteTracePDF.busy');
 const currentPath=path.join(artifacts,'SiteTrace_Current_Inventory_'+date+'.pdf');
 for(let i=0;i<100&&!fs.existsSync(currentPath);i++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(fs.existsSync(currentPath),'Desktop keyboard activation downloads an actual PDF');
 const current=await parse(fs.readFileSync(currentPath));assert.ok(current.text.includes('Current Inventory'));assert.ok(current.text.includes('PDF-ASSET-sky'));assert.ok(!/\bZERO\b/.test(current.text));assertLayout(current);await render(current,artifacts,'current-inventory');await current.pdf.destroy();
 await shot('pdf-reports-desktop',true);
 console.log('PDF desktop download and local-resource retry passed');
 // Date edits invalidate the loaded export until the corresponding RPC completes.
 await fill('#report-kind','activity');await fill('#report-start','2000-01-01');await fill('#report-end','2000-01-02');
 assert.ok(await evaluate("document.querySelector('#report-export').disabled"));
 await click('#report-refresh');await wait("!document.querySelector('#report-export').disabled");
 const empty=await capture(harness);assert.ok(empty.text.includes('Records: 0'));assert.ok(empty.text.includes('2000-01-01 through 2000-01-02'));assert.ok(empty.text.includes('No records match'));await empty.pdf.destroy();
 console.log('PDF empty/date filtering passed');
 await fill('#report-start',today);await fill('#report-end',today);await click('#report-refresh');await wait("!document.querySelector('#report-export').disabled");
 const history=await capture(harness);assert.ok(history.pages.length>1);assert.ok(history.text.includes(privateRequests.sky.id));assert.ok(history.text.includes('Scope architect marker 25'));assertLayout(history);await history.pdf.destroy();
 console.log('PDF movement history passed');
 // An immutable saved snapshot is exported, not the later current inventory.
 const snapshotId=await f.serviceRpc('mcpa_capture_inventory_snapshot');
 await click('#report-refresh');await wait("!document.querySelector('#report-export').disabled");await fill('#report-kind','history');
 const saved=await capture(harness);assert.equal(await evaluate('document.querySelector("#report-snapshot").value'),snapshotId);assert.ok(compact(saved.text).includes(compact(await evaluate('document.querySelector("#report-snapshot").selectedOptions[0].textContent'))));assert.ok(!saved.text.includes(snapshotId),'Snapshot reference stays in record selection; exported metadata uses the capture date');assert.ok(saved.text.includes('Saved Inventory Snapshot'));await saved.pdf.destroy();
 console.log('PDF saved snapshot passed');
 // Retry after resource/generation failure must be possible and announced.
 await evaluate("window.__pdfOriginalBlob=window.Blob;window.Blob=function(){throw Error('Local simulated PDF failure')};");
 await click('#report-export');await wait("!SiteTracePDF.busy && document.querySelector('#report-feedback').getAttribute('role')==='alert'");
 assert.match(await evaluate("document.querySelector('#report-feedback').textContent"),/could not be generated/);
 await evaluate('window.Blob=window.__pdfOriginalBlob;delete window.__pdfOriginalBlob');
 const retry=await capture(harness);await retry.pdf.destroy();
 // Rapid repeated clicks, including a rerender replacing the button, yield one download.
 await go('activity');await wait("document.querySelector('[data-export]')");
 await evaluate("window.__pdfClicks=0;window.__pdfAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.__pdfClicks++};document.querySelector('[data-export]').click();document.querySelector('[data-export]').click();window.dispatchEvent(new Event('mcpa:movement-change'));document.querySelector('[data-export]').click();");
 await wait('!SiteTracePDF.busy');assert.equal(await evaluate('__pdfClicks'),1);await evaluate('HTMLAnchorElement.prototype.click=__pdfAnchorClick');
 for(const [key,role]of [['admin','admin'],['handler','tool_handler'],['sky','engineer'],['pau','engineer'],['architect','architect']]){
  await logout();await login(key);await wait('MCPAAuth.profile?.role==='+JSON.stringify(role));await go('activity');await wait("document.querySelector('[data-export]')");
  const expected=await evaluate('MovementStore.getState().activity');
  const report=await capture(harness,'[data-export]');assert.equal(report.filename,'SiteTrace_Activity_Logs_'+date+'.pdf');assert.ok(report.text.includes('Records: '+expected.length));
  const text=compact(report.text);
  for(const row of expected)for(const value of [await evaluate('SiteTracePDF.dateTime('+JSON.stringify(row.createdAt)+')'),'Equipment Request Submitted',row.entityId,row.actor,await evaluate('MCPADisplay.activity('+JSON.stringify(row)+').description'),...row.toolIds])assert.ok(text.includes(compact(value)),'Missing authorized field for '+key+': '+value);
  if(['sky','pau','architect'].includes(key)){
   for(const other of ['sky','pau','architect'].filter(other=>other!==key))assert.ok(!report.text.includes(privateRequests[other].id),'Private reference leaked from '+other+' to '+key);
  }
  if(key==='admin'){fs.writeFileSync(path.join(artifacts,'admin-activity.pdf'),report.bytes);assertLayout(report);await render(report,artifacts,'admin-activity',[1,report.pages.length]);}
  await report.pdf.destroy();
  await fill('#movement-activity-search','Scope '+(key==='admin'||key==='handler'?'sky':key)+' marker 25');
  const filtered=await capture(harness,'[data-export]');assert.ok(filtered.text.includes('Records: 1'));assert.ok(filtered.text.includes('marker 25'));assert.ok(!filtered.text.includes('marker 24'));await filtered.pdf.destroy();
  await fill('#movement-activity-search','NoSuchReportResult');const none=await capture(harness,'[data-export]');assert.ok(none.text.includes('Records: 0'));await none.pdf.destroy();
  if(key!=='admin'){
   const before=calls.filter(call=>call.rpc==='mcpa_monitoring_report').length;
   await evaluate("showScreen('reports')");await wait("document.body.innerText.includes('Access restricted')");
   assert.ok(await evaluate("!document.querySelector('#report-export')"));assert.equal(calls.filter(call=>call.rpc==='mcpa_monitoring_report').length,before);
  }
 }
 // Engineer entry point and mobile touch download retain only this user's scope.
 await logout();await command('Page.navigate',{url:base+'/2-engr/index.html'});await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");
 await command('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
 await go('activity');await wait("document.querySelector('[data-export]')");
 await fill('#movement-activity-search','Scope sky marker 25');
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('pdf-activity-mobile',true);
 await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const point=await evaluate("(()=>{const button=document.querySelector('[data-export]');button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()");
 await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
 await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait('!SiteTracePDF.busy');
 const mobilePath=path.join(artifacts,'SiteTrace_Activity_Logs_'+date+'.pdf');
 for(let i=0;i<100&&!fs.existsSync(mobilePath);i++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(fs.existsSync(mobilePath),'Mobile viewport produces an actual PDF download');
 const mobile=await parse(fs.readFileSync(mobilePath));assert.ok(mobile.text.includes('Records: 1'));assert.ok(!mobile.text.includes(privateRequests.pau.id));await mobile.pdf.destroy();
 // Secretary has neither export route, including direct navigation attempts.
 await logout();await login('secretary');await wait("MCPAAuth.profile?.role==='secretary'");
 const before=calls.length;
 for(const route of ['activity','reports']){
  assert.equal(await evaluate('MCPAAuth.canRoute('+JSON.stringify(route)+')'),false);
  await evaluate('showScreen('+JSON.stringify(route)+')');await wait("!document.querySelector('[data-export],#report-export')");
 }
 assert.ok(!calls.slice(before).some(call=>['mcpa_movement_snapshot','mcpa_monitoring_report'].includes(call.rpc)));
 assert.equal(calls.filter(call=>call.write||call.rpc==='mcpa_movement_action').length,writeCalls,'Export performs no business writes');
 await logout();
 assert.deepEqual(await records(),baseline,'PDF exports preserve equipment, custody and audit records');
 console.log('PDF download and rendered-page artifacts: '+artifacts);
};
