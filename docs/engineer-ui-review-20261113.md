# Engineer UI review - 13 November 2026

**Ready for manual Engineer UI acceptance. Backend rollout remains paused.**

Authoritative workspace: `<LOCAL_USER_HOME>\OneDrive\Desktop\Codings\VS Code\MCPA-development-review\antigravity-admin-ui-work`.

Branch verified read-only: `feature/admin-pdf-updates-20261111`. No commits, pushes, merges or GitHub changes were made.

All four pages of `<LOCAL_USER_HOME>\Downloads\MCPA System Changes and Updates Engr Side.pdf` were rendered and visually inspected. The original PDF is unchanged. Page images and extracted text are in [the evidence folder](../tests/artifacts/engineer-ui-20261113/index.html).

## Final acceptance correction: Office stock excluded from Engineer Inventory

The earlier inventory interpretation was too broad. Both the draft reader and its frontend guard admitted every requestable available asset, without requiring an assigned project; scoping the project dropdown alone did not scope the rows. The latest manual-acceptance instruction supersedes that behavior.

The corrected inventory includes available equipment only at active, non-archived projects assigned to the signed-in Engineer by profile ID, plus existing authorized own custody. Available Office stock, other projects' stock, other custodians and unrelated statuses are excluded. The Office ID comes from the existing authenticated Office resolver. Own custody uses the stable holder ID, including existing accountable equipment outside the handled project list. Display names do not establish live eligibility.

Selection runs before table rendering, local search, status/project filters, detail links and counts. Project options use IDs. Global equipment search uses the same versioned reader and scope before result counts and Show more pagination. The inventory table itself has no pagination; its complete filtered list and displayed total share the scoped dataset. No CSS hiding is used for record authorization.

**Current validation: 27 relevant automated checks and 16 focused browser checks passed.** Tests cover assigned available stock, Office stock, unrelated projects, another custodian, own custody, reassignment/archival, misleading labels, filtered totals, reload, an overbroad synthetic response, a 135-row synthetic response whose search pagination exposes only 45 assigned rows, and old-reader failure. Desktop and 393/320-pixel dark layouts were checked. Admin source files and Equipment Requests source files are unchanged; Admin Office inventory and requestable Office stock were verified independently. No earlier 86-check suite was repeated for this correction.

The synthetic preview now includes named assigned-project, Office, unrelated-project, own-custody, other-custodian and repair examples. Backend draft **version 2** remains uninstalled remotely. Both inventory and Engineer global equipment search fail closed without the corrected reader. Only disposable in-memory fixture initialization was exercised; no Production/Staging database, migrations, deployment or GitHub operations occurred.

Changed files for this correction:

- `public/app/features/projects/project-scope.js`: shared Engineer-only selection helper.
- `public/app/features/movements/movement-overview.js`: scoped rows/details/counts and ID-based project filtering.
- `public/app/features/search/global-search.js`: corrected Engineer inventory source before search/pagination.
- `supabase/drafts/engineer-ui/00-engineer-inventory.sql`: assigned non-Office available stock, own custody, version 2 and verified Office ID.
- `supabase/drafts/engineer-ui/README.md`: corrected scope and outstanding dependency.
- `tests/engineer-ui-preview-fixture.cjs`: explicit permitted/excluded synthetic examples.
- `tests/engineer-ui.inventory.test.cjs`: server-side inventory scope and request/Admin separation.
- `tests/engineer-inventory-scope.test.cjs`: frontend scope, missing metadata and repeat-filter protection.
- `docs/engineer-ui-review-20261113.md`: this acceptance addendum and superseded description corrected.

[Correction screenshots and results](../tests/artifacts/engineer-office-correction-20261113/index.html).

Working review URLs:

- [Engineer Equipment Inventory](http://127.0.0.1:4183/index.html?fixture=sky#masterlist)
- [Admin Inventory](http://127.0.0.1:4183/index.html?fixture=admin#masterlist)
- [Synthetic role switcher](http://127.0.0.1:4183/__fixture)

## PDF checklist

Statuses distinguish completed isolated UI behavior from deferred integration. PASS means verified locally with synthetic identities, records and in-memory SQL. No status asserts that unapplied backend changes exist remotely.

| Page | Requirement | Status | Result |
| --- | --- | --- | --- |
| 1 | A. Dashboard Transfer IDs | PASS | References occupy their own readable line, separate from actor and timestamp; existing styling and record links retained. |
| 1 | B. Inventory visibility and project scope | PARTIAL | Local UI and server authorization checks pass. Available stock plus own custody is enforced by a new authenticated reader in the fixture. A separate approved backend rollout is required before this reader can work outside the preview. |
| 2 | C. Remove Engineer Retired Equipment History | PASS | Engineer sidebar and route permission removed; direct navigation is denied. Admin Retirement and Architect permissions retained. |
| 2 | D. Requests | PASS | Both redundant Refresh buttons hidden on healthy Engineer screens; contextual loading retry retained. Confirmed success, post-save read failures, validation refusal and uncertain submission recovery tested. Specific Asset and My Requests retained. |
| 3 | E. Transfers | PASS | New Transfer dialog is centered and scrollable at desktop and narrow widths. Redundant Refresh removed; contextual read recovery, asset/recipient/project selection and permissions retained. |
| 3 | F. Returns | PASS | Fixed Office display replaces the Engineer destination selector. Submission uses the authenticated snapshot's real destination identifier. Loading retry restores the composer after an initial failure. |
| 4 | G. Consumables | PASS | Direct sidebar entry; extra descriptive paragraphs removed/shortened. Three tabs, filters, requests and essential stock limitations retained. Synthetic catalog and confirmed issuances support manual review. |
| 4 | H. Activity Logs | PASS | Direct Engineer entry, with existing activity access and functions. |
| 4 | I. Settings | PASS | Direct Engineer entry; accepted shared profile/settings implementation preserved. |

## Initial findings and corrections

1. **Dashboard:** References and actor/time text shared an inline run. Engineer references now have a separate line with compact existing palette/border styling. Admin dashboard markup compares exactly with the accepted baseline.
2. **Inventory:** The old personal reader intentionally returned custody only, so available stock was absent. The status dropdown still listed unrelated status categories, and projects represented custody locations rather than the Engineer's handled projects. A narrow versioned reader now returns only own custody or verified available individual assets in assigned non-Office projects, and only assigned active projects. Frontend checks provide a second guard. Status choices are Available and My custody, plus their combined inventory view. The project dropdown contains assigned projects and a disabled filter prompt, with a contextual Clear project filter control. There is no aggregate project option. The final acceptance correction excludes available Office stock and requires available stock to belong to an assigned project.
3. **Retired history/navigation:** Engineer route permission is removed. Consumables, Activity Logs and Settings become direct links for Engineers only. Admin and Architect group structures are preserved.
4. **Quantity request feedback:** Previously, submission and the following catalog/history reads shared an error path, and an independent history read could report a connection error beside a confirmed success. Confirmation now requires a request identifier from the RPC. Follow-up read failure explicitly preserves that confirmed result and offers loading recovery. Rejected validation keeps the draft and reports no success. Uncertain outcomes lock the current draft and offer explicit verification of the same operation; missing confirmation and server interruptions retain the idempotency key. No automatic blind write retry occurs, and no production success is fabricated. My Requests updates when confirmation arrives.
5. **Transfer modal:** Engineer-specific positioning overrides the shared dialog reset. Equipment, recipient and assigned destination choices remain intact. A synthetic Engineer handover followed by actual Admin recipient inspection verified that custody stays with the sender until acceptance.
6. **Returns:** Engineers see Office as fixed text; the backend-provided destination ID is submitted. No database ID is hardcoded. Initial read failures expose contextual retry and reconstruct the composer after recovery.
7. **Consumables:** Removed header explanations and repeated inventory explanations identified on page four. Retained a concise warning that issuances do not establish physical stock because consumption is not tracked. Available Consumables, My Consumables, My Requests, filters and confirmed request submission were exercised.

## Validation

| Check | Result |
| --- | --- |
| Resource/import/syntax checks | PASS - 177 public files and 13 PHP files |
| Focused automated tests | **44 passed, 0 failed, 0 skipped** - navigation, dashboard, quantity client, unified requests, transfer links, identity handling and narrow inventory authorization; SQL checks use disposable PGlite only |
| Main browser checks | **76 passed, 0 failed** |
| Supplemental browser checks | **10 passed, 0 failed** - initial loading failures/recovery, assigned-project filtering, populated consumables and real synthetic submissions, Admin transfer acceptance, accepted inventory/Retirement/People/Settings behavior |
| Responsive/theme coverage | Eight Engineer screens at 1440, 393 and 320 CSS pixels, light and dark; transfer modal at all three widths |
| Final visual confirmation | PASS - desktop/mobile references, inventory, requests, centered modal, fixed Office and My Consumables inspected; inactive project-reset control remains hidden |
| Browser safety | No uncaught exceptions and no attempted external requests in the passing runs |
| Accepted Admin source preservation | Seven pre-existing accepted files unchanged; excludes the intentionally extended fixture runner. Admin navigation/dashboard HTML equal the pre-Engineer baseline |
| Other roles | Architect, Secretary and Tool Handler home/Settings and route boundaries checked |
| Isolation | Offline invalid origin and synthetic key, synthetic SDK, same-origin CSP, exact loopback browser allowlist and served-source comparison |
| Whitespace | PASS |

Evidence: [browser results](../tests/artifacts/engineer-ui-20261113/qa-results.json), [supplemental results](../tests/artifacts/engineer-ui-20261113/recovery-qa-results.json), [44-test log](../tests/artifacts/engineer-ui-20261113/focused-tests.log), [syntax log](../tests/artifacts/engineer-ui-20261113/syntax.log), [Admin preservation](../tests/artifacts/engineer-ui-20261113/admin-preservation.json), [gallery and PDF pages](../tests/artifacts/engineer-ui-20261113/index.html).

Earlier failed local attempts were test-harness selector/fixture-seed corrections; final results above are the completed passing runs. No Docker, backup, TLS, remote migration or deployment suites were run.

## Exact files changed in this Engineer phase

The five accepted Admin implementation files remain at their pre-task bytes. Existing `docs/ui-review-20261112.md` and `tests/ui-resilience.browser-checks.cjs` are also unchanged.

| File | Change |
| --- | --- |
| `public/app/core/navigation.js` | Engineer-only direct navigation entries |
| `public/app/core/permissions.js` | Remove Engineer retirement-history permission |
| `public/app/core/integration.js` | Engineer return toolbar/recovery handling |
| `public/app/features/dashboard/dashboard-view.js` | Engineer-only reference markup |
| `public/app/portals/engineer/dashboard/dashboard.css` | Reference and metadata layout |
| `public/app/features/movements/movement-overview.js` | Versioned Engineer reader, inventory/status/project scope and filter reset |
| `public/app/portals/engineer/masterlist/masterlist.css` | Keep inactive project reset hidden |
| `public/app/features/quantity-requests/client.js` | Mark uncertain outcomes and preserve operation IDs without confirmation |
| `public/app/portals/engineer/quantity-requests/index.js` | Confirmed success, safe uncertainty recovery, loading retry |
| `public/app/features/equipment-requests/unified.mjs` | Engineer refresh removal and consistent history feedback |
| `public/app/features/custody-lifecycle/transfers.mjs` | Engineer modal class and contextual retry |
| `public/assets/styles/transfers.css` | Engineer-only modal centering and scrolling |
| `public/app/features/custody-lifecycle/composer.mjs` | Fixed Engineer Office destination and initial load recovery |
| `public/app/portals/engineer/consumables-requests/consumables-requests.js` | Scoped copy cleanup and contextual loading retry |
| `supabase/drafts/engineer-ui/00-engineer-inventory.sql` | New narrow read-only function; review draft only |
| `supabase/drafts/engineer-ui/README.md` | Scope, dependencies and deferred rollout |
| `tests/auth.browser.cjs` | Extend existing synthetic fixture, versioned reader and explicit fixture-role URL |
| `tests/engineer-ui-preview-fixture.cjs` | Synthetic consumable stock, issued material and pending request |
| `tests/engineer-ui.inventory.test.cjs` | Server-side identity, inventory and project scope checks |
| `tests/engineer-ui.client.test.cjs` | Safe retry after missing confirmation/server interruption |
| `docs/engineer-ui-review-20261113.md` | This report |

Additional ignored local evidence is under `tests/artifacts/engineer-ui-20261113/`, including browser scripts, screenshots, PDF page renders, results, process metadata and accepted-source backups. These are review artifacts, not application code.

## Manual review

- [Open Engineer preview](http://127.0.0.1:4183/index.html?fixture=sky)
- [Open Admin regression preview](http://127.0.0.1:4183/index.html?fixture=admin)
- [Synthetic role switcher and verification inbox](http://127.0.0.1:4183/__fixture)

The preview binds loopback only. Its SDK talks to local `/__db`, the PHP adapter talks to a loopback Auth model, and its browser config uses `https://offline.mcpa.invalid` with `sb_publishable_offline_fixture`. Browser connections are restricted to the preview origin. It cannot use Production or Staging data paths. All identities, records, photos and messages are synthetic; state resets when the process restarts. The final fixture was restarted after mutation checks so manual review begins with the intended seeded examples.

Visit the eight Engineer screens, try both request methods, inspect the fixed Office destination, open the transfer modal on a narrow viewport, switch themes, then use the role switcher to compare Admin. A request status that is uncertain must be verified through My Requests or the explicit same-operation recovery action before starting another request.

After the current preview stops, this PowerShell command restarts the same fixture (keep that terminal open):

```powershell
Set-Location '<LOCAL_USER_HOME>\OneDrive\Desktop\Codings\VS Code\MCPA-development-review\antigravity-admin-ui-work'
$env:PHP_BINARY = 'C:\xampp\php\php.exe'
node tests/auth.browser.cjs --ui-preview --admin-pdf
```

## Deferred backend integration and remaining issues

The new narrow inventory reader needs separate review and an explicitly approved backend rollout. Until installed, the Engineer inventory screen truthfully reports that backend capability is unavailable; there is no broad fallback. Existing movement, request, custody, consumables and profile APIs must also exist in the intended environment. This task verified their isolated models, not remote installation. Previously deferred profile/photo/invitation/account backend work remains deferred.

No confirmed UI blocker remains in the tested Chrome layouts. Physical-device and cross-browser acceptance remain manual. No real user account, Supabase Auth/email setting, Production/Staging database, original checkout, verified backup, Render deployment or Draft PR #2 was modified. Engineer manual acceptance is the stopping point; no other role or backend rollout is authorized.
