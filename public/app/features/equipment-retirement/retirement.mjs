import {setup,escape,label,actionLabel,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../custody-lifecycle/ui.mjs';
const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function mountRetirement(root,options={}){
  const ctx=setup(root,options);wireEvidence(root,ctx);let snapshot,query='',refreshVersion=0,draftVersion=0;
  for(const event of ['input','change'])root.addEventListener(event,()=>{++draftVersion;},{signal:ctx.signal});
  const renderList=()=>{
    const admin=snapshot.profile.role==='admin';
    const records=snapshot.retirements.filter(r=>`${r.asset_id} ${r.equipmentName}`.toLowerCase().includes(query.toLowerCase()));
    const host=root.querySelector('[data-retirement-list]');
    host.innerHTML=records.length?records.map(r=>`<details data-retirement-record="${escape(r.id)}" ${r.id===options.recordId?'open':''}><summary>${escape(r.asset_id)} · ${escape(r.equipmentName)} · ${escape(r.disposition)} · ${escape(label(r.status))}</summary>
      <p>${escape(r.reason)}</p><p>Effective date: ${escape(r.effective_date)}<br>Proposed by: ${escape(r.proposed_by)}${r.approved_by?`<br>Decided by: ${escape(r.approved_by)} · ${escape(new Date(r.decided_at).toLocaleString())}`:''}</p>
      ${r.decision_notes?`<p>${escape(r.decision_notes)}</p>`:''}${evidenceButtons(snapshot.evidence,r.id)}
      ${admin&&r.status==='proposed'?`<form data-retirement="${escape(r.id)}">${photoPicker(r.asset_id)}<label>Decision notes<textarea name="notes" maxlength="2000"></textarea></label><div class="b-row"><button type="submit" name="action" value="attachRetirementEvidence">Save proposal evidence</button>${r.proposed_by!==snapshot.profile.id?'<button type="submit" class="b-primary" name="action" value="approveRetirement">Approve retirement</button><button type="submit" name="action" value="rejectRetirement">Reject proposal</button>':'<small>A different active Admin must approve or reject this proposal.</small>'}</div></form>`:''}
      ${r.status==='approved'?`<form data-issue="${escape(r.id)}"><label>Report a potential sale or disposal issue<textarea name="notes" maxlength="2000" required></textarea></label><button type="submit">Report issue to Admin</button></form>`:''}
      <h3>Recorded history</h3><ul class="b-list">${snapshot.events.filter(e=>e.entity_id===r.id).map(e=>`<li>${escape(actionLabel(e.action))} · ${escape(new Date(e.created_at).toLocaleString())}${e.details.notes?`<p>${escape(e.details.notes)}</p>`:''}</li>`).join('')}</ul></details>`).join(''):'<p class="b-empty">No permitted retirement records match your search.</p>';
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
    ctx.content.innerHTML=`<h2>${admin?'Equipment retirement':'Sold and disposed equipment'}</h2><p>${admin?'Propose a retirement, then ask a different active Admin to review it. Approval requires no active custody or unresolved movement. Permanent Asset IDs and history are retained.':'Search retirement history for equipment involved in your movements. Report any potential disposal issue for Admin follow-up.'}</p>
      ${admin?`<form data-proposal><h3>Propose retirement</h3><div class="b-row"><label>Individual Asset ID<select name="assetId" required><option value="">Select unheld equipment</option>${candidates.map(a=>`<option value="${escape(a.id)}">${escape(a.id)} · ${escape(a.name)}</option>`).join('')}</select></label><label>Disposition<select name="disposition"><option value="sold">Sold</option><option value="disposed">Disposed</option></select></label><label>Effective date<input type="date" name="effectiveDate" max="${dateToday()}" required></label></div><label>Reason<textarea name="reason" maxlength="2000" required></textarea></label><button type="submit">Propose for second Admin approval</button><small>Photographs can be added to the saved proposal before approval. Eligibility is checked again on the server.</small></form>`:''}
      <h3>Retirement records</h3><label>Search by equipment name or Asset ID<input type="search" data-search placeholder="Equipment name or Asset ID" value="${escape(query)}"></label><section class="b-history" data-retirement-list></section>`;
    root.querySelector('[data-search]').addEventListener('input',event=>{query=event.target.value;renderList();},{signal:ctx.signal});renderList();return true;
  };
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
      await refresh();options.onChanged?.(saved);
    },event.submitter);
  },{signal:ctx.signal});
  await ctx.task(refresh);return {refresh,destroy:ctx.destroy};
}
