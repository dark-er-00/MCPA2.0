import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../supabase/functions/manage-accounts/handler.mjs';
function fixture({role='admin',status='active',invalidToken=false}={}){
 const calls=[],userId=randomUUID();
 const admin={auth:{getUser:async token=>{calls.push(['getUser',token]);return invalidToken?{error:{}}:{data:{user:{id:userId}}};}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:randomUUID(),role,account_status:status}})})})}),rpc:async(name,args)=>{calls.push([name,args]);return {data:[]};}};
 const handler=createHandler({admin,appUrl:'https://mcpa.example/index.html'});
 const request=(body,headers={authorization:'Bearer valid'},method='POST')=>handler(new Request('https://edge.example',{method,headers,body:method==='POST'?JSON.stringify(body):undefined}));
 return {request,calls};
}
test('account service still requires a verified active Admin and a trusted origin',async()=>{
 for(const config of [{invalidToken:true},{role:'engineer'},{status:'inactive'}]){const f=fixture(config);assert.ok([401,403].includes((await f.request({action:'capabilities'})).status));assert.equal(f.calls.some(c=>c[0].startsWith('mcpa_')),false);}
 const f=fixture();assert.equal((await f.request({action:'capabilities'},{})).status,401);assert.equal((await f.request({action:'capabilities'},{authorization:'Bearer valid',origin:'https://evil.example'})).status,403);
});
test('retired invitation actions are denied before any privileged database or Auth side effects',async()=>{
 const f=fixture();for(const action of ['invite','retry','resend','revoke'])assert.equal((await f.request({action,id:randomUUID(),name:'Person',email:'person@example.test',role:'engineer'})).status,400);
 assert.equal(f.calls.some(c=>c[0]!=='getUser'),false);
 const response=await f.request({action:'capabilities'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{development_enabled:false,pending_development_accounts:[]});assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal((await f.request({action:'createDevelopmentAccount',id:randomUUID()})).status,403);
});
test('account service permits SDK preflight headers and rejects unsupported methods',async()=>{
 const f=fixture(),response=await f.request(null,{origin:'https://mcpa.example'},'OPTIONS');assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://mcpa.example');assert.match(response.headers.get('Access-Control-Allow-Headers'),/x-retry-count/);assert.equal((await f.request(null,{},'GET')).status,405);
});
