# Mounted module UI review

Reviewed on 2026-10-25 by an independent finish reviewer. Scope: Workstream B's
mounted return composer, Admin return inspection, recipient acceptance, and
retirement modules. Fixture identity/module/theme controls are excluded.

The fixture is labeled synthetic and is not a deployed application connection.
It uses local PostgreSQL and a synthetic Storage transport. External font
requests are blocked, so captures can show inherited serif/sans fallbacks;
the host application's Public Sans/Fraunces rendering was not verified here.
Workstream A baseline agreement and deployment readiness remain separate.

## Evidence

All nine final captures were inspected at their original paths under
`test-results/screenshots/`: `return-desktop-light.png`,
`return-desktop-dark.png`, `return-mobile-light.png`, `return-mobile-dark.png`,
`inspection-desktop-light.png`, `inspection-mobile-light.png`,
`recipient-mobile-light.png`, `retirement-desktop-light.png`, and
`retirement-mobile-light.png`. Captures are valid, contain the intended modules,
and include the document top. The inspection captures intentionally retain a
failed-save message after the field was corrected to show recovery context.

`test-results/browser.json` reports 16 passing checks with no uncaught browser
exceptions. The review did not rerun browser automation or a detector.

The first review returned `disposition: fix` for offscreen save errors, receipt
tap targets below 44px, and an internal retirement event token in visible history.

## Verdict

1. Resolved: the intentional failed-save message is visible in desktop/mobile
   inspection recaptures. `js/upgrades/custody-lifecycle/ui.mjs:13` now focuses
   the feedback and scrolls it into view. The browser report records a focused,
   visible recovery-feedback check.
2. Resolved: inspection and recipient mobile recaptures show separated receipt
   rows. `js/upgrades/custody-lifecycle/module.css:39` gives the clickable label
   a 44px minimum height, padding, and bottom spacing. The browser report records
   the measured tap-target check.
3. Resolved: both retirement recaptures show "Retirement proposed".
   `js/upgrades/custody-lifecycle/ui.mjs:5` maps presentation wording, and
   `js/upgrades/equipment-retirement/retirement.mjs:14` uses that mapping while
   preserving stored event identifiers.

## Remaining

Clear. No regressions observed from the fix batch. This ship verdict covers the
three scored fixes only within the mounted-fixture scope; it does not establish
host integration, baseline agreement, or deployment readiness.

disposition: ship

## Ordinary-extension documentation check

No design-system changes. Checked `PRODUCT.md`, `DESIGN.md`, `css/global.css`,
`css/theme.css`, the mounted module sources, and `ARCHITECTURE.md` against the
documenter role and `reference/document.md`. Existing `DESIGN.md` remains an
authentication-only record; its scope statement at line 92 directs workspace
surfaces to the existing global/theme files. Shared `DESIGN.md` and
`.impeccable` files were preserved. This file is review evidence, not a new
normative design system.

- Palette: inherited light white/gold and optional charcoal/gold tokens from
  `css/theme.css:13` and `css/theme.css:28`.
- Type ramp: inherited Public Sans body and Fraunces headings from
  `css/global.css:28`; module task headings clamp 28-38px, section headings are
  19px, body 15px, labels 14px, and secondary labels 13px.
- Layout rule: independently mounted, maximum 1120px width, 16-36px fluid outer
  padding, 72ch prose measure, and single-column form rows below 600px.
- Surface rule: flat ruled lists and 6px controls use semantic surface/border
  tokens; no raster assets, new material effects, or shared theme changes.
- Interaction rule: 44px controls and clickable receipt labels, themed focus,
  caret and selection, focused visible errors, and reduced-motion transitions.

Not canonized or repaired: fixture fallback fonts are an acknowledged host
integration limit; login's separate design record is intentional scope, not
authority to rewrite shared workspace documentation during this extension.
