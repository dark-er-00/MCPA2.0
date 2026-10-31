// Read-only UI checks for auth.browser.cjs. Its isolated browser blocks live endpoints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

exports.verify = async ({evaluate, command, wait, click, fill, go, login, logout}) => {
  for (const entry of ['index.html', '2-engr/index.html']) {
    const html = fs.readFileSync(path.resolve(__dirname, '..', entry), 'utf8');
    assert.match(html, /id="mobile-search-toggle"[^>]*aria-label="Search"/);
    assert.match(html, /class="[^"]*mobile-search-close[^"]*"[^>]*aria-label="Close search"/);
    assert.match(html, /id="global-search-input"[^>]*aria-label="[^"]+"[^>]*oninput="globalSearch\(this\.value\)"/);
  }
  const viewport = async width => {
    await command('Emulation.setDeviceMetricsOverride', {width, height:852, deviceScaleFactor:1, mobile:width<=768});
    await command('Emulation.setTouchEmulationEnabled', {enabled:width<=768,maxTouchPoints:1});
    await wait(`innerWidth === ${width} && matchMedia('(max-width: 900px)').matches === ${width<=900}`);
    // Media-query change handlers and layout can finish after CDP reports the
    // new dimensions. Let them settle before the first trusted search tap.
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  const key = async (name, code) => {
    await command('Input.dispatchKeyEvent', {type:'keyDown', key:name, code:name, windowsVirtualKeyCode:code, ...(name==='Enter' ? {text:'\r'} : {})});
    await command('Input.dispatchKeyEvent', {type:'keyUp', key:name, code:name, windowsVirtualKeyCode:code});
  };
  const touchPoint = async (x, y, selector = '') => {
    await evaluate(`(()=>{
      window.__mobileSearchTestTap={complete:false};
      document.addEventListener('click',event=>{
        window.__mobileSearchTestTap.trusted=event.isTrusted;
        window.__mobileSearchTestTap.target=event.target.outerHTML?.slice(0,300);
        window.__mobileSearchTestTap.client={x:event.clientX,y:event.clientY};
        window.__mobileSearchTestTap.expectedTarget=${JSON.stringify(selector)};
        window.__mobileSearchTestTap.matched=!${JSON.stringify(selector)} || !!event.target.closest(${JSON.stringify(selector)});
        requestAnimationFrame(()=>{window.__mobileSearchTestTap.complete=true});
      },{once:true,capture:true});
    })()`);
    await command('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x,y}]});
    await command('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
    await wait('window.__mobileSearchTestTap.complete');
    assert.equal(await evaluate('window.__mobileSearchTestTap.trusted'), true, 'Touch generates a trusted click before the next action');
    assert.equal(await evaluate('window.__mobileSearchTestTap.matched'),true,'Trusted touch reaches its intended control: '+JSON.stringify(await evaluate('window.__mobileSearchTestTap')));
  };
  const touch = async selector => {
    // Wait for scrollIntoView and reflow before measuring a trusted tap target.
    await evaluate(`new Promise(resolve=>{let previous='',stable=0,frames=0;const check=()=>{const element=document.querySelector(${JSON.stringify(selector)});let rect=element?.getBoundingClientRect();if(rect&&(rect.left<0||rect.right>innerWidth||rect.top<0||rect.bottom>innerHeight)){element.scrollIntoView({block:'nearest',inline:'center'});rect=element.getBoundingClientRect()}const position=rect?JSON.stringify([rect.left,rect.top,rect.width,rect.height]):'';stable=position&&position===previous?stable+1:0;previous=position;if(stable>=3||++frames>=60)resolve();else requestAnimationFrame(check)};check()})`);
    const point = await evaluate(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect();
      if(!r)return {error:'Missing target',selector:${JSON.stringify(selector)},viewport:innerWidth};
      const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
      return {x,y,unobstructed:e.contains(hit),selector:${JSON.stringify(selector)},viewport:innerWidth,
        rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},hit:hit?.outerHTML?.slice(0,300),
        panelOpen:document.querySelector('#global-search-panel').classList.contains('is-open'),
        drawerOpen:document.querySelector('#sidebar').classList.contains('open'),accountOpen:document.querySelector('#account-menu').open};
    })()`);
    assert.ok(point.unobstructed, 'Touch target is visible and unobstructed: '+JSON.stringify(point));
    await evaluate('window.__mobileSearchTestPoint='+JSON.stringify(point));
    await touchPoint(point.x, point.y, selector);
  };
  const panelOpen = () => evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')");
  const assertOpen = async () => {
    try{await wait("document.activeElement.id === 'global-search-input'");}
    catch(error){throw new Error(error.message+'\nSearch interaction state: '+JSON.stringify(await evaluate(`({viewport:innerWidth,visualViewport:{width:visualViewport.width,scale:visualViewport.scale,offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft},focused:document.activeElement.outerHTML?.slice(0,300),panelOpen:document.querySelector('#global-search-panel').classList.contains('is-open'),expanded:document.querySelector('#mobile-search-toggle').getAttribute('aria-expanded'),lastTap:window.__mobileSearchTestTap,point:window.__mobileSearchTestPoint,transition:themeTransitionRunning,openDialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})`)));}
    assert.equal(await evaluate("document.querySelector('#mobile-search-toggle').getAttribute('aria-expanded')"), 'true');
    const size = await evaluate(`(()=>{
      const panel=document.querySelector('#global-search-panel'), input=document.querySelector('#global-search-input');
      const p=panel.getBoundingClientRect(),r=input.getBoundingClientRect(),s=getComputedStyle(input);
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
      context.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;
      return {left:p.left,right:p.right,width:r.width,viewport:innerWidth,scroll:document.documentElement.scrollWidth,
        placeholder:input.placeholder,placeholderWidth:context.measureText(input.placeholder).width,
        textSpace:input.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),height:r.height};
    })()`);
    assert.ok(size.left>=0 && size.right<=size.viewport+.5, 'Expanded search stays inside viewport');
    assert.ok(size.scroll<=size.viewport+1, 'Expanded search creates no page overflow');
    assert.ok(size.width>size.viewport*.65 && size.height>=44, 'Search input has useful width and touch height');
    assert.match(size.placeholder, /Search.*SiteTrace/i);
    assert.ok(size.placeholderWidth<=size.textSpace+1, 'The compact placeholder is fully readable');
  };
  const originalIdentity = await evaluate("document.querySelector('#account-menu .account-name').textContent");
  try {
    for (const width of [375,393,430,768]) {
      await viewport(width);
      for (const dark of [false,true]) {
        if (await evaluate("document.body.classList.contains('dark')") !== dark) await evaluate('toggleTheme()');
        await go('request');
        await evaluate("document.querySelector('#account-menu .account-name').textContent='Engineer Alexandra Maria Longname With Additional Identity';document.querySelector('#account-menu').open=false");
        const header = await evaluate(`(()=>{
          const selectors=['.mobile-menu-btn','#mobile-search-toggle','.theme-toggle','.bell-wrap','#account-menu summary'];
          const items=selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();
            return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
              visible:getComputedStyle(e).display!=='none',unobstructed:e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};});
          const name=document.querySelector('#account-menu .account-name'),style=getComputedStyle(name);
          return {items,viewport:innerWidth,scroll:document.documentElement.scrollWidth,nameTruncated:name.scrollWidth>name.clientWidth,
            nameOverflow:style.textOverflow,nameWhiteSpace:style.whiteSpace};
        })()`);
        assert.ok(header.scroll<=width+1, `${width}px header does not create horizontal scrolling`);
        assert.ok(header.nameTruncated && header.nameOverflow==='ellipsis' && header.nameWhiteSpace==='nowrap', 'Long identity remains visible and safely truncated');
        for (const item of header.items) {
          assert.ok(item.visible && item.unobstructed, `${item.selector} remains reachable at ${width}px`);
          assert.ok(item.left>=0 && item.right<=width+.5 && item.height>=44 && item.width>=44, `${item.selector} fits and has a 44px target`);
        }
        for (let i=1;i<header.items.length;i++) assert.ok(header.items[i-1].right<=header.items[i].left+.5, 'Header controls do not overlap');
        assert.equal(await evaluate("document.querySelector('#mobile-search-toggle').getAttribute('aria-label')"), 'Search');
        assert.equal(await evaluate("document.querySelector('.mobile-search-close').getAttribute('aria-label')"), 'Close search');
        assert.ok(await evaluate("!!document.querySelector('#global-search-input').getAttribute('aria-label')"));

        await touch('#mobile-search-toggle'); await assertOpen();
        await fill('#global-search-input', 'TOOL-001');
        await wait("document.querySelector('[data-key=\"masterlist:TOOL-001\"]')");
        await key('ArrowDown',40); await key('Enter',13);
        await wait("location.hash==='#masterlist?record=TOOL-001' && document.querySelector('#profileContent')?.textContent.includes('TOOL-001')");
        assert.equal(await panelOpen(), false, 'Enter opens the exact selected record and closes panel');

        assert.equal(await evaluate("document.querySelector('#global-search-input').value"), 'TOOL-001');

        await touch('#mobile-search-toggle'); await assertOpen();
        await touch('.mobile-search-close');
        await wait("document.activeElement.id==='mobile-search-toggle'");
        assert.equal(await panelOpen(), false, 'Touch close works');
        await touch('#mobile-search-toggle'); await assertOpen();
        await key('Escape',27);
        assert.equal(await panelOpen(), false, 'Escape closes the panel');
        assert.equal(await evaluate('document.activeElement.id'), 'mobile-search-toggle');

        await touch('#mobile-search-toggle'); await assertOpen();
        await touch('.mobile-menu-btn');
        await wait("!document.querySelector('#global-search-panel').classList.contains('is-open') && document.querySelector('#sidebar').classList.contains('open')");
        assert.equal(await panelOpen(), false, 'Opening navigation closes search');
        assert.ok(await evaluate("document.querySelector('#sidebar').classList.contains('open')"));
        // Header padding is a neutral outside target at every width; content may contain actions.
        await touchPoint(width-4,2);
        await wait("!document.querySelector('#sidebar').classList.contains('open')");
        assert.ok(await evaluate("[...document.querySelectorAll('.modal-overlay')].every(el=>getComputedStyle(el).display==='none')"), 'Dismissing the drawer does not activate an underlying equipment action');
        await touch('#mobile-search-toggle'); await assertOpen();
        await touch('#account-menu summary');
        await wait("document.querySelector('#account-menu').open && !document.querySelector('#global-search-panel').classList.contains('is-open')");
        assert.equal(await panelOpen(), false, 'Account menu and search do not cover one another');
        assert.ok(await evaluate("document.querySelector('#account-menu').open && !!document.querySelector('[data-account-profile]')"));
        await touch('#mobile-search-toggle'); await assertOpen();
        await wait("!document.querySelector('#account-menu').open");
        assert.equal(await evaluate("document.querySelector('#account-menu').open"), false, 'Opening search dismisses account menu');
        await touch('.bell-wrap');
        await wait("document.querySelector('#monitoring-dialog')?.open");
        assert.equal(await panelOpen(), false, 'Notifications dismisses search');
        await touch('[data-monitoring-activity]');
        await wait("document.querySelector('#screen-activity.active #overview-results')");
        assert.equal(await panelOpen(), false, 'Activity remains accessible from notifications');
      }
    }
  } finally {
    await evaluate(`document.querySelector('#account-menu .account-name').textContent=${JSON.stringify(originalIdentity)}`);
  }

  await viewport(393);
  await touch('#mobile-search-toggle'); await assertOpen();
  await fill('#global-search-input', 'TOOL-001');
  await wait("document.querySelector('[data-key=\"masterlist:TOOL-001\"]')");
  await touch('[data-key="masterlist:TOOL-001"]');
  await wait("getComputedStyle(document.querySelector('#screen-tool-profile')).display!=='none' && document.querySelector('#profileContent').textContent.includes('TOOL-001')");
  assert.equal(await panelOpen(), false, 'Admin View opens the existing equipment profile and dismisses search');

  if (login && logout) {
    await logout(); await login('sky');
    await wait("MCPAAuth.profile?.role==='engineer' && document.querySelector('.overview-actions')");
    await touch('#mobile-search-toggle'); await assertOpen();
    // Hold the first read-only inventory load to exercise typing while results are still loading.
    await evaluate(`(()=>{
      const client=EquipmentTracking.client(),original=client.rpc;
      let release; const gate=new Promise(resolve=>{release=resolve});
      window.__searchTestSnapshotStarted=false;
      window.__restoreSearchTestSnapshot=()=>{client.rpc=original;release()};
      client.rpc=function(...args){
        if(args[0]!=='mcpa_personal_equipment_snapshot')return original.apply(this,args);
        client.rpc=original;
        window.__searchTestSnapshotStarted=true;
        return gate.then(()=>original.apply(this,args));
      };
    })()`);
    try {
      await fill('#global-search-input', 'TOOL-002');
      await wait("window.__searchTestSnapshotStarted && document.querySelector('#screen-dashboard.active')");
      await fill('#global-search-input', 'TOOL-002');
      assert.equal(await evaluate('window.mcpaSearch'), '', 'Global query never writes the local equipment filter');
      await evaluate('window.__restoreSearchTestSnapshot()');
      await wait("document.querySelector('#global-search-list [data-key=\"masterlist:TOOL-002\"]')");
      assert.deepEqual(await evaluate("[...document.querySelectorAll('#global-search-list [data-key^=\"masterlist:\"]')].map(button=>button.dataset.key.slice(11))"), ['TOOL-002'], 'The latest query filters results after a pending initial inventory load');
    } finally {
      await evaluate('window.__restoreSearchTestSnapshot?.();delete window.__restoreSearchTestSnapshot;delete window.__searchTestSnapshotStarted');
    }
    // The second input deliberately arrives during the held read. Its pending
    // search debounce can rebuild the table; finish it before measuring a row.
    await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
    await evaluate("document.querySelector('#global-search-list [data-key=\"masterlist:TOOL-002\"]').scrollIntoView({block:'center',inline:'center'})");
    await touch('#global-search-list [data-key="masterlist:TOOL-002"]');
    await wait("document.querySelector('dialog[open]')?.textContent.includes('TOOL-002')");
    assert.equal(await panelOpen(), false, 'Engineer Details opens the existing read-only dialog and dismisses search');
    assert.ok(await evaluate("(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return d.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()"), 'Native detail dialog remains above the header');
    await click('dialog [data-close]');
    await wait("!document.querySelector('dialog[open]')");
    await logout(); await login('admin');
    await wait("MCPAAuth.profile?.role==='admin' && document.querySelector('.admin-review')");
  }

  for (const width of [1024,1440]) {
    await viewport(width);
    assert.ok(await evaluate("getComputedStyle(document.querySelector('#mobile-search-toggle')).display==='none' && document.querySelector('#global-search-input').getBoundingClientRect().width>250"), 'Desktop keeps the full search field');
    assert.equal(await evaluate("document.querySelector('#global-search-input').placeholder"), 'Search equipment, projects, or reference IDs\u2026');
  }
  await evaluate("document.querySelector('#global-search-input').focus()");
  await viewport(393);
  await wait("document.activeElement.id==='mobile-search-toggle'");
  assert.equal(await panelOpen(), false, 'Desktop-to-compact layout returns focus to visible control');
  await touch('#mobile-search-toggle'); await assertOpen();
  await evaluate("document.querySelector('.mobile-search-close').focus()");
  await viewport(1024);
  await wait("document.activeElement.id==='global-search-input'");
  assert.equal(await panelOpen(), false, 'Compact-to-desktop layout clears panel state');
  await viewport(1440);
  if (await evaluate("document.body.classList.contains('dark')")) await evaluate('toggleTheme()');
  console.log('PASS Mobile search touch/Enter/Escape, exact labels, readable placeholder, long identity, 44px unobstructed controls, drawer/activity/account access, existing equipment result targeting, and breakpoint focus at 375/393/430/768/1024/1440 in both themes; UI only');
};
