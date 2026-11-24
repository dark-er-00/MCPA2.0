// A fresh, loopback-only Premium V2 server and synthetic state for each run.
'use strict';
process.env.PORT=process.env.ADMIN_UI_TEST_PORT||'4296';
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const {once}=require('node:events');
const {open}=require('./driver.cjs');
const port=process.env.PORT;
(async()=>{
 const server=spawn(process.execPath,[path.join(__dirname,'preview.cjs'),'--admin-review'],{env:process.env,windowsHide:true});
 let browser;
 try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Synthetic preview failed to start');})]);
  browser=await open({width:1440,height:900});
  await browser.command('Emulation.setFocusEmulationEnabled',{enabled:true});
  const {go,click,fill,wait,evaluate,navigate,resize}=browser;
  const visible=selector=>wait('document.querySelector('+JSON.stringify(selector)+') && !MCPANavigation.restoring');
  const count=selector=>evaluate('document.querySelectorAll('+JSON.stringify(selector)+').length');
  const text=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').innerText');
  const overview=()=>go('outward-materials');
  const next=async(selector,ready)=>{await click(selector);await visible(ready);};
  await navigate('/index.html?fixture=admin&theme=dark#outward-materials');
  assert.equal(await count('.wa-admin table'),0);assert.equal(await count('.wa-more'),7);
  assert.doesNotMatch(await text('.wa-admin'),/organic search|safari|issued by engineer/i);
  for(const name of ['request-trend','projects','stock','usage','ranking','sites','daily']){
    await next('[data-view="'+name+'"]','.wa-admin table');
    assert.equal(await count('.wa-admin table'),1);assert.ok((await evaluate('location.hash')).includes('view='+name));
    await next('[data-view=""]','.wa-lead-grid');assert.equal(await count('.wa-admin table'),0);
  }
  console.log('PASS chart-first overview and seven independent, reversible disclosures');
  await fill('[data-period]','today');await wait('document.querySelector("[data-period]")?.value==="today" && !MCPANavigation.restoring');
  assert.equal(await count('[data-chart-tip]'),24);
  await evaluate('document.querySelector("[data-chart-tip]").focus()');assert.match(await text('.wa-plot-readout'),/00:00/);
  await fill('[data-period]','year');await wait('document.querySelectorAll("[data-chart-tip]").length===12');
  await evaluate('document.querySelector("[name=site_id]").selectedIndex=1;document.querySelector("[name=requester_id]").selectedIndex=1;document.querySelector("[data-filters]").requestSubmit()');
  await wait('location.hash.includes("site_id=") && !MCPANavigation.restoring');
  const params=await evaluate('Object.fromEntries(new URLSearchParams(location.hash.split("?")[1]))');
  await next('[data-view=ranking]','[data-drill]');await next('[data-drill]','.wa-admin table');
  const item=await text('.wa-admin tbody tr td:nth-child(3)');assert.ok(item);
  await next('[data-view=ranking]','[data-drill]');await next('[data-view=""]','[data-period]');
  assert.equal(await evaluate('document.querySelector("[name=site_id]").value'),params.site_id);
  assert.equal(await evaluate('document.querySelector("[name=requester_id]").value'),params.requester_id);
  assert.equal(await evaluate('document.querySelector("[data-period]").value'),'year');
  await evaluate('history.back()');await visible('[data-drill]');
  console.log('PASS Manila periods, keyboard chart labels, combined filters, report drill-down and browser history');
  await overview();
  await next('[data-view=history]','.wa-admin tbody');assert.equal(await count('.wa-admin tbody tr'),25);
  await click('[data-page="1"]');assert.equal(await count('.wa-admin tbody tr'),5);
  await next('[data-open]','[data-review]');assert.match(await text('.wa-details'),/Issuance transactions/);
  await go('outward-materials?view=requests');await next('[data-open]','[data-decision=approve]');
  await click('[data-decision=approve]');await visible('[data-decision=issue]:not(:disabled)');
  await fill('[data-kind=issue]','1');await click('[data-decision=issue]');await wait('document.querySelector(".wa-message")?.textContent.includes("Issuance recorded")');
  await overview();
  const download=async(kind)=>evaluate(`(async()=>{let blob;const make=URL.createObjectURL,activate=HTMLAnchorElement.prototype.click;try{URL.createObjectURL=b=>{blob=b;return make.call(URL,b)};HTMLAnchorElement.prototype.click=function(){};document.querySelector('[data-export="${kind}"]').click();return await blob.text()}finally{URL.createObjectURL=make;HTMLAnchorElement.prototype.click=activate}})()`);
  const csv=await download('transactions');assert.equal(csv.split('\r\n').length,32);assert.match(csv,/Stock movement ID/);
  assert.match(await download('summary'),/Approved for requests in period/);
  await fill('[name=from]','2099-01-01');await evaluate('document.querySelector("[data-filters]").requestSubmit()');await wait('location.hash.includes("2099") && !MCPANavigation.restoring');
  assert.equal(await count('[data-chart-tip]'),0);assert.match(await text('.wa-stock'),/MIG welding wire/);
  await click('[data-export=transactions]');assert.match(await text('.wa-message'),/No matching rows/);
  console.log('PASS approval, actual issuance, paginated ledger, CSV rows and empty report handling');
  await go('return?record=SYN-RETURN-01');await visible('dialog[open] [data-photo]');
  assert.equal(await count('[data-inspection] input[type=file]'),0);
  await click('dialog [data-photo]');await wait('document.querySelector(".b-photo-view img")?.naturalWidth>0');
  await click('.b-photo-view button');await fill('[name=outcome]','good');await click('[name=received]');await fill('[name=notes]','Synthetic inspection verified');
  await click('[data-inspection] button[type=submit]');await wait('document.querySelector(".b-feedback")?.textContent.includes("inspection saved")');
  assert.match(await text('[data-inspect-batch]'),/Synthetic inspection verified/);assert.equal(await count('dialog [data-photo]'),1);
  const calls=await (await fetch('http://127.0.0.1:'+port+'/__calls')).json();
  assert.ok(calls.some(c=>c.rpc==='mcpa_b_action'));assert.ok(!calls.some(c=>c.rpc==='mcpa_b_evidence_action'));
  console.log('PASS original evidence thumbnail and enlarged view, read-only inspection, decisions and notes');
  for(const theme of ['light','dark']){
   await navigate('/index.html?fixture=admin&theme='+theme+'#outward-materials');
   for(const width of [1440,820,390]){
    await resize(width,900);await overview();
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    for(const mode of ['all','available','inuse','repair','missing']){
      await go('masterlist?status='+mode);
      const gap=await evaluate('(()=>{const k=document.querySelector(".equipment-summary");const below=document.querySelector("[data-equipment-issues]:not([hidden])")||document.querySelector("[data-equipment-inventory]");return below.getBoundingClientRect().top-k.getBoundingClientRect().bottom})()');
      assert.ok(gap>=15&&gap<=32,JSON.stringify({width,theme,mode,gap}));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    }
   }
  }
  for(const role of ['sky','architect']){
   await navigate('/index.html?fixture='+role+'#outward-materials');
   assert.equal(await count('.wa-admin'),0);await visible('.wa-engineer');
   await go('return');assert.equal(await count('[data-inspection]'),0);
   if(role==='architect'){
     await fill('[data-reference]','SYN-010');await next('[data-add]','input[type=file]');
     await click('[data-composer] button[type=submit]');await wait('document.querySelector(".b-feedback")?.textContent.includes("submitted")');
   }
  }
  await navigate('/index.html?fixture=admin#return');
  await next('[data-view-return]:not([data-view-return="SYN-RETURN-01"])','dialog[open]');
  assert.match(await text('.b-original-proof'),/No photo was submitted/);assert.equal(await count('dialog [data-photo]'),0);
  await overview();
  const states=await evaluate(`(async()=>{
    const root=document.createElement('section');document.body.append(root);
    let resolve;const deferred=new Promise(done=>resolve=done);
    const mounted=MCPAConsumablesUsageV2.mount({root,client:{rpc:()=>deferred}});
    const loading=root.querySelector('.wa-skeleton')!==null;
    resolve({error:{message:'Synthetic read error'}});const instance=await mounted;
    const failure=root.textContent.includes('Synthetic read error')&&!!root.querySelector('[data-action=refresh]');instance.destroy();
    const denied=await MCPAConsumablesUsageV2.mount({root,client:{rpc:async()=>({data:{profile:{role:'engineer'}}})}});
    const forbidden=!root.querySelector('.wa-lead-grid')&&!!root.querySelector('.wa-message.error');denied.destroy();root.remove();
    return [loading,failure,forbidden];
  })()`);
  assert.deepEqual(states,[true,true,true]);
  console.log('PASS synthetic Architect return submission, original-photo empty state, loading, read failure and Admin guard');
  assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.blocked,[]);
  assert.deepEqual(browser.logs.filter(log=>log.level==='error'),[]);
  console.log('PASS five equipment filters at three widths in both themes, field roles, browser console and network isolation');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
