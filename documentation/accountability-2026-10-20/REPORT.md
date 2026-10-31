# Login controls and equipment accountability review — October 20, 2026

Work is local on `Updated-MCPARole`. No commit, push, pull, merge, deployment, live Supabase connection, migration execution against production, or production record change was performed. PostgreSQL checks used disposable PGlite databases; browser fixtures served local RPCs and blocked external HTTPS.

## Findings and changes

1. **Engineer visibility:** the exact warning in the supplied report is emitted when otherwise eligible tools lack trusted reservation metadata. A successful legacy `mcpa_movement_snapshot` response can cause it; the warning is not evidence of a failed RPC. The previous Admin implementation treated its complete movement list as verification, whereas an Engineer's scoped list cannot prove that another person's reservation does not exist. The repository's October 15 migration supplies this metadata, but its presence in the repository does not establish live deployment. The legacy response and Admin/Engineer difference were reproduced locally. Live deployment state, definition/grant drift and browser caching remain to be verified with the supplied read-only preflight and signed-in snapshot response.

   The UI now distinguishes missing server verification, an actual failed refresh, genuinely empty inventory, and reserved/pending-receipt inventory. Unknown availability is shown as **Unverified**, rather than a confirmed zero. A failed refresh invalidates cached request eligibility. Updated stock selections are reconciled while preserving the user's destination, purpose and search. Submission rechecks selected tool eligibility.

2. **Legitimate Office stock:** T-6254 should be discoverable and requestable if it remains recorded `AVAILABLE`, positive quantity, in usable condition, without a holder, reservation or active handover, and the requester has an active authorized account and an assigned active destination project. Admin approval and named, inspected receipt still apply. Location alone is insufficient. Legacy `IN_OFFICE` is distinct from recorded `AVAILABLE` because the action RPC accepts the latter.

   Existing server authorization explicitly includes unheld `AVAILABLE` stock across source projects. Therefore T-5559's source project alone does not disqualify it under the current policy. Unrelated held project inventory remains restricted. This work preserves `can_view_tool`, `can_view_movement`, RLS, assignments and role permissions; it does not expand the catalog policy or assume that every Admin-visible asset is requestable.

3. **Admin presentation:** “Available to request” is accurate only as verified stock eligibility, subject to the requester's destination authorization and Admin approval. Recorded `AVAILABLE` alone does not establish it. The old Admin fallback was removed: even a full movement list cannot rule out a stale reservation row. Both roles now require server verification for an available label. Admin also recognizes a released request as pending receipt even if its transfer is absent from a scoped list. Active handovers display **Pending receipt — unavailable for new requests** separately from recorded status. Failed verification cannot fall back to cached eligibility.

4. **T-8862 / REQ-00013:** the supplied production findings are consistent with a legitimate release. The existing transaction changes the request to `released`, creates a pending transfer, and atomically moves the reservation from the request to that transfer. It intentionally leaves recorded equipment status, site and custodian unchanged until authorized receipt. Thus `AVAILABLE`, NULL site, no holder and an active reservation can coexist without corruption. An isolated REQ-00013/T-8862 reproduction verified this behavior, inspection requirements, custody updates, history preservation and retry safety.

   **The actual production reservation owner and REQ-00013's current legitimacy are not yet established.** The earlier screenshot is not current authoritative evidence. If its linked transfer remains pending/refused, retain the reservation and resolve it using the authorized receipt or accountable field-user cancellation/follow-up workflow after physical verification. Do not fabricate inspection or receipt. If records conflict or a reservation outlives its workflow, review the returned history; no automatic cleanup was implemented. Missing site is not proof of Office location and does not justify the existing correction.

5. **Confirmed server bugs:** the private lifecycle skipped reservation checking on `createRequest`, although approval checked it later. It also accepted damaged-condition stock whose recorded status was still `AVAILABLE`. The proposed migration adds validation after existing idempotent retry replay and equipment row locking, preserving the surrounding transaction and audit logic. Its reader supplies only lock categories for already-authorized tools and also detects active approved/released requests and pending/refused handovers if a reservation row is missing. Stale reservation rows remain blocking. Unknown reader/lifecycle source definitions abort installation.

6. **Login:** visible Play/Pause was replaced with two restrained chevrons in both entry points. Previous/Next wrap, ignore overlapping loads/fades, reset progress and the automatic interval, and have native keyboard activation, accessible names and gold focus states. Keyboard focus within the controls pauses automatic progression; leaving resumes it. Reduced motion uses instant manual changes and no autoplay. Completed crossfade animations are retired. All nine photographs, aspect-ratio bounds and per-photo framing remain unchanged. Mobile CSS, static photograph, glass card, positioning and authentication flows remain unchanged; controls and slideshow timers stay hidden/inactive on compact layouts.

## Manual Supabase steps

1. Run [inventory-movement-preflight.sql](../../supabase/inventory-movement-preflight.sql) in SQL Editor. **Read-only**, with an explicit read-only transaction. Return the function definitions/grants/hashes, four equipment rows and reservation owners, related movements/receipt inspections/operation history, and destination assignment results. Also inspect the signed-in Engineer's `mcpa_movement_snapshot` response for `inventoryAvailabilityVersion` and the T-6254/T-5559 tool metadata, and record any RPC error code. These distinguish missing migration, wrong exposed definition/grant, stale frontend and real stock restrictions.
2. Review [202610200001_verified_request_inventory.sql](../../supabase/migrations/202610200001_verified_request_inventory.sql). **Changes database function definitions and grants**, including prospective request validation; it does not update business rows, delete reservations, change RLS, reconfigure Office or manufacture historical events. It supports the reviewed legacy snapshot or October 15 metadata wrapper, so the October 15 migration need not be applied separately first. Execute only as a separate manual deployment decision, after reviewing the preflight. Unknown source hashes deliberately stop it.
3. Do not rerun `202610120004_equipment_office_default.sql` or older lifecycle installers after this patch. Existing Office configuration was preserved. Older installers may correctly reject the changed lifecycle hash. The new preflight reports definitions directly; older compatibility diagnostics may flag the newly reviewed definitions as unfamiliar.
4. After a manual migration, rerun the read-only preflight, refresh the signed-in sessions, and verify snapshot metadata and Office eligibility. Confirm that equipment, custody, quantities, reservations and history remain unchanged by installation. Complete any legitimate handover only after an authorized person verifies actual delivery and performs the required inspections.
5. **Do not execute `equipment-office-confirmed-correction.sql` in the reported state.** Only its warning comments changed. Its guards remain intact. No new historical-data correction was prepared because the supplied evidence does not establish one is needed.

## Validation

Final command results are recorded below. Counts refer to automated test cases; browser programs report scenario groups rather than a numerical test-case count. Repeated suites overlap and should not be added as unique coverage.

| Command | Automated results | Browser/scenario result |
|---|---:|---|
| `npm.cmd run test:login-slideshow` | Browser-only | Passed: 15 responsive viewports, 47 verified photo captures, nine-photo cycle plus wrap and controls |
| `npm.cmd run test:equipment-office` | 8 passed / 0 failed | Passed |
| `npm.cmd run test:inventory-availability` | 28 passed / 0 failed | Passed |
| `npm.cmd run test:request-projects` | 10 passed / 0 failed | Passed |
| `npm.cmd run test:office-returns` | 30 passed / 0 failed | Passed |
| `npm.cmd run test:turnover` | 18 passed / 0 failed | Passed; actual 30-second fallback and independent sessions |
| `npm.cmd run test:auth` | 15 passed / 0 failed | Passed |
| `npm.cmd run test` | 66 passed / 0 failed | 8/8 isolated movement scenarios; browser passed |
| `node --test verified-request-inventory.database.test.cjs` | 7 passed / 0 failed | Not applicable |
| Additional movement sync/cancellation/release compatibility run | 13 passed / 0 failed | Not applicable |
| `npm.cmd run test:login-slideshow -- --login-slideshow-controls` | Browser-only | Passed focused navigation/lifecycle/reduced-motion/failure checks; skips long framing/cycle checks |

Initial Chrome runs timed out inside the restricted sandbox. Approved reruns outside it used the same local-only fixtures. During implementation, assertions and fixtures were corrected for the required legacy site field, restoring a deliberately dropped RPC without reinstalling an older migration, and focus-sensitive viewport screenshots. See final results above; no production writes were used to satisfy tests.

## Screenshots

These are **isolated local fixtures, not screenshots or confirmations of production records**. REQ-00013/TRF-00014 and the destination label were deliberately reproduced locally. The screenshot fixture's source location and tool selection differ from production; the database integrity regression separately reproduces the reported NULL site.

- [Desktop login with arrows](screenshots/desktop-login-arrows.png)
- [Unchanged mobile login](screenshots/mobile-login.png)
- [Admin Equipment Tracking: recorded Available and pending receipt](screenshots/admin-equipment-tracking.png)
- [Engineer Requests: available Office stock and assigned destination](screenshots/engineer-requests.png)
- [REQ-00013 released / awaiting receipt](screenshots/request-awaiting-receipt.png)
- [Failed availability verification](screenshots/availability-verification-failed.png)

## Exact changed files

Application:

- `index.html`
- `2-engr/index.html`
- `css/login-slideshow.css`
- `js/login-slideshow.js`
- `js/equipment-tracking.js`
- `js/movement-cloud.js`
- `js/movement-ui.js`

SQL:

- `supabase/migrations/202610200001_verified_request_inventory.sql` (new, manual review only)
- `supabase/inventory-movement-preflight.sql` (new, read-only)
- `supabase/equipment-office-confirmed-correction.sql` (warning comments only)

Tests:

- `tests/auth.browser.cjs`
- `tests/inventory-availability.browser-checks.cjs`
- `tests/inventory.test.cjs`
- `tests/login-slideshow.browser-checks.cjs`
- `tests/movement-sync.test.cjs`
- `tests/office-return.browser-checks.cjs`
- `tests/package.json`
- `tests/verified-request-inventory.database.test.cjs` (new)

Documentation:

- `DESIGN.md`
- `.impeccable/surfaces/index-html.md`
- `documentation/accountability-2026-10-20/REPORT.md`
- The six PNG files linked above in `documentation/accountability-2026-10-20/screenshots/`.

## Git status and remaining work

The starting working tree was clean on `Updated-MCPARole`. The files above remain uncommitted: 17 tracked modified files, three new SQL/test files, and this new report/screenshot directory. No files are staged; the branch still tracks `origin/Updated-MCPARole`. No remote fetch was performed, so upstream state was not refreshed.

Remaining production decisions: review the read-only results, confirm the live snapshot definition/version and actual reservation owner, decide whether to install the proposed migration, physically verify T-8862, and resolve its legitimate movement through authorized workflows. Production root-cause certainty and physical custody cannot be supplied from local fixtures. Until then, T-8862 remains blocked and its Office correction remains ineligible. The local software work does not itself change live eligibility.
