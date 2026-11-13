const {test}=require('node:test'),assert=require('node:assert/strict');
const data=(id,role='engineer')=>({profile:{id,role},transfers:[{id:'TRF-1',actorId:'sender',receiverId:'recipient'}]});
test('transfer links choose the named recipient, sender and authorized observer views before filtering',async()=>{
  const {resolveTransferView}=await import('../public/app/features/custody-lifecycle/transfers.mjs');
  assert.equal(resolveTransferView(data('recipient'),'TRF-1'),'receive');
  assert.equal(resolveTransferView(data('sender'),'TRF-1'),'send');
  assert.equal(resolveTransferView(data('observer','admin'),'TRF-1'),'history');
});
test('record ownership overrides stale view parameters without changing the snapshot',async()=>{
  const {resolveTransferView}=await import('../public/app/features/custody-lifecycle/transfers.mjs');
  const snapshot=data('sender'),before=JSON.stringify(snapshot);
  assert.equal(resolveTransferView(snapshot,'TRF-1','receive'),'send');
  assert.equal(resolveTransferView(data('recipient'),'TRF-1','history'),'receive');
  assert.equal(JSON.stringify(snapshot),before);
});
test('missing and unauthorized transfer IDs share a neutral view; untargeted tabs retain their choice',async()=>{
  const {resolveTransferView}=await import('../public/app/features/custody-lifecycle/transfers.mjs');
  assert.equal(resolveTransferView(data('sender'),'MISSING','send'),'history');
  assert.equal(resolveTransferView({...data('unrelated'),transfers:[]},'TRF-1','receive'),'history');
  for(const view of ['receive','send','history'])assert.equal(resolveTransferView(data('sender'),'',view),view);
});
