const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const read=n=>fs.readFileSync(path.join(__dirname,'../supabase/drafts/admin-pdf',n),'utf8');
async function setup(t){const f=await require('./functionality-audit-v2/fixture.cjs').fixture(t);await require('./project-construction-fixture.cjs').upgrade(f);f.invoke=(actor,name,args=[])=>f.query(actor,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args).then(r=>r.rows[0].value);return f;}
test('removal reader keeps its OID and grants; unknown installed profile bodies fail before changing schema',async t=>{
 const f=await setup(t),before=(await f.db.query("select oid,proacl from pg_proc where oid='public.mcpa_accounts()'::regprocedure")).rows[0];await f.db.exec(read('01-account-removal.sql'));assert.deepEqual((await f.db.query("select oid,proacl from pg_proc where oid='public.mcpa_accounts()'::regprocedure")).rows[0],before);
 await f.db.exec("create or replace function mcpa_my_profile() returns jsonb language sql as $$select '{}'::jsonb$$");await assert.rejects(f.db.exec(read('00-self-profile-compatibility.sql')),/Unreviewed/);await f.db.exec('rollback');
});
test('pending requests without movements block removal, and removed people cannot receive new responsibilities',async t=>{
 const f=await setup(t),a=f.actors;await f.db.exec(read('01-account-removal.sql'));
 const request=randomUUID(),type=(await f.call(a.sky,'mcpa_wa_equipment_catalog')).groups[0];
 await f.db.query("insert into mcpa_wa_equipment_requests(id,requester_id,site_id,type_id,type_name,requested_quantity) values($1,$2,$3,$4,$5,1)",[request,a.architect.id,f.sites.casa,type.type_id,type.type_name]);
 const id=await f.invoke(a.admin,'mcpa_request_account_removal',[a.architect.id,'Synthetic completion',randomUUID()]);await assert.rejects(f.invoke(a.admin2,'mcpa_decide_account_removal',[id,true]),/Resolve assigned/);
 await f.db.query("update mcpa_wa_equipment_requests set status='rejected',rejection_reason='Synthetic closure' where id=$1",[request]);await f.invoke(a.admin2,'mcpa_decide_account_removal',[id,true]);
 await assert.rejects(f.db.query("insert into mcpa_wa_equipment_requests(requester_id,site_id,type_id,type_name,requested_quantity) values($1,$2,$3,$4,1)",[a.architect.id,f.sites.casa,type.type_id,type.type_name]),/Removed accounts/);
 await assert.rejects(f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,f.sites.casa]),/Removed accounts/);
});
test('restrictive photo boundaries survive broad pre-existing Storage policies for Authenticated and Anon',async t=>{
 const f=await setup(t),a=f.actors;await f.db.exec(read('02-profile-pictures.sql'));await f.db.exec('create policy fixture_broad_authenticated on storage.objects for all to authenticated using(true) with check(true);create policy fixture_broad_anon on storage.objects for all to anon using(true) with check(true)');
 const own=a.admin.id+'/'+randomUUID()+'.png',other=a.sky.id+'/'+randomUUID()+'.png';await f.query(a.admin,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-profile-photos',own,{mimetype:'image/png',size:8}]);
 assert.equal((await f.query(a.sky,"select * from storage.objects where bucket_id='mcpa-profile-photos'")).rows.length,0);await assert.rejects(f.query(null,"select * from storage.objects where bucket_id='mcpa-profile-photos'"));
 await assert.rejects(f.query(a.admin,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-profile-photos',other,{mimetype:'image/png',size:8}]));
 assert.equal((await f.query(a.admin,'delete from storage.objects where name=$1 returning name',[own])).rows.length,0);assert.equal((await f.query(a.admin,"update storage.objects set metadata='{}' where name=$1 returning name",[own])).rows.length,0);
});
test('verification activation rejects expired/mismatched identities and pre-link activation bypasses',async t=>{
 const f=await setup(t),a=f.actors;await f.db.exec(read('01-account-removal.sql'));await f.db.exec(read('03-registration-invitations.sql'));
 async function service(name,args){await f.db.exec('set role service_role');try{return(await f.db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}finally{await f.db.exec('reset role');}}
 const i=await service('mcpa_registration_prepare',[a.admin.id,'Held invite','held@example.test','architect','d'.repeat(64)]);await service('mcpa_registration_claim',['d'.repeat(64)]);const auth=randomUUID();await f.db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[auth,'held@example.test',{mcpa_invite_id:i.id}]);
 await assert.rejects(f.rpc(a.admin,'mcpa_save_account',{p_id:null,p_name:'Unverified bypass',p_role:'architect',p_status:'active',p_auth_user_id:auth}),/Verify/);
 const profile=await service('mcpa_registration_finish',[i.id,auth]),actor={id:profile,authId:auth};await f.db.query("update auth.users set email_confirmed_at=now(),email='different@example.test' where id=$1",[auth]);await assert.rejects(f.invoke(actor,'mcpa_activate_registration'),/Verify/);
 await f.db.query("update auth.users set email='held@example.test' where id=$1",[auth]);await f.db.query("update mcpa_registration_invites set verification_expires_at=now()-interval '1 second' where id=$1",[i.id]);await assert.rejects(f.invoke(actor,'mcpa_activate_registration'),/expired/);
 await f.db.exec('set role service_role');try{for(let n=0;n<60;n++)await f.db.query('select mcpa_registration_throttle($1)',['f'.repeat(64)]);await assert.rejects(f.db.query('select mcpa_registration_throttle($1)',['f'.repeat(64)]),/rate limited/);}finally{await f.db.exec('reset role');}
});
