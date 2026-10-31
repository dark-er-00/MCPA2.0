const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {database}=require('./movement-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610040001_authenticated_access.sql'),'utf8');
async function authDatabase({accountManagement=true,engineerPortal=false,missingProjectHistory=false}={}){
  const fixture=await database(),{db,actors,sites}=fixture;
  await db.exec(`create role service_role nologin; grant usage on schema public to service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,invited_at timestamptz,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb,raw_app_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../1-admin/modules/consumables/setup.sql'),'utf8'));
  await db.exec(migration);
  for(const [key,role] of [['architect','architect'],['secretary','secretary'],['handler','tool_handler'],['inactive','engineer']]){
    actors[key]={id:randomUUID(),name:'Test '+key,role};
    await db.query('insert into public.profiles(id,name) values($1,$2)',[actors[key].id,actors[key].name]);
  }
  for(const [key,actor] of Object.entries(actors)){
    actor.authId=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor.authId,key+'@example.test']);
    await db.query('update profiles set auth_user_id=$1,role=$2,account_status=$3 where id=$4',[actor.authId,actor.role,key==='inactive'?'inactive':'active',actor.id]);
  }
  await db.query('update sites set assigned_engineer_id=$1 where id=$2',[actors.sky.id,sites.casa]);
  for (const file of accountManagement ? ['202610060001_account_management.sql','202610060002_recipient_identity.sql','202610060003_development_accounts.sql'] : []) {
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  }
  // Isolated reproduction of the reviewed live schema, never run against Supabase.
  if(missingProjectHistory)await db.exec(`
    drop trigger project_history_capture on public.sites;
    drop table public.project_history;
    drop function public.project_record_history();
    drop function public.project_history_immutable();
    update public.sites set phase='Planning Phase';
    alter table public.sites alter column phase set default 'Planning Phase';
    alter table public.sites drop constraint sites_phase_check;
    alter table public.sites add constraint sites_phase_check check(char_length(btrim(phase)) between 1 and 80);
    alter table public.sites alter column is_active drop not null;
  `);
  if(engineerPortal)await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100001_engineer_portal.sql'),'utf8'));
  let queue=Promise.resolve();
  function query(actor,sql,params=[]){
    const run=async()=>{
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor?.authId||'']);
      await db.exec('set role '+(actor?'authenticated':'anon'));
      try{return await db.query(sql,params);}finally{await db.exec('reset role');}
    };
    const result=queue.then(run);queue=result.catch(()=>{});return result;
  }
  const rpc=async(actor,name,args={})=>{
    const allowed={mcpa_inventory_office:[],mcpa_return_destination:[],mcpa_my_profile:[],mcpa_movement_snapshot:[],mcpa_personal_equipment_snapshot:[],mcpa_project_snapshot:[],mcpa_create_receiving_qr:['p_site_id'],mcpa_resolve_receiving_qr:['p_token'],mcpa_revoke_receiving_qr:['p_token'],mcpa_accounts:[],mcpa_movement_action:['p_action','p_payload','p_operation_id'],mcpa_save_account:['p_id','p_name','p_role','p_status','p_auth_user_id'],mcpa_purchase_snapshot:[],mcpa_save_purchase:['p_id','p_version','p_operation_id','p_record'],mcpa_monitoring_snapshot:[],mcpa_monitoring_mark_read:['p_id'],mcpa_monitoring_report:['p_start','p_end']};
    Object.assign(allowed,{
      mcpa_import_equipment:['p_operation_id','p_rows'],
      mcpa_save_project:['p_id','p_version','p_operation_id','p_patch','p_reason'],
      mcpa_add_site_update:['p_project_id','p_operation_id','p_type','p_description','p_work_area','p_correction_of'],
      consumables_save_item:['p_id','p_version','p_name','p_unit','p_minimum','p_opening',...(Object.hasOwn(args,'p_category')?['p_category','p_specification','p_item_code']:[])],
      consumables_adjust_stock:['p_operation_id','p_item_id','p_version','p_kind','p_quantity','p_note'],
      consumables_create_request:['p_id','p_item_id','p_quantity','p_requester','p_purpose','p_needed_by'],
      consumables_receive_request:['p_operation_id','p_request_id','p_version','p_quantity','p_note'],
      consumables_cancel_request:['p_request_id','p_version','p_reason']
    });
    if(!allowed[name])throw new Error('Unknown test RPC');
    const keys=allowed[name];const result=await query(actor,`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,keys.map(key=>args[key]??null));return result.rows[0].value;
  };
  // Only isolated tests use the scheduler identity, serialized with browser RPCs.
  function serviceRpc(name) {
    if(!['mcpa_capture_inventory_snapshot','mcpa_generate_monitoring'].includes(name))return Promise.reject(new Error('Unknown scheduler test RPC'));
    const run=async()=>{
      await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role');
      try{return (await db.query(`select public.${name}() as value`)).rows[0].value;}finally{await db.exec('reset role');}
    };
    const result=queue.then(run);queue=result.catch(()=>{});return result;
  }
  return {...fixture,query,rpc,serviceRpc,migration};
}
module.exports={authDatabase,migration};
