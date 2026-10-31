# SiteTrace presentation checklist

Review date: 24 October 2026 (Asia/Manila).

## Evidence and application scope

- [x] Existing codebase, schemas, role checks, modules and tests inspected.
- [x] Application business logic, roles, permissions and production data left unchanged.
- [x] Genuine screens captured from the unchanged local application using synthetic identities/data; external HTTPS blocked.
- [x] Dedicated request → approval → release → tested Good receipt executed and asserted against local SQL snapshots.
- [x] Provisional live catalog totals (126 SKUs / 12 categories) omitted. Source/seed counts do not establish live counts.
- [x] No GPS, financial gains, predictive analytics, transport signatures or complete-audit/security claim.

## Fresh verification

Fresh Node regression: 202 tests; 200 passed; 2 failed; 0 skipped. See evidence/node-regression.log. The two failures are legacy-scoped-reader and v1-metadata installation/retry cases in tests/verified-request-inventory.database.test.cjs:24; the migration guard reports that the request lifecycle differs from the reviewed implementation. Other modern availability/custody cases passed, and the dedicated transaction completed, but legacy installation compatibility is unresolved. Dedicated capture: 20 genuine screenshots and one executed local request/approval/release/tested receipt; no uncaught browser errors. Existing broad browser --flows-only run FAILED at tests/workspace-ui-checks.cjs:214 (watcher count actual 1, expected 2); earlier request/release/receipt/return checks ran, but the suite is not an overall pass.

- [ ] Review the two failed legacy inventory installation/retry tests (lifecycle fingerprint guard) before claiming those migration paths work.
- [ ] Review/fix the existing broad browser synchronization assertion independently before claiming a complete browser pass. Presentation work did not change application code to satisfy it.
- [ ] Verify target Supabase Auth, actual role-policy/RPC fingerprints, installed migrations, pinned Office and Storage configuration before using this deck as proof of deployed behavior.
- [ ] Review project construction/history migration deployment; weighted formula is verified locally, production installation is unconfirmed.
- [ ] Verify real private upload/signed-URL access in authorized staging. Transport was modeled locally.
- [ ] If automated monitoring is discussed, confirm a real trusted scheduler and actual captures. No scheduler/email/push operation is established here.
- [ ] Confirm current active/archived consumables counts through authoritative live data before adding any global totals.

## Workflow limits and roles

- [x] Exactly five current roles used: Admin, Engineer, Architect, Secretary, Tool Handler.
- [x] Approval reserves and release creates a pending transfer; custody is unchanged until accepted tested receipt.
- [x] Accepted incoming damage assigns receiver and opens repair; missing items keep prior holder/site.
- [x] Current Office wrapper clears holder for good and damaged physical returns; missing retains accountability.
- [x] No second Office receipt approval, partial equipment splitting or automatically synchronized free-text condition claim.
- [x] Direct holder transfer and Tool Handler unheld-stock dispatch are distinguished from Admin initial release.
- [ ] Confirm optional cancellation/refusal/monitoring migrations on the intended deployed system before a live demo.
- [ ] Confirm field users physically test equipment as required; software captures confirmation, not independent proof of a test.

## Screenshots and placeholders

- [x] No missing screenshot placeholders. No fictional interfaces or generated images.
- [x] Dashboard, inventory/detail, request, approval, release, receipt/inspection, movement history, projects, consumables, purchasing, reporting and activity genuinely captured.
- [x] Each screenshot slide labels the local environment and synthetic data; manifests and original full-resolution PNGs supplied.
- [x] The example is explicitly an executed local test transaction. REQ-00001 / TRF-00002 are isolated local identifiers, unrelated to any same-named production record.
- [ ] Optional: replace local screenshots with authorized, redacted production/staging captures if the intended audience expects deployed evidence. Current deck has no placeholder requiring this.
- [ ] Review screenshot readability on the actual meeting projector; originals are supplied for zooming.

## PowerPoint quality assurance

- [x] Design source specifies exactly 10 titled slides with one key message each.
- [x] Speaker notes authored on every slide, with detailed workflow and demonstration narration.
- [x] Native editable text/shapes/diagram; screenshots remain genuine raster evidence.
- [x] Native PowerPoint generation and reopen succeeded; 16:9, exactly 10 slides and 10 speaker-note parts confirmed. All 10 native 1920 × 1080 PNG renders were visually reviewed; zero text-bound warnings. See evidence/powerpoint-qa.json and evidence/deliverable-validation.json.
- [ ] Final stakeholder review: naming, operational policy wording, real deployment status, approved audience and treatment of the closing slogan as a system vision.

## Outstanding items affecting claims

The local test results and screenshots demonstrate repository behavior, not production installation or business effectiveness. The existing browser synchronization assertion remains unresolved. No presentation placeholder remains. Production role/configuration verification, real external Storage behavior, scheduler status and authoritative inventory counts remain stakeholder review items.

Final artifact validation: 185 editable text runs, 13 embedded picture shapes (actual logo plus application captures), 10 substantial speaker-note bodies, no screenshot placeholders, successful native PowerPoint reopen, and a PDF preview. Source files remain unchanged. Detailed original captures and exact crops are retained in evidence/.
