const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,id}=require('../quantity-requests-v2/database-fixture.cjs');
async function setup(t){const f=await fixture();t.after(()=>f.close());return f;}
const submit=(f,items,extra={})=>f.wa(f.actors.sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'Slab work',p_items:JSON.stringify(items),...extra});
const review=(f,r,items,extra={})=>f.wa(f.actors.admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:'approve',p_items:JSON.stringify(items),p_note:'Approved quantities',...extra});
const issue=(f,r,items,op=id(),when=null)=>f.wa(f.actors.admin,'mcpa_wa_issue_consumables',{p_operation_id:op,p_request_id:r.id,p_items:JSON.stringify(items),p_issued_at:when});
const counts=async f=>(await f.db.query(`select (select count(*) from consumable_stock_movements) movements,(select count(*) from mcpa_wa_material_issues) issues,(select count(*) from mcpa_wa_operations) operations`)).rows[0];
const stock=async(f,item)=>{const r=(await f.db.query('select current_stock::float8 current_stock,version from consumables where id=$1',[item.id])).rows[0];return r;};

test('multi-line approval and full/partial issuance deduct authoritative stock once; issued remains distinct from consumed',async t=>{
  const f=await setup(t),cement=await f.seedConsumable(),nails=await f.seedConsumable({p_name:'Workstream A Nails',p_unit:'kg',p_specification:'3 inch',p_opening:20});
  const op=id(),items=[{consumable_id:cement.id,quantity:12,unit:cement.unit},{consumable_id:nails.id,quantity:5.5,unit:nails.unit}],r=await submit(f,items,{p_operation_id:op});
  assert.equal(r.items.length,2);assert.equal(r.status,'pending');assert.equal(r.items[0].issued_quantity,0);assert.equal(r.items[0].confirmed_consumed_quantity,null);
  assert.deepEqual(await submit(f,items,{p_operation_id:op}),r);assert.equal((await stock(f,cement)).current_stock,30);
  const approved=await review(f,r,r.items.map(i=>({item_id:i.id,quantity:i.consumable_id===cement.id?10:5.5})));
  assert.equal(approved.status,'approved');assert.equal((await stock(f,cement)).current_stock,30,'Approval never deducts stock');
  const cementLine=r.items.find(i=>i.consumable_id===cement.id),nailLine=r.items.find(i=>i.consumable_id===nails.id),issueOp=id();
  const partial=await issue(f,r,[{item_id:cementLine.id,quantity:4}],issueOp),after=await counts(f);
  assert.equal(partial.status,'partial');assert.equal(partial.issues.length,1);assert.equal(partial.issues[0].quantity,4);assert.equal(partial.issues[0].issued_by_id,f.actors.admin.id);
  assert.equal((await stock(f,cement)).current_stock,26);assert.equal(partial.items.find(i=>i.id===cementLine.id).issued_quantity,4);
  assert.deepEqual(await issue(f,r,[{item_id:cementLine.id,quantity:4}],issueOp),partial);assert.deepEqual(await counts(f),after);
  await assert.rejects(issue(f,r,[{item_id:cementLine.id,quantity:5}],issueOp),/different/);
  const completed=await issue(f,r,[{item_id:cementLine.id,quantity:6},{item_id:nailLine.id,quantity:5.5}]);
  assert.equal(completed.status,'issued');assert.equal(completed.issues.length,3);assert.equal((await stock(f,cement)).current_stock,20);assert.equal((await stock(f,nails)).current_stock,14.5);
  assert.equal(completed.items.find(i=>i.id===cementLine.id).requested_quantity,12);assert.equal(completed.items.find(i=>i.id===cementLine.id).approved_quantity,10);
  for(const line of completed.items)assert.equal(line.confirmed_consumed_quantity,null);
  const movements=(await f.db.query(`select m.*,x.stock_movement_id from mcpa_wa_material_issues x join consumable_stock_movements m on m.id=x.stock_movement_id`)).rows;
  assert.equal(movements.length,3);assert.equal(new Set(movements.map(m=>m.id)).size,3);assert.ok(movements.every(m=>m.kind==='usage'&&m.quantity_change<0&&m.actor_id===f.actors.admin.id));
  await assert.rejects(issue(f,r,[{item_id:cementLine.id,quantity:1}]),/approved or partially/);
});

test('invalid requests, approvals and multi-line insufficient stock roll back every stock/event change',async t=>{
  const f=await setup(t),a=await f.seedConsumable(),b=await f.seedConsumable({p_name:'Workstream A Scarce',p_opening:1});
  const line={consumable_id:a.id,quantity:5,unit:a.unit};
  for(const items of [[],[line,line],[{...line,quantity:0}],[{...line,quantity:1.0001}],[{...line,quantity:'5'}],[{...line,unit:'invented'}],[{...line,consumable_id:id()}]])await assert.rejects(submit(f,items));
  assert.equal((await f.db.query('select count(*) n from mcpa_wa_material_requests')).rows[0].n,0);
  const r=await submit(f,[line,{consumable_id:b.id,quantity:3,unit:b.unit}]);
  await assert.rejects(review(f,r,[{item_id:r.items[0].id,quantity:2}]),/every request line/);
  await assert.rejects(review(f,r,r.items.map(i=>({item_id:i.id,quantity:i.requested_quantity+1}))),/exceed requested/);
  await assert.rejects(review(f,r,r.items.map(i=>({item_id:i.id,quantity:0}))),/positive/);
  await review(f,r,r.items.map(i=>({item_id:i.id,quantity:i.requested_quantity})));
  const before=await counts(f),beforeA=await stock(f,a),beforeB=await stock(f,b);
  await assert.rejects(issue(f,r,r.items.map(i=>({item_id:i.id,quantity:i.requested_quantity}))),/available active stock/);
  assert.deepEqual(await counts(f),before);assert.deepEqual(await stock(f,a),beforeA);assert.deepEqual(await stock(f,b),beforeB);
  const lines=[{item_id:r.items[0].id,quantity:1}];
  for(const items of [[lines[0],lines[0]],[{item_id:id(),quantity:1}],[{item_id:r.items[0].id,quantity:0}],[{item_id:r.items[0].id,quantity:0.0001}]])await assert.rejects(issue(f,r,items));
  await assert.rejects(issue(f,r,lines,id(),'2100-01-01T00:00:00Z'),/between request/);
  assert.deepEqual(await counts(f),before);
});

test('role authorization, assignment, RLS, immutable history and rejected request history are server enforced',async t=>{
  const f=await setup(t),item=await f.seedConsumable(),items=[{consumable_id:item.id,quantity:2,unit:item.unit}],r=await submit(f,items);
  for(const actor of [null,f.actors.secretary,f.actors.handler,f.actors.inactive])await assert.rejects(f.wa(actor,'mcpa_wa_consumables_snapshot'));
  assert.equal((await f.query(f.actors.pau,'select * from mcpa_wa_material_requests')).rows.length,0);
  assert.equal((await f.query(f.actors.pau,'select * from mcpa_wa_material_items')).rows.length,0);
  await assert.rejects(submit(f,items,{p_site_id:f.sites.main}),/assigned/);
  await assert.rejects(f.wa(f.actors.sky,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:r.id,p_decision:'reject',p_items:'[]',p_note:'Denied'}),/permitted/);
  await assert.rejects(f.wa(f.actors.sky,'mcpa_wa_consumables_analytics',{p_from:'2020-01-01Z',p_to:'2100-01-01Z'}),/permitted/);
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.architect.id,f.sites.main]);
  const architect=await f.wa(f.actors.architect,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.main,p_purpose:'',p_items:JSON.stringify(items)});
  assert.equal(architect.requester_id,f.actors.architect.id);assert.equal((await f.wa(f.actors.architect,'mcpa_wa_consumables_snapshot')).requests.length,1);
  await review(f,architect,[{item_id:architect.items[0].id,quantity:2}]);await issue(f,architect,[{item_id:architect.items[0].id,quantity:1}]);
  assert.equal((await f.query(f.actors.sky,'select * from mcpa_wa_material_issues')).rows.length,0,'Cross-request issue history stays private under nested RLS');
  assert.equal((await f.query(f.actors.architect,'select * from mcpa_wa_material_issues')).rows.length,1);
  await f.db.query("update profiles set account_status='inactive' where id=$1",[f.actors.architect.id]);
  assert.equal((await f.query(f.actors.architect,'select * from mcpa_wa_material_requests')).rows.length,0);
  assert.equal((await f.query(f.actors.architect,'select * from mcpa_wa_material_issues')).rows.length,0);
  await assert.rejects(f.wa(f.actors.architect,'mcpa_wa_consumables_snapshot'),/active authorized account/);
  const rejection=await review(f,r,[],{p_decision:'reject',p_note:'Re-evaluate requirements'});assert.equal(rejection.status,'rejected');assert.equal(rejection.note,'Re-evaluate requirements');
  await assert.rejects(issue(f,r,[{item_id:r.items[0].id,quantity:1}]));
  await assert.rejects(f.query(f.actors.admin,'delete from mcpa_wa_material_items'),/permission denied/);
  await assert.rejects(f.db.exec('delete from mcpa_wa_material_issues'),/immutable/);
});

test('analytics derive issue quantities from authoritative movements, preserve per-unit SKU and date semantics; legacy restocks survive',async t=>{
  const f=await setup(t),a=await f.seedConsumable(),b=await f.seedConsumable({p_name:'Workstream A Nails',p_unit:'kg',p_specification:'3 inch'});
  const legacy=await require('../consumables-upgrade-fixture.cjs').rpc(f,f.actors.admin,'consumables_create_request',{p_id:id(),p_item_id:a.id,p_quantity:5,p_requester:'ignored',p_purpose:'Legacy restock',p_needed_by:null});
  await f.rpc(f.actors.admin,'consumables_receive_request',{p_operation_id:id(),p_request_id:legacy.id,p_version:legacy.version,p_quantity:5,p_note:'Legacy goods received'});
  const r=await submit(f,[{consumable_id:a.id,quantity:4,unit:a.unit},{consumable_id:b.id,quantity:2,unit:b.unit}]);
  await review(f,r,r.items.map(i=>({item_id:i.id,quantity:i.requested_quantity})));
  const first=await issue(f,r,[{item_id:r.items.find(i=>i.consumable_id===a.id).id,quantity:1}]);
  const boundary=first.issues[0].issued_at;
  await issue(f,r,[{item_id:r.items.find(i=>i.consumable_id===a.id).id,quantity:3},{item_id:r.items.find(i=>i.consumable_id===b.id).id,quantity:2}]);
  const all=await f.wa(f.actors.admin,'mcpa_wa_consumables_analytics',{p_from:'2020-01-01T00:00:00Z',p_to:'2100-01-01T00:00:00Z'});
  const request=all.requests.find(x=>x.id===r.id);assert.equal(request.issues.reduce((n,x)=>n+x.quantity,0),6);assert.equal(request.issues.length,3);
  assert.equal(request.items.find(i=>i.consumable_id===a.id).unit,'bags');assert.equal(request.items.find(i=>i.consumable_id===b.id).unit,'kg');
  const before=await f.wa(f.actors.admin,'mcpa_wa_consumables_analytics',{p_from:'2020-01-01T00:00:00Z',p_to:boundary});assert.equal(before.requests.find(x=>x.id===r.id).issues.length,0,'Upper boundary is exclusive');
  const since=await f.wa(f.actors.admin,'mcpa_wa_consumables_analytics',{p_from:boundary,p_to:'2100-01-01T00:00:00Z'});assert.equal(since.requests.find(x=>x.id===r.id).issues.length,3,'Lower boundary is inclusive');
  assert.equal((await stock(f,a)).current_stock,31);assert.equal((await f.db.query('select * from consumable_requests where id=$1',[legacy.id])).rows[0].status,'received');
  assert.equal(all.catalog.find(c=>c.id===a.id).stock_status,'ok');assert.equal((await f.db.query("select count(*) n from consumable_stock_movements where kind='receipt' and request_id=$1",[legacy.id])).rows[0].n,1);
});

test('stale competing issuances and archived items cannot overspend stock or approved quantity',async t=>{
  const f=await setup(t),item=await f.seedConsumable({p_opening:5}),r=await submit(f,[{consumable_id:item.id,quantity:5,unit:item.unit}]);
  await review(f,r,[{item_id:r.items[0].id,quantity:5}]);
  const results=await Promise.allSettled([issue(f,r,[{item_id:r.items[0].id,quantity:4}]),issue(f,r,[{item_id:r.items[0].id,quantity:4}])]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await stock(f,item)).current_stock,1);
  await f.db.query("update consumables set archived_at=clock_timestamp(),archive_reason='Isolated archive test' where id=$1",[item.id]);
  const before=await counts(f);await assert.rejects(issue(f,r,[{item_id:r.items[0].id,quantity:1}]),/available active stock/);assert.deepEqual(await counts(f),before);
});
