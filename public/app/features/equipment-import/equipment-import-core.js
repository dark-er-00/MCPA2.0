/* Shared browser/worker/Node validation. No database writes or ID allocation. */
(function(root) {
  'use strict';
  const MAX_ROWS=500, MAX_BYTES=2*1024*1024;
  const categories=['Hand Tools','Power Tools','Equipment','Scaffolding','Construction Materials','Water & Plumbing','Electrical','Appliances','Storage Containers','Other'];
  const conditions=['Good','Fair','Damaged','Needs Inspection','Not Assessed'];
  const units=['Pieces','Sets','Meters','Kilograms','Liters','Boxes','Rolls','Other'];
  const fields={name:'Item Name',category:'Category',brand:'Brand',model:'Model',serial_number:'Serial Number',condition:'Condition',tracking_type:'Tracking Type',quantity:'Quantity',unit:'Unit',details:'Identifying Details'};
  const aliases={name:['item name','tool name','equipment name','name'],category:['category'],brand:['brand','manufacturer'],model:['model'],serial_number:['serial number','serial no','serial'],condition:['condition','initial condition'],tracking_type:['tracking type','tracking'],quantity:['quantity','qty'],unit:['unit'],details:['identifying details','details']};
  const normalized=s=>String(s).trim().toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
  const blank=v=>v==null||v==='';
  function csv(text) {
    if(typeof text!=='string'||text.includes('\0'))throw Error('Use a UTF-8 CSV file without binary content.');
    text=text.replace(/^\uFEFF/,'');
    const records=[]; let values=[],value='',quoted=false,closed=false,line=1,start=1;
    const cell=()=>{values.push(value);value='';closed=false;if(values.length>50)throw Error('At most 50 spreadsheet columns are supported.');};
    const row=()=>{cell();if(values.some(v=>v!==''))records.push({source_row:start,values});values=[];start=line+1;if(records.length>MAX_ROWS+1)throw Error('At most 500 equipment rows are supported.');};
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=c;if(c==='\n')line++;}continue;}
      if(c==='"'){if(value||closed)throw Error(`Malformed CSV near line ${line}.`);quoted=true;}
      else if(c===',')cell();
      else if(c==='\r'||c==='\n'){row();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
      else{if(closed)throw Error(`Unexpected text after closing quote near line ${line}.`);value+=c;}
    }
    if(quoted)throw Error('Malformed CSV: an opening quote has no closing quote.');
    if(value||values.length||closed)row();
    return grid(records);
  }
  function grid(records){
    if(!records.length)throw Error('The spreadsheet is empty.');
    const headers=records[0].values;
    if(headers.length>50||headers.some(v=>typeof v!=='string'||!v.trim()||v.length>240))throw Error('Use 1 to 50 non-empty text column headings (240 characters maximum).');
    if(records.length-1>MAX_ROWS)throw Error('At most 500 equipment rows are supported.');
    const rows=records.slice(1);
    for(const row of rows)if(row.values.length>headers.length)throw Error(`Row ${row.source_row} contains more cells than the headings.`);
    return {headers,rows};
  }
  function autoMap(headers){
    const result={};
    headers.forEach((h,i)=>{const matches=Object.keys(aliases).filter(k=>aliases[k].includes(normalized(h)));if(matches.length===1)result[i]=matches[0];});
    return result;
  }
  function validate(sheet,mapping,existing=[]){
    const chosen=Object.values(mapping).filter(Boolean), errors=[];
    for(const key of ['name','category','tracking_type'])if(!chosen.includes(key))errors.push(`Map ${fields[key]}.`);
    if(new Set(chosen).size!==chosen.length)errors.push('Each equipment field can be mapped only once.');
    if(chosen.some(k=>!Object.hasOwn(fields,k)))errors.push('Unsupported column mapping.');
    if(!sheet.rows.length)errors.push('This worksheet has no equipment rows.');
    const seen=new Map(),serials=new Set(existing.map(r=>r.serial_number||r.serialNumber).filter(s=>s&&s!=='—'));
    const rows=sheet.rows.map(row=>{
      const data={source_row:row.source_row},issues=[],warnings=[];
      for(const value of row.values){if(value&&typeof value==='object')issues.push(value.issue||'Unsupported spreadsheet cell type.');else if(typeof value==='string'&&/^[=+@]/.test(value.trim()))issues.push('Spreadsheet formulas are not supported; use literal values.');}
      for(const [index,key]of Object.entries(mapping))if(key){
        const raw=row.values[Number(index)]??'';
        if(key==='quantity'){
          if(!blank(raw)&&!/^\d+$/.test(String(raw).trim()))issues.push('Quantity must be a positive whole number.');
          data.quantity=blank(raw)?1:Number(raw);
        }else{
          if(typeof raw!=='string')issues.push(`${fields[key]} must be text.`);
          data[key]=typeof raw==='string'?raw.trim():'';
          if(data[key].length>(key==='details'?2000:240)||/[\x00-\x1f\x7f]/.test(data[key]))issues.push(`${fields[key]} is too long or contains control characters.`);
        }
      }
      data.quantity??=1;data.condition||='Good';
      if(!data.name)issues.push('Item Name is required.');
      if(!categories.includes(data.category))issues.push('Select a supported Category.');
      if(!['Individual','Bulk'].includes(data.tracking_type))issues.push('Tracking Type must be Individual or Bulk.');
      if(!Number.isInteger(data.quantity)||data.quantity<1||data.quantity>2147483647)issues.push('Quantity must be between 1 and 2147483647.');
      if(data.tracking_type==='Individual'&&data.quantity!==1)issues.push('Individual quantity must be 1. Use a separate row for each physical asset.');
      if(data.tracking_type==='Individual'&&data.unit)issues.push('Unit is only supported for Bulk rows.');
      if(data.tracking_type==='Bulk'&&data.unit&&!units.includes(data.unit))issues.push('Select a supported Unit or leave it blank.');
      if(!conditions.includes(data.condition))issues.push('Unsupported Condition.');
      const signature=JSON.stringify({...data,source_row:undefined});
      if(seen.has(signature))warnings.push(`Identical to spreadsheet row ${seen.get(signature)}. Separate physical tools are allowed; review before confirming.`);
      else seen.set(signature,row.source_row);
      if(data.serial_number){if(serials.has(data.serial_number))warnings.push('Serial number also appears in inventory or this file. Review the physical identifier; database unique constraints still apply.');serials.add(data.serial_number);}
      return {data,errors:[...new Set(issues)],warnings};
    });
    return {errors,rows,valid:rows.filter(r=>!r.errors.length).length,invalid:rows.filter(r=>r.errors.length).length,duplicates:rows.filter(r=>r.warnings.length).length,records:rows.length};
  }
  function csvExport(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
  // Inspect ZIP directory before decompression. Reject macros, embedded objects,
  // external links, encrypted entries, ZIP64 and decompression bombs.
  function checkXlsx(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length<22||view.getUint32(0,true)!==0x04034b50)throw Error('Invalid XLSX ZIP container.');
    let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}
    if(end<0)throw Error('Corrupted XLSX archive.');
    const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),size=0;const names=[];
    if(count>512||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('Workbook archive exceeds supported limits.');
    for(let i=0;i<count;i++){
      if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw Error('Corrupted XLSX directory.');
      const flags=view.getUint16(pos+8,true),length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),unpacked=view.getUint32(pos+24,true);
      size+=unpacked;if(pos+46+length+extra+comment>end||size>20*1024*1024||unpacked>10*1024*1024||flags&1)throw Error('Workbook is encrypted or exceeds the 20 MiB expanded archive limit.');
      const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+length));names.push(name);
      if(/vba|macrosheet|activeX|embeddings|externalLinks|\.bin$|(^|\/)\.\./i.test(name))throw Error('Macros, external links and embedded executable content are not supported.');
      pos+=46+length+extra+comment;
    }
    if(!names.includes('[Content_Types].xml')||!names.includes('xl/workbook.xml'))throw Error('Upload a standard .xlsx workbook.');
  }
  function workbook(buffer,XLSX){
    checkXlsx(buffer);
    const book=XLSX.read(buffer,{type:'array',cellFormula:true,bookVBA:true,cellHTML:false,sheetRows:MAX_ROWS+2});
    if(book.vbaraw||book.Workbook?.Sheets?.some(s=>s.Hidden===2))throw Error('Macros and very hidden worksheets are not supported.');
    return book.SheetNames.map(name=>{
      const sheet=book.Sheets[name],records=[];
      if(!sheet['!ref'])return {name,headers:[],rows:[]};
      const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
      if(range.e.c>=50||range.e.r>MAX_ROWS)throw Error(`Worksheet ${name} exceeds 500 data rows or 50 columns.`);
      for(let r=0;r<=range.e.r;r++){
        const values=[];for(let c=0;c<=range.e.c;c++){
          const cell=sheet[XLSX.utils.encode_cell({r,c})];
          values.push(!cell?'':cell.f||cell.F?{issue:'Spreadsheet formulas are not supported; use literal values.'}:['s','n','z'].includes(cell.t)?cell.v??'':{issue:'Only text and numeric cells are supported.'});
        }
        if(values.some(v=>!blank(v)))records.push({source_row:r+1,values});
      }
      return records.length?{name,...grid(records)}:{name,headers:[],rows:[]};
    });
  }
  const api={MAX_ROWS,MAX_BYTES,categories,conditions,units,fields,csv,grid,autoMap,validate,csvExport,checkXlsx,workbook};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EquipmentImportCore=api;
})(globalThis);
