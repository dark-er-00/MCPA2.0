# Admin Projects construction and history upgrade

Prepared locally on `Updated-MCPARole`, October 23, 2026 (Asia/Manila).
No commit, push, deployment, production SQL, production account use, or live
inventory modification was performed. Production has not been migrated.

## 1. Implementation summary

The Projects interface retains existing typography, light/dark tokens, gold
accents, native dialogs, route IDs and inventory controls. The editor groups
Project Information, Construction Lifecycle, Construction Progress and Project
Update. One expandable progress editor keeps all six areas in the same save.

* **Project History:** permanent newest-first timeline, readable old/new field
  differences, recorded actor, Manila timestamp, optional reason and actual
  references. Search covers people, changes, values and notes; event filters
  come from actual history. Legacy snapshots are labeled as snapshots. Missing
  actors/values/timestamps say they were not recorded.
* **Add Site Update:** Admin-only update type, required description and optional
  work area. Supports inspections, milestones, delay, work started/completed,
  safety, suspension/resumption, corrections and other updates. “Add a correction”
  appends a linked event and retains the original.
* **Current Work Area:** the six exact requested labels. Original free-text
  `phase` stays visible and unchanged. There is no automatic mapping; matching
  values can be deliberately selected and unmatched values remain for review.
* **Project Stage:** the five exact requested labels and a truthful “Not recorded”
  option for legacy projects. Operational status and archive remain independent.
* **Construction Completion:** calculated only after explicit work-area
  configuration. The total percentage has no arbitrary editable input. Original
  completion remains visible even after weighted tracking is configured.
* **Editing safety:** captured revision, disabled submission controls, retry
  keys, useful validation, escaped content, native keyboard focus containment,
  Escape cancellation and focus restoration after background rerendering.

## 2. Changed files

Existing files modified:

| File | Purpose |
|---|---|
| `1-admin/modules/sites/sites.js` | RPC saves, editor, live preview, history, site updates, focus restoration |
| `1-admin/modules/sites/sites.css` | Scoped sections/progress/timeline, mobile controls, theme support |
| `1-admin/modules/sites/README.md` | Current workflow; replaces unsafe historical prototype deployment advice |
| `supabase/migrations/README.md` | Projects manual migration gate |
| `tests/auth-test-db.cjs` | Allowlisted local RPC signatures |
| `tests/auth.browser.cjs` | Opt-in upgraded fixture and browser checks |
| `tests/package.json` | `test:project-construction` command |

New source/SQL files:

* `supabase/migrations/202610230002_project_construction.sql`
* `supabase/project-construction-preflight.sql`
* `supabase/project-construction-verify.sql`
* `tests/project-construction-fixture.cjs`
* `tests/project-construction.test.cjs`
* `tests/project-construction.browser-checks.cjs`

Review artifacts in this directory:

* `REPORT.md`
* `upgrade-tests.log` (complete final targeted command)
* `database-tests.log`, `browser-tests.log` (split copies of the final output)
* `legacy-project-tests.log`, `main-tests.log`
* `screenshots/projects-edit-{375,1440}-{light,dark}.png` (4 files)
* `screenshots/projects-progress-{375,1440}-{light,dark}.png` (4 files)
* `screenshots/projects-history-{375,1440}-{light,dark}.png` (4 files)
* `screenshots/projects-site-update-{light,dark}.png` (2 files)

Pre-existing untracked Consumables/Purchase logs and screenshots were left
intact. No already-applied migration was edited.

## 3. Database changes

The new migration is a single transaction with prerequisite guards, a 5-second
lock timeout and a 30-second per-statement timeout. It contains no legacy-row
UPDATE, baseline history insertion, stock/custody DML, policy replacement or
destructive DDL.

### `public.sites`

| New column | Purpose / constraint |
|---|---|
| `project_stage text NULL` | CHECK for five lifecycle labels |
| `current_work_area text NULL` | CHECK for six primary work-area labels |
| `construction_work_areas jsonb NULL` | Fixed six-area value aggregate; NULL means unconfigured |
| `construction_completion numeric(5,2) NULL` | Derived metric, CHECK 0–100 |
| `project_version bigint NOT NULL DEFAULT 1` | Positive server-maintained revision |

Each area contains exactly `completion`, `weight`, `applicable`, `note`.
All six known area keys are required. Percentages must be JSON numbers from
0–100 with at most two decimals; applicability is boolean and notes are strings
of at most 1,000 characters. Missing/extra keys and invalid types are rejected.

The six bounded records are one project-owned value aggregate. JSONB avoids a
second independently writable progress table: the complete scope is validated,
calculated, revision-checked and audited with a single row change. It prevents
transient invalid weight totals and avoids duplicate child/parent audit
mechanisms. History and retry operations remain separate relations. Future
preconstruction/turnover milestones can be modeled separately without changing
the meaning of construction completion.

### Existing `public.project_history`

Adds `reason text` (maximum 4,000 characters), `site_update_type text`, nullable
`work_area text` with the six-area CHECK, and `correction_of uuid` with a
restrictive self-FK. The RPC restricts site update types and verifies corrections
belong to the same project. Existing IDs, project references, timestamps, event
types, before/after JSON and actor fields keep their meanings and values.
Existing history indexes remain. No new read policy is necessary.

### Functions, triggers and internal operations

| Object | Purpose |
|---|---|
| `mcpa_construction_completion(jsonb)` | Immutable NUMERIC validator/calculator |
| `project_validate_construction()` | BEFORE trigger function deriving completion/revision; prevents discarding configured tracking |
| `project_construction_validate` | New BEFORE INSERT/UPDATE trigger on `sites` |
| `project_record_history()` | Extended existing function; existing AFTER trigger captures one event per meaningful site-row change |
| `project_history_no_truncate` | Added only if absent; uses the existing immutable guard |
| `mcpa_auth_private.project_operations` | UUID retry key, actor, exact request, saved response and trusted timestamp; no browser access |
| `mcpa_save_project(uuid,bigint,uuid,jsonb,text)` | Atomic Admin create/edit/progress/archive/restore with revision and retry checks |
| `mcpa_add_site_update(uuid,uuid,text,text,text,uuid)` | Atomic Admin immutable site note/correction with retry checks |

Existing timestamp/capture/row-immutability triggers, RLS and Engineer snapshot
remain installed. Unexpected site triggers, missing immutability/capture,
public/anonymous policies, unexpected legacy column types or an already-present
upgrade cause failure and rollback.

## 4. Project History design

Future events capture full old/new site snapshots, including area measurements,
weights, applicability, notes and calculated completion. Types identify creation,
name/location, assignment, legacy phase/completion, stage, current work area,
operational status, archive/restore, inventory check, construction progress and
weight changes. One multi-field save creates one event with multiple types.
Timestamp/revision-only saves create no audit event.

Actors are resolved server-side through the existing `identity()` helper and
`profiles.auth_user_id = auth.uid()`. Events snapshot stable `profiles.id` and
the name at that time. RPC callers cannot supply history IDs, actors or
timestamps. SQL maintenance without an Auth identity does not invent an actor.
Reasons are transaction-scoped and captured by the same trigger as the change.

Site updates append to the same store without changing unrelated project fields.
Corrections reference an event on that project and never replace it. No history
row has edit/delete controls. Grants and triggers deny UPDATE, DELETE and
TRUNCATE, including owner-level DML in the fixture. A database superuser can
administratively change DDL/triggers; this is not protection against a hostile
DBA.

History is read in 500-row pages ordered by timestamp and ID, then displayed
newest-first. Engineer/Architect snapshots preserve current assignment-based
scope. Tool Handler/Admin direct reads retain their existing RLS. Old history
and missing information are not rewritten or reconstructed.

## 5. Completion calculation and legacy compatibility

`Construction Completion = round(SUM(completion × weight / 100), 2)`

PostgreSQL uses NUMERIC. The frontend converts inputs to integer basis points,
sums integer products, and performs one half-up rounding step matching the
database. Both accept at most two decimal places; display omits trailing zeros.
Applicable weights must total **exactly 100%**. N/A areas retain their measurement
and note but require zero weight. Admins deliberately redistribute remaining
weights; no silent normalization occurs. Applicable zero-weight areas are valid.

Starting weights 30/15/15/10/10/20 are explicitly illustrative, configurable per
project, and never asserted as standards. Completions 100/40/60/0/0/0 give
`30 + 6 + 9 = 45%`. Tests also cover a 41.76% decimal result, 50% after N/A
redistribution, and 0.005% rounding up to 0.01%.

Installation leaves every legacy `progress` integer, `phase` string, name,
location, assignment, operational status and archive field unchanged. Tracking
is NULL until an Admin explicitly enables it and saves valid measurements.
New projects keep old column defaults for old consumers. Construction reaching
100% never changes stage or status. No overall-lifecycle completion percentage
is invented or substituted in reports/dashboard metrics.

Existing API consumers can keep the old fields/direct Admin site writes under
unchanged RLS. The new triggers still validate the aggregate, bump revisions
and audit real changes from old clients. Their `updated_at` optimistic checks
continue working. Snapshot keys remain; `to_jsonb(s)` includes additive columns.
Equipment assignments, request eligibility and role-specific visibility still
use original IDs, `is_active`, `archived_at` and existing permission helpers.

## 6. Security and concurrency review

* RPCs require an active authenticated Admin via the existing identity helper.
  Engineers, Architects, Tool Handlers, Secretaries, inactive users and anonymous
  callers cannot save projects or add site events through these RPCs.
* New/reassigned projects require an active Engineer/Architect profile; display
  names come from that profile. Existing unlinked assignments may be retained.
  The UI keeps the existing narrow profile SELECT grants. Active-account
  enforcement remains server-side; selecting an inactive profile is rejected.
* SECURITY DEFINER functions use an empty search path and qualified relations.
  PUBLIC/anon execution is revoked. Authenticated execution is granted on the
  two RPCs and calculator only; trigger functions are not browser-callable.
* Browser audit INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges are
  revoked. Guards also inspect inherited table/column write privileges. Existing
  row immutability and the truncate guard reject direct DML independently.
* The retry ledger uses the existing unexposed private schema with no browser
  grants. No broad new policy or profile grant is introduced.
* Mutations reserve/lock a UUID operation row. Retries must match both actor
  and exact request, then return the prior response. A different request using
  that key is rejected. Actor authorization is checked again before replay.
* Edits lock the project row and compare `project_version`. Every update,
  including old-client writes, gets a server revision. Stale saves return
  `40001`; the UI asks for reload/reapplication and never silently retries a
  stale patch. Clients cannot supply the resulting revision or derived total.
* Site metadata, calculation, history and operation response commit or roll
  back together. Invalid requests leave no partial operation or history.

## 7. Exact verification results

Commands ran from `tests/` using existing dependencies. PowerShell blocks
`npm.ps1` on this host, so `npm.cmd` was used. Chrome needed the existing test
runner's no-sandbox option. This only affects disposable local test Chrome; no
application setting changed. The browser harness blocks external HTTPS.

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
npm.cmd test
npm.cmd run test:projects
npm.cmd run test:project-construction
```

| Command/check | Final result |
|---|---|
| `npm.cmd test`: Node test phase | 67 passed, 0 failed |
| Same command: movement database runner | All 8 isolated scenarios passed |
| Same command: Auth/main browser | Passed, including roles, equipment/request/transfer/return, navigation, themes and mobile |
| `npm.cmd run test:projects` | 3 passed, 0 failed; legacy schema/RPC/error/visibility browser checks passed |
| `npm.cmd run test:project-construction` | 12 passed, 0 failed: 9 new integration tests plus 3 history regressions; new browser workflow passed |
| New browser responsive matrix | All 12 combinations passed: 375/393/430/768/1024/1440px × light/dark |
| `node --check 1-admin/modules/sites/sites.js` from repository root | Passed |
| `git diff --check` | Passed; ordinary LF/CRLF repository notices only |

New integration tests cover creation, correct old/new values and actors,
subsequent-history preservation, archive/restore, site notes/corrections, exact
stage/area persistence, invalid inputs, weighted/custom/decimal/N/A arithmetic,
legacy preservation, role boundaries, denied direct history mutation, rollback,
retry deduplication, no-op updates, old-client updates, stale revisions, and
execution of read-only pre/postflight scripts with matching fingerprints.

The coexistence fixture installs receipt compatibility, Purchase Ledger and
Consumable categories/SKUs/archive before Projects. It checks unchanged equipment,
stock/movements/requests, purchases/history, storage objects, equipment movements
and operation records, profiles, and every existing RLS policy. Restocking and
an assigned Engineer equipment request still succeed after the new migration.

Browser checks cover immediate 45%/41.76%/N/A previews, invalid totals, save/reload,
duplicate submissions, stale save rejection and a lost response **after COMMIT**
followed by a retry creating exactly one site update. They also cover escaped
long notes, filters, linked corrections, archive/restore, creation, Engineer
read-only history, page/modal overflow, Escape and return focus. Fourteen
screenshots were retained; representative desktop/mobile edit, progress and
history views were visually inspected.

Development failures in SQL local-variable naming, fixture field names/IDs,
browser reload targeting and focus restoration were corrected. Relevant final
suites were rerun; the retained logs contain final passing output. Browser
assertions are not counted as a fabricated numerical test total.

## 8. Exact manual deployment order

These are operator review instructions, not evidence or authorization of a live
deployment. The migrations folder is **not** an apply-all deployment queue.

1. Preserve a backup/PITR recovery point and arrange a short quiescent interval
   for comparable before/after fingerprints. Review the existing
   [manual migration gate](../../supabase/migrations/README.md). Keep the old
   frontend until database verification passes.
2. Run **`supabase/project-construction-preflight.sql`** as database owner. It
   runs in a read-only transaction. Retain columns/defaults, constraints,
   triggers, function bodies, RLS, effective privileges, phase/status counts
   and legacy data fingerprints.
3. Review actual deployed definitions. Require authenticated identity/role
   helpers, `sites`, immutable `project_history`, its capture trigger, and the
   Engineer project snapshot. Confirm no public/anonymous policies, unknown site
   triggers, unexpected column definitions or pre-existing upgrade. If history
   is missing, stop for the separately reviewed history dependency preflight and
   repair process. **Do not rerun prototype setup or auto-apply the old history
   migration.** This upgrade does not fabricate prerequisite history.
4. Manually apply **only**
   **`supabase/migrations/202610230002_project_construction.sql`** after the
   authenticated Projects/history prerequisites. Do not rerun Consumables,
   Purchases, Storage, or any historical migration. Rerunning this new migration
   intentionally fails rather than attempting partial repair.
5. Run **`supabase/project-construction-verify.sql`** before allowing new project
   writes. Compare legacy counts/fingerprints with preflight. Initially configured
   projects and calculation mismatches must be zero; minimum revision is 1
   (NULL minimum is valid for an empty table). Browser audit/operation write and
   trigger-execute checks must be false. Only authenticated callers have the
   save/site-update RPCs. Inspect enabled triggers and unchanged RLS. Concurrent
   legitimate equipment writes can change its hash; investigate the difference
   instead of ignoring it or assuming data loss.
6. Verify real JWT/PostgREST access in isolated authenticated staging, including
   all roles and two independent Admin database sessions. Confirm schema cache
   refresh; the migration sends `NOTIFY pgrst, 'reload schema'`.
7. Manually roll out reviewed frontend JS/CSS through normal GitHub Pages
   release procedures only after database/staging verification. Clear relevant
   asset caches. An early frontend deployment reports a configuration error,
   without falling back to arbitrary construction percentage writes.
8. Review production data read-only under authorized real roles. Configure
   measured tracking only as a deliberate business action with verified scope
   and measurements, never as disposable test activity.

### Locking and recovery

Installation locks sites/history; ALTER TABLE takes stronger locks that may
briefly block readers/writers until COMMIT. Use a quiet window. Lock and
statement timeouts roll back rather than wait indefinitely. Nullable additions
and a constant revision default need no legacy value conversion; actual timing
depends on deployed PostgreSQL/catalog/workload. Fingerprints aggregate existing
rows and may be expensive on a large history table; plan operator resources.

A failed migration transaction rolls back additions. Review drift before
retrying; do not weaken guards. If frontend rollout fails, restore the prior
frontend and keep the additive database upgrade. Old fields, Admin writes,
snapshot keys and audit capture stay compatible. Do not drop new columns or
delete events after use. Recovery after accepted updates needs a reviewed
forward fix or backup/PITR plan preserving those updates. Retain preflight
function definitions and an exact operator deployment log for that review.

## 9. Outstanding risks and staging checks

* No live Supabase catalog was queried. Repository definitions are the
  architecture evidence; actual deployed definitions remain a manual preflight
  gate. Production has not been migrated by this task.
* PGlite executes real embedded PostgreSQL with a serialized fixture connection.
  Competing stale requests are verified; independent sessions, lock waits,
  deadlocks and production traffic latency require staging. Production SQL uses
  operation/project row locks and revision checks for that multi-session path.
* Browser transport models Supabase Auth/PostgREST while running real local RPCs
  and RLS. Deployed JWT expiry/revocation, API exposure, schema caches and
  Realtime publication still require authenticated staging. Existing periodic
  refresh remains; opening history fetches current authorized records.
* History is fetched in pages but filtered in memory. Very large histories may
  eventually need a server-filtered RPC and incremental rendering; no silent
  truncation was introduced.
* Retry records have no automated cleanup. Future retention work must preserve
  deduplication for the accepted retry window.
* Legacy baseline records and unknown actors remain as recorded. No missing past
  events are reconstructed. Phase review is deliberate and original completion
  is never treated as a measured construction percentage.
* Design tooling reported the pre-existing DESIGN.md sidecar as stale. Current
  workspace code/tokens remain visual authority. No global design metadata was
  repaired; Impeccable's `document` command can refresh it separately.
