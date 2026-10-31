import {AssetBatch,CameraScanner} from '../equipment-qr/scanner.mjs';
import {setup,escape,label,photoPicker,uploadSelected,evidenceButtons,wireEvidence} from './ui.mjs';
import {availableForBatch} from './api.mjs';

export async function mountMovementComposer(root,options={}){
  const intent=options.intent==='transfer'?'transfer':'return';
  const ctx=setup(root,options),batch=new AssetBatch({resolve:ctx.api.lookup,intent});
  let snapshot,camera,busy=false;
  const refresh=async()=>{snapshot=await ctx.api.snapshot();if(ctx.disposed)return;
    if(!['engineer','architect'].includes(snapshot.profile.role))throw new Error('Engineer or Architect custody access required.');
    const suggestions=root.querySelector('[data-suggestions]');
    if(suggestions)suggestions.innerHTML=snapshot.assets.filter(availableForBatch).map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('');
    const history=root.querySelector('[data-history]');if(history)history.innerHTML=renderHistory(snapshot,intent);
  };
  const render=()=>{
    const returning=intent==='return';
    ctx.content.innerHTML=`<h2>${returning?'Return equipment':'Transfer equipment'}</h2><p>${returning?'Submit the actual Asset IDs for Admin inspection. Your custody responsibility continues until each item is physically received.':'Select the exact physical assets. You remain the custodian until the named recipient verifies and accepts the handover.'}</p>
      <form data-composer><fieldset><legend>Select equipment in your custody</legend><div class="b-row"><label>Asset ID or equipment search<input data-reference list="b-assets-${intent}" autocomplete="off" placeholder="Enter the printed Asset ID" maxlength="140"><datalist data-suggestions id="b-assets-${intent}"></datalist></label><button type="button" data-add>Add asset</button><button type="button" data-camera>Scan QR code</button><button type="button" data-stop hidden>Stop camera</button></div>
      <div class="b-camera" hidden><video playsinline muted aria-label="Equipment QR camera preview"></video></div>
      <p class="b-empty" data-no-assets>No assets selected. Scan a code or select an Asset ID.</p><ul class="b-list" data-selected></ul></fieldset>
      ${returning?`<label>Intended return destination<select name="destination" required>${snapshot.returnDestination?`<option value="${escape(snapshot.returnDestination.id)}">${escape(snapshot.returnDestination.name)} · Office</option>`:'<option value="">Office unavailable · contact Admin</option>'}</select></label>`:
        `<div class="b-row"><label>Receiving custodian<select name="recipient" required><option value="">Select Engineer or Architect</option>${snapshot.recipients.filter(r=>r.id!==snapshot.profile.id).map(r=>`<option value="${escape(r.id)}">${escape(r.name)}</option>`).join('')}</select></label><label>Destination site / project<select name="destination" required><option value="">Select a destination</option>${snapshot.sites.map(s=>`<option value="${escape(s.id)}" data-recipient="${escape(s.assignedEngineerId)}">${escape(s.name)}</option>`).join('')}</select></label></div>`}
      <label>${returning?'Return':'Transfer'} notes <span>Optional</span><textarea name="notes" maxlength="2000"></textarea></label>
      <button class="b-primary" type="submit">${returning?'Submit for Admin inspection':'Submit transfer for recipient acceptance'}</button></form>
      <section class="b-history" data-history aria-label="${returning?'Return inspection status':'Transfer status'}"></section>`;
    if(!returning)root.querySelector('[name=recipient]').addEventListener('change',()=>{
      const recipient=root.querySelector('[name=recipient]').value,dest=root.querySelector('[name=destination]');dest.value='';
      for(const option of dest.options)if(option.value)option.disabled=option.dataset.recipient!==recipient;
    },{signal:ctx.signal});
    const input=root.querySelector('[data-reference]');
    const add=async raw=>{if(busy)return;const result=await batch.add(raw);if(ctx.disposed||result.cancelled)return;
      if(result.duplicate){ctx.say(`${result.id} is already in this batch.`);return;}
      const li=document.createElement('li');li.dataset.asset=result.asset.id;
      li.innerHTML=`<div class="b-asset-head"><div><strong>${escape(result.asset.name)}</strong><span class="b-id">${escape(result.asset.id)}</span></div><button type="button" data-remove="${escape(result.asset.id)}">Remove</button></div>${photoPicker(result.asset.id)}`;
      root.querySelector('[data-selected]').append(li);root.querySelector('[data-no-assets]').hidden=true;input.value='';ctx.say(`${result.asset.id} added. ${batch.items.length} selected.`);
    };
    root.querySelector('[data-add]').addEventListener('click',event=>void ctx.task(()=>add(input.value),event.currentTarget),{signal:ctx.signal});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void ctx.task(()=>add(input.value));}},{signal:ctx.signal});
    root.querySelector('[data-selected]').addEventListener('click',event=>{
      const button=event.target.closest('[data-remove]');if(!button||busy)return;
      batch.remove(button.dataset.remove);button.closest('li').remove();root.querySelector('[data-no-assets]').hidden=batch.items.length>0;ctx.say('Asset removed from this batch.');input.focus();
    },{signal:ctx.signal});
    const stop=()=>{camera?.stop();root.querySelector('.b-camera').hidden=true;root.querySelector('[data-stop]').hidden=true;root.querySelector('[data-camera]').disabled=false;};
    camera=new CameraScanner({video:root.querySelector('video'),decode:options.decode,onScan:add,onError:error=>{ctx.say(error.message,true);stop();}});
    root.querySelector('[data-camera]').addEventListener('click',()=>{
      root.querySelector('.b-camera').hidden=false;root.querySelector('[data-stop]').hidden=false;root.querySelector('[data-camera]').disabled=true;void camera.start();
    },{signal:ctx.signal});
    root.querySelector('[data-stop]').addEventListener('click',stop,{signal:ctx.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();},{signal:ctx.signal});
    globalThis.addEventListener('pagehide',stop,{signal:ctx.signal});
    root.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();if(busy)return;
      void ctx.task(async()=>{
        if(!batch.items.length)throw new Error('Select at least one Asset ID.');
        const form=event.target;
        const data=new FormData(form),assetIds=batch.items.map(a=>a.id);
        const payload={assetIds,destinationId:data.get('destination'),notes:data.get('notes')};
        if(!returning)payload.receiverId=data.get('recipient');
        busy=true;stop();for(const control of form.elements)control.disabled=true;
        try{
          payload.evidenceIds=await uploadSelected(form,ctx,returning?'submit_return':'submit_transfer');
          const saved=await ctx.api.mutate(returning?'submitReturn':'createTransfer',payload,options.operationScope||intent);
          if(ctx.disposed)return;
          batch.clear();root.querySelector('[data-selected]').replaceChildren();root.querySelector('[data-no-assets]').hidden=false;form.reset();
          ctx.say(`${saved.id} submitted. ${returning?'Admin must inspect each item.':'The recipient must accept before custody changes.'}`);
          await refresh();options.onChanged?.(saved);
        }finally{busy=false;for(const control of form.elements)control.disabled=false;}
      },event.submitter);
    },{signal:ctx.signal});
  };
  wireEvidence(root,ctx);
  await ctx.task(async()=>{snapshot=await ctx.api.snapshot();if(ctx.disposed)return;
    if(!['engineer','architect'].includes(snapshot.profile.role))throw new Error('Engineer or Architect custody access required.');
    render();await refresh();
  });
  return {refresh,destroy(){camera?.stop();batch.clear();ctx.destroy();}};
}
function renderHistory(snapshot,intent){
  const records=intent==='return'?snapshot.returns:snapshot.transfers.filter(t=>t.actorId===snapshot.profile.id);
  return `<h3>${intent==='return'?'Your return inspections':'Your outgoing transfers'}</h3>${records.length?records.map(record=>`<details><summary>${escape(record.id)} · ${escape(label(record.status))}</summary>
    ${record.items?`<ul class="b-list">${record.items.map(i=>`<li><strong>${escape(i.asset_id)}</strong> · ${escape(label(i.outcome))}${i.notes?`<p>${escape(i.notes)}</p>`:''}${i.inspected_at?`<small>Inspected ${escape(new Date(i.inspected_at).toLocaleString())}</small>`:''}</li>`).join('')}</ul>`:
      `<p>${escape(record.toolIds.join(', '))} → ${escape(record.receiver)} · ${escape(record.destination)}</p>`}
    ${evidenceButtons(snapshot.evidence,record.id)}</details>`).join(''):'<p class="b-empty">No submissions yet.</p>'}`;
}
