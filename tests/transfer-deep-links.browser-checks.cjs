const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,go,login,logout,calls})=>{
  const a=f.actors;
  const action=(actor,name,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:randomUUID()});
  const record=await action(a.sky,'createTransfer',{toolIds:['TOOL-003'],receiverId:a.pau.id,destinationId:f.sites.main,notes:'Offline deep-link regression'});
  await action(a.pau,'refuseTransfer',{id:record.id,reason:'Offline decision notification regression'});
  const businessState=async()=>Object.fromEntries(await Promise.all(['equipment','mcpa_movements','mcpa_movement_operations','mcpa_movement_reservations'].map(async table=>[table,(await f.db.query(`select to_jsonb(t) value from ${table} t order by to_jsonb(t)::text`)).rows])));
  const baseline=await businessState(),writes=calls.filter(c=>c.rpc==='mcpa_movement_action').length;
  const ready=()=>wait("document.querySelector('#screen-transfer.active [data-transfer-content][aria-busy=false]') && !MCPANavigation.restoring");
  const opened=async(view,id)=>{
    await ready();
    assert.equal(await evaluate(`document.querySelector('[data-transfer-view="${view}"]').getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate(`document.querySelector('[data-transfer-record="${id}"]')?.open`),true);
    assert.equal(await evaluate("document.querySelector('[data-nav-group=movements] .nav-parent').getAttribute('aria-expanded')"),'true');
  };
  const adminOwned=(await f.db.query("select id,actor_id,receiver_id from mcpa_movements where kind='transfer' and (actor_id=$1 or receiver_id=$1) order by id",[a.admin.id])).rows;
  const cases=[['sky','send',record.id],['pau','receive',record.id],['admin','history',record.id],
    ...adminOwned.map(row=>['admin',row.receiver_id===a.admin.id?'receive':'send',row.id])];
  for(const [key,view,targetId]of cases){
    await logout();await login(key);await wait(`MCPAAuth.profile?.id===${JSON.stringify(a[key].id)}`);
    await go('dashboard');await evaluate('MCPAMonitoring.open()');
    await wait("document.querySelector('#monitoring-dialog[open] .monitoring-body')?.getAttribute('aria-busy')==='false'");
    const notices=await f.rpc(a[key],'mcpa_monitoring_snapshot'),notice=notices.notifications.find(n=>n.entityId===targetId);
    assert.ok(notice,'Actual SQL-generated notice exists for '+key);
    await click(`[data-monitoring-notice="${notice.id}"]`);await opened(view,targetId);
    await command('Page.reload');await opened(view,targetId);
    await go('activity');await wait(`document.querySelector('a[data-movement-link][href="#transfer?record=${targetId}"]')`);
    await click(`a[data-movement-link][href="#transfer?record=${targetId}"]`);await opened(view,targetId);
    await go('transfer?view='+({send:'receive',receive:'history',history:'send'}[view])+'&record='+targetId);await opened(view,targetId);
  }
  await logout();await login('architect');await wait("MCPAAuth.profile?.role==='architect'");
  let missingFeedback;
  for(const id of ['TRF-NOT-RECORDED',record.id]){
    const notice=randomUUID();
    await f.db.query("insert into mcpa_notifications(id,recipient_id,kind,entity_id,dedupe_key,title,message,data) values($1::uuid,$2,'movement',$3,($1::uuid)::text,'Stale transfer link','Offline missing or inaccessible record fixture',$4)",[notice,a.architect.id,id,JSON.stringify({route:'transfer',action:'createTransfer'})]);
    await go('dashboard');await evaluate('MCPAMonitoring.open()');await wait("document.querySelector('#monitoring-dialog[open] .monitoring-body')?.getAttribute('aria-busy')==='false'");
    await click(`[data-monitoring-notice="${notice}"]`);await ready();
    const feedback=await evaluate("document.querySelector('[data-transfer-feedback]').textContent");
    assert.equal(await evaluate("document.querySelector('[data-transfer-view=history]').getAttribute('aria-pressed')"),'true');
    assert.equal(await evaluate(`document.querySelector('[data-transfer-record="${id}"]')`),null);
    assert.equal(await evaluate("document.querySelectorAll('[data-transfer-decision]').length"),0);
    if(missingFeedback)assert.equal(feedback,missingFeedback,'No distinction between missing and unauthorized records');else missingFeedback=feedback;
    assert.ok(feedback.includes('unavailable or outside your authorized records'));
    // The same fallback protects stale activity/direct routes and page refresh.
    await go('transfer?view=send&record='+id);await ready();assert.equal(await evaluate("document.querySelector('[data-transfer-feedback]').textContent"),missingFeedback);
    await command('Page.reload');await ready();assert.equal(await evaluate("document.querySelector('[data-transfer-feedback]').textContent"),missingFeedback);
  }
  assert.equal(calls.filter(c=>c.rpc==='mcpa_movement_action').length,writes,'Opening links requests no business mutation');
  assert.deepEqual(await businessState(),baseline,'Deep links leave custody, movements, reservations and audit unchanged');
  console.log('PASS SQL-backed notification/activity links for sender, recipient and Admin observer; refresh, stale tabs, missing/unauthorized privacy and no business writes');
};
