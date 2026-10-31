# Workstream B — Equipment custody and lifecycle

Prepared 2026-10-25, Asia/Manila. Implementation is isolated and uncommitted on
`feature/custody-lifecycle`. The SQL migration remains **unapplied**.

## Outcome

Implemented mountable return, transfer, QR, evidence and retirement modules with
additive PostgreSQL enforcement. Current custody remains authoritative in
`equipment`; the existing movement ledger, reservation table, transfer gateway
and return/repair engine are reused. No existing function was overwritten and no
existing RLS policy was weakened. No historical return was retroactively changed.

Final local verification: **25/25 unit/database tests passed; 16/16 browser
checks passed; zero skipped tests; zero uncaught browser exceptions**. These are
isolated module results, not a deployed MCPA integration or production approval.

## Branch and ownership

- Starting branch was `Updated-MCPARole` at
  `251940a832a4c69e5402420e71a396feeaf025c5`, matching the locally recorded
  `origin/Updated-MCPARole`. The new feature branch starts at that exact commit.
- No Workstream A branch or baseline reference was present locally. The user
  chose to provide A's baseline commit; it has not yet arrived. **Agreement with
  Workstream A's baseline is therefore not verified.** No remote fetch or merge
  was used to guess the agreement.
- `supabase/migrations/202610250002_custody_lifecycle.sql` was absent before
  creation. All implementation changes are new files within the reserved paths.
- Shared tracked files remain unchanged, including both entry-point HTML files,
  test package/auth browser harness, `js/data.js`, movement/permission files,
  Masterlists, existing modules and existing migrations. Pre-existing untracked
  `docs/` material was left untouched.
- No production SQL, live Supabase record operation, deployment, commit, push,
  merge, history reset, stash deletion or Workstream A file edit was performed.

See `test-results/ownership.json` for the final local ownership check.

## Delivered behavior

| Area | Implemented result |
|---|---|
| Engineer/Architect returns | Select or scan exact permanent Asset IDs, one or many, choose the configured Office, add notes/photos, submit for inspection, view per-asset status |
| Admin inspection | Open a batch, review each Asset ID and evidence, select individual outcomes and record receipt/notes, accept a subset, revisit unresolved items |
| Good | Existing return engine clears custody and moves the verified unit to available Office stock |
| Damaged | Existing engine creates the repair report; Admin receipt clears personal custody; normal Admin start/complete repair actions remain available |
| Missing/Disputed | Original holder/site remain unchanged; reservation and unresolved inspection retain responsibility and block movement/requestability |
| Transfers | Exact individual assets are reserved on sender submission; existing named-recipient acceptance moves custody only after physical receipt/testing |
| QR | Reusable camera module, rear-camera preference, multi-scan batching, duplicate/pending-scan suppression, manual ID/name selection, authorized server resolution |
| Evidence | Private separate bucket; role/phase/asset ownership; staged uploads; MIME/size metadata checks; atomic linking; uploader and timestamps; short signed viewing links |
| Retirement | Admin proposal, different active Admin approval/rejection, reason/date/identity/history, optional evidence, terminal stock exclusion, field history and issue reporting |
| Audit/safety | Payload/actor-bound UUID replay, shared movement lock, equipment row locks, immutable events, preserved movement joins and history, additive guard triggers |

For a 10-unit return with 8 Good, 1 Damaged and 1 Missing, only the 8 verified
Good units become requestable. The Damaged unit is in repair, and the Missing
unit remains held and reserved. The tests cover the same per-unit and partial
batch semantics with disposable synthetic equipment.

A scoped trigger restores Good descriptive condition only when the existing
repair engine completes a repair originating from a v2 accepted return. This
prevents a repaired, AVAILABLE unit remaining excluded by the verified inventory
condition check. The regression test creates a new request for that repaired unit.

New legacy automatic returns are blocked by an additive insertion guard after
migration. Existing historical operation retries remain valid. Another additive
asset-join guard requires quantity-one individual IDs for new transfers through
both v2 and legacy gateways; request allocation must produce physical IDs before
release. Existing historical records are not rewritten.

## Files and entry points

| Reserved area | Main files |
|---|---|
| `js/upgrades/custody-lifecycle/` | `api.mjs`, `composer.mjs`, `ui.mjs`, `module.css` |
| `js/upgrades/equipment-qr/` | `scanner.mjs` |
| `js/upgrades/movement-evidence/` | `evidence.mjs` |
| `js/upgrades/equipment-retirement/` | `retirement.mjs` |
| `1-admin/modules/return-inspection-v2/` | `return-inspection.mjs` |
| `1-admin/modules/asset-retirement-v2/` | `asset-retirement.mjs` |
| `2-engr/modules/return-inspection-v2/` | `return-submission.mjs` |
| `2-engr/modules/qr-movements-v2/` | `qr-movements.mjs` — sender composer and recipient inbox |
| `2-engr/modules/retired-equipment-v2/` | `retired-equipment.mjs` |
| `supabase/migrations/` | Reserved unapplied `202610250002_custody_lifecycle.sql` only |
| Reserved test directories | Disposable PostgreSQL fixtures, workflow/RLS/module tests, browser harness and standalone runner |
| `documentation/workstream-b/` | Audit, exact integration contract, migration requirements, read-only preflight, review, report and evidence |

New tables are `mcpa_b_return_items`, `mcpa_b_retirements`, `mcpa_b_operations`,
`mcpa_b_events` and `mcpa_b_evidence`. They describe decisions/history/evidence;
none replaces the current holder/site/status in `equipment`. All have RLS and
revoked direct browser writes. New public RPCs are `mcpa_b_snapshot`,
`mcpa_b_lookup`, `mcpa_b_action`, `mcpa_b_evidence_action` and the narrow Storage
policy helper `mcpa_b_storage_allowed`. Private helpers are not browser callable.

## Exact validation

Executed from the repository root:

```powershell
node tests/custody-lifecycle-v2/run-tests.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
node tests/custody-lifecycle-v2/browser.cjs
git diff --check
```

The Chrome flag was required by the local restricted test environment. The
browser is hidden/headless, allows only the local fixture, and blocks production
and external resources. It mounts the new modules without altering or loading
the deployed application entry points. PostgreSQL runs in disposable in-memory
PGlite fixtures. Auth roles and Storage RLS execute locally; Storage bytes and
signed URL transport are modeled by the harness.

| Test file | Passed | Scope |
|---|---:|---|
| `custody-lifecycle-v2/returns.test.cjs` | 6 | Migration/history preservation, submissions, stock locks/notifications, Good/Damaged/Missing/Disputed, partial receipt, atomic rollback, legacy bypass denial and stale competing operations |
| `custody-lifecycle-v2/security.test.cjs` | 4 | Engine drift preflight, grants, immutable history, cancellation/history compatibility, shared lock contract |
| `equipment-retirement-v2/retirement.test.cjs` | 2 | Two-Admin approval, authorization, history/relevance, retired restrictions and eligibility recheck |
| `movement-evidence-v2/evidence.test.cjs` | 7 | Private Storage/RLS including overbroad-policy fencing, formats/sizes, failed uploads, correct movement/asset/phase, retirement evidence, lost-response retry and rollback of receipt/repair on bad attachment |
| `qr-movement-v2/camera.test.cjs` | 2 | Positive injected decoding, late camera cleanup and unavailable-browser fallback |
| `qr-movement-v2/qr-transfer.test.cjs` | 4 | Server custody validation, exact-unit/legacy-transfer guards, recipient acceptance, invalid receivers, duplicate scans and manual fallback |

The 16 browser checks cover manual selection, duplicate/unknown ID handling,
mobile layout, photo-to-asset linking, pending custody, partial Admin receipt,
recipient acceptance, second-Admin retirement, camera-failure fallback, 44px
receipt targets, focused visible error recovery, readable history labels and
uncaught exceptions. Nine light/dark desktop/mobile captures are saved.

Machine-readable results and raw evidence:

- `test-results/unit-database.json` and `test-results/unit-database.tap`
- `test-results/browser.json` and `test-results/screenshots/`
- `test-results/ownership.json`

Earlier local failures found ambiguous PL/pgSQL aliases and two incorrect test
expectations (the existing status is `canceled`; FK dependencies also protect
TRUNCATE). They were corrected. The saved final runs pass without changing
existing custody functions, fixtures or RLS to accommodate failures.

An independent impeccable reviewer returned `fix` for error visibility, receipt
tap targets and internal history labels. All three were corrected and scored
resolved, with final **`disposition: ship` limited to those mounted UI fixes**.
`UI-REVIEW.md` records the evidence and the ordinary-extension documentation
check. Existing shared design files were preserved.

## Required integration and remaining limits

1. **Baseline agreement is pending.** Compare Workstream A's promised commit
   before integrating. The migration fails closed on unreviewed private-engine
   drift; review both workstreams rather than changing the fingerprint blindly.
2. **Shared route/loader/auth integration is intentionally unapplied.**
   `INTEGRATION.md` identifies imports, mounts, `#screen-return`, classic-module
   adapters, stylesheet entry points, navigation/permission changes, logout/route
   cleanup, refresh callbacks, notification deep links and the Workstream A
   physical-asset/locking contract. The current application does not yet expose
   these modules through its normal navigation.
3. **Migration rollout is pending.** Required existing migrations, configured
   Office, monitoring and Storage must be reviewed. Coordinate route cutover
   because the migration intentionally rejects new legacy automatic returns and
   aggregate transfers/releases. The migration is transactional and applied once;
   collisions fail instead of silently adopting existing objects.
4. **Native multi-session and real Supabase tests remain.** Local conflicting
   calls verify stale-state and replay protection on a serialized PGlite
   connection. They do not prove independent-session contention, deployed RLS,
   actual object uploads, signed-link expiry, PostgREST or Realtime behavior.
   `MIGRATION-REQUIREMENTS.md` gives the required disposable-instance race tests.
5. **QR device support varies.** Camera permission and secure hosting are
   required. Native BarcodeDetector is feature-detected; inject a reviewed local
   decoder where needed. Manual lookup remains available. Actual field-camera
   and iOS testing were not performed. Existing raw permanent IDs and the
   `mcpa:asset:` format are supported; arbitrary URL QRs are not fetched.
6. **Physical units only.** Aggregate rows require Workstream A allocation before
   new transfer/release; v2 returns also require individual quantity-one IDs.
   Office is the permitted return destination under the existing configuration.
   New transfer acceptance is all named units together; missing/disputed incoming
   assets remain pending for the incumbent refusal/cancellation workflow.
7. **Retirement approval model.** Two distinct active Admins are required. No
   exception retires an actively held or unresolved asset. Both business outcomes
   use the legacy terminal `DISPOSED` status; B's retirement record distinguishes
   Sold. Shared reports/status labels need the documented projection.
8. **Evidence operations.** Browser signatures plus private bucket MIME/size
   limits and service metadata checks are implemented. Server content decoding,
   EXIF stripping and malware processing are not installed. Unattached failed or
   abandoned uploads may require uploader cleanup; no retention scheduler was
   added. Linked evidence is immutable to browser users; viewing links last 60s.
9. **Operational scale and styling.** The module snapshot is unpaginated and
   needs scoped pagination at larger scale. Idempotency tokens are in memory;
   after reload, review the server snapshot before starting a replacement action.
   Fixture external fonts are blocked; real host font rendering remains an
   integration check. No new raster assets or shared theme changes were needed.

See `ARCHITECTURE.md`, `INTEGRATION.md`, `MIGRATION-REQUIREMENTS.md`, and
`DEPLOYMENT-PREFLIGHT.sql` for the complete audit and reviewable handoff.
