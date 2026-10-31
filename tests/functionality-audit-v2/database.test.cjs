const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
const {fixture,upgrade}=require('./fixture.cjs'),C=require('../../js/upgrades/consumables-requests/core.js');
const rpc=async(f,actor,name,args={})=>(await f.query(actor,`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) value`,Object.values(args))).rows[0].value;
const profile=(f,actor)=>rpc(f,actor,'mcpa_my_profile');
const seed=(f,unit='pcs')=>f.call(f.actors.admin,'consumables_save_item',{p_id:id(),p_version:null,p_name:'Audit '+unit,p_unit:unit,p_minimum:2,p_opening:200,p_category:'Cutting',p_specification:'',p_item_code:null});
const submit=(f,item,quantity)=>f.call(f.actors.sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'',p_items:[{consumable_id:item.id,unit:item.unit,quantity}]});
test('all active roles edit only their own permitted profile fields; handles are case-insensitively unique and persist',async t=>{
 const f=await fixture(t),a=f.actors;
 const fs=require('node:fs'),path=require('node:path');
 await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/functionality-audit-preflight.sql'),'utf8'));
 const checks=await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/functionality-audit-verify.sql'),'utf8'));
 const verified=checks[0].rows[0].functionality_audit_verification;
 assert.equal(verified.quantity_guards,4);for(const [key,value]of Object.entries(verified))if(key!=='quantity_guards')assert.equal(value,true,key);
 const protectedRows=(await f.db.query('select id,auth_user_id,role,account_status from profiles order by id')).rows;
 for(const key of ['admin','sky','architect','secretary','handler']){
  const p=await rpc(f,a[key],'mcpa_update_my_profile',{p_name:'Updated '+key,p_username:'Test_'+key});
  assert.equal(p.id,a[key].id);assert.equal(p.username,'test_'+key);assert.equal(p.email,key+'@example.test');assert.equal((await profile(f,a[key])).name,'Updated '+key);
 }
 assert.deepEqual((await f.db.query('select id,auth_user_id,role,account_status from profiles order by id')).rows,protectedRows);
 await assert.rejects(rpc(f,a.pau,'mcpa_update_my_profile',{p_name:'Pau',p_username:'TEST_SKY'}),e=>e.code==='23505');
 for(const handle of ['ab','bad space','.start','end-','a'.repeat(31)])await assert.rejects(rpc(f,a.sky,'mcpa_update_my_profile',{p_name:'Engineer',p_username:handle}),e=>e.code==='22023');
 await assert.rejects(rpc(f,a.sky,'mcpa_update_my_profile',{p_name:' ',p_username:'valid'}),e=>e.code==='22023');
 await assert.rejects(rpc(f,a.sky,'mcpa_update_my_profile',{p_name:'Engineer',p_username:'valid',p_role:'admin'}));
 await assert.rejects(f.query(a.sky,'update profiles set username=$1 where id=$2',['stolen',a.pau.id]));
 for(const actor of [null,a.inactive])await assert.rejects(rpc(f,actor,'mcpa_update_my_profile',{p_name:'No access',p_username:'no_access'}));
 assert.equal((await f.db.query("select count(*) n from mcpa_account_audit where event='username_changed'")).rows[0].n,5);
});
test('count-unit requests, approvals, receipts and stock usage reject fractions at the real RPC boundary; measured quantities survive',async t=>{
 const f=await fixture(t),a=f.actors,item=await seed(f),measured=await seed(f,'kg');
 const units=require('../../js/consumables-catalog.js'),unitCases=['pcs','PCS.','pieces','bags','boxes','rolls','sets','lengths','pair','kg','liters','m','custom measurement'];
 for(const row of (await f.db.query('select value unit,mcpa_auth_private.consumable_whole_unit(value) whole from jsonb_array_elements_text($1::jsonb)',[JSON.stringify(unitCases)])).rows)assert.equal(row.whole,units.isWholeUnit(row.unit),row.unit);
 for(const value of [0,-2,0.002,1.5,'abc','',null])await assert.rejects(submit(f,item,value));
 for(const quantity of [1,5,100])assert.equal((await submit(f,item,quantity)).items[0].requested_quantity,quantity);
 const r=await submit(f,item,5);
 const review=quantity=>f.call(a.admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:'approve',p_note:'',p_items:[{item_id:r.items[0].id,quantity}]});
 await assert.rejects(review(1.5));await review(5);
 const issue=quantity=>f.call(a.admin,'mcpa_wa_issue_consumables',{p_operation_id:id(),p_request_id:r.id,p_items:[{item_id:r.items[0].id,quantity}],p_issued_at:null});
 const before=(await f.db.query('select current_stock from consumables where id=$1',[item.id])).rows;
 await assert.rejects(issue(0.002));await assert.rejects(issue(6));assert.deepEqual((await f.db.query('select current_stock from consumables where id=$1',[item.id])).rows,before);
 await issue(2);assert.equal(C.inventory(await f.call(a.sky,'mcpa_wa_consumables_snapshot'))[0].balance,2);
 const mr=await submit(f,measured,1.125);assert.equal(mr.items[0].requested_quantity,1.125);
 const purchase={p_id:id(),p_item_id:item.id,p_quantity:1.5,p_requester:'Admin',p_purpose:'Restock',p_needed_by:null};
 await assert.rejects(f.call(a.admin,'consumables_create_request',purchase));
 const pr=await f.call(a.admin,'consumables_create_request',{...purchase,p_quantity:5});
 await assert.rejects(f.call(a.admin,'consumables_receive_request',{p_operation_id:id(),p_request_id:pr.id,p_version:pr.version,p_quantity:0.002,p_note:'Invalid delivery'}));
 await f.call(a.admin,'consumables_receive_request',{p_operation_id:id(),p_request_id:pr.id,p_version:pr.version,p_quantity:1,p_note:'Whole delivery'});
 let stock=(await f.db.query('select * from consumables where id=$1',[item.id])).rows[0];
 await assert.rejects(f.call(a.admin,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:item.id,p_version:stock.version,p_kind:'usage',p_quantity:1.5,p_note:'Invalid usage'}));
 stock=(await f.db.query('select * from consumables where id=$1',[measured.id])).rows[0];
 await f.call(a.admin,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:measured.id,p_version:stock.version,p_kind:'usage',p_quantity:0.125,p_note:'Measured usage'});
});
test('migrations preserve historical fractional records; explicit whole physical-count correction can resolve legacy residue',async t=>{
 const f=await require('../integration-quantity-custody-v2/fixture.cjs').fixture(t),a=f.actors,item=await seed(f);
 await f.db.query('update consumables set minimum_stock=1.5 where id=$1',[item.id]);
 const r=await submit(f,item,1.5),before=(await f.db.query('select * from mcpa_wa_material_items')).rows;
 const stock=(await f.db.query('select * from consumables where id=$1',[item.id])).rows[0];
 await f.call(a.admin,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:item.id,p_version:stock.version,p_kind:'usage',p_quantity:0.002,p_note:'Historical fractional transaction'});
 const history=(await f.db.query('select * from consumable_stock_movements order by id')).rows;
 const balances=(await f.db.query('select * from consumables order by id')).rows;
 await upgrade(f);assert.deepEqual((await f.db.query('select * from mcpa_wa_material_items')).rows,before);
 assert.deepEqual((await f.db.query('select * from consumable_stock_movements order by id')).rows,history);assert.deepEqual((await f.db.query('select * from consumables order by id')).rows,balances);
 await f.call(a.admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:'approve',p_note:'Whole quantity only',p_items:[{item_id:r.items[0].id,quantity:1}]});
 await f.call(a.admin,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:item.id,p_version:balances.find(x=>x.id===item.id).version,p_kind:'correction',p_quantity:199,p_note:'Explicit verified physical count'});
 assert.equal(Number((await f.db.query('select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock),199);
 const latest=(await f.db.query('select * from consumables where id=$1',[item.id])).rows[0];
 await f.call(a.admin,'consumables_save_item',{p_id:item.id,p_version:latest.version,p_name:'Renamed legacy item',p_unit:'pcs',p_minimum:1.5,p_opening:0,p_category:'Cutting',p_specification:'',p_item_code:item.item_code});
 assert.equal(Number((await f.db.query('select minimum_stock from consumables where id=$1',[item.id])).rows[0].minimum_stock),1.5,'Metadata edits preserve an unchanged historical minimum');
});
test('dropdown sources preserve assigned-site scope and actual categories; retirement keeps distinct Sold/Disposed history and denies issuance',async t=>{
 const f=await fixture(t),a=f.actors,item=await seed(f);
 const s=await f.call(a.sky,'mcpa_wa_consumables_snapshot');assert.ok(s.sites.some(x=>x.id===f.sites.casa));assert.ok(!s.sites.some(x=>x.id===f.sites.main));assert.equal(s.catalog.find(x=>x.id===item.id).category,'Cutting');
 await assert.rejects(f.call(a.sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.main,p_purpose:'',p_items:[{consumable_id:item.id,quantity:1,unit:item.unit}]}));
 const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Audit retired tools',category:'Hand Tools',condition:'Good',tracking_type:'Individual',quantity:2}]});
 for(const [index,disposition]of ['sold','disposed'].entries()){
  const tag=imported.assets[index].asset_id,r=await f.action(a.admin,'proposeRetirement',{assetId:tag,disposition,reason:'Verified retirement',effectiveDate:'2026-10-01'});
  await f.action(a.admin2,'approveRetirement',{id:r.id});assert.equal((await f.tool(tag)).status,'DISPOSED');
  const movement=await f.rpc(a.admin,'mcpa_movement_snapshot');assert.equal(movement.tools.find(x=>x.id===tag).retirementDisposition,disposition);
  assert.ok((await f.snapshot(a.admin)).retirements.some(x=>x.id===r.id));
  await assert.rejects(f.rpc(a.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:[tag],destination:'Casa Buena'},p_operation_id:id()}));
 }
 assert.equal((await f.query(a.admin,'select * from equipment where name=$1',['Audit retired tools'])).rows.length,2);
});
