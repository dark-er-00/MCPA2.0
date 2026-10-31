const {test}=require('node:test'),assert=require('node:assert/strict');
test('custody operations coalesce concurrent clicks, retain uncertain UUIDs across remount, and renew successful UUIDs',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs');
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const calls=[];let lose=true;
  const client={storage:{},async rpc(name,args){
    if(name==='mcpa_b_snapshot')return {data:{profile:{id:'test-actor'}}};
    calls.push(args.p_operation_id);await new Promise(r=>setTimeout(r,5));if(lose){lose=false;throw Error('Response lost after commit');}return {data:{id:'saved'}};
  }};
  const payload={assetIds:['T-1']};let api=createCustodyApi(client,{storage});await api.snapshot();
  const results=await Promise.allSettled([api.mutate('submitReturn',payload),api.mutate('submitReturn',payload)]);
  assert.equal(calls.length,1);assert.ok(results.every(r=>r.status==='rejected'));
  await assert.rejects(api.mutate('submitReturn',{assetIds:['T-2']}),/Recover/);
  api.dispose();api=createCustodyApi(client,{storage});await api.snapshot();
  await api.retryPending();assert.equal(calls[0],calls[1]);assert.equal(api.pending().length,0);
  await api.mutate('submitReturn',payload);assert.notEqual(calls[1],calls[2]);api.dispose();
});
test('an empty response or later rejection cannot discard an earlier uncertain operation',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs');let rejection=false;
  const client={storage:{},async rpc(){return rejection?{error:{code:'42501',message:'Account changed'}}:{data:null};}};
  const api=createCustodyApi(client,{storage:{getItem(){},setItem(){}}});
  await assert.rejects(api.mutate('submitReturn',{assetIds:['T-1']}),/could not be verified/);const original=api.pending()[0].id;
  rejection=true;await assert.rejects(api.retryPending(),/Account changed/);assert.equal(api.pending()[0].id,original);api.dispose();
});

function recoveryHarness(){
  const data=new Map(),requests=[];
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const client={storage:{},rpc(name,args){
    if(name==='mcpa_b_snapshot')return Promise.resolve({data:{profile:{id:'recovery-actor'}}});
    return new Promise((resolve,reject)=>requests.push({args,resolve,reject}));
  }};
  return {storage,client,requests,stored:()=>JSON.parse(data.get('mcpa.custody.pending.v3.recovery-actor')||'[]').map(([,op])=>op)};
}
test('late success after disposal removes only its own operation and preserves another uncertain UUID',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs'),h=recoveryHarness();
  const api=createCustodyApi(h.client,{storage:h.storage});await api.snapshot();
  const first=api.mutate('reportRetirementIssue',{id:'first',notes:'one'},'issue:first');
  const second=api.mutate('reportRetirementIssue',{id:'second',notes:'two'},'issue:second');
  const settled=Promise.allSettled([first,second]),secondId=h.requests[1].args.p_operation_id;
  api.dispose();h.requests[0].resolve({data:{id:'first'}});await first;
  h.requests[1].reject(Error('Response lost'));await settled;
  assert.deepEqual(h.stored().map(op=>op.id),[secondId]);
  const remounted=createCustodyApi(h.client,{storage:h.storage});await remounted.snapshot();
  const retry=remounted.retryPending();assert.equal(h.requests[2].args.p_operation_id,secondId);
  h.requests[2].resolve({data:{id:'second'}});await retry;assert.equal(remounted.pending().length,0);remounted.dispose();
});
test('a disposed instance cannot erase operations added by a remounted instance',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs'),h=recoveryHarness();
  const old=createCustodyApi(h.client,{storage:h.storage});await old.snapshot();
  const first=old.mutate('reportRetirementIssue',{id:'first'},'first');old.dispose();
  const current=createCustodyApi(h.client,{storage:h.storage});await current.snapshot();
  const second=current.mutate('reportRetirementIssue',{id:'second'},'second'),settled=Promise.allSettled([first,second]);
  const secondId=h.requests[1].args.p_operation_id;
  h.requests[0].resolve({data:{id:'first'}});await first;assert.deepEqual(current.pending().map(op=>op.id),[secondId]);
  h.requests[1].reject(Error('Network interrupted'));await settled;current.dispose();
  assert.deepEqual(h.stored().map(op=>op.id),[secondId]);
});
test('a late replay response cannot delete a newer deliberate operation with the same payload',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs'),h=recoveryHarness();
  const old=createCustodyApi(h.client,{storage:h.storage});await old.snapshot();
  const first=old.mutate('reportRetirementIssue',{id:'asset'},'issue');old.dispose();
  const current=createCustodyApi(h.client,{storage:h.storage});await current.snapshot();const replay=current.retryPending();
  h.requests[0].resolve({data:{id:'asset'}});await first;
  const newer=createCustodyApi(h.client,{storage:h.storage});await newer.snapshot();
  const next=newer.mutate('reportRetirementIssue',{id:'asset'},'issue'),nextId=h.requests[2].args.p_operation_id;
  assert.notEqual(nextId,h.requests[0].args.p_operation_id);
  h.requests[1].resolve({data:{id:'asset'}});await replay;assert.deepEqual(h.stored().map(op=>op.id),[nextId]);
  h.requests[2].resolve({data:{id:'asset'}});await next;current.dispose();newer.dispose();
});
test('an old definitive rejection cannot erase a newer uncertain retry of the same UUID',async()=>{
  const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs'),h=recoveryHarness();
  const old=createCustodyApi(h.client,{storage:h.storage});await old.snapshot();
  const first=old.mutate('reportRetirementIssue',{id:'asset'},'issue'),firstResult=Promise.allSettled([first]);old.dispose();
  const current=createCustodyApi(h.client,{storage:h.storage});await current.snapshot();const retry=current.retryPending(),retryResult=Promise.allSettled([retry]);
  h.requests[0].resolve({error:{code:'40001',message:'First attempt rolled back'}});await firstResult;
  h.requests[1].reject(Error('Retry response lost'));await retryResult;
  assert.equal(h.stored()[0]?.id,h.requests[1].args.p_operation_id);current.dispose();
});
