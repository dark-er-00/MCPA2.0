// Local PostgreSQL and file bytes only. External HTTPS remains blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,shot,base,artifactDirectory})=>{
 let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;};
 const viewport=async(width,height=width<800?852:1000)=>{await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');};
 const selectFile=()=>evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;const c=canvas.getContext('2d');c.fillStyle='#66532b';c.fillRect(0,0,240,160);c.fillStyle='#efc32f';c.fillRect(30,65,180,30);c.fillStyle='#1b211c';c.fillRect(160,95,25,50);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'isolated-equipment.png',{type:'image/png'}));const input=document.querySelector('#equipmentPhoto');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const openNew=async name=>{await go('masterlist');await wait('document.querySelector("#openAddEquipment")');await click('#openAddEquipment');await fill('#equipmentType',name);await fill('#equipmentCategory','Power Tools');await fill('#trackingType','Individual');};
 // The actual missing-column state: the optional field is absent in PostgreSQL.
 await viewport(1440);await openNew('No photo compatibility fixture');
 await evaluate('document.querySelector("#equipmentForm").requestSubmit();document.querySelector("#equipmentForm").requestSubmit()');
 await wait('document.querySelector("#equipmentModal").style.display==="none"');
 const plain=(await f.db.query("select * from equipment where name='No photo compatibility fixture'")).rows;
 ok(plain.length===1,'No-photo creation and duplicate click create exactly one record');
 ok(plain[0].site_id===f.sites.office&&!plain[0].current_holder_id&&plain[0].quantity===1&&plain[0].status==='AVAILABLE','Office, custody, quantity and status preserved');
 await wait('equipmentList.some(i=>i.assetId==='+JSON.stringify(plain[0].asset_id)+')');
 await shot('equipment-create-success',true);
 await openNew('Photo compatibility fixture');await selectFile();await wait('equipmentPhotoState.file&&!equipmentPhotoState.validating');
 await submit('#equipmentForm');await wait('document.querySelector("#equipmentFormFeedback").textContent.includes("photo setup is missing")');
 ok((await f.db.query("select count(*)::int n from equipment where name='Photo compatibility fixture'")).rows[0].n===0,'Missing schema never creates a partial record');
 ok((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n===0,'Schema checked before upload');
 await evaluate('document.querySelector(".equipment-form-body").scrollTop=10000');await shot('equipment-missing-schema-retry',true);
 // Manual SQL is exercised only on this isolated fixture, never production.
 await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610210001_equipment_photo_compatibility.sql'),'utf8'));
 await evaluate('window.__failUpload=true');await submit('#equipmentForm');await wait('document.querySelector("#equipmentFormFeedback").textContent.includes("Photo upload failed")');
 await shot('equipment-upload-failure-retry',true);
 ok(await evaluate('equipmentPhotoState.file&&document.querySelector("#equipmentType").value==="Photo compatibility fixture"'),'Failure preserves file and fields');
 await evaluate('window.__failUpload=false');await submit('#equipmentForm');await wait('document.querySelector("#equipmentModal").style.display==="none"');
 const photo=(await f.db.query("select * from equipment where name='Photo compatibility fixture'")).rows[0];
 ok(photo.site_id===f.sites.office&&photo.image_url.startsWith('storage://equipment-photos/'+photo.asset_id+'/'),'Photo linked to correct Office record');
 await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:[photo.asset_id],destination:'Casa Buena',purpose:'Isolated timeline contrast verification'},p_operation_id:require('node:crypto').randomUUID()});
 await command('Page.reload');await wait('typeof equipmentList!=="undefined"&&equipmentList.some(i=>i.assetId==='+JSON.stringify(photo.asset_id)+')');
 await evaluate('window.scrollTo(0,500)');await evaluate('showToolProfile('+JSON.stringify(photo.asset_id)+')');
 await wait('document.querySelector(".equipment-profile-photo img")?.naturalWidth===240&&!MCPANavigation.restoring');
 await wait('document.querySelector(".timeline .tl-item")');
 ok(await evaluate('document.querySelector("#profileContent h1").getBoundingClientRect().top>=document.querySelector("#topbar").getBoundingClientRect().bottom'),'Fresh detail navigation clears sticky-header overlap');
 // A local QR provider replaces only the external service in this test server.
 // Decode actual pixels at the displayed size; no live equipment is transmitted.
 await wait('document.querySelector("#qrContainerProfile img")?.naturalWidth===120');
 ok(await evaluate('new URL(document.querySelector("#qrContainerProfile img").src).searchParams.get("data")==='+JSON.stringify(photo.asset_id)),'QR encodes exact Asset ID');
 for(const width of [1440,393])for(const dark of [true,false]){
  await viewport(width);await evaluate('applyTheme('+dark+',false)');
  ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Details fit viewport '+width);
  const colors=await evaluate(`(()=>{const style=e=>getComputedStyle(e),cards=[...document.querySelectorAll('#profileContent .card')];return {cards:cards.map(c=>style(c).backgroundColor),qr:style(document.querySelector('#qrContainerProfile')).backgroundColor,timeline:style(document.querySelector('.timeline')).color,text:style(document.querySelector('#profileContent')).color,quiet:style(document.querySelector('#qrContainerProfile')).paddingTop};})()`);
  ok(colors.cards.length===3&&colors.cards.every(c=>c===(dark?'rgb(23, 23, 21)':'rgb(255, 255, 255)')),'All detail card surfaces match '+(dark?'dark':'light'));
  ok(colors.qr==='rgb(255, 255, 255)'&&colors.quiet==='12px','QR white quiet zone preserved');
  ok(colors.timeline===colors.text,'Movement history inherits readable theme foreground');
  ok(await evaluate('getComputedStyle(document.querySelector(".tl-item"),"::before").borderTopColor!=="rgba(0, 0, 0, 0)"'),'Gold timeline indicators preserved');
  const qrPixels=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,120,120);ctx.drawImage(document.querySelector('#qrContainerProfile img'),12,12,96,96);return Array.from(ctx.getImageData(0,0,120,120).data);})()`);
  ok(require('jsqr')(Uint8ClampedArray.from(qrPixels),120,120)?.data===photo.asset_id,'Displayed QR pixels decode in both themes');
  await shot('equipment-details-'+width+'-'+(dark?'dark':'light'),false);
 }
 await viewport(1440);await evaluate('showToolProfile('+JSON.stringify(plain[0].asset_id)+')');await wait('document.querySelector(".equipment-profile-photo figcaption")');
 await shot('equipment-details-no-photo',true);
 ok(await evaluate('document.querySelector(".equipment-profile-photo figcaption").textContent.includes("No item photo")'),'Missing photo has explicit fallback');
 // A broken legacy image falls back to its equipment symbol without hiding data.
 await evaluate('equipmentList.find(i=>i.assetId==='+JSON.stringify(plain[0].asset_id)+').image_url="/__missing_fixture_photo.png";showToolProfile('+JSON.stringify(plain[0].asset_id)+',true)');
 await wait('!document.querySelector(".equipment-profile-photo img")');
 ok(await evaluate('!!document.querySelector(".equipment-profile-photo .equipment-symbol")'),'Broken image retains symbol');
 // A metadata failure keeps a single staged object; Cancel removes that object
 // through the restrictive policy while preserving the current saved photo.
 await evaluate('editTool('+JSON.stringify(photo.asset_id)+')');await selectFile();await wait('equipmentPhotoState.file&&!equipmentPhotoState.validating');
 const objectsBefore=(await f.db.query('select count(*)::int n from storage.objects')).rows[0].n;
 await evaluate(`window.__realClient=EquipmentTracking.client;EquipmentTracking.client=()=>{const db=__realClient();return {...db,from(table){const q=db.from(table);if(table==='equipment')q.update=()=>({eq(){return this},select(){return this},single:async()=>({error:{message:'Isolated metadata failure'}})});return q;}};}`);
 await submit('#equipmentForm');await wait('document.querySelector("#equipmentFormFeedback").textContent.includes("kept")');
 ok((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n===objectsBefore+1,'Metadata failure retains just one pending upload');
 await evaluate('EquipmentTracking.client=__realClient');await click('#cancelEquipmentModal');await wait('!document.querySelector("#equipmentModal").open');
 ok((await f.db.query('select count(*)::int n from storage.objects')).rows[0].n===objectsBefore,'Cancel cleans unlinked upload');
 ok((await f.db.query('select image_url from equipment where id=$1',[photo.id])).rows[0].image_url===photo.image_url,'Cancel never deletes the committed photo');
 await openNew('Responsive modal fixture');
 await viewport(1440);await shot('equipment-add-desktop',true);
 for(const width of [320,375,390,393,430,768]){
  await viewport(width);await evaluate('applyTheme(true,false)');
  ok(await evaluate(`(()=>{const d=document.querySelector('#equipmentModal'),b=d.querySelector('.equipment-form-body'),r=d.getBoundingClientRect(),buttons=[d.querySelector('#closeEquipmentModal'),d.querySelector('#modalSubmitBtn'),d.querySelector('#cancelEquipmentModal')];return d.open&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1&&buttons.every(e=>{const q=e.getBoundingClientRect();return q.top>=r.top&&q.bottom<=r.bottom&&q.height>=44})&&getComputedStyle(document.documentElement).overflow==='hidden'&&b.scrollHeight>b.clientHeight;})()`),'Single scrolling body and reachable actions at '+width);
  await evaluate('document.querySelector(".equipment-form-body").scrollTop=100000');
  ok(await evaluate('(()=>{const b=document.querySelector(".equipment-form-body");return b.scrollTop+b.clientHeight>=b.scrollHeight-2})()'),'Bottom reachable at '+width);
  await shot('equipment-add-'+width,true);
 }
 // Approximate the reduced visual viewport while a mobile keyboard is open.
 await viewport(393,420);await fill('#equipmentModel','Keyboard remains usable');
 ok(await evaluate('document.querySelector("#modalSubmitBtn").getBoundingClientRect().bottom<=innerHeight'),'Save reachable with keyboard-height viewport');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await wait('!document.querySelector("#equipmentModal").open');
 ok(await evaluate('!document.documentElement.classList.contains("equipment-modal-open")'),'Escape releases modal and background lock');
 const favicon=await evaluate('fetch(document.querySelector("link[rel=icon]").href).then(r=>r.status)');ok(favicon===200,'Explicit favicon resolves');
 fs.writeFileSync(path.join(artifactDirectory,'equipment-checks.json'),JSON.stringify({passed:checks,failed:0,widths:[320,375,390,393,430,768],qrProvider:'local QR substitute; displayed pixels decoded; real external provider availability unverified'},null,2));
 console.log('PASS '+checks+' equipment browser assertions; screenshot directory '+artifactDirectory);
};
