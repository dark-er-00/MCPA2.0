# Consumables module

The HTML/CSS/JavaScript module uses the shared Supabase client, authenticated
Admin/Secretary roles, and transactional RPCs. Stock, requests, receipts and history
remain in consumables, consumable_requests and consumable_stock_movements.

## Deployment

Read [the upgrade report](../../../documentation/consumables-upgrade-2026-10-22/REPORT.md)
and [deployment instructions](../../../documentation/consumables-upgrade-2026-10-22/DEPLOYMENT.md).
SQL is prepared for manual review; it has not been run against production.

setup.sql is the historical bootstrap used **before** the authentication migration.
Do not rerun it on an authenticated production installation: it predates the role
wrappers and grants anonymous access. Existing installations use the new migrations
after their existing migration history, without rerunning bootstrap.

## Inventory behavior

- Search name, SKU, specification, category or unit; combine category and stock
  filters. All Categories includes legacy records pending classification.
- Active views exclude soft-archived rows. Stock status → Archived history shows
  their retained stock history without Edit/Update Stock/Request actions. Archive
  state never changes a stock quantity or the generated low-stock status.
- Migration 202610220002 adds archive guards and immutable lifecycle events.
  Only a verified active Admin may explicitly restore a row through
  consumables_restore_item, with its current version and a reviewed reason.
  The guarded sample-only SQL and exact deployment order are in DEPLOYMENT.md.
- Categories and 126 catalog variants across 60 families come from
  js/consumables-catalog.js. Regenerate SQL with
  `node scripts/generate-consumables.cjs`; `--check` detects stale artifacts.
- Each newly imported SKU opens at exactly 100 units, with a configurable default
  minimum of 20. Existing matching balances, thresholds, IDs and history remain.
- Add/Edit requires one of the twelve categories. Blank new codes are allocated
  atomically. Names may repeat across specifications/units. Units stay fixed after
  registration. Change physical stock through Update Stock or Receive Stock.
- Quantities retain the existing numeric(12,3) rules: zero to 999,999,999.999,
  at most three decimal places. Usage, restock and receipts must be positive;
  physical-count correction may be zero. Invalid/non-finite values fail.
- Zero means Out of Stock, including a minimum of zero. Positive stock below the
  minimum means Low Stock; stock equal to the minimum is healthy. PostgreSQL
  generates stock_status for both the module and Dashboard.
- Stock RPCs lock the consumable row, check version and operation identity, apply
  the mutation and insert history in one transaction. Failed operations roll back.
  Direct browser writes and unauthorized roles cannot bypass the RPCs.
- New movement history records the verified actor, previous balance, adjustment,
  final balance, timestamp and related request. Existing actor information is not
  invented; old entries display 'Legacy actor not recorded'. History is immutable.
- Requests snapshot SKU/specification and retain stable consumable/request IDs.
  One pending/partial request per item, partial receiving, cancellation and stable
  retry IDs continue to work. Creating/cancelling a request does not change stock.
- The Admin Dashboard card navigates directly through showScreen('consumables').
  It counts live low/out statuses and hides its warning when zero. It uses
  the existing dashboard watcher/30-second refresh, without another timer.
- Consumables retains its existing disposable 30-second checks; dialogs and saves
  pause those checks. Failed saves preserve input; uncertain responses reuse stable
  operation IDs. A successful save followed by a failed read requires Refresh.
- Dates use Manila time. The purchase ledger remains record-only; receiving in
  Material Requests changes stock. Its request picker displays SKU metadata.

## Verification

From the repository root (Node 22+; Chrome/Edge for browser checks):

```powershell
node scripts/generate-consumables.cjs --check
node --test --test-concurrency=1 tests/consumables-upgrade.test.cjs tests/dashboard-view.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1' # restricted local test environment
node tests/auth.browser.cjs --consumables-upgrade
npm.cmd test --prefix tests
```

The new browser scenario extends the current authenticated harness. SDK transport
runs against isolated PostgreSQL fixtures; external HTTPS is blocked. The historical
standalone Consumables database suite remains unchanged. See the report for exact
commands, outcomes, screenshots and concurrency-test limits.
