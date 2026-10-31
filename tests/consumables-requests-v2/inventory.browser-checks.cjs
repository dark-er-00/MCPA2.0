const assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,shot})=>{
 const admin=f.actors.admin,sky=f.actors.sky;
 const seed=(name='Site cement',minimum=2)=>f.call(admin,'consumables_save_item',{p_id:id(),p_version:null,p_name:name,p_unit:'bags',p_minimum:minimum,p_opening:50,p_category:'Masonry & Carpentry',p_specification:'40 kg',p_item_code:null});
 const approve=r=>f.call(admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:'approve',p_items:r.items.map(x=>({item_id:x.id,quantity:x.requested_quantity})),p_note:''});
 const issue=(r,quantity=5)=>f.call(admin,'mcpa_wa_issue_consumables',{p_operation_id:id(),p_request_id:r.id,p_items:r.items.map(x=>({item_id:x.id,quantity})),p_issued_at:null});
 const current=()=>f.call(sky,'mcpa_wa_consumables_snapshot');
 const notify=()=>evaluate('window.dispatchEvent(new Event("mcpa:materials-change"))');
 const item=await seed('Site cement with a long specification for field inventory');
 await command('Page.navigate',{url:base+'/MCPA/2-engr/index.html'});await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');
 await go('outward-materials');await wait('document.querySelector("[data-request-form]")');
 await click('[data-tab=inventory]');assert.ok(await evaluate('document.querySelector("#wa-panel-inventory").textContent.includes("No consumables issued to you yet")'));
 assert.equal(await evaluate('document.querySelector("[data-tab=inventory]").getAttribute("aria-selected")'),'true');
 await click('[data-action=request-materials]');await fill('[data-field=site_id]',f.sites.casa);await fill(`[data-quantity="${item.id}"]`,'5');await fill('[data-field=purpose]','Keep this draft');
 await click('[data-tab=inventory]');await click('[data-action=refresh]');await wait('document.querySelector(".wa-engineer").getAttribute("aria-busy")==="false"');
 await click('[data-tab=available]');assert.equal(await evaluate('document.querySelector("[data-field=purpose]").value'),'Keep this draft');
 assert.equal(await evaluate(`document.querySelector('[data-quantity="${item.id}"]').value`),'5');
 // Drop a committed submission response; recovery must select its request tab
 // and reuse the operation receipt rather than creating a duplicate request.
 await evaluate('window.__submitRpc=window.supabaseClient.rpc;window.supabaseClient.rpc=async(name,args)=>{const result=await window.__submitRpc(name,args);return name==="mcpa_wa_submit_consumables"?{data:null,error:{code:"NETWORK",message:"Response interrupted"}}:result;}');
 await submit('[data-request-form]');await wait('document.querySelector(".wa-message").textContent.includes("Response interrupted")');
 await evaluate('window.supabaseClient.rpc=window.__submitRpc');await click('[data-action=recover]');await wait('document.querySelector(".wa-message").textContent.includes("recovered")');
 assert.equal((await current()).requests.length,1);
 assert.equal(await evaluate('document.querySelector("[data-tab=requests]").getAttribute("aria-selected")'),'true');
 const request=(await current()).requests[0];await approve(request);
 await click('[data-tab=inventory]');await notify();await wait('document.querySelector(".wa-engineer").getAttribute("aria-busy")==="false"');
 assert.ok(await evaluate('document.querySelector("[data-inventory-results]").textContent.includes("No consumables issued")'));
 await issue(request);await notify();await wait('document.querySelector(".wa-inventory-table tbody tr")');
 assert.equal(await evaluate('document.querySelector("[data-label^=Available]").textContent'),'5');
 assert.equal(await evaluate('document.querySelector("[data-label$=Used]").textContent'),'Not recorded');
 assert.ok(await evaluate('document.querySelector(".wa-inventory-note").textContent.includes("does not verify physical stock")'));
 // Filtering is browsing: an external issuance must still refresh without a prompt.
 await fill('[data-inventory-filter=search]','Masonry');
 const second=await f.call(sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'',p_items:[{consumable_id:item.id,quantity:5,unit:'bags'}]});await approve(second);await issue(second);await notify();
 await wait('document.querySelector("[data-label^=Available]")?.textContent==="10"');
 assert.equal(await evaluate('document.querySelector("[data-inventory-filter=search]").value'),'Masonry');
 await fill('[data-inventory-filter=search]','No such consumable');assert.ok(await evaluate('document.querySelector("[data-inventory-results]").textContent.includes("No matching consumables")'));
 await click('[data-action=clear-filters]');await fill('[data-inventory-filter=site]',f.sites.casa);await fill('[data-inventory-filter=category]','Masonry & Carpentry');await fill('[data-inventory-filter=status]','Depleted');
 assert.ok(await evaluate('!document.querySelector(".wa-inventory-table")'));await fill('[data-inventory-filter=status]','Available');assert.ok(await evaluate('!!document.querySelector(".wa-inventory-table")'));
 await click('[data-inventory-open]');assert.ok(await evaluate('document.querySelector("[data-inventory-details]").textContent.includes("Issuance & transaction history")'));
 assert.equal(await evaluate('document.querySelectorAll("[data-inventory-details] tbody tr").length'),2);
 await click('[data-action=close-inventory]');assert.equal(await evaluate('document.activeElement.hasAttribute("data-inventory-open")'),true);
 // Pagination and status counts use real additional SKU issues, never UI mocks.
 const extra=[];for(let i=0;i<20;i++)extra.push(await seed('Additional field material '+String(i).padStart(2,'0'),3));
 const batch=await f.call(sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'',p_items:extra.map(x=>({consumable_id:x.id,quantity:1,unit:x.unit}))});await approve(batch);await issue(batch,1);await notify();
 await wait('document.querySelector(".wa-inventory-summary dd")?.textContent==="21"');
 await click('[data-action=clear-filters]');assert.equal(await evaluate('document.querySelectorAll(".wa-inventory-table tbody tr").length'),20);
 await click('[data-page=next]');assert.equal(await evaluate('document.querySelectorAll(".wa-inventory-table tbody tr").length'),1);await click('[data-page=previous]');
 await fill('[data-inventory-filter=search]','Site cement');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 await evaluate('document.querySelector("#content").scrollIntoView()');await shot('engineer-consumables-desktop',true);
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".wa-inventory-table td")).display'),'block');
 await shot('engineer-consumables-mobile',true);
 await evaluate('document.body.classList.add("dark")');await shot('engineer-consumables-mobile-dark',true);await evaluate('document.body.classList.remove("dark")');
 await click('[data-inventory-open]');await click('[data-inventory-details] [data-open]');
 assert.equal(await evaluate('document.querySelector("[data-tab=requests]").getAttribute("aria-selected")'),'true');
 assert.ok(await evaluate('document.querySelector("#wa-panel-requests .wa-details").textContent.includes("Issuance history")'));
 // Transient failure keeps data visibly stale; retry clears the error state.
 await click('[data-tab=inventory]');
 await evaluate('window.__inventoryRpc=window.supabaseClient.rpc;window.supabaseClient.rpc=async(name,args)=>name==="mcpa_wa_consumables_snapshot"?{data:null,error:{code:"NETWORK",message:"Connection unavailable"}}:window.__inventoryRpc(name,args)');
 await click('[data-action=refresh]');await wait('document.querySelector(".wa-message").textContent.includes("previously loaded")');assert.ok(await evaluate('!!document.querySelector(".wa-inventory-table")'));
 await evaluate('window.supabaseClient.rpc=window.__inventoryRpc');await click('[data-action=refresh]');await wait('!document.querySelector(".wa-message").classList.contains("error") && document.querySelector(".wa-engineer").getAttribute("aria-busy")==="false"');
 // Reload fetches the same balances rather than browser storage.
 await command('Page.reload');await wait('window.MCPAAuth?.profile?.role==="engineer"');await go('outward-materials');await wait('document.querySelector("[data-tab=inventory]")');await click('[data-tab=inventory]');
 await fill('[data-inventory-filter=search]','Site cement');assert.equal(await evaluate('document.querySelector("[data-label^=Available]").textContent'),'10');
 // A second engineer cannot see or deep-link into the first engineer's inventory.
 await logout();await login('pau');await wait('MCPAAuth.profile?.id==='+JSON.stringify(f.actors.pau.id));await go('outward-materials?record='+request.id);await wait('document.querySelector("[data-tab=inventory]")');await click('[data-tab=inventory]');
 assert.ok(await evaluate('document.querySelector("[data-inventory-results]").textContent.includes("No consumables issued to you yet")'));
 assert.ok(await evaluate('!document.querySelector("[data-inventory-open]") && !document.querySelector("#wa-panel-requests .wa-details")'));
 await logout();assert.equal(await evaluate('document.querySelector("#content").children.length'),0);
 console.log('PASS Engineer consumables: database-backed issues, empty/pending states, filtering, draft preservation, event refresh, details, pagination, errors/retry, reload, actor isolation, desktop/mobile/dark and cleanup');
};
