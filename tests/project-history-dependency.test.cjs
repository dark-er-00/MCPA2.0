// Isolated PostgreSQL only. No live schema or records are accessed.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {authDatabase}=require('./auth-test-db.cjs');
const preflight=fs.readFileSync(path.join(__dirname,'../supabase/project-history-preflight.sql'),'utf8');
const portal=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100001_engineer_portal.sql'),'utf8');

test('Read-only dependency review distinguishes missing history from missing RPC and finds renamed history',async()=>{
  const f=await authDatabase();
  const inspect=async()=>{
    await f.db.exec('begin read only');
    try{return (await f.db.query(preflight)).rows[0].project_history_dependency_review;}
    finally{await f.db.exec('rollback');}
  };
  try{
    const initial=await inspect();
    assert.equal(initial.project_history_exists,true);
    assert.equal(initial.project_snapshot_exists,false);
    // Model a live schema lacking the legacy dependency while preserving every
    // fixture history row under another name. Never use this against Supabase.
    await f.db.exec('alter table public.project_history rename to project_audit');
    const installation=await f.db.exec(portal);
    assert.equal(installation.at(-1).rows[0].engineer_portal_verification.project_snapshot,true);
    const missing=await inspect();
    assert.equal(missing.project_snapshot_exists,true);
    assert.equal(missing.project_history_exists,false);
    assert.equal(missing.snapshot_references_project_history,true);
    assert.ok(missing.relations.some(r=>r.name==='project_audit'));
    await assert.rejects(f.rpc(f.actors.sky,'mcpa_project_snapshot'),e=>e.code==='42P01'&&e.message.includes('public.project_history'));
    await f.db.exec('alter table public.project_audit rename to project_history');
    const snapshot=await f.rpc(f.actors.sky,'mcpa_project_snapshot');
    assert.ok(snapshot.sites.every(s=>s.assigned_engineer_id===f.actors.sky.id));
    assert.ok(snapshot.history.every(h=>snapshot.sites.some(s=>s.id===h.project_id)));
    const review=await inspect();
    assert.equal(review.project_history_exists,true);
    assert.ok(review.policies.some(p=>p.policyname==='mcpa_history_read'));
    assert.equal(review.effective_privileges.find(p=>p.relation==='project_history'&&p.role==='anon').select,false);
    assert.equal((await f.query(f.actors.sky,'select * from project_history')).rows.length,0);
    assert.ok((await f.query(f.actors.admin,'select * from project_history')).rows.length>0);
    for(const actor of [f.actors.sky,f.actors.pau,f.actors.architect]){
      await assert.rejects(f.query(actor,"insert into sites(name,location,assigned_engineer) values('Forbidden','Fixture','Fixture')"),e=>e.code==='42501');
      assert.equal((await f.query(actor,'update sites set progress=10 returning id')).rows.length,0);
    }
    // Verify Admin metadata permission without retaining a fixture change.
    await f.db.exec('begin');
    try{assert.equal((await f.query(f.actors.admin,'update sites set progress=10 where id=$1 returning id',[f.sites.casa])).rows.length,1);}
    finally{await f.db.exec('rollback');}
  }finally{await f.close();}
});
