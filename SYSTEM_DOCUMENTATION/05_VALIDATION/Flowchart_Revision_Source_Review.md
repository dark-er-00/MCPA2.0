# Revised flowcharts — source review

Reviewed 20 October 2026 against repository 071ae16. All source and SQL inspection was read-only. This records implemented definitions, not proof of live production installation.

The eight existing workflow sets were all reviewed and retained. The revised set separates combined workflows, resolves incomplete error branches, replaces action-shaped terminators, applies real labeled decisions, and adds meaningful paired continuations. It also documents related source-defined recovery, cancellation, ledger and demo paths.

| Workflow | Source | Location / anchor | Verified behavior |
| --- | --- | --- | --- |
| 01 | [js/auth.js](../../js/auth.js) | 72–106, 136–155 | Sign-in clears password on success; session restore calls mcpa_my_profile and requires active supported role. Secretary enters consumables; other supported roles enter dashboard. Callback setup takes precedence over ordinary restoration. |
| 02 | [1-admin/modules/masterlist/masterlist.js](../../1-admin/modules/masterlist/masterlist.js) | 620–670 | Active Admin, stable asset identity, inventoryOffice before photo preparation, then explicit AVAILABLE / Office insert. Verify returned IDs. Saved insert and failed inventory refresh are distinct outcomes. |
| 02 | [js/equipment-photos.js](../../js/equipment-photos.js) | 8–43 | Admin identity, MIME/signature and 1-byte–5-MiB checks; private immutable upload with upsert false; staged retry reuse. |
| 02,07 | [js/equipment-tracking.js](../../js/equipment-tracking.js) | 23–30 | inventoryOffice reads the configured destination RPC and fails on missing/invalid Office. |
| 03–09 | [supabase/migrations/202610060002_recipient_identity.sql](../../supabase/migrations/202610060002_recipient_identity.sql) | 28–253, 260 onward | Atomic lifecycle engine: positive whole-record quantities, locks, Pending versus Approved reservations, release without custody change, inspection outcomes, return/report/repair/recovery states. Authenticated outer wrapper requires the named field receiver for receipt. |
| 03,05 | [supabase/migrations/202610100001_engineer_portal.sql](../../supabase/migrations/202610100001_engineer_portal.sql) | mcpa_create_receiving_token; mcpa_resolve_receiving_token; movement wrapper | Own active site assignment; active named field receiver; short-lived hashed token; manual receiver path remains supported; token resolution itself changes no custody. |
| 03 | [supabase/migrations/202610120003_optional_request_purpose.sql](../../supabase/migrations/202610120003_optional_request_purpose.sql) | createRequest validation wrapper | Equipment request purpose is optional (maximum 2,000 characters); no obsolete required-purpose rule was carried into the revision. |
| 03–11 | [js/movement-cloud.js](../../js/movement-cloud.js) | 49–78, 126–151 | Stable operation UUID per submitted action/values; backend permission and validation authority. Successful save plus refresh failure marks state stale and blocks further mutations until reload. |
| 03–11 | [js/permissions.js](../../js/permissions.js) | action role definitions | Admin approve/reject/release/resolve cases; field request/transfer/receipt/return/report; Handler dispatch scope; no Handler named receipt. |
| 07 | [supabase/migrations/202610120002_office_returns.sql](../../supabase/migrations/202610120002_office_returns.sql) | createReturn wrapper and destination helper | Pinned active unique Office, forged destination rejection, saved operation destination reuse. Good and physically returned Damaged items clear personal holder; Missing retains source holder/site. No separate Admin return acceptance. |
| 10,11 | [1-admin/modules/consumables/setup.sql](../../1-admin/modules/consumables/setup.sql) | 117–181 | Pending/partial uniqueness, request does not change stock, receipt validates outstanding quantity and increments stock with receipt history. Cancellation preserves already received stock. |
| 10,11 | [supabase/migrations/202610040001_authenticated_access.sql](../../supabase/migrations/202610040001_authenticated_access.sql) | 238–258 | Authenticated wrappers enforce Admin/Secretary consumables authority and trusted actor name; prototype anon grants in the older base setup are not the final authority. |
| 11 | [supabase/migrations/202610100004_movement_cancellation.sql](../../supabase/migrations/202610100004_movement_cancellation.sql) | 63–87, 104–233, 274 onward | Server allowedActions and original field ownership. Required reason and confirmation; damage refusal needs complete inspections and at least one Damaged/declined item. Entire transfer Refused with custody/status/reservations unchanged; original sender may reopen. |
| 12 | [js/auth.js](../../js/auth.js) | 11–53, 96–114, 138–155 | Recovery/invite session guards, single new-password field with HTML minlength 12, updateUser then sign-out and login confirmation. Invalid email uses field validity; reset response is generic. No invented confirmation-password field. |
| 13 | [supabase/migrations/202610100005_purchase_ledger.sql](../../supabase/migrations/202610100005_purchase_ledger.sql) | 52–96 | Admin/Secretary ledger save, 1–100 lines, three-decimal quantities and two-decimal unit prices, computed totals, optional request/private receipt, version and idempotency checks. Ledger does not receive stock. |
| 14 | [js/auth.js](../../js/auth.js) | 115–129 | Explicit Admin/Engineer/Architect demo identities; browser-only mode with production-only routes blocked. |
| 14 | [js/movement-cloud.js](../../js/movement-cloud.js) | 25–54, 95–106 | Demo uses local MovementDemoStore; switching between company and demo workspaces is explicitly isolated. |

## Interpretation boundaries

- “Field” means Engineer or Architect unless Tool Handler is explicitly named. “Missing” is the displayed inspection condition; the SQL payload uses 'lost' for that classification.
- Validation diamonds summarize related input, identity, lock and current-state checks from the cited code. Later commit checks still capture transaction failures and concurrent changes.
- Multi-item classification is expanded for clarity but remains within one atomic receipt/return action. Damage cases and missing cases are not separately committed by visiting a different diagram page.
- Receiving a transfer is restricted to its named active field receiver. Older private-engine wording mentioning Admin is superseded by the authenticated wrapper in the same migration.
- Off-page references remain inside their named workflow/PDF. Cross-workflow relationships (for example, release awaiting receipt or repair following damaged recovery) are described as state handoffs, rather than unmatched off-page symbols.
- SQL definitions include optional capabilities. Cancellation availability, configured Office, Storage buckets/policies and deployed migration order need installation verification; no production session or database was used here.

## Visual and export review

All 37 native PDF page renders were inspected on five contact sheets. Header/page references, shape meaning, branch labels, text fit and continuation placement were checked. The source model and automated validators additionally check every node, edge and continuation pair. Native draw.io application interaction was not used; editable uncompressed XML, page IDs, labels, geometry and edge endpoints were validated directly.

See [Flowchart_Revision_Validation.json](Flowchart_Revision_Validation.json) for export checks and [Revised_Flowcharts_Index.md](../02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/Revised_Flowcharts_Index.md) for the complete deliverable list.
