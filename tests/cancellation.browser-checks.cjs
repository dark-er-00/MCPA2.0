// auth.browser.cjs --feature-completion uses only its isolated DB/browser.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot})=>{
  const {sky:sender,pau:receiver,admin}=f.actors;
  const origin=randomUUID(),destination=randomUUID(),assets={};
  await f.db.query("insert into public.sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Cancellation origin fixture','Local fixture',$2,$3),($4,'Cancellation receiver fixture','Local fixture',$5,$6)",[origin,sender.name,sender.id,destination,receiver.name,receiver.id]);
  for(const [name,held] of [['CANCEL-UI-PENDING',false],['CANCEL-UI-RESERVE',false],['CANCEL-UI-REFUSE',true],['CANCEL-UI-TRANSFER',true]]){
    assets[name]=randomUUID();
    await f.db.query("insert into public.equipment(id,asset_id,name,category,brand,quantity,status,current_holder_id,site_id) values($1,$2,$3,'Power Tools','Fixture',1,$4::equipment_status,$5,$6)",[assets[name],name,'Cancellation fixture '+name,held?'IN_USE':'AVAILABLE',held?sender.id:null,origin]);
  }
  const act=(actor,name,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:randomUUID()});
  const first=await act(sender,'createRequest',{toolIds:['CANCEL-UI-PENDING'],destination:'Cancellation origin fixture',purpose:'Pending withdrawal browser fixture'});
  const reserved=await act(sender,'createRequest',{toolIds:['CANCEL-UI-RESERVE'],destination:'Cancellation origin fixture',purpose:'Reservation browser fixture'});
  await act(admin,'approveRequest',{id:reserved.id});
  const transfer=await act(sender,'createTransfer',{toolIds:['CANCEL-UI-REFUSE'],destination:'Cancellation receiver fixture',receiverId:receiver.id});
  const toCancel=await act(sender,'createTransfer',{toolIds:['CANCEL-UI-TRANSFER'],destination:'Cancellation receiver fixture',receiverId:receiver.id});
  const enter=async key=>{
    if(await evaluate('Boolean(MCPAAuth.profile)'))await logout();
    await login(key);await wait("MCPAAuth.profile && document.querySelector('#app-shell') && !document.querySelector('#app-shell').classList.contains('hidden')");
  };
  const open=async(kind,id)=>{await go(kind);await evaluate(`MovementUI.openRecord(${JSON.stringify(kind)},${JSON.stringify(id)})`);await wait(`document.querySelector('[data-detail][open]')?.textContent.includes(${JSON.stringify(id)})`);};
  const countWrites=()=>calls.filter(call=>call.rpc==='mcpa_movement_action').length;
  const confirm=async(action,reason)=>{
    const form=`[data-form="adjust-movement"][data-method="${action}"]`;
    await fill(form+' [name=reason]',reason);await click(form+' [name=confirmed]');await submit(form);
  };
  await enter('sky');await open('request',first.id);
  for(const [width,height] of [[390,844],[1440,1000]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
    assert.ok(await evaluate("document.querySelector('[data-method=withdrawRequest]') && document.documentElement.scrollWidth<=innerWidth+1"));
    if(shot)await shot('withdrawal-form-'+width,true);
  }
  const writeCount=countWrites();
  await fill('[data-method=withdrawRequest] [name=reason]','Schedule changed');
  await submit('[data-method=withdrawRequest]');
  assert.equal(countWrites(),writeCount,'Unchecked confirmation cannot submit');
  await evaluate(`window.__originalCancelRpc=supabaseClient.rpc.bind(supabaseClient);window.__rejectCancelOnce=true;supabaseClient.rpc=(name,args)=>{if(name==='mcpa_movement_action'&&args.p_action==='withdrawRequest'&&window.__rejectCancelOnce){window.__rejectCancelOnce=false;return Promise.resolve({error:{code:'22023',message:'Fixture rejection: please retry'}});}return window.__originalCancelRpc(name,args);};`);
  await click('[data-method=withdrawRequest] [name=confirmed]');await submit('[data-method=withdrawRequest]');
  await wait("document.querySelector('[data-notice]')?.textContent.includes('Fixture rejection')");
  assert.equal(await evaluate("document.querySelector('[data-method=withdrawRequest] [name=reason]').value"),'Schedule changed','Rejected save preserves reason');
  await submit('[data-method=withdrawRequest]');await wait("MovementStore.getState().requests.some(r=>r.id==="+JSON.stringify(first.id)+"&&r.status==='withdrawn')");
  await evaluate('supabaseClient.rpc=window.__originalCancelRpc');
  await enter('admin');await open('request',reserved.id);
  assert.equal(await evaluate("document.querySelectorAll('[data-form=adjust-movement]').length"),0,'Admin monitors new cancellation controls');
  await open('transfer',transfer.id);
  assert.equal(await evaluate("document.querySelectorAll('[data-form=adjust-movement],[data-form=receive]').length"),0,'Admin cannot interrupt an engineer handover');
  await enter('sky');await open('request',reserved.id);await confirm('cancelReservation','Allocation no longer needed');
  await wait("MovementStore.getState().requests.some(r=>r.id==="+JSON.stringify(reserved.id)+"&&r.status==='canceled')");
  const custodyBefore=(await f.db.query('select to_jsonb(e) as value from public.equipment e where id=$1',[assets['CANCEL-UI-REFUSE']])).rows;
  await enter('pau');await open('transfer',transfer.id);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-method=cancelTransfer]'))"),false,'Receiver cannot cancel another sender direct handover');
  await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Cracked guard');await fill('[data-disposition]','declined');await click('[data-tested]');
  await wait("!document.querySelector('[data-refusal-fields]').hidden");
  const beforeRefusal=countWrites();await submit('[data-form=receive]');assert.equal(countWrites(),beforeRefusal,'Refusal requires reason and confirmation');
  await fill('[name=refusalReason]','Cracked guard; sender inspection needed');await click('[name=refusalConfirmed]');
  for(const [width,height] of [[390,844],[1440,1000]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('[data-receipt-submit]').textContent.includes('Refuse')"));
    if(shot)await shot('damage-refusal-form-'+width,true);
  }
  await submit('[data-form=receive]');await wait("MovementStore.getState().transfers.some(t=>t.id==="+JSON.stringify(transfer.id)+"&&t.status==='refused')");
  assert.deepEqual((await f.db.query('select to_jsonb(e) as value from public.equipment e where id=$1',[assets['CANCEL-UI-REFUSE']])).rows,custodyBefore);
  assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations where movement_id=$1',[transfer.id])).rows[0].n,1);
  await enter('admin');await open('transfer',transfer.id);assert.equal(await evaluate("document.querySelectorAll('[data-form=adjust-movement]').length"),0);
  await enter('sky');await open('transfer',transfer.id);await confirm('reopenTransfer','Guard checked; inspect again');
  await wait("MovementStore.getState().transfers.some(t=>t.id==="+JSON.stringify(transfer.id)+"&&t.status==='pending')");
  await enter('pau');await open('transfer',transfer.id);await fill('[data-condition]','good');await click('[data-tested]');await submit('[data-form=receive]');
  await wait("MovementStore.getState().transfers.some(t=>t.id==="+JSON.stringify(transfer.id)+"&&t.status==='received')");
  assert.equal((await f.db.query('select current_holder_id from public.equipment where id=$1',[assets['CANCEL-UI-REFUSE']])).rows[0].current_holder_id,receiver.id);
  await enter('sky');await open('transfer',toCancel.id);await confirm('cancelTransfer','Use another handover');
  await wait("MovementStore.getState().transfers.some(t=>t.id==="+JSON.stringify(toCancel.id)+"&&t.status==='canceled')");
  assert.equal((await f.db.query('select current_holder_id from public.equipment where id=$1',[assets['CANCEL-UI-TRANSFER']])).rows[0].current_holder_id,sender.id);
  assert.equal((await f.db.query('select count(*)::integer as n from public.mcpa_movement_reservations where movement_id=any($1::text[])',[[reserved.id,toCancel.id]])).rows[0].n,0);
  await go('activity');await wait("document.querySelector('#overview-results')");
  assert.ok(await evaluate("document.querySelector('#overview-results').textContent.includes('Cracked guard; sender inspection needed')"),'Sender sees refusal activity notification');
  console.log('PASS Desktop/mobile field withdrawal/cancellation, confirmation, retained-reason retry, receiver refusal, sender reopening, Admin monitoring, and unchanged custody');
  await logout();
};
