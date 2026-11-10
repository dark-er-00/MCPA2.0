const {randomUUID:id}=require('node:crypto');
exports.seed=async f=>{
 const a=f.actors;
 const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name:'PDF Review Drill',category:'Power Tools',brand:'Fixture',condition:'Good',tracking_type:'Individual',quantity:8}]});
 const catalog=await f.call(a.sky,'mcpa_wa_equipment_catalog'),group=catalog.groups.find(g=>g.type_name==='PDF Review Drill');
 const result={};
 for(const state of ['pending','approved','released','received','rejected']){
  const r=await f.call(a.sky,'mcpa_wa_submit_equipment',{p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:1,p_purpose:'Synthetic PDF review '+state,p_operation_id:id()});result[state]=r.id;
  if(state==='pending')continue;
  if(state==='rejected'){await f.call(a.admin,'mcpa_wa_reject_equipment',{p_request_id:r.id,p_reason:'Synthetic exception audit',p_operation_id:id()});continue;}
  const suggestion=await f.call(a.admin,'mcpa_wa_suggest_equipment',{p_request_id:r.id});
  await f.call(a.admin,'mcpa_wa_allocate_equipment',{p_request_id:r.id,p_asset_ids:suggestion.suggested_asset_ids,p_operation_id:id()});
  const q=(await f.call(a.admin,'mcpa_wa_equipment_requests')).find(q=>q.id===r.id);result[state+'Movement']=q.movement_id;
  if(state==='approved')continue;
  const transfer=await f.rpc(a.admin,'mcpa_movement_action',{p_action:'releaseRequest',p_payload:{id:q.movement_id},p_operation_id:id()});
  if(state==='received')await f.rpc(a.sky,'mcpa_movement_action',{p_action:'receiveTransfer',p_payload:{id:transfer.id,inspections:transfer.toolIds.map(toolId=>({toolId,condition:'good',tested:true,physicallyReceived:true,disposition:'accepted',notes:''}))},p_operation_id:id()});
 }
 result.batch=(await f.submit(['TOOL-002'])).id;
 // Model an existing historical row, predating the new-return gateway. This
 // bootstrap runs only on the in-memory fixture, before browser access begins.
 await f.db.exec('alter table mcpa_movements disable trigger mcpa_b_new_return_guard');
 try{await f.db.query("insert into mcpa_movements(id,kind,data,actor_id) values('RTN-LEGACY','return',$1,$2)",[{id:'RTN-LEGACY',returnedBy:a.sky.name,status:'returned',toolIds:['TOOL-003'],source:[{site:'Casa Buena'}],notes:'Synthetic historical return'},a.sky.id]);}
 finally{await f.db.exec('alter table mcpa_movements enable trigger mcpa_b_new_return_guard');}
 result.retirement=(await f.action(a.admin,'proposeRetirement',{assetId:'TOOL-001',disposition:'disposed',effectiveDate:'2026-10-01',reason:'Synthetic retirement review'})).id;
 return result;
};
