# Admin PDF backend review — unapplied drafts

These files are outside the migration runner. Nothing here runs at startup.
No Production/Staging connection or migration is authorized. All validation used
synthetic identities and an isolated PGlite database with a local Auth/Storage model.

## Dependencies and compatibility

1. Run `preflight.sql` only after separate authorization to connect. Save exact
   function definitions, argument/result types, OIDs, owners, ACLs, dependencies,
   profile constraints/indexes, RLS/policies, and a database backup. Confirm the
   installed account-management, invitation-retirement, project-construction,
   quantity/material request, custody and Auth/Storage schemas match the source.
2. `00-self-profile-compatibility.sql` supports the known authenticated-access
   profile reader and reviewed self-profile editor. It rejects unknown function
   bodies, unexpected username types/indexes, and incompatible signatures. It
   preserves profile IDs, Auth links, role, status and email. Existing invalid or
   duplicate usernames must be reviewed explicitly; this draft never rewrites them.
3. `01-account-removal.sql` expects the reviewed `mcpa_accounts` and
   `mcpa_save_account` bodies from `202610270001_remove_user_invitations.sql`.
   Their OIDs remain intact; no function is renamed or relocated. Unknown bodies
   stop installation. The editor rechecks active Admin access after acquiring the
   existing account lock. Review any additional local grants/overloads separately.
4. `02-profile-pictures.sql` requires the private Storage schema and profile editor.
   The bucket is private, 2 MiB, JPEG/PNG/WebP, owner paths only. Restrictive RLS
   rules protect it even when older permissive policies cover all buckets.
   Authenticated overwrite/delete is unavailable, preventing a concurrent pointer
   save from referencing a deleted upload. Old/unused objects remain private;
   cleanup requires a separate maintenance transaction with matching locks.
5. `03-registration-invitations.sql` requires 00/01 and existing Auth/account audit
   tables. All `mcpa_registration_*` RPCs are service-only; the PHP gateway blocks
   browser calls even with an Admin JWT. `mcpa_activate_registration()` is the sole
   authenticated activation RPC and checks `auth.uid()`, server-owned invite
   metadata, exact email, Auth confirmation, role, deadline and creator authorization.

Installation is ordered 00 → 01 → 02 → 03 in one reviewed rollout. Each file is
transactional; 01–03 intentionally install once rather than silently replacing
unknown objects. Never rerun historical migrations or bypass compatibility guards.

## Removal, archive and concurrency

Requests and decisions require distinct active Admins; the target cannot approve.
Self removal, repeat conflicting decisions and last-Admin removal are blocked.
Equipment custody, active assigned projects, unresolved movements, pending
quantity requests without movements, and pending/approved/partial material requests
block approval. Profiles become inactive with a retained removal marker; Auth users
and all foreign-key history stay intact. The account reader projects `removed`.
Reactivation requires separately reviewed restoration; the old access editor cannot
silently reactivate a removed profile.

The existing `(672341,2027)` transaction advisory lock serializes account edits,
removal, registration and new responsibilities. Triggers on equipment, projects,
movements, quantity requests and material requests reject new responsibility for a
removed person under the same lock. Row locks serialize decisions and link claims.
PGlite checks transitions and permissions, **not real PostgreSQL multi-session
contention, deadlocks or pool behavior**. An approved Staging exercise must test
removal against concurrent allocation/assignment/request submission, simultaneous
Admin decisions/access changes, invitation redemption and callback activation.

## Invitation runtime and configuration awaiting approval

Runtime uses `server/Invitations.php` through the existing PHP API transport:

- Admin `manage-accounts`: `createInvitation`, `reviewInvitations`,
  `reconcileInvitation`, `revokeInvitation`. JWT identity and active Admin profile
  are verified by `Accounts.php`; browser actor IDs and Admin role invitations fail.
- Public `register-invitation`: `redeem`/`resend` accept only an opaque token and,
  on first redemption, a password. Email/name/role come exclusively from SQL.
- Admin copy links use a random 256-bit token in `#register=…`, expire in 24 hours,
  and store only SHA-256 hashes. No Auth identity is created when copying a link.
  The registration view clears its URL fragment and keeps the token only in memory.
- One atomic claim creates one unconfirmed Auth identity via the server-only Admin
  API, then an inactive profile with trusted invite metadata. Supabase's signup
  confirmation resend sends to the bound email. It never returns verification
  tokens to the Admin or invitee. Confirmation/session return activates only the
  matching profile, within 24 hours of claim. Normal verified sign-in can finish
  activation too; unrelated/inactive profiles are never activated automatically.
- Interrupted Auth creation/finish stays claimed or held. Reconciliation links only
  a matching existing Auth identity and never creates another or changes a password.
  If no matching identity is visible, the job stays held for explicit operator
  review; this is intentional protection against an in-flight/uncertain request.
- Creation limits: 10/Admin/hour and 100 total/hour, including revoked links.
  Email: 60 seconds apart, at most 5 requests per registration. Registration boundary:
  60 attempts/IP/minute, 1,000 total/minute. Only an HMAC of web-server REMOTE_ADDR
  is stored temporarily, never raw IPs or forwarded headers. Review trusted proxy
  configuration before activation; a proxy address may otherwise share the quota.

Activation requires **separate approval** for SQL, server credentials and Auth
configuration. Keep `MCPA_ENABLE_REGISTRATION_INVITATIONS=false` (default) meanwhile.
After approval, set server-only `MCPA_SUPABASE_SECRET_KEY`, explicit
`MCPA_ENABLE_REGISTRATION_INVITATIONS=true`, and an HTTPS `MCPA_APP_URL` base directory
(loopback HTTP is permitted for fixtures). Do not include query/fragment components.
The browser receives only the publishable key; never put server keys in client code.
The capability is available only when the flag, key, application URL and v2 SQL all
exist. Ensure public Auth signup remains disabled and no auto-profile trigger grants
access. Review existing Auth hooks/triggers in the intended environment.

Configure email provider/SMTP, email confirmation and the exact allowed callback
`<MCPA_APP_URL>/index.html?registration=verify`. The email template must retain the
Supabase confirmation URL and redirect. Actual provider delivery, hosted Auth
configuration and redirect allowlisting cannot be proven by offline fixtures.
Retired `account_setup=invite`/`type=invite` links remain rejected.

API reference checks: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
and [resend](https://supabase.com/docs/reference/javascript/auth-resend). The Auth
fixture models these APIs; it does not replace an approved provider integration test.

## Rollback

Disable the invitation server flag first. With 00–02 installed, `rollback.sql`
disables new removal/photo writes, reports photo editing unavailable, and revokes
installed registration RPC privileges. It retains identities, links, audit, removed
markers, restrictive Storage boundaries and private uploaded files. Review individual
clauses if only a subset was installed. Existing sessions remain subject to inactive
profile checks; never restore removed access implicitly.

This is a **write-disable rollback**, not a destructive schema downgrade. Restore
captured preflight definitions/ACLs only with a separately approved compatibility
plan. Do not delete Auth users, invited profiles or audit records. Expired/held
registrations and any provider delivery ambiguity require explicit operator review.
