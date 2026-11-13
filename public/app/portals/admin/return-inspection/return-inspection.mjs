import {setup,escape,label,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../../../features/custody-lifecycle/ui.mjs';
import {unresolved} from '../../../features/custody-lifecycle/api.mjs';
export async function mountReturnInspection(root,options={}){
  const ctx=setup(root,options);let snapshot,selected=options.batchId||'',query='',legacy=[],returnFocus=null,refreshVersion=0;
  const store=()=>window.MovementStore.getState();
  const tool=id=>store().tools.find(t=>t.id===id)||{};
  const project=batch=>[...new Set((batch.source||[]).map(s=>store().sites.find(p=>p.id===s.siteId)?.name||s.site).filter(Boolean))].join(', ')||batch.origin||batch.project||'Project not recorded';
  const items=batch=>batch.items|| (batch.toolIds||[]).map(id=>({asset_id:id,quantity:(batch.source||[]).find(s=>s.toolId===id)?.qty??null}));
  const reference=batch=>[...new Set((batch.items||[]).map(i=>i.finalized_movement_id).filter(Boolean))].join(', ')||batch.id;
  const referenceLabel=batch=>reference(batch)!==batch.id||String(batch.id).startsWith('RTN-')?'Return ID':'Inspection batch';
  const all=()=>[...snapshot.returns,...legacy];
  function renderList(){const records=all().filter(b=>[b.id,reference(b),b.returnedBy,project(b),...items(b).map(i=>tool(i.asset_id).name||i.asset_id)].join(' ').toLowerCase().includes(query));root.querySelector('[data-return-list]').innerHTML=records.length?records.map(b=>`<article class="b-return-record"><h3>${escape(b.returnedBy||'Accountable person not recorded')} | ${escape(project(b))}</h3><p>${referenceLabel(b)}: <strong>${escape(reference(b))}</strong>${reference(b)!==b.id?' · Inspection batch: '+escape(b.id):''} · ${escape(label(b.status))}</p><button type="button" data-view-return="${escape(b.id)}">View</button></article>`).join(''):'<p>No return records match your search.</p>';}
  wireEvidence(root,ctx);
  const showBatch=()=>{
    const batch=all().find(v=>v.id===selected),host=root.querySelector('[data-inspect-batch]');
    if(!batch){host.innerHTML='<p class="b-empty">Select a batch to inspect each Asset ID.</p>';return;}
    const details=`<h3>${escape(batch.returnedBy)} | ${escape(project(batch))}</h3><p>${referenceLabel(batch)}: ${escape(reference(batch))}${reference(batch)!==batch.id?' · Inspection batch: '+escape(batch.id):''}</p><ul class="b-list">${items(batch).map(i=>`<li>${escape(tool(i.asset_id).cat||tool(i.asset_id).category||'Equipment')} : ${escape(tool(i.asset_id).name||i.asset_id)} : ${escape(batch.items?1:i.quantity??'Quantity not recorded')}<p>Tool ID: ${escape(i.asset_id)}</p></li>`).join('')}</ul>`;
    if(!batch.items){host.innerHTML=details+`<p>${escape(batch.notes||'')}</p><p>Historical return · read-only.</p>`;return;}
    host.innerHTML=details+`<h3>${escape(batch.id)} · ${escape(batch.returnedBy)}</h3><p>Intended destination: ${escape(batch.destination)}. ${escape(batch.notes)}</p>${evidenceButtons(snapshot.evidence,batch.id)}
      <form data-inspection="${escape(batch.id)}"><ul class="b-list">${batch.items.map(i=>`<li data-inspect-asset="${escape(i.asset_id)}"><div class="b-asset-head"><strong>${escape(i.asset_id)}</strong><span class="b-state">${escape(label(i.outcome))}</span></div>
        ${unresolved(i)?`<div class="b-row"><label>Inspection decision<select name="outcome"><option value="">Leave unresolved</option><option value="good">Good · accept into available inventory</option><option value="damaged">Damaged · receive into repair</option><option value="missing">Not physically received</option><option value="disputed">Disputed · follow up with custodian</option></select></label><label class="b-check"><input type="checkbox" name="received"> I physically received this exact item</label></div><label>Inspection notes<textarea name="notes" maxlength="2000">${escape(i.notes)}</textarea></label>${photoPicker(i.asset_id)}`:
          `<p>${escape(i.notes||'Physical receipt verified.')}</p><small>Inspector: ${escape(i.inspector_id)} · ${escape(new Date(i.inspected_at).toLocaleString())}</small>`}</li>`).join('')}</ul>
      ${batch.items.some(unresolved)?'<button type="submit" class="b-primary">Save selected inspection decisions</button>':'<p>All physical assets in this batch have been received and inspected.</p>'}</form>`;
  };
  const refresh=async()=>{
    const version=++refreshVersion;
    const value=await ctx.api.snapshot();if(ctx.disposed||version!==refreshVersion)return;
    if(value.profile.role!=='admin')throw new Error('Admin inspection access required.');
    await window.MovementStore.refresh();if(ctx.disposed||version!==refreshVersion)return;
    snapshot=value;legacy=(store().returns||[]).filter(r=>!r.custodyVersion&&!r.inspectionBatchId);
    ctx.content.innerHTML=`<h2>Returns</h2><p>Review return records and inspect each physically returned item.</p><label>Search returns<input type="search" data-return-search placeholder="Engineer / Architect, project, Return ID or tool" value="${escape(query)}"></label><section data-return-list></section><dialog class="b-return-dialog" aria-labelledby="return-dialog-title"><header class="b-row"><h2 id="return-dialog-title">Returned equipment</h2><button type="button" data-close-return>Close</button></header><section data-inspect-batch></section></dialog>`;
    renderList();if(selected){showBatch();root.querySelector('dialog').showModal();}
  };
  root.addEventListener('input',event=>{if(event.target.hasAttribute('data-return-search')){query=event.target.value.trim().toLowerCase();renderList();}},{signal:ctx.signal});
  root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.viewReturn){selected=b.dataset.viewReturn;returnFocus=b;showBatch();root.querySelector('dialog').showModal();root.querySelector('[data-close-return]').focus();}if(b.hasAttribute('data-close-return'))root.querySelector('dialog').close();},{signal:ctx.signal});
  root.addEventListener('close',()=>{selected='';if(returnFocus?.isConnected)returnFocus.focus();}, {capture:true,signal:ctx.signal});
  root.addEventListener('submit',event=>{
    const form=event.target.closest('[data-inspection]');if(!form)return;event.preventDefault();
    void ctx.task(async()=>{
      const inspections=[...form.querySelectorAll('[data-inspect-asset]')].filter(row=>row.querySelector('[name=outcome]')?.value).map(row=>({assetId:row.dataset.inspectAsset,
        outcome:row.querySelector('[name=outcome]').value,physicallyReceived:row.querySelector('[name=received]').checked,notes:row.querySelector('[name=notes]').value}));
      if(!inspections.length)throw new Error('Choose at least one inspection decision.');
      for(const i of inspections){if(i.physicallyReceived!==['good','damaged'].includes(i.outcome))throw new Error(`Confirm physical receipt for Good or Damaged items only: ${i.assetId}.`);
        if(i.outcome!=='good'&&!i.notes.trim())throw new Error(`Describe the ${i.outcome} finding for ${i.assetId}.`);}
      for(const input of form.querySelectorAll('[data-files]'))if(input.files.length&&!inspections.some(i=>i.assetId===input.dataset.files))throw new Error('Select an inspection decision for every asset with new photographs.');
      const payload={id:form.dataset.inspection,inspections,evidenceIds:await uploadSelected(form,ctx,'inspection',form.dataset.inspection)};
      const result=await ctx.api.mutate('inspectReturn',payload,`inspect:${form.dataset.inspection}`);
      ctx.say(`${result.id}: inspection saved. ${result.unresolvedCount} asset(s) remain unresolved.`);await refresh();options.onChanged?.(result);
    },event.submitter);
  },{signal:ctx.signal});
  await ctx.task(refresh);return {refresh,destroy:ctx.destroy};
}
