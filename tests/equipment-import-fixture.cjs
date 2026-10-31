const fs=require('node:fs'),path=require('node:path');
exports.upgrade=async f=>{
  if(!f.sites.office)await require('./office-return-fixture.cjs').configure(f);
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120004_equipment_office_default.sql'),'utf8'));
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610240001_equipment_import.sql'),'utf8'));
};
exports.row=(extra={})=>({source_row:2,name:'Electric Drill',category:'Power Tools',brand:'Bosch',tracking_type:'Individual',quantity:1,...extra});
exports.importRows=async(f,actor,rows,operation=require('node:crypto').randomUUID())=>(await f.query(actor,'select public.mcpa_import_equipment($1,$2::jsonb) as result',[operation,JSON.stringify(rows)])).rows[0].result;
// Capture the actual browser template generator without a DOM, network or files.
exports.generatedTemplate=async()=>{
  const vm=require('node:vm'),C=require('../js/equipment-import-core.js'),X=require('../vendor/sheetjs/xlsx.full.min.js');
  let blob,download;
  class CaptureURL extends URL {
    static createObjectURL(value){blob=value;return 'blob:isolated-template';}
    static revokeObjectURL(){}
  }
  const window={EquipmentImportCore:C,XLSX:X};
  const document={currentScript:{src:'https://fixture.invalid/js/equipment-import.js'},createElement(){return {click(){download={blob,name:this.download};}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/equipment-import.js'),'utf8'),{window,document,URL:CaptureURL,Blob,setTimeout(){return 0;}});
  await window.EquipmentImport.template();
  return {name:download.name,type:download.blob.type,bytes:Buffer.from(await download.blob.arrayBuffer())};
};
