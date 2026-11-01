import {loadEnvFile} from 'node:process';
import {writeFile} from 'node:fs/promises';

try { loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const {SUPABASE_URL:supabaseUrl, SUPABASE_PUBLISHABLE_KEY:supabasePublishableKey} = process.env;
if (!supabaseUrl || !supabasePublishableKey) throw Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env or the environment.');
const url = new URL(supabaseUrl);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('Use an HTTPS Supabase URL or a local development URL.');
let publishable = supabasePublishableKey.startsWith('sb_publishable_');
if (!publishable) {
  try { publishable = JSON.parse(Buffer.from(supabasePublishableKey.split('.')[1], 'base64url')).role === 'anon'; } catch {}
}
if (!publishable) throw Error('Browser configuration requires a publishable or anon key.');
await writeFile(new URL('../public/app/core/config.js', import.meta.url), '/* Public browser configuration. Regenerate with npm run configure. */\nwindow.MCPA_CONFIG = Object.freeze(' + JSON.stringify({supabaseUrl, supabasePublishableKey}, null, 2) + ');\n');
console.log('Updated public browser configuration.');
