# Consumables archive compatibility

Implemented locally on `Updated-MCPARole`. Existing uncommitted upgrade changes
were retained. No production SQL, stock changes, deletion, commit or push occurred.

## Reviewed input

The user reports 126 source SKUs, 0 exact matches, 126 proposed inserts and 2 review
flags. Both flags originate from the sole legacy sample: UUID
`c3f58442-dc99-4466-8590-16642abdb7bc`, `Cutting Disc`, unit `pieces`, stock
24.000, minimum 120.000, no specification/category/code, no requests and four stock
movements. It is confirmed sample/test inventory. These are user-provided live
preflight results; this agent did not connect to production.

## New SQL and prerequisites

- [202610220002_consumables_archive.sql](../../supabase/migrations/202610220002_consumables_archive.sql)
  follows the existing auth setup and the prepared 000/001 category/SKU migrations.
  It adds nullable `archived_at`/`archive_reason`, lifecycle-state validation, an
  immutable `consumable_archive_events` audit table, active-item guards, and an
  Admin-only restoration RPC. It does not archive a row or modify a quantity.
  Existing RLS remains intact; new lifecycle reads use the same Admin/Secretary
  scope, and direct writes/private helpers remain denied to browser roles.
- [02-archive-sample.sql](02-archive-sample.sql) is a **separate manual step**,
  outside automatic migrations. Run as the authorized SQL owner after all three
  schema migrations. It locks before inspecting, verifies the exact reviewed UUID
  and state (NULL/empty specification accepted), zero requests and exactly four
  movements, then changes only archive metadata/version/timestamp on that UUID.
  It compares original movement records before/after and rolls back any mismatch.
  Re-running the expected archived state does nothing. Changed identity, stock,
  minimum, classification, references, history count or archive reason aborts.
- Regenerated [01-preflight.sql](01-preflight.sql), [03-catalog-seed.sql](03-catalog-seed.sql)
  and [04-verification.sql](04-verification.sql) understand archival; the generator
  remains their source. Preflight also works before archive columns exist through
  `to_jsonb` inspection. The seed now requires migration 002.
- [05-existing-stock-review.sql](05-existing-stock-review.sql) excludes archives
  from its unrelated read-only correction proposals. It is not an import step.

The ledger extension is optional when Purchases is not installed; when present,
the existing repository purchase schema is required. Migration 002 adds the archive
flag to authorized request choices and a guard against new links to archived stock.
It retains existing linked purchases and procurement history. No stock RPC,
movement/equipment policy or unrelated migration was replaced.
If Purchases will be used, its existing ledger migration must precede 002. A later
new ledger installation needs its own reviewed archive-compatibility follow-up;
002 is a once-only migration, not a reinstall script.

## Behavior and safeguards

`archived_at IS NULL` means active. The sample keeps its UUID, 24 stock, 120 minimum,
generated `low` status and four original movements. Only its archive metadata,
version and update time change; a separate lifecycle event records archival.

Active inventory, category/search counts, global material search, dashboard/module
warnings and new request/purchase choices exclude archives. Stock status →
**Archived history** shows retained archived rows with only History actions. The
normal role/route checks still apply. Historical requests and purchase links stay
available for authorized review; an existing purchase can retain its archived link
when other purchase details are edited, but cannot newly acquire one.

Archived items reject usage, restock, count correction, metadata edits, new requests
and stock-movement inserts. Receipt changes cannot bypass the row guard. Open
requests block archival. Existing lock/version/operation-ID stock semantics,
numeric bounds, immutable stock history and RLS are preserved. A prior committed
RPC retry can still return its historical result without performing a new write;
new writes are blocked.

Restoration is deliberately separate: verified active Admin only,
`consumables_restore_item(p_id,p_version,p_reason)`, with the current version and a
specific reason. It reactivates without changing stock/history, records an immutable
actor/reason event, and rolls back on active duplicate conflicts. It does not grant
direct table writes or allow Secretary/other roles to restore. No automatic
restoration or stock-reset script is supplied. Restoring the generic sample would
reintroduce its ambiguity and is not part of this deployment.

Natural name/specification/unit uniqueness is enforced for active records; archived
equivalents cannot be matched or resurrected by import. Item codes and catalog keys
remain globally unique. Archived codes stay reserved. An archived catalog identity
causes seed failure requiring explicit review/restoration rather than creating a
second identity. Active ambiguity checks remain unchanged in strength.

## Exact manual order

23 October prerequisite clarification: since purchase storage/ledger are confirmed
absent, first follow [receipt deployment](../purchase-receipts-2026-10-23/DEPLOYMENT.md).
Install the new receipt-only compatibility SQL and existing purchase ledger before
the Consumables SKU/archive steps. Leave deployed Equipment Photos intact and do
not run the historical combined `feature_storage.sql`.

Use a staging copy first, with backup, saved preflight and a maintenance window.
For each environment, run only the pending schema migrations; skip those already
recorded as successfully applied. Never rerun legacy setup/auth scripts.

1. Initial read-only `01-preflight.sql` and prerequisite/migration-ledger review.
2. `supabase/migrations/202610220000_consumable_categories.sql`, if pending.
3. `supabase/migrations/202610220001_consumables_skus.sql`, if pending.
4. `supabase/migrations/202610220002_consumables_archive.sql`.
5. Manually review/execute `02-archive-sample.sql`, targeting only the confirmed UUID.
6. Repeat read-only `01-preflight.sql`: expect **126 source, 0 matches, 126 inserts,
   0 manual-review flags**, if the reported production snapshot is unchanged.
7. Review/execute `03-catalog-seed.sql`: **126 new active SKUs, each stock 100**,
   default minimum 20; sample untouched at 24/120.
8. Read-only `04-verification.sql`: expect **127 total rows, 126 active, 1 archived**,
   60 active catalog families, 126 codes/identities, 0 active low-stock items at the
   initial defaults, sample's four original movements plus one separate archive
   event. CUT-001/CUT-002 are new 4-inch/7-inch Metal Cutting Disc rows, both at 100.
9. Deploy the compatible frontend; check both authorized roles, history, stock
   actions, filtering, request/purchase choices and the next Dashboard refresh.

Staging seed rerun must match 126 active catalog rows with no duplicate inserts.
Production execution remains a separate manual operation after explicit deployment
approval; this task authorizes preparation only. [DEPLOYMENT.md](DEPLOYMENT.md)
contains maintenance, recovery and true two-session stock concurrency procedures.
The guarded archive and seed are independently transactional. Keep the archive
guards and histories if later correcting the release; use reviewed restoration
instead of deleting records or directly clearing archive fields.

## Files changed in this follow-up

New: migration 002, guarded sample SQL, `tests/consumables-archive.test.cjs`, this
report and archive test logs. Updated: catalog generator/generated preflight/seed/
verification, optional stock-review SQL, shared catalog filtering, Consumables UI,
Dashboard reader, global search, Purchases picker, authenticated browser fixture,
upgrade fixture/browser checks, global-search regression, test script, README,
stock design/report/deployment docs and complete [FILES.md](FILES.md).

## Validation

- Targeted archive/upgrade/dashboard/global-search suite: **37 passed, 0 failed**
  ([archive-tests.log](archive-tests.log)); includes exact user-reported before/after
  preflight counts, guarded-state failure, preserved sample/history, seed rerun,
  archive write protection, RLS, Admin restoration, duplicate prevention and
  historical/new purchase link behavior.
- Existing purchase/frontend/movement/Office/photo regressions: **55 passed,
  0 failed** ([archive-regression-tests.log](archive-regression-tests.log)).
- Authenticated upgrade browser scenario: **8 reported groups passed, 0 failed**
  ([archive-browser-tests.log](archive-browser-tests.log)), including the retained
  four-movement archive review and original responsive/theme/navigation scenarios.
- Main `npm.cmd test --prefix tests`: **67 tests, 8 movement database scenarios
  and 9 browser groups passed, 0 failed** ([archive-main-tests.log](archive-main-tests.log)).
- Final archive-focused recheck after regenerating preflight/verification SQL:
  **7 passed, 0 failed** ([archive-final-sql-tests.log](archive-final-sql-tests.log)).
- Catalog generated-artifact check, changed-JavaScript syntax, documentation links
  and `git diff --check` passed. Test counts overlap across runs; they are not a
  count of unique tests.

Commands from repository root:

```powershell
node --test --test-concurrency=1 tests/consumables-archive.test.cjs tests/consumables-upgrade.test.cjs tests/dashboard-view.test.cjs tests/global-search.test.cjs
node --test tests/consumables-archive.test.cjs
node --test --test-concurrency=1 tests/purchase-ledger.test.cjs tests/feature-frontend.test.cjs tests/movement-store.test.cjs tests/movement-sync.test.cjs tests/equipment-office.database.test.cjs tests/equipment-photos-compatibility.test.cjs
$env:MCPA_CHROME_NO_SANDBOX='1'
$env:MCPA_SKIP_SCREENSHOTS='1'
node tests/auth.browser.cjs --consumables-upgrade
npm.cmd test --prefix tests
node scripts/generate-consumables.cjs --check
git diff --check
```

All fixtures are isolated PGlite/browser data, with external HTTPS blocked. The
production UUID was reproduced only in local fixtures. PGlite serializes database
work, so the existing staging two-backend concurrency check remains required; no
claim is made that local tests exercised separate PostgreSQL backends. Live schema
customizations and intervening production changes must still pass the guarded SQL.
