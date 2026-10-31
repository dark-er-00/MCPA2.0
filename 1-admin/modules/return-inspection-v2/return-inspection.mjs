import {setup,escape,label,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../../../js/upgrades/custody-lifecycle/ui.mjs';
import {unresolved} from '../../../js/upgrades/custody-lifecycle/api.mjs';
export async function mountReturnInspection(root,options={}){
  const ctx=setup(root,options);let snapshot,selected=options.batchId||'';
  wireEvidence(root,ctx);
  const showBatch=()=>{
    const batch=snapshot.returns.find(v=>v.id===selected),host=root.querySelector('[data-inspect-batch]');
    if(!batch){host.innerHTML='<p class="b-empty">Select a batch to inspect each Asset ID.</p>';return;}
    host.innerHTML=`<h3>${escape(batch.id)} · ${escape(batch.returnedBy)}</h3><p>Intended destination: ${escape(batch.destination)}. ${escape(batch.notes)}</p>${evidenceButtons(snapshot.evidence,batch.id)}
      <form data-inspection="${escape(batch.id)}"><ul class="b-list">${batch.items.map(i=>`<li data-inspect-asset="${escape(i.asset_id)}"><div class="b-asset-head"><strong>${escape(i.asset_id)}</strong><span class="b-state">${escape(label(i.outcome))}</span></div>
        ${unresolved(i)?`<div class="b-row"><label>Inspection decision<select name="outcome"><option value="">Leave unresolved</option><option value="good">Good · accept into available inventory</option><option value="damaged">Damaged · receive into repair</option><option value="missing">Not physically received</option><option value="disputed">Disputed · follow up with custodian</option></select></label><label class="b-check"><input type="checkbox" name="received"> I physically received this exact item</label></div><label>Inspection notes<textarea name="notes" maxlength="2000">${escape(i.notes)}</textarea></label>${photoPicker(i.asset_id)}`:
          `<p>${escape(i.notes||'Physical receipt verified.')}</p><small>Inspector: ${escape(i.inspector_id)} · ${escape(new Date(i.inspected_at).toLocaleString())}</small>`}</li>`).join('')}</ul>
      ${batch.items.some(unresolved)?'<button type="submit" class="b-primary">Save selected inspection decisions</button>':'<p>All physical assets in this batch have been received and inspected.</p>'}</form>`;
  };
  const refresh=async()=>{
    snapshot=await ctx.api.snapshot();if(ctx.disposed)return;
    if(snapshot.profile.role!=='admin')throw new Error('Admin inspection access required.');
    ctx.content.innerHTML=`<h2>Return inspections</h2><p>Only physically verified Good items become requestable. Damaged items enter repair. Missing and disputed items stay traceable to their original custodian.</p><label>Return batch<select data-batch><option value="">Select a return batch</option>${snapshot.returns.map(b=>`<option value="${escape(b.id)}">${escape(b.id)} · ${escape(b.returnedBy)} · ${escape(label(b.status))}</option>`).join('')}</select></label><section data-inspect-batch></section>`;
    const select=root.querySelector('[data-batch]');select.value=selected;showBatch();
    select.addEventListener('change',()=>{selected=select.value;showBatch();},{signal:ctx.signal});
  };
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
