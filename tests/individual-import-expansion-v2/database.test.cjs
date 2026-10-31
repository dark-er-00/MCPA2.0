const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,webcrypto}=require('node:crypto');
const {fixture}=require('../quantity-requests-v2/database-fixture.cjs');
const C=require('../../js/upgrades/individual-import-expansion/core.js'),{create}=require('../../js/upgrades/individual-import-expansion/controller.js');
const row=(patch={})=>({source_row:2,name:'Shovel (Pala, Lapad)',category:'Hand Tools',brand:'',model:'',serial_number:'',condition:'Not Assessed',tracking_type:'Individual',quantity:20,...patch});
const imports=(f,actor,rows,operation=randomUUID())=>f.wa(actor,'mcpa_import_equipment_v2',{p_operation_id:operation,p_rows:JSON.stringify(rows)});
const counts=async f=>(await f.db.query('select (select count(*) from equipment) as equipment,(select count(*) from mcpa_equipment_imports) as imports,(select count(*) from mcpa_wa_import_operations) as expansions')).rows[0];
test('Workstream A import v2 actual migration in disposable PGlite',async t=>{
  const f=await fixture();t.after(()=>f.close());
  await t.test('Individual expands, Bulk groups, IDs and original source provenance survive receipt recovery',async()=>{
    const op=randomUUID(),result=await imports(f,f.actors.admin,[row({source_row:7}),row({source_row:19,name:'GI Pipes',tracking_type:'Bulk',quantity:225,unit:'Pieces',condition:'Fair'})],op);
    assert.equal(result.created,21);assert.equal(result.spreadsheet_rows,2);assert.equal(result.expanded_records,21);assert.equal(result.rejected,0);
    assert.equal(new Set(result.assets.map(a=>a.id)).size,21);assert.equal(new Set(result.assets.map(a=>a.asset_id)).size,21);
    assert.deepEqual(result.assets.slice(0,20).map(a=>[a.source_row,a.expansion_index,a.quantity]),Array.from({length:20},(_,i)=>[7,i+1,1]));
    assert.deepEqual([result.assets[20].source_row,result.assets[20].expansion_index,result.assets[20].quantity],[19,1,225]);
    for(const a of result.assets)assert.match(a.asset_id,/^T-[A-F0-9]{16}$/);
    const saved=(await f.db.query('select * from equipment where id=any($1::uuid[])',[result.assets.map(a=>a.id)])).rows;
    assert.ok(saved.every(a=>a.site_id===f.sites.office&&a.status==='AVAILABLE'&&a.current_holder_id===null&&a.brand===''&&a.model===''&&a.serial_number===''));
    assert.equal(saved.filter(a=>a.condition==='Not Assessed').length,20);
    assert.deepEqual(await f.wa(f.actors.admin,'mcpa_import_equipment_v2_receipt',{p_operation_id:op}),result);
    const base=(await f.query(f.actors.admin,'select result from mcpa_equipment_imports where operation_id=$1',[op])).rows[0].result;
    assert.equal(base.assets.length,21,'Existing authoritative receipt retained');
    assert.deepEqual((await f.query(f.actors.admin,'select result from mcpa_wa_import_operations where operation_id=$1',[op])).rows[0].result,result);
    await assert.rejects(f.query(f.actors.admin,'delete from mcpa_wa_import_operations where operation_id=$1',[op]),/permission denied/);
    await assert.rejects(f.db.exec('delete from mcpa_wa_import_operations'),/immutable/);
  });
  await t.test('same original payload replays one exact receipt; changed payload and importer version reuse fail',async()=>{
    const rows=[row({quantity:2})],op=randomUUID(),first=await imports(f,f.actors.admin,rows,op),before=await counts(f);
    assert.deepEqual(await imports(f,f.actors.admin,rows,op),first);assert.deepEqual(await counts(f),before);
    await assert.rejects(imports(f,f.actors.admin,[row({quantity:3})],op),/different original/);
    await assert.rejects(f.rpc(f.actors.admin,'mcpa_import_equipment',{p_operation_id:op,p_rows:JSON.stringify([row({quantity:1})])}),/different account or payload/);
    const legacyOp=randomUUID();await f.rpc(f.actors.admin,'mcpa_import_equipment',{p_operation_id:legacyOp,p_rows:JSON.stringify([row({quantity:1})])});
    await assert.rejects(imports(f,f.actors.admin,[row({quantity:1})],legacyOp),/another importer version/);
    assert.equal((await imports(f,f.actors.admin,rows)).created,2,'A new explicit operation can register another physical set');
  });
  await t.test('roles, legacy single assets and 32-bit Bulk quantities retain compatibility',async()=>{
    const before=await counts(f);
    for(const actor of [f.actors.sky,f.actors.architect,f.actors.handler,f.actors.secretary,f.actors.inactive,null]){
      await assert.rejects(imports(f,actor,[row()]),error=>error.code==='42501');
      await assert.rejects(f.wa(actor,'mcpa_import_equipment_v2_receipt',{p_operation_id:randomUUID()}),error=>error.code==='42501');
    }
    assert.deepEqual(await counts(f),before);
    assert.equal((await imports(f,f.actors.admin,[row({quantity:1,serial_number:'000042'})])).assets[0].quantity,1);
    const bulk=await imports(f,f.actors.admin,[row({tracking_type:'Bulk',quantity:2147483647,unit:''})]);assert.equal(bulk.created,1);assert.equal(bulk.assets[0].quantity,2147483647);
    await assert.rejects(f.rpc(f.actors.admin,'mcpa_import_equipment',{p_operation_id:randomUUID(),p_rows:JSON.stringify([row({quantity:2})])}),/Individual quantity must be 1/);
  });
  await t.test('invalid source metadata, conditions, serials and constraints abort all physical records and both receipts',async()=>{
    const before=await counts(f);
    for(const patch of [{condition:''},{condition:undefined},{condition:'Invented'},{serial_number:'ONE-SERIAL'},{quantity:0},{quantity:1.5},{quantity:501},{quantity:2147483648},{name:''},{asset_id:'FORGED'},{status:'IN_USE'},{source_row:2}]){
      await assert.rejects(imports(f,f.actors.admin,[row({quantity:1}),row({source_row:3,...patch})]));assert.deepEqual(await counts(f),before);
    }
    await f.db.exec("create unique index fixture_wa_import_serial on equipment(serial_number) where serial_number='WORKSTREAM-A-SERIAL'");
    await imports(f,f.actors.admin,[row({quantity:1,serial_number:'WORKSTREAM-A-SERIAL'})]);const withSerial=await counts(f);
    await assert.rejects(imports(f,f.actors.admin,[row(),row({source_row:3,quantity:1,serial_number:'WORKSTREAM-A-SERIAL'})]),/unique/);assert.deepEqual(await counts(f),withSerial);
  });
  await t.test('500 source rows, 500 resulting records and original/expanded byte limits are enforced by SQL',async()=>{
    const before=await counts(f);
    await assert.rejects(imports(f,f.actors.admin,Array.from({length:501},(_,i)=>row({source_row:i+2,quantity:1}))),/500 spreadsheet/);
    await assert.rejects(imports(f,f.actors.admin,[row({quantity:500}),row({source_row:3,tracking_type:'Bulk',quantity:225})]),/500 physical/);
    const fat=row({name:'x'.repeat(240),brand:'x'.repeat(240),model:'x'.repeat(240),details:'💧'.repeat(1000),quantity:500});
    await assert.rejects(imports(f,f.actors.admin,[fat]),/Expanded payload.*2 MiB/);
    const original=Array.from({length:500},(_,i)=>({...fat,source_row:i+2,quantity:1}));
    await assert.rejects(imports(f,f.actors.admin,original),/at most 2 MiB/);assert.deepEqual(await counts(f),before);
  });
  await t.test('controller and actual SQL agree on receipt mapping and audit recovery contract',async()=>{
    const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
    const client={rpc:async(name,args)=>{try{return {data:await f.wa(f.actors.admin,name,{...args,...(args.p_rows?{p_rows:JSON.stringify(args.p_rows)}:{})})};}catch(error){return {error};}}};
    const controller=create({client,storage,crypto:webcrypto,requireActor:()=>f.actors.admin});
    const sheet=C.parse(Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\nShovel,Hand Tools,Individual,3,Not Assessed\nGI Pipes,Construction Materials,Bulk,225,Fair'),'csv')[0];
    const mapping=C.autoMap(sheet.headers),preview=C.validate(sheet,mapping);
    const bytes=(await f.db.query('select octet_length($1::jsonb::text) as n',[JSON.stringify(preview.rows.map(r=>r.data))])).rows[0].n;
    assert.equal(preview.payloadBytes,bytes,'Client counts the actual JSONB separators used in the server byte limit');
    const result=await controller.confirm({sheet,mapping});assert.equal(result.created,4);assert.equal(controller.pending(),null);
  });
});
