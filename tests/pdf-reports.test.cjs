const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const {parse,assertLayout,render,compact}=require('./pdf-test-utils.cjs');
const root=path.resolve(__dirname,'..'),artifacts=path.join(__dirname,'artifacts/pdf-reports');
function exporter(){
 const sandbox={URL,Blob,atob,btoa,console,TextEncoder,TextDecoder,setTimeout,clearTimeout,navigator:{userAgent:'Node'},document:{currentScript:{src:'https://example.test/project/js/pdf-reports.js'}}};
 sandbox.window=sandbox;sandbox.self=sandbox;
 const context=vm.createContext(sandbox);
 for(const file of ['vendor/pdf/jspdf.umd.min.js','vendor/pdf/jspdf.plugin.autotable.min.js','vendor/pdf/noto-sans.js','js/display.js','js/pdf-reports.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return context.SiteTracePDF;
}
test('Pinned local assets are intact; report exports use PDF in both portal entry points',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/pdf/manifest.json')));
 for(const [file,hash]of Object.entries(manifest.sha256).filter(([file])=>!file.endsWith('.ttf')))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'vendor/pdf',file))).digest('hex'),hash);
 for(const dir of ['js','1-admin/modules','2-engr/modules'])for(const entry of fs.readdirSync(path.join(root,dir),{recursive:true})){
  if(!/\.(js|html)$/.test(entry)||entry.includes('node_modules'))continue;
  // Import receipts are a machine-readable row/Asset-ID reconciliation file,
  // explicitly separate from existing PDF report controls.
  if(dir==='js'&&entry==='equipment-import.js')continue;
  assert.doesNotMatch(fs.readFileSync(path.join(root,dir,entry),'utf8'),/Export CSV|Download CSV|text\/csv|\.csv['"`]|Export Excel/i,entry);
 }
 for(const file of ['index.html','2-engr/index.html'])assert.match(fs.readFileSync(path.join(root,file),'utf8'),/src="(?:\.\.\/)?js\/pdf-reports.js"/);
});
test('Hundreds of full activity rows survive pagination, long cells and Unicode; A4 layout renders',async()=>{
 const api=exporter();
 assert.equal(api.dateKey('2026-10-14T16:01:00Z'),'2026-10-15');
 assert.match(api.dateTime('2026-10-14T16:01:02Z'),/12:01:02 AM PHT/);
 const records=Array.from({length:320},(_,i)=>({createdAt:'2026-10-14T16:01:02.123456Z',action:'createRequest',entityId:'REF-'+String(i).padStart(4,'0'),actor:'Engr. José Peña – Ma. Niño O’Connor',toolIds:['TOOL-'+i,'VeryLongEquipmentReference'.repeat(5)],summary:'DETAIL-'+i+' · ₱1,500.00 / 25°C / façade / Ω / café\n'+(i===157?'LongParagraph '.repeat(900)+'END-OF-EXTREME-CELL':'Construction equipment & project records; preserve every field.')}));
 const doc=api.create({title:'Activity Logs',columns:api.activityColumns,rows:api.activityRows(records),widths:[39,36,34,39,36,85],filters:['Search: All activity','Scope: Isolated regression records']},new Date('2026-10-15T01:02:03Z'));
 const bytes=Buffer.from(doc.output('arraybuffer')),parsed=await parse(bytes);
 assert.ok(parsed.pages.length>10);assert.equal((await parsed.pdf.getMetadata()).info.Title,'Activity Logs');
 const joined=compact(parsed.text);
 for(const [index,record]of records.entries())for(const value of [record.entityId,record.actor,api.dateTime(record.createdAt),'Equipment Request Submitted',...record.toolIds,...(index===157?['DETAIL-157','END-OF-EXTREME-CELL']:[record.summary])])assert.ok(joined.includes(compact(value)),'Missing field: '+value.slice(0,80));
 assert.ok(!joined.includes('createRequest'),'Raw action keys are not printed');
 assert.equal((joined.match(/LongParagraph/g)||[]).length,900,'All text of a cell split over pages is preserved');
 for(const {text,page}of parsed.pages){assert.ok(text.includes('Reference ID'));assert.ok(page.view[2]>page.view[3]);}
 assertLayout(parsed);fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'activity-320.pdf'),bytes);
 const longPage=parsed.pages.findIndex(page=>page.text.includes('LongParagraph'))+1;
 await render(parsed,artifacts,'activity-320',[1,longPage,longPage+1,parsed.pages.length]);
 await parsed.pdf.destroy();
});
test('Empty portrait report and long filters render; absent glyphs are explicitly preserved',async()=>{
 const api=exporter();
 const doc=api.create({title:'Empty Report',columns:['Reference','Details'],rows:[],filters:['No matching activity','Long search: '+'filter '.repeat(2800)]});
 const parsed=await parse(Buffer.from(doc.output('arraybuffer')));
 assert.ok(parsed.text.includes('Records: 0'));assert.ok(parsed.text.includes('No records match this report.'));
 assert.ok(parsed.pages[0].page.view[2]<parsed.pages[0].page.view[3]);assertLayout(parsed);
 await render(parsed,artifacts,'empty',[1,parsed.pages.length]);await parsed.pdf.destroy();
 const special=api.create({title:'Special Characters',columns:['Name','Details'],rows:[['Zoë Niño ₱','建設 😀']]});
 const result=await parse(Buffer.from(special.output('arraybuffer')));
 assert.ok(result.text.includes('Zoë Niño ₱'));assert.ok(result.text.includes('[U+5EFA][U+8A2D] [U+1F600]'));assert.ok(result.text.includes('Unicode code points'));await result.pdf.destroy();
});
test('Inventory retains long equipment/project/employee names, literal punctuation and quantities',async()=>{
 const api=exporter();
 const rows=[['EQ-'+ '1234567890'.repeat(12),'Concrete cutting and drilling equipment '.repeat(15),'Project façade construction '.repeat(12),'Engr. José María Niño O’Connor '.repeat(15),250,'Deployed','=1+1 & reserved / 25°C']];
 const doc=api.create({title:'Current Inventory',columns:['Equipment ID','Name','Project','Holder','Quantity','Status','Availability'],rows,widths:[34,54,43,42,22,33,41]});
 const parsed=await parse(Buffer.from(doc.output('arraybuffer')));assertLayout(parsed);
 for(const value of rows[0])assert.ok(compact(parsed.text).includes(compact(String(value))),'Missing inventory value');
 await parsed.pdf.destroy();
});
