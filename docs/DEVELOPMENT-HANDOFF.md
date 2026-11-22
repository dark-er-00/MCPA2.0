# Development handoff ? 2026-11-13

This snapshot comes from the current feature/admin-pdf-updates-20261111 working tree, including intended tracked and uncommitted source. Its independent Git history starts in the new private development repository. The authoritative workspace, original repository, verified backup and Draft PR #2 are outside this export and must remain untouched.

## Implementation and acceptance

Admin and Engineer UI are manually accepted. Engineer/Architect parity is locally validated and pending final owner confirmation. Secretary and Tool Handler are implemented roles awaiting their requirements and manual UI acceptance. Do not start a separate Architect redesign or infer live authorization from synthetic success. Historical dated review reports retain earlier checkpoints; this acceptance statement supersedes their pending Admin/Engineer acceptance wording.

Accepted implementation is in public/app/core, public/app/shared, public/app/features and public/app/portals/admin and engineer. Core permissions/navigation/router and shared workflow components serve the roles. Architect uses the Engineer components and central operational capability; account IDs, assignment IDs and custody IDs remain independent. Keep accepted CSS, layouts, validation, loading/error states and navigation unchanged unless separately approved.

### Modules for continued review

- Dashboard, Projects and project detail/accountability: explicit assignment; available/in-use/repair project counts can differ from the narrower actionable inventory.
- Inventory and tool detail: own custody or assigned-project available stock; exclude Office availability, other holders and unassigned-project availability. Search, filters, options, pagination and counts use the scoped dataset.
- Equipment Requests: simplified quantity/specific requests, approvals and release; Office stock participates in request availability.
- Transfers/receipt and returns: retain custody until authorized receipt/inspection; field returns use the verified Office destination.
- Repairs, Missing, Consumables/usage: account scope and authorized actions; no Retired Equipment History for Engineer/Architect.
- Notifications, Activity Logs, Settings/profile: shared components and real account identity.
- Admin-only inventory management, users, procurement, reports and retirement: preserve accepted permissions and UI.

### Known issue

The Tool Handler transfer snapshot can offer Cancel to the sending Tool Handler while its frontend permission action list allows createTransfer only. Review this mismatch during the approved Tool Handler phase; no fix is included here. Synthetic preview supports selected reviewed workflows, not every backend operation. Unsupported operations fail explicitly.

## Isolated preview and validation

Use npm run preview and the role links in README.md. This is tests/engineer-assignment-preview.cjs with tests/engineer-assignment-preview-fixture.cjs and tests/fixtures/offline-{config,sdk}.js. The fixture API is /__fixture-api, plain JavaScript in memory, with no PHP/database/SQL. Some older reports describe a prior /__db fixture: that is historical, not the current standalone preview. Fixtures have no real accounts, credentials or imported database rows. Accounts Sky and Architect have different assigned projects and own-custody drills at another project; those drills do not grant that project membership.

Use npm run test:frontend for the 65 focused frontend checks and node tests/isolation-check.cjs for fixture isolation. Database suites, browser integration suites, PHP tests and container tests remain available as sources but were not rerun for this handoff. The portable accepted-access regression uses three pre-parity source baselines in tests/fixtures/accepted-ui; generated source backups and previous browser screenshots/logs are excluded.

## Backend dependencies ? deferred

All supabase/drafts files are UNEXECUTED; copying them does not install them. Review only, no SQL execution in this handoff.

- Engineer/Architect inventory reader: engineer-ui/00-engineer-inventory.sql is the original scoped reader draft; 01-engineer-architect-parity.sql follows it and changes its role guard to include both roles, retaining its version-2 response and authorization filters. The accepted UI fails closed when the required reader is missing/incompatible. No live RPC/RLS compatibility has been verified.
- Admin PDF drafts: self-profile compatibility, guarded account removal, private profile pictures, registration invitations, preflight and rollback. Validate dependencies, authenticated privileges and current schema only in a separately authorized backend phase.
- Auth/email: invitation delivery, allowed redirects, SMTP/provider behavior, recovery, account orchestration and private Storage remain live-integration dependencies. No mail has been sent by this handoff.
- Staging migration ordering/state, identity mappings, Office binding, RLS/RPC enforcement, realtime, concurrency and end-to-end live QA remain unverified. No database state can be inferred from historical migrations.
- Render deployment/configuration and Production access remain prohibited. No deployment pipeline or live connection config is included. Historical docs/render-deployment.md is a deferred reference, not a startup instruction.

## Export-only differences and exclusions

- public/app/core/config.js now throws an unconfigured error; .env.example has blank values. No Production or Staging default. Existing server Config validation already rejects blank settings.
- Added npm preview/test:frontend commands, a portable preview launcher and frontend network/database guard. The dependency lock and dependency versions are unchanged.
- Relocated three accepted source baselines from excluded generated artifacts to synthetic test fixtures; adjusted their single test path.
- README rewritten; handoff and export audit reports added. Workstation home paths redacted in historical docs.
- Real company Office address removed from the manual Office SQL template (blank, fails validation). Historical Office UUID removed from migration/verification templates; the null migration binding fails closed until separately reviewed. Historical asset identifier replaced consistently with SYN-OFFICE-REVIEW in operational SQL, comments and related synthetic tests; it is not authorization to correct a real asset.
- Excluded old .git/history, node_modules, .agents/.codex machine tooling, supabase/.temp link metadata and tests/artifacts generated evidence/backups/logs. No .env/private override, database backup/export, private certificate or credential file is published. Existing browser vendor bundles/licenses and user-supplied login photographs are retained application assets.
- All 177 public runtime files match the accepted working tree byte for byte except the intentionally disabled public/app/core/config.js. All PHP/server files and all 11 pending-draft files are unchanged.

## Collaboration tasks

1. Clone the new private repository with an authorized GitHub account; install with npm ci and start npm run preview. No .env is needed.
2. Review this handoff and the dated Engineer/Architect parity report; obtain final parity confirmation.
3. Ask the owner for the next remaining role and requirements before modifying its UI. Reuse accepted components without changing accepted role behavior.
4. Plan a separately authorized backend preflight, draft review and isolated Staging integration; do not execute migrations or modify Auth/Render from this UI task.
5. Keep secrets and exports outside the repository, review diffs and run only relevant synthetic frontend checks for UI work. Never substitute a real connection for a missing fixture.
