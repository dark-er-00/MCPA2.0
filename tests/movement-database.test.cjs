// Executes the shipped migration in isolated PostgreSQL; never writes to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let PGlite;
for (const location of ['@electric-sql/pglite', '../modules/sites/tests/node_modules/@electric-sql/pglite', '../modules/consumables/tests/node_modules/@electric-sql/pglite']) {
  try { ({ PGlite } = require(location)); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!PGlite) throw new Error('Install @electric-sql/pglite to run the isolated database checks.');
const db = new PGlite();
const setup = fs.readFileSync(path.join(__dirname, '../1-admin/modules/movements/setup.sql'), 'utf8');
const sitesSetup = fs.readFileSync(path.join(__dirname, '../1-admin/modules/sites/setup.sql'), 'utf8');
const admin = { id: randomUUID(), name: 'Admin Test', role: 'admin' };
const alice = { id: randomUUID(), name: 'Engineer Alice', role: 'engineer' };
const bob = { id: randomUUID(), name: 'Engineer Bob', role: 'engineer' };
const main = randomUUID(), yard = randomUUID();
const ids = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'ZERO'].map(id => [id, randomUUID()]));
async function asRole(role, sql, values = []) {
  assert.ok(['anon', 'authenticated'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, values); } finally { await db.exec('reset role'); }
}
async function action(name, payload = {}, actor = alice, operationId = randomUUID(), role = 'anon') {
  return (await asRole(role, 'select public.mcpa_movement_action($1,$2::jsonb,$3::uuid) as value', [name, JSON.stringify({ ...payload, actor }), operationId])).rows[0].value;
}
const snapshot = async () => (await asRole('anon', 'select public.mcpa_movement_snapshot() as value')).rows[0].value;
const equipment = async id => (await db.query('select asset_id,status::text,site_id,current_holder_id,quantity from equipment where id=$1', [ids[id]])).rows[0];
const fail = (work, message) => assert.rejects(work, error => error instanceof Error && (!message || message.test(error.message)));
const check = (toolId, condition = 'good', notes = '') => ({ toolId, condition, notes });
let count = 0;
const passed = title => { count++; console.log(`PASS ${title}`); };

(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon,authenticated;
    create type equipment_status as enum ('AVAILABLE','IN_USE','REPAIR','MISSING','DISPOSED');
    create table profiles(id uuid primary key,name text not null);
    create table equipment(id uuid primary key,asset_id text unique not null,name text not null,category text,brand text,condition text default 'Good',
      quantity integer not null default 1,status equipment_status not null default 'AVAILABLE',
      current_holder_id uuid references profiles(id),created_at timestamptz not null default now());
  `);
  for (const actor of [admin, alice, bob]) await db.query('insert into profiles values($1,$2)', [actor.id, actor.name]);
  await db.exec(sitesSetup);
  await db.query("insert into sites(id,name,location,assigned_engineer) values($1,'Main','Test','Engineer Alice'),($2,'Yard','Test','Engineer Bob')", [main, yard]);
  for (const [id, uuid] of Object.entries(ids)) {
    await db.query(`insert into equipment(id,asset_id,name,category,brand,quantity,status,current_holder_id,site_id)
      values($1,$2,$3,'Power Tools','Test',$4,$5::equipment_status,$6,$7)`,
    [uuid, id, `Tool ${id}`, id === 'ZERO' ? 0 : 2, ['C', 'D', 'E'].includes(id) ? 'IN_USE' : 'AVAILABLE', ['C', 'D', 'E'].includes(id) ? alice.id : null, main]);
  }
  const initial = (await db.query('select to_jsonb(e) as value from equipment e order by id')).rows;
  await db.exec(setup); await db.exec(setup);
  assert.deepEqual((await db.query('select to_jsonb(e) as value from equipment e order by id')).rows, initial);
  const empty = await snapshot();
  assert.equal(empty.tools.length, 6); assert.equal(empty.sites.length, 2); assert.equal(empty.users.length, 3);
  for (const key of ['requests', 'transfers', 'returns', 'repairs', 'missing', 'activity']) assert.deepEqual(empty[key], []);
  assert.equal(empty.tools.find(t => t.id === 'A').holder, '—');
  passed('Repeatable setup preserves existing inventory, adds no mock data, and reads complete snapshot');

  await fail(() => action('createRequest', { toolIds: ['A'], destination: 'Yard', purpose: 'Test' }, { ...alice, id: null }), /existing profile/);
  await fail(() => action('createRequest', { toolIds: ['A'], destination: 'Yard', purpose: 'Test' }, { ...alice, name: 'Pretend' }), /existing profile/);
  await fail(() => action('unsupported'), /Unknown movement/);
  for (const payload of [{ toolIds: [] }, { toolIds: ['A', 'A'] }, { toolIds: ['UNKNOWN'] }, { toolIds: ['ZERO'] }, { destination: 'Invented' }, { receiver: 'Unknown' }, { purpose: ' ' }, { neededUntil: '2000-01-01' }, { neededUntil: 'tomorrow' }, { neededUntil: '2030-2-01' }, { neededUntil: '2030-02-30' }]) {
    await fail(() => action('createRequest', { toolIds: ['A'], destination: 'Yard', purpose: 'Test', ...payload }));
  }
  await fail(() => action('reportRepair', { toolId: 'B', notes: 'Broken' }, bob), /custody/);
  await fail(() => action('reportMissing', { toolId: 'B', notes: '' }, admin), /Describe/);
  await fail(() => action('createRequest', { toolIds: ['C'], destination: 'Yard', purpose: 'Cannot allocate custody' }), /available stock/);
  await fail(() => action('createReturn', { toolIds: ['A'], conditions: [check('A')] }, admin), /currently in use/);
  assert.equal((await snapshot()).activity.length, 0);
  passed('Invalid identities, roles, names, dates, asset selections, quantities and custody fail without writes');

  const requestPayload = { toolIds: ['A', 'B'], destination: 'Yard', receiver: bob.name, purpose: 'Foundation works' };
  const requestOperation = randomUUID();
  await fail(() => action('createRequest', requestPayload, alice), /own custody/);
  await fail(() => action('createTransfer', { toolIds: ['A'], destination: 'Yard', receiver: alice.name }, alice), /custody/);
  const request = await action('createRequest', requestPayload, bob, requestOperation);
  assert.deepEqual(await action('createRequest', requestPayload, bob, requestOperation), request);
  await fail(() => action('createRequest', { ...requestPayload, purpose: 'Different' }, bob, requestOperation), /different values/);
  await fail(() => action('approveRequest', { id: request.id }, alice), /Admin/);
  assert.equal((await action('approveRequest', { id: request.id }, admin, randomUUID(), 'authenticated')).status, 'approved');
  await fail(() => action('createTransfer', { toolIds: ['A'], destination: 'Yard', receiver: bob.name }, admin), /reserved/);
  const duplicateRequest = await action('createRequest', requestPayload, bob);
  await fail(() => action('approveRequest', { id: duplicateRequest.id }, admin), /reserved/);
  await fail(() => action('rejectRequest', { id: duplicateRequest.id, reason: ' ' }, admin), /rejection reason/);
  assert.equal((await action('rejectRequest', { id: duplicateRequest.id, reason: 'Already allocated' }, admin)).status, 'rejected');
  const beforeRelease = await equipment('A');
  const releaseOp = randomUUID();
  const transfer = await action('releaseRequest', { id: request.id }, admin, releaseOp);
  assert.equal(transfer.status, 'pending'); assert.equal(transfer.requestId, request.id);
  assert.deepEqual(await equipment('A'), beforeRelease, 'Dispatch must not move custody');
  assert.deepEqual(await action('releaseRequest', { id: request.id }, admin, releaseOp), transfer);
  await fail(() => action('reportMissing', { toolId: 'B', notes: 'Absent' }), /reserved/);
  await fail(() => action('receiveTransfer', { id: transfer.id, inspections: [check('A'), check('B')] }, alice), /named receiver/);
  const preInvalid = await snapshot();
  await fail(() => action('receiveTransfer', { id: transfer.id, inspections: [check('A'), check('B', 'damaged')] }, bob), /Describe/);
  assert.deepEqual(await snapshot(), preInvalid, 'Invalid second inspection must roll back all changes');
  const receiveOp = randomUUID();
  const receiptPayload = { id: transfer.id, inspections: [check('A'), check('B', 'damaged', 'Cracked casing')] };
  const receipt = await action('receiveTransfer', receiptPayload, bob, receiveOp);
  assert.deepEqual(await action('receiveTransfer', receiptPayload, bob, receiveOp), receipt);
  assert.deepEqual(await equipment('A'), { asset_id: 'A', status: 'IN_USE', site_id: yard, current_holder_id: bob.id, quantity: 2 });
  assert.equal((await equipment('B')).status, 'REPAIR'); assert.equal((await equipment('B')).current_holder_id, bob.id);
  assert.equal((await snapshot()).requests.find(r => r.id === request.id).status, 'received');
  await fail(() => action('receiveTransfer', receiptPayload, bob), /Only pending/);
  passed('Request → Admin approval → release → receiver inspection is atomic, reserved, custody-safe and retry-safe');

  const repair = (await snapshot()).repairs.find(r => r.toolId === 'B');
  assert.equal(repair.sourceId, transfer.id);
  assert.equal((await snapshot()).tools.find(t => t.id === 'B').condition, 'Damaged');
  await fail(() => action('completeRepair', { id: repair.id }, admin), /already closed or has changed/);
  await action('startRepair', { id: repair.id }, admin);
  assert.equal((await snapshot()).tools.find(t => t.id === 'B').status, 'underrepair');
  assert.equal((await equipment('B')).status, 'REPAIR', 'Supports original equipment enum');
  await action('completeRepair', { id: repair.id, notes: 'Replaced casing', destination: 'Main' }, admin);
  assert.equal((await equipment('B')).status, 'AVAILABLE'); assert.equal((await equipment('B')).current_holder_id, null);
  assert.equal((await equipment('B')).site_id, main);
  await fail(() => action('completeRepair', { id: repair.id }, admin), /already closed/);
  passed('Damage creates linked repair; Admin start/completion updates inventory with legacy enum compatibility');

  const transfer2 = await action('createTransfer', { toolIds: ['B', 'C'], destination: 'Yard', receiver: bob.name, notes: 'Next crew' }, admin);
  const lostSource = await equipment('C');
  await action('receiveTransfer', { id: transfer2.id, inspections: [check('B'), check('C', 'lost', 'Not on the delivery truck')] }, bob);
  const lost = await equipment('C');
  assert.equal(lost.status, 'MISSING'); assert.equal(lost.current_holder_id, lostSource.current_holder_id); assert.equal(lost.site_id, lostSource.site_id);
  const missing = (await snapshot()).missing.find(r => r.toolId === 'C');
  assert.equal((await snapshot()).tools.find(t => t.id === 'C').condition, 'Unconfirmed');
  await fail(() => action('recoverMissing', { id: missing.id, condition: 'damaged' }, admin), /Describe/);
  await action('recoverMissing', { id: missing.id, condition: 'damaged', notes: 'Found with bent guard', destination: 'Yard' }, admin);
  assert.equal((await equipment('C')).status, 'REPAIR'); assert.equal((await equipment('C')).current_holder_id, null);
  assert.ok((await snapshot()).repairs.find(r => r.toolId === 'C' && r.sourceId === missing.id));
  passed('Lost receipt retains original custody; damaged recovery opens a linked repair atomically');

  await action('createReturn', { toolIds: ['A', 'B'], destination: 'Main', conditions: [check('A'), check('B', 'damaged', 'Switch failed')] }, bob);
  assert.equal((await equipment('A')).status, 'AVAILABLE'); assert.equal((await equipment('A')).site_id, main); assert.equal((await equipment('A')).current_holder_id, null);
  assert.equal((await equipment('B')).status, 'REPAIR'); assert.equal((await equipment('B')).site_id, main); assert.equal((await equipment('B')).current_holder_id, bob.id);
  const returnedMissing = await action('createReturn', { toolIds: ['D'], conditions: [check('D', 'lost', 'Unaccounted for at return')] }, alice);
  assert.equal((await equipment('D')).status, 'MISSING'); assert.equal((await equipment('D')).current_holder_id, alice.id);
  assert.ok((await snapshot()).missing.find(r => r.sourceId === returnedMissing.id));
  const manualRepair = await action('reportRepair', { toolId: 'E', notes: 'Motor overheated' });
  assert.equal(manualRepair.status, 'reported');
  await fail(() => action('reportRepair', { toolId: 'E', notes: 'Another report' }), /unavailable/);
  const manualMissing = await action('reportMissing', { toolId: 'A', notes: 'Shelf empty' }, admin);
  await action('recoverMissing', { id: manualMissing.id, condition: 'good', notes: 'Found on shelf' }, admin);
  assert.equal((await equipment('A')).status, 'AVAILABLE');
  passed('Returns inspect every asset, retain damage/loss accountability, and direct reports enforce custody');

  const staleTransfer = await action('createTransfer', { toolIds: ['A'], destination: 'Yard', receiver: bob.name }, admin);
  await db.query('update equipment set site_id=$1 where id=$2', [yard, ids.A]);
  const staleBefore = await snapshot();
  await fail(() => action('receiveTransfer', { id: staleTransfer.id, inspections: [check('A')] }, bob), /custody or status changed/);
  assert.deepEqual(await snapshot(), staleBefore);
  await db.query('update equipment set site_id=$1 where id=$2', [main, ids.A]);
  await db.query('update equipment set quantity=3 where id=$1', [ids.A]);
  await fail(() => action('receiveTransfer', { id: staleTransfer.id, inspections: [check('A')] }, bob), /custody or status changed/);
  await db.query('update equipment set quantity=2 where id=$1', [ids.A]);
  await db.query("update sites set name='Renamed Yard' where id=$1", [yard]);
  await action('receiveTransfer', { id: staleTransfer.id, inspections: [check('A')] }, bob);
  assert.equal((await snapshot()).tools.find(t => t.id === 'A').site, 'Renamed Yard');
  const historicalSite = randomUUID();
  await db.query("insert into sites(id,name,location,assigned_engineer) values($1,'Historical source','Test','Engineer Alice')", [historicalSite]);
  await db.query('update equipment set site_id=$1 where id=$2', [historicalSite, ids.A]);
  const historicalReturn = await action('createReturn', { toolIds: ['A'], destination: 'Main', conditions: [check('A')] }, bob);
  assert.equal(historicalReturn.source[0].siteId, historicalSite);
  assert.equal(historicalReturn.destinationId, main);
  await assert.rejects(() => asRole('anon', 'delete from sites where id=$1', [historicalSite]), error => error.code === '42501');
  passed('Receipt rejects external custody changes and stable destination IDs survive site rename');

  for (const role of ['anon', 'authenticated']) {
    for (const table of ['mcpa_movements', 'mcpa_movement_assets', 'mcpa_movement_reservations', 'mcpa_movement_sites', 'mcpa_movement_operations']) {
      await assert.rejects(() => asRole(role, `delete from public.${table}`), error => error.code === '42501');
    }
    await assert.rejects(() => asRole(role, 'select public.mcpa_movement_set_status($1,$2)', [ids.A, 'available']), error => error.code === '42501');
    assert.equal((await db.query("select has_table_privilege($1,'public.equipment','UPDATE') as allowed", [role])).rows[0].allowed, false);
  }
  const beforeRepeat = await snapshot();
  await db.exec(setup); await db.exec(setup);
  assert.deepEqual(await snapshot(), beforeRepeat);
  assert.equal((await db.query("select count(*) from pg_class where relname like 'mcpa_movement%' and relkind='r' and relrowsecurity")).rows[0].count, 5);
  assert.ok((await snapshot()).activity.every(event => event.actor && event.role && event.entityId && event.toolIds.length));
  passed('RPC-only writes, inaccessible internal helper, preserved equipment policies, complete audit, repeatable migration');
  console.log(`PASS All ${count} isolated movement database scenarios; no live database writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
