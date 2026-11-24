# MCPA Admin UI review

Local working tree based on `main` at `e1641c4`. The pre-existing edit to `public/healthz.php` was preserved. All preview records are synthetic and reset on server restart.

## Open the review

From the repository root with Node.js 22 or later, run:

```powershell
npm.cmd run preview:admin
```

The preview binds to loopback on port 4196 by default. It serves the current public application with a local SDK, an in-memory fixture and a same-origin content security policy. No database setup or credentials are required.

| Open | Existing route |
| --- | --- |
| [Chart overview](http://127.0.0.1:4196/index.html?fixture=admin#outward-materials) | `outward-materials` |
| [Consumable ranking detail](http://127.0.0.1:4196/index.html?fixture=admin#outward-materials?view=ranking) | `outward-materials?view=ranking` |
| [Requests](http://127.0.0.1:4196/index.html?fixture=admin#outward-materials?view=requests) | `outward-materials?view=requests` |
| [History](http://127.0.0.1:4196/index.html?fixture=admin#outward-materials?view=history) | `outward-materials?view=history` |
| [Equipment Inventory](http://127.0.0.1:4196/index.html?fixture=admin#masterlist?status=missing) | `masterlist?status=missing` |
| [Returned equipment dialog](http://127.0.0.1:4196/index.html?fixture=admin#return?record=SYN-RETURN-01) | `return?record=…` |

The local gallery at `tests/artifacts/admin-review/index.html` has nine matched before/after pairs. Seven are 1440 × 900 desktop views, with additional 820 × 1000 tablet and 390 × 844 mobile captures. The before images use the original affected modules at `e1641c4` and the same synthetic fixture. Generated galleries are local review artifacts.

## Dashboard and report semantics

The Admin overview initially renders zero detailed tables. Seven View More actions open their corresponding tables. The report views carry the applied dates, requester, site, consumable and trend period in the existing hash router. Ranking drill-down also carries the consumable ID and unit. Details paginate at 25 rows and retain request references, identities, units and stock movement links by ID. Requests uses the existing review and issue RPCs and interrupted-operation recovery. History displays individual issued movements.

| Surface | Metric and source |
| --- | --- |
| Request Trend | Count of submitted requests from `mcpa_wa_consumables_snapshot.requests[].created_at`. A multiple-item request contributes once. The default is 30 days. A selected through-date anchors the window. Manila buckets are hourly for a single day, daily for short periods and monthly for longer periods. |
| Projects | Counts the same trend requests by `site_id`. Missing links form an explicit “No linked project/site” group. |
| Current low stock | Active catalog items with recorded `current_stock <= minimum_stock`. A selected SKU narrows the list. Historical dates, sites and requesters do not change a current balance. |
| Usage Analytics | Submitted requests grouped by current `status`. The drill-down lists the corresponding requests. |
| Most Frequently Issued Consumables | Ranks SKU/unit pairs by the number of distinct issuance transactions. Detail retains requested, approved and issued quantities. |
| Issued by Project/Site | Counts issuance transactions by recorded request site. The expanded table separates quantities for each consumable and unit. |
| Daily Issuance Trends | Shows transaction counts on the latest five active Manila issuance days in chronological order. View More includes every matching day with quantities and units. |
| History and CSV | Issuance dates use `issues[].issued_at`. The existing report deduplicates by `stock_movement_id` with `issue.id` as fallback. Both CSVs use the same filtered report and retain their original columns. Empty and stale exports display a message. |

The four report cards retain the Premium V2 tokens and switch from four to two to one column as space narrows. Counts replace the reference images’ sample percentages and marketing labels. The standalone Engineer/Architect graph was removed. Requester identity remains available in filters, request review, historical transactions and CSVs.

## Equipment Inventory and Returns

All five equipment filters share one KPI row. The row now sets its section spacing using the existing spacing scale. The repair and missing views lead into Tool Movement. The other three filters lead into the inventory list.

Return inspection displays original `submit_return` photos as read-only thumbnails with signed, enlarged views. Earlier inspection evidence remains separately available. An empty submission shows a text message. Admin inspection submits the batch ID, decisions, physical-receipt flags and notes. The Engineer/Architect return composer retains its photo submission path.

The checked-in custody RPC restricts `submit_return` staging to the operational custodian. Attachment checks the uploader, phase, target, asset and previous attachment. The storage policies fence object updates, and the integration retention trigger protects completed objects. The RPC still supports adding **distinct inspection-phase evidence** for other clients. The Admin inspection dialog no longer submits such attachments. The checked-in definitions support original-evidence immutability without a new migration. [Custody SQL](../supabase/migrations/202610250002_custody_lifecycle.sql) · [Storage retention SQL](../supabase/migrations/202610250003_quantity_custody_integration.sql)

## Validation

47 focused Node tests passed across consumables analytics, requester inventory, Engineer/Architect parity and Premium V2 contracts. An isolated Chrome suite exercised all seven detail views, keyboard chart access, back navigation, filtered rankings, approval, issuance, CSV contents, pagination, current low stock, loading and read errors. It also exercised photo enlargement, successful Admin inspection, a new synthetic Architect return, and the no-evidence state. Inventory spacing and document overflow checks covered all five status filters at 1440, 820 and 390 pixels in both themes. The browser suite checked for runtime exceptions, console errors and external network attempts.

```powershell
node --test tests/premium-v2/admin-refinements.test.cjs tests/consumables-requests-v2/frontend.test.cjs tests/consumables-requests-v2/inventory.test.cjs tests/engineer-architect-parity.test.cjs tests/premium-v2/contracts.test.cjs
node tests/premium-v2/admin-refinements.browser.cjs
```

The browser suite runs its own synthetic server on port 4296 and uses the repository’s Windows Chrome driver. The SQL regression now also compares the original linked evidence and storage object before and after a normal Admin inspection. Its harness executes migrations during setup, so it was left unexecuted under this task’s SQL restriction. Installed policies and deployed storage behavior were not verified. No Production or Staging data was accessed.

The subsequent Engineer/Architect review ran the retention regression in disposable PGlite. For the combined feature-branch publication, the migration restriction prevents a fresh run of that regression. Its result on the final staged state and deployed database/storage enforcement are **unverified**.

## Changed files

| Area | Files |
| --- | --- |
| Admin dashboard | `public/app/portals/admin/consumables-usage/consumables-usage.js`, `charts.js`, `consumables-usage.css` in the same directory |
| Reporting | `public/app/features/consumables-requests/analytics.js`, `core.js` |
| Routing and loading | `public/app/core/navigation.js`, `public/app/core/integration.js`, `public/index.html` |
| Inventory | `public/app/portals/admin/masterlist/masterlist.css` |
| Returns | `public/app/portals/admin/return-inspection/return-inspection.mjs`, `public/app/features/custody-lifecycle/ui.mjs`, `public/app/features/custody-lifecycle/module.css` |
| Isolated preview | `package.json`, `tests/premium-v2/preview.cjs`, `tests/premium-v2/engineer-assignment-preview-fixture.cjs` |
| Focused validation | `tests/premium-v2/admin-refinements.test.cjs`, `tests/premium-v2/admin-refinements.browser.cjs`, `tests/integration-quantity-custody-v2/database.test.cjs` |
| Existing test entry points | `tests/functionality-audit-v2/browser-checks.cjs`, `tests/integration-quantity-custody-v2/browser-checks.cjs`, `tests/quantity-requests-v2/frontend.browser.cjs` |
| Local review | This report and the gallery under `tests/artifacts/admin-review/` |
