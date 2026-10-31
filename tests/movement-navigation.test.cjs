const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context=vm.createContext({window:{},URLSearchParams});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/navigation.js'),'utf8'),context);
const links=context.window.MCPAMovementLinks;

test('activity links resolve each saved entity type by exact ID, never summary text',()=>{
  const snapshot={requests:[{id:'REQ-00001'}],transfers:[{id:'TRF-00002'}],returns:[{id:'RTN-00003'}],repairs:[{id:'REP-00004'}],missing:[{id:'MIS-00005'}]};
  const before=JSON.stringify(snapshot);
  for(const [kind,collection] of Object.entries(links.collections)) {
    const event={action:'some_future_action',entityId:snapshot[collection][0].id,summary:'Transfer REQ-FAKE to the wrong screen'};
    assert.equal(links.href(event,snapshot),'#'+kind+'?record='+event.entityId);
  }
  assert.equal(JSON.stringify(snapshot),before);
});
test('live and demo actions provide safe missing-record routes, including releases to transfers',()=>{
  for(const [action,kind] of Object.entries({createRequest:'request',request_approved:'request',releaseRequest:'transfer',transfer_received:'transfer',createReturn:'return',return_created:'return',reportRepair:'repair',repair_completed:'repair',reportMissing:'missing',missing_recovered:'missing'})) {
    assert.equal(links.href({action,entityId:'stable-id'},{}),'#'+kind+'?record=stable-id');
  }
  for(const event of [{action:'unknown',entityId:'REQ-00001'},{action:'toString',entityId:'REQ-00001'},{action:'createRequest',summary:'REQ-00001'},{action:'createRequest',entityId:'x'.repeat(121)}]) {
    assert.equal(links.href(event,{}),'');
  }
});
test('target identifiers round-trip without introducing another route or query field',()=>{
  const id='stable & unusual/#?"id';
  const href=links.href({action:'createRequest',entityId:id},{});
  const parsed=links.parse(href);
  assert.equal(parsed.screen,'request');assert.equal(parsed.record,id);
  assert.equal(links.parse('#users?record=REQ-00001').record,'');
  assert.equal(links.parse('#request?record='+('x'.repeat(121))).record,'');
  assert.equal(links.parse('#request').record,'');
});
