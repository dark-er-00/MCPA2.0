import {escape} from './ui.mjs';
const statusLabel=value=>({pending:'Pending Acceptance',received:'Accepted',rejected:'Rejected',refused:'Refused · sender follow-up',canceled:'Canceled',cancelled:'Canceled'})[value]||value;
const date=value=>value?new Date(value).toLocaleString(): 'Not recorded';

// Resolve only records returned by the authenticated, scoped snapshot. A record
// link takes precedence over a stale tab in the URL; absent IDs stay neutral.
export function resolveTransferView(snapshot,recordId,preferredView='receive'){
  if(!recordId)return ['receive','send','history'].includes(preferredView)?preferredView:'receive';
  const record=snapshot.transfers.find(item=>item.id===recordId);
  if(!record)return 'history';
  if(snapshot.profile.role==='admin'&&record.status&&!['pending','refused'].includes(record.status))return 'history';
  if(record.receiverId===snapshot.profile.id)return 'receive';
  if(record.actorId===snapshot.profile.id)return 'send';
  return 'history';
}

export async function mountTransfers(root,options={}){
  const client=options.client,controller=new AbortController();
  const admin=window.MCPAAuth.profile.role==='admin';
  let snapshot,disposed=false,busy=false,search='',statusFilter='',view=options.view||'receive';
  root.classList.add('transfer-workspace');
  root.innerHTML='<header class="page-head"><div><h1 class="display">Transfers</h1><p class="sub">Custody changes after recipient acceptance.</p></div><button type="button" class="btn btn-secondary" data-transfer-refresh>Refresh</button></header><p data-transfer-feedback role="status" aria-live="polite"></p><div data-transfer-content aria-busy="true">Loading transfers…</div>';
  if(admin)root.querySelector('[data-transfer-refresh]').remove();
  const content=root.querySelector('[data-transfer-content]'),feedback=root.querySelector('[data-transfer-feedback]');
  const say=(text,error=false)=>{feedback.textContent=text;feedback.setAttribute('role',error?'alert':'status');if(error){feedback.tabIndex=-1;feedback.focus();}};
  async function task(fn){if(busy)return;busy=true;content.setAttribute('aria-busy','true');try{await fn();}catch(e){if(!disposed){say(e.message,true);if(!snapshot)content.textContent='Transfer data is unavailable. Refresh after the connection or configuration is restored.';}}finally{busy=false;if(!disposed)content.setAttribute('aria-busy','false');}}
  const can=(t,action)=>t.allowedActions?.includes(action);
  function render(){
    const expanded=new Set([...content.querySelectorAll('[data-transfer-record][open]')].map(e=>e.dataset.transferRecord));const focused=document.activeElement?.hasAttribute('data-transfer-search')?'[data-transfer-search]':document.activeElement?.hasAttribute('data-transfer-status')?'[data-transfer-status]':null;
    const incoming=snapshot.transfers.filter(t=>t.receiverId===snapshot.profile.id);
    const outgoing=snapshot.transfers.filter(t=>t.actorId===snapshot.profile.id&&(!admin||['pending','refused'].includes(t.status)));
    const records=view==='receive'?incoming:view==='send'?outgoing:snapshot.transfers;
    content.innerHTML=`<div class="transfer-toolbar"><div class="transfer-views" role="group" aria-label="Transfer view">${[['receive','Incoming'],['send','Outgoing'],['history','All history']].map(([key,label])=>`<button type="button" class="btn ${key===view?'btn-primary':'btn-secondary'}" data-transfer-view="${key}" aria-pressed="${key===view}">${label}${key==='receive'?` (${incoming.filter(t=>t.status==='pending').length})`:''}</button>`).join('')}</div>${admin?'':'<button type="button" class="btn btn-primary" data-new-transfer>New Transfer</button>'}</div>
      <div class="transfer-filter"><label>Search transfers<input type="search" data-transfer-search placeholder="Reference, Asset ID, person or project"></label><label>Status<select data-transfer-status><option value="">All statuses</option>${['pending','received','rejected','refused','canceled'].map(s=>`<option value="${s}">${statusLabel(s)}</option>`).join('')}</select></label></div>
      <div data-transfer-list>${records.length?records.map(t=>renderRecord(t)).join(''):'<p class="empty-state">No transfers in this view.</p>'}</div><p data-no-transfer-match hidden>No matching transfers.</p>
      ${!admin||view==='history'?'<section class="transfer-help"><h2>Recorded transfer history</h2><p>Legacy transfer documents and inspection records remain available.</p><button type="button" class="btn btn-secondary" data-legacy-transfers>View legacy history</button></section>':''}
      <dialog data-transfer-dialog aria-labelledby="transfer-dialog-title"></dialog>`;
    wireFilters();for(const el of content.querySelectorAll('[data-transfer-record]'))if(expanded.has(el.dataset.transferRecord))el.open=true;if(focused)content.querySelector(focused)?.focus({preventScroll:true});
    if(options.record){const target=[...content.querySelectorAll('[data-transfer-record]')].find(el=>el.dataset.transferRecord===options.record);if(target){target.open=true;target.tabIndex=-1;target.focus();}else say('This transfer is unavailable or outside your authorized records.',true);options.record=null;}
  }
  function renderRecord(t){
    const checks=new Map((t.inspections||[]).map(i=>[i.toolId,i]));
    return `<details class="transfer-record" data-transfer-record="${escape(t.id)}" data-search="${escape([t.id,t.sender,t.receiver,t.destination,...(t.toolIds||[])].join(' ').toLowerCase())}" data-status="${escape(t.status)}"><summary><span><strong class="mono">${escape(t.id)}</strong><span class="transfer-people">${escape(t.sender||'Not recorded')} → ${escape(t.receiver||'Not recorded')}</span></span><span class="badge badge-${t.status==='pending'?'pending':t.status==='received'?'available':'disposed'}">${escape(statusLabel(t.status))}</span></summary>
      <dl class="transfer-facts"><div><dt>Destination / project</dt><dd>${escape(t.destination||'Not recorded')}</dd></div><div><dt>Initiated</dt><dd>${escape(date(t.createdAt))}</dd></div><div><dt>Recipient</dt><dd>${escape(t.receiver||'Not recorded')}</dd></div>${t.receivedAt?`<div><dt>Accepted by / at</dt><dd>${escape(t.receivedBy||t.receiver)} · ${escape(date(t.receivedAt))}</dd></div>`:''}</dl>
      ${t.notes?`<p><strong>Remarks:</strong> ${escape(t.notes)}</p>`:''}${t.reason?`<p><strong>Decision:</strong> ${escape(t.reason)}</p>`:''}
      <form data-transfer-decision="${escape(t.id)}"><ul class="transfer-assets">${(t.toolIds||[]).map(id=>{
        const source=t.source?.find(s=>s.toolId===id)||{},tool=snapshot.tools.find(s=>s.id===id)||{},check=checks.get(id);
        return `<li data-review-asset="${escape(id)}"><strong>${escape(source.name||tool.name||id)}</strong><span class="mono">${escape(id)}</span><p>Accountable at dispatch: ${escape(source.holder||'Unassigned')} · Origin: ${escape(source.site||'Not recorded')}${source.condition?` · Recorded condition: ${escape(source.condition)}`:''}</p>${check?`<p>Inspection: ${escape(check.condition)}${check.notes?' · '+escape(check.notes):''}</p>`:''}${can(t,'receiveTransfer')?`<div class="transfer-inspection"><label>Inspected condition<select name="condition" required><option value="">Select condition</option><option value="good">Good</option><option value="damaged">Damaged · accept into repair</option></select></label><label class="transfer-check"><input type="checkbox" name="tested" required> Physically received and tested</label><label>Condition notes (required for damage)<textarea name="notes" maxlength="2000"></textarea></label></div>`:''}</li>`;
      }).join('')}</ul>
      ${t.status==='pending'?`<p class="transfer-accountability">${t.receiverId===snapshot.profile.id?'Review each Asset ID before accepting.':'Awaiting the recipient’s decision.'} Accountability remains with the recorded custodian.</p>`:''}
      <div class="transfer-actions">${can(t,'receiveTransfer')?'<button type="submit" class="btn btn-primary">Accept Transfer</button>':''}${can(t,'refuseTransfer')?'<button type="button" class="btn btn-secondary" data-decision="refuseTransfer">Reject Transfer</button>':''}${can(t,'cancelTransfer')?'<button type="button" class="btn btn-secondary" data-decision="cancelTransfer">Cancel Transfer</button>':''}${can(t,'reopenTransfer')?'<button type="button" class="btn btn-secondary" data-decision="reopenTransfer">Reopen legacy handover</button>':''}</div></form></details>`;
  }
  function wireFilters(){
    content.querySelector('[data-transfer-search]').value=search;content.querySelector('[data-transfer-status]').value=statusFilter;
    const filter=()=>{search=content.querySelector('[data-transfer-search]').value;statusFilter=content.querySelector('[data-transfer-status]').value;const query=search.trim().toLowerCase(),status=statusFilter;let count=0;for(const el of content.querySelectorAll('[data-transfer-record]')){el.hidden=!el.dataset.search.includes(query)||!!status&&el.dataset.status!==status;if(!el.hidden)count++;}content.querySelector('[data-no-transfer-match]').hidden=count>0;};
    content.querySelector('[data-transfer-search]').oninput=filter;content.querySelector('[data-transfer-status]').onchange=filter;filter();
  }
  async function refresh(){
    const {data,error}=await client.rpc('mcpa_transfer_snapshot');
    if(error)throw new Error(['PGRST202','42883'].includes(error.code)?'The transfer update needs administrator review and database installation before use.':error.message);
    if(disposed)return;if(data?.transferVersion!==3)throw new Error('Transfer configuration could not be verified.');
    snapshot=data;view=resolveTransferView(snapshot,options.record,view);render();
  }
  function newTransfer(){
    const dialog=content.querySelector('dialog');
    const eligible=snapshot.tools.filter(t=>t.qty===1&&(!t.trackingType||t.trackingType.toLowerCase()==='individual')&&!t.movementLock&&['available','inuse'].includes(t.status)&&!['damaged','missing','lost'].includes((t.condition||'').toLowerCase())&&(t.holderId===snapshot.profile.id||['admin','tool_handler'].includes(snapshot.profile.role)&&!t.holderId));
    dialog.innerHTML=`<form data-transfer-create><h2 id="transfer-dialog-title">New Transfer</h2><p>The current custodian remains accountable until acceptance.</p><p data-create-error role="alert"></p><fieldset><legend>Equipment *</legend>${eligible.length?eligible.map(t=>`<label class="transfer-check"><input type="checkbox" name="asset" value="${escape(t.id)}"> ${escape(t.name)} <span class="mono">${escape(t.id)}</span></label>`).join(''):'<p>No eligible individual assets. Existing quantities and stock movements are unchanged.</p>'}</fieldset><label>Recipient *<select name="recipient" required><option value="">Select recipient</option>${snapshot.recipients.filter(r=>r.id!==snapshot.profile.id).map(r=>`<option value="${escape(r.id)}">${escape(r.name)} · ${escape(r.role==='engineer'?'Engr':r.role)}</option>`).join('')}</select></label><label>Destination / project *<select name="destination" required><option value="">Select recipient first</option></select></label><label>Remarks (optional)<textarea name="notes" maxlength="2000"></textarea></label><div class="transfer-actions"><button type="button" class="btn btn-secondary" data-close-transfer>Cancel</button><button type="submit" class="btn btn-primary"${eligible.length?'':' disabled'}>Request Transfer</button></div></form>`;
    dialog.querySelector('[name=recipient]').onchange=event=>{
      const recipient=snapshot.recipients.find(r=>r.id===event.target.value);
      const sites=snapshot.sites.filter(s=>s.is_active!==false&&(recipient?.role==='admin'?s.id===snapshot.officeId:s.assigned_engineer_id===recipient?.id));
      dialog.querySelector('[name=destination]').innerHTML='<option value="">Select destination</option>'+sites.map(s=>`<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('');
    };
    dialog.showModal();
  }
  function inspections(form){return [...form.querySelectorAll('[data-review-asset]')].map(row=>({toolId:row.dataset.reviewAsset,condition:row.querySelector('[name=condition]')?.value,tested:!!row.querySelector('[name=tested]')?.checked,physicallyReceived:!!row.querySelector('[name=tested]')?.checked,disposition:'accepted',notes:row.querySelector('[name=notes]')?.value||''}));}
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.dataset.transferView)window.showScreen('transfer?view='+button.dataset.transferView);
    else if(!admin&&button.hasAttribute('data-new-transfer'))newTransfer();
    else if(button.hasAttribute('data-close-transfer'))content.querySelector('dialog').close();
    else if(button.hasAttribute('data-transfer-refresh'))void task(refresh);
    else if(button.hasAttribute('data-legacy-transfers'))window.showScreen('transfer-tools');
    else if(button.hasAttribute('data-scan-assets'))window.showScreen('asset-transfer');
    else if(button.dataset.decision){
      const form=button.closest('form'),t=snapshot.transfers.find(t=>t.id===form.dataset.transferDecision),action=button.dataset.decision;
      const dialog=content.querySelector('dialog');
      dialog.innerHTML=`<form data-confirm-decision data-id="${escape(t.id)}" data-action="${escape(action)}"><h2 id="transfer-dialog-title">${escape(button.textContent)}</h2><label>Reason *<textarea name="reason" required maxlength="2000"></textarea></label><p>Custody remains unchanged. This decision is recorded in history.</p><div class="transfer-actions"><button type="button" class="btn btn-secondary" data-close-transfer>Back</button><button type="submit" class="btn btn-primary">Confirm decision</button></div></form>`;
      dialog._inspections=inspections(form);dialog.showModal();
    }
  },{signal:controller.signal});
  root.addEventListener('submit',event=>{
    const form=event.target;event.preventDefault();if(!form.reportValidity()||busy)return;
    void task(async()=>{
      if(form.hasAttribute('data-transfer-create')){
        if(admin)throw Error('Use the approved request release workflow.');
        const toolIds=[...form.querySelectorAll('[name=asset]:checked')].map(el=>el.value);
        if(!toolIds.length){form.querySelector('[data-create-error]').textContent='Select at least one Asset ID.';return;}
        await window.MovementStore.createTransfer({toolIds,receiverId:form.elements.recipient.value,destinationId:form.elements.destination.value,notes:form.elements.notes.value});
        say('Transfer requested. Awaiting recipient acceptance.');
      }else if(form.hasAttribute('data-transfer-decision')){
        await window.MovementStore.receiveTransfer(form.dataset.transferDecision,{inspections:inspections(form)});say('Transfer accepted. Your custody is now recorded.');
      }else if(form.hasAttribute('data-confirm-decision')){
        await window.MovementStore[form.dataset.action](form.dataset.id,{reason:form.elements.reason.value,confirmed:true,inspections:content.querySelector('dialog')._inspections});say('Decision recorded. Custody unchanged.');
      }else return;
      content.querySelector('dialog')?.close();await refresh();options.onChanged?.();
    });
  },{signal:controller.signal});
  await task(refresh);
  return {refresh:()=>task(refresh),destroy(){disposed=true;controller.abort();content.querySelector('dialog')?.close();root.replaceChildren();}};
}
