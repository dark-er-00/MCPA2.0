const {test}=require('node:test'),assert=require('node:assert/strict');
const model=()=>import('../js/upgrades/equipment-requests/model.mjs');
test('combines both request types once and resolves receipt from the linked handover',async()=>{
  const {requests}=await model();
  const snapshot={tools:[{id:'A-1',name:'Drill'}],requests:[{id:'REQ-1',status:'approved',toolIds:['A-1']},{id:'REQ-2',status:'released',toolIds:['A-2']}],transfers:[{id:'TRF-2',requestId:'REQ-2',status:'pending',receiverId:'engineer'}]};
  let rows=requests(snapshot,[{id:'Q-2',movement_id:'REQ-2',status:'released',requested_quantity:1,assets:[{asset_id:'A-2'}]}]);
  assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='REQ-1').stage.key,'approved');
  assert.equal(rows.find(r=>r.id==='Q-2').stage.key,'inspection');
  snapshot.transfers[0].status='received';rows=requests(snapshot,[{id:'Q-2',movement_id:'REQ-2',status:'released'}]);
  assert.equal(rows.find(r=>r.id==='Q-2').stage.key,'received');
});
test('pending quantity requests cannot attach unrelated direct transfers; missing or conflicting links fail closed',async()=>{
  const {requests}=await model();
  assert.equal(requests({transfers:[{id:'DIRECT',status:'pending'}]},[{id:'Q',status:'pending'}])[0].stage.key,'pending');
  const snapshot={requests:[{id:'REQ',status:'released'}],transfers:[]};
  assert.equal(requests(snapshot,[])[0].stage.key,'unverified');
  snapshot.transfers=[{id:'T1',requestId:'REQ',status:'pending'},{id:'T2',requestId:'REQ',status:'pending'}];
  assert.equal(requests(snapshot,[])[0].transfer,null);
  assert.equal(requests(snapshot,[])[0].stage.key,'unverified');
});
test('closed and exception records remain distinct from confirmed receipt',async()=>{
  const {requests}=await model();
  for(const status of ['rejected','canceled','cancelled','withdrawn']) {
    const row=requests({requests:[{id:'REQ',status}]},[])[0];
    assert.equal(row.stage.key,status==='canceled'?'cancelled':status);
  }
  for(const status of ['refused','discrepancy','disputed'])assert.equal(requests({requests:[{id:'REQ',status:'released'}],transfers:[{id:'T',requestId:'REQ',status}]},[])[0].stage.key,'follow-up');
  const historical=requests({requests:[{id:'REQ',status:'released'}],transfers:[{id:'T',requestId:'REQ',status:'received',inspections:[{toolId:'A',condition:'lost'}]}]},[])[0];
  assert.equal(historical.stage.key,'follow-up');assert.equal(historical.inspectionRecorded,true);
  const cancelled=requests({requests:[{id:'REQ',status:'canceled'}],activity:[{entityId:'REQ',action:'approveRequest'}]},[])[0];
  assert.equal(cancelled.approvalRecorded,true);assert.equal(cancelled.releaseRecorded,false);
});
test('both request types replay submission, reservation, release and receipt exactly once without premature custody',async t=>{
  const {fixture,randomUUID:id}=require('./integration-quantity-custody-v2/fixture.cjs'),f=await fixture(t),a=f.actors;
  const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'Unified replay drill',category:'Power Tools',condition:'Good',tracking_type:'Individual',quantity:1}]});
  const group=(await f.call(a.sky,'mcpa_wa_equipment_catalog')).groups.find(g=>g.type_name==='Unified replay drill');
  for(const kind of ['specific','quantity']) {
    let movement,tag;
    if(kind==='specific') {
      const args={p_action:'createRequest',p_payload:{toolIds:['TOOL-001'],destination:'Casa Buena'},p_operation_id:id()};
      movement=(await f.rpc(a.sky,'mcpa_movement_action',args)).id;
      assert.equal((await f.rpc(a.sky,'mcpa_movement_action',args)).id,movement);
      const approve={p_action:'approveRequest',p_payload:{id:movement},p_operation_id:id()};
      await f.rpc(a.admin,'mcpa_movement_action',approve);await f.rpc(a.admin,'mcpa_movement_action',approve);tag='TOOL-001';
    } else {
      const args={p_operation_id:id(),p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:1,p_purpose:'Replay check'};
      const request=await f.call(a.sky,'mcpa_wa_submit_equipment',args);assert.deepEqual(await f.call(a.sky,'mcpa_wa_submit_equipment',args),request);
      const allocate={p_operation_id:id(),p_request_id:request.id,p_asset_ids:imported.assets.map(asset=>asset.id)};
      const allocation=await f.call(a.admin,'mcpa_wa_allocate_equipment',allocate);assert.deepEqual(await f.call(a.admin,'mcpa_wa_allocate_equipment',allocate),allocation);
      movement=allocation.movement_id;tag=imported.assets[0].asset_id;
    }
    assert.equal((await f.tool(tag)).current_holder_id,null);
    const release={p_action:'releaseRequest',p_payload:{id:movement},p_operation_id:id()},tr=await f.rpc(a.admin,'mcpa_movement_action',release);
    assert.deepEqual(await f.rpc(a.admin,'mcpa_movement_action',release),tr);assert.equal((await f.tool(tag)).current_holder_id,null);
    const payload={id:tr.id,inspections:[{toolId:tag,condition:'good',tested:true,physicallyReceived:true}]},op=id();
    const received=await f.action(a.sky,'receiveTransfer',payload,op);assert.deepEqual(await f.action(a.sky,'receiveTransfer',payload,op),received);
    await assert.rejects(f.action(a.sky,'receiveTransfer',payload));
    assert.equal((await f.tool(tag)).current_holder_id,a.sky.id);
    const transfers=(await f.rpc(a.admin,'mcpa_movement_snapshot')).transfers.filter(t=>t.requestId===movement);assert.equal(transfers.length,1);
  }
});
