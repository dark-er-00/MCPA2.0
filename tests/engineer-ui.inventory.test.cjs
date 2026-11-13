const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Engineer inventory project/Office authorization and request stock separation',async t=>{
 const f=await require('./integration-quantity-custody-v2/fixture.cjs').fixture();t.after(()=>f.close());
 await require('./engineer-ui-preview-fixture.cjs').seedInventory(f);
 await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/drafts/engineer-ui/00-engineer-inventory.sql'),'utf8'));
 const read=actor=>f.query(actor,'select public.mcpa_engineer_equipment_snapshot() value').then(r=>r.rows[0].value);
 const includes=(result,name)=>result.tools.some(tool=>tool.name===name);
 await t.test('Available assigned-project equipment and own custody appear; Office/unrelated/other-custodian/repair stock do not',async()=>{
  const result=await read(f.actors.sky);assert.equal(result.engineerInventoryVersion,2);assert.equal(result.officeId,f.sites.office);
  for(const name of ['Synthetic Assigned Project Drill','Synthetic Own Custody Drill'])assert.ok(includes(result,name),name);
  for(const name of ['Synthetic Office Drill','Synthetic Other Project Drill','Synthetic Other Custodian Drill','Synthetic Unrelated Repair Drill'])assert.ok(!includes(result,name),name);
  assert.ok(!result.tools.some(tool=>tool.id==='ZERO'));assert.ok(result.sites.every(site=>site.assigned_engineer_id===f.actors.sky.id&&site.id!==f.sites.office));
 });
 await t.test('Office remains excluded even when its display name and assignment resemble an authorized project',async()=>{
  await f.db.query('update sites set name=$1,assigned_engineer_id=$2 where id=$3',['Synthetic Renamed Office Project',f.actors.sky.id,f.sites.office]);
  const result=await read(f.actors.sky);assert.ok(!includes(result,'Synthetic Office Drill'));assert.ok(!result.sites.some(site=>site.id===f.sites.office));
 });
 await t.test('Request catalog retains eligible Office stock and inventory reads do not alter Admin records',async()=>{
  const adminBefore=await f.rpc(f.actors.admin,'mcpa_movement_snapshot'),requestBefore=await f.call(f.actors.sky,'mcpa_wa_equipment_catalog');
  const group=requestBefore.groups.find(item=>item.type_name==='Synthetic Office Drill');assert.equal(group.available_quantity,1);
  await read(f.actors.sky);
  assert.deepEqual(await f.rpc(f.actors.admin,'mcpa_movement_snapshot'),adminBefore);assert.deepEqual(await f.call(f.actors.sky,'mcpa_wa_equipment_catalog'),requestBefore);
 });
 await t.test('Project reassignment/archival excludes available stock while preserving own custody',async()=>{
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[f.actors.pau.id,f.sites.casa]);
  assert.ok(!includes(await read(f.actors.sky),'Synthetic Assigned Project Drill'));assert.ok(includes(await read(f.actors.sky),'Synthetic Own Custody Drill'));
  await f.db.query('update sites set assigned_engineer_id=$1,archived_at=now() where id=$2',[f.actors.sky.id,f.sites.casa]);
  assert.ok(!includes(await read(f.actors.sky),'Synthetic Assigned Project Drill'));
 });
 await t.test('Other roles, anonymous callers and inactive Engineers cannot use the reader',async()=>{
  for(const actor of [f.actors.admin,f.actors.architect,f.actors.secretary,f.actors.handler,null].filter(actor=>actor!==undefined))await assert.rejects(read(actor));
  await f.db.query("update profiles set account_status='inactive' where id=$1",[f.actors.sky.id]);await assert.rejects(read(f.actors.sky));
 });
});
