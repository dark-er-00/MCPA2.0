# Documentation review checklist

Prepared 20 October 2026 (Asia/Manila) from revision a5d51b3. This is a review request and evidence checklist; no Project Manager, Lead Developer or QA Lead approval has been obtained. Unchecked items are NEEDS VERIFICATION. Reviewers should add evidence/date/name only after their own review.

## Completed during documentation preparation

- [x] Inspected current routes, module loader, five-role action lists, shared operational services and module handlers.
- [x] Inspected application setup/migration DDL, RPC wrappers, permissions, storage definitions and account Edge Function.
- [x] Distinguished repository implementation from production installation and older prototype/manual descriptions.
- [x] Documented 83 inventory rows with all eleven requested columns; separate role/source/legend/module worksheets.
- [x] Authored nineteen technical sections and a source-based troubleshooting guide with confirmed behavior, possible causes, recommended steps, expected resolution and escalation.
- [x] Generated use case, architecture, eight workflows and four ERD views with editable draw.io/vector source, PNG and PDF.
- [x] Identified missing original profiles/equipment DDL and marked unverified physical relationships rather than inventing constraints.
- [x] Reviewed existing historical local QA reports and test definitions; did not label them as newly executed tests.
- [x] Attempted an unauthenticated read of the candidate Pages address inferred from the Git remote. The web tool reported it inaccessible; no deployment failure is inferred.
- [x] Limited new files to SYSTEM_DOCUMENTATION/. No application/database/deployment command was executed.
- [x] Generated artifact/integrity evidence; see Validation_Report.json for actual parser/rendering/hash results and limits.

## Project Manager / Lead Developer confirmation

- [ ] Confirm official product/organization naming: requested SiteTrace versus MCPA / BuildRight interface labels and acronym expansion.
- [ ] Confirm five supported roles and that Engineer/Architect are intended to share permissions.
- [ ] Confirm Tool Handler read-only inventory UI versus broader base database metadata privilege is the intended documented boundary.
- [ ] Confirm one accountable profile per project; active stable-ID assignment requirements; archive/restore policy.
- [ ] Confirm allocation/custody distinction: Pending request is not reserved; approval reserves; release creates a handover; receipt changes custody.
- [ ] Confirm named-receiver-only inspection/testing and condition-specific damage/missing accountability.
- [ ] Confirm eligible field-only withdrawal/cancel/refusal/reopen rules and exact installed optional gateway support.
- [ ] Confirm fixed pinned Office receiving destination and cleared personal holder for physically returned damaged equipment; no separate return acceptance stage.
- [ ] Confirm whole-record equipment quantities, with partial receipts limited to consumables.
- [ ] Confirm materials requests have no approval stage and purchase ledger saves do not receive stock.
- [ ] Confirm current PDF exports supersede old CSV/manual controls and identify supported print surfaces.
- [ ] Confirm deferred scope: extended maintenance, partial equipment splits, return scheduling/QR, additional lifecycle terms and self-profile/account deletion features.
- [ ] Confirm actual Pages branch/root, deployed commit/URL, Edge Function version, approved origins and email/redirect readiness.
- [ ] Obtain sanitized core/current schema including full profiles/equipment DDL, FK/PK/unique/check constraints and complete status type/enum.
- [ ] Confirm current applied migration/manual SQL history and resolve understanding of duplicate version prefix 202610120003 without changing files as part of this review.
- [ ] Confirm installed gateway delegate chain using source/permission evidence; Office may validly wrap portal with or without cancellation.
- [ ] Confirm pinned Office singleton/helper, new-equipment insert trigger/policy and availability snapshot response version. Do not infer installation from file presence or one active Office name.
- [ ] Confirm private Storage bucket settings, policy scope, signed-URL behavior and attachment retention/cleanup ownership.
- [ ] Confirm trusted scheduler ownership, actual schedule/time zone, latest genuine capture, failure monitoring and expected gaps.
- [ ] Approve the final documentation wording and version only after evidence review. No approval is presumed.

Lead reviewer: ____________________  Role: ____________________

Review date/time (Asia/Manila): ____________________

Decision and evidence references: ____________________

## QA Lead confirmation

- [ ] Review role matrix against the actual deployed authenticated policies/RPCs and UI controls for all five roles.
- [ ] Verify real login, profile denial/inactive cases and invitation/recovery callback behavior in an approved test environment.
- [ ] Compare visible assigned-project lists/counts with stable profile assignments; verify project_history dependency.
- [ ] Compare availability reasons with raw status, holder, quantity and hidden reservation category without exposing another person's request.
- [ ] Verify request/approval/release/receipt, linked status and saved custody expectations in a disposable staging environment only.
- [ ] Verify temporary receiving QR expiry/revocation/assignment checks, handover-code lookup and named-receiver restriction.
- [ ] Verify physical iOS/Android camera permission, library loading, optical scan and manual fallback on supported browsers/devices.
- [ ] Verify damage acceptance/refusal, missing items and eligible cancellation/reopening with immutable evidence in approved staging.
- [ ] Verify Office return outcomes for good/damaged/missing; no extra acceptance stage; preserve source accountability for missing.
- [ ] Verify repair start/completion and good/damaged recovery, including raw REPAIR versus derived Under Repair display.
- [ ] Verify material stock decimal/version/idempotency rules and partial/full receipt/cancel preservation, separately from the ledger.
- [ ] Verify private photo/receipt uploads, size/type guards, scoped retrieval and popup/URL expiry using approved synthetic files.
- [ ] Verify current/snapshot/movement PDFs and activity PDFs for complete authorized rows, dates, filters, Unicode and page layout.
- [ ] Verify notifications as own-recipient future events; live publication/Realtime and polling behavior; do not mark live notices read during strict read-only review.
- [ ] Verify actual scheduler notices/captures against saved dates; do not fabricate historical snapshots.
- [ ] Perform a non-mutating published-site smoke review with existing authorized access; avoid requests, QR generation, receiving, read-state updates or other live writes.
- [ ] Capture only authorized, sanitized interface screenshots or isolated staging screenshots; record environment/date/role and preserve privacy. None were newly captured here.
- [ ] Review DOCX/XLSX appearance in the intended Word/Excel-compatible editor; package structure is checked here, native desktop visual layout remains unverified.
- [ ] Record exact test version, environment, command/result and screenshots. Existing historical QA counts must not be represented as fresh results.
- [ ] Sign documentation acceptance only after resolving or explicitly accepting open limitations.

QA reviewer: ____________________

Review date/time (Asia/Manila): ____________________

Decision and evidence references: ____________________

## Existing owner read-only evidence references

The files below are existing repository checks to be reviewed by the responsible maintainer. They were not run in this documentation task. These references do not authorize database modifications, migration replay, publication or account actions.

| Existing source | Intended evidence |
| --- | --- |
| supabase/preflight.sql | Core schema/Auth and current privilege prerequisites. |
| supabase/project-history-preflight.sql | Current project-history dependencies. |
| supabase/office-return-preflight.sql | Office function presence/source architecture. |
| supabase/release-compatibility-diagnostics.sql | Gateway/delegate signatures, hashes, grants, helpers, audit/notification infrastructure. |
| supabase/office-configuration-verification.sql | Pinned singleton Office; run only after its documented schema prerequisite is confirmed. |
| supabase/equipment-office-preflight.sql | Prospective registration default/policy and existing location context. |
| supabase/merge-integration-verification.sql | Optional purpose, identity, Office/notification source compatibility. |
| supabase/request-turnover-preflight.sql | Linked release/receiving and notification prerequisites. |
| supabase/feature-completion-preflight.sql | Storage/cancellation/ledger/monitoring feature readiness. |

The mutating equipment-office-confirmed-correction.sql, migrations, legacy setup scripts, seed/repair scripts and account/monitoring generation RPCs are not troubleshooting checks and were not executed.

## Evidence boundary

Successfully verified in this task: repository definitions and role/action mappings; exact available table DDL and incomplete-schema boundary; generated format presence/structure; local document/diagram rendering; pre-existing tracked-file SHA-256 integrity. Exact numeric checks appear in Validation_Report.json.

NEEDS VERIFICATION: deployed software/schema/security/service state, live screenshots, real Auth/email/Storage/Realtime behavior, physical devices/printing, current data correctness and both reviewer decisions. No unsupported approval or production test claim is made.
