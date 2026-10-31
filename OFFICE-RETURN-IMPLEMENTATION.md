# Office-only Engineer/Architect returns

**Latest status:** [SUPABASE-RELEASE-READINESS.md](SUPABASE-RELEASE-READINESS.md) supersedes all deployment instructions and live-status statements below. The user now reports the reviewed Office wrapper and optional-purpose lifecycle installed. Complete the read-only delegate/configuration checks; do not rerun either migration.

**Merge integration update (October 12, 2026):** the report below records the incoming branch's earlier implementation and preflight. For current deployment instructions use [MERGE-INTEGRATION-REPORT.md](MERGE-INTEGRATION-REPORT.md). The user has since confirmed that optional purpose is installed live, while Office Returns deployment is unconfirmed. The Office migration's lifecycle guard now accepts the exact reviewed optional-purpose validation without changing the private function; it continues to reject unrelated drift. Do not reapply optional purpose or recreate Office. Run the updated read-only preflight before deciding whether Office SQL is needed.

October 12, 2026. Implemented and tested locally. **Office backend deployment is pending.** The latest user-provided live preflight verifies an active Office location and confirms the Office return RPC is not installed. This agent created no live location, replaced no live RPC, changed no existing custody/transfer/request/history record, and performed no commit, push or publication. Frontend publication was not independently checked.

## Confirmed cause and live configuration

`js/movement-ui.js` used `siteField()` for Return destination. That helper combines location names from the authorized movement snapshot with equipment location names and renders an ordinary project selector. The underlying return engine resolves any supplied destination by `public.sites.name`; it had no company Office designation or Office-only check.

The latest live preflight verifies **Office**, UUID **`ba8bef8c-139a-43b9-ae2b-5857293b7f33`**, at **2826 Cagayan Valley Rd., Plaridel, Bulacan**, with `is_active=true`. The deployed gateway source hash `582ea68af753d0fdd81461c537dbf9ab` and return implementation hash `5b94b3b5642f26981a80382a2b1b6be7` match the reviewed Engineer portal and return implementation. The cancellation gateway is not installed; this change supports that existing deployment without requiring cancellation or unrelated migrations.

The migration's `OFFICE_ID_FROM_PREFLIGHT` is now bound to that verified existing Office UUID. It validates that the same record remains active and refuses a conflicting designation; no location is created or inferred from a development project. Local tests explicitly replace the deployment UUID/address with disposable fixture values, so filling real configuration cannot make tests depend on production identities or metadata.

## Frontend changes

| File | Change |
| --- | --- |
| `js/movement-ui.js` | Replaces only the Return destination selector with a read-only Office field/building icon. Loads the canonical Office through the authenticated RPC, includes its real name when different from Office, and submits its name/ID from module state. Missing/inactive configuration blocks submission while retaining history and draft inspection fields. Retry and existing background refresh preserve draft selections/notes. |
| `js/movement-cloud.js` | Adds the narrow `returnDestination()` reader with an Office-specific configuration error. |
| `js/movement-store.js` | Explicit offline demo mirrors Office-only returns and clears physically returned damaged equipment's demo holder. Its synthetic `demo-return-office` is confined to browser demo data and never used for live operations. |
| `css/movement.css` | Small read-only field styles using existing Light/Night tokens and gold icon accents; no module redesign. |

Equipment selection, tool IDs, inspected conditions, condition notes, return notes and submission controls remain. There is no editable or hidden destination input in the Return form. Injecting a legacy destination input does not change the constructed return payload. Only eligible whole equipment records in the authenticated person's custody are offered; pending/reserved and unavailable items remain excluded.

Transfers retain the existing project/recipient choices, receiving QR, handover code, inspection and confirmation flows. Their handlers and QR libraries were not changed.

## Prepared backend changes

`supabase/migrations/202610120002_office_returns.sql` is a guarded, manually deployed extension:

- Creates one private singleton Office configuration referencing an **existing** `public.sites.id` with a restrictive foreign key. It creates no Office location itself, rewrites no historical records and cannot silently rebind a previously configured Office.
- Adds private `office_return_site()` to resolve the configured UUID and validate activity and unambiguous canonical name. It locks that site/configuration during the transaction. The name check supports the existing engine; the UUID is the authoritative designation.
- Adds authenticated Engineer/Architect reader `public.mcpa_return_destination()` returning only Office ID/name/label.
- Preserves the deployed public movement gateway in private `movement_before_office_returns()` and adds a public wrapper. All actions other than `createReturn` delegate to the unchanged gateway. Existing identity, roles, reservations, inspections, actor binding, transaction and operation-retry checks remain authoritative.
- A new return resolves Office on the server. Supplied non-Office names/IDs and malformed destinations are rejected. Omitted destination fields are filled with canonical Office metadata. Direct RPC/browser manipulation cannot choose a construction project.
- Saved historical operation retries return their original result through the original authorization/payload checks. They do not replay custody changes or rewrite old project destinations. New normalized retries remain duplicate-safe, including after an Office rename.
- Enables RLS on the new private configuration and grants no client table access. New private functions and the preserved gateway deny direct anonymous/authenticated/service-role execution. Only the public authenticated RPCs are callable; existing table policies are unchanged.
- Checks the reviewed gateway/return source hashes before installation, and the installed Office wrapper hash before rerunning. An unknown/custom lifecycle, absent Office UUID, inactive Office, conflicting configuration or ambiguous name aborts the transaction.

The original movement implementation, existing migrations, authentication, Admin permissions, account-management function and SMTP settings were not edited.

## Existing return lifecycle and custody

The inspected deployed implementation has **no separate pending return or Admin/Tool Handler receiving-confirmation operation**. The Engineer/Architect selects the equipment, records inspected conditions and confirms the return. The existing backend validates and finalizes it atomically. The UI now explicitly says to confirm after delivery to Office and inspection; this change introduces no automatic receipt or alternate lifecycle.

| Inspected result | Result after the authorized transaction |
| --- | --- |
| Good | Office location, no personal holder, available. |
| Damaged and physically returned | Office location, no personal holder, repair status and linked repair report; remains unavailable. This corrects the old engine's retained Engineer holder for a physically returned damaged item. |
| Missing/not physically returned | Missing status/report, last holder and last location retained for accountability. It is not falsely placed at Office or made available. |

Before validation succeeds, equipment custody and availability remain unchanged. A failure/transaction rollback reverses the complete return and any generated notification. Original source project/site/holder IDs stay in the new movement's source snapshot and its linked site history. Existing history is not rewritten. Admin can review the saved Office destination, inspections and linked repair/missing follow-up through the existing Return/history modules. No new receiving stage is claimed or bypassed.

## Verified configuration and next manual step

The Office location prerequisite is now satisfied by the latest preflight. The earlier `supabase/office-location-configuration.sql` has the supplied address and is **not required again**. No new Office creation or project/employee assignment is requested.

**Next manual step:** review and run **`supabase/migrations/202610120002_office_returns.sql`** in the Supabase SQL Editor. It already contains the verified UUID. It creates only the private destination configuration and RPC definitions, preserving existing equipment, custody and movement/history rows. It needs no reset or unrelated migration.

Return its `office_return_verification` JSON. Expected values: `office_configured`, `office_destination_rpc` and `office_gateway` are true; `anonymous_movement_execute` and `authenticated_private_execute` are false. If a guard/SQL error occurs, stop and retain the error rather than resetting data. The read-only `supabase/office-return-preflight.sql` can then confirm `office_return_installed=true` and the new gateway hash `c26d3585fe9e140e072b12a273f7bb19`.

The existing branch is `Updated-MCPARole`; GitHub Pages `/(root)` settings remain unchanged. The frontend changes are already in the current checkout. Live Office-only enforcement remains pending the guarded RPC deployment; frontend publication and a deployed development-account smoke test must be verified after database installation.

## Tests performed

All database checks used isolated PGlite PostgreSQL fixtures. Browser checks used local Chrome with external HTTPS blocked and modeled Auth/camera transport. No production equipment or successful Engineer A → Engineer B transfer was modified. Optical scanning on physical devices and deployed Supabase execution were not tested.

| Required check | Observed local result |
| --- | --- |
| Engineer/Architect login and Return access | Passed through existing browser session/role flows. |
| Own-custody equipment only | Passed; other Engineer, Architect and unheld stock excluded. Wrong-custody RPC rejected. |
| Fixed Office destination, no construction selector | Passed; read-only Office plus actual fixture name Main Office; no destination form input/select. |
| Destination tampering | Project names, forged IDs, invalid destination types and injected legacy form input tested. Invalid direct RPC values rejected; injected form input did not change the Office return. |
| Inspection fields and valid return | Good, damaged with notes and missing with notes tested; incomplete/invalid conditions and missing damage notes rejected. Engineer and Architect valid submissions passed. |
| Custody stage/accountability | No changes on form open/inspection or failed returns; successful physical returns removed personal custody, damaged remained repair, missing retained last holder/site. Rollback restored records/notices. |
| History/receiving review | Admin opened the exact Office return with recorded inspection notes. Original source project IDs and origin/destination history links preserved. |
| Office unavailable/error state | Missing RPC and inactive Office blocked submission; retry restored it and retained selection, condition and draft notes. |
| Existing records | Migration snapshots and historical operation retries preserved profiles, sites, equipment, movements, operations and history. Location configuration created only its intended new Office fixture and no assignment. |
| Transfer/QR separation | Existing backend receiving QR, project transfer and named-recipient tested receipt passed. Existing portal browser QR generation/autofill/errors/camera lifecycle, scanning without custody changes, dispatch and authorized receipt passed. |
| Desktop/mobile and themes | 1440px and 393px Return form in Light/Night modes passed no-horizontal-overflow and 44px condition-control checks. Long equipment names wrapped; fixed Office field visually reviewed. Existing flow regressions also exercised 375–1440px. |
| Auth/role/security regression | Existing all-five-role login/session/direct-route guards, approval/release/receipt/return, outage recovery, drafts and subscription cleanup passed. Private Office functions/configuration denied client access in SQL. |

Completed verification: **24 Node tests** (7 Office database/configuration checks and 17 demo movement checks) and the dedicated Office return browser workflow were rerun after binding the verified Office UUID and isolating tests from the supplied address. Existing `--portal` and `--flows-only` browser checks passed during the implementation; their application code has not changed since. Syntax and whitespace checks passed.

Reproduce with `npm --prefix tests run test:office-returns`. This restricted Windows host needed the existing opt-in `MCPA_CHROME_NO_SANDBOX=1` setting. Browser transport is modeled; real SQL/RLS/transaction behavior runs in the fixture.

Test infrastructure: new `tests/office-return.database.test.cjs`, `office-return.browser-checks.cjs`, `office-return-fixture.cjs`; updated `tests/auth-test-db.cjs`, `auth.browser.cjs`, `movement-store.test.cjs`, `notification-ui-checks.cjs` and `package.json`. Existing Return selector assertions and demo custody expectations were updated for the intended behavior.

Visual evidence: [`documentation/office-returns/screenshots/`](documentation/office-returns/screenshots/). Main Office, employee names, equipment IDs and return records in those screenshots are local fixtures. They are not a claim that an Office already exists in production. The prior request-turnover and user-manual artifacts were left unchanged.
