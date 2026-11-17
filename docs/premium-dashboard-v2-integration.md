# Premium Dashboard V2 integration candidate

Prepared on 17 November 2026 against original `dark-er-00/MCPA2.0` main at
`7b6072043b38845f90562720ca61bc3b06e2fcd4`. This is a local integration candidate,
not a released or independently verified live application.

## Presentation and architecture

The newest approved source is `MCPA2.0-Premium-V2-Pie-Animation-Review`.
Its predecessors are Final Review (recovered design, project identity/aggregation
and overflow fixes) and Navigation/Inventory Review (light sidebar, navigation
motion, compact inventory and five-entry pages). The animation copy retains both.

`public/index.html` adds three local stylesheets and loads
`app/features/dashboard/premium-dashboard.js` immediately after the existing
dashboard renderer. The premium module implements the existing `DashboardView`
interface (`render`, `inventory`, `consumablesCard`). The unchanged movement
overview supplies its current snapshots and delegated action handlers. Existing
authentication, API clients, PHP proxy, permissions, project scope, modules and
configuration remain authoritative and unchanged.

The visual layer includes the original MCPA logos, approved typography/fallback
fonts and licenses, dark/light themes, compact KPIs, fully filled patterned pie,
project chart, movement chart, activity/inventory arrangement, light sidebar,
navigation indicator, compact desktop rows and mobile cards. Inventory applies
existing requestability before stable ID sorting and five-record pagination.
Logos use the application's subpath resolver; font URLs are relative to CSS.

The pie uses fixed hit regions and native CSS transforms: six SVG units along
the slice bisector, 220 ms easing, and 66% opacity on other slices. It preserves
geometry and pattern definitions. Touch, keyboard and reduced-motion behavior
are retained. Slice emphasis does not change records or filters; the legend
still filters inventory.

## Scope decisions and backend differences

The source prototype was based on the separate development snapshot
`f6e022df84fcce0c0243b0aa9a7106c3ec292c31`. Original main is a different baseline.
It does not implement `MCPAProjectScope.engineerInventory` or the prototype's
broader assigned-stock reader. Importing that policy would change access rules.

The integrated field dashboard therefore keeps main's confirmed-custody scope.
The second card is **Available in Custody**, calculated by the unchanged tally
helper over authorized custody records. Assigned-site stock remains isolated in
the original prototype and is **not integrated**. Field pie/project/inventory
totals consequently describe custody, not custody plus available project stock.
Own custody can show its recorded location without granting project access.
Active assigned-project counts still use main's unchanged project-scope helper.
Live ownership requires IDs; explicit offline demo mode retains name matching.

Admin quantities use `EquipmentTracking.quantity`; field charts count distinct
positive-quantity asset records. Office is classified by office ID when supplied,
with the recovered legacy-name fallback when that ID is unavailable. Project
grouping uses IDs first and never merges equal labels. Recorded condition in the
pie is distinct from request eligibility. Repair-condition counts and workflow
ticket counts remain separate. Movement counts come from saved timestamped events
in the seven-day Manila window, not invented history.

Current main's Admin Details opens the full tool profile; field Details opens
the authorized custody dialog. This integration preserves both handlers. It
does not replace requests, transfer/receipt, return, repair, project, account,
permission or retirement functionality with the prototype's versions.

## Local preview and tests

Node 22+ is required. No packages or database are required for the focused premium
tests. Browser tests currently use installed Chrome on Windows. From repository root:

```powershell
node tests/premium-v2/preview.cjs
```

Open `http://127.0.0.1:4192/index.html?fixture=admin&theme=dark#dashboard`.
Use `fixture=sky` or `fixture=architect` and `theme=light` as needed.
An alternate free port can be supplied through `PORT` to both server and tests.

In another terminal:

```powershell
node --test tests/premium-v2/contracts.test.cjs
node tests/premium-v2/integration.browser.cjs
node tests/premium-v2/pie-animation.browser.cjs
```

The preview serves this worktree's actual `public/` files with a test-only offline
SDK/config and synthetic JavaScript records. It binds to loopback, blocks external
browser connections with CSP, and never imports database drivers. Test fixtures
are under `tests/premium-v2`, outside the public web root, and are not referenced
by production HTML. The ordinary `npm start` production/local PHP command has
not been changed to use fixtures. Do not use it for this isolated review.

Focused existing frontend and PHP tests may be run separately. PHP compatibility
tests use local mock HTTP/HTTPS upstreams, including certificate verification;
they do not query live Supabase. Do not run migration-backed suites as part of
this UI review. Generated reports and screenshots are ignored by Git.

## Release gate and remaining work

A main push may immediately deploy through the co-developer's Render account.
Production publication remains blocked. The owner separately authorizes this development feature branch without a PR despite unverified external deployment isolation. GitHub observations alone do not
verify Render's linked branch, service/Blueprint configuration or environment.
The co-developer must confirm the intended service, build/start commands, app
base path, runtime configuration and backend revision compatibility using their
approved deployment process. No secrets need to be shared.

Local synthetic tests establish frontend behavior only. They do not establish
live RPC availability, RLS behavior, schema version, production configuration or
deployment success. Physical devices and browsers other than Chrome remain
unverified. The historical animation reference video was unavailable; the
implemented motion follows the written approved specification.

Before release, reconcile the desired assigned-stock feature with the actual
authorized backend contract separately; never broaden permissions to match the
prototype. Re-fetch main and review any new contributions, repeat affected checks,
inspect and secret-scan the exact staged diff, then commit/push normally only
after deployment-critical prerequisites are confirmed. No force-push is needed.

## Recovery

The local repository has a rollback reference
`rollback/premium-v2-before-20261117` at `7b6072043b38845f90562720ca61bc3b06e2fcd4`.
Original projects and dirty developer checkouts remain untouched. No rollback of
remote main is currently necessary because no integration commit was published.
If a future integration commit is published, recover through a reviewed revert
commit on the then-current main, followed by a normal push. Do not reset or
force-push shared history. A revert push may itself trigger Render deployment.
