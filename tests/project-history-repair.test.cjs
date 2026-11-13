// Real PostgreSQL in an isolated fixture. Never accesses the live Supabase project.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {authDatabase}=require('./auth-test-db.cjs');
const repair=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100002_project_history.sql'),'utf8');
const snapshotSQL="select pg_get_functiondef('public.mcpa_project_snapshot()'::regprocedure) as definition";
const siteSchemaSQL=`select jsonb_build_object(
  'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='sites'),
  'columns',(select jsonb_agg(to_jsonb(c) order by ordinal_position) from information_schema.columns c where table_schema='public' and table_name='sites'),
  'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.sites'::regclass)
) as value`;

test('Reviewed missing-history repair preserves records and RPC, restores scoped reads and authenticated immutable audit',async()=>{
  const f=await authDatabase({engineerPortal:true,missingProjectHistory:true});
  try{
    const tables=['sites','profiles','equipment','mcpa_movements','mcpa_movement_operations','mcpa_account_audit'];
    const before={};for(const table of tables)before[table]=(await f.db.query(`select * from public.${table} order by id`)).rows;
    const definition=(await f.db.query(snapshotSQL)).rows;
    const siteSchema=(await f.db.query(siteSchemaSQL)).rows;
    await assert.rejects(f.rpc(f.actors.sky,'mcpa_project_snapshot'),e=>e.code==='42P01');
    const installed=(await f.db.exec(repair)).at(-1).rows[0].project_history_repair_verification;
    for(const key of ['history_table_present','history_rls_enabled','capture_trigger_enabled','immutable_triggers_enabled','project_snapshot_present'])assert.equal(installed[key],true,key);
    assert.equal(installed.history_rows,0,'No fabricated/baseline history');
    for(const access of installed.browser_access){
      assert.equal(access.direct_write_granted,false);assert.equal(access.capture_function_execute,false);
      assert.equal(access.select_granted,access.role==='authenticated');assert.equal(access.snapshot_execute,access.role==='authenticated');
    }
    for(const table of tables)assert.deepEqual((await f.db.query(`select * from public.${table} order by id`)).rows,before[table],table+' records preserved');
    assert.deepEqual((await f.db.query(snapshotSQL)).rows,definition,'No snapshot rewrite');
    assert.deepEqual((await f.db.query(siteSchemaSQL)).rows,siteSchema,'Site defaults, constraints and policies preserved');
    const a=await f.rpc(f.actors.sky,'mcpa_project_snapshot');
    assert.equal(a.sites.length,1);assert.equal(a.sites[0].assigned_engineer_id,f.actors.sky.id);
    assert.equal(a.sites[0].assigned_engineer,f.actors.sky.name);assert.deepEqual(a.history,[]);
    for(const actor of [f.actors.pau,f.actors.architect])assert.equal((await f.rpc(actor,'mcpa_project_snapshot')).sites.length,0);
    for(const actor of [null,f.actors.inactive,f.actors.secretary])await assert.rejects(f.rpc(actor,'mcpa_project_snapshot'),e=>e.code==='42501');
    for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect,f.actors.handler]){
      assert.equal((await f.query(actor,'update public.sites set progress=9 returning id')).rows.length,0);
      await assert.rejects(f.query(actor,"insert into public.sites(name,location,assigned_engineer) values('Forbidden','Local fixture','Fixture')"),e=>e.code==='42501');
    }
    await f.query(f.actors.admin,'update public.sites set progress=10 where id=$1',[f.sites.casa]);
    const history=(await f.db.query('select * from project_history')).rows;
    assert.equal(history.length,1);assert.deepEqual(history[0].change_types,['details']);
    assert.equal(history[0].before_values.progress,0);assert.equal(history[0].after_values.progress,10);
    assert.notEqual(f.actors.admin.id,f.actors.admin.authId);
    assert.equal(history[0].actor_id,f.actors.admin.id,'Audit uses stable profile ID, not Auth UUID');
    assert.equal(history[0].actor_name,f.actors.admin.name);
    assert.equal((await f.rpc(f.actors.sky,'mcpa_project_snapshot')).history.length,1);
    assert.equal((await f.rpc(f.actors.pau,'mcpa_project_snapshot')).history.length,0);
    for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect,f.actors.secretary,f.actors.inactive])assert.equal((await f.query(actor,'select * from project_history')).rows.length,0);
    for(const actor of [f.actors.admin,f.actors.handler])assert.equal((await f.query(actor,'select * from project_history')).rows.length,1);
    await assert.rejects(f.query(null,'select * from project_history'),e=>e.code==='42501');
    for(const actor of [null,f.actors.admin,f.actors.sky,f.actors.handler]){
      for(const sql of ["update project_history set actor_name='forged'",'delete from project_history','truncate project_history',
        "insert into project_history(project_id,change_types,after_values) values('"+f.sites.casa+"','{forged}','{}')",
        'select public.project_record_history()'])await assert.rejects(f.query(actor,sql),e=>e.code==='42501');
    }
    for(const sql of ["update project_history set actor_name='forged'",'delete from project_history','truncate project_history'])await assert.rejects(f.db.exec(sql),e=>e.code==='42501');
    await f.query(f.actors.admin,'update sites set progress=progress where id=$1',[f.sites.casa]);
    assert.equal((await f.db.query('select count(*)::int as n from project_history')).rows[0].n,1,'Timestamp-only/no-op update adds no event');
    await f.db.exec('begin');
    await f.query(f.actors.admin,'update sites set progress=20 where id=$1',[f.sites.casa]);
    await f.db.exec('rollback');
    assert.equal((await f.db.query('select count(*)::int as n from project_history')).rows[0].n,1,'Audit and metadata roll back together');
    await f.query(f.actors.admin,'update sites set assigned_engineer_id=$1,assigned_engineer=$2 where id=$3',[f.actors.pau.id,f.actors.pau.name,f.sites.casa]);
    const b=await f.rpc(f.actors.pau,'mcpa_project_snapshot');
    assert.equal(b.sites[0].assigned_engineer,f.actors.pau.name);
    const assignment=b.history.find(h=>h.change_types.includes('engineer'));
    assert.equal(assignment.before_values.assigned_engineer_id,f.actors.sky.id);
    assert.equal(assignment.after_values.assigned_engineer_id,f.actors.pau.id);
    assert.equal((await f.rpc(f.actors.sky,'mcpa_project_snapshot')).history.length,0,'History remains scoped to current authorized projects');
    const created=(await f.query(f.actors.admin,"insert into sites(name,location,assigned_engineer,assigned_engineer_id) values('Architect project','Local fixture',$1,$2) returning id",[f.actors.architect.name,f.actors.architect.id])).rows[0];
    const architect=await f.rpc(f.actors.architect,'mcpa_project_snapshot');
    assert.equal(architect.sites[0].id,created.id);assert.equal(architect.sites[0].assigned_engineer,f.actors.architect.name);
    assert.deepEqual(architect.history[0].change_types,['created']);assert.equal(architect.history[0].before_values,null);
    await assert.rejects(f.db.query('delete from sites where id=$1',[created.id]),e=>['23001','23503'].includes(e.code)&&e.message.includes('project_history'));
    await f.query(f.actors.admin,'update sites set is_active=false where id=$1',[created.id]);
    assert.ok((await f.rpc(f.actors.architect,'mcpa_project_snapshot')).history.some(h=>h.change_types.includes('archived')));
    await f.db.query("select set_config('request.jwt.claim.sub','',false)");
    await f.db.query('update sites set phase=$1 where id=$2',['Maintenance fixture',created.id]);
    const maintenance=(await f.db.query("select * from project_history where change_types @> '{phase}'")).rows[0];
    assert.equal(maintenance.actor_id,null);assert.equal(maintenance.actor_name,null,'Unauthenticated database maintenance does not invent a person');
    await assert.rejects(f.db.exec(repair),/already exists/);await f.db.exec('rollback');
    assert.ok((await f.rpc(f.actors.architect,'mcpa_project_snapshot')).history.length>0,'Rerun guard preserves installed audit');
  }finally{await f.close();}
});

test('Repair refuses an alternative history store and rolls back without creating duplicate history',async()=>{
  const f=await authDatabase({engineerPortal:true,missingProjectHistory:true});
  try{
    await f.db.exec('create table public.renamed_project_audit(project_id uuid,after_values jsonb)');
    await assert.rejects(f.db.exec(repair),/possible project history relation/);await f.db.exec('rollback');
    assert.equal((await f.db.query("select to_regclass('public.project_history') as history")).rows[0].history,null);
    assert.equal((await f.db.query("select count(*)::int as n from pg_trigger where tgrelid='public.sites'::regclass and not tgisinternal")).rows[0].n,1);
  }finally{await f.close();}
});
