const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610050001_legacy_handover_lockdown.sql'),'utf8');

const {legacyDatabase:fixture}=require('./legacy-test-db.cjs');

test('legacy lockdown preserves constrained identities/history and current receipt workflow; repeatable',async()=>{
 const f=await fixture(),{db,query,rpc,actors:a,legacyId}=f;
 try{
  assert.equal((await query(null,'select count(*)::int n from equipment_history')).rows[0].n,1,'Reproduces anonymous history access');
  const tables=['profiles','equipment','equipment_history','equipment_transfers'];
  const before=await Promise.all(tables.map(t=>db.query(`select * from ${t} order by id`)));
  const constraintsBefore=(await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname")).rows;
  const functionsBefore=(await db.query("select pg_get_functiondef('public.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) definition")).rows;
  await db.exec(migration);await db.exec(migration);
  for(let i=0;i<tables.length;i++)assert.deepEqual((await db.query(`select * from ${tables[i]} order by id`)).rows,before[i].rows);
  assert.deepEqual((await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname")).rows,constraintsBefore);
  assert.deepEqual((await db.query("select pg_get_functiondef('public.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) definition")).rows,functionsBefore);
  for(const actor of [null,a.admin,a.sky,a.pau,a.inactive]){
   await assert.rejects(()=>query(actor,'select complete_equipment_handover($1)',[legacyId]),/permission denied/);
   for(const table of ['equipment_history','equipment_transfers']){
    await assert.rejects(()=>query(actor,`select id from ${table}`),/permission denied/);
    await assert.rejects(()=>query(actor,`delete from ${table}`),/permission denied/);
   }
   await assert.rejects(()=>query(actor,"update equipment_history set action='FORGED'"),/permission denied/);
   await assert.rejects(()=>query(actor,"insert into equipment_history(action) values('FORGED')"),/permission denied/);
  }
  assert.equal((await rpc(a.admin,'mcpa_my_profile')).id,a.admin.id);
  const act=(actor,action,payload)=>rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  const transfer=await act(a.sky,'createTransfer',{toolIds:['TOOL-003'],destination:'Main Warehouse',receiver:a.pau.name});
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-003',condition:'good'}]}),/Test every/);
  await act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-003',condition:'good',tested:true}]});
  assert.equal((await rpc(a.admin,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-003').holderId,a.pau.id);
  assert.equal((await db.query('select status from equipment_transfers where id=$1',[legacyId])).rows[0].status,'PENDING','Legacy rows remain unchanged');
  const accountsMigration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610060001_account_management.sql'),'utf8');
  await assert.rejects(()=>db.exec(accountsMigration),/profiles.id still references auth.users/);
  await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.mcpa_account_invitations') as table_name")).rows[0].table_name,null,'Account migration stops before creating tables');
 }finally{await f.close();}
});

test('unexpected inherited legacy access aborts the whole lockdown',async()=>{
 const f=await fixture(),{db}=f;
 try{
  await db.exec('create role legacy_access nologin;grant execute on function complete_equipment_handover(uuid) to legacy_access;grant legacy_access to authenticated;');
  await assert.rejects(()=>db.exec(migration),/Unexpected inherited legacy RPC access/);
  await db.exec('rollback');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='equipment_history'::regclass")).rows[0].relrowsecurity,false,'RLS change rolled back');
  assert.equal((await db.query("select has_table_privilege('anon','equipment_history','UPDATE') access")).rows[0].access,true,'Grant changes rolled back');
 }finally{await f.close();}
});
