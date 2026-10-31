# Merge integration and deployment review — October 12, 2026

**Later compatibility review:** [SUPABASE-RELEASE-READINESS.md](SUPABASE-RELEASE-READINESS.md) supersedes the deployment gate below. The user now confirms the reviewed Office wrapper exists live; do not rerun Office or optional-purpose SQL based on this historical report.

This report covers the existing merge on `wip/engineer-improvements` from
`origin/Updated-MCPARole` at `8e7ff9059c8d664b388eecd5a070a77fdecd4854`.
It supersedes the deployment instructions in the incoming implementation reports.
No new merge, reset, history rewrite, push, live SQL, or GitHub Pages configuration
change was performed. The previously committed local work and incoming documents,
tests and screenshot artifacts are retained.

## Combined behavior and integration fixes

- Requests use the incoming `requestDestinationField()` and one `requestSites()`
  filter. It requires an active site with a stable `assigned_engineer_id` equal to
  the authenticated company `profiles.id`, a valid site ID and nonempty name.
  There is no display-name/Auth-UUID authorization and no all-project fallback.
  The duplicate local filter and refresh handler were removed. Existing Admin
  review and explicit offline demo behavior remain intact.
- Native selection retains full-name captions, keyboard/touch behavior and a
  profile-scoped session preference containing the stable project ID. Refreshes
  retain valid draft selections, remove revoked/archived options, preserve the
  remaining form, and auto-select a single authorized project. No-site state
  disables submission. Manipulated values are rejected before the RPC and again
  by the existing authenticated backend gateway.
- Purpose remains optional, with `maxlength=2000`; Needed Until remains optional.
  Empty purpose is stored as compatible empty/null data with no placeholder.
  The already-applied `202610120003_optional_request_purpose.sql` is unchanged.
- Both `data-request-submit` and `data-return-submit` remain. Eligibility,
  assigned-project and Office-configuration guards are retained. The request
  guard now refreshes after a save ends, fixing a newly disabled submit button
  that otherwise persisted until another sync.
- Returns use the fixed Office display and authenticated Office reader. There is
  no destination dropdown or hidden required destination field. The server
  validates the Office UUID and canonical name, custody, reservations and every
  inspection. Good/damaged physical returns go to Office and release personal
  custody; missing items retain last holder/location and recorded accountability.
- Engineer/Architect Recent Activity remains immediately after compact summary
  information, before Pending Equipment Turnover, My Requests and analytics.
  The field dashboard wrapper was restored so its existing compact/responsive
  styles apply. Admin layout remains unchanged; activity is rendered once.
  All request status panels, deep links, cards, QR workflows and receipt checks
  are preserved.
- Browser fixture dependencies are collected once in a Set and applied in sorted
  dependency order. Turnover and assigned-project modes receive cancellation,
  monitoring and turnover SQL. Default/Engineer UX modes retain monitoring.
  Feature mode retains its storage/ledger dependencies. Every browser mode
  applies optional purpose before Office setup, reproducing the user-reported
  live installation order. Incoming Office fixtures and test modes remain.

## Files

Conflict/integration edits: `js/movement-ui.js`, `tests/auth.browser.cjs`.
Additional fixes/verification: `js/dashboard-view.js`,
`tests/engineer-ux.browser-checks.cjs`, `tests/office-return.database.test.cjs`,
`supabase/migrations/202610120002_office_returns.sql`,
`supabase/office-return-preflight.sql`,
`supabase/merge-integration-verification.sql`,
`OFFICE-RETURN-IMPLEMENTATION.md`, and this report.

Incoming work retained: `css/movement.css`, `js/movement-cloud.js`,
`js/movement-store.js`, `tests/auth-test-db.cjs`,
`tests/movement-store.test.cjs`, `tests/notification-ui-checks.cjs`,
`tests/package.json`, `tests/office-return-fixture.cjs`,
`tests/office-return.browser-checks.cjs`,
`tests/request-projects.browser-checks.cjs`,
`tests/request-projects.database.test.cjs`,
`supabase/office-location-configuration.sql`,
`REQUEST-PROJECTS-IMPLEMENTATION.md`, and all ten incoming Office/request-project
screenshots. Office SQL and its test file also contain the explicit integration
fix described below. No secrets or unrelated files were introduced.

## Office SQL compatibility

The incoming Office migration compared the entire private lifecycle source to
the old required-purpose hash `5b94b3b5642f26981a80382a2b1b6be7`. An installed
optional-purpose patch changes that hash, so the original Office migration would
abort. It does **not** replace `mcpa_auth_private.mcpa_movement_action`; it wraps
the public gateway. Thus the actual risk was deployment failure, not a silent
return to required purpose.

The reviewed correction normalizes only the exact optional-purpose validation
statement to the original statement **in memory for the hash comparison**. Every
other source byte must still match the reviewed lifecycle. It never executes a
replacement of the private lifecycle. Both migration orders, reapplication,
unchanged function definitions/records, empty-purpose requests through Admin
approval/release, turnover notifications, Office enforcement and unrelated-source
drift rejection passed isolated PostgreSQL tests.

Only the not-yet-confirmed Office migration's guard was changed; the already
applied optional-purpose and turnover migrations were not edited. Migration
versions are unique: `202610120001` turnover notifications, `202610120002` Office
returns, `202610120003` optional purpose. Fifteen total migration versions were
checked; no obsolete optional-purpose filename references remain.

The Office migration creates a private singleton configuration with an existing
site FK, RLS and no client table access; adds the private Office resolver and
public role-restricted destination reader; moves the existing public gateway to
`mcpa_auth_private.movement_before_office_returns`; and installs a narrow public
wrapper. It preserves non-return operations and historical retry behavior. It
revokes direct access to private helpers and permits authenticated execution only
of the public RPCs. It does not rewrite existing returns, tools, projects,
profiles, transfers or activity. Only future validated physical returns update
custody. Current Office designation is pinned to the supplied existing UUID
`ba8bef8c-139a-43b9-ae2b-5857293b7f33`; installation verifies activity, uniqueness
and absence of a conflicting designation.

## Executed checks

All database writes used disposable PGlite fixtures. Browser tests used local
headless Chrome with external HTTPS blocked. Supabase Auth/Realtime transport and
camera input are modeled; PostgreSQL functions, RLS and transactions execute in
the local database. Counts overlap across suites and are not unique-test totals.

| Exact command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/dashboard-view.test.cjs tests/engineer-ux.database.test.cjs tests/request-turnover.database.test.cjs tests/request-projects.database.test.cjs tests/office-return.database.test.cjs` | 24/24 passed |
| `npm.cmd --prefix tests run test:request-projects` | 9/9 plus independent-session assigned-project browser checks passed |
| `npm.cmd --prefix tests test` | 59/59, all 8 movement database scenarios, and normal browser regression passed |
| `npm.cmd --prefix tests run test:office-returns` | 26/26 plus Office browser checks passed |
| `npm.cmd --prefix tests run test:turnover` | 14/14 plus independent-session turnover browser checks passed; real 30-second fallback observed |
| `node tests/auth.browser.cjs --engineer-ux` | Passed; 320/360/375/393/430/768/1440 widths, both themes, reload/revocation, optional purpose, cards/details, activity, notification isolation/read state and missing-RPC retry suppression |
| `npm.cmd --prefix tests run test:features` | 30/30 plus feature browser checks passed |
| `npm.cmd --prefix tests run test:portal` | 1/1 plus Engineer portal/QR browser checks passed |
| `npm.cmd --prefix tests run test:projects` | 3/3 plus schema-error and role-scoped project browser checks passed |
| `node tests/auth.browser.cjs` | Passed again on final frontend changes; notification channels/timers, draft-preserving synchronization and cleanup included |
| `node --test tests/office-return.database.test.cjs` | 9/9 passed again, including execution of both new read-only verification queries |
| `npm.cmd --prefix tests run test:transfer-history` | Browser checks passed at 320–1440px in both themes; cards/table, filtering, details and role isolation |

Syntax validation executed `node --check` for all 116 tracked JS/CJS/MJS files.
Tracked source conflict-marker and obsolete filename scans were empty. The
default browser run also covers all five roles, sign-in/logout, recovery forms,
approval/release/receipt/return, activity deep-link recovery, themes and mobile
navigation. New screenshots were inspected for the mobile dashboard, desktop
Office return and mobile assigned-project form; they remain temporary test
artifacts. Existing incoming screenshots were preserved.

No post-resolution test failed. The separate pre-merge task had encountered a
Chrome sandbox/debugging limitation and a temporary approval-review usage limit;
the requested merge regressions subsequently ran successfully with approved
isolated Chrome execution. Physical phones, optical camera scanning, deployed
Auth/email delivery and production SQL were not tested here.

## Manual deployment plan — not executed

**Production readiness: NOT READY until the live Office configuration and backend
installation have been verified.** The merged application passes local checks;
this deployment gate is independent of finishing the local Git merge.

1. In the intended Supabase project, review and run the read-only
   [`supabase/office-return-preflight.sql`](supabase/office-return-preflight.sql).
   Confirm the configured Office UUID is the existing active receiving location;
   `reviewed_lifecycle_compatible`, `optional_purpose_installed` and
   `stable_recipient_preserved` must be true. Inspect the actual installed gateway
   and Office status. Unknown/custom definitions require review, not relaxed
   guards. The previous report's raw required-purpose hash is not the expected
   raw hash after optional purpose.
2. If Office is absent, manually review/apply only the corrected
   [`202610120002_office_returns.sql`](supabase/migrations/202610120002_office_returns.sql).
   If Office is already installed, verify the existing designation/definitions
   before considering any update. Do not reapply optional-purpose or turnover SQL,
   recreate Office, rerun prototype setup, reset data or apply unrelated
   migrations. A changed filename is not evidence of a deployed migration. If
   using a migration ledger/CLI later, reconcile its actual entries separately;
   no ledger changes are authorized or performed here.
3. Run the read-only
   [`supabase/merge-integration-verification.sql`](supabase/merge-integration-verification.sql).
   All feature/identity/trigger flags should be true; both `*_execute` flags must
   be false. Inspect the commented Office designation query after installation.
   The Office migration itself also emits its verification JSON. Stop on a guard
   failure and retain the error; never reset existing records to make it pass.
4. Only after those checks and approval to publish, update the local production
   branch and push normally. From a clean working tree:

   ```powershell
   git fetch origin
   git switch Updated-MCPARole
   git merge --ff-only origin/Updated-MCPARole
   git merge --ff-only wip/engineer-improvements
   git push origin Updated-MCPARole
   ```

   If either fast-forward fails, stop and integrate the new remote commits on the
   development branch, then retest. Do not force-push or alter Pages settings.
   Pages remains `Updated-MCPARole`, `/(root)`. No command in this block was run
   by the agent. After approved publication, verify login, scoped projects,
   empty-purpose requests, turnover and Office returns with designated safe
   development records, without altering successful historical transactions.

**Next safe manual action:** run and review the read-only Office preflight above.
