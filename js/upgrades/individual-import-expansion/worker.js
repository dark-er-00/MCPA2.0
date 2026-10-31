/* Host must terminate this worker after the existing 10-second parse timeout. */
importScripts('../../equipment-import-core.js','core.js');
self.onmessage=event=>{
  try{
    const {buffer,extension}=event.data||{};
    if(String(extension).toLowerCase()==='xlsx'&&!self.XLSX)importScripts('../../../vendor/sheetjs/xlsx.full.min.js');
    self.postMessage({sheets:self.MCPAIndividualImport.parse(buffer,extension,self.XLSX)});
  }catch(error){self.postMessage({error:error.message||'The spreadsheet could not be read.'});}
};
