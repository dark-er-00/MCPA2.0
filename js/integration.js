/* Authenticated adapters for classic mounts and project-relative ES modules. */
(function(){
  'use strict';
  const base=new URL('../',document.currentScript.src);
  const routes=new Set(['quantity-request','outward-materials','asset-transfer','transfer-inbox','asset-retirement-v2','retired-equipment-v2']);
  let current=null,revision=0;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function handles(screen){return routes.has(screen)||(!window.MCPAAuth?.isDemo&&['request','return'].includes(screen)&&['admin','engineer','architect'].includes(window.MCPAAuth?.profile?.role));}
  function dispose(){++revision;const old=current;current=null;if(!old)return;old.abort.abort();for(const mounted of old.mounts)mounted.destroy();old.api?.dispose();}
  async function mount(screen,root,{record=''}={}){
    dispose();const person=window.MCPAAuth.requireLive(),version=revision;
    if(!window.MCPAAuth.canRoute(screen))throw Error('This screen is not available to your account.');
    const session=current={root,mounts:[],abort:new AbortController(),api:null,dirty:false,draftVersion:0,refreshVersion:0};let returnSnapshot=null;
    const alive=()=>current===session&&version===revision&&window.MCPAAuth?.profile?.id===person.id&&root.isConnected;
    const changed=()=>{if(!alive())return;session.dirty=false;++session.draftVersion;void window.MovementStore.refresh().catch(()=>{}).finally(()=>{if(alive())window.dispatchEvent(new CustomEvent('mcpa:movement-change'));});window.dispatchEvent(new CustomEvent('mcpa:materials-change'));};
    const client=window.EquipmentTracking.client();
    root.innerHTML='<div class="integration-toolbar"><button type="button" class="btn btn-secondary" data-integration-refresh>Refresh records</button><span role="status" data-integration-status></span><button type="button" class="btn btn-secondary" data-integration-recover hidden>Recover interrupted action</button></div><div data-integration-mount></div><div data-integration-history></div>';
    const host=root.querySelector('[data-integration-mount]');
    const status=root.querySelector('[data-integration-status]');
    const add=async promise=>{const mounted=await promise;if(!alive()){mounted.destroy();return;}session.mounts.push(mounted);if(mounted.ready)await mounted.ready;};
    const readVersions=new Map();
    const wrapper={storage:client.storage,rpc:async(name,args)=>{
      const read=name==='mcpa_b_snapshot'||/^mcpa_wa_(equipment_catalog|equipment_requests|suggest_equipment|consumables_catalog|consumables_snapshot|consumables_analytics)$/.test(name);
      const readVersion=(readVersions.get(name)||0)+1;if(read)readVersions.set(name,readVersion);
      const draftVersion=session.draftVersion,result=await client.rpc(name,args);
      if(read&&(!alive()||readVersions.get(name)!==readVersion))
        throw Object.assign(Error('A newer refresh replaced this response.'),{code:'MCPA_STALE_REFRESH'});
      // A read started on a clean form must not replace edits made while it waited.
      if(!result.error&&read&&draftVersion!==session.draftVersion)
        throw Error('Your draft changed while records were loading. It has been kept. Refresh when ready.');
      if(!result.error&&/^(mcpa_wa_(submit|allocate|reject|review|issue)_)/.test(name))changed();return result;
    }};
    for(const event of ['input','change'])root.addEventListener(event,event=>{
      // Browsing Engineer filters is not an unsaved request. Keep background
      // issuance refreshes running while preserving real request drafts.
      if(screen==='outward-materials'&&person.role!=='admin'&&!event.target.matches('[data-quantity],[data-field="purpose"],[data-field="site_id"]'))return;
      session.dirty=true;++session.draftVersion;
    },{signal:session.abort.signal});
    if(screen==='request'||screen==='quantity-request'){
      const module=await import(new URL('js/upgrades/equipment-requests/unified.mjs',base));
      if(!alive())return;
      ensureModuleCSS('requests',new URL('1-admin/modules/requests/requests.css',base).href);
      await add(module.mount(host,{client:wrapper,record}));
    }else if(screen==='outward-materials'){
      const module=person.role==='admin'?window.MCPAConsumablesUsageV2:window.MCPAConsumablesRequesterV2;
      await add(module.mount({root:host,client:wrapper}));
    }else{
      const {createCustodyApi}=await import(new URL('js/upgrades/custody-lifecycle/api.mjs',base));
      if(!alive())return;
      session.api=createCustodyApi(wrapper);
      const options={client:wrapper,api:session.api,onChanged:changed};
      let path,fn;
      if(screen==='return'){
        path=person.role==='admin'?'1-admin/modules/return-inspection-v2/return-inspection.mjs':'2-engr/modules/return-inspection-v2/return-submission.mjs';
        fn=person.role==='admin'?'mountReturnInspection':'mountReturnSubmission';
        if(record){returnSnapshot=await window.MovementStore.refresh();if(!alive())return;}
        options.batchId=returnSnapshot?.returns.find(v=>v.id===record)?.inspectionBatchId||record;
      }else if(screen==='asset-transfer'||screen==='transfer-inbox'){
        path='2-engr/modules/qr-movements-v2/qr-movements.mjs';fn=screen==='asset-transfer'?'mountTransferSubmission':'mountTransferInbox';
        options.recordId=record;
      }else if(screen==='asset-retirement-v2'){
        path='1-admin/modules/asset-retirement-v2/asset-retirement.mjs';fn='mountAssetRetirement';options.recordId=record;
      }else{path='2-engr/modules/retired-equipment-v2/retired-equipment.mjs';fn='mountRetiredEquipment';}
      const module=await import(new URL(path,base));if(!alive())return;
      await add(module[fn](host,options));
    }
    if(!alive())return;
    root.querySelector('.integration-toolbar').hidden=!session.api;
    const recover=root.querySelector('[data-integration-recover]');
    const pending=()=>{recover.hidden=!session.api?.pending().length;};pending();
    async function refresh(){
      if(!alive())return;
      if(session.dirty&&!window.confirm('Discard unsaved changes and refresh these records?'))return;
      session.dirty=false;const refreshVersion=++session.refreshVersion;
      try{
        for(const mounted of session.mounts){
          const applied=await mounted.refresh();
          if(!alive()||refreshVersion!==session.refreshVersion||applied===false)return;
        }
      }catch(error){if(!alive()||refreshVersion!==session.refreshVersion||error.code==='MCPA_STALE_REFRESH')return;throw error;}
      if(!alive()||refreshVersion!==session.refreshVersion)return;
      pending();status.textContent='Records refreshed.';
    }
    let scheduled;
    const update=()=>{
      clearTimeout(scheduled);scheduled=setTimeout(()=>{
        if(!alive()||document.hidden)return;
        if(session.dirty||root.querySelector('[aria-busy="true"]')){status.textContent='Records may have changed. Refresh when your form is ready.';return;}
        void refresh().catch(error=>{if(alive())status.textContent=error.message;});
      },180);
    };
    for(const event of ['focus','online','mcpa:movement-change','mcpa:materials-change'])window.addEventListener(event,update,{signal:session.abort.signal});
    const polling=setInterval(update,30000);session.abort.signal.addEventListener('abort',()=>{clearInterval(polling);clearTimeout(scheduled);},{once:true});
    root.querySelector('[data-integration-refresh]').addEventListener('click',()=>void refresh().catch(error=>{status.textContent=error.message;}),{signal:session.abort.signal});
    recover.addEventListener('click',async()=>{recover.disabled=true;try{await session.api.retryPending();changed();await refresh();}catch(error){status.textContent=error.message;}finally{if(alive()){recover.disabled=false;pending();}}},{signal:session.abort.signal});
    root.addEventListener('submit',()=>{setTimeout(()=>{if(alive())pending();},0);},{signal:session.abort.signal});
    // Re-evaluate recovery controls after uncertain network outcomes too.
    const timer=setInterval(()=>{if(alive())pending();},1000);session.abort.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
    if(screen==='return'){
      const snapshot=returnSnapshot||await window.MovementStore.refresh();if(!alive())return;
      const records=(snapshot.returns||[]).filter(v=>!v.custodyVersion&&!v.inspectionBatchId);
      root.querySelector('[data-integration-history]').innerHTML=`<details class="integration-history" ${records.some(v=>v.id===record)?'open':''}><summary>Historical returns (${records.length})</summary>${records.map(v=>`<article><h3>${escape(v.id)}</h3><p>${escape((v.toolIds||[]).join(', '))} · ${escape(v.status)} · ${escape(v.returnedBy)}</p><p>${escape(v.notes)}</p></article>`).join('')||'<p>No historical returns.</p>'}</details>`;
    }
    if(record&&screen==='asset-retirement-v2')host.querySelector(`[data-retirement-record="${CSS.escape(record)}"]`)?.setAttribute('open','');
    if(record&&screen==='outward-materials')host.querySelector(`[data-open="${CSS.escape(record)}"]`)?.click();
  }
  window.MCPAIntegration={handles,mount,dispose};
})();
