const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto,randomUUID}=require('node:crypto');
const C=require('../../js/upgrades/individual-import-expansion/core.js'),{create,RPC,RECEIPT_RPC}=require('../../js/upgrades/individual-import-expansion/controller.js');
const actor={id:'11111111-1111-4111-8111-111111111111',role:'admin'};
const sheet=C.parse(Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\nShovel,Hand Tools,Individual,2,Good\nPipe,Construction Materials,Bulk,225,Fair'),'csv')[0];
const input={sheet,mapping:C.autoMap(sheet.headers)};
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
function receipt(operation){return {operation_id:operation,actor_id:actor.id,created:3,rejected:0,spreadsheet_rows:2,expanded_records:3,assets:[
  ...[1,2].map(i=>({source_row:2,expansion_index:i,id:randomUUID(),asset_id:'T-'+String(i).padStart(16,'0'),name:'Shovel',quantity:1})),
  {source_row:3,expansion_index:1,id:randomUUID(),asset_id:'T-0000000000000003',name:'Pipe',quantity:225}]};}
function setup(rpc,extra={}){return create({client:{rpc},requireActor:()=>actor,storage:storage(),crypto:webcrypto,...extra});}
test('controller sends original rows once and verifies expanded physical asset receipt',async()=>{
  let calls=0;
  const controller=setup(async(name,args)=>{calls++;assert.equal(name,RPC);assert.equal(args.p_rows.length,2);assert.equal(args.p_rows[0].quantity,2);assert.equal(args.p_rows[1].quantity,225);assert.equal(args.p_rows[0].asset_id,undefined);return {data:receipt(args.p_operation_id)};});
  const result=await controller.confirm(input);assert.equal(result.created,3);assert.equal(calls,1);assert.equal(controller.pending(),null);
});
test('all non-Admin roles and invalid worksheets fail without an RPC or pending operation',async()=>{
  let calls=0;
  for(const role of ['engineer','architect','tool_handler','secretary',null]){
    const controller=setup(async()=>{calls++;},{requireActor:()=>({...actor,role})});await assert.rejects(controller.confirm(input),/Only Admin/);
  }
  const controller=setup(async()=>{calls++;});
  await assert.rejects(controller.confirm({...input,mapping:{}}),/Fix all/);assert.equal(calls,0);assert.equal(controller.pending(),null);
});
test('interrupted responses keep one operation and reject changed payloads; retry returns receipt',async()=>{
  let calls=0,operation;
  const controller=setup(async(name,args)=>{calls++;assert.equal(name,RPC);if(!operation){operation=args.p_operation_id;throw Error('Network disconnected');}assert.equal(args.p_operation_id,operation);return {data:receipt(operation)};});
  await assert.rejects(controller.confirm(input),/Network/);assert.equal(controller.pending().operation,operation);
  const changed={...sheet,rows:sheet.rows.map((r,i)=>i? r:{...r,values:['Different shovel',...r.values.slice(1)]})};
  await assert.rejects(controller.confirm({sheet:changed,mapping:input.mapping}),/unresolved/);assert.equal(calls,1);
  await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
  assert.equal((await controller.confirm(input)).created,3);assert.equal(calls,2);assert.equal(controller.pending(),null);
});
test('reload recovery calls the admin receipt RPC without needing the original spreadsheet',async()=>{
  const saved=storage();let committed;
  const first=setup(async(name,args)=>{committed=receipt(args.p_operation_id);throw Error('response interrupted');},{storage:saved});
  await assert.rejects(first.confirm(input),/interrupted/);
  const second=setup(async(name,args)=>{assert.equal(name,RECEIPT_RPC);assert.equal(args.p_operation_id,committed.operation_id);return {data:committed};},{storage:saved});
  assert.deepEqual(await second.recover(),committed);assert.equal(second.pending(),null);
});
test('malformed receipts, duplicate Asset IDs and missing provenance retain recovery state',async()=>{
  for(const mutate of [r=>{r.created=2;},r=>{r.assets[1].asset_id=r.assets[0].asset_id;},r=>{r.assets[1].expansion_index=1;},r=>{r.assets[0].quantity=2;},r=>{r.assets[0].source_row=99;},r=>{r.actor_id=randomUUID();}]){
    const controller=setup(async(name,args)=>{const r=receipt(args.p_operation_id);mutate(r);return {data:r};});
    await assert.rejects(controller.confirm(input),/receipt|verified/);assert.ok(controller.pending());
  }
});
test('duplicate clicks are blocked and a timeout cannot start a second operation',async()=>{
  let unblock;
  const controller=setup(()=>new Promise(resolve=>{unblock=resolve;}),{timeoutMs:30});
  const first=controller.confirm(input);await new Promise(resolve=>setTimeout(resolve,5));await assert.rejects(controller.confirm(input),/already in progress/);
  await assert.rejects(first,/timed out/);assert.ok(controller.pending());
  await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);unblock({data:null});
});
test('a known rolled-back rejection can be abandoned only after a successful missing-receipt check',async()=>{
  let checked=false;
  const controller=setup(async(name)=>{if(name===RPC)return {error:{code:'23505',message:'serial conflict'}};checked=true;return {data:null};});
  await assert.rejects(controller.confirm(input),/serial conflict/);assert.equal(controller.pending().rejected,true);
  assert.equal(await controller.abandonUncommitted(),null);assert.equal(checked,true);assert.equal(controller.pending(),null);
});
test('a retry timeout revokes an earlier rollback marker',async()=>{
  let calls=0;
  const controller=setup(async()=>{if(++calls===1)return {error:{code:'23505',message:'conflict'}};return new Promise(()=>{});},{timeoutMs:10});
  await assert.rejects(controller.confirm(input),/conflict/);assert.equal(controller.pending().rejected,true);
  await assert.rejects(controller.confirm(input),/timed out/);assert.equal(controller.pending().rejected,false);await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
});
test('a later rejection cannot discard an earlier uncertain in-flight transaction',async()=>{
  let calls=0;
  const controller=setup(async()=>{if(++calls===1)throw Error('network');return {error:{code:'55P03',message:'lock wait timed out'}};});
  await assert.rejects(controller.confirm(input),/network/);
  await assert.rejects(controller.confirm(input),/lock wait/);
  assert.equal(controller.pending().uncertain,true);await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
});
test('account changes during response retain original account recovery data',async()=>{
  let live=actor;const saved=storage();
  const controller=setup(async(name,args)=>{live={...actor,id:randomUUID()};return {data:receipt(args.p_operation_id)};},{storage:saved,requireActor:()=>live});
  await assert.rejects(controller.confirm(input),/account changed/);assert.equal(saved.data.size,1);
});

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('remount fences old abandonment even without an explicit dispose call',async()=>{
  const saved=storage(),held=deferred(),started=deferred(),retryHeld=deferred(),retryStarted=deferred();
  const old=setup(async name=>{if(name===RPC)return {error:{code:'23514',message:'rejected'}};started.resolve();return held.promise;},{storage:saved});
  await assert.rejects(old.confirm(input),/rejected/);const abandoned=Promise.allSettled([old.abandonUncommitted()]);await started.promise;
  const current=setup((name,args)=>{retryStarted.resolve();return retryHeld.promise;},{storage:saved});
  const retry=Promise.allSettled([current.confirm(input)]);await retryStarted.promise;const token=current.pending();
  held.resolve({data:null});assert.equal((await abandoned)[0].status,'rejected');assert.deepEqual(current.pending(),token);
  retryHeld.resolve({data:receipt(token.operation)});await retry;assert.equal(current.pending(),null);
  await assert.rejects(old.confirm(input),/newer screen/);
});

test('persisted dispatch revision fences an old rejection through independent storage adapters',async()=>{
  const saved=storage(),adapter=()=>({getItem:saved.getItem,setItem:saved.setItem,removeItem:saved.removeItem});
  const firstHeld=deferred(),firstStarted=deferred(),secondHeld=deferred(),secondStarted=deferred();
  const old=setup(()=>{firstStarted.resolve();return firstHeld.promise;},{storage:adapter()});
  const first=Promise.allSettled([old.confirm(input)]);await firstStarted.promise;const operation=old.pending().operation;
  const current=setup(()=>{secondStarted.resolve();return secondHeld.promise;},{storage:adapter()});
  const retry=Promise.allSettled([current.confirm(input)]);await secondStarted.promise;const token=current.pending();assert.equal(token.operation,operation);
  firstHeld.resolve({error:{code:'23514',message:'old rejection'}});assert.equal((await first)[0].status,'rejected');
  assert.deepEqual(current.pending(),token,'Old rollback cannot rewrite the newer uncertain dispatch');
  secondHeld.resolve({data:receipt(operation)});await retry;assert.equal(current.pending(),null);
});

test('persisted state fences abandonment when a newer attempt reuses the UUID outside the owner registry',async()=>{
  const saved=storage(),adapter=()=>({getItem:saved.getItem,setItem:saved.setItem,removeItem:saved.removeItem}),held=deferred(),started=deferred();
  const old=setup(async name=>{if(name===RPC)return {error:{code:'23514',message:'rejected'}};started.resolve();return held.promise;},{storage:adapter()});
  await assert.rejects(old.confirm(input),/rejected/);const abandoned=Promise.allSettled([old.abandonUncommitted()]);await started.promise;
  const retryHeld=deferred(),retryStarted=deferred(),current=setup(()=>{retryStarted.resolve();return retryHeld.promise;},{storage:adapter()});
  const retry=Promise.allSettled([current.confirm(input)]);await retryStarted.promise;const token=current.pending();
  held.resolve({data:null});assert.equal((await abandoned)[0].status,'rejected');assert.deepEqual(current.pending(),token);
  retryHeld.resolve({data:receipt(token.operation)});await retry;
});

test('late receipt success cannot remove a newer deliberate import recovery entry',async()=>{
  const saved=storage(),held=deferred(),started=deferred();let committed;
  const old=setup(async(name,args)=>{if(name===RPC){committed=receipt(args.p_operation_id);throw Error('lost');}started.resolve();return held.promise;},{storage:saved});
  await assert.rejects(old.confirm(input),/lost/);const recovery=Promise.allSettled([old.recover()]);await started.promise;
  let imports=0;
  const current=setup(async(name,args)=>{if(name===RECEIPT_RPC)return {data:committed};imports++;throw Error('new response lost');},{storage:saved});
  await current.recover();await assert.rejects(current.confirm(input),/new response lost/);const token=current.pending();assert.notEqual(token.operation,committed.operation_id);
  held.resolve({data:committed});assert.equal((await recovery)[0].status,'rejected');assert.deepEqual(current.pending(),token);assert.equal(imports,1);
});

test('legacy rejected token without a revision can be abandoned safely and corrected input gets a new UUID',async()=>{
  const saved=storage(),key='mcpa.workstream-a.import.v2.'+actor.id;
  const old=setup(async()=>({error:{code:'23514',message:'rejected'}}),{storage:saved});await assert.rejects(old.confirm(input),/rejected/);
  const rejected=old.pending();delete rejected.revision;saved.setItem(key,JSON.stringify(rejected));old.dispose();
  const current=setup(async(name,args)=>name===RECEIPT_RPC?{data:null}:{data:receipt(args.p_operation_id)},{storage:saved});
  assert.equal(await current.abandonUncommitted(),null);assert.equal(current.pending(),null);
  const result=await current.confirm(input);assert.notEqual(result.operation_id,rejected.operation);assert.equal(current.pending(),null);
});

test('abandonment checks dispatch generation even when a newer rejection restores the same UUID and flags',async()=>{
  const saved=storage(),adapter=()=>({getItem:saved.getItem,setItem:saved.setItem,removeItem:saved.removeItem}),held=deferred(),started=deferred();
  const old=setup(async name=>{if(name===RPC)return {error:{code:'23514',message:'rejected'}};started.resolve();return held.promise;},{storage:adapter()});
  await assert.rejects(old.confirm(input),/rejected/);const original=old.pending(),abandoned=Promise.allSettled([old.abandonUncommitted()]);await started.promise;
  const current=setup(async name=>name===RPC?{error:{code:'23514',message:'new rejection'}}:{data:null},{storage:adapter()});
  await assert.rejects(current.confirm(input),/new rejection/);const token=current.pending();
  assert.equal(token.operation,original.operation);assert.equal(token.uncertain,original.uncertain);assert.equal(token.rejected,original.rejected);
  held.resolve({data:null});assert.equal((await abandoned)[0].status,'rejected');assert.deepEqual(current.pending(),token);
  assert.equal(await current.abandonUncommitted(),null);assert.equal(current.pending(),null);
});
