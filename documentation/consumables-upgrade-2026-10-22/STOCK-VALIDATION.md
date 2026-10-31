# Stock and identity design

Archive compatibility: `archived_at IS NULL` defines active inventory. The
202610220002 migration adds guards without replacing stock RPCs or changing
balances. An archived row rejects all quantity/metadata updates until the
Admin-only versioned restoration RPC explicitly reactivates it. New requests and
movement inserts lock/check the item; new purchase links also check archive state.
Existing purchase links remain editable for historical procurement records.
Archival/restoration records separate immutable lifecycle events, never extra
stock movements. Active natural SKU identity remains unique through a partial
unique index; codes and catalog keys remain globally unique, including archives.
The importer excludes archives from candidate/match checks and refuses to silently
reimport a reserved archived catalog identity. See ARCHIVE-COMPATIBILITY.md.

The existing tables use `numeric(12,3)`, not integer stock. Keeping three decimal
places preserves kg quantities and existing histories. UI bounds are 0 through
999,999,999.999, with a 0.001 step; positive-only operations use a 0.001 minimum.
Blank, non-finite, negative, overflow and excessive-precision RPC inputs fail.
Direct numeric column assignments have PostgreSQL's existing numeric typmod
rounding semantics; browser roles cannot directly assign those columns.

The existing database-generated `stock_status` is authoritative: zero is `out`,
positive stock below minimum is `low`, and equal/above minimum is `ok`. Existing
reorder thresholds are preserved. New catalog stock is 100 and new minimum is 20.

The migration checks historical invalid stock and movements before changing the
schema. New named CHECK constraints enforce finite non-negative balances and
minimums below one billion, and valid prior/final movement balances. PostgreSQL
numeric `NaN` compares above finite values, so the upper bound also rejects it;
infinities fail bounds/type limits. Required values retain NOT NULL constraints.
The preflight reports invalid records; migration failure never silently repairs them.

The stock RPCs retain row locks, expected versions and stable operation UUIDs.
Usage locks the SKU before checking its version and available balance. Receiving
locks the SKU before its request and checks the outstanding quantity. The stock
write, request receipt update and history insert share one transaction. Errors
abort all changes. Two deductions cannot read an unlocked balance and independently
overwrite it; only the lock holder can proceed. Stale stock is rejected. Frontend
validation does not replace these database protections.

Opening, usage, restock, physical-count correction and receipt entries receive a
generated previous balance (`balance_after - quantity_change`). The trigger gets
the authorized actor from the existing private identity function, checks the
Admin/Secretary role, and stores profile ID/name plus the existing timestamp and
request link. SQL-owner imports carry an explicit maintenance/import actor label,
with no invented user ID. Legacy actors stay unknown. Existing history is retained;
the new statement trigger rejects updates, deletes and truncation of the ledger.

Public writes remain narrow SECURITY DEFINER RPCs with empty search paths,
qualified names, role checks and authenticated-only execution. Private helpers
are revoked from PUBLIC/anon/authenticated. RLS is retained; table writes remain
denied to browser roles. Categories expose only authorized reads. The old six-argument
save wrapper now delegates to the metadata-aware overload and cannot create an
uncategorized record. New records require a recognized category; old null category
records remain available for deliberate classification, without forced inference.

SKU identity is normalized name/specification/unit. Name-only uniqueness is removed,
and separate unique indexes cover SKU identity, item code and stable import key.
An advisory transaction lock serializes automatic code allocation and catalog imports.
The import also locks the inventory table while reconciling. Ordinary stock
operations continue to use their existing row locks. Collisions preserve existing
codes and allocate above the greatest existing/reserved catalog suffix for that prefix.
The import key remains stable even if a reviewed code collision requires another code.

Request inserts snapshot SKU/specification alongside the existing name/unit.
Historical requests are not rewritten. Both Material Requests and the optional
Purchases picker display that snapshot. Stock remains linked to the consumable ID;
purchases remain linked to the request ID and do not themselves receive stock.

The browser preserves failed form input and keeps the dialog open. An in-flight
save guard disables repeated submission; stable UUIDs allow safe response-loss
retries. A committed save whose follow-up read fails shows that state explicitly
and requires refresh. Category/search/status filters operate only on the loaded
snapshot and never mutate stock. The Dashboard uses the same generated status
values and existing watcher, timer and cleanup; a read error shows unavailable
status instead of inventing a healthy count.
