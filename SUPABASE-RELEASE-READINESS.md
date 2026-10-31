# Supabase compatibility and release readiness — October 12, 2026

**NOT READY TO DEPLOY: live delegate/configuration/security and notification verification remains pending.** No broken Office dependency has been established. Local functionality passes the checks below. No live database access, SQL execution, push, deployment, or Pages settings change was performed.

This report supersedes the deployment instructions in the earlier merge and Office reports. The Git merge was already complete at `4ecb0cb9554045c95443b55f137bac72569145aa`; it was not redone. The starting tree was clean. A fresh `git fetch origin` found `origin/Updated-MCPARole` still at `8e7ff9059c8d664b388eecd5a070a77fdecd4854`. `git rev-list --left-right --count origin/Updated-MCPARole...HEAD` returned `0 6` before this follow-up commit: every fetched deployment-branch commit is included.

## What the supplied live result establishes

`cancellation_gateway_installed=false` means the exact archived delegate `mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)` was absent when the user's query ran. That name and signature are correct for `202610100004_movement_cancellation.sql`. It is not the active public cancellation gateway: that migration saves the previous portal gateway there and installs cancellation logic into `public.mcpa_movement_action(text,jsonb,uuid)`.

The old preflight field was too easy to interpret as a feature-health or Office-dependency check. It proves neither. Office migration `202610120002` deliberately accepts either the portal hash `582ea68af753d0fdd81461c537dbf9ab` or cancellation hash `9aa50e5af660aea383b993a3a578f86a`, saving that gateway as `movement_before_office_returns`. Cancellation is **not an Office prerequisite**.

The supplied public hash `c26d3585fe9e140e072b12a273f7bb19` matches the reviewed Office wrapper. The private hash `d1154cc85fb39b5721fcbe977a54fb76` matches the reviewed optional-purpose lifecycle. Neither proves the saved delegate, helpers, permissions, pinned configuration, or notification infrastructure is complete. An active site named Office alone does not prove it is the pinned site.

The likely arrangement is Office → portal → authorized lifecycle, without cancellation. This is a supported architecture, demonstrated locally. It remains an inference until the delegate fingerprint is supplied. A wrong overload, alternate implementation, or partial install cannot be ruled out from the original result. The diagnostics now show all matching names/signatures and source references, plus absent expected signatures; unreviewed implementations require inspection rather than being labeled broken automatically. SQL Editor installations may not appear in a migration ledger.

The frontend is compatible with the portal-only arrangement: `js/permissions.js` uses server-supplied `allowedActions` for live cancellation/refusal controls. Absent actions remain hidden. That arrangement does not provide cancellation/refusal as a feature; it is not evidence that those features are installed. The new fixture tests exercise both arrangements, including an actual authorized withdrawal when cancellation is installed.

## Office and optional Purpose audit

No applied migration was changed. The Office guard normalizes only the exact optional-purpose validation statement **in memory** for comparison with the original reviewed lifecycle hash. It does not replace the lifecycle function. Both optional-before-Office and Office-before-optional orders pass isolated integration tests; unrelated lifecycle drift still fails closed.

Complete Office behavior requires the public wrapper, public destination reader, private `office_return_site`, singleton `return_office` configuration, saved portal/cancellation gateway, authorization and stable-identity helpers, and existing lifecycle/data permissions. `mcpa_return_destination()` by itself is insufficient.

The audited implementation and local regressions confirm:

- Engineer/Architect destination RPC reads the pinned active, uniquely named Office. UI renders fixed Office text without a project dropdown; missing/inactive configuration blocks submission and supports draft-preserving retry.
- The backend binds stable employee identity, validates roles and custody, rejects forged destination IDs/names, and delegates other actions through the existing gateway. Project requests still enforce active assigned projects by stable profile ID.
- Inspected good and damaged returns move to Office and release personal custody; damaged items enter repair. Missing items retain their holder/location and missing-item accountability.
- Return operations, audit/history and future notifications remain transactional. Existing saved returns/retries are preserved; QR transfers and receiving retain their existing authorization.
- Optional/empty Purpose is accepted, overlength validation remains, and stable recipient identity is unchanged.

These are local conclusions, not proof of production installation. There is currently no evidence requiring Office or optional-purpose SQL to be rerun.

## Exact manual read-only checks

In the intended Supabase project's SQL Editor, using the database owner, run these files as written. They contain SELECT queries only and do not invoke application RPCs or expose account records/function bodies:

1. [office-return-preflight.sql](supabase/office-return-preflight.sql).
2. [release-compatibility-diagnostics.sql](supabase/release-compatibility-diagnostics.sql).
3. Only if step 2 confirms the private `return_office` table and reviewed `singleton boolean` / `site_id uuid` schema, run [office-configuration-verification.sql](supabase/office-configuration-verification.sql).
4. [merge-integration-verification.sql](supabase/merge-integration-verification.sql) to verify optional Purpose, identity, Office wrapper and future notification trigger/copy.

Return the four result sets for final review. They distinguish:

| Evidence | Meaning / next action |
|---|---|
| `office_over_portal_without_cancellation` | Reviewed Office → portal source chain; no cancellation dependency to install for returns. |
| `office_over_cancellation_over_portal` | Reviewed Office → cancellation → portal source chain; verify cancellation helpers/snapshot/audit tables and triggers too. |
| Exact cancellation signature absent, same name present | Different overload; inspect `candidates.arguments` and source-reference metadata. Do not substitute signatures blindly. |
| Exact signature/name absent, no reachable cancellation implementation, cancellation helpers/tables/snapshot absent | Consistent with cancellation migration not installed; this remains a supported Office architecture. |
| Exact delegate absent but cancellation logic/source references elsewhere | Alternative or partial implementation; metadata identifies candidates for further source review. |
| `office_with_missing_or_unreviewed_delegate` | Public wrapper alone is insufficient; inspect missing/unreviewed saved delegate before deployment. |
| Missing identity/authorized lifecycle/helper signatures | Actual prerequisite absent or renamed; inspect alternatives before choosing a repair. |

For the reviewed Office chain, all present required Office/identity/lifecycle functions must have `reviewed_source=true`, expected argument/result types, trusted owners, `security definer` and empty search paths. The immutable cancellation trigger helper is intentionally not security definer. Public movement, destination and snapshot RPCs permit authenticated execution and deny anonymous execution. Private helpers/delegates deny authenticated and anonymous execution. The Office helper and saved Office delegate also deny service-role execution, as specified by its migration. The diagnostic outputs grants rather than silently treating missing functions as safe.

For `return_office`, verify RLS, no anonymous/authenticated/service-role table access, PK(singleton), CHECK(singleton), and site FK with restricted deletion. Configuration must return exactly one true singleton; `is_active`, `exactly_one_configuration`, `unique_destination_name`, and `matches_previously_verified_office` must be true. The expected site is `ba8bef8c-139a-43b9-ae2b-5857293b7f33`, Office, `2826 Cagayan Valley Rd., Plaridel, Bulacan`. A mismatch requires review, not automatic rebinding.

If cancellation is in the active chain, verify its reviewed permission helper, enriched public snapshot, saved snapshot/tool-visibility delegates, both RLS-protected audit tables, denied browser table access, and all four enabled immutable update/delete/truncate triggers. A saved gateway alone does not prove this feature complete. Verify notification table/trigger and the turnover checks too. Publication membership is reported for Realtime review; local browser tests model own-recipient Realtime and exercise the actual polling fallback, not the live Supabase service.

## SQL installation and recovery boundary

**No production write is currently justified; no new repair migration was invented.** Do not reapply `202610120003_optional_request_purpose.sql`, `202610120002_office_returns.sql`, or the old cancellation migration based solely on the original false flag.

The old cancellation migration is order-sensitive. With cancellation absent, applying it after Office moves the Office wrapper into `movement_before_cancellation` and makes cancellation the public wrapper, producing a different ordering from the reviewed Office migration. With cancellation already installed before Office, rerunning the old cancellation migration would replace the public Office wrapper and bypass the Office wrapper in the normal entry chain. Blind reapplication is unsafe. Neither operation was performed on production.

If diagnostics establish a real missing component, the next action is a separate, reviewed, transactionally guarded repair for that exact state. It must preserve the Office outer wrapper and optional lifecycle, require reviewed source/permission/configuration evidence, preserve audit data and existing movements, and be tested locally in that exact order before authorization. Capture the current definitions/grants and an appropriate database backup before any approved repair; re-run these read-only checks afterward. On a guard failure, roll back and retain the error. Do not drop audit tables, rewrite historical movements, or reset/rebind locations as recovery. Exact repair SQL depends on the currently unknown live state.

## Local changes and validation

- `supabase/office-return-preflight.sql`: retain the legacy boolean for compatibility, explain its meaning, add source-based gateway architecture and same-name/different-signature detection.
- `supabase/release-compatibility-diagnostics.sql`: expected/alternate function catalog, source hashes/references, execution permissions, relation schema/RLS/access, audit/notification triggers and notification publication membership.
- `supabase/office-configuration-verification.sql`: inspect the actual pinned site without calling an application RPC.
- `tests/release-compatibility.test.cjs`: four PostgreSQL regressions covering both gateway chains, read-only execution, wrong signatures, missing delegates, drifted helpers/grants, inactive configuration, empty-purpose requests and real local movements.
- `tests/package.json`: include these regressions in the existing Office suite.
- `MERGE-INTEGRATION-REPORT.md` and `OFFICE-RETURN-IMPLEMENTATION.md`: mark earlier live-status/deployment instructions as historical and point here.
- `SUPABASE-RELEASE-READINESS.md`: current evidence, remaining boundary and release instructions.

Tests use disposable local PGlite databases and a local browser transport with external HTTPS blocked; no test movements were created in production. Commands ran from the repository root:

| Exact command | Result |
|---|---|
| `npm.cmd --prefix tests run test:office-returns` | 30/30 plus Office browser passed |
| `npm.cmd --prefix tests run test:request-projects` | 9/9 plus assigned-project browser passed |
| `npm.cmd --prefix tests run test:turnover` | 14/14 plus independent-session browser passed; actual 30-second polling fallback and modeled own-notification Realtime |
| `npm.cmd --prefix tests run test:features` | 30/30 plus feature browser passed, including cancellation/refusal and unchanged custody |
| `npm.cmd --prefix tests run test` | 59/59, all 8 movement database scenarios, and main Auth/role/movement/browser regression passed |
| `node --test --test-concurrency=1 tests/engineer-ux.database.test.cjs` | 1/1 optional-purpose integration passed |
| `node --test --test-concurrency=1 tests/release-compatibility.test.cjs` | 4/4; rerun after final diagnostic edits passed (also included in Office count) |
| `node --check tests/release-compatibility.test.cjs` | Passed |
| `git diff --check` | Passed |

The five npm suites above were executed sequentially by a PowerShell loop that stopped on any nonzero exit. Migration filenames were checked: all 15 versions remain unique. An exploratory inline Node command initially failed PowerShell parsing; rerunning via a literal here-string succeeded. No regression test failed. The separate `test:auth` script was not rerun because its database/account/identity tests and browser runner are already included in the main suite. Production catalog state, live Realtime/PostgREST behavior and the published site's smoke test remain untested; previous local test results were not substituted for this run.

These eight changed files are recorded in the local follow-up commit titled `Clarify Supabase gateway diagnostics and release readiness`. No application code or applied migration changed.

## Deployment and published-site verification

The sole remaining release gate is the live read-only verification above, including resolution of any differences it exposes. The false cancellation delegate flag by itself is not a blocker. No push is authorized or performed. After the live gate is cleared and publication is authorized, fetch again; the currently observed ancestry cannot guarantee future remote state.

The existing safe release procedure remains `git fetch origin`, switch to `Updated-MCPARole`, `git merge --ff-only origin/Updated-MCPARole`, then `git merge --ff-only wip/engineer-improvements`, followed by a normal push only when authorized. Stop on either fast-forward failure and integrate/retest new remote work; never force-push. Keep Pages at `Updated-MCPARole`, `/(root)`.

After approved publication, use existing authorized accounts for this non-mutating smoke check:

- Sign in as Engineer and Architect; verify scoped project options, optional Purpose label, Recent Activity, My Requests and existing Pending Turnover records. Do not submit a request.
- Open Return; verify fixed Office text and no destination dropdown. Inspect eligible equipment without submitting.
- Open existing transfer/return details and compare custody/history with known records. Do not receive, cancel, refuse, release, return or resolve anything.
- Check mobile/desktop themes and navigation; reload and inspect console/network errors. View notifications without marking them read if strictly preserving application data.
- Verify another authorized role cannot see another person's scoped records. Exercise actual movement writes only in staging or a separately approved, controlled production test.
