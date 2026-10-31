// Additional auth.browser.cjs checks. RPC setup uses its in-memory fixture only.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');

exports.targeting = async ({fixture,request,evaluate,command,wait,click,go,enter,calls,shot,login,logout}) => {
  assert.ok(login && logout, 'The isolated login/logout helpers are required.');
  const quote = JSON.stringify;
  const hash = (kind,id) => '#' + kind + '?record=' + encodeURIComponent(id);
  const route = (kind,id) => kind + '?record=' + encodeURIComponent(id);
  const action = (actor,name,payload) => fixture.rpc(fixture.actors[actor], 'mcpa_movement_action', {
    p_action:name, p_payload:payload, p_operation_id:randomUUID()
  });
  const snapshot = () => fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
  const writeCount = () => calls.filter(call => call.rpc === 'mcpa_movement_action').length;
  const opened = (kind,id) => `document.querySelector('#screen-${kind}.active [data-detail]:not([hidden]) h2')?.textContent===${quote(id)} && document.activeElement.matches('[data-detail]')`;
  const open = async (kind,id) => {
    await evaluate(`showScreen(${quote(route(kind,id))})`);
    await wait(opened(kind,id));
    assert.equal(await evaluate('location.hash'),hash(kind,id));
  };
  const settle = () => evaluate("Promise.all(document.getAnimations().filter(a=>a.playState==='running').map(a=>a.finished.catch(()=>{})))");
  const viewport = async width => {
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=768});
    await command('Emulation.setTouchEmulationEnabled',{enabled:width<=768});
  };
  const key = async (key,code,windowsVirtualKeyCode) => {
    await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
  };
  const checkSelect = async (selector,width) => {
    const control = await evaluate(`(()=>{const s=document.querySelector(${quote(selector)});s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return {tag:s.tagName,disabled:s.disabled,x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,right:r.right,height:r.height,font:parseFloat(getComputedStyle(s).fontSize),options:[...s.options].map(o=>({value:o.value,text:o.textContent})),top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===s};})()`);
    assert.equal(control.tag,'SELECT',selector+' retains native semantics');
    assert.equal(control.disabled,false,selector+' is enabled');
    assert.equal(control.top,true,selector+' is unobstructed at '+width);
    assert.ok(control.left>=0 && control.right<=width && control.height>=44,selector+' fits with a touch target at '+width);
    if(width<=768) assert.ok(control.font>=16,selector+' remains readable at '+width);
    assert.ok(control.options.some(option=>option.value),selector+' has selectable options');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal page overflow at '+width);
    if(width<=768) {
      await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:control.x,y:control.y}]});
      await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await key('Escape','Escape',27);
    }
    await evaluate(`document.querySelector(${quote(selector)}).focus()`);
    await key('End','End',35); await key('Enter','Enter',13); if(!await evaluate("document.querySelector('dialog[data-detail][open]')!==null"))await key('Escape','Escape',27);
    assert.equal(await evaluate(`document.querySelector(${quote(selector)}).value`),control.options.at(-1).value,selector+' retains the keyboard selection at '+width);
    if(selector==='#mv-receiver'){assert.ok(control.options.some(option=>option.value===fixture.actors.pau.id),'Stable recipient IDs remain values');assert.ok(control.options.every(option=>!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(option.text)),'Recipient labels omit UUIDs');}
  };

  // Inspect equivalent engineering controls while the original held tools are
  // still eligible. Only field selection occurs; none of these forms is saved.
  await logout(); await login('sky'); await wait("MCPAAuth.profile?.role==='engineer'");
  for(const width of [375,390,430,768,1024,1440]) {
    await viewport(width);
    for(const [kind,selectors] of [
      ['request',['#mv-destination']],
      ['transfer',['#mv-destination','#mv-receiver']],
      ['return',['[data-condition]']],
      ['repair',['#mv-tool']],
      ['missing',['#mv-tool']]
    ]) {
      await go(kind); await wait("document.querySelector('[data-form=create]')");
      if(kind==='transfer')await click('[data-action=manual-receiver]');
      if(kind==='return') await click('[name="toolIds"][value="TOOL-003"]');
      await settle();
      for(const selector of selectors) await checkSelect(selector,width);
    }
  }
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  console.log('PASS Equivalent native form selects, long recipient labels, touch targets, keyboard selection and viewport fit at 375/390/430/768/1024/1440; no forms submitted');

  const receiverSite=randomUUID();await fixture.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Notification receiving project','Fixture',$2,$3)",[receiverSite,fixture.actors.pau.name,fixture.actors.pau.id]);
  const transfer = await action('sky','createTransfer',{toolIds:['TOOL-002'],destination:'Notification receiving project',receiverId:fixture.actors.pau.id,notes:'Isolated notification targeting transfer'});
  const returned = await action('sky','createReturn',{toolIds:['TOOL-003'],destination:'Main Office',conditions:[{toolId:'TOOL-003',condition:'good'}],notes:'Isolated notification targeting return'});
  const repair = await action('sky','reportRepair',{toolId:'TOOL-004',notes:'Isolated notification targeting repair'});
  await action('admin','startRepair',{id:repair.id});
  const missing = await action('sky','reportMissing',{toolId:'TOOL-005',notes:'Isolated notification targeting missing report'});
  await logout(); await login('admin'); await wait("MCPAAuth.profile?.role==='admin'");
  const baseline = await snapshot(), baselineWrites = writeCount();
  assert.deepEqual(baseline.requests.find(record=>record.id===request.id),request,'Additional local setup preserves the original pending request');

  for(const width of [390,1440]) {
    await viewport(width);
    for(const [kind,record] of [['transfer',transfer],['return',returned],['repair',repair],['missing',missing]]) {
      await go('activity');
      const selector='a[data-movement-link][href="'+hash(kind,record.id)+'"]';
      await wait(`document.querySelector(${quote(selector)})`); await settle();
      if(width===1440) await enter(selector);
      else {
        const point = await evaluate(`(()=>{const link=document.querySelector(${quote(selector)});const row=link.closest('tr');row.scrollIntoView({block:'center'});const r=row.querySelector('td').getBoundingClientRect();const x=r.left+12,y=r.top+12;return {x,y,linked:document.elementFromPoint(x,y)?.closest('a[data-movement-link]')?.getAttribute('href')===${quote(hash(kind,record.id))}};})()`);
        assert.ok(point.linked,'Full '+kind+' activity row is tappable');
        await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
        await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }
      await wait(opened(kind,record.id));
      assert.equal(await evaluate('location.hash'),hash(kind,record.id));
      assert.ok(await evaluate(`document.querySelector('.mv-selected-row')?.textContent.includes(${quote(record.id)}) && document.querySelector('dialog[data-detail][open]') && !document.querySelector('#sidebar.open')`),'Target opens and overlays are closed');
    }
  }
  for(const width of [375,390,430,768,1024,1440]) {
    await viewport(width);
    await open('repair',repair.id); await settle(); await checkSelect('[name=repairDestination]',width);
    await open('missing',missing.id); await settle();
    await checkSelect('[name=recoveryDestination]',width); await checkSelect('#mv-recovered-condition',width);
  }
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  console.log('PASS Transfer/return/repair/missing activity rows open exact existing details on mobile and desktop; repair/recovery native selects fit all six widths');

  // Fault injection affects only the localhost browser transport. It cannot
  // reach a remote service and never invokes a business-write RPC.
  await evaluate(`window.__targetingFetch=window.fetch.bind(window);window.__failRequestModule=false;window.__holdTargetSnapshot=false;window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(window.__failRequestModule && /\\/(?:1-admin|2-engr)\\/modules\\/requests\\/requests\\.html$/.test(url.pathname)){window.__failRequestModule=false;return Promise.resolve(new Response('',{status:503}));}let query;try{query=JSON.parse(init?.body||'null')}catch(_){}if(window.__holdTargetSnapshot && url.pathname==='/__db' && query?.rpc==='mcpa_movement_snapshot'){window.__holdTargetSnapshot=false;return new Promise(resolve=>{window.__releaseTargetSnapshot=()=>{window.__releaseTargetSnapshot=null;resolve(window.__targetingFetch(input,init));};});}return window.__targetingFetch(input,init);};`);
  try {
    for(const actor of ['admin','sky']) {
      if(actor==='sky') { await logout(); await login('sky'); await wait("MCPAAuth.profile?.role==='engineer'"); }
      await go('activity'); await wait("document.querySelector('#overview-results')");
      await evaluate(`window.__failRequestModule=true;showScreen(${quote(route('request',request.id))})`);
      await wait("document.querySelector('#retry-module')");
      assert.equal(await evaluate('location.hash'),hash('request',request.id),'Module failure keeps the target hash for '+actor);
      await click('#retry-module'); await wait(opened('request',request.id));
      assert.equal(await evaluate('location.hash'),hash('request',request.id),'Module Retry preserves the target for '+actor);
    }
    await logout(); await login('admin'); await wait("MCPAAuth.profile?.role==='admin'");
    for(const recovery of ['manual','automatic']) {
      await go('activity'); await wait("document.querySelector('#overview-results')");
      await evaluate(`window.__failReads=true;showScreen(${quote(route('request',request.id))})`);
      await wait("document.querySelector('.mv-setup [data-action=retry]')");
      assert.equal(await evaluate('location.hash'),hash('request',request.id));
      await evaluate('window.__failReads=false');
      if(recovery==='manual') await click('.mv-setup [data-action=retry]');
      else await evaluate('__tickSync()');
      await wait(opened('request',request.id));
      assert.equal(await evaluate('location.hash'),hash('request',request.id),recovery+' snapshot recovery preserves the target');
    }
    await evaluate("showScreen('request?record=missing-local-target')");
    await wait("document.querySelector('[data-notice]')?.textContent.includes('unavailable')");
    assert.ok(await evaluate("!document.querySelector('[data-detail]').open"));
    await open('request',request.id);
    assert.equal(await evaluate("document.querySelector('[data-notice]').textContent"),'','Successful targeting clears stale unavailable notices');

    const latestTarget = route('request',request.id);
    await evaluate(`window.__holdTargetSnapshot=true;showScreen('request?record=stale-local-target');`);
    await wait("typeof window.__releaseTargetSnapshot==='function'");
    await evaluate(`showScreen(${quote(latestTarget)})`);
    await evaluate('__releaseTargetSnapshot()');
    await wait(opened('request',request.id));
    assert.ok(await evaluate(opened('request',request.id)),'Latest record target wins over a delayed older target');
    assert.equal(await evaluate("document.querySelector('[data-notice]').textContent"),'');

    await evaluate(`window.__holdTargetSnapshot=true;showScreen(${quote(latestTarget)})`);
    await wait("typeof window.__releaseTargetSnapshot==='function'");
    await go('request');
    assert.equal(await evaluate('location.hash'),'#request');
    await evaluate('__releaseTargetSnapshot()');
    await evaluate('MovementStore.refresh()'); await settle();
    assert.equal(await evaluate('location.hash'),'#request');
    assert.ok(await evaluate("!document.querySelector('[data-detail]').open"),'Plain Requests navigation cancels the pending notification target');

    await go('activity'); await wait("document.querySelector('#overview-results')");
    await evaluate(`window.__failReads=true;showScreen(${quote(latestTarget)})`);
    await wait("document.querySelector('.mv-setup [data-action=retry]')");
    await evaluate('window.__failReads=false;window.__holdTargetSnapshot=true');
    await click('.mv-setup [data-action=retry]');
    await wait("typeof window.__releaseTargetSnapshot==='function'");
    // Deliberately navigate during the held mount. The normal go helper now
    // waits for navigation-ready, which cannot occur until this test releases it.
    await evaluate("showScreen('request')");
    await wait("document.querySelector('#screen-request.active')");
    await evaluate('__releaseTargetSnapshot()');
    await wait("document.querySelector('#screen-request.active [data-list]')");
    await evaluate('MovementStore.refresh()'); await settle();
    assert.equal(await evaluate('location.hash'),'#request');
    assert.ok(await evaluate("!document.querySelector('[data-detail]').open"),'A cancelled manual Retry cannot reopen an obsolete target');
  } finally {
    await evaluate("window.__failReads=false;window.__failRequestModule=false;window.__holdTargetSnapshot=false;window.__releaseTargetSnapshot?.();window.fetch=window.__targetingFetch;delete window.__targetingFetch;");
  }
  await logout(); await login('architect'); await wait("MCPAAuth.profile?.role==='architect'");
  await evaluate(`showScreen(${quote(route('request',request.id))})`);
  await wait("document.querySelector('[data-notice]')?.textContent.includes('unavailable')");
  assert.ok(await evaluate("!document.querySelector('[data-detail]').open"),'Inaccessible targets expose no unrelated record details');
  await logout(); await login('admin'); await wait("MCPAAuth.profile?.role==='admin'");
  await open('request',request.id);
  assert.ok(await evaluate("document.querySelector('[data-detail]').textContent.includes('Pending Review')"));
  assert.deepEqual(await snapshot(),baseline,'All target navigation, role checks and injected failures preserve existing records and activity');
  assert.equal(writeCount(),baselineWrites,'Targeting and equivalent-select checks perform no browser business writes');
  if(shot) await shot('notification-targeting-recovery');
  console.log('PASS Module Retry, manual/automatic snapshot recovery, stale notice cleanup, missing/inaccessible targets, latest-target wins, plain-route cancellation and unchanged records');
};
