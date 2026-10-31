// QR payloads contain a permanent Asset ID only. All resolution goes to the RPC.
export function parseAssetReference(value){
  if(typeof value!=='string')throw new Error('Scan or enter a permanent Asset ID.');
  let id=value.trim();
  if(id.startsWith('mcpa:asset:'))id=id.slice(11);
  if(!id||id.length>120||/[\u0000-\u001f\u007f]/.test(id)||/^(?:https?:|javascript:|data:|\{)/i.test(id))
    throw new Error('This code is not an equipment Asset ID. Enter the printed ID manually.');
  return id;
}
export class AssetBatch{
  #assets=new Map();#pending=new Map();#generation=0;
  constructor({resolve,intent='return',limit=100}){this.resolve=resolve;this.intent=intent;this.limit=limit;}
  get items(){return [...this.#assets.values()];}
  async add(reference){
    const id=parseAssetReference(reference);
    if(this.#assets.has(id)||this.#pending.has(id))return {duplicate:true,id};
    if(this.#assets.size+this.#pending.size>=this.limit)throw new Error(`A batch supports up to ${this.limit} assets.`);
    const generation=this.#generation;
    this.#pending.set(id,true);
    try{
      const asset=await this.resolve(id,this.intent);
      if(generation!==this.#generation)return {cancelled:true,id};
      if(!asset?.id||asset.id!==id)throw new Error('The server could not identify this Asset ID.');
      if(this.#assets.has(asset.id))return {duplicate:true,id:asset.id};
      this.#assets.set(asset.id,asset);return {asset};
    }finally{if(generation===this.#generation)this.#pending.delete(id);}
  }
  remove(id){this.#assets.delete(id);}
  clear(){this.#generation++;this.#assets.clear();this.#pending.clear();}
}
export class CameraScanner{
  constructor({video,onScan,onError,decode,mediaDevices=globalThis.navigator?.mediaDevices,Detector=globalThis.BarcodeDetector}){
    Object.assign(this,{video,onScan,onError,decode,mediaDevices,Detector});this.generation=0;this.stream=null;this.timer=null;this.last='';this.lastAt=0;
  }
  async start(){
    this.stop();const generation=this.generation;
    try{
      if(!globalThis.isSecureContext)throw new Error('Camera scanning needs HTTPS or localhost. Use manual selection here.');
      if(!this.decode){
        if(!this.Detector||(this.Detector.getSupportedFormats&&!(await this.Detector.getSupportedFormats()).includes('qr_code')))
          throw new Error('QR camera scanning is unavailable in this browser. Search or enter an Asset ID below.');
        const detector=new this.Detector({formats:['qr_code']});
        this.decode=async video=>(await detector.detect(video)).map(result=>result.rawValue);
      }
      if(!this.mediaDevices?.getUserMedia)throw new Error('Camera access is unavailable. Use manual selection.');
      const stream=await this.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      const tick=async()=>{
        if(generation!==this.generation)return;
        try{
          if(this.video.readyState>=2)for(const raw of await this.decode(this.video)){
            if(generation!==this.generation)return;
            if(raw!==this.last||Date.now()-this.lastAt>2500){this.last=raw;this.lastAt=Date.now();await this.onScan(raw);}
          }
        }catch(error){if(generation===this.generation)this.onError(error);}
        if(generation===this.generation)this.timer=setTimeout(tick,350);
      };void tick();
    }catch(error){if(generation===this.generation){this.stop();this.onError(error);}}
  }
  stop(){this.generation++;clearTimeout(this.timer);this.timer=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;if(this.video)this.video.srcObject=null;}
}
