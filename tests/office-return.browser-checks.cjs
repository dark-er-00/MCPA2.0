const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot})=>{
 const a=f.actors,office=f.sites.office;
 const writes=()=>calls.filter(c=>c.rpc==='mcpa_movement_action').length;
 const equipment=()=>f.db.query('select * from equipment order by id').then(r=>r.rows);
 await f.db.query("insert into equipment(id,asset_id,name,quantity,status,current_holder_id,site_id) values($1,'OTHER-OFFICE','Other Engineer equipment',1,'IN_USE',$2,$3),($4,'ARCH-OFFICE','Architect return equipment',2,'IN_USE',$5,$3)",[randomUUID(),a.pau.id,f.sites.casa,randomUUID(),a.architect.id]);
 await f.db.query("update equipment set name=$1 where asset_id='TOOL-003'",['Construction equipment with a long descriptive name for Office return inspection and repair accountability']);
 const baseline=await equipment(),baselineSites=(await f.db.query('select * from sites order by id')).rows;
 const resolverDefinition=(await f.db.query("select pg_get_functiondef('public.mcpa_return_destination()'::regprocedure) as definition")).rows[0].definition;
 await f.db.exec('drop function public.mcpa_return_destination()');
 await logout();await login('sky');await wait('document.querySelector(".dashboard-turnovers")');await go('return');await wait('document.querySelector("[data-return-submit]")');
 assert.ok(await evaluate('document.querySelector("[data-return-submit]").disabled'));
 assert.ok(await evaluate('document.querySelector("[data-return-destination]").textContent.includes("Office returns are not configured")'));
 assert.ok(await evaluate('!document.querySelector("[data-form=create] [name=destination]")'));
 await click('[name=toolIds][value="TOOL-002"]');await fill('[data-condition]','good');await fill('#mv-notes','Preserve this draft during Office connection retry');
 const writesBeforeMissing=writes();await submit('[data-form=create]');assert.equal(writes(),writesBeforeMissing);
 // Restore only the dropped test resolver. Reapplying an older migration after
 // the newer verified-inventory patch correctly fails its source-drift guard.
 await f.db.exec(resolverDefinition);
 await click('[data-action=retry-office]');await wait('!document.querySelector("[data-return-submit]").disabled');
 assert.equal(await evaluate('document.querySelector("#mv-notes").value'),'Preserve this draft during Office connection retry');
 assert.equal(await evaluate('document.querySelector("[data-condition]").value'),'good');
 assert.ok(await evaluate('document.querySelector("[name=toolIds][value=TOOL-002]").checked'));
 assert.ok(await evaluate('!document.querySelector("[name=toolIds][value=OTHER-OFFICE]")&&!document.querySelector("[name=toolIds][value=ARCH-OFFICE]")&&!document.querySelector("[name=toolIds][value=TOOL-001]")'));
 for(const id of ['TOOL-003','TOOL-004'])await click('[name=toolIds][value="'+id+'"]');
 // Checkbox changes rebuild the inspection list, preserving the existing form behavior.
 await fill('[data-inspection="TOOL-002"] [data-condition]','good');
 await fill('[data-inspection="TOOL-003"] [data-condition]','damaged');await fill('[data-inspection="TOOL-003"] [data-condition-notes]','Guard broken; delivered to company Office');
 await fill('[data-inspection="TOOL-004"] [data-condition]','lost');await fill('[data-inspection="TOOL-004"] [data-condition-notes]','Not physically returned; last held at project');
 for(const [width,dark]of [[1440,false],[1440,true],[393,false],[393,true]]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate('applyTheme('+dark+',false)');
  await wait('matchMedia("(max-width:768px)").matches==='+String(width<768));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Return form fits '+width+' '+dark);
  assert.ok(await evaluate('document.querySelector("[data-return-destination] strong").textContent==="Office" && document.querySelector("[data-return-destination]").textContent.includes("Main Office")'));
  assert.ok(await evaluate('!document.querySelector("[data-return-destination] input,[data-return-destination] select,[data-form=create] [name=destination]")'));
  await wait('Array.from(document.querySelectorAll("#screen-return [data-form=create] [data-condition]")).every(e=>e.getBoundingClientRect().height>=44)');
  await evaluate('document.querySelector("[data-return-destination]").scrollIntoView({block:"center"})');
  await shot('office-return-'+width+'-'+(dark?'night':'light'),true);
 }
 assert.deepEqual(await equipment(),baseline,'Opening, selecting and inspecting does not change custody');
 // Injecting a legacy destination input cannot change the fixed form payload.
 await evaluate('(()=>{const e=document.createElement("input");e.name="destination";e.value="Casa Buena";document.querySelector("[data-form=create]").appendChild(e);})()');
 await f.db.query('update sites set is_active=false where id=$1',[office]);await evaluate('__tickSync()');
 await wait('document.querySelector("[data-return-submit]").disabled && document.querySelector("[data-return-destination]").textContent.includes("unavailable")');
 assert.equal(await evaluate('document.querySelector("[data-inspection=TOOL-003] [data-condition-notes]").value'),'Guard broken; delivered to company Office');
 await f.db.query('update sites set is_active=true where id=$1',[office]);await click('[data-action=retry-office]');await wait('!document.querySelector("[data-return-submit]").disabled');
 await submit('[data-form=create]');await wait('document.querySelector("[data-detail][open]")?.textContent.includes("Main Office")');
 const result=await evaluate('MovementStore.getState().returns[0]');assert.equal(result.destinationId,office);assert.equal(result.destination,'Main Office');
 const operation=(await f.db.query("select payload from mcpa_movement_operations where action='createReturn' and result->>'id'=$1",[result.id])).rows[0];assert.equal(operation.payload.destination,'Main Office');assert.equal(operation.payload.destinationId,office);
 const saved=await equipment();for(const id of ['TOOL-002','TOOL-003']){const tool=saved.find(t=>t.asset_id===id);assert.equal(tool.current_holder_id,null);assert.equal(tool.site_id,office);assert.equal(tool.status,id==='TOOL-002'?'AVAILABLE':'REPAIR');}
 assert.equal(saved.find(t=>t.asset_id==='TOOL-004').current_holder_id,a.sky.id);assert.equal(saved.find(t=>t.asset_id==='TOOL-004').site_id,f.sites.casa);
 assert.ok(result.source.every(t=>t.siteId===f.sites.casa&&t.holderId===a.sky.id));
 await go('masterlist');await wait('document.querySelector("#movement-inventory-search")');assert.ok(await evaluate('!document.querySelector("#overview-results").textContent.includes("TOOL-002")&&!document.querySelector("#overview-results").textContent.includes("TOOL-003")'));
 await logout();await login('admin');await wait('document.querySelector(".admin-review")');await evaluate('showScreen('+JSON.stringify('return?record='+result.id)+')');await wait('document.querySelector("#screen-return.active [data-detail][open]")?.textContent.includes("Main Office")');
 assert.ok(await evaluate('document.querySelector("[data-detail][open]").textContent.includes("Guard broken") && !document.querySelector("[data-detail][open] form")'));
 await shot('office-return-admin-history',true);
 await logout();await login('architect');await wait('document.querySelector(".dashboard-turnovers")');await go('return');await wait('document.querySelector("[data-return-submit]")');
 assert.ok(await evaluate('document.querySelector("[data-return-destination] strong").textContent==="Office"'));
 await click('[name=toolIds][value="ARCH-OFFICE"]');await fill('[data-condition]','good');await fill('#mv-notes','Architect inspected Office return');await submit('[data-form=create]');
 await wait('document.querySelector("[data-detail][open]")?.textContent.includes("Main Office")');
 assert.equal((await equipment()).find(t=>t.asset_id==='ARCH-OFFICE').current_holder_id,null);
 assert.ok(await evaluate('document.querySelector("[data-return-submit]").disabled && document.querySelector(".mv-empty-tools").textContent.includes("No eligible tools")'));
 const withoutOfficeTestClock=rows=>rows.map(row=>row.id===office?{...row,updated_at:null}:row);
 assert.deepEqual(withoutOfficeTestClock((await f.db.query('select * from sites order by id')).rows),withoutOfficeTestClock(baselineSites),'Only the controlled Office availability test changes its update clock; project/location details and assignments remain intact');
 console.log('PASS Engineer/Architect Office-only return, no destination selector, missing/inactive configuration blocked with draft-preserving retry, mobile/desktop themes, inspected good/damaged custody, missing-item accountability and Admin history');
};
