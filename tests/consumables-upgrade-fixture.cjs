const fs=require('node:fs'),path=require('node:path');
const {authDatabase}=require('./auth-test-db.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migrations=['202610220000_consumable_categories.sql','202610220001_consumables_skus.sql','202610220002_consumables_archive.sql'];
const seed=read('documentation/consumables-upgrade-2026-10-22/03-catalog-seed.sql');
async function createSample(f){
 const actor=f.actors.admin;
 let item=await rpc(f,actor,'consumables_save_item',{p_id:'c3f58442-dc99-4466-8590-16642abdb7bc',p_version:null,p_name:'Cutting Disc',p_unit:'pieces',p_minimum:120,p_opening:30});
 for(const [kind,quantity] of [['usage',10],['restock',10],['usage',6]])item=await rpc(f,actor,'consumables_adjust_stock',{
  p_operation_id:require('node:crypto').randomUUID(),p_item_id:item.id,p_version:item.version,p_kind:kind,p_quantity:quantity,p_note:'Isolated reproduction of reviewed sample'});
 return item;
}
async function upgrade(f){for(const file of migrations)await f.db.exec(read('supabase/migrations/'+file));}
async function fixture({ledger=false}={}){
 const f=await authDatabase();
 if(ledger){
  await f.db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
   alter table storage.objects enable row level security;alter table storage.buckets enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  for(const file of ['202610210001_equipment_photo_compatibility.sql','202610230001_purchase_receipts_compatibility.sql','202610100005_purchase_ledger.sql'])await f.db.exec(read('supabase/migrations/'+file));
 }
 await upgrade(f);return f;
}
function rpc(f,actor,name,args){
 if(!/^consumables_[a-z_]+$/.test(name))throw Error('Invalid test RPC');
 const keys=Object.keys(args);
 return f.query(actor,`select to_jsonb(public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')})) value`,Object.values(args)).then(r=>r.rows[0].value);
}
module.exports={fixture,upgrade,seed,rpc,read,createSample};
