export const BUCKET='mcpa-movement-evidence-v2';
export const MAX_BYTES=5*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp']);
export async function validatePhoto(file){
  if(!file||!types.has(file.type)||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES)
    throw new Error('Choose a JPEG, PNG or WebP photo, up to 5 MiB.');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const text=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':
    [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)?'image/png':
      text(0,4)==='RIFF'&&text(8,12)==='WEBP'?'image/webp':null;
  if(mime!==file.type)throw new Error('Photo contents do not match its image format. Choose a valid photo.');
  return file;
}
export function createEvidenceUploader(api){
  const tickets=new WeakMap();
  return {
    async upload(file,{assetId,phase,targetId}){
      await validatePhoto(file);
      const context={assetId,phase,...(targetId?{targetId}:{}),mimeType:file.type,byteSize:file.size};
      const key=JSON.stringify(context);
      if(!tickets.has(file))tickets.set(file,new Map());
      if(!tickets.get(file).has(key))tickets.get(file).set(key,{id:crypto.randomUUID(),completed:null});
      const saved=tickets.get(file).get(key);
      if(saved.completed)return saved.completed;
      const id=saved.id;
      const ticket=await api.rpc('mcpa_b_evidence_action',{p_action:'stage',p_payload:context,p_operation_id:id});
      const storage=api.client.storage.from(BUCKET);
      const {error}=await storage.upload(ticket.objectName,file,{contentType:file.type,upsert:false,cacheControl:'60'});
      // An upload may have succeeded despite a lost response. Completion checks
      // the private object and service metadata; it cannot create an attachment.
      try{
        await api.rpc('mcpa_b_evidence_action',{p_action:'complete',p_payload:{},p_operation_id:id});
      }catch(completionError){throw new Error(error?`Photo upload failed: ${error.message||'try again'}`:completionError.message);}
      saved.completed={...ticket,id,assetId};return saved.completed;
    },
    async signedUrl(objectName){
      const {data,error}=await api.client.storage.from(BUCKET).createSignedUrl(objectName,60);
      if(error||!data?.signedUrl)throw new Error('Photo access failed. Refresh and try again.');
      const url=new URL(data.signedUrl,globalThis.location?.href||'http://localhost');
      if(!['https:','http:'].includes(url.protocol))throw new Error('Photo URL was invalid.');
      return url.href;
    },
    async discard(objectName){
      const {error}=await api.client.storage.from(BUCKET).remove([objectName]);
      if(error)throw new Error('Could not remove the staged photo. Retry before leaving.');
    }
  };
}
