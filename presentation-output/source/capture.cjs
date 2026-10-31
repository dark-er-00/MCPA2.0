/* Presentation-only runner. Uses the unmodified UI and repository test transport.
   All writes are confined to a disposable local PostgreSQL fixture. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),out=path.resolve(__dirname,'..');
process.env.MCPA_CHROME_NO_SANDBOX='1';
process.argv.push('--feature-completion','--project-construction');
let code=fs.readFileSync(path.join(root,'tests/auth.browser.cjs'),'utf8');
code=code.slice(0,code.indexOf(" if(process.argv.includes('--header-notifications')){"));
code=code.replace(/require\('\.\/([^']+)'\)/g,(_,p)=>'require('+JSON.stringify(path.join(root,'tests',p))+')');
code=code.replace("path.resolve(__dirname,'..')",JSON.stringify(root));
code=code.replace(" await fixture.db.query(\"insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'MCPA Development Transfer Test','Local fixture only','Engr Sky',$2)\",[require('node:crypto').randomUUID(),fixture.actors.sky.id]);"," await preparePresentationFixture(fixture);");
code=code.replace("10000);pending.set","30000);pending.set");
code=code.replace("new URL(req.url,'http://localhost').pathname","decodeURIComponent(new URL(req.url,'http://localhost').pathname)");
code+=String.raw`
 const manifest=[],transaction=[];
 await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1.5,mobile:false});
 const capture=async(name,caption,selector)=>{
   await pause(650);
   let clip;
   await evaluate('window.scrollTo(0,0)');await pause(120);
   if(selector)clip=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)throw Error("Missing capture target");const r=e.getBoundingClientRect();const x=Math.max(0,r.x-5),y=Math.max(0,r.y-5);return {x:x+scrollX,y:y+scrollY,width:Math.min(innerWidth-x,r.width+10),height:Math.min(innerHeight-y,r.height+10),scale:1};})()');
   const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});
   fs.writeFileSync(path.join(OUTPUT,'evidence',name+'.png'),Buffer.from(data,'base64'));
   manifest.push({file:name+'.png',caption,role:await evaluate('MCPAAuth.profile?.role'),route:await evaluate('location.hash'),sha256:require('node:crypto').createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')});
   console.log('CAPTURE '+name);
 };
 const state=async(stage)=>{
   const snap=await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
   const tool=snap.tools.find(t=>t.id==='DEMO-EQ-001');
   const record={stage,request:snap.requests.find(r=>r.toolIds.includes('DEMO-EQ-001')),transfer:snap.transfers.find(r=>r.toolIds.includes('DEMO-EQ-001')),tool};
   transaction.push(record);return record;
 };
 await command('Page.navigate',{url:base+'/index.html'});await login('admin');await wait('document.querySelector(".admin-review")');
 await capture('dashboard','Admin dashboard; values are disposable local fixtures.','#screen-dashboard');
 await go('masterlist');await wait('document.querySelector("#equipmentTableBody tr")');await capture('equipment-list','Equipment inventory in the actual Admin interface.','#screen-masterlist');
 await logout();await login('sky');await wait('document.querySelector("#dashboard-search")');
 await go('masterlist');await wait('document.querySelector("[data-tool]")');await click('[data-tool]');await capture('equipment-detail','Equipment details and recorded custody in the Engineer interface.','dialog[open]');await click('[data-close]');
 await go('request');await wait('document.querySelector("[name=toolIds][value=DEMO-EQ-001]")');
 await click('[name=toolIds][value="DEMO-EQ-001"]');await fill('[name=destination]','Demonstration Project A');await fill('[name=purpose]','Concrete preparation — isolated presentation demonstration.');
 await capture('request-form','Actual request form before submission.','#screen-request');
 await submit('[data-form=create]');await wait('MovementStore.getState().requests.some(r=>r.toolIds.includes("DEMO-EQ-001"))');
 let before=await state('request_submitted');const requestId=before.request.id;
 assert.equal(before.request.status,'pending');assert.equal(before.tool.holderId,null);
 await logout();await login('admin');await wait('document.querySelector(".admin-review")');
 await go('request');await wait('document.querySelector("[data-list]")');
 await evaluate('MovementUI.openRecord("request",'+JSON.stringify(requestId)+')');await wait('document.querySelector("[data-detail][open]")');
 await capture('approval','Admin review of the same submitted request.','[data-detail]');
 await click('[data-action=approve]');await wait('document.querySelector("[data-action=release]")');
 before=await state('approved');assert.equal(before.request.status,'approved');assert.equal(before.tool.holderId,null);
 await capture('release','Approved reservation before release; custody is unchanged.','[data-detail]');
 await click('[data-action=release]');await wait('MovementStore.getState().transfers.some(t=>t.requestId==='+JSON.stringify(requestId)+')');
 before=await state('released');assert.equal(before.request.status,'released');assert.equal(before.transfer.status,'pending');assert.equal(before.tool.holderId,null);
 const transfer=before.transfer;
 await go('transfer');await wait('document.querySelector("[data-list]")');await evaluate('MovementUI.openTransfer('+JSON.stringify(transfer.id)+')');await wait('document.querySelector("[data-detail][open]")');
 await capture('handover-pending','Released transfer remains pending for the named recipient.','[data-detail]');
 await logout();await login('sky');await wait('document.querySelector("#dashboard-search")');await go('transfer');await wait('document.querySelector("[data-form=lookup]")');
 await click('[data-transfer-tab=receive]');await fill('[name=code]',transfer.code);await submit('[data-form=lookup]');await wait('document.querySelector("[data-form=receive]")');
 await fill('[data-condition]','good');await click('[data-tested]');
 await capture('inspection','Named receiver records Good and confirms physical testing.','[data-detail]');
 await evaluate('document.querySelector("[data-detail]").scrollTop=document.querySelector("[data-detail]").scrollHeight');await capture('inspection-confirm','Lower receipt form with physical-test confirmation and the Confirm receipt action.','[data-detail]');
 await submit('[data-form=receive]');await wait('document.querySelector("[data-notice]").textContent.includes("Receipt confirmed")');
 before=await state('received');assert.equal(before.request.status,'received');assert.equal(before.transfer.status,'received');assert.equal(before.tool.holderId,fixture.actors.sky.id);assert.equal(before.tool.siteId,fixture.sites.casa);
 await go('masterlist');await wait('document.querySelector("[data-tool=DEMO-EQ-001]")');await capture('received-custody','After the demonstrated receipt, personal equipment includes DEMO-EQ-001.','#screen-masterlist');
 await click('[data-tool="DEMO-EQ-001"]');await capture('received-detail','The same equipment record after receipt, with the new holder and destination.','dialog[open]');await click('[data-close]');
 await go('transfer');await click('[data-transfer-tab=history]');await capture('movement-history','Saved history of the demonstrated transfer.','#screen-transfer');
 await go('return');await wait('document.querySelector("[data-form=create]")');await click('[name=toolIds][value="DEMO-EQ-001"]');await fill('[data-condition]','good');await capture('return-form','Supported Office return form; no return is submitted.','#screen-return');
 await logout();await login('admin');await wait('document.querySelector(".admin-review")');
 await go('sites');await wait('document.querySelector(".site-card")');await capture('projects','Project records and linked equipment.','#screen-sites');
 await click('[data-action="open-site"]');await wait('document.querySelector("#screen-site-detail.active")');await capture('project-detail','Project equipment, accountable Engineer and construction tracking.','#screen-site-detail');
 await click('[data-action="edit-site"]');await capture('project-editor','Actual project editor and construction tracking, local upgraded fixture.','#sites-dialog');await click('[data-action="close-dialog"]');
 await go('consumables');await wait('document.querySelector("#consumables-rows [data-item-id]")');await capture('consumables','SKU specification, stock, threshold and stock actions; all quantities are synthetic.','#screen-consumables');
 await go('purchase');await wait('document.querySelector("[data-purchase-new]")&&!document.querySelector("[data-purchase-new]").disabled');await capture('purchases','Actual purchasing ledger with a synthetic training record.','#screen-purchase');
 await go('reports');await wait('document.querySelector("#report-results table")');await capture('reports','Actual current-inventory report.','#screen-reports');
 await go('activity');await wait('document.querySelector("#movement-activity-search")');await capture('activity','Actual activity log, including the executed request, release and receipt.','#screen-activity');
 assert.deepEqual(errors,[],'No uncaught browser errors');
 fs.writeFileSync(path.join(OUTPUT,'evidence','screenshot-manifest.json'),JSON.stringify({date:'2026-10-24',environment:'Unmodified repository UI on local HTTP. Disposable PGlite database; Auth/Storage transport modeled. External HTTPS blocked. No production access.',screenshots:manifest,uncaughtErrors:errors.length},null,2));
 fs.writeFileSync(path.join(OUTPUT,'evidence','demonstration-transaction.json'),JSON.stringify({environment:'Executed local synthetic transaction, not a production transaction',requestId,transferId:transfer.id,stages:transaction},null,2));
 console.log('PASS '+manifest.length+' genuine captures and one executed request/approval/release/tested-receipt sequence.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{socket?.close();chrome?.kill();server.closeAllConnections();server.close();await fixture?.close();});
`;
async function preparePresentationFixture(f){
 const {randomUUID}=require('node:crypto'),{db,actors,sites}=f;
 for(const [key,name] of Object.entries({admin:'Demo Admin',sky:'Demo Engineer',pau:'Demo Receiver',architect:'Demo Architect',secretary:'Demo Secretary',handler:'Demo Tool Handler'})){
   actors[key].name=name;await db.query('update profiles set name=$1 where id=$2',[name,actors[key].id]);
 }
 await db.query("update sites set name='Demonstration Project A',location='Local test environment',assigned_engineer='Demo Engineer' where id=$1",[sites.casa]);
 await db.query("update sites set name='Demonstration Project B',location='Local test environment',assigned_engineer='Demo Receiver',assigned_engineer_id=$1 where id=$2",[actors.pau.id,sites.main]);
 await db.query("update equipment set name='Training rotary drill' where asset_id='TOOL-002'");
 await db.query("insert into equipment(id,asset_id,name,category,brand,model,serial_number,condition,tracking_type,unit,quantity,status,site_id) values($1,'DEMO-EQ-001','Training concrete vibrator','Power Tools','Training brand','Demonstration model','SYNTHETIC-001','Good','Individual','Pieces',1,'AVAILABLE',$2)",[randomUUID(),sites.office]);
 const areas=require(path.join(root,'tests/project-construction-fixture.cjs')).areas();
 const version=(await db.query('select project_version from sites where id=$1',[sites.casa])).rows[0].project_version;
 await f.rpc(actors.admin,'mcpa_save_project',{p_id:sites.casa,p_version:version,p_operation_id:randomUUID(),p_patch:{project_stage:'Construction Phase',current_work_area:'Structural',construction_work_areas:areas},p_reason:'Local presentation fixture only.'});
 const c=require(path.join(root,'tests/consumables-upgrade-fixture.cjs'));await c.upgrade(f);
 for(const [name,spec,category,opening] of [['Cutting Disc','4 inch','Cutting',30],['Drill Bit','6 mm','Drilling',8],['Welding Rod E6013','2.5 mm','Welding',15]]){
   await f.rpc(actors.admin,'consumables_save_item',{p_id:randomUUID(),p_version:null,p_name:name,p_unit:'pcs',p_minimum:20,p_opening:opening,p_category:category,p_specification:spec,p_item_code:null});
 }
 await f.rpc(actors.admin,'mcpa_save_purchase',{p_id:randomUUID(),p_version:null,p_operation_id:randomUUID(),p_record:{supplier:'Training Supplier',reference:'DEMO-INVOICE-001',purchase_date:'2026-10-24',items:[{description:'Training cutting discs',quantity:'10',unit_price:'25.00'}],notes:'Synthetic purchase; does not change stock.'}});
}
code='const preparePresentationFixture='+preparePresentationFixture.toString()+';\nconst OUTPUT='+JSON.stringify(out)+';\n'+code;
const wrapped=require('node:module').wrap(code);
vm.runInThisContext(wrapped,{filename:__filename})(exports,require,module,__filename,__dirname);
