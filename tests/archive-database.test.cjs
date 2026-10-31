const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {database} = require('./movement-test-db.cjs');
test('archive migration preserves assignments/history, denies deletes, restores and reruns safely', async () => {
  const fixture = await database();
  try {
    const {db, sites, asRole} = fixture;
    const migration = fs.readFileSync(path.join(__dirname,'../1-admin/modules/sites/realtime-archive.sql'),'utf8');
    await db.exec(migration);
    const before = (await db.query('select id, site_id from equipment order by id')).rows;
    await asRole('anon', 'update sites set is_active=false where id=$1',[sites.casa]);
    const archived = (await db.query('select * from sites where id=$1',[sites.casa])).rows[0];
    assert.equal(archived.is_active,false);assert.ok(archived.archived_at);
    assert.deepEqual((await db.query('select id, site_id from equipment order by id')).rows,before);
    assert.equal((await db.query("select count(*)::int as n from project_history where project_id=$1 and 'archived'=any(change_types)",[sites.casa])).rows[0].n,1);
    await assert.rejects(asRole('anon','delete from sites where id=$1',[sites.casa]),/permission denied/);
    await db.exec(migration);
    assert.equal((await db.query('select is_active from sites where id=$1',[sites.casa])).rows[0].is_active,false);
    await asRole('anon','update sites set is_active=true where id=$1',[sites.casa]);
    assert.equal((await db.query('select archived_at from sites where id=$1',[sites.casa])).rows[0].archived_at,null);
    assert.equal((await db.query("select count(*)::int as n from project_history where project_id=$1 and 'restored'=any(change_types)",[sites.casa])).rows[0].n,1);
    const published=(await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r=>r.tablename);
    assert.deepEqual(published,['equipment','sites']);
  } finally {await fixture.close();}
});
