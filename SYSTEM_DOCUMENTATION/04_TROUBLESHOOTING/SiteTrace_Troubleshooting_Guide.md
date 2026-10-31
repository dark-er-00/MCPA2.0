# 1. Using this guide

This guide covers source-confirmed SiteTrace/MCPA errors and operational boundaries at repository revision a5d51b3, reviewed 20 October 2026 (Asia/Manila). “Confirmed behavior” means a matching error branch, validation rule or state restriction was inspected in source. “Recommended steps” are practical guidance; they are not claimed as tested fixes on the deployed application. Production installation and authenticated live behavior are NEEDS VERIFICATION.

Before reporting a problem, record the screen, role, Manila time, non-sensitive equipment/movement reference and visible message. A technical maintainer can additionally collect the database error code and failing resource path without including credentials, private signed links or personal record contents. Do not share passwords, session tokens, invitation URLs, QR receiving tokens or unredacted personal screenshots.

For an interrupted save, first determine whether it committed. A success followed by refresh failure is different from a rejected save. Check the saved record and current holder/status before resubmitting. Keep an unsent draft where the application preserves it. Do not resolve an error by disabling RLS, borrowing another person's account, changing raw custody fields or rerunning SQL migrations.

Sources: js/auth.js; js/movement-cloud.js; js/movement-ui.js; js/equipment-tracking.js; 1-admin/modules/sites/sites.js; js/monitoring.js.

# 2. Login, profiles and account access

## 2.1 Sign in fails

Problem: sign in reports incorrect credentials, invitation confirmation required, or a generic connection failure.

Confirmed behavior: js/auth.js distinguishes invalid_credentials and email_not_confirmed; other failures show a general sign-in connection message. An Auth session must still pass company-profile verification before opening the workspace.

Possible causes: mistyped company email/password; invitation not completed; network/CDN/Auth service unavailable; expired callback/session. The specific cause of a generic error is NEEDS VERIFICATION.

Recommended steps: check the entered company email and password with the password visibility control; complete the latest invitation if applicable; retry once on a working connection. Use Forgot password for a forgotten password instead of repeatedly guessing. Exit offline demo to reach the real company login.

Expected resolution: the correct active linked account opens its role workspace, or an actionable profile/setup error remains.

Contact Admin/support: when an invitation is missing/expired, the correct credentials continue failing, or the sign-in service fails across a known working connection. Never include the password in the report.

Sources: js/auth.js, signIn, restore and boot.

## 2.2 Unauthorized, inactive or unverifiable profile

Problem: Auth login succeeds but the workspace reports no authorized company profile, an inactive account, or failed profile verification.

Confirmed behavior: mcpa_my_profile returns the linked profile; the frontend rejects unsupported roles and inactive status. Private backend identity() independently requires active authorized linkage.

Possible causes: wrong company account; absent/incorrect Auth-to-profile link; account deliberately inactive; missing profile RPC; network or installed privilege mismatch.

Recommended steps: sign out and use the intended company account; record the exact visible message. Ask Admin to inspect the existing person's role/status and verified Auth linkage. Maintainers should review current RPC/grant/catalog evidence read-only. Existing links must not be reassigned to another person as a workaround.

Expected resolution: the intended permanent profile is active and correctly linked, or access remains denied for a valid business reason.

Contact Admin/support: immediately for inactive/unassigned identity; technical support if Admin confirms correct linkage but profile verification still fails.

Sources: js/auth.js, restore; supabase/migrations/202610040001_authenticated_access.sql, identity and mcpa_my_profile; supabase/migrations/202610060001_account_management.sql.

## 2.3 Forgotten password or expired setup link

Problem: the user cannot remember a password or the invitation/recovery callback is invalid/expired.

Confirmed behavior: Forgot password requests an email using the login email field and gives a non-enumerating acknowledgement. Invite/recovery setup requires a valid session and a password of at least 12 characters, then signs out. Callback errors instruct the user to obtain a fresh invitation/reset.

Possible causes: old/already-used link, wrong email, email delivery delay/filtering, invalid redirect allowlist, expired callback session or unsuitable new password.

Recommended steps: use Forgot password with the correct company email and open the most recent message; check filtered folders. For an invitation, ask Admin to resend the same person's invitation. Enter a new password of at least 12 characters and sign in again after saving. Do not forward setup links to another person.

Expected resolution: a fresh authorized callback saves the new password and normal login succeeds. Email delivery/configuration is NEEDS VERIFICATION until checked by the maintainer.

Contact Admin/support: no message arrives, the new link still fails, or setup repeatedly cannot save on a working connection. Maintainers review Auth redirects/SMTP without sharing secret values.

Sources: js/auth.js, resetPassword, setupPassword and signIn; supabase/functions/manage-accounts/handler.mjs.

## 2.4 Page/action is restricted or a menu is absent

Problem: a direct link says Access restricted, a module is missing, or an action is unavailable.

Confirmed behavior: five-role routes and action lists are explicit. Secretary has Materials/Purchases/Settings only. Engineer and Architect share permissions. Tool Handler cannot approve requests or receive as a field receiver. Live interruption buttons use record.allowedActions in addition to role.

Possible causes: correct role boundary; wrong signed-in account; non-own/non-related record; wrong record state; missing optional cancellation gateway; role changed during a session.

Recommended steps: verify the displayed account role and compare the Role Matrix. Open the authorized module from navigation and refresh current record state. Request legitimate access review from Admin if business responsibilities differ. Do not edit the URL, browser state or role to bypass a denied operation.

Expected resolution: the authorized role/state shows the operation, or the denial remains correct.

Contact Admin/support: an operation documented for the current role and saved state is still missing after refresh, especially cancellation/refusal where server gateway installation must be verified.

Sources: js/permissions.js; js/auth.js; supabase/migrations/202610100004_movement_cancellation.sql.

## 2.5 Invitation/account creation service unavailable

Problem: People shows that account creation is unavailable, invitations are not configured, or an account job could not finish.

Confirmed behavior: the UI reads manage-accounts capabilities; invitation and development creation have separate flags. The handler checks JWT/Auth identity, active Admin role, allowed origin, supported non-Admin roles, job identity and email/Auth results. It may return rate limiting, email/SMTP or durable-job errors.

Possible causes: Edge deployment/configuration/origin problem; email capability disabled; SMTP/Auth rate limit; interrupted job; missing account migrations.

Recommended steps: confirm active Admin login; preserve and retry/resend the existing person's request when the UI permits. Wait if rate limited. Have support inspect capabilities, Edge logs, allowed origin and non-secret configuration evidence. Do not create duplicate people or use real development accounts to work around failed production invitations.

Expected resolution: the same durable job finishes with one linked permanent profile, or capability remains intentionally disabled.

Contact Admin/support: persistent service errors, repeated rate-limit failures or any uncertainty over the existing person's link. New Admin creation is outside the ordinary invitation flow.

Sources: 1-admin/modules/users/users.js; supabase/functions/manage-accounts/handler.mjs; supabase/config.toml.

## 2.6 Account link/access changes rejected

Problem: an edit reports that an Auth account is already linked, an existing link cannot change, a prepared invitation must finish, or self-removal is forbidden.

Confirmed behavior: mcpa_save_account preserves existing Auth linkage, blocks self-removal of active Admin authority, blocks creation/promotion to new Admin and refuses edits conflicting with a prepared invitation. Permanent identity protects historical accountability.

Possible causes: wrong existing person selected, unfinished invitation, attempted account reassignment or prohibited role/status transition.

Recommended steps: stop the edit; review the intended existing person and invitation status. Complete/reconcile that existing job through the supported Admin flow. Escalate any identity conflict rather than relinking an already linked profile or removing a person.

Expected resolution: access changes preserve person identity and produce account audit evidence, or the invalid change remains blocked.

Contact Admin/support: every historical identity mismatch or link conflict that cannot be resolved by selecting the correct existing person.

Sources: supabase/migrations/202610060001_account_management.sql; 1-admin/modules/users/users.js.

# 3. Projects and equipment visibility

## 3.1 Assigned project is absent or incorrect

Problem: Projects or Request Tools omits the expected project, or shows another accountable person.

Confirmed behavior: requests require an active project assigned to the current permanent profile ID. Project scope uses assigned_engineer_id; archiving removes operational eligibility. A legacy name alone does not grant assignment.

Possible causes: wrong account, unassigned project, archived/inactive project, assignment changed, incomplete stable ID linkage or failed project snapshot.

Recommended steps: clear project/search filters and verify the account; distinguish an empty authorized list from an error state. Ask Admin to inspect the actual project's active status and assigned person. Refresh after an authorized assignment change; do not substitute another project to bypass validation.

Expected resolution: the intended active assigned project appears for that user, or an accurate no-assignment message remains.

Contact Admin/support: Admin for assignment/status correction through normal authorized workflow; technical support if source-confirmed configuration errors remain.

Sources: js/project-scope.js; 1-admin/modules/sites/sites.js; supabase/migrations/202610100001_engineer_portal.sql; supabase/migrations/202610060002_recipient_identity.sql.

## 3.2 Projects needs a database configuration update

Problem: project list/history shows a database configuration error despite an accessible menu.

Confirmed behavior: Projects maps missing relation/column/function/API-cache errors (42P01, 42703, 42883 and PGRST200/202/204/205) to a configuration-update message. mcpa_project_snapshot references project_history.

Possible causes: missing project_history, missing columns/RPCs, stale API schema or a deployment that differs from repository prerequisites. A prior deployment note reported missing history; its current state is unverified.

Recommended steps: retry once after a normal refresh; record the error code and route. Maintainers should inspect the current sanitized schema and supplied project-history preflight read-only. An existing repair script is not evidence that installation succeeded and must not be run blindly.

Expected resolution: verified project reader/history dependencies are available and the authorized page loads.

Contact Admin/support: any recurring configuration-update message. A menu cannot prove backend readiness.

Sources: 1-admin/modules/sites/sites.js, databaseError; supabase/migrations/202610100001_engineer_portal.sql; supabase/project-history-preflight.sql.

## 3.3 Equipment does not appear

Problem: an asset visible elsewhere is absent from Equipment Tracking, project stock or request selection.

Confirmed behavior: field tracking shows confirmed personal custody; assigned-project inventory and request catalog have different scopes. Operational views suppress zero quantities. Requestability excludes held, locked, inactive, damaged, missing, retired or unverified stock. A pending incoming handover does not yet assign custody.

Possible causes: different authorized scope, search/filter active, zero quantity, wrong site/account, pending receipt, repair/missing state, allocation or failed synchronization.

Recommended steps: clear filters; check the appropriate module and account. Compare the saved transfer/request status with current holder and Recorded status/New requests reason. Ask Admin to locate the existing asset by its displayed code without creating a duplicate record.

Expected resolution: the record is found in its authorized scope or its exclusion is explained by saved state.

Contact Admin/support: a known positive-quantity personally held record stays absent after successful refresh, or location/holder differs from verified physical evidence.

Sources: js/equipment-tracking.js; js/movement-overview.js; supabase/migrations/202610100001_engineer_portal.sql.

## 3.4 Available status but not available to request

Problem: the saved status is Available but the request selector labels Reserved, Pending handover, In custody or Availability unverified.

Confirmed behavior: saved equipment status and new-request eligibility are separate. A reservation or holder blocks new stock requests even with raw AVAILABLE. Field users need safe lock metadata; absence of another user's scoped request is not proof of unlocked stock. Raw IN_OFFICE is not accepted as AVAILABLE by the write validator.

Possible causes: approved request reservation, pending/refused handover, existing holder, missing availability enrichment, failed movement snapshot or legacy status.

Recommended steps: read the displayed eligibility reason; refresh once. Admin should review the existing authorized reservation/handover and installed snapshot response version read-only. Do not alter status or clear reservations manually to force selection.

Expected resolution: genuinely eligible unheld/unlocked AVAILABLE stock becomes selectable, or the explicit blocker remains until resolved through its authorized workflow.

Contact Admin/support: persistent Availability unverified or contradictory saved status/holder/allocation. The October 15 report explicitly described an unapplied enrichment patch; current installation NEEDS VERIFICATION.

Sources: js/equipment-tracking.js, requestability; supabase/migrations/202610150001_inventory_availability.sql; documentation/inventory-status-verification.md.

## 3.5 Equipment registration or metadata save fails

Problem: the Admin form cannot save, the saved item cannot be verified, or Office information is unavailable.

Confirmed behavior: only Admin can submit this UI. New internal/asset IDs are retained during retry. New stock depends on the configured Office trigger/policy. A failed save keeps form/photo selection; a successful save followed by inventory refresh failure is reported separately.

Possible causes: network failure, schema/policy/Office mismatch, invalid metadata, photo validation/upload error, account or screen changed during save.

Recommended steps: preserve the form; confirm the active Admin account; inspect the specific photo/Office error. If the application says saved but refresh failed, refresh and search for the existing code before retrying. Maintainers verify Office and schema/policies through read-only evidence; do not recreate Office or run the open correction SQL as a generic fix.

Expected resolution: one equipment record appears at the configured Office with intended metadata, or a precise save/configuration error remains.

Contact Admin/support: repeated save verification failure, missing Office dependency, duplicate-looking records or any uncertainty whether the insert committed.

Sources: 1-admin/modules/masterlist/masterlist.js; supabase/migrations/202610120003_equipment_office_default.sql; supabase/equipment-office-preflight.sql.

# 4. Requests, transfers and QR receiving

## 4.1 Request cannot be submitted, approved or released

Problem: no selectable tools/project, stale-state errors or a rejected review/release.

Confirmed behavior: selected assets must have positive quantity and eligible recorded status/custody/allocation. Request creation requires an active assigned project. Approval reserves records; release requires an approved allocation and active operational receiver. Empty purpose is allowed by the current optional-purpose definition; its 2000-character limit remains.

Possible causes: competing allocation, stale snapshot, wrong assignment, inactive recipient, tool moved/changed, invalid date/payload, missing migration or unsupported role.

Recommended steps: refresh request and stock; read the eligibility reason; choose the intended assigned project. Admin should review the current request state and receiver access before review/release. Do not approve/release again merely because the screen is stale; inspect the saved request/transfer linkage first.

Expected resolution: an eligible request saves or advances once with correct reservation/linkage; changed stock produces a clear conflict.

Contact Admin/support: unexplained state/role errors after fresh authorized reads, overlength/date validation that cannot be explained, or missing movement storage.

Sources: js/movement-ui.js; js/movement-cloud.js; supabase/migrations/202610060002_recipient_identity.sql; supabase/migrations/202610120003_optional_request_purpose.sql.

## 4.2 Withdrawal/cancel/refusal/reopen is missing or refused

Problem: the operation is absent or returns an ownership/state denial.

Confirmed behavior: these optional gateway actions are Engineer/Architect only, with precise owner/state conditions and required reason/confirmation. Live UI requires server allowedActions. Received transfers cannot be canceled. Tool Handler/Admin cannot perform these field interruptions.

Possible causes: wrong account, changed/received state, not the original requester/sender/named receiver, cancellation gateway absent or incomplete, blank reason/confirmation.

Recommended steps: refresh the saved record and verify the exact role/owner/state. Enter the required reason and confirmation only when the action is available and intended. Support should review installed gateway/allowedActions rather than forcing a button or rerunning the old cancellation migration.

Expected resolution: the eligible action saves immutable evidence and correct allocation state, or remains safely denied.

Contact Admin/support: an eligible record consistently omits allowedActions or the gateway chain differs from reviewed definitions. Office does not require cancellation to function.

Sources: js/permissions.js; js/movement-ui.js; supabase/migrations/202610100004_movement_cancellation.sql; SUPABASE-RELEASE-READINESS.md.

## 4.3 Camera scanning will not load or start

Problem: scanner library unavailable, insecure-context message or camera-start failure.

Confirmed behavior: the UI checks Html5Qrcode, secure context (HTTPS or localhost), and camera startup. It offers manual details/code where supported and reports missing camera/permission guidance.

Possible causes: CDN/network blocking, non-HTTPS page, camera permission denied, no device camera, camera occupied or unsupported device/browser behavior.

Recommended steps: use the approved HTTPS application; allow camera access for this site if appropriate; close other camera sessions and retry. Use the visible manual handover-code or receiver/project selection flow when available. Do not scan a receiving QR as an equipment tag or vice versa.

Expected resolution: supported camera scanning starts or the permitted manual route identifies the correct record/context. Physical iOS/Android camera behavior is NEEDS VERIFICATION.

Contact Admin/support: library never loads, secure HTTPS scanning still fails or manual entry cannot find an existing authorized record.

Sources: js/movement-ui.js, startCamera and stopCamera; index.html.

## 4.4 Receiving QR is invalid, expired or assignment changed

Problem: QR resolution reports invalid/expired/revoked or receiver/project mismatch.

Confirmed behavior: tokens expire after 15 minutes, prior active QR is revoked on generation, and resolution rechecks active account and assignment. Transfer creation rejects mismatch between receiving token and selected receiver/project.

Possible causes: older token, wrong QR type, receiver regenerated/revoked QR, receiver inactive or project reassigned/archived since generation.

Recommended steps: verify that the intended receiver is signed in and assigned to the active destination. Ask that receiver to generate a fresh receiving QR through the normal workflow, or use permitted manual selection. Generating QR changes temporary state; do it only as part of the intended authorized handover. Do not share the token in support documents.

Expected resolution: fresh context resolves to the intended receiver and current project; no stock moves merely from resolving it.

Contact Admin/support: active verified assignments still fail or the account/project needs authorized administrative review.

Sources: supabase/migrations/202610100001_engineer_portal.sql; js/movement-ui.js.

## 4.5 Handover code not found or wrong receiver

Problem: no transfer found for a code, or only the named receiver can confirm.

Confirmed behavior: lookup uses authorized transfer data and code/reference. The write gateway compares the transfer receiver UUID with the current profile; Admin access is not receipt authority.

Possible causes: wrong code/QR type, wrong company/demo mode, unsaved transfer, unrelated account, data not refreshed or already changed transfer state.

Recommended steps: have the sender verify the saved transfer reference and intended receiver through their authorized view; compare the displayed account and refresh. Use the exact handover code. Do not create a replacement transfer until Admin/sender confirms whether the original saved.

Expected resolution: the named receiver opens the existing pending handover; unrelated users remain denied.

Contact Admin/support: a confirmed saved pending transfer is unavailable to its actual named receiver after successful refresh.

Sources: js/movement-ui.js; supabase/migrations/202610060002_recipient_identity.sql.

## 4.6 Transfer confirmation validation fails

Problem: receipt requires more inspections, testing, notes or a damaged-custody decision.

Confirmed behavior: exactly one valid condition per selected tool; non-missing received tools require testing; damaged/missing require notes; damage requires an explicit decision. The receiver must remain authorized and allocation/state must still match.

Possible causes: incomplete inspection row, unchecked testing, blank damage/loss notes, undecided damage acceptance, wrong receiver or changed record state.

Recommended steps: physically inspect every selected asset record and complete its corresponding row truthfully. Use Missing only for an item not received and explain it. Accept damaged custody only when that decision is intended; if the current flow exposes eligible refusal, supply its required reason/confirmation. Do not mark a test complete without performing it.

Expected resolution: good/accepted damage moves to receiver/destination; missing retains source accountability. If refused under the optional gateway, the entire handover remains allocated with unchanged equipment custody/status.

Contact Admin/support: discrepancies between selected tools and physical delivery, an unavailable custody decision, or a conflict after all accurate checks are complete.

Sources: js/movement-ui.js, inspections; supabase/migrations/202610060002_recipient_identity.sql; supabase/migrations/202610100004_movement_cancellation.sql.

# 5. Returns, repairs, missing equipment and files

## 5.1 Return submission blocked by Office configuration

Problem: Office returns are not configured, the destination cannot be verified, or an unavailable/ambiguous Office blocks submit.

Confirmed behavior: return destination is fixed through mcpa_return_destination and the pinned singleton Office. The UI can preserve a draft and retry the Office connection. The backend rejects arbitrary destination names/IDs.

Possible causes: missing RPC/helper/wrapper/configuration, inactive pinned site, ambiguous name, privilege/API schema issue or failed network read. A site merely named Office is insufficient evidence of valid configuration.

Recommended steps: preserve the return draft and use the visible retry after confirming connection. Ask Admin/support to inspect Office configuration and reviewed delegate chain read-only. Use Transfers for project-to-project handover; do not enter another project as a return workaround or rebind Office.

Expected resolution: the verified Office label loads and the eligible holder can submit truthful per-tool return conditions.

Contact Admin/support: any persistent configuration error or destination mismatch. Do not rerun Office/cancellation migrations or the historical equipment correction SQL without a separate reviewed authorization.

Sources: js/movement-cloud.js, returnDestination; js/movement-ui.js; supabase/migrations/202610120002_office_returns.sql; SUPABASE-RELEASE-READINESS.md.

## 5.2 Returned equipment still looks held, damaged or missing

Problem: a return outcome differs from the expected inventory display.

Confirmed behavior: good return clears holder and becomes Available at Office. The current Office wrapper clears holder for physically returned damaged equipment and opens Office repair. Missing return preserves last holder/site. There is no separate Admin acceptance step.

Possible causes: missing condition was recorded, damaged return correctly remains in repair, older deployed gateway, refresh failure or comparing a historical return snapshot with current equipment.

Recommended steps: inspect the saved return's per-tool conditions and current equipment details. Refresh after any saved-success warning. Admin should compare the installed Office gateway with the documented source if a physically returned damaged item retains personal custody. Never clear holder manually to imitate a return.

Expected resolution: current equipment matches the committed condition-specific outcome or the deployment difference is identified.

Contact Admin/support: wrong recorded conditions, inconsistent current custody or uncertainty over installation/commit. Any correction requires a separately authorized operational process.

Sources: supabase/migrations/202610060002_recipient_identity.sql; supabase/migrations/202610120002_office_returns.sql; js/movement-cloud.js.

## 5.3 Repair or missing report/resolution fails

Problem: a holder cannot report, or Admin cannot start/complete repair or recover a case.

Confirmed behavior: field reports require eligible held In Use equipment; Admin resolution checks current case/equipment state. Recovery requires good/damaged condition and damaged recovery notes. Already changed state produces a conflict. Under Repair can be a case-derived label while raw equipment remains REPAIR.

Possible causes: wrong holder/role, zero quantity, tool already locked/damaged/missing, already resolved case, missing resolution input or stale page.

Recommended steps: refresh the case and equipment; verify the account and physical circumstances; complete truthful required notes/condition/destination. Use the existing case instead of creating duplicates. Distinguish repair completion from good/damaged recovery; damaged recovery opens repair.

Expected resolution: one appropriate report/state transition with retained accountability and history.

Contact Admin/support: physical location/custody disagrees with the saved case or source-permitted transition fails after a fresh read.

Sources: js/movement-ui.js; supabase/migrations/202610060002_recipient_identity.sql.

## 5.4 Equipment photo upload/display fails

Problem: invalid photo, upload failed, or saved image unavailable while details remain visible.

Confirmed behavior: upload is Admin-only; accepted JPEG/PNG/WebP must match file signature and be 1 byte–5 MiB. Upload uses immutable unique paths; metadata save is separate and preserves staged retry state. Private image display uses scoped signed URLs and a non-blocking unavailable hint.

Possible causes: unsupported/corrupt file, excessive size, network problem, missing/private bucket policy, non-Admin account, expired signed URL, changed account/screen or missing object reference.

Recommended steps: choose a valid supported image within the limit and retain the current form for retry. Verify that metadata actually saved before repeating the registration. Refresh to renew viewing access; use equipment details while the image is unavailable. Support reviews bucket privacy/path/policy evidence without making the bucket public.

Expected resolution: one private saved image displays for an authorized viewer, or equipment details remain usable with an explicit image problem.

Contact Admin/support: repeated storage error, valid saved image unavailable across refresh, or account changed during upload. Do not distribute signed URLs as permanent photo links.

Sources: js/equipment-photos.js; 1-admin/modules/masterlist/masterlist.js; supabase/migrations/202610100003_feature_storage.sql.

## 5.5 Purchase receipt will not upload or open

Problem: file rejected, purchase save cannot verify uploaded receipt, or Open receipt produces no visible tab.

Confirmed behavior: PDF/JPEG/PNG/WebP up to 10 MiB; Admin/Secretary only. The purchase RPC verifies an existing path under that purchase UUID. Open uses a five-minute signed URL and may report blocked popups.

Possible causes: wrong MIME/size, network/storage failure, wrong staged path, unsaved ledger entry, unauthorized account, popup blocker or expired link.

Recommended steps: use a supported file within the limit; preserve the current purchase and retry the same save when safe. Allow popups for the trusted application when opening through its button; reopen there to obtain a fresh authorized URL. Confirm the ledger entry before creating a second one.

Expected resolution: the existing purchase links to a private receipt that opens for an authorized user. Stock remains unchanged by purchase save.

Contact Admin/support: persistent object/path or Storage policy errors; never expose receipts through public bucket settings.

Sources: 1-admin/modules/purchases/purchases.js; supabase/migrations/202610100005_purchase_ledger.sql; supabase/migrations/202610100003_feature_storage.sql.

# 6. Materials, synchronization, notifications and reports

## 6.1 Consumable request/stock operation fails

Problem: usage exceeds stock, too many decimals, duplicate open request, overreceipt or stale-version error.

Confirmed behavior: quantities allow at most three decimals; balances cannot become negative; one pending/partial request per item; receipts cannot exceed outstanding quantity. Requests require purpose and valid dates. Existing received stock survives cancellation. Version/operation checks protect concurrent edits and retries.

Possible causes: invalid quantity/note/date, already open request, another user changed balance/version or a retry used changed values.

Recommended steps: refresh item/request and review Stock History and received quantity. Enter intended valid quantities/notes; receive the existing request rather than duplicating it. A count correction is a real stock-changing operation and should only be used for an authorized verified physical count.

Expected resolution: one validated stock/request transition with correct balance and history; invalid overuse/overreceipt remains blocked.

Contact Admin/support: actual physical stock discrepancy, unexplained duplicate/version error or unexpected historical balance. Purchase ledger entries do not receive stock.

Sources: 1-admin/modules/consumables/setup.sql; 1-admin/modules/consumables/consumables.js.

## 6.2 Movement saved but updated records could not load

Problem: the application explicitly reports a successful save followed by failed refresh, and blocks another movement while stale.

Confirmed behavior: movement-cloud marks the workspace stale after post-commit refresh failure and requires refresh before another change. Operation UUID is retained for matching retry values; changing a payload under an existing UUID is rejected by the backend.

Possible causes: network interruption after commit, failed scoped read, changed session or service/configuration problem. A timeout alone does not establish whether the transaction saved.

Recommended steps: restore connection, refresh and inspect the existing movement/status/current custody. Do not start a second request/transfer to compensate for an uncertain response. If the same preserved form is retried, use the application's normal path; do not manually generate/change operation IDs.

Expected resolution: the committed result is visible exactly once and stale-state blocking clears after a successful read.

Contact Admin/support: saved result cannot be located or a conflict persists. Include the visible reference/time, not raw payload or personal data.

Sources: js/movement-cloud.js, mutate and refresh; supabase/migrations/202610060002_recipient_identity.sql.

## 6.3 Screen or data will not synchronize

Problem: unable-to-load-screen message, stale views or recurring synchronization warning.

Confirmed behavior: module fetch errors provide Retry; inventory watchers generally poll every 30 seconds while visible and refresh on focus/online/visibility. Auth rechecks separately. Realtime failure triggers normal read verification rather than guaranteeing delivery.

Possible causes: offline/intermittent connection, blocked CDN/resources, missing deployed module file, expired session, service outage or missing Realtime publication. The specific root cause requires evidence.

Recommended steps: check connection and the displayed account; use screen Retry/refresh and wait for a visible-page read. If the error follows a save, follow the prior issue before resubmitting. Support can inspect failed resource paths/status codes and current static deployment/read grants.

Expected resolution: an authorized fresh snapshot replaces stale data, or a precise load/permission/configuration failure is identified.

Contact Admin/support: repeatable missing resource or sync failures on a working connection. Demo is a separate sample environment and does not synchronize live changes.

Sources: js/data.js, loadModule; js/equipment-tracking.js, watch; js/auth.js; js/movement-cloud.js.

## 6.4 Notifications unavailable or expected notice absent

Problem: notice service unavailable, automatic retries paused, empty list or missing historic event.

Confirmed behavior: missing table/function errors and permission errors are distinguished; configuration errors can pause automatic retries. Notices are own-recipient, future-operation events; actor exclusions and dedupe apply. Opening a notice/marking read changes read_at. Old history is not backfilled. Weekly/overdue generation requires a trusted scheduler.

Possible causes: valid role/recipient scope, no new eligible event, same performer excluded, read state, missing migration/trigger/API schema/publication or absent scheduler.

Recommended steps: verify current account and error vs empty-state distinction. Refresh after support confirms the dependency. For a missing notice, inspect the existing authorized movement and expected recipient semantics; do not create a test production movement simply to generate a notice. For strict read-only review, do not open/mark notices read.

Expected resolution: own eligible saved notices display; historical gaps remain explicit. Delivery timing and live Realtime remain NEEDS VERIFICATION.

Contact Admin/support: missing-service/permission error, current qualifying event absent or scheduler status unknown. No email/SMS notification feature is assumed.

Sources: js/monitoring.js; supabase/migrations/202610100006_monitoring.sql; supabase/migrations/202610120001_request_turnover_notifications.sql.

## 6.5 Reports missing, stale period or no historical snapshot

Problem: no report access, invalid range, disabled export or absent saved snapshot.

Confirmed behavior: Reports is Admin-only. Inclusive range is at most 367 days; changing dates disables export until the matching period loads. Current inventory remains current regardless of historical range. Only actually captured prospective weekly snapshots exist; no automatic backfill is supplied.

Possible causes: wrong role, invalid date range, failed monitoring RPC, period not loaded, no scheduler/capture for the selected period or genuine empty data.

Recommended steps: confirm Admin role; select a valid period and load it; distinguish current inventory from saved snapshots. Ask support to verify generator job/capture history read-only. Do not fabricate a past snapshot or invoke the generator from a browser to make history appear.

Expected resolution: loaded-period movement/snapshot data or accurate absence, with current inventory clearly identified as current.

Contact Admin/support: setup/permission errors, missing known existing snapshots or scheduler completeness requiring confirmation.

Sources: 1-admin/modules/reports/reports.js; supabase/migrations/202610100006_monitoring.sql.

## 6.6 PDF or equipment-tag printing fails

Problem: a report download cannot load resources, stalls/fails, an unsupported character appears as [U+XXXX], or equipment tag print is blank.

Confirmed behavior: report PDFs use locally committed vendor files with download lock, role recheck and visible feedback. They export existing authorized rows only. Unsupported glyph notation preserves code points. Equipment-tag images separately use api.qrserver.com and a popup/print window.

Possible causes: missing deployed vendor asset, network/cache/resource load, role/session changed while loading, blocked download/popup, tag image service unavailable or unsupported glyph in embedded font.

Recommended steps: load the intended report/current search successfully; retry once after refresh. Verify account/role. For tags/print inventory, allow the trusted popup if appropriate and verify external image loaded before printing. Report code-point notation is intentional preservation; inspect original record text for meaning. Support checks deployed vendor paths/hash manifest without running a new application build/deployment as an unapproved fix.

Expected resolution: one complete filtered PDF or readable print preview; record permissions and data remain unchanged by export.

Contact Admin/support: resource errors continue, report pages clip/miss rows or a QR tag will not render. Physical printing/optical scanning require device QA.

Sources: js/pdf-reports.js; vendor/pdf/manifest.json; 1-admin/modules/reports/reports.js; js/movement-overview.js; 1-admin/modules/masterlist/masterlist.js.

# 7. Maintainer error-code and escalation reference

| Evidence | Confirmed handling / interpretation | Safe maintainer next step |
| --- | --- | --- |
| invalid_credentials | Incorrect email/password branch. | User checks credentials/recovery; never request password. |
| email_not_confirmed | Invitation confirmation required. | Review same person's invite delivery/callback. |
| 42501 | Permission/role/profile/private-function denial. | Check intended role/state and current grants; preserve RLS. |
| 22023 | Validation/state input error exposed by movement layer. | Read specific message; correct intended form values. |
| 40001 | Stale state or reused operation with different values. | Read committed state and reopen/refresh safely. |
| 23505 | Unique conflict such as existing project/open request/link/reference. | Locate existing record; avoid duplicate creation. |
| 23503 / 23001 | Linked record restriction in Projects. | Preserve history; use authorized archive behavior where applicable. |
| 23514 | Check constraint / invalid project details. | Review bounded values/status and form input. |
| 42P01 / 42883 | Missing relation/function. | Compare sanitized catalog with source prerequisites. |
| PGRST202 / PGRST205 | Missing function/table API metadata or setup mismatch. | Verify installed definition and API schema through owner review. |
| 42703 / PGRST200 / PGRST204 | Projects missing column/relationship/API metadata mapping. | Inspect schema/read definitions; no blind migration replay. |
| PGRST301 / PGRST303 | Projects expired/invalid database session handling. | Fresh sign in with intended company account. |

Recommended escalation packet: visible error text, role, module/route, Manila timestamp, safe record reference, whether a success message preceded failure, whether retry/refresh changed anything, and sanitized diagnostic code/resource path. Admin confirms operational ownership/assignment; technical support verifies configuration/catalog/service evidence; QA reproduces only in an approved staging environment.

NEEDS VERIFICATION: no live error was reproduced, production data compared, email sent, QR generated, notice marked read or business transaction executed for this guide. Existing historical local QA reports are useful evidence of intended behavior but are not a fresh live diagnosis.

Sources: js/auth.js; js/movement-cloud.js; 1-admin/modules/sites/sites.js; 1-admin/modules/users/users.js; 1-admin/modules/reports/reports.js; supabase/functions/manage-accounts/handler.mjs.
