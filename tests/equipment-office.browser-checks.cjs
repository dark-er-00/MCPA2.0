// Real local PostgreSQL + authenticated browser transport; external HTTPS is blocked.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,artifactDirectory})=>{
  const viewport=width=>command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`);
  const noQuantity=async selector=>assert.doesNotMatch(await text(selector),/\bQty\b|whole record|\bQuantity\b|quantities|assigned units|zero-quantity/i);
  const account=async key=>{await logout();await login(key);await wait('MCPAAuth.profile && document.querySelector(".admin-review,.dashboard-turnovers")');};
  const shotSaved=async name=>{await shot(name,true);const file=path.join(artifactDirectory,name+'.png');if(fs.existsSync(file)){const target=path.join(__dirname,'artifacts/equipment-office');fs.mkdirSync(target,{recursive:true});fs.copyFileSync(file,path.join(target,name+'.png'));}};
  const history=(await f.db.query('select * from mcpa_movements order by id')).rows;
  await f.db.query("insert into equipment(id,asset_id,name,status) values($1,'T-8862','Welding Machine','MISSING')",[randomUUID()]);
  await f.db.exec("update equipment set status='AVAILABLE' where asset_id='T-8862'");
  await go('masterlist');await wait('document.querySelector("#equipmentTableBody")?.textContent.includes("T-8862")');
  assert.equal(await evaluate('equipmentList.find(t=>t.assetId==="T-8862").site'),'Unassigned');
  const oldEquipment=(await f.db.query('select * from equipment order by asset_id')).rows;
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/equipment-office-confirmed-correction.sql'),'utf8'));
  await evaluate('__tickSync()');await wait('equipmentList.find(t=>t.assetId==="T-8862").site==="Main Office"');
  assert.deepEqual((await f.db.query('select * from equipment order by asset_id')).rows,oldEquipment.map(row=>row.asset_id==='T-8862'?{...row,site_id:f.sites.office}:row));
  assert.deepEqual((await f.db.query('select * from mcpa_movements order by id')).rows,history);
  assert.equal(await evaluate('equipmentList.find(t=>t.assetId==="T-8862").availability'),'Available');
  assert.equal(await evaluate('equipmentList.find(t=>t.assetId==="TOOL-002").site'),'Casa Buena');
  await click('#openAddEquipment');
  assert.ok(await evaluate('document.querySelector("#equipmentInitialLocationValue").readOnly && document.querySelector("#equipmentInitialLocationValue").value==="Office"'));
  await fill('#equipmentType','New Office bulk asset');await fill('#equipmentCategory','Hand Tools');await fill('#trackingType','Bulk');await fill('#equipmentQuantity','7');await fill('#equipmentUnit','Pieces');
  // An invalid Office prevents insertion and keeps the form for retry.
  await f.db.query('update sites set is_active=false where id=$1',[f.sites.office]);
  await submit('#equipmentForm');await wait('document.querySelector("#equipmentFormFeedback").textContent.includes("Office inventory configuration is unavailable")');
  assert.equal((await f.db.query("select count(*) as n from equipment where name='New Office bulk asset'")).rows[0].n,0);
  assert.equal(await evaluate('document.querySelector("#equipmentQuantity").value'),'7');
  await f.db.query('update sites set is_active=true where id=$1',[f.sites.office]);
  for(const [width,dark] of [[1440,false],[1440,true],[393,false],[393,true]]){
    await viewport(width);await evaluate('applyTheme('+dark+',false)');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await shotSaved('admin-new-office-'+width+'-'+(dark?'night':'light'));
  }
  await submit('#equipmentForm');await wait('document.querySelector("#equipmentModal").style.display==="none"');
  const created=(await f.db.query("select * from equipment where name='New Office bulk asset'")).rows[0];
  assert.equal(created.site_id,f.sites.office);assert.equal(created.quantity,7);assert.equal(created.current_holder_id,null);assert.match(created.asset_id,/^T-[0-9A-F]{16}$/);
  await wait('equipmentList.some(t=>t.assetId==='+JSON.stringify(created.asset_id)+')');
  assert.equal(await evaluate('equipmentList.find(t=>t.assetId==='+JSON.stringify(created.asset_id)+').availability'),'Available');
  await evaluate('editTool("TOOL-002")');assert.equal(await evaluate('document.querySelector("#equipmentInitialLocation").hidden'),true);
  await fill('#identifyingDetails','Metadata only');await submit('#equipmentForm');await wait('document.querySelector("#equipmentModal").style.display==="none"');
  const existing=(await f.db.query("select * from equipment where asset_id='TOOL-002'")).rows[0];
  assert.equal(existing.site_id,f.sites.casa);assert.equal(existing.current_holder_id,f.actors.sky.id);assert.equal(existing.quantity,1);
  // Give every field role genuine fixture assignments and custody for presentation coverage.
  const pauSite=randomUUID(),archSite=randomUUID();
  for(const [id,name,actor] of [[pauSite,'Engineer B fixture site',f.actors.pau],[archSite,'Architect fixture site',f.actors.architect]])await f.db.query('insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,$2,$3,$4,$5)',[id,name,'Isolated local project',actor.name,actor.id]);
  await f.db.query("update equipment set site_id=$1,current_holder_id=$2,quantity=6 where asset_id='TOOL-003'",[pauSite,f.actors.pau.id]);
  await f.db.query("update equipment set site_id=$1,current_holder_id=$2,quantity=8 where asset_id='TOOL-004'",[archSite,f.actors.architect.id]);
  for(const [key,held,ownSite] of [['sky','TOOL-002','Casa Buena'],['pau','TOOL-003','Engineer B fixture site'],['architect','TOOL-004','Architect fixture site']]){
    await account(key);await viewport(1440);
    await go('dashboard');await wait('document.querySelector(".dashboard-scope")');await noQuantity('#screen-dashboard');
    await go('request');await wait('document.querySelector("[name=purpose]")');await noQuantity('#screen-request');
    assert.ok((await text('#screen-request')).includes(created.asset_id));assert.ok((await text('#screen-request')).includes('Main Office'));
    const options=await evaluate('[...document.querySelector("[name=destination]").options].map(o=>o.textContent)');assert.ok(options.includes(ownSite));
    assert.ok(!options.includes(key==='sky'?'Engineer B fixture site':'Casa Buena'));
    await click('[name=toolIds][value="'+created.asset_id+'"]');assert.match(await text('[data-selected-count]'),/1 selected/);
    if(key==='sky')for(const [width,dark] of [[1440,false],[1440,true],[393,false],[393,true]]){
      await viewport(width);await evaluate('applyTheme('+dark+',false)');await noQuantity('#screen-request');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      await shotSaved('engineer-assets-'+width+'-'+(dark?'night':'light'));
    }
    await go('masterlist');await wait('document.querySelector("#overview-results")?.textContent.includes('+JSON.stringify(held)+')');await noQuantity('#screen-masterlist');
    assert.ok((await text('#overview-results')).includes(ownSite));await click('[data-tool="'+held+'"]');await wait('document.querySelector(".overview-dialog[open]")');await noQuantity('.overview-dialog');await click('.overview-dialog [data-close]');
    await go('transfer');await wait('document.querySelector("[data-form=create]")');await noQuantity('#screen-transfer');assert.ok((await text('#screen-transfer')).includes(held));
    await go('return');await wait('document.querySelector("[data-return-submit]") && !document.querySelector("[data-return-submit]").disabled');await noQuantity('#screen-return');assert.ok((await text('#screen-return')).includes(held));
    await go('sites');await wait('document.querySelector(".site-card")');await noQuantity('#screen-sites');await click('.site-card');await wait('document.querySelector("#screen-site-detail.active")');await noQuantity('#screen-site-detail');
    assert.ok((await text('#site-detail-content')).includes(held));assert.ok((await text('#site-detail-content')).includes(ownSite));
    await click('[data-action=view-tool]');await wait('document.querySelector("#sites-dialog[open]")');await noQuantity('#sites-dialog');assert.ok((await text('#sites-dialog')).includes(held));await click('[data-action=close-dialog]');
    await click('[data-action=review-tools]');await wait('document.querySelector("#sites-review-results tbody tr")');await noQuantity('#sites-dialog');await click('[data-action=close-dialog]');
  }
  assert.equal((await f.db.query("select quantity from equipment where asset_id='TOOL-003'")).rows[0].quantity,6);
  assert.equal((await f.db.query("select quantity from equipment where asset_id='TOOL-004'")).rows[0].quantity,8);
  await account('admin');await go('sites');await wait('document.querySelector(".site-card")');await click('.site-card');await wait('document.querySelector("#screen-site-detail.active")');assert.match(await text('#site-detail-content'),/Quantity/i);
  const fieldReads=calls.filter(c=>['sky','pau','architect'].includes(c.actor));assert.ok(!fieldReads.some(c=>c.table==='equipment'),'Field users retain scoped RPC access');
  console.log('PASS New Office stock; verified one-asset correction; preserved project custody; Admin Bulk quantities; Engineer A/B/Architect asset IDs and locations across dashboard, requests, tracking, details, transfers, returns and projects; desktop/mobile Light/Night');
};
