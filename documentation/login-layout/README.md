# Login desktop proportions and responsive verification

Implemented and reviewed 20 October 2026 (Asia/Manila). Starting revision: ba772ba. This refinement improves desktop balance while preserving all nine original photographs, the existing slideshow and authentication behavior. No commit, push, deployment or Supabase action was performed.

## Implemented layout

Desktop targets 44% photography / 56% login. The gallery is bounded between 75% and 80% of viewport height, with at least 440px left for authentication. A fixed 44% was previewed first: on 2560×1080 it removed about 28% of the portrait source height and cut photo 6's roof. The final cap retains approximately 93.6% or more of source height in the tested desktop matrix, with virtually the full original width visible. Natural composition takes precedence over an exact percentage on tall or ultrawide screens.

| Desktop viewport | Measured gallery width | Image / login split |
| --- | ---: | --- |
| 1366×768 | 601px | 44% / 56% |
| 1440×900 | 675px | 46.9% / 53.1% |
| 1920×1080 | 845px | 44% / 56% |
| 2560×1440 | 1126px | 44% / 56% |
| 2560×1080 stress case | 864px | 33.75% / 66.25% to avoid excessive cropping |

Photos use uniform `object-fit: cover`, with no extra transform, desktop blur, duplicate fill, frame or empty margin. Photos 4/5/6 anchor at the top to protect roof details; 3/7/9 anchor at the bottom to protect embedded watermarks; 1/2/8 remain centered. Original PNGs, WebP derivatives and image manifest are byte-for-byte unchanged. Photo 6's logo is already truncated at the right edge in the supplied original. Source resolution, including the small 306×408 and 307×409 files, is unchanged.

The existing 360px form stays centered within its panel with its original spacing. The gallery fills the viewport height. Counter, progress and pause/play remain below the form in the adjacent panel and cover no architecture. Short forms/screens scroll naturally.

The mobile static background, 16px background blur, dark overlay, 14px frosted card, safe areas and input sizing are unchanged. Tablets up to 1200px wide at 3:2 or taller now use that compact presentation to avoid squeezing a portrait gallery beside an undersized form. The slideshow's compact media query matches CSS exactly; no hidden slideshow clock runs behind the static backdrop. This is the only JavaScript change. Timing, transitions, counter, pause controls, image loading/fallback and authentication lifecycle functions are unchanged.

## Screenshots

These are actual local Chrome application renders using the existing isolated fixture. No production account or live database was used. The fixture blocked external HTTPS, including web fonts, so existing font fallbacks can appear. The layout and photo framing were checked in the rendered page.

| View | Full screenshot | All nine actual slideshow photographs |
| --- | --- | --- |
| 1366×768 | [Desktop](screenshots/desktop-1366x768.png) | [All nine](screenshots/all-nine-1366x768.png) |
| 1440×900 | [Desktop](screenshots/desktop-1440x900.png) | [All nine](screenshots/all-nine-1440x900.png) |
| 1920×1080 | [Desktop](screenshots/desktop-1920x1080.png) | [All nine](screenshots/all-nine-1920x1080.png) |
| 2560×1440 | [Desktop](screenshots/desktop-2560x1440.png) | [All nine](screenshots/all-nine-2560x1440.png) |
| 2560×1080 | [Roof stress case](screenshots/desktop-2560x1080-roof.png) | [All nine](screenshots/all-nine-2560x1080.png) |
| 393×852 | [Mobile](screenshots/mobile-393x852.png) | Static original background |
| 768×1024 | [Tablet](screenshots/tablet-768x1024.png) | Static original background |

Contact sheets use the measured gallery region of each actual settled browser frame, reduced uniformly for review. They do not modify application photos. Full captures of all 45 desktop frame/viewport combinations remain under ignored `tests/artifacts/login-portfolio/`. [verification.json](verification.json) records geometry, protected-file checks, screenshot hashes, viewports and real slideshow-cycle results.

## Test results

Commands ran from the repository root:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1'
npm.cmd run test:login-slideshow --prefix tests
npm.cmd run test:auth --prefix tests
```

- Dedicated slideshow suite: **passed**. Fifteen viewport combinations: 375×812, 393×852, 430×932, 768×1024, 900×900, 901×900, 1024×1366, 1024×768, 1200×800, 1201×800, 1366×768, 1440×900, 1920×1080, 2560×1440 and 2560×1080; plus 393×420 keyboard-height and 1366×600 short-screen cases.
- Every photo was captured after its actual transition at all five desktop sizes: **45 frame/viewport combinations**, plus a resumed settled-frame check. Assertions cover painted pixels, uniform cover, no additional transform/blur, retained source area, roof/watermark positions, edge-to-edge coverage, no horizontal overflow, centered form/hit-testing and controls clear of the photograph/form.
- Existing tests passed for 5.5-second real-time cadence/order/wrap, 1.35-second crossfade, Pause/Play, real tab hiding, reduced motion, initial HTML image, WebP/PNG fallback, skipped/all-missing images, root/Engineer/Pages paths, restored sessions, login/logout/recovery/demo lifecycle and static mobile behavior. No uncaught browser errors.
- Authentication regression: **15/15 database/Edge tests passed; full authentication browser suite passed**, including invitation/onboarding/recovery/expired links, all five roles, route guards, tested receipt/return, password visibility, theme/mobile and offline demo isolation. Its included workspace regressions also passed; no workspace files changed.
- Layout detector: **no findings**. JavaScript syntax checks and `git diff --check`: **passed**.
- Visual review: all nine photos inspected in each of five desktop contact sheets; full desktop/mobile/tablet captures reviewed together. Independent read-only review accepted the normal/ultrawide all-nine sheets, roof stress case and mobile capture. No remaining distortion, avoidable subject clipping, gaps, mis-centering or control overlap was identified.

Tests used disposable local PGlite databases and mocked local Supabase transport. No live schema, production record, Auth account, email or Storage object was accessed/changed. Locked test dependencies were restored locally with `npm ci`; no manifest, lockfile or application dependency changed. Physical iOS/Android and Safari testing was unavailable; compact layouts use Chromium emulation.

## Exact file changes

| File | Change |
| --- | --- |
| `css/login-slideshow.css` | Bounded 44% gallery; uniform cover; six photo-specific positions; compact tablet conditions. |
| `js/login-slideshow.js` | One compact media-query expression aligned with CSS. |
| `tests/login-slideshow.browser-checks.cjs` | Responsive/retained-area assertions and complete photo/viewport matrix. |
| `DESIGN.md` | Current login-only layout and framing contract. |
| `.impeccable/surfaces/index-html.md` | Updated login surface direction and constraints. |
| `documentation/LOGIN-SLIDESHOW.md` | Current-report link; earlier geometry marked historical. |
| `documentation/login-layout/README.md` | This implementation/test/screenshot report. |
| `documentation/login-layout/verification.json` | Fresh measurements and protected-file/screenshot hashes. |
| `documentation/login-layout/screenshots/desktop-1366x768.png` | Full desktop capture. |
| `documentation/login-layout/screenshots/desktop-1440x900.png` | Full desktop capture. |
| `documentation/login-layout/screenshots/desktop-1920x1080.png` | Full desktop capture. |
| `documentation/login-layout/screenshots/desktop-2560x1440.png` | Full desktop capture. |
| `documentation/login-layout/screenshots/desktop-2560x1080-roof.png` | Full short-ultrawide roof capture. |
| `documentation/login-layout/screenshots/mobile-393x852.png` | Full mobile capture. |
| `documentation/login-layout/screenshots/tablet-768x1024.png` | Full tablet capture. |
| `documentation/login-layout/screenshots/all-nine-1366x768.png` | Nine-frame gallery contact sheet. |
| `documentation/login-layout/screenshots/all-nine-1440x900.png` | Nine-frame gallery contact sheet. |
| `documentation/login-layout/screenshots/all-nine-1920x1080.png` | Nine-frame gallery contact sheet. |
| `documentation/login-layout/screenshots/all-nine-2560x1440.png` | Nine-frame gallery contact sheet. |
| `documentation/login-layout/screenshots/all-nine-2560x1080.png` | Nine-frame gallery contact sheet. |

Only the first two files affect shipped application behavior. Both HTML entries, `js/auth.js`, permissions/database logic, all original PNGs/WebPs, image manifest, Supabase files and unrelated application pages remain unchanged. Pre-existing untracked `SYSTEM_DOCUMENTATION/` is preserved. Existing design-sidecar drift was not repaired. No commit or push was made.
