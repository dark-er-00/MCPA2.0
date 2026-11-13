export const VERSION=2;
export const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export function createCustodyApi(client,options={}){
  if(!client?.rpc||!client?.storage)throw new Error('Provide the signed-in Supabase client.');
  let storage;try{storage=options.storage??globalThis.sessionStorage;}catch{ /* Recovery remains in memory if browser storage is disabled. */ }
  const operations=new Map(),inFlight=new Map();let actor=null,disposed=false,recoveryError=false;
  let storageReady=!!(storage?.getItem&&storage?.setItem);
  const storageKey=()=>actor?'mcpa.custody.pending.v3.'+actor:null;
  const unreadable=()=>{recoveryError=true;return new Error('Interrupted-action recovery data could not be read. Preserve this browser tab and contact Admin.');};
  function storedOperations(){
    if(!actor||!storageReady)return null;
    let raw;try{raw=storage.getItem(storageKey());}catch{storageReady=false;return null;}
    try{
      const saved=JSON.parse(raw||'[]');if(!Array.isArray(saved))throw new Error();
      const result=new Map();
      for(const entry of saved){
        if(!Array.isArray(entry)||entry.length!==2)throw new Error();
        const [key,op]=entry;
        if(typeof key!=='string'||op?.key!==key||typeof op.scope!=='string'||typeof op.action!=='string'
          ||!op.payload||typeof op.payload!=='object'||!/^[-a-f0-9]{36}$/i.test(op.id)
          ||key!==`${op.scope}:${op.action}:${canonical(op.payload)}`||result.has(key))throw new Error();
        result.set(key,op);
      }
      return result;
    }catch{throw unreadable();}
  }
  function writeStored(saved){
    try{storage.setItem(storageKey(),JSON.stringify([...saved]));}
    catch{storageReady=false; /* Keep the in-memory retry token. */ }
  }
  function synchronize(){
    const saved=storedOperations();if(!saved)return;
    operations.clear();for(const [key,op] of saved)operations.set(key,op);
  }
  function saveOperation(op){
    operations.set(op.key,op);
    const saved=storedOperations();if(!saved)return;
    saved.set(op.key,op);writeStored(saved);
  }
  function settleOperation(op,definitiveFailure=false){
    const matches=current=>current?.id===op.id&&(!definitiveFailure||current.attemptId===op.attemptId);
    if(matches(operations.get(op.key)))operations.delete(op.key);
    // Read/modify/write only this UUID. A disposed instance may still receive
    // a response after a new instance has added unrelated or newer operations.
    const saved=storedOperations();if(!saved||!matches(saved.get(op.key)))return;
    saved.delete(op.key);writeStored(saved);
  }
  const rpc=async(name,args={})=>{
    const {data,error}=await client.rpc(name,args);
    if(error)throw Object.assign(new Error(error.message||'The request failed. Refresh and try again.'),{code:error.code});
    return data;
  };
  const mutate=async(action,payload,scope='default')=>{
    if(disposed)throw new Error('This account session has ended. Reopen the screen.');
    if(recoveryError)throw new Error('Interrupted-action recovery data needs Admin review before another action.');
    synchronize();
    const key=`${scope}:${action}:${canonical(payload)}`;
    if(inFlight.has(key))return inFlight.get(key);
    if([...operations.values()].some(op=>op.scope===scope&&op.key!==key))throw new Error('Recover the interrupted action before changing this form.');
    const previous=operations.get(key),priorUncertainty=!!previous?.uncertain;
    const op={...(previous||{key,scope,action,payload:JSON.parse(canonical(payload)),id:crypto.randomUUID()}),uncertain:true,attemptId:crypto.randomUUID()};
    saveOperation(op);
    const promise=(async()=>{
      try{
        const result=await rpc('mcpa_b_action',{p_action:action,p_payload:op.payload,p_operation_id:op.id});
        if(!result||typeof result!=='object'||typeof result.id!=='string')throw new Error('The saved result could not be verified. Recover this interrupted action before starting another.');
        // Only unresolved outcomes retain a retry token. A later deliberate
        // action with the same values must receive a fresh operation UUID.
        settleOperation(op);return result;
      }catch(error){
        if(!priorUncertainty&&['22023','42501','40001','23505','23514','P0001','42883','PGRST202'].includes(error.code))settleOperation(op,true);
        throw error;
      }finally{inFlight.delete(key);}
    })();inFlight.set(key,promise);return promise;
  };
  return {
    client,rpc,
    async snapshot(){
      const value=await rpc('mcpa_b_snapshot');
      if(disposed)throw new Error('This account session has ended.');
      if(actor&&actor!==value.profile.id)throw new Error('Your account changed. Reopen this screen.');
      if(!actor)actor=value.profile.id;
      synchronize();
      return value;
    },
    lookup:(reference,intent)=>rpc('mcpa_b_lookup',{p_reference:reference,p_intent:intent}),
    mutate,
    pending(){if(disposed)return [];synchronize();return [...operations.values()].map(op=>({...op}));},
    async retryPending(){synchronize();const op=operations.values().next().value;if(!op)return null;return mutate(op.action,op.payload,op.scope);},
    dispose(){disposed=true;operations.clear();inFlight.clear();}
  };
}
export const unresolved=item=>['pending','missing','disputed'].includes(item.outcome);
export const availableForBatch=asset=>asset.individual&&asset.status==='IN_USE'&&!asset.movementLock;
