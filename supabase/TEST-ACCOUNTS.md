# Real development accounts

**The credentials below are seed inputs, not proof that accounts exist.** They work only after `node scripts/seed-test-users.mjs` completes successfully against the same Supabase project used by the browser. A `400 invalid_credentials` response from `/auth/v1/token` means Auth rejected the login; check that the account exists under Authentication → Users and rerun the trusted seed script to restore its password. Profile/RLS changes cannot fix a rejected password login.

These accounts use Supabase Auth and live database records. They are separate from **Try offline demo**. Use only in a development project; rerunning the script restores the listed passwords and active roles.

## Setup (PowerShell, repository root)

1. Follow [AUTH-DEPLOYMENT.md](AUTH-DEPLOYMENT.md): run preflight and apply the existing `202610040001_authenticated_access.sql` migration in the project's SQL Editor. The seed script does not apply SQL or disable RLS. Review existing triggers and policies as described there.
2. In the Supabase development project's **Connect** dialog obtain the Project URL. Under **Settings → API Keys**, obtain a server secret key (`sb_secret_...`). Put it in `SUPABASE_SECRET_KEY` below. The script does not require the legacy `SUPABASE_SERVICE_ROLE_KEY` variable. Never use the publishable/anon key for account administration. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Create `.env` in the repository root (copy `.env.example` if it does not already exist):

   ```dotenv
   SUPABASE_URL=https://YOUR-DEVELOPMENT-PROJECT.supabase.co
   SUPABASE_SECRET_KEY=YOUR-PRIVATE-SERVER-KEY
   ```

   `.env` is ignored by Git. Never paste this key into chat, frontend code, localStorage or committed files. Do not serve the repository root with an unrestricted file server: exclude `.env`, `scripts`, `.git` and other private files from hosting. The browser continues using its existing public key. Use the same project as the browser configuration in `js/equipment-tracking.js` and `js/movement-cloud.js`.
4. With Node 22+ installed, run:

   ```powershell
   npm.cmd ci --prefix scripts
   node scripts/seed-test-users.mjs
   ```

   The package installed is `@supabase/supabase-js` v2, locked in `scripts/package-lock.json`. Native Node environment loading requires no dotenv package. Environment variables already set in the shell take precedence over `.env`.
5. Open the existing app, exit Offline Demo if necessary, and sign in manually:

   | Account | Email | Development password |
   |---|---|---|
   | Admin | admin.demo@mcpa.test | MCPA-Admin-2026! |
   | Engineer | engineer.demo@mcpa.test | MCPA-Engineer-2026! |

Emails are confirmed through the Admin API; no mailbox is required. Passwords are sent only to Auth, never to profiles. Architect has the same operational routes, actions and database permissions as Engineer, so a third account is unnecessary.

## Profile identity and repeat runs

The existing schema uses `profiles.name` and `profiles.auth_user_id = auth.users.id`. New profiles also receive `id = auth.users.id`. An already linked historical profile retains its existing ID, preserving custody and audit references. No matching by display name, duplicate profile system, or role metadata is introduced. Existing creation timestamps/defaults are preserved; `updated_at` is refreshed. The script paginates Auth users, reuses email matches, confirms email, resets the development password, and ensures the intended role/status.

If creation succeeds but profile setup fails, the command exits nonzero; fix the reported prerequisite and rerun. It will reuse the Auth account. Run one seeding invocation at a time. Do not delete historical profiles to resolve conflicts.

## Verify real sessions

- Admin: confirm Admin dashboard/navigation, People & Accountability and review controls. Borrower quick actions must be absent.
- Admin: assign a development project to **MCPA Test Engineer** in Projects. Seeding does not reassign existing company projects or create equipment. Without project assignment, the Engineer cannot submit requests for that project.
- Engineer: confirm operational dashboard, request available test equipment for the assigned project, then have Admin approve/release. Confirm receipt as Engineer, test transfer/return and issue reporting using test equipment. Live actions change real records.
- Engineer: `#users` and `#reports` must be blocked. Raw full inventory/profile access must remain restricted; operational snapshots supply scoped records.
- Refresh each signed-in browser: Supabase's persistent session should restore the database profile and correct dashboard. Log out, then refresh/back: protected UI must stay hidden.
- Check browser console/network for errors, and verify Offline Demo remains separate and makes no live data requests.

Local verification: `npm.cmd run test:auth --prefix tests` uses simulated Auth transport and actual local PostgreSQL/RLS; it does not prove real Auth login, SMTP delivery or live policy deployment.

Verification on 2026-10-05: both seed unit tests and the local database authorization test passed. The browser suite passed outside the sandbox after sandboxed Chrome debugging timed out: all five roles, Admin review/release, Engineer tested receipt/return, session restoration/logout, direct route guards and offline isolation. No live accounts were created during this verification because the root `.env` was unavailable. No SQL migration or policy changes were added by the seed implementation.

Latest live verification on 2026-10-05, after the project owner applied the migration: **both accounts were created successfully** using `node scripts/seed-test-users.mjs`. Email confirmation, exact names, active roles, and `profiles.id = profiles.auth_user_id = auth.users.id` were verified for each account.

| Account | Auth/profile UUID | Result |
|---|---|---|
| Admin | b28645de-d763-4cd8-91a3-68c31b7d03a5 | Real login, profile RPC, live snapshot and account-management access passed |
| Engineer | 9c31f387-788d-4ff5-9a87-96d13a394fe3 | Real login, profile RPC and live snapshot passed; account management and raw full inventory access restricted |

Real Chrome checks also passed for both accounts: existing login form, correct dashboard, persistent session on refresh, logout and signed-out refresh. Admin had no borrower quick actions; Engineer's Admin route was blocked. No uncaught JavaScript errors occurred. The browser used the public key and real Supabase SDK, with no mocked Auth or database. No live business transactions were submitted. Engineer currently has no assigned project; assign a development project before testing requests.

To repeat the live browser check (requires Chrome or `CHROME_PATH`):

```powershell
node scripts/verify-test-login.browser.cjs
```

This explicit live check signs in/out and reads authorized data; it does not load `.env`, use a server key, or modify equipment/project records.

Forgot password already calls Supabase and handles password recovery. Delivery still depends on project SMTP/redirect configuration. These `.test` addresses have no mailbox, so rerun the seed script to reset their passwords.

## Two real Engineers for transfer testing (new workflow)

Complete [ACCOUNT-MANAGEMENT-DEPLOYMENT.md](ACCOUNT-MANAGEMENT-DEPLOYMENT.md) first.
The account-management changes and live email workflow have not yet been deployed
or verified merely by adding these files.

### Current free workflow — authenticated Admin and Edge Function

Custom SMTP is not configured. After the deployment gates are completed, sign in
as the existing Admin at `https://waquinn.github.io/MCPA/` and open People &
Accountability → **Development / Testing Only**. Create these two accounts one at
a time, choosing a different private password of 12–128 characters for each:

| Full name | Email | Role |
|---|---|---|
| MCPA Development Engineer A | development.engineer.a@mcpa.test | Engineer |
| MCPA Development Engineer B | development.engineer.b@mcpa.test | Engineer |

These reserved test emails do not have inboxes; no email is sent. Save the passwords
privately and sign in through the normal login form in separate browser profiles.
The Edge Function uses Auth Admin `createUser`, confirms these test emails, then
links independent company profiles with Admin-attributed audit events. The browser
does not receive a server key. Allowed roles are Engineer and Architect only.

If creation is interrupted, retry the same details and original password. It
reuses the Auth user and does not reset a password. Do not use existing production
identities or overwrite an existing test account to make creation pass. The UI
retains production invitations but marks them unavailable until email is configured.

Complete the live A → B test below. Keep the original Admin and Test Engineer
unchanged. Deactivate these temporary accounts through Edit access when finished;
do not delete their profiles or history. Creation does not assign projects or custody.

These two live accounts have **not yet been created** by the local implementation.

### Future production invitations

With SMTP configured: in People & Accountability, invite **MCPA Transfer Engineer A** and
**MCPA Transfer Engineer B**, with two real inboxes and role **Engineer**. Each
recipient opens their invitation, sets a password, and signs in. Select an existing
company profile instead if that person already has historical records.

### Optional operator-only Node helper (not the current UI deployment path)

For a separate development project without mailbox delivery, the trusted Node helper can
create two actual Supabase Auth accounts with confirmed email. It uses the same
`profiles.auth_user_id` architecture but does not test invitation delivery or create
Admin-attributed invitation audit events. It makes no equipment/project changes.

Add these **private** values to the root `.env`, alongside `SUPABASE_URL` and
`SUPABASE_SECRET_KEY`:

```dotenv
MCPA_ENGINEER_A_EMAIL=engineer.a@mcpa.test
MCPA_ENGINEER_A_PASSWORD=YOUR-UNIQUE-12-OR-MORE-CHARACTER-PASSWORD
MCPA_ENGINEER_B_EMAIL=engineer.b@mcpa.test
MCPA_ENGINEER_B_PASSWORD=ANOTHER-UNIQUE-12-OR-MORE-CHARACTER-PASSWORD
```

Optional `MCPA_ENGINEER_A_NAME` / `MCPA_ENGINEER_B_NAME` override the names above.
If linking existing historical people, also set `MCPA_ENGINEER_A_PROFILE_ID` /
`MCPA_ENGINEER_B_PROFILE_ID` to their verified existing profile UUIDs and supply
matching names. The helper refuses ambiguous names instead of silently duplicating
them. New company-person IDs are generated independently of Auth user IDs.

Run one invocation at a time, only against a development project:

```powershell
npm.cmd ci --prefix scripts
node scripts/seed-transfer-users.mjs --development
```

Repeat runs reuse linked active Engineers and **do not reset their passwords**.
Use Forgot password for real inboxes or the trusted Supabase dashboard for a
development-only password reset. A provisioning failure may leave an Auth account;
fix the reported issue and rerun to reconcile the same person. Do not delete
historical profiles to make the helper pass. Do not use this helper for a person
whose production invitation is still being processed.

**MCPA Administrator** and **MCPA Test Engineer** are protected from use as these two
new accounts; their identities and credentials are not changed by this helper.

### Live A → B acceptance test

1. Admin assigns a development project to Engineer A. Choose available test
   equipment with positive quantity and no current holder.
2. A requests it. Admin approves/releases. A enters the transfer reference, tests
   and confirms receipt. Verify A is now the holder; this establishes legitimate
   initial custody without manually editing the equipment record.
3. In a separate browser profile/device, sign in as B. Keep Admin in a third session.
4. A creates a transfer, selecting B by name/role/project. The option value and
   request payload must contain B's **profile UUID**. Copy the generated transfer
   reference or display its QR.
5. Before B receives, Admin verifies A still holds the equipment and the transfer
   is pending. A or another Engineer must not be able to confirm B's receipt.
6. B enters/scans the reference, inspects every tool, marks received tools tested,
   and confirms. The holder changes to B only after this succeeds.
7. Admin checks the completed transfer, holder UUID and movement history. Refresh
   all sessions and confirm the saved state persists. A second receipt attempt
   must not change custody again.
8. Repeat with two identical display names, different profile IDs and projects;
   then with an inactive B. The first must select the intended person correctly;
   the second must reject receipt without changing custody.

These tests change real custody. Use designated development equipment and restore
it through the normal inspected return workflow when finished. No live test users
or transfers were created as part of the local implementation.
