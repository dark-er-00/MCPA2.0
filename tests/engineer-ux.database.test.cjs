const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120003_optional_request_purpose.sql'),'utf8');
test('Optional purpose preserves authenticated assignment, validation, history, review and receipt',async()=>{
  const f=await authDatabase({engineerPortal:true}),{db,actors:a}=f;
  const act=(person,action,payload,id=randomUUID())=>f.rpc(person,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:id});
  const request=(person,values={})=>act(person,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',...values});
  const rows=async()=>({profiles:(await db.query('select * from profiles order by id')).rows,sites:(await db.query('select * from sites order by id')).rows,equipment:(await db.query('select * from equipment order by id')).rows,movements:(await db.query('select * from mcpa_movements order by id')).rows,operations:(await db.query('select * from mcpa_movement_operations order by id')).rows});
  try{
    const protectedRequest=await request(a.sky,{purpose:'Existing history'}),before=await rows();
    const oldDefinition=(await db.query("select pg_get_functiondef('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) as definition")).rows[0].definition;
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual(await rows(),before,'Migration and repeat leave every existing fixture row unchanged');
    const newDefinition=(await db.query("select pg_get_functiondef('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)'::regprocedure) as definition")).rows[0].definition;
    assert.equal(newDefinition,oldDefinition.replace("if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.'", "if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.'"),'Only purpose validation changes');
    assert.notEqual(a.sky.id,a.sky.authId);
    const assigned=async person=>(await f.rpc(person,'mcpa_movement_snapshot')).sites.filter(site=>site.is_active===true&&site.assigned_engineer_id===person.id);
    assert.equal((await assigned(a.sky)).length,1);assert.equal((await assigned(a.pau)).length,0);
    const extra=randomUUID(),archSite=randomUUID(),inactive=randomUUID();
    for(const [id,name,person,active] of [[extra,'Second assigned project',a.sky,true],[archSite,'Architect project',a.architect,true],[inactive,'Archived assignment',a.sky,false]])await db.query('insert into sites(id,name,location,assigned_engineer,assigned_engineer_id,is_active) values($1,$2,$3,$4,$5,$6)',[id,name,'Isolated fixture',person.name,person.id,active]);
    assert.equal((await assigned(a.sky)).length,2);assert.equal((await assigned(a.architect)).length,1);
    // Duplicate display names never grant an unassigned person permission.
    await db.query('update profiles set name=$1 where id=$2',[a.sky.name,a.pau.id]);
    for(const [person,values] of [[a.pau,{}],[a.sky,{destination:'Architect project',destinationId:archSite}],[a.sky,{destination:'Archived assignment'}],[a.sky,{destination:archSite}],[a.sky,{destination:''}],[a.architect,{}],[a.admin,{}],[null,{}]])await assert.rejects(request(person,values),e=>e.code==='42501');
    const forged=await request(a.sky,{destinationId:archSite,purpose:''});
    assert.equal(forged.destinationId,f.sites.casa,'An injected ID cannot redirect the authorized destination name');
    assert.equal(forged.receiverId,a.sky.id,'Stable company profile is bound on the server');
    for(const values of [{toolIds:[]},{toolIds:['TOOL-002']},{purpose:'x'.repeat(2001)},{neededUntil:'2000-01-01'}])await assert.rejects(request(a.sky,values));
    for(const purpose of [undefined,null,'','   ','Provided purpose']){
      const saved=await request(a.sky,{purpose});assert.equal(saved.purpose,purpose==null?null:purpose.trim());
    }
    const architect=await request(a.architect,{destination:'Architect project',purpose:''});assert.equal(architect.receiverId,a.architect.id);
    const second=await request(a.sky,{destination:'Second assigned project',purpose:''});assert.equal(second.destinationId,extra);
    await act(a.admin,'rejectRequest',{id:second.id,reason:'Fixture rejection'});
    await act(a.admin,'approveRequest',{id:forged.id});
    const transfer=await act(a.admin,'releaseRequest',{id:forged.id});
    await assert.rejects(act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]}),e=>e.code==='42501');
    await act(a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]});
    assert.equal((await db.query("select current_holder_id from equipment where asset_id='TOOL-001'")).rows[0].current_holder_id,a.sky.id);
    assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[protectedRequest.id])).rows,[before.movements[0]]);
    for(const person of [a.admin,a.sky,null])await assert.rejects(f.query(person,"select mcpa_auth_private.mcpa_movement_action('createRequest','{}',gen_random_uuid())"),e=>e.code==='42501');
    assert.ok((await f.query(a.admin,'select * from sites')).rows.some(site=>site.id===archSite),'Admin project access remains intact');
  }finally{await f.close();}
});
