# Assigned projects and mobile navigation verification

Verified locally on 2026-10-15 on `Updated-MCPARole`.

## Behavior

Engineer and Architect project counts, cards, charts, and Projects lists share active-project and assignment rules. Live assignments require the employee profile ID; display-name fallback is limited to explicit demo mode. Archived and inactive projects are excluded. Company roles retain company totals and equipment custody calculations are unchanged.

Both entry pages use one History API controller. Ordinary navigation creates entries; Back and Forward restore each entry's route, record, filters, movement drafts, and scroll after module data and layout are ready. Late content changes preserve restored scroll until user interaction. Logout clears cached drafts, and prior-session history cannot reopen another account's records. Form values are excluded from browser history state.

Mobile Back has an arrow, accessible label, 44px minimum target, and its own themed row below the header. It is hidden when no previous in-app entry exists. Record links remain usable after refresh; unavailable records do not display stale detail.

## Changed files

- `js/project-scope.js`, `js/dashboard-view.js`, `js/movement-overview.js`, `1-admin/modules/sites/sites.js`: shared project scoping, dashboard rendering, project/detail routes and restoration.
- `js/navigation-history.js`, `js/navigation.js`, `js/app.js`, `js/auth.js`, `js/mobile-navigation.js`: history ownership, async readiness, per-entry state, Back control, session isolation and notification continuity after denied routes.
- `js/movement-ui.js`: stable movement-detail links, readiness, filters and draft restoration.
- `1-admin/modules/masterlist/masterlist.js`, `1-admin/modules/masterlist/masterlist.html`: equipment detail routes, refresh and readiness.
- `1-admin/modules/consumables/consumables.js`, `1-admin/modules/purchases/purchases.js`, `1-admin/modules/reports/reports.js`, `1-admin/modules/users/users.js`: register initial data-loading completion for scroll restoration.
- `index.html`, `2-engr/index.html`, `css/layout.css`: shared scripts and responsive Back control.
- `tests/dashboard-view.test.cjs`, `tests/module-navigation.test.cjs`, `tests/navigation-history.browser-checks.cjs`: project scope and history regression coverage.
- `tests/auth.browser.cjs`, `tests/browser-session.cjs`, `tests/notification-ui-checks.cjs`, `tests/package.json`: browser readiness helpers, isolated navigation fixture and test command.
- This verification report.

## Passed checks

Commands run from `tests` using `npm.cmd`:

| Command | Result |
| --- | --- |
| `npm.cmd test` | 61 unit/database tests, 8 movement database scenarios, complete authentication/movement/mobile/theme/notification browser regressions |
| `npm.cmd run test:navigation` | 20 unit tests and real Chrome project-scope/history checks |
| `npm.cmd run test:projects` | 3 database tests and Projects browser checks |
| `npm.cmd run test:request-projects` | 9 tests and independent Engineer/Architect assignment/request/custody browser checks |
| `npm.cmd run test:turnover` | 16 tests and separate-session realtime/fallback browser checks |
| `npm.cmd run test:office-returns` | 30 tests and Engineer/Architect Office-return browser checks |

All 21 changed JavaScript files passed `node --check`. Final diff whitespace checks passed. Browser suites asserted no uncaught JavaScript errors. Database verification used isolated local fixtures; no production database writes or deployed migrations were performed.

Chrome touch emulation verified 375, 393, 430 and 768px in both themes, including Custody Overview scroll restoration, Forward, repeated visits, nested project/equipment details, activity and notification links, delayed reads, window/container/dialog scrolling, drafts, deep-link refresh, route permissions and account changes. Desktop checks and screenshot inspection also passed. The local runner required `MCPA_CHROME_NO_SANDBOX=1`; screenshots were captured in a dedicated visual run, with `MCPA_SKIP_SCREENSHOTS=1` used for final functional reruns.

## Mobile QA handoff

Ready for physical-device QA. Real iOS Safari and Android hardware were not available in this run. On each, confirm Dashboard custody link -> Back returns to the same position; Request -> Transfer History -> Back -> Back preserves both positions; device Back/Forward and project/record refresh behave correctly in both themes.

The pre-existing edit to `supabase/merge-integration-verification.sql` is deliberately excluded from this change and left untouched. No push or GitHub Pages configuration change was made.
