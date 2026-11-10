const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
async function setup(t){const f=await require('./functionality-audit-v2/fixture.cjs').fixture(t);await require('./project-construction-fixture.cjs').upgrade(f);for(const name of ['01-account-removal.sql','02-profile-pictures.sql'])await f.db.exec(read('supabase/drafts/admin-pdf/'+name));f.invoke=(a,n,args=[])=>f.query(a,`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args).then(r=>r.rows[0].value);return f;}
test('compatible self-profile draft installs and reruns without changing Auth, role or historical profile IDs',async t=>{
 const f=await require('./integration-quantity-custody-v2/fixture.cjs').fixture(t);const sql=read('supabase/drafts/admin-pdf/00-self-profile-compatibility.sql');const before=(await f.db.query('select id,auth_user_id,role,account_status from profiles order by id')).rows;await f.db.exec(sql);await f.db.exec(sql);await f.query(f.actors.admin,"select public.mcpa_update_my_profile('Updated Admin','admin_fixture')");assert.deepEqual((await f.db.query('select id,auth_user_id,role,account_status from profiles order by id')).rows,before);await assert.rejects(f.query(null,"select public.mcpa_update_my_profile('Bad','bad')"));
});
test('draft removal requires two distinct active Admins, denies other roles and preserves records',async t=>{
 const f=await setup(t),a=f.actors,op=randomUUID(),args=[a.secretary.id,'No longer working here',op];
 for(const actor of [null,a.sky,a.architect,a.handler,a.secretary,a.inactive])await assert.rejects(f.invoke(actor,'mcpa_request_account_removal',args));
 await assert.rejects(f.invoke(a.admin,'mcpa_request_account_removal',[a.admin.id,'Self removal',randomUUID()]));
 const id=await f.invoke(a.admin,'mcpa_request_account_removal',args);assert.equal(await f.invoke(a.admin,'mcpa_request_account_removal',args),id);
 await assert.rejects(f.invoke(a.admin2,'mcpa_request_account_removal',args),/conflict/);
 await assert.rejects(f.invoke(a.admin,'mcpa_decide_account_removal',[id,true]),/different/);
 assert.equal((await f.db.query('select account_status from profiles where id=$1',[a.secretary.id])).rows[0].account_status,'active');
 await f.invoke(a.admin2,'mcpa_decide_account_removal',[id,true]);
 assert.equal(await f.invoke(a.admin2,'mcpa_decide_account_removal',[id,true]),id);
 const rows=await f.invoke(a.admin,'mcpa_accounts');assert.equal(rows.find(p=>p.id===a.secretary.id).account_status,'removed');
 assert.equal((await f.db.query('select count(*)::int n from auth.users where id=$1',[a.secretary.authId])).rows[0].n,1);
 await assert.rejects(f.invoke(a.secretary,'mcpa_my_profile_picture'),/active|unavailable|authorized/i);
 await assert.rejects(f.rpc(a.admin,'mcpa_save_account',{p_id:a.secretary.id,p_name:a.secretary.name,p_role:'secretary',p_status:'active',p_auth_user_id:a.secretary.authId}),/Removed/);
 assert.equal((await f.invoke(a.admin,'mcpa_account_removals'))[0].decided_by,a.admin2.id);
 for(const actor of [null,a.sky,a.architect,a.handler,a.secretary])await assert.rejects(f.invoke(actor,'mcpa_account_removals'));
});
test('draft removal blocks custody and assigned projects, rejection keeps access, tables are not directly writable',async t=>{
 const f=await setup(t),a=f.actors;
 for(const target of [a.sky,a.pau]){const id=await f.invoke(a.admin,'mcpa_request_account_removal',[target.id,'Dependency check',randomUUID()]);await assert.rejects(f.invoke(a.admin2,'mcpa_decide_account_removal',[id,true]),/Resolve assigned/);await f.invoke(a.admin2,'mcpa_decide_account_removal',[id,false]);assert.equal((await f.db.query('select account_status from profiles where id=$1',[target.id])).rows[0].account_status,'active');}
 await assert.rejects(f.query(a.admin,'delete from public.mcpa_account_removal_requests'));
 await assert.rejects(f.query(a.admin,'update public.mcpa_account_removal_requests set status=\'approved\''));
 const caps=await f.invoke(a.admin,'mcpa_admin_lifecycle_capabilities');assert.deepEqual(caps,{version:1,removal:true,invitations:false});
});
test('draft profile photo policies enforce private ownership, metadata size/type and immutable current files',async t=>{
 const f=await setup(t),a=f.actors,name=a.admin.id+'/'+randomUUID()+'.png',other=a.sky.id+'/'+randomUUID()+'.png';
 assert.deepEqual(await f.invoke(a.admin,'mcpa_my_profile_picture'),{version:1,object_name:null});
 await assert.rejects(f.query(a.sky,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-profile-photos',name,{mimetype:'image/png',size:8}]));
 await f.query(a.admin,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-profile-photos',name,{mimetype:'image/png',size:8}]);
 assert.equal((await f.query(a.sky,'select * from storage.objects where name=$1',[name])).rows.length,0);
 await assert.rejects(f.invoke(a.sky,'mcpa_set_my_profile_picture',[name]),/own photo/);
 await f.invoke(a.admin,'mcpa_set_my_profile_picture',[name]);assert.equal((await f.invoke(a.admin,'mcpa_my_profile_picture')).object_name,name);
 assert.equal((await f.query(a.admin,'delete from storage.objects where name=$1 returning name',[name])).rows.length,0);
 await f.query(a.sky,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-profile-photos',other,{mimetype:'image/svg+xml',size:100}]);await assert.rejects(f.invoke(a.sky,'mcpa_set_my_profile_picture',[other]),/supported/);
 await f.db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/png',size:2097153},other]);await assert.rejects(f.invoke(a.sky,'mcpa_set_my_profile_picture',[other]),/2 MiB/);
 await assert.rejects(f.invoke(null,'mcpa_my_profile_picture'));
 assert.equal((await f.db.query("select public from storage.buckets where id='mcpa-profile-photos'")).rows[0].public,false);
});
test('draft invitation SQL is service-only, single-use, expiring and cannot grant Admin access',async t=>{
 const f=await setup(t),a=f.actors;await f.db.exec(read('supabase/drafts/admin-pdf/03-registration-invitations.sql'));
 const service=async(name,args)=>{await f.db.exec('set role service_role');try{return (await f.db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}finally{await f.db.exec('reset role');}};
 const hash='a'.repeat(64),args=[a.admin.id,'Invited Person','invite@example.test','engineer',hash];
 for(const actor of [null,a.sky,a.architect,a.handler,a.admin])await assert.rejects(f.invoke(actor,'mcpa_registration_prepare',args));
 await assert.rejects(service('mcpa_registration_prepare',[a.sky.id,...args.slice(1)]),/Admin/);
 await assert.rejects(service('mcpa_registration_prepare',[...args.slice(0,3),'admin',hash]),/Invalid/);
 const invitation=await service('mcpa_registration_prepare',args);assert.ok(Date.parse(invitation.expires_at)>Date.now());
 const claim=await service('mcpa_registration_claim',[hash]);assert.equal(claim.role,'engineer');assert.ok(!('token_hash' in claim));
 await assert.rejects(service('mcpa_registration_claim',[hash]),/invalid or expired/);
 const auth=randomUUID();await f.db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[auth,'invite@example.test',{mcpa_invite_id:invitation.id}]);
 const profile=await service('mcpa_registration_finish',[invitation.id,auth]);const person=(await f.db.query('select role,account_status from profiles where id=$1',[profile])).rows[0];assert.deepEqual(person,{role:'engineer',account_status:'inactive'});
 const expired=await service('mcpa_registration_prepare',[a.admin.id,'Expired Person','expired@example.test','architect','b'.repeat(64)]);await f.db.query("update mcpa_registration_invites set expires_at=now()-interval '1 second' where id=$1",[expired.id]);await assert.rejects(service('mcpa_registration_claim',['b'.repeat(64)]),/invalid or expired/);
});
