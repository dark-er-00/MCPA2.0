const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const X=require('../vendor/sheetjs/xlsx.full.min.js');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,shot,artifactDirectory})=>{
  const output=path.join(__dirname,'../documentation/equipment-import-2026-10-24/screenshots');fs.mkdirSync(output,{recursive:true});
  const screenshot=async name=>{await shot(name,true);const file=path.join(artifactDirectory,name+'.png');if(fs.existsSync(file))fs.copyFileSync(file,path.join(output,name+'.png'));};
  const n=async()=>Number((await f.db.query('select count(*) as n from equipment')).rows[0].n);
  const receiptCount=async()=>Number((await f.db.query('select count(*) as n from mcpa_equipment_imports')).rows[0].n);
  const settled=()=>wait("document.querySelector('#equipmentTableBody tr') && AdminEquipment.loaded && !MCPANavigation.restoring");
  const upload=async(content,name='inventory.csv')=>{
    const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
    await evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],${JSON.stringify(name)},{type:${JSON.stringify(name.endsWith('csv')?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}}));const input=document.querySelector('[data-import-file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const choose=()=>wait("document.querySelector('[data-import-next]')");
  const preview=async()=>{await click('[data-import-next]');await wait("document.querySelector('.import-summary')");};
  const toConfirm=async()=>{await click('[data-import-next]');await wait("document.querySelector('[data-import-ack]')");};
  const confirm=async()=>{await click('[data-import-ack]');await click('[data-import-confirm]');};
  const csv='Tool Name,Category,Manufacturer,Tracking Type,Quantity,Unit,Serial Number,Holder,Acquisition Date\r\nElectric Drill,Power Tools,Bosch,Individual,1,,,Ignored person,2026-10-24\r\nElectric Drill,Power Tools,Bosch,Individual,1,,,Ignored person,2026-10-24\r\nElectric Drill,Power Tools,Bosch,Bulk,5,Pieces,,Ignored person,2026-10-24';
  await go('masterlist');await settled();
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.page-head-actions button')].map(b=>b.textContent.trim())"),['Export','Import Tools','+ Add Item']);
  await screenshot('equipment-import-header');const before=await n();
  await evaluate("document.querySelector('#importEquipmentBtn').focus()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait("document.querySelector('#equipmentImportDialog')?.open");await screenshot('equipment-import-upload');
  // Download the real workbook and inspect its sheets and examples.
  await evaluate("window.__createImportUrl=URL.createObjectURL;URL.createObjectURL=blob=>{window.__importDownload=blob;return __createImportUrl(blob)}");
  await click('[data-import-template]');await wait('window.__importDownload');
  const template=await evaluate("__importDownload.arrayBuffer().then(b=>{let s='';for(const v of new Uint8Array(b))s+=String.fromCharCode(v);return btoa(s)})");
  const wb=X.read(Buffer.from(template,'base64'),{type:'buffer'});assert.deepEqual(wb.SheetNames,['Equipment','Examples - do not import','Instructions']);
  const heads=X.utils.sheet_to_json(wb.Sheets.Equipment,{header:1})[0];assert.ok(!heads.includes('Asset ID'));assert.ok(heads.includes('Tracking Type'));
  await upload('oops','bad.xlsm');assert.match(await evaluate("document.querySelector('[data-import-message]').textContent"),/Macro-enabled/);
  await evaluate("(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(2097153)],'large.csv'));const el=document.querySelector('[data-import-file]');el.files=dt.files;el.dispatchEvent(new Event('change'));})()");assert.match(await evaluate("document.querySelector('[data-import-message]').textContent"),/2 MiB/);
  await upload('A\n"unterminated');await wait("document.querySelector('[data-import-message]').textContent.includes('closing quote')");
  await upload('','empty.csv');assert.match(await evaluate("document.querySelector('[data-import-message]').textContent"),/non-empty/);
  await upload('not zip','bad.xlsx');await wait("document.querySelector('[data-import-message]').textContent.includes('Invalid XLSX')");
  await upload(csv);await choose();assert.equal(await n(),before,'Upload/mapping allocates no records');await screenshot('equipment-import-mapping');
  assert.equal(await evaluate("document.querySelector('[data-map=\"7\"]').value"),'');assert.equal(await evaluate("document.querySelector('[data-map=\"8\"]').value"),'');
  await fill('[data-map="2"]','name');await preview();assert.match(await evaluate("document.querySelector('.import-body').textContent"),/mapped only once/);assert.ok(await evaluate("document.querySelector('[data-import-next]').disabled"));
  await click('[data-import-back]');await fill('[data-map="2"]','brand');await preview();
  assert.match(await evaluate("document.querySelector('.import-summary').textContent"),/3 valid rows/);assert.match(await evaluate("document.querySelector('.import-summary').textContent"),/1 potential duplicates/);
  assert.match(await evaluate("document.querySelector('.import-body').textContent"),/Generated automatically on import/);assert.equal(await n(),before);await screenshot('equipment-import-preview');
  await click('[data-import-close]');assert.equal(await n(),before,'Cancelled preview allocates no records');
  // Untrusted HTML is displayed as text; invalid quantity/formulas are row-specific.
  await click('#importEquipmentBtn');await upload(csv.replaceAll('Electric Drill','<img src=x onerror=alert(1)>').replace('Individual,1','Individual,2'));await choose();await preview();
  assert.ok(await evaluate("!document.querySelector('.import-table img')"));assert.match(await evaluate("document.querySelector('.import-body').textContent"),/Individual quantity must be 1/);assert.ok(await evaluate("document.querySelector('[data-import-next]').disabled"));await screenshot('equipment-import-errors');await click('[data-import-close]');
  // Real XLSX parsing, worksheet selection, and formula rejection through the worker.
  const excel=X.utils.book_new();X.utils.book_append_sheet(excel,X.utils.aoa_to_sheet([['Item Name','Category','Tracking Type'],['Excel Drill','Power Tools','Individual']]),'First');
  X.utils.book_append_sheet(excel,X.utils.aoa_to_sheet([['Item Name','Category','Tracking Type'],['Formula Tool','Hand Tools','Individual']]),'Formula');excel.Sheets.Formula.A2={t:'n',v:2,f:'1+1'};
  await click('#importEquipmentBtn');await upload(X.write(excel,{bookType:'xlsx',type:'buffer'}),'tools.xlsx');await choose();assert.equal(await evaluate("document.querySelector('[data-import-sheet]').options.length"),2);
  await fill('[data-import-sheet]','1');await preview();assert.match(await evaluate("document.querySelector('.import-body').textContent"),/formulas are not supported/);await click('[data-import-close]');
  // An unavailable network preserves the confirmed operation; a retry commits once.
  await click('#importEquipmentBtn');await upload(csv);await choose();await preview();await toConfirm();
  assert.ok(await evaluate("document.querySelector('[data-import-confirm]').disabled"));
  await evaluate("window.__originalImportRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());EquipmentTracking.client().rpc=(name,args)=>name==='mcpa_import_equipment'?Promise.resolve({error:{code:'NETWORK',message:'Offline fixture. Retry this confirmation.'}}):__originalImportRpc(name,args)");
  await confirm();await wait("document.querySelector('[data-import-message]').textContent.includes('Offline fixture')");assert.equal(await n(),before);
  const savedOperation=await evaluate("JSON.parse(sessionStorage.getItem('mcpa.equipment-import.pending.v1.'+MCPAAuth.profile.id)).operation");
  // Commit to PostgreSQL, then lose the response. Repeated clicks stay guarded.
  await evaluate("EquipmentTracking.client().rpc=async(name,args)=>{const value=await __originalImportRpc(name,args);return name==='mcpa_import_equipment'?{error:{code:'NETWORK',message:'Committed response interrupted. Retry safely.'}}:value}");
  await click('[data-import-ack]');await evaluate("document.querySelector('[data-import-confirm]').click();document.querySelector('[data-import-confirm]')?.click()");
  await wait("document.querySelector('[data-import-message]').textContent.includes('Committed response interrupted')");assert.equal(await n(),before+3);assert.equal(await receiptCount(),1);
  await screenshot('equipment-import-interrupted');
  await evaluate('EquipmentTracking.client().rpc=__originalImportRpc');await confirm();
  await wait("document.querySelector('[data-import-results]')");assert.equal(await n(),before+3);assert.equal(await receiptCount(),1);
  const result=(await f.db.query('select result from mcpa_equipment_imports where operation_id=$1',[savedOperation])).rows[0].result;
  assert.ok(result.assets.every(a=>/^T-[A-F0-9]{16}$/.test(a.asset_id)));
  for(const asset of result.assets)assert.ok((await evaluate("document.querySelector('.import-table').textContent")).includes(asset.asset_id));
  assert.ok(await evaluate("!sessionStorage.getItem('mcpa.equipment-import.pending.v1.'+MCPAAuth.profile.id)"));await screenshot('equipment-import-success');
  await evaluate('window.__importDownload=null');await click('[data-import-results]');await wait('window.__importDownload');
  const exported=await evaluate('__importDownload.text()');for(const asset of result.assets)assert.ok(exported.includes(asset.asset_id));assert.ok(exported.includes('Spreadsheet Row'));
  await click('[data-import-return]');await settled();assert.ok(await evaluate(`equipmentList.some(e=>e.assetId===${JSON.stringify(result.assets[0].asset_id)})`));await screenshot('equipment-import-masterlist');
  await go('tool-profile?record='+encodeURIComponent(result.assets[0].asset_id));await wait(`document.querySelector('#profileContent')?.textContent.includes(${JSON.stringify(result.assets[0].asset_id)})`);await go('masterlist');await settled();
  // A new operation intentionally registers the same physical-tool description.
  // Recovery also survives a full reload without retaining source spreadsheet data.
  await click('#importEquipmentBtn');await upload(csv);await choose();await preview();await toConfirm();
  await evaluate("window.__originalImportRpc=EquipmentTracking.client().rpc.bind(EquipmentTracking.client());EquipmentTracking.client().rpc=async(name,args)=>{const value=await __originalImportRpc(name,args);return name==='mcpa_import_equipment'?{error:{code:'NETWORK',message:'Reload recovery fixture'}}:value}");await confirm();
  await wait("document.querySelector('[data-import-message]').textContent.includes('Reload recovery fixture')");assert.equal(await n(),before+6);
  await command('Page.reload');await settled();await click('#importEquipmentBtn');await click('[data-import-recover]');await wait("document.querySelector('[data-import-results]')");assert.equal(await n(),before+6);await click('[data-import-return]');
  // Preserve filters and tally through the normal loader; dashboard agrees.
  await fill('#searchEquipment','Electric Drill');await fill('#typeFilter','Power Tools');await evaluate('initMasterlist()');
  assert.equal(await evaluate("document.querySelector('#searchEquipment').value"),'Electric Drill');assert.equal(await evaluate("document.querySelector('#typeFilter').value"),'Power Tools');
  const equipmentCounts=await evaluate("[...document.querySelectorAll('[data-equipment-count]')].map(e=>Number(e.textContent))");
  await go('dashboard');await wait("document.querySelector('.overview-kpis .num')");assert.deepEqual(await evaluate("[...document.querySelectorAll('.overview-kpis .num')].slice(0,3).map(e=>Number(e.textContent))"),equipmentCounts);
  await go('masterlist');await settled();
  // One batched visual pass across desktop, tablet, mobile and both themes.
  for(const dark of [false,true])for(const width of [375,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});await evaluate(`applyTheme(${dark},false)`);
    await click('#importEquipmentBtn');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    assert.ok(await evaluate("(()=>{const r=document.querySelector('#equipmentImportDialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
    await screenshot(`equipment-import-upload-${width}-${dark?'dark':'light'}`);
    await upload(csv);await choose();await screenshot(`equipment-import-mapping-${width}-${dark?'dark':'light'}`);await preview();
    assert.ok(await evaluate("document.querySelector('.import-body').scrollWidth<=document.querySelector('.import-body').clientWidth+1"));await screenshot(`equipment-import-preview-${width}-${dark?'dark':'light'}`);
    await click('[data-import-close]');
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('applyTheme(false,false)');
  await logout();for(const role of ['handler','sky','architect']){
    await login(role);await wait(`MCPAAuth.profile?.role===${JSON.stringify(role==='handler'?'tool_handler':role==='sky'?'engineer':'architect')} && document.querySelector('#screen-dashboard.active') && !MCPANavigation.restoring`);await go('masterlist');assert.ok(await evaluate("!document.querySelector('#importEquipmentBtn')"));await logout();
  }
  console.log('PASS equipment import: real CSV/XLSX worker, template, mapping, validation, XSS, atomic registration, actual IDs/results, duplicate clicks, network retry, reload recovery, filters/tallies, roles, and 6 responsive/theme combinations');
};
