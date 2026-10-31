(function() {
  'use strict';
  const C=window.EquipmentImportCore, scriptUrl=document.currentScript.src;
  const workerUrl=new URL('equipment-import-worker.js',scriptUrl);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const recoveryKey='mcpa.equipment-import.pending.v1';
  function download(content,name,type='text/csv;charset=utf-8'){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  let library;
  function xlsx(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(!library)library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('../vendor/sheetjs/xlsx.full.min.js',scriptUrl);s.onload=()=>resolve(window.XLSX);s.onerror=()=>{library=null;s.remove();reject(Error('Template library could not load. Check your connection and retry.'));};document.head.append(s);});
    return library;
  }
  async function template(){
    const X=await xlsx();
    if(window.MCPAIndividualImport){const book=window.MCPAIndividualImport.templateWorkbook(X);download(X.write(book,{bookType:'xlsx',type:'array'}),'MCPA-equipment-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');return;}
    const book=X.utils.book_new(),head=Object.values(C.fields);
    X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([head]),'Equipment');
    X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([head,
      ['Example Drill — replace before importing','Power Tools','Bosch','','','Good','Individual',1,'','Example only'],
      ['Example Shovels — replace before importing','Hand Tools','','','','Fair','Bulk',5,'Pieces','Example only']]),'Examples - do not import');
    X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([
      ['MCPA equipment import instructions'],
      ['Enter real inventory in Equipment. Examples are illustrative and must not be imported.'],
      ['Required columns: Item Name, Category, Tracking Type. No Asset ID column.'],
      ['Individual: quantity 1 (or blank). One spreadsheet row per physical asset. Identical names and brands are allowed.'],
      ['Bulk: positive whole Quantity; optional Unit; one equipment record for the group.'],
      ['Optional: Brand, Model, Serial Number, Condition (default Good), Identifying Details.'],
      ['Categories: '+C.categories.join('; ')],['Conditions: '+C.conditions.join('; ')],['Units: '+C.units.join('; ')],
      ['Use text cells for identifiers, including serial numbers with leading zeros. Do not use formulas.'],
      ['Dates, photos, Asset IDs, status, holder, project and movement columns are not imported. Acquisition dates are not supported by the manual form.'],
      ['No date formatting is needed: date columns are excluded. Use approved transfer/custody workflows after registration.'],
      ['Limit: 2 MiB file; 500 data rows; 50 columns. Select the Equipment worksheet in the importer.'],
      ['All rows must be valid. One confirmed batch is atomic; errors import nothing. A new operation can intentionally register another set.']
    ]),'Instructions');
    book.Sheets.Instructions['!cols']=[{wch:125}];
    const bytes=X.write(book,{bookType:'xlsx',type:'array'});download(bytes,'MCPA-equipment-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function attach(owner){
    let C=window.MCPAIndividualImport||window.EquipmentImportCore,controller=null,legacy=false,recoveryError='';
    const button=document.getElementById('importEquipmentBtn');
    if(!button||window.MCPAAuth?.isDemo||window.MCPAAuth?.profile?.role!=='admin')return;
    button.hidden=false;
    let dialog=null,worker=null,busy=false,parsing=false,revision=0,step=1,sheets=[],sheet=null,mapping={},preview=null,result=null,pending=null,actor=null;
    const pendingKey=()=>recoveryKey+'.'+actor.id;
    function message(text){const el=dialog?.querySelector('[data-import-message]');if(el)el.textContent=text;}
    function restorePending(){
      const raw=sessionStorage.getItem(pendingKey());if(!raw)return;
      try{const saved=JSON.parse(raw);if(saved?.actor!==actor.id||!/^[-a-f0-9]{36}$/i.test(saved.operation)||!/^[a-f0-9]{64}$/.test(saved.digest))throw Error();pending=saved;}
      catch{throw Error('Import recovery data could not be read. Preserve this tab and contact Admin before another import.');}
    }
    function clearPending(){pending=null;sessionStorage.removeItem(pendingKey());}
    function active(){return dialog?.isConnected&&!owner.disposed&&window.MCPAAuth.requireLive().id===actor.id;}
    function operationContext(){
      const opened=dialog,source=controller,version=revision;
      return {controller:source,current(){try{return dialog===opened&&controller===source&&revision===version&&active();}catch{return false;}}};
    }
    function close(){
      if(busy)return;
      ++revision;controller?.dispose();controller=null;worker?.terminate();worker=null;parsing=false;dialog?.close();dialog?.remove();dialog=null;document.documentElement.classList.remove('equipment-modal-open');button.focus();
    }
    function render(){
      if(!dialog)return;
      const titles=['Upload Spreadsheet','Match Columns','Validate and Preview','Confirm Import'];
      dialog.innerHTML=`<header class="import-header"><div><h2 class="display" id="equipment-import-title">Import Tools</h2><p>${result?'Import complete':`Step ${step} of 4 · ${titles[step-1]}`}</p></div><button type="button" class="btn btn-secondary" data-import-close ${busy?'disabled':''}>${result?'Close':'Cancel'}</button></header>
        <ol class="import-steps" aria-label="Import progress">${titles.map((t,i)=>`<li ${!result&&step===i+1?'aria-current="step"':''}>${i+1}. ${t}</li>`).join('')}</ol>
        <div class="import-body">${content()}<p class="import-message" role="status" aria-live="polite" data-import-message></p></div>
        <footer class="import-footer">${footer()}</footer>`;
      dialog.querySelector('[data-import-close]').onclick=close;
      dialog.querySelector('[data-import-back]')?.addEventListener('click',()=>{step--;render();});
      dialog.querySelector('[data-import-next]')?.addEventListener('click',()=>{
        if(step===2){mapping=Object.fromEntries([...dialog.querySelectorAll('[data-map]')].map(s=>[s.dataset.map,s.value]));preview=C.validate(sheet,mapping,typeof equipmentList==='undefined'?[]:equipmentList);}
        step++;render();
      });
      dialog.querySelector('[data-import-file]')?.addEventListener('change',e=>readFile(e.target.files[0]));
      const drop=dialog.querySelector('[data-import-drop]');
      drop?.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-dragging');});drop?.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
      drop?.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');if(e.dataTransfer.files.length!==1)message('Choose one spreadsheet at a time.');else readFile(e.dataTransfer.files[0]);});
      dialog.querySelector('[data-import-template]')?.addEventListener('click',()=>template().catch(e=>message(e.message)));
      dialog.querySelector('[data-import-sheet]')?.addEventListener('change',e=>{sheet=sheets[Number(e.target.value)];mapping=C.autoMap(sheet.headers);render();});
      dialog.querySelector('[data-import-confirm]')?.addEventListener('click',confirm);
      dialog.querySelector('[data-import-recover]')?.addEventListener('click',()=>{const opened=dialog,version=revision;void recover().catch(e=>{if(dialog===opened&&revision===version)message(e.message);});});
      dialog.querySelector('[data-import-abandon]')?.addEventListener('click',abandon);
      dialog.querySelector('[data-import-results]')?.addEventListener('click',()=>download(!legacy?C.resultCsv(result):C.csvExport([
        ['Import Operation','Spreadsheet Row','Database UUID','Generated Asset ID','Item Name','Quantity','Outcome'],
        ...result.assets.map(a=>[result.operation_id,a.source_row,a.id,a.asset_id,a.name,a.quantity,'Created'])
      ]),'MCPA-import-results.csv'));
      dialog.querySelector('[data-import-return]')?.addEventListener('click',close);
      dialog.querySelector('[data-import-ack]')?.addEventListener('change',e=>{dialog.querySelector('[data-import-confirm]').disabled=!e.target.checked;});
      dialog.querySelector('.import-body').scrollTop=0;
    }
    function content(){
      if(result)return `<h3>${result.created} equipment records created</h3><p>All rows were registered. Rejected or skipped rows: ${result.rejected}. New stock starts Available at Office, with no holder.</p><p class="import-reference">Operation: ${esc(result.operation_id)}</p>${resultsTable()}<p data-import-refresh role="status"></p>`;
      if(step===1)return `<p>Register new inventory from a spreadsheet. Asset IDs are generated when you confirm. Repeated equipment names are allowed.</p>
        <label class="import-drop" data-import-drop>Choose a spreadsheet or drop it here<input type="file" data-import-file accept=".csv,.xlsx" aria-describedby="import-file-help" ${parsing?'disabled':''}></label>
        <p id="import-file-help">UTF-8 CSV or XLSX · 2 MiB maximum · 500 data rows · 50 columns. Export Google Sheets as CSV or XLSX.</p>
        <button type="button" class="btn btn-secondary" data-import-template>Download Equipment Template</button><p>Only new equipment metadata is imported. Asset IDs, dates, photos, holders, projects, statuses and movements are excluded.</p>
        ${pending?'<p>A previous confirmation needs a receipt check. Its operation ID will be reused if you select the same rows.</p><button type="button" class="btn btn-secondary" data-import-recover>Check Previous Import</button>':''}`;
      if(step===2)return `<p>Choose the worksheet and match its headings. Unmapped columns are ignored. Custody and deployment fields cannot be mapped.</p>
        <label class="import-sheet">Worksheet<select data-import-sheet>${sheets.map((s,i)=>`<option value="${i}" ${s===sheet?'selected':''}>${esc(s.name)} (${s.rows.length} rows)</option>`).join('')}</select></label>
        <div class="import-mapping">${sheet.headers.map((h,i)=>`<label>${esc(h)}<select data-map="${i}" aria-label="Map ${esc(h)}"><option value="">Ignore column</option>${Object.entries(C.fields).map(([k,label])=>`<option value="${k}" ${mapping[i]===k?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}</div>
        <p>Required: Item Name, Category, Tracking Type and observed Condition. Quantity defaults to 1. Unit is optional and applies only to Bulk rows.</p>`;
      if(step===3)return `<div class="import-summary" aria-label="Validation summary"><span><b>${preview.valid}</b> valid rows</span><span><b>${preview.invalid}</b> invalid rows</span><span><b>${preview.duplicates}</b> potential duplicates</span><span><b>${preview.records}</b> resulting records${preview.invalid?' (fix errors first)':''}</span></div>
        <p>${sheet.rows.length} spreadsheet rows → ${preview.records} equipment records. Individual quantities expand to separate physical Asset IDs; Bulk quantities stay grouped.</p><p>Asset IDs: Generated automatically on import</p>
        ${preview.errors.map(e=>`<p class="import-error">${esc(e)}</p>`).join('')}${previewTable()}<p>All rows must be valid. Review warnings for repeated rows or serial numbers. Identical names are permitted and are never merged.</p>`;
      return `<h3>Create ${preview.records} equipment records?</h3><p>All ${sheet.rows.length} rows from worksheet “${esc(sheet.name)}” will be registered as Available at Office, without holders. No rows will be skipped. If any row fails, the entire batch rolls back.</p>
        <p>${preview.duplicates} rows have potential duplicate warnings. Check that repeated rows represent separate physical assets.</p>
        <label class="import-ack"><input type="checkbox" data-import-ack ${busy?'disabled':''}> I reviewed these rows and confirm registration of ${preview.records} equipment records.</label>
        <p>If the response is interrupted, retry this confirmation. It uses the same operation ID and cannot create the same batch twice. Keep this window open until the result arrives.</p>`;
    }
    function previewTable(){return `<div class="import-table" tabindex="0" role="region" aria-label="Equipment preview; scroll for all columns"><table><thead><tr><th>Row</th><th>Item</th><th>Category / tracking</th><th>Qty</th><th>Validation</th></tr></thead><tbody>${preview.rows.map(r=>`<tr><td>${r.data.source_row}</td><td>${esc(r.data.name)}</td><td>${esc(r.data.category)}<br>${esc(r.data.tracking_type)}</td><td>${esc(r.data.quantity)}</td><td>${r.errors.length?'<strong class="import-error">Invalid</strong>':r.warnings.length?'<strong>Review warning</strong>':'Valid'}${[...r.errors,...r.warnings].map(e=>`<p>${esc(e)}</p>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;}
    function resultsTable(){return `<div class="import-table" tabindex="0" role="region" aria-label="Generated equipment IDs"><table><thead><tr><th>Row</th><th>Generated Asset ID</th><th>Item Name</th></tr></thead><tbody>${result.assets.map(a=>`<tr><td>${a.source_row}</td><td class="mono">${esc(a.asset_id)}</td><td>${esc(a.name)}</td></tr>`).join('')}</tbody></table></div>`;}
    function footer(){
      if(result)return '<button type="button" class="btn btn-secondary" data-import-results>Download Import Results</button><button type="button" class="btn btn-accent" data-import-return>Return to Equipment Tracking</button>';
      return `${!legacy&&pending?.rejected&&!pending.uncertain?`<button type="button" class="btn btn-secondary" data-import-abandon ${busy?'disabled':''}>Start a corrected import</button>`:''}${step>1?`<button type="button" class="btn btn-secondary" data-import-back ${busy||pending&&step===4?'disabled':''}>Back</button>`:''}${step>1&&step<4?`<button type="button" class="btn btn-accent" data-import-next ${step===3&&(preview.errors.length||preview.invalid)?'disabled':''}>${step===2?'Validate and Preview':'Continue to Confirmation'}</button>`:''}${step===4?`<button type="button" class="btn btn-accent" data-import-confirm disabled>${busy?'Importing…':pending?'Retry Confirmed Import':'Confirm Import'}</button>`:''}`;
    }
    async function readFile(file){
      if(recoveryError){message(recoveryError);return;}
      if(!file||parsing)return;
      const extension=file.name.split('.').pop().toLowerCase();
      if(!['csv','xlsx'].includes(extension)){message('Choose a .csv or .xlsx file. Macro-enabled files are not supported.');return;}
      if(!file.size||file.size>C.MAX_BYTES){message('Choose a non-empty spreadsheet no larger than 2 MiB.');return;}
      const version=++revision;parsing=true;render();message('Reading spreadsheet…');
      try{
        const buffer=await file.arrayBuffer();if(!active()||version!==revision)return;
        const parsed=await new Promise((resolve,reject)=>{
          const parser=worker=new Worker(legacy?workerUrl:new URL('upgrades/individual-import-expansion/worker.js',scriptUrl));const timer=setTimeout(()=>{parser.terminate();reject(Error('Spreadsheet parsing exceeded 10 seconds. Simplify the file and retry.'));},10000);
          parser.onmessage=e=>{clearTimeout(timer);parser.terminate();if(worker===parser)worker=null;e.data.error?reject(Error(e.data.error)):resolve(e.data.sheets);};
          parser.onerror=()=>{clearTimeout(timer);parser.terminate();if(worker===parser)worker=null;reject(Error('The parser could not read this file. Check the format and retry.'));};
          parser.postMessage({buffer,extension},[buffer]);
        });
        if(!active()||version!==revision)return;
        sheets=parsed;sheet=sheets[0];mapping=C.autoMap(sheet.headers);step=2;render();
      }catch(e){if(dialog&&version===revision)message(e.message);}finally{if(version===revision){parsing=false;if(dialog?.querySelector('[data-import-file]'))dialog.querySelector('[data-import-file]').disabled=false;}}
    }
    async function refresh(){
      try{await initMasterlist();dialog?.querySelector('[data-import-refresh]')?.replaceChildren(document.createTextNode('Equipment Tracking refreshed. Existing search and filters are preserved. Clear them if the new records are hidden.'));}
      catch(_){dialog?.querySelector('[data-import-refresh]')?.replaceChildren(document.createTextNode('Import committed. Inventory refresh failed; reload Equipment Tracking to see the new records.'));}
    }
    async function recover(){
      if(recoveryError)throw Error(recoveryError);
      if(!pending)return;
      if(!legacy){
        const attempt=operationContext(),saved=await attempt.controller.recover();if(!attempt.current())return;
        if(saved){result=saved;pending=null;render();await refresh();}
        else message(pending.rejected&&!pending.uncertain?'No committed receipt found. Select “Start a corrected import” to replace the rejected spreadsheet.':'No committed receipt yet. Retry the same confirmed spreadsheet before starting another batch.');
        return;
      }
      const {data,error}=await window.EquipmentTracking.client().from('mcpa_equipment_imports').select('operation_id,actor_id,result').eq('operation_id',pending.operation).limit(1);
      if(error)throw Error('Could not check the previous import. Check your connection and retry.');
      if(!active())return;
      if(data?.[0]){
        if(data[0].actor_id!==actor.id)throw Error('This import belongs to another account.');
        result=data[0].result;clearPending();render();await refresh();
      }else message('No committed receipt found yet. Select the same spreadsheet and mappings to retry the previous operation safely.');
    }
    async function abandon(){
      if(busy||legacy||!pending?.rejected||pending.uncertain)return;
      const attempt=operationContext();
      try{
        if(!attempt.current())return;
        busy=true;render();message('Checking the rejected import receipt…');
        const saved=await attempt.controller.abandonUncommitted();if(!attempt.current())return;
        pending=attempt.controller.pending();busy=false;
        if(saved){result=saved;render();await refresh();return;}
        ++revision;step=1;sheets=[];sheet=null;mapping={};preview=null;result=null;render();
        message('Rejected attempt cleared after receipt check. Choose the corrected spreadsheet.');
      }catch(error){if(attempt.current()){busy=false;render();message(error.message);}}
      finally{if(attempt.current())busy=false;}
    }
    async function confirm(){
      if(busy||!dialog.querySelector('[data-import-ack]')?.checked)return;
      const attempt=!legacy?operationContext():null;
      try{
        if(recoveryError)throw Error(recoveryError);
        if(!active())throw Error('Your account or screen changed. Reopen Import Tools.');
        const check=C.validate(sheet,mapping,typeof equipmentList==='undefined'?[]:equipmentList);
        if(check.errors.length||check.invalid)throw Error('Fix all validation errors before confirming.');
        if(!legacy){busy=true;render();try{const saved=await attempt.controller.confirm({sheet,mapping,existing:typeof equipmentList==='undefined'?[]:equipmentList});if(!attempt.current())return;result=saved;pending=null;busy=false;render();await refresh();}finally{if(attempt.current()){busy=false;pending=attempt.controller.pending();}}return;}
        const rows=check.rows.map(r=>r.data),payload=JSON.stringify(rows);
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
        if(!active()||busy)return;
        const digest=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
        if(pending&&pending.digest!==digest)throw Error('A previous import is unresolved. Re-upload the same rows with the same mappings and check its receipt before starting a different import.');
        pending||={operation:crypto.randomUUID(),actor:actor.id,digest};
        sessionStorage.setItem(pendingKey(),JSON.stringify(pending));
        busy=true;render();dialog.setAttribute('aria-busy','true');
        let timeout;
        const response=window.EquipmentTracking.client().rpc('mcpa_import_equipment',{p_operation_id:pending.operation,p_rows:rows});
        const {data,error}=await Promise.race([response,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Import response timed out. Retry the same confirmation to recover its result.')),30000);})]).finally(()=>clearTimeout(timeout));
        if(error){
          // A PostgreSQL validation/authorization response guarantees transaction rollback.
          // Network/unknown outcomes keep the operation for safe receipt lookup/retry.
          if(['22023','42501','P0001','23505','23514','23502','42883','PGRST202'].includes(error.code))clearPending();
          throw Error(error.code==='PGRST202'||error.code==='42883'?'Equipment import is not installed on this database. An administrator must review and deploy the supplied migration.':error.message||'Import response interrupted. Retry the same confirmation to recover its result.');
        }
        if(!data||data.operation_id!==pending.operation||data.created!==rows.length||data.assets?.length!==rows.length)throw Error('The import result could not be verified. Check the previous receipt before retrying.');
        if(!active())return;
        result=data;clearPending();busy=false;render();await refresh();
      }catch(e){if(!attempt||attempt.current()){busy=false;if(dialog){render();message(e.message);}}}
      finally{if(!attempt||attempt.current()){busy=false;dialog?.removeAttribute('aria-busy');}}
    }
    button.onclick=()=>{
      if(dialog)return;
      try{actor=window.MCPAAuth.requireLive();if(actor.role!=='admin')throw Error('Only Admin can import equipment.');}catch(e){return;}
      step=1;result=null;sheets=[];preview=null;pending=null;
      recoveryError='';
      try{
        legacy=!window.MCPAIndividualImport||!!sessionStorage.getItem(pendingKey());C=legacy?window.EquipmentImportCore:window.MCPAIndividualImport;
        if(legacy)restorePending();else {controller=window.MCPAIndividualImportController.create({client:window.EquipmentTracking.client(),requireActor:()=>window.MCPAAuth.requireLive()});pending=controller.pending();}
      }catch(error){recoveryError=error.message||'Import recovery is unavailable. Preserve this tab and contact Admin.';}
      dialog=document.createElement('dialog');dialog.id='equipmentImportDialog';dialog.setAttribute('aria-labelledby','equipment-import-title');document.getElementById('content').append(dialog);
      dialog.addEventListener('cancel',e=>{e.preventDefault();close();});render();dialog.showModal();document.documentElement.classList.add('equipment-modal-open');
      if(recoveryError){message(recoveryError);dialog.querySelector('[data-import-file]').disabled=true;}
    };
    return ()=>{++revision;controller?.dispose();controller=null;worker?.terminate();dialog?.close();dialog?.remove();dialog=null;document.documentElement.classList.remove('equipment-modal-open');button.onclick=null;};
  }
  window.EquipmentImport={attach,template};
})();
