// Start a fresh synthetic server for this run. The acceptance preview stays untouched.
'use strict';
process.env.PORT=process.env.FIELD_UI_TEST_PORT||'4297';
const assert=require('node:assert/strict'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events'),{open}=require('./driver.cjs');
(async()=>{
 const server=spawn(process.execPath,[path.join(__dirname,'preview.cjs'),'--field-review'],{windowsHide:true,env:process.env});let b;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Field test server failed to start');})]);
  b=await open();const {navigate,go,wait,evaluate,click,fill,resize,command}=b;
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  const count=sel=>evaluate('document.querySelectorAll('+JSON.stringify(sel)+').length');
  const value=sel=>evaluate('document.querySelector('+JSON.stringify(sel)+').value');
  const checkSize=()=>evaluate('document.documentElement.scrollWidth<=innerWidth+1');
  const submits=async actor=>(await (await fetch('http://127.0.0.1:'+process.env.PORT+'/__calls')).json()).filter(c=>c.actor===actor&&c.rpc==='mcpa_wa_submit_consumables').length;
  for(const [role,theme] of [['sky','dark'],['architect','light']]){
   await resize(1440,900);await navigate('/index.html?fixture='+role+'&theme='+theme+'#outward-materials');
   assert.equal(await count('[data-catalog] tbody tr'),10);assert.equal(await count('[data-field=purpose]'),0);
   assert.equal(await evaluate('document.querySelector("[data-action=filter]").getAttribute("aria-label")'),'Search consumables');
   assert.equal(await evaluate('document.querySelector("[data-field=search]").placeholder'),'');
   assert.ok(await evaluate('(()=>{const t=document.querySelector(".wa-tabs").getBoundingClientRect(),s=document.querySelector("[data-action=review-request]").getBoundingClientRect();return s.left>=t.right&&Math.abs(t.top-s.top)<5})()'));
   await click('[data-action=review-request]');assert.match(await evaluate('document.querySelector(".wa-message").textContent'),/project\/site/);
   const project=await evaluate('document.querySelector("[data-field=site_id]").options[1].value');await fill('[data-field=site_id]',project);
   const first=await evaluate('document.querySelector("[data-quantity]").dataset.quantity');
   await fill('[data-quantity]','-1');await click('[data-action=review-request]');assert.equal(await count('dialog[open]'),0);assert.equal(await value('[data-quantity]'),'-1');
   await fill('[data-quantity]','2');await click('[data-catalog-page=next]');assert.equal(await count('[data-catalog] tbody tr'),10);
   await click('[data-catalog-page=next]');assert.equal(await count('[data-catalog] tbody tr'),3);await fill('[data-quantity]','1');
   await fill('[data-field=category]','Adhesives');assert.equal(await count('[data-catalog] tbody tr'),10);
   await fill('[data-field=search]','Masking');await evaluate('document.querySelector("[data-field=search]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
   assert.equal(await count('[data-catalog] tbody tr'),5);
   await fill('[data-field=search]','nothing matches');await click('[data-action=filter]');assert.equal(await count('[data-catalog] tbody tr'),0);
   await click('[data-action=clear-search]');await fill('[data-field=category]','');assert.equal(await value('[data-quantity="'+first+'"]'),'2');
   assert.equal(await value('[data-field=site_id]'),project);
   await click('[data-action=review-request]');assert.equal(await count('dialog[open] li'),2);
   assert.equal(await evaluate('document.activeElement.dataset.field'),'purpose');
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
   assert.equal(await evaluate('document.activeElement.textContent'),'Confirm Submit Request');
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await wait('!document.querySelector("dialog[open]") && document.activeElement.dataset.action==="review-request"');
   await click('[data-action=review-request]');await click('[data-action=cancel-request]');assert.equal(await submits(role),0);
   for(const width of [820,390]){await resize(width,844);assert.ok(await checkSize());await click('[data-action=review-request]');
    assert.ok(await evaluate('(()=>{const r=document.querySelector("dialog[open]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight})()'));await click('[data-action=cancel-request]');}
   await click('[data-action=review-request]');
   await evaluate('(()=>{const f=document.querySelector("dialog[open] [data-confirm-request]");f.requestSubmit();f.requestSubmit()})()');
   await wait('document.querySelector("[data-tab=requests]").getAttribute("aria-selected")==="true" && document.querySelector(".wa-details") && document.querySelector(".wa-engineer").getAttribute("aria-busy")==="false"');
   assert.equal(await submits(role),1);
   assert.ok(await evaluate('document.querySelector(".wa-details").textContent.includes("Pending")&&!document.querySelector(".wa-details").textContent.includes("Purpose:")'));
   const saved=await evaluate('(async()=>{const {data}=await EquipmentTracking.client().rpc("mcpa_wa_consumables_snapshot",{});return data.requests.find(r=>r.status==="pending")})()');
   assert.equal(saved.purpose,'');assert.equal(saved.site_id,project);assert.deepEqual(saved.items.map(i=>i.requested_quantity),[2,1]);
   await click('[data-tab=inventory]');assert.ok(await count('.wa-inventory-table tbody tr')>0);
   await click('[data-tab=available]');assert.equal(await value('[data-quantity]'),'');
   console.log('PASS '+role+' catalog, paging, filters, draft preservation, toolbar, accessible confirmation, empty purpose and single submission');
   await resize(1440,900);await go('masterlist');
   assert.deepEqual(await evaluate('[...document.querySelectorAll("#nav-equipment [data-target]")].map(b=>b.dataset.target)'),['masterlist']);
   assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-field-status] .lbl")].map(el=>el.textContent)'),['Total Equipment','Available','In Use','Repairs','Missing']);
   for(const key of ['all','available','inuse','repair','missing']){
    const card='[data-field-status="'+key+'"]',expected=Number(await evaluate('document.querySelector('+JSON.stringify(card+' .num')+').textContent'));
    await click(card);await wait('document.querySelector('+JSON.stringify(card)+').getAttribute("aria-pressed")==="true" && !MCPANavigation.restoring');
    assert.equal(await count('#overview-results [data-tool]'),expected);
    if(key==='repair'||key==='missing'){
     assert.equal(await count('[data-form=create]'),1);assert.equal(await count('[data-action=view]'),1);
     await click('[data-action=view]');await wait('document.querySelector("[data-detail][open]")&&!MCPANavigation.restoring');
     assert.match(await evaluate('document.querySelector("[data-detail]").textContent'),/Synthetic/);await click('[data-action=close-detail]');await wait('!document.querySelector("[data-detail][open]")&&!MCPANavigation.restoring');
    }
   }
   await go('masterlist');assert.ok(await evaluate('[...document.querySelectorAll("#overview-results [data-tool]")].every(b=>'+JSON.stringify(role==='sky'?['SYN-020','SYN-021','SYN-022']:['SYN-010','SYN-030','SYN-031','SYN-032'])+'.includes(b.dataset.tool))'));
   await fill('[data-search]','Rotary');assert.equal(await count('#overview-results [data-tool]'),1);await fill('[data-search]','');
   for(const width of [820,390]){await resize(width,844);await go('masterlist?status=repair');assert.ok(await checkSize());}
   const reportKind=role==='sky'?'repair':'missing',asset=role==='sky'?'SYN-020':'SYN-030';
   await go('masterlist?status='+reportKind);
   const reportsBefore=await count('[data-action=view]');
   await fill('[data-form=create] [name=toolId]',asset);await fill('[data-form=create] [name=notes]','Field review of '+asset);
   await click('[data-form=create] [type=submit]');
   await wait('document.querySelectorAll("[data-action=view]").length==='+ (reportsBefore+1));
   await wait('document.querySelector("#overview-results [data-tool='+asset+']")');
   const routeId=await evaluate('document.querySelector("[data-action=view]").dataset.id');
   await navigate('/index.html?fixture='+role+'#'+reportKind+'?record='+encodeURIComponent(routeId));
   await wait('document.querySelector("[data-detail][open]") && !MCPANavigation.restoring');
   assert.ok((await evaluate('location.hash')).includes('masterlist'));
   await evaluate('showScreen("retired-equipment-v2")');await wait('document.querySelector("#auth-home")');
   console.log('PASS '+role+' five inventory controls, matching counts, authorized equipment, embedded reports, deep links, retired-route denial, responsive layout');
  }
  await navigate('/index.html?fixture=admin#asset-retirement-v2?view=history');assert.equal(await count('[data-retirement-list]'),1);
  assert.deepEqual(b.errors,[]);assert.deepEqual(b.blocked,[]);assert.deepEqual(b.logs.filter(log=>log.level==='error'),[]);
  console.log('PASS Admin retirement history, browser runtime, console and loopback-only requests');
 }finally{try{if(b)await b.close();}finally{server.kill();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
