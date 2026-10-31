// Trusted local operator tool, never imported by the browser. No account creation,
// profile edits or deletion. Restricted to the development identity reviewed live.
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {createClient} from '@supabase/supabase-js';

export const target = Object.freeze({
  url: 'https://zpqxlmiqwevhlstjirei.supabase.co',
  email: 'development.engineer.a@mcpa.test',
  authId: '79ef5045-2a17-484b-bc44-4ab3fa05094b',
  profileId: '79ea0217-fb3b-4cce-afb8-586ae885cc2a',
  jobId: '8f69381b-bba7-4aba-83d8-d65592c0e678',
});
class RepairError extends Error {}
function checked(result, message) {
  if (result.error || !result.data) throw new RepairError(message);
  return result.data;
}

export async function verifyEngineerA(client) {
  const {user} = checked(await client.auth.admin.getUserById(target.authId), 'Cannot verify the existing Auth account.');
  if (user?.id !== target.authId || user.email !== target.email || !user.email_confirmed_at
    || user.app_metadata?.mcpa_development_account !== true
    || user.app_metadata?.mcpa_development_job_id !== target.jobId) {
    throw new RepairError('Auth identity or development marker changed. No password updated.');
  }
  const profile = checked(await client.from('profiles').select('id,auth_user_id,role,account_status')
    .eq('auth_user_id', target.authId).single(), 'Cannot verify the linked profile.');
  if (profile.id !== target.profileId || profile.auth_user_id !== target.authId
    || profile.role !== 'engineer' || profile.account_status !== 'active') {
    throw new RepairError('The linked profile is not the reviewed active Engineer. No password updated.');
  }
  const job = checked(await client.from('mcpa_development_accounts').select('id,email,profile_id,role,state')
    .eq('id', target.jobId).single(), 'Cannot verify the development creation record.');
  if (job.id !== target.jobId || job.email !== target.email || job.profile_id !== target.profileId
    || job.role !== 'engineer' || job.state !== 'created') {
    throw new RepairError('Development creation record changed. No password updated.');
  }
}

export async function repairEngineerA(client, password, confirmation) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim()) {
    throw new RepairError('Use a new temporary password of 12–128 characters.');
  }
  if (password !== confirmation) throw new RepairError('Passwords do not match. No password updated.');
  // Recheck immediately before mutation, including after time spent at the prompt.
  await verifyEngineerA(client);
  const result = await client.auth.admin.updateUserById(target.authId, {password});
  const {user} = checked(result, 'Auth did not confirm the password update. Check Auth logs before retrying.');
  if (user?.id !== target.authId) throw new RepairError('Unexpected Auth response. Verify the account before retrying.');
}

// Readline handles editing in raw terminal mode; its output (including input
// echo) goes to a sink. Refuse redirected input so passwords stay out of files,
// command arguments and shell history. Ctrl+C closes the prompt without updating.
export async function readHidden(label, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) throw new RepairError('Run in an interactive terminal to enter the password privately.');
  const sink = new Writable({write(_chunk, _encoding, done) { done(); }});
  const prompt = createInterface({input, output:sink, terminal:true, historySize:0});
  output.write(label);
  try {
    return await new Promise((resolve, reject) => {
      prompt.once('SIGINT', () => reject(new RepairError('Cancelled. No password updated.')));
      prompt.once('close', () => reject(new RepairError('Input closed. No password updated.')));
      prompt.question('', resolve);
    });
  } finally {
    prompt.close();
    sink.destroy();
    output.write('\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--development'].includes(args[0])) {
    throw new RepairError('Use --check for read-only verification or --development for the private password prompt. Never pass a password on the command line.');
  }
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch { throw new RepairError('Could not read private local .env configuration.'); }
  const {SUPABASE_URL:url, SUPABASE_SECRET_KEY:key} = process.env;
  if (url !== target.url || !key) throw new RepairError('The private configuration must match the reviewed Supabase project and contain its server credential.');
  const client = createClient(url, key, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}});
  await verifyEngineerA(client);
  console.log('Verified Engineer A: confirmed Auth user, active Engineer profile, completed development creation record.');
  if (args[0] === '--check') return;
  console.log('Updating only development.engineer.a@mcpa.test. Enter a NEW password; input stays hidden.');
  let password = '', confirmation = '';
  try {
    password = await readHidden('New temporary password (12–128 characters): ');
    confirmation = await readHidden('Confirm new temporary password: ');
    await repairEngineerA(client, password, confirmation);
    console.log('Password updated. Existing Auth user, profile, custody and history preserved. You can now sign in.');
  } finally { password = ''; confirmation = ''; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never print upstream errors, request objects or supplied credentials.
    console.error(error instanceof RepairError ? error.message : 'Repair could not be confirmed. Check connectivity and Auth logs before retrying.');
    process.exitCode = 1;
  });
}
