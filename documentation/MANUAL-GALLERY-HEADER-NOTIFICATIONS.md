# Manual login gallery, account dismissal and notification read state

Implemented and verified October 21, 2026, on `Updated-MCPARole`.

## Result

- Exactly **10 unique source photographs** remain: `project-10.jpg` and `project-1.png` through `project-9.png`. The manifest now registers all ten; source hashes match every original. All nine existing WebP derivatives remain unchanged. No photo or derivative was added, removed, rewritten or duplicated.
- The existing Project 10 JPEG is featured in initial HTML, preloading and controller initialization on **both desktop and mobile**, in both entry points. The order is **10, 1, 2, 3, 4, 5, 6, 7, 8, 9**. Refresh, a new visit, logout and page-cache restoration reset to Project 10. Nothing stores the selected index.
- **Autoplay is removed.** No progression timer, interval, animated elapsed-time progress or Play/Pause functionality remains. The sole timeout in the gallery is a ten-second image-request failure guard; it cannot advance a photograph. Once images settle, instrumentation observes zero gallery timers.
- Native Previous/Next buttons manually navigate all ten images and wrap in both directions. Counter starts `01 / 10`; a static proportional position line updates with it. Decoded incoming images, two reusable layers, generation guards and a transition lock protect rapid navigation. Crossfades last 650ms and are removed for reduced motion. Existing accessible labels and visible focus remain; the counter announces changes politely.
- Desktop retains the existing gallery/form proportions. Centered `object-fit: cover` preserves the Project 10 building and embedded MCPA logo without distortion or blank margins. Mobile/tablet retain the approved crop, 16px background blur, overlay, 14px glass blur, spacing, controls and responsive breakpoints. Gallery controls remain hidden on compact screens. Original authentication handlers remain in place.

## Account dropdown

`js/auth.js` uses one delegated document click listener that closes an open account `<details>` only when the target is outside that element. The summary and dropdown are both inside it, so the opening click and inside actions remain safe. One Escape listener closes it and restores summary focus. An AbortController disposes a previous handler pair if initialization is repeated; account rerenders only replace element handlers.

The native summary keeps Enter/Space and sequential Tab behavior. `aria-expanded` follows the native toggle state, with `aria-controls` pointing to the dropdown. Account opening closes Notifications without stealing focus; Notifications opening closes Account. My Account, theme and logout use their existing actions. Responsive positioning CSS is unchanged.

## Mark all as read

The new secondary button is immediately left of Close, in a wrapping notification header. It disables when there are no unread records, data has not loaded, the service is unavailable or a read/write is running. Close and Activity Logs remain available.

No new database API is required. The implementation reuses `mcpa_monitoring_snapshot()` and **`mcpa_monitoring_mark_read(p_id)`** from the existing monitoring migration. That RPC resolves the authenticated active profile on the server, restricts updates to `recipient_id = person.id`, rejects other recipients (including for Admin), and uses `coalesce(read_at, clock_timestamp())` for idempotency. Existing RLS and permissions are unchanged. No direct table update is attempted by the frontend.

The batch freezes the currently loaded unread IDs, serializes individual authorized RPCs, and prevents overlapping batches/individual writes. It changes local state only after each backend confirmation and reads a fresh authoritative snapshot after completion or partial failure. Snapshot reads during writes are deferred; concurrent read hints request another snapshot. Incoming notifications stay unread unless included in a later explicit batch. Generation and profile checks discard stale responses and stop subsequent writes after session changes.

Failures show confirmed progress and retry guidance. Confirmed updates persist; unconfirmed items are not declared read. A failed reconciliation shows the existing stale-state warning. Partial batches are intentionally **not atomic**: retry processes remaining unread records. Notification contents, linked records, equipment, requests, movements, custody and audit history are untouched.

## Executed verification

Commands used PowerShell and `npm.cmd`. Browser runs used `$env:MCPA_CHROME_NO_SANDBOX='1'` for this managed Windows environment. PostgreSQL tests used isolated in-memory PGlite fixtures; browser SDK calls were routed to those fixtures, and external HTTPS was blocked. Existing SQL files were applied only inside those disposable fixtures; nothing connected to production Supabase.

| Command | Final result |
| --- | --- |
| `npm.cmd test --prefix tests` | **66/66** Node tests; **8/8** movement database scenarios; full auth/browser run passed (9 reported check groups); 0 failures, 0 skipped |
| `node --test --test-concurrency=1 tests/monitoring-database.test.cjs tests/feature-frontend.test.cjs` | **19/19**, 0 failures, 0 skipped |
| `npm.cmd run test:features --prefix tests` | **31/31** Node tests; all 3 feature browser check groups passed; 0 failures, 0 skipped |
| `npm.cmd run test:login-slideshow --prefix tests` | **28/28** named browser checks, 0 failures |
| `npm.cmd run test:header-notifications --prefix tests` | **22/22** named browser checks, 0 failures |
| `git diff --check` | Passed |

Counts are per suite and include overlapping coverage; they are not a count of distinct tests across suites. The main suite covers authentication, accounts, five roles, route guards, navigation, inventory, movements, theme, responsive headers, recovery and offline-demo isolation. Feature checks also exercise individual notification links, authorization and read persistence. The gallery suite replaces obsolete autoplay assertions with manual navigation, reset, static progress, image fallback, lifecycle and responsive assertions. All browser suites completed with no uncaught browser exceptions.

Earlier attempts exposed new fixture selector/SQL-cast/page-reload timing errors, which were corrected before the final successful runs. An initial main-suite browser attempt without the managed-environment Chrome option timed out; the complete suite passed after rerunning with that option. Final raw logs are in `tests/artifacts/manual-main-regression.log`, `manual-focused-regression.log`, `manual-features-run.log`, `manual-gallery-run.log` and `manual-header-run.log`.

## Screenshots and visual review

Paths below are relative to the repository root. All seven requested states were captured and inspected, along with tablet and narrow-phone samples. No distorted photograph, control overlap, horizontal overflow or inaccessible action was found. At 320px the notification actions wrap together below the heading, preserving their left-to-right order. Notification content scrolls within the popup.

| State | Screenshot path |
| --- | --- |
| Desktop, Project 10 default | `tests/artifacts/manual-gallery/login-1366x768-project-10.png` |
| Desktop, manual Next | `tests/artifacts/manual-gallery/desktop-next.png` |
| Desktop, manual Previous | `tests/artifacts/manual-gallery/desktop-previous.png` |
| Mobile, Project 10 / glass | `tests/artifacts/manual-gallery/login-393x852-project-10.png` |
| Tablet login | `tests/artifacts/manual-gallery/login-768x1024-project-10.png` |
| Account open | `tests/artifacts/header-notifications/desktop-account-open.png` |
| Account dismissed outside | `tests/artifacts/header-notifications/desktop-account-outside-dismissed.png` |
| Notifications before mark all | `tests/artifacts/header-notifications/desktop-notifications-unread.png` |
| Notifications after mark all | `tests/artifacts/header-notifications/desktop-notifications-read.png` |
| Mobile notifications | `tests/artifacts/header-notifications/notifications-393x852.png` |
| Narrow notifications | `tests/artifacts/header-notifications/notifications-320x700.png` |
| Mobile account | `tests/artifacts/header-notifications/account-393x852.png` |
| Tablet account | `tests/artifacts/header-notifications/account-768x1024.png` |

The gallery folder contains **29 PNG captures**, including every project and 15 viewport sizes from 375×812 through 2560×1440/2560×1080. The header folder contains **12 PNG captures**, covering desktop, tablet, 393px and 320px. Machine-readable named checks are in each folder's `results.json`. These local evidence files are ignored by the existing `tests/.gitignore`.

## Exact working-tree changes

Modified tracked files:

1. `index.html`
2. `2-engr/index.html`
3. `css/login-slideshow.css`
4. `css/components.css`
5. `js/login-slideshow.js`
6. `js/auth.js`
7. `js/monitoring.js`
8. `images/login-slideshow/manifest.json`
9. `scripts/optimize-login-images.cjs`
10. `tests/auth.browser.cjs`
11. `tests/login-slideshow.browser-checks.cjs`
12. `tests/package.json`
13. `DESIGN.md`
14. `.impeccable/surfaces/index-html.md`
15. `documentation/LOGIN-SLIDESHOW.md`

New source/report files:

1. `tests/header-notifications.browser-checks.cjs`
2. `documentation/MANUAL-GALLERY-HEADER-NOTIFICATIONS.md`

Pre-existing untracked file, preserved byte-for-byte: **`images/login-slideshow/project-10.jpg`** (SHA-256 `93ead3eff98e0d7c5f0336a4f0dd708ee9a67fdf3cd7df8a19cb33700ca10819`). It was present before this work and was not created by this implementation. No other initial changes were present. The active migration `supabase/migrations/202610200001_verified_request_inventory.sql` is unchanged.

Final Git status: branch `Updated-MCPARole`, 15 modified tracked files, 2 newly created untracked source/report files, and the original untracked Project 10 JPEG. Nothing staged, committed, pushed, pulled, merged, reset or deployed.

## Manual steps and limits

- **No new Supabase migration or SQL execution is required.** The existing monitoring migration/API must already be installed for notifications, as before. No production database/schema changes were prepared or performed.
- A future authorized release must include the currently untracked original Project 10 JPEG alongside the code, manifest and new test. This session stops before staging, committing, pushing or deploying.
- Browser evidence is from local headless Chrome; Safari, Firefox, real devices, production login and deployed Supabase were not exercised. Remote fonts/resources were blocked in the isolated fixture, so screenshot typography uses available fallbacks.
- The preserved Project 10 original is a 2,201,112-byte JPEG with no pre-existing optimized derivative. It receives high-priority preload; the original nine photos retain optimized loading/fallbacks and adjacent-photo prefetch. Slow-connection first-load performance remains dependent on that original JPEG size.
- The existing `.impeccable/design.json` sidecar predates `DESIGN.md`. It was left unchanged; refreshing it is a separate design-documentation task.
