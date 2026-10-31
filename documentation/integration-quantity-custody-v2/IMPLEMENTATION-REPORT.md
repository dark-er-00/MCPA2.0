# MCPA Workstreams A + B integration implementation

Date: 25 October 2026, Asia/Manila.

Follow-up: see [the fix report](FOUR-ISSUE-FIX-REPORT.md) for the independent
FAIL findings, the final two race-condition repairs, current local regression
results and preserved Git state. Independent re-review is pending. The original
validation history below is retained separately from those follow-up runs.

Ready for a separate integration review. Production readiness is not claimed.
Implementation and validation were local. No existing database, production
Supabase endpoint, deployment, branch switch, commit, push, merge completion,
reset, rebase or staging operation was performed.

## Git preservation

- Branch: `integration/quantity-custody-v2`.
- HEAD: `7e1af39e9d3be4d358dc966859bfa065b516b57f`.
- MERGE_HEAD: `efc6b07054d9701c07165c21e0d21389dcdb6ce2`.
- The original 29 staged B additions retain their original index blobs. Changes
  to those files are unstaged working-tree changes; the pending merge remains.
- No unmerged entries. `Updated-MCPARole` remains at
  `251940a832a4c69e5402420e71a396feeaf025c5`; the original A feature branch and
  recorded origin B feature reference retain their original commits.
- Both original workstream SQL migration files are unchanged.
- No remote fetch was performed; remote-server state was not independently read.

## Connected application workflows

Both entry pages load the existing A helper/mount scripts and the new adapter.
`js/integration.js` mounts classic A components and imports B ES modules relative
to its own script URL, including under a `/MCPA/` project subpath.

| Route | Authorized users | Connected behavior |
| --- | --- | --- |
| `quantity-request` | Engineer/Architect | Quantity demand, assigned project, history and allocated Asset IDs |
| `quantity-request` | Admin | Exact physical allocation/rejection and linked legacy release/history |
| `outward-materials` | Engineer/Architect | Outward consumables requests and own history |
| `outward-materials` | Admin | Approval, partial/full issuance, stock accountability and analytics/CSV |
| `asset-transfer` | Engineer/Architect | Physical Asset ID lookup, camera/manual batching, evidence and transfer |
| `transfer-inbox` | Engineer/Architect | Named-recipient physical acceptance |
| `return` | Engineer/Architect | B submission; custody stays until Admin inspection |
| `return` | Admin | B per-unit inspection and historical return access |
| `asset-retirement-v2` | Admin | Retirement proposal, different-Admin decision and issue history |
| `retired-equipment-v2` | Engineer/Architect | Authorized Sold/Disposed history and issue reporting |

Existing request/transfer screens retain release, cancellation, refusal and
history. Live automatic return submission is removed and explicitly blocked in
the legacy form handler as well. Tool Handler historical monitoring and
Secretary procurement remain separate from the new role-gated workflows.
Live-only menus are omitted from demo navigation.

Mounts are destroyed on navigation/authentication changes. Stale asynchronous
mounts cannot attach to a later session. Shared movement/material refreshes,
focus/online refresh and visible 30-second polling preserve unsaved forms rather
than refreshing over them. The adapter owns and cleans up listeners/timers/APIs.

The existing Import Tools dialog now uses A's expansion parser, worker,
controller, template, v2 receipt validation and provenance CSV. Individual
quantity N creates N separate physical records. Bulk remains grouped. Earlier
v1 pending imports retain their original recovery flow. Corrupt recovery data
blocks a replacement import and is preserved for review.

## Corrective migration

Created `supabase/migrations/202610250003_quantity_custody_integration.sql`.
Apply only after the two existing workstream migrations and their prerequisites.
It is transactional, one-time, and changes enforcement/projections, not existing
inventory, custody, evidence/history data or reservations.

The correction implements:

1. Immutable Asset ID, UUID, tracking type and quantity after custody,
   reservation or movement linkage. Existing aggregate identities are preserved.
2. New request/transfer/return relations require individual quantity-one assets.
   Unsupported aggregate operations fail with an actionable database error.
3. Restrictive browser evidence DELETE denial. A Storage trigger locks the
   evidence ticket and prevents deletion of completed evidence, path identity
   mutation, and completed-content metadata mutation. Staged service metadata
   and ordinary service timestamps remain supported. Browser UPDATE remains
   denied by B's existing restrictive policy.
4. Archival protection for SKUs included in outstanding outward requests.
   This conservatively blocks affected SKUs while their request is pending,
   approved or partial, including a completed line in a still-partial request.
5. Notifications to active Admins for new quantity/material demand and to the
   requester on review/issuance changes. Operation replay does not duplicate
   those transactional notifications.
6. A further active-account check for both distinct retirement Admins, in
   addition to B's role, eligibility, reservation and distinct-person checks.
7. AVAILABLE-only requestability matching the incumbent approval engine;
   legacy IN_OFFICE rows are not advertised as allocatable stock.
8. An explicit inspection reservation category without deleting reservations.
9. Sender/Admin inspection-note visibility through the broader legacy reader,
   including repair notes generated by inspected damaged returns.
10. Approved Sold/Disposed projections in shared inventory, current reports and
    future monitoring snapshots. Historical snapshots remain unchanged.

## Operation handling and security

The custody client coalesces concurrent identical clicks. Successful actions
discard their UUID so a later deliberate identical action gets a new one.
Uncertain actions retain their exact payload/UUID, including profile-scoped
session-storage recovery after remount. Changed values in an unresolved scope
are blocked. An empty response and a later rejection cannot erase an earlier
uncertain operation. The host exposes recovery and destroys the API on identity
change; SQL still validates actor, role, custody, reservation and payload.

Existing A/B advisory-lock and reservation authority is preserved. No new stock
balance or competing custody table was introduced. Two active distinct Admins
remain necessary for retirement. No active-custody or reservation exception was
added. No browser service credential or widened Admin route permission was added.

Evidence retention is deliberately conservative: completed uploads cannot be
deleted even before attachment. Browser deletion of staged evidence is also
disabled. A scheduled privileged orphan-cleanup/retention workflow is not
implemented; it must be separately reviewed before deleting any evidence.

## Original implementation validation

Counts below record the runs before the independent review and subsequent
fixes. Suites overlap and must not be summed as unique tests. Current results
are in [the follow-up report](FOUR-ISSUE-FIX-REPORT.md).

| Validation | Final result | Evidence |
| --- | --- | --- |
| Workstream A unit/database/import suites | 62 passed | Commands below; console run |
| Workstream B unit/database/security/QR/evidence suites | 25 passed | `../workstream-b/test-results/unit-database.json` and `.tap` |
| Selected legacy regressions | 114 passed | `legacy-tests.log` |
| Combined database/client tests | 7 passed | `combined-tests.log` |
| Default npm test command | 69 tests + 8 movement scenarios + combined browser passed | `default-tests.log` |
| Independent PostgreSQL backends | 10 scenarios passed; cluster stopped | `native/results.json` |
| A isolated browser | Passed, 47 actual local RPC calls | `../workstream-a/screenshots/`; console run |
| B isolated browser | 16 checks passed | `../workstream-b/test-results/browser.json` |
| Both real application shells | Combined smoke passed; no uncaught exceptions | `browser-tests.log`, `screenshots/` |
| Syntax | 22 changed/new JavaScript files parsed | Final manifest and console check |
| Assets and Git | Both entrypoint local assets resolve; diff whitespace check passes; staged B blobs preserved | `implementation-manifest.json` |

The combined browser exercises the project-relative Engineer page and Admin
role, actual quantity submission/allocation/release/receipt, materials
submission/approval/issuance, B return/inspection, retirement, history, protected
navigation, mobile layout, and logout during a pending mount. It also imports
one Individual spreadsheet row with quantity three through the real dialog and
verifies three resulting records. A's/B's independent browser harnesses retain
their original limited fixture scope; the combined harness supplies host coverage.

Native PostgreSQL 17.11 ran on a fresh temporary cluster, random loopback port,
synthetic accounts and independent backend PIDs at Read Committed isolation.
It never accepted an existing database URL. Covered schedules include:

- Identical import retries; competing quantity allocations; mixed legacy/A
  approvals; identical issuance retries; scarce-stock issuance.
- Two return submissions for one held asset and two Admin inspections of one
  unresolved item: one winner, no duplicate finalization.
- A allocation versus B retirement approval: allocation wins the reservation;
  retirement fails after eligibility recheck. Metadata mutation is denied.
- B attachment versus independent privileged Storage DELETE: deletion waits,
  then fails; the attached object remains.
- Preserved baseline records, unique tags, valid references, nonnegative stock
  and no remaining lock waits.

The initial sandbox could not start PostgreSQL (restricted-token error 87).
The authorized run used a reviewed sandbox exception solely for that fresh
local cluster. All successful clusters stopped. PowerShell blocked `npm.ps1`;
`npm.cmd` ran the same test command without changing execution policy.

Earlier implementation/test iterations exposed a composite-to-JSON fixture
issue, numeric-string assertion, native-test syntax error, and a browser-mode
dispatch issue. Those were corrected before the passing final runs.

Two existing legacy repeat-install tests also exposed a CRLF-sensitive literal
comparison in the historical verified-inventory migration. The regression
fixture now uses canonical LF input, and an additional test explicitly verifies
that CRLF reapplication fails closed without inventory changes. Historical SQL
and expected fingerprints were not modified. Deploy old migrations through
reviewed migration history, not by rerunning legacy setup/patch scripts.

## Reproduction commands

From repository root, with installed local test dependencies:

```powershell
node --test --test-concurrency=1 tests/quantity-requests-v2/frontend.test.cjs tests/quantity-requests-v2/database.test.cjs tests/consumables-requests-v2/frontend.test.cjs tests/consumables-requests-v2/database.test.cjs tests/individual-import-expansion-v2/*.test.cjs
node tests/custody-lifecycle-v2/run-tests.cjs
node --test --test-concurrency=1 tests/integration-quantity-custody-v2/database.test.cjs tests/integration-quantity-custody-v2/client.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
npm.cmd --prefix tests test
npm.cmd --prefix tests run test:combined
node tests/quantity-requests-v2/frontend.browser.cjs
node tests/custody-lifecycle-v2/browser.cjs
node tests/individual-import-expansion-v2/postgres-concurrency.cjs '<complete-local-postgresql-bin-directory>' --combined
```

The Chrome flag is only for the restricted local fixture environment. Browser
harnesses block external HTTPS and model Supabase Auth/Storage transport; real
SQL/RLS executes locally. Runners create local validation artifacts.

## Files changed

Application and presentation:

- `index.html`, `2-engr/index.html`
- `js/app.js`, `js/auth.js`, `js/integration.js`
- `js/navigation.js`, `js/permissions.js`, `js/monitoring.js`
- `js/movement-ui.js`, `js/equipment-tracking.js`, `js/display.js`
- `js/equipment-import.js`
- `js/upgrades/custody-lifecycle/api.mjs`
- `js/upgrades/quantity-requests/view.js`
- `css/integration.css`
- `1-admin/modules/masterlist/masterlist.js`
- `1-admin/modules/reports/reports.js`
- `1-admin/modules/requests/requests.html`
- `2-engr/modules/requests/requests.html`
- `2-engr/modules/transfers/transfers.html`

Database and tests:

- `supabase/migrations/202610250003_quantity_custody_integration.sql`
- `tests/integration-quantity-custody-v2/fixture.cjs`
- `tests/integration-quantity-custody-v2/database.test.cjs`
- `tests/integration-quantity-custody-v2/client.test.cjs`
- `tests/integration-quantity-custody-v2/browser-checks.cjs`
- `tests/integration-quantity-custody-v2/native-cases.cjs`
- `tests/auth.browser.cjs`
- `tests/individual-import-expansion-v2/postgres-concurrency.cjs`
- `tests/verified-request-inventory.database.test.cjs`
- `tests/package.json`

Report, manifest, logs, native results and host screenshots are in this
directory. Original workstream browser runners generated their own screenshots
and B test-result artifacts under their documented directories. No artifacts
were staged. The manifest records implementation-file SHA-256 hashes.

## Remaining checks and deployment constraints

NOT VERIFIED against real Supabase: target schema/ACL/policy/engine/Office
preflight, actual Auth and PostgREST behavior, `.mjs` hosting MIME behavior,
Storage upload/metadata/signed-link expiry and service-internal updates,
Realtime service delivery, or production scale/performance.

NOT VERIFIED on field devices: camera hardware, camera permissions and iOS
BarcodeDetector support. Manual lookup works; a reviewed decoder may still be
needed on browsers without native detection.

Before any release, independently review the corrective migration and role
boundaries, then run authenticated disposable-Supabase staging checks and plan
the SQL/UI cutover together. Keep the return guard; do not restore automatic
finalization to roll back a UI release. The migration has not been applied to
any existing database.

Conservative supported limits remain: aggregate inventory is not converted or
deleted; unsupported physical movements are blocked. Pending unallocated
quantity demand is not a physical reservation and does not prevent retirement.
Snapshots/analytics remain unpaginated, and orphan evidence retention needs an
operational policy. These are explicit review/deployment considerations.

The implementation is ready for a separate integration review. It is not an
authorization to complete the pending merge, deploy, or apply production SQL.
