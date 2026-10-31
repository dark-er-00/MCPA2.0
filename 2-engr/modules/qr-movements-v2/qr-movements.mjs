import {mountMovementComposer} from '../../../js/upgrades/custody-lifecycle/composer.mjs';
import {setup,escape,label,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from '../../../js/upgrades/custody-lifecycle/ui.mjs';
export const mountTransferSubmission=(root,options)=>mountMovementComposer(root,{...options,intent:'transfer'});
export async function mountTransferInbox(root,options={}){
  const ctx=setup(root,options);wireEvidence(root,ctx);
  const refresh=async()=>{
    const data=await ctx.api.snapshot();if(ctx.disposed)return;
    if(!['engineer','architect'].includes(data.profile.role))throw new Error('Named Engineer or Architect recipient required.');
    const incoming=data.transfers.filter(t=>t.receiverId===data.profile.id);
    ctx.content.innerHTML=`<h2>Incoming equipment</h2><p>Verify every physical Asset ID and test its condition. If an item is missing or disputed, leave this handover pending and ask the sender to resolve it.</p>${incoming.length?incoming.map(t=>`<details data-handover="${escape(t.id)}" ${(options.recordId ? t.id===options.recordId : t.status==='pending')?'open':''}><summary>${escape(t.id)} · ${escape(label(t.status))}</summary><p>From ${escape(t.sender)} to ${escape(t.destination)}</p>${evidenceButtons(data.evidence,t.id)}
      ${t.status==='pending'?`<form data-transfer="${escape(t.id)}"><ul class="b-list">${t.toolIds.map(id=>`<li data-accept-asset="${escape(id)}"><strong>${escape(id)}</strong><div class="b-row"><label>Tested condition<select name="condition" required><option value="">Inspect item</option><option value="good">Good</option><option value="damaged">Damaged · accept into repair</option></select></label><label class="b-check"><input type="checkbox" name="received" required> Physically received and tested</label></div><label>Condition notes<textarea name="notes" maxlength="2000"></textarea></label>${photoPicker(id)}</li>`).join('')}</ul><button type="submit" class="b-primary">Accept these exact Asset IDs</button></form>`:`<p>${escape(t.toolIds.join(', '))}</p>`}</details>`).join(''):'<p class="b-empty">No incoming transfers.</p>'}`;
    ctx.content.setAttribute('aria-busy','false');
    if(options.recordId){
      const target=[...root.querySelectorAll('[data-handover]')].find(detail=>detail.dataset.handover===options.recordId);
      if(target){target.open=true;target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});}
      else if(!incoming.some(t=>t.id===options.recordId))ctx.say('This handover is unavailable or is not addressed to your account. Ask the sender to check the reference.',true);
    }
  };
  root.addEventListener('submit',event=>{
    const form=event.target.closest('[data-transfer]');if(!form)return;event.preventDefault();
    void ctx.task(async()=>{
      const inspections=[...form.querySelectorAll('[data-accept-asset]')].map(row=>({toolId:row.dataset.acceptAsset,condition:row.querySelector('[name=condition]').value,
        physicallyReceived:row.querySelector('[name=received]').checked,tested:row.querySelector('[name=received]').checked,
        disposition:'accepted',notes:row.querySelector('[name=notes]').value}));
      if(inspections.some(i=>!i.physicallyReceived||!i.condition||(i.condition==='damaged'&&!i.notes.trim())))throw new Error('Verify every item and describe each damaged condition before acceptance.');
      const payload={id:form.dataset.transfer,inspections,evidenceIds:await uploadSelected(form,ctx,'accept_transfer',form.dataset.transfer)};
      const saved=await ctx.api.mutate('receiveTransfer',payload,`receive:${form.dataset.transfer}`);
      ctx.say(`${saved.id} accepted. Custody is now recorded for you.`);await refresh();options.onChanged?.(saved);
    },event.submitter);
  },{signal:ctx.signal});
  await ctx.task(refresh);return {refresh,destroy:ctx.destroy};
}
