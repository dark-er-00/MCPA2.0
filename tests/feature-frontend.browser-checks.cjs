/* Runs against auth.browser.cjs's isolated database and blocked external network. */
const assert = require('node:assert/strict');
exports.verify = async ({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,shot}) => {
  const viewport = width => command('Emulation.setDeviceMetricsOverride',{width,height:width < 600 ? 852 : 1000,deviceScaleFactor:1,mobile:width < 600});
  let active = 'admin';
  for (const account of ['admin','sky','architect','secretary','handler']) {
    if (active !== account) { await logout(); await login(account); active=account; await wait('MCPAAuth.profile'); }
    await go('settings'); await wait("document.querySelector('#account-theme')");
    for (const width of [1440,393]) {
      await viewport(width);
      const dark = await evaluate("document.body.classList.contains('dark')");
      await click('#account-theme'); await wait("!themeTransitionRunning && document.body.classList.contains('dark') === " + !dark);
      assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),dark ? 'light' : 'dark');
      assert.equal(await evaluate("document.querySelector('#account-theme').getAttribute('aria-pressed')"),String(!dark));
      await click('.theme-toggle'); await wait("!themeTransitionRunning && document.body.classList.contains('dark') === " + dark);
      assert.equal(await evaluate("document.querySelector('#account-theme').getAttribute('aria-pressed')"),String(dark));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'My Account fits '+account+' at '+width);
    }
  }
  await logout(); await login('admin'); await wait("MCPAAuth.profile?.role === 'admin'"); await viewport(1440);
  // Distinct relational names make project/holder matches unambiguous in this fixture.
  await fixture.db.query("update equipment set name='Cordless fixture drill',brand='FixtureMakita',serial_number='SERIAL-X-778',site_id=$1,current_holder_id=$2,status='IN_USE' where asset_id='TOOL-001'",[fixture.sites.casa,fixture.actors.sky.id]);
  await go('masterlist'); await wait("document.querySelector('#equipmentTableBody')?.textContent.includes('Cordless fixture drill')");
  for (const query of ['tool-001','CORDLESS','fixturemak','serial-x','casa buena','ENGR SKY']) {
    await fill('#searchEquipment',query);
    assert.ok(await evaluate("document.querySelector('#equipmentTableBody').textContent.includes('TOOL-001')"),'Search by '+query);
  }
  await fill('#searchEquipment','serial-x'); await fill('#siteFilter','Main Warehouse');
  assert.equal(await evaluate("document.querySelector('#equipmentTableBody').children.length"),0,'Search continues to intersect existing filters');
  await fill('#siteFilter','');await fill('#searchEquipment','no fixture match');
  assert.equal(await evaluate("document.querySelector('#emptyState').classList.contains('hidden')"),false);await fill('#searchEquipment','');
  const selectFile = async kind => evaluate(`(async()=>{
    let file;
    if(${JSON.stringify(kind)}==='valid') {const canvas=document.createElement('canvas');canvas.width=canvas.height=4;const ctx=canvas.getContext('2d');ctx.fillStyle='#a57300';ctx.fillRect(0,0,4,4);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));file=new File([blob],'fixture-photo.png',{type:'image/png'});}
    else if(${JSON.stringify(kind)}==='large') file=new File([new Uint8Array(5*1024*1024+1)],'oversize.png',{type:'image/png'});
    else if(${JSON.stringify(kind)}==='malformed') file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'broken.png',{type:'image/png'});
    else file=new File(['fixture text'],'not-a-photo.svg',{type:'image/svg+xml'});
    const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#equipmentPhoto');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await evaluate("editTool('TOOL-001')");await selectFile('invalid');await wait("document.querySelector('#equipmentPhotoStatus').textContent.includes('JPEG, PNG, or WebP')");
  await selectFile('large');await wait("document.querySelector('#equipmentPhotoStatus').textContent.includes('5 MB')");
  await selectFile('malformed');await wait("document.querySelector('#equipmentPhotoStatus').textContent.includes('could not be opened')");
  assert.equal(await evaluate('equipmentPhotoState.file'),null,'Undecodable photos cannot be submitted');
  const beforePhoto = (await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url;
  await selectFile('valid');await wait("equipmentPhotoState.file && document.querySelector('#equipmentPhotoPreview img')?.naturalWidth === 4");
  await evaluate('window.__failUpload=true');await submit('#equipmentForm');await wait("document.querySelector('#equipmentFormFeedback').textContent.includes('Photo upload failed')");
  assert.equal((await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url,beforePhoto,'Failed upload never changes the item');
  assert.ok(await evaluate("equipmentPhotoState.file && document.querySelector('#equipmentModal').style.display === 'flex' && !document.querySelector('#equipmentForm button[type=submit]').disabled"));
  await evaluate('window.__failUpload=false');await submit('#equipmentForm');await wait("document.querySelector('#equipmentModal').style.display === 'none'");
  const savedPhoto = (await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url;
  assert.match(savedPhoto,/^storage:\/\/equipment-photos\/TOOL-001\/[0-9a-f-]+\.png$/);
  await command('Page.reload');await wait("document.querySelector('#equipmentTableBody [data-equipment-photo] img')?.naturalWidth === 4");
  assert.equal(await evaluate("equipmentList.find(item=>item.assetId==='TOOL-001').image_url"),savedPhoto,'Durable reference survives reload');
  await evaluate("showToolProfile('TOOL-001')");await wait("document.querySelector('.equipment-profile-photo img')?.naturalWidth === 4");
  await evaluate("editTool('TOOL-001')");await fill('#identifyingDetails','Metadata edit preserves photo');await submit('#equipmentForm');await wait("document.querySelector('#equipmentModal').style.display === 'none'");
  assert.equal((await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url,savedPhoto);
  await wait("document.querySelector('#profileContent').textContent.includes('Metadata edit preserves photo')");
  await evaluate("editTool('TOOL-001')");await selectFile('valid');await wait('equipmentPhotoState.file && !equipmentPhotoState.validating');
  await click('#clearEquipmentPhoto');assert.equal(await evaluate('equipmentPhotoState.file'),null);await click('#cancelEquipmentModal');
  // New photo upload succeeds, then metadata fails: retry must reuse that object.
  await evaluate("editTool('TOOL-001')");await selectFile('valid');await wait('equipmentPhotoState.file && !equipmentPhotoState.validating');
  await evaluate(`window.__realEquipmentClient=EquipmentTracking.client;EquipmentTracking.client=()=>{const db=__realEquipmentClient();return {...db,from(table){const q=db.from(table);if(table==='equipment')q.update=()=>({eq(){return this},select(){return this},single:async()=>({error:{message:'Isolated metadata failure'}})});return q;}};}`);
  await submit('#equipmentForm');await wait("document.querySelector('#equipmentFormFeedback').textContent.includes('kept')");
  const staged = await evaluate('equipmentPhotoState.staged.reference');assert.notEqual(staged,savedPhoto);
  assert.equal((await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url,savedPhoto);
  const uploadCount = Number((await fixture.db.query("select count(*) as count from storage.objects where bucket_id='equipment-photos'")).rows[0].count);
  await evaluate('EquipmentTracking.client=window.__realEquipmentClient');await submit('#equipmentForm');await wait("document.querySelector('#equipmentModal').style.display === 'none'");
  assert.equal((await fixture.db.query("select image_url from equipment where asset_id='TOOL-001'")).rows[0].image_url,staged);
  assert.equal(Number((await fixture.db.query("select count(*) as count from storage.objects where bucket_id='equipment-photos'")).rows[0].count),uploadCount,'Metadata retry does not upload another object');
  assert.equal(Number((await fixture.db.query("select count(*) as count from storage.objects where bucket_id='equipment-photos' and 'storage://equipment-photos/'||name=$1",[savedPhoto])).rows[0].count),1,'Previous stored image is retained');
  // New inventory items and their photos are saved together, with their own IDs.
  await evaluate("showMasterlistView('masterlist')");await click('#openAddEquipment');
  await fill('#equipmentType','New photo fixture equipment');await fill('#equipmentCategory','Power Tools');await fill('#trackingType','Individual');
  await selectFile('valid');await wait('equipmentPhotoState.file && !equipmentPhotoState.validating');await submit('#equipmentForm');await wait("document.querySelector('#equipmentModal').style.display === 'none'");
  const created = (await fixture.db.query("select id,asset_id,image_url from equipment where name='New photo fixture equipment'")).rows;
  assert.equal(created.length,1);assert.match(created[0].asset_id,/^T-[0-9A-F]{16}$/);assert.ok(created[0].id);assert.ok(created[0].image_url.startsWith('storage://equipment-photos/'+created[0].asset_id+'/'));
  await evaluate("showToolProfile('TOOL-001')");
  await viewport(393);await evaluate("editTool('TOOL-001')");await wait("document.querySelector('#equipmentPhotoPreview img')?.naturalWidth === 4");
  await shot('feature-equipment-photo-mobile',true);assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));await click('#cancelEquipmentModal');
  await viewport(1440);await shot('feature-equipment-photo-desktop',true);
  await logout();await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await go('masterlist');
  await wait("document.querySelector('#overview-results [data-equipment-photo] img')?.naturalWidth === 4");
  const denied = await evaluate("EquipmentPhotos.prepare(new File(['x'],'photo.png',{type:'image/png'}),'TOOL-001').then(()=>false,error=>error.message.includes('Admin'))");assert.equal(denied,true);
  console.log('PASS All-role desktop/mobile account theme; six relational search fields and existing filters; validated photo preview, upload failure, persistence, metadata preservation, safe replacement retry, retained prior object and authorized Engineer display');
};
