// Local PostgreSQL only. Exercises the existing RPC, RLS and immutable ledger.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,randomUUID:id}=require('../integration-quantity-custody-v2/fixture.cjs');
const {inventory}=require('../../js/upgrades/consumables-requests/core.js');
const seed=f=>f.call(f.actors.admin,'consumables_save_item',{p_id:id(),p_version:null,p_name:'Personal cement',p_unit:'bags',p_minimum:2,p_opening:30,p_category:'Masonry & Carpentry',p_specification:'40 kg',p_item_code:null});
const submit=(f,item,actor=f.actors.sky,site=f.sites.casa)=>f.call(actor,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:site,p_purpose:'',p_items:[{consumable_id:item.id,quantity:5,unit:item.unit}]});
const review=(f,r,decision='approve')=>f.call(f.actors.admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:decision,p_items:decision==='reject'?[]:[{item_id:r.items[0].id,quantity:5}],p_note:decision==='reject'?'Not needed':''});
const issue=(f,r,qty,op=id())=>f.call(f.actors.admin,'mcpa_wa_issue_consumables',{p_operation_id:op,p_request_id:r.id,p_items:[{item_id:r.items[0].id,quantity:qty}],p_issued_at:null});
const read=(f,actor=f.actors.sky)=>f.call(actor,'mcpa_wa_consumables_snapshot');
test('real snapshot: only completed issues increase personal inventory; retries, partial issues, refresh and unrelated stock adjustments',async t=>{
 const f=await fixture(t),item=await seed(f);
 assert.deepEqual(inventory(await read(f)),[]);
 const rejected=await submit(f,item);await review(f,rejected,'reject');assert.deepEqual(inventory(await read(f)),[]);
 const request=await submit(f,item);assert.deepEqual(inventory(await read(f)),[]);
 await review(f,request);assert.deepEqual(inventory(await read(f)),[]);
 const op=id();await issue(f,request,0.1,op);await issue(f,request,0.1,op);await issue(f,request,0.2);
 let [row]=inventory(await read(f));assert.equal(row.received,0.3);assert.equal(row.balance,0.3);assert.equal(row.transactions.length,2);assert.equal(row.usage_recorded,false);
 await issue(f,request,4.7);[row]=inventory(await read(f));assert.equal(row.balance,5);assert.equal(row.status,'Available');
 assert.deepEqual(inventory(await read(f)),inventory(await read(f)),'Reload uses database records');
 const stock=(await f.db.query('select * from consumables where id=$1',[item.id])).rows[0];
 await f.call(f.actors.admin,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:item.id,p_version:stock.version,p_kind:'usage',p_quantity:1,p_note:'Office usage, not engineer consumption'});
 assert.equal(inventory(await read(f))[0].balance,5,'Do not attribute unrelated warehouse usage to an engineer');
 await assert.rejects(f.call(f.actors.sky,'consumables_adjust_stock',{p_operation_id:id(),p_item_id:item.id,p_version:stock.version,p_kind:'usage',p_quantity:1,p_note:'Forbidden'}));
 await assert.rejects(f.db.exec('delete from mcpa_wa_material_issues'),/immutable/);
});
test('real RPC and nested RLS isolate engineers, sites, roles and archived inventory without adding grants',async t=>{
 const f=await fixture(t),item=await seed(f),a=f.actors;
 const r=await submit(f,item);await review(f,r);await issue(f,r,5);
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.pau.id,f.sites.main]);
 const other=await submit(f,item,a.pau,f.sites.main);await review(f,other);await issue(f,other,2);
 assert.equal(inventory(await read(f,a.sky))[0].balance,5);assert.equal(inventory(await read(f,a.pau))[0].balance,2);
 const privateRows=await f.query(a.pau,'select item_id from mcpa_wa_material_issues');assert.deepEqual(privateRows.rows.map(x=>x.item_id),[other.items[0].id]);
 const requests=await read(f,a.sky);assert.ok(requests.requests.every(x=>x.requester_id===a.sky.id));assert.ok(!JSON.stringify(requests).includes(other.id));
 await assert.rejects(submit(f,item,a.sky,f.sites.main),/assigned/);
 for(const actor of [null,a.handler,a.secretary,a.inactive])await assert.rejects(read(f,actor));
 // The established ownership rule retains own history after site reassignment.
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.sky.id,f.sites.main]);
 const own=await submit(f,item);await review(f,own);await issue(f,own,1);
 const site2=await submit(f,item,a.sky,f.sites.main);await review(f,site2);await issue(f,site2,3);
 const rows=inventory(await read(f));assert.equal(rows.length,2);assert.equal(rows.find(x=>x.site_id===f.sites.casa).balance,6);assert.equal(rows.find(x=>x.site_id===f.sites.main).balance,3);
 // No pending request remains before archive; partial requests must be completed.
 await issue(f,own,4);await issue(f,site2,2);await issue(f,other,3);
 await f.db.query("update consumables set archived_at=now(),archive_reason='Local test' where id=$1",[item.id]);
 assert.equal((await read(f)).catalog.some(x=>x.id===item.id),false);assert.equal(inventory(await read(f)).length,2);
 await f.db.query("update profiles set account_status='inactive' where id=$1",[a.sky.id]);
 await assert.rejects(read(f,a.sky));assert.equal((await f.query(a.sky,'select * from mcpa_wa_material_issues')).rows.length,0);
});
