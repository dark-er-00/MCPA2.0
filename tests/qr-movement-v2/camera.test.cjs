const {test}=require('node:test'),assert=require('node:assert/strict');
test('injected camera decoder delivers an Asset ID and stops all tracks',async()=>{
  const {CameraScanner}=await import('../../js/upgrades/equipment-qr/scanner.mjs');
  const previous=globalThis.isSecureContext;globalThis.isSecureContext=true;
  let stopped=0;const scans=[];
  try{
    const video={srcObject:null,play:async()=>{},readyState:2};let scanner;
    scanner=new CameraScanner({video,decode:async()=>['mcpa:asset:UNIT-1'],onScan:async value=>{scans.push(value);scanner.stop();},onError:e=>{throw e;},
      mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})}});
    await scanner.start();await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(scans,['mcpa:asset:UNIT-1']);assert.equal(stopped,1);assert.equal(video.srcObject,null);
  }finally{globalThis.isSecureContext=previous;}
});
test('camera releases late streams on unmount and unsupported browsers keep manual fallback',async()=>{
  const {CameraScanner}=await import('../../js/upgrades/equipment-qr/scanner.mjs');
  const previous=globalThis.isSecureContext;globalThis.isSecureContext=true;
  try{
    let deliver,stopped=0;const errors=[];
    const scanner=new CameraScanner({video:{srcObject:null,play:async()=>{},readyState:0},decode:async()=>[],onScan:()=>{},onError:e=>errors.push(e.message),
      mediaDevices:{getUserMedia:()=>new Promise(resolve=>deliver=()=>resolve({getTracks:()=>[{stop:()=>stopped++}]}))}});
    const start=scanner.start();scanner.stop();deliver();await start;assert.equal(stopped,1);assert.equal(scanner.stream,null);
    await new CameraScanner({video:{srcObject:null},Detector:null,onError:e=>errors.push(e.message)}).start();
    assert.ok(errors.some(e=>e.includes('unavailable')));
  }finally{globalThis.isSecureContext=previous;}
});
