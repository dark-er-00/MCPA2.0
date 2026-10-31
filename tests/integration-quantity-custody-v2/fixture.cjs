const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
async function fixture(t,{applyReadFix=true}={}){
  const f=await require('../custody-lifecycle-v2/fixture.cjs').fixture(t,{apply:false});
  await require('../consumables-upgrade-fixture.cjs').upgrade(f);
  await require('../equipment-import-fixture.cjs').upgrade(f);
  for(const name of ['202610120003_optional_request_purpose.sql','202610250001_quantity_material_requests.sql','202610250002_custody_lifecycle.sql','202610250003_quantity_custody_integration.sql'])
    await f.db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  if(applyReadFix)await f.db.exec(fs.readFileSync(path.join(root,'supabase/migrations/202610250004_read_rpc_authorization.sql'),'utf8'));
  f.call=async(actor,name,args={})=>{
    if(!/^(mcpa_(wa_|b_|import_equipment_v2)|consumables_)[a-z_]*$/.test(name))throw Error('Unsupported local integration RPC');
    return (await f.query(actor,`select to_jsonb(public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')})) value`,Object.values(args))).rows[0].value;
  };
  return f;
}
module.exports={fixture,randomUUID,root};
