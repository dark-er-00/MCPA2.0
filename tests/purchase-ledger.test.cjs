// Actual SQL/RLS in isolated PostgreSQL. No production endpoints or records.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
async function fixture(){
 const f=await authDatabase();
 await f.db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
 alter table storage.objects enable row level security;alter table storage.buckets enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
 for(const file of ['202610210001_equipment_photo_compatibility.sql','202610230001_purchase_receipts_compatibility.sql'])await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100005_purchase_ledger.sql'),'utf8'));
 f.save=async(actor,id,version,op,record)=>(await f.query(actor,'select public.mcpa_save_purchase($1,$2,$3,$4) as value',[id,version,op,record])).rows[0].value;
 f.snapshot=async actor=>(await f.query(actor,'select public.mcpa_purchase_snapshot() as value')).rows[0].value;
 return f;
}
const record=()=>({supplier:'Fixture supplier',reference:'INV-001',purchase_date:'2026-10-10',items:[{description:'Cutting discs',quantity:'2.500',unit_price:'10.25'},{description:'Drill bit',quantity:'1',unit_price:'20.00'}],notes:'Isolated fixture'});
test('Ledger maintains receipts and immutable history, deduplicates retries, and never changes material stock or protected movements',async()=>{
 const f=await fixture(),a=f.actors;
 try{
  await f.rpc(a.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected local fixture'},p_operation_id:randomUUID()});
  const consumable=randomUUID(),request=randomUUID();
  await f.db.query("insert into consumables(id,name,unit,current_stock) values($1,'Fixture discs','pcs',8)",[consumable]);
  await f.db.query("insert into consumable_requests(id,consumable_id,item_name,unit,quantity,requester,purpose) values($1,$2,'Fixture discs','pcs',5,'Secretary','Fixture procurement')",[request,consumable]);
  const preserved={};for(const table of ['equipment','profiles','sites','mcpa_movements','mcpa_movement_operations','mcpa_movement_reservations','consumables','consumable_requests','consumable_stock_movements'])preserved[table]=(await f.db.query('select * from '+table+' order by 1')).rows;
  const id=randomUUID(),op=randomUUID(),input={...record(),request_id:request};
  const receipt=id+'/'+randomUUID()+'.pdf';
  await f.query(a.secretary,"insert into storage.objects(bucket_id,name) values('purchase-receipts',$1)",[receipt]);input.receipt_path=receipt;
  const saved=await f.save(a.secretary,id,null,op,input);assert.equal(Number(saved.total),45.63);assert.equal(saved.receipt_path,receipt);
  assert.deepEqual(await f.save(a.secretary,id,null,op,input),saved);
  await assert.rejects(f.save(a.secretary,id,null,op,{...input,notes:'Different retry'}),{code:'40001'});
  const edit={...input,notes:'Updated note'};delete edit.receipt_path;
  const updated=await f.save(a.admin,id,1,randomUUID(),edit);assert.equal(updated.version,2);assert.equal(updated.receipt_path,receipt);
  await assert.rejects(f.save(a.secretary,id,1,randomUUID(),edit),{code:'40001'});
  const snapshot=await f.snapshot(a.admin);assert.equal(snapshot.purchases[0].delivery_status,'pending');assert.equal(snapshot.history.length,2);
  assert.equal(snapshot.history[0].before_record.receipt_path,receipt);assert.equal(snapshot.history[0].after_record.notes,'Updated note');
  assert.equal((await f.query(a.secretary,"select name from storage.objects where bucket_id='purchase-receipts'")).rows.length,1);
  for(const table of Object.keys(preserved))assert.deepEqual((await f.db.query('select * from '+table+' order by 1')).rows,preserved[table],table+' remains unchanged');
  await assert.rejects(f.db.exec('update mcpa_purchase_history set created_at=now()'),{code:'42501'});
  await assert.rejects(f.db.exec('delete from mcpa_purchase_history'),{code:'42501'});
  await assert.rejects(f.db.exec('truncate mcpa_purchase_history'),{code:'42501'});
 }finally{await f.close();}
});
test('Ledger rejects unauthorized roles, duplicates, invalid money/quantities and foreign purchase receipts',async()=>{
 const f=await fixture(),a=f.actors;
 try{
  const id=randomUUID();await f.save(a.admin,id,null,randomUUID(),record());
  for(const actor of [a.sky,a.pau,a.architect,a.handler,a.inactive,null]){
   await assert.rejects(f.save(actor,randomUUID(),null,randomUUID(),record()),{code:'42501'});
   await assert.rejects(f.snapshot(actor),{code:'42501'});
   if(actor)assert.equal((await f.query(actor,'select * from mcpa_purchases')).rows.length,0);
   else await assert.rejects(f.query(actor,'select * from mcpa_purchases'),{code:'42501'});
  }
  await assert.rejects(f.query(a.secretary,"update mcpa_purchases set notes='Bypass'"),{code:'42501'});
  await assert.rejects(f.save(a.admin,randomUUID(),null,randomUUID(),record()),{code:'23505'});
  for(const changes of [{quantity:'0'},{quantity:'-1'},{quantity:'1.0001'},{quantity:'NaN'},{unit_price:'1.001'},{unit_price:'-5'},{unit_price:'1e9'}]){
   const input={...record(),reference:randomUUID(),items:[{...record().items[0],...changes}]};
   await assert.rejects(f.save(a.admin,randomUUID(),null,randomUUID(),input),{code:'22023'});
  }
  await assert.rejects(f.save(a.admin,randomUUID(),null,randomUUID(),{...record(),reference:'BAD-RECEIPT',receipt_path:id+'/'+randomUUID()+'.pdf'}),{code:'22023'});
  assert.equal((await f.snapshot(a.admin)).purchases.length,1);
 }finally{await f.close();}
});
