/* Test-only browser configuration. No .env, credentials or live project needed. */
window.MCPA_CONFIG = Object.freeze({
  supabaseUrl: 'https://offline.mcpa.invalid',
  supabasePublishableKey: 'sb_publishable_offline_fixture'
});
