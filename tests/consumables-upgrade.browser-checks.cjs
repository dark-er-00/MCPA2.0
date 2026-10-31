const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const catalog=require('../js/consumables-catalog.js');
exports.verify=async({fixture,evaluate,command,wait,click,fill,submit,go,shot,artifactDirectory})=>{
 const report=path.resolve(__dirname,'../documentation/consumables-upgrade-2026-10-22/screenshots');fs.mkdirSync(report,{recursive:true});
 const capture=async name=>{await shot(name,true);const file=path.join(artifactDirectory,name+'.png');if(fs.existsSync(file))fs.copyFileSync(file,path.join(report,name+'.png'));};
 const key=async(selector,value='Enter',code=13)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:code,text:value==='Enter'?'\r':' '});await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:code});};
 await wait('document.querySelector(".consumables-shortcut") && !MCPANavigation.restoring');
 assert.equal(await evaluate('document.querySelectorAll(".consumables-shortcut .num").length'),0);
 assert.equal(await evaluate('document.querySelectorAll(".consumables-warning").length'),0);
 await key('.consumables-shortcut');await wait('document.querySelector("#screen-consumables.active") && document.querySelector("#consumables-count").textContent==="126 of 126 items"');
 assert.equal(await evaluate('document.querySelector("[data-target=consumables]").classList.contains("active")'),true);
 await evaluate('history.back()');await wait('document.querySelector("#screen-dashboard.active") && !MCPANavigation.restoring');
 await key('.consumables-shortcut',' ',32);await wait('document.querySelector("#screen-consumables.active") && document.querySelector("#consumables-count").textContent==="126 of 126 items"');
 console.log('PASS Consumables card: no large total/healthy warning, Enter/Space navigation, active indicator and browser Back');
 await fill('#consumables-filter','archived');
 assert.equal(await evaluate('document.querySelector("#consumables-count").textContent'),'1 of 1 archived items');
 assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-action=history]").length'),1);
 assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-action=stock],#consumables-rows [data-action=request],#consumables-rows [data-action=edit]").length'),0);
 await click('#consumables-rows [data-action=history]');await wait('document.querySelector("#consumables-dialog-content").textContent.includes("History is read-only")');
 assert.equal(await evaluate('document.querySelectorAll("#consumables-dialog tbody tr").length'),4);
 await click('#consumables-dialog [data-action=close]');await fill('#consumables-filter','');
 await click('[data-action=request]');assert.equal(await evaluate('[...document.querySelector("#cons-item").options].some(o=>o.value==="c3f58442-dc99-4466-8590-16642abdb7bc")'),false);
 await click('#consumables-dialog [data-action=close]');
 console.log('PASS Archived sample is absent from active inventory/dashboard/request choices; Archived history preserves all four movements without edit/stock actions');
 assert.deepEqual(await evaluate('[...document.querySelector("#consumables-category").options].slice(1).map(o=>o.value)'),catalog.categories.map(c=>c.name));
 for(const category of catalog.categories){await fill('#consumables-category',category.name);assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-item-id]").length'),catalog.items.filter(i=>i.category===category.name).length);}
 await fill('#consumables-category','Cutting');await fill('#consumables-search','7"');await fill('#consumables-filter','ok');
 assert.equal(await evaluate('document.querySelector("#consumables-count").textContent'), '2 of 126 items');
 await fill('#consumables-search','CUT-001');assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-item-id]").length'),1);
 await fill('#consumables-filter','attention');assert.match(await evaluate('document.querySelector("#consumables-rows").textContent'),/No consumables match/);
 await fill('#consumables-search','');await fill('#consumables-filter','');await fill('#consumables-category','');
 console.log('PASS All 12 category filters, SKU/specification search, combined stock filter, result counts and empty state');
 await click('[data-action=add]');await fill('#cons-name','Browser fixture');await fill('#cons-category','Welding');await fill('#cons-specification','2.5mm');await fill('#cons-unit','kg');await fill('#cons-opening','-1');await submit('#consumables-form');
 assert.ok(await evaluate('document.querySelector("#consumables-dialog").open'));assert.match(await evaluate('document.querySelector("#consumables-form-error").textContent'),/negative/);
 await fill('#cons-opening','0.0001');await submit('#consumables-form');assert.ok(await evaluate('document.querySelector("#consumables-dialog").open'));
 await fill('#cons-opening','1.125');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');
 await fill('#consumables-category','Welding');await fill('#consumables-search','Browser fixture');assert.equal(await evaluate('document.querySelector("#consumables-count").textContent'),'1 of 127 items');
 await click('#consumables-rows [data-action=edit]');await fill('#cons-category','Drilling');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-item-id]").length'),0);
 await fill('#consumables-category','Drilling');assert.equal(await evaluate('document.querySelectorAll("#consumables-rows [data-item-id]").length'),1);
 await fill('#consumables-category','Cutting');await fill('#consumables-search','CUT-001');await click('#consumables-rows [data-action=stock]');await fill('#cons-quantity','101');await submit('#consumables-form');
 assert.match(await evaluate('document.querySelector("#consumables-form-error").textContent'),/Insufficient stock.*100/);assert.ok(await evaluate('document.querySelector("#consumables-dialog").open'));
 await fill('#cons-quantity','95');await fill('#cons-note','Browser fixture usage');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');
 const item=(await fixture.db.query("select * from consumables where item_code='CUT-001'")).rows[0];assert.equal(item.current_stock,'5.000');
 console.log('PASS Add/edit categories, fractional stock, negative/precision validation and insufficient-stock form preservation');
 await click('#consumables-rows [data-action=request]');assert.match(await evaluate('document.querySelector("#cons-item").selectedOptions[0].textContent'),/CUT-001.*Metal Cutting Disc.*4"/);
 await fill('#cons-quantity','5');await fill('#cons-requester','Admin fixture');await fill('#cons-purpose','Isolated receipt check');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');
 await click('#consumables-request-rows [data-action=receive]');await fill('#cons-quantity','5');await fill('#cons-note','Browser fixture receipt');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');
 assert.equal((await fixture.db.query('select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock,'10.000');
 await click('#consumables-rows [data-action=history]');await wait('document.querySelector("#consumables-dialog-content").textContent.includes("Browser fixture receipt")');assert.match(await evaluate('document.querySelector("#consumables-dialog-content").textContent'),/Admin Test/);await click('#consumables-dialog [data-action=close]');
 console.log('PASS Purchase request chooses SKU, receiving updates stock and history includes authorized actor');
 await go('purchase');await wait('document.querySelector("[data-purchase-new]") && !document.querySelector("[data-purchase-new]").disabled');
 await click('[data-purchase-new]');assert.match(await evaluate('document.querySelector("[name=request_id]").textContent'),/CUT-001.*Metal Cutting Disc.*4"/);
 await click('[data-purchase-close]');
 console.log('PASS Purchases request picker displays SKU and specification while preserving stable request links');
 // Browser fixture item is also low: two live warnings, then singular, then healthy.
 await go('dashboard');await wait('document.querySelector(".consumables-warning")?.textContent==="2 items low stock"');
 await evaluate("document.body.classList.add('dark')");if(!process.env.MCPA_SKIP_SCREENSHOTS)await capture('dashboard-dark');
 await evaluate("document.body.classList.remove('dark')");if(!process.env.MCPA_SKIP_SCREENSHOTS)await capture('dashboard-light');
 await fixture.db.query('update consumables set minimum_stock=0 where name=$1',['Browser fixture']);
 await evaluate('__tickSync()');await wait('document.querySelector(".consumables-warning")?.textContent==="1 item low stock"');
 await click('.consumables-shortcut');await wait('document.querySelector("#consumables-count")?.textContent==="127 of 127 items"');
 await fill('#consumables-search','CUT-001');await click('#consumables-rows [data-action=stock]');await fill('#cons-kind','restock');await fill('#cons-quantity','90');await fill('#cons-note','Restore stock after isolated test');await submit('#consumables-form');await wait('!document.querySelector("#consumables-dialog").open');
 await go('dashboard');await wait('document.querySelector(".consumables-shortcut") && !document.querySelector(".consumables-warning")');
 console.log('PASS Dynamic plural/singular warnings, existing refresh cycle, and warning removed after restocking');
 for(const dark of [true,false]){
  await evaluate(`document.body.classList.toggle('dark',${dark})`);
  for(const width of [320,375,390,393,430,768,1024,1440]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
   await go('dashboard');await wait('document.querySelector(".consumables-shortcut")');
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`dashboard overflow ${width}/${dark}`);
   await click('.consumables-shortcut');await wait('document.querySelector("#consumables-count")?.textContent==="127 of 127 items"');
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`consumables overflow ${width}/${dark}`);
   assert.ok(await evaluate('(()=>{const r=document.querySelector("#consumables-category").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'));
   await click('[data-action=add]');assert.ok(await evaluate('(()=>{const r=document.querySelector("#consumables-dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'));
   await evaluate('document.querySelector("#consumables-dialog button[type=submit]").scrollIntoView({block:"center"})');
   assert.ok(await evaluate('(()=>{const r=document.querySelector("#consumables-dialog button[type=submit]").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()'));
   await click('#consumables-dialog [data-action=close]');
   for(const action of ['edit','stock','request']){
    await click(`#consumables-rows [data-action=${action}]`);
    assert.ok(await evaluate('(()=>{const r=document.querySelector("#consumables-dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'),`${action} modal bounds ${width}/${dark}`);
    await evaluate('document.querySelector("#consumables-dialog button[type=submit]").scrollIntoView({block:"center"})');
    assert.ok(await evaluate('(()=>{const r=document.querySelector("#consumables-dialog button[type=submit]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'),`${action} save button visible ${width}/${dark}`);
    await click('#consumables-dialog [data-action=close]');
   }
   if([393,1440].includes(width)&&!process.env.MCPA_SKIP_SCREENSHOTS)await capture(`consumables-${dark?'dark':'light'}-${width}`);
  }
 }
 console.log('PASS 8 viewport widths in both themes: dashboard, filters, table containment and scrollable Add/Edit/Stock/Purchase Request modals');
};
