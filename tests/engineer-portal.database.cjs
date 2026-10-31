const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
test('Personal/project scopes and receiving QR retain server authorization and custody',async()=>{
 const f=await authDatabase({engineerPortal:true});
 try{
  const {sky:a,pau:b,admin,architect,handler,secretary,inactive}=f.actors;
  const rpc=(actor,name,args)=>f.rpc(actor,name,args),deny=promise=>assert.rejects(promise);
  const before=(await f.db.query('select id,current_holder_id,site_id,status from equipment order by id')).rows;
  const own=await rpc(a,'mcpa_personal_equipment_snapshot');
  assert.equal(own.tools.length,4);assert.ok(own.tools.every(tool=>tool.holderId===a.id));
  assert.equal((await rpc(b,'mcpa_personal_equipment_snapshot')).tools.length,0);
  assert.ok((await rpc(a,'mcpa_movement_snapshot')).tools.some(tool=>tool.id==='TOOL-001'),'Request catalog remains available');
  const projects=await rpc(a,'mcpa_project_snapshot');
  assert.equal(projects.sites.length,1);assert.equal(projects.sites[0].assigned_engineer,a.name);assert.equal(projects.sites[0].assigned_engineer_id,a.id);
  // Choose a separate receiving project for B, preserving A's accountable project.
  const destination=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Receiver project','Fixture', $2,$3)",[destination,b.name,b.id]);
  assert.ok((await rpc(b,'mcpa_project_snapshot')).sites.every(site=>site.assigned_engineer_id===b.id));
  assert.equal((await rpc(architect,'mcpa_project_snapshot')).sites.length,0);
  await deny(f.query(a,"insert into sites(name,location,assigned_engineer) values('Forbidden','Fixture','Engineer')"));
  assert.equal((await f.query(a,'select * from equipment')).rows.length,0,'No broad direct reads');
  for(const actor of [null,secretary,inactive,admin,handler])await deny(rpc(actor,'mcpa_create_receiving_qr',{p_site_id:destination}));
  await deny(rpc(a,'mcpa_create_receiving_qr',{p_site_id:destination}));
  const qr=await rpc(b,'mcpa_create_receiving_qr',{p_site_id:destination});
  assert.match(qr.token,/^[a-f0-9]{64}$/);assert.ok(new Date(qr.expires_at)>new Date());
  const stored=(await f.db.query('select token_hash from mcpa_auth_private.receiving_qr')).rows;
  assert.ok(stored.every(row=>row.token_hash!==qr.token),'Raw token not stored');
  for(const actor of [null,secretary,inactive,admin])await deny(rpc(actor,'mcpa_resolve_receiving_qr',{p_token:qr.token}));
  const resolved=await rpc(a,'mcpa_resolve_receiving_qr',{p_token:qr.token});assert.equal(resolved.receiver_id,b.id);assert.equal(resolved.site_id,destination);
  assert.deepEqual((await f.db.query('select id,current_holder_id,site_id,status from equipment order by id')).rows,before,'Issue/scan does not change custody');
  await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:'TRF-00001'}));
  await deny(f.query(a,"select * from mcpa_auth_private.receiving_qr"));
  await deny(f.query(a,"select mcpa_auth_private.receiving_context($1)",[qr.token]));
  const action=(actor,payload,operation=randomUUID())=>rpc(actor,'mcpa_movement_action',{p_action:'createTransfer',p_payload:payload,p_operation_id:operation});
  const form={toolIds:['TOOL-002'],receiverId:b.id,destination:'Receiver project',notes:'Isolated fixture'};
  await deny(action(a,{...form,destination:'Casa Buena'}));
  await deny(action(a,{...form,receivingToken:'x'}));
  await deny(action(a,{...form,receiverId:a.id,receivingToken:qr.token}));
  await deny(action(b,{...form,receivingToken:qr.token}));
  await f.db.query("update profiles set account_status='inactive' where id=$1",[b.id]);await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:qr.token}));
  await f.db.query("update profiles set account_status='active' where id=$1",[b.id]);
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[architect.id,destination]);await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:qr.token}));await deny(action(a,form));
  await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[b.id,destination]);
  const replacement=await rpc(b,'mcpa_create_receiving_qr',{p_site_id:destination});await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:qr.token}));
  await rpc(a,'mcpa_revoke_receiving_qr',{p_token:replacement.token});await rpc(a,'mcpa_resolve_receiving_qr',{p_token:replacement.token}); // Other people cannot revoke.
  await rpc(b,'mcpa_revoke_receiving_qr',{p_token:replacement.token});await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:replacement.token}));
  const expiring=await rpc(b,'mcpa_create_receiving_qr',{p_site_id:destination});await f.db.exec("update mcpa_auth_private.receiving_qr set expires_at=now()-interval '1 minute'");await deny(action(a,{...form,receivingToken:expiring.token}));
  const valid=await rpc(b,'mcpa_create_receiving_qr',{p_site_id:destination}),op=randomUUID();
  const transfer=await action(a,{...form,receivingToken:valid.token},op);
  assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0].current_holder_id,a.id,'Dispatch preserves sender custody');
  const history=await f.db.query('select payload::text,activity::text from mcpa_movement_operations where id=$1',[op]);assert.ok(!JSON.stringify(history.rows).includes(valid.token));
  await rpc(b,'mcpa_revoke_receiving_qr',{p_token:valid.token});assert.equal((await action(a,{...form,receivingToken:valid.token},op)).id,transfer.id,'Authorized retry succeeds after expiry/revoke');
  await deny(action(b,{...form,receivingToken:valid.token},op));
  const receipt=actor=>rpc(actor,'mcpa_movement_action',{p_action:'receiveTransfer',p_payload:{id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good',tested:true}]},p_operation_id:randomUUID()});
  await deny(receipt(a));await receipt(b);
  assert.equal((await f.db.query('select current_holder_id from equipment where asset_id=$1',['TOOL-002'])).rows[0].current_holder_id,b.id);
  const received=await rpc(b,'mcpa_personal_equipment_snapshot');assert.equal(received.tools.length,1);assert.ok(received.transfers.some(t=>t.id===transfer.id));assert.ok(received.activity.length>=2);
  await action(a,{...form,toolIds:['TOOL-003']}); // Manual entry uses the same assignment checks.
  const architectSite=randomUUID();await f.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Architect site','Fixture',$2,$3)",[architectSite,architect.name,architect.id]);
  const architectQr=await rpc(architect,'mcpa_create_receiving_qr',{p_site_id:architectSite});assert.equal((await rpc(handler,'mcpa_resolve_receiving_qr',{p_token:architectQr.token})).receiver_id,architect.id);
  const architectProjects=await rpc(architect,'mcpa_project_snapshot');assert.equal(architectProjects.sites[0].assigned_engineer,architect.name);
  await deny(f.query(architect,"insert into sites(name,location,assigned_engineer) values('Forbidden architect','Fixture','Architect')"));
  await f.db.query('update sites set is_active=false where id=$1',[architectSite]);await deny(rpc(a,'mcpa_resolve_receiving_qr',{p_token:architectQr.token}));
  assert.ok((await rpc(admin,'mcpa_movement_snapshot')).tools.length>received.tools.length);
  assert.ok((await rpc(handler,'mcpa_movement_snapshot')).tools.length>received.tools.length);
 }finally{await f.close();}
});
