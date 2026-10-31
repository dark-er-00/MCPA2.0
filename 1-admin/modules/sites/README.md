# Projects module

Projects uses existing `public.sites` IDs, profile assignments and equipment
`site_id` links. Admins create/edit/archive/restore projects. Engineers and
Architects use the existing assigned-project RPC; Tool Handlers retain their
existing read visibility. Demo projects remain read-only.

## Construction tracking upgrade (2026-10-23)

The editor includes Project Stage and Current Work Area. Operational status is
kept internally: metadata saves omit it, and the existing save RPC defaults new
projects to `planning`. Archive/restore uses `is_active` independently.
Work-area tracking is explicitly configured per project, with six independent
completion percentages, scope weights, applicability and notes. Applicable
weights must total exactly 100%. The database calculates Construction Completion
to two decimals. Legacy `progress` and `phase` are preserved.

Project History displays immutable old/new values, recorded actors, timestamps,
reasons, site updates and correction references. Search and event filters are
available. Corrections append entries. Archive/restore preserves references.
Saves use server authorization, a project revision and an idempotency key.

Read the [engineering report and manual deployment instructions](../../../documentation/project-construction-2026-10-23/REPORT.md)
before rollout. This upgrade has **not** been applied to production.

## Database deployment

The files in this module (`setup.sql`, `prototype-access.sql`,
`realtime-archive.sql`) are historical prototype/fixture sources. **Do not rerun
them over an authenticated installation.** They can restore public prototype
policies or introduce legacy baseline records. A permissions error is not an
instruction to rerun those files.

Use the [manual migration gate](../../../supabase/migrations/README.md).
For an existing authenticated installation with reviewed project history:

1. Review `supabase/project-construction-preflight.sql` results.
2. Manually apply only `supabase/migrations/202610230002_project_construction.sql`.
3. Review `supabase/project-construction-verify.sql` and compare fingerprints.
4. Roll out the frontend after database and staging verification.

Missing or nonstandard prerequisites require separate schema review. Do not
replay the historical migration directory or bypass RLS.

## Equipment and movement

This module reads equipment, quantities, holders and existing movement records.
Project saves only modify site metadata. They do not transfer equipment, change
custody, stock, requests, purchases, or movement records. Foreign keys retain
historical project references. Archive uses `is_active`/`archived_at` independently
of lifecycle stage. Existing Realtime/polling behavior remains; an open editor
is not replaced by background updates.

## Verification

From `tests/`, run:

```powershell
npm.cmd run test:project-construction
npm.cmd run test:projects
npm.cmd test
```

The harness uses isolated PGlite PostgreSQL and local Chrome transport with
external HTTPS blocked. No production accounts or records are fixtures.
On this Windows runner Chrome requires `MCPA_CHROME_NO_SANDBOX=1`; this is a
local test setting, not an application or deployment setting. Results and
screenshots are linked in the engineering report.
