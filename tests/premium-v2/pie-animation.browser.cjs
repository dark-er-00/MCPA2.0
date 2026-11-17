'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { open } = require('./driver.cjs');
const PORT = Number(process.env.PORT || 4192), results = { checks: [], captures: [] };
const out = path.join(__dirname, '../screenshots/pie-animation'); fs.mkdirSync(out, { recursive: true });
const check = async (name, fn) => {
 try { const evidence = await fn(); results.checks.push({ name, passed: true, evidence }); console.log('PASS ' + name); }
 catch (error) { results.checks.push({ name, passed: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
};
(async () => {
 const b = await open(); let caseId = 0;
 const reset = async (theme = 'dark', actor = 'admin') => {
  await b.navigate('/index.html?fixture=' + actor + '&theme=' + theme + '&pie-case=' + (++caseId) + '#dashboard');
  await b.evaluate('document.querySelector(".v2-panel-status").scrollIntoView({block:"center"})'); await b.pause(100);
 };
 const point = key => b.evaluate(`(()=>{const svg=document.querySelector('[data-pie-chart]'),hit=svg.querySelector('[data-pie-hit="${key}"]'),angle=Number(hit.dataset.pieAngle),p=new DOMPoint(68+38*Math.cos(angle),68+38*Math.sin(angle)).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y}})()`);
 const move = async key => b.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point(key) });
 const leave = () => b.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1100, y: 100 });
 const settle = async () => { await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await b.evaluate('Promise.all(document.querySelector("[data-pie-chart]").getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))'); };
 const state = () => b.evaluate(`(()=>{const svg=document.querySelector('[data-pie-chart]');return {selected:[...svg.querySelectorAll('.is-emphasized')].map(n=>n.dataset.pieVisual),slices:[...svg.querySelectorAll('[data-pie-visual]')].map(n=>{const c=getComputedStyle(n),m=new DOMMatrixReadOnly(c.transform);return {key:n.dataset.pieVisual,x:m.e,y:m.f,distance:Math.hypot(m.e,m.f),opacity:Number(c.opacity),fill:n.getAttribute('fill'),d:n.getAttribute('d'),stroke:c.stroke}}),pressed:[...svg.querySelectorAll('[aria-pressed=true]')].map(n=>n.dataset.pieHit)}})()`);
 const shot = async name => {
  const clip = await b.evaluate('(()=>{const r=document.querySelector(".v2-panel-status").getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()');
  const png = await b.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(png.data, 'base64')); results.captures.push(name + '.png');
 };
 const key = async (value, code, virtual) => {
  await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: virtual });
  await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: virtual });
 };
 const tap = async p => {
  await b.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, radiusX: 2, radiusY: 2, id: 1 }] }); await b.pause(70);
  await b.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.pause(100);
 };
 try {
  await b.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (const theme of ['dark', 'light']) {
   await b.resize(1440, 1050); await reset(theme); await leave(); await settle();
   await check(theme + ' chart retains exact data, patterns, proportions and zero-value legend', async () => {
    const actual = await b.evaluate(`(()=>{const svg=document.querySelector('[data-pie-chart]');window.testPie=svg;return {role:svg.getAttribute('role'),label:svg.getAttribute('aria-label'),keys:[...svg.querySelectorAll('[data-pie-hit]')].map(n=>n.dataset.pieHit),counts:[...document.querySelectorAll('.v2-legend-row strong')].map(n=>Number(n.textContent)),paired:[...svg.querySelectorAll('[data-pie-visual]')].every(n=>{const hit=svg.querySelector('[data-pie-hit="'+n.dataset.pieVisual+'"]');return n.tagName===hit.tagName&&n.getAttribute('d')===hit.getAttribute('d')}),patterns:svg.querySelectorAll('pattern').length,zeros:svg.querySelectorAll('[data-pie-hit=missing]').length}})()`);
    assert.equal(actual.role, 'group'); assert.match(actual.label, /12 total units/); assert.deepEqual(actual.counts, [5, 5, 2, 0]); assert.deepEqual(actual.keys, ['available', 'deployed', 'repair']); assert.equal(actual.paired, true); assert.equal(actual.patterns, 5); assert.equal(actual.zeros, 0); return actual;
   });
   await shot('idle-' + theme + '-desktop');
   for (const status of ['available', 'deployed', 'repair']) {
    await check(theme + ' hover ' + status + ' animates outward without changing geometry, colors or layout', async () => {
     await leave(); await settle(); const idle = await state();
     const before = await b.evaluate('(()=>{const s=document.querySelector("[data-pie-chart]"),r=s.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,legend:document.querySelector(".v2-tabular-legend").innerHTML}})()');
     await move(status); await b.pause(50); const during = await state();
     assert.equal(during.selected[0], status); assert.ok(during.slices.find(s => s.key === status).distance > 0); assert.ok(during.slices.find(s => s.key === status).distance < 6.01);
     await settle(); const active = await state(), selected = active.slices.find(s => s.key === status);
     assert.ok(Math.abs(selected.distance - 6) < .005); assert.equal(selected.opacity, 1);
     assert.ok(active.slices.filter(s => s.key !== status).every(s => s.opacity === .66 && s.distance === 0));
     assert.deepEqual(active.slices.map(s => [s.key, s.d, s.fill]), idle.slices.map(s => [s.key, s.d, s.fill]));
     const after = await b.evaluate('(()=>{const s=document.querySelector("[data-pie-chart]"),r=s.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,legend:document.querySelector(".v2-tabular-legend").innerHTML}})()'); assert.deepEqual(after, before);
     assert.equal(await b.evaluate('window.testPie===document.querySelector("[data-pie-chart]")'), true);
     const clipping = await b.evaluate('(()=>{const r=document.querySelector("[data-pie-chart]").getBoundingClientRect(),p=document.querySelector(".is-emphasized").getBoundingClientRect();return {fits:p.left>=r.left-1&&p.right<=r.right+1&&p.top>=r.top-1&&p.bottom<=r.bottom+1,overflow:getComputedStyle(document.querySelector("[data-pie-chart]")).overflow}})()'); assert.equal(clipping.fits, true); assert.equal(clipping.overflow, 'visible');
     await shot('hover-' + status + '-' + theme + '-desktop'); return { during, active, clipping };
    });
   }
   await check(theme + ' rapid changes reverse smoothly and pointer exit restores every slice', async () => {
    for (const status of ['available', 'deployed', 'repair', 'deployed', 'available', 'repair']) { await move(status); await b.pause(20); const actual = await state(); assert.deepEqual(actual.selected, [status]); assert.ok(actual.slices.every(s => s.distance <= 6.01 && s.opacity >= .65 && s.opacity <= 1)); }
    await leave(); await settle(); const actual = await state(); assert.deepEqual(actual.selected, []); assert.ok(actual.slices.every(s => s.distance === 0 && s.opacity === 1)); return actual;
   });
   await check(theme + ' keyboard focus, arrow movement, Enter/Space and legend filtering remain usable', async () => {
    await b.evaluate('document.querySelector("[data-pie-hit=available]").focus()'); await settle(); assert.deepEqual((await state()).selected, ['available']);
    await key('ArrowRight', 'ArrowRight', 39); await settle(); assert.deepEqual((await state()).selected, ['deployed']);
    assert.equal(await b.evaluate('document.activeElement.dataset.pieHit'), 'deployed');
    await key('Enter', 'Enter', 13); assert.deepEqual((await state()).pressed, ['deployed']); await key(' ', 'Space', 32); assert.deepEqual((await state()).pressed, []);
    await key('Tab', 'Tab', 9); assert.equal(await b.evaluate('document.activeElement.dataset.pieHit'), 'repair'); await settle(); await shot('keyboard-' + theme + '-desktop');
    await key('Tab', 'Tab', 9); assert.equal(await b.evaluate('document.activeElement.classList.contains("v2-legend-row")'), true);
    await b.click('.v2-legend-row[data-status="repair"]'); await b.wait('document.querySelectorAll(".inventory-panel [data-tool]").length===2');
    assert.deepEqual(await b.evaluate('[...document.querySelectorAll(".inventory-panel [data-tool]")].map(n=>n.dataset.tool)'), ['SYN-007', 'SYN-012']);
    assert.deepEqual(await b.evaluate('[...document.querySelectorAll(".v2-legend-row strong")].map(n=>Number(n.textContent))'), [5, 5, 2, 0]);
   });
   await check(theme + ' reduced motion removes translation while retaining clear emphasis', async () => {
    await b.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await reset(theme); await move('available'); const actual = await state(); assert.deepEqual(actual.selected, ['available']); assert.ok(actual.slices.every(s => s.distance === 0)); assert.equal(actual.slices.find(s => s.key === 'repair').opacity, .66);
    assert.equal(await b.evaluate('document.querySelector("[data-pie-chart]").getAnimations({subtree:true}).length'), 0);
    await b.command('Emulation.setEmulatedMedia', { features: [] });
   });
  }
  await check('Mobile touch taps toggle emphasis, switching and outside dismissal without status filtering', async () => {
   await b.resize(390, 900); await b.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }); await reset('dark');
   await tap(await point('available')); await settle(); assert.deepEqual((await state()).pressed, ['available']); await shot('tap-available-dark-mobile');
   await tap(await point('available')); await settle(); assert.deepEqual((await state()).selected, []);
   await tap(await point('deployed')); await settle(); assert.deepEqual((await state()).pressed, ['deployed']);
   await tap(await point('repair')); await settle(); assert.deepEqual((await state()).pressed, ['repair']); await shot('tap-repair-dark-mobile');
   // Tap a noninteractive area outside the graph. A KPI/header button would
   // correctly navigate away and is not an outside-dismissal target.
   const outside = await b.evaluate('(()=>{const r=document.querySelector(".v2-panel-status h2").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
   await tap(outside); await settle(); assert.deepEqual((await state()).selected, []);
   assert.equal(await b.evaluate('document.querySelector(".inventory-tab[aria-pressed=true]").dataset.status'), ''); assert.equal(await b.evaluate('document.querySelectorAll(".inventory-panel [data-tool]").length'), 5);
  });
  await check('Native swipe beginning on the mobile pie scrolls normally and creates no sticky selection', async () => {
   await reset('light'); const start = await point('available'), initial = await b.evaluate('scrollY');
   await b.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2 }] });
   for (let dy = 25; dy <= 150; dy += 25) { await b.command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y - dy, id: 2 }] }); await b.pause(25); }
   await b.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.pause(250);
   const final = await b.evaluate('scrollY'); assert.ok(final > initial + 30); assert.deepEqual((await state()).pressed, []); assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), true); return { initial, final };
  });
  await check('Single-category, empty, Missing and Other charts retain exact positive-only slice generation', async () => {
   await b.resize(1440, 1050); await reset();
   const actual = await b.evaluate(`(()=>{
    const data=structuredClone(MovementStore.getState()),user=MovementStore.getContext(),render=tools=>{const host=document.createElement('div');host.innerHTML=DashboardView.render({...data,tools},user,{query:'',status:'',site:'',condition:''},()=>'',()=>'',v=>String(v||''));const svg=host.querySelector('[data-pie-chart]');return {keys:[...svg.querySelectorAll('[data-pie-hit]')].map(n=>n.dataset.pieHit),visuals:[...svg.querySelectorAll('.v2-pie-slice')].map(n=>({tag:n.tagName,d:n.getAttribute('d'),r:n.getAttribute('r')})),counts:[...host.querySelectorAll('.v2-legend-row strong')].map(n=>Number(n.textContent))}};
    const tool={...data.tools[0],qty:1};return {single:render([tool]),empty:render([]),missing:render([{...tool,status:'missing'}]),other:render([{...tool,status:'retired'}]),large:render([{...tool,qty:100}, {...data.tools[3],qty:1}])};
   })()`);
   assert.deepEqual(actual.single.keys, ['available']); assert.equal(actual.single.visuals[0].tag, 'circle'); assert.equal(actual.single.visuals[0].r, '58'); assert.deepEqual(actual.empty.keys, []); assert.deepEqual(actual.empty.counts, [0, 0, 0, 0]); assert.deepEqual(actual.missing.keys, ['missing']); assert.deepEqual(actual.other.keys, ['other']); assert.ok(actual.large.visuals.every(n => !n.d?.includes('NaN'))); return actual;
  });
  await check('Dashboard refreshes keep delegated listener counts constant and new slices interactive', async () => {
   const listeners = async () => (await b.command('Runtime.evaluate', { expression: 'Object.fromEntries(Object.entries(getEventListeners(document)).map(([key,value])=>[key,value.length]))', includeCommandLineAPI: true, returnByValue: true })).result.value;
   const before = await listeners();
   for (let i = 0; i < 6; i++) { await b.evaluate('window.testOldPie=document.querySelector("[data-pie-chart]");window.dispatchEvent(new CustomEvent("mcpa:movement-change"))'); await b.wait('window.testOldPie!==document.querySelector("[data-pie-chart]")'); }
   assert.deepEqual(await listeners(), before); await move('repair'); await settle(); assert.deepEqual((await state()).selected, ['repair']); return before;
  });
  for (const actor of ['sky', 'architect']) for (const theme of ['dark', 'light']) {
   await check(actor + ' ' + theme + ' retains main-authorized custody chart and responsive dimensions', async () => {
    await b.resize(1440, 1050); await reset(theme, actor);
    assert.deepEqual(await b.evaluate('[...document.querySelectorAll(".v2-legend-row strong")].map(n=>Number(n.textContent))'), [0, 1, 0, 0]);
    assert.equal(await b.evaluate('document.querySelectorAll("[data-pie-hit]").length'), 1); await move('deployed'); await settle(); assert.deepEqual((await state()).selected, ['deployed']);
    for (const width of [1440, 768, 390, 320]) { await b.resize(width, 900); assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), true); }
   });
  }
  results.runtimeErrors = b.errors; results.blocked = b.blocked;
  results.externalRequests = b.network.filter(u => !u.startsWith('http://127.0.0.1:' + PORT) && !/^(data|blob|about):/.test(u)); results.consoleErrors = b.logs.filter(l => l.level === 'error');
  await check('No runtime/console errors or external network attempts', async () => { assert.deepEqual(results.runtimeErrors, []); assert.deepEqual(results.consoleErrors, []); assert.deepEqual(results.blocked, []); assert.deepEqual(results.externalRequests, []); });
 } finally { await b.close(); }
 results.summary = { passed: results.checks.filter(c => c.passed).length, failed: results.checks.filter(c => !c.passed).length };
 fs.writeFileSync(path.join(__dirname, '../reports/pie-animation-results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results.summary)); if (results.summary.failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
