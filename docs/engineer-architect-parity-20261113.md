# Engineer/Architect accepted-side parity ? 13 November 2026

## Outcome and acceptance

Engineer and Architect now use the same accepted Engineer-side modules, navigation, presentation and access decisions. Their actual profile roles, project assignments and custody IDs remain separate. No Architect redesign or separate Architect development phase was introduced.

Admin and Engineer UI were manually accepted by the user before this task. Their acceptance remains intact. Local Engineer/Architect parity conforms to that accepted baseline under synthetic validation and awaits the user's confirmation. Live backend parity remains dependent on the unexecuted inventory-reader draft below.

Workspace: <LOCAL_USER_HOME>\OneDrive\Desktop\Codings\VS Code\MCPA-development-review\antigravity-admin-ui-work. Branch supplied by the user: feature/admin-pdf-updates-20261111. No Git command was used.

## Differences discovered and corrections

| Area | Previous difference | Implemented parity |
| --- | --- | --- |
| Permissions | Duplicate Engineer/Architect route/action lists; Architect alone allowed retired-equipment-v2 | Shared fieldRoutes/fieldActions; both deny retired history and Admin-only modules/actions |
| Sidebar | Engineer had direct Consumables, Activity and Settings entries; Architect retained grouped entries | Both use the same operational-role navigation and grouping; retired-history source entry removed |
| Dashboard | Engineer-only activity reference formatting and strict equipment-to-project ID association | Both use accepted activity formatting and association by site IDs; identity badges still show the actual profession |
| Projects | Client-side full-response scoping, Office verification, detail/scope guards and strict demo behavior applied only to Engineer | Both scope sites, equipment statistics and history before storage, counts, search and detail access; project membership requires assigned_engineer_id matching the authenticated profile ID |
| Inventory | Architect used the custody-only personal reader, wider status choices and custody-location project choices | Both use the accepted version-2 inventory reader and selection helper, Available/My custody filters, assigned-project choices, counts and details |
| Search | Architect used the older inventory source and demo name-based fallback | Both use the scoped v2 reader, fail closed without its metadata, and apply the same ID-based Engineer-side scope before indexing |
| Requests | Engineer-specific healthy refresh suppression and loading retry behavior | Both reuse the accepted unified and quantity-request components with the same control behavior and feedback |
| Transfers | Architect lacked the accepted Engineer transfer-workspace class and healthy refresh/retry behavior | Both use the same centered responsive dialog and controls; existing recipient/accountability rules are retained |
| Returns | Architect retained a destination dropdown and refresh toolbar | Both use the verified Office ID in a hidden input with fixed Office text and accepted loading/error recovery |
| Consumables | Architect retained extra descriptions and healthy refresh controls | Both use the accepted three tabs, concise presentation and refresh/error controls |
| Repairs and Missing | Already shared operational permissions and modules | Retained; no new management or Admin recovery privileges granted |
| Activity, Settings and notifications | Shared modules already existed; sidebar/dashboard presentation differed | Shared modules retained and navigation aligned; actual account profile/role remains visible |
| Offline demo | Architect's internal context was rewritten to engineer | Preserve the actual role; shared operational capability permits equivalent accountable actions |
| Backend inventory contract | Pending v2 reader explicitly rejected Architect | Added a separate UNEXECUTED role-guard parity draft; original draft preserved |

The existing MCPAPermissions.operational capability is used for common behavior. Frontend access does not depend on names, preview account keys or hardcoded synthetic identities. The retained engineerInventory helper/RPC names identify existing interfaces; both roles now use them.

## Authorization boundaries

- Project authorization: sites.assigned_engineer_id ? profiles.id. Equipment custody, labels, activity and site-associated assets do not confer project membership.
- Inventory: eligible available individual assets at assigned active/nonarchived, non-Office projects, plus legitimate own-custody assets. Another person's custody and unrelated available stock are excluded.
- Own custody at an unassigned project remains visible without granting access to that project.
- Request catalogs retain Office stock availability. Inventory filtering does not narrow request stock groups.
- Both roles have identical route/action decisions and deny Retired Equipment History, Admin retirement, People management, company procurement/report modules and Admin approval/release/recovery actions.
- The authenticated identity remains the actual account. No role impersonation, server authorization bypass, RLS change or live privilege change was made.

## Synthetic evidence

Sky is assigned only to Sky Assigned Project and sees SYN-001 available stock plus SYN-004 in own custody at Casa Buena. Architect is assigned only to Architect Assigned Project and sees SYN-009 available stock plus SYN-010 in own custody at Casa Buena. Casa belongs to Pau. Each project also contains a different custodian's item and a repair item to exercise exclusion from personal Inventory while preserving authorized project reference statistics.

The JavaScript-only fixture model now supports independent assigned projects, custody and confirmed consumable issuances for both accounts. Scoped synthetic quantity/specific requests, transfer submission/cancellation/acceptance, return submission, Repair/Missing reporting, profile and monitoring contracts permit focused local UI validation. These models are not substitutes for live transactional/RLS tests. Unsupported synthetic operations remain explicit errors.

No database module or SQL execution is involved in the preview. It binds only 127.0.0.1:4183, uses offline configuration and a local SDK transport, and sends connect-src 'self'. Chrome validation blocked external requests and reported none.

## Validation

65 distinct JavaScript tests passed:

- 33 existing focused tests: assignment, inventory scope, dashboard, global search and preview-startup isolation.
- 15 Engineer/Architect parity tests: routes/actions/navigation, per-account scope, name/Office rejection, reassignment/empty scope, inactive identities, requests, transfer custody, Office returns, issues/consumables, settings/monitoring, demo roles and draft-only verification.
- 17 existing browser-memory demo-store tests, relevant to replacing its role alias with the shared capability.

Commands:

    node --test tests/engineer-project-assignments.test.cjs tests/engineer-inventory-scope.test.cjs tests/global-search.test.cjs tests/dashboard-view.test.cjs tests/engineer-preview-isolation.test.cjs
    node --test tests/engineer-architect-parity.test.cjs tests/movement-store.test.cjs

52 focused browser checks passed, recorded in tests/artifacts/engineer-architect-parity-20261113/browser-results.json. This includes:

- 14 accepted-source replay comparisons: nine Engineer screens and five Admin screens produced identical rendered module/navigation markup against the same synthetic data using preserved pre-change source.
- Both roles' navigation and denial of retired/Admin routes; project assignment/details, Inventory rows/dropdowns/status/search/counts; Repairs/Missing entry states; both request-method entry points and successful quantity submission; transfer creation/cancellation; fixed Office return and successful submission retaining custody pending inspection; issued consumables, Activity/export, Settings/photo readiness; missing-reader fail-closed behavior; responsive dialogs and clean browser/network state.

Replay used the offline SDK/configuration even when serving preserved source. No real backend was contacted. The prior large browser/database suites were not repeated. Database-containing test files were not executed; only their isolated loader setup was adjusted where the shared capability became a dependency.

The successful browser run reported zero uncaught exceptions and zero external requests. Desktop and 712 px captures were visually inspected. All application CSS files remain unchanged.

## Preservation evidence

Before editing, current application source was copied into a new task-specific before/ folder and hashes were recorded. Existing backups and earlier review artifacts were not changed.

All server source files and all nine pre-existing files under supabase/drafts remain byte-identical to the captured baseline. Among Admin portal files, only the shared sites/sites.js guard was generalized from Engineer to the common operational capability; its Admin cards/counts/rendering matched the preserved source. Other Admin portal files are unchanged. Engineer rendering matched the accepted source across Dashboard, Projects, Inventory, Requests, Transfers, Returns, Consumables, Activity and Settings.

See baseline-sha256.json, source-verification.json and the before/ directory under the parity artifact folder. These preserve current local work without relying on Git resets or rewriting historical evidence.

## Files modified or added

Application role-policy adaptations:

1. public/app/core/permissions.js
2. public/app/core/navigation.js
3. public/app/core/integration.js
4. public/app/features/projects/project-scope.js
5. public/app/portals/admin/sites/sites.js ? shared Projects component, Admin behavior preserved
6. public/app/features/dashboard/dashboard-view.js
7. public/app/features/movements/movement-overview.js
8. public/app/features/search/global-search.js
9. public/app/features/custody-lifecycle/composer.mjs
10. public/app/features/custody-lifecycle/transfers.mjs
11. public/app/features/equipment-requests/unified.mjs
12. public/app/portals/engineer/quantity-requests/index.js
13. public/app/portals/engineer/consumables-requests/consumables-requests.js
14. public/app/features/movements/movement-store.js

Preview and tests:

15. tests/engineer-assignment-preview-fixture.cjs ? separate Architect fixtures and scoped JavaScript-only contracts
16. tests/engineer-assignment-preview.cjs ? role-switcher guidance and accepted-baseline status
17. tests/engineer-architect-parity.test.cjs ? new parity tests
18. tests/engineer-project-assignments.test.cjs ? capability loader and expanded fixture expectations
19. tests/engineer-inventory-scope.test.cjs ? capability loader
20. tests/dashboard-view.test.cjs ? capability loader and strict Architect demo expectation
21. tests/admin-equipment-summary.test.cjs ? capability loader only; database-containing suite not executed
22. tests/movement-cancellation.test.cjs ? capability loader for its demo-memory case only; database-containing suite not executed
23. tests/movement-store.test.cjs ? capability loader

Unexecuted backend draft and documentation:

24. supabase/drafts/engineer-ui/01-engineer-architect-parity.sql
25. supabase/drafts/engineer-ui/01-engineer-architect-parity.md
26. docs/engineer-architect-parity-20261113.md ? this report

Evidence added under tests/artifacts/engineer-architect-parity-20261113/: baseline/manifest files, preserved source, isolated browser driver and runner, results, preview logs and screenshots. changed-files.json lists the implementation/test/draft/doc files.

## Remaining backend-only dependency

The existing pending 00-engineer-inventory.sql requires an Engineer role. The new 01-engineer-architect-parity.sql retains its function signature, response version 2, assignment/custody/Office filtering, security-definer search path and authenticated-only privilege shape, while accepting both Engineer and Architect. No tables, RLS policies or write procedures are changed. Original draft 00 is untouched.

A later separately authorized backend review must verify actual installed definitions, identity helpers, Office mapping, supporting inventory-lock/custody functions, existing function privileges and real account assignment/custody separation before considering 00 ? 01 installation. Nothing was installed here. Until the approved reader accepts Architect, the live UI will fail closed for that account instead of falling back to broad inventory data.

Available PHP permissions and the current common movement/custody/project contracts already group Engineer and Architect. Legacy SQL internals that name engineer are reached through the authenticated operational adapter; historical SQL was not rewritten or executed. Real RPC/RLS, hosted Auth/Storage, concurrent transactions and provider behavior remain unverified and deferred.

## Manual preview and stop point

- Engineer: http://127.0.0.1:4183/index.html?fixture=sky#dashboard
- Architect: http://127.0.0.1:4183/index.html?fixture=architect#dashboard
- Fixture controls: http://127.0.0.1:4183/__fixture

Use #sites or #masterlist for direct Projects/Inventory review. Both roles share one UI; their synthetic records differ by authenticated identity. The preview is left running with fresh fixture state after test actions are reset.

From the authoritative workspace, restart with:

    node tests/auth.browser.cjs --ui-preview --admin-pdf

This command branches to the JavaScript-only server before database imports. No Production/Staging connection, migration, SQL execution, Render action, Git operation or original-checkout modification occurred. Existing verified backup evidence was preserved.

Stop after this parity handoff. Await the user's confirmation; do not start a separate Architect development phase.
