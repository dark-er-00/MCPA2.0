const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../public/app/features/quantity-requests/client.js');
const site='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
function setup(first){let attempt=0;const calls=[];const client=Q.createClient({rpc:async(name,args)=>{
 if(name===Q.RPC.catalog)return {data:{profile:{id:site,role:'engineer'},sites:[{id:site,name:'Assigned site'}],groups:[{type_id:'fixture',tracking_type:'Individual',requestable:true,available_quantity:5,reserved_quantity:0,deployed_quantity:0,physical_records:5}]}};
 calls.push(args);return attempt++===0?first:{data:{id:request}};
 }},{storage:null});return {client,calls};}
for(const [name,response]of [['missing confirmation',{data:{}}],['server interruption',{error:{code:'503',message:'Synthetic interruption'}}]])test(name+' preserves the operation ID for safe verification',async()=>{
 const {client,calls}=setup(response);await client.catalog();const input={typeId:'fixture',siteId:site,quantity:1,purpose:'Synthetic retry'};
 await assert.rejects(client.submit(input),error=>error.outcomeUncertain===true);await client.submit(input);assert.equal(calls.length,2);assert.equal(calls[0].p_operation_id,calls[1].p_operation_id);
});
