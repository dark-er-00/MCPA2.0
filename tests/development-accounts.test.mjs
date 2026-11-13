import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHandler} from '../supabase/functions/manage-accounts/handler.mjs';
const {authDatabase}=createRequire(import.meta.url)('./auth-test-db.cjs');
const migration=readFileSync(new URL('../supabase/migrations/202610060003_development_accounts.sql',import.meta.url),'utf8');
const base='https://waquinn.github.io/MCPA/';
const form=(name='Engineer A',role='engineer')=>({action:'createDevelopmentAccount',id:randomUUID(),name,email:name.toLowerCase().replaceAll(' ','')+'@example.test',password:'Local-fixture-only-2026!',role});

async function fixture(options={}){
 const f=await authDatabase(),{db,actors}=f;let failFinish=false,authFailure=false;
 const calls=[];
 const step=async(actor,action,payload)=>{
   await db.exec('set role service_role');
   try{return (await db.query('select mcpa_development_account_step($1,$2,$3) value',[actor,action,payload])).rows[0].value;}
   finally{await db.exec('reset role');}
 };
 const admin={auth:{getUser:async token=>({data:{user:actors[token]?{id:actors[token].authId}:null}}),admin:{
   createUser:async input=>{
     calls.push(['create',input]);if(authFailure)return {error:{status:422,message:input.password}};
     const id=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id,input.email,input.app_metadata]);
     return {data:{user:{id}}};
   },inviteUserByEmail:async()=>{throw new Error('Development path must not send email');},
 }},from:()=>({select:()=>({eq:(_,id)=>({maybeSingle:async()=>({data:(await db.query('select id,role,account_status from profiles where auth_user_id=$1',[id])).rows[0]})})})}),
 rpc:async(name,args)=>{
   calls.push([name,args]);
   if(args.p_action==='finish'&&failFinish){failFinish=false;return {error:{code:'TEST'}};}
   try{return {data:await step(args.p_actor,args.p_action,args.p_payload)};}catch(error){return {error};}
 }};
 const handle=createHandler({admin,appUrl:base,developmentEnabled:true,...options});
 const send=(body,actor='admin',origin='https://waquinn.github.io')=>handle(new Request('https://edge.example',{method:'POST',headers:{authorization:'Bearer '+actor,origin},body:JSON.stringify(body)}));
 return {...f,step,send,calls,admin,setFailFinish:value=>failFinish=value,setAuthFailure:value=>authFailure=value};
}

test('development endpoint fails closed, authenticates Admins, bounds roles and isolates origins',async()=>{
 const f=await fixture();try{
   for(const actor of ['invalid','sky','architect','secretary','handler','inactive'])assert.ok([401,403].includes((await f.send(form(),actor)).status));
   for(const role of ['admin','secretary','tool_handler','owner'])assert.equal((await f.send(form('Denied',role))).status,400);
   for(const change of [{password:'short'},{password:' '.repeat(12)},{password:'a'.repeat(129)},{email:'invalid'},{profile_id:randomUUID()}])assert.equal((await f.send({...form(),...change})).status,400);
   assert.equal((await f.send(form(),'admin','http://localhost:5500')).status,403);
   assert.equal((await f.send({action:'invite',id:randomUUID()})).status,400);
   assert.equal(f.calls.length,0,'Rejected operations never reach privileged RPC/Auth Admin');
   const defaults=createHandler({admin:f.admin,appUrl:base});
   const response=await defaults(new Request('https://edge.example',{method:'POST',headers:{authorization:'Bearer admin'},body:JSON.stringify(form())}));
   assert.equal(response.status,403);
   const capabilities=await (await f.send({action:'capabilities'})).json();
   assert.equal(Object.hasOwn(capabilities,'invitations_enabled'),false);assert.equal(capabilities.development_enabled,true);
   const local=createHandler({admin:f.admin,appUrl:base,developmentEnabled:true,developmentOrigins:['http://localhost:5500']});
   const preflight=await local(new Request('https://edge.example',{method:'OPTIONS',headers:{origin:'http://localhost:5500'}}));
   assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:5500');
   assert.throws(()=>createHandler({admin:f.admin,appUrl:base,developmentEnabled:true,developmentOrigins:['https://evil.example']}),/loopback/);
 }finally{await f.close();}
});

test('development SQL preserves data, denies browser access, and refuses spoofed or conflicting identities',async()=>{
 const f=await fixture(),{db,actors:a,query,step}=f;
 try{
   const before=(await db.query('select * from profiles order by id')).rows;
   const result=(await db.exec(migration)).at(-1).rows[0].development_account_verification;
   assert.equal(result.rls_enabled,true);assert.equal(result.service_role_execute,true);assert.equal(result.invitation_rpc_service_only,true);
   for(const row of result.browser_access){assert.equal(row.any_table_access,false);assert.equal(row.any_column_access,false);assert.equal(row.development_rpc_execute,false);}
   assert.deepEqual((await db.query('select * from profiles order by id')).rows,before);
   for(const actor of [null,a.admin,a.sky]){
     await assert.rejects(()=>query(actor,'select * from mcpa_development_accounts'),/permission denied/);
     await assert.rejects(()=>query(actor,'select mcpa_development_account_step($1,$2,$3)',[a.admin.authId,'prepare',form()]),/permission denied/);
   }
   const input=form();delete input.password;
   await assert.rejects(()=>step(a.sky.authId,'prepare',input),/Active Admin/);
   await assert.rejects(()=>step(a.admin.authId,'prepare',{...input,role:'admin'}),/Engineer or Architect/);
   await assert.rejects(()=>step(a.admin.authId,'prepare',{...input,email:'sky@example.test'}),/already belongs/);
   await assert.rejects(()=>step(a.admin.authId,'prepare',{...input,name:a.sky.name}),/company person/);
   await assert.rejects(()=>step(a.admin.authId,'prepare',{...input,password:'never store'}),/Invalid development/);
   const job=await step(a.admin.authId,'prepare',input),claim=await step(a.admin.authId,'claim',{id:job.id});
   await assert.rejects(()=>step(a.admin.authId,'claim',{id:job.id}),/already running/);
   assert.deepEqual((await db.query('select * from profiles order by id')).rows,before,'Preparing creates no spare company profiles');
   await assert.rejects(()=>step(a.admin.authId,'prepare',{...input,name:'Changed name'}),/different details/);
   const authId=randomUUID();
   await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[authId,job.email,{mcpa_development_account:true,mcpa_development_job_id:job.id}]);
   await assert.rejects(()=>step(a.admin.authId,'finish',{id:job.id,lease_id:claim.lease_id,auth_user_id:authId}),/unrelated Auth/);
   await db.query('update auth.users set raw_app_meta_data=raw_user_meta_data where id=$1',[authId]);
   await assert.rejects(()=>step(a.admin.authId,'finish',{id:job.id,lease_id:randomUUID(),auth_user_id:authId}),/expired or changed/);
   await db.query("update profiles set account_status='inactive' where id=$1",[a.admin.id]);
   await assert.rejects(()=>step(a.admin.authId,'finish',{id:job.id,lease_id:claim.lease_id,auth_user_id:authId}),/Active Admin/);
 }finally{await f.close();}
});

test('interrupted Auth creation retries safely, exposes pending jobs and never resets an existing password',async()=>{
 const f=await fixture(),{db,actors:a,send,calls,rpc}=f;
 try{
   const input=form();f.setFailFinish(true);
   assert.equal((await send(input)).status,503);
   assert.equal((await db.query('select count(*)::int n from profiles where name=$1',[input.name])).rows[0].n,0);
   assert.equal((await (await send({action:'capabilities'})).json()).pending_development_accounts.length,1);
   const response=await send({...input,password:'Changed-but-not-applied-2026!'});assert.equal(response.status,200);
   const body=await response.json();assert.match(body.message,/original creation/);
   assert.equal((await send({...input,id:randomUUID()})).status,200,'Email reuses completed job after reload');
   assert.equal(calls.filter(c=>c[0]==='create').length,1);
   const profile=(await db.query('select * from profiles where id=$1',[body.profile_id])).rows[0];assert.notEqual(profile.id,profile.auth_user_id);
   assert.equal(profile.role,'engineer');assert.equal(profile.account_status,'active');
   assert.equal((await rpc(a.admin,'mcpa_accounts')).find(p=>p.id===profile.id).development_account,true);
   const audit=(await db.query('select * from mcpa_account_audit where profile_id=$1',[profile.id])).rows;
   assert.equal(audit.length,1);assert.equal(audit[0].actor_id,a.admin.id);assert.equal(audit[0].event,'development_account_created');
   assert.equal(JSON.stringify(calls.filter(c=>c[0]!=='create')).includes(input.password),false,'Password never passed to SQL');
   assert.equal(JSON.stringify(audit).includes(input.password),false);assert.equal(JSON.stringify(body).includes(input.password),false);
   await rpc(a.admin,'mcpa_save_account',{p_id:profile.id,p_name:profile.name,p_role:profile.role,p_status:'inactive',p_auth_user_id:profile.auth_user_id});
   await send(input);assert.equal((await db.query('select account_status from profiles where id=$1',[profile.id])).rows[0].account_status,'inactive','Retry does not reactivate accounts');
   f.setAuthFailure(true);const failed=await send(form('Failure Engineer'));assert.equal(failed.status,503);assert.equal((await failed.text()).includes(input.password),false,'Auth errors never echo passwords');
 }finally{await f.close();}
});

test('two created Engineers use authenticated UUID custody transfer and inspected receipt; Architect creation works',async()=>{
 const f=await fixture(),{db,actors:a,rpc}=f;
 try{
   const created=[];
   for(const input of [form('Engineer A'),form('Engineer B'),form('Architect C','architect')]){
     const response=await f.send(input);assert.equal(response.status,200);const body=await response.json();
     const p=(await db.query('select * from profiles where id=$1',[body.profile_id])).rows[0];
     created.push({...p,authId:p.auth_user_id});
   }
   const [engineerA,engineerB]=created;
   assert.equal(created[2].role,'architect');
   await db.query("update equipment set current_holder_id=$1 where asset_id='TOOL-002'",[engineerA.id]);
   const act=(actor,action,payload)=>rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
   const transfer=await act(engineerA,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:engineerB.id});
   assert.match(transfer.code,/^TRF-/);assert.equal(transfer.receiverId,engineerB.id);
   const payload={id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]};
   await assert.rejects(()=>act(engineerA,'receiveTransfer',payload),/named receiver/);
   await assert.rejects(()=>act(engineerB,'receiveTransfer',{...payload,inspections:[{toolId:'TOOL-002',condition:'good'}]}),/Test every/);
   await act(engineerB,'receiveTransfer',payload);
   const snapshot=await rpc(a.admin,'mcpa_movement_snapshot');
   assert.equal(snapshot.tools.find(t=>t.id==='TOOL-002').holderId,engineerB.id);
   assert.equal(snapshot.transfers.find(t=>t.id===transfer.id).status,'received');
   assert.equal(snapshot.activity.filter(t=>t.entityId===transfer.id).length,2);
   await assert.rejects(()=>act(engineerB,'receiveTransfer',payload),/Only pending/);
 }finally{await f.close();}
});
