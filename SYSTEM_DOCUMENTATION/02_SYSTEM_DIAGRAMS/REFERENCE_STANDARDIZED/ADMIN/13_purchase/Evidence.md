# Admin - Purchases / Recorded Purchase Ledger

- Purchases is a record-only ledger. Delivery and consumable stock changes occur only in Material Requests.
- No purchase delete action is implemented. Previous receipt is retained unless a replacement is uploaded.
- A purchase can link one existing Material Request; delivery status is read from that linked request.

## Source evidence

- [1-admin/modules/purchases/purchases.js:20](../../../../../1-admin/modules/purchases/purchases.js#L20): Date/search filter and mcpa_purchase_snapshot
- [1-admin/modules/purchases/purchases.js:48](../../../../../1-admin/modules/purchases/purchases.js#L48): Create/edit form, line items, details and history
- [1-admin/modules/purchases/purchases.js:58](../../../../../1-admin/modules/purchases/purchases.js#L58): Private receipt staging, operation ID and save RPC
- [1-admin/modules/purchases/purchases.js:93](../../../../../1-admin/modules/purchases/purchases.js#L93): Receipt signed URL and errors
- [supabase/migrations/202610100005_purchase_ledger.sql:53](../../../../../supabase/migrations/202610100005_purchase_ledger.sql#L53): Authoritative record, items, amount, receipt and concurrency validation
