/* Additive import adapter. The shared parser and legacy importer stay unchanged. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../../equipment-import-core.js'));
  else root.MCPAIndividualImport=factory(root.EquipmentImportCore);
})(globalThis,function(C){
  'use strict';
  if(!C)throw Error('Load EquipmentImportCore before the Individual import adapter.');
  const MAX_RECORDS=500;
  const legacyIndividualError='Individual quantity must be 1. Use a separate row for each physical asset.';
  // Match JSONB's separators so validation includes the spaces PostgreSQL
  // counts in octet_length(payload::text), rather than compact JSON alone.
  function jsonbText(value){
    if(Array.isArray(value))return '['+value.map(jsonbText).join(', ')+']';
    if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>JSON.stringify(k)+': '+jsonbText(v)).join(', ')+'}';
    return JSON.stringify(value);
  }
  const encodedBytes=value=>new TextEncoder().encode(jsonbText(value)).byteLength;
  const physicalCount=row=>row.tracking_type==='Individual'?row.quantity:1;
  function parse(buffer,extension,XLSX){
    const bytes=buffer instanceof ArrayBuffer?new Uint8Array(buffer):ArrayBuffer.isView(buffer)?new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength):null;
    if(!bytes||!bytes.byteLength||bytes.byteLength>C.MAX_BYTES)throw Error('Choose a non-empty spreadsheet no larger than 2 MiB.');
    extension=String(extension).toLowerCase();
    if(extension==='csv')return [{name:'CSV',...C.csv(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}];
    if(extension==='xlsx'){
      if(!XLSX)throw Error('Load the approved local SheetJS library before parsing XLSX.');
      return C.workbook(bytes,XLSX);
    }
    throw Error('Choose a .csv or .xlsx file. Macro-enabled files are not supported.');
  }
  function validate(sheet,mapping,existing=[]){
    if(!sheet||!Array.isArray(sheet.headers)||!Array.isArray(sheet.rows)||sheet.rows.some(r=>!r||!Array.isArray(r.values)))throw Error('Use a worksheet from the approved equipment parser.');
    if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw Error('Column mapping is required.');
    const base=C.validate(sheet,mapping,existing),errors=[...base.errors],seen=new Set();
    if(sheet.rows.length>C.MAX_ROWS)errors.push('At most 500 spreadsheet rows are supported.');
    if(sheet.headers.length>50||sheet.rows.some(r=>r.values.length>sheet.headers.length))errors.push('Use at most 50 columns and no cells beyond the headings.');
    for(const index of Object.keys(mapping))if(!/^\d+$/.test(index)||Number(index)>=sheet.headers.length)errors.push('Column mapping refers to an unavailable spreadsheet column.');
    const conditionColumns=Object.keys(mapping).filter(i=>mapping[i]==='condition');
    if(!conditionColumns.length)errors.push('Map Condition. The expansion adapter requires an explicitly recorded condition.');
    let records=0;
    const rows=base.rows.map((row,i)=>{
      const data={...row.data},issues=row.errors.filter(message=>message!==legacyIndividualError),warnings=[...row.warnings];
      const source=sheet.rows[i];
      if(!Number.isInteger(data.source_row)||data.source_row<2||data.source_row>1000000||seen.has(data.source_row))issues.push('Original spreadsheet row must be unique and between 2 and 1000000.');
      seen.add(data.source_row);
      const rawCondition=conditionColumns.length===1?source.values[Number(conditionColumns[0])]:'';
      if(typeof rawCondition!=='string'||!rawCondition.trim()){
        data.condition='';
        issues.push('Condition is required; select an observed condition or explicitly record Not Assessed.');
      }
      if(data.tracking_type==='Individual'&&data.quantity>1&&data.serial_number)issues.push('A serial number cannot identify multiple Individual assets. Use one row per physical serial number.');
      const count=['Individual','Bulk'].includes(data.tracking_type)&&Number.isInteger(data.quantity)&&data.quantity>0&&data.quantity<=2147483647?physicalCount(data):0;
      records+=count;
      return {data,errors:[...new Set(issues)],warnings,records:count};
    });
    if(records>MAX_RECORDS)errors.push('This batch expands beyond 500 equipment records. Split it into separate confirmed imports.');
    const payload=rows.map(r=>r.data),payloadBytes=encodedBytes(payload);
    if(payloadBytes>C.MAX_BYTES)errors.push('Original row data exceeds the 2 MiB batch limit.');
    // This is a bounded size estimate only. The browser always submits original
    // rows; server expansion and Asset ID allocation remain transactional.
    let expandedBytes=null;
    if(records<=MAX_RECORDS&&rows.every(r=>!r.errors.length)&&!errors.length){
      const expanded=[];
      for(const row of rows)for(let i=0;i<row.records;i++)expanded.push({...row.data,source_row:expanded.length+2,quantity:row.data.tracking_type==='Individual'?1:row.data.quantity});
      expandedBytes=encodedBytes(expanded);
      if(expandedBytes>C.MAX_BYTES)errors.push('Expanded row data exceeds the 2 MiB batch limit. Split this import.');
    }
    return {errors:[...new Set(errors)],rows,valid:rows.filter(r=>!r.errors.length).length,invalid:rows.filter(r=>r.errors.length).length,
      duplicates:rows.filter(r=>r.warnings.length).length,spreadsheetRows:rows.length,records,expandedRecords:records,payloadBytes,expandedBytes,
      canConfirm:errors.length===0&&rows.every(r=>!r.errors.length)};
  }
  function summary(preview){
    return `${preview.spreadsheetRows} spreadsheet rows → ${preview.records} equipment records. Individual quantities become separate physical assets with distinct generated Asset IDs; explicit Bulk quantities remain grouped.`;
  }
  function resultCsv(result){
    return C.csvExport([['Import Operation','Spreadsheet Row','Expansion Index','Database UUID','Generated Asset ID','Item Name','Quantity','Outcome'],
      ...result.assets.map(a=>[result.operation_id,a.source_row,a.expansion_index,a.id,a.asset_id,a.name,a.quantity,'Created'])]);
  }
  function templateWorkbook(XLSX){
    const book=XLSX.utils.book_new(),head=Object.values(C.fields);
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([head]),'Equipment');
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([head,
      ['Example Shovels — replace before importing','Hand Tools','','','','Not Assessed','Individual',20,'','Example only'],
      ['Example GI Pipes — replace before importing','Construction Materials','','','','Not Assessed','Bulk',225,'Pieces','Example only']]),'Examples - do not import');
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
      ['Workstream A Individual expansion import instructions'],
      ['Enter real inventory in Equipment; example rows are illustrative and must not be imported.'],
      ['Required: Item Name, Category, Tracking Type, Condition. Blank Quantity defaults to 1.'],
      ['Record the actual condition or explicitly select Not Assessed. No condition is inferred.'],
      ['Individual Quantity N creates N separate physical assets, each quantity 1 with its own generated Asset ID.'],
      ['A serial number on an Individual row with Quantity greater than 1 is rejected. Use separate physical-asset rows.'],
      ['Explicit Bulk remains one grouped equipment record with the supplied quantity and optional Unit.'],
      ['Do not supply invented brands, models, serials or conditions; optional identifiers may be blank.'],
      ['Categories: '+C.categories.join('; ')],['Conditions: '+C.conditions.join('; ')],['Units: '+C.units.join('; ')],
      ['Asset IDs, dates, holders, projects, statuses, photos and movements are excluded. Use literal text identifiers.'],
      ['Limits: 2 MiB upload; 500 source rows; 50 columns; 500 resulting records; 2 MiB original and expanded row data.'],
      ['All rows must be valid. Confirmation is atomic and its operation ID is reused after an interrupted response.']
    ]),'Instructions');
    book.Sheets.Instructions['!cols']=[{wch:125}];return book;
  }
  return {MAX_ROWS:C.MAX_ROWS,MAX_BYTES:C.MAX_BYTES,MAX_RECORDS,fields:C.fields,categories:C.categories,conditions:C.conditions,units:C.units,
    autoMap:C.autoMap,parse,validate,summary,resultCsv,templateWorkbook};
});
