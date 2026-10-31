# Equipment Office defaults and Engineer/Architect asset displays

Implemented locally on October 12, 2026. Live Supabase deployment remains a manual step.

The supplied preflight verifies the active Office at **2826 Cagayan Valley Rd., Plaridel, Bulacan**, ID `ba8bef8c-139a-43b9-ae2b-5857293b7f33`. The existing Office configuration and resolver are installed. The inventory Office getter and insert trigger are not yet installed, and the existing equipment insert policy requires a null site. The new migration reuses that configured record; it creates no location and contains no Office UUID.

The user separately physically confirmed **Welding Machine — T-8862** at Office. Only that Asset ID is included in the separate current-location correction. Eligibility from the preflight was not treated as physical evidence.

New Admin inventory resolves Office before saving, displays a read-only initial location, and verifies the saved site. The backend supplies Office when new available stock has no site or holder, and the compatible RLS insert policy rejects another project, an initial holder, or another status. Existing Admin/Tool Handler insert permissions remain as before. Trusted imports with an explicit project, custody, or missing status retain that information. Inventory metadata edits never include a site or custody change.

Engineer/Architect equipment selectors, tracking tables, details, Projects inventory/history, and dashboard summaries display assets by name, Asset ID and recorded location. Quantity columns, quantity details, `Qty` and `whole record` labels are hidden for those roles. Their equipment summaries count asset records; Admin summaries and Bulk quantity controls retain quantities. Selection counters, quantity-dependent eligibility, whole-record movement behavior, and stored quantities remain intact. Unknown locations and unassigned custodians retain their distinct meanings.

Available stock at the verified Office is recognized as available in inventory displays. This recognition uses the metadata getter's ID, rather than a site name match. Equipment at actual projects, under repair, missing, or held retains its recorded location and status.

## Files changed

| Files | Change |
| --- | --- |
| `1-admin/modules/masterlist/masterlist.html`, `masterlist.js` | Read-only initial Office, verified creation destination, saved-location check, Office availability; metadata edits preserve site/custody. |
| `js/equipment-tracking.js` | Narrow Office metadata read, verified Office availability, presentation-only asset tallies. |
| `js/movement-ui.js` | Role-aware asset selector labels; preserves selection counters and movement payload logic. |
| `js/movement-overview.js` | Engineer/Architect tracking and detail displays hide quantities; retain scoped reads. |
| `js/dashboard-view.js` | Field summaries count assets and project summaries retain individual Asset IDs; Admin quantities unchanged. |
| `1-admin/modules/sites/sites.js` | Field Project inventory, tool details, movement history and summaries use assets; Admin quantity presentation retained. |
| `supabase/equipment-office-preflight.sql` | Read-only installation/policy metadata and unknown-location review candidates. |
| `supabase/migrations/202610120004_equipment_office_default.sql` | Guarded prospective INSERT default, narrow metadata RPC and compatible insert policy. No backfill. |
| `supabase/equipment-office-confirmed-correction.sql` | Separate guarded correction for physically confirmed T-8862 only. |
| `tests/equipment-office.database.test.cjs`, `equipment-office.browser-checks.cjs` | Office default, authorization, custody/history preservation, correction and complete asset workflow checks. |
| `tests/auth-test-db.cjs`, `auth.browser.cjs`, `package.json` | Metadata RPC transport, isolated migration installation and feature runner. |
| `tests/inventory.test.cjs`, `dashboard-view.test.cjs`, `feature-frontend.test.cjs` | Office availability, field asset counts, Admin quantity preservation, Office prerequisite and photo retry regression checks. |
| `documentation/equipment-office/screenshots/` | Eight captures: Admin creation and Engineer selection at 1440/393 pixels in Light/Night mode. |
| `EQUIPMENT-OFFICE-IMPLEMENTATION.md` | This implementation/deployment report. |

## Tests performed

All database writes occurred in disposable local PostgreSQL fixtures (PGlite). Chrome's external HTTPS was blocked. Fixture Office IDs are generated per database; the frontend and new migration do not embed test IDs. Engineer A/B and Architect checks use separate authenticated fixture profiles with actual fixture project assignments. These are local validation results, not a claim that production accounts were exercised.

| Verification | Result |
| --- | --- |
| Office default, inventory, dashboard, Office returns, assigned-request authorization, Engineer portal and turnover notification Node/database regression suite | 38 passed; an additional complete new-stock workflow test passed after it was added. |
| Inventory, dashboard, photo/frontend, movement synchronization and link navigation suite | 35 passed. Counts overlap with the preceding suite. |
| New Office stock with both live-style TEXT status and the enum fixture | Passed; direct Admin and existing Tool Handler inserts default to Office; Bulk quantity 7 and null custodian preserved; repeat migration safe. |
| Forged project/holder/status inserts; Engineer/Architect/Secretary/anonymous inserts | Rejected by database permissions/RLS. Field Office metadata allowed; Secretary/inactive/anonymous denied. |
| Missing/inactive Office; unexpected insert policy | Refuses creation/deployment; form/photos preserved; no partial stock inserted. |
| Existing equipment, sites, assignments and history before/after default migration | Identical. Metadata edits preserve project, holder and quantity. |
| Physically confirmed correction | Only T-8862's current site changes. Historical movement/project records, quantities, custody and other equipment stay unchanged. Retry is safe; changed project, holder, status, zero quantity or reservation refuses correction. |
| New Office asset lifecycle | Request → approval → release notification → tested receipt → receiving-QR project transfer → tested receipt → inspected Office return passed. Quantity 7 preserved; activity history retained. Untested receipt rejected. |
| Browser `--asset-interface` | Passed: Admin default/save/retry and quantities; Engineer A/B/Architect names, Asset IDs, current locations and no quantity labels across dashboard, requests, tracking/details, transfers, returns and Projects/details/review. |
| Browser `--portal`, `--office-returns`, `--feature-completion`, `--flows-only` | All passed: QR/scanner lifecycle, authorized custody, good/damaged/missing returns, photo creation/edit/retry, notifications, cancellations, historical links, automatic refresh and offline isolation. |
| Responsive/theme review | Desktop 1440 and mobile 393 pixels, Light/Night; no page overflow. Existing regression checks cover further widths from 375 through 1440. |
| Syntax and whitespace | Changed JavaScript parses; `git diff --check` passes. |

Reproduce the focused feature suite from `tests/` with `npm run test:equipment-office`. The Windows test machine used the runner's existing opt-in `$env:MCPA_CHROME_NO_SANDBOX='1'`; external HTTPS was still blocked and only isolated fixtures were written. Default browser runner settings retain Chrome sandboxing.

## Required manual deployment

The latest supplied preflight satisfies the Office prerequisite. Do not create another Office or rerun location creation.

1. In Supabase SQL Editor, review and run **`supabase/migrations/202610120004_equipment_office_default.sql`**. It validates the canonical Office, RLS and the reviewed existing insert policy before installing anything. It changes function/trigger/policy definitions only and not existing equipment. If a guard fails, resolve that reported prerequisite instead of removing the guard.
2. Separately review and run **`supabase/equipment-office-confirmed-correction.sql`** for the confirmed T-8862. It checks the Asset ID/name, null-or-already-Office site, available status, positive quantity, absent holder and absence of active reservations/handovers/repair/missing cases while blocking conflicting movement writes. It updates only `equipment.site_id`. It prints the resulting asset, location, status, quantity and custodian. If its state changed since physical confirmation, it aborts without changing equipment.
3. Rerun **`supabase/equipment-office-preflight.sql`**. The inventory RPC and Office trigger flags should now be true, the insert policy should require the canonical Office ID, and T-8862 should no longer appear among unknown-location equipment. Confirm the correction query shows `Office`, `AVAILABLE`, quantity `1`, and no custodian.
4. Publish the changed application files through the existing hosting process, then refresh signed-in clients. The frontend requires the new getter for creating inventory; deploying SQL first avoids blocking new-item saves.
5. During the next real stock entry, confirm its recorded location is Office. Confirm Engineer A/B each retain their own assigned request sites and asset IDs; review an actual project-held asset to confirm its location/custodian are unchanged. Existing history should remain visible.

No live migrations, correction, stock entry, assignment changes or application publication were performed by this implementation.
