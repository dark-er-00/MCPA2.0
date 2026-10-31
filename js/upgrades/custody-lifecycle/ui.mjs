import {createCustodyApi} from './api.mjs';
import {createEvidenceUploader} from '../movement-evidence/evidence.mjs';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const label=value=>({pendingInspection:'Awaiting Admin inspection',partialInspection:'Inspection needs follow-up',completed:'Inspection complete',pending:'Awaiting receipt',received:'Received',missing:'Not received',disputed:'Disputed',good:'Good',damaged:'Damaged',proposed:'Awaiting second Admin',approved:'Approved',rejected:'Rejected'})[value]||value;
export const actionLabel=value=>({submitReturn:'Return submitted for inspection',inspectReturn:'Admin inspection recorded',createTransfer:'Transfer submitted',receiveTransfer:'Transfer accepted',proposeRetirement:'Retirement proposed',approveRetirement:'Retirement approved',rejectRetirement:'Retirement rejected',attachRetirementEvidence:'Retirement evidence added',reportRetirementIssue:'Retirement issue reported'})[value]||'Equipment history recorded';
export function setup(root,options={}){
  const api=options.api||createCustodyApi(options.client);const uploader=createEvidenceUploader(api);let disposed=false;
  root.classList.add('mcpa-custody-v2');
  root.innerHTML='<div class="b-shell"><div class="b-feedback" role="status" aria-live="polite"></div><div class="b-content" aria-busy="true">Loading equipment records…</div></div>';
  const content=root.querySelector('.b-content'),feedback=root.querySelector('.b-feedback');
  const say=(message,error=false)=>{
    feedback.textContent=message;feedback.classList.toggle('b-error',error);feedback.setAttribute('role',error?'alert':'status');
    if(error){feedback.tabIndex=-1;feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'nearest',behavior:'instant'});}
  };
  const controller=new AbortController();
  return {api,uploader,content,say,signal:controller.signal,get disposed(){return disposed;},
    async task(fn,button){
      if(button?.disabled)return;
      if(button)button.disabled=true;content.setAttribute('aria-busy','true');
      try{await fn();}catch(error){if(!disposed)say(error.message||'Request failed. Refresh and try again.',true);}
      finally{if(!disposed){if(button)button.disabled=false;content.setAttribute('aria-busy','false');}}
    },
    destroy(){disposed=true;controller.abort();if(!options.api)api.dispose();root.replaceChildren();root.classList.remove('mcpa-custody-v2');}
  };
}
export function evidenceButtons(evidence,entity){
  const photos=(evidence||[]).filter(v=>v.movement_id===entity||v.retirement_id===entity);
  return photos.length?`<div class="b-evidence"><strong>Photo evidence</strong>${photos.map((v,i)=>`<button type="button" data-photo="${escape(v.object_name)}">Photo ${i+1} · ${escape(v.phase.replaceAll('_',' '))}</button>`).join('')}</div>`:'';
}
export function wireEvidence(root,ctx){
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-photo]');if(!button)return;
    void ctx.task(async()=>{
      const url=await ctx.uploader.signedUrl(button.dataset.photo);
      let viewer=root.querySelector('.b-photo-view');
      if(!viewer){viewer=document.createElement('div');viewer.className='b-photo-view';root.append(viewer);}
      viewer.replaceChildren();const image=document.createElement('img');image.src=url;image.alt='Movement photo evidence';
      const close=document.createElement('button');close.type='button';close.textContent='Close photo';close.onclick=()=>{viewer.remove();button.focus();};
      viewer.append(close,image);close.focus();
    },button);
  },{signal:ctx.signal});
}
export function photoPicker(assetId){
  return `<label class="b-photo-picker">Photos for ${escape(assetId)}<input data-files="${escape(assetId)}" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment"><span>JPEG, PNG or WebP · 5 MiB per photo</span></label>`;
}
export async function uploadSelected(container,ctx,phase,targetId){
  const inputs=[...container.querySelectorAll('[data-files]')];
  if(inputs.reduce((n,input)=>n+input.files.length,0)>20)throw new Error('Choose up to 20 photos per operation.');
  const ids=[];
  for(const input of inputs)for(const file of input.files){
    ctx.say(`Uploading photo for ${input.dataset.files}…`);
    ids.push((await ctx.uploader.upload(file,{assetId:input.dataset.files,phase,targetId})).id);
  }
  return ids;
}
