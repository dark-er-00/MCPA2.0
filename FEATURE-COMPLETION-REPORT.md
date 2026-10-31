# Tool Management System — implementation and deployment report

Prepared locally on 10 October 2026. The application uses HTML/CSS/JavaScript modules, Supabase Auth, PostgreSQL RPCs/RLS and Supabase Storage. No production migration or frontend deployment was performed.

## A. Implementation summary

Statuses below describe deployment readiness. Features that depend on unapplied SQL are **Pending configuration or migration**, even when their isolated implementation tests pass.

### 1. My Account theme button

- **Original issue/root cause:** Settings passed a click event to `toggleTheme`, which used element geometry for the animated reveal.
- **Change:** Settings passes the actual button; the shared handler also accepts events safely, synchronizes both controls and saved preferences, and retains unsupported/reduced-motion/failed-animation fallbacks.
- **Files/components:** `js/app.js`, `1-admin/modules/settings/settings.js`.
- **Database:** None.
- **Testing:** Shared theme tests; Chrome desktop/mobile checks for Admin, Secretary, Engineer, Architect and Tool Handler, both themes and persistence. Existing transition/accessibility regression checks also cover fallback and interruption behavior.
- **Status:** Completed and tested.

### 2. Equipment photos

- **Original issue/root cause:** The Admin file input was disconnected from equipment saves. There was no managed upload/retrieval workflow or matching private Storage policy in the source.
- **Change:** JPEG/PNG/WebP validation (5 MiB), decoded preview, staged upload, persistent managed reference, signed retrieval, replacement and recoverable error states. New items retain a stable ID across retries. Existing photos remain until a replacement save succeeds; uploaded originals are immutable.
- **Files/components:** `1-admin/modules/masterlist/masterlist.{html,css,js}`, `js/equipment-photos.js`, `js/equipment-visual.js`, both entry HTML files; migration `202610100003_feature_storage.sql`.
- **Database:** Private bucket/policies, `equipment.image_url` if missing, reference guard and authenticated access helpers.
- **Testing:** Unit tests, real browser preview/selection, mocked Storage HTTP uploads/signed URLs, upload and metadata failures/retries, reload/replacement/new item behavior; isolated PostgreSQL access/guard tests.
- **Status:** Pending configuration or migration. Real Supabase Storage HTTP behavior still needs verification in a dedicated staging environment.

### 3. Inventory search

- **Original issue/root cause:** Filtering searched only ID, name and brand although the interface advertised serial, project and holder too.
- **Change:** All six fields use loaded equipment and mapped site/profile records, case-insensitive partial matching, combined existing filters and the same filtered export set. No extra query per keystroke.
- **Files/components:** `1-admin/modules/masterlist/masterlist.js`.
- **Database:** None; existing authorized relational reads are reused.
- **Testing:** Unit and desktop/mobile browser checks for every field, empty results and filter intersections.
- **Status:** Completed and tested.

### 4. Purchases

- **Original issue/root cause:** The page was a placeholder. Material Requests already owned delivery/stock receipt, and no purchase approval state machine existed.
- **Confirmed rule:** A record-only ledger. Delivery status comes from a linked Material Request; approvals and stock receipts remain in their existing workflow.
- **Change:** Admin/Secretary create/view/edit/search purchase records, supplier/reference/date, line quantities/prices and server-calculated totals, optional request link, private invoice/receipt and immutable before/after history. Operation IDs prevent duplicate retries; version checks prevent stale edits. Duplicate supplier/reference/date combinations are rejected.
- **Files/components:** `1-admin/modules/purchases/purchases.{html,css,js}`, `js/app.js`; migrations `003` and `005`.
- **Database:** `mcpa_purchases`, `mcpa_purchase_history`, validation/audit constraints, restricted read policies and two write/read RPCs.
- **Testing:** Isolated database persistence, totals, roles, retries, duplicate/stale writes, invalid input and audit immutability; browser create/edit/search/date/history/receipt workflows as Admin and Secretary. Tests compare material stock, request and equipment records before/after.
- **Status:** Pending configuration or migration. No new purchase approval privilege was introduced.

### 5. Withdrawal and cancellation

- **Original issue/root cause:** Neither the movement state machine nor the interface offered complete withdrawal/cancellation transitions.
- **Change:** Confirmed, reasoned transitions for own pending requests, own approved/unfulfilled reservations and eligible unreceived transfers. Equipment and allocation checks run in one database transaction; only that movement's reservations are released. Completed transactions are ineligible. Cancelling a linked handover also cancels its released request, as requested.
- **Files/components:** `js/movement-{ui,store,cloud}.js`, `js/permissions.js`, `js/navigation.js`, `js/dashboard-view.js`; migration `004`.
- **Database:** Append-only cancellation audit; authenticated movement RPC/snapshot wrappers. No movement records are deleted.
- **Testing:** Isolated SQL authorization/state/atomicity/retry/audit tests, concurrent cancellation versus receipt, demo storage failure and reservation locks, browser confirmation/validation/retry controls.
- **Status:** Pending configuration or migration.

### 6. Damaged equipment refusal

- **Original issue/root cause:** The live receipt RPC handled accepted damage but had no refusal/held-handover state or accountable resolution path.
- **Change:** The named field receiver can refuse a damaged eligible handover after complete tested inspections, damage notes, reason and confirmation. Custody and reservations remain held. The original field sender can reopen for a new inspection or cancel; a requester can cancel their own refused initial request-linked handover. The audit preserves earlier refusal/reopening details. Admin sees events and cannot use these new interruption controls.
- **Eligibility:** New refusal is limited to handovers with an authorized Engineer/Architect resolution path: a field sender, or an initial released request owned by its field receiver. A standalone Tool Handler dispatch retains its existing receipt workflow without gaining an unresolved refusal hold.
- **Files/components:** Same movement files as improvement 5; migration `004`; notification infrastructure in `006`.
- **Database:** `mcpa_movement_refusals`, `refused` transition, scoped continued receiver visibility and immutable audit.
- **Testing:** SQL and browser damage validation, named receiver restriction, custody/allocation holds, blocked ordinary receipt while refused, sender reopening/cancellation, Admin/Handler denial, stable identity when names duplicate and affected-recipient notices.
- **Status:** Pending configuration or migration. Admin resolution was replaced with field resolution to follow the user's final permission instruction.

### 7. Overdue monitoring and reminders

- **Original issue/root cause:** Existing data stored `neededUntil`, but had no complete server-date overdue service or scheduled reminder infrastructure; the header bell opened activity directly.
- **Change:** Manila server-date calculations for overdue received equipment still in relevant custody, scoped by authenticated role. The calculation follows the actual latest successful receipt so a return and later loan cannot revive an old due date. Pending, refused or cancelled handovers do not invent a new acquisition. Zero-quantity and non-acquired receipt items are excluded. Own-recipient notifications support read state and specific-record navigation, refresh/connection recovery and session cleanup. Future movement operations emit notices atomically. A service-only generator deduplicates daily overdue alerts and weekly reminders.
- **Files/components:** `js/monitoring.js`, `js/auth.js`, `js/app.js`, both entry HTML files; migration `006`.
- **Database:** `mcpa_notifications`, role/recipient policies, future-operation trigger, monitoring RPCs and receipt lookup index.
- **Testing:** Actual isolated movement flows and server dates, current/previous custody, same-receiver reacquisition, due-today/future/malformed dates, role/read-state isolation, event recipients/retries/rollback and browser notification navigation.
- **Status:** Pending configuration or migration. An external scheduler must call the service-only generator; no scheduler, email or push provider was deployed.
- **Data limitation:** Overdue monitoring requires a recorded successful receipt linked to a request with a valid return date. A direct handover without that dated request does not acquire an invented deadline; incomplete legacy receipt history cannot prove a loan's current due date.

### 8. Date-range and historical reports

- **Original issue/root cause:** Reporting used present-day inventory and did not have reliable saved past inventory observations.
- **Change:** Admin reports distinguish current inventory, dated recorded movement events and immutable captured inventory snapshots. Inclusive date ranges use Manila time and a maximum 367-day range. CSV export preserves the selected report and neutralizes formula-prefixed cells. The first historical capture is shown; periods without snapshots report that absence.
- **Files/components:** `1-admin/modules/reports/reports.{html,css,js}`, `js/app.js`; migration `006`.
- **Database:** `mcpa_inventory_snapshots`, capture/report RPCs, restricted read policy and immutable capture records.
- **Testing:** Isolated current-versus-captured state, date-range boundaries, Admin-only access, weekly capture deduplication/immutability; browser report selection, later custody change, dated activity, CSV and responsive themes.
- **Status:** Pending configuration or migration. Historical inventory begins with actual future captures; earlier inventory is not backfilled or fabricated.

### 9. Project history dependency

- **Original issue/root cause:** `mcpa_project_snapshot()` queries `public.project_history`; the old Projects setup created the table outside numbered migrations. Portal installation alone can succeed while runtime history reads fail. Current live schema state was not re-inspected during this implementation.
- **Change:** Reused the existing read-only dependency review and guarded `202610100002_project_history.sql` repair. Added a feature-wide read-only preflight. The repair creates history only if its reviewed dependency is missing, records future changes and refuses an existing/alternative store; it does not rewrite the snapshot or create invented old history.
- **Files/components:** Existing `supabase/project-history-preflight.sql`, `supabase/migrations/202610100002_project_history.sql`, `supabase/ENGINEER-PORTAL-DEPLOYMENT.md`; new `supabase/feature-completion-preflight.sql`.
- **Database:** Conditional project-history table/index/policy and future-change/immutability triggers from the already-prepared repair.
- **Testing:** Existing dependency and repair tests reproduce missing table/RPC, alternative stores, rollback, stable audit actor IDs, scoped reads and preserved site/transaction data. Existing project/browser regression checks remain applicable.
- **Status:** Pending configuration or migration. Run the read-only dependency review first; apply `002` only if missing and its guards agree.

## Role decisions and compatibility

| New capability | Admin | Secretary | Engineer / Architect | Tool Handler |
|---|---|---|---|---|
| Managed equipment photo write | Yes | No | No | No |
| Read managed photo | Authorized equipment only | No equipment scope | Authorized equipment only | Authorized equipment only |
| Purchases and private receipts | Yes | Yes | No | No |
| Withdraw pending request / cancel unfulfilled reservation | Monitor | No | Own request only | No |
| Cancel unreceived/refused handover | Monitor | No | Original field sender; own linked request | No |
| Refuse eligible damaged handover | Monitor | No | Named receiver | No |
| Reopen refused direct handover | Monitor | No | Original field sender | No |
| Historical reports | Yes | No | No | No |
| Notifications | Own notices | No equipment monitoring | Own notices | Own notices |

Backend checks enforce these rules separately from the UI. Existing initial Admin request approval/release and existing repair/recovery permissions remain intact. This preserves the established initial Engineer → Admin → Engineer request workflow while keeping new handover interruption controls with field users. No role was promoted or redefined.

## B. Database changes prepared, not applied live

The SQL files are the authoritative definitions. All existing record IDs, history and equipment custody remain in place on installation. Normal future cancellations remove only the current allocation rows they own; they preserve the transaction and audit records.

### `202610100003_feature_storage.sql`

- Adds `equipment.image_url text` **only if absent**.
- Adds private buckets `equipment-photos` (5 MiB JPEG/PNG/WebP) and `purchase-receipts` (10 MiB PDF/JPEG/PNG/WebP); does not make buckets public.
- Adds `mcpa_can_write_equipment_photo(text)`, `mcpa_can_read_equipment_photo(text)` and `mcpa_can_access_purchase_receipt(text)`, restricted to authenticated use.
- Adds private reference validation function and `mcpa_equipment_photo_guard` trigger. Managed references must point to an existing authorized object; only Admin can change them. Legacy unrelated metadata permission is preserved.
- Adds four authenticated `storage.objects` policies: `mcpa_equipment_photos_read`, `mcpa_equipment_photos_insert`, `mcpa_purchase_receipts_read`, `mcpa_purchase_receipts_insert`. No browser overwrite/delete permission is added.
- Requires real Storage tables and refuses conflicting bucket settings or unknown browser-granted policies. Review a refusal; do not bypass it by relaxing security.

### `202610100004_movement_cancellation.sql`

- New `mcpa_movement_cancellations`: composite primary key `(operation_id,movement_id)`; operation/movement/actor foreign keys; action, actor name/role, required bounded reason, recorded timestamp and object-shaped before/after data.
- New `mcpa_movement_refusals`: operation primary key; movement/actor foreign keys; refusal/reopening action, actor name/role, required bounded reason, timestamp and object-shaped before/after data.
- Enables RLS and denies direct browser access/writes to both audit tables. Existing authorized snapshots expose movement history; no broad new read policy is introduced.
- Adds update/delete/truncate immutability triggers: `mcpa_cancellation_no_changes`, `mcpa_cancellation_no_truncate`, `mcpa_refusal_no_changes`, `mcpa_refusal_no_truncate`.
- Wraps `mcpa_movement_action(text,jsonb,uuid)` and `mcpa_movement_snapshot()`; retains prior implementations in the private schema. Adds private authorization/audit helpers and a narrow held-refusal equipment visibility wrapper; all private functions remain inaccessible to browser roles.
- No equipment columns or independent allocation indexes added. Existing locks/reservation structure are reused.

### `202610100005_purchase_ledger.sql`

- `mcpa_purchases` columns: `id`, identity `purchase_number`, `supplier`, `reference`, `purchase_date`, optional `request_id`, `items`, `total`, optional `receipt_path`, `notes`, `version`, `created_by`, `updated_by`, `created_at`, `updated_at`.
- Constraints: primary/unique purchase identifiers; bounded nonempty supplier/reference; 1–100 JSON line items; bounded nonnegative total; bounded notes; positive version; request/profile foreign keys with delete restriction. The RPC additionally validates descriptions, quantity/price precision/limits, exact receipts and server totals.
- Indexes: unique normalized supplier/reference/date `mcpa_purchase_reference`, descending `mcpa_purchase_date`, partial non-null `mcpa_purchase_request`.
- `mcpa_purchase_history` columns: operation primary key, purchase/actor restricted foreign keys, input, before/after records, creation timestamp.
- RLS policies `mcpa_purchase_read` and `mcpa_purchase_history_read` permit Admin/Secretary reads. Browser table writes are revoked; only validated RPC writes are available.
- Adds `mcpa_purchase_history_immutable` and `mcpa_purchase_history_no_truncate` triggers, private audit guard, `mcpa_save_purchase(uuid,integer,uuid,jsonb)` and `mcpa_purchase_snapshot()`.
- No alteration of `consumable_requests`, stock receipt logic or inventory quantity.

### `202610100006_monitoring.sql`

- `mcpa_notifications` columns: UUID primary key, restricted `recipient_id` foreign key, constrained `kind`, optional `entity_id`, `dedupe_key`, bounded `title`/`message`, object-shaped `data`, `created_at`, `read_at`; unique `(recipient_id,dedupe_key)`.
- `mcpa_inventory_snapshots` columns: UUID primary key, actual `captured_at`, `local_date`, unique Monday `week_start`, array-shaped `tools`.
- Indexes: `mcpa_notifications_recipient_date`, `mcpa_inventory_snapshots_capture`, partial `mcpa_monitoring_receipt_lookup` on immutable successful receipt operations.
- RLS policies: `mcpa_notifications_own_read` and `mcpa_inventory_snapshots_admin_read`. No direct browser writes.
- Each new table gets `mcpa_monitoring_immutable_rows` and `mcpa_monitoring_immutable_truncate`; only notification `read_at` can change through its own-recipient RPC.
- `mcpa_future_movement_notifications` AFTER INSERT trigger on `mcpa_movement_operations` creates notices for future events only.
- Authenticated RPCs: `mcpa_monitoring_snapshot()`, `mcpa_monitoring_mark_read(uuid)`, Admin-only `mcpa_monitoring_report(date,date)`.
- Service-only RPCs: `mcpa_capture_inventory_snapshot()`, `mcpa_generate_monitoring()`. Browser/anonymous grants revoked; helpers remain private.

### Existing conditional `202610100002_project_history.sql`

- `project_history` columns: UUID `id` primary key, required UUID `project_id` foreign key to `sites` with delete restriction, required `changed_at`, required `change_types text[]`, optional `before_values`, required `after_values`, optional stable `actor_id` and `actor_name`. The trigger resolves the company profile through the Auth link; maintenance without an authenticated person records no invented actor.
- Index `project_history_project_date_idx`; RLS `mcpa_history_read` for existing Admin/Tool Handler history scope. Assigned field users access history through the existing scoped project RPC.
- Functions `project_record_history()` and `project_history_immutable()`; triggers `project_history_capture` on future site inserts/updates, `project_history_no_changes`, `project_history_no_truncate`.
- No baseline history, past reconstruction, data reset or migration rerun is needed. This repair already existed before this implementation and was reused rather than replaced.

## C. Regression testing results

Final commands, counts and browser outcomes are recorded below after the coordinated validation run. Tests run against local PGlite with mock Auth/Storage HTTP, and Chrome with external HTTPS requests blocked. A test fixture named `REQ-00001` is synthetic and distinct from the protected live request.

- A broad interim run executed 89 tests: 88 passed, one failed while files were still being finalized. That interim result is not claimed as a complete pass; the final repeat below passed every test.
- Focused existing movement/store/sync/navigation and Engineer portal database validation passed 29/29 before the final eligibility correction.
- Initial Storage validation passed 3/3; purchase database validation passed 2/2; all-role theme/photo/search unit and browser checks passed.
- Final broad regression: `node --test --test-concurrency=1` over every `tests/*.test.cjs` and `tests/*.test.mjs` file — **91/91 passed, 0 failed, 0 skipped**. Full local log: `%TEMP%/mcpa-feature-regression-final.log`.
- `node --test tests/movement-cancellation.test.cjs tests/movement-store.test.cjs` after the final role eligibility gate — **24/24 passed**.
- `node tests/movement-database.test.cjs` — **all 8 isolated database scenarios passed**.
- `node --test tests/movement-cancellation.test.cjs tests/movement-store.test.cjs tests/movement-sync.test.cjs tests/movement-navigation.test.cjs tests/engineer-portal.database.cjs` — **29/29 passed**; the later eligibility gate also passed its focused checks above. The Engineer portal SQL scenario was executed successfully in this run.
- `node tests/auth.browser.cjs --feature-completion` — **passed** the final coordinated theme/photo/search, procurement/monitoring and cancellation/refusal browser helpers, with no uncaught browser errors. This final run additionally verifies current/snapshot/activity CSV contents and filenames plus formula-prefixed cell protection. Final screenshots: `%TEMP%/mcpa-auth-BKyVrE`.
- `node tests/auth.browser.cjs --mobile-search-only` — **passed** trusted touch/keyboard/search, existing equipment details, drawer/account/notification access and breakpoint focus in both themes at 375/393/430/768/1024/1440px. Earlier failures exposed missing explicit touch emulation and a pending search rebuild while tapping a stale row. The harness now enables touch, measures stable current targets and asserts the trusted click actually reached its intended control; no app feature was bypassed.
- `node tests/auth.browser.cjs --flows-only` — **passed**, exit 0: existing account management/onboarding/recovery/session, all five roles, direct route restrictions, request approval/release/tested receipt/return, damage demo, native form controls, exact record links, module retry/recovery, automatic synchronization/draft preservation and watcher cleanup. Screenshots: `%TEMP%/mcpa-auth-FrJECN`.
- Final complete `node tests/auth.browser.cjs` — **passed**, exit 0, no uncaught browser errors. This includes mobile trusted input, native theme transitions/fallbacks/preferences across 375–2560px, and all existing workflows listed above in the same run. Screenshots: `%TEMP%/mcpa-auth-bEg6cL`.
- Earlier combined browser runs **failed** on simulated touch target/focus checks. In addition to explicit touch configuration and waiting for search redraw, trusted touch now runs before the suite that injects paused native transitions and repeatedly changes device emulation. Assertions were retained and strengthened to check that the trusted click reaches its intended control. The complete final rerun above confirms the corrected harness; earlier failed/stalled runs are not counted as passes.
- `node --check` — **passed** for all 22 affected application/browser JavaScript files; `git diff --check` — **passed** (Git emitted only its existing LF-to-CRLF conversion notice).

There is no application build/type-check/lint script for the vanilla browser application. JavaScript syntax and executable test suites are the applicable automated checks. Mocked Storage transport verifies app behavior and database policies; it does not prove deployed Supabase Storage behavior. Automated browser tests do not validate optical QR scanning, real phone camera permission behavior, production Auth or a running external scheduler.

## D. Outstanding deployment actions

1. Review `supabase/feature-completion-preflight.sql` using an authorized read-only connection. It queries schema metadata, not the protected transaction. Use `supabase/project-history-preflight.sql` for the history dependency.
2. Confirm the existing authenticated/profile/recipient/portal migrations are installed. Apply the guarded history repair only if the table is missing. Do not rerun prototype module `setup.sql` files: they can restore permissive old policies or create baseline data.
3. Manually review/apply the new migrations in order: **003 Storage → 004 movement → 005 ledger → 006 monitoring**. Migration 005 is a once-only additive migration. No migration was sent to production here.
4. Verify real Storage file limits, image/receipt retrieval and authorization in an isolated staging environment. If Storage preflight identifies incompatible policies, resolve them through a specific reviewed policy migration.
5. Configure a trusted backend scheduler to call `mcpa_generate_monitoring()` regularly. An hourly schedule provides daily overdue notices and the weekly capture/reminder at or after Monday 16:00 **Asia/Manila** (08:00 UTC). Repeated calls deduplicate. A delayed run records its actual capture time; it does not fabricate a Monday capture. Keep service credentials on the backend.
6. Optionally add `mcpa_notifications` to the existing Supabase Realtime publication after reviewing publication settings. A 30-second foreground/online fallback remains available; the implementation does not alter production publications.
7. Deploy the reviewed frontend through the existing process, then validate authorized views using dedicated staging records. No new SMTP/email/push credentials are required for in-app notices.
8. Verify the live project-history migration state through authorized schema inspection before claiming the live Projects error is resolved. No unresolved new cancellation or purchasing business decision remains under the confirmed rules.

## E. Live data protection

No authenticated connection to production was used, no live SQL was executed, and no production frontend/Edge Function/scheduler was deployed. All writes and movement tests used isolated local fixtures; browser HTTPS traffic was blocked. The implementation did not approve, reject, cancel, reset, inspect or otherwise interact with the live **REQ-00001**, its notices, assignments or history. Existing initial Admin review/release remains available in the code.

This is a statement about the actions taken during implementation, **not** a claim that production records were independently checked or compared. Production state was not directly verified. Migration installation itself has no historical backfill or transaction-data update; normal future user actions are separately authorized by their role, state and ownership checks.
