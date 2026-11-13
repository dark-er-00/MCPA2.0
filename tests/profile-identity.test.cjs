const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {legacyDatabase}=require('./legacy-test-db.cjs');
const sql=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
const lockdown=sql('202610050001_legacy_handover_lockdown.sql');
const identity=sql('202610050002_independent_profile_identity.sql');

test('identity migration preserves existing records and authorizes independent profile IDs through Auth linkage',async()=>{
 const f=await legacyDatabase(),{db,actors:a,rpc,query}=f;
 try{
  const act=(actor,action,payload)=>rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  const pending=await act(a.sky,'createTransfer',{toolIds:['TOOL-003'],destination:'Main Warehouse',receiver:a.pau.name});
  await db.exec(lockdown);
  const tables=['profiles','equipment','equipment_history','equipment_transfers','mcpa_movements','mcpa_movement_assets','mcpa_movement_operations','mcpa_movement_reservations','sites'];
  const before=await Promise.all(tables.map(t=>db.query(`select to_jsonb(t) data from ${t} t order by to_jsonb(t)::text`)));
  const funcs=(await db.query("select oid,pg_get_functiondef(oid) definition from pg_proc where pronamespace in ('public'::regnamespace,'mcpa_auth_private'::regnamespace) and prokind='f' order by oid")).rows;
  await assert.rejects(()=>db.query('insert into profiles(id,name) values($1,$2)',[randomUUID(),'Independent Person']),/profiles_id_fkey/);
  await db.exec(identity);await db.exec(identity);
  for(let i=0;i<tables.length;i++)assert.deepEqual((await db.query(`select to_jsonb(t) data from ${tables[i]} t order by to_jsonb(t)::text`)).rows,before[i].rows,tables[i]+' preserved');
  assert.deepEqual((await db.query("select oid,pg_get_functiondef(oid) definition from pg_proc where pronamespace in ('public'::regnamespace,'mcpa_auth_private'::regnamespace) and prokind='f' order by oid")).rows,funcs,'No existing RPC definitions changed');
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='profiles'::regclass and conname='profiles_id_fkey'")).rows[0].n,0);
  assert.equal((await rpc(a.admin,'mcpa_my_profile')).id,a.admin.id);
  assert.equal((await rpc(a.sky,'mcpa_my_profile')).id,a.sky.id);
  await act(a.pau,'receiveTransfer',{id:pending.id,inspections:[{toolId:'TOOL-003',condition:'good',tested:true}]});
  const person={id:randomUUID(),authId:randomUUID(),name:'Independent Person'};
  await db.query('insert into profiles(id,name) values($1,$2)',[person.id,person.name]);
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'independent@example.test',now())",[person.authId]);
  await rpc(a.admin,'mcpa_save_account',{p_id:person.id,p_name:person.name,p_role:'engineer',p_status:'active',p_auth_user_id:person.authId});
  assert.equal((await rpc(person,'mcpa_my_profile')).id,person.id);
  const incoming=await act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiver:person.name});
  await act(person,'receiveTransfer',{id:incoming.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]});
  assert.equal((await rpc(a.admin,'mcpa_movement_snapshot')).tools.find(t=>t.id==='TOOL-002').holderId,person.id);
  await assert.rejects(()=>query(person,'select complete_equipment_handover($1)',[f.legacyId]),/permission denied/);
  // Exercise the retained ON DELETE SET NULL in the local fixture only.
  await db.query('delete from auth.users where id=$1',[person.authId]);
  assert.equal((await db.query('select auth_user_id from profiles where id=$1',[person.id])).rows[0].auth_user_id,null);
  assert.equal((await db.query("select current_holder_id from equipment where asset_id='TOOL-002'")).rows[0].current_holder_id,person.id);
  await assert.rejects(()=>rpc(person,'mcpa_movement_snapshot'),/active authorized/);
  // The subsequent account migration now passes its independence guard.
  await db.exec(sql('202610060001_account_management.sql'));
  await db.exec(sql('202610060002_recipient_identity.sql'));
  assert.equal((await rpc(a.admin,'mcpa_my_profile')).id,a.admin.id);
  const result=await act(a.sky,'createTransfer',{toolIds:['TOOL-004'],destination:'Main Warehouse',receiverId:a.pau.id});
  assert.equal(result.receiverId,a.pau.id);
 }finally{await f.close();}
});

test('identity migration refuses missing lockdown and mismatched constraint definitions',async()=>{
 const f=await legacyDatabase(),{db}=f;
 try{
  await assert.rejects(()=>db.exec(identity),/lockdown first/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conname='profiles_id_fkey'")).rows[0].n,1);
  await db.exec(lockdown);
  // Deliberately divergent local fixture, never live SQL.
  await db.exec('alter table profiles drop constraint profiles_id_fkey;alter table profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id) on delete cascade;');
  await assert.rejects(()=>db.exec(identity),/differs from the reviewed constraint/);await db.exec('rollback');
  assert.equal((await db.query("select confdeltype from pg_constraint where conname='profiles_id_fkey'")).rows[0].confdeltype,'c');
 }finally{await f.close();}
});
