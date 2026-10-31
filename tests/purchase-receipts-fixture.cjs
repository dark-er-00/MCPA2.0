// Isolated reproduction of the confirmed split Storage deployment. No legacy
// feature_storage.sql execution and no network/production access.
const fs=require('node:fs'),path=require('node:path');
const {authDatabase}=require('./auth-test-db.cjs');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
const receipt=read('supabase/migrations/202610230001_purchase_receipts_compatibility.sql');
async function installStorage(f){
 await f.db.exec(`create schema storage;grant usage on schema storage to anon,authenticated;
  create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb default '{}'::jsonb,unique(bucket_id,name));
  alter table storage.objects enable row level security;alter table storage.buckets enable row level security;
  grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 await f.db.exec(read('supabase/migrations/202610210001_equipment_photo_compatibility.sql'));
}
async function fixture(){const f=await authDatabase();await installStorage(f);return f;}
module.exports={fixture,installStorage,read,receipt};
