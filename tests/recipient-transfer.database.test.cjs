// Authorized disposable in-memory SQL evaluation only. No credentials or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,randomUUID}=require('./integration-quantity-custody-v2/fixture.cjs');
const migration=fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/202611030001_transfer_recipient_acceptance.sql'),'utf8');
async function setup(t){const f=await fixture(t);await f.db.exec(migration);return f;}
const action=(f,actor,name,payload,operation=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:operation});
const draft=f=>({toolIds:['TOOL-002'],receiverId:f.actors.pau.id,destinationId:f.sites.main,notes:'Local test handover'});
const inspections=(ids=['TOOL-002'])=>ids.map(toolId=>({toolId,condition:'good',tested:true,physicallyReceived:true,disposition:'accepted'}));
const records=async f=>Object.fromEntries(await Promise.all(['equipment','mcpa_movements','mcpa_movement_reservations','mcpa_movement_operations','mcpa_notifications'].map(async table=>[table,(await f.db.query(`select to_jsonb(t) as value from ${table} t order by to_jsonb(t)::text`)).rows])));

test('initiation retains source custody; named acceptance is atomic, audited and idempotent',async t=>{
 const f=await setup(t),p=draft(f),before=await f.tool('TOOL-002'),op=randomUUID();
 const tr=await action(f,f.actors.sky,'createTransfer',p,op);assert.equal(tr.status,'pending');assert.equal(tr.transferVersion,3);
 assert.deepEqual(await f.tool('TOOL-002'),before);assert.deepEqual(await action(f,f.actors.sky,'createTransfer',p,op),tr);
 const snap=(await f.query(f.actors.pau,'select public.mcpa_transfer_snapshot() as value')).rows[0].value;
 assert.ok(snap.transfers.find(x=>x.id===tr.id).allowedActions.includes('receiveTransfer'));
 assert.ok(snap.sites.some(s=>s.id===f.sites.main&&s.assigned_engineer_id===f.actors.pau.id));
 assert.ok((await f.rpc(f.actors.pau,'mcpa_monitoring_snapshot')).notifications.some(n=>n.entityId===tr.id));
 const payload={id:tr.id,inspections:inspections()},receive=randomUUID();
 for(const a of [f.actors.sky,f.actors.admin,f.actors.architect,f.actors.secretary,f.actors.inactive,null])await assert.rejects(action(f,a,'receiveTransfer',payload));
 const accepted=await action(f,f.actors.pau,'receiveTransfer',payload,receive);
 assert.equal(accepted.status,'received');assert.equal(accepted.acceptedById,f.actors.pau.id);assert.ok(accepted.receivedAt);
 assert.equal((await f.tool('TOOL-002')).current_holder_id,f.actors.pau.id);
 assert.deepEqual(await action(f,f.actors.pau,'receiveTransfer',payload,receive),accepted);
 await assert.rejects(action(f,f.actors.pau,'receiveTransfer',payload));
 await assert.rejects(action(f,f.actors.sky,'receiveTransfer',payload,receive));
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,0);
 assert.ok((await f.rpc(f.actors.sky,'mcpa_monitoring_snapshot')).notifications.some(n=>n.entityId===tr.id&&n.data.action==='receiveTransfer'));
});

test('rejection and cancellation are terminal and preserve custody and accurate sender history',async t=>{
 const f=await setup(t),before=await f.tool('TOOL-002');
 let tr=await action(f,f.actors.sky,'createTransfer',draft(f));
 const rejected=await action(f,f.actors.pau,'refuseTransfer',{id:tr.id,reason:'Asset does not match the handover'});
 assert.equal(rejected.status,'rejected');assert.equal(rejected.decisionById,f.actors.pau.id);assert.deepEqual(await f.tool('TOOL-002'),before);
 for(const name of ['receiveTransfer','reopenTransfer'])await assert.rejects(action(f,f.actors.pau,name,{id:tr.id,inspections:inspections(),reason:'Retry',confirmed:true}));
 tr=await action(f,f.actors.sky,'createTransfer',draft(f));
 await assert.rejects(action(f,f.actors.admin,'cancelTransfer',{id:tr.id,reason:'Unrelated Admin'}));
 assert.equal((await action(f,f.actors.sky,'cancelTransfer',{id:tr.id,reason:'Sender canceled'})).status,'canceled');
 await assert.rejects(action(f,f.actors.pau,'receiveTransfer',{id:tr.id,inspections:inspections()}));
 assert.deepEqual(await f.tool('TOOL-002'),before);
 const snap=(await f.query(f.actors.sky,'select public.mcpa_transfer_snapshot() as value')).rows[0].value;
 assert.ok(snap.transfers.some(t=>t.status==='rejected'));assert.ok(snap.transfers.some(t=>t.status==='canceled'));
});

test('Admin dispatch and Admin receipt require their own authorized custody; no Admin override',async t=>{
 const f=await setup(t),a=f.actors;
 await assert.rejects(action(f,a.admin,'createTransfer',draft(f)),/custodian/);
 const stock={toolIds:['TOOL-001'],receiverId:a.pau.id,destinationId:f.sites.main};
 const dispatch=await action(f,a.admin,'createTransfer',stock);assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
 await action(f,a.pau,'receiveTransfer',{id:dispatch.id,inspections:inspections(['TOOL-001'])});
 await assert.rejects(action(f,a.sky,'createTransfer',{...draft(f),receiverId:a.admin.id}),/Office/);
 const tr=await action(f,a.sky,'createTransfer',{...draft(f),receiverId:a.admin.id,destinationId:f.sites.office});
 await assert.rejects(action(f,a.admin2,'receiveTransfer',{id:tr.id,inspections:inspections()}));
 await action(f,a.admin,'receiveTransfer',{id:tr.id,inspections:inspections()});assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
 const next=await action(f,a.admin,'createTransfer',draft(f));assert.equal(next.status,'pending');assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
});

test('conflicts, malformed inspections and alternate editors cannot change pending accountability',async t=>{
 const f=await setup(t),a=f.actors,p=draft(f);
 const tr=await action(f,a.sky,'createTransfer',p),baseline=await records(f);
 await assert.rejects(action(f,a.sky,'createTransfer',p),/reserved/);
 for(const checks of [[],inspections(['OTHER']),[...inspections(),...inspections()], [{toolId:'TOOL-002',condition:'good',tested:true}], [{...inspections()[0],condition:'damaged'}]]){
  await assert.rejects(action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:checks}));assert.deepEqual(await records(f),baseline);
 }
 await assert.rejects(f.query(a.admin,'update equipment set current_holder_id=$1 where asset_id=$2',[a.pau.id,'TOOL-002']));
 await assert.rejects(f.db.query('update equipment set current_holder_id=$1 where asset_id=$2',[a.pau.id,'TOOL-002']),/pending recipient handover/,'Definer-level writers also meet the pending-custody trigger');
 await assert.rejects(action(f,a.sky,'createReturn',{toolIds:['TOOL-002'],destination:'Office',conditions:inspections()}));
 assert.deepEqual(await records(f),baseline);
 // Simulate a mid-transaction failure after the transfer state update.
 await f.db.exec("create function public.fail_receipt() returns trigger language plpgsql as $$begin if new.current_holder_id is distinct from old.current_holder_id then raise exception 'Synthetic receipt failure'; end if; return new; end$$; create trigger fail_receipt before update on equipment for each row execute function public.fail_receipt();");
 await assert.rejects(action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:inspections()}),/Synthetic/);
 assert.deepEqual(await records(f),baseline,'Movement state, custody, reservations, audit and notices all roll back');
});

test('damaged acceptance records repair while aggregate assets, wrong assignments and reused IDs stay blocked',async t=>{
 const f=await setup(t),a=f.actors,p=draft(f),op=randomUUID();
 await assert.rejects(action(f,a.sky,'createTransfer',{...p,receiverId:a.architect.id}),/assigned/);
 await f.db.query("update equipment set quantity=4 where asset_id='ZERO'");
 await assert.rejects(action(f,a.admin,'createTransfer',{...p,toolIds:['ZERO']}));
 const tr=await action(f,a.sky,'createTransfer',p,op);
 await assert.rejects(action(f,a.sky,'createTransfer',{...p,notes:'Changed'},op));
 await action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:[{...inspections()[0],condition:'damaged',notes:'Recorded guard damage'}]});
 const tool=await f.tool('TOOL-002');assert.equal(tool.status,'REPAIR');assert.equal(tool.current_holder_id,a.pau.id);
 assert.equal((await f.db.query("select count(*)::int n from mcpa_movements where kind='repair' and data->>'sourceId'=$1",[tr.id])).rows[0].n,1);
});

test('migration does not rewrite history and legacy decisions retain their authorization engine',async t=>{
 const f=await fixture(t),a=f.actors;
 const tr=await action(f,a.sky,'createTransfer',{...draft(f),destination:'Main Warehouse'});const before=await records(f);
 await f.db.exec(migration);assert.deepEqual(await records(f),before);
 await assert.rejects(action(f,a.admin,'receiveTransfer',{id:tr.id,inspections:inspections()}));
 await action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:inspections()});assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await f.db.query("select has_function_privilege($1,'mcpa_auth_private.recipient_transfer_action(text,jsonb,uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
});

test('receiving QR validation and retry semantics are retained without persisting QR secrets',async t=>{
 const f=await setup(t),a=f.actors,p=draft(f),op=randomUUID();
 const qr=await f.rpc(a.pau,'mcpa_create_receiving_qr',{p_site_id:f.sites.main});
 await assert.rejects(action(f,a.sky,'createTransfer',{...p,receivingToken:'invalid-local-fixture'}));
 const tr=await action(f,a.sky,'createTransfer',{...p,receivingToken:qr.token},op);
 await f.rpc(a.pau,'mcpa_revoke_receiving_qr',{p_token:qr.token});
 assert.deepEqual(await action(f,a.sky,'createTransfer',{...p,receivingToken:qr.token},op),tr);
 const record=(await f.db.query('select payload,result,activity from mcpa_movement_operations where id=$1',[op])).rows[0];
 assert.ok(!JSON.stringify(record).includes(qr.token));assert.equal(Object.hasOwn(record.payload,'receivingToken'),false);
});

test('overlapping submissions admit one pending transfer and changed recipient eligibility blocks acceptance',async t=>{
 const f=await setup(t),a=f.actors,p=draft(f);
 // The shared in-memory connection serializes SQL; this verifies competing
 // operation outcomes, not independent native PostgreSQL sessions.
 const results=await Promise.allSettled([action(f,a.sky,'createTransfer',p),action(f,a.sky,'createTransfer',p)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const tr=results.find(r=>r.status==='fulfilled').value,before=await f.tool('TOOL-002');
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,f.sites.main]);
 await assert.rejects(action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:inspections()}),/eligibility/);
 assert.deepEqual(await f.tool('TOOL-002'),before);
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.pau.id,f.sites.main]);
 await f.db.query("update profiles set account_status='inactive' where id=$1",[a.pau.id]);
 await assert.rejects(action(f,a.pau,'receiveTransfer',{id:tr.id,inspections:inspections()}));assert.deepEqual(await f.tool('TOOL-002'),before);
});

test('incumbent v2 QR composer, physical acceptance, returns and retirement restrictions coexist with the update',async t=>{
 const f=await setup(t),a=f.actors;
 const tr=await f.action(a.sky,'createTransfer',{assetIds:['TOOL-002'],receiverId:a.pau.id,destinationId:f.sites.main});
 assert.equal(tr.transferVersion,3);assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
 await assert.rejects(f.action(a.admin,'proposeRetirement',{assetId:'TOOL-002',disposition:'sold',reason:'Local retirement check',effectiveDate:'2026-11-03'}));
 await f.action(a.pau,'receiveTransfer',{id:tr.id,inspections:inspections()});assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);
 const returned=await f.action(a.pau,'submitReturn',{assetIds:['TOOL-002'],destinationId:f.sites.office});
 assert.equal(returned.status,'pendingInspection');assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);
 await f.inspect(returned.id,[{assetId:'TOOL-002',outcome:'good',physicallyReceived:true}]);
 assert.equal((await f.tool('TOOL-002')).current_holder_id,null);
});
