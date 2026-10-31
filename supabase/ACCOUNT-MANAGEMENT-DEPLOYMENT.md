# People & Accountability deployment

Updated 27 October 2026. Invite User has been removed at the owner's request.
The app retains account access editing, verified recovery, account history,
password resets and explicitly enabled development accounts.

## Restored original Add Account

The Add Account button and main-page form have been restored from the flow before
invitations. Enter the full name, role, Supabase Auth user ID and account status.
Choose an existing company profile to update it or link its verified sign-in ID.
An inactive profile may be saved without a sign-in account; activation requires
an existing Auth user. Existing links and profile IDs cannot be reassigned.

This form uses the already installed mcpa_accounts / mcpa_save_account RPCs. It
works independently of the optional Edge test-account service. Restoring the form
requires the updated frontend; no new database migration or Edge configuration
is required for Add Account itself. No Auth credentials or emails are created by
this original form. The separately gated test-account feature is unchanged.

## Removal release

These changes are local. No hosted SQL, Edge Function or frontend was deployed
during this removal. The production project previously identified by the owner
is MCPA, `zpqxlmiqwevhlstjirei`; verify the target before running SQL.

1. Review and run only [202610270001_remove_user_invitations.sql](migrations/202610270001_remove_user_invitations.sql)
   in Supabase SQL Editor. Its final result should contain only true values.
   It drops both known invitation RPCs, removes invitation fields from the Admin
   account reader, and removes the prepared-job restriction on access editing and
   verified recovery. It preserves people, Auth identities/links, legacy job rows,
   stock and audit history.
2. Deploy all three files in `supabase/functions/manage-accounts/`: `index.ts`,
   `handler.mjs` and `runtime.mjs`. The service accepts only `capabilities` and
   `createDevelopmentAccount`. Old invitation actions are rejected before any
   privileged database write or Auth call.
3. Publish the updated frontend using the established hosting workflow.
4. Sign in as an existing active Admin. Verify the account list/search, Edit access,
   the Add Account form and history. Confirm invitation controls are absent.
   Check normal login/logout and password reset. Old setup links display an
   unsupported-link message and do not load company records.

Do not replay the historical migration directory. The original account-management
migration remains as schema history; replaying it would restore removed behavior.
The optional profile/username and whole-unit consumable proposals are independent
of this feature removal.

## Remaining service configuration

Every bearer is verified with Auth.getUser and a linked active Admin profile.
Privileged SQL rechecks that Admin. The legacy gateway JWT verifier is disabled
in `config.toml` for production's ES256 configuration; application and database
authorization remain required.

Server settings:

- `SUPABASE_URL`: injected by the hosted runtime.
- Server key: `MCPA_SUPABASE_SECRET_KEY`, injected `SUPABASE_SECRET_KEYS.default`,
  or `SUPABASE_SERVICE_ROLE_KEY`. Keep all server keys out of frontend assets.
- `MCPA_APP_URL`: application URL used to validate the browser origin. Production
  defaults to `https://waquinn.github.io/MCPA/index.html`; other environments
  require an explicit URL.
- `MCPA_ENABLE_DEVELOPMENT_ACCOUNTS`: disabled unless exactly `true`.
- Optional `MCPA_DEV_ORIGINS`: exact loopback origins with ports, accepted only
  when test-account creation is enabled.

Old invitation capability secrets are ignored. Password reset continues to use
Supabase Auth's existing reset email and configured application redirect. No Auth
settings or secrets were changed by this removal.

## Existing identities and test accounts

For an existing Auth login, the Admin verifies the identity/email in Supabase,
then links the correct company person through Sign-in Account Recovery. Existing
links cannot be reassigned or removed; the same profile keeps custody/history.
The editor cannot create/promote Admins or remove the acting Admin's own access.

Development / Testing Only creates Engineer or Architect test logins with a private
12–128 character password and no email. These are real accounts. Retry unfinished
test accounts with their original details/password; completed retries do not reset
passwords. Deactivate test accounts through Edit access when testing ends.

## Local verification

From `tests`:

```powershell
node --test --test-concurrency=1 accounts-edge.test.mjs accounts-database.test.cjs development-accounts.test.mjs auth-database.test.cjs functionality-audit-v2/database.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
node auth.browser.cjs --functionality-audit
```

These checks use disposable databases and modeled Auth; browser HTTPS is blocked.
They do not apply hosted SQL, create real users or send real email.
