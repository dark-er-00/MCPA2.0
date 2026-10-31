const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const sql=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
const migration=sql('202610210001_equipment_photo_compatibility.sql');
async function fixture(){
 const f=await authDatabase();
 await f.db.exec(`create schema storage;grant usage on schema storage to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
 return f;
}
test('equipment-only setup is repeatable, retains data, and scopes authorized cleanup to unlinked photos',async()=>{
 const f=await fixture();try{
 const before=(await f.db.query('select to_jsonb(e) as value from equipment e order by id')).rows;
 await f.db.exec(migration);await f.db.exec(migration);
 assert.deepEqual((await f.db.query("select to_jsonb(e)-'image_url' as value from equipment e order by id")).rows,before);
 assert.deepEqual((await f.db.query('select id from storage.buckets')).rows,[{id:'equipment-photos'}]);
 const linked='TOOL-001/'+randomUUID()+'.png',pending='TOOL-001/'+randomUUID()+'.jpg';
 for(const name of [linked,pending])await f.query(f.actors.admin,'insert into storage.objects(bucket_id,name) values($1,$2)',['equipment-photos',name]);
 await f.query(f.actors.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+linked,'TOOL-001']);
 assert.equal((await f.query(f.actors.admin,'delete from storage.objects where name=$1 returning name',[linked])).rows.length,0,'Linked image cannot be deleted');
 for(const actor of [null,f.actors.sky,f.actors.architect,f.actors.handler,f.actors.secretary]){
 assert.equal((await f.query(actor,'select name from storage.objects where name=$1',[pending])).rows.length,0);
 assert.equal((await f.query(actor,'delete from storage.objects where name=$1 returning name',[pending])).rows.length,0);
 }
 assert.equal((await f.query(f.actors.admin,'delete from storage.objects where name=$1 returning name',[pending])).rows.length,1);
 assert.equal((await f.db.query('select image_url from equipment where asset_id=$1',['TOOL-001'])).rows[0].image_url,'storage://equipment-photos/'+linked);
 }finally{await f.close();}
});
test('equipment-only upgrade accepts the reviewed existing photo feature and preserves purchase storage',async()=>{
 const f=await fixture();try{
 await f.db.exec(sql('202610100003_feature_storage.sql'));
 const before=(await f.db.query("select * from storage.buckets where id='purchase-receipts'")).rows;
 await f.db.exec(migration);await f.db.exec(migration);
 assert.deepEqual((await f.db.query("select * from storage.buckets where id='purchase-receipts'")).rows,before);
 }finally{await f.close();}
});
test('alternate photo fields and public buckets abort atomically without schema or policy changes',async()=>{
 const f=await fixture();try{
 await f.db.exec('alter table equipment add column photo_url text');
 await assert.rejects(f.db.exec(migration),/alternate photo column/);await f.db.exec('rollback');
 assert.equal((await f.db.query("select count(*)::int n from information_schema.columns where table_name='equipment' and column_name='image_url'")).rows[0].n,0);
 await f.db.exec("alter table equipment drop column photo_url;insert into storage.buckets values('equipment-photos','equipment-photos',true,5242880,array['image/jpeg','image/png','image/webp'])");
 await assert.rejects(f.db.exec(migration),/bucket conflicts/);await f.db.exec('rollback');
 assert.equal((await f.db.query('select public from storage.buckets')).rows[0].public,true);
 await f.db.exec("delete from storage.buckets;create policy mcpa_equipment_photos_read on storage.objects for select to authenticated using(true)");
 await assert.rejects(f.db.exec(migration),/policy .* needs review/);await f.db.exec('rollback');
 assert.equal((await f.db.query("select qual from pg_policies where policyname='mcpa_equipment_photos_read'")).rows[0].qual,'true','Unmarked policy cannot be overwritten');
 }finally{await f.close();}
});
