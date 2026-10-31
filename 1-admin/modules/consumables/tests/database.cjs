// Test-only PostgreSQL database. Never connects to the configured Supabase project.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const setup = fs.readFileSync(path.join(__dirname, '../setup.sql'), 'utf8');
const signatures = {
  consumables_save_item: ['p_id', 'p_version', 'p_name', 'p_unit', 'p_minimum', 'p_opening'],
  consumables_adjust_stock: ['p_operation_id', 'p_item_id', 'p_version', 'p_kind', 'p_quantity', 'p_note'],
  consumables_create_request: ['p_id', 'p_item_id', 'p_quantity', 'p_requester', 'p_purpose', 'p_needed_by'],
  consumables_receive_request: ['p_operation_id', 'p_request_id', 'p_version', 'p_quantity', 'p_note'],
  consumables_cancel_request: ['p_request_id', 'p_version', 'p_reason']
};
async function database() {
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;');
  await db.exec(setup);
  async function asRole(role, sql, values = []) {
    if (!['anon', 'authenticated'].includes(role)) throw new Error('Invalid test role');
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      return tx.query(sql, values);
    });
  }
  async function rpc(name, params, role = 'anon') {
    const keys = signatures[name];
    if (!keys) throw new Error('Unknown test RPC');
    const result = await asRole(role, `select to_jsonb(public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(',')})) as value`, keys.map(key => params[key] ?? null));
    return result.rows[0].value;
  }
  return { db, rpc, asRole };
}
module.exports = { database, setup };
