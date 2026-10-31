/* Parsing stays off the UI thread and is terminated by the caller on timeout. */
importScripts('../vendor/sheetjs/xlsx.full.min.js','equipment-import-core.js');
self.onmessage=event=>{
  try {
    const {buffer,extension}=event.data;
    const sheets=extension==='csv'?[{name:'CSV',...EquipmentImportCore.csv(new TextDecoder('utf-8',{fatal:true}).decode(buffer))}]:EquipmentImportCore.workbook(buffer,XLSX);
    self.postMessage({sheets});
  } catch(error){self.postMessage({error:error.message||'The spreadsheet could not be read.'});}
};
