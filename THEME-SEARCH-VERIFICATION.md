# Theme reveal and mobile search verification — 9 October 2026

The authoritative request is the attachment `d2fab64b-3b53-4740-b618-0e9e5569e882/Pasted text.txt`. This work completes its two focused UI improvements. Earlier notification-navigation changes in the working tree were preserved. No deployment or publication was performed.

## Existing implementation and completed fixes

The checkout already contained the existing `body.dark` theme, semantic light/night tokens, `mcpa.theme` persistence, early saved-theme application in both HTML entrypoints, and correct theme button icons, labels, titles and accessible names. It also contained a native View Transitions circle with a button-derived origin, full-viewport radius, 550ms timing, the requested easing, fallback switching and temporary-style cleanup. These were retained.

The mobile magnifier, expandable row, accessible labels, autofocus, X/Escape/Enter handling, 900px breakpoint, semantic search surfaces, 44px controls, profile truncation and existing global search engine were also present. They were retained rather than rebuilt.

The audit identified and fixed these incomplete interactions:

| Issue / root cause | Completed change |
| --- | --- |
| Existing body and component color transitions could still be interpolating when the destination snapshot was captured | Temporarily suppress transitions on the body, descendants and their pseudo-elements while the reveal class is active; retain the native root circle animation |
| Reduced motion still inherited the body’s 250ms color/background fade | Disable that body transition under reduced motion; the existing handler skips View Transitions |
| Resizing could leave focus on an input or close control that becomes hidden | Move focus to the visible magnifier or desktop input when crossing the breakpoint |
| Admin View and Engineer Details bypass normal screen navigation, leaving search open | Close the panel when either existing equipment detail path is selected |
| A closing drawer retained pointer interception during its 200ms slide | Disable pointer events on the closed compact drawer, so header taps work immediately |
| Engineer inventory captures its query before its asynchronous first render; the global callback supplied it afterward | Pass the query before navigation and forward the latest query to the existing inventory filter while its input is still loading |
| Inventory regression clicked a temporarily disabled archive/restore button, then looked for a nonexistent confirmation | Correct test readiness waits; project/archive implementation was unchanged |

## Files changed for this UI request

- `css/theme.css`: destination snapshot transition suppression, reduced-motion body handling, closed-drawer touch handling.
- `js/app.js`: search query handoff, breakpoint focus, search dismissal for Engineer Details.
- `js/movement-overview.js`: small search-state setter for an inventory view whose input has not rendered yet.
- `1-admin/modules/masterlist/masterlist.js`: dismiss search when opening the existing equipment profile.
- `tests/workspace-ui-checks.cjs`: deterministic native animation inspection, real component colors, persistence, fallbacks and reduced motion.
- `tests/mobile-search-ui-checks.cjs` (new): touch, keyboard, bounds, long identities, existing result targeting, delayed inventory reads and breakpoint focus.
- `tests/auth.browser.cjs`: integrates the UI checks, verifies unchanged fixture snapshots/no business writes during them, and provides `--header-only`.
- `tests/inventory.browser.cjs`: waits for ready enabled controls in the existing regression.
- `THEME-SEARCH-VERIFICATION.md`: this report.

Other modified files shown by Git belong to the earlier notification continuation, documented in `UX-CONTINUATION-VERIFICATION.md`.

## Final requirement verification

| Requested report item | Result |
| --- | --- |
| 1. Files changed | Listed above; both entrypoint HTML files and existing theme tokens were preserved |
| 2. Circle implementation | On click, use the actual toggle’s bounding rectangle center; compute the farthest-corner radius with `Math.hypot(max(x, width-x), max(y, height-y))`; animate the new root snapshot’s `clip-path` from zero to that radius |
| 3. View Transitions API | Native `document.startViewTransition()` is used; both destination directions were verified in Chromium |
| 4. Fallback | Existing ordinary theme switch, with its short body fade when motion is allowed; unsupported API, synchronous API failure and rejected native update were simulated and passed |
| 5. Reduced motion | No View Transitions call/circle; the theme still changes and the body settles immediately |
| 6. Cropping cause | The original input competed with hamburger/theme/bell/profile controls in one flex row; a legacy mobile rule also set a 130px input width. The checkout already overrode this with the compact panel |
| 7. Mobile behavior | Magnifier opens the viewport-wide row below the topbar and focuses input. X/Escape close and return focus. Enter uses existing search and closes. Existing Admin View/Engineer Details open the selected record and dismiss search |
| 8. Breakpoint | Existing available-width rule preserved: compact panel at `max-width:900px`, normal desktop input above 900px |
| 9. Desktop | 1024px and 1440px passed; full search retained, correct circle origin/radius, existing navigation/access intact |
| 10. 393px | 393×852 passed: readable compact placeholder, useful input width, no header overlap/page overflow, trusted touch, keyboard, results and profile/activity access |
| 11. 430px | 430×852 passed the same checks |
| 12. Light Mode | All six widths passed; actual light destination colors, persistence, state/labels and search surfaces verified |
| 13. Night Mode | All six widths passed; actual neutral dark destination colors, persistence, state/labels and search surfaces verified |
| 14. Existing logic | UI visibility/focus/transition handling and search-query timing were corrected. Search matching rules, authentication, Supabase integration, schema/RLS, account management, requests/transfers, custody, QR and notification behavior were unchanged by this UI request |

375×852 and 768×852 also passed in both themes. Header controls remain unobstructed with a long identity, have at least 44px hit targets, and do not overlap. Search fits entirely within the viewport; its compact placeholder fits the input text area. Existing drawer/account/activity paths and the native detail dialog’s stacking were checked.

Theme checks verify 550ms `cubic-bezier(0.76,0,0.24,1)`, radius coverage, rapid-click guarding, destination body/navigation/button/row colors, saved light and dark preferences after reload, correct accessible button state, no reveal on initial restoration or navigation, and complete temporary-style cleanup. Existing typography, palette and grain definitions were preserved. Screenshots were inspected for the reveal and 393px Light / 430px Night search layouts.

## Test results and data protection

- Main Node regression suites: **57/57 passed**, no failures or skipped tests.
- Whole-repository JavaScript/CJS/MJS syntax sweep: **74/74 passed**; changed test/source files were checked again after final edits.
- Isolated movement database integration: **8/8 scenarios passed**.
- Full `node tests/auth.browser.cjs`: **passed, exit 0**, including theme/search, permissions/session, native selects, notification targeting/recovery, realtime integration and fixture workflows. Artifacts: `C:\Users\ROLAND~1\AppData\Local\Temp\mcpa-auth-W1TsgI`.
- Isolated `node tests/inventory.browser.cjs`: **passed, exit 0** after correcting the test readiness race. Artifacts: `C:\Users\ROLAND~1\AppData\Local\Temp\mcpa-inventory-8I6RwF`.
- Final `node tests/auth.browser.cjs --header-only`: **passed, exit 0**, with an unchanged before/after fixture snapshot and **zero business-write RPCs**. It includes actual hovered-row destination colors and latest-query behavior during a deliberately delayed first inventory read. Artifacts: `C:\Users\ROLAND~1\AppData\Local\Temp\mcpa-auth-uqaFVb`.
- `git diff --check`: **passed**. No lint, type-check or production-build command is configured for this static HTML/CSS/JavaScript repository.

Browser tests used new temporary Chromium profiles, replaced the Supabase SDK with a localhost fixture and blocked external HTTPS resources. Database tests used fresh local/in-memory fixtures. Broader regression workflows create/approve/receive only synthetic fixture records; these are separate from live REQ-00001. The focused UI checks perform no business writes.

Intermediate failures were investigated rather than reported as passing: the Engineer search assertion exposed the query-loading bug; touch hit testing exposed closed-drawer interception; the inventory test exposed its control-readiness race. Test-only corrections also avoid racing the 550ms animation, reading a details control before a trusted touch's default action completes, or dismissing the drawer by tapping an underlying equipment action. Two optional screenshot-suppressed browser invocations timed out at the initial CDP `Runtime.enable`, before application loading; the ordinary standalone command then passed the final focused suite. No application change was made for those startup timeouts.

This work performed no live sign-in, live Supabase request, migration, reset, request approval/release, account modification or other live-data write. **Live REQ-00001 and its history were not changed by this session; the live Engineer A → Admin → Engineer B workflow remains paused.** Live data was not independently queried before/after, so this statement describes this session’s actions, not changes another user/process might make.

## Limits

Validation used real headless Chromium with viewport/touch emulation, not physical iOS/Android devices or Safari/Firefox. Unsupported View Transitions behavior was simulated. External fonts/resources were blocked in fixtures; existing font declarations/assets were unchanged. These local changes have not been deployed.

Existing Admin search matches ID, equipment/name and brand; Engineer inventory also matches serial, project and holder. Those inherited matching rules were preserved. Tool-ID searches and exact existing equipment detail targeting were exercised; no broader search-engine feature was introduced.

The earlier standalone legacy Sites database test remains outside the configured test commands and expects obsolete hard-delete behavior, as documented in the previous continuation report. This UI work did not change archive policies or restore hard-delete behavior.

No remaining implementation gap was identified within the two requested UI improvements. Stop here; do not advance the live transfer workflow.
