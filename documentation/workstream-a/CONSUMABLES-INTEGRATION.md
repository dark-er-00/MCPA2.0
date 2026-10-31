# Consumables requests and accountability

These are mountable modules, not registered application routes. No shared entry point, navigation file, existing consumables module, or test runner was edited. The migration remains unapplied outside disposable test fixtures.

## Files and mounting

Load these assets once from the repository root (prefix paths with `../` from the Engineer entry point):

```html
<link rel="stylesheet" href="js/upgrades/consumables-requests/styles.css">
<script src="js/upgrades/consumables-requests/core.js"></script>
<script src="js/upgrades/consumables-requests/analytics.js"></script>
```

For the Engineer/Architect portal, load `2-engr/modules/consumables-requests-v2/consumables-requests.js`. Insert the matching HTML fragment into an owned route host, then:

```js
const requester = await MCPAConsumablesRequesterV2.mount({
  root: document.getElementById('screen-consumables-requests-v2'),
  client: window.supabaseClient
});
// On route revisit: await requester.refresh();
// On logout or removal: requester.destroy();
```

For Admin, load `1-admin/modules/consumables-usage-v2/consumables-usage.js` and the matching fragment, then:

```js
const usage = await MCPAConsumablesUsageV2.mount({
  root: document.getElementById('screen-consumables-usage-v2'),
  client: window.supabaseClient
});
// On route revisit: await usage.refresh();
// On logout or removal: usage.destroy();
```

The client must already have an authenticated Supabase session. Neither module creates a client or uses a service key. Load the existing workspace theme first. The scoped `.wa-cons` CSS inherits existing light/dark tokens. Mount only one copy per root. Destroy mounts on logout/account switch to clear snapshots and handlers; mount again with the current session. Call refresh on route entry and after relevant external stock changes. No polling, Realtime subscription, shared navigation registration, or existing purchase UI changes are installed here.

Final integration must add two route/menu entries under the correct role permissions, load the owned HTML/JS/CSS, register the appropriate mount/refresh/destroy lifecycle, and verify both entry points. These steps require shared-file edits and are deliberately deferred. Existing procurement/restocking continues through the existing `consumable_requests` workflow.

## Transactions and quantities

`mcpa_wa_consumables_snapshot()` returns the authenticated profile, active existing SKU catalog, active assigned sites, and authorized request history. Engineers and Architects can submit only for their assigned active project/site. Admin reviews requests and issues materials. New workflow permissions do not grant Secretary access or remove established Secretary restocking permissions.

The requester submits up to 100 distinct catalog SKUs with the catalog unit and positive quantities below 1,000,000,000, with at most three decimal places. It does not convert boxes to pieces or invent a unit. The interface limits purpose and notes to 1,000 characters; the database supports up to 2,000. Requests may exceed currently available consumable stock so future supply can be reviewed. Approval is bounded by requested quantities; issuance is bounded by both the approved remainder and the current stock.

Admin review supplies each line once, including zero for an unapproved line. At least one approved quantity must be positive; rejection requires a reason. Approval does not reserve or deduct consumables. Each issuance supplies only the positive quantities handed over now. The server records the issuance date, actor, recipient/requester, site, and existing stock movement UUID in one transaction. The UI sends `p_issued_at: null` to use server time, avoiding a changing timestamp on retry. Explicit timestamps remain available through the documented RPC contract.

Current stock is always `consumables.current_stock`. Issuance quantity comes from the linked immutable `consumable_stock_movements.quantity_change`; the new issue table provides accountability links and does not duplicate stock quantities. New outward requests are separate from historical procurement requests. Neither historical restock receipts nor purchase records are rewritten. The established stock movement kind is `usage`; within this workflow it means an issuance deduction, not proof of consumption. No confirmed-consumption records or totals are fabricated.

Every mutation uses a UUID operation key and exact payload binding. The UI blocks repeat clicks while saving. If a response is lost, it retains the original operation and payload in memory and, when available, per-actor session storage. After reload, use **Retry interrupted submission** or **Recover interrupted action** to recover the original result. A different payload cannot replace an uncertain action. Confirmed PostgreSQL validation/permission/serialization failures clear the recovery lock because their transaction rolled back. If browser storage is unavailable, recovery survives only within the current mount; keep the operation key when integrating another client. Server transaction safety does not depend on browser storage.

## Analytics semantics

The Admin module derives analytics from the authorized snapshot, not from local sample data. It displays requested/approved/issued quantities per SKU and unit; most frequently issued ranks the number of issuance-line transactions, rather than summing incomparable units. Engineer, site and daily trend tables retain SKU and unit separation.

Date filters use Manila calendar days and a half-open interval from the start date through the end of the selected end date. Requested and approved totals use the request's creation date. Approved is the current approved quantity for that request cohort, not a historical as-of balance. Issued totals use the actual issuance timestamp, including issues against older requests. Current low-stock information is independent of the historical period. The selected requester, project and SKU filters constrain accountability records; stock is a central current inventory balance, not a site-specific or requester-owned stock balance.

The separate Admin-only analytics RPC supports the same half-open timestamp contract. The UI currently loads one complete authorized snapshot and filters it locally, retaining all headers so older requests can explain current issues. CSV summary and transaction downloads preserve individual units, ledger IDs, attribution and dates and escape spreadsheet formulas. Transaction drill-down opens the original request and its immutable linked stock movements.

Legacy manual `usage` rows without Workstream A request/person/site links are excluded from attributed analytics. They remain in the existing authoritative ledger. They cannot be safely assigned to an Engineer or treated as confirmed consumption. A future reviewed legacy reconciliation can annotate them without inventing history.

## Limits and follow-up

- The current snapshot and client analytics are unpaginated. Review dataset size and add server pagination before large deployments; do not silently truncate history.
- Refresh is explicit; stock can change after display. PostgreSQL rechecks balances, role, status and remaining quantities on every write. A failed refresh disables Admin mutations until fresh stock/request data is loaded.
- No confirmed-consumption workflow, delivery acknowledgement, returns or reversal UI is introduced. Those require a separately agreed audit contract. Issuances cannot be edited/deleted through this module.
- Partial fulfillment is measured against approved quantities. A line approved for zero does not prevent an otherwise complete request from reaching `issued`.
- Full application routing, existing-module compatibility with Workstream B changes, and production Supabase deployment remain final integration tasks. Isolated mounts do not mean this feature is live.

See `DATABASE-CONTRACT.md`, `QUANTITY-UI.md`, `IMPORT-INTEGRATION.md`, and `IMPLEMENTATION-REPORT.md` for the remaining interfaces, deployment order and exact verification results.
