const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,read,receipt}=require('./purchase-receipts-fixture.cjs');
const {authDatabase}=require('./auth-test-db.cjs');
const {upgrade}=require('./consumables-upgrade-fixture.cjs');
const object=ext=>randomUUID()+'/'+randomUUID()+'.'+ext;
const upload=(f,actor,name,bucket='purchase-receipts')=>f.query(actor,'insert into storage.objects(bucket_id,name) values($1,$2) returning name',[bucket,name]);
const visible=async(f,actor,bucket='purchase-receipts')=>(await f.query(actor,'select name from storage.objects where bucket_id=$1 order by name',[bucket])).rows.map(r=>r.name);
const baseline=async(f,file)=>(await f.db.exec(read(file))).find(result=>result.rows?.[0]?.equipment_preservation_baseline).rows[0].equipment_preservation_baseline;
const rollback=async f=>f.db.exec('rollback');

test('receipt-only migration preserves complete equipment baseline and all stored records, including cleanup and helper OIDs',async()=>{
 const f=await fixture();try{
  const linked='TOOL-001/'+randomUUID()+'.png',pending='TOOL-001/'+randomUUID()+'.jpg';
  await upload(f,f.actors.admin,linked,'equipment-photos');await upload(f,f.actors.admin,pending,'equipment-photos');
  await f.query(f.actors.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+linked,'TOOL-001']);
  await f.db.exec("insert into storage.buckets(id,name,public) values('unrelated-private','unrelated-private',false);insert into storage.objects(bucket_id,name) values('unrelated-private','preserved-file');create policy unrelated_service_only on storage.objects for select to service_role using(true)");
  const before=await baseline(f,'supabase/purchase-receipts-preflight.sql');
  const allObjects=(await f.db.query('select * from storage.objects order by id')).rows;
  const oldPolicies=(await f.db.query("select * from pg_policies where schemaname='storage' order by policyname")).rows;
  const preserved={};for(const table of ['equipment','consumables','consumable_requests','consumable_stock_movements','mcpa_movements','mcpa_movement_operations','profiles'])preserved[table]=(await f.db.query('select * from '+table+' order by 1')).rows;
  await f.db.exec(receipt);
  assert.deepEqual(await baseline(f,'supabase/purchase-receipts-verification.sql'),before);
  assert.deepEqual((await f.db.query('select * from storage.objects order by id')).rows,allObjects);
  assert.deepEqual((await f.db.query("select * from pg_policies where schemaname='storage' and policyname not like 'mcpa_purchase_receipts_%' order by policyname")).rows,oldPolicies);
  for(const [table,rows]of Object.entries(preserved))assert.deepEqual((await f.db.query('select * from '+table+' order by 1')).rows,rows,table);
  const bucket=(await f.db.query("select * from storage.buckets where id='purchase-receipts'")).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,10485760);assert.deepEqual(bucket.allowed_mime_types,['application/pdf','image/jpeg','image/png','image/webp']);
  assert.equal((await f.query(f.actors.admin,'delete from storage.objects where name=$1 returning name',[linked])).rows.length,0);
  assert.equal((await f.query(f.actors.admin,'delete from storage.objects where name=$1 returning name',[pending])).rows.length,1);
  assert.ok((await visible(f,f.actors.sky,'equipment-photos')).includes(linked));
  assert.equal((await f.db.query("select to_regclass('public.mcpa_purchases') table_name")).rows[0].table_name,null);
 }finally{await f.close();}
});
test('Admin/Secretary receipt INSERT/SELECT, strict paths and immutable objects follow current role and identity rules',async()=>{
 const f=await fixture();try{
  await f.db.exec(receipt);const names=[];
  for(const actor of [f.actors.admin,f.actors.secretary])for(const ext of ['pdf','jpg','png','webp']){const name=object(ext);names.push(name);await upload(f,actor,name);}
  for(const actor of [f.actors.admin,f.actors.secretary]){
   assert.deepEqual(await visible(f,actor),names.toSorted());
   assert.equal((await f.query(actor,"update storage.objects set metadata='{}'::jsonb where bucket_id='purchase-receipts' returning id")).rows.length,0);
   assert.equal((await f.query(actor,"delete from storage.objects where bucket_id='purchase-receipts' returning id")).rows.length,0);
  }
  for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect,f.actors.handler,f.actors.inactive,null]){
   assert.deepEqual(await visible(f,actor),[]);await assert.rejects(upload(f,actor,object('pdf')),{code:'42501'});
  }
  for(const name of [null,'',object('svg'),object('jpeg'),object('exe'),'../'+object('pdf'),object('pdf')+'/more',object('pdf')+'\n',randomUUID()+'/not-a-uuid.pdf',randomUUID()+'/a/'+randomUUID()+'.pdf',object('pdf').toUpperCase()]){
   assert.equal((await f.query(f.actors.admin,'select mcpa_can_access_purchase_receipt($1) allowed',[name])).rows[0].allowed,false);
   if(name!==null)await assert.rejects(upload(f,f.actors.admin,name),{code:'42501'});
  }
  await assert.rejects(f.query(null,'select mcpa_can_access_purchase_receipt($1)',[names[0]]),{code:'42501'});
  await assert.rejects(upload(f,f.actors.secretary,names[0]),{code:'23505'});
  await f.db.query("update profiles set account_status='inactive' where id=$1",[f.actors.admin.id]);
  assert.deepEqual(await visible(f,f.actors.admin),[]);await assert.rejects(upload(f,f.actors.admin,object('png')),{code:'42501'});
 }finally{await f.close();}
});
test('new storage satisfies existing purchase ledger before SKU/archive; snapshots, receipts and historical links remain compatible',async()=>{
 const f=await fixture();try{
  await f.db.exec(receipt);await f.db.exec(read('supabase/migrations/202610100005_purchase_ledger.sql'));
  const itemId=randomUUID(),requestId=randomUUID();
  await f.query(f.actors.admin,"select consumables_save_item($1,null,'Receipt test discs','pcs',20,100)",[itemId]);
  await f.query(f.actors.secretary,"select consumables_create_request($1,$2,5,'Verified secretary','Staging-only request',null)",[requestId,itemId]);
  const id=randomUUID(),path=id+'/'+randomUUID()+'.pdf';await upload(f,f.actors.secretary,path);
  const args={p_id:id,p_version:null,p_operation_id:randomUUID(),p_record:{supplier:'Fixture supplier',reference:'RECEIPT-1',purchase_date:'2026-10-23',request_id:requestId,receipt_path:path,items:[{description:'Fixture discs',quantity:'1',unit_price:'10'}],notes:'Local fixture'}};
  const saved=await f.rpc(f.actors.secretary,'mcpa_save_purchase',args);assert.equal(saved.receipt_path,path);
  const purchaseBefore=(await f.db.query('select * from mcpa_purchases')).rows,historyBefore=(await f.db.query('select * from mcpa_purchase_history')).rows;
  await upgrade(f);
  assert.deepEqual((await f.db.query('select * from mcpa_purchases')).rows,purchaseBefore);assert.deepEqual((await f.db.query('select * from mcpa_purchase_history')).rows,historyBefore);
  const snapshot=await f.rpc(f.actors.admin,'mcpa_purchase_snapshot');
  for(const field of ['purchases','history','requests'])assert.ok(Array.isArray(snapshot[field]));
  assert.equal(snapshot.purchases[0].receipt_path,path);assert.equal(snapshot.purchases[0].request_id,requestId);assert.equal(snapshot.requests[0].consumable_archived,false);
  assert.equal(snapshot.requests[0].item_code,null);assert.equal(snapshot.requests[0].specification,null);
  assert.equal((await f.db.query('select current_stock from consumables where id=$1',[itemId])).rows[0].current_stock,'100.000');
  assert.deepEqual(await f.rpc(f.actors.secretary,'mcpa_save_purchase',args),saved);
  const wrong={...args,p_id:randomUUID(),p_operation_id:randomUUID(),p_record:{...args.p_record,reference:'WRONG-PATH'}};
  await assert.rejects(f.rpc(f.actors.admin,'mcpa_save_purchase',wrong),{code:'22023'});
 }finally{await f.close();}
});
test('unsafe PUBLIC/inherited policies or changed equipment predicate abort without replacing any existing access',async()=>{
 const f=await fixture();try{
  const checks=[
   "create policy unsafe_public on storage.objects for select to public using(true)",
   "create role inherited_storage;grant inherited_storage to authenticated;create policy unsafe_inherited on storage.objects for all to inherited_storage using(true) with check(true)",
   "create policy unsafe_bucket_edit on storage.buckets for update to authenticated using(true) with check(true)",
   "alter policy mcpa_equipment_photos_discard on storage.objects using(true)"
  ];
  for(const [index,setup]of checks.entries()){
   await f.db.exec(setup);
   const policies=(await f.db.query("select * from pg_policies where schemaname='storage' order by policyname")).rows;
   await assert.rejects(f.db.exec(receipt),/Storage (policy|bucket mutation policies)/);await rollback(f);
   assert.equal((await f.db.query("select count(*) n from storage.buckets where id='purchase-receipts'")).rows[0].n,0);
   assert.deepEqual((await f.db.query("select * from pg_policies where schemaname='storage' order by policyname")).rows,policies);
   if(index===0)await f.db.exec('drop policy unsafe_public on storage.objects');
   else if(index===1)await f.db.exec('drop policy unsafe_inherited on storage.objects;revoke inherited_storage from authenticated;drop role inherited_storage');
   else if(index===2)await f.db.exec('drop policy unsafe_bucket_edit on storage.buckets');
   else await f.db.exec("alter policy mcpa_equipment_photos_discard on storage.objects using(bucket_id='equipment-photos' and public.mcpa_can_discard_equipment_photo(name))");
  }
  await f.db.exec('grant authenticated to anon');
  await assert.rejects(f.db.exec(receipt),/Anonymous role must not inherit/);await rollback(f);
  await f.db.exec('revoke authenticated from anon');
 }finally{await f.close();}
});
test('existing receipt helpers/overloads/policies/buckets and objects fail closed; migration never overwrites reviewed or unknown artifacts',async()=>{
 const f=await fixture();try{
  const setups=[
   ["create function public.mcpa_can_access_purchase_receipt(integer) returns boolean language sql as $$select true$$",/helper already exists/],
   ["create function public.mcpa_can_access_purchase_receipt(text) returns boolean language sql as $$select true$$",/helper already exists/],
   ["create policy mcpa_purchase_receipts_read on storage.objects for select to authenticated using(true)",/policies already exist/],
   ["insert into storage.buckets values('purchase-receipts','purchase-receipts',true,10485760,array['application/pdf'])",/incompatible settings/],
   ["insert into storage.buckets values('purchase-receipts','purchase-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);insert into storage.objects(bucket_id,name) values('purchase-receipts','preserved-existing-object')",/bucket already exists/],
   ["insert into storage.buckets values('other-id','purchase-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])",/incompatible settings/]
  ];
  for(const [setup,error]of setups){
   await f.db.exec(setup);const before=await baseline(f,'supabase/purchase-receipts-preflight.sql');
   await assert.rejects(f.db.exec(receipt),error);await rollback(f);
   assert.deepEqual(await baseline(f,'supabase/purchase-receipts-preflight.sql'),before);
   // Clean up only isolated fixture artifacts to exercise the next conflict.
   if(setup.startsWith('create function'))await f.db.exec('drop function public.mcpa_can_access_purchase_receipt('+ (setup.includes('(integer)')?'integer':'text') +')');
   else if(setup.startsWith('create policy'))await f.db.exec('drop policy mcpa_purchase_receipts_read on storage.objects');
   else await f.db.exec("delete from storage.objects where bucket_id='purchase-receipts';delete from storage.buckets where name='purchase-receipts'");
  }
  await f.db.exec(receipt);const existing=(await f.db.query('select * from storage.buckets order by id')).rows;
  await assert.rejects(f.db.exec(receipt),/helper already exists/);await rollback(f);
  assert.deepEqual((await f.db.query('select * from storage.buckets order by id')).rows,existing);
 }finally{await f.close();}
});
test('missing service/auth prerequisites and disabled RLS abort without granting or inventing service tables',async()=>{
 const f=await authDatabase();try{
  await assert.rejects(f.db.exec(receipt),/Supabase Storage are required/);await rollback(f);
  assert.equal((await f.db.query("select to_regclass('storage.objects') r")).rows[0].r,null);
 }finally{await f.close();}
 const g=await fixture();try{
  await g.db.exec('alter table storage.objects disable row level security');
  await assert.rejects(g.db.exec(receipt),/RLS must already be enabled/);await rollback(g);
  assert.equal((await g.db.query("select count(*) n from storage.buckets where id='purchase-receipts'")).rows[0].n,0);
  await g.db.exec('alter table storage.objects enable row level security;alter table storage.objects owner to authenticated');
  await assert.rejects(g.db.exec(receipt),/Storage table ownership/);await rollback(g);
 }finally{await g.close();}
});
test('modified authentication helper definitions stop installation without rewriting authentication',async()=>{
 const f=await fixture();try{
  await f.db.exec('create or replace function public.mcpa_has_role(roles text[]) returns boolean language sql stable security definer set search_path=\'\' as $$select true$$');
  const before=(await f.db.query("select pg_get_functiondef('public.mcpa_has_role(text[])'::regprocedure) definition")).rows;
  await assert.rejects(f.db.exec(receipt),/helper definition differs/);await rollback(f);
  assert.deepEqual((await f.db.query("select pg_get_functiondef('public.mcpa_has_role(text[])'::regprocedure) definition")).rows,before);
  assert.equal((await f.db.query("select count(*) n from storage.buckets where id='purchase-receipts'")).rows[0].n,0);
 }finally{await f.close();}
});
