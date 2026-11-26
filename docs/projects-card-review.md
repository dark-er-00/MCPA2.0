# Projects card acceptance review

## Optional project photos — local acceptance

The current cards use a full-width title, location, divider and assignee whenever the project has no usable photo. A linked image occupies the existing image column. A failed image switches the same button to the text layout. Both variants retain the stage, project ID, accessible name and keyboard behavior. Long values remain readable in Project Details.

| Local check | Result |
| --- | --- |
| Mixed photo and text-only cards | PASS. The nine Admin cards measured 363 × 148px at 1440 × 900 in both themes and 316 × 134px at 1280 × 720. The same Garden Workshop record measured 363 × 148px before and after its first upload. |
| Responsive and role views | PASS. The Engineer and Architect kept their four and three assigned projects. At 820px cards measured 383 × 148px in two columns. At 390px mixed cards measured 362 × 313px in one column, with no horizontal overflow. |
| Add/Edit and replacement | PASS in the local fixture. Created with and without a photo, added a photo later, replaced it, canceled a replacement, cleared a selection and edited unrelated metadata. Refreshed pages loaded the saved bytes. |
| Format and access checks | PASS in the local fixture. The picker rejected unsupported, oversized and mislabeled files. The server checked actual file content; both field roles were denied uploads. The assigned person could load the saved image. A bare object path was denied. |
| Existing Projects behavior | PASS. The focused Chrome suite covered stages, missing assignee, failed image fallback, search, scope, archive, pagination, keyboard opening, history, assignments, and browser console/network isolation. The frontend suite passed 65 tests. |
| Permanent database/storage saves | BLOCKED and UNVERIFIED. The repository has equipment photo storage but no durable project-photo association, project storage access policy or validated photo-save endpoint. Without a configured adapter, selecting a photo blocks submission before metadata is written. Clearing the selection allows the ordinary project save. |

The Admin-only file picker is the last field before the form actions. Its label, format/size help, live status, image preview and clear button support keyboard use. Accepted files are JPEG, PNG and WebP up to 5 MiB (shown as 5 MB). It reuses the equipment validator, then checks browser image decoding. The selection preview stays in the form. Files are never encoded into project records. The process-local fixture stores uploaded bytes separately and issues a time-limited read link scoped to the project. Replacing a photo retains the old object's bytes. A normal browser reload preserves the current photo; restarting the fixture resets its data.

### Preview and visual evidence

| View | Open |
| --- | --- |
| Mixed Projects grid | [Admin](http://127.0.0.1:4201/?fixture=admin#sites) · [Engineer](http://127.0.0.1:4201/?fixture=sky#sites) · [Architect](http://127.0.0.1:4201/?fixture=architect#sites) |
| Photo controls | [Add Project](http://127.0.0.1:4201/?fixture=admin&editor=add#sites) · [Edit Garden Workshop with a saved photo](http://127.0.0.1:4202/?fixture=admin&editor=edit#site-detail?record=10000000-0000-4000-8000-000000000605) |
| Same project, two independent fixture instances | [Before upload](http://127.0.0.1:4201/?fixture=admin&project=Garden%20Workshop#sites) · [After upload](http://127.0.0.1:4202/?fixture=admin&project=Garden%20Workshop#sites) |
| Dark screenshots | [Mixed grid](../tests/artifacts/projects-photos/admin-dark.png) · [Before](../tests/artifacts/projects-photos/before-dark.png) · [After](../tests/artifacts/projects-photos/after-dark.png) |
| Light screenshots | [Mixed grid](../tests/artifacts/projects-photos/admin-light.png) · [Before](../tests/artifacts/projects-photos/before-light.png) · [After](../tests/artifacts/projects-photos/after-light.png) |
| Other screenshots | [Small desktop](../tests/artifacts/projects-photos/small-laptop.png) · [Engineer](../tests/artifacts/projects-photos/engineer.png) · [Architect](../tests/artifacts/projects-photos/architect.png) · [Tablet](../tests/artifacts/projects-photos/tablet.png) · [Mobile](../tests/artifacts/projects-photos/mobile.png) · [Add](../tests/artifacts/projects-photos/add.png) · [Edit](../tests/artifacts/projects-photos/edit.png) |

To restart, run each pair in a separate PowerShell window from the repository root after its previous instance has stopped. The second command uploads the sample image through the same fixture endpoint used by the dialog.

```powershell
$env:PORT = '4201'
node tests/premium-v2/preview.cjs --projects-review
```

```powershell
$env:PORT = '4202'
node tests/premium-v2/preview.cjs --projects-review --photo-example
```

### Proposed production storage policy for review

1. Create a private `project-photos` bucket and a nullable active photo reference on `public.sites` (or an equivalent relation keyed by `sites.id`). Store immutable object keys of the form `<site UUID>/<photo UUID>.<validated extension>`. Existing records start with no reference. The current construction migration limits the metadata patch keys accepted by `mcpa_save_project`; the equipment bucket and `equipment.image_url` serve a different entity.
2. Add a trusted multipart endpoint that authenticates an active Admin from the session, validates bytes, size and decoded dimensions, and chooses the object key itself. Reserve a project UUID server-side for new records; keep the existing personnel and project validators. Disallow client-selected object paths, cross-project references, direct bucket writes and overwrites.
3. Stage the validated object privately. Commit the project metadata, active reference, project version and history in one database transaction. Key retries by actor, operation ID and payload fingerprint. Keep the old reference active on error, and reconcile an uncertain save by operation ID before retrying. Retain old objects and handle unlinked staged objects separately under a reviewed retention policy.
4. Issue short-lived URLs only for the currently linked object after checking the same authorization as Project Details: authorized Admins or the active assigned field identity for an active non-Office project. Exclude unassigned, archived and foreign project photos from field snapshots. Avoid public list/read access and long-lived signed URLs in records. Teach the client reader to resolve the opaque reference through this authorized service.
5. Connect the form adapter only once this backend is installed. Test reassignment, archive, expired URLs, authorization failures, upload/save interruptions and concurrent edits against a separately authorized test database before enabling production.

This is a proposal. No migration, storage configuration change, GitHub push or deployment was performed.

### Files changed in the photo pass

- `public/app/portals/admin/sites/sites.js` — conditional media, error fallback, Add/Edit picker, preview, validation and photo-save adapter.
- `public/app/portals/admin/sites/sites.css` — shared equal-height grid, full-width text treatment and form styling.
- `tests/premium-v2/preview.cjs` — isolated photo endpoint and reproducible after-upload example.
- `tests/premium-v2/fixtures/project-photo-store.cjs` — in-memory photo bytes, server validation, operation retry and authorized reads.
- `tests/premium-v2/fixtures/project-review.js` — preview-only multipart client and form deep links.
- `tests/premium-v2/project-cards.browser.cjs` — card state, sizing, file validation, persistence and access regression checks.
- `docs/projects-card-review.md` — acceptance results, screenshots and storage proposal.

The sections below record earlier design revisions.

## Current equal-height cards

At 1440 × 900, all nine Admin cards measure 148px high and every photo or placeholder measures 122px high. The grid has 18px gutters, 12px card padding and 16px between the image and text. At 1280 × 720, the measurements are 134px cards, 112px images, 14px gutters, 10px padding and 14px between the columns. The ninth card ends at pixel 709. Titles reserve two lines. Desktop location and personnel summaries use an ellipsis when necessary. Project Details retains the full values.

Chrome checked equal card dimensions and the vertical alignment of images, badges, titles, locations and assignees at four desktop sizes, in light and dark themes. All nine authorized cards fit at each size. The same layout showed the Engineer's four and the Architect's three assigned fixture projects.

[Admin desktop](../tests/artifacts/projects-equal/admin-dark-1440x900.png) · [Small laptop](../tests/artifacts/projects-equal/admin-dark-1280x720.png) · [Light laptop](../tests/artifacts/projects-equal/admin-light-1366x768.png) · [Engineer](../tests/artifacts/projects-equal/sky-dark-1440x900.png) · [Architect](../tests/artifacts/projects-equal/architect-light-1440x900.png) · [Tablet](../tests/artifacts/projects-equal/sky-light-820x900.png) · [Mobile](../tests/artifacts/projects-equal/architect-dark-390x844.png)

## Previous compact layout

Chrome verified nine complete authorized cards in three columns and three rows at 1280 × 720, 1366 × 768, 1440 × 900 and 1920 × 1080 in both themes at default zoom. The Projects browser suite checks the bounding boxes of each card, photo region, badge, title, location and assignee. At 820px the list has two columns. At 390px it has one column with the photo above the text. The Engineer and Architect preview accounts have four and three assigned active projects respectively.

The density revision touches the Projects stylesheet, the layout assertions in the Projects browser suite and this report. The full suite passed, including search, scope, archive filtering, pagination, record navigation, keyboard activation, editing, role isolation and browser console checks.

[Admin desktop](../tests/artifacts/projects-compact/admin-dark-1440x900.png) · [Admin laptop](../tests/artifacts/projects-compact/admin-dark-1280x720.png) · [Admin light](../tests/artifacts/projects-compact/admin-light-1366x768.png) · [Engineer](../tests/artifacts/projects-compact/sky-dark-1440x900.png) · [Architect](../tests/artifacts/projects-compact/architect-light-1440x900.png) · [Tablet](../tests/artifacts/projects-compact/sky-light-820x900.png) · [Mobile](../tests/artifacts/projects-compact/architect-dark-390x844.png)

## Original large-card review (prior revision)

The local redesign is ready for manual acceptance on branch `review/admin-retirement-ui-20261124`. The original screenshots use the Projects files from local HEAD `54b6c3b8854075788aadc7ca8390fab919be8a70`. The preview and all browser checks use synthetic records.

[Open the preview directory](http://127.0.0.1:4199/__fixture) · [Open the 27-image comparison gallery](../tests/artifacts/projects-review/index.html)

## Local acceptance results

| Requirement | Result | Verification |
| --- | --- | --- |
| Card layout, content and visual hierarchy | PASS | All roles use one vertical list. At a 1440px viewport the first card measures 1136 × 426px with a 528px rounded image on the left (46.5%). The stage sits at the upper right. The title, location, dividing line and accountable person follow in order. |
| Associated and missing photos | PASS | The browser loaded the two distinct, explicitly linked fixture images. Absent references and image load failures show the project icon and “No project photo.” See the production data limitation below. |
| Assigned Engineer or Architect | PASS | Card identity comes from the assigned profile ID. Field users see their own authorized records. A missing ID displays “Not assigned” even when a stale name remains in a live-shaped record. |
| Stage, colors and archive status | PASS | Verified the six rendered labels and dot colors in light and dark themes. Blank or unrecognized stages use the fallback. History and archive identification remain available in authorized details. |
| Nine projects per page | PASS | The Admin fixture has 13 active projects, split 9 + 4, and 14 including the archive. Previous and Next reach the full result set. Project name and ID give a deterministic order. |
| Search, scope and archive filters | PASS | Search by project, person and location, scope selection and archive inclusion all apply before paging. Changing filters returns to page one. |
| Role parity and permissions | PASS | The Engineer sees four assigned active projects, the Architect three, and the unassigned Engineer zero. The field views omit Admin editing controls and reject archived detail links. |
| Card activation and navigation | PASS | Click, Enter and Space open the existing project-ID detail route. Browser Back restores the page. Opening a card issues no save. Native buttons have a visible focus outline and no nested controls. |
| Management, accountability and history | PASS in fixture | Exercised Admin creation, edit, stage change, reassignment and history through the existing form and RPC interface. Equipment, custody, existing project records and prior history were checked around these operations. Equipment quantities and individual status rows remain in Project Details. |
| Responsive behavior, themes and motion | PASS | Long names and locations wrap at 1440, 820, 390 and 320px. At 820px the card remains horizontal. At 390px and 320px it stacks. Checked both themes, image-to-text separation, horizontal overflow, 200ms transitions and reduced-motion behavior. |
| Regression coverage | PASS within the local checks below | Covered Admin materials analytics and issuance, field consumables requests, inventory, repair and missing reports, dashboard charts, Admin retirement history navigation and field retirement restrictions. |
| Preview and visual evidence | PASS | All nine directory links were exercised in Chrome. The gallery pairs 1440 × 900 and 390 × 844 original and redesigned views for each role and includes a light tablet view, card close-ups, a missing photo and all six stage badges. |
| Change isolation | PASS | Verified SHA-256 hashes for all six pre-existing retirement-related changes. All work stayed local. No commit, push, merge, deployment, SQL migration, production or staging access took place. |

## Stage and photo data

The shared badge reads `sites.project_stage`. Display matching ignores case, extra whitespace and spacing around the slash in Planning/Designing. The editor can retain a noncanonical stored stage when an Admin edits another field. The separate legacy `phase` field and archive flags retain their own meanings.

| Recorded stage | Display label | Dot color |
| --- | --- | --- |
| Missing, blank or unknown | Not recorded | `#B9C0C9` |
| Planning/Designing | Planning/Designing | `#B6A9F5` |
| Permitting | Permitting | `#92C8F7` |
| Groundbreaking | Groundbreaking | `#F7B69A` |
| Construction Phase | Construction Phase | `#F3D27E` |
| Turnover | Turnover | `#8FD9BB` |

The repository has company gallery images but no project-to-photo association in the inspected project schema, storage setup or gallery manifest. The renderer accepts a bundled image under the application's `assets/images/` directory when the project record explicitly supplies its path in `project_photo_url`. The preview supplies two such associations on synthetic records only. With the current data contract, real projects show “No project photo.”

Persistent uploads would need a separately approved project-ID-to-storage-object relationship, authorized upload/replacement, and a photo reader enforcing the same project access rules. No backend change is required to use the fallback.

## Implementation files

| File | Change |
| --- | --- |
| `public/app/portals/admin/sites/sites.html` | Shared list, live result summary and pagination controls. |
| `public/app/portals/admin/sites/sites.css` | Card proportions, photograph and placeholder, stage palette, responsive layout and interaction styles. |
| `public/app/portals/admin/sites/sites.js` | Shared projectCard, stageBadge, photoSource and renderList helpers, assignment display, stable paging and navigation restoration. Uses the existing MCPAProjectScope, repository, project editor, detail route, equipment and history readers. |
| `tests/premium-v2/preview.cjs` | Opt-in loopback Projects preview mode and directory. |
| `tests/premium-v2/engineer-assignment-preview-fixture.cjs` | Connects the optional project records and save adapter to the existing isolated fixture. |
| `tests/premium-v2/fixtures/project-cards.cjs` | Synthetic projects, photo associations, assignment/history and in-memory saves. |
| `tests/premium-v2/fixtures/project-review.js` | Opens examples using the real search and paging controls. |
| `tests/premium-v2/fixtures/projects-index.html` | Directory of the nine manual acceptance links. |
| `tests/premium-v2/project-cards.browser.cjs` | Focused Chrome acceptance suite using a separate disposable preview instance. |
| `docs/projects-card-review.md` | This acceptance report. |

Local evidence in `tests/artifacts/projects-review/` includes the gallery, PNGs, measured dimensions, capture script and pre-existing working-tree hashes.

## Open or restart the preview

Run this from the repository root after stopping the previous Projects preview. If 4199 is occupied by another service, set `PORT` to a free port and substitute it in the links. The server binds only to loopback and restores the seed on restart.

```powershell
$env:PORT = '4199'
node tests/premium-v2/preview.cjs --projects-review
```

| Example | Preview |
| --- | --- |
| Admin | [Admin Projects](http://127.0.0.1:4199/?fixture=admin#sites) |
| Engineer | [Engineer's assigned projects](http://127.0.0.1:4199/?fixture=sky#sites) |
| Architect | [Architect's assigned projects](http://127.0.0.1:4199/?fixture=architect#sites) |
| Planning/Designing | [Architectural Study 01](http://127.0.0.1:4199/?fixture=admin&project=Architectural%20Study%2001#sites) |
| Construction Phase | [Architectural Study 02](http://127.0.0.1:4199/?fixture=admin&project=Architectural%20Study%2002#sites) |
| Turnover | [Courtyard Handover](http://127.0.0.1:4199/?fixture=admin&project=Courtyard%20Handover#sites) |
| Missing stage | [East Annex](http://127.0.0.1:4199/?fixture=admin&project=East%20Annex#sites) |
| Missing photo | [Garden Workshop](http://127.0.0.1:4199/?fixture=admin&project=Garden%20Workshop#sites) |
| More than nine active projects | [Second page](http://127.0.0.1:4199/?fixture=admin&page=2#sites) |

## Checks run

| Check | Result |
| --- | --- |
| `node tests/premium-v2/project-cards.browser.cjs` | Passed Projects rendering, data, access, interactions, responsive behavior, fixture saves and browser isolation. |
| `npm.cmd run test:frontend` | 65 passed, zero failed. |
| `node tests/premium-v2/admin-refinements.browser.cjs` | Passed chart filters, report drill-down, issuance and CSV, return evidence and equipment checks. |
| `node tests/premium-v2/field-refinements.browser.cjs` | Passed Engineer and Architect requests, inventory, repairs/missing, retirement routing and Admin history smoke check. |
| `node tests/premium-v2/integration.browser.cjs` against an isolated baseline preview | 11 passed, zero failed, 54 dashboard role/theme/width cases. |
| `npm.cmd run check` with `PHP_BINARY=C:\xampp\php\php.exe` | Passed validation of 197 public files and 13 PHP files. |
| `git diff --check` | Passed. |

Chrome checks used loopback-only traffic and reported zero runtime errors or unintended external requests. Database-backed retirement decisions, live authorization policies and deployed save operations were outside this local verification.
