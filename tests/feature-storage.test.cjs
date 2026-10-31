// Storage SQL authorization only, with a local PostgreSQL fixture. No network,
// Auth account changes, live transactions or real Storage uploads are performed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100003_feature_storage.sql'),'utf8');

async function fixture(){
  const f=await authDatabase();
  // Model the Storage service's existing table grants and RLS. MIME/size
  // enforcement and signed URL behavior require separate real-service validation.
  await f.db.exec(`create schema storage;
    grant usage on schema storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb default '{}'::jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  f.upload=(actor,bucket,name)=>f.query(actor,'insert into storage.objects(bucket_id,name) values($1,$2) returning name',[bucket,name]);
  f.visible=async(actor,bucket)=>(await f.query(actor,'select name from storage.objects where bucket_id=$1 order by name',[bucket])).rows.map(row=>row.name);
  f.helper=async(actor,name,object)=>(await f.query(actor,`select public.${name}($1) as allowed`,[object])).rows[0].allowed;
  return f;
}

test('Private attachment policies preserve records, scope photos by actual custody and retain immutable files',async()=>{
  const f=await fixture(),{db,actors:a}=f;
  try{
    const protectedRequest=await f.rpc(a.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected isolated request'},p_operation_id:randomUUID()});
    assert.equal(protectedRequest.id,'REQ-00001');
    const preserved={};
    for(const table of ['profiles','sites','mcpa_movements','mcpa_movement_operations','mcpa_movement_reservations','consumable_requests'])preserved[table]=(await db.query(`select * from public.${table} order by 1`)).rows;
    const equipmentBefore=(await db.query('select to_jsonb(e) as value from equipment e order by id')).rows;
    const verification=(await db.exec(migration)).at(-1).rows[0].feature_storage_verification;
    assert.equal(verification.private_buckets,true);
    assert.equal(verification.equipment_photo_column,true);
    assert.equal(verification.anonymous_helper_access,false);
    assert.equal(verification.immutable_objects,true);
    assert.deepEqual((await db.query("select to_jsonb(e)-'image_url' as value from equipment e order by id")).rows,equipmentBefore);
    for(const [table,before]of Object.entries(preserved))assert.deepEqual((await db.query(`select * from public.${table} order by 1`)).rows,before,table+' unchanged');
    const buckets=(await db.query('select * from storage.buckets order by id')).rows;
    assert.equal(buckets[0].file_size_limit,5242880);
    assert.deepEqual(buckets[0].allowed_mime_types,['image/jpeg','image/png','image/webp']);
    assert.equal(buckets[1].file_size_limit,10485760);
    assert.deepEqual(buckets[1].allowed_mime_types,['application/pdf','image/jpeg','image/png','image/webp']);

    const heldPhoto='TOOL-002/'+randomUUID()+'.jpg',replacement='TOOL-002/'+randomUUID()+'.webp';
    const availablePhoto='TOOL-001/'+randomUUID()+'.png',staged='NEW-ITEM/'+randomUUID()+'.png';
    for(const object of [heldPhoto,availablePhoto,staged])await f.upload(a.admin,'equipment-photos',object);
    assert.equal((await f.visible(a.admin,'equipment-photos')).length,3,'Admin can preview staged uploads');
    for(const actor of [a.sky,a.pau,a.architect,a.secretary,a.handler,a.inactive,null]){
      await assert.rejects(f.upload(actor,'equipment-photos','TOOL-002/'+randomUUID()+'.jpg'),error=>error.code==='42501');
      assert.deepEqual(await f.visible(actor,'equipment-photos'),[],'Unlinked files remain private');
    }
    for(const invalid of ['../'+randomUUID()+'.jpg','TOOL-002/not-a-uuid.jpg','TOOL-002/'+randomUUID()+'.svg','TOOL-002/'+randomUUID()+'.pdf','TOOL-002/a/'+randomUUID()+'.png']){
      await assert.rejects(f.upload(a.admin,'equipment-photos',invalid),error=>error.code==='42501');
    }
    await f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+heldPhoto,'TOOL-002']);
    await f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+availablePhoto,'TOOL-001']);
    assert.deepEqual(await f.visible(a.sky,'equipment-photos'),[availablePhoto,heldPhoto].sort());
    assert.deepEqual(await f.visible(a.pau,'equipment-photos'),[availablePhoto]);
    assert.deepEqual(await f.visible(a.architect,'equipment-photos'),[availablePhoto]);
    assert.deepEqual(await f.visible(a.handler,'equipment-photos'),[availablePhoto,heldPhoto].sort());
    for(const actor of [null,a.secretary,a.inactive])assert.deepEqual(await f.visible(actor,'equipment-photos'),[]);
    for(const actor of [a.sky,a.architect,a.secretary])assert.equal((await f.query(actor,"update equipment set image_url='forged' returning id")).rows.length,0,'Unauthorized metadata update denied');
    await assert.rejects(f.query(null,"update equipment set image_url='forged'"),error=>error.code==='42501');
    await assert.rejects(f.helper(null,'mcpa_can_read_equipment_photo',heldPhoto),error=>error.code==='42501');
    assert.equal(await f.helper(a.inactive,'mcpa_can_read_equipment_photo',heldPhoto),false);
    await assert.rejects(f.query(a.sky,'select mcpa_auth_private.identity()'),error=>error.code==='42501','No private-schema browser grant');

    // Replacing a reference never overwrites or deletes its prior object.
    await f.upload(a.admin,'equipment-photos',replacement);
    await assert.rejects(f.query(a.handler,'update equipment set image_url=$1 where asset_id=$2 returning id',['storage://equipment-photos/'+replacement,'TOOL-002']),error=>error.code==='42501','Managed reference replacement requires Admin');
    await f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+replacement,'TOOL-002']);
    assert.deepEqual(await f.visible(a.sky,'equipment-photos'),[availablePhoto,replacement].sort());
    assert.equal((await f.visible(a.admin,'equipment-photos')).length,4,'Original still retained');
    await assert.rejects(f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/../'+randomUUID()+'.jpg','TOOL-001']),error=>error.code==='22023','Invalid managed reference denied');
    await assert.rejects(f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/TOOL-002/'+randomUUID()+'.jpg','TOOL-002']),error=>error.code==='22023','Missing object denied');
    await f.query(a.handler,'update equipment set image_url=$1 where asset_id=$2',['https://example.test/legacy.jpg','TOOL-003']);
    assert.equal((await f.query(a.handler,"update equipment set name='Metadata edit retained' where asset_id='TOOL-002' returning id")).rows.length,1,'Non-photo metadata remains editable');
    await db.query('update equipment set asset_id=$1 where asset_id=$2',['LEGACY /工具','TOOL-005']);
    const legacyPhoto='asset-'+randomUUID()+'/'+randomUUID()+'.png';
    await f.upload(a.admin,'equipment-photos',legacyPhoto);
    await f.query(a.admin,'update equipment set image_url=$1 where asset_id=$2',['storage://equipment-photos/'+legacyPhoto,'LEGACY /工具']);
    assert.ok((await f.visible(a.sky,'equipment-photos')).includes(legacyPhoto),'Safe fallback folder for legacy identifier resolves through actual custody');
    const storedObjects=(await db.query('select * from storage.objects order by id')).rows;
    for(const actor of [a.admin,a.handler,a.sky]){
      assert.equal((await f.query(actor,"update storage.objects set metadata='{}'::jsonb returning id")).rows.length,0);
      assert.equal((await f.query(actor,'delete from storage.objects returning id')).rows.length,0);
    }
    await assert.rejects(f.upload(a.admin,'equipment-photos',replacement),error=>error.code==='23505','A duplicate path cannot overwrite the file');
    assert.deepEqual((await db.query('select * from storage.objects order by id')).rows,storedObjects);

    const receipt=randomUUID()+'/'+randomUUID()+'.pdf';
    await f.upload(a.secretary,'purchase-receipts',receipt);
    assert.deepEqual(await f.visible(a.admin,'purchase-receipts'),[receipt]);
    assert.deepEqual(await f.visible(a.secretary,'purchase-receipts'),[receipt]);
    await f.upload(a.admin,'purchase-receipts',randomUUID()+'/'+randomUUID()+'.jpg');
    for(const actor of [a.sky,a.pau,a.architect,a.handler,a.inactive,null]){
      assert.deepEqual(await f.visible(actor,'purchase-receipts'),[]);
      await assert.rejects(f.upload(actor,'purchase-receipts',randomUUID()+'/'+randomUUID()+'.pdf'),error=>error.code==='42501');
    }
    await assert.rejects(f.upload(a.secretary,'purchase-receipts','invalid/'+randomUUID()+'.pdf'),error=>error.code==='42501');
    assert.equal((await f.query(a.secretary,'delete from storage.objects returning id')).rows.length,0);
    const objectsBeforeRepeat=(await db.query('select * from storage.objects order by id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from storage.objects order by id')).rows,objectsBeforeRepeat,'Rerunning does not alter objects');
    for(const [table,before]of Object.entries(preserved))assert.deepEqual((await db.query(`select * from public.${table} order by 1`)).rows,before,table+' still unchanged');
    await db.query("update profiles set account_status='inactive' where id=$1",[a.admin.id]);
    assert.deepEqual(await f.visible(a.admin,'equipment-photos'),[]);
    await assert.rejects(f.upload(a.admin,'equipment-photos','TOOL-001/'+randomUUID()+'.jpg'),error=>error.code==='42501');
  }finally{await f.close();}
});

test('Storage setup refuses existing bucket conflicts and unknown browser policies without weakening them',async()=>{
  const f=await fixture();
  try{
    await f.db.exec("insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('equipment-photos','equipment-photos',true,5242880,array['image/jpeg','image/png','image/webp'])");
    await assert.rejects(f.db.exec(migration),/conflicting privacy/);
    await f.db.exec('rollback');
    assert.equal((await f.db.query("select public from storage.buckets where id='equipment-photos'")).rows[0].public,true,'Existing bucket unchanged');
    assert.equal((await f.db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='equipment' and column_name='image_url'")).rows[0].n,0,'Rejected migration did not add columns');
    await f.db.exec("update storage.buckets set public=false where id='equipment-photos'; create policy legacy_storage_public on storage.objects for select to anon,authenticated using(true)");
    const original=(await f.db.query("select * from pg_policies where schemaname='storage'")).rows;
    await assert.rejects(f.db.exec(migration),/legacy_storage_public requires review/);
    await f.db.exec('rollback');
    assert.deepEqual((await f.db.query("select * from pg_policies where schemaname='storage'")).rows,original,'No existing access policy replaced');
    assert.equal((await f.db.query("select count(*)::int as n from storage.buckets where id='purchase-receipts'")).rows[0].n,0);
  }finally{await f.close();}
});

test('Storage migration requires the real service schema rather than inventing an insecure substitute',async()=>{
  const f=await authDatabase();
  try{
    await assert.rejects(f.db.exec(migration),/Supabase Storage must be installed/);
    await f.db.exec('rollback');
    assert.equal((await f.db.query("select to_regclass('storage.objects') as relation")).rows[0].relation,null);
  }finally{await f.close();}
});
