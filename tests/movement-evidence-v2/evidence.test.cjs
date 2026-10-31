const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,randomUUID}=require('../custody-lifecycle-v2/fixture.cjs');
const stage=async(f,actor,assetId,phase,targetId)=>{
  const id=randomUUID(),ticket=await f.evidence(actor,'stage',{assetId,phase,targetId,mimeType:'image/png',byteSize:8},id);
  await f.upload(actor,ticket);await f.evidence(actor,'complete',{},id);return {...ticket,id};
};
test('private Storage policies deny unrelated roles, forged paths, overwrites and linked deletion',async t=>{
  const f=await fixture(t),a=f.actors,id=randomUUID();
  const ticket=await f.evidence(a.sky,'stage',{assetId:'TOOL-002',phase:'submit_return',mimeType:'image/png',byteSize:8},id);
  // Deliberate permissive fixture policy proves the additive restrictive fence.
  await f.db.exec('create policy fixture_overbroad_storage on storage.objects for all to public using(true) with check(true)');
  for(const actor of [a.pau,a.architect,a.admin,a.secretary,a.inactive,null])await assert.rejects(f.upload(actor,ticket));
  await assert.rejects(f.upload(a.sky,{objectName:'../forged.png'}));
  await f.upload(a.sky,ticket);
  for(const actor of [a.pau,a.architect,a.admin,a.secretary,a.inactive])assert.equal((await f.query(actor,'select * from storage.objects')).rows.length,0);
  assert.equal((await f.query(a.sky,'select * from storage.objects')).rows.length,1);
  await f.evidence(a.sky,'complete',{},id);
  const payload={assetIds:['TOOL-002'],destinationId:f.sites.office,evidenceIds:[id]};
  const b=await f.action(a.sky,'submitReturn',payload);
  assert.equal((await f.evidence(a.sky,'stage',{assetId:'TOOL-002',phase:'submit_return',mimeType:'image/png',byteSize:8},id)).id,id,'Identical ticket replay remains safe after movement submission');
  assert.equal((await f.snapshot(a.admin)).evidence[0].movement_id,b.id);
  assert.equal((await f.snapshot(a.pau)).evidence.length,0);
  assert.equal((await f.query(a.admin,'select * from storage.objects')).rows.length,1);
  assert.equal((await f.query(a.sky,'delete from storage.objects returning id')).rows.length,0);
  assert.equal((await f.query(a.sky,"update storage.objects set metadata='{}' returning id")).rows.length,0);
  await assert.rejects(f.action(a.sky,'submitReturn',{assetIds:['TOOL-003'],destinationId:f.sites.office,evidenceIds:[id]}));
  assert.equal((await f.tool('TOOL-003')).current_holder_id,a.sky.id);
});
test('failed/incomplete uploads and wrong-asset attachments roll back custody and operations',async t=>{
  const f=await fixture(t),a=f.actors,id=randomUUID();
  const ticket=await f.evidence(a.sky,'stage',{assetId:'TOOL-002',phase:'submit_return',mimeType:'image/png',byteSize:8},id);
  await assert.rejects(f.evidence(a.sky,'complete',{},id),/incomplete/);
  await assert.rejects(f.action(a.sky,'submitReturn',{assetIds:['TOOL-002'],destinationId:f.sites.office,evidenceIds:[id]}),/photo/);
  assert.equal((await f.snapshot(a.admin)).returns.length,0);
  await f.upload(a.sky,ticket,'image/jpeg',9);await assert.rejects(f.evidence(a.sky,'complete',{},id),/metadata/);
  await f.query(a.sky,'delete from storage.objects where name=$1',[ticket.objectName]);
  await f.upload(a.sky,ticket);await f.evidence(a.sky,'complete',{},id);
  await assert.rejects(f.action(a.sky,'submitReturn',{assetIds:['TOOL-003'],destinationId:f.sites.office,evidenceIds:[id]}),/photo/);
  assert.equal((await f.snapshot(a.admin)).returns.length,0);
  for(const bad of [{mimeType:'image/svg+xml',byteSize:8},{mimeType:'image/png',byteSize:5242881}])
    await assert.rejects(f.evidence(a.sky,'stage',{assetId:'TOOL-002',phase:'submit_return',...bad},randomUUID()),/5 MiB/);
});
test('transfer submission, recipient acceptance, Admin receipt and damage evidence link to exact assets',async t=>{
  const f=await fixture(t),a=f.actors;
  const send=await stage(f,a.sky,'TOOL-002','submit_transfer');
  const transfer=await f.action(a.sky,'createTransfer',{assetIds:['TOOL-002'],destinationId:f.sites.main,receiverId:a.pau.id,evidenceIds:[send.id]});
  await assert.rejects(f.evidence(a.architect,'stage',{assetId:'TOOL-002',phase:'accept_transfer',targetId:transfer.id,mimeType:'image/png',byteSize:8},randomUUID()));
  const receive=await stage(f,a.pau,'TOOL-002','accept_transfer',transfer.id);
  await f.action(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good',physicallyReceived:true,tested:true}],evidenceIds:[receive.id]});
  assert.equal((await f.snapshot(a.pau)).evidence.filter(e=>e.movement_id===transfer.id).length,2);
  const batch=await f.submit(['TOOL-003']);
  const damage=await stage(f,a.admin,'TOOL-003','inspection',batch.id);
  await f.action(a.admin,'inspectReturn',{id:batch.id,inspections:[{assetId:'TOOL-003',outcome:'damaged',physicallyReceived:true,notes:'Visible crack'}],evidenceIds:[damage.id]});
  const photo=(await f.snapshot(a.sky)).evidence.find(e=>e.id===damage.id);
  assert.equal(photo.equipment_id,f.tools['TOOL-003']);assert.equal(photo.uploader_id,a.admin.id);assert.ok(photo.uploaded_at&&photo.attached_at);
});
test('proposal evidence is private and retained after retirement approval',async t=>{
  const f=await fixture(t),a=f.actors;
  const r=await f.action(a.admin,'proposeRetirement',{assetId:'TOOL-001',disposition:'disposed',reason:'Scrapped after assessment',effectiveDate:'2026-10-01'});
  const photo=await stage(f,a.admin,'TOOL-001','retirement',r.id);
  await f.action(a.admin,'attachRetirementEvidence',{id:r.id,evidenceIds:[photo.id]});
  await f.action(a.admin2,'approveRetirement',{id:r.id});
  assert.equal((await f.snapshot(a.admin)).evidence[0].retirement_id,r.id);
  assert.equal((await f.snapshot(a.sky)).evidence.length,0);
});
test('client validates image signatures and does not mutate custody after an upload failure',async()=>{
  const {validatePhoto,createEvidenceUploader}=await import('../../js/upgrades/movement-evidence/evidence.mjs');
  const file=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});await validatePhoto(file);
  await assert.rejects(validatePhoto(new Blob(['<svg/>'],{type:'image/png'})),/contents/);
  await assert.rejects(validatePhoto(new Blob(['x'],{type:'image/svg+xml'})),/JPEG/);
  const calls=[],api={rpc:async(name,args)=>{calls.push(name);if(args.p_action==='complete')throw Error('Missing object');return {objectName:'private/photo.png'};},
    client:{storage:{from:()=>({upload:async()=>({error:{message:'Network interrupted'}})})}}};
  await assert.rejects(createEvidenceUploader(api).upload(file,{assetId:'A-1',phase:'submit_return'}),/upload failed/);
  assert.ok(calls.every(name=>name==='mcpa_b_evidence_action'));
});
test('photo tickets survive a retry after a successful movement response is lost',async()=>{
  const {createEvidenceUploader}=await import('../../js/upgrades/movement-evidence/evidence.mjs');
  const file=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
  let requests=0,uploads=0;
  const api={rpc:async()=>{requests++;return {objectName:'private/photo.png'};},client:{storage:{from:()=>({upload:async()=>{uploads++;return {};}})}}};
  const uploader=createEvidenceUploader(api),context={assetId:'A-1',phase:'submit_return'};
  const first=await uploader.upload(file,context);const retry=await uploader.upload(file,context);
  assert.deepEqual(retry,first);assert.equal(uploads,1);assert.equal(requests,2);
});
test('failed evidence linking rolls back Admin receipt and generated repair history',async t=>{
  const f=await fixture(t),b=await f.submit(['TOOL-002']);
  await assert.rejects(f.action(f.actors.admin,'inspectReturn',{id:b.id,inspections:[{assetId:'TOOL-002',outcome:'damaged',physicallyReceived:true,notes:'Cracked'}],evidenceIds:[randomUUID()]}),/photo/);
  assert.equal((await f.tool('TOOL-002')).status,'IN_USE');
  assert.equal((await f.snapshot(f.actors.admin)).returns[0].items[0].outcome,'pending');
  assert.equal((await f.db.query("select count(*)::int n from mcpa_movements where kind='repair'")).rows[0].n,0);
});
