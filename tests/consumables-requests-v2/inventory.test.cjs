const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../js/upgrades/consumables-requests/core.js');
function snapshot(){return {profile:{id:'engineer',role:'engineer'},catalog:[{id:'cement',name:'Cement',category:'Masonry',unit:'bags',minimum_stock:2}],requests:[{
 id:'request',request_number:1,requester_id:'engineer',status:'partial',site_id:'casa',site_name:'Casa',updated_at:'2026-10-26T09:00:00Z',
 items:[{id:'line',consumable_id:'cement',item_name:'Cement',category:'Masonry',unit:'bags',issued_quantity:999,confirmed_consumed_quantity:null}],
 issues:[{id:'issue-1',stock_movement_id:'movement-1',item_id:'line',quantity:0.1,issued_at:'2026-10-26T07:00:00Z'},{id:'issue-2',stock_movement_id:'movement-2',item_id:'line',quantity:0.2,issued_at:'2026-10-26T08:00:00Z'}]
}]};}
test('no confirmed issues means an empty inventory; pending/rejected/approved cannot supply stock',()=>{
 const s=snapshot();s.requests=[];assert.deepEqual(C.inventory(s),[]);
 for(const status of ['pending','rejected','approved']){const s=snapshot();s.requests[0].status=status;assert.deepEqual(C.inventory(s),[]);}
 const empty=snapshot();empty.requests[0].issues=[];assert.deepEqual(C.inventory(empty),[]);
});
test('immutable receipt movement IDs are counted once with exact three-place quantities',()=>{
 const s=snapshot();s.requests[0].issues.push({...s.requests[0].issues[0],id:'duplicate-response'});s.requests.push(s.requests[0]);
 const [row]=C.inventory(s);assert.equal(row.received,0.3);assert.equal(row.balance,0.3);assert.equal(row.transactions.length,2);
 assert.equal(row.used,0);assert.equal(row.usage_recorded,false);assert.equal(row.updated_at,'2026-10-26T08:00:00Z');
 assert.equal(row.status,'Low Stock');assert.equal(row.transactions[0].id,'issue-2');assert.equal(s.requests[0].items[0].issued_quantity,999,'Never trust cached requested/issued totals over receipt ledger');
});
test('recorded consumption is counted once per request line, with depletion and discrepancy handling',()=>{
 const s=snapshot();s.requests[0].items[0].confirmed_consumed_quantity=0.1;
 const row=C.inventory(s)[0];assert.equal(row.used,0.1);assert.equal(row.balance,0.2);assert.equal(row.usage_recorded,true);assert.equal(row.updated_at,s.requests[0].updated_at);
 s.requests[0].items[0].confirmed_consumed_quantity=0.3;assert.equal(C.inventory(s)[0].status,'Depleted');
 s.requests[0].items[0].confirmed_consumed_quantity=0.4;
 const invalid=C.inventory(s)[0];assert.equal(invalid.balance,0);assert.equal(invalid.status,'Review required');assert.equal(invalid.discrepancy,true);
});
test('actor, SKU, unit and project boundaries stay separate even when item names match',()=>{
 const s=snapshot();
 for(const [id,site,unit,sku,actor] of [['r2','main','bags','cement','engineer'],['r3','casa','kg','cement','engineer'],['r4','casa','bags','other-cement','engineer'],['r5','casa','bags','cement','someone-else']]){
  s.requests.push({...s.requests[0],id,requester_id:actor,site_id:site,site_name:site,items:[{...s.requests[0].items[0],id,unit,consumable_id:sku}],issues:[{id,stock_movement_id:id,item_id:id,quantity:3,issued_at:'2026-10-26T08:00:00Z'}]});
 }
 const rows=C.inventory(s);assert.equal(rows.length,4);assert.equal(rows.find(r=>r.site_id==='casa'&&r.unit==='bags'&&r.consumable_id==='cement').received,0.3);
 assert.ok(rows.some(r=>r.status==='Available'));assert.throws(()=>C.inventory({...s,profile:{id:'engineer',role:'admin'}}));assert.throws(()=>C.inventory({...s,profile:null}));
});
test('filter search covers name/category and combines category/site/status with no mutations',()=>{
 const rows=C.inventory(snapshot());
 assert.equal(C.filterInventory(rows,{search:' MASONRY ',category:'Masonry',site:'casa',status:'Low Stock'}).length,1);
 assert.equal(C.filterInventory(rows,{search:'cement'}).length,1);assert.equal(C.filterInventory(rows,{site:'main'}).length,0);
 assert.equal(C.filterInventory(rows,{status:'Depleted'}).length,0);assert.equal(rows.length,1);
});
test('archived SKUs remain in personal issue history using their saved classification',()=>{
 const s=snapshot();s.catalog=[];const row=C.inventory(s)[0];assert.equal(row.item_name,'Cement');assert.equal(row.category,'Masonry');assert.equal(row.balance,0.3);
});
test('invalid ledger quantities/dates fail instead of becoming usable stock',()=>{
 for(const quantity of [-1,Infinity,NaN]){const s=snapshot();s.requests[0].issues[0].quantity=quantity;assert.throws(()=>C.inventory(s),/issuance record/);}
 const s=snapshot();s.requests[0].issues[0].issued_at='broken';assert.throws(()=>C.inventory(s),/issuance record/);
 s.requests[0].issues=[];assert.deepEqual(C.inventory(s),[]);
});
