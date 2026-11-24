# Engineer and Architect UI acceptance review

The local changes apply to both field roles on the working tree based on `e1641c4`. Each account retains its own assignments, custody, requests and movement history.

## Review links

The previews use synthetic, in-memory records. Restarting a preview resets its records. From the repository root, `npm.cmd run preview:field` starts the field preview on port 4197. The existing Admin preview uses `npm.cmd run preview:admin` on port 4196.

| Role | Open a view |
| --- | --- |
| Engineer | [Available Consumables](http://127.0.0.1:4197/index.html?fixture=sky#outward-materials) |
| Engineer | [Submit Request dialog](http://127.0.0.1:4197/index.html?fixture=sky&sample=confirm#outward-materials) |
| Engineer | [My Consumables](http://127.0.0.1:4197/index.html?fixture=sky#outward-materials?view=inventory) |
| Engineer | [My Requests](http://127.0.0.1:4197/index.html?fixture=sky#outward-materials?view=requests) |
| Engineer | [Equipment Inventory](http://127.0.0.1:4197/index.html?fixture=sky#masterlist) |
| Engineer | [Repairs](http://127.0.0.1:4197/index.html?fixture=sky#masterlist?status=repair) |
| Engineer | [Missing](http://127.0.0.1:4197/index.html?fixture=sky#masterlist?status=missing) |
| Architect | [Available Consumables](http://127.0.0.1:4197/index.html?fixture=architect#outward-materials) |
| Architect | [Equipment Inventory](http://127.0.0.1:4197/index.html?fixture=architect#masterlist) |

The local gallery at `tests/artifacts/field-review/index.html` compares 18 screenshots of the same synthetic Engineer account using the saved pre-change application files and the revised application. The dialog link prefills a sample draft. Opening it makes no submission.

## Acceptance results

| Requirement | Result | Implementation and verification |
| --- | --- | --- |
| A1. Ten consumables per page | PASS | The catalog filters the full authorized snapshot, then slices it into pages. Chrome displayed 10, 10 and 3 of 23 records. Search and category changes return to page one. Page, total, empty state, unit and stock remain visible where applicable. Quantities are keyed by consumable ID across pages. |
| A2. Submit Request at top right | PASS | The action shares the toolbar with the three existing tabs on Available Consumables. A desktop geometry check verifies its position. Tablet and phone checks verify the toolbar and dialog fit. |
| A3. Optional Purpose in a dialog | PASS | A native modal shows the selected site, items, quantities and units. It validates the draft before opening and again before confirming. Cancel and Escape preserve quantities and make no submission. Focus stays within the dialog and returns on dismissal. Two immediate confirmations resulted in one pending request per actor. Both omitted purposes were saved as an empty string. |
| A4. Icon-based search | PASS | The search button has the accessible name “Search consumables”. The input has an explicit label and no placeholder. Enter and the icon apply the query. Clear resets it. Search combines with category while retaining site and draft quantities. |
| A5. Preserve consumables workflows | PASS | My Consumables uses confirmed issues and My Requests uses the actor's request history. Existing stock, approval and issuance behavior passed contract, browser and database tests. |
| B1. Remove field retired history | PASS | Both field sidebars omit the module and direct navigation is denied. Admin retirement history opens. The historical database read permission is described below. |
| B2. Move Repairs and Missing into inventory | PASS | Both workflows mount inside Equipment Inventory. The standalone sidebar entries are gone. Legacy report links redirect to the corresponding inventory status and open the authorized report. |
| B3. Five controls in the required order | PASS | Total Equipment, Available, In Use, Repairs and Missing use shared KPI styling. Each card counts records after applying the same custody, search and project filters as the inventory table. |
| B4. Functional controls and report details | PASS | Chrome checked all five counts against visible equipment rows for both roles, opened report details, submitted an Engineer repair and an Architect missing report, then verified the equipment list refreshed. Report history is labeled separately because it can include resolved cases and other authorized projects. |
| B5. Preserve authorized inventory | PASS | Both roles use the same reader and status matcher with their own actor IDs. Database tests exercised Office exclusion, inactive and reassigned projects, other custodians and request-catalog separation. |
| C. Premium UI and responsive behavior | PASS | The field controls reuse the existing theme, typography, interaction tokens and keyboard conventions. Browser checks covered 1440, 820 and 390 CSS pixels, dark and light appearances, accessible names, keyboard focus and page overflow. |

## Routes, validation and permissions

- `MCPAConsumablesRequesterV2.mount` serves both field roles on `outward-materials`. The same mount supports `view=inventory` and `view=requests`. The authenticated `mcpa_wa_consumables_snapshot` supplies catalog, allowed sites, requests and issues. Choosing a project sets the requested destination. The current contract supplies one authorized catalog and does not return project-specific stock levels.
- `MCPAConsumablesRequests.validateRequest` checks site, catalog eligibility, units and positive quantities. `ConsumablesCatalog.quantityRules` supplies input constraints. Requests may exceed current stock under the existing approval workflow. The issuance operation enforces available stock. The dialog submits through the existing client’s `mutate('mcpa_wa_submit_consumables', ...)` with its operation ID and retry mechanism. Success feedback follows a successful operation.
- `MCPAProjectScope.readEngineerInventory` and `engineerInventory` enforce the field inventory scope. `EquipmentTracking.matchesStatus` serves both counts and result rows. Available can legitimately be zero because field inventory requires confirmed personal custody at an active, assigned, non-Office project. The broader request catalog serves equipment requests.
- `masterlist?status=repair` and `masterlist?status=missing` reuse `MovementUI.mount`, `MovementUI.openRecord` and the original `MovementStore.reportRepair` / `reportMissing` operations. The old `repair?record=…` and `missing?record=…` links retain report identity. The embedded history uses the existing authorized movement snapshot.
- The field route guard denies `retired-equipment-v2`. The database independently allows an Engineer or Architect to read an **approved** retirement when they previously participated as movement actor or receiver for that equipment. Admin retains full access. The existing permission is defined in [the custody lifecycle migration](../supabase/migrations/202610250002_custody_lifecycle.sql). Removing the module leaves that historical permission intact.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run test:frontend` | 65 passed |
| Consumables frontend and inventory tests, premium contracts, Admin refinements | 33 passed |
| Field inventory, consumables database and integrated quantity/custody tests | 16 passed in disposable PGlite, including original return evidence retention |
| `node tests/premium-v2/field-refinements.browser.cjs` | 5 browser groups passed for both roles, field workflow submissions, Admin retirement access, runtime and network isolation |
| `node tests/premium-v2/admin-refinements.browser.cjs` | 6 browser groups passed, including analytics, View More controls, approval, issuance, ledger exports and original read-only return evidence |
| `node tests/auth.browser.cjs --engineer-consumables` | 2 browser groups passed, including the database-backed personal inventory, actor isolation, draft retention, refresh and error recovery |
| `node tests/quantity-requests-v2/frontend.browser.cjs` | Passed with 47 local database-backed RPC calls. After a committed response was lost, retrying used the same operation ID and preserved the correct request count and stock balance. |
| Direct preview links | All 9 opened the correct tab, dialog or equipment filter in Chrome |
| `git diff --check` | Passed |

The 114 Node test cases exclude the browser groups. The responsive checks caught an overflowing hidden table header on tablet, which was corrected and retested. Accessibility verification covered browser semantics, keyboard interaction and focus. Manual assistive-technology testing and deployed-environment acceptance remain open.

These counts describe the original implementation review. For feature-branch publication, the migration restriction excludes database-backed harnesses. The final staged state therefore has fresh frontend and synthetic browser coverage only. Database regressions on that state and deployed policy enforcement remain **unverified**.

## Files changed for this review

**Application**

- `public/app/core/navigation.js`
- `public/app/core/permissions.js`
- `public/app/features/consumables-requests/styles.css`
- `public/app/features/movements/movement-overview.js`
- `public/app/features/movements/movement-ui.js`
- `public/app/portals/engineer/consumables-requests/consumables-requests.js`
- `public/app/portals/engineer/masterlist/masterlist.css`

**Preview and regression coverage**

- `package.json`
- `tests/admin-pdf-functional.cjs`
- `tests/consumables-requests-v2/inventory.browser-checks.cjs`
- `tests/engineer-architect-parity.test.cjs`
- `tests/functionality-audit-v2/browser-checks.cjs`
- `tests/integration-quantity-custody-v2/browser-checks.cjs`
- `tests/premium-v2/engineer-assignment-preview-fixture.cjs`
- `tests/premium-v2/field-refinements.browser.cjs`
- `tests/premium-v2/fixtures/field-review.js`
- `tests/premium-v2/preview.cjs`
- `tests/quantity-requests-v2/frontend.browser.cjs`
- `tests/ui-review.browser-checks.cjs`

**Review material**

- `docs/engineer-architect-ui-review.md`
- Local artifacts in `tests/artifacts/field-review/` include `index.html`, `capture.cjs`, before/after PNG pairs for `catalog`, `pagination`, `confirm`, `inventory`, `repair`, `repair-detail`, `missing`, `missing-detail` and `mobile`, plus the saved pre-change files and checksums. This artifact directory is Git-ignored.

## Working-tree preservation

At the start of the field review, 23 files already contained local changes. The end-of-review SHA-256 comparison matched the starting bytes for 16, including every Admin-specific application file, the previous Admin report and `public/healthz.php`. The seven shared files extended in this pass were `package.json`, `public/app/core/navigation.js`, the assignment fixture, the preview server, and the functionality-audit, integrated-custody and quantity-request browser checks. Admin behavior was exercised again through its own review suite. All implementation and testing used the local working tree. Database tests used disposable databases. Publication remains pending user acceptance.
