# Manual deployment and recovery

Prepared 22 October 2026, Asia/Manila. **Nothing in this folder was applied to
production.** Keep the code and SQL together as a reviewed release.

## Order

**23 October receipt prerequisite:** the user reports that Equipment Photos is
deployed but receipt storage and the purchase ledger are absent. Before the
Consumables schema steps below, follow the
[receipt storage dependency plan](../purchase-receipts-2026-10-23/DEPLOYMENT.md):
read-only receipt preflight → `202610230001_purchase_receipts_compatibility.sql` →
receipt verification/staging service checks → `202610100005_purchase_ledger.sql`.
The ledger must exist before Consumables 001/002 to install their purchase snapshot
and archive-link integration. This is an explicit manual dependency order, not
filename chronology. **Do not run `202610100003_feature_storage.sql` or rerun the
already-deployed Equipment Photo migration.** See the migration gate in
`supabase/migrations/README.md`; do not invent migration-history entries.

1. Back up the existing database and export the Consumables tables, purchase
   ledger/history and schema definitions. Record the current frontend revision.
   Schedule a short Material Requests/Purchases maintenance window so that old
   forms do not submit while the new required category fields are introduced.
2. Run **only** [01-preflight.sql](01-preflight.sql). Save every result set.
   Confirm the live schema matches the existing Consumables bootstrap and
   authentication migration. Review deployed stock RPC definitions, RLS policies,
   grants, numeric precision/scale, indexes and migration ledger. The new migration
   requires the existing private identity and adjustment functions; it deliberately
   fails when those prerequisites or historical stock validity checks fail.
3. Review the per-SKU reconciliation rows and summary counts. The user-reported live
   preflight found 126 source SKUs, 0 exact matches, 126 proposed inserts and 2 review
   flags. Both flags refer to the one confirmed sample/test `Cutting Disc`, UUID
   `c3f58442-dc99-4466-8590-16642abdb7bc`, 24 stock, minimum 120, zero requests and
   four stock movements. This agent did not access the live database. Do not classify
   this generic sample as either the 4-inch or 7-inch catalog SKU.
   Exact identity is normalized name + specification + normalized inventory unit.
   Normalize only case/whitespace and documented unit synonyms; fractions,
   dimensions and specifications retain their meaning. Codes do not determine
   equivalence to an existing production SKU.
4. For this confirmed sample, use the separate guarded archive step below. Resolve
   any additional ambiguous records explicitly. Examples: `Cutting Disc` without a size,
   an embedded size in the name, `Silicone Sealant / 300ml` versus the source's
   `300ml Cartridge`, unsupported specifications, conflicting categories, or
   identical specifications with different units. Confirm the physical SKU, then
   prepare reviewed metadata corrections to the **same ID**. Never delete, merge,
   convert units, guess a size, or reset its stock. Retain all requests, purchases
   and history. If one legacy row combines several sizes, reconcile that physical
   inventory separately before importing; the script cannot allocate a mixed
   balance correctly. Preflight lists candidates even when another exact match exists.
5. In a staging copy, run these schema migrations in order:
   - `supabase/migrations/202610220000_consumable_categories.sql`
   - `supabase/migrations/202610220001_consumables_skus.sql`
   - `supabase/migrations/202610220002_consumables_archive.sql`
   Each file has its own transaction. These are normal once-only migrations;
   use the migration ledger, not repeated direct execution. The second file is
   transaction-safe if any constraint or prerequisite fails. The first migration's
   category table may already have committed when the second fails; it contains
   only category definitions, and no stock is changed by any of the three migrations.
6. Manually execute [02-archive-sample.sql](02-archive-sample.sql) **after all three
   schema migrations**. It requires exactly the reviewed UUID, name `Cutting Disc`,
   unit `pieces`, stock 24, minimum 120, empty specification (NULL or the SKU
   migration's empty default), null category/code/catalog key, no requests and four
   movements. It obtains locks before checking/updating, archives only that UUID,
   verifies all four movements are byte-for-byte unchanged, and is safe to rerun
   in its expected archived state. Any unexpected state aborts the transaction.
   It changes only archive metadata, version and updated_at. It never changes
   stock or minimum, inserts a stock movement, or deletes anything.
7. Run [01-preflight.sql](01-preflight.sql) **again before seeding**. Expected for
   the reported production snapshot: 126 source SKUs, **0 matches, 126 proposed
   inserts, 0 review flags**; the archived sample still appears in the full record
   listing. Stop if any active ambiguities remain. Apply reviewed metadata
   corrections for any other records using the same IDs; never reset balances.
   Classify other legacy inventory
   through Add/Edit after frontend deployment. Legacy null categories/codes remain
   visible in All Categories; changing quantity does not require inventing metadata.
8. Inspect [03-catalog-seed.sql](03-catalog-seed.sql). Opening stock is fixed at 100
   for **new** SKUs. The temporary settings row configures only their minimum
   threshold (20 by default). Existing balances and thresholds are never changed.
   Execute it in staging. Any unresolved ambiguity aborts the **whole** import.
   Exact existing matches receive missing category/code/catalog identity only.
   They retain IDs, units, names, specifications, balances, minimums and history.
9. Run [04-verification.sql](04-verification.sql). Expect twelve category rows,
   126 catalog identities, 60 distinct catalog family names, no duplicate codes,
   and no invalid balances. Newly created catalog opening entries must be 100;
   existing matching stock may legitimately differ. Export actual insert/match
   notices and compare existing requests/purchases/history with the backup.
   Expect **126 active catalog records plus one archived sample (127 total)**,
   0 active low-stock warnings at the initial 100/20 defaults, and the sample still
   at 24/120 with exactly four original movements. CUT-001 and CUT-002 must be the
   new Metal Cutting Disc 4-inch/7-inch records, each at 100; neither uses the
   archived UUID. Verify the separate archive event, not an extra stock movement.
   Re-run the seed in staging and verify that no rows or balances change.
10. Deploy the prepared frontend in staging. Verify active Admin and Secretary
   access and denial for other roles, Add/Edit, zero and fractional quantities,
   usage, corrections, partial/full receiving, failed-save rollback, retry IDs,
   immutable audit and the Purchases request picker. Exercise the two-session
   concurrency check below in staging PostgreSQL. Test both themes and target widths.
    Verify the sample appears only under **Stock status → Archived history**, with
    History available and stock/edit/request actions absent. Its original stock
    history remains readable. Normal inventory, search, Dashboard warnings and new
    request/purchase choices exclude archived stock.
11. After explicit deployment approval, repeat the approved steps against production:
    backup and initial preflight → the three pending schema migrations in order →
    guarded sample archival → repeat preflight → catalog seed → verification →
    coordinated frontend release → authenticated smoke
    checks and maintenance-window exit. This implementation does **not** grant
    deployment approval. Do not rerun historical `setup.sql` or auth migrations;
    their old grants/function-moving steps are bootstrap behavior.
    Use the migration ledger: **skip already successfully applied migrations**;
    never rerun 000/001 simply to add archival. Migration 002 supports their
    already-installed state. If any live prerequisite/custom schema differs,
    stop and review the SQL; do not improvise a production repair.
12. Check the next existing Dashboard/Consumables refresh. The Dashboard counts
    `stock_status IN ('out','low')` only where `archived_at IS NULL`. At zero items the
    warning is absent. If Realtime does not publish Consumables, the existing
    30-second/focus refresh is sufficient; no new publication is required.

## True two-session concurrency check (staging only)

PGlite uses one database connection. The automated tests submit both operations
concurrently and verify a single commit, stale-version rejection and one audit
entry; this does not reproduce two PostgreSQL backends waiting on a row lock.

Use an approved, disposable staging SKU opened at **10** through the public save
RPC. Record its ID and current version, and use verified active Admin/Secretary
sessions with their normal auth identity. Never use actual production inventory.

- Session A: `BEGIN`; call `public.consumables_adjust_stock` with a unique operation
  UUID, that SKU/version, `usage`, `7`, and a staging test reason. Keep the
  transaction open briefly before `COMMIT`.
- While A holds the lock, Session B: begin a transaction and call the same RPC for
  the same SKU/version with a different operation UUID and quantity `6`.
- B must wait for A's row lock and then fail with `40001` after A commits because
  the version changed. Roll back B. Final stock must be **3**, with one usage entry
  of **-7**, previous balance 10, new balance 3 and A's actor. A retry of B using
  the new version must fail for insufficient stock and create no usage entry.
- Repeat with A rolling back. B may then succeed, producing stock **4** and one
  usage entry of **-6**. Verify A's rolled-back adjustment has no history.
- Repeat the release order if desired: whichever deduction commits first is valid;
  the incompatible second deduction cannot commit. Do not disable role checks.

The shipped private adjustment function already uses `SELECT ... FOR UPDATE`
before checking version and balance; receiving locks the item before its request.
The upgrade preserves those operations and strengthens their table constraints.

## Existing balances and optional adjustments

The import never resets matching stock. [05-existing-stock-review.sql](05-existing-stock-review.sql)
is a **read-only proposal**, not a deployment step. Review the physical count and
approve each correction independently. Approved changes must use the existing
correction RPC with a stable operation ID, current version and the reviewed reason;
the new audit trigger records the verified actor and all quantities. No executable
bulk stock-reset script is supplied.

## Explicit restoration (separate approval, never part of import)

Archived stock rejects new usage, restock, correction, metadata edits, requests,
receipt writes and new purchase links. Existing purchase links and historical
records remain readable. Open material requests must be resolved before archival.
No archive/restore operation creates a stock movement or changes any quantity.

Only a verified **active Admin** may call
`public.consumables_restore_item(p_id uuid, p_version integer, p_reason text)`.
Use a normal authenticated Admin session, the current archived row version and a
specific reviewed reason. Secretary/Engineer/Tool Handler/anonymous/inactive
accounts cannot restore. There is deliberately no automatic restoration button
or stock-operation bypass. Restoration records a separate immutable lifecycle
event with verified actor/reason; existing stock/audit rows stay intact. Active
SKU uniqueness may reject restoration of a now-duplicated identity, rolling back
the restoration and its event. Resolve that conflict separately, without deletion.
Restoring this generic sample would reintroduce its catalog ambiguity; do not
restore it to complete the import. Archived catalog identities are never silently
reimported or reactivated by the seed.

## Rollback / recovery

- A failed schema transaction leaves that file's inventory changes unapplied. A
  failed seed rolls back its inserted items, metadata enrichment and opening entries.
  Correct the reported issue and re-run the seed; its stable catalog keys make it
  idempotent. Do not use a reset, table wipe or cascade deletion.
- After successful schema deployment, favor a forward fix. Reverting to the old
  frontend can leave old Add forms unable to supply the required category. Keep
  Material Requests in maintenance until the compatible frontend is restored.
- Do not restore the name-only unique index after importing variants. It cannot
  represent several sizes with the same item name. Do not rerun bootstrap to
  replace secured functions or restore anonymous grants.
- Never delete imported rows once referenced by requests/purchases/history.
  Preserve opening entries and use reviewed correcting transactions for balances.
- If a complete database restore is necessary, use the reviewed predeployment
  backup and coordinate recovery of **all** dependent request/purchase/audit records
  and intervening changes. No destructive rollback SQL is provided.
- Retain old authenticated RPCs, constraints, history and role policies during
  recovery. The private legacy helper is not a supported bypass for category rules.
- To reverse an archival, use the explicit Admin restoration workflow after review.
  Do not clear archived_at directly, drop the archive guards, delete lifecycle
  events, or restore stock quantities from an old snapshot. The sample's current
  stock and four movements were never changed by archival.

## Compatibility unknowns

The sample identity/counts above are user-reported preflight results. Deployed
migration state, custom triggers/indexes, unexpected policies,
PostgreSQL version, publication configuration and existing SKU conventions were
not inspected remotely. Preflight and staging review must settle those details.
The optional purchase snapshot extension expects the repository's purchase ledger
schema when that RPC is installed; absence of the ledger is supported. Do not
apply the migration over an incompatible custom ledger without adapting/reviewing it.
If Purchases is used, install its existing ledger migration before migration 002.
Installing a new ledger after archive compatibility would require a separately
reviewed follow-up migration to install its archive-link guard/snapshot flag; do
not rerun the once-only archive migration or leave that integration unguarded.
