const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,calls,shot})=>{
  const imported=await f.call(f.actors.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Unified receipt drill',category:'Power Tools',condition:'Good',tracking_type:'Individual',quantity:2}]});
  await command('Page.navigate',{url:base+'/MCPA/2-engr/index.html'});await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');
  await go('request');await wait('document.querySelector("[data-q-type]:not(:disabled)") && document.querySelector("[data-equipment-list]")');
  assert.equal(await evaluate('document.querySelectorAll("#nav-list [data-target=request]").length'),1);
  assert.equal(await evaluate('document.querySelector("#nav-list [data-target=quantity-request]")'),null);
  assert.equal(await evaluate('document.querySelector("[data-method=quantity]").getAttribute("aria-pressed")'),'true');
  await evaluate('[...document.querySelectorAll(".wa-q-type")].find(n=>n.textContent.includes("Unified receipt drill")).querySelector("button").click()');
  await fill('[name=quantity]','1');await fill('[name=siteId]',f.sites.casa);await submit('[data-q-form]');
  await wait('document.querySelector("[data-equipment-list]").textContent.includes("Unified receipt drill")');
  const quantity=(await f.call(f.actors.sky,'mcpa_wa_equipment_requests')).find(q=>q.type_name==='Unified receipt drill');
  // Existing Equipment Tracking shortcuts carry an exact-asset draft.
  await evaluate('window.movementDraft={kind:"request",toolIds:["TOOL-001"]}');await go('request');await wait(`document.querySelector('[name="toolIds"][value="TOOL-001"]')?.checked`);
  assert.equal(await evaluate('document.querySelector("[data-method=specific]").getAttribute("aria-pressed")'),'true');
  await fill('[name=destination]','Casa Buena');await submit('[data-form=create]');
  await wait('MovementStore.getState().requests.some(r=>r.toolIds.includes("TOOL-001"))');
  const named=await evaluate('MovementStore.getState().requests.find(r=>r.toolIds.includes("TOOL-001"))');
  await wait('document.querySelectorAll("[data-equipment-record]").length===2');
  await logout();await login('admin');await wait('MCPAAuth.profile?.role==="admin"');await go('request');await wait('document.querySelectorAll("[data-equipment-record]").length===2');
  await click(`[data-open-request="${quantity.id}"]`);await wait('document.querySelector("[data-q-approve]:not(:disabled)")');
  assert.ok(await evaluate('document.querySelector("[data-q-review]").textContent.includes("eligible assets")'));
  const chosen=await evaluate('[...document.querySelectorAll("[name=assetId]:checked")].map(n=>n.value)');assert.equal(chosen.length,1);
  await click('[data-q-action=clear]');assert.equal(await evaluate('document.querySelector("[data-q-approve]").disabled'),true);
  await click(`[name=assetId][value="${chosen[0]}"]`);await submit('[data-q-allocate-form]');
  await wait('document.querySelector("[data-q-feedback]").textContent.includes("reserved")');
  const allocated=(await f.call(f.actors.admin,'mcpa_wa_equipment_requests')).find(q=>q.id===quantity.id);
  const tag=allocated.assets[0].asset_id;
  assert.equal((await f.tool(tag)).current_holder_id,null);
  await go('request?record='+named.id);await wait('document.querySelector("[data-action=approve]")');await click('[data-action=approve]');await wait('document.querySelector("[data-action=release]")');
  assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
  await logout();await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');await go('request');
  await wait('document.querySelectorAll("[data-equipment-record]").length===2');
  assert.equal(await evaluate('[...document.querySelectorAll("[data-equipment-record]")].filter(n=>n.textContent.includes("Approved — Awaiting Admin Release")).length'),2);
  assert.equal(await evaluate('document.querySelector("[href*=transfer-inbox]")'),null);
  await go('masterlist');await wait('document.querySelector("#screen-masterlist.active")');
  assert.ok(await evaluate('!MovementStore.getState().tools.some(t=>["TOOL-001",'+JSON.stringify(tag)+'].includes(t.id)&&t.holderId===MCPAAuth.profile.id)'));
  await logout();await login('admin');await wait('MCPAAuth.profile?.role==="admin"');
  for(const requestId of [allocated.movement_id,named.id]) {
    await go('request?record='+requestId);await wait('document.querySelector("[data-action=release]")');await click('[data-action=release]');
    await wait('MovementStore.getState().transfers.some(t=>t.requestId==='+JSON.stringify(requestId)+')');
  }
  assert.equal((await f.tool(tag)).current_holder_id,null);assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
  const transfers=(await f.rpc(f.actors.admin,'mcpa_movement_snapshot')).transfers;
  await logout();await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');await go('request');
  await wait('document.querySelectorAll("[href*=transfer-inbox]").length===2');
  await click(`[data-open-request="${named.id}"]`);await wait('document.querySelector("dialog[data-detail][open]")');
  assert.ok(await evaluate('document.querySelector("dialog[data-detail][open] .equipment-progress")!==null'));
  assert.ok(await evaluate('document.querySelector("dialog[data-detail][open] a[href*=transfer-inbox]")!==null'));
  await click('[data-action=close-detail]');
  // Inspect both desktop and mobile using the same real local request history.
  for(const [width,height] of [[1440,1000],[390,844]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('unified-engineer-'+width);
  }
  await fill('[data-equipment-type]','quantity');assert.equal(await evaluate('document.querySelectorAll("[data-equipment-record]").length'),1);
  await fill('[data-equipment-search]',tag);assert.equal(await evaluate('document.querySelectorAll("[data-equipment-record]").length'),1);
  await fill('[data-equipment-search]','no-such-request');assert.ok(await evaluate('document.querySelector("[data-equipment-list]").textContent.includes("No requests match")'));
  await fill('[data-equipment-search]','');await fill('[data-equipment-type]','');
  for(const requestId of [allocated.movement_id,named.id]) {
    const tr=transfers.find(t=>t.requestId===requestId),asset=requestId===named.id?'TOOL-001':tag;
    await click(`[href="#transfer-inbox?record=${tr.id}"]`);await wait('document.querySelector('+JSON.stringify(`[data-transfer="${tr.id}"]`)+')');
    const form=`[data-transfer="${tr.id}"]`;
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(form+' [name=condition]')+').value'),'');
    assert.ok(await evaluate('document.querySelector('+JSON.stringify(form+' [data-accept-asset]')+').textContent.includes('+JSON.stringify(asset)+')'));
    assert.ok(await evaluate('!!document.querySelector("[data-files]")'));
    // Missing/disputed items are kept pending; no default Good or silent receipt.
    assert.ok(await evaluate('document.querySelector(".b-content").textContent.includes("missing or disputed")'));
    assert.equal((await f.tool(asset)).current_holder_id,null);
    await fill(form+' [name=condition]','good');await fill(form+' [name=notes]','Printed Asset ID checked and physically tested.');await click(form+' [name=received]');
    await submit(form);await wait('document.querySelector(".b-feedback").textContent.includes("accepted")');
    assert.equal((await f.tool(asset)).current_holder_id,f.actors.sky.id);
    await go('request');await wait('document.querySelector("[data-equipment-list]").textContent.includes("Inspected / Received")');
  }
  assert.equal(await evaluate('[...document.querySelectorAll("[data-equipment-record]")].filter(n=>n.querySelector(".equipment-row").textContent.includes("Inspected / Received")).length'),2);
  await go('masterlist');await wait('MovementStore.getState().tools.filter(t=>["TOOL-001",'+JSON.stringify(tag)+'].includes(t.id)&&t.holderId===MCPAAuth.profile.id).length===2');
  // No receipt can replay into a second handover or new custody transition.
  assert.equal(calls.filter(c=>c.rpc==='mcpa_b_action').length,2);
  await logout();await login('admin');await wait('MCPAAuth.profile?.role==="admin"');await go('request');await wait('document.querySelector("[data-equipment-list]")');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await shot('unified-admin-1440');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('unified-admin-390');
  // A request arriving after the review component mounted must be reviewable.
  const catalog=await f.call(f.actors.sky,'mcpa_wa_equipment_catalog'),group=catalog.groups.find(g=>g.type_name==='Unified receipt drill');
  const late=await f.call(f.actors.sky,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:1,p_purpose:'Late incoming request'});
  await evaluate('window.dispatchEvent(new Event("focus"))');await wait('document.querySelector('+JSON.stringify(`[data-open-request="${late.id}"]`)+')');
  await click(`[data-open-request="${late.id}"]`);await wait('document.querySelector("[data-q-approve]:not(:disabled)")');
  await fill('[name=reason]','No longer needed for this work.');await submit('[data-q-reject-form]');await wait('document.querySelector("[data-q-feedback]").textContent.includes("rejected")');
  const cancelled=await f.call(f.actors.sky,'mcpa_wa_submit_equipment',{p_operation_id:id(),p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:1,p_purpose:'Cancellation history'});
  const suggestion=await f.call(f.actors.admin,'mcpa_wa_suggest_equipment',{p_request_id:cancelled.id});
  const reservation=await f.call(f.actors.admin,'mcpa_wa_allocate_equipment',{p_operation_id:id(),p_request_id:cancelled.id,p_asset_ids:suggestion.suggested_asset_ids});
  await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'cancelReservation',p_payload:{id:reservation.movement_id,reason:'Local fixture no longer needs the reservation',confirmed:true},p_operation_id:id()});
  await logout();await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');await go('request');await wait('document.querySelectorAll("[data-equipment-record]").length===4');
  await fill('[data-equipment-stage]','rejected');assert.equal(await evaluate('document.querySelectorAll("[data-equipment-record]").length'),1);
  await fill('[data-equipment-stage]','cancelled');assert.equal(await evaluate('document.querySelectorAll("[data-equipment-record]").length'),1);
  assert.equal(await evaluate('document.querySelector("[data-release-request]")'),null);
  assert.equal(await evaluate('document.querySelector("[data-q-allocate-form]")'),null);
  console.log('PASS Unified requests: both forms, one deduplicated searchable/filterable queue, manual exact allocation, separate release, targeted inspection, confirmed custody, desktop/mobile, permissions and no automatic receipt');
};
