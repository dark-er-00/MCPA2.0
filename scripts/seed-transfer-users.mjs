// Optional development-only provisioner. Does not touch the existing demo-named
// Admin/Engineer accounts and never assigns a company profile ID from an Auth ID.
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
function checked(result,step){if(result.error)throw new Error(`${step} failed. Check schema, identity conflicts and trusted development credentials.`);return result.data;}
export async function seedTransferUsers(client,accounts){
 if(accounts.length!==2 || new Set(accounts.map(a=>a.email.toLowerCase())).size!==2)throw new Error('Provide two different development emails.');
 for(const account of accounts){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)||account.password.length<12||!account.name.trim()||account.name.length>120)throw new Error('Use valid emails, names and passwords of at least 12 characters.');
  if(['admin.demo@mcpa.test','engineer.demo@mcpa.test'].includes(account.email.toLowerCase()))throw new Error('Use separate transfer-test accounts; the existing accounts are preserved.');
 }
 checked(await client.from('profiles').select('id,name,role,account_status,auth_user_id,updated_at').limit(0),'Profile schema preflight');
 const output=[];
 for(const account of accounts){
  let user;
  for(let page=1;;page++){
   const data=checked(await client.auth.admin.listUsers({page,perPage:100}),'Read Auth users');
   user=data.users.find(u=>u.email?.toLowerCase()===account.email.toLowerCase());if(user||data.users.length<100)break;
  }
  let person=user?checked(await client.from('profiles').select('id,name,role,account_status,auth_user_id').eq('auth_user_id',user.id).maybeSingle(),'Read existing profile'):null;
  if(person){
   if(person.role!=='engineer'||person.account_status!=='active')throw new Error('An existing transfer account is not an active Engineer. Review it in People & Accountability.');
   output.push({email:account.email,profileId:person.id,reused:true});continue;
  }
  if(account.profileId){
   person=checked(await client.from('profiles').select('id,name,role,account_status,auth_user_id').eq('id',account.profileId).single(),'Read selected historical profile');
   if(person.auth_user_id||person.role==='admin'||person.name!==account.name)throw new Error('The selected historical person must be unlinked, non-Admin and match the supplied name.');
  }else{
   const matches=checked(await client.from('profiles').select('id').eq('name',account.name),'Check company identities');
   if(matches.length)throw new Error('A company person already has this name. Set that account’s PROFILE_ID explicitly; do not create a duplicate.');
  }
  if(user && user.user_metadata?.mcpa_transfer_test!==true)throw new Error('This email already belongs to another Auth account. Use Advanced / Recovery after verifying its identity.');
  if(!user)user=checked(await client.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,user_metadata:{mcpa_transfer_test:true}}),'Create development Engineer').user;
  const values={auth_user_id:user.id,role:'engineer',account_status:'active',updated_at:new Date().toISOString()};
  if(person)checked(await client.from('profiles').update(values).eq('id',person.id).is('auth_user_id',null).select('id').single(),'Link historical person');
  else person=checked(await client.from('profiles').insert({id:randomUUID(),name:account.name,...values}).select('id').single(),'Create company person');
  output.push({email:account.email,profileId:person.id,reused:false});
 }
 return output;
}
async function main(){
 if(!process.argv.includes('--development'))throw new Error('Run only against a development project with --development.');
 try{loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(error){if(error.code!=='ENOENT')throw new Error('Could not read local development configuration.');}
 const {SUPABASE_URL:url,SUPABASE_SECRET_KEY:key}=process.env;
 if(!url||!key)throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in your private .env.');
 const parsed=new URL(url);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Use HTTPS for remote Supabase projects.');
 const accounts=['A','B'].map(letter=>({email:process.env[`MCPA_ENGINEER_${letter}_EMAIL`]||'',password:process.env[`MCPA_ENGINEER_${letter}_PASSWORD`]||'',name:process.env[`MCPA_ENGINEER_${letter}_NAME`]||`MCPA Transfer Engineer ${letter}`,profileId:process.env[`MCPA_ENGINEER_${letter}_PROFILE_ID`]||null}));
 const result=await seedTransferUsers(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),accounts);
 for(const row of result)console.log(`${row.email}: active Engineer; stable profile ${row.profileId}${row.reused?' (existing password unchanged)':''}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof TypeError?'Check development configuration and connection.':error.message);process.exitCode=1;});
