# SiteTrace global search verification

Verified locally on 2026-10-16 (Asia/Manila). No deployment, push, production SQL, or permission changes.

## Root cause and implementation

`globalSearch()` in `js/app.js` previously scheduled `showScreen('masterlist')`, wrote `window.mcpaSearch`, and dispatched input into the Equipment Tracking filter. Every header query therefore became an equipment-only search.

The header now delegates to a single application-level search controller. It debounces input by 180 ms, reads existing authorized repositories, caches successful results for up to 30 seconds per account/role/mode, and invalidates on movement updates and application reset. Queries reuse the cache or the pending load. Generation and identity checks discard obsolete query/session responses. Failed sources are reported and immediately retryable. A failed personal equipment read never falls back to the broader movement/request catalog.

Results are grouped by module, rendered 40 at a time, and searchable across the full loaded collection. Table reads use the existing paginated reader, including its actual-response-cap handling. RPCs reuse existing authorized snapshot functions. Matching and highlighting use literal strings and text nodes; search input is never inserted into SQL or HTML. Profiles, accounts, secrets, and receipt paths are not indexed.

The panel includes icons, reference/context text, loading and empty/error states, Clear, outside dismissal, Escape, Up/Down, Enter, combobox/listbox semantics, and screen-reader status updates. It uses existing theme tokens, scrolls within the viewport, and supports mobile touch targets. Global typing/clearing does not write local filters.

## Search coverage and access

| Module | Source / restriction |
| --- | --- |
| Equipment Tracking | Admin/Tool Handler inventory snapshot; Engineer/Architect personal equipment RPC; name, asset reference, serial, category, brand, authorized location/holder |
| Projects | Existing project RPC for Engineer/Architect, with stable assignment-ID filtering; authorized sites for Admin/Tool Handler |
| Requests | Existing movement snapshot; Admin and operational roles only |
| Transfers, Returns, Repairs, Missing Equipment | Existing movement snapshot and module permissions; references, related equipment and authorized status/participants |
| Activity Logs | Authorized movement activity; action, reference, tool IDs and summary |
| Purchases | Existing purchase snapshot; Admin/Secretary only |
| Materials / Material Requests | Paginated authorized consumables/request tables; Admin/Secretary only |
| Reports | Admin-only existing Current inventory, Historical inventory and Movement activity report views |

Live RPC/RLS restrictions remain authoritative. Demo records receive explicit personal movement/custody/activity filtering. Employee directories, account settings and administrative functions do not appear as search results. Tool Handler retains the existing exclusion from Requests, Purchases, Materials and Reports. Secretary sees only Purchases and Materials.

## Navigation

Selection uses `showScreen()` and the existing history controller. Existing equipment, project and movement record routes are retained. The central route parser also accepts stable record IDs for purchase, material and activity detail adapters, plus the existing report kind. No separate history implementation was added.

Back/Forward, scroll restoration, session boundaries and duplicate-route handling remain with `MCPANavigation`. The header query survives ordinary navigation and clears on application/account reset. Missing records have module feedback. Purchase/material/activity adapters open individual details without setting local search inputs.

## Files changed

- `js/global-search.js`: controller, authorized source loading, explicit field index, matching and accessible result rendering.
- `css/global-search.css`: responsive panel, result rows, controls and safe text wrapping.
- `index.html`, `2-engr/index.html`: load the shared controller and styles.
- `js/app.js`: replace the redirect, integrate reset/dismissal, update placeholders and allow Secretary to open search.
- `js/navigation.js`: extend centralized record dispatch and detail clearing.
- `js/movement-overview.js`: exact activity detail adapter.
- `1-admin/modules/purchases/purchases.js`, `1-admin/modules/consumables/consumables.js`, `1-admin/modules/reports/reports.js`: existing-detail/report adapters.
- `tests/global-search.test.cjs`: index, permissions, assignments, duplicate names, literal input and large collections.
- `tests/global-search.browser-checks.cjs`: search interaction, cache, exact records, source failures, pagination, history, keyboard, roles and responsive coverage.
- `tests/auth.browser.cjs`, `tests/package.json`: isolated fixture integration and `test:global-search` command.
- `tests/mobile-search-ui-checks.cjs`, `tests/workspace-ui-checks.cjs`: replace expectations of the old redirect with global results/exact selection; retain existing theme/layout/interaction assertions.
- `GLOBAL-SEARCH-VERIFICATION.md`: this report.

## Verification results

All final runs passed:

- 68 Node tests across global search, module/movement navigation, authentication database policies, dashboard, inventory, Engineer portal database scopes, movement sync/store and existing frontend functionality.
- `node tests/auth.browser.cjs --global-search`: all five roles; exact equipment/project/request/transfer/repair/purchase/material/report selection; Back/Forward and search-result scroll restoration; cache reuse; literal markup-like queries; 1,201-record display pagination and late matches; duplicate keyboard-listener check; failed-source isolation/retry; stale queries; account reset; 375/393/430px in both themes.
- `node tests/auth.browser.cjs --mobile-search-only`: real touch, Enter/Escape, header controls, focus transitions, and existing equipment details across mobile/tablet/desktop in both themes.
- `node tests/auth.browser.cjs --navigation`: centralized navigation, nested/window scroll restoration, delayed loads, drafts, refresh, permissions, session isolation and Forward.
- `node tests/auth.browser.cjs`: full existing authentication/browser suite, all roles, protected routes, movement workflows, notifications, themes, mobile UI and demo isolation.
- JavaScript syntax checks and `git diff --check`.
- Visual review of search results on mobile in light/dark themes and desktop.

Browser tests used isolated local PostgreSQL fixtures with external HTTPS blocked. Chrome needed the existing `MCPA_CHROME_NO_SANDBOX=1` test-harness option in this environment after normal startup timed out. Intermediate failures concerned obsolete redirect expectations and test setup/timing; those were corrected, and the final suites passed without uncaught JavaScript errors.

## Remaining limitations

- Search uses the application's existing snapshots and paginated reads, with an in-memory index. Very large company datasets may eventually warrant a separately reviewed server-side search endpoint; no backend migration was needed or prepared here.
- Successful additional-source reads are cached for up to 30 seconds. Movement changes invalidate that cache; account resets clear it. This is not a separate realtime subscription system.
- Reports are searchable report views. The application has no saved-report catalog, so search does not invent saved reports or search every historical snapshot's contents.
- No live Supabase validation or production performance measurement was performed. Browser/backend verification was local and isolated.
