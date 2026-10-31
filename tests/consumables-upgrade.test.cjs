const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,upgrade,seed,rpc,read}=require('./consumables-upgrade-fixture.cjs');
const {authDatabase}=require('./auth-test-db.cjs');
const catalog=require('../js/consumables-catalog.js');
const create=(overrides={})=>({p_id:randomUUID(),p_version:null,p_name:'Fixture stock',p_unit:'pcs',p_minimum:20,p_opening:100,p_category:'Cutting',p_specification:'4"',p_item_code:null,...overrides});
const save=(f,input,actor=f.actors.admin)=>rpc(f,actor,'consumables_save_item',input);
const stock=(f,item,overrides={},actor=f.actors.admin)=>rpc(f,actor,'consumables_adjust_stock',{p_operation_id:randomUUID(),p_item_id:item.id,p_version:item.version,p_kind:'usage',p_quantity:1,p_note:'Isolated regression test',...overrides});
test('catalog contains exactly 12 ordered categories, 60 families and 126 explicit distinct variants',()=>{
 assert.deepEqual(catalog.categories.map(c=>c.name),['Welding','Cutting','Grinding & Polishing','Drilling','Sanding & Abrasives','Fasteners & Fixings','Adhesives & Sealants','Tapes','Painting','Electrical & Plumbing','Masonry & Carpentry','General Site, Safety & Maintenance']);
 assert.equal(new Set(catalog.items.map(i=>i.name)).size,60);assert.equal(catalog.items.length,126);assert.equal(new Set(catalog.items.map(i=>i.item_code)).size,126);
 const specs=name=>catalog.items.filter(i=>i.name===name).map(i=>i.specification);
 assert.deepEqual(specs('Flap Disc'),['4" Grit 40','4" Grit 60','4" Grit 80']);
 assert.deepEqual(specs('Sanding Belt'),['3" × 21"']);assert.deepEqual(specs('Self-Drilling Screws'),['#8 × 1"','#10 × 2"']);
 assert.deepEqual(specs('Circular Saw Blade'),['7-1/4"','10"']);assert.deepEqual(specs('PTFE / Teflon Thread Seal Tape'),['1/2"','3/4"']);
 for(const c of catalog.categories)assert.equal(new Set(catalog.items.filter(i=>i.category===c.name).map(i=>i.name)).size,5);
});
test('all category filters, combined name/code/spec/category/unit search, result counts and empty matches preserve data',()=>{
 const items=catalog.items.map((i,n)=>({...i,stock_status:n%2?'low':'ok'})),before=JSON.stringify(items);
 assert.equal(catalog.filter(items).length,126);
 for(const c of catalog.categories){const result=catalog.filter(items,{category:c.name});assert.ok(result.length);assert.ok(result.every(i=>i.category===c.name));}
 for(const search of ['WEL-001','2.5mm','Welding Rod E6013','Welding','kg'])assert.ok(catalog.filter(items,{search}).length);
 const filtered=catalog.filter(items,{search:'7"',category:'Cutting',status:'attention'});assert.ok(filtered.length);assert.ok(filtered.every(i=>i.category==='Cutting'&&i.specification.includes('7"')&&i.stock_status==='low'));
 assert.equal(catalog.filter(items,{search:'nonexistent specification'}).length,0);assert.equal(JSON.stringify(items),before);
});
test('migration and seed create 126 healthy SKU balances and opening ledger entries; re-run is unchanged',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('select * from equipment order by id')).rows;
  await f.db.exec(seed);
  const rows=(await f.db.query('select * from consumables order by item_code')).rows;
  assert.equal(rows.length,126);assert.ok(rows.every(i=>i.current_stock==='100.000'&&i.minimum_stock==='20.000'&&i.stock_status==='ok'));
  const history=(await f.db.query('select * from consumable_stock_movements order by id')).rows;assert.equal(history.length,126);assert.ok(history.every(m=>m.actor_name==='Database maintenance / catalog import'&&m.balance_before==='0.000'));
  await f.db.exec(seed);assert.deepEqual((await f.db.query('select * from consumables order by item_code')).rows,rows);assert.deepEqual((await f.db.query('select * from consumable_stock_movements order by id')).rows,history);
  assert.deepEqual((await f.db.query('select * from equipment order by id')).rows,before);
  await f.db.exec(read('documentation/consumables-upgrade-2026-10-22/04-verification.sql'));
 }finally{await f.close();}
});
test('normalized existing exact matches retain IDs, stock, thresholds, requests and history; code collisions allocate safely',async()=>{
 const f=await authDatabase();try{
  const id=randomUUID(),op=randomUUID();
  await f.db.query("insert into consumables(id,name,unit,current_stock,minimum_stock) values($1,' Welding   Rod E6013 ','kg',37,7)",[id]);
  await f.db.query("insert into consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note) values($1,$2,'opening',37,37,'Preserved legacy stock')",[op,id]);
  await f.db.query("insert into consumable_requests(id,consumable_id,item_name,unit,quantity,requester,purpose) values($1,$2,'Original historical item name','kg',4,'Legacy requester','Preserved request')",[randomUUID(),id]);
  const requests=(await f.db.query('select * from consumable_requests')).rows;
  await upgrade(f);await f.db.query("update consumables set specification='2.5mm' where id=$1",[id]);
  await save(f,create({p_name:'Unrelated stock',p_item_code:'WEL-002'}));
  const history=(await f.db.query('select * from consumable_stock_movements where consumable_id=$1',[id])).rows;
  await f.db.exec(seed);const matched=(await f.db.query('select * from consumables where id=$1',[id])).rows[0];
  assert.equal(matched.current_stock,'37.000');assert.equal(matched.minimum_stock,'7.000');assert.equal(matched.category,'Welding');assert.equal(matched.item_code,'WEL-001');
  assert.equal((await f.db.query("select count(*) from consumables where catalog_key is not null")).rows[0].count,126);
  const second=(await f.db.query("select item_code from consumables where catalog_key='catalog-20261022:WEL-002'")).rows[0];assert.equal(second.item_code,'WEL-011');
  assert.deepEqual((await f.db.query('select * from consumable_stock_movements where consumable_id=$1',[id])).rows,history);
  const preservedRequests=(await f.db.query('select * from consumable_requests')).rows.map(({item_code,specification,...r})=>r);assert.deepEqual(preservedRequests,requests);
  await f.db.exec(seed);assert.equal((await f.db.query('select count(*) from consumables')).rows[0].count,127);
 }finally{await f.close();}
});
test('ambiguous legacy Cutting Disc stops import and rolls all earlier inserts back without rewriting data',async()=>{
 const f=await authDatabase();try{
  await f.db.query("insert into consumables(id,name,unit,current_stock) values($1,'Cutting Disc','pcs',8)",[randomUUID()]);
  // Preflight runs before new columns exist.
  await f.db.exec(read('documentation/consumables-upgrade-2026-10-22/01-preflight.sql'));
  await upgrade(f);const before=(await f.db.query('select * from consumables')).rows;
  await assert.rejects(f.db.exec(seed),/Reconcile existing/);await f.db.exec('rollback');
  assert.deepEqual((await f.db.query('select * from consumables')).rows,before);assert.equal((await f.db.query('select count(*) from consumable_stock_movements')).rows[0].count,0);
 }finally{await f.close();}
});
test('legacy embedded sizes or incomplete source descriptions require explicit specification reconciliation',async()=>{
 const f=await authDatabase();try{
  const id=randomUUID();await f.db.query("insert into consumables(id,name,unit,current_stock) values($1,'Silicone Sealant','tube',8)",[id]);
  await upgrade(f);await f.db.query("update consumables set specification='300ml' where id=$1",[id]);
  await assert.rejects(f.db.exec(seed),/Reconcile existing/);await f.db.exec('rollback');
  assert.equal((await f.db.query('select current_stock from consumables where id=$1',[id])).rows[0].current_stock,'8.000');
 }finally{await f.close();}
});
test('historically invalid stock stops schema changes and reports rather than repairing balances',async()=>{
 const f=await authDatabase();try{
  await f.db.exec('alter table consumables drop constraint consumables_current_stock_check');
  const id=randomUUID();await f.db.query("insert into consumables(id,name,unit,current_stock) values($1,'Invalid historical fixture','pcs',-1)",[id]);
  await assert.rejects(upgrade(f),/Invalid historical stock/);await f.db.exec('rollback');
  assert.equal((await f.db.query('select current_stock from consumables where id=$1',[id])).rows[0].current_stock,'-1.000');
  assert.equal((await f.db.query("select count(*) from information_schema.columns where table_name='consumables' and column_name='specification'")).rows[0].count,0);
 }finally{await f.close();}
});
test('authorized SKU save requires a valid category, permits variants, protects immutable units and idempotent retries',async()=>{
 const f=await fixture();try{
  const input=create(),item=await save(f,input);assert.equal(item.item_code,'CUT-001');assert.deepEqual(await save(f,input),item);
  const other=await save(f,create({p_specification:'7"'}));assert.equal(other.item_code,'CUT-002');
  await assert.rejects(save(f,create()),{code:'23505'});
  for(const p_category of ['',null,'Wrong'])await assert.rejects(save(f,create({p_category})),{code:'22023'});
  await assert.rejects(rpc(f,f.actors.admin,'consumables_save_item',{p_id:randomUUID(),p_version:null,p_name:'Legacy bypass',p_unit:'pcs',p_minimum:20,p_opening:100}),{code:'22023'});
  await assert.rejects(save(f,{...input,p_version:1,p_unit:'kg',p_item_code:item.item_code}),{code:'40001'});
  const edited=await save(f,{...input,p_version:1,p_category:'Welding',p_item_code:item.item_code});assert.equal(edited.category,'Welding');assert.equal(edited.current_stock,100);
 }finally{await f.close();}
});
test('zero and three decimals are supported; negative, NaN, Infinity, excessive precision and overflow are rejected',async()=>{
 const f=await fixture();try{
  assert.equal((await save(f,create({p_opening:0}))).current_stock,0);
  assert.equal((await save(f,create({p_name:'Fractional kg',p_unit:'kg',p_opening:1.125}))).current_stock,1.125);
  for(const p_opening of [-1,'NaN','Infinity','-Infinity',0.0001,1e9,null])await assert.rejects(save(f,create({p_name:randomUUID(),p_opening})),{code:'22023'});
  const item=await save(f,create({p_name:'Deduction test',p_opening:10}));
  for(const p_quantity of [-1,'NaN','Infinity',0.0001,11])await assert.rejects(stock(f,item,{p_quantity}),{code:'22023'});
  assert.equal((await f.db.query('select count(*) from consumable_stock_movements where consumable_id=$1',[item.id])).rows[0].count,1);
  await assert.rejects(f.db.query('update consumables set current_stock=-1 where id=$1',[item.id]),{code:'23514'});
 }finally{await f.close();}
});
test('conflicting deduction submissions commit one adjustment only, with actor and previous/new balances',async()=>{
 const f=await fixture();try{
  const item=await save(f,create({p_opening:10}));
  const outcomes=await Promise.allSettled([stock(f,item,{p_quantity:7}),stock(f,item,{p_quantity:6},f.actors.secretary)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
  const current=(await f.db.query('select * from consumables where id=$1',[item.id])).rows[0];assert.equal(current.current_stock,'3.000');
  const history=(await f.db.query("select * from consumable_stock_movements where consumable_id=$1 and kind='usage'",[item.id])).rows;assert.equal(history.length,1);assert.equal(history[0].balance_before,'10.000');assert.equal(history[0].balance_after,'3.000');assert.equal(history[0].actor_id,f.actors.admin.id);
  await assert.rejects(stock(f,{...item,version:2},{p_quantity:6}),{code:'22023'});
  assert.match(read('1-admin/modules/consumables/setup.sql'),/where id=p_item_id for update/);
 }finally{await f.close();}
});
test('RLS, role wrappers and immutable history block unauthorized stock writes and audit modification',async()=>{
 const f=await fixture();try{
  const item=await save(f,create());
  for(const actor of [f.actors.sky,f.actors.architect,f.actors.handler,f.actors.inactive,null]){
   await assert.rejects(save(f,create({p_name:randomUUID()}),actor),{code:'42501'});
   await assert.rejects(stock(f,item,{},actor),{code:'42501'});
  }
  await assert.rejects(f.query(f.actors.admin,'update consumables set current_stock=1'),{code:'42501'});
  await assert.rejects(f.query(f.actors.admin,'select mcpa_auth_private.consumables_adjust_stock($1,$2,1,\'usage\',1,\'bypass\')',[randomUUID(),item.id]),{code:'42501'});
  for(const sql of ["update consumable_stock_movements set note='changed'",'delete from consumable_stock_movements','truncate consumable_stock_movements'])await assert.rejects(f.db.exec(sql),{code:'42501'});
 }finally{await f.close();}
});
test('purchase requests snapshot correct SKU, receipts preserve links and atomically audit stock, failed receipt rolls back',async()=>{
 const f=await fixture({ledger:true});try{
  const item=await save(f,create()),request=await rpc(f,f.actors.secretary,'consumables_create_request',{p_id:randomUUID(),p_item_id:item.id,p_quantity:5,p_requester:'Untrusted name',p_purpose:'Test restock',p_needed_by:null});
  assert.equal(request.item_code,item.item_code);assert.equal(request.specification,item.specification);assert.equal(request.requester,f.actors.secretary.name);
  const args={p_operation_id:randomUUID(),p_request_id:request.id,p_version:1,p_quantity:3,p_note:'Partial delivery'};
  const received=await rpc(f,f.actors.secretary,'consumables_receive_request',args);assert.equal(received.status,'partial');
  assert.deepEqual(await rpc(f,f.actors.secretary,'consumables_receive_request',args),received);
  await assert.rejects(rpc(f,f.actors.secretary,'consumables_receive_request',{...args,p_operation_id:randomUUID(),p_version:2,p_quantity:3}),{code:'22023'});
  const balance=(await f.db.query('select current_stock from consumables where id=$1',[item.id])).rows[0];assert.equal(balance.current_stock,'103.000');
  const movement=(await f.db.query("select * from consumable_stock_movements where request_id=$1",[request.id])).rows;assert.equal(movement.length,1);assert.equal(movement[0].actor_id,f.actors.secretary.id);assert.equal(movement[0].balance_before,'100.000');
  const snapshot=await f.rpc(f.actors.admin,'mcpa_purchase_snapshot');assert.equal(snapshot.requests[0].item_code,item.item_code);assert.equal(snapshot.requests[0].specification,item.specification);
  for(const actor of [f.actors.sky,null])await assert.rejects(f.rpc(actor,'mcpa_purchase_snapshot'),{code:'42501'});
  await f.rpc(f.actors.admin,'mcpa_save_purchase',{p_id:randomUUID(),p_version:null,p_operation_id:randomUUID(),p_record:{supplier:'Isolated supplier',reference:'SKU-LINK-1',purchase_date:'2026-10-22',request_id:request.id,items:[{description:'Fixture stock',quantity:'1',unit_price:'10'}],notes:'Isolated preservation test'}});
  const purchases=(await f.db.query('select * from mcpa_purchases')).rows,history=(await f.db.query('select * from mcpa_purchase_history')).rows;
  await f.db.exec(seed);assert.deepEqual((await f.db.query('select * from mcpa_purchases')).rows,purchases);assert.deepEqual((await f.db.query('select * from mcpa_purchase_history')).rows,history);
 }finally{await f.close();}
});
