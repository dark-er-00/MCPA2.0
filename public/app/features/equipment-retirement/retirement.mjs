import {setup,escape,label,actionLabel,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../custody-lifecycle/ui.mjs';
const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function mountRetirement(root,options={}){
  const ctx=setup(root,options);wireEvidence(root,ctx);let snapshot,query='',filterDate='',history=Boolean(options.historyOnly||options.recordId),selected=options.recordId||'',returnFocus=null,refreshVersion=0,draftVersion=0;
  for(const event of ['input','change'])root.addEventListener(event,()=>{++draftVersion;},{signal:ctx.signal});
  const nameOf=id=>snapshot?.profiles?.[id]||id;
  const showRetirement=()=>{
    const r=snapshot?.retirements?.find(v=>v.id===selected),dialog=root.querySelector('[data-retirement-dialog]'),host=root.querySelector('[data-retirement-dialog-body]');
    if(!dialog||!host)return;
    if(!r){host.innerHTML='';if(dialog.open)dialog.close();return;}
    const admin=snapshot.profile.role==='admin';
    dialog.querySelector('#retirement-dialog-title').textContent=r.equipmentName||'Retirement details';
    host.innerHTML=`<div class="b-retirement-head"><div><strong class="b-retirement-title">${escape(r.equipmentName)}</strong><span class="b-id">${escape(r.asset_id)} · ${escape(r.disposition==='sold'?'Sold':'Disposed')} · Effective ${escape(r.effective_date)}</span></div><span class="b-state">${escape(label(r.status))}</span></div>
      <div class="b-retirement-body"><p class="b-retirement-reason">${escape(r.reason)}</p><p>Asset ID: <strong>${escape(r.asset_id)}</strong> · Disposition: <strong>${escape(r.disposition==='sold'?'Sold':'Disposed')}</strong> · Effective date: <strong>${escape(r.effective_date)}</strong><br>Proposed by: <strong>${escape(nameOf(r.proposed_by))}</strong>${r.proposed_by&&nameOf(r.proposed_by)!==r.proposed_by?` (${escape(r.proposed_by)})`:''}${r.approved_by?`<br>Decided by: <strong>${escape(nameOf(r.approved_by))}</strong>${nameOf(r.approved_by)!==r.approved_by?` (${escape(r.approved_by)})`:''} · ${escape(new Date(r.decided_at).toLocaleString())}`:''}</p>
      ${r.decision_notes?`<p>${escape(r.decision_notes)}</p>`:''}${evidenceButtons(snapshot.evidence,r.id)}
      ${admin&&r.status==='proposed'?`<form data-retirement="${escape(r.id)}">${photoPicker(r.asset_id)}<label>Decision notes<textarea name="notes" maxlength="2000"></textarea></label><div class="b-row"><button type="submit" name="action" value="attachRetirementEvidence">Save proposal evidence</button>${r.proposed_by!==snapshot.profile.id?'<button type="submit" class="b-primary" name="action" value="approveRetirement">Approve retirement</button><button type="submit" name="action" value="rejectRetirement">Reject proposal</button>':'<small>A different active Admin must approve or reject this proposal.</small>'}</div></form>`:''}
      ${r.status==='approved'?`<form data-issue="${escape(r.id)}"><label>Report a potential sale or disposal issue<textarea name="notes" maxlength="2000" required></textarea></label><button type="submit">Report issue to Admin</button></form>`:''}
      <h3>Recorded history</h3><ul class="b-list">${snapshot.events.filter(e=>e.entity_id===r.id).map(e=>`<li>${escape(actionLabel(e.action))} · ${escape(new Date(e.created_at).toLocaleString())}${e.details.notes?`<p>${escape(e.details.notes)}</p>`:''}</li>`).join('')}</ul></div>`;
    if(!dialog.open)dialog.showModal();
  };
  const renderList=()=>{
    const records=snapshot.retirements.filter(r=>(!filterDate||r.effective_date===filterDate)&&`${r.asset_id} ${r.equipmentName}`.toLowerCase().includes(query.toLowerCase()));
    const host=root.querySelector('[data-retirement-list]');
    if(!host)return;
    host.innerHTML=records.length?records.map(r=>`<article class="b-retirement-card" data-retirement-record="${escape(r.id)}"><div class="b-retirement-summary"><div class="b-retirement-head"><div><strong class="b-retirement-title">${escape(r.equipmentName)}</strong><span class="b-id">${escape(r.asset_id)} · ${escape(r.disposition==='sold'?'Sold':'Disposed')} · Effective ${escape(r.effective_date)}</span></div><span class="b-state">${escape(label(r.status))}</span></div><p class="b-retirement-reason">${escape(r.reason)}</p><div class="b-retirement-meta"><span>Proposed by: <strong>${escape(nameOf(r.proposed_by))}</strong></span>${r.approved_by?`<span>Decided by: <strong>${escape(nameOf(r.approved_by))}</strong> · ${escape(new Date(r.decided_at).toLocaleString())}</span>`:''}<button type="button" class="b-retirement-view" data-view-retirement="${escape(r.id)}">View details</button></div></div></article>`).join(''):'<p class="b-empty">No permitted retirement records match your search.</p>';
  };
  const refresh=async()=>{
    if(ctx.disposed)return false;
    const refresh=++refreshVersion,draft=draftVersion;let value;
    try{value=await ctx.api.snapshot();}
    catch(error){if(ctx.disposed||refresh!==refreshVersion||error.code==='MCPA_STALE_REFRESH')return false;throw error;}
    if(ctx.disposed||refresh!==refreshVersion)return false;
    if(draft!==draftVersion)throw Error('Your draft changed while records were loading. It has been kept. Refresh when ready.');
    const admin=value.profile.role==='admin';
    if(options.admin&&!admin)throw new Error('Admin retirement access required.');
    snapshot=value;
    const candidates=snapshot.assets.filter(a=>a.individual&&!a.holderId&&!a.movementLock&&['AVAILABLE','REPAIR'].includes(a.status));
    ctx.content.innerHTML=`${admin?'<div class="b-row" role="group" aria-label="Retirement view"><button type="button" data-retirement-tab="proposal" aria-pressed="'+!history+'">Equipment Retirement</button><button type="button" data-retirement-tab="history" aria-pressed="'+history+'">History</button></div>':''}<h2>${admin?'Equipment Retirement':'Sold and disposed equipment'}</h2><p>${options.historyOnly?'Review recorded retirement decisions and equipment history.':admin?'Propose a retirement, then ask a different active Admin to review it. Approval requires no active custody or unresolved movement. Permanent Asset IDs and history are retained.':'Search retirement history for equipment involved in your movements. Report any potential disposal issue for Admin follow-up.'}</p>
      ${admin?`<form data-proposal ${history?'hidden':''}><h3>Propose retirement</h3><div class="b-row"><fieldset class="b-equipment-picker"><legend>Select unheld equipment</legend><details data-equipment-picker><summary>Select unheld equipment</summary><div class="b-equipment-options">${candidates.map(a=>`<label class="b-check"><input type="radio" name="assetId" value="${escape(a.id)}" required><span>${escape(a.name)} : ${escape(a.id)}</span></label>`).join('')||'<p>No eligible unheld equipment.</p>'}</div></details></fieldset><label>Disposition<select name="disposition"><option value="sold">Sold</option><option value="disposed">Disposed</option></select></label><label>Effective date<input type="date" name="effectiveDate" max="${dateToday()}" required></label></div><label>Reason<textarea name="reason" maxlength="2000" required></textarea></label><button type="submit">Propose for second Admin approval</button><small>Photographs can be added to the saved proposal before approval. Eligibility is checked again on the server.</small></form>`:''}
      <section data-retirement-history ${admin&&!history?'hidden':''}><h3>Retirement records</h3><div class="b-row"><label>Search by equipment name or Asset ID<input type="search" data-search placeholder="Equipment name or Asset ID" value="${escape(query)}"></label><label>Effective date<input type="date" data-retirement-date value="${escape(filterDate)}"></label></div><section class="b-history" data-retirement-list></section></section><dialog class="b-return-dialog b-retirement-dialog" data-retirement-dialog aria-labelledby="retirement-dialog-title"><header class="b-row"><h2 id="retirement-dialog-title">Retirement details</h2><button type="button" data-close-retirement>Close</button></header><section data-retirement-dialog-body></section></dialog>`;
    root.querySelector('[data-retirement-date]').addEventListener('change',event=>{filterDate=event.target.value;renderList();},{signal:ctx.signal});
    root.querySelectorAll('[data-retirement-tab]').forEach(button=>button.onclick=()=>{history=button.dataset.retirementTab==='history';root.querySelector('[data-proposal]').hidden=history;root.querySelector('[data-retirement-history]').hidden=!history;root.querySelectorAll('[data-retirement-tab]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.retirementTab==='history')===history)));});
    root.querySelector('[data-equipment-picker]')?.addEventListener('change',event=>{const picker=event.currentTarget;picker.querySelector('summary').textContent=event.target.closest('label').textContent;picker.open=false;picker.querySelector('summary').focus();},{signal:ctx.signal});
    root.querySelector('[data-search]').addEventListener('input',event=>{query=event.target.value;renderList();},{signal:ctx.signal});renderList();if(selected)showRetirement();return true;
  };
  root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.viewRetirement){selected=b.dataset.viewRetirement;returnFocus=b;showRetirement();root.querySelector('[data-close-retirement]')?.focus();}if(b.hasAttribute('data-close-retirement'))root.querySelector('[data-retirement-dialog]')?.close();},{signal:ctx.signal});
  root.addEventListener('close',event=>{if(!event.target.hasAttribute?.('data-retirement-dialog'))return;const trigger=returnFocus?.isConnected?returnFocus:root.querySelector(`[data-view-retirement="${CSS.escape(selected)}"]`);selected='';trigger?.focus();},{capture:true,signal:ctx.signal});
  root.addEventListener('submit',event=>{
    const form=event.target;event.preventDefault();
    void ctx.task(async()=>{
      let saved;const values=Object.fromEntries(new FormData(form));
      if(form.hasAttribute('data-proposal')){
        saved=await ctx.api.mutate('proposeRetirement',values,'retirement-proposal');
        ctx.say('Proposal recorded. Add evidence to the proposal and ask a different Admin to review it.');
      }else if(form.dataset.retirement){
        const action=event.submitter?.value;
        if(action==='rejectRetirement'&&!values.notes.trim())throw new Error('Explain why the retirement proposal is rejected.');
        const evidenceIds=await uploadSelected(form,ctx,'retirement',form.dataset.retirement);
        if(action==='attachRetirementEvidence'&&!evidenceIds.length)throw new Error('Select photographs for this proposal.');
        saved=await ctx.api.mutate(action,{id:form.dataset.retirement,notes:values.notes,evidenceIds},form.dataset.retirement);
        ctx.say(action==='attachRetirementEvidence'?'Proposal evidence saved.':`Retirement ${saved.status}.`);
      }else if(form.dataset.issue){
        saved=await ctx.api.mutate('reportRetirementIssue',{id:form.dataset.issue,notes:values.notes},`issue:${form.dataset.issue}`);ctx.say('Issue recorded and Admin notified.');
      }
      history=true;await refresh();options.onChanged?.(saved);
    },event.submitter);
  },{signal:ctx.signal});
  await ctx.task(refresh);return {refresh,destroy:ctx.destroy};
}
