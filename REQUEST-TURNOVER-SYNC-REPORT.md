# Engineer request synchronization and equipment turnover

Reviewed and tested locally on October 12, 2026. Frontend changes and a guarded SQL migration are ready for review. **Live deployment is paused at the requested manual database gate.** No production accounts, requests, equipment, transfers, custody or activity records were changed. Nothing was pushed or published.

## Confirmed causes

The deployed schema preflight provided by the user confirms that the notification table, monitoring snapshot/mark-read RPCs, own-recipient policy and movement-notification trigger are absent. The identity, movement snapshot and personal equipment RPCs are present. Thus an Admin release can succeed without an installed backend notification mechanism.

The source also had two presentation/synchronization gaps:

- The Engineer dashboard counted only pending/approved requests. Release removed a request from that count; there was no dashboard request lifecycle list or dedicated pending turnover section.
- Dashboard and movement watchers subscribed to equipment/sites. Approval/release changes movement and reservation records while preserving equipment custody, so these actions lacked a direct refresh signal. The existing 30-second, focus and reconnect fallback already existed.

The authorized movement snapshot already supplies the relevant requests and pending handovers. No replacement movement source, new business status or custody correction was necessary. Local tests with different Auth/company UUIDs and duplicate employee names confirm that the existing profile identity architecture works; the supplied preflight does not inspect the real Gmail account's individual profile linkage.

## Files changed

| File | Purpose |
| --- | --- |
| `js/dashboard-view.js` | Engineer/Architect pending turnover and request lifecycle panels; exact record links; released requests remain open until receipt. |
| `js/movement-overview.js` | One authorized movement snapshot per field dashboard refresh; notification refresh signal; Receive Transfer inbox action. Personal Equipment Tracking retains its narrow RPC. |
| `js/movement-ui.js` | Clear released/received request labels and filters; notification refresh signal; pending receiver targets open Receive and completed targets open History. |
| `css/movement-overview.css` | Existing theme tokens, responsive panels, wrapping, mobile touch targets and centered readable notification dialog. |
| `supabase/request-turnover-preflight.sql` | Read-only installation metadata; no business/account data. |
| `supabase/migrations/202610120001_request_turnover_notifications.sql` | Guarded replacement of the existing private notification trigger function. |
| `tests/dashboard-view.test.cjs` | Dashboard lifecycle, stable-recipient filtering, exact targets and empty-state coverage. |
| `tests/request-turnover.database.test.cjs` | Real local SQL/RLS/transaction tests for notification, identity, retries, authorization and custody. |
| `tests/request-turnover.browser-checks.cjs` | Request-to-receipt workflow across independent browser sessions and mobile/theme checks. |
| `tests/browser-session.cjs` | Isolated additional browser context for the Admin/second Engineer. |
| `tests/auth.browser.cjs` | Local turnover fixture and modeled recipient notification event transport; optional restricted-host Chrome flag. |
| `tests/workspace-ui-checks.cjs` | Existing subscription assertion includes the new notification table while retaining channel/timer cleanup checks. |
| `tests/package.json` | Reproducible `test:turnover` command. |
| `REQUEST-TURNOVER-SYNC-REPORT.md`, `documentation/request-turnover/screenshots/` | This report and final local visual evidence. |

The existing `202610100006_monitoring.sql` is a deployment prerequisite and was not edited. The prior user-manual artifacts remain unchanged.

## Notifications, navigation and identity

The existing monitoring migration already defines prospective release notifications. The new migration reuses `mcpa_notifications`, its unique `(recipient_id, dedupe_key)` constraint and its operation-insert trigger. It changes the intended release recipient's title to **Equipment Pending Turnover**, with the request reference, equipment names/IDs and inspection/testing instructions. Other authorized Admin observers retain the generic release event. No second notification store is introduced.

The notification insert shares the successful release transaction. A failed or rolled-back release cannot leave a notice. Replaying an operation UUID returns the saved result, and recipient/operation deduplication prevents duplicate notices. Refreshes only read snapshots.

The recipient is the transfer's `receiver_id`, referencing permanent `profiles.id`. The authenticated identity resolves through `profiles.auth_user_id`; names and email addresses never authorize live turnover. Own-recipient RLS and the existing authenticated snapshot/mark-read RPC checks are retained. The new private trigger function remains inaccessible for direct execution by anonymous/authenticated/service-role clients.

Notifications carry the actual transfer ID in `entity_id`, with the existing route plus operation/request/tool identifiers in `data`. The existing notification router uses these fields. Opening a notice marks only that recipient's notice read and then refreshes/revalidates the target against the authorized movement snapshot. An intended receiver's pending target opens the Receive tab; a completed target opens current History details without a stale receipt form. Missing/unauthorized targets show the existing unavailable state. Clicking never confirms receipt or changes custody.

## Dashboard and automatic updates

Engineer and Architect dashboards show pending transfers addressed to their own company profile, including existing handovers created before these migrations. Each entry displays equipment names/IDs, request/transfer reference, recorded origin, destination, creation/release time, Awaiting receipt and View Turnover. The dashboard shows four newest pending entries and links to the full Receive inbox. The empty state contains no invented records.

The My Requests panel retains all actual statuses, summarizes counts and shows five newest requests with links to full history. Pending, approved, rejected, released and received remain distinct. Released is labeled **Released / awaiting receipt**; received is **Received / completed**. The database status model is unchanged.

Field dashboards refresh through one authorized `mcpa_movement_snapshot()`; no recurring company-wide equipment table read was added. Personal Equipment Tracking still uses `mcpa_personal_equipment_snapshot()`. Movement and dashboard watchers now include `mcpa_notifications` alongside equipment/sites, using the existing debounce, refresh-on-focus/reconnect and visible-tab **30-second fallback**. Notification monitoring has its existing own-recipient watcher. Navigation/logout still disposes subscriptions and timers; no extra interval was introduced.

If `mcpa_notifications` is included in Supabase Realtime, its authorized events trigger a snapshot refresh promptly. The supplied preflight says it is currently not published: without a publication change, expect the next visible-tab 30-second refresh plus RPC/network time, or refresh when the tab regains focus. Movement tables remain RPC-only; their direct-read grants/publication were not widened. A hidden tab catches up on visibility/focus rather than polling continuously.

## Receipt and business rules preserved

Release creates a pending handover/reservation while retaining the source custodian/location. Receipt still requires the authenticated intended company profile, a pending eligible movement, valid reserved equipment, an inspection for every tool, required condition/notes and testing. The existing RPC performs the atomic custody, reservation, request status and activity updates. Pending turnover clears only after successful receipt.

The supported selection/release model operates on whole equipment records, including their saved quantities. It does not provide a new partial-quantity release mechanism. Multi-item receipt requires all item inspections; existing accepted damage, declined damage and missing-item dispositions/follow-up rules remain in force. No partial state or alternate assignment model was added.

## Tests and evidence

All tests below ran against isolated PGlite PostgreSQL fixtures and local Chrome. External HTTPS was blocked in the browser harness. Auth/session transport, Realtime transport and camera input are modeled locally; SQL functions, transactional changes and role/RLS checks execute in the fixture. These results do not claim a live Supabase Realtime, Gmail SMTP or physical-camera test.

| Requested test | Observed result |
| --- | --- |
| A — Request visibility | Engineer submitted a two-equipment request through the UI; My Requests and Dashboard showed the same pending reference. |
| B — Admin approval | Separate Admin session approved; Engineer Dashboard updated without reload, event hint or synthetic timer tick after **29.4 seconds**, using the actual foreground fallback timer. |
| C — Release notification | Admin UI release created the recipient notice and pending dashboard turnover; request showed released; source custody and personal inventory remained unchanged. Operation retry generated no duplicate. |
| D — Clickable notice | Mobile notice opened the exact pending transfer on Receive and persisted read state; no movement write or custody change occurred on click. Reopening after receipt showed completed History. |
| E — Receipt | Untested receipt was rejected; inspection/testing of both items succeeded, clearing pending turnover, updating My Requests/personal custody and recording activity. SQL also rejected an incomplete inspection list. |
| F — Wrong Engineer | Independent second Engineer could not see/open the target; forged receiver ID and receipt RPC were rejected with authorization errors. Own-notice reads/mark-read were also checked in SQL. |
| G — Automatic synchronization | Actual approval fallback passed. Release and notification updates passed through a modeled recipient Realtime hint. My Requests stayed open while rejection/approval/release updated. No accumulating subscriptions/timers. |
| H — Regression | Existing transfer/receipt/return, role guards, project assignments, account/session flows, movement history and QR generation/scan resolution/camera lifecycle checks passed. Optical scanning on physical devices was not tested. |

Completed checks:

- **14/14** targeted Node tests: turnover database, dashboard, navigation and synchronization.
- **15/15** additional database tests: monitoring, movement cancellation, Engineer portal, authentication and profile identity.
- Turnover browser workflow: passed, including independent sessions, duplicate retry, security, receipt, current-target navigation and cleanup.
- Existing `--portal` browser checks: passed, including personal custody/assigned projects, no-project states and modeled QR/camera workflows.
- Existing `--flows-only` browser checks: passed, including all five roles, direct route guards, onboarding/session, transfer/receipt/return, outages, draft preservation and cleanup.
- Existing `--feature-completion` browser checks: passed, including procurement/private receipts, notification read state, immutable reports, cancellation/refusal and preserved custody.
- New panels: 1440px desktop and 393px mobile in Light/Night modes; long equipment names wrapped, no horizontal document overflow, controls met 40px desktop/44px mobile target checks. Final dashboard, notification and mobile receipt screenshots were visually reviewed.
- Existing flow regressions exercised viewport widths from 375px to 1440px. Syntax and whitespace checks passed.

Screenshots are in [`documentation/request-turnover/screenshots/`](documentation/request-turnover/screenshots/). The names and records in these images are local test fixtures, including the synthetic `REQ-00001`; no production record with that reference was opened or changed.

Reproduce the targeted checks with `npm --prefix tests run test:turnover`. On this restricted Windows host only, the browser needed `$env:MCPA_CHROME_NO_SANDBOX='1'`; the test runner's default Chrome sandbox behavior is unchanged.

## Required manual deployment steps

1. In the Supabase SQL Editor, review and run **`supabase/migrations/202610100006_monitoring.sql` first**. Your preflight confirms this infrastructure is missing. It creates the existing notification store, own-recipient RLS, monitoring RPCs and future-operation trigger. It also defines the repository's immutable inventory snapshot store/service RPCs; it installs no scheduler, captures no historical data and changes no request/equipment/custody records.
2. After that succeeds, run **`supabase/migrations/202610120001_request_turnover_notifications.sql`**. It replaces only the private notification trigger function and preserves its recipient rules and deduplication. It changes no RPC permission, RLS policy, table, business status or historical notice. Its transaction refuses missing/different monitoring infrastructure.
3. Rerun **`supabase/request-turnover-preflight.sql`**. All installation flags should be true except `anonymous_movement_execute` must remain false and `notifications_realtime_published` can remain false if using the fallback. The new migration also returns verification: turnover copy/trigger/RLS true, anonymous/authenticated direct trigger execution false. If either migration raises a guard/SQL error, stop and retain the error; do not reset the database or rerun prototype setup scripts.
4. Optional: enable Realtime for **`public.mcpa_notifications` only** through the existing Supabase publication configuration after reviewing its own-recipient RLS. This improves update latency but is not required for the 30-second fallback. No production publication change has been performed here.
5. Once database verification succeeds, review and publish the frontend changes through the existing **`Updated-MCPARole` branch and `/(root)` GitHub Pages configuration**. No Pages settings, SMTP settings, account-management Edge Function, authentication code or QR libraries were changed. Perform an authorized development-account smoke check on the deployed site before relying on live behavior.

The user-provided preflight established the missing deployed infrastructure. No live migration, live browser retest, deployment, commit or push was performed by this implementation. Existing pending handovers remain visible from their existing records; only future successful operations create notices, with no fabricated historical backfill. Live Realtime delivery and the individual Gmail account's linkage still require the post-deployment smoke check.
