const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,base,calls,shot})=>{
  const pending=()=>evaluate("JSON.parse(sessionStorage.getItem('mcpa.workstream-a.import.v2.'+MCPAAuth.profile.id))");
  const count=async name=>Number((await f.db.query('select count(*) n from equipment where name=$1',[name])).rows[0].n);
  const upload=async name=>{
    const csv=Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\n'+name+',Power Tools,Individual,1,Good').toString('base64');
    await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(csv)}),c=>c.charCodeAt(0))],'review.csv',{type:'text/csv'}));const input=document.querySelector('[data-import-file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait('document.querySelector("[data-import-next]")');await click('[data-import-next]');
    await wait('document.querySelector(".import-summary")');await click('[data-import-next]');
    await wait('document.querySelector("[data-import-ack]")');await click('[data-import-ack]');await click('[data-import-confirm]');
  };
  await f.db.exec("alter table equipment add constraint review_rejection check(name <> 'Rejected by review fixture')");
  await command('Page.navigate',{url:base+'/MCPA/index.html'});await login('admin');await wait('window.MCPAAuth?.profile?.role==="admin"');
  await go('masterlist');await wait('document.querySelector("#importEquipmentBtn:not([hidden])")');await click('#importEquipmentBtn');
  await upload('Rejected by review fixture');await wait('document.querySelector("[data-import-abandon]:not(:disabled)")');
  assert.equal(await count('Rejected by review fixture'),0,'Constraint rejection rolled the batch back');
  const rejected=await pending();assert.equal(rejected.rejected,true);assert.equal(rejected.uncertain,false);
  // Inspect both shipped widths in one bounded visual round.
  await shot('review-rejected-import-desktop',true);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-import-abandon]").getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;})()'));
  await shot('review-rejected-import-mobile',true);
  await evaluate("window.__reviewRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());EquipmentTracking.client().rpc=(name,args)=>name==='mcpa_import_equipment_v2_receipt'?Promise.resolve({error:{message:'Review receipt check offline'}}):__reviewRpc(name,args)");
  await click('[data-import-abandon]');await wait('document.querySelector("[data-import-message]").textContent.includes("receipt check offline")');
  assert.equal((await pending()).operation,rejected.operation,'Failed receipt lookup preserves rejected operation');
  assert.ok(await evaluate('!!document.querySelector("[data-import-ack]")'),'Failed check preserves the current wizard');
  await evaluate('EquipmentTracking.client().rpc=__reviewRpc');
  const receiptCalls=calls.filter(c=>c.rpc==='mcpa_import_equipment_v2_receipt').length;
  await click('[data-import-abandon]');await wait('document.querySelector("[data-import-message]").textContent.includes("Rejected attempt cleared")');
  assert.equal(await pending(),null);assert.ok(await evaluate('!!document.querySelector("[data-import-file]")'));
  assert.equal(calls.filter(c=>c.rpc==='mcpa_import_equipment_v2_receipt').length,receiptCalls+1,'Abandonment verifies the missing receipt');
  await upload('Corrected review drill');await wait('document.querySelector("[data-import-return]")');
  assert.equal(await count('Corrected review drill'),1);await click('[data-import-return]');
  console.log('PASS Rejected import: explicit corrected-import action checks receipt, resets wizard and commits corrected file once');

  // Commit using real SQL, lose the response, and recover through the real receipt RPC.
  await click('#importEquipmentBtn');
  await evaluate("window.__reviewRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());window.__reviewLose=true;EquipmentTracking.client().rpc=async(name,args)=>{const value=await __reviewRpc(name,args);if(name==='mcpa_import_equipment_v2'&&__reviewLose&&!value.error){__reviewLose=false;throw Error('Review response lost after commit');}return value;}");
  await upload('Uncertain review drill');await wait('document.querySelector("[data-import-message]").textContent.includes("Review response lost")');
  const uncertain=await pending();assert.equal(uncertain.uncertain,true);assert.equal(uncertain.rejected,false);
  assert.ok(await evaluate('!document.querySelector("[data-import-abandon]")'));assert.equal(await count('Uncertain review drill'),1);
  const importCalls=calls.filter(c=>c.rpc==='mcpa_import_equipment_v2').length;
  await click('[data-import-close]');await click('#importEquipmentBtn');assert.equal((await pending()).operation,uncertain.operation);
  assert.ok(await evaluate('!document.querySelector("[data-import-abandon]")'));await click('[data-import-recover]');
  await wait('document.querySelector("[data-import-return]")');assert.equal(await pending(),null);
  assert.equal(await count('Uncertain review drill'),1);assert.equal(calls.filter(c=>c.rpc==='mcpa_import_equipment_v2').length,importCalls);
  await click('[data-import-return]');await evaluate('EquipmentTracking.client().rpc=__reviewRpc');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  console.log('PASS Uncertain import: corrected-import action stays absent across reopen; receipt recovery creates no duplicate');

  const assets=await f.call(f.actors.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Review retirement fixtures',category:'Power Tools',condition:'Good',tracking_type:'Individual',quantity:3}]});
  const records=[];
  for(const asset of assets.assets)records.push(await f.action(f.actors.admin,'proposeRetirement',{assetId:asset.asset_id,disposition:'disposed',effectiveDate:'2026-10-01',reason:'Review link fixture'}));
  await f.action(f.actors.admin2,'approveRetirement',{id:records[1].id});
  await f.action(f.actors.admin2,'rejectRetirement',{id:records[2].id,notes:'Fixture rejection'});
  for(const [i,status]of ['proposed','approved','rejected'].entries()){
    const selector='[data-retirement-record="'+records[i].id+'"]';
    await go('asset-retirement-v2?record='+records[i].id);await wait('document.querySelector('+JSON.stringify(selector)+')');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').open'),true,status+' deep link expands target');
    assert.equal(await evaluate('document.querySelectorAll("[data-retirement-record][open]").length'),1,'Only target expands');
    await click('[data-integration-refresh]');await wait('document.querySelector("[data-integration-status]").textContent==="Records refreshed."');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').open'),true,status+' target survives refresh');
  }
  await go('asset-retirement-v2?record='+id());await wait('document.querySelector("[data-retirement-record]")');
  assert.equal(await evaluate('document.querySelectorAll("[data-retirement-record][open]").length'),0);
  console.log('PASS Retirement links: proposed, approved and rejected records expand through load and refresh; unknown ID opens no other record');

  await go('asset-retirement-v2');await wait('document.querySelector("[data-proposal]")');
  await evaluate("window.__reviewConfirmCount=0;window.confirm=()=>{++__reviewConfirmCount;return false;};window.__reviewHold=true;window.__reviewRelease=null;EquipmentTracking.client().rpc=(name,args)=>name==='mcpa_b_snapshot'&&__reviewHold?new Promise(resolve=>{window.__reviewRelease=()=>{__reviewHold=false;return __reviewRpc(name,args).then(resolve);};}):__reviewRpc(name,args);window.dispatchEvent(new Event('focus'))");
  await wait('typeof window.__reviewRelease==="function"');await fill('[name=reason]','Preserve this draft while the snapshot is in flight');
  await evaluate('__reviewRelease()');await wait('/draft changed|Records refreshed/.test(document.querySelector("[data-integration-status]").textContent)');
  assert.equal(await evaluate('document.querySelector("[name=reason]").value'),'Preserve this draft while the snapshot is in flight');
  assert.equal(await evaluate('__reviewConfirmCount'),0,'Automatic refresh never asks to discard a draft');
  assert.match(await evaluate('document.querySelector("[data-integration-status]").textContent'),/It has been kept/);
  const snapshots=calls.filter(c=>c.rpc==='mcpa_b_snapshot').length;
  await evaluate("window.dispatchEvent(new Event('focus'))");await wait('document.querySelector("[data-integration-status]").textContent.includes("Refresh when your form is ready")');
  assert.equal(calls.filter(c=>c.rpc==='mcpa_b_snapshot').length,snapshots,'Dirty form prevents a further automatic read');
  await evaluate('EquipmentTracking.client().rpc=__reviewRpc');
  await click('[data-integration-refresh]');assert.equal(await evaluate('__reviewConfirmCount'),1);
  assert.equal(await evaluate('document.querySelector("[name=reason]").value'),'Preserve this draft while the snapshot is in flight');
  await evaluate('window.confirm=()=>{++__reviewConfirmCount;return true;}');await click('[data-integration-refresh]');
  await wait('document.querySelector("[data-integration-status]").textContent==="Records refreshed."');
  assert.equal(await evaluate('__reviewConfirmCount'),2);assert.equal(await evaluate('document.querySelector("[name=reason]").value'),'');
  console.log('PASS In-flight automatic refresh: edits survive response and focus skips refresh; explicit refresh respects discard choice');
};
