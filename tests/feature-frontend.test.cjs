const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function classes(initial=[]) {
  const values = new Set(initial);
  return {contains:value=>values.has(value),add:value=>values.add(value),remove:value=>values.delete(value),toggle(value,on){if(on===undefined)on=!values.has(value);on?values.add(value):values.delete(value);}};
}
function themeHarness({animated=false,reduced=false,fail=false}={}) {
  const prefs = new Map([['mcpa.theme','dark']]), controls=[];
  function control(){const attrs=new Map();const c={textContent:'',title:'',attrs,setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),getBoundingClientRect:()=>({left:10,top:20,width:30,height:40})};controls.push(c);return c;}
  const top=control(),account=control(),menu=control(),label={},icon={},properties=new Map();
  const document={body:{classList:classes(['dark'])},documentElement:{classList:classes(),style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}},querySelector:()=>top,querySelectorAll:()=>[account,menu],getElementById:id=>id==='theme-label'?label:id==='theme-icon'?icon:null};
  if(animated)document.startViewTransition=update=>{if(fail)throw new Error('Fixture unsupported');update();return {ready:Promise.resolve(),updateCallbackDone:Promise.resolve(),finished:Promise.resolve(),skipTransition(){}};};
  const context={document,localStorage:{setItem:(k,v)=>prefs.set(k,v)},ICONS:{sun:'sun',moon:'moon'},matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),innerWidth:393,innerHeight:852,window:{addEventListener(){},removeEventListener(){}}};
  const app=source('js/app.js'),start=app.indexOf('let themeTransitionRunning'),end=app.indexOf('let searchTimer;');
  vm.runInNewContext(app.slice(start,end),context);
  return {...context,prefs,top,account,menu,properties};
}
test('theme buttons and legacy click events synchronize existing preference and all controls',async()=>{
  for(const animated of [false,true]) {
    const h=themeHarness({animated});await h.toggleTheme({currentTarget:h.account});
    assert.equal(h.document.body.classList.contains('dark'),false);assert.equal(h.prefs.get('mcpa.theme'),'light');
    assert.equal(h.account.textContent,'Switch to night mode');assert.equal(h.menu.attrs.get('aria-pressed'),'false');
    await h.toggleTheme(h.top);assert.equal(h.prefs.get('mcpa.theme'),'dark');assert.equal(h.top.attrs.get('aria-pressed'),'true');
    await h.toggleTheme({type:'click'});assert.equal(h.prefs.get('mcpa.theme'),'light');assert.equal(h.properties.size,0);
  }
});
test('theme supports reduced motion and failed view transitions without exceptions',async()=>{
  for(const options of [{animated:true,reduced:true},{animated:true,fail:true}]) {
    const h=themeHarness(options);await h.toggleTheme(null);assert.equal(h.prefs.get('mcpa.theme'),'light');assert.equal(h.properties.size,0);
  }
  const h=themeHarness();h.applyTheme(false,false);assert.equal(h.prefs.get('mcpa.theme'),'dark','Rendering controls preserves saved preference');
});
function image(type='image/png',size=100,bytes=[137,80,78,71,13,10,26,10]) {
  return {type,size,slice(){return {arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}};
}
function photoHarness() {
  let user={id:'admin-1',role:'admin'},uploadError=null,signError=null;const uploads=[],signs=[],removes=[];
  const storage={async remove(paths){removes.push(paths);return {error:storage.removeError};},async upload(...args){uploads.push(args);if(storage.throwUpload)throw Error('Response lost');return {error:uploadError};},async createSignedUrl(path,seconds){signs.push({path,seconds,user:user.id});return {data:{signedUrl:'https://fixture.example/'+path},error:signError};}};
  const window={MCPAAuth:{requireLive(){if(!user)throw new Error('Sign in');return user;}},EquipmentTracking:{client:()=>({storage:{from(bucket){assert.equal(bucket,'equipment-photos');return storage;}}})},addEventListener(){}};
  vm.runInNewContext(source('js/equipment-photos.js'),{window,document:{},crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},Uint8Array,Date,setInterval(){return 1;},clearInterval(){}});
  return {api:window.EquipmentPhotos,uploads,signs,removes,storage,setUser:value=>{user=value;},failUpload:value=>{uploadError=value;},failSign:value=>{signError=value;}};
}
test('photo validation enforces MIME, signatures, non-empty files and 5 MB boundary',async()=>{
  const {api}=photoHarness();await api.validate(image());await api.validate(image('image/png',api.maxBytes));
  await api.validate(image('image/jpeg',10,[255,216,255]));await api.validate(image('image/webp',12,[82,73,70,70,0,0,0,0,87,69,66,80]));
  for(const file of [image('image/svg+xml'),image('image/png',0),image('image/png',api.maxBytes+1),image('image/png',100,[255,216,255])])await assert.rejects(api.validate(file),/Choose|valid/);
});
test('immutable photo staging retries without another upload and rejects non-admin accounts',async()=>{
  const h=photoHarness(),file=image();const staged=await h.api.prepare(file,'TOOL-001');
  assert.equal(staged.reference,'storage://equipment-photos/TOOL-001/11111111-1111-4111-8111-111111111111.png');
  assert.equal(h.uploads[0][2].upsert,false);assert.equal(h.uploads[0][2].contentType,'image/png');
  assert.equal(await h.api.prepare(file,'TOOL-001',staged),staged);assert.equal(h.uploads.length,1);
  for(const role of ['engineer','architect','secretary','tool_handler']){h.setUser({id:role,role});await assert.rejects(h.api.prepare(file,'TOOL-001'),/Admin/);}
  assert.equal(h.uploads.length,1);
});
test('photo upload errors never return a reference and selected file can retry safely',async()=>{
  const h=photoHarness(),file=image();h.failUpload({code:'42501'});await assert.rejects(h.api.prepare(file,'TOOL-001'),/Photo upload failed/);
  h.failUpload(null);assert.ok((await h.api.prepare(file,'TOOL-001')).reference);
});
test('legacy equipment IDs with spaces or punctuation use a safe storage folder',async()=>{
  const h=photoHarness(),staged=await h.api.prepare(image(),'Legacy Tool / Model 3');
  assert.equal(staged.assetId,'Legacy Tool / Model 3');assert.match(staged.path,/^asset-[0-9a-f-]+\/[0-9a-f-]+\.png$/);assert.equal(h.api.pathFromReference(staged.reference),staged.path);
});
test('private display URLs are signed once per account, and unsafe references are ignored',async()=>{
  const h=photoHarness(),reference=(await h.api.prepare(image(),'TOOL-001')).reference;
  await Promise.all([h.api.resolve(reference),h.api.resolve(reference)]);await h.api.resolve(reference);assert.equal(h.signs.length,1);assert.equal(h.signs[0].seconds,3600);
  h.setUser({id:'engineer-1',role:'engineer'});await h.api.resolve(reference);assert.equal(h.signs.length,2);
  for(const value of ['javascript:alert(1)','storage://equipment-photos/../a.png','storage://other/TOOL-001/a.png'])assert.equal(await h.api.resolve(value),null);
  h.failSign({code:'42501'});h.setUser({id:'blocked',role:'engineer'});await assert.rejects(h.api.resolve(reference),/could not load/);
});
function masterlistHarness() {
  const nodes={},writes=[],saved={asset_id:'TOOL-001',image_url:'https://fixture.example/old.png'},user={id:'admin-1',role:'admin'};
  const fields={equipmentType:'Drill',equipmentCategory:'Power Tools',brand:'Bosch',equipmentModel:'D1',serialNumber:'SERIAL-A',equipmentCondition:'Good',trackingType:'Individual',equipmentQuantity:'1',equipmentUnit:'',identifyingDetails:''};
  for(const [id,value] of Object.entries(fields))nodes[id]={value,disabled:false};
  const submit={textContent:'Update Item',disabled:false};nodes.closeEquipmentModal={disabled:false};
  nodes.equipmentForm={isConnected:true,reset(){},querySelector:()=>submit,querySelectorAll:()=>Object.values(fields).map((_,i)=>nodes[Object.keys(fields)[i]]).concat(submit),setAttribute(){},removeAttribute(){}};
  nodes.equipmentModal={style:{display:'flex'}};nodes.equipmentFormFeedback={isConnected:true,textContent:''};nodes['inventory-sync']={isConnected:true,textContent:''};
  const document={getElementById:id=>nodes[id]||null},db={from(table){assert.equal(table,'equipment');const q={};return {update(payload){q.payload=payload;return this;},insert(payload){q.payload=payload[0];return this;},eq(key,value){q[key]=value;return this;},select(columns){q.columns=columns;return this;},limit(){return this;},then(resolve){return Promise.resolve(db.recoveryError?{error:db.recoveryError}:{data:db.committed?[saved]:[]}).then(resolve);},async single(){writes.push(q);if(db.error){if(db.committed)Object.assign(saved,q.payload);return {error:db.error};}Object.assign(saved,q.payload);return {data:saved};}};}};
  let prepareCount=0;
  const window={MCPAAuth:{requireLive:()=>user},EquipmentTracking:{async inventoryOffice(){if(window.officeError)throw new Error(window.officeError);return {id:"office-fixture",label:"Office"};},client:()=>db,matchesStatus:(item,status)=>!status||item.dbStatus===status},EquipmentPhotos:{async prepare(file,assetId,previous){if(window.uploadError)throw new Error('Photo upload failed');prepareCount++;return previous||{reference:'storage://equipment-photos/'+assetId+'/11111111-1111-4111-8111-111111111111.png',file,assetId};}}};
  const context={window,document,supabaseClient:db,URL:{revokeObjectURL(){}},crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},console};
  const text=source('1-admin/modules/masterlist/masterlist.js');vm.runInNewContext(text.slice(0,text.lastIndexOf('(function () {')),context);
  context.initMasterlist=async()=>{};context.currentEditId='TOOL-001';context.setupMasterlistListeners();
  return {context,nodes,writes,saved,window,db,get prepareCount(){return prepareCount;},async save(){await nodes.equipmentForm.onsubmit({preventDefault(){}});}};
}
test('search matches all six mapped inventory fields case-insensitively and handles missing values',()=>{
  const h=masterlistHarness(),item={assetId:'TOOL-001',equipmentType:'Hammer Drill',brand:'Bosch',serialNumber:'SERIAL-ABC',site:'Assigned Test Project',holder:'Maria Engineer'};
  for(const query of ['tool-0','HAMMER','bosch','serial-ab','test project','MARIA'])assert.equal(h.context.equipmentMatchesSearch(item,query),true,query);
  assert.equal(h.context.equipmentMatchesSearch(item,'no result'),false);assert.equal(h.context.equipmentMatchesSearch({},'serial'),false);assert.equal(h.context.equipmentMatchesSearch(item,'  '),true);
});
test('expanded inventory search continues to intersect category, status and project filters',()=>{
  const h=masterlistHarness();h.context.equipmentList=[{assetId:'A',serialNumber:'SER-12',site:'North',holder:'Maria',category:'Power',dbStatus:'IN_USE'},{assetId:'B',serialNumber:'SER-12',site:'South',holder:'Maria',category:'Hand',dbStatus:'AVAILABLE'}];
  h.nodes.searchEquipment={value:'MARIA'};h.nodes.typeFilter={value:'Power'};h.nodes.statusFilter={value:'IN_USE'};h.nodes.siteFilter={value:'North'};
  assert.equal(h.context.filteredEquipment().length,1);h.nodes.siteFilter.value='South';assert.equal(h.context.filteredEquipment().length,0);
});
test('editing equipment without selecting a photo preserves its existing association',async()=>{
  const h=masterlistHarness();h.window.officeError='Office unavailable';await h.save();assert.equal(h.writes.length,1);assert.equal(Object.hasOwn(h.writes[0].payload,'image_url'),false);assert.equal(h.saved.image_url,'https://fixture.example/old.png');
  for(const key of ['site_id','current_holder_id','status'])assert.equal(Object.hasOwn(h.writes[0].payload,key),false);
});
test('upload failure prevents metadata writes and keeps the form and old photo',async()=>{
  const h=masterlistHarness();h.context.equipmentPhotoState.file=image();h.window.uploadError=true;await h.save();
  assert.equal(h.writes.length,0);assert.equal(h.saved.image_url,'https://fixture.example/old.png');assert.match(h.nodes.equipmentFormFeedback.textContent,/Photo upload failed/);assert.equal(h.nodes.equipmentModal.style.display,'flex');assert.equal(h.nodes.closeEquipmentModal.disabled,false);
});
test('failed metadata replacement retains staged upload, old reference and safe retry',async()=>{
  const h=masterlistHarness();h.context.equipmentPhotoState.file=image();h.db.error={message:'Fixture write denied'};await h.save();
  assert.equal(h.saved.image_url,'https://fixture.example/old.png');assert.ok(h.context.equipmentPhotoState.staged);assert.match(h.nodes.equipmentFormFeedback.textContent,/kept/);
  const staged=h.context.equipmentPhotoState.staged;h.db.error=null;await h.save();assert.equal(h.writes[1].payload.image_url,staged.reference);assert.equal(h.saved.image_url,staged.reference);assert.equal(h.nodes.equipmentModal.style.display,'none');
});
test('non-admin inventory save is rejected before any database or storage write',async()=>{
  const h=masterlistHarness();h.window.MCPAAuth.requireLive=()=>({id:'handler-1',role:'tool_handler'});await h.save();assert.equal(h.writes.length,0);assert.equal(h.prepareCount,0);assert.match(h.nodes.equipmentFormFeedback.textContent,/Admin/);
});
test('new item photo uses stable unique record and asset IDs across a failed-save retry',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;h.context.equipmentPhotoState.file=image();h.db.error={message:'Fixture temporary failure'};
  await h.save();const first=h.writes[0].payload;assert.equal(first.id,'11111111-1111-4111-8111-111111111111');assert.match(first.asset_id,/^T-[0-9A-F]{16}$/);assert.equal(first.status,'AVAILABLE');
  h.db.error=null;await h.save();assert.equal(h.writes[1].payload.id,first.id);assert.equal(h.writes[1].payload.asset_id,first.asset_id);assert.equal(h.writes[1].payload.image_url,first.image_url);
  assert.equal(first.site_id,'office-fixture');
});
test('unavailable Office prevents creation and upload while preserving form and selected photo',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;const file=image();h.context.equipmentPhotoState.file=file;
  h.window.officeError='Office inventory configuration is unavailable';await h.save();
  assert.equal(h.writes.length,0);assert.equal(h.prepareCount,0);
  assert.equal(h.context.equipmentPhotoState.file,file);
  assert.equal(h.nodes.equipmentModal.style.display,'flex');
  assert.match(h.nodes.equipmentFormFeedback.textContent,/Office inventory configuration/);
  h.window.officeError=null;await h.save();assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].payload.site_id,'office-fixture');
  assert.equal(h.nodes.equipmentModal.style.display,'none');
});

 test('new item without a photo never references the optional image column',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;await h.save();
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].columns,'asset_id,site_id');assert.equal(Object.hasOwn(h.writes[0].payload,'image_url'),false);
  assert.equal(h.writes[0].payload.site_id,'office-fixture');assert.equal(h.prepareCount,0);
 });
 test('duplicate Save clicks share one in-flight insert',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;await Promise.all([h.save(),h.save(),h.save()]);assert.equal(h.writes.length,1);
 });
 test('missing photo schema fails before upload and preserves the selection',async()=>{
  const h=masterlistHarness(),file=image();h.context.currentEditId=null;h.context.equipmentPhotoState.file=file;
  h.window.EquipmentPhotos.checkSchema=async()=>{throw Error('Equipment photo setup is missing');};await h.save();
  assert.equal(h.writes.length,0);assert.equal(h.prepareCount,0);assert.equal(h.context.equipmentPhotoState.file,file);assert.match(h.nodes.equipmentFormFeedback.textContent,/setup is missing/);
 });
 test('lost successful insert response is reconciled without a second insert',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;h.db.committed=true;h.db.error={message:'Response interrupted'};
  await h.save();h.db.error=null;await h.save();assert.equal(h.writes.length,1);assert.equal(h.nodes.equipmentModal.style.display,'none');
 });
 test('unverifiable previous insert stops retry instead of creating duplicates',async()=>{
  const h=masterlistHarness();h.context.currentEditId=null;h.db.error={message:'Connection interrupted'};await h.save();
  h.db.error=null;h.db.recoveryError={message:'Offline'};await h.save();assert.equal(h.writes.length,1);assert.match(h.nodes.equipmentFormFeedback.textContent,/verify the previous save/);
 });

 test('uncertain upload response retains the exact path and reconciles it without a second upload',async()=>{
  const h=photoHarness(),file=image();h.storage.throwUpload=true;
  let staged;try{await h.api.prepare(file,'TOOL-001');}catch(error){staged=error.staged;}
  assert.ok(staged);assert.equal(staged.uploaded,false);h.storage.throwUpload=false;
  const recovered=await h.api.prepare(file,'TOOL-001',staged);
  assert.equal(recovered.path,staged.path);assert.equal(recovered.uploaded,true);assert.equal(h.uploads.length,1);
 });
 test('failed upload retry reuses its original path when the object is absent',async()=>{
  const h=photoHarness(),file=image();h.failUpload({message:'Offline'});let staged;
  try{await h.api.prepare(file,'TOOL-001');}catch(error){staged=error.staged;}
  h.failUpload(null);h.failSign({message:'Object absent'});const saved=await h.api.prepare(file,'TOOL-001',staged);
  assert.equal(h.uploads.length,2);assert.equal(h.uploads[0][0],h.uploads[1][0]);assert.equal(saved.uploaded,true);
 });
 test('discard removes only the staged path and reports cleanup failures for retry',async()=>{
  const h=photoHarness(),staged=await h.api.prepare(image(),'TOOL-001');await h.api.discard(staged);
  assert.equal(h.removes[0][0],staged.path);h.storage.removeError={message:'Offline'};await assert.rejects(h.api.discard(staged),/could not be cleared/);
  h.setUser({id:'other-admin',role:'admin'});await assert.rejects(h.api.discard(staged),/uploading account/);
 });
