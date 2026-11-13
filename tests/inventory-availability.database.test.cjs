const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610150001_inventory_availability.sql'),'utf8');
test('read-only availability metadata closes the hidden-reservation gap without exposing private movements or rewriting records',async()=>{
  const f=await authDatabase({engineerPortal:true});
  try{
    await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100004_movement_cancellation.sql'),'utf8'));
    const action=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
    const request=await action(f.actors.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Private request purpose'});
    await action(f.actors.admin,'approveRequest',{id:request.id});
    const old=await f.rpc(f.actors.pau,'mcpa_movement_snapshot');
    assert.equal(old.tools.find(t=>t.id==='TOOL-001').status,'available');
    assert.equal(old.requests.some(r=>r.id===request.id),false,'Reproduce the reservation hidden from another engineer');
    const records=async()=>JSON.stringify((await f.db.query("select jsonb_build_object('equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),'movements',(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m),'locks',(select jsonb_agg(to_jsonb(r) order by equipment_id) from mcpa_movement_reservations r)) as data")).rows);
    const before=await records();await f.db.exec(migration);await f.db.exec(migration);assert.equal(await records(),before);
    for(const actor of [f.actors.admin,f.actors.pau,f.actors.sky]){
      const data=await f.rpc(actor,'mcpa_movement_snapshot'),tool=data.tools.find(t=>t.id==='TOOL-001');
      assert.equal(data.inventoryAvailabilityVersion,1);assert.equal(tool.movementLock,'request');assert.equal(tool.recordedStatus,'AVAILABLE');
      if(actor===f.actors.pau){assert.equal(data.requests.length,0);assert.ok(!JSON.stringify(tool).includes(request.id));assert.ok(!JSON.stringify(data).includes('Private request purpose'));}
    }
    const transfer=await action(f.actors.admin,'releaseRequest',{id:request.id});
    const released=await f.rpc(f.actors.pau,'mcpa_movement_snapshot');
    assert.equal(released.tools.find(t=>t.id==='TOOL-001').movementLock,'transfer');
    assert.equal(released.transfers.some(t=>t.id===transfer.id),false);
    await action(f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true,notes:''}]});
    const received=(await f.rpc(f.actors.sky,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-001');
    assert.equal(received.movementLock,null);assert.equal(received.recordedStatus,'IN_USE');assert.equal(received.holderId,f.actors.sky.id);
    const personal=await f.rpc(f.actors.sky,'mcpa_personal_equipment_snapshot');
    assert.ok(personal.tools.every(t=>Object.hasOwn(t,'movementLock')&&t.recordedStatus==='IN_USE'));
    await assert.rejects(f.rpc(null,'mcpa_movement_snapshot'));
    await assert.rejects(f.rpc(f.actors.secretary,'mcpa_movement_snapshot'));
    await assert.rejects(f.rpc(f.actors.inactive,'mcpa_movement_snapshot'));
    await assert.rejects(f.query(f.actors.pau,'select mcpa_auth_private.movement_snapshot_before_availability()'));
  }finally{await f.close();}
});
