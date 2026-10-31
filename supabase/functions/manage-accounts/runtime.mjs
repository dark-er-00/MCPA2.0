// Reads server-injected keys only. Do not load the repository's staging .env.
export function readConfiguration(get) {
  const url=get('SUPABASE_URL');
  if(!url)throw Error('SUPABASE_URL is not available in the function runtime.');
  let injected={};
  const raw=get('SUPABASE_SECRET_KEYS');
  if(raw){try{injected=JSON.parse(raw);}catch{throw Error('The server key configuration is invalid.');}}
  const serverKey=get('MCPA_SUPABASE_SECRET_KEY')||injected.default||get('SUPABASE_SERVICE_ROLE_KEY');
  if(!serverKey)throw Error('A Supabase server key is not available in the function runtime.');
  const production=new URL(url).hostname==='zpqxlmiqwevhlstjirei.supabase.co';
  const appUrl=get('MCPA_APP_URL')||(production?'https://waquinn.github.io/MCPA/index.html':null);
  if(!appUrl)throw Error('Set MCPA_APP_URL to this environment’s application login URL.');
  return {url,serverKey,appUrl,
    developmentEnabled:get('MCPA_ENABLE_DEVELOPMENT_ACCOUNTS')==='true',
    developmentOrigins:(get('MCPA_DEV_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean),
  };
}
