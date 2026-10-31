const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs'),{upgrade,row,importRows}=require('./equipment-import-fixture.cjs');
async function setup(t){const f=await authDatabase({engineerPortal:true});t.after(()=>f.close());await upgrade(f);return f;}
const counts=async f=>(await f.db.query('select (select count(*) from equipment) as equipment,(select count(*) from mcpa_movements) as movements,(select count(*) from mcpa_equipment_imports) as imports')).rows[0];
test('migration fails closed on policy drift or name uniqueness without rewriting equipment',async t=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const extra of ["create policy fixture_unreviewed on equipment for insert to authenticated with check(true)","create unique index fixture_name_unique on equipment(name)"]){
    const f=await authDatabase({engineerPortal:true});t.after(()=>f.close());
    await require('./office-return-fixture.cjs').configure(f);
    await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120004_equipment_office_default.sql'),'utf8'));
    const before=(await f.db.query('select * from equipment order by id')).rows;
    await f.db.exec(extra);
    await assert.rejects(f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610240001_equipment_import.sql'),'utf8')),/INSERT policies|unique equipment-name/);
    await f.db.exec('rollback');
    assert.equal((await f.db.query("select to_regclass('public.mcpa_equipment_imports') as table_name")).rows[0].table_name,null);
    assert.deepEqual((await f.db.query('select * from equipment order by id')).rows,before);
  }
});
test('same-name assets get real compatible tags, UUIDs, safe Office defaults and an immutable Admin receipt',async t=>{
  const f=await setup(t),before=await counts(f);
  const old=(await f.db.query('select * from equipment order by asset_id')).rows;
  const result=await importRows(f,f.actors.admin,[row(),row({source_row:3}),row({source_row:4})]);
  assert.equal(result.created,3);assert.equal(result.rejected,0);assert.equal(result.actor_id,f.actors.admin.id);
  assert.equal(new Set(result.assets.map(r=>r.asset_id)).size,3);
  for(const a of result.assets){assert.match(a.asset_id,/^T-[0-9A-F]{16}$/);assert.match(a.id,/^[0-9a-f-]{36}$/);assert.notEqual(a.id,a.asset_id);}
  const all=(await f.db.query('select * from equipment order by asset_id')).rows;
  for(const a of result.assets){const e=all.find(e=>e.id===a.id);assert.equal(e.name,'Electric Drill');assert.equal(e.brand,'Bosch');assert.equal(e.status,'AVAILABLE');assert.equal(e.site_id,f.sites.office);assert.equal(e.current_holder_id,null);}
  assert.deepEqual(all.filter(e=>!result.assets.some(a=>a.id===e.id)),old);
  assert.equal((await counts(f)).movements,before.movements);
  const receipt=(await f.query(f.actors.admin,'select * from mcpa_equipment_imports')).rows[0];assert.deepEqual(receipt.result,result);assert.equal(receipt.payload_digest.length,64);assert.equal(receipt.payload,undefined);
  await assert.rejects(f.query(f.actors.admin,'delete from mcpa_equipment_imports'),/permission denied/);
  await assert.rejects(f.db.exec('delete from mcpa_equipment_imports'),/immutable/);
  const manual=(await f.query(f.actors.admin,"insert into equipment(id,asset_id,name) values($1,'T-1111111111114111','Electric Drill') returning *",[randomUUID()])).rows[0];assert.equal(manual.asset_id,'T-1111111111114111');
  const generated=(await f.query(f.actors.admin,"insert into equipment(id,name) values($1,'Server manual') returning *",[randomUUID()])).rows[0];assert.match(generated.asset_id,/^T-[A-F0-9]{16}$/);
  const snapshot=await f.rpc(f.actors.admin,'mcpa_movement_snapshot');assert.ok(snapshot.tools.some(r=>r.id===result.assets[0].asset_id&&r.dbId===result.assets[0].id));
});
test('retry is idempotent, different payload/account rejected, distinct operation intentionally creates identical tools',async t=>{
  const f=await setup(t),operation=randomUUID(),rows=[row()];
  const first=await importRows(f,f.actors.admin,rows,operation),before=await counts(f);
  assert.deepEqual(await importRows(f,f.actors.admin,rows,operation),first);assert.deepEqual(await counts(f),before);
  await assert.rejects(importRows(f,f.actors.admin,[row({brand:'Makita'})],operation),/different account or payload/);
  const second=await importRows(f,f.actors.admin,rows);assert.notEqual(second.assets[0].asset_id,first.assets[0].asset_id);
  await f.db.query("update profiles set role='admin' where id=$1",[f.actors.pau.id]);
  await assert.rejects(importRows(f,f.actors.pau,rows,operation),/different account or payload/);
});
test('simultaneously submitted manual/import operations and retries produce unique records',async t=>{
  const f=await setup(t),op=randomUUID();
  const submitted=await Promise.all([
    importRows(f,f.actors.admin,[row()],op),importRows(f,f.actors.admin,[row()],op),
    ...Array.from({length:8},()=>importRows(f,f.actors.admin,[row()])),
    f.query(f.actors.admin,"insert into equipment(id,name) values($1,'Manual') returning asset_id",[randomUUID()])
  ]);
  assert.deepEqual(submitted[0],submitted[1]);
  const ids=submitted.slice(1,-1).flatMap(r=>r.assets.map(a=>a.asset_id)).concat(submitted.at(-1).rows[0].asset_id);assert.equal(new Set(ids).size,10);
});
test('all non-Admin roles, inactive and anonymous calls fail without changing inventory or audit',async t=>{
  const f=await setup(t),before=await counts(f);
  for(const actor of [f.actors.handler,f.actors.sky,f.actors.architect,f.actors.secretary,f.actors.inactive,null]){
    await assert.rejects(importRows(f,actor,[row()]),/Admin|active|permission denied|Authentication/);
    assert.deepEqual(await counts(f),before);
  }
  for(const actor of [f.actors.handler,f.actors.sky,f.actors.architect])assert.equal((await f.query(actor,'select * from mcpa_equipment_imports')).rows.length,0);
  await assert.rejects(f.query(f.actors.handler,"insert into mcpa_equipment_imports values($1,$2,now(),'fake','{}')",[randomUUID(),f.actors.handler.id]),/permission denied/);
});
test('RPC rejects a NULL Admin role even if the identity helper unexpectedly returns one',async t=>{
  const f=await setup(t),before=await counts(f);
  // Isolated helper fault injection: the normal identity helper already rejects
  // NULL roles. Return a real active profile with only role cleared so this test
  // exercises the RPC guard itself, rather than an earlier helper rejection.
  await f.db.exec(`create or replace function mcpa_auth_private.identity()
    returns public.profiles language plpgsql stable security definer set search_path='' as $$
    declare p public.profiles; begin
      select * into p from public.profiles where auth_user_id=auth.uid();
      p.role:=null; return p;
    end $$`);
  await assert.rejects(importRows(f,f.actors.admin,[row()]),e=>e.code==='42501'&&/Only Admin/.test(e.message));
  assert.deepEqual(await counts(f),before,'No inventory, movement or import receipt is written');
});
test('RPC explicitly rejects a NULL canonical Office and missing real Office configuration',async t=>{
  const f=await setup(t),before=await counts(f),operation=randomUUID();
  const original=(await f.db.query("select pg_get_functiondef('mcpa_auth_private.office_return_site()'::regprocedure) as definition")).rows[0].definition;
  // A NULL composite return must fail at the RPC boundary, before the INSERT
  // trigger can attempt another Office default or privileged INSERT bypasses RLS.
  await f.db.exec(`create or replace function mcpa_auth_private.office_return_site()
    returns public.sites language sql security definer set search_path='' as $$ select null::public.sites $$`);
  await assert.rejects(importRows(f,f.actors.admin,[row()],operation),e=>e.code==='22023'&&/Canonical Office inventory configuration is missing/.test(e.message));
  assert.deepEqual(await counts(f),before);
  await f.db.exec(original);
  await f.db.exec('delete from mcpa_auth_private.return_office');
  await assert.rejects(importRows(f,f.actors.admin,[row()],operation),e=>e.code==='22023'&&/Office.*unavailable/.test(e.message));
  assert.deepEqual(await counts(f),before,'Missing configuration also leaves inventory, movement and audit unchanged');
  await f.db.query('insert into mcpa_auth_private.return_office(singleton,site_id) values(true,$1)',[f.sites.office]);
  const saved=await importRows(f,f.actors.admin,[row()],operation);
  assert.equal(saved.created,1,'Rejected operation can be retried after configuration repair');
  await f.db.exec('delete from mcpa_auth_private.return_office');const committed=await counts(f);
  assert.deepEqual(await importRows(f,f.actors.admin,[row()],operation),saved,'Committed receipt recovery still works without a new registration or Office lookup');
  assert.deepEqual(await counts(f),committed);
});
test('serial numbers remain literal metadata: duplicates warn unless a real schema identifier constraint rejects them',async t=>{
  const f=await setup(t),C=require('../js/equipment-import-core.js');
  const rows=[row({serial_number:'000042'}),row({source_row:3,serial_number:'000042'}),row({source_row:4,serial_number:''}),row({source_row:5})];
  const sheet=C.csv('Item Name,Category,Tracking Type,Serial Number\nElectric Drill,Power Tools,Individual,000042\nElectric Drill,Power Tools,Individual,000042');
  const preview=C.validate(sheet,C.autoMap(sheet.headers));
  assert.equal(preview.valid,2);assert.equal(preview.duplicates,1);assert.ok(preview.rows[1].warnings.some(w=>w.includes('Serial number')));
  const first=await importRows(f,f.actors.admin,rows);
  assert.equal(new Set(first.assets.map(a=>a.asset_id)).size,4);
  const saved=(await f.db.query('select serial_number from equipment where id=any($1::uuid[])',[first.assets.map(a=>a.id)])).rows;
  assert.equal(saved.filter(r=>r.serial_number==='000042').length,2);assert.equal(saved.filter(r=>r.serial_number==='').length,2);
  assert.equal(C.validate(sheet,C.autoMap(sheet.headers),[{serial_number:'000042'}]).duplicates,2,'Existing serials warn too');
  // Use another literal identifier to avoid creating a constraint over the
  // legitimate duplicates above; the existing real-conflict test covers a batch.
  await f.db.exec("create unique index fixture_specific_serial on equipment(serial_number) where serial_number='UNIQUE-SERIAL'");
  await importRows(f,f.actors.admin,[row({serial_number:'UNIQUE-SERIAL'})]);const before=await counts(f);
  await assert.rejects(importRows(f,f.actors.admin,[row({serial_number:'OTHER'}),row({source_row:3,serial_number:'UNIQUE-SERIAL'})]),/row 3.*unique/);
  await assert.rejects(importRows(f,f.actors.admin,[row({serial_number:42})]),/serial_number must be text/);
  assert.deepEqual(await counts(f),before,'Existing-inventory identifier conflict rolls back every row');
});
test('actual generated XLSX template and its CSV export map only to accepted RPC fields and register valid examples',async t=>{
  const f=await setup(t),C=require('../js/equipment-import-core.js'),X=require('../vendor/sheetjs/xlsx.full.min.js');
  const template=await require('./equipment-import-fixture.cjs').generatedTemplate();
  assert.equal(template.name,'MCPA-equipment-template.xlsx');
  assert.equal(template.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const book=X.read(template.bytes,{type:'buffer'}),sheets=C.workbook(template.bytes,X);
  assert.deepEqual(book.SheetNames,['Equipment','Examples - do not import','Instructions']);
  const equipment=sheets.find(s=>s.name==='Equipment'),examples=sheets.find(s=>s.name==='Examples - do not import');
  assert.deepEqual(equipment.headers,Object.values(C.fields));assert.equal(equipment.rows.length,0,'Download starts with an empty real-inventory sheet');
  assert.equal(examples.rows.length,2);
  const instructions=X.utils.sheet_to_csv(book.Sheets.Instructions);
  assert.match(instructions,/Examples are illustrative and must not be imported/);
  assert.match(instructions,/Required columns: Item Name, Category, Tracking Type/);
  assert.match(instructions,/optional Unit/);assert.match(instructions,/date columns are excluded/);
  const definition=(await f.db.query("select pg_get_functiondef('public.mcpa_import_equipment(uuid,jsonb)'::regprocedure) as definition")).rows[0].definition;
  const accepted=[...definition.match(/if k not in \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(accepted,['source_row',...Object.keys(C.fields)],'All generated headings match the actual installed RPC whitelist');
  const csv=C.csv(X.utils.sheet_to_csv(book.Sheets['Examples - do not import']));
  for(const sheet of [examples,csv]){
    const mapping=C.autoMap(sheet.headers),validation=C.validate(sheet,mapping);
    assert.deepEqual(Object.values(mapping),Object.keys(C.fields));
    assert.deepEqual(validation.errors,[]);assert.equal(validation.invalid,0);
    assert.deepEqual(validation.rows.map(r=>[r.data.tracking_type,r.data.quantity,r.data.unit]),[['Individual',1,''],['Bulk',5,'Pieces']]);
    assert.ok(validation.rows.every(r=>Object.keys(r.data).every(k=>accepted.includes(k))));
    // These marked example rows run ONLY in this disposable database.
    const result=await importRows(f,f.actors.admin,validation.rows.map(r=>r.data));
    assert.equal(result.created,2);assert.deepEqual(result.assets.map(a=>a.quantity),[1,5]);
    assert.ok(result.assets.every(a=>/^T-[A-F0-9]{16}$/.test(a.asset_id)));
  }
  assert.equal(Number((await f.db.query('select count(distinct asset_id) as n from equipment where name like $1',['Example %'])).rows[0].n),4);
});
test('invalid and forged rows roll back the complete batch; no partial success or ID reservations',async t=>{
  const f=await setup(t),before=await counts(f);
  for(const patch of [
    {name:''},{category:'Unknown'},{tracking_type:'individual'},{quantity:0},{quantity:2},{quantity:1.5},{quantity:'1'},{quantity:2147483648},
    {condition:'Broken'},{unit:'Pieces'},{details:'x'.repeat(2001)},{brand:'=HYPERLINK("bad")'},{name:123},{name:null},
    {site_id:f.sites.casa},{current_holder_id:f.actors.sky.id},{asset_id:'FORGED'},{id:randomUUID()},{status:'IN_USE'},{acquisition_date:'2026-10-24'},
    {tracking_type:'Bulk',quantity:3,unit:'Invalid'}
  ]){
    await assert.rejects(importRows(f,f.actors.admin,[row(),row({source_row:3,...patch})]),/row 3:.*No rows were imported/);
    assert.deepEqual(await counts(f),before);
  }
  for(const rows of [[],{},null,Array.from({length:501},(_,i)=>row({source_row:i+2})),[row(),row()],[row({source_row:1})],[row({source_row:'2'})]])await assert.rejects(importRows(f,f.actors.admin,rows));
  assert.deepEqual(await counts(f),before);
  const op=randomUUID();await assert.rejects(importRows(f,f.actors.admin,[row({name:''})],op));assert.equal((await importRows(f,f.actors.admin,[row()],op)).created,1);
});
test('bulk stays grouped; current schema serial conflicts abort atomically, and imported assets use existing movement workflow',async t=>{
  const f=await setup(t);
  const grouped=await importRows(f,f.actors.admin,[row({tracking_type:'Bulk',quantity:5,unit:'Pieces',condition:'Fair'})]);
  assert.equal(grouped.assets.length,1);assert.equal(grouped.assets[0].quantity,5);
  assert.equal((await importRows(f,f.actors.admin,[row({tracking_type:'Bulk',quantity:2})])).assets[0].quantity,2,'Manual creation accepts an empty Bulk unit');
  await f.db.exec("create unique index fixture_serial on equipment(serial_number) where serial_number<>''");
  const before=await counts(f);
  await assert.rejects(importRows(f,f.actors.admin,[row({serial_number:'SAME'}),row({source_row:3,serial_number:'SAME'})]),/row 3.*unique/);assert.deepEqual(await counts(f),before);
  const imported=await importRows(f,f.actors.admin,[row({serial_number:'REAL-SERIAL'})]);
  const asset=imported.assets[0];
  const act=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
  const req=await act(f.actors.sky,'createRequest',{toolIds:[asset.asset_id],destination:'Casa Buena',purpose:'Imported tool local test'});
  await act(f.actors.admin,'approveRequest',{id:req.id});await act(f.actors.admin,'releaseRequest',{id:req.id});
  const snapshot=await f.rpc(f.actors.sky,'mcpa_movement_snapshot'),transfer=snapshot.transfers.find(r=>r.requestId===req.id);
  await act(f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:asset.asset_id,condition:'good',tested:true,notes:'Tested imported tool'}]});
  await act(f.actors.sky,'createReturn',{toolIds:[asset.asset_id],conditions:[{toolId:asset.asset_id,condition:'good',notes:''}],notes:'Inspected return'});
  const final=(await f.db.query('select * from equipment where id=$1',[asset.id])).rows[0];assert.equal(final.site_id,f.sites.office);assert.equal(final.status,'AVAILABLE');assert.equal(final.current_holder_id,null);
});
