/* Standalone adapter contract; no attachment to the shared Import Tools button. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.MCPAIndividualImportController=factory(root.MCPAIndividualImport);
})(globalThis,function(C){
  'use strict';
  if(!C)throw Error('Load the Individual import core before its controller.');
  const RPC='mcpa_import_equipment_v2',RECEIPT_RPC='mcpa_import_equipment_v2_receipt';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // One active controller per profile and Storage object in this document.
  // Persisted revisions also fence dispatches across remounts/reloads.
  const owners=new WeakMap();
  function create({client,requireActor,storage=globalThis.sessionStorage,crypto=globalThis.crypto,timeoutMs=30000}){
    if(!client?.rpc||typeof requireActor!=='function'||!storage?.getItem||!storage?.setItem||!storage?.removeItem||!crypto?.subtle||!crypto?.randomUUID)throw Error('Import controller requires an RPC client, live identity, session storage and Web Crypto.');
    let busy=false,disposed=false,boundActor=null;const owner={};
    if(!owners.has(storage))owners.set(storage,new Map());
    const activeOwners=owners.get(storage);
    const superseded=()=>Error('Import recovery changed in a newer screen or attempt. Reopen Import Tools and check its current receipt.');
    function actor(){
      const a=requireActor();if(!a?.id||!uuid.test(a.id)||a.role!=='admin')throw Error('Only Admin can import equipment.');
      if(disposed)throw Error('This import screen has ended. Reopen Import Tools and check its receipt.');
      if(boundActor&&boundActor!==a.id)throw Error('Your account changed. Reopen the import adapter and check its receipt.');
      if(!boundActor){boundActor=a.id;activeOwners.set(a.id,owner);}
      if(activeOwners.get(a.id)!==owner)throw superseded();return a;
    }
    const key=a=>'mcpa.workstream-a.import.v2.'+a.id;
    function pendingFor(a){
      const raw=storage.getItem(key(a));if(!raw)return null;
      let p;try{p=JSON.parse(raw);}catch(_){throw Error('Pending import recovery data is unreadable. Preserve it and contact Admin before starting another import.');}
      if(p?.actor!==a.id||!uuid.test(p.operation)||(p.revision!==undefined&&!uuid.test(p.revision))||!/^([a-f0-9]{64})$/.test(p.digest)||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>C.MAX_ROWS||
        p.sources.some(s=>!Number.isInteger(s.source_row)||s.source_row<2||s.source_row>1000000||!['Individual','Bulk'].includes(s.tracking_type)||!Number.isInteger(s.quantity)||s.quantity<1||s.quantity>2147483647)||
        new Set(p.sources.map(s=>s.source_row)).size!==p.sources.length||!Number.isInteger(p.records)||p.records<1||p.records>C.MAX_RECORDS||
        p.sources.reduce((n,s)=>n+(s.tracking_type==='Individual'?s.quantity:1),0)!==p.records)throw Error('Pending import recovery data is invalid. Preserve it and contact Admin before starting another import.');
      return p;
    }
    function sameActor(a){const current=actor();if(current.id!==a.id)throw Error('Your account changed. Reopen the import adapter and check its receipt.');}
    function currentOperation(a,expected){
      sameActor(a);const current=pendingFor(a);
      // Check the entire persisted identity, dispatch revision and state, not
      // just the UUID: a retry deliberately reuses that UUID while becoming uncertain.
      if(!current||JSON.stringify(current)!==JSON.stringify(expected))throw superseded();
      return current;
    }
    function removeCurrent(a,expected,abandon=false){
      const current=currentOperation(a,expected);
      if(abandon&&(current.uncertain||!current.rejected))throw superseded();
      // No await between this recheck and removal in this document's event loop.
      storage.removeItem(key(a));
    }
    async function call(name,args){
      let timer;
      try{return await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Import response timed out. Check the receipt or retry the same confirmed rows.')),timeoutMs);})]);}
      finally{clearTimeout(timer);}
    }
    function checkReceipt(result,p){
      if(!result||result.operation_id!==p.operation||result.actor_id!==p.actor||result.created!==p.records||result.expanded_records!==p.records||result.spreadsheet_rows!==p.sources.length||result.rejected!==0||!Array.isArray(result.assets)||result.assets.length!==p.records)throw Error('The import receipt could not be verified. Preserve the operation and check its receipt before retrying.');
      const assetIds=new Set(),ids=new Set(),indices=new Set(),counts=new Map();
      for(const asset of result.assets){
        const source=p.sources.find(s=>s.source_row===asset.source_row),index=asset.expansion_index;
        if(!source||!Number.isInteger(index)||index<1||index>(source.tracking_type==='Individual'?source.quantity:1)||
          !uuid.test(asset.id)||!/^T-[A-F0-9]{16}$/.test(asset.asset_id)||asset.quantity!==(source.tracking_type==='Individual'?1:source.quantity)||
          assetIds.has(asset.asset_id)||ids.has(asset.id)||indices.has(asset.source_row+':'+index))throw Error('The physical asset receipt could not be verified. Preserve the operation and check its receipt.');
        assetIds.add(asset.asset_id);ids.add(asset.id);indices.add(asset.source_row+':'+index);counts.set(asset.source_row,(counts.get(asset.source_row)||0)+1);
      }
      if(p.sources.some(s=>counts.get(s.source_row)!==(s.tracking_type==='Individual'?s.quantity:1)))throw Error('The source row counts in the import receipt could not be verified.');
      return result;
    }
    async function confirm({sheet,mapping,existing=[]}){
      if(busy)throw Error('An import confirmation is already in progress.');
      const a=actor(),preview=C.validate(sheet,mapping,existing);
      if(!preview.canConfirm)throw Error('Fix all import validation errors before confirming.');
      busy=true;
      try{
        const rows=preview.rows.map(r=>r.data),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows)));
        sameActor(a);
        const digest=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
        let p=pendingFor(a);
        if(p&&p.digest!==digest)throw Error('A previous import is unresolved. Check its receipt or retry the same rows and mappings before starting a different import.');
        if(!p){p={actor:a.id,operation:crypto.randomUUID(),digest,records:preview.records,sources:rows.map(({source_row,tracking_type,quantity})=>({source_row,tracking_type,quantity}))};storage.setItem(key(a),JSON.stringify(p));}
        currentOperation(a,p);
        const priorUncertainty=!!p.uncertain;
        // Persist uncertainty before dispatch so closing the page mid-request
        // can never make a still-running transaction appear safe to abandon.
        p={...p,rejected:false,uncertain:true,revision:crypto.randomUUID()};storage.setItem(key(a),JSON.stringify(p));
        const {data,error}=await call(RPC,{p_operation_id:p.operation,p_rows:rows});
        sameActor(a);
        if(error){
          // A returned PostgreSQL transaction failure is different from an
          // interrupted response: only the former can permit safe abandonment.
          if(['22023','42501','P0001','23505','23514','23502','42883','PGRST202','57014','55P03'].includes(error.code)){
            currentOperation(a,p);
            storage.setItem(key(a),JSON.stringify({...p,uncertain:priorUncertainty,rejected:!priorUncertainty,revision:crypto.randomUUID()}));
          }
          throw Error(error.code==='PGRST202'||error.code==='42883'?'Individual expansion import is not installed. Deploy the reviewed Workstream A migration before using this adapter.':error.message||'Import response interrupted. Check its receipt before retrying.');
        }
        const result=checkReceipt(data,p);removeCurrent(a,p);return result;
      }finally{busy=false;}
    }
    async function recover(){
      if(busy)throw Error('An import operation is already in progress.');
      const a=actor(),p=pendingFor(a);if(!p)return null;
      busy=true;
      try{
        const {data,error}=await call(RECEIPT_RPC,{p_operation_id:p.operation});sameActor(a);
        currentOperation(a,p);
        if(error)throw Error(error.message||'The import receipt could not be checked. Retry after reconnecting.');
        if(!data)return null;
        const result=checkReceipt(data,p);removeCurrent(a,p);return result;
      }finally{busy=false;}
    }
    // A missing receipt alone is insufficient: a timed-out call may still be
    // committing. Require a returned transaction failure plus a receipt check.
    async function abandonUncommitted(){
      if(busy)throw Error('An import operation is already in progress.');
      const a=actor(),p=pendingFor(a);if(!p)return;
      if(p.uncertain||!p.rejected)throw Error('An interrupted import cannot be abandoned. Check its receipt or retry the same confirmed rows.');
      busy=true;
      try{
        const {data,error}=await call(RECEIPT_RPC,{p_operation_id:p.operation});
        currentOperation(a,p);
        if(error)throw Error(error.message||'The import receipt could not be checked. Retry after reconnecting.');
        if(data){const result=checkReceipt(data,p);removeCurrent(a,p);return result;}
        removeCurrent(a,p,true);return null;
      }finally{busy=false;}
    }
    function dispose(){disposed=true;if(boundActor&&activeOwners.get(boundActor)===owner)activeOwners.delete(boundActor);}
    return {confirm,recover,abandonUncommitted,pending:()=>pendingFor(actor()),isBusy:()=>busy,dispose};
  }
  return {RPC,RECEIPT_RPC,create};
});
