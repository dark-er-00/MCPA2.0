import {setup,escape,label,actionLabel,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../custody-lifecycle/ui.mjs';
const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const decisionTime=value=>value?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' Manila':'';
function blockedAssets(movements) {
  const blocked=new Set();
  for(const [collection,statuses] of Object.entries({requests:['pending','approved','released'],transfers:['pending','refused'],repairs:['reported','underrepair'],missing:['missing']})){
    for(const record of movements?.[collection]||[])if(statuses.includes(record.status)){
      for(const id of record.toolIds||[record.toolId])blocked.add(id);
    }
  }
  return blocked;
}
export async function mountRetirement(root,options={}){
  const ctx=setup(root,options);wireEvidence(root,ctx);let snapshot,query='',filterDate='',history=Boolean(options.historyOnly||options.recordId),selected=options.recordId||'',returnFocus=null,refreshVersion=0,draftVersion=0;
  for(const event of ['input','change'])root.addEventListener(event,()=>{++draftVersion;},{signal:ctx.signal});
  let submitting=false,eligible=new Set(),names=new Map(),activeAdmins=null,eligibilityUnavailable=false;
  const nameOf=id=>names.get(id)||snapshot?.profiles?.[id]||id;
  const badge=status=>`<span class="b-state" data-state="${escape(status)}">${escape(label(status))}</span>`;
  function updateProposal(){
    const form=root.querySelector('[data-proposal]');
    if(!form)return;
    const fields=form.elements;
    form.querySelector('[type=submit]').disabled=submitting||!eligible.has(form.querySelector('[name=assetId]:checked')?.value)||!fields.effectiveDate.value||!fields.effectiveDate.validity.valid||!fields.reason.value.trim();
  }
  function setView(next,route=true){
    history=next;
    const form=root.querySelector('[data-proposal]');
    if(form)form.hidden=history;
    root.querySelector('[data-retirement-history]').hidden=!history;
    for(const tab of root.querySelectorAll('[data-retirement-tab]'))tab.setAttribute('aria-pressed',String((tab.dataset.retirementTab==='history')===history));
    if(route)options.onRoute?.(history);
  }
  const showRetirement=()=>{
    const r=snapshot?.retirements?.find(v=>v.id===selected),dialog=root.querySelector('[data-retirement-dialog]'),host=root.querySelector('[data-retirement-dialog-body]');
    if(!dialog||!host)return;
    if(!r){host.innerHTML='';if(dialog.open)dialog.close();return;}
    const admin=snapshot.profile.role==='admin';
    const approvalBlock=eligibilityUnavailable?'Refresh eligibility before approving this proposal.':!eligible.has(r.asset_id)?'Resolve the custody or movement blocker before approval.':
      activeAdmins&&!activeAdmins.has(r.proposed_by)?'Approval requires the proposing Admin to have an active account.':'';
    dialog.querySelector('#retirement-dialog-title').textContent=r.equipmentName||'Retirement details';
    host.innerHTML=`<div class="b-retirement-head"><div><strong class="b-retirement-title">${escape(r.equipmentName)}</strong><span class="b-id">${escape(r.asset_id)} · ${escape(r.disposition==='sold'?'Sold':'Disposed')} · Effective ${escape(r.effective_date)}</span></div>${badge(r.status)}</div>
      <div class="b-retirement-body"><p class="b-retirement-reason">${escape(r.reason)}</p><p>Asset ID: <strong>${escape(r.asset_id)}</strong> · Disposition: <strong>${escape(r.disposition==='sold'?'Sold':'Disposed')}</strong> · Effective date: <strong>${escape(r.effective_date)}</strong><br>Proposed by: <strong>${escape(nameOf(r.proposed_by))}</strong>${r.proposed_by&&nameOf(r.proposed_by)!==r.proposed_by?` (${escape(r.proposed_by)})`:''}${r.approved_by?`<br>Decided by: <strong>${escape(nameOf(r.approved_by))}</strong>${nameOf(r.approved_by)!==r.approved_by?` (${escape(r.approved_by)})`:''} · ${escape(decisionTime(r.decided_at))}`:''}</p>
      ${r.decision_notes?`<p>${escape(r.decision_notes)}</p>`:''}${evidenceButtons(snapshot.evidence,r.id)}
      ${admin&&r.status==='proposed'?`<form data-retirement="${escape(r.id)}">${photoPicker(r.asset_id)}<label>Decision notes<textarea name="notes" maxlength="2000"></textarea></label><div class="b-row"><button type="submit" name="action" value="attachRetirementEvidence">Save proposal evidence</button>${r.proposed_by!==snapshot.profile.id?(!approvalBlock?'<button type="submit" class="b-primary" name="action" value="approveRetirement">Approve retirement</button>':`<small>${escape(approvalBlock)}</small>`)+'<button type="submit" name="action" value="rejectRetirement">Reject proposal</button>':'<small>A different active Admin must approve or reject this proposal.</small>'}</div></form>`:''}
      ${admin&&r.status==='approved'?`<form data-issue="${escape(r.id)}"><label>Report a potential sale or disposal issue<textarea name="notes" maxlength="2000" required></textarea></label><button type="submit">Report issue to Admin</button></form>`:''}
      <h3>Recorded history</h3><ul class="b-list">${snapshot.events.filter(e=>e.entity_id===r.id).map(e=>`<li>${escape(actionLabel(e.action))} · ${escape(decisionTime(e.created_at))}${e.details.notes?`<p>${escape(e.details.notes)}</p>`:''}</li>`).join('')}</ul></div>`;
    dialog.querySelector('[data-retirement-error]').hidden=true;
    if(!dialog.open)dialog.showModal();
  };
  const renderList=()=>{
    const records=snapshot.retirements.filter(r=>(!filterDate||r.effective_date===filterDate)&&`${r.asset_id} ${r.equipmentName}`.toLowerCase().includes(query.trim().toLowerCase()));
    const host=root.querySelector('[data-retirement-list]');
    if(!host)return;
    host.innerHTML=records.length?records.map(r=>`<article class="b-retirement-card" data-retirement-record="${escape(r.id)}"><div class="b-retirement-summary"><div class="b-retirement-head"><div><strong class="b-retirement-title">${escape(r.equipmentName)}</strong><span class="b-id">${escape(r.asset_id)} · ${escape(r.disposition==='sold'?'Sold':'Disposed')} · Effective ${escape(r.effective_date)}</span></div>${badge(r.status)}</div><p class="b-retirement-reason">${escape(r.reason)}</p><div class="b-retirement-meta"><span>Proposed by: <strong>${escape(nameOf(r.proposed_by))}</strong></span>${r.approved_by?`<span>Decided by: <strong>${escape(nameOf(r.approved_by))}</strong> · ${escape(decisionTime(r.decided_at))}</span>`:''}<button type="button" class="b-retirement-view" data-view-retirement="${escape(r.id)}">View Details</button></div></div></article>`).join(''):(query||filterDate?'<p class="b-empty">No retirement records match these filters.</p>':'<p class="b-empty">No retirement records are available.</p>');
    const clear=root.querySelector('[data-clear-retirement]');if(clear)clear.hidden=!query&&!filterDate;
  };
  const refresh=async()=>{
    if(ctx.disposed)return false;
    const refresh=++refreshVersion,draft=draftVersion;let value,movements;
    let movementReadFailed=false;
    try{[value,movements]=await Promise.all([ctx.api.snapshot(),options.readMovements?.().catch(()=>{movementReadFailed=true;})]);}
    catch(error){if(ctx.disposed||refresh!==refreshVersion||error.code==='MCPA_STALE_REFRESH')return false;throw error;}
    if(ctx.disposed||refresh!==refreshVersion)return false;
    if(draft!==draftVersion)throw Error('Your draft changed while records were loading. It has been kept. Refresh when ready.');
    const admin=value.profile.role==='admin';
    if(options.admin&&!admin)throw new Error('Admin retirement access required.');
    snapshot=value;
    eligibilityUnavailable=movementReadFailed;
    const blocked=blockedAssets(movements);
    const roster=movements?.recipients;
    activeAdmins=roster?new Set(roster.filter(p=>p.role==='admin').map(p=>p.id)):null;
    names=new Map((roster||[]).map(p=>[p.id,p.name]));
    names.set(value.profile.id,value.profile.name);
    const unheld=eligibilityUnavailable?[]:snapshot.assets.filter(a=>a.id&&a.individual&&!a.holderId&&!a.movementLock&&!blocked.has(a.id)&&['AVAILABLE','REPAIR'].includes(a.status));
    eligible=new Set(unheld.map(a=>a.id));
    const existing=new Set(snapshot.retirements.filter(r=>['proposed','approved'].includes(r.status)).map(r=>r.asset_id));
    const candidates=unheld.filter(a=>!existing.has(a.id));
    root.classList.toggle('b-admin-retirement',admin);
    ctx.content.innerHTML=`${admin?`<header class="b-retirement-header"><div><h1>Equipment Retirement</h1><p>Propose a retirement, then ask a different active Admin to review it. Approval requires no active custody or unresolved movement. Permanent Asset IDs and history are retained.</p></div><div class="b-retirement-tabs" role="group" aria-label="Retirement view"><button type="button" data-retirement-tab="proposal" aria-pressed="${!history}">Equipment Retirement</button><button type="button" data-retirement-tab="history" aria-pressed="${history}">History</button></div></header>`:'<h2>Sold and disposed equipment</h2><p>Review recorded retirement decisions and equipment history.</p>'}
      ${admin&&eligibilityUnavailable?'<div class="b-feedback" role="status">Equipment eligibility could not be verified. <button type="button" data-retry-retirement>Retry eligibility</button></div>':''}
      ${admin?`<form data-proposal ${history?'hidden':''}><div class="b-row b-proposal-row"><fieldset class="b-equipment-picker"><legend>Select unheld equipment</legend><details data-equipment-picker><summary>Select unheld equipment</summary><div class="b-equipment-options">${candidates.map(a=>`<label class="b-check"><input type="radio" name="assetId" value="${escape(a.id)}" required><span>${escape(a.name)} : ${escape(a.id)}</span></label>`).join('')||(eligibilityUnavailable?'<p>Retry eligibility to load equipment.</p>':'<p>No eligible unheld equipment.</p>')}</div></details></fieldset><label>Disposition<select name="disposition"><option value="sold">Sold</option><option value="disposed">Disposed</option></select></label><label>Effective date<input type="date" name="effectiveDate" max="${dateToday()}" required></label></div><label>Reason<textarea name="reason" maxlength="2000" required></textarea></label><button type="submit" class="b-primary" disabled>Propose for second Admin approval</button><small>Photographs can be added to the saved proposal before approval. Eligibility is checked again on the server.</small></form>`:''}
      <section data-retirement-history ${admin&&!history?'hidden':''}><h3>Retirement records</h3><div class="b-row"><label>Search by equipment name or Asset ID<input type="search" data-search placeholder="Equipment name or Asset ID" value="${escape(query)}"></label><label>Effective date<input type="date" data-retirement-date value="${escape(filterDate)}"></label></div><button type="button" data-clear-retirement hidden>Clear filters</button><section class="b-history" data-retirement-list></section></section><dialog class="b-return-dialog b-retirement-dialog" data-retirement-dialog aria-labelledby="retirement-dialog-title"><header class="b-row"><h2 id="retirement-dialog-title">Retirement details</h2><button type="button" data-close-retirement>Close</button></header><section data-retirement-dialog-body></section><p data-retirement-error role="alert" tabindex="-1" hidden></p></dialog>`;
    root.querySelector('[data-retirement-date]').addEventListener('change',event=>{filterDate=event.target.value;renderList();},{signal:ctx.signal});
    root.querySelectorAll('[data-retirement-tab]').forEach(button=>button.onclick=()=>{if(!submitting&&history!==(button.dataset.retirementTab==='history'))setView(!history);});
    root.querySelector('[data-equipment-picker]')?.addEventListener('change',event=>{const picker=event.currentTarget;picker.querySelector('summary').textContent=event.target.closest('label').textContent;picker.open=false;picker.querySelector('summary').focus();},{signal:ctx.signal});
    root.querySelector('[data-clear-retirement]').onclick=()=>{query='';filterDate='';root.querySelector('[data-retirement-date]').value='';const search=root.querySelector('[data-search]');search.value='';renderList();search.focus();};
    updateProposal();
    root.querySelector('[data-search]').addEventListener('input',event=>{query=event.target.value;renderList();},{signal:ctx.signal});renderList();if(selected)showRetirement();return true;
  };
  root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-retry-retirement')){ctx.say('');void ctx.task(refresh,b);return;}if(b.dataset.viewRetirement){selected=b.dataset.viewRetirement;returnFocus=b;showRetirement();options.onRoute?.(true,selected);root.querySelector('[data-close-retirement]')?.focus();}if(b.hasAttribute('data-close-retirement'))root.querySelector('[data-retirement-dialog]')?.close();},{signal:ctx.signal});
  root.addEventListener('close',event=>{if(!event.target.isConnected||!event.target.hasAttribute?.('data-retirement-dialog'))return;const trigger=returnFocus?.isConnected?returnFocus:root.querySelector(`[data-view-retirement="${CSS.escape(selected)}"]`);selected='';options.onRoute?.(true,'',true);trigger?.focus();},{capture:true,signal:ctx.signal});
  root.addEventListener('invalid',event=>{
    const picker=event.target.closest('[data-equipment-picker]');
    if(picker)picker.open=true;
  },{capture:true,signal:ctx.signal});
  for(const type of ['input','change'])root.addEventListener(type,event=>{if(event.target.closest('[data-proposal]'))updateProposal();},{signal:ctx.signal});
  root.addEventListener('submit',event=>{
    const form=event.target;event.preventDefault();
    if(submitting||event.submitter?.disabled)return;
    if(form.hasAttribute('data-proposal')&&(form.querySelector('[type=submit]').disabled||!form.reportValidity()))return;
    submitting=true;form.setAttribute('aria-busy','true');
    void ctx.task(async()=>{
      let saved;const values=Object.fromEntries(new FormData(form));
      form.inert=true;if(form.hasAttribute('data-proposal'))updateProposal();
      try{
        if(form.hasAttribute('data-proposal')){
          ctx.say('Recording retirement proposal…');
          saved=await ctx.api.mutate('proposeRetirement',values,'retirement-proposal');
          if(ctx.disposed)return;
          form.reset();form.querySelector('summary').textContent='Select unheld equipment';
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
        if(ctx.disposed)return;
        if(!history)setView(true);
        try{await refresh();}finally{options.onChanged?.(saved);}
      }catch(error){
        const notice=form.closest('dialog[open]')?.querySelector('[data-retirement-error]');
        if(!notice)throw error;
        notice.hidden=false;notice.textContent=error.message;notice.focus();
      }
    },event.submitter).finally(()=>{submitting=false;form.inert=false;form.removeAttribute('aria-busy');if(!ctx.disposed)updateProposal();});
  },{signal:ctx.signal});
  await ctx.task(refresh);
  if(!snapshot&&!ctx.disposed)ctx.content.innerHTML='<button type="button" data-retry-retirement>Retry loading retirement records</button>';
  return {refresh,destroy(){root.classList.remove('b-admin-retirement');ctx.destroy();}};
}
