---
name: MCPA Login
description: Login-specific charcoal and gold gallery; the workspace keeps its existing light and dark themes.
colors:
  login-gold: "#fabb00"
  login-gold-hover: "#ffd04a"
  login-ink: "#111312"
  login-panel: "#111513"
  login-gallery: "#202521"
  login-field: "#191f1b"
  login-text: "#f5f3ed"
  login-muted: "#b9beb9"
  login-border: "#525a54"
  login-secondary-hover: "#252d27"
  login-glass: "rgba(10, 12, 12, .68)"
typography:
  login-heading:
    fontFamily: "Fraunces, serif"
    fontSize: "42px"
    fontWeight: 480
    lineHeight: 1.15
    letterSpacing: "-.03em"
  login-heading-compact:
    fontFamily: "Fraunces, serif"
    fontSize: "34px"
    fontWeight: 480
    lineHeight: 1.15
    letterSpacing: "-.03em"
  gallery-title:
    fontFamily: "Fraunces, serif"
    fontSize: "23px"
    fontWeight: 480
    lineHeight: 1.2
    letterSpacing: "-.02em"
  login-body:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13px"
    lineHeight: 1.7
  login-label:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  login-button:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13.5px"
    fontWeight: 700
rounded:
  login-control: "6px"
  login-glass: "16px"
spacing:
  login-label-gap: "8px"
  login-field-gap: "20px"
  login-field-gap-compact: "18px"
  login-section-gap: "24px"
  login-mark-gap: "32px"
components:
  login-button-primary:
    backgroundColor: "{colors.login-gold}"
    textColor: "{colors.login-ink}"
    typography: "{typography.login-button}"
    rounded: "{rounded.login-control}"
    padding: "10px 18px"
  login-button-primary-hover:
    backgroundColor: "{colors.login-gold-hover}"
  login-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.login-text}"
    rounded: "{rounded.login-control}"
    padding: "10px 18px"
  login-button-secondary-hover:
    backgroundColor: "{colors.login-secondary-hover}"
  login-input:
    backgroundColor: "{colors.login-field}"
    textColor: "{colors.login-text}"
    rounded: "{rounded.login-control}"
    padding: "11px 13px"
  login-card-compact:
    backgroundColor: "{colors.login-glass}"
    textColor: "{colors.login-text}"
    rounded: "{rounded.login-glass}"
    padding: "30px 26px"
---

# Design System: MCPA Login

## Overview

**Creative North Star: "MCPA's completed-project gallery"**

The login combines real project photography with a quiet charcoal and gold sign-in surface. The established Fraunces and Public Sans pairing connects the gallery to the existing product identity; the original MCPA mark and photographic watermarks remain intact.

This document records only the authentication surface in `index.html` and `2-engr/index.html`. Its dark palette is local to login. The workspace continues to use its existing bright default and optional dark mode from `css/global.css` and `css/theme.css`; these login rules do not redefine workspace components.

**Key Characteristics:**
- Portrait-sensitive photographic framing beside a restrained desktop form.
- Gold actions and focus indicators on charcoal login surfaces.
- A static blurred photograph and glass form container on compact screens.
- Existing brand typography with naturally scrolling forms.

## Colors

Warm gold marks actions against green-tinted charcoal; warm off-white and muted gray establish text hierarchy. All frontmatter color tokens are login-specific.

### Primary

- **Login Gold:** primary action, brand mark, progress and focus.
- **Login Gold Hover:** the primary action's hover state.

### Neutral

- **Login Ink / Panel / Gallery:** the page foundation, authentication panel and photograph surround.
- **Login Field / Secondary Hover:** distinct input surfaces and secondary-button hover feedback.
- **Login Text / Muted:** headings and controls versus supporting copy.
- **Login Border:** visible field and secondary-button outlines.
- **Login Glass:** the compact form container.

**The Local Palette Rule.** Apply the charcoal login palette only within authentication; preserve the workspace's existing light default and optional dark mode.

## Typography

**Display Font:** Fraunces, with a serif fallback.  
**Body Font:** Public Sans, with the existing platform sans-serif fallbacks.

The serif heading and gallery title carry identity; the sans-serif form copy and controls stay compact and readable. The heading, compact heading, gallery title, body, label and primary-button roles are specified in frontmatter. Field text is 14px on desktop and 16px on compact screens. The inherited JetBrains Mono identity remains available elsewhere in the product; login does not introduce a new mono role.

## Layout

Desktop targets a 44% gallery / 56% authentication split. The gallery width is clamped between 75% and 80% of viewport height, with a 440px minimum authentication allowance. This retains a near-3:4 frame on short ultrawide screens instead of enlarging the portrait photos into a landscape crop. At 1366×768, 1920×1080 and 2560×1440 the split is 44/56; 1440×900 uses approximately 47/53 to preserve the full width of the photographs. The sticky gallery fills the viewport height with zero padding, border or caption row. Uniform `cover` scaling preserves natural proportions and limits source-height cropping to approximately 6.4%. Photos 4, 5 and 6 anchor at the top to protect roof structure; photos 3, 7 and 9 anchor at the bottom to protect embedded watermarks; the remaining photos stay centered. The authentication panel centers the existing form no wider than 360px, with 64px vertical padding and responsive horizontal padding. Photo count, progress and Previous/Next arrows remain at the bottom of the authentication panel, outside the photograph and below the form.

At 900px and below, or on tablets up to 1200px wide with an aspect ratio of 3:2 or taller, a single column uses the existing static fixed photograph with cover sizing. The slideshow controller uses the same compact condition, so no hidden slideshow timer runs behind that background. Safe-area-aware outer padding starts at 28px vertically and 20px horizontally. The content is at most 400px wide; the form card grows naturally. At heights of 600px or less, compact forms align to the top so the document can scroll. Label, field and section spacing follow the frontmatter rather than a newly imposed global scale.

## Elevation & Depth

Desktop login depth comes from adjacent dark tones: the form itself has no card border or shadow. Compact login uses a blurred photograph (16px), a dark overlay and a translucent card with backdrop blur (14px). Its soft shadow is `0 20px 56px rgba(0, 0, 0, .2)`; its border is `1px solid rgba(255, 255, 255, .1)`. Browsers without backdrop blur receive an opaque panel background.

**The Compact Glass Rule.** Keep the glass treatment within compact login; the desktop authentication form remains flat.

## Shapes

Login controls and the mark share the control radius in frontmatter. The compact card has a larger radius; the desktop form has square, invisible container edges. Photography remains rectangular. Thin field outlines, a 2px progress line and simple SVG controls carry structure without ornamental frames.

## Components

### Buttons

Primary actions use gold with dark text; secondary actions use a transparent fill and visible outline. Both use a minimum height of 48px and 150ms background/border transitions. Secondary hover brightens the border to the muted text color. Disabled actions use 60% opacity and a waiting cursor. Focus uses a 2px gold outline with 4px offset. Text links and password visibility controls retain at least 44px height.

### Inputs / Fields

Inputs use the dark field surface, outlined edge and frontmatter padding. They have a minimum height of 50px, a gold caret and gold focus border. Keyboard focus adds a 2px gold outline with 2px offset. Compact fields use larger text for phone entry. Existing labels, feedback and password visibility remain part of the form.

### Cards / Containers

Desktop authentication uses a transparent, borderless container. The compact card uses the glass token, padding and radius in frontmatter, with depth treatments above. Its height follows content rather than clipping recovery, feedback or demo choices.

### Gallery Controls

A tabular photo counter, static gold position line and two subtle Previous/Next chevrons sit near the bottom of the desktop authentication panel. They occupy no photographic height and obscure no building detail or watermark. Each arrow has a 32px-wide, 44px-high hit target, an accessible label and visible gold focus feedback. Project 10 is first in the ten-photo gallery, followed by Projects 1–9; each new visit starts at `01 / 10`. Only arrow activation changes photographs. Navigation wraps, ignores overlapping loads/crossfades, and uses a 650ms crossfade. There is no autoplay, Play/Pause control, elapsed-time progress, or saved selection. Reduced motion removes the crossfade. Compact login keeps Project 10 as its static background and hides gallery controls; its existing crop and glass styling are preserved. The original Project 10 JPEG and all nine PNG/WebP pairs remain unchanged.

## Do's and Don'ts

### Do:

- **Do** scope login colors and component rules to authentication.
- **Do** retain Fraunces, Public Sans, the MCPA mark and the supplied image watermarks.
- **Do** protect the building/roof composition using bounded portrait framing and photo-specific positioning; keep the compact photographic background stable.
- **Do** preserve visible focus, readable fields, reduced motion and natural form scrolling.

### Don't:

- **Don't** replace the workspace's existing light default or optional dark mode with the login palette.
- **Don't** extend compact login glass to the desktop form or unrelated workspace surfaces.
- **Don't** stretch or synthesize photographic detail, add blurred desktop fill, or force an exact split when it excessively crops the architecture. Keep original image assets unchanged.

<!-- Sources: css/login-slideshow.css; css/global.css; css/components.css; css/theme.css; js/login-slideshow.js; both entry points. Surface contract: .impeccable/surfaces/index-html.md. Verification and limitations: documentation/LOGIN-SLIDESHOW.md. Sidecar tonal ramps are illustrative preview metadata, not additional implemented CSS tokens. -->

