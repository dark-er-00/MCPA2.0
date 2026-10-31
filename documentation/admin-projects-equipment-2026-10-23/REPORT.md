# Admin Projects and Equipment Tracking improvements

Local implementation on `Updated-MCPARole`, based on `81da29e`. Date: October 23, 2026 (Asia/Manila).

## 1. Completed improvements

1. Removed Operational Status from both project forms and removed standalone operational badges from project cards/details. Archived badges remain on cards and details. Assignment and Last Inventory Check now share the existing two-column form row. Historical status changes remain readable in Project History.
2. Added Total Equipment, Available and Deployed buttons immediately below the Admin Equipment Tracking heading and above its search/filters. They use the Dashboard's card, typography, icon and theme language, form a desktop/tablet row, and stack on mobile. They expose selected state with `aria-pressed` and have visible keyboard focus.
3. Made all three Admin Dashboard equipment cards navigate to the existing masterlist with the appropriate status selected. Local quick filters and the dropdown also use the existing navigation system.

No database source, migration, RLS policy, RPC implementation or equipment status definition was changed. No production SQL, production record mutation, commit, staging, push or deployment was performed.

## 2. Exact source/documentation files

| File | Change |
|---|---|
| `1-admin/modules/sites/sites.js` | Remove operational controls/validation and standalone status badges; preserve archive indicators and all other project sections. |
| `1-admin/modules/sites/README.md` | Explain internal status preservation and server creation default. |
| `1-admin/modules/masterlist/masterlist.html` | Three summary buttons, global-total explanation and accessible filter names. |
| `1-admin/modules/masterlist/masterlist.css` | Scoped responsive cards, selection, focus and theme styling. |
| `1-admin/modules/masterlist/masterlist.js` | Existing tally/matcher integration, status navigation, history restoration, retained identity/archive metadata, refresh and unavailable-count handling. |
| `js/dashboard-view.js` | Admin equipment status targets; describe deployed equipment without an incorrect project-location qualification. |
| `js/navigation.js` | Allowlisted masterlist status query and application after module readiness. |
| `js/navigation-history.js` | Capture/restore Admin equipment search, category, project and pagination with existing session ownership. |
| `js/movement-overview.js` | Admin-only status application for the existing read-only/demo inventory route. |
| `tests/admin-equipment-summary.test.cjs` (new) | Route/role targets and isolated PostgreSQL status/default/history/archive tests. |
| `tests/admin-equipment-summary.browser-checks.cjs` (new) | Real-browser summary, counts, navigation, refresh, accessibility and role tests. |
| `tests/auth.browser.cjs` | Register the new suite and its isolated construction fixture dependency. |
| `tests/module-navigation.test.cjs` | Latest status wins during module loading and survives script retry. |
| `tests/project-construction.browser-checks.cjs` | Assert missing create/edit status control, server creation default and absence of spurious status-change history. |
| `tests/package.json` | Add `test:admin-equipment-summary`. |
| `documentation/admin-projects-equipment-2026-10-23/REPORT.md` (new) | This implementation report. |

Generated logs and PNGs are local evidence in this folder, not staged files. Existing browser suites also regenerate their customary screenshot outputs in earlier documentation folders; those generated artifacts are not source changes.

## 3. Dashboard navigation

The existing `data-go` handler calls `showScreen()`. Admin card targets are:

| Dashboard card | Internal route | Status dropdown value |
|---|---|---|
| Total Equipment | `masterlist?status=all` | Empty / all statuses |
| Available | `masterlist?status=available` | `Available` |
| Deployed | `masterlist?status=inuse` | `In Use` |

`MCPAMovementLinks.parse()` accepts only `all`, `available`, `inuse`, `repair` and `missing`, and only on `masterlist`. Existing authentication and route permission checks remain in place. Filter application additionally requires the Admin role.

`MCPANavigation.activate()` waits on the module's existing registered initialization promise before `AdminEquipment.setStatus()` updates the dropdown and renders rows. The existing navigation ticket and pending-module handling prevent an older navigation from winning. There is no timeout-based production filter application, duplicate list, separate page URL or full-page reload.

Status is encoded in the normal hash route, so browser back/forward, reload and direct subpath links retain it. Existing per-account session history now also captures category, project, search and page for Admin equipment visits. Local status changes retain these other controls. A Dashboard-to-masterlist visit normally remounts the equipment module and starts its other filters fresh, as before; returning to a prior visit restores its saved controls.

Engineer/Architect and Tool Handler Dashboard targets retain their existing behavior. An injected status query does not apply the Admin shortcut to their inventories. Admin offline demo shortcuts use the pre-existing read-only inventory and its dropdown; the new management cards belong to the live Admin module, which is not mounted in demo mode.

## 4. Quick-filter synchronization

The existing Status dropdown remains the input consumed by `filteredEquipment()`. Both summary clicks and manual dropdown changes call `showScreen()` with the same status route. `setStatus()` translates that route to the dropdown's existing values and calls the existing `renderTable()`; pagination resets when status changes.

Every render updates `aria-pressed` from the dropdown value. Empty status selects Total; Available selects Available; In Use selects Deployed; repair/missing selects none of the three. Search, project and category still compose with `EquipmentTracking.matchesStatus()`.

Summary values are computed from the complete loaded equipment collection, before search/category/project/status filtering. The explanatory line explicitly identifies global quantities, while the existing footer continues to report matching equipment **records**. A first-load failure shows unavailable quantities (`—`), rather than false zeros. Subsequent successful refresh recovers them without losing status selection.

## 5. Count and classification authority

Both views use `EquipmentTracking.quantity()`, `tally()`, `availability()` and `matchesStatus()` from `js/equipment-tracking.js`. No parallel status formula was introduced.

* **Total** sums nonnegative equipment quantities, rather than counting database rows or treating each bulk record as one unit. Zero stock contributes zero. It retains the Dashboard's full tracked-record scope, including other conditions and archived records in Total.
* **Available** sums only equipment eligible under existing requestability rules: recorded AVAILABLE stock, positive quantity, no holder, no archive/inactive marker, no missing/damaged/repair/retired condition, no approved reservation or pending/refused handover, and verified availability. Recorded IN_OFFICE does not become Available by location alone.
* **Deployed** sums equipment whose recorded status is In Use. There is no project-location condition in the authoritative tally or masterlist matcher. Unassigned In Use equipment is included, and the Dashboard description now says “Equipment currently in use.”

Available + Deployed need not equal Total. The existing Dashboard condition chart intentionally describes recorded conditions separately from request eligibility; it was not redefined by this work.

The masterlist already reads equipment/sites/profiles and refreshes the movement snapshot. Its mapping now retains the asset identity and optional archive/inactive fields needed by the shared eligibility checks. If movement verification fails, availability is marked unverified, rather than using empty reservations to imply available stock.

Counts refresh through the existing equipment initialization/edit/bulk refresh calls and existing equipment/sites/notification watcher and periodic fallback. No additional subscription or polling loop was added.

## 6. Project status compatibility

Reviewed the actual `mcpa_save_project()` implementation in `supabase/migrations/202610230002_project_construction.sql`:

* Update loads the current row, checks its revision, and changes status only if `p_patch` contains `status`.
* Creation explicitly inserts `coalesce(s.status,'planning')`. The existing RPC therefore provides the required server default even though it explicitly names the status column.

The forms no longer contribute a status field to FormData and no status is added internally. Existing statuses remain unchanged on metadata/progress edits, and creation uses the server's `planning` default. Archive/restore still sends only the existing independent `is_active` change through the same revision/idempotency path.

Local database tests preserve all seven existing statuses (`active`, `discrepancy`, `verified`, `turnover`, `idle`, `planning`, `completed`) after metadata edits and verify unchanged status in history before/after values. Browser tests verify a real frontend edit preserves `active`, emits no status-change event, and creates a project with `planning`. Lifecycle, weighted progress, assignment, Site Updates/corrections, history, revision conflicts and retry keys continue through their existing implementation.

## 7. Verification

Tests use disposable embedded PostgreSQL/PGlite and the existing local Chrome transport. External HTTPS is blocked; no production Supabase requests are made. The fixture-only archive columns and seeded refresh changes exist only in that disposable database.

Commands from `tests/`, using the repository's documented Windows browser option:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
npm.cmd run test:admin-equipment-summary
npm.cmd run test:project-construction
npm.cmd run test:projects
npm.cmd run test:inventory-availability
npm.cmd run test:equipment-fixes
npm.cmd test
```

| Command/check | Final results | Evidence |
|---|---|---|
| `test:admin-equipment-summary` | 36 Node tests passed, 0 failed; browser suite passed | `summary-tests-final.log` |
| `test:project-construction` | 14 Node tests passed, 0 failed; project browser suite passed across 12 viewport/theme combinations | `project-tests-final.log` |
| `test:projects` | 3 Node tests passed, 0 failed; project error/retry/authorized-view browser suite passed | `projects-errors-tests.log` |
| `test:inventory-availability` | 29 Node tests passed, 0 failed; Admin/Engineer availability browser suite passed | `availability-tests.log` |
| `test:equipment-fixes` | 26 Node tests passed, 0 failed; 52 equipment browser assertions passed | `equipment-tests.log` |
| `npm.cmd test` | 68 Node tests passed, 0 failed; all 8 movement database scenarios passed; Auth/main browser suite passed | `main-tests-final.log` |
| `node --check` on all 11 changed/new JS/CJS files | Passed, 0 syntax errors | Local command output |
| `git diff --check` | Passed, 0 whitespace errors | Local command output |

New browser coverage includes global Dashboard/masterlist quantity equality, unavailable/archived/held/damaged/reserved/zero stock, unassigned and assigned In Use equipment, each quick filter, dropdown synchronization, combined filters, initial-load error/recovery, changed status/quantity refresh, delayed initialization, repeated Dashboard visits, latest-target/retry behavior, back/forward, reload, direct GitHub Pages-style subpath navigation, Enter/Space activation and visible focus. It checks six equipment viewport/theme combinations (375/768/1440, light/dark) plus existing availability coverage at 375/393/430/768/1440. Projects checks twelve viewport/theme combinations at 375/393/430/768/1024/1440.

Initial attempts encountered the host's `npm.ps1` execution-policy block and default Chrome CDP startup timeouts. Using `npm.cmd` and the already documented disposable test Chrome option resolved these. During development, new fixture checks needed explicit post-seed Dashboard reload, reload-safe waits, CDP keyboard text events and owner-level fixture seeding; these harness issues were corrected. No application permissions were weakened to make tests pass.

## 8. Screenshots

All values and identities below are isolated test fixtures, not production evidence.

| Requested view | Screenshot |
|---|---|
| Project Edit, light desktop | [Updated Edit form](screenshots/projects-edit-1440-light.png) |
| Project Edit, dark mobile | [Mobile Edit form](screenshots/projects-edit-375-dark.png) |
| Equipment Tracking, all three cards | [All equipment](screenshots/equipment-summary-light.png) |
| Available via Dashboard shortcut | [Available selected](screenshots/equipment-available-light.png) |
| In Use via local quick filter | [Deployed selected](screenshots/equipment-inuse-light.png) |
| Dashboard equipment shortcuts | [Dashboard before navigation](screenshots/dashboard-shortcuts-light.png) |
| Dashboard totals after equipment refresh | [Refreshed Dashboard](screenshots/dashboard-navigation-updated-light.png) |
| Tablet, light | [768px layout](screenshots/equipment-summary-768-light.png) |
| Mobile, dark | [375px layout](screenshots/equipment-summary-375-dark.png) |
| Desktop, dark | [1440px layout](screenshots/equipment-summary-1440-dark.png) |

Additional light/dark captures are in `screenshots/`. Visual inspection confirmed the existing design language, aligned card heights, readable wrapping, selected/focus states, form layout and contained horizontal table scrolling. No page-level horizontal overflow was found.

## 9. Limitations and review decisions

* Production schema/data were not queried. Compatibility is grounded in repository SQL and isolated execution; the deployed RPC must match the reviewed implementation.
* Local Auth/PostgREST transport models server communication while executing real PostgreSQL RPCs and RLS. Deployment-specific JWT, Realtime delivery and independent database-session behavior require staging verification if desired.
* Total retains the Dashboard's quantity meaning and full equipment scope. The Status option still says “Available to request,” preserving the distinction from recorded AVAILABLE equipment that is held/reserved/damaged.
* Status filtering adds normal browser-history visits; Search/Project/Category are restored within the existing account-owned session cache, rather than added as new public URL parameters.
* The design tool reported pre-existing stale `.impeccable/design.json` metadata. It was left outside scope; Impeccable's `document` command can refresh it separately.

Implementation stops at local changes and testing for user review. Nothing is staged or committed.
