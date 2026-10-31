const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../js/equipment-import-core.js'),X=require('../vendor/sheetjs/xlsx.full.min.js');
const base='Item Name,Category,Brand,Tracking Type,Quantity,Unit\r\nElectric Drill,Power Tools,Bosch,Individual,1,\r\nElectric Drill,Power Tools,Bosch,Individual,1,';
test('CSV quotes, BOM, multiline fields, empty lines and source references',()=>{
  const sheet=C.csv('\uFEFFItem Name,Category,Tracking Type\r\n"Drill, heavy",Power Tools,Individual\r\n\r\n"Multi\nline",Hand Tools,Bulk');
  assert.equal(sheet.rows[0].values[0],'Drill, heavy');assert.equal(sheet.rows[1].source_row,5-1);assert.equal(sheet.rows[1].values[0],'Multi\nline');
  for(const malformed of ['','A,B\n"unclosed','A\n"x"oops','A\nx,y','A,A\nhe"llo','A,\na,b','A\n\0'])assert.throws(()=>C.csv(malformed));
});
test('mapping recognizes unambiguous aliases and rejects repeated mappings',()=>{
  const s=C.csv(base),map=C.autoMap(s.headers);assert.equal(map[0],'name');assert.equal(C.autoMap(['Tool Name','Manufacturer','serial_number'])[2],'serial_number');
  assert.ok(C.validate(s,{...map,2:'name'}).errors.some(e=>e.includes('only once')));
  assert.ok(C.validate(s,{}).errors.includes('Map Item Name.'));
});
test('identical tools are allowed with review warnings; quantities follow the manual model',()=>{
  const s=C.csv(base),v=C.validate(s,C.autoMap(s.headers));assert.equal(v.valid,2);assert.equal(v.duplicates,1);assert.equal(v.records,2);
  const bulk=C.csv(base.replaceAll('Individual,1,','Bulk,5,Pieces'));assert.equal(C.validate(bulk,C.autoMap(bulk.headers)).valid,2);
  const unitless=C.csv(base.replaceAll('Individual,1,','Bulk,5,'));assert.equal(C.validate(unitless,C.autoMap(unitless.headers)).valid,2);
  const individual=C.csv(base.replaceAll('Individual,1,','Individual,5,'));assert.equal(C.validate(individual,C.autoMap(individual.headers)).invalid,2);
  for(const patch of ['Individual,-1,','Individual,1.5,','Bulk,5,Wrong','Bulk,0,Pieces']){const s=C.csv(base.replaceAll('Individual,1,',patch));assert.equal(C.validate(s,C.autoMap(s.headers)).invalid,2);}
});
test('unknown custody/date columns ignored; formulas, types, controls, long data and serial warnings handled',()=>{
  const s=C.csv(base.replace('Brand,','Brand,Holder,Acquisition Date,').replaceAll('Bosch,','Bosch,Someone,2026-10-24,'));assert.equal(C.validate(s,C.autoMap(s.headers)).valid,2);
  for(const value of ['=1+1','+SUM(1)','@SUM(1)','a'.repeat(241),'bad\tname']){const bad=C.csv(base.replaceAll('Electric Drill',value));assert.equal(C.validate(bad,C.autoMap(bad.headers)).invalid,2);}
  const serial=C.csv('Item Name,Category,Tracking Type,Serial Number\nDrill,Power Tools,Individual,SN');assert.equal(C.validate(serial,C.autoMap(serial.headers),[{serial_number:'SN'}]).duplicates,1);
  const cell=C.csv(base);cell.rows[0].values[0]=123;assert.equal(C.validate(cell,C.autoMap(cell.headers)).invalid,1);
});
function buffer(book){return X.write(book,{bookType:'xlsx',type:'buffer'});}
function book(){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['Item Name','Category','Tracking Type'],['Drill','Power Tools','Individual']]),'Equipment');return b;}
test('XLSX parsing exposes sheet choices, literal serials, formulas and corrupt/oversized archives',()=>{
  const b=book();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['Other'],['ignored']]),'Other');
  assert.deepEqual(C.workbook(buffer(b),X).map(s=>s.name),['Equipment','Other']);
  b.Sheets.Equipment.A2={t:'n',v:2,f:'1+1'};const s=C.workbook(buffer(b),X)[0];assert.equal(C.validate(s,C.autoMap(s.headers)).invalid,1);
  assert.throws(()=>C.workbook(new Uint8Array([1,2,3]),X));
  const oversized=book();oversized.Sheets.Equipment['!ref']='A1:A502';assert.throws(()=>C.workbook(buffer(oversized),X),/exceeds/);
  const macros=buffer(book());const before=Buffer.from('xl/workbook.xml'),after=Buffer.from('xl/vbaCode1.bin');assert.equal(before.length,after.length);
  const malicious=Buffer.from(macros);for(let i=0;i<malicious.length-before.length;i++)if(malicious.subarray(i,i+before.length).equals(before))after.copy(malicious,i);
  assert.throws(()=>C.checkXlsx(malicious),/Macros/);
});
test('limits and CSV formula-injection protection',()=>{
  assert.throws(()=>C.csv('A\n'+Array.from({length:501},()=> 'x').join('\n')),/500/);
  const out=C.csvExport([['=cmd',' +1','@bad','-10','a"b','safe']]);assert.ok(out.includes('"\'=cmd"'));assert.ok(out.includes('"\' +1"'));assert.ok(out.includes('"a""b"'));assert.ok(out.includes('"\'-10"'));
});
test('CSV and XLSX serial numbers preserve leading zeros; numeric Excel identifiers must be corrected as text',()=>{
  const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([
    ['Item Name','Category','Tracking Type','Serial Number'],
    ['Drill','Power Tools','Individual','000042'],['Drill','Power Tools','Individual','000042']
  ]),'Equipment');
  for(const s of [C.workbook(buffer(b),X)[0],C.csv(X.utils.sheet_to_csv(b.Sheets.Equipment))]){
    const v=C.validate(s,C.autoMap(s.headers));assert.equal(v.valid,2);assert.equal(v.duplicates,1);
    assert.ok(v.rows.every(r=>r.data.serial_number==='000042'));
  }
  b.Sheets.Equipment.D2={t:'n',v:42};
  const s=C.workbook(buffer(b),X)[0],v=C.validate(s,C.autoMap(s.headers));
  assert.equal(v.invalid,1);assert.ok(v.rows[0].errors.includes('Serial Number must be text.'));
});
