// Helpers for auth.browser.cjs. All data changes use its isolated PostgreSQL fixture.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');

exports.header=async({evaluate,command,wait,click,fill,go,shot})=>{
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 // Pause the native reveal as soon as it is ready. CDP round trips and screenshots
 // can outlast 550ms, so inspect its real animation without racing its completion.
 await evaluate(`window.__transitionCount=0;window.__startTransition=document.startViewTransition.bind(document);
 window.__readThemeDestinationColors=()=>{
  const probe=document.createElement('span');probe.style.cssText='visibility:hidden;position:fixed;background:var(--background);color:var(--text-primary)';document.body.append(probe);
  const expected=getComputedStyle(probe),body=getComputedStyle(document.body);
  const colors={background:body.backgroundColor,color:body.color,expectedBackground:expected.backgroundColor,expectedColor:expected.color,components:[]};probe.remove();
  for(const element of document.querySelectorAll('.nav-item,.btn,tbody tr')){
   const rect=element.getBoundingClientRect();if(!rect.width||!rect.height||rect.right<=0||rect.left>=innerWidth||rect.bottom<=0||rect.top>=innerHeight)continue;
   const style=getComputedStyle(element),properties=['backgroundColor','color','borderTopColor'];
   const actual=properties.map(name=>style[name]),original=element.getAttribute('style');
   element.style.setProperty('transition','none','important');
   const destination=getComputedStyle(element),settled=properties.map(name=>destination[name]);
   if(original===null)element.removeAttribute('style');else element.setAttribute('style',original);
   colors.components.push({kind:element.matches('.nav-item')?'nav':element.matches('.btn')?'button':'row',actual,settled});
  }
  return colors;
 };
 document.startViewTransition=update=>{
  window.__transitionCount++;
  window.__transitionOrigin={x:parseFloat(document.documentElement.style.getPropertyValue('--theme-x')),y:parseFloat(document.documentElement.style.getPropertyValue('--theme-y')),radius:parseFloat(document.documentElement.style.getPropertyValue('--theme-radius'))};
  const transition=window.__lastTransition=window.__startTransition(update);
  window.__revealInspection=transition.ready.then(async()=>{
   // Sample immediately at ready: descendant fades can finish during CDP calls.
   window.__destinationSamples=window.__readThemeDestinationColors();
   const animation=window.__revealAnimation=document.getAnimations().find(animation=>animation.animationName==='theme-reveal');
   if(animation){animation.pause();await animation.ready;animation.currentTime=0;}
  });
  return transition;
 }`);
 const assertColors=async(fromReady=false)=>{
  const colors=await evaluate(fromReady?'window.__destinationSamples':'window.__readThemeDestinationColors()');
  assert.equal(colors.background,colors.expectedBackground,'Destination background is fully themed');
  assert.equal(colors.color,colors.expectedColor,'Destination text is fully themed');
  if(fromReady)for(const component of colors.components)assert.deepEqual(component.actual,component.settled,`Visible ${component.kind} uses final destination colors`);
  return colors;
 };
 const assertCleanup=async()=>{
  assert.ok(await evaluate("!document.documentElement.classList.contains('theme-transition') && ['--theme-x','--theme-y','--theme-radius'].every(name=>!document.documentElement.style.getPropertyValue(name))"),'Temporary reveal styles are removed');
 };
 for(const [width,height] of [[375,852],[393,852],[430,852],[768,852],[1024,852],[1366,768],[1440,900],[1600,900],[1920,1080],[2560,1440]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=768});
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const beforeNavigation=await evaluate('window.__transitionCount');
  await go('request');await wait("document.querySelector('[data-list]')");
  assert.equal(await evaluate('window.__transitionCount'),beforeNavigation,'Navigation does not animate theme');
  for(const dark of [true,false]){
   const rect=await evaluate("(()=>{const r=document.querySelector('.theme-toggle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
   await click('.theme-toggle');
   await evaluate('window.__revealInspection');
   const origin=await evaluate('window.__transitionOrigin');
   assert.equal(origin.x,rect.x);assert.equal(origin.y,rect.y);
   assert.ok(origin.radius>=Math.hypot(Math.max(rect.x,width-rect.x),Math.max(rect.y,height-rect.y))-.01);
   assert.equal(await evaluate("document.querySelectorAll('.theme-toggle').length"),1,'One shared responsive theme control');
   if(width>900)assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#theme-label')).display"),'none','Desktop keeps the theme label');
   const animation=await evaluate("(()=>{const style=getComputedStyle(document.documentElement,'::view-transition-new(root)');return {name:style.animationName,duration:window.__revealAnimation?.effect.getTiming().duration,easing:style.animationTimingFunction,state:window.__revealAnimation?.playState}})()");
   assert.deepEqual(animation,{name:'theme-reveal',duration:550,easing:'cubic-bezier(0.76, 0, 0.24, 1)',state:'paused'});
   await assertColors(true);
   const beforeRepeatedClicks=await evaluate('window.__transitionCount');
   await evaluate("document.querySelector('.theme-toggle').click();document.querySelector('.theme-toggle').click()");
   assert.equal(await evaluate('window.__transitionCount'),beforeRepeatedClicks,'Repeated clicks do not overlap reveals');
   await evaluate('window.__revealAnimation.currentTime=220');
   if([393,1440,1920].includes(width))await shot('theme-reveal-'+width+'-'+(dark?'dark':'light'),true);
   await evaluate('window.__revealAnimation.play();window.__lastTransition.finished');
   await wait("!document.documentElement.classList.contains('theme-transition')");
   await assertCleanup();
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Reveal preserves viewport width');
   assert.equal(await evaluate("document.body.classList.contains('dark')"),dark);
   assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),dark?'dark':'light');
   assert.equal(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')"),dark?'Switch to light mode':'Switch to night mode');
   assert.ok(await evaluate("!document.body.innerText.includes('Live database') && !document.querySelector('[data-action=refresh]')"));
   if(width<=768){
    assert.ok(await evaluate("getComputedStyle(document.querySelector('.mobile-search-toggle')).display!=='none' && getComputedStyle(document.querySelector('.search-wrap')).display==='none'"));
    await click('#mobile-search-toggle');
    assert.equal(await evaluate('document.activeElement.id'),'global-search-input');
    assert.ok(await evaluate("(()=>{const r=document.querySelector('#global-search-panel').getBoundingClientRect(),i=document.querySelector('#global-search-input').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && i.width>innerWidth*.65 && document.documentElement.scrollWidth<=innerWidth})()"));
    if([393,430].includes(width))await shot('mobile-search-'+width+'-'+(dark?'dark':'light'));
    await fill('#global-search-input','TOOL-001');
    await wait("document.querySelector('#global-search-list')?.textContent.includes('TOOL-001')");
    assert.ok(await evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')"));
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate('document.activeElement.id'),'mobile-search-toggle');
    assert.equal(await evaluate("document.querySelector('#mobile-search-toggle').getAttribute('aria-expanded')"),'false');
    await click('#mobile-search-toggle');await click('.mobile-search-close');
    assert.equal(await evaluate('document.activeElement.id'),'mobile-search-toggle');
    await click('#mobile-search-toggle');await click('.bell-wrap');
    await wait("document.querySelector('#monitoring-dialog')?.open");
    assert.equal(await evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')"),false);
    await click('[data-monitoring-activity]');
    await wait("document.querySelector('#screen-activity.active #overview-results')");
    assert.equal(await evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')"),false);
    await click('#account-menu summary');assert.ok(await evaluate("document.querySelector('#account-menu').open"));await click('#account-menu summary');
   }else{
    assert.ok(await evaluate("getComputedStyle(document.querySelector('.mobile-search-toggle')).display==='none' && document.querySelector('#global-search-input').getBoundingClientRect().width>250"));
    if(width===1440)await shot('header-desktop-'+(dark?'dark':'light'));
   }
  }
 }
 // The empty Requests view has no action buttons or table rows yet. Inspect
 // existing dashboard components without creating any records for this check.
 await go('dashboard');await wait("document.querySelector('#overview-results tbody tr .btn')");
 await evaluate("document.querySelector('#overview-results tbody tr').scrollIntoView({block:'center'})");
 const hoveredRow=await evaluate("(()=>{const rect=document.querySelector('#overview-results tbody tr').getBoundingClientRect();return {x:rect.left+20,y:rect.top+rect.height/2}})()");
 await command('Input.dispatchMouseEvent',{type:'mouseMoved',...hoveredRow});
 assert.ok(await evaluate("document.querySelector('#overview-results tbody tr:hover')"),'The themed inventory hover surface is sampled');
 for(const dark of [true,false]){
  await click('.theme-toggle');await evaluate('window.__revealInspection');
  const colors=await assertColors(true);
  assert.ok(colors.components.some(component=>component.kind==='button'),'Dashboard action button sampled');
  assert.ok(colors.components.some(component=>component.kind==='row'),'Dashboard inventory row sampled');
  assert.ok(colors.components.some(component=>component.kind==='nav'),'Desktop navigation sampled');
  await evaluate('window.__revealAnimation.play();window.__lastTransition.finished');
  await assertCleanup();assert.equal(await evaluate("document.body.classList.contains('dark')"),dark);
 }
 await go('request');await wait("document.querySelector('[data-list]')");
 // Keyboard activation must use the same sticky control and viewport origin,
 // preserve scroll/focus, and leave the control exposed to pointer input.
 for(const [width,height] of [[393,852],[1440,900],[1920,1080]]){
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=768});
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 // Ensure desktop's otherwise short empty fixture can actually scroll.
 await evaluate("(()=>{const spacer=document.createElement('div');spacer.id='theme-scroll-fixture';spacer.style.height='100vh';document.querySelector('#content').append(spacer)})()");
 await evaluate("window.scrollTo(0,document.documentElement.scrollHeight);document.querySelector('.theme-toggle').focus({preventScroll:true})");
 const scrolled=await evaluate('scrollY');assert.ok(scrolled>0,'Exercise a genuinely scrolled page');
 for(const dark of [true,false]){
  const center=await evaluate("(()=>{const r=document.querySelector('.theme-toggle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await evaluate('window.__revealInspection');
  const origin=await evaluate('window.__transitionOrigin');
  assert.equal(origin.x,center.x);assert.equal(origin.y,center.y);
  await evaluate('window.__revealAnimation.play();window.__lastTransition.finished');
  await assertCleanup();
  assert.equal(await evaluate('scrollY'),scrolled,'Theme does not scroll the page');
  assert.equal(await evaluate("document.activeElement.matches('.theme-toggle')"),true,'Keyboard focus stays on the control');
  assert.equal(await evaluate("document.body.classList.contains('dark')"),dark);
  assert.ok(await evaluate(`Boolean(document.elementFromPoint(${center.x},${center.y})?.closest('.theme-toggle'))`),'No stale transition layer blocks the control');
 }
 await evaluate("document.querySelector('#theme-scroll-fixture').remove();window.scrollTo(0,0)");
 }
 // Interrupt a held native reveal, then prove the next toggle remains usable.
 for(const interruption of ['motion','resize','skip','complete']){
  const dark=await evaluate("!document.body.classList.contains('dark')");
  await click('.theme-toggle');await evaluate('window.__revealInspection');
  if(interruption==='motion')await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  else if(interruption==='resize')await command('Emulation.setDeviceMetricsOverride',{width:1024,height:852,deviceScaleFactor:1,mobile:false});
  else if(interruption==='skip')await evaluate('window.__lastTransition.skipTransition()');
  else await evaluate('window.__revealAnimation.play()');
  await evaluate('window.__lastTransition.finished');await assertCleanup();
  assert.equal(await evaluate("document.body.classList.contains('dark')"),dark,'Interrupted reveal keeps the selected theme');
  assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),dark?'dark':'light');
  if(interruption==='motion')await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 }
 const before=await evaluate('window.__transitionCount');
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('.theme-toggle');assert.equal(await evaluate('window.__transitionCount'),before);
 assert.ok(await evaluate("document.body.classList.contains('dark')"));
 assert.equal(await evaluate('getComputedStyle(document.body).transitionDuration'),'0s');
 await assertColors();await assertCleanup();
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate('document.startViewTransition=undefined');await click('.theme-toggle');
 assert.equal(await evaluate('window.__transitionCount'),before);
 assert.equal(await evaluate("document.body.classList.contains('dark')"),false);
 await assertCleanup();
 await evaluate("document.startViewTransition=()=>{throw new Error('Fixture: View Transitions unavailable')}");
 await evaluate('toggleTheme()');
 assert.ok(await evaluate("document.body.classList.contains('dark') && localStorage.getItem('mcpa.theme')==='dark'"));
 await assertCleanup();
 // Inject a rejected native update callback and check the existing switch recovers.
 await evaluate("document.startViewTransition=()=>{const transition=window.__startTransition(()=>Promise.reject(new Error('Fixture: theme update rejected')));transition.updateCallbackDone.catch(()=>{});return transition}");
 await evaluate('toggleTheme()');
 assert.ok(await evaluate("!document.body.classList.contains('dark') && localStorage.getItem('mcpa.theme')==='light'"));
 await assertCleanup();
 await evaluate('document.startViewTransition=window.__startTransition');
 // Count calls before app scripts execute, including restoration and navigation.
 const {identifier}=await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.__initialThemeTransitionCount=0;const start=document.startViewTransition;document.startViewTransition=function(...args){window.__initialThemeTransitionCount++;return start.apply(this,args)}"});
 try{
  for(const dark of [true,false]){
   await evaluate('toggleTheme()');
   assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),dark?'dark':'light');
   await command('Page.reload');await wait("document.querySelector('#screen-request.active [data-list]')");
   assert.equal(await evaluate("document.body.classList.contains('dark')"),dark);
   assert.equal(await evaluate("document.querySelector('#theme-label').textContent"),dark?'Light mode':'Night mode');
   assert.equal(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')"),dark?'Switch to light mode':'Switch to night mode');
   assert.equal(await evaluate('window.__initialThemeTransitionCount'),0,'Saved theme restoration has no reveal');
   await assertCleanup();
   await go('activity');await wait("document.querySelector('#overview-results')");await go('request');
   assert.equal(await evaluate('window.__initialThemeTransitionCount'),0,'Screen changes have no theme reveal');
   const otherEntry=await evaluate("location.origin+(location.pathname.includes('/2-engr/')?'/index.html':'/2-engr/index.html')+'#request'");
   await command('Page.navigate',{url:otherEntry});await wait("document.querySelector('#screen-request.active [data-list]')");
   assert.equal(await evaluate("document.body.classList.contains('dark')"),dark,'Both entry pages restore the same saved theme');
   assert.equal(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')"),dark?'Switch to light mode':'Switch to night mode');
   assert.equal(await evaluate('window.__initialThemeTransitionCount'),0,'Neither entry page animates on load');
   await assertCleanup();
  }
 }finally{await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
 console.log('PASS Header at 375/393/430/768/1024/1366/1440/1600/1920/2560: both real theme reveals, origin/radius, final colors, 550ms easing, rapid clicks, cleanup, scrolled keyboard activation/focus, motion/resize/skipped interruption recovery, both saved preferences, unsupported/throw/rejected-update fallback, reduced motion, search/filtering, close/Escape, account and activity access');
};

exports.sync=async({fixture,evaluate,command,wait,fill,go,login,logout,calls})=>{
 const action=(actor,name,payload)=>fixture.rpc(fixture.actors[actor],'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:randomUUID()});
 await fixture.query(fixture.actors.admin,"insert into public.equipment(id,asset_id,name,quantity,status) values($1,'SYNC-TOOL','Synchronization fixture tool',1,'AVAILABLE')",[randomUUID()]);
 await login('admin');await wait("document.querySelector('.admin-review')");await go('request');await wait("document.querySelector('[data-list]')");
 const req=await action('sky','createRequest',{toolIds:['SYNC-TOOL'],destination:'Casa Buena',purpose:'Isolated automatic sync test'});
 await evaluate('__tickSync()');
 await wait("document.querySelector('[data-list]')?.textContent.includes("+JSON.stringify(req.id)+")");
 assert.equal(await evaluate('window.__channels.size'),2);assert.equal(await evaluate('window.__syncTimers.size'),2);
 await logout();await login('sky');await wait("document.querySelector('.overview-actions')");await go('request');await wait("document.querySelector('[name=purpose]')");
 await fill('[name=purpose]','Keep my unsaved draft');
 await action('admin','approveRequest',{id:req.id});await evaluate('__tickSync()');
 await wait("MovementStore.getState().requests.find(r=>r.id==="+JSON.stringify(req.id)+")?.status==='approved'");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Keep my unsaved draft');
 const trf=await action('admin','releaseRequest',{id:req.id});await evaluate('showScreen('+JSON.stringify('transfer?record='+trf.id)+')');
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes("+JSON.stringify(trf.id)+")");
 await action('sky','receiveTransfer',{id:trf.id,inspections:[{toolId:'SYNC-TOOL',condition:'good',tested:true,notes:''}]});
 await evaluate('__tickSync()');await wait("document.querySelector('[data-detail]')?.textContent.includes('Received / Completed')");
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='SYNC-TOOL').holderId"),fixture.actors.sky.id);
 await go('activity');await wait("document.querySelector('#overview-results')");
 const rep=await action('sky','reportRepair',{toolId:'SYNC-TOOL',notes:'Isolated sync fixture damage'});
 await evaluate('__tickSync()');await wait("document.querySelector('#overview-results').textContent.includes("+JSON.stringify(rep.id)+")");
 await go('request');await wait("document.querySelector('[data-list]')");
 await fill('[name=purpose]','Draft survives lost connectivity');
 await evaluate('window.__failReads=true;__tickSync()');
 await wait("document.querySelector('[data-sync-warning]').textContent.includes('Unable to sync')");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Draft survives lost connectivity');
 await evaluate('window.__failReads=false;window.dispatchEvent(new Event("online"))');
 await wait("document.querySelector('[data-sync-warning]').textContent===''");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Draft survives lost connectivity');
 for(const screen of ['transfer','activity','request']){await go(screen);await wait("document.querySelector('#screen-"+screen+".active')");}
 assert.equal(await evaluate('window.__channels.size'),2);assert.equal(await evaluate('window.__syncTimers.size'),2);
 assert.deepEqual(await evaluate('[...window.__channels].map(channel=>channel.tables).sort((a,b)=>a[0].localeCompare(b[0]))'),[['equipment','sites','mcpa_notifications'],['mcpa_notifications']]);
 await logout();assert.equal(await evaluate('window.__channels.size'),0);assert.equal(await evaluate('window.__syncTimers.size'),0);
 await login('admin');await wait("document.querySelector('.admin-review')");await go('users');await wait("document.querySelector('#accounts-list tbody tr')");
 await fixture.rpc(fixture.actors.admin,'mcpa_save_account',{p_id:fixture.actors.pau.id,p_name:'Engineer Pau updated in fixture',p_role:'engineer',p_status:'active',p_auth_user_id:fixture.actors.pau.authId});
 await evaluate('__tickSync()');await wait("document.querySelector('#accounts-list').textContent.includes('Engineer Pau updated in fixture')");
 assert.deepEqual(await evaluate('[...window.__channels].map(channel=>channel.tables).sort((a,b)=>a[0].localeCompare(b[0]))'),[['mcpa_account_audit'],['mcpa_notifications']]);
 await logout();assert.equal(await evaluate('window.__channels.size'),0);assert.equal(await evaluate('window.__syncTimers.size'),0);
 console.log('PASS Automatic request/approval/release/receipt/custody/activity/people updates, drafts preserved, outage recovery, and channel/timer cleanup; isolated database only');
};
