# Engineer Consumables

Implemented on the active `feature/consumables-module-labels` branch, which already contains the integrated quantity/custody workflows and the read-RPC authorization correction. No database, production data, settings, or permissions were changed.

## Audit and scope

The existing Engineer **Consumables** navigation opens `outward-materials`, mounted by `js/integration.js`. The Engineer and Architect use `MCPAConsumablesRequesterV2`; Admin uses a separate reviewer/issuance mount. The original Engineer screen combined the request composer and all history in one long page and had no personal inventory.

The authoritative chain is:

`mcpa_wa_material_requests → mcpa_wa_material_items → mcpa_wa_material_issues → consumable_stock_movements`

An issue mapping is written atomically with its central stock deduction by `mcpa_wa_issue_consumables`. Issue mappings are immutable, `stock_movement_id` is unique, and retries use the existing operation receipt. Procurement `consumable_requests` are warehouse receipts and do not represent an engineer receiving materials.

**Existing limitation:** central stock movements use `kind = 'usage'` for outward issuance. This is not proof that the engineer consumed the material. The installed snapshot explicitly returns `confirmed_consumed_quantity: null`. There is no consumable engineer-usage, return, transfer, reversal, or adjustment ledger/workflow to incorporate. Equipment transfers/returns belong to a separate custody system and must not be attributed to consumables. This change does not invent consumption or grant stock editing to engineers.

## Interface

- Existing route and navigation retained, with Available Consumables, My Consumables, and My Requests tabs.
- Keyboard tab navigation uses Left/Right, Home and End; details receive focus and return it to their invoking button when closed.
- Request drafts and selected quantities survive tab changes, filters, and refreshes. Successful submissions open My Requests.
- Personal inventory has four summary cards, name/category/code/specification search, project/category/status filters, 20-row pagination, inline details and linked request/issuance history.
- Desktop table uses wrapped headings to keep actions within view; phones use labeled rows with every column preserved. Bright and dark workspace tokens are reused, and new styles are scoped to `.wa-engineer`.
- Loading, no assignment, empty inventory, no search results, saved request, transient failure/retry and authorization failure are handled. A transient failure labels retained records as previously loaded. Authorization/session failures clear the inventory.
- Existing integration event/focus/online refresh and 30-second polling are reused. Browsing inventory/catalog filters no longer marks a request draft as dirty. Actual unsaved request changes still receive the existing refresh protection.

## Balances and stock statuses

`MCPAConsumablesRequests.inventory(snapshot)` is a read-only projection of `mcpa_wa_consumables_snapshot`; nothing is stored as another inventory balance.

1. Keep only the authenticated Engineer/Architect's own `partial`/`issued` requests and actual issuance receipts. Pending, rejected and approved requests do not add inventory.
2. Group by **SKU ID + issued unit + project ID**. Identical labels, other engineers, other units and other sites cannot merge.
3. Sum confirmed receipt quantities from the linked stock movements, deduplicated by stock-movement ID (receipt ID fallback). Do not add cached request-line issued totals.
4. Subtract confirmed consumed totals once per request line if those totals exist. The installed backend has none: show **Not recorded** in Quantity Used and explain that available balance reflects recorded issues and does not verify remaining physical stock.
5. Perform additions at three-decimal precision. Never show a negative balance as valid stock: inconsistent consumption gives **Review required**.
6. Zero balance is Depleted; positive balance at or below the existing SKU catalog minimum is Low Stock; other positive balances are Available. Summary counts are explicitly per SKU/unit/project, matching the displayed rows. Archived SKUs remain in issue history; their catalog minimum is unavailable and no low-stock threshold is inferred beyond zero.
7. Last Updated is the latest issuance time (or request update if a confirmed consumption total is supplied). Dates display in Asia/Manila; quantities use the existing three-decimal formatter.

Warehouse purchases/restocks/adjustments change warehouse stock, not an engineer's issued balance. There are no supported consumable transfer/return/reversal transactions to omit or count twice; such movements need a separately authorized backend workflow before they can change personal balances.

## Authorization

The unchanged STABLE SECURITY DEFINER snapshot uses `wa_read_actor` and authenticated identity, not a caller-supplied engineer ID. It returns only the requester's requests for Engineer/Architect; nested RLS scopes request lines and issue mappings. Admin's existing visibility is unchanged. Inactive and unrelated roles are rejected. Project assignment is checked by the existing submit RPC.

The established ownership rule retains an engineer's own issued history after project reassignment/archival. History does not become the new engineer's personal inventory merely because they are assigned the project. No site ownership rules or RLS policies were relaxed.

## Files

Modified:

- `2-engr/modules/consumables-requests-v2/consumables-requests.js`: tabs, inventory, details, states and focus handling.
- `js/upgrades/consumables-requests/core.js`: personal-inventory projection and filtering.
- `js/upgrades/consumables-requests/styles.css`: scoped responsive Engineer styling.
- `js/integration.js`: distinguish Engineer browsing filters from request edits.
- `tests/auth.browser.cjs`, `tests/package.json`: focused browser mode and test command.

Added:

- `tests/consumables-requests-v2/inventory.test.cjs`
- `tests/consumables-requests-v2/inventory.database.test.cjs`
- `tests/consumables-requests-v2/inventory.browser-checks.cjs`
- `documentation/ENGINEER-CONSUMABLES.md`

## Validation

Run from `tests`:

```powershell
npm run test:engineer-consumables
```

All database checks use isolated PGlite/PostgreSQL fixtures. Browser transport runs the real authenticated RPC/RLS implementations against that fixture; external HTTPS is blocked. Nothing connects to production Supabase.

Coverage includes empty inventory; pending/rejected/approved exclusions; full and partial issues; idempotent retries; decimal balances; recorded-consumption arithmetic and invalid negative balances (unit fixtures only because consumption recording is unsupported); SKU/unit/site boundaries; actor isolation; nested RLS; forbidden engineer stock edits; inactive accounts; preserved archived history; unrelated warehouse adjustments; reload; request draft preservation; automatic issuance refresh while filtering; search/filter controls; details and request links; pagination; transient errors/retry; desktop/mobile/dark layouts; logout cleanup; and existing Admin/equipment custody integration.

Validation results: **42 unit/database/client tests passed**, plus the focused Engineer browser scenario and the existing combined integration browser scenario. JavaScript syntax checks, `git diff --check` and the scoped layout detector passed. Desktop and mobile screenshots were inspected in two bounded passes; Admin issuance remained functional. The browser suite also verifies recovery of a lost committed submission response without a duplicate request.

No new migration is required. The pre-existing integrated migrations through `202610250004_read_rpc_authorization.sql` must already be installed on a target to use its request/issuance workflows. They were applied only to disposable test databases here.
