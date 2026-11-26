// Real retirement operations against the disposable integration fixture.
module.exports=async function seed(f) {
  const {admin,admin2}=f.actors;
  const imported=await f.call(admin,'mcpa_import_equipment_v2',{p_operation_id:require('node:crypto').randomUUID(),p_rows:[
    {source_row:2,name:'Welding Machine',category:'Power Tools',condition:'Good',tracking_type:'Individual',quantity:1},
    {source_row:3,name:'Shovel',category:'Hand Tools',condition:'Good',tracking_type:'Individual',quantity:2}
  ]});
  const [welder,shovel]=imported.assets;
  const completed=await f.action(admin,'proposeRetirement',{assetId:welder.asset_id,disposition:'disposed',effectiveDate:'2026-10-26',reason:'Motor damage confirmed during workshop inspection.'});
  await f.action(admin2,'approveRetirement',{id:completed.id,notes:'Workshop inspection verified.'});
  const pending=await f.action(admin,'proposeRetirement',{assetId:shovel.asset_id,disposition:'sold',effectiveDate:'2026-11-22',reason:'Sale of surplus site equipment.'});
  return pending.id;
};
