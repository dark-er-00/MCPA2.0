# Premium login portfolio

Implemented October 18, 2026; desktop layout corrected October 20, 2026, for both `index.html` and `2-engr/index.html`.

**Current behavior (October 21, 2026):** Project 10 now opens a ten-photo manual gallery on both portals, with no autoplay and a static position indicator. Mobile keeps the approved static photograph and glass design. See [implementation, verification and screenshot report](MANUAL-GALLERY-HEADER-NOTIFICATIONS.md). The autoplay and nine-photo descriptions below are historical.

## Current desktop proportions

See [Desktop proportion refinement and fresh screenshots](login-layout/README.md). That review supersedes the historical 75%-of-height/contain geometry below. The current layout targets 44/56 with bounded portrait framing, photo-specific roof protection and an extended compact tablet breakpoint; authentication and all photo assets are unchanged.

## Historical design and behavior

Desktop uses a full-height photographic panel whose width is 75% of viewport height, capped to leave at least 440px for the near-black authentication panel. At 1366×768, 1440×900 and 1920×1080 the gallery is respectively 576×768, 675×900 and 810×1080. There is no gallery padding, frame, border or caption row. The existing near-3:4 photographs use `object-fit: contain`, preserving each entire composition and watermark with no desktop blur, duplicate background, stretching, zoom or extra cropping. The counter, gold progress line and keyboard-operable Pause/Play sit at the bottom of the authentication panel, covering none of the photograph.

The 360px authentication form is centered in its own panel. The existing MCPA mark, serif heading, account description and all authentication controls are retained. Gold actions, clear field outlines, restrained spacing and visible focus rings distinguish controls. Password visibility, recovery, loading/error messages and Offline Demo retain their original handlers.

At widths of 900px and below, the gallery changes to a fullscreen static background. Project 1 (the first successful photo if it fails) is selected deterministically for the visit. It remains fixed during typing, keyboard-height changes, password recovery, demo selection, and logout. The image uses cover, 16px blur, a 52% dark overlay and overscan to hide blur edges. The centered glass card uses 68% near-black, 14px backdrop blur, a 10% white border and 16px corners. Its contents grow naturally on short screens; form controls are 44–50px tall. An opaque fallback supports browsers without backdrop blur. Mobile has no slideshow clock or visible gallery controls.

Desktop advances every 5.5 seconds with a 1.35-second crossfade. The next photo is loaded and decoded before transitioning, and that decoded node is inserted directly. Stale animation-finish callbacks are guarded, and finished fades are retired so tab visibility or Pause/Play cannot restart a completed fade from transparent. Only the first and upcoming photo load initially; mobile loads only the first WebP. Two reusable desktop layers and a separate static mobile image prevent viewport changes from swapping the mobile photo. Missing WebP falls back to the preserved PNG; missing photos are skipped. A complete asset failure leaves readable charcoal with no broken-image icon.

Pause/Play stops timing and animations. Document hiding, explicit authentication lifecycle calls, host hiding and page-cache events suspend activity. Repeated form rendering does not add timers or controls. Reduced motion uses a still image, without an automatic transition. Hiding login also hides every gallery element from protected screens.

## Files changed in the October 20 layout correction

- `index.html`, `2-engr/index.html`: removed the caption row and moved slideshow controls after the authentication content.
- `css/login-slideshow.css`: viewport-height-based gallery width, edge-to-edge photography, bottom controls in the right panel and reserved form spacing.
- `tests/login-slideshow.browser-checks.cjs`: asserts gallery geometry, near-total panel coverage, centered form and non-overlapping controls at the requested viewports.
- `DESIGN.md`, `.impeccable/surfaces/index-html.md`, `documentation/LOGIN-SLIDESHOW.md`: updated layout contract and verification record.

Existing uncommitted work was retained. This correction does not change `js/auth.js`, `js/login-slideshow.js`, test harness/package configuration, backend code or image assets.

## Files from the original slideshow implementation

- `index.html`, `2-engr/index.html`: matching gallery markup, caption/control placement, correctly sized initial images and static mobile source. Existing relative CSS/script integration is retained.
- `css/login-slideshow.css`: responsive presentation, local palette, readable glass, touch targets, focus and reduced-motion states.
- `js/login-slideshow.js`: desktop slideshow and static mobile lifecycle; existing `MCPALoginSlideshow.show()` / `.hide()` API retained.
- `images/login-slideshow/project-1.webp` through `project-9.webp`: regenerated from the current cropped PNGs.
- `images/login-slideshow/manifest.json`: source dimensions, byte sizes, SHA-256 hashes, quality and provenance.
- `scripts/optimize-login-images.cjs`: repeatable WebP generation and provenance manifest using the existing test canvas dependency.
- `tests/login-slideshow.browser-checks.cjs`: layout, lifecycle, failure and visual regression checks.
- `tests/auth.browser.cjs`: updated dedicated-suite completion message; existing local fixture and authentication tests retained.
- `documentation/LOGIN-SLIDESHOW.md`: this implementation and verification report.
- `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/index-html.md`: scoped login design tokens, component references and surface contract; workspace themes remain unchanged.
- `.impeccable/review/`: local copies of the seven reviewed viewport screenshots.

`js/auth.js` and `tests/package.json` already contained uncommitted login integration when this task began. This redesign preserves those changes without altering authentication logic. Both original entry points and the source PNGs are preserved. No dependency, production database, migration or GitHub Pages configuration changes were needed.

## Image optimization

All sources are PNGs. Derivatives retain the original dimensions, color content and embedded branding; none are upscaled or synthesized.

| Photo | Dimensions | PNG bytes | WebP bytes |
| --- | --- | ---: | ---: |
| 1 | 430 × 574 | 388,123 | 38,616 |
| 2 | 560 × 747 | 456,024 | 26,006 |
| 3 | 559 × 745 | 637,680 | 45,418 |
| 4 | 476 × 635 | 563,905 | 61,996 |
| 5 | 306 × 408 | 196,386 | 18,946 |
| 6 | 307 × 409 | 178,465 | 14,610 |
| 7 | 502 × 670 | 478,676 | 34,128 |
| 8 | 335 × 446 | 220,335 | 18,794 |
| 9 | 498 × 664 | 431,155 | 29,772 |
| **Total** | | **3,550,749** | **288,286** |

This is a **91.9% reduction**. The first desktop/mobile photo is 38.6 KB. These sources are already small, so additional responsive derivatives would add complexity without meaningful bandwidth savings. All nine original SHA-256 hashes are checked against the pre-edit record.

Regenerate after replacing source photographs:

```powershell
node scripts/optimize-login-images.cjs
```

## Verification

Run from the repository root:

```powershell
$env:MCPA_CHROME_NO_SANDBOX='1' # Compatibility option for this managed Windows environment
npm.cmd run test:auth --prefix tests
npm.cmd run test:login-slideshow --prefix tests
node tests/auth.browser.cjs --login-slideshow-fallback
```

The browser harness uses isolated PGlite fixtures and a local Supabase transport; external HTTPS is blocked. Test schema setup occurs only inside disposable local fixtures. No live database, migration deployment, email sending or production sign-in occurs.

- Existing authentication database/endpoint tests: **15 passed**.
- Existing full authentication browser suite: **passed**, including account invitations, onboarding, recovery/expired links, sessions, all five roles, permissions, password visibility, mobile controls, workspace regressions and offline demo isolation.
- Dedicated login suite: **passed** across all seven requested viewports, plus 393 × 420 and 1366 × 600 short screens. Checks cover the first image before slideshow JavaScript, all nine photos and wraparound with rendered-pixel visibility checks after each settled fade, real-time 5.5-second cadence, crossfade duration, Pause/Play, real browser-tab hiding and pause/resume after a completed fade, reduced motion, static mobile interaction, no extra mobile photo requests, repeated rendering with a single desktop timer, sign-in/logout/session/demo lifecycle, saved themes, asset failures, root/engineer/`/MCPA/` paths, field hit testing and no horizontal overflow.
- Image-failure checks inside the dedicated suite: **passed** for desktop and mobile. JavaScript syntax and Git whitespace checks passed; **9/9 original source hashes are unchanged**.
- October 20 independent visual review: **pass**, inspecting fresh 1366×768, 1440×900, 1920×1080 projects 3 and 7, 393×852 and 768×1024 captures. The implementing reviewer additionally inspected desktop projects 1, 2 and 3. Complete compositions and watermarks remain visible; gallery framing is eliminated and controls cover no photograph or form. Reference screenshot 2 was not available in the conversation, so comparison used the user's detailed written requirements.
- Geometry assertions passed: the gallery reaches the viewport edges, its width follows 3:4, and the first photograph leaves less than 2px of unused space from source-ratio rounding at every requested desktop size. Existing `contain` sizing preserves the full image for every slide.
- Layout detector: no CSS findings. Two HTML-only `cramped-padding` warnings refer to flush background containers; zero padding is intentional for the photographic panel. Rendered form/card spacing and control separation were verified.

These suites were rerun on October 20. The default Chrome sandbox launch timed out at `Runtime.enable`; the existing `MCPA_CHROME_NO_SANDBOX=1` compatibility option resolved it. All 15 database/endpoint tests passed on the first run; the full authentication browser suite and dedicated slideshow suite subsequently completed successfully.

Screenshots and the machine-readable report are in `tests/artifacts/login-portfolio/` (local, ignored test artifacts). The current report is `results.json`; `fallback-results.json`, `visual-review.md` and `final-overview.jpg` are historical October 18 artifacts. Current October 20 captures are:

| Viewport/state | Files |
| --- | --- |
| 1366 × 768 | `login-1366-early.png`, `login-1366-later.png` |
| 1440 × 900 | `login-1440-early.png`, `login-1440-later.png`, `login-1440-project-5.png` |
| 1920 × 1080 | `login-1920-early.png`, `login-1920-later.png`, `login-1920-project-1.png` through `login-1920-project-9.png` |
| 768 × 1024 | `login-768-early.png` |
| 375 × 812 | `login-375-early.png` |
| 393 × 852 | `login-393-early.png` |
| 430 × 932 | `login-430-early.png` |
| 393 × 420 | `login-393-keyboard-height.png`, `login-393-keyboard-scrolled.png` |
| 1366 × 600 | `login-1366-short.png`, `login-1366-short-scrolled.png` |
| Asset failure | `login-all-images-unavailable.png`, `login-mobile-images-unavailable.png` |

Short-screen captures show the actual viewport at the top and after scrolling. They avoid full-page screenshot artifacts from fixed/sticky backgrounds. Source composition is also documented in `source-contact-sheet.png`. `login-resumed-settled-slide.png` verifies that resuming a completed fade keeps the photograph painted.

## Limits and deployment

Original photos are only 306–560px wide; some softness on large displays is inherent in the supplied sources. The design preserves their real detail rather than inventing sharper content. Higher-resolution versions with the same crop would improve large-display sharpness.

Verification uses local Chromium. Software-keyboard height is simulated; physical iOS/Safari keyboards and public GitHub Pages latency are not tested. External fonts are blocked by the existing isolated test harness, so screenshots validate the existing fallback typography. The application's existing Google Fonts stylesheet remains unchanged; no new external dependency was introduced.

The redesign is ready for deployment after review of the local changes. No commit, push or deployment is performed by this task, and all previously uncommitted work is retained.




