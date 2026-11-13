# MCPA2.0 development collaboration

Construction asset management and accountability application: browser UI, PHP API adapter, Supabase integration sources, synthetic fixtures and pending SQL review drafts. This repository is a clean development snapshot with no inherited Git history. It is not a deployment approval.

## Accepted baseline

| Role | Status |
| --- | --- |
| Admin | Manually accepted; preserve functionality and navigation |
| Engineer | Manually accepted; preserve functionality and authorization boundaries |
| Architect | Shares the Engineer side; parity locally validated, final owner confirmation pending |
| Secretary | Existing implementation; manual UI review pending |
| Tool Handler | Existing implementation; manual UI review pending |

Engineer and Architect have the same modules and access policy, with separate actual project assignments and custody. Project membership requires sites.assigned_engineer_id referencing profiles.id. Inventory includes available equipment in explicitly assigned non-Office projects plus legitimate own custody. Custody does not grant project membership. Both roles exclude Retired Equipment History. Office stock remains available to the Equipment Requests calculation.

## Begin safely

Requirements: Node.js 22 or newer, npm. The isolated UI preview and focused frontend tests use Node built-ins and need no database, PHP, environment file, credentials or package installation. Install locked dependencies when continuing development:

~~~sh
npm ci
npm run preview
~~~

On Windows, use npm.cmd if PowerShell blocks npm.ps1. Open:

- Role switcher: http://127.0.0.1:4183/__fixture
- Engineer: http://127.0.0.1:4183/index.html?fixture=sky#dashboard
- Architect: http://127.0.0.1:4183/index.html?fixture=architect#dashboard
- Admin: http://127.0.0.1:4183/index.html?fixture=admin#dashboard

The switcher also offers synthetic Secretary, Tool Handler, a second Admin, and other Engineers. Query parameters select separate fixture accounts. State resets on restart. Use Ctrl+C to stop. Change PORT if occupied (PowerShell: $env:PORT='4184'; npm.cmd run preview). Keep the terminal open for manual review. The original preview command, node tests/auth.browser.cjs --ui-preview --admin-pdf, still branches to the same JavaScript fixture server before database imports.

The server binds 127.0.0.1, replaces the live SDK/config with local fixtures, denies PHP execution, and restricts browser connections through a self-only CSP. It cannot connect to Production or Staging. The checked-in normal browser configuration throws an unconfigured error; .env.example has blank connection values. No live configuration is provided.

## Focused frontend validation

~~~sh
npm run test:frontend
node tests/isolation-check.cjs
~~~

These frontend tests block database module imports and non-loopback network connections. Do not use npm test, npm run verify, browser/Auth/database/Docker suites as a substitute for this focused check: broader suites have different local dependencies. No migration or SQL execution is needed for the preview or focused frontend tests.

## Application and integration

Modules include dashboard, Projects/accountability, equipment inventory/details, requests and allocation, transfers and receipt, Office returns and inspection, repairs, missing equipment, consumables and usage, procurement, reports, activity/notifications, settings/profile and account management. Modules are role gated; ordinary field users do not gain Admin modules. See docs/DEVELOPMENT-HANDOFF.md for status, risks and tasks.

Future PHP integration requires PHP 8.2+, cURL, JSON, fileinfo, mbstring and sessions; no Composer packages. npm start runs the PHP host on loopback port 4173 and fails when configuration is missing. npm run configure writes browser config from authorized environment settings. npm run doctor contacts configured Supabase Auth. Do not run configure/doctor with a live environment during UI-only development. All remote integration, Auth/email configuration, migrations, Storage, RLS/RPC validation and deployment require separate owner approval; never use Production.

All files under supabase/drafts are UNEXECUTED local review drafts. Existing migrations/bootstrap/operations/checks are historical sources, not evidence of applied database state or permission to execute them. No automatic deploy workflow is included. Render and Staging setup remain deferred.

Preserve accepted Admin and Engineer UI. Architect is the same side, not a new redesign. Do not change the original repository or its Draft PR #2.
