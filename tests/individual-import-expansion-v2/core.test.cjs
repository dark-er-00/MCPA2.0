const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../../js/upgrades/individual-import-expansion/core.js'),legacy=require('../../js/equipment-import-core.js');
const X=require('../../vendor/sheetjs/xlsx.full.min.js');
const csv='Item Name,Category,Tracking Type,Quantity,Condition,Serial Number,Unit\nShovel (Pala Lapad),Hand Tools,Individual,20,Not Assessed,,\nGI Pipes,Construction Materials,Bulk,225,Fair,,Pieces';
const parse=text=>C.parse(Buffer.from(text),'csv')[0];
const check=text=>{const s=parse(text);return C.validate(s,C.autoMap(s.headers));};
test('one source row can represent many Individual assets; explicit Bulk remains grouped',()=>{
  const sheet=parse(csv),before=JSON.stringify(sheet),preview=C.validate(sheet,C.autoMap(sheet.headers));
  assert.equal(preview.canConfirm,true);assert.equal(preview.valid,2);assert.equal(preview.spreadsheetRows,2);assert.equal(preview.records,21);
  assert.deepEqual(preview.rows.map(r=>[r.data.quantity,r.records]),[[20,20],[225,1]]);
  assert.match(C.summary(preview),/2 spreadsheet rows → 21 equipment records/);
  assert.equal(JSON.stringify(sheet),before,'Adapter never edits the parser output');
  assert.equal(legacy.validate(sheet,legacy.autoMap(sheet.headers)).invalid,1,'Legacy single-asset rules remain unchanged');
  assert.ok(preview.rows.every(r=>!Object.hasOwn(r.data,'asset_id')));
});
test('explicit recorded condition is required; optional metadata remains blank and serials are never invented',()=>{
  for(const text of [csv.replace(',Not Assessed,',',,'),csv.replace(',Condition','').replace(',Not Assessed','').replace(',Fair','')]){
    const p=check(text);assert.equal(p.canConfirm,false);assert.ok(p.errors.some(e=>e.includes('Condition'))||p.rows.some(r=>r.errors.some(e=>e.includes('Condition'))));
    assert.equal(p.rows[0].data.condition,'');
  }
  const p=check(csv);assert.equal(p.rows[0].data.serial_number,'');assert.equal(p.rows[0].data.brand,undefined);
  const serial=check(csv.replace('Not Assessed,,','Not Assessed,000042,'));assert.equal(serial.canConfirm,false);assert.match(serial.rows[0].errors.join(' '),/one row per physical serial/);
  const single=check(csv.replace('Individual,20','Individual,1').replace('Not Assessed,,','Good,000042,'));assert.equal(single.canConfirm,true);assert.equal(single.rows[0].data.serial_number,'000042');
});
test('strict quantity, tracking, metadata and duplicate validation retains existing protections',()=>{
  for(const qty of ['0','-1','1.5','1e2','2147483648','=1+1'])assert.equal(check(csv.replace('Individual,20',`Individual,${qty}`)).canConfirm,false,qty);
  for(const patch of [csv.replace('Individual','individual'),csv.replace('Hand Tools','Unknown'),csv.replace('Not Assessed','Invented'),csv.replace('Shovel (Pala Lapad)','=HYPERLINK(1)'),csv.replace('Not Assessed,,','Not Assessed,,Pieces')])assert.equal(check(patch).canConfirm,false);
  assert.equal(check(csv.replace('Individual,20','Individual,')).rows[0].data.quantity,1,'Legacy blank quantity default is retained');
  const duplicate=check(csv+'\nShovel (Pala Lapad),Hand Tools,Individual,20,Not Assessed,,');assert.equal(duplicate.canConfirm,true);assert.equal(duplicate.duplicates,1);assert.equal(duplicate.records,41);
});
test('upload, source row, physical record and payload limits fail before confirmation',()=>{
  for(const [bytes,ext]of [[Buffer.alloc(0),'csv'],[Buffer.alloc(C.MAX_BYTES+1),'csv'],[Buffer.from(csv),'xlsm']])assert.throws(()=>C.parse(bytes,ext));
  assert.throws(()=>C.parse(Buffer.from([0xff]),'csv'),/encoded|encoding|valid/i);
  assert.equal(check(csv.replace('Individual,20','Individual,500')).canConfirm,false,'Bulk row also consumes a record');
  assert.equal(check(csv.replace('Individual,20','Individual,499')).canConfirm,true);
  const sheet=parse(csv),mapping=C.autoMap(sheet.headers);sheet.rows[1].source_row=2;assert.equal(C.validate(sheet,mapping).canConfirm,false);
  sheet.rows[1].source_row=3;assert.equal(C.validate(sheet,{...mapping,50:'brand'}).canConfirm,false);
  const many={headers:['Item Name','Category','Tracking Type','Quantity','Condition'],rows:Array.from({length:501},(_,i)=>({source_row:i+2,values:['Shovel','Hand Tools','Individual',1,'Good']}))};
  assert.match(C.validate(many,C.autoMap(many.headers)).errors.join(' '),/500/);
  const fat={headers:['Item Name','Category','Tracking Type','Quantity','Condition','Brand','Model','Serial Number','Identifying Details'],rows:Array.from({length:500},(_,i)=>({source_row:i+2,values:['x'.repeat(240),'Hand Tools','Individual',1,'Good','x'.repeat(240),'x'.repeat(240),'x'.repeat(240),'💧'.repeat(1000)]}))};
  const p=C.validate(fat,C.autoMap(fat.headers));assert.equal(p.canConfirm,false);assert.match(p.errors.join(' '),/2 MiB/);
});
test('XLSX templates keep real inventory empty and explicitly explain expansion and limits',()=>{
  const book=C.templateWorkbook(X),buffer=X.write(book,{bookType:'xlsx',type:'buffer'}),sheets=C.parse(buffer,'xlsx',X);
  assert.equal(sheets[0].rows.length,0);assert.deepEqual(sheets[0].headers,Object.values(C.fields));
  const examples=sheets[1],preview=C.validate(examples,C.autoMap(examples.headers));assert.equal(preview.canConfirm,true);assert.equal(preview.records,21);
  const instructions=X.utils.sheet_to_csv(book.Sheets.Instructions);assert.match(instructions,/No condition is inferred/);assert.match(instructions,/500 resulting records/);assert.match(instructions,/must not be imported/);
  book.Sheets['Examples - do not import'].A2={t:'n',v:2,f:'1+1'};
  const bad=C.parse(X.write(book,{bookType:'xlsx',type:'buffer'}),'xlsx',X)[1];assert.equal(C.validate(bad,C.autoMap(bad.headers)).canConfirm,false);
});
test('export includes original row and expansion index, with existing CSV injection protection',()=>{
  const out=C.resultCsv({operation_id:'op',assets:[{source_row:2,expansion_index:1,id:'db',asset_id:'T-ABC',name:'=formula',quantity:1}]});
  assert.match(out,/Expansion Index/);assert.match(out,/"2","1","db"/);assert.match(out,/"'=formula"/);
});
test('isolated worker routes approved CSV/XLSX parsing and returns bounded errors',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),messages=[],imports=[];
  const context={self:null,Uint8Array,ArrayBuffer,TextDecoder,importScripts(...urls){imports.push(...urls);context.MCPAIndividualImport=C;if(urls.some(u=>u.includes('xlsx')))context.XLSX=X;},postMessage:value=>messages.push(value)};
  context.self=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/upgrades/individual-import-expansion/worker.js'),'utf8'),context);
  context.onmessage({data:{extension:'csv',buffer:Buffer.from(csv)}});assert.equal(messages[0].sheets[0].rows.length,2);assert.equal(imports.some(u=>u.includes('xlsx')),false);
  const buffer=X.write(C.templateWorkbook(X),{bookType:'xlsx',type:'buffer'});
  context.onmessage({data:{extension:'xlsx',buffer}});assert.equal(messages[1].sheets.length,3);assert.equal(imports.filter(u=>u.includes('xlsx')).length,1);
  context.onmessage({data:{extension:'csv',buffer:Buffer.alloc(C.MAX_BYTES+1)}});assert.match(messages[2].error,/2 MiB/);
  context.onmessage({data:{extension:'xlsm',buffer:Buffer.from('ignored')}});assert.match(messages[3].error,/Macro-enabled/);
});
