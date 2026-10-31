// Auth passwords are modeled locally. Application RPCs and RLS use the real fixture database.
import {randomUUID} from 'node:crypto';
import {createHandler} from '../../supabase/functions/manage-accounts/handler.mjs';
export function accountService(f,{base='https://mcpa.example'}={}){
 const passwords=new Map(),initial=new Set(Object.values(f.actors).map(a=>a.authId));
 const admin={auth:{getUser:async token=>{
  const actor=f.actors[token]||Object.values(f.actors).find(a=>a.authId===token);
  return actor?{data:{user:{id:actor.authId}}}:{error:{status:401}};
 },admin:{createUser:async({email,password,app_metadata})=>{
  const authId=randomUUID();await f.db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[authId,email,app_metadata]);passwords.set(authId,password);return {data:{user:{id:authId}}};
 }}},from:()=>({select:()=>({eq:(_,authId)=>({maybeSingle:async()=>({data:(await f.db.query('select id,role,account_status from profiles where auth_user_id=$1',[authId])).rows[0]})})})}),
 rpc:async(name,args)=>{
  if(name!=='mcpa_development_account_step')throw Error('Unexpected service RPC');
  try{return await f.db.transaction(async tx=>{await tx.exec('set local role service_role');return {data:(await tx.query('select public.mcpa_development_account_step($1,$2,$3) value',[args.p_actor,args.p_action,args.p_payload])).rows[0].value};});}
  catch(error){return {error};}
 }};
 const handler=createHandler({admin,appUrl:base+'/index.html',developmentEnabled:true});
 const request=(body,actor='admin')=>handler(new Request(base+'/functions/manage-accounts',{method:'POST',headers:{authorization:'Bearer '+actor,origin:base},body:JSON.stringify(body)}));
 return {request,handler,
  async signIn(email,password){const user=(await f.db.query('select * from auth.users where lower(email)=lower($1)',[email])).rows[0];if(!user||!user.email_confirmed_at||(passwords.has(user.id)?passwords.get(user.id)!==password:!initial.has(user.id)||password!=='test-password'))throw Error('Incorrect email or password');let key=Object.keys(f.actors).find(key=>f.actors[key].authId===user.id);if(!key){key='test_'+user.id;const p=(await f.db.query('select * from profiles where auth_user_id=$1',[user.id])).rows[0];f.actors[key]={id:p.id,authId:user.id,name:p.name,role:p.role};}return key;},
  async setPassword(actor,password){if(!actor||typeof password!=='string'||password.length<12)throw Error('Invalid password/session');passwords.set(actor.authId,password);}
 };
}
