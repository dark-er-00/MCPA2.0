// Full Admin routes, synthetic identities and production retirement RPCs in disposable PGlite.
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
process.env.PORT=process.env.RETIREMENT_TEST_PORT||'4298';
const {open}=require('../premium-v2/driver.cjs');
(async()=>{
  const server=spawn(process.execPath,[path.join(__dirname,'../auth.browser.cjs'),'--retirement-preview'],{windowsHide:true,env:process.env});
  let browser;
  try {
    const [ready]=await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Retirement fixture startup failed');})]);
    const record=new URL(String(ready).trim().split(' ').at(-1)).hash.split('record=')[1];
    browser=await open();
    const {navigate,evaluate,click,wait,fill,resize}=browser;
    const page=(actor='admin',view='',theme='dark')=>navigate('/index.html?fixture='+actor+'&theme='+theme+'#asset-retirement-v2'+view);
    const form='[data-proposal]',submit=form+' [type=submit]',history='[data-retirement-tab=history]',proposal='[data-retirement-tab=proposal]';
    const card='[data-retirement-record]',dialog='[data-retirement-dialog][open]';
    const rows=()=>evaluate('document.querySelectorAll("[data-retirement-record]").length');
    const disabled=()=>evaluate('document.querySelector("[data-proposal] [type=submit]").disabled');
    await page();await wait('document.querySelector("[data-proposal]")');assert.ok(await disabled());
    assert.deepEqual(await evaluate('[...document.querySelector("[name=disposition]").options].map(o=>o.value)'),['sold','disposed']);
    await click(history);await wait('!MCPANavigation.restoring && location.hash.includes("view=history")');
    assert.equal(await rows(),2);
    await fill('[data-search]','wElDiNg');assert.equal(await rows(),1);
    const asset=await evaluate('document.querySelector("[data-retirement-record] .b-id").textContent.split(" · ")[0]');
    await fill('[data-search]',asset.toLowerCase());await fill('[data-retirement-date]','2026-11-22');assert.equal(await rows(),0);
    await fill('[data-retirement-date]','2026-10-26');assert.equal(await rows(),1);
    await click('[data-clear-retirement]');assert.equal(await rows(),2);
    await click('[data-view-retirement="'+record+'"]');await wait('document.querySelector("'+dialog+'") && !MCPANavigation.restoring');
    assert.equal(await evaluate('!!document.querySelector("[value=approveRetirement],[value=rejectRetirement]")'),false);
    await click('[data-close-retirement]');await wait('!document.querySelector("'+dialog+'")&&!MCPANavigation.restoring && document.activeElement.dataset.viewRetirement==='+JSON.stringify(record));
    assert.equal(await evaluate('document.activeElement.dataset.viewRetirement'),record);
    await click(proposal);await wait('!MCPANavigation.restoring');await evaluate('history.back()');
    await wait('document.querySelector("[data-retirement-tab=history]")?.getAttribute("aria-pressed")==="true"&&!MCPANavigation.restoring');
    await click(proposal);await wait('!MCPANavigation.restoring');
    const ids=await evaluate('[...document.querySelectorAll("[name=assetId]")].map(e=>e.value)');
    assert.ok(ids.includes('TOOL-001'));assert.ok(!ids.includes('TOOL-002')&&!ids.includes(asset));
    await click('[data-equipment-picker] summary');await click('[name=assetId][value="TOOL-001"]');
    await fill('[name=effectiveDate]','2099-01-01');await fill('[name=reason]','Worksite review');assert.ok(await disabled());
    await fill('[name=effectiveDate]','2026-11-01');await fill('[name=reason]','  ');assert.ok(await disabled());
    await fill('[name=reason]','Worksite review');assert.equal(await disabled(),false);
    await evaluate(`(()=>{const client=EquipmentTracking.client(),rpc=client.rpc.bind(client);let fail=true;window.submitted=0;
      client.rpc=(name,args)=>{if(name==='mcpa_b_action'&&args.p_action==='proposeRetirement'){
        if(fail){fail=false;return Promise.resolve({error:{code:'40001',message:'Review stock and retry.'}});}window.submitted++;
      }return rpc(name,args);};})()`);
    await click(submit);await wait('document.querySelector(".b-error")?.textContent.includes("retry") && !document.querySelector("[data-proposal] [type=submit]").disabled');
    assert.equal(await evaluate('document.querySelector("[name=reason]").value'),'Worksite review');
    await evaluate('(()=>{const f=document.querySelector("[data-proposal]");f.requestSubmit();f.requestSubmit();})()');
    await wait('document.querySelectorAll("[data-retirement-record]").length===3&&!MCPANavigation.restoring');
    assert.equal(await evaluate('window.submitted'),1);
    const id=await evaluate('[...document.querySelectorAll("[data-retirement-record]")].find(c=>c.textContent.includes("Worksite review")).dataset.retirementRecord');
    // A request opened after a proposal blocks approval while a second Admin may still reject.
    await navigate('/index.html?fixture=sky#dashboard');
    await evaluate(`(async()=>{const {error}=await EquipmentTracking.client().rpc('mcpa_movement_action',{p_action:'createRequest',p_operation_id:crypto.randomUUID(),p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Field request during review'}});if(error)throw Error(error.message);})()`);
    for(const [which,action,notes,state] of [[id,'rejectRetirement','Incomplete inspection','Rejected'],[record,'approveRetirement','Inspection verified','Approved']]){
      await page('admin2','?view=history&record='+which,'light');await wait('document.querySelector("'+dialog+'")');
      if(which===id)assert.equal(await evaluate('!!document.querySelector("[value=approveRetirement]")'),false);
      await fill(dialog+' [name=notes]',notes);await click('[value='+action+']');
      await wait('document.querySelector("'+dialog+' .b-state")?.textContent==='+JSON.stringify(state));
      assert.ok((await evaluate('document.querySelector("'+dialog+'").textContent')).includes(notes));
      assert.equal(await evaluate('!!document.querySelector("[value=approveRetirement],[value=rejectRetirement]")'),false);
    }
    await page('admin','?view=history');
    await evaluate(`(()=>{const client=EquipmentTracking.client(),rpc=client.rpc.bind(client);let fail=true;
      client.rpc=(name,args)=>{if(fail&&name==='mcpa_transfer_snapshot'){fail=false;return Promise.resolve({error:{message:'Offline'}});}return rpc(name,args);};
      window.dispatchEvent(new Event('mcpa:movement-change'));})()`);
    await wait('document.querySelector("[data-retry-retirement]")');
    assert.equal(await rows(),3);assert.equal(await evaluate('document.querySelectorAll("[name=assetId]").length'),0);
    await click('[data-retry-retirement]');await wait('!document.querySelector("[data-retry-retirement]")');
    for(const width of [1920,820,390,320])for(const theme of ['light','dark']){
      await resize(width,900);await page('admin','',theme);
      for(const tab of [proposal,history]){
        await click(tab);await wait('!MCPANavigation.restoring');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width+'px '+theme);
      }
    }
    assert.equal(await evaluate('!!document.querySelector(\'[name=assetId][value="TOOL-001"]\')'),false);
    assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.blocked,[]);
    assert.deepEqual(browser.logs.filter(l=>l.level==='error'),[]);
    console.log('PASS proposal validity, recoverable failure, single submission, history routes, combined filters, record focus, both Admin decisions, audit notes, both themes at four widths and local-only browser requests');
  }finally{try{if(browser)await browser.close();}finally{server.kill();}}
})().catch(error=>{console.error(error);process.exitCode=1;});
