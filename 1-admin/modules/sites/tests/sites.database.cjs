// Executes the shipped SQL in an isolated PostgreSQL engine, never in Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setup = fs.readFileSync(path.join(__dirname, '../setup.sql'), 'utf8');
const repair = fs.readFileSync(path.join(__dirname, '../prototype-access.sql'), 'utf8');
const db = new PGlite();
const insert = `insert into public.sites (name, location, assigned_engineer)
  values ($1, 'Batangas', 'Eng. Test') returning *`;

async function asRole(role, sql, values = []) {
  assert.ok(['anon', 'authenticated'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, values); }
  finally { await db.exec('reset role'); }
}
const failsWith = (operation, code) => assert.rejects(operation, error => [].concat(code).includes(error.code));

(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create table public.equipment (id uuid primary key default gen_random_uuid(), quantity integer not null default 1);
    insert into public.equipment (quantity) values (7);
  `);
  await db.exec(setup);
  const initial = (await db.query(insert, ['Existing Site'])).rows[0];
  const originalEquipment = (await db.query('select * from public.equipment')).rows;

  // Reproduce the old installation: login is visual, but only authenticated can write.
  await db.exec(`revoke insert, update, delete on public.sites from anon;
    alter policy sites_insert on public.sites to authenticated;
    alter policy sites_update on public.sites to authenticated;
    alter policy sites_delete on public.sites to authenticated;`);
  await failsWith(() => asRole('anon', insert, ['Rejected before fix']), '42501');
  console.log('PASS Reproduced original Add Site permission failure');

  await db.exec(setup);
  await db.exec(setup);
  assert.deepEqual((await db.query('select * from public.sites where id = $1', [initial.id])).rows[0], initial);
  assert.deepEqual((await db.query('select * from public.equipment')).rows, originalEquipment);
  console.log('PASS Rerunning setup repairs permissions without changing existing records');

  for (const role of ['anon', 'authenticated']) {
    const saved = (await asRole(role, insert, [`${role} Test`])).rows[0];
    assert.equal((await asRole(role, 'select id from public.sites where id = $1', [saved.id])).rows.length, 1);
    const update = await asRole(role,
      'update public.sites set progress = 45 where id = $1 and updated_at = $2 returning *',
      [saved.id, saved.updated_at]);
    assert.equal(update.rows[0].progress, 45);
    assert.notEqual(update.rows[0].updated_at, saved.updated_at);
    assert.equal((await asRole(role,
      'update public.sites set progress = 99 where id = $1 and updated_at = $2 returning id',
      [saved.id, saved.updated_at])).rows.length, 0);
    assert.equal((await asRole(role, 'delete from public.sites where id = $1 returning id', [saved.id])).rows.length, 1);
    console.log(`PASS ${role} create/read/update/delete and stale-update protection`);
  }

  await failsWith(() => asRole('anon', insert, ['  EXISTING   SITE  ']), '23505');
  await failsWith(() => asRole('anon', insert, ['   ']), '23514');
  await failsWith(() => asRole('anon', 'update public.sites set progress = 101 where id = $1', [initial.id]), '23514');
  await failsWith(() => asRole('anon', "update public.sites set status = 'invalid' where id = $1", [initial.id]), '23514');
  console.log('PASS Database rejects duplicate names, blank names, invalid status and progress');

  await db.exec("set timezone = 'Pacific/Honolulu'");
  await asRole('anon', `update public.sites set last_inventory_check =
    (current_timestamp at time zone 'Asia/Manila')::date where id = $1`, [initial.id]);
  await failsWith(() => asRole('anon', `update public.sites set last_inventory_check =
    (current_timestamp at time zone 'Asia/Manila')::date + 1 where id = $1`, [initial.id]), '23514');
  console.log('PASS Inventory dates use Manila business date independently of database timezone');

  const equipment = (await db.query('insert into public.equipment (site_id, quantity) values ($1, 0) returning id', [initial.id])).rows[0];
  await failsWith(() => asRole('anon', 'delete from public.sites where id = $1', [initial.id]), ['23503', '23001']);
  await asRole('anon', "update public.sites set name = 'Renamed Site' where id = $1", [initial.id]);
  assert.equal((await db.query('select site_id from public.equipment where id = $1', [equipment.id])).rows[0].site_id, initial.id);
  assert.equal((await db.query("select has_table_privilege('anon', 'public.equipment', 'UPDATE') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.sites'::regclass")).rows[0].relrowsecurity, true);
  console.log('PASS Linked zero-quantity equipment blocks deletion; rename retains assignment; equipment permissions unchanged');

  await db.exec('revoke insert, update, delete on public.sites from anon');
  await db.exec(repair);
  await db.exec(repair);
  const repaired = (await asRole('anon', insert, ['Compatibility repair'])).rows[0];
  await asRole('anon', 'delete from public.sites where id = $1', [repaired.id]);
  console.log('PASS Compatibility access repair is repeatable and enables CRUD');
  console.log('PASS All Sites database checks; no live database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
