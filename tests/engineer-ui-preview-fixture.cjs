// Synthetic loopback preview seed only. Uses the disposable PGlite fixture.
const {randomUUID:id}=require('node:crypto');
exports.seed=async f=>{
 await exports.seedInventory(f);
 const item=await f.call(f.actors.admin,'consumables_save_item',{p_id:id(),p_version:null,p_name:'Synthetic Review Cement',p_unit:'bags',p_minimum:2,p_opening:30,p_category:'Masonry & Carpentry',p_specification:'40 kg fixture',p_item_code:null});
 const submit=quantity=>f.call(f.actors.sky,'mcpa_wa_submit_consumables',{p_operation_id:id(),p_site_id:f.sites.casa,p_purpose:'Synthetic Engineer UI review',p_items:[{consumable_id:item.id,quantity,unit:item.unit}]});
 const request=await submit(5);
 await f.call(f.actors.admin,'mcpa_wa_review_consumables',{p_operation_id:id(),p_request_id:request.id,p_decision:'approve',p_items:[{item_id:request.items[0].id,quantity:5}],p_note:''});
 await f.call(f.actors.admin,'mcpa_wa_issue_consumables',{p_operation_id:id(),p_request_id:request.id,p_items:[{item_id:request.items[0].id,quantity:5}],p_issued_at:null});
 await submit(2);
};

// Include both permitted and excluded cases so manual review cannot pass on an empty list.
exports.seedInventory=async f=>{
 const samples=[
  ['Synthetic Assigned Project Drill',f.sites.casa,null,'AVAILABLE'],
  ['Synthetic Office Drill',f.sites.office,null,'AVAILABLE'],
  ['Synthetic Other Project Drill',f.sites.main,f.actors.sky.id,'IN_USE'],
  ['Synthetic Own Custody Drill',f.sites.casa,f.actors.sky.id,'IN_USE'],
  ['Synthetic Other Custodian Drill',f.sites.casa,f.actors.pau.id,'IN_USE'],
  ['Synthetic Unrelated Repair Drill',f.sites.casa,null,'REPAIR']
 ];
 for(const [name,site,holder,status] of samples){
  await f.call(f.actors.admin,'mcpa_import_equipment_v2',{p_operation_id:id(),p_rows:[{source_row:2,name,category:'Power Tools',brand:'Synthetic Scope Fixture',condition:'Good',tracking_type:'Individual',quantity:1}]});
  await f.db.query('update equipment set site_id=$1,current_holder_id=$2,status=$3 where name=$4',[site,holder,status,name]);
 }
};
