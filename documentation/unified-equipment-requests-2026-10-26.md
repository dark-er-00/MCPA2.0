# Unified Equipment Requests and Receipt Workflow

Implemented on `feature/post-release-improvements`, based on `152bf7b`, in the original MCPA development folder. The feature is prepared for a Pull Request to `Updated-MCPARole`; production deployment and merge remain outside this change.

## Findings and root cause

Approval is a reservation, not a custody transition. The existing named-asset gateway in `supabase/migrations/202610060002_recipient_identity.sql` separates `approveRequest`, `releaseRequest`, and `receiveTransfer`. Quantity allocation in `202610250001_quantity_material_requests.sql` creates and approves a linked named movement using the existing gateway. Its read RPC already projects the linked movement status and allocated Asset IDs.

Admin must release an approved request to create a recipient-addressed handover. The recipient then inspects and accepts through the existing custody workflow. Engineer Equipment Tracking filters by the confirmed holder; an approved or released request alone must not appear there.

The confusing experience came from the frontend: separate navigation and histories for both request types, a generic Approved label without the pending-release explanation, and no direct inspection action from request history. Local integration tests prove that the existing release and receipt RPCs can complete the custody chain; no backend change was necessary.

The unified projection now distinguishes a valid reservation awaiting release from a released request with an unavailable or conflicting handover. The latter displays a verification message and offers no guessed receipt target. Recorded missing/disputed inspection exceptions remain follow-up states. Historical cancellations retain approval/release progress when the existing allocation or audit data supports it.

REQ-00025 and REQ-00027 were not read or modified in production. Their individual live state has not been diagnosed; the findings above describe the traced implementation and locally reproduced workflow.

## Implemented behavior

- Admin has one Equipment Requests entry and a combined queue searchable by request ID, linked movement ID, equipment, Asset ID, person, and project. Filters cover request type and lifecycle stage.
- Exact-asset approval, reservation, cancellation, and release retain the existing MovementUI and authenticated RPCs.
- Quantity review retains the existing catalog, eligible-unit suggestions, manual exact Asset ID selection, atomic allocation validation, and rejection controls. Opening a review reloads records so a newly arriving request is reviewable.
- Engineer has one Equipment Requests entry. Request by Quantity is the default; Request Specific Asset is secondary. Existing exact-asset drafts from Equipment Tracking select the specific form and preserve the selected IDs.
- One My Requests history merges both types and deduplicates quantity requests against their linked named movements. Old quantity routes and notification references still resolve.
- Approved requests display **Approved — Awaiting Admin Release**. Released pending handovers display **Awaiting Your Inspection**, with a recipient-bound **Inspect & Accept Equipment** link. Admin sees Awaiting Recipient Inspection.
- Request details show Submitted → Approved → Released → Inspected / Received progress. History exposes the same progress.
- Receipt links expand and focus the exact handover in Accept Equipment. Condition starts unselected. Physical receipt/testing, notes, supported image evidence, damage validation, and existing follow-up rules remain enforced. Missing/disputed handovers remain pending for sender resolution in that workflow.
- Confirmed custody still changes only after an authorized receipt succeeds. No approval, release, navigation, or display operation accepts equipment automatically.
- Existing direct Engineer transfers, Admin-issued handovers, returns, evidence retention, retirement safeguards, and audit history remain in place.
- Desktop and mobile layouts retain the portal design. The catalog is bounded, and a My Requests jump control makes history accessible without traversing the full catalog.

## Exact file manifest

| File | Change |
| --- | --- |
| `1-admin/modules/quantity-allocation-v2/index.js` | Embedded allocation review and refreshed selection of an explicit request. |
| `2-engr/index.html` | Load the scoped unified-request stylesheet. |
| `2-engr/modules/qr-movements-v2/qr-movements.mjs` | Expand/focus a recipient handover addressed by a request link; explain an unavailable target. |
| `2-engr/modules/quantity-requests-v2/index.js` | Embedded creation mode with the duplicate standalone history hidden. |
| `index.html` | Load the scoped unified-request stylesheet. |
| `js/integration.js` | Mount the unified request route and retain the old quantity route; pass the receipt record target. |
| `js/movement-ui.js` | Allow mounting the existing request controls inside the unified surface and adding request progress to details. |
| `js/navigation.js` | One Equipment Requests navigation entry per role; preserve targeted integration details and receipt routes. |
| `js/upgrades/equipment-requests/model.mjs` | New read-only combined request/lifecycle projection. |
| `js/upgrades/equipment-requests/unified.mjs` | New combined queue, method selection, timeline, review, and receipt actions. |
| `js/upgrades/equipment-requests/unified.css` | New scoped desktop/mobile styles. |
| `tests/auth.browser.cjs` | Register the unified local browser test mode. |
| `tests/unified-requests.browser-checks.cjs` | New full application tests for both request types and lifecycle navigation. |
| `tests/unified-requests.test.cjs` | New projection, historical/exception handling, and transactional replay tests. |
| `documentation/unified-equipment-requests-2026-10-26.md` | This investigation, manifest, and verification report. |

## Verification

All final checks passed: **71 distinct local Node tests plus two application browser suites**. Database tests use isolated PGlite fixtures. Browser tests use a localhost Supabase transport backed by those fixtures, with external HTTPS blocked; they do not use production credentials or live records.

Commands run from the repository root:

```powershell
node --test --test-concurrency=1 tests/integration-quantity-custody-v2/database.test.cjs tests/integration-quantity-custody-v2/client.test.cjs tests/quantity-requests-v2/frontend.test.cjs
# 22 passed

node --test --test-concurrency=1 tests/quantity-requests-v2/database.test.cjs tests/custody-lifecycle-v2/security.test.cjs tests/movement-evidence-v2/evidence.test.cjs tests/integration-quantity-custody-v2/read-rpc.test.cjs
# 17 passed

node --test --test-concurrency=1 tests/unified-requests.test.cjs tests/integration-quantity-custody-v2/final-races.test.cjs tests/custody-lifecycle-v2/returns.test.cjs tests/movement-cancellation.test.cjs
# 17 passed before the extra replay test was added
node --test tests/unified-requests.test.cjs
# Final version: 4 passed, including the additional replay test

node --test tests/module-navigation.test.cjs tests/movement-navigation.test.cjs tests/movement-sync.test.cjs
# 14 passed

$env:MCPA_CHROME_NO_SANDBOX='1'
node tests/auth.browser.cjs --combined-integration
node tests/auth.browser.cjs --unified-requests
# Both passed; no uncaught browser errors

git diff --check
# Passed
```

Coverage includes exact-asset and quantity submission/reservation; eligible stock and insufficient/stale stock rejection; manual allocation; no custody before receipt; discoverable and targeted inspection; no default Good condition; notes/evidence safeguards; confirmed holder updates; direct transfers; returns and exception follow-up; immutable history; rejection/cancellation filters; late-arriving requests; role restrictions; and idempotent submission/allocation/release/receipt replay.

Admin and Engineer screenshots were inspected at 1440px desktop and 390px mobile widths. Visual QA artifacts were generated in temporary test directories, not in the user's existing screenshot/log folders. The final visual pass used `mcpa-auth-sLahf2`; later functional reruns skipped new screenshots.

During development, browser checks exposed and led to a fix for the linked quantity movement opening allocation review rather than release details. Test selector assumptions were also corrected to scope inspection to the addressed handover. Chrome required the existing local test harness's `MCPA_CHROME_NO_SANDBOX` option. No unresolved test failure remains.

## Manual staging acceptance

The project owner reported a successful end-to-end manual staging test on 26 October 2026, using the existing MCPA Staging project `blqlwfoserguserzmggo`:

- Engineer submitted quantity request `REQ-00008`.
- Admin approved and reserved the exact drill Asset ID, then released it through `TRF-00009`.
- Engineer saw Awaiting Your Inspection, inspected the tool as Good, and confirmed physical receipt.
- The transfer was received, and the drill appeared in STAGING Engineer A's Equipment Tracking under Project A with status In Use.

The tested preview packaged current working-tree source from `feature/post-release-improvements`, including the new unified request modules. Its manifest and served-file hashes were checked before handoff. The staging-only client configuration and generated preview remain in ignored local tooling and are excluded from this implementation manifest. The manual staging workflow was not repeated during finalization.

## Final scope review

The refreshed `origin/Updated-MCPARole` base is `152bf7bfdfc33d4dde01b15c7b08d977f878ee3a`. The final changes are limited to the exact 15 files above. No database migrations, backend authorization, reservation mutations, receipt mutations, evidence policies, unrelated modules, or private staging files are included.

Final focused checks cover JavaScript syntax, the combined request projection, navigation integration, local resource references, and manifest/scope consistency. The earlier complete local suites and the owner-reported manual staging acceptance remain the end-to-end evidence; they were not rerun for finalization.

Final results: 11 JavaScript syntax checks and 17 focused tests passed. Manifest scope, private-credential scan, entrypoint resource resolution, and comparison of application hashes against the manually accepted staging preview all passed.

## Limits and safety

- Staging acceptance above is owner-reported. Production-specific records and real device cameras/storage have not been exercised by this finalization.
- The existing offline demonstration retains its named-asset workflow. The unified quantity workflow uses authenticated RPCs and was verified through the isolated live-compatible fixture transport.
- The existing Accept Equipment procedure leaves missing/disputed items pending for sender follow-up; this change preserves that behavior instead of introducing a new exception backend.
- No database SQL, authorization definitions, reservation rules, receipt mutations, or evidence policies were changed.
- Existing untracked screenshots, test logs, credentials, generated staging assets, and private configurations remain excluded and preserved. Existing staging tooling was reused locally without changing its records, screenshots, logs, or backups.
- Finalization is limited to the feature-branch commit, normal feature-branch push, and Pull Request preparation. Production and Staging data remain untouched during finalization; `Updated-MCPARole` is not pushed or merged.
