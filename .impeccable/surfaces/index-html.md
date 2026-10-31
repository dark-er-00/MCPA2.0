---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["2-engr/index.html","css/login-slideshow.css","js/login-slideshow.js"]
---

# Login portfolio

Mode: Operate, with an architectural gallery supporting company identity. Targets: index.html and 2-engr/index.html. The user supplied the complete direction and requested direct implementation.

## Direction contract

THESIS: Keep the real completed projects visible and the sign-in task unobstructed. Desktop balances a full-height, unframed portrait gallery with a centered form; mobile uses its silhouette as a quiet background. The current user brief permits restrained framing but prioritizes natural architecture over an exact percentage.

OWN-WORLD: Near-black authentication panel, charcoal gallery, gold primary action, white and muted warm-gray text. Retain the existing MCPA mark and typography. Glass belongs only to compact screens.

STORY: Recognize MCPA's work, enter a company account, recover access, or open the existing offline demonstration. No invented project claims.

FIRST VIEWPORT: Desktop aims for 44/56, with gallery width clamped to 75–80% of viewport height and at least 440px left for authentication. Cover sizing preserves proportions and fills every edge; the bound limits height cropping to about 6.4%. Photos 4/5/6 use top alignment for roofs, 3/7/9 bottom alignment for watermarks, and 1/2/8 center. A 360px form is centered in the remaining charcoal panel; photo count, progress and Previous/Next arrows remain below it, clear of the photograph. At 900px and below, and on tablets up to 1200px wide at 3:2 or taller, the unchanged fixed photograph/glass card presentation is used with no slideshow timer.

FORM: User-pinned split gallery / mobile glass composition. Code-led build. Seed 4faed49b returned index 3 with no remote challengers; the user's explicit composition overrides exploration. No generated imagery or alternate concepts were needed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: Preserve authentication behavior and uncommitted work; all ten original photograph files and existing derivatives remain unchanged. Project 10 is the default desktop and static compact image; the order is 10, then 1–9. The two arrows are the only navigation controls. Keep the counter and static position indicator, with no autoplay or selection persistence. Preserve natural proportions, the existing split-screen form and compact glass styling. No production writes, migrations, push, commit or deployment. Image manifest records source hashes and encoding provenance. QA uses a network-isolated browser fixture. Existing design sidecar drift is outside this refinement.
