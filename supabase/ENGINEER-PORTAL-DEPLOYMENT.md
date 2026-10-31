# Engineer / Architect portal update

Prepared locally. This work does not apply a live migration, deploy the frontend,
or alter live accounts, projects, custody, requests, handovers or history.

## Findings and compatibility

- Projects crashed because `assignedToMe(site)` read `project.assigned_engineer_id`.
  Its loading flag was marked successful before rendering completed.
- Engineer Projects now uses `mcpa_project_snapshot()`, which returns only assigned
  projects, actual accountable profile names, permitted equipment and project history.
  Admin-only project controls are removed from the Engineer/Architect DOM. Existing
  Admin-only database write policies remain in force.
- Personal Equipment Tracking calls only `mcpa_personal_equipment_snapshot()`.
  Tools are filtered by authenticated `profiles.id = equipment.current_holder_id`
  on the server, with relevant authorized movement history. Requests continue to
  use the existing separate authorized catalog through `mcpa_movement_snapshot()`.
- A project has **one** accountable profile (`sites.assigned_engineer_id`). There is
  no project membership relation. One person can be accountable for multiple projects.
  Based on the supplied screenshot, Engineer B currently has no receiving project.
  Admin must assign B an active receiving project. To preserve A's accountability
  for MCPA Development Transfer Test, use a separate project for B. Supporting both
  at that project would require a separately reviewed membership model; this update
  does not silently replace A or invent membership.

## Backend migration

### Current live Projects dependency issue

The reported `relation "public.project_history" does not exist` comes from the
history query inside `mcpa_project_snapshot()`. Its definition is in this migration,
but the history table and capture trigger originate in
`1-admin/modules/sites/setup.sql`, outside the numbered migrations. The authenticated
access migration configures history permissions only if that table already exists.
The portal migration neither creates the table nor checks that it exists.

An isolated reproduction confirms that the portal migration can commit and its four
installation checks can pass while the snapshot subsequently raises `42P01`. The
earlier fixture always installed the full Projects setup, masking that dependency.
No repository migration renames or removes the table. A successful transaction does
not imply that every PL/pgSQL query has executed successfully.

The supplied `Supabase Snippet Untitled query (5).csv` confirms that
`public.project_history` is absent, the snapshot is installed and references it,
and the review found no alternative project-history relation. The only custom site
trigger is `sites_updated_at`; history capture and its functions are absent. Site
RLS is enabled, anonymous access is denied, and authenticated site writes remain
limited to Admin by the existing policies. This confirms an uninstalled history
dependency in the current schema; it cannot prove whether it never existed earlier.

**Current manual gate:** run the entire
`supabase/migrations/202610100002_project_history.sql` once in the existing Supabase
SQL Editor. Send back its single `project_history_repair_verification` result.
Expected: table/RLS/capture/immutability/snapshot flags are true; `history_rows` is
zero unless a real project change occurs after COMMIT. Both browser roles have
`direct_write_granted=false` and `capture_function_execute=false`. Only authenticated
has SELECT and snapshot EXECUTE; history SELECT remains restricted by the
Admin/Tool Handler policy, while Engineers/Architects read only assigned-project
history through the existing snapshot.

The new migration creates the missing table and future-change audit triggers,
adds the existing authenticated history-read policy, and revokes browser writes.
Audit actors use permanent profile IDs resolved from authenticated login IDs.
Update, delete and truncate of history are blocked; there is no baseline or backfill.
All existing site records, defaults, constraints, policies and RPC definitions stay
unchanged. The transaction has short lock/statement timeouts, checks the reviewed
dependencies, and refuses to overwrite existing history or create a duplicate store.
If it reports an error, stop and share the error; do not work around a guard.

Do not rerun the portal migration or the old Projects setup. The old setup changes
project metadata/assignments, inserts baseline history and restores permissive
prototype policies. Its history actor lookup also predates the independent profile
identity model. The prepared repair retains current authenticated permissions and
resolves actors through the Auth-to-profile link. The snapshot's current history
reference is correct and requires no rewrite.

Local UI changes classify schema/RPC errors as configuration issues, sanitize
unexpected server errors, and retain only operation/error codes in console diagnostics.
The Network response remains available for development debugging. Desktop/mobile
tests cover missing history, Admin history errors, retry, actual accountable names,
Engineer A/B (assigned and unassigned) and Admin controls; database checks verify
Admin metadata writes and denial of Engineer/Architect writes. These are isolated
tests, not confirmation that the live Projects page is repaired. The repair was also
tested against the reviewed missing-history schema, including no record rewrites,
no invented history, future audit events, stable actor identity, transaction rollback,
immutability and refusal of an alternative history store. No live schema, records
or permissions were changed during this investigation. QR testing stays paused;
frontend error-message deployment and live UI verification follow after SQL review.

Run these focused local checks with `npm.cmd --prefix tests run test:projects`.

### Original migration deployment

Review `migrations/202610100001_engineer_portal.sql` after the existing account
management migrations. Apply **only this new migration**, once, using the SQL Editor;
do not rerun original setup scripts. It is transactional and leaves existing data
and IDs unchanged. The final verification should report both snapshots present and
both anonymous QR access and authenticated private-function access false.

The new APIs and private QR reference table are additive. The existing movement RPC
remains public with its original signature; its authorized implementation is moved
behind a new wrapper. The wrapper adds an active recipient/project-assignment check
for **new direct transfers**, including manual entry. It keeps original custody,
reservation, idempotency, recipient receipt and inspection rules. Already-created
transfers can still be received under their existing rules. A valid repeat of a saved
operation can return its original result even after the receiving QR expires.

Receiving QR references contain two random UUIDs encoded as a 64-character opaque
value. Only its SHA-256 hash is stored in the private table. References expire after
15 minutes, can be revoked by their receiver, and generating a new one revokes older
ones for that receiver. They may assist multiple transfers while valid; they never
confer custody or receipt authorization. Resolution and submission recheck the active
receiver and current active project assignment. Raw QR tokens are stripped from the
movement operation payload before it reaches stored operation/audit history.

## Frontend and live validation gates

After reviewing the migration result, deploy the frontend through the existing
GitHub Pages branch/root workflow at https://waquinn.github.io/MCPA/.
No new Edge Function, SMTP provider, secret or custom domain is required.
The existing QR generator is reused; the existing html5-qrcode scanner is pinned to
2.3.8 and loaded in both HTML entry pages. Camera capture needs HTTPS or localhost.

Engineer B's receiving-project assignment is an Admin prerequisite, not a task for
an automated migration. The receiving QR and the existing TRF handover code have
different controls and payloads. Confirm B can generate a QR, A can scan it and the
verified receiver/project appears. **Stop before creating a live transfer** until the
live handover test is explicitly authorized. Preserve T-1204 and all existing records.

Then test camera permission denial, close/navigation cleanup, expiry and revocation
on actual phones. Browser automation models scanner callbacks and camera lifecycle;
it does not validate optical scanning or real iOS/Android hardware permissions.

## Local validation

From the repository root:

```
node --test tests/engineer-portal.database.cjs
node tests/auth.browser.cjs --portal
```

These use an isolated local PostgreSQL fixture with authenticated roles and RLS;
browser HTTPS requests are blocked. Fixtures test issue/resolve/revoke/expiry,
assignment changes, inactive accounts, forbidden RPCs and project writes, manual
transfer validation, operation retries, unchanged custody on scan/dispatch, named
receiver inspection/receipt, personal/project scopes, modal draft protection and
camera cleanup. Responsive UI checks cover 393px, 430px and 1440px in the existing
themes. No real passwords, Auth accounts or live movement data are used.
