const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const C=require('../../js/upgrades/individual-import-expansion/core.js');
const {create,RPC,RECEIPT_RPC}=require('../../js/upgrades/individual-import-expansion/controller.js');
const {fixture}=require('./fixture.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('older abandonment cannot erase a remounted uncertain retry; lost committed response recovers exactly once',async t=>{
  const f=await fixture(t),data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const actor=f.actors.admin,sheet=C.parse(Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\nRace import drill,Power Tools,Individual,1,Good'),'csv')[0];
  const input={sheet,mapping:C.autoMap(sheet.headers)},heldReceipt=deferred(),receiptStarted=deferred(),retryStarted=deferred(),commitRetry=deferred();
  let importCalls=0,holdReceipt=true;
  const client={async rpc(name,args){
    if(name===RPC&&++importCalls===2){retryStarted.resolve();await commitRetry.promise;await f.call(actor,name,args);throw Error('Committed response lost');}
    try{const value=await f.call(actor,name,args);if(name===RECEIPT_RPC&&holdReceipt){holdReceipt=false;receiptStarted.resolve();await heldReceipt.promise;}return {data:value};}
    catch(error){return {error:{code:error.code,message:error.message}};}
  }};
  const make=()=>create({client,storage,requireActor:()=>actor,crypto:webcrypto});
  await f.db.exec("alter table equipment add constraint final_race_rejection check(name <> 'Race import drill')");
  const old=make();await assert.rejects(old.confirm(input),/final_race_rejection/);const rejected=old.pending();
  assert.equal(rejected.rejected,true);assert.equal(rejected.uncertain,false);
  const abandonment=Promise.allSettled([old.abandonUncommitted()]);await receiptStarted.promise;
  // Navigation disposes the old controller; a new mount shares this tab's journal.
  old.dispose?.();const current=make();current.pending();
  await f.db.exec('alter table equipment drop constraint final_race_rejection');
  const retry=Promise.allSettled([current.confirm(input)]);await retryStarted.promise;
  assert.equal(current.pending().operation,rejected.operation);assert.equal(current.pending().uncertain,true);
  heldReceipt.resolve();await abandonment;
  try{
    assert.ok(current.pending(),'The older missing-receipt response must preserve the newer recovery token');
    assert.equal(current.pending().operation,rejected.operation);assert.equal(current.pending().uncertain,true);
  }finally{commitRetry.resolve();await retry;}
  assert.match((await retry)[0].reason.message,/Committed response lost/);
  const remounted=make(),receipt=await remounted.recover();assert.equal(receipt.operation_id,rejected.operation);assert.equal(remounted.pending(),null);
  assert.equal(importCalls,2,'Only initial rejected dispatch and the retry ran; receipt recovery never imports');
  assert.equal(Number((await f.db.query("select count(*) n from equipment where name='Race import drill'")).rows[0].n),1);
  assert.equal(Number((await f.db.query('select count(*) n from mcpa_equipment_imports where operation_id=$1',[rejected.operation])).rows[0].n),1);
});
