const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
exports.fixture=async({workstream=true}={})=>{
  const f=await require('../consumables-upgrade-fixture.cjs').fixture();
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202610100001_engineer_portal.sql'),'utf8'));
  await require('../equipment-import-fixture.cjs').upgrade(f);
  for(const file of ['202610120003_optional_request_purpose.sql','202610200001_verified_request_inventory.sql',...(workstream?['202610250001_quantity_material_requests.sql']:[])])
    await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8'));
  f.wa=async(actor,name,args={})=>{
    if(!/^mcpa_(wa_[a-z_]+|import_equipment_v2(_receipt)?)$/.test(name))throw Error('Invalid fixture RPC');
    const keys=Object.keys(args);
    return (await f.query(actor,`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,Object.values(args))).rows[0].result;
  };
  f.seedEquipment=async(overrides={},count=1)=>{
    const rows=[];
    for(let i=0;i<count;i++) rows.push({source_row:i+2,name:'Shovel (Pala, Lapad)',category:'Hand Tools',brand:'',model:'',serial_number:'',condition:'Good',tracking_type:'Individual',quantity:1,...overrides});
    return f.rpc(f.actors.admin,'mcpa_import_equipment',{p_operation_id:randomUUID(),p_rows:JSON.stringify(rows)});
  };
  f.seedConsumable=async(overrides={})=> require('../consumables-upgrade-fixture.cjs').rpc(f,f.actors.admin,'consumables_save_item',{
    p_id:randomUUID(),p_version:null,p_name:'Workstream A Cement',p_unit:'bags',p_minimum:10,p_opening:30,p_category:'Masonry & Carpentry',p_specification:'40 kg',p_item_code:null,...overrides
  });
  return f;
};
exports.id=randomUUID;
