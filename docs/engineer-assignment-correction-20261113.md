# Engineer project-assignment correction — 13 November 2026

Implemented in `<LOCAL_USER_HOME>\OneDrive\Desktop\Codings\VS Code\MCPA-development-review\antigravity-admin-ui-work`. Engineer UI acceptance remains pending the user's manual approval.

## Root cause

The **previous isolated preview** bootstrapped `tests/auth-test-db.cjs`, which explicitly updated Casa Buena's `sites.assigned_engineer_id` to `actors.sky.id`. `tests/engineer-ui-preview-fixture.cjs` then placed its “assigned project” stock at Casa Buena. The preview therefore supplied a concrete but incorrect assignment to both Projects and Inventory. This was a synthetic fixture assumption; no live assignment data was inspected.

The documented authoritative relationship is `sites.assigned_engineer_id → profiles.id`, used by `mcpa_project_snapshot` in `supabase/migrations/202610100001_engineer_portal.sql`. Custody, equipment locations, activity and matching names do not assign a project.

Additional frontend gaps were corrected: Projects retained all reader rows internally, letting a broader response affect total counts; demo mode could infer Engineer assignments and custody from display names; request project dropdowns trusted the catalog's site list after excluding only Office; dashboard project equipment summaries could associate records by matching project labels.

## Result

- Engineer project responses are scoped by authenticated profile ID **before** storing sites, equipment statistics or history. Counts, searches, scope changes and direct detail links use that same set. Custody provides no exception for Projects.
- Inventory admits eligible available stock only at explicitly assigned active projects outside the authoritative Office ID, plus records held by the authenticated profile ID. Own custody at an unassigned project remains visible. Existing inventory status/search/project filters, totals and detail access consume this scoped data.
- Request project selectors intersect the catalog with explicitly assigned active project IDs. Catalog stock groups remain intact, including Office availability.
- Engineer dashboard equipment-to-project association uses site IDs. Global search uses the same strict Engineer assignment/custody rules, including demo mode.
- Admin behavior is preserved. The six protected Admin files checked retain identical SHA-256 hashes. Rendering accepted and corrected shared Projects code against the same synthetic Admin snapshot produced identical company-wide cards and counts. Admin Inventory still shows Office, Casa Buena and Sky's project equipment.

## Synthetic preview

The preview now uses `engineer-assignment-preview-fixture.cjs`, a plain JavaScript model. Casa Buena belongs to synthetic Engr Pau; Sky belongs only to **Sky Assigned Project**. Sky's own drill is deliberately at Casa Buena to verify that custody does not authorize Projects. An additional synthetic Engineer has no projects and retains one custody record.

The original restart command branches **before** database imports. The new server binds `127.0.0.1:4183`, serves only local files and fixture responses, overrides configuration with `offline.mcpa.invalid`, substitutes a local SDK transport, and sends a CSP with `connect-src 'self'`. It does not call Supabase or any upstream service. Existing historical database integration fixtures were left unchanged and are no longer used by `--ui-preview`.

Working URLs (HTTP 200 verified):

- [Sky Projects](http://127.0.0.1:4183/index.html?fixture=sky#sites)
- [Sky Equipment Inventory](http://127.0.0.1:4183/index.html?fixture=sky#masterlist)
- [Fixture controls](http://127.0.0.1:4183/__fixture)
- [Application](http://127.0.0.1:4183/index.html)

Restart from PowerShell after stopping the existing preview process:

```powershell
Set-Location -LiteralPath '<LOCAL_USER_HOME>\OneDrive\Desktop\Codings\VS Code\MCPA-development-review\antigravity-admin-ui-work'
node tests/auth.browser.cjs --ui-preview --admin-pdf
```

The direct equivalent is `node tests/engineer-assignment-preview.cjs`. Keep the terminal open when starting manually. The managed background preview was left running as PID **16968**. Synthetic state resets on restart. This fixture models frontend data and selected local actions; it does not establish live backend authorization or replace full workflow integration tests.

## Changed files

Application:

1. `public/app/features/projects/project-scope.js` — shared strict Engineer assignment and full project snapshot scoping; custody by ID.
2. `public/app/portals/admin/sites/sites.js` — Engineer response, history, totals and detail guards; Admin paths preserved.
3. `public/app/features/dashboard/dashboard-view.js` — Engineer project equipment association by ID.
4. `public/app/core/integration.js` — Engineer request/consumables project choices intersect authoritative assigned project IDs; stock unaffected.
5. `public/app/features/search/global-search.js` — strict Engineer demo search selection and indexing; live inventory guard retained.

Preview and focused tests:

6. `tests/auth.browser.cjs` — early no-database `--ui-preview` branch; other historical test modes unchanged.
7. `tests/engineer-assignment-preview.cjs` — loopback-only JavaScript preview server.
8. `tests/engineer-assignment-preview-fixture.cjs` — explicit synthetic assignment/custody model and fixture responses.
9. `tests/fixtures/offline-sdk.js` — local browser transport extracted from the existing isolated test SDK; `/__fixture-api` only.
10. `tests/engineer-project-assignments.test.cjs` — focused assignment/inventory/fixture regression tests and source review assertions.
11. `tests/engineer-preview-isolation.test.cjs` — subprocess guard rejecting database imports and SQL file reads during preview startup.
12. `tests/dashboard-view.test.cjs` — stable site IDs in fixtures and strict Engineer demo expectations.
13. `tests/artifacts/engineer-assignment-correction-20261113/` — focused browser runner/driver, result JSON, Admin baseline, screenshots and verification metadata.
14. `docs/engineer-assignment-correction-20261113.md` — this report.

No SQL or database configuration file was changed. The older handoff snapshot's application code and the original checkout were not modified; the handoff workspace contains only task staging/artifacts.

## Validation

**33 JavaScript tests passed**:

```powershell
node --test tests/engineer-project-assignments.test.cjs tests/engineer-inventory-scope.test.cjs tests/global-search.test.cjs tests/dashboard-view.test.cjs
node --test tests/engineer-preview-isolation.test.cjs
```

**25 focused browser checks passed**, recorded in `tests/artifacts/engineer-assignment-correction-20261113/browser-results.json`. They covered Sky/Pau assignment separation, dashboard counts and project dropdowns, searches, inventory status/project filters and counts, unavailable equipment/project direct links, own custody at Casa, no-assignment empty state, deliberately broad reader responses, refresh, request Office availability, successful synthetic quantity submission, consumables project choices, Return Office destination, and Admin Projects/Inventory regression. Chrome reported zero uncaught exceptions and zero external network requests during that run. The previous 59-check/69-test suites were not repeated.

Screenshots, captured and visually inspected:

- `tests/artifacts/engineer-assignment-correction-20261113/sky-projects.png`
- `tests/artifacts/engineer-assignment-correction-20261113/sky-inventory.png`
- `tests/artifacts/engineer-assignment-correction-20261113/no-assigned-projects.png`

Inventory intentionally still shows **Synthetic Own Custody Drill at Casa Buena**, held by Sky. **Synthetic Casa Available Drill** and Office stock are absent from Sky's Inventory. Casa Buena has no Sky project card, statistics, dropdown option or accessible project details.

## Backend dependency and restriction disclosure

Source review of pending `supabase/drafts/engineer-ui/00-engineer-inventory.sql` confirmed v2 already uses `assigned_engineer_id=p.id`, excludes the configured Office ID for available stock, checks active/nonarchived assigned sites and preserves `current_holder_id=p.id`. No additional SQL draft change is necessary for this correction. Live v2 installation, actual profile/site assignments, authenticated RPC behavior and RLS remain **unverified**. Existing live UI fails closed if v2/Office metadata is unavailable. Backend integration needs a separately authorized review; nothing was deployed or migrated.

One initial browser check inadvertently reached the **previous local database-backed fixture**: the first replacement process had failed with `EADDRINUSE`, and the initial PowerShell listener lookup had returned no results. That old process was then identified with `netstat`, stopped with its helpers, and replaced. All 33 passing JavaScript tests and the final 25 browser checks described above used no database execution. The preview startup guard confirms the current command loads no database modules and reads no SQL files. No Production or Staging service was contacted, and there were no migrations, deployments or Git operations.

**Stop point:** correction implemented and isolated preview available. Engineer acceptance is not complete; no other role implementation will proceed without the user's approval.
