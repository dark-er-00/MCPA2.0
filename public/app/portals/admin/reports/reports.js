/* Reports separates current truth from saved historical observations. */
(function () {
 'use strict';
 const root=document.getElementById('screen-reports');
 if(!root||!MCPAAuth.canRoute('reports'))return;
 const $=selector=>root.querySelector(selector),esc=MovementOverview.escape,controller=new AbortController();
 let data=null,exportRows=[],loading=false,exporting=false;
 $('#report-export').innerHTML=SiteTracePDF.icon+' Export PDF';
 const loadedPeriod=()=>data && data.start===$('#report-start').value && data.end===$('#report-end').value;
 function exportState(){$('#report-export').disabled=loading||exporting||!loadedPeriod();}
 const date=window.MCPADisplay.dateTime;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 $('#report-start').value=today.slice(0,8)+'01';$('#report-end').value=today;
 function feedback(message,error=false){$('#report-feedback').textContent=message;$('#report-feedback').setAttribute('role',error?'alert':'status');}
 function table(head,rows){
  return rows.length?'<table><thead><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<div class="empty-state"><h3>No records for this report</h3><p>Choose another period or report type.</p></div>';
 }
 function render(){
  if(!data)return;
  const kind=$('#report-kind').value;
  $('#report-snapshot-field').hidden=kind!=='history';
  if(kind==='activity'){
   const head=['Date · Manila','Action','Reference','Recorded by','Tools','Details'];
   const rows=data.activity.map(r=>{const event=window.MCPADisplay.activity(r,data);return [event.when,event.title,event.reference,event.actor,(r.toolIds||[]).map(id=>window.MCPADisplay.reference(id)).join(', '),event.description];});
   exportRows=[head,...rows];$('#report-results').innerHTML=table(head,rows);
   $('#report-scope').textContent='Saved movement events from '+data.start+' through '+data.end+' inclusive, in Manila time.';
  }else{
   const snapshot=data.snapshots.find(s=>s.id===$('#report-snapshot').value);
   const tools=kind==='history'?(snapshot?.tools||[]):data.current;
   const head=['Equipment ID','Name','Project','Holder','Quantity','Status','Availability'];
   const rows=tools.filter(t=>EquipmentTracking.quantity(t)>0).map(t=>[t.id,t.name,t.site,t.holder||'Unassigned',EquipmentTracking.quantity(t),t.retirementDisposition==='sold'?'Sold':t.retirementDisposition==='disposed'?'Disposed':window.MCPADisplay.status(t.status),window.MCPADisplay.status(EquipmentTracking.availability(t), 'availability')]);
   exportRows=[head,...rows];$('#report-results').innerHTML=table(head,rows);
   if(kind==='current')$('#report-scope').textContent='Current inventory as of '+date(data.generatedAt)+' Manila. The date range applies to saved snapshots and movement history; current inventory is a present-day view.';
   else if(snapshot)$('#report-scope').textContent='Inventory observed on '+date(snapshot.capturedAt)+' Manila. Later movements do not change this saved snapshot.';
   else $('#report-scope').textContent='No inventory snapshots were captured in this period. Historical snapshots begin prospectively; past inventory is not reconstructed.'+(data.historicalAvailableFrom?' First recorded snapshot: '+data.historicalAvailableFrom+'.':' Weekly capture needs the monitoring scheduler.');
  }
  exportState();
 }
 async function load(){
  if(loading)return;
  const start=$('#report-start').value,end=$('#report-end').value;
  if(!start||!end||start>end){exportState();feedback('Choose a valid start and end date.',true);return;}
  loading=true;exportState();$('#report-results').setAttribute('aria-busy','true');$('#report-refresh').disabled=true;
  try{
   if(MCPAAuth.isDemo){
    await MovementStore.refresh();const demo=MovementStore.getState();
    data={start,end,generatedAt:new Date().toISOString(),current:demo.tools,transfers:demo.transfers,snapshots:[],historicalAvailableFrom:null,activity:demo.activity.filter(r=>{const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.createdAt));return key>=start&&key<=end;})};
    feedback('Offline demonstration records. No historical company snapshots are loaded.');
   }else{
    const response=await EquipmentTracking.client().rpc('mcpa_monitoring_report',{p_start:start,p_end:end});
    if(response.error)throw response.error;if(!root.isConnected)return;data=response.data;feedback('');
   }
   const previous=$('#report-snapshot').value;
   $('#report-snapshot').innerHTML=data.snapshots.map(s=>'<option value="'+esc(s.id)+'">'+esc(date(s.capturedAt))+' Manila</option>').join('');
   if(data.snapshots.some(s=>s.id===previous))$('#report-snapshot').value=previous;
   render();
  }catch(error){
   data=null;exportRows=[];$('#report-export').disabled=true;
   feedback(['PGRST202','PGRST205','42883','42P01'].includes(error?.code)?'Monitoring setup is not installed. Ask your administrator to complete setup, then retry.':error?.code==='42501'?'Your account cannot access monitoring reports.':error?.code==='22023'?'Choose a valid reporting range of at most 367 days.':'The report could not load. Check your connection and retry.',true);
  }finally{loading=false;if(root.isConnected){$('#report-results').setAttribute('aria-busy','false');$('#report-refresh').disabled=false;exportState();}}
 }
 root.addEventListener('change',event=>{
  if(['report-kind','report-snapshot'].includes(event.target.id))render();
  if(['report-start','report-end'].includes(event.target.id)){exportState();if(!loadedPeriod())feedback('Select Load report to apply this reporting period before exporting.');}
 },{signal:controller.signal});
 root.addEventListener('input',event=>{if(['report-start','report-end'].includes(event.target.id))exportState();},{signal:controller.signal});
 $('#report-refresh').addEventListener('click',load,{signal:controller.signal});
 $('#report-export').addEventListener('click',async()=>{
  if(loading||exporting||!loadedPeriod()||!MCPAAuth.canRoute('reports'))return;
  const kind=$('#report-kind').value,snapshot=data.snapshots.find(s=>s.id===$('#report-snapshot').value);
  const titles={current:'Current Inventory',history:'Saved Inventory Snapshot',activity:'Movement History'};
  const filters=[$('#report-scope').textContent];
  if(kind!=='current')filters.push('Reporting period: '+data.start+' through '+data.end+' (inclusive, Manila)');
  if(kind==='history'&&snapshot)filters.push('Snapshot captured: '+date(snapshot.capturedAt)+' Manila');
  if(MCPAAuth.isDemo)filters.push('Offline demonstration records');
  exporting=true;
  try{await SiteTracePDF.download({button:$('#report-export'),feedback:$('#report-feedback'),route:'reports',report:{
   title:titles[kind],filename:titles[kind].replaceAll(' ','_'),filters,
   columns:kind==='activity'?SiteTracePDF.activityColumns:exportRows[0],
   rows:kind==='activity'?SiteTracePDF.activityRows(data.activity,data):exportRows.slice(1),
   widths:kind==='activity'?[39,36,34,39,36,85]:[34,54,43,42,22,33,41]
  }});}finally{exporting=false;if(root.isConnected)exportState();}
 },{signal:controller.signal});
 window.MCPAReports={openRecord(id){if(['current','history','activity'].includes(id)){$('#report-kind').value=id;render();}},dispose(){controller.abort();}};
 const mounted = load();
 window.MCPANavigation?.track(root, mounted);
})();
