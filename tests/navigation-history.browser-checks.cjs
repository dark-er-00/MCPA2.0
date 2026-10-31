// Real Chrome history/layout with local PostgreSQL RPCs. External HTTPS is blocked by the host.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
exports.verify = async ({fixture:f,evaluate,command,wait,click,fill,login,logout,shot,base}) => {
  const q = JSON.stringify;
  const settled = async route => wait(`location.hash === ${q('#'+route)} && window.MCPANavigation && !MCPANavigation.restoring && document.querySelector('#screen-${route.split('?')[0]}.active')`);
  const go = async route => { await evaluate(`showScreen(${q(route)})`); await settled(route); };
  const back = async route => { await evaluate('history.back()'); await settled(route); };
  const forward = async route => { await evaluate('history.forward()'); await settled(route); };
  const scroll = async y => {
    await evaluate(`window.scrollTo(0, ${y}); new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    return evaluate('scrollY');
  };
  const at = async y => {
    try { await wait(`Math.abs(scrollY - ${y}) <= 2`); }
    catch (error) { error.message += '\nScroll diagnostics: '+JSON.stringify(await evaluate('({y:scrollY,saved:history.state?.mcpa?.scroll,route:location.hash,height:document.documentElement.scrollHeight,restoring:MCPANavigation.restoring})')); throw error; }
  };
  const count = () => evaluate(`Number(document.querySelector('.overview-kpis [data-go="sites"] .num').textContent)`);

  await logout();
  await f.db.query('update sites set assigned_engineer_id=null');
  await f.db.query('update sites set assigned_engineer_id=$1,is_active=true where id=$2',[f.actors.sky.id,f.sites.casa]);
  const existing=(await f.db.query('select count(*)::int as count from sites where is_active=true')).rows[0].count;
  for(let i=existing;i<7;i++)await f.db.query("insert into sites(id,name,location,assigned_engineer_id,assigned_engineer,is_active) values($1,$2,'Isolated fixture',$3,$4,true)",[randomUUID(),'Other project '+i,f.actors.pau.id,f.actors.sky.name]);
  await f.db.query("insert into sites(id,name,location,assigned_engineer_id,assigned_engineer,is_active) values($1,'Inactive assigned project','Isolated fixture',$2,'Inactive engineer',false)",[randomUUID(),f.actors.sky.id]);

  await login('admin'); await settled('dashboard'); assert.equal(await count(),7);
  await go('sites'); await wait("document.querySelector('#projects-count').textContent.startsWith('7 of')");
  await logout(); await login('sky'); await settled('dashboard'); assert.equal(await count(),1);
  assert.notEqual(f.actors.sky.id,f.actors.sky.authId,'Assignments use the stable profile, not the auth ID');
  assert.ok(await evaluate("document.querySelector('#mobile-back').hidden"),'No Back destination on first load');
  await go('sites'); await wait("document.querySelector('#projects-count').textContent.startsWith('1 of')");
  await logout(); await login('architect'); await settled('dashboard'); assert.equal(await count(),0);
  await go('sites'); await wait("document.querySelector('#projects-count').textContent.startsWith('0 of')");
  await logout();
  const architectSite=(await f.db.query('select id from sites where is_active=true and id<>$1 limit 1',[f.sites.casa])).rows[0].id;
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.architect.id,architectSite]);
  await login('architect'); await settled('dashboard'); assert.equal(await count(),1);
  await go('sites'); await wait("document.querySelector('#projects-count').textContent.startsWith('1 of')");
  await logout(); await login('sky'); await settled('dashboard');

  // Every required compact width, both themes, real touch on the Back control.
  for(const width of [375,393,430,768]) for(const dark of [false,true]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:true});
    await command('Emulation.setTouchEmulationEnabled',{enabled:true});
    await evaluate(`applyTheme(${dark},false)`);
    await go('dashboard');
    await evaluate("document.querySelector('.custody-list button').scrollIntoView({block:'center'})");
    const origin = await evaluate('scrollY'); assert.ok(origin>300);
    await click('.custody-list button'); await settled('masterlist');
    const metrics = await evaluate(`(()=>{const el=document.querySelector('#mobile-back'),r=el.getBoundingClientRect(),header=document.querySelector('#topbar').getBoundingClientRect(),style=getComputedStyle(el);return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,headerBottom:header.bottom,top:r.top,hidden:el.hidden,visible:style.display!=='none',foreground:style.color,background:style.backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
    assert.ok(!metrics.hidden&&metrics.visible&&metrics.height>=44&&metrics.width>=44);
    assert.ok(metrics.top>=metrics.headerBottom,'Back occupies its own row below menu/search/notifications');
    assert.equal(metrics.overflow,false); assert.notEqual(metrics.foreground,metrics.background);
    await shot(`navigation-${width}-${dark?'dark':'light'}`,true);
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:metrics.x,y:metrics.y}]});
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await settled('dashboard'); await at(origin);
    await forward('masterlist'); await back('dashboard'); await at(origin);
  }
  console.log('PASS 375/393/430/768 touch Back, both themes, Custody Overview scroll and Forward');
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await command('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
  const dashboardY=await scroll(600);
  await go('request'); await wait("document.querySelector('[data-request-submit]')");
  await fill('#mv-purpose','Draft survives browser Back');
  const requestY=await scroll(300); assert.ok(requestY>0);
  await go('transfer?view=history');
  const length=await evaluate('history.length');
  await evaluate("showScreen('transfer?view=history')"); await settled('transfer?view=history');
  assert.equal(await evaluate('history.length'),length,'Same-route updates create no duplicate history entries');
  await back('request'); await at(requestY);
  assert.equal(await evaluate("document.querySelector('#mv-purpose').value"),'Draft survives browser Back');
  assert.equal(await evaluate('history.state.mcpa.view'),undefined,'Browser entries contain no retained form data after logout');
  await back('dashboard'); await at(dashboardY);
  await forward('request'); await at(requestY);
  await forward('transfer?view=history');
  assert.ok(await evaluate("document.querySelector('[data-transfer-tab=history]').getAttribute('aria-selected')==='true'"));
  assert.equal(await evaluate('history.length'),length,'Traversals add no entries');

  // Two distinct visits to Dashboard retain distinct scroll positions.
  await go('dashboard'); const secondDashboardY=await scroll(250);
  await go('return'); await back('dashboard'); await at(secondDashboardY);
  await back('transfer?view=history'); await back('request'); await back('dashboard'); await at(dashboardY);

  // Delayed network responses and later DOM growth must not restore too early.
  await go('request');
  await evaluate(`window.__originalFetch=fetch; window.__releaseNavigationRead=null; window.fetch=(url,options)=>String(url)==='/__db'&&JSON.parse(options?.body||'{}').rpc==='mcpa_movement_snapshot'?new Promise(resolve=>{window.__releaseNavigationRead=()=>resolve(__originalFetch(url,options));}):__originalFetch(url,options)`);
  await evaluate('history.back()'); await wait('typeof __releaseNavigationRead === "function"');
  assert.equal(await evaluate('MCPANavigation.restoring'),true,'Scroll restoration waits on the actual data promise');
  await evaluate('window.fetch=__originalFetch; __releaseNavigationRead()'); await settled('dashboard'); await at(dashboardY);
  await evaluate("document.querySelector('#screen-dashboard').style.cssText='max-height:200px;overflow:hidden'");
  await wait('scrollY < '+dashboardY);
  await evaluate("document.querySelector('#screen-dashboard').removeAttribute('style')"); await at(dashboardY);

  // The same scroll mechanism also supports #content instead of the window.
  await evaluate("document.getElementById('content').style.cssText='height:500px;max-height:500px;overflow:auto;flex:none';document.getElementById('content').scrollIntoView({block:'center'})");
  const contentPoint=await evaluate("(()=>{const r=document.getElementById('content').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',...contentPoint,deltaX:0,deltaY:350});
  await wait("document.getElementById('content').scrollTop>=350");
  const contentY=await evaluate("document.getElementById('content').scrollTop"); assert.ok(contentY>0);
  await go('request'); await back('dashboard');
  await wait(`Math.abs(document.getElementById('content').scrollTop-${contentY})<=2`);
  await evaluate("document.getElementById('content').removeAttribute('style')");

  // Nested Projects -> exact project -> equipment detail, including refresh.
  await go('sites'); await wait("document.querySelector('[data-action=open-site]')");
  await click('[data-action=open-site]'); const projectRoute='site-detail?record='+f.sites.casa; await settled(projectRoute);
  const toolButton=await evaluate("document.querySelector('[data-action=view-tool]')?.dataset.id"); assert.ok(toolButton);
  await click('[data-action=view-tool]'); const toolRoute=projectRoute+'&tool='+toolButton; await settled(toolRoute);
  await wait("document.querySelector('#sites-dialog').open");
  await command('Page.reload'); await settled(toolRoute); await wait("document.querySelector('#sites-dialog').open");
  await back(projectRoute); assert.equal(await evaluate("document.querySelector('#sites-dialog').open"),false);
  await back('sites');
  await go('masterlist'); await wait("document.querySelector('[data-tool]')");
  const equipmentId=await evaluate("document.querySelector('[data-tool]').dataset.tool");
  const equipmentRoute='masterlist?record='+encodeURIComponent(equipmentId);
  await click('[data-tool]'); await settled(equipmentRoute); await wait("document.querySelector('#equipment-detail')?.open");
  await go('masterlist'); assert.equal(await evaluate("!!document.querySelector('#equipment-detail')"),false);
  await back(equipmentRoute); await wait("document.querySelector('#equipment-detail')?.open");
  await go('masterlist?record=not-accessible');
  assert.equal(await evaluate("!!document.querySelector('#equipment-detail')"),false);
  assert.ok(await evaluate("document.querySelector('#overview-feedback').textContent.includes('unavailable')"));

  // Real activity link to a request, record IDs survive Forward and refresh.
  const destination=(await f.db.query('select name from sites where id=$1',[f.sites.casa])).rows[0].name;
  const record=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination,purpose:'History integration'},p_operation_id:randomUUID()});
  await go('activity'); await wait("document.querySelector('a[data-movement-link]')");
  const href=await evaluate("document.querySelector('a[data-movement-link]').hash.slice(1)");
  assert.ok(href.startsWith('request?record='));
  await click('a[data-movement-link]'); await settled(href);
  await wait("document.querySelector('[data-detail][open]')");
  const reference=await evaluate("document.querySelector('[data-detail] h2').textContent");
  await back('activity'); await forward(href);
  assert.equal(await evaluate("document.querySelector('[data-detail] h2').textContent"),reference);
  await command('Page.reload'); await settled(href);
  assert.equal(await evaluate("document.querySelector('[data-detail] h2').textContent"),reference);
  await go('request?record=unavailable-record');
  assert.ok(await evaluate("document.querySelector('[data-notice]').textContent.includes('unavailable')"));
  assert.equal(await evaluate("!!document.querySelector('[data-detail][open]')"),false,'Missing record cannot reopen a previous record');
  await go('dashboard'); await evaluate("showScreen('users')");
  await wait("document.querySelector('[role=alert]')?.textContent.includes('Access restricted') && !MCPANavigation.restoring");
  await back('dashboard');

  assert.equal(await evaluate("[...__channels].filter(channel=>channel.tables.length===1 && channel.tables[0]==='mcpa_notifications').length"),1,'Returning from a denied route preserves the notification subscription');

  // Signed-out entries and a different account cannot restore the former record.
  await go(href); await logout(); await login('architect'); await settled('dashboard');
  await evaluate('history.back()'); await settled('dashboard');
  assert.equal(await evaluate('MCPANavigation.canBack()'),false);
  assert.equal(await evaluate("!!document.querySelector('[data-detail][open]')"),false);
  await logout(); await login('sky'); await settled('dashboard');
  await command('Page.navigate',{url:base+'/index.html#'+href}); await settled(href);
  assert.equal(await evaluate("document.querySelector('[data-detail] h2').textContent"),reference,'Root entry point also supports record refresh');
  assert.equal(await evaluate('MCPANavigation.canBack()'),false,'A new deep link has no assumed in-app predecessor');
  await click('[data-action=close-detail]'); await settled('request');
  await logout(); await login('admin'); await settled('dashboard');
  await go('sites'); const noticeOrigin=await scroll(300);
  await click('.bell-wrap'); await wait("document.querySelector('[data-monitoring-notice]')");
  const notice=await evaluate(`MCPAMonitoring.getState().notifications.find(n=>n.entityId===${q(record.id)})?.id`); assert.ok(notice);
  await click(`[data-monitoring-notice="${notice}"]`); await settled(href);
  await back('sites'); await at(noticeOrigin);
  await go(href); await fill('#mv-reason','Unsaved review notes');
  await evaluate("document.querySelector('#movement-detail').scrollTop=120");
  const detailY=await evaluate("document.querySelector('#movement-detail').scrollTop");
  await go('transfer'); await back(href);
  assert.equal(await evaluate("document.querySelector('#mv-reason').value"),'Unsaved review notes');
  assert.equal(await evaluate("document.querySelector('#movement-detail').scrollTop"),detailY);
  await go('masterlist'); await go('tool-profile?record=TOOL-002');
  assert.ok(await evaluate("document.querySelector('#profileContent').textContent.includes('TOOL-002')"));
  await command('Page.reload'); await settled('tool-profile?record=TOOL-002');
  assert.ok(await evaluate("document.querySelector('#profileContent').textContent.includes('TOOL-002')"));
  await back('masterlist'); assert.equal(await evaluate("getComputedStyle(document.querySelector('#screen-tool-profile')).display"),'none');
  await go('tool-profile?record=unavailable');
  assert.ok(await evaluate("document.querySelector('#profileContent').textContent.includes('unavailable')"));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const dark of [false,true]) {
    await evaluate(`applyTheme(${dark},false)`); await go('dashboard'); const y=await scroll(300);
    await go('request'); assert.equal(await evaluate("getComputedStyle(document.querySelector('.mobile-history')).display"),'none');
    await back('dashboard'); await at(y); await shot('navigation-desktop-'+(dark?'dark':'light'),true);
  }
  console.log('PASS nested routes, per-entry window/content scroll, delayed reads, drafts, refresh, permissions and session isolation');
};
