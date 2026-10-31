// Shared local PostgreSQL fixture for integration/browser checks. No remote API use.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let PGlite;
for (const location of ['@electric-sql/pglite', '../modules/sites/tests/node_modules/@electric-sql/pglite', '../modules/consumables/tests/node_modules/@electric-sql/pglite']) {
  try { ({ PGlite } = require(location)); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
const setup = fs.readFileSync(path.join(__dirname, '../1-admin/modules/movements/setup.sql'), 'utf8');
async function database() {
  if (!PGlite) throw new Error('Install @electric-sql/pglite to run isolated database checks.');
  const db = new PGlite();
  const actors = {
    admin: { id: randomUUID(), name: 'Admin Test', role: 'admin' },
    sky: { id: randomUUID(), name: 'Engr Sky', role: 'engineer' },
    pau: { id: randomUUID(), name: 'Engr Pau', role: 'engineer' }
  };
  const sites = { main: randomUUID(), casa: randomUUID() };
  const tools = Object.fromEntries(['TOOL-001','TOOL-002','TOOL-003','TOOL-004','TOOL-005','ZERO'].map(id => [id, randomUUID()]));
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon,authenticated;
    create type equipment_status as enum ('AVAILABLE','IN_USE','REPAIR','MISSING','DISPOSED');
    create table profiles(id uuid primary key,name text not null);
    create table equipment(id uuid primary key,asset_id text unique not null,name text not null,category text,brand text,
      model text,serial_number text,condition text,tracking_type text,unit text,details text,
      quantity integer not null default 1,status equipment_status not null default 'AVAILABLE',
      current_holder_id uuid references profiles(id),created_at timestamptz not null default now());
  `);
  for (const actor of Object.values(actors)) await db.query('insert into profiles values($1,$2)', [actor.id,actor.name]);
  await db.exec(fs.readFileSync(path.join(__dirname, '../1-admin/modules/sites/setup.sql'), 'utf8'));
  await db.query("insert into sites(id,name,location,assigned_engineer) values($1,'Main Warehouse','Batangas','Engr Sky'),($2,'Casa Buena','Batangas','Engr Pau')", [sites.main,sites.casa]);
  for (const [assetId,id] of Object.entries(tools)) {
    const held = !['TOOL-001','ZERO'].includes(assetId);
    await db.query(`insert into equipment(id,asset_id,name,category,brand,model,serial_number,condition,tracking_type,unit,quantity,status,current_holder_id,site_id)
      values($1,$2,$3,'Power Tools','Test Brand','Model T',$4,'Good','Individual','Pieces',$5,$6::equipment_status,$7,$8)`,
    [id,assetId,`Tool ${assetId}`,`SN-${assetId}`,assetId==='ZERO'?0:1,held?'IN_USE':'AVAILABLE',held?actors.sky.id:null,held?sites.casa:sites.main]);
  }
  await db.exec(setup);
  async function asRole(role, sql, values=[]) {
    if (!['anon','authenticated'].includes(role)) throw new Error('Invalid fixture role');
    await db.exec(`set role ${role}`);
    try { return await db.query(sql,values); } finally { await db.exec('reset role'); }
  }
  // Browser route requests can overlap; serialize SET ROLE and calls together.
  let queue = Promise.resolve();
  function rpc(name,args={},role='anon') {
    if (!['mcpa_movement_snapshot','mcpa_movement_action'].includes(name)) return Promise.reject(new Error('Unknown fixture RPC'));
    const run = () => name==='mcpa_movement_snapshot'
      ? asRole(role,'select public.mcpa_movement_snapshot() as value').then(result=>result.rows[0].value)
      : asRole(role,'select public.mcpa_movement_action($1,$2::jsonb,$3::uuid) as value',[args.p_action,JSON.stringify(args.p_payload),args.p_operation_id]).then(result=>result.rows[0].value);
    const result = queue.then(run); queue=result.catch(()=>{}); return result;
  }
  return {db,rpc,asRole,actors,sites,tools,close:()=>db.close()};
}
module.exports={database,setup};
