import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors';
import { createHandler } from './handler.mjs';
import { readConfiguration } from './runtime.mjs';

// Configured only in Edge Function secrets, never frontend assets.
const {url,serverKey,...options}=readConfiguration(name=>Deno.env.get(name));
const admin = createClient(url,serverKey, {
  auth: {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
});
Deno.serve(createHandler({admin,...options,corsAllowedHeaders:[corsHeaders['Access-Control-Allow-Headers'],
  'x-supabase-client-platform','x-supabase-client-platform-version','x-supabase-client-runtime','x-supabase-client-runtime-version'].join(', ')}));
