import {requests} from './model.mjs';
import {timeline} from './unified.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const received=r=>r.stage.key==='received';
export const active=r=>['pending','approved','inspection'].includes(r.stage.key);
export const label=r=>received(r)?'Inspected / Received':r.stage.key==='pending'?'Submitted':r.stage.key==='approved'?'Approved':r.stage.key==='inspection'?'Released':r.stage.label;
export function equipmentRows(r,snapshot){
 const groups=new Map();
 if(r.kind==='quantity')groups.set(r.name,{name:r.name,type:r.raw.category||'Equipment',quantity:r.quantity,ids:r.assetIds});
 else for(const id of r.assetIds){const t=snapshot.tools.find(t=>t.id===id)||{};const key=[t.cat||t.category,t.name||id].join(':');const g=groups.get(key)||{name:t.name||id,type:t.cat||t.category||'Equipment',quantity:0,ids:[]};g.quantity++;g.ids.push(id);groups.set(key,g);}
 return [...groups.values()].map(g=>`<details class="equipment-tool-disclosure"><summary>${esc(g.type)} : ${esc(g.name)} | ${esc(g.quantity)}</summary>${g.ids.length?`<ul class="wa-q-assets">${g.ids.map(id=>`<li>${esc(id)}</li>`).join('')}</ul>`:'<p>Tool IDs will appear after allocation.</p>'}</details>`).join('');
}
function facts(r){return `<dl class="wa-q-details"><div><dt>Request ID</dt><dd>${esc(r.id)}</dd></div><div><dt>Requested</dt><dd>${esc(r.quantity)}</dd></div><div><dt>Approved</dt><dd>${r.approvalRecorded?esc(r.raw.approved_quantity??r.assetIds.length):'Awaiting review'}</dd></div><div><dt>Purpose</dt><dd>${esc(r.raw.purpose||r.movement?.purpose||'No purpose entered')}</dd></div>${r.movement?.id?`<div><dt>Movement ID</dt><dd>${esc(r.movement.id)}</dd></div>`:''}</dl>`;}
export async function mountAdmin(root,{client,record=''}){
 const controller=new AbortController(),q=window.MCPAQuantityRequests.createClient(client);
 let disposed=false,loading=false,catalog=null,records=[],quantities=[],view='queue',search='',stage='',type='',selected='',returnFocus=null,historyVersion=0;
 root.classList.add('equipment-requests','equipment-admin-requests');
 root.innerHTML=`<header class="page-head"><div><h1 class="display">Equipment Requests</h1><p class="sub">Review requests, allocate equipment and release handovers.</p></div></header><div class="equipment-header-actions" role="group" aria-label="Request view"><button type="button" class="btn btn-primary" data-request-tab="queue" aria-pressed="true">Request Queue</button><button type="button" class="btn btn-secondary" data-request-tab="history" aria-pressed="false">Request History</button></div><p data-equipment-notice role="status" aria-live="polite"></p><section class="card card-pad equipment-history"><h2 data-request-heading>Request Queue</h2><div class="equipment-filters"><label>Search requests<input type="search" class="mv-input" data-equipment-search placeholder="ID, equipment, person or project"></label><label>Stage<select class="mv-input" data-equipment-stage><option value="">Active requests</option><option value="pending">Submitted</option><option value="approved">Approved</option><option value="inspection">Released</option><option value="exceptions">Closed / exceptional records</option></select></label><label>Request type<select class="mv-input" data-equipment-type><option value="">Both types</option><option value="quantity">By quantity</option><option value="specific">Specific assets</option></select></label></div><p data-exception-help hidden>Rejected, withdrawn, canceled and unresolved handovers remain here for audit review.</p><div data-equipment-list></div></section><div class="equipment-specific" data-specific-pane></div><dialog class="equipment-review-dialog" data-equipment-review aria-labelledby="equipment-review-heading"><header class="equipment-row"><h2 id="equipment-review-heading"></h2><div><strong data-review-status></strong><button type="button" class="btn btn-secondary" data-close-review>Close</button></div></header><div data-quantity-review></div></dialog>`;
 const notice=(text,error=false)=>{if(disposed)return;const el=root.querySelector('[data-equipment-notice]');el.textContent=text;el.setAttribute('role',error?'alert':'status');};
 const snapshot=()=>window.MovementStore.getState();
 const find=id=>records.find(r=>r.id===id||r.movement?.id===id);
 const summary=r=>equipmentRows(r,snapshot())+facts(r)+`<details><summary>Progress and next action</summary>${timeline(r)}${received(r)?'':`<p>${esc(r.stage.next)}</p>`}</details>`;
 function render(){
  if(disposed)return;
  const filtered=records.filter(r=>(view==='history'?received(r):stage==='exceptions'?!active(r)&&!received(r):active(r)&&(!stage||r.stage.key===stage))&&(!type||r.kind===type)&&[r.id,r.name,r.requester,r.destination,...r.assetIds].join(' ').toLowerCase().includes(search));
  root.querySelector('[data-equipment-list]').innerHTML=filtered.length?`<ul class="equipment-queue">${filtered.map(r=>`<li data-equipment-record="${esc(r.id)}"><div class="equipment-row"><div><strong>${esc(r.kind==='quantity'?r.raw.category||'Equipment':'Equipment')} : ${esc(r.name)} | ${esc(r.quantity)}</strong><p>${esc(r.requester)} | ${esc(r.destination)}</p><p>${esc(r.id)} · ${esc(window.MCPAQuantityView.date(r.createdAt))}</p></div><strong class="equipment-row-status">${esc(label(r))}</strong></div><details><summary>Progress and next action</summary>${timeline(r)}${received(r)?'':`<p>${esc(r.stage.next)}</p>`}</details><button class="btn btn-secondary" type="button" data-open-request="${esc(r.id)}">View request details</button></li>`).join('')}</ul>`:'<p class="equipment-empty">No requests match this view.</p>';
 }
 await window.MovementUI.mount('request',{root:root.querySelector('[data-specific-pane]'),watch:false,requestPresentation:m=>{const r=find(m.id);return r?{heading:r.requester+' | '+r.destination,status:label(r),summary:summary(r)}:null;}});
 const dialog=root.querySelector('[data-equipment-review]');
 const qm=window.MCPAQuantityAdmin.mount({root:root.querySelector('[data-quantity-review]'),supabase:client,embedded:true,readOnly:raw=>{const r=find(raw.id);return !r||!active(r);},reviewHeader:raw=>{const r=find(raw.id);return r?summary(r):'';}});
 async function read(){const version=++historyVersion,value=await q.history();if(disposed||version!==historyVersion)return;quantities=value;records=requests(snapshot(),quantities).map(r=>({...r,raw:{...r.raw,category:r.raw.category||catalog?.groups.find(g=>g.type_id===r.raw.type_id)?.category}}));render();}
 async function refresh(){if(disposed||loading)return;loading=true;try{await window.MovementStore.refresh();await read();notice('');}catch(e){notice('Requests could not be verified. '+e.message,true);}finally{loading=false;}}
 async function open(id){const r=find(id);if(!r){notice('This request is unavailable or outside your access.',true);return;}returnFocus=document.activeElement;selected=r.id;
  if(r.kind==='specific'||id===r.movement?.id){await window.MovementUI.openRecord('request',r.movement.id);return;}
  root.querySelector('#equipment-review-heading').textContent=r.requester+' | '+r.destination;root.querySelector('[data-review-status]').textContent=label(r);
  await qm.openRecord(r.id);if(disposed)return;dialog.showModal();root.querySelector('[data-close-review]').focus();
  if(r.status==='approved'&&r.movement){const release=document.createElement('button');release.type='button';release.className='btn btn-accent';release.textContent='Review & Release Equipment';release.dataset.releaseRequest=r.movement.id;dialog.querySelector('[data-q-review]').append(release);}
 }
 root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.dataset.requestTab){view=b.dataset.requestTab;stage='';root.querySelector('[data-equipment-stage]').value='';root.querySelector('[data-equipment-stage]').closest('label').hidden=view==='history';root.querySelector('[data-request-heading]').textContent=view==='history'?'Request History':'Request Queue';root.querySelector('[data-exception-help]').hidden=true;root.querySelectorAll('[data-request-tab]').forEach(el=>{const on=el.dataset.requestTab===view;el.setAttribute('aria-pressed',String(on));el.classList.toggle('btn-primary',on);el.classList.toggle('btn-secondary',!on);});render();}
  if(b.dataset.openRequest)void open(b.dataset.openRequest).catch(e=>notice(e.message,true));
  if(b.hasAttribute('data-close-review'))dialog.close();
  if(b.dataset.releaseRequest){dialog.close();void window.MovementUI.openRecord('request',b.dataset.releaseRequest);}
 },{signal:controller.signal});
 dialog.addEventListener('close',()=>{selected='';if(returnFocus?.isConnected)returnFocus.focus();},{signal:controller.signal});
 root.addEventListener('input',e=>{if(e.target.hasAttribute('data-equipment-search')){search=e.target.value.trim().toLowerCase();render();}},{signal:controller.signal});
 root.addEventListener('change',e=>{if(e.target.hasAttribute('data-equipment-stage')){stage=e.target.value;root.querySelector('[data-exception-help]').hidden=stage!=='exceptions';render();}if(e.target.hasAttribute('data-equipment-type')){type=e.target.value;render();}},{signal:controller.signal});
 window.addEventListener('mcpa:movement-change',()=>{if(!disposed&&!loading)void read().catch(e=>notice(e.message,true));},{signal:controller.signal});
 await qm.ready;try{catalog=await q.catalog();}catch(e){notice(e.message,true);}await refresh();if(record){const r=find(record);if(r){view=received(r)?'history':'queue';const exception=!active(r)&&!received(r);root.querySelector(`[data-request-tab="${view}"]`).click();if(exception){stage='exceptions';root.querySelector('[data-equipment-stage]').value=stage;root.querySelector('[data-exception-help]').hidden=false;render();}}await open(record);}
 const stop=window.EquipmentTracking.watch(refresh,message=>notice(message,Boolean(message)),{tables:['equipment','sites','mcpa_notifications','mcpa_movements','mcpa_wa_equipment_requests']});
 return {refresh,destroy(){disposed=true;stop();controller.abort();dialog.close();qm.destroy();window.MovementUI.dispose();}};
}
