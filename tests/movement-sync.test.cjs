const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');

test('a save waits for an older background read and then fetches the committed snapshot',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/movement-cloud.js'),'utf8');
 const window=new EventTarget();
 const person={id:'fixture-person',name:'Fixture Engineer',role:'engineer'};
 window.MCPAAuth={profile:person,canAction:()=>true,requireLive:()=>person};
 const original={tools:[{id:'TEST-TOOL'}],sites:[],users:[],requests:[],transfers:[],returns:[],repairs:[],missing:[],activity:[]};
 const record={id:'REQ-FIXTURE',status:'pending'};
 const saved={...original,requests:[record]};
 let reads=0,release,changes=0;
 window.addEventListener('mcpa:movement-change',()=>changes++);
 window.supabaseClient={rpc(name){
  if(name==='mcpa_movement_action')return Promise.resolve({data:record});
  reads++;
  if(reads===2)return new Promise(resolve=>{release=()=>resolve({data:original});});
  return Promise.resolve({data:reads===1?original:saved});
 }};
 vm.runInNewContext(source,{window,TOOLS:[],crypto:webcrypto,CustomEvent});
 const store=window.MovementStore;
 await store.initialize();assert.equal(reads,1);
 const background=store.refresh();
 const saving=store.createRequest({toolIds:['TEST-TOOL'],purpose:'Only a fixture'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,2,'No overlapping follow-up read before old request finishes');
 release();await background;await saving;
 assert.equal(reads,3);
 assert.equal(store.getState().requests[0].id,record.id);
 assert.equal(changes,2,'An identical background snapshot does not rerender forms');
 await store.refresh();assert.equal(changes,2,'Repeated polls preserve unchanged UI');
});

test('failed inventory refresh invalidates cached availability and recovery publishes a fresh verification',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/movement-cloud.js'),'utf8');
 const window=new EventTarget(),person={id:'engineer',role:'engineer'};
 window.MCPAAuth={profile:person,requireLive:()=>person};
 window.MovementDemoStore={deactivate(){}};
 let failed=false,changes=0;
 window.supabaseClient={async rpc(){return failed?{error:{code:'42501'}}:{data:{tools:[{id:'STOCK',status:'available',movementLock:null}],requests:[],inventoryAvailabilityVersion:1}};}};
 window.addEventListener('mcpa:movement-change',()=>changes++);
 vm.runInNewContext(source,{window,TOOLS:[],crypto:webcrypto,CustomEvent});
 const store=window.MovementStore;await store.refresh();assert.equal(store.getState().availabilityError,undefined);
 failed=true;await assert.rejects(store.refresh(),/not permitted/);
 assert.equal(store.getState().availabilityError,true);assert.equal(store.getState().tools[0].id,'STOCK','History stays visible');
 failed=false;await store.refresh();assert.equal(store.getState().availabilityError,undefined);assert.equal(changes,3);
 store.clear();assert.equal(store.getState().availabilityError,undefined);
});
