// In-memory PostgreSQL (PGlite); never connects to Supabase or reads credentials.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('../auth-test-db.cjs');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8');
const migration=read('202610250002_custody_lifecycle.sql');
async function fixture(t,{apply=true}={}){
  const f=await authDatabase({engineerPortal:true});
  if(t)t.after(()=>f.close());
  await f.db.exec(read('202610100004_movement_cancellation.sql'));
  await f.db.exec(read('202610100006_monitoring.sql'));
  await require('../office-return-fixture.cjs').configure(f);
  await f.db.exec(read('202610200001_verified_request_inventory.sql'));
  await f.db.exec(`create schema storage; grant usage on schema storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb default '{}'::jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  f.actors.admin2={id:randomUUID(),authId:randomUUID(),name:'Second Admin',role:'admin'};
  const a=f.actors.admin2;
  await f.db.query('insert into auth.users(id) values($1)',[a.authId]);
  await f.db.query("insert into profiles(id,name,auth_user_id,role,account_status) values($1,$2,$3,'admin','active')",[a.id,a.name,a.authId]);
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.pau.id,f.sites.main]);
  f.bRpc=async(actor,name,args=[])=>{
    if(!['mcpa_b_action','mcpa_b_snapshot','mcpa_b_lookup','mcpa_b_evidence_action','mcpa_b_storage_allowed'].includes(name))throw Error('Unknown fixture RPC');
    return (await f.query(actor,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
  };
  f.action=(actor,action,payload,op=randomUUID())=>f.bRpc(actor,'mcpa_b_action',[action,JSON.stringify(payload),op]);
  f.snapshot=actor=>f.bRpc(actor,'mcpa_b_snapshot');
  f.lookup=(actor,ref,intent='return')=>f.bRpc(actor,'mcpa_b_lookup',[ref,intent]);
  f.evidence=(actor,action,payload,op)=>f.bRpc(actor,'mcpa_b_evidence_action',[action,JSON.stringify(payload),op]);
  f.tool=async id=>(await f.db.query('select * from equipment where asset_id=$1',[id])).rows[0];
  f.submit=(ids=['TOOL-002'],op=randomUUID())=>f.action(f.actors.sky,'submitReturn',{assetIds:ids,destinationId:f.sites.office,notes:'Physical return'},op);
  f.inspect=(id,inspections,op=randomUUID())=>f.action(f.actors.admin,'inspectReturn',{id,inspections},op);
  f.upload=async(actor,ticket,mime='image/png',size=8)=>f.query(actor,
    'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) returning name',
    ['mcpa-movement-evidence-v2',ticket.objectName,JSON.stringify({mimetype:mime,size})]);
  if(apply)await f.db.exec(migration);
  return f;
}
module.exports={fixture,migration,root,randomUUID};
