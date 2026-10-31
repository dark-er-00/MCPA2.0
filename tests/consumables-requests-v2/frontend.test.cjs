const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../../js/upgrades/consumables-requests/core.js');
const A=require('../../js/upgrades/consumables-requests/analytics.js');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const catalog=[{id:id(1),name:'Disc',unit:'pieces',current_stock:1,minimum_stock:2},{id:id(2),name:'Disc',unit:'box',current_stock:20,minimum_stock:5},{id:id(3),name:'Old stock',unit:'kg',current_stock:0,minimum_stock:1,archived_at:'2026-01-01'}];
const sites=[{id:id(9),name:'Project'}];
const line=(n,quantity,extra={})=>({id:id(n+100),consumable_id:id(n),item_name:'Disc',item_code:'DC-'+n,specification:n===2?'Box of discs':'',unit:n===2?'box':'pieces',requested_quantity:quantity,approved_quantity:quantity,issued_quantity:0,confirmed_consumed_quantity:null,...extra});
function fixture(){return{catalog,requests:[
 {id:id(20),request_number:1,requester_id:id(30),requester_name:'Engineer',site_id:id(9),site_name:'Project',created_at:'2026-10-24T15:59:59Z',items:[line(1,10),line(2,2)],issues:[{id:id(40),stock_movement_id:id(50),item_id:id(101),quantity:0.1,issued_at:'2026-10-24T16:00:00Z',issued_by_name:'Admin'},{id:id(41),stock_movement_id:id(51),item_id:id(101),quantity:0.2,issued_at:'2026-10-25T15:59:59.999Z',issued_by_name:'Admin'},{id:id(42),stock_movement_id:id(52),item_id:id(102),quantity:2,issued_at:'2026-10-25T16:00:00Z',issued_by_name:'Admin'}]},
 {id:id(21),request_number:2,requester_id:id(31),requester_name:'Architect',site_id:id(10),site_name:'Other project',created_at:'2026-10-24T16:00:00Z',items:[line(1,5)],issues:[{id:id(43),stock_movement_id:id(53),item_id:id(101),quantity:3,issued_at:'2026-10-25T05:00:00Z',issued_by_name:'Admin'}]}
]};}
test('quantities reject overflow, invalid decimals, exponent notation and non-finite input',()=>{
 for(const value of ['',null,undefined,NaN,Infinity,-1,0,'0.0001','1e2','1,000','1000000000','-0.1'])assert.throws(()=>C.quantity(value));
 assert.equal(C.quantity('999999999.999'),999999999.999);assert.equal(C.quantity('0.001'),0.001);assert.equal(C.quantity(0,true),0);
});
test('multi-item requests preserve SKU/unit, validate site and require distinct active items',()=>{
 const request={site_id:id(9),purpose:' site work ',items:[{consumable_id:id(1),quantity:'2',unit:'pieces'},{consumable_id:id(2),quantity:1,unit:'box'}]};
 assert.deepEqual(C.validateRequest(request,catalog,sites),{...request,purpose:'site work',items:[{consumable_id:id(1),quantity:2,unit:'pieces'},{consumable_id:id(2),quantity:1,unit:'box'}]});
 for(const bad of [{...request,site_id:id(8)},{...request,items:[]},{...request,items:[request.items[0],request.items[0]]},{...request,items:[{...request.items[0],unit:'box'}]},{...request,items:[{consumable_id:id(3),quantity:1,unit:'kg'}]},{...request,purpose:'a'.repeat(1001)}])assert.throws(()=>C.validateRequest(bad,catalog,sites));
});
test('request may exceed current stock for later approval; approval never implies issuance',()=>{
 assert.equal(C.validateRequest({site_id:id(9),items:[{consumable_id:id(1),unit:'pieces',quantity:100}]},catalog,sites).items[0].quantity,100);
 const snapshot=fixture();snapshot.requests.forEach(r=>r.issues=[]);
 const report=A.report(snapshot);assert.equal(report.summary[0].issued,0);assert.equal(report.summary[0].confirmed_consumed_quantity,null);assert.ok(report.summary.some(r=>r.approved===15));
});
test('analytics uses inclusive Manila days and independently filters request and issuance timestamps',()=>{
 const report=A.report(fixture(),{from:'2026-10-25',to:'2026-10-25'});
 assert.equal(report.transactions.length,3);assert.equal(report.summary.length,1);
 assert.equal(report.summary[0].requested,5);assert.equal(report.summary[0].approved,5);assert.equal(report.summary[0].issued,3.3);assert.equal(report.summary[0].issuances,3);
 assert.equal(report.trend.length,1);assert.equal(report.trend[0].value,'2026-10-25');
});
test('analytics groups identical names with different units separately and keeps requester/site attribution',()=>{
 const value=A.report(fixture());assert.equal(value.summary.length,2);assert.equal(value.summary.find(i=>i.unit==='pieces').issued,3.3);assert.equal(value.summary.find(i=>i.unit==='box').issued,2);
 assert.equal(value.byRequester.length,3);assert.equal(value.bySite.length,3);
 const filtered=A.report(fixture(),{requester_id:id(31),site_id:id(10)});assert.equal(filtered.transactions.length,1);assert.equal(filtered.summary[0].issued,3);
});
test('duplicate ledger receipt in a retried response is counted exactly once',()=>{
 const snapshot=fixture();snapshot.requests[0].issues.push(snapshot.requests[0].issues[0]);
 const report=A.report(snapshot);assert.equal(report.transactions.length,4);assert.equal(report.summary.find(i=>i.unit==='pieces').issued,3.3);
});
test('low-stock list uses current active inventory and includes stock exactly at minimum',()=>{
 const snapshot=fixture();snapshot.catalog=[...catalog,{id:id(4),name:'Tape',unit:'roll',current_stock:5,minimum_stock:5}];
 assert.deepEqual(A.report(snapshot,{from:'2020-01-01',to:'2020-01-02'}).lowStock.map(i=>i.id),[id(1),id(4)]);
});
test('legacy missing item code/category survives history/export without fabricated consumption',()=>{
 const snapshot=fixture();delete snapshot.requests[0].items[0].item_code;delete snapshot.requests[0].items[0].specification;
 const report=A.report(snapshot);assert.ok(A.summaryCSV(report).includes('Not recorded'));assert.ok(A.transactionsCSV(report).includes(id(50)));
});
test('CSV export neutralizes formulas, quotes cells and preserves actual line breaks',()=>{
 const csv=C.csv(['Item','Note'],[[' =HYPERLINK("x")','line1\nline2']]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =HYPERLINK(""x"")"'));assert.ok(csv.includes('"line1\nline2"'));
 assert.equal(C.escape('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
test('date bounds reject invalid calendar dates and inverted periods',()=>{
 for(const pair of [['2026-02-29',''],['2026-13-01',''],['2026-10-25','2026-10-24']])assert.throws(()=>C.dateRange(...pair));
 assert.deepEqual(C.dateRange('2026-10-25','2026-10-25'),{from:'2026-10-25T00:00:00+08:00',to:'2026-10-25T16:00:00.000Z'});
});
test('uncertain mutation retries preserve operation ID and payload, successful later action gets a new ID',async()=>{
 const calls=[];let attempt=0;
 const api=C.createClient({rpc:async(name,args)=>{calls.push({name,args});return ++attempt===1?{error:{message:'Disconnected'}}:{data:{id:id(20)}};}});
 const payload={p_request_id:id(20),p_items:[{item_id:id(1),quantity:2}],p_issued_at:null};
 await assert.rejects(api.mutate('mcpa_wa_issue_consumables',payload),/Disconnected/);
 await api.mutate('mcpa_wa_issue_consumables',payload);
 assert.equal(calls[0].args.p_operation_id,calls[1].args.p_operation_id);assert.deepEqual(calls[0].args,calls[1].args);
 await api.mutate('mcpa_wa_issue_consumables',payload);assert.notEqual(calls[1].args.p_operation_id,calls[2].args.p_operation_id);
});
test('missing migration and permissions errors provide actionable messages',()=>{
 assert.match(C.errorText({code:'PGRST202'}),/setup is incomplete/);assert.match(C.errorText({code:'42501'}),/active role/);assert.throws(()=>C.createClient({}),/authenticated/);
});
test('interrupted actions survive reload, bind to actor and reject changed payload until recovered',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const calls=[],client={rpc:async(name,args)=>{calls.push(args);return calls.length===1?{error:{message:'Lost response'}}:{data:{id:id(20)}};}};
 const first=C.createClient(client,storage);first.bindActor(id(30));const payload={p_site_id:id(9),p_purpose:'',p_items:[{consumable_id:id(1),quantity:2,unit:'pieces'}]};
 await assert.rejects(first.mutate('mcpa_wa_submit_consumables',payload),/Lost response/);
 const reload=C.createClient(client,storage);reload.bindActor(id(31));assert.equal(reload.getPending(),null);
 reload.bindActor(id(30));assert.ok(reload.getPending());
 await assert.rejects(reload.mutate('mcpa_wa_submit_consumables',{...payload,p_purpose:'Changed'}),/uncertain result/);
 await reload.retryPending();assert.equal(calls[0].p_operation_id,calls[1].p_operation_id);assert.equal(reload.getPending(),null);assert.equal(values.size,0);
});
test('database validation failure clears recovery lock because its transaction rolled back',async()=>{
 let count=0;const api=C.createClient({rpc:async()=>++count===1?{error:{code:'40001',message:'Insufficient stock'}}:{data:{id:id(20)}}},null);
 await assert.rejects(api.mutate('mcpa_wa_issue_consumables',{p_items:[]}),/Insufficient stock/);
 assert.equal(api.getPending(),null);await api.mutate('mcpa_wa_issue_consumables',{p_items:[{item_id:id(1),quantity:1}]});
});
test('empty responses remain uncertain and cannot clear the operation recovery key',async()=>{
 const api=C.createClient({rpc:async()=>({data:null})},null);
 await assert.rejects(api.mutate('mcpa_wa_issue_consumables',{p_items:[]}),/returned no result/);
 assert.ok(api.getPending());
});
