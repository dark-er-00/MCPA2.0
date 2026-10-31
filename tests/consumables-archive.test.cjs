// Local fixtures only. The reviewed production UUID is reproduced in isolated PGlite.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const {fixture,upgrade,seed,rpc,read}=require('./consumables-upgrade-fixture.cjs');
const catalog=require('../js/consumables-catalog.js');
const archiveSql=read('documentation/consumables-upgrade-2026-10-22/02-archive-sample.sql');
const sampleId='c3f58442-dc99-4466-8590-16642abdb7bc';
const save=(f,extra={})=>rpc(f,f.actors.admin,'consumables_save_item',{p_id:randomUUID(),p_version:null,p_name:'Archive fixture',p_unit:'pcs',p_minimum:20,p_opening:100,p_category:'Cutting',p_specification:'4"',p_item_code:null,...extra});
const adjust=(f,item,extra={})=>rpc(f,f.actors.admin,'consumables_adjust_stock',{p_operation_id:randomUUID(),p_item_id:item.id,p_version:item.version,p_kind:'usage',p_quantity:1,p_note:'Isolated archive test',...extra});
async function sampleFixture(){
 const f=await authDatabase();
 let item=await rpc(f,f.actors.admin,'consumables_save_item',{p_id:sampleId,p_version:null,p_name:'Cutting Disc',p_unit:'pieces',p_minimum:120,p_opening:30});
 for(const [kind,quantity]of [['usage',10],['restock',10],['usage',6]])item=await adjust(f,item,{p_kind:kind,p_quantity:quantity});
 await upgrade(f);return f;
}
const rows=async(f,table,where='')=>(await f.db.query('select * from '+table+where+' order by id')).rows;
const archive=async(f,id)=>f.db.query("update consumables set archived_at=clock_timestamp(),archive_reason='Reviewed isolated test archival',version=version+1 where id=$1",[id]);

test('guarded sample archival retains 24/120, UUID and all four movements; rerun is unchanged; seed imports 126 healthy active SKUs',async()=>{
 const f=await sampleFixture();try{
  const before=(await rows(f,'consumables'))[0],history=await rows(f,'consumable_stock_movements');
  const preflight=async()=> (await f.db.exec(read('documentation/consumables-upgrade-2026-10-22/01-preflight.sql'))).find(result=>result.rows?.[0]?.total_source_skus!==undefined).rows[0];
  assert.deepEqual(await preflight(),{total_source_skus:126,exact_existing_matches:0,proposed_inserts_before_review:126,skus_needing_manual_review:2});
  await f.db.exec(archiveSql);
  const after=(await rows(f,'consumables'))[0];assert.ok(after.archived_at);assert.equal(after.current_stock,'24.000');assert.equal(after.minimum_stock,'120.000');assert.equal(after.id,sampleId);
  for(const key of Object.keys(before).filter(k=>!['archived_at','archive_reason','version','updated_at'].includes(k)))assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(await rows(f,'consumable_stock_movements'),history);assert.equal(history.length,4);
  const events=await rows(f,'consumable_archive_events');assert.equal(events.length,1);assert.equal(events[0].kind,'archive');
  await f.db.exec(archiveSql);assert.deepEqual(await rows(f,'consumable_archive_events'),events);
  assert.deepEqual(await preflight(),{total_source_skus:126,exact_existing_matches:0,proposed_inserts_before_review:126,skus_needing_manual_review:0});
  await f.db.exec(seed);const all=await rows(f,'consumables');assert.equal(all.length,127);
  const active=all.filter(i=>!i.archived_at);assert.equal(active.length,126);assert.ok(active.every(i=>i.current_stock==='100.000'&&i.minimum_stock==='20.000'));
  assert.deepEqual(active.filter(i=>['CUT-001','CUT-002'].includes(i.item_code)).map(i=>i.specification).sort(),['4"','7"']);
  assert.deepEqual(await rows(f,'consumable_stock_movements',` where consumable_id='${sampleId}'`),history);
  const seeded=await rows(f,'consumables');await f.db.exec(seed);assert.deepEqual(await rows(f,'consumables'),seeded);
  assert.deepEqual(await preflight(),{total_source_skus:126,exact_existing_matches:126,proposed_inserts_before_review:0,skus_needing_manual_review:0});
  await f.db.exec(read('documentation/consumables-upgrade-2026-10-22/01-preflight.sql'));
  await f.db.exec(read('documentation/consumables-upgrade-2026-10-22/04-verification.sql'));
 }finally{await f.close();}
});
test('guarded archive fails closed on identity, balance, reference or movement-count drift',async()=>{
 const f=await sampleFixture();try{
  for(const [column,value]of [['name','Actual inventory'],['current_stock',25],['unit','pcs']]){
   const before=(await rows(f,'consumables'))[0];await f.db.query('update consumables set '+column+'=$1 where id=$2',[value,sampleId]);
   await assert.rejects(f.db.exec(archiveSql),/identity\/state differs/);await f.db.exec('rollback');
   assert.equal((await rows(f,'consumables'))[0].archived_at,null);assert.equal((await rows(f,'consumable_archive_events')).length,0);
   await f.db.query('update consumables set '+column+'=$1 where id=$2',[before[column],sampleId]);
  }
  const item=(await rows(f,'consumables'))[0];await adjust(f,item,{p_kind:'correction',p_quantity:24});
  await assert.rejects(f.db.exec(archiveSql),/exactly four/);await f.db.exec('rollback');
  assert.equal((await rows(f,'consumable_stock_movements')).length,5);assert.equal((await rows(f,'consumables'))[0].archived_at,null);
 }finally{await f.close();}
});
test('archived stock cannot be used, restocked, corrected, edited or newly requested; authorized history stays readable',async()=>{
 const f=await sampleFixture();try{
  await f.db.exec(archiveSql);const item=(await rows(f,'consumables'))[0],history=await rows(f,'consumable_stock_movements');
  for(const kind of ['usage','restock','correction'])await assert.rejects(adjust(f,item,{p_kind:kind}),/archived/);
  await assert.rejects(save(f,{p_id:item.id,p_version:item.version,p_name:'Renamed sample',p_unit:'pieces',p_item_code:'CUT-999'}),/archived/);
  await assert.rejects(rpc(f,f.actors.secretary,'consumables_create_request',{p_id:randomUUID(),p_item_id:item.id,p_quantity:1,p_requester:'Test',p_purpose:'Rejected archived request',p_needed_by:null}),/archived/);
  await assert.rejects(f.db.query("insert into consumable_stock_movements(id,consumable_id,kind,quantity_change,balance_after,note) values($1,$2,'correction',0,24,'Bypass')",[randomUUID(),item.id]),/archived/);
  for(const actor of [f.actors.admin,f.actors.secretary]){
   assert.equal((await f.query(actor,'select * from consumables where id=$1',[item.id])).rows.length,1);
   assert.equal((await f.query(actor,'select * from consumable_stock_movements where consumable_id=$1',[item.id])).rows.length,4);
   assert.equal((await f.query(actor,'select * from consumable_archive_events')).rows.length,1);
  }
  assert.equal((await f.query(f.actors.sky,'select * from consumable_archive_events')).rows.length,0);
  await assert.rejects(f.query(null,'select * from consumable_archive_events'),{code:'42501'});
  await assert.rejects(f.query(f.actors.admin,"update consumables set archived_at=null"),{code:'42501'});
  await assert.rejects(f.db.exec('delete from consumable_archive_events'),{code:'42501'});
  assert.deepEqual(await rows(f,'consumable_stock_movements'),history);
 }finally{await f.close();}
});
test('restoration requires explicit Admin identity, reason and version, writes lifecycle audit and preserves stock history',async()=>{
 const f=await sampleFixture();try{
  await f.db.exec(archiveSql);const item=(await rows(f,'consumables'))[0],history=await rows(f,'consumable_stock_movements');
  const args={p_id:item.id,p_version:item.version,p_reason:'Reviewed return to active stock'};
  for(const actor of [null,f.actors.secretary,f.actors.sky,f.actors.inactive])await assert.rejects(rpc(f,actor,'consumables_restore_item',args),{code:'42501'});
  await assert.rejects(rpc(f,f.actors.admin,'consumables_restore_item',{...args,p_reason:' '}),{code:'22023'});
  await assert.rejects(rpc(f,f.actors.admin,'consumables_restore_item',{...args,p_version:1}),{code:'40001'});
  await assert.rejects(f.db.exec('update consumables set archived_at=null,archive_reason=null'),/Admin must explicitly restore/);
  const restored=await rpc(f,f.actors.admin,'consumables_restore_item',args);assert.equal(restored.archived_at,null);assert.equal(restored.current_stock,24);assert.equal(restored.minimum_stock,120);
  assert.deepEqual(await rows(f,'consumable_stock_movements'),history);
  const events=await rows(f,'consumable_archive_events');assert.equal(events.length,2);const event=events.find(e=>e.kind==='restore');assert.equal(event.actor_id,f.actors.admin.id);assert.equal(event.reason,args.p_reason);
  assert.equal((await adjust(f,restored)).current_stock,23);
 }finally{await f.close();}
});
test('active duplicate detection remains strict; an archived equivalent is neither matched nor silently restored by seed',async()=>{
 const f=await fixture();try{
  const old=await save(f,{p_name:'Metal Cutting Disc',p_item_code:'LEG-001'});await archive(f,old.id);
  await f.db.exec(seed);assert.equal((await rows(f,'consumables')).filter(i=>!i.archived_at).length,126);
  const archived=(await rows(f,'consumables')).find(i=>i.id===old.id);assert.ok(archived.archived_at);assert.equal(archived.catalog_key,null);
  await assert.rejects(save(f,{p_name:'Metal Cutting Disc'}),{code:'23505'});
  await assert.rejects(rpc(f,f.actors.admin,'consumables_restore_item',{p_id:old.id,p_version:2,p_reason:'Conflicting duplicate restore'}),{code:'23505'});
  assert.equal((await rows(f,'consumable_archive_events')).filter(e=>e.kind==='restore').length,0);
  const catalogItem=(await rows(f,'consumables')).find(i=>i.item_code==='CUT-001');await archive(f,catalogItem.id);
  await assert.rejects(f.db.exec(seed),/Catalog identity .* is archived/);await f.db.exec('rollback');
 }finally{await f.close();}
});
test('archived items do not affect active filters, counts or low-stock warnings',()=>{
 const items=[{name:'Live',stock_status:'ok'},{name:'Sample',stock_status:'low',archived_at:'2026-10-22T00:00:00Z'}];
 assert.deepEqual(catalog.filter(items).map(i=>i.name),['Live']);assert.equal(catalog.attentionCount(items),0);
 assert.equal(catalog.filter(items,{status:'attention'}).length,0);assert.deepEqual(catalog.filter(items,{archived:true}).map(i=>i.name),['Sample']);
 items.push({name:'Live shortage',stock_status:'out'});assert.equal(catalog.attentionCount(items),1);
});
test('open requests prevent archival; historical purchase links remain, but new links to archived items fail',async()=>{
 const f=await fixture({ledger:true});try{
  const item=await save(f),request=await rpc(f,f.actors.admin,'consumables_create_request',{p_id:randomUUID(),p_item_id:item.id,p_quantity:1,p_requester:'Test',p_purpose:'History test',p_needed_by:null});
  await assert.rejects(archive(f,item.id),/Resolve open material requests/);
  await rpc(f,f.actors.admin,'consumables_cancel_request',{p_request_id:request.id,p_version:1,p_reason:'Close before archival'});
  const record={supplier:'Isolated supplier',reference:'ARCHIVE-1',purchase_date:'2026-10-22',request_id:request.id,items:[{description:'Fixture',quantity:'1',unit_price:'1'}],notes:'Original'};
  const purchase=await f.rpc(f.actors.admin,'mcpa_save_purchase',{p_id:randomUUID(),p_version:null,p_operation_id:randomUUID(),p_record:record});
  const stockBefore=await rows(f,'consumable_stock_movements');await archive(f,item.id);
  const snapshot=await f.rpc(f.actors.admin,'mcpa_purchase_snapshot');assert.equal(snapshot.requests[0].consumable_archived,true);
  await assert.rejects(f.rpc(f.actors.admin,'mcpa_save_purchase',{p_id:randomUUID(),p_version:null,p_operation_id:randomUUID(),p_record:{...record,reference:'ARCHIVE-NEW'}}),/archived/);
  const updated=await f.rpc(f.actors.admin,'mcpa_save_purchase',{p_id:purchase.id,p_version:1,p_operation_id:randomUUID(),p_record:{...record,notes:'Keep original historical link'}});assert.equal(updated.request_id,request.id);
  assert.deepEqual(await rows(f,'consumable_stock_movements'),stockBefore);
 }finally{await f.close();}
});
module.exports={sampleFixture,archiveSql,sampleId};
