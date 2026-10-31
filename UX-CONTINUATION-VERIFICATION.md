# UX continuation verification — 9 October 2026

The authoritative requirements were read from the attached `Pasted text.txt` under attachment `2133ec3b-c47a-4972-ae38-e6c935acc271`. The starting checkout was clean at commit `08ca91b` (`Update Mobile View UI and UX`). This continuation preserves the existing implementation and limits product changes to notification navigation and the shared loading paths it uses.

## Live data protection

This session performed no live Supabase requests, live sign-ins, migrations, user seeding, approvals, releases, resets, or record/history changes. REQ-00001, its Engineer A requester, destination project, equipment, Pending Review state, accounts, permissions, notifications, and activity history were not modified by this work. The live Engineer A → Admin → Engineer B workflow remains paused.

Browser tests substituted the Supabase SDK, blocked external HTTPS requests, used fresh temporary browser profiles, and connected only to a localhost fixture. Database integration tests created fresh in-memory PGlite instances. Their synthetic REQ-00001 is independent of the protected live request. Existing regression suites exercise approvals and handovers only inside those isolated fixtures. Script helper tests used mocked clients; the live script entrypoints were never executed.

Live database contents were not independently queried before and after this session. The protection claim is that this session made no live changes; it does not attest to changes another user or process might make.

## Implementation status at takeover

| Original requirement | Already present before this continuation | Final verification / limitation |
| --- | --- | --- |
| Inspect the actual selector before replacing it | Destination Project is generated as a native `select` by `siteField()` | Source and browser inspection confirmed native semantics; no replacement needed |
| Preserve native mobile behavior | Existing native control and keyboard handling | Preserved |
| Fit viewport; avoid horizontal overflow | Existing field `width:100%`, grid/field `min-width:0`, select `max-width:100%` | Browser assertions pass at 375, 390, 430, 768, 1024, 1440 |
| Tappable, readable, enabled selector | Existing 44px minimum height; 16px form-select text through 768px | Browser hit testing, touch dispatch, font and bounds assertions pass |
| Show all available options and retain selection | Options built from current snapshot projects and equipment locations | Fixture options and selected value verified; OS picker rendering/scrolling needs device testing |
| Avoid clipping, overlays, stacking problems | No custom menu, appearance override or clipping ancestor identified for Request Tools | Browser center hit targets unobstructed; screen animation ends at `transform:none` |
| Equivalent selectors | Shared field styling covers destinations, recipients, tools, inspection conditions and recovery | Expanded browser checks pass, including long recipient names/IDs and repair/recovery selects |
| Preserve desktop keyboard support | Native selects and existing focus styling | End/Enter selection passes on desktop/laptop; visible focus inspected |
| Interactive notification/activity entries | Bell opens Activity logs; activity rows and dashboard Recent activity use real anchors | Full-row touch and Enter navigation verified |
| Stable entity targeting; no text parsing | Saved movement activity already carries `action` and `entityId` | Preserved; unit tests use misleading summary text to prove routing ignores it |
| Requests, Transfers, Returns, Repairs, Missing routing | Existing snapshot collection lookup plus saved-action fallback | All five types verified against existing isolated records |
| Fresh data, exact record, existing details | Existing `MovementUI.openRecord()` refreshes and matches exact IDs | Preserved and hardened for failures/races |
| URL/hash survives refresh | Existing `#request?record=<id>` convention and auth restore | Refresh passes; failed loads now preserve the hash immediately too |
| Read/unread behavior | No separate persisted notification inbox/read state exists | No schema redesign; clicking links does not change any read state |
| Keyboard, hover, pointer, visible focus | Real anchors, stretched row hit area, hover/focus CSS | Touch, keyboard, focus and selected-row assertions pass |
| Mobile destination unobstructed | Sidebar/search closure; equipment dialog links close the dialog | No open dialog or sidebar at destination in browser tests |
| Missing/inaccessible records | Existing safe unavailable-record message | Verified; successful targets now clear stale warnings |
| No duplicate records or workflow changes | Navigation only invokes read operations | Whole-snapshot and mutation-call comparisons pass |
| No redesign, custody/RLS/approval/QR/account changes | Existing functionality retained | No CSS, HTML, SQL, Auth, permission or workflow-store changes |

The original mobile defect's historical root cause cannot be proven from this checkout: the sizing fix was already committed before takeover. Its existing native-select constraints address intrinsic grid/control width, touch sizing and mobile text sizing. No current clipping, z-index, disabled-state or touch-interception defect was reproduced. Assigning the historical problem to one of those causes would be speculation.

## Bugs fixed in this continuation

| Bug | Root cause | Change |
| --- | --- | --- |
| Module Retry lost the target ID | Loader received only the parsed screen name and retried that name | Pass and retain the complete route; retry the same stable ID |
| Refresh during a failed module load lost the destination | Hash was updated only after successful activation | Store the authorized target hash when navigation starts |
| Data recovery displayed a list without reopening the target | Initial snapshot failure/remount discarded pending targeting | Retain pending target; resume it after manual or automatic read recovery |
| Rapid return to the current module left controls disposed | Controllers were disposed when another fetch began | Dispose only when replacement markup commits; abort obsolete loading on reuse |
| Repeated clicks during script loading activated incomplete markup | Module was considered reusable before its script completed | Coalesce loading requests and activate the latest requested route after readiness |
| Script download failure activated an unusable module | Script error called the normal activation callback | Use the same retryable module error path for HTML and script failure |
| Older record targeting could reopen after plain navigation or a manual selection | Those actions did not invalidate outstanding async targeting | Cancel pending targets on authorized navigation, View and Close; retain async identity/token guards |
| Obsolete module stubs could dispose the current controller | Mount disposed before checking whether its destination root still existed | Validate the destination root first in movement and overview mounts |
| Failure left old watchers attached to disconnected markup | Deferred disposal did not also cover error replacement | Dispose controllers before rendering the module error UI |
| Old unavailable-record warning remained beside a valid record | Successful targeting did not clear previous errors | Clear stale targeting notices before presenting the valid record |
| Invitation browser test intermittently counted a previous screen's read | Test recorded call counts after profile restoration but before dashboard loading finished | Wait for the previous dashboard render before taking the baseline |
| Existing navigation/sync tests were omitted from the default test command | Test script listed only the older suites | Include navigation, sync and new module regression suites |

## Files changed

- `js/navigation.js`: complete route forwarding, immediate hash persistence, pending-target cancellation.
- `js/app.js`: loading coalescence/readiness, safe reuse/disposal, HTML/script failure recovery, complete-route Retry.
- `js/movement-ui.js`: pending-target recovery, stale-target cancellation, stale-warning clearing, guarded mount.
- `js/movement-overview.js`: guarded mount for delayed module scripts.
- `tests/auth.browser.cjs`: integrate new checks, select the fixture transfer by request association, settle invitation-test baseline.
- `tests/module-navigation.test.cjs`: eight controlled loader/router regressions.
- `tests/notification-ui-checks.cjs`: isolated native-select, all-type targeting, recovery and cancellation checks.
- `tests/package.json`: include navigation/sync/module regressions in the default test command.
- `UX-CONTINUATION-VERIFICATION.md`: this report.

No production dependencies changed. Existing script test dependencies were installed with `npm ci --ignore-scripts`; package manifests/lockfiles for those dependencies remained unchanged.

## Actual test results

| Check | Result |
| --- | --- |
| Broad Node suite including movement store/sync/navigation/module loading, inventory, dashboard, archives, auth/accounts, identity and legacy safeguards | **57/57 passed** |
| Isolated movement database integration | **8/8 scenarios passed** |
| Isolated consumables database integration | **All checks passed** |
| Mocked seed/repair helper unit tests | **10/10 passed**; no live helper entrypoint ran |
| Repository JS/MJS/CJS syntax (`node --check`) | **73/73 passed** |
| Expanded `node tests/auth.browser.cjs` | **Passed**, exit 0; no uncaught browser exceptions |
| `node tests/inventory.browser.cjs` | **Passed**, exit 0; inventory/realtime/filter/archive integration preserved |
| `git diff --check` | **Passed**; only Windows line-ending notices |
| Lint / TypeScript / production build | No configured project tasks; static HTML/CSS/JS is served directly, with no bundler build |
| Legacy standalone Sites database suite | Existing failure at `ALTER POLICY sites_delete`; suite expects hard-delete policy/CRUD removed by current archive design |

The legacy Sites failure was left outside this UX task. Restoring deletion access would violate the data-preservation requirement. The applicable archive suite and inventory browser archive/restore checks passed.

Initial sandboxed Chrome attempts failed on local transport (`ECONNRESET` for auth; CDP timeout for inventory). Approved reruns succeeded. The initial full auth browser run also exposed the invitation-test timing issue described above; corrected full runs passed.

The final auth browser run captured artifacts under `C:\Users\ROLAND~1\AppData\Local\Temp\mcpa-auth-REWj2f`; inventory artifacts are under `C:\Users\ROLAND~1\AppData\Local\Temp\mcpa-inventory-oW8zqq`. Mobile/native-select and desktop/target-detail screenshots were visually inspected. These are local test fixtures, not screenshots of the live request.

## Compatibility and notification behavior

Native form controls were verified in Chromium at **375, 390, 430, 768, 1024 and 1440px**. The request notification path was clicked/tapped at **375, 390, 430, 768 and 1440px**, with refresh tests at 375 and 1440. Other movement notifications were clicked on mobile 390 and desktop 1440. Header checks also covered 393px and both themes; desktop/laptop layout and mobile screenshot inspection were included.

Targeting uses existing saved `action` and `entityId` metadata, with exact snapshot collection lookup and an action-to-module fallback. Routes remain singular, matching the existing architecture: `#request?record=...`, `#transfer?record=...`, `#return?record=...`, `#repair?record=...`, `#missing?record=...`. The module reads current data, finds the exact existing record, highlights it, opens its current detail UI and focuses that detail. Notification text is never parsed for targeting.

Missing or inaccessible targets display a safe error rather than an unrelated record. Retry and automatic reconnection retain the requested ID. Newer navigation supersedes older asynchronous targeting. Comparing entire before/after fixture snapshots and browser business-write call counts demonstrated no duplicate creation or workflow/history changes during navigation.

## Remaining verification limits and stop state

- Real Android/iOS native-picker popup rendering, scrolling and physical-device touch were not tested. Chromium emulation proves control semantics, options, hit targets, selection, readable sizing and layout, not an OS-native picker.
- The actual live Admin session and live REQ-00001 notification were not opened. Pending Review and no-mutation checks passed on the independent local fixture.
- Safari/Firefox and deployed hosting were not tested; these changes remain in the local checkout.
- Saved notification read/unread state does not exist in the current architecture and was not added.
- The obsolete standalone Sites database test remains an unrelated baseline limitation.

Implementation and all feasible in-scope local verification are complete. No request was approved, released or advanced in the live system. Stop here until the user explicitly resumes the live transfer workflow.
