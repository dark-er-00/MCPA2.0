# Workstream A implementation report

Date: 25 October 2026 (Asia/Manila).

Implementation is additive and isolated to the reserved Workstream A paths. The frontend modules are mountable; they are not wired into either application shell. The migration is unapplied to Supabase and existing databases. No commit, push, merge, deployment, production SQL, stash deletion, history reset, or existing-data rewrite was performed.

## Baseline and ownership

The initial checkout was `Updated-MCPARole` at `251940a832a4c69e5402420e71a396feeaf025c5` (`feat: add bulk equipment import with CSV XLSX support and secure Supabase RPC`). HEAD matched the locally available `origin/Updated-MCPARole` ref and their merge-base. The requested `feature/quantity-material-requests` branch was created directly from that commit. No remote fetch was needed or performed; this verifies the locally available shared baseline, not an independently reconfirmed remote tip.

The reserved migration filename was checked and unused before creation. Previously tracked files remain unchanged. Existing untracked logs/screenshots under other documentation directories were present at the start and were left untouched. All source, SQL, tests, documentation and evidence added by this work are within the user's reserved paths. No Workstream B files or schema/functions were modified.

## Implemented behavior

- **Equipment quantity demand:** Engineer/Architect can browse server-derived exact compatibility groups, see available/reserved/deployed indicators, choose an assigned project/site and request 1–100 Individual assets by quantity. Names, variants, models, details, conditions, tracking types and units are not fuzzily merged. History displays quantity, site, status and eventually the actual allocated Asset IDs.
- **Admin allocation:** Admin receives quantity requests, sees eligible individual Asset IDs and a suggested selection, can adjust that selection, and approves exactly the requested number of distinct compatible physical assets. Allocation uses existing movement approval, asset relations and reservations in a single transaction. Request rejection and reasons are supported. Later release/custody actions continue through the existing movement workflow.
- **Individual import expansion:** Original spreadsheet rows are validated by separate adapter modules. Individual quantity N produces N physical records with server-generated UUIDs and existing-format Asset IDs. Explicit Bulk remains one grouped record. The server wrapper delegates to the unchanged legacy importer and preserves atomicity, immutable receipts and operation replay. Source row plus expansion index remains traceable. Upload, source-row, column, expanded-record and original/expanded payload limits are enforced. Condition must be explicitly supplied; optional metadata is not invented.
- **Consumables outward requests:** Engineer/Architect can search category/item, enter multiple SKU quantities in catalog units, choose an assigned site, add optional purpose, and review history. Admin approves/rejects requests and issues full or partial quantities. Approval does not deduct stock. Issuance atomically updates the existing stock balance and ledger exactly once, with actor/date/requester/site accountability links. Negative stock and over-issuance are rejected.
- **Admin analytics:** Most frequently issued SKUs, requester/site breakdowns, Manila date filters, requested/approved/issued comparisons, daily issuance trends, current low stock, CSV summaries/transactions and request/ledger drill-down are implemented. Quantities stay separate by SKU and unit. Issued quantities are not labeled confirmed consumed; confirmed consumption remains unknown.
- **Runtime hardening:** Server role checks and RLS remain authoritative. Interfaces show loading/empty/error states, retain relevant form values on errors, prevent duplicate clicks, and provide operation recovery after uncertain responses. New screens inherit the existing light/gold and optional dark themes and expose labeled keyboard controls.

## Architecture and integration contracts

Read these companion documents for exact APIs, transaction behavior and wiring:

- [Database and Workstream B handoff](DATABASE-CONTRACT.md): additive `mcpa_wa_*` objects, RPC arguments/results, identity/RLS, lock ordering, stable equipment UUID/Asset ID/movement IDs, existing stock ledger and operation contracts.
- [Quantity frontend mounting](QUANTITY-UI.md): exact script/style order, Engineer/Admin mount APIs and application route lifecycle integration.
- [Consumables mounting and analytics](CONSUMABLES-INTEGRATION.md): exact requester/Admin mounting, recovery controls, analytics period definitions and limitations.
- [Importer extension integration](IMPORT-INTEGRATION.md): parser/worker/preview/controller APIs, source expansion/provenance, template, limits, receipts and exact later shared-importer changes.

`equipment`, `mcpa_movement_reservations`, `consumables.current_stock` and `consumable_stock_movements` remain authoritative. New request headers/lines are demand/approval metadata; issue rows link to existing ledger movements rather than storing another stock balance. Existing `consumable_requests` are incoming procurement/restock requests and remain intact. New outbound requests are not mixed into that old workflow.

## Verification results

Git preservation scope: the reviewed feature commit includes only the approved source, tests, migration and five Markdown documents. Test logs, screenshots, the generated file manifest, audit output and native PostgreSQL results remain preserved locally and are excluded from Git. Links below to those artifacts therefore do not resolve from a fresh clone or the GitHub branch; they refer to local implementation evidence. The 50-file inventory at the end records the implementation workspace, not the feature commit's 34-file contents. Test commands remain available for reproducing the evidence.

<!-- TEST-RESULTS-START -->
All final suites passed. There are **62 new isolated test cases**, **54 legacy regression cases**, **7 native PostgreSQL scenarios**, and a passing isolated browser harness using **47 real local RPC calls**. No skipped cases were reported by the Node test suites.

| Verification | Exact command from repository root | Final result | Evidence |
| --- | --- | --- | --- |
| Quantity adapter | `node --test tests/quantity-requests-v2/frontend.test.cjs` | 11 passed, 0 failed | [Log](quantity-frontend-tests.log) |
| Consumables helpers, analytics and recovery | `node --test tests/consumables-requests-v2/frontend.test.cjs` | 15 passed, 0 failed | [Log](consumables-frontend-tests.log) |
| Quantity and consumables SQL/RLS | `node --test --test-concurrency=1 tests/quantity-requests-v2/database.test.cjs tests/consumables-requests-v2/database.test.cjs` | 10 passed, 0 failed | [Log](database-tests.log) |
| Individual expansion, preview, controller and SQL | `node --test --test-concurrency=1 tests/individual-import-expansion-v2/*.test.cjs` | 26 passed, 0 failed | [Log](import-tests.log) |
| Existing importer, consumables and verified inventory regressions | `node --test --test-concurrency=1 tests/equipment-import.test.cjs tests/equipment-import.database.test.cjs tests/consumables-upgrade.test.cjs tests/consumables-archive.test.cjs tests/inventory.test.cjs tests/verified-request-inventory.database.test.cjs` | 54 passed, 0 failed | [Log](legacy-regression-tests.log) |
| Four mounted interfaces over disposable SQL/RLS | Set `$env:MCPA_CHROME_NO_SANDBOX='1'`, then `node tests/quantity-requests-v2/frontend.browser.cjs` | Passed; 47 local RPC calls; no uncaught errors or page overflow | [Log](browser-tests.log), [screenshots](screenshots/) |
| Independent native PostgreSQL backends | `node tests/individual-import-expansion-v2/postgres-concurrency.cjs 'C:/Users/maeko/AppData/Local/Temp/mcpa-pg-concurrency-2ae20d323cf847828f89cb28069954e0/pgsql/bin'` | 7 passed; cluster stopped | [Log](postgres-concurrency/run.log), [structured results](postgres-concurrency/results.json) |
| Syntax and ownership audit | `node --check` on every owned JavaScript file; Git branch/HEAD/tracked diff/untracked path checks | 23 files parse; 50 additive files; no tracked shared-file changes | [Audit](verification-audit.log), [manifest](FILE-MANIFEST.txt) |

Browser verification deliberately drops successful responses after actual submission and partial-issuance commits. Remounting and recovering reuses the same operation UUID and exact payload without duplicate requests, issues or stock deductions. Desktop/mobile and light/dark verification includes 393/430px visibility of requester quantity and Admin issuance inputs. The managed test environment needed the explicit test-only Chrome no-sandbox option; it serves only local fixture content and blocks external HTTPS.

Native PostgreSQL 17.11 ran at `read committed` isolation in a newly initialized temporary cluster. The seven scenarios verified additive migration preservation, simultaneous expansion retries (2 source rows → 21 records and one pair of receipts), two quantity requests competing for the same assets, mixed legacy/new reservation conflicts, simultaneous same-operation issuance retries, independent requests competing for insufficient stock, and final referential/inventory integrity. The harness observed independent backend PIDs and lock waits. Final integrity found 27 distinct Asset IDs for 27 equipment records, zero negative stock, zero broken issue/import references and zero waiting locks. The result records `stopped: true` and the tested migration SHA-256.
<!-- TEST-RESULTS-END -->

The browser harness loads isolated mounts with actual RPCs/RLS in a disposable PGlite fixture. It does not load or modify either production application shell. External HTTPS is blocked. Its fixture models session identity locally; it does not prove the live Supabase Auth transport, production PostgREST, deployment or shared navigation wiring. PGlite uses a single PostgreSQL session, so simultaneous Promise tests verify conflicts/replay but cannot prove independent backend lock scheduling.

The native concurrency harness creates its own fresh cluster and random loopback port and accepts a PostgreSQL binary directory, not an existing database URL. It never attaches to an existing server. The installed Program Files PostgreSQL copy was incomplete and sandboxed startup failed, so verification used an already available complete development distribution with a reviewed sandbox exception. The final native run passed all seven scenarios and stopped its temporary server. It did not require a download, installation, production credentials or an existing database connection. Re-run this harness after final integration/schema changes before deployment.

Visual verification covered desktop/mobile and light/dark with one inspection and one correction/confirmation round. The correction made requester quantity inputs visible without horizontal scrolling and stacked the Admin review/issuance fields on mobile. Other wide history/report tables remain locally scrollable. Screenshots contain explicitly named fixture inventory, not claimed production records.

## Deployment prerequisites and unfinished integration

1. Review the additive migration against the agreed shared baseline and Workstream B's final schema. Apply the existing authenticated identity, role/account, canonical Office, verified availability, consumables category/SKU/archive and equipment import prerequisites first. Use the verified real Office UUID from the existing deployment preflight, never a test fixture UUID. The new migration fails if required authoritative RLS/preconditions are absent; it is a one-time migration.
2. Re-run the supplied native multi-backend allocation/legacy-reservation, stock/issuance and import retry races after any final shared integration or Workstream B schema changes, using a fresh local cluster and complete development PostgreSQL distribution. The current Workstream A migration passed all seven native scenarios. No production connection is needed.
3. Coordinate final application menu/route/script/style/mount lifecycle wiring and existing importer integration with the shared-file owners, following the companion documents. These requirements cannot be completed within the ownership boundaries, so no shared-file edits were attempted. The feature is not live.
4. Review B's use of stable `equipment.id`, `equipment.asset_id`, existing `mcpa_movements.id`/asset relations, and originating quantity request ID. Confirm release, receipt, returns, transfers, cancellation and disposal with the final combined implementation. Workstream A does not implement or modify those owned lifecycle flows.
5. Run authenticated staging end-to-end checks through both real application shells and Supabase/PostgREST after reviewed migration/wiring. Verify roles, session expiry/account switches, stock refresh, source limits, import recovery and existing restocking. Reload PostgREST schema cache; the migration includes its notification.

Other explicit limitations:

- Existing Bulk and legacy Individual records with quantities other than one are preserved, visible and not converted. Physical allocation supports Individual `quantity=1` assets. Grouped Bulk partial reservations require an agreed shared inventory/custody contract. Equipment partial approval is not implemented; approval allocates the full requested quantity.
- Exact metadata fingerprints are conservative compatibility keys, not durable master type IDs. A metadata change can invalidate a pending request; Admin must review/reject/resubmit rather than substitute a different variant.
- No confirmed-consumption capture, delivery acknowledgement, outward-request cancellation/reapproval, issuance reversal/edit or additional custody workflow is introduced. Audit history cannot be edited/deleted through these modules.
- An outstanding outward consumables request does not alter the existing shared archive guard/UI. If an item is archived, issuance fails safely until explicit restoration. Existing archive/restock records are preserved.
- Catalog/history snapshots and client analytics are unpaginated. Add reviewed server pagination for large datasets before scale-up. Explicit refresh and server-side stock rechecks protect writes; no new live Realtime/polling integration is registered.
- Legacy stock deltas lacking person/site/request links remain in the existing ledger and are excluded from attributed outward-request analytics. Historical consumption/accountability is not inferred.
- Session storage recovery is per browser tab and authenticated profile. If it is unavailable or cleared, preserve operation keys through the integrating client; never assume a timed-out transaction failed.
- Requested/approved analytics use the request-creation cohort and current approved quantity; issued analytics use actual issuance dates. They are not historical as-of balances. Low stock is current inventory, independent of the date filter.

## Exact files added or modified

All listed files are new; no previously tracked file was modified. The list includes source, tests, documents and verification artifacts.

<!-- FILE-LIST-START -->
- `1-admin/modules/consumables-usage-v2/consumables-usage.html`
- `1-admin/modules/consumables-usage-v2/consumables-usage.js`
- `1-admin/modules/quantity-allocation-v2/index.js`
- `2-engr/modules/consumables-requests-v2/consumables-requests.html`
- `2-engr/modules/consumables-requests-v2/consumables-requests.js`
- `2-engr/modules/quantity-requests-v2/index.js`
- `documentation/workstream-a/CONSUMABLES-INTEGRATION.md`
- `documentation/workstream-a/DATABASE-CONTRACT.md`
- `documentation/workstream-a/FILE-MANIFEST.txt`
- `documentation/workstream-a/IMPLEMENTATION-REPORT.md`
- `documentation/workstream-a/IMPORT-INTEGRATION.md`
- `documentation/workstream-a/QUANTITY-UI.md`
- `documentation/workstream-a/browser-tests.log`
- `documentation/workstream-a/consumables-frontend-tests.log`
- `documentation/workstream-a/database-tests.log`
- `documentation/workstream-a/import-tests.log`
- `documentation/workstream-a/legacy-regression-tests.log`
- `documentation/workstream-a/postgres-concurrency/results.json`
- `documentation/workstream-a/postgres-concurrency/run.log`
- `documentation/workstream-a/quantity-frontend-tests.log`
- `documentation/workstream-a/screenshots/consumables-admin-1440-light.png`
- `documentation/workstream-a/screenshots/consumables-admin-430-dark.png`
- `documentation/workstream-a/screenshots/consumables-engineer-393-light.png`
- `documentation/workstream-a/screenshots/quantity-admin-1440-light.png`
- `documentation/workstream-a/screenshots/quantity-engineer-393-light.png`
- `documentation/workstream-a/screenshots/quantity-engineer-430-dark.png`
- `documentation/workstream-a/verification-audit.log`
- `js/upgrades/consumables-requests/analytics.js`
- `js/upgrades/consumables-requests/core.js`
- `js/upgrades/consumables-requests/styles.css`
- `js/upgrades/individual-import-expansion/controller.js`
- `js/upgrades/individual-import-expansion/core.js`
- `js/upgrades/individual-import-expansion/preview.js`
- `js/upgrades/individual-import-expansion/styles.css`
- `js/upgrades/individual-import-expansion/worker.js`
- `js/upgrades/quantity-requests/client.js`
- `js/upgrades/quantity-requests/styles.css`
- `js/upgrades/quantity-requests/view.js`
- `supabase/migrations/202610250001_quantity_material_requests.sql`
- `tests/consumables-requests-v2/database.test.cjs`
- `tests/consumables-requests-v2/frontend.test.cjs`
- `tests/individual-import-expansion-v2/controller.test.cjs`
- `tests/individual-import-expansion-v2/core.test.cjs`
- `tests/individual-import-expansion-v2/database.test.cjs`
- `tests/individual-import-expansion-v2/postgres-concurrency.cjs`
- `tests/individual-import-expansion-v2/preview.test.cjs`
- `tests/quantity-requests-v2/database-fixture.cjs`
- `tests/quantity-requests-v2/database.test.cjs`
- `tests/quantity-requests-v2/frontend.browser.cjs`
- `tests/quantity-requests-v2/frontend.test.cjs`
<!-- FILE-LIST-END -->
