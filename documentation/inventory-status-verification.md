# Inventory status investigation and verification

Verified locally on 2026-10-15, following project-count/history commit `2961672`.

## Why the labels disagreed

In `1-admin/modules/masterlist/masterlist.js`, `initMasterlist()` mapped the saved `equipment.status` through `formatDbStatus()`. `renderTable()` used that value, `STATUS_LABEL`, and `getBadgeClass()` for the primary badge. The old formatter also defaulted unknown statuses, including `IN_OFFICE`, to `available`.

The secondary text came from `EquipmentTracking.availability(item)` in `js/equipment-tracking.js`. That function was location-based: a project plus `IN_USE` meant Deployed; no project or `IN_OFFICE` meant Available; everything else meant Unavailable. It did not check custody, reservations, handovers, damage, or quantity.

Consequently, a saved `AVAILABLE` record with a project location could show AVAILABLE / Unavailable, while another with no location showed AVAILABLE / Available. Worse, missing equipment without a project could appear available. This was not a reliable distinction between recorded status and operational eligibility. The named Pala and Welding Machine cases were reproduced with isolated fixtures; their live database rows were not inspected or modified.

The existing request RPC permits recorded AVAILABLE stock with no holder. Project location alone does not disqualify it. IN_OFFICE is normalized to available in the old read snapshot, but the mutation validator does not accept that raw status for requests. The new presentation preserves and displays the raw status rather than promising an invalid request.

## Implemented behavior

One `EquipmentTracking.requestability()` calculation supplies Admin inventory, Engineer inventory, equipment details, dashboard availability/filtering, and Request Tools eligibility. It excludes zero stock, inactive/archived records, damaged/missing/retired statuses, known damage conditions, assigned holders, approved reservations, pending/refused handovers, and unverified stock. Pending requests alone do not reserve a tool. Received transfers release their reservation but leave the tool in the recipient's custody, so it remains unavailable for a new stock request.

The UI explicitly separates **Recorded status** from **New requests**. Each eligibility result has a visible explanation. A current holder may still transfer or return equipment through the existing workflows; “New requests” does not claim that every movement is forbidden. No existing equipment status values are rewritten.

The Admin Available filter now means Available to request. Asset IDs do not break across lines, labels have room to wrap, and horizontal table scrolling stays inside its accessible container. Existing themes and mobile Back remain intact.

## Confirmed backend gap and unapplied patch

The isolated database reproduced a reserved stock tool visible to a second Engineer while the reserving request was correctly hidden by account scope. An empty scoped request list cannot prove that stock is unlocked.

`supabase/migrations/202610150001_inventory_availability.sql` wraps the existing authenticated movement snapshot and adds only `recordedStatus`, `movementLock` (request/transfer/reserved/null), and a response version. It enriches only tools already authorized by the original snapshot; it does not reveal another user's movement ID, names, destination, or notes. The personal inventory reader retains the same per-tool metadata. No equipment, project, custody, movement, reservation, or table schema changes are included.

**This SQL patch has NOT been applied to Supabase.** Before deploying the frontend, review and manually apply it after the existing authenticated snapshot/cancellation migrations. The prior snapshot remains responsible for authentication, permissions, and its existing response fields. Tests cover repeated application, anonymous/inactive/Secretary denial, private-helper denial, privacy, and unchanged stored records during installation.

Without the patch, Admin can use a successfully loaded company-wide movement snapshot, but field users cannot verify hidden reservations. Their unverified stock is explicitly labeled and excluded from Request Tools. Do not deploy the frontend alone if field request selection must remain fully available. Failed movement reads also avoid presenting unverified stock as available.

## Changed files

- `js/equipment-tracking.js`: shared eligibility, explanations, status markup, counts and filters.
- `js/movement-cloud.js`: track successful snapshot loading for the Admin fallback.
- `js/movement-ui.js`: Request Tools uses the shared eligibility rule and explains unverified stock.
- `js/movement-overview.js`, `js/dashboard-view.js`: consistent Engineer/detail/dashboard labels and calculations.
- `1-admin/modules/masterlist/masterlist.js`, `.html`, `.css`: movement-aware inventory reads, raw status preservation, shared labels/details, realtime notification refresh, accessible table scrolling and mobile sizing.
- `css/components.css`: shared status presentation using theme tokens.
- `supabase/migrations/202610150001_inventory_availability.sql`: unapplied read-only snapshot enrichment.
- `tests/inventory-availability.database.test.cjs`, `tests/inventory-availability.browser-checks.cjs`: new privacy/eligibility/browser regressions.
- `tests/inventory.test.cjs`, `tests/dashboard-view.test.cjs`, `tests/inventory.browser.cjs`: corrected availability expectations and async detail navigation checks.
- `tests/auth.browser.cjs`, `tests/package.json`: isolated migration fixture and new test command.
- This report.

## Passed verification

Commands ran from `tests` with `npm.cmd`. All database changes were confined to disposable PGlite fixtures. Chrome blocked external HTTPS and used `MCPA_CHROME_NO_SANDBOX=1` in this environment.

| Command | Result |
| --- | --- |
| `npm.cmd run test:inventory-availability` | 18 unit/database tests plus real Chrome inventory/details/request-picker tests |
| `npm.cmd run test:inventory` | 9 unit/database tests plus inventory, realtime, filtering, archive/restore browser checks |
| `npm.cmd run test:navigation` | 20 unit tests plus role-correct projects and Back/Forward/scroll/record/session browser checks |
| `npm.cmd test` | 62 unit/database tests, 8 movement database scenarios, full auth/movement/mobile/theme/realtime browser regressions |
| `npm.cmd run test:projects` | 3 database tests plus authorized project/error browser checks |
| `npm.cmd run test:request-projects` | 9 tests plus independent Engineer/Architect requests, project assignments, approval/release/receipt browser checks |

All 12 changed JavaScript files passed syntax checks. Final diff whitespace checks passed. Browser suites checked for uncaught JavaScript errors. New inventory tests covered 375, 393, 430, 768 and 1440px in both themes; screenshots were inspected on mobile and desktop. Physical iOS/Android QA remains to be performed.

The pre-existing edit to `supabase/merge-integration-verification.sql` remains untouched and excluded from the implementation commit. No push, deployment, production migration, or live record change was performed.
