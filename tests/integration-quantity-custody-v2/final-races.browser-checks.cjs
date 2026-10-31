const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,base})=>{
  const imported=await f.call(f.actors.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Final race retirement',category:'Power Tools',tracking_type:'Individual',condition:'Good',quantity:3}]});
  const propose=index=>f.action(f.actors.admin,'proposeRetirement',{assetId:imported.assets[index].asset_id,disposition:'disposed',effectiveDate:'2026-10-01',reason:'Final race fixture'});
  await command('Page.navigate',{url:base+'/MCPA/index.html'});await login('admin');await wait('window.MCPAAuth?.profile?.role==="admin"');
  await go('asset-retirement-v2');await wait('document.querySelector("[data-proposal]")');
  await evaluate("window.__raceRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());window.__raceReads=[];window.__raceHold=true;EquipmentTracking.client().rpc=async(name,args)=>{const response=await __raceRpc(name,args);if(name!=='mcpa_b_snapshot'||!__raceHold)return response;return new Promise(resolve=>__raceReads.push({response,resolve}));}");
  const held=number=>wait('__raceReads.length==='+number);
  const release=async index=>{await evaluate(`__raceReads[${index}].resolve(__raceReads[${index}].response)`);await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');};
  const visible=record=>evaluate('!!document.querySelector('+JSON.stringify('[data-retirement-record="'+record.id+'"]')+')');
  await click('[data-integration-refresh]');await held(1); // A captures the old server state.
  const first=await propose(0);
  await click('[data-integration-refresh]');await held(2); // B captures the new proposal.
  await release(1);await wait('document.querySelector('+JSON.stringify('[data-retirement-record="'+first.id+'"]')+')');
  await release(0);
  assert.equal(await visible(first),true,'Late refresh A must not erase the proposal already rendered by refresh B');
  console.log('PASS Retirement refresh ordering: B renders new proposal; late A cannot remove it');

  await click('[data-integration-refresh]');await held(3);await click('[data-integration-refresh]');await held(4);
  await fill('[name=reason]','Keep the draft across both overlapping responses');await release(3);await release(2);
  assert.equal(await evaluate('document.querySelector("[name=reason]").value'),'Keep the draft across both overlapping responses');
  assert.equal(await visible(first),true);
  console.log('PASS Overlapping retirement reads preserve edits made while both are pending');

  await evaluate('window.confirm=()=>true');await click('[data-integration-refresh]');await held(5);
  await go('dashboard');const second=await propose(1);
  await evaluate('void showScreen('+JSON.stringify('asset-retirement-v2?record='+second.id)+')');await held(6);await release(5);
  await wait('document.querySelector('+JSON.stringify('[data-retirement-record="'+second.id+'"]')+')');
  await release(4);assert.equal(await visible(second),true);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-retirement-record="'+second.id+'"]')+').open'),true);
  console.log('PASS Disposed refresh cannot alter remounted retirement content or deep-link expansion');

  await evaluate('__raceHold=false');const third=await propose(2);await click('[data-integration-refresh]');
  await wait('document.querySelector('+JSON.stringify('[data-retirement-record="'+third.id+'"]')+')');
  assert.equal(await visible(second),true);
  await evaluate("EquipmentTracking.client().rpc=(name,args)=>name==='mcpa_b_snapshot'?Promise.resolve({error:{code:'TEST',message:'Final race read failure'}}):__raceRpc(name,args)");
  await click('[data-integration-refresh]');await wait('document.querySelector("[data-integration-status]").textContent.includes("Final race read failure")');
  assert.equal(await visible(third),true,'Read error preserves rendered records');
  await evaluate('EquipmentTracking.client().rpc=__raceRpc');await click('[data-integration-refresh]');
  await wait('document.querySelector("[data-integration-status]").textContent==="Records refreshed."');assert.equal(await visible(third),true);
  console.log('PASS Normal completion and error recovery still refresh retirement data');

  // Exercise the retirement module without the host adapter's ordering guard.
  await evaluate(`(async()=>{const {mountRetirement}=await import('/MCPA/js/upgrades/equipment-retirement/retirement.mjs');window.__standaloneRoot=document.createElement('section');__standaloneRoot.dataset.standalone='';document.body.append(__standaloneRoot);window.__standaloneReads=[];window.__standaloneHold=false;const api={client:EquipmentTracking.client(),async snapshot(){const {data,error}=await __raceRpc('mcpa_b_snapshot');if(error)throw Error(error.message);if(!__standaloneHold)return data;return new Promise(resolve=>__standaloneReads.push({data,resolve}));}};window.__standalone=await mountRetirement(__standaloneRoot,{api,admin:true,recordId:${JSON.stringify(first.id)}});__standaloneHold=true;})()`);
  const localRefresh=()=>evaluate('void __standalone.refresh().catch(error=>{window.__standaloneError=error.message;})');
  const localHeld=n=>wait('__standaloneReads.length==='+n);
  const localRelease=async n=>{await evaluate(`__standaloneReads[${n}].resolve(__standaloneReads[${n}].data)`);await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');};
  await localRefresh();await localHeld(1);await f.action(f.actors.admin2,'approveRetirement',{id:first.id});
  await localRefresh();await localHeld(2);await localRelease(1);await localRelease(0);
  assert.ok(await evaluate('document.querySelector('+JSON.stringify('[data-standalone] [data-retirement-record="'+first.id+'"] summary')+').textContent.includes("Approved")'));
  await localRefresh();await localHeld(3);await localRefresh();await localHeld(4);
  await fill('[data-standalone] [name=reason]','Standalone draft survives');await localRelease(3);await localRelease(2);
  assert.equal(await evaluate('document.querySelector("[data-standalone] [name=reason]").value'),'Standalone draft survives');
  assert.match(await evaluate('__standaloneError'),/draft changed/);
  await localRefresh();await localHeld(5);await evaluate('__standalone.destroy()');await localRelease(4);
  assert.equal(await evaluate('__standaloneRoot.children.length'),0);await evaluate('__standaloneRoot.remove()');
  console.log('PASS Standalone retirement module independently orders reads, preserves drafts and ignores disposed responses');

  // Reproduce the import race through actual navigation and the real modal.
  await f.db.exec("alter table equipment add constraint final_ui_rejection check(name <> 'UI race import drill')");
  await go('masterlist');await wait('document.querySelector("#importEquipmentBtn:not([hidden])")');await click('#importEquipmentBtn');
  const upload=async()=>{
    const csv=Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\nUI race import drill,Power Tools,Individual,1,Good').toString('base64');
    await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(csv)}),c=>c.charCodeAt(0))],'race.csv',{type:'text/csv'}));const el=document.querySelector('[data-import-file]');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait('document.querySelector("[data-import-next]")');await click('[data-import-next]');await wait('document.querySelector(".import-summary")');await click('[data-import-next]');
    await wait('document.querySelector("[data-import-ack]")');await click('[data-import-ack]');await click('[data-import-confirm]');
  };
  const pending=()=>evaluate("JSON.parse(sessionStorage.getItem('mcpa.workstream-a.import.v2.'+MCPAAuth.profile.id))");
  await upload();await wait('document.querySelector("[data-import-abandon]")');const rejected=await pending();
  await evaluate("window.__uiReceipt=null;window.__uiCommit=null;window.__uiHoldImport=false;EquipmentTracking.client().rpc=async(name,args)=>{if(name==='mcpa_import_equipment_v2'&&__uiHoldImport)return new Promise((resolve,reject)=>{window.__uiCommit=async()=>{await __raceRpc(name,args);reject(Error('UI committed response lost'));};});const response=await __raceRpc(name,args);if(name==='mcpa_import_equipment_v2_receipt'&&!__uiReceipt)return new Promise(resolve=>{window.__uiReceipt=()=>resolve(response);});return response;}");
  await click('[data-import-abandon]');await wait('typeof window.__uiReceipt==="function"');
  await go('dashboard');await go('masterlist');await wait('document.querySelector("#importEquipmentBtn:not([hidden])")');await click('#importEquipmentBtn');
  await f.db.exec('alter table equipment drop constraint final_ui_rejection');await evaluate('__uiHoldImport=true');
  await upload();await wait('typeof window.__uiCommit==="function"');const retried=await pending();
  assert.equal(retried.operation,rejected.operation);assert.equal(retried.uncertain,true);
  await evaluate('__uiReceipt()');await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');assert.deepEqual(await pending(),retried);
  assert.ok(await evaluate('document.querySelector("[data-import-confirm]").textContent.includes("Importing")'),'Old callback does not reset the new modal');
  await evaluate('__uiCommit()');await wait('document.querySelector("[data-import-message]").textContent.includes("UI committed response lost")');
  await click('[data-import-close]');await click('#importEquipmentBtn');await click('[data-import-recover]');
  await wait('document.querySelector("[data-import-return]")');assert.equal(await pending(),null);
  assert.equal(Number((await f.db.query("select count(*) n from equipment where name='UI race import drill'")).rows[0].n),1);
  await click('[data-import-return]');await evaluate('EquipmentTracking.client().rpc=__raceRpc');
  console.log('PASS Import modal navigation/remount: late abandonment preserves retry token; lost commit recovers exactly one equipment record');
};
