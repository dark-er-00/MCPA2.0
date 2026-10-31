const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');

test('invitation retirement preserves history and secure access editing and verified recovery',async()=>{
 const f=await authDatabase(),{db,actors:a,query,rpc}=f;
 try{
  const person=randomUUID(),job=randomUUID(),authId=randomUUID();
  await db.query('insert into profiles(id,name) values($1,$2)',[person,'Historical Engineer']);
  await db.query('insert into mcpa_account_invitations(id,profile_id,email,name,role,created_by) values($1,$2,$3,$4,$5,$6)',[job,person,'history@example.test','Historical Engineer','engineer',a.admin.id]);
  await db.query("insert into mcpa_account_audit(actor_id,profile_id,event) values($1,$2,'person_created')",[a.admin.id,person]);
  const before=(await db.query('select * from profiles order by id')).rows;
  const history=(await db.query('select * from mcpa_account_audit order by id')).rows;
  const jobs=(await db.query('select * from mcpa_account_invitations order by id')).rows;
  const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../supabase/migrations/202610270001_remove_user_invitations.sql'),'utf8');
  const reports=await db.exec(sql);for(const [key,value]of Object.entries(reports.at(-1).rows[0].invite_user_removal_verification))assert.equal(value,true,key);
  assert.deepEqual((await db.query('select * from profiles order by id')).rows,before);
  assert.deepEqual((await db.query('select * from mcpa_account_audit order by id')).rows,history);
  assert.deepEqual((await db.query('select * from mcpa_account_invitations order by id')).rows,jobs);
  const account=(await rpc(a.admin,'mcpa_accounts')).find(p=>p.id===person);assert.equal(account.email,'history@example.test');assert.ok(!Object.keys(account).some(k=>k.startsWith('invitation_')));
  await assert.rejects(()=>rpc(a.sky,'mcpa_accounts'),/Admin access/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);try{await assert.rejects(()=>db.query('select public.mcpa_invitation_step($1,$2,$3)',[a.admin.authId,'prepare',{}]),e=>e.code==='42883');}finally{await db.exec('reset role');}}
  const args={p_id:person,p_name:'Historical Engineer',p_role:'architect',p_status:'inactive',p_auth_user_id:null};
  await assert.rejects(()=>rpc(a.sky,'mcpa_save_account',args),/Admin access/);
  await rpc(a.admin,'mcpa_save_account',args);
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_status:'active'}),/Link a Supabase Auth/);
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_role:'admin'}),/separately authorized/);
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_auth_user_id:authId}),/verified Auth account/);
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[authId,'history@example.test']);
  await rpc(a.admin,'mcpa_save_account',{...args,p_status:'active',p_auth_user_id:authId});
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_auth_user_id:a.sky.authId}),/cannot be reassigned/);
  const after=(await db.query('select * from profiles where id=$1',[person])).rows[0];assert.equal(after.id,person);assert.equal(after.auth_user_id,authId);assert.equal(after.account_status,'active');
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{p_id:a.admin.id,p_name:a.admin.name,p_role:'admin',p_status:'inactive',p_auth_user_id:a.admin.authId}),/own administrator access/);
  assert.equal((await query(a.sky,'select * from mcpa_account_audit')).rows.length,0);
  await assert.rejects(()=>query(a.admin,"insert into mcpa_account_audit(actor_id,profile_id,event) values($1,$2,'forged')",[a.admin.id,person]),/permission denied/);
  await db.exec(sql);assert.deepEqual((await db.query('select * from mcpa_account_invitations order by id')).rows,jobs);
 }finally{await f.close();}
});

test('duplicate-name recipients use UUIDs and preserve all receipt safeguards',async()=>{
 const f=await authDatabase(),{db,actors:a,rpc}=f;
 try{
  await db.query('update profiles set name=$1 where id=$2',[a.sky.name,a.pau.id]);
  const act=(actor,action,payload)=>rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  await assert.rejects(()=>act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiver:a.sky.name}),/active Engineer/);
  await assert.rejects(()=>act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:a.inactive.id}),/active Engineer/);
  const transfer=await act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:a.pau.id,receiver:'Forged name'});
  assert.equal(transfer.receiverId,a.pau.id);assert.equal(transfer.receiver,a.sky.name);
  const inspections=[{toolId:'TOOL-002',condition:'good',tested:true}];
  await assert.rejects(()=>act(a.sky,'receiveTransfer',{id:transfer.id,inspections}),/named receiver/);
  await db.query("update profiles set account_status='inactive' where id=$1",[a.pau.id]);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/active authorized/);
  await db.query("update profiles set account_status='active',name='Renamed Receiver' where id=$1",[a.pau.id]);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[]}),/exactly one/);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good'}]}),/Test every/);
  await db.query("update equipment set quantity=2 where asset_id='TOOL-002'");
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/custody or status changed/);
  await db.query("update equipment set quantity=1 where asset_id='TOOL-002'");
  assert.equal((await db.query("select current_holder_id from equipment where asset_id='TOOL-002'")).rows[0].current_holder_id,a.sky.id);
  await act(a.pau,'receiveTransfer',{id:transfer.id,inspections});
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/Only pending/);
  const snapshot=await rpc(a.admin,'mcpa_movement_snapshot');assert.equal(snapshot.tools.find(t=>t.id==='TOOL-002').holderId,a.pau.id);assert.ok(snapshot.activity.some(row=>row.entityId===transfer.id));
  assert.ok(snapshot.users.find(p=>p.id===a.sky.id).projects.includes('Casa Buena'));
  const before=(await db.query('select count(*)::int n from mcpa_movements')).rows[0].n;
  const fs=require('fs'),path=require('path');
  for(const file of ['202610060001_account_management.sql','202610060002_recipient_identity.sql']){
   const results=await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
   if(file==='202610060002_recipient_identity.sql'){
    const report=results.at(-1).rows[0].recipient_identity_verification;
    assert.equal(report.receiver_lookup_uses_profile_id,true);
    assert.equal(report.legacy_receiver_name_lookup_present,false);
    assert.equal(report.receipt_matches_authenticated_profile,true);
    assert.equal(report.recipient_project_context_present,true);
    for(const permission of report.rpc_permissions){
     assert.equal(permission.anon_execute,false);
     assert.equal(permission.authenticated_execute,permission.function.startsWith('public.'));
    }
   }
  }
  assert.equal((await db.query('select count(*)::int n from mcpa_movements')).rows[0].n,before);
 }finally{await f.close();}
});
