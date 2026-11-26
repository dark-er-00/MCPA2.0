// Run against a fresh JavaScript fixture. The manual acceptance server has its own state.
'use strict';
process.env.PORT = process.env.PROJECT_UI_TEST_PORT || '4299';
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {open} = require('./driver.cjs');
const {createFixture} = require('./engineer-assignment-preview-fixture.cjs');
const origin = 'http://127.0.0.1:' + process.env.PORT;
const labels = ['Not recorded','Planning/Designing','Permitting','Groundbreaking','Construction Phase','Turnover'];
const colors = ['rgb(185, 192, 201)','rgb(182, 169, 245)','rgb(146, 200, 247)','rgb(247, 182, 154)','rgb(243, 210, 126)','rgb(143, 217, 187)'];
const order = new Intl.Collator('en-PH', {numeric:true, sensitivity:'base'});
const ordered = rows => rows.slice().sort((a,b) => order.compare(a.name,b.name) || a.id.localeCompare(b.id));
const ids = rows => rows.map(row => row.id);
const stageIndex = value => Math.max(0,labels.findIndex(label => label.toLowerCase() === String(value ?? '').toLowerCase().trim().replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ')));
const fixture = createFixture({projectReview:true});
const records = ordered(Object.values(fixture.sites).filter(s => s.id !== fixture.sites.office.id));
const active = records.filter(s => s.is_active && !s.archived_at);
const next = '[data-action=next-projects]', previous = '[data-action=previous-projects]';
const card = '.site-card';

async function run(b) {
  const {navigate, click, wait, fill, evaluate, command, resize} = b;
  const nameOf = selector => evaluate('document.querySelector('+JSON.stringify(selector)+')?.textContent.trim()');
  const count = selector => evaluate('document.querySelectorAll('+JSON.stringify(selector)+').length');
  const ready = () => wait('document.querySelector("#screen-sites.active") && document.querySelector("#sites-list")?.getAttribute("aria-busy")==="false" && !MCPANavigation.restoring');
  let visitId = 0;
  const visit = async (actor='admin',theme='dark',query='') => {
    visitId += 1;
    await navigate('/index.html?fixture='+actor+'&theme='+theme+'&visit='+visitId+query+'#sites');
    await ready();
  };
  const cards = () => evaluate(`[...document.querySelectorAll('.site-card')].map(el => ({
    id:el.dataset.id, name:el.querySelector('.site-card-title').textContent, location:el.querySelector('.project-location').textContent,
    assignee:el.querySelector('.eng').textContent, stage:el.querySelector('.project-stage').textContent.trim(),
    color:getComputedStyle(el.querySelector('.project-stage-dot')).backgroundColor, img:el.querySelector('img')?.getAttribute('src') || null,
    textOnly:el.matches('.text-only') && !el.querySelector('.project-media') && !el.textContent.includes('No project photo'),
    button:el.tagName==='BUTTON' && !el.querySelector('button,a,input,select'), label:el.getAttribute('aria-label')
  }))`);
  const snapshot = async table => (await (await fetch(origin+'/__fixture-api',{method:'POST',headers:{authorization:'admin'},body:JSON.stringify({table})})).json()).data;
  const apiCalls = async () => (await (await fetch(origin+'/__calls')).json());
  const readWrites = async () => (await apiCalls()).filter(c => c.write || /save|archive|delete|create|submit|_action$|_add_/i.test(c.rpc || ''));
  const seenStages = new Set();
  function checkCards(actual, expected) {
    assert.deepEqual(ids(actual), ids(expected));
    for (const [index,record] of expected.entries()) {
      const view = actual[index], stage = stageIndex(record.project_stage);
      seenStages.add(stage);
      assert.equal(view.name,record.name);
      assert.equal(view.location,record.location || 'Location not recorded');
      assert.equal(view.stage,labels[stage]);
      assert.equal(view.color,colors[stage]);
      assert.ok(view.button && view.label.includes(record.name));
      const person = Object.values(fixture.actors).find(p => p.id===record.assigned_engineer_id);
      if (person) {
        assert.ok(view.assignee.includes(person.name));
        assert.ok(view.assignee.includes(person.role==='architect'?'Architect':'Engr'));
      } else assert.equal(view.assignee,'Not assigned');
      if (record.project_photo_url && /^\/?assets\/images\//.test(record.project_photo_url)) {
        assert.equal(new URL(view.img,origin).pathname, new URL(record.project_photo_url,origin).pathname);
        assert.equal(view.textOnly,false);
      } else { assert.equal(view.img,null); assert.equal(view.textOnly,true); }
    }
  }
  async function keyboard(key,code,keyCode) {
    for (const type of ['keyDown','keyUp']) {
      const text = type === 'keyDown' ? ({Enter:'\r',Space:' '})[code] : undefined;
      await command('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:keyCode,text});
    }
  }
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  const unchangedSites = await snapshot('sites'), unchangedTools = await snapshot('equipment'), unchangedHistory = await snapshot('project_history');
  assert.ok(active.length>9 && active.length<19 && records.length>active.length);
  await visit();
  assert.equal(await count('[data-action=add-site]'),1);
  const first = await cards();
  checkCards(first,active.slice(0,9));
  await wait('[...document.querySelectorAll(".site-card img")].some(img=>img.naturalWidth>0)');
  assert.match(await nameOf('#projects-count'),new RegExp('^'+active.length+' of '+records.length+' projects.*Page 1 of 2'));
  await click(next);
  checkCards(await cards(),active.slice(9));
  assert.equal(await evaluate('document.querySelector("[data-action=next-projects]").disabled'),true);
  await click(previous);
  assert.deepEqual(ids(await cards()),ids(first));
  await click(next);
  await fill('#projects-search','East Annex');
  assert.deepEqual((await cards()).map(v=>v.name),['East Annex']);
  assert.match(await nameOf('#projects-count'),/Page 1 of 1/);
  for (const term of ['Engr Sky','Marilao']) {
    await fill('#projects-search',term);
    checkCards(await cards(),active.filter(s=>[s.assigned_engineer,s.location].some(v=>v?.includes(term))));
  }
  await fill('#projects-search','');
  await click(next);
  await fill('#projects-scope','mine');
  assert.equal(await count(card),0);
  await fill('#projects-scope','all');
  assert.deepEqual(ids(await cards()),ids(first));
  await click(next);
  await click('#projects-archived');
  checkCards(await cards(),records.slice(0,9));
  await click(next);
  checkCards(await cards(),records.slice(9));
  assert.equal(seenStages.size,6);
  for (const key of [null,'unknown']) assert.ok(records.some(row => key===null?row.project_stage===null:row.project_stage && stageIndex(row.project_stage)===0),'missing fallback fixture '+key);
  const archived = records.find(s=>s.archived_at);
  await fill('#projects-search',archived.name);
  await click(card);
  await wait('document.querySelector("#screen-site-detail.active .badge-disposed")');
  assert.equal(await nameOf('#site-heading'),archived.name);
  assert.equal(await nameOf('#site-detail-content .project-stage'),labels[stageIndex(archived.project_stage)]);
  await click('[data-action=project-history]');
  await wait('document.querySelector("#project-history-events li")');
  assert.match(await nameOf('#project-history-events'),/Synthetic project record/);
  console.log('PASS all six stages and exact pastel colors, independent archive status, assigned profile, record-specific photo, absent photo, two full filter cycles and authorized history');

  await visit();
  await click(next);
  const selected = (await cards())[0];
  for (const [key,code,keyCode] of [['Enter','Enter',13],[' ','Space',32]]) {
    // Use Tab to reach the native button and test the keyboard-only focus outline.
    await evaluate('document.querySelector("#projects-archived").focus()');
    await keyboard('Tab','Tab',9);
    assert.ok(await evaluate('document.activeElement.matches(".site-card:focus-visible") && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2'));
    await keyboard(key,code,keyCode);
    await wait('document.querySelector("#screen-site-detail.active") && !MCPANavigation.restoring');
    assert.equal(await nameOf('#site-heading'),selected.name);
    assert.ok((await evaluate('location.hash')).includes('record='+selected.id));
    assert.match(await nameOf('#site-detail-content'),/Equipment at Project/);
    await evaluate('history.back()');
    await ready();
    assert.deepEqual(ids(await cards()),ids(active.slice(9)));
  }
  assert.deepEqual(await snapshot('sites'),unchangedSites);
  assert.deepEqual(await snapshot('equipment'),unchangedTools);
  assert.deepEqual(await snapshot('project_history'),unchangedHistory);
  assert.deepEqual(await readWrites(),[]);
  console.log('PASS click, Space and Enter, focus ring, existing detail identifier, browser Back page restoration, custody/assignments/history unchanged on read');

  const layout = () => evaluate(`(()=>{
    const el=document.querySelector('.site-card'), box=s=>el.querySelector(s)?.getBoundingClientRect(), media=box('.project-media'), info=box('.project-card-info'), title=box('.site-card-title'), location=box('.project-location'), person=box('.eng'), stage=box('.project-stage');
    return {textOnly:!media && info.width>el.clientWidth*.85,horizontal:media && media.right<=info.left, stacked:media && media.bottom<=info.top, ratio:media?.width/el.getBoundingClientRect().width,
      badge:Math.abs(info.right-stage.right)<2 && stage.bottom<=title.top, order:title.bottom<=location.top && location.bottom<=person.top,
      overflow:document.documentElement.scrollWidth>innerWidth+1 || info.right>el.getBoundingClientRect().right+1,
      transition:getComputedStyle(el).transitionDuration, mediaShape:media && getComputedStyle(el.querySelector('.project-photo')).objectFit};
  })()`);
  await visit();
  const bytes = await cards();
  const photo = bytes.find(c=>c.img);
  assert.ok(photo);
  const photoSelector = '[data-id="'+photo.id+'"]';
  await evaluate('document.querySelector('+JSON.stringify(photoSelector+' img')+').dispatchEvent(new Event("error"))');
  assert.equal(await count(photoSelector+' img'),0);
  assert.equal(await count(photoSelector+'.text-only'),1);
  assert.equal(await count(photoSelector+' .project-media'),0);
  const long = active.reduce((longest,row)=>row.name.length>longest.name.length?row:longest);
  for (const theme of ['light','dark']) {
    await visit('admin',theme);
    checkCards(await cards(),active.slice(0,9));
    for (const [width,height] of [[1280,720],[1366,768],[1440,900],[1920,1080]]) {
      await resize(width,height);
      const grid = await evaluate(`(() => {
        const cards = [...document.querySelectorAll('#sites-list .site-card')];
        const boxes = cards.map(card => card.getBoundingClientRect());
        const inside = (child,parent) => child.left >= parent.left-1 && child.right <= parent.right+1
          && child.top >= parent.top-1 && child.bottom <= parent.bottom+1;
        return {
          columns:new Set(boxes.map(r => Math.round(r.left))).size,
          rows:new Set(boxes.map(r => Math.round(r.top))).size,
          visible:boxes.filter(r => inside(r,{left:0,top:0,right:innerWidth,bottom:innerHeight})).length,
          equal:boxes.every(r => Math.abs(r.height-boxes[0].height)<1 && Math.abs(r.width-boxes[0].width)<1),
          aligned:['.project-stage'].every(selector => {
            const reference = cards[0].querySelector(selector).getBoundingClientRect();
            return cards.every((card,i) => {
              const r = card.querySelector(selector).getBoundingClientRect();
              return Math.abs(r.top-boxes[i].top-reference.top+boxes[0].top)<1 && Math.abs(r.height-reference.height)<1;
            });
          }),
          intact:cards.every((card,i) => {
            const parts = [...card.querySelectorAll('.project-media,.project-stage,.site-card-title,.project-location,.eng')];
            const media=card.querySelector('.project-media')?.getBoundingClientRect();
            const [badge,title,location,person] = parts.filter(el=>!el.matches('.project-media')).map(el => el.getBoundingClientRect());
            return parts.every(el => inside(el.getBoundingClientRect(),boxes[i]) &&
              (el.scrollWidth <= el.clientWidth+1 || getComputedStyle(el).textOverflow === 'ellipsis'))
              && (media ? media.right <= title.left : card.matches('.text-only')) && badge.bottom <= title.top+1 && title.bottom <= location.top+1 && location.bottom <= person.top+1;
          })
        };
      })()`);
      assert.deepEqual(grid,{columns:3,rows:3,visible:9,equal:true,aligned:true,intact:true},JSON.stringify({theme,width,height,grid}));
    }
    await click(next);
    checkCards(await cards(),active.slice(9));
    await fill('#projects-search',long.name);
    for (const width of [1440,820,390,320]) {
      await resize(width,900);
      const g = await layout();
      assert.ok(g.badge && g.order && !g.overflow,JSON.stringify({width,g}));
      assert.ok(g.textOnly,JSON.stringify({width,g}));
      assert.ok(g.transition.split(', ').every(d=>parseFloat(d)>=.18 && parseFloat(d)<=.25));
    }
    assert.equal(await nameOf('.site-card-title'),long.name);
  }
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.match((await layout()).transition,/^0s$/);
  await command('Emulation.setEmulatedMedia',{features:[]});
  console.log('PASS narrow/desktop geometry, visible wrapping, stage placement, theme palette, transitions and reduced motion, failed-image fallback');

  await resize(1440,900);
  for (const key of ['sky','architect','unassigned']) {
    await visit(key);
    const person = fixture.actors[key];
    const allowed = active.filter(row=>row.assigned_engineer_id===person.id);
    checkCards(await cards(),allowed);
    assert.equal(await count('[data-action=add-site]'),0);
    assert.equal(await evaluate('document.querySelector("#projects-scope").closest("label").hidden'),true);
    await click('#projects-archived');
    checkCards(await cards(),allowed);
    if (allowed.length) {
      await click(card);
      await wait('document.querySelector("#screen-site-detail.active") && !MCPANavigation.restoring');
      assert.equal(await nameOf('#site-heading'),allowed[0].name);
      assert.equal(await count('[data-action=edit-site], [data-action=archive-site]'),0);
      await click('[data-action=project-history]');
      await wait('document.querySelector("#project-history-events li")');
      assert.match(await nameOf('#project-history-events'),/Synthetic project record/);
    }
    await navigate('/index.html?fixture='+key+'#site-detail?record='+archived.id);
    assert.equal(await nameOf('#site-heading'),'No project selected');
  }
  console.log('PASS Engineer, Architect and unassigned Engineer scope, shared presentation, authorized history and direct-link archive restrictions');

  await navigate('/__fixture',false);
  const links = await evaluate('[...document.querySelectorAll("main a")].map(a => a.getAttribute("href"))');
  assert.equal(links.length,9);
  for (const link of links) {
    const params = new URL(link,origin).searchParams;
    await navigate(link);
    await ready();
    const expected = params.has('project') ? active.filter(s=>s.name===params.get('project'))
      : params.has('page') ? active.slice(9)
      : params.get('fixture')==='admin' ? active.slice(0,9)
      : active.filter(s=>s.assigned_engineer_id===fixture.actors[params.get('fixture')].id);
    checkCards(await cards(),expected);
    if (expected.length===1 && expected[0].project_photo_url) {
      await wait('document.querySelector(".project-photo")?.naturalWidth>0');
      assert.equal((await layout()).mediaShape,'cover');
    }
  }
  console.log('PASS all nine public acceptance index links and both individually bound sample photographs');

  await visit();
  await click('[data-action=add-site]');
  const newName = 'Acceptance Assignment';
  await fill('#site-name',newName); await fill('#site-location','Synthetic test location');
  await fill('#site-profession','engineer'); await fill('#site-engineer',fixture.actors.sky.id);
  await click('#project-details summary'); await fill('#site-stage','Groundbreaking');
  await click('#sites-form [type=submit]');
  await wait('!document.querySelector("#sites-dialog[open]")');
  await fill('#projects-search',newName);
  assert.match((await cards())[0].assignee,/Engr Sky/);
  await click(card);
  await wait('document.querySelector("#screen-site-detail.active") && !MCPANavigation.restoring');
  await click('[data-action=edit-site]');
  await fill('#site-profession','architect'); await fill('#site-engineer',fixture.actors.architect.id);
  await click('#project-details summary'); await fill('#site-stage','Turnover');
  await click('#project-note summary'); await fill('#site-reason','Acceptance reassignment');
  await click('#sites-form [type=submit]');
  await wait('!document.querySelector("#sites-dialog[open]")');
  assert.match(await nameOf('#site-detail-content'),/Synthetic Architect/);
  assert.equal(await nameOf('#site-detail-content .project-stage'),'Turnover');
  await click('[data-action=project-history]');
  await wait('document.querySelector("#project-history-events")?.textContent.includes("Acceptance reassignment")');
  for (const role of ['sky','architect']) {
    await visit(role);
    assert.equal((await cards()).some(c=>c.name===newName),role==='architect');
  }
  assert.equal((await readWrites()).filter(c=>c.rpc==='mcpa_save_project').length,2);
  assert.deepEqual(await snapshot('equipment'),unchangedTools);
  assert.deepEqual((await snapshot('sites')).filter(s=>s.name!==newName),unchangedSites);
  const historicalIds = new Set(unchangedHistory.map(h=>h.id));
  assert.deepEqual((await snapshot('project_history')).filter(h=>historicalIds.has(h.id)),unchangedHistory);
  const legacy = active.find(s=>s.name==='West Extension');
  await visit('admin','dark','&project='+encodeURIComponent(legacy.name));
  await click(card);
  await wait('document.querySelector("#screen-site-detail.active") && !MCPANavigation.restoring');
  await click('[data-action=edit-site]');
  assert.equal(await evaluate('document.querySelector("#site-stage").value'),'keep-recorded');
  await fill('#site-location','New synthetic location');
  await click('#sites-form [type=submit]');
  await wait('!document.querySelector("#sites-dialog[open]")');
  const updated = (await snapshot('sites')).find(s=>s.id===legacy.id);
  assert.equal(updated.location,'New synthetic location');
  assert.equal(updated.project_stage,legacy.project_stage);
  assert.equal(await nameOf('#site-detail-content .project-stage'),'Not recorded');
  await photoWorkflow(b,fixture.actors.sky.id);
  assert.deepEqual(b.errors,[]); assert.deepEqual(b.blocked,[]);
  assert.deepEqual(b.logs.filter(log=>log.level==='error'),[]);
  console.log('PASS Admin creation, edit, reassignment, preserved legacy stage on unrelated edit, fixture history and custody, browser console and loopback-only requests');
}

async function photoWorkflow(b,engineerId) {
  const {click,fill,evaluate,wait,navigate} = b;
  const select = async expression => {
    await evaluate(`(async()=>{
      const picker=document.querySelector('#site-photo'),transfer=new DataTransfer();
      transfer.items.add(${expression});picker.files=transfer.files;
      picker.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
  };
  const file = name => `new File([await (await fetch('/assets/images/login-slideshow/${name}')).blob()],'${name}',{type:'image/${name.endsWith('png')?'png':'webp'}'})`;
  const choose = async name => {
    await select(file(name));
    await wait('document.querySelector("#site-photo-status").textContent.startsWith("Selected ") && document.querySelector(".site-photo-preview").naturalWidth>0');
  };
  const save = async () => {
    await click('#sites-form [type=submit]');await wait('!document.querySelector("#sites-dialog[open]")');
  };
  const close = async () => {await click('#sites-form [data-action=close-dialog]');await wait('!document.querySelector("#sites-dialog[open]")');};
  const list = name => navigate('/index.html?fixture=admin&project='+encodeURIComponent(name)+'#sites');
  const edit = async name => {
    await list(name);await click('.site-card');await wait('document.querySelector("#screen-site-detail.active") && !MCPANavigation.restoring');
    await click('[data-action=edit-site]');
  };
  const pathOfPhoto = async name => {
    await list(name);await wait('document.querySelector(".site-card img")?.naturalWidth>0');
    return evaluate('new URL(document.querySelector(".site-card img").src).pathname');
  };
  await list('Garden Workshop');
  await click('[data-action=add-site]');
  await select("new File(['bad'],'a.gif',{type:'image/gif'})");
  await wait('document.querySelector("#site-photo-status").textContent.includes("JPEG")');
  await select("new File([new Uint8Array(5242881)],'big.png',{type:'image/png'})");
  await wait('document.querySelector("#site-photo-status").textContent.includes("5 MB")');
  await select("new File(['not an image'],'wrong.png',{type:'image/png'})");
  await wait('document.querySelector("#site-photo-status").textContent.includes("not a valid")');
  await choose('project-1.webp');
  await click('[data-clear-selection]');
  assert.equal(await evaluate('document.querySelector("#site-photo").files.length'),0);
  await close();
  await click('#screen-sites [data-action=add-site]');
  const newName='Photo acceptance project';
  await fill('#site-name',newName);await fill('#site-location','Fixture site');
  await fill('#site-profession','engineer');await fill('#site-engineer',engineerId);
  await choose('project-1.webp');
  await evaluate('window.savedPhotoStore=window.MCPAProjectPhotoStore;delete window.MCPAProjectPhotoStore');
  await click('#sites-form [type=submit]');
  await wait('document.querySelector("#sites-form-error").textContent.includes("storage is unavailable")');
  await evaluate('window.MCPAProjectPhotoStore=window.savedPhotoStore');
  await save();await pathOfPhoto(newName);
  await edit('Garden Workshop');await choose('project-1.png');await save();
  const first = await pathOfPhoto('Garden Workshop');
  await edit('Garden Workshop');await choose('project-2.webp');await close();
  assert.equal(await pathOfPhoto('Garden Workshop'),first);
  await edit('Garden Workshop');await fill('#site-location','Synthetic updated location');await save();
  assert.equal(await pathOfPhoto('Garden Workshop'),first);
  await edit('Garden Workshop');await choose('project-2.webp');await save();
  const replaced = await pathOfPhoto('Garden Workshop');
  assert.notEqual(replaced,first);
  assert.equal((await fetch(origin+replaced)).status,403);
  assert.equal(await evaluate('document.querySelector(".site-card .project-stage").textContent.trim()'),'Permitting');
  await navigate('/index.html?fixture=pau&project=Garden%20Workshop#sites');
  await wait('document.querySelector(".site-card img")?.naturalWidth>0');
  await navigate('/index.html?fixture=sky&project=Garden%20Workshop#sites');
  assert.equal(await evaluate('document.querySelectorAll(".site-card").length'),0);
  const request = async (key,bytes,type) => {
    const body = new FormData();
    body.set('photo',new Blob([bytes],{type}),'sample.png');
    body.set('project',JSON.stringify({p_operation_id:require('node:crypto').randomUUID(),p_patch:{}}));
    return fetch(origin+'/__project-photo-save',{method:'POST',headers:{Authorization:key},body});
  };
  assert.equal((await request('admin',Buffer.from('invalid'),'image/png')).status,400);
  for (const key of ['sky','architect']) assert.equal((await request(key,Buffer.from('test'),'image/png')).status,403);
  console.log('PASS create with photo, unavailable storage, add later, replace, clear, cancel, invalid files, role guard, refresh and metadata-only preservation');
}

(async () => {
  const server = spawn(process.execPath,[path.join(__dirname,'preview.cjs'),'--projects-review'],{windowsHide:true});
  let browser;
  try {
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Projects test server failed to start');})]);
    browser = await open();
    await run(browser);
  } finally {
    try { if (browser) await browser.close(); } finally { server.kill(); }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
