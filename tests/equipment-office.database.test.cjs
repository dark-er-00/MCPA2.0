const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120004_equipment_office_default.sql'),'utf8');
const correction=fs.readFileSync(path.join(__dirname,'../supabase/equipment-office-confirmed-correction.sql'),'utf8');
async function setup(t,{textStatus=false,install=true}={}){
  const f=await authDatabase({engineerPortal:true});t.after(()=>f.close());
  await require('./office-return-fixture.cjs').configure(f);
  if(textStatus)await f.db.exec("drop policy mcpa_equipment_insert on equipment;alter table equipment alter column status drop default;alter table equipment alter column status type text using status::text;alter table equipment alter column status set default 'AVAILABLE';create policy mcpa_equipment_insert on equipment for insert to authenticated with check(mcpa_has_role(array['admin','tool_handler']) and current_holder_id is null and site_id is null and status='AVAILABLE');");
  await f.db.query("insert into equipment(id,asset_id,name,status) values($1,'T-8862','Welding Machine','AVAILABLE')",[randomUUID()]);
  if(install)await f.db.exec(migration);
  return f;
}
const insert=(f,actor,asset='NEW-STOCK',extra='',values=[])=>f.query(actor,`insert into equipment(id,asset_id,name,quantity${extra}) values($1,$2,'New stock',7${values.map((_,i)=>',$'+(i+3)).join('')}) returning *`,[randomUUID(),asset,...values]);
test('new authenticated inventory defaults to canonical Office with TEXT and enum status; repeat deployment is safe',async t=>{
  for(const textStatus of [false,true]){
    const f=await setup(t,{textStatus});await f.db.exec(migration);
    for(const actor of [f.actors.admin,f.actors.handler]){
      const row=(await insert(f,actor,'NEW-'+actor.role)).rows[0];
      assert.equal(row.site_id,f.sites.office);assert.equal(row.quantity,7);assert.equal(row.current_holder_id,null);assert.equal(row.status,'AVAILABLE');
    }
    const info=await f.rpc(f.actors.admin,'mcpa_inventory_office');assert.equal(info.id,f.sites.office);assert.equal(info.label,'Office');
    assert.equal((await f.db.query("select site_id from equipment where asset_id='T-8862'")).rows[0].site_id,null,'No automatic backfill');
  }
});
test('forged project, custody and status insert payloads fail; Engineer/Architect/Secretary/anonymous cannot insert',async t=>{
  const f=await setup(t);
  for(const [extra,values] of [[',site_id',[f.sites.casa]],[',current_holder_id',[f.actors.sky.id]],[',status',['MISSING']]])await assert.rejects(insert(f,f.actors.admin,randomUUID(),extra,values),/row-level security/);
  for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect,f.actors.secretary,null])await assert.rejects(insert(f,actor),/permission denied|row-level security/);
  for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect])assert.equal((await f.rpc(actor,'mcpa_inventory_office')).id,f.sites.office);
  for(const actor of [f.actors.secretary,f.actors.inactive,null])await assert.rejects(f.rpc(actor,'mcpa_inventory_office'));
});
test('existing locations, assignments, custody, quantities and historical ledgers survive migration and metadata edits',async t=>{
  const f=await setup(t,{install:false});
  const before=(await f.db.query('select * from equipment order by asset_id')).rows;
  const history=(await f.db.query('select * from project_history order by id')).rows;
  const sites=(await f.db.query('select * from sites order by id')).rows;
  await f.db.exec(migration);
  assert.deepEqual((await f.db.query('select * from equipment order by asset_id')).rows,before);
  assert.deepEqual((await f.db.query('select * from sites order by id')).rows,sites);
  assert.deepEqual((await f.db.query('select * from project_history order by id')).rows,history);
  await f.query(f.actors.admin,"update equipment set brand='Updated' where asset_id='TOOL-002'");
  const row=(await f.db.query("select * from equipment where asset_id='TOOL-002'")).rows[0];
  const old=before.find(item=>item.asset_id==='TOOL-002');assert.equal(row.site_id,old.site_id);assert.equal(row.current_holder_id,old.current_holder_id);assert.equal(row.quantity,old.quantity);
});
test('trusted imports preserve explicit project and active or missing custody instead of defaulting it',async t=>{
  const f=await setup(t);
  await f.db.query("insert into equipment(id,asset_id,name,site_id) values($1,'IMPORT','Import',$2)",[randomUUID(),f.sites.casa]);
  await f.db.query("insert into equipment(id,asset_id,name,status,current_holder_id) values($1,'HELD','Held','IN_USE',$2),($3,'LOST','Lost','MISSING',$2)",[randomUUID(),f.actors.sky.id,randomUUID()]);
  const rows=(await f.db.query("select asset_id,site_id from equipment where asset_id in ('IMPORT','HELD','LOST') order by asset_id")).rows;
  assert.equal(rows.find(r=>r.asset_id==='IMPORT').site_id,f.sites.casa);assert.equal(rows.find(r=>r.asset_id==='HELD').site_id,null);assert.equal(rows.find(r=>r.asset_id==='LOST').site_id,null);
});
test('missing/inactive Office fails closed; unknown policies cannot be replaced',async t=>{
  const f=await setup(t);
  await f.db.query('update sites set is_active=false where id=$1',[f.sites.office]);
  await assert.rejects(insert(f,f.actors.admin),/Office.*unavailable/);await assert.rejects(f.rpc(f.actors.sky,'mcpa_inventory_office'),/Office.*unavailable/);
  await f.db.query('update sites set is_active=true where id=$1',[f.sites.office]);
  await f.db.exec('create policy unintended_insert on equipment for insert to authenticated with check(true)');
  await assert.rejects(f.db.exec(migration),/Unexpected equipment insert/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select count(*) as n from equipment where asset_id='NEW-STOCK'")).rows[0].n,0);
});
test('confirmed correction changes only T-8862 current site; quantity, custody and all history remain intact; retries are safe',async t=>{
  const f=await setup(t);
  const before=(await f.db.query('select * from equipment order by asset_id')).rows;
  const historyBefore=(await f.db.query("select (select jsonb_agg(m) from mcpa_movements m) as moves,(select jsonb_agg(a) from mcpa_movement_assets a) as assets,(select jsonb_agg(p) from project_history p) as projects")).rows;
  await f.db.exec(correction);await f.db.exec(correction);
  assert.deepEqual((await f.db.query('select * from equipment order by asset_id')).rows,before.map(row=>row.asset_id==='T-8862'?{...row,site_id:f.sites.office}:row));
  assert.deepEqual((await f.db.query("select (select jsonb_agg(m) from mcpa_movements m) as moves,(select jsonb_agg(a) from mcpa_movement_assets a) as assets,(select jsonb_agg(p) from project_history p) as projects")).rows,historyBefore);
  const snapshot=await f.rpc(f.actors.sky,'mcpa_movement_snapshot');assert.equal(snapshot.tools.find(t=>t.id==='T-8862').site,'Main Office');
});
test('confirmed correction refuses changed project, holder, status, zero quantity and pending reservations',async t=>{
  const f=await setup(t);
  for(const [assignment,values] of [['site_id=$1',[f.sites.casa]],['current_holder_id=$1',[f.actors.sky.id]],["status='MISSING'",[]],['quantity=0',[]]]){
    await f.db.query(`update equipment set ${assignment} where asset_id='T-8862'`,values);
    await assert.rejects(f.db.exec(correction),/active custody\/workflow/);await f.db.exec('rollback');
    await f.db.exec("update equipment set site_id=null,current_holder_id=null,status='AVAILABLE',quantity=1 where asset_id='T-8862'");
  }
  const request=await f.rpc(f.actors.sky,'mcpa_movement_action',{p_action:'createRequest',p_payload:{toolIds:['T-8862'],destination:'Casa Buena',purpose:'Local reservation test'},p_operation_id:randomUUID()});
  await f.rpc(f.actors.admin,'mcpa_movement_action',{p_action:'approveRequest',p_payload:{id:request.id},p_operation_id:randomUUID()});
  await assert.rejects(f.db.exec(correction),/active custody\/workflow/);await f.db.exec('rollback');
  assert.equal((await f.db.query("select site_id from equipment where asset_id='T-8862'")).rows[0].site_id,null);
});
test('new Office Bulk asset completes request approval, notification, tested receipt, receiving QR transfer and inspected return without changing quantity',async t=>{
  const f=await setup(t);
  for(const file of ['202610100006_monitoring.sql','202610120001_request_turnover_notifications.sql'])await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  const act=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
  const created=(await insert(f,f.actors.admin)).rows[0];
  const request=await act(f.actors.sky,'createRequest',{toolIds:[created.asset_id],destination:'Casa Buena',purpose:'Office asset workflow'});
  await act(f.actors.admin,'approveRequest',{id:request.id});
  await act(f.actors.admin,'releaseRequest',{id:request.id});
  const snapshot=await f.rpc(f.actors.sky,'mcpa_movement_snapshot'),transfer=snapshot.transfers.find(row=>row.requestId===request.id);
  assert.equal(transfer.source[0].siteId,f.sites.office);assert.equal(transfer.source[0].qty,7);
  const notices=await f.rpc(f.actors.sky,'mcpa_monitoring_snapshot');assert.ok(notices.notifications.some(row=>row.entityId===transfer.id));
  await assert.rejects(act(f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:created.asset_id,condition:'good',tested:false}]}),/Test every received tool/);
  await act(f.actors.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:created.asset_id,condition:'good',tested:true,notes:'Tested local stock'}]});
  const receiving=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'QR fixture project','Local only',$2,$3)",[receiving,f.actors.pau.name,f.actors.pau.id]);
  const qr=await f.rpc(f.actors.pau,'mcpa_create_receiving_qr',{p_site_id:receiving});
  const sent=await act(f.actors.sky,'createTransfer',{toolIds:[created.asset_id],receiverId:f.actors.pau.id,destination:'QR fixture project',receivingToken:qr.token});
  assert.equal(sent.destinationId,receiving);
  await act(f.actors.pau,'receiveTransfer',{id:sent.id,inspections:[{toolId:created.asset_id,condition:'good',tested:true,notes:'QR receipt tested'}]});
  const returned=await act(f.actors.pau,'createReturn',{toolIds:[created.asset_id],conditions:[{toolId:created.asset_id,condition:'good',notes:''}],notes:'Inspected at Office'});
  assert.equal(returned.destinationId,f.sites.office);
  const final=(await f.db.query('select * from equipment where id=$1',[created.id])).rows[0];
  assert.equal(final.quantity,7);assert.equal(final.site_id,f.sites.office);assert.equal(final.status,'AVAILABLE');assert.equal(final.current_holder_id,null);
  const activity=(await f.rpc(f.actors.admin,'mcpa_movement_snapshot')).activity;
  for(const action of ['createRequest','approveRequest','releaseRequest','receiveTransfer','createTransfer','createReturn'])assert.ok(activity.some(row=>row.action===action && row.toolIds.includes(created.asset_id)),action+' remains in activity history');
});
