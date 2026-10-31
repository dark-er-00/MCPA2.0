// Trusted Node-only development utility. Never include this file in browser bundles.
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const accounts = [
  { email: 'admin.demo@mcpa.test', password: 'MCPA-Admin-2026!', name: 'MCPA Administrator', role: 'admin' },
  { email: 'engineer.demo@mcpa.test', password: 'MCPA-Engineer-2026!', name: 'MCPA Test Engineer', role: 'engineer' }
];
function checked(result, step) {
  // Never print raw SDK responses/errors, which can contain sensitive values.
  if (result.error) {
    if (['42703', '42P01', 'PGRST202', 'PGRST204', 'PGRST205'].includes(result.error.code)) {
      throw new Error(`${step} failed: required database columns, tables or RPCs are missing. Follow supabase/AUTH-DEPLOYMENT.md and apply supabase/migrations/202610040001_authenticated_access.sql, then rerun this seed.`);
    }
    throw new Error(`${step} failed. Check project configuration, migration and trusted API key.`);
  }
  return result.data;
}
async function findUser(client, email) {
  for (let page = 1; ; page++) {
    const data = checked(await client.auth.admin.listUsers({ page, perPage: 100 }), 'List Auth users');
    const user = data.users.find(user => user.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
}
export async function seedAccounts(client, log = console.log) {
  checked(await client.from('profiles').select('id,auth_user_id,name,role,account_status,updated_at').limit(0), 'Profile schema preflight (apply supabase/AUTH-DEPLOYMENT.md first)');
  checked(await client.rpc('mcpa_my_profile'), 'Auth RPC preflight');
  for (const account of accounts) {
    let user = await findUser(client, account.email);
    if (!user) {
      const result = await client.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      // Another invocation may have created this email concurrently.
      if (result.error) user = await findUser(client, account.email);
      else user = result.data.user;
      if (!user) checked(result, `Create ${account.role} account`);
      log(`${account.role}: Auth account ready`);
    } else log(`${account.role}: Auth account exists`);
    checked(await client.auth.admin.updateUserById(user.id, { password: account.password, email_confirm: true }), `Confirm/reset ${account.role} development login`);
    const linked = checked(await client.from('profiles').select('id,auth_user_id').eq('auth_user_id', user.id).maybeSingle(), 'Find linked profile');
    const sameId = linked || checked(await client.from('profiles').select('id,auth_user_id').eq('id', user.id).maybeSingle(), 'Find Auth UUID profile');
    if (sameId?.auth_user_id && sameId.auth_user_id !== user.id) throw new Error('Profile UUID is linked to another Auth user. Resolve the conflict manually.');
    const values = { auth_user_id: user.id, name: account.name, role: account.role, account_status: 'active', updated_at: new Date().toISOString() };
    if (sameId) checked(await client.from('profiles').update(values).eq('id', sameId.id).select('id').single(), 'Update profile');
    else checked(await client.from('profiles').insert({ id: user.id, ...values }).select('id').single(), 'Create profile');
    log(`${account.role}: active profile ready (${sameId?.id || user.id})`);
  }
  log('Both development accounts are ready. Architect shares Engineer permissions; no Architect account seeded.');
}
async function main() {
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to load root .env file.'); }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || key.startsWith('replace-')) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in root .env. See supabase/TEST-ACCOUNTS.md.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('Use HTTPS for remote Supabase projects.');
  console.log(`Seeding development accounts in ${parsed.origin}`);
  await seedAccounts(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof TypeError ? 'Configuration or connection failed. Check .env and network access.' : error.message); process.exitCode = 1; });
}
