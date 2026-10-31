// Auth, RPCs and RLS use the isolated PostgreSQL fixture. External HTTPS is blocked.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,enter})=>{
  const act=(person,action,payload)=>f.rpc(f.actors[person],'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  const writes=()=>calls.filter(call=>call.rpc==='mcpa_movement_action').length;
  const setViewport=async(width,dark=false)=>{
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=600});
    await command('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await evaluate(`document.body.classList.toggle('dark',${dark});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  };
  const options=()=>evaluate("[...document.querySelector('#mv-destination').options].filter(o=>o.value).map(o=>o.value)");
  const visible=()=>evaluate("[...document.querySelectorAll('[data-list] button[data-action=view]')].filter(b=>b.getClientRects().length).map(b=>b.dataset.id)");
  const longProject='Structural rehabilitation and construction coordination — '+ 'LongProjectReference'.repeat(2),projectId=randomUUID(),archId=randomUUID();
  await f.db.query("update sites set is_active=false where name='MCPA Development Transfer Test'");
  await f.db.query('insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,$2,$3,$4,$5)',[projectId,longProject,'Isolated fixture',f.actors.sky.name,f.actors.sky.id]);
  await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Architect assigned project','Fixture',$2,$3)",[archId,f.actors.architect.name,f.actors.architect.id]);
  for(const id of ['UX-001','UX-002'])await f.db.query("insert into equipment(id,asset_id,name,quantity,status) values($1,$2,$3,1,'AVAILABLE')",[randomUUID(),id,'Long equipment description for construction site — '+id]);
  await logout();await login('pau');await wait("MCPAAuth.profile?.id==="+JSON.stringify(f.actors.pau.id));await go('request');await wait("document.querySelector('#mv-destination')");
  assert.deepEqual(await options(),[]);assert.ok(await evaluate("document.querySelector('#mv-destination').disabled && document.querySelector('[data-form=create] [type=submit]').disabled"));
  assert.ok(await evaluate("document.querySelector('#mv-request-project-status').textContent==='No assigned project site. Please contact your administrator.'"));
  assert.ok(await evaluate("document.querySelector('[data-list]').textContent.includes('No requests yet')"));
  await logout();await login('architect');await wait("MCPAAuth.profile?.role==='architect'");await go('request');await wait("document.querySelector('#mv-destination')");
  assert.deepEqual(await options(),['Architect assigned project']);assert.equal(await evaluate("document.querySelector('#mv-destination').value"),'Architect assigned project');
  await logout();await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await go('request');await wait("document.querySelector('#mv-destination')");
  assert.deepEqual(new Set(await options()),new Set(['Casa Buena',longProject]));assert.equal(await evaluate("document.querySelector('#mv-purpose').required"),false);
  const initialWrites=writes();await click('[name=toolIds][value="TOOL-001"]');await submit('[data-form=create]');assert.equal(writes(),initialWrites,'Destination remains mandatory');
  await fill('#mv-destination',longProject);await click('[name=toolIds][value="TOOL-001"]');await submit('[data-form=create]');
  await wait("document.querySelector('[data-notice]').textContent.includes('Select at least one tool')");assert.equal(writes(),initialWrites);
  await evaluate('MovementStore.refresh()');assert.equal(await evaluate("document.querySelector('#mv-destination').value"),longProject);
  await command('Page.reload');await wait("document.querySelector('#mv-destination')");assert.equal(await evaluate("document.querySelector('#mv-destination').value"),longProject,'Authorized stable profile/project preference survives reload');
  for(const id of ['TOOL-001','UX-001','UX-002'])await click(`[name=toolIds][value="${id}"]`);
  await submit('[data-form=create]');await wait("document.querySelector('[data-detail][open]')");
  const request=await evaluate('MovementStore.getState().requests[0]');assert.equal(request.purpose,'');assert.equal(request.destinationId,projectId);
  await click('[data-action=close-detail]');
  assert.equal(await evaluate("document.querySelector('[data-request-submit]').disabled"),false,'A completed save re-enables the eligible request form');
  await act('sky','createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Entered purpose preserved'});
  await evaluate('MovementStore.refresh()');
  // Removing the saved assignment invalidates the option even while the form is dirty.
  await fill('#mv-purpose','Unsaved form');await f.db.query('update sites set is_active=false where id=$1',[projectId]);await evaluate('MovementStore.refresh()');
  assert.deepEqual(await options(),['Casa Buena']);assert.equal(await evaluate("document.querySelector('#mv-destination').value"),'Casa Buena');
  await f.db.query('update sites set is_active=true where id=$1',[projectId]);await evaluate('MovementStore.refresh()');await fill('#mv-purpose','');
  const expected=(await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).requests.map(r=>r.id);
  for(const dark of [false,true])for(const width of [320,360,375,393,430,768,1440]){
    await setViewport(width,dark);
    const rendered=await visible();assert.deepEqual(new Set(rendered),new Set(expected));assert.equal(rendered.length,expected.length,'No duplicate visible records');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mv-transfer-table')).display==='none'"),width<=600);
    const layout=await evaluate(`(()=>{const s=document.querySelector('#mv-destination'),r=s.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,height:r.height,font:parseFloat(getComputedStyle(s).fontSize),right:r.right,width:innerWidth};})()`);
    assert.equal(layout.overflow,false,'Requests fit '+width);assert.ok(layout.height>=44&&layout.right<=width+1);if(width<=600)assert.ok(layout.font>=16);
    if(width<=600){
      assert.ok(await evaluate("[...document.querySelectorAll('.mv-transfer-card .badge,.mv-transfer-card strong,.mv-transfer-card dd')].every(el=>el.scrollWidth<=el.clientWidth+1)"),'Card text wraps');
      await enter(`.mv-transfer-card[data-id="${request.id}"] button`);
    }else await click(`.mv-transfer-table button[data-id="${request.id}"]`);
    await wait("document.querySelector('[data-detail][open]')");assert.ok(await evaluate("document.querySelector('[data-detail]').textContent.includes('UX-002')"));await click('[data-action=close-detail]');
    if([320,1440].includes(width)){await evaluate("document.querySelector('[data-list]').scrollIntoView({block:'start'})");await shot(`engineer-ux-history-${width}-${dark?'night':'light'}`,true);}
    await go('dashboard');await wait("document.querySelector('.field-dashboard .dashboard-recent')");
    const recent=await evaluate(`(()=>{const activity=document.querySelector('.dashboard-recent'),summary=document.querySelector('.overview-kpis'),analytics=document.querySelector('.command-analytics');return {after:summary.compareDocumentPosition(activity)&Node.DOCUMENT_POSITION_FOLLOWING,before:activity.compareDocumentPosition(analytics)&Node.DOCUMENT_POSITION_FOLLOWING,top:activity.getBoundingClientRect().top,hasEvent:activity.textContent.includes('Equipment Request Submitted'),link:!!activity.querySelector('[data-movement-link]'),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
    assert.ok(recent.after&&recent.before&&recent.hasEvent&&recent.link);assert.equal(recent.overflow,false);if(width<=600)assert.ok(recent.top<700,'Activity starts in first mobile viewport: '+recent.top);
    if(width===393)await shot(`engineer-ux-dashboard-${dark?'night':'light'}`,true);
    await click('.dashboard-recent [data-go=activity]');await wait("document.querySelector('#overview-results')");assert.ok(await evaluate("document.querySelector('#screen-activity').textContent.includes('Equipment Request Submitted')"));
    await go('request');await wait("document.querySelector('#mv-destination')");
  }
  for(const search of [request.id,'UX-001','Long equipment',f.actors.sky.name,longProject]){await fill('[data-record-search]',search);assert.ok((await visible()).includes(request.id));}
  await fill('[data-record-search]','no such request');assert.deepEqual(await visible(),[]);await fill('[data-record-search]','');
  await fill('[data-status]','pending');assert.equal((await visible()).length,2);await fill('[data-status]','');
  console.log('PASS Assigned project zero/one/multiple roles, reload/revocation, optional purpose, required selection, shared card filters/details and dashboard activity at 320/360/375/393/430/768/1440 in both themes');
  // Real isolated events create actual notices and recipient rows.
  await logout();await login('admin');await wait("MCPAAuth.profile?.role==='admin'");await evaluate('MCPAMonitoring.refresh()');
  const adminNotice=await evaluate(`MCPAMonitoring.getState().notifications.find(n=>n.entityId===${JSON.stringify(request.id)})`);assert.ok(adminNotice);
  await click('.bell-wrap');await wait("document.querySelector('[data-monitoring-notice]')");await click(`[data-monitoring-notice="${adminNotice.id}"]`);await wait("document.querySelector('[data-detail][open]')");
  await click('[data-action=approve]');await wait("document.querySelector('[data-action=release]')");await click('[data-action=close-detail]');
  await logout();await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await evaluate('MCPAMonitoring.refresh()');
  const notices=await evaluate('MCPAMonitoring.getState()');assert.ok(notices.notifications.every(n=>n.recipientId===f.actors.sky.id));assert.equal(notices.unreadCount,notices.notifications.filter(n=>!n.readAt).length);
  const approved=notices.notifications.find(n=>n.entityId===request.id);assert.ok(approved);
  for(const dark of [false,true])for(const width of [320,360,375,393,430,768,1440]){
    await setViewport(width,dark);await click('.bell-wrap');await wait("document.querySelector('#monitoring-dialog[open]')");
    const panel=await evaluate("(()=>{const r=document.querySelector('#monitoring-dialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,scroll:document.documentElement.scrollWidth};})()");
    assert.ok(panel.left>=0&&panel.right<=width+1&&panel.top>=0&&panel.bottom<=900&&panel.height<=648);assert.ok(panel.scroll<=width+1);
    assert.ok(await evaluate("document.querySelector('#monitoring-dialog').textContent.includes('Manila time')"));
    if([393,1440].includes(width))await shot(`engineer-ux-notifications-${width}-${dark?'night':'light'}`,true);
    await click('[data-monitoring-close]');assert.ok(await evaluate("document.activeElement.matches('.bell-wrap')"));
  }
  await click('.bell-wrap');await click(`[data-monitoring-notice="${approved.id}"]`);await wait("document.querySelector('#screen-request [data-detail][open]')");
  assert.equal(await evaluate("document.querySelector('[data-detail] h2').textContent"),request.id);await click('[data-action=close-detail]');
  assert.ok((await f.rpc(f.actors.sky,'mcpa_monitoring_snapshot')).notifications.find(n=>n.id===approved.id).readAt);
  await assert.rejects(f.rpc(f.actors.architect,'mcpa_monitoring_mark_read',{p_id:approved.id}),e=>e.code==='42501');
  // Local transport fault injection: missing endpoint never becomes a false empty state.
  await evaluate(`window.__uxClient=EquipmentTracking.client();window.__uxRpc=__uxClient.rpc.bind(__uxClient);window.__uxFailures=0;__uxClient.rpc=(name,args)=>name==='mcpa_monitoring_snapshot'?(++__uxFailures,Promise.resolve({error:{code:'PGRST202',message:'Could not find public.mcpa_monitoring_snapshot in the schema cache'}})):__uxRpc(name,args);MCPAMonitoring.initialize();`);
  await wait("document.querySelector('.bell-wrap').getAttribute('aria-label')==='Notifications unavailable'");await click('.bell-wrap');
  assert.ok(await evaluate("document.querySelector('#monitoring-dialog').textContent.includes('PGRST202') && !document.querySelector('.monitoring-empty') && !document.querySelector('#monitoring-dialog').textContent.includes('0 unread')"));
  for(let i=0;i<3;i++)await evaluate("__tickSync();dispatchEvent(new Event('mcpa:movement-change'));MCPAMonitoring.refresh()");
  await click('[data-monitoring-close]');await click('.bell-wrap');assert.equal(await evaluate('__uxFailures'),1,'Reopening, movement updates and timer ticks do not repeat missing RPC calls');
  await click('[data-monitoring-retry]');await wait('__uxFailures===2');
  await evaluate('__uxClient.rpc=__uxRpc');await click('[data-monitoring-retry]');await wait("document.querySelector('[data-monitoring-notice]')");await click('[data-monitoring-close]');
  await logout();await login('architect');await wait("MCPAAuth.profile?.role==='architect'");await click('.bell-wrap');await wait("document.querySelector('.monitoring-empty')");
  assert.equal(await evaluate('MCPAMonitoring.getState().notifications.length'),0,'Previous employee notices cleared on role change');
  console.log('PASS Admin/Engineer real-event notifications, own recipient/read state, exact details, viewport fit, setup errors and explicit retry without 404 loops');
};
