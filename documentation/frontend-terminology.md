# Frontend terminology and activity presentation

Implemented October 24, 2026. This is a presentation change; no schema, stored audit events, API identifiers, workflow permissions, stock calculations or custody transitions are renamed or migrated.

## Scope and workflow evidence

Reviewed both portal entry points, all 48 application scripts, the Admin and Engineer module templates, navigation and role permissions, live/demo repositories, and the Supabase setup, migrations and account functions. The active modules share their movement rendering; Engineer users, settings and reports placeholder scripts are not separate production implementations. No new operational modules were added.

| System area | Data and business meaning checked | Updated rendering |
|---|---|---|
| Dashboard and activity | Movement snapshot, immutable operation activity, live/demo event aliases | Shared action titles, descriptions, names, references, timestamps and readable activity search |
| Equipment and accountability | Equipment status/condition, profile and project relationships, requestability, confirmed custody | Shared status, condition and tracking labels; unresolved relationships use readable fallbacks; equipment history includes time |
| Requests | Submit, review, reserve, release, withdraw and cancel | Domain-specific badges, filters, detail pages and dashboard phases |
| Transfers and receiving | Dispatch, mandatory testing, damaged acceptance/refusal, missing items, cancellation and reopening | Receipt wording does not imply every tool was accepted or in good condition; release still requires receipt |
| Returns, repairs and missing equipment | Office return inspection, retained missing-item accountability, repair completion, recovery condition | Shared activity and state wording; damaged recovery does not claim availability |
| Projects | Project history, construction fields, work-area progress, engineer assignments and corrections | Shared event/status/date labels; known field differences remain readable; unknown metadata is summarized without printing database keys or JSON |
| Consumables | Stock status, outstanding material requests, opening/usage/restock/correction/receipt ledger | Shared stock/request labels, stock event descriptions, actor names, dates and request references |
| Purchases | Record-only procurement ledger, delivery derived from material requests, private receipts and revision history | Shared delivery labels, purchase/material references and history dates/names |
| Notifications | Existing own-recipient monitoring endpoint and movement notification action metadata | Shared movement wording; personal pending-turnover instructions remain intact |
| Accounts and roles | Directory/profile identity, invitations, role/access changes, development-account audit | Shared role and audit labels; missing people use a name fallback instead of exposing a UUID |
| Search and reports | Existing authorized repositories, module guards, current/historical reports and local PDF generation | Search snippets and exports use the same display vocabulary; PDFs no longer print raw action keys |

Workflow evidence comes from `js/movement-store.js`, `js/movement-cloud.js`, `js/permissions.js`, `1-admin/modules/movements/setup.sql`, and the authenticated-access, recipient-identity, engineer-portal, movement-cancellation, monitoring, request-turnover, Office-return, inventory-availability, project-construction, consumables and purchase migrations. Existing database policies and authenticated identity remain authoritative. No additional records or profile fields are fetched for the wording changes.

## Central formatting contract

`js/display.js` exposes the frozen `window.MCPADisplay` vocabulary. Both portal entry points load it before permissions, data and rendering scripts. Callers escape its plain-text results using their existing HTML/text-node handling.

- `activity(record, authorizedSnapshot)` supplies title, description, actor, readable reference and Manila timestamp without mutating the source record. Useful human-written historical summaries are retained alongside the action description.
- `status(value, domain)` separates equipment, request, transfer, return, repair, missing, stock, material request, delivery, project and account meanings. For example, a pending equipment request awaits review; a pending transfer awaits receipt; a pending material request awaits delivery.
- `event`, `projectEvent`, `condition`, `tracking` and shared `roles` replace local display mappings.
- `dateTime` uses `en-PH`, `Asia/Manila` and seconds. Date-only business fields keep their recorded calendar day. Missing/invalid dates do not become the Unix epoch or an invented time. PDF timestamps add the explicit PHT offset.
- `person`, `reference` and `numberedReference` preserve readable business references, use consistent five-digit material/purchase numbers and avoid UUID fallbacks in ordinary display text. Internal IDs remain in records and navigation targets.
- `notification` preserves the intended receiver's existing turnover instructions. `safeText` and `errorText` provide readable fallbacks for technical summaries and infrastructure failures.

Unknown activity identifiers display **Activity Recorded**; unknown statuses display **Status Unavailable**. Missing statuses display **Status Not Recorded**. Unknown project fields produce **Additional project details changed** while the full original values remain in the existing audit store. Known conditions come from recorded values; missing conditions no longer appear as an invented Good inspection.

## Ambiguities and limits

The older demo identifier `transfer_created` represents both direct dispatch and approved-request release. It displays the release title only when an already-authorized related transfer includes `requestId`; otherwise it uses the factual dispatch title. Reports and PDF exports receive that same authorized context. No historical records are rewritten.

Unknown/custom event identifiers and unknown nested project fields have no verified business definition. Their neutral fallback is intentional. Add a mapping only after checking the implementation or obtaining a business definition; there is no outstanding ambiguity for the implemented live actions.

Technical identifiers remain available in authorized backend audit records and operational payloads. This formatting layer is not an authorization boundary. Existing RLS, protected RPCs, module guards and scoped repositories continue to enforce access.

## Validation

The regression results and commands are recorded below after execution. Browser checks use the existing in-memory PostgreSQL/Auth fixture with external HTTPS blocked; no live company data or accounts are changed. Desktop and mobile screenshots are written under the ignored `tests/artifacts/terminology` directory.

Run the focused suite with `npm --prefix tests run test:terminology`. Existing assertions that intentionally expected raw action keys or old labels were updated to assert the new human wording while retaining record, permission, pagination and layout checks.

## Action and status mappings

The following tables are generated from the shipped vocabulary, so the glossary matches the implementation.

### Movement actions

| Stored action | Display title | Description |
|---|---|---|
| `createRequest` | Equipment Request Submitted | Submitted a new equipment request. |
| `approveRequest` | Equipment Request Approved | Approved the equipment request and reserved its equipment. |
| `rejectRequest` | Equipment Request Rejected | Rejected the equipment request. |
| `releaseRequest` | Equipment Released for Transfer | Released the approved equipment for transfer. Receipt confirmation is still required. |
| `createTransfer` | Equipment Transfer Dispatched | Dispatched equipment to the named receiver. Receipt confirmation is still required. |
| `receiveTransfer` | Transfer Received | Recorded the transfer inspection and receipt outcome. |
| `createReturn` | Equipment Return Recorded | Recorded the equipment return and its inspected condition. |
| `reportRepair` | Equipment Damage Reported | Reported equipment damage for repair. |
| `startRepair` | Equipment Repair Started | Started the equipment repair. |
| `completeRepair` | Equipment Repair Completed | Completed the repair and made the equipment available for use. |
| `reportMissing` | Missing Equipment Reported | Reported equipment as missing. |
| `recoverMissing` | Missing Equipment Recovered | Recorded the recovery and inspected condition of missing equipment. |
| `withdrawRequest` | Equipment Request Withdrawn | Withdrew the pending equipment request. |
| `cancelReservation` | Equipment Reservation Canceled | Canceled the approved reservation before equipment was released. |
| `cancelTransfer` | Equipment Transfer Canceled | Canceled the unreceived transfer. Equipment custody did not change. |
| `refuseTransfer` | Damaged Equipment Refused | Refused damaged equipment after inspection. Custody remained with the sender. |
| `reopenTransfer` | Transfer Inspection Reopened | Reopened the refused transfer for another inspection by the receiver. |

### Historical aliases

| Historical value | Canonical action |
|---|---|
| `request_created` | `createRequest` |
| `request_approved` | `approveRequest` |
| `request_rejected` | `rejectRequest` |
| `transfer_created` | `createTransfer` |
| `transfer_received` | `receiveTransfer` |
| `return_created` | `createReturn` |
| `repair_reported` | `reportRepair` |
| `repair_started` | `startRepair` |
| `repair_completed` | `completeRepair` |
| `missing_reported` | `reportMissing` |
| `missing_recovered` | `recoverMissing` |
| `request_withdrawn` | `withdrawRequest` |
| `reservation_cancelled` | `cancelReservation` |
| `reservation_canceled` | `cancelReservation` |
| `transfer_cancelled` | `cancelTransfer` |
| `transfer_canceled` | `cancelTransfer` |
| `transfer_refused` | `refuseTransfer` |
| `transfer_reopened` | `reopenTransfer` |

### Statuses by workflow

| Workflow | Stored value | Display |
|---|---|---|
| equipment | `available` | Available |
| equipment | `inuse` | In Use |
| equipment | `inoffice` | In Office |
| equipment | `repair` | For Repair |
| equipment | `underrepair` | Under Repair |
| equipment | `missing` | Missing |
| equipment | `disposed` | Retired |
| availability | `available` | Available |
| availability | `deployed` | In Use |
| availability | `unavailable` | Unavailable |
| request | `pending` | Pending Review |
| request | `approved` | Approved |
| request | `rejected` | Rejected |
| request | `released` | Released / Awaiting Receipt |
| request | `received` | Received / Completed |
| request | `discrepancy` | Receipt Discrepancy |
| request | `withdrawn` | Withdrawn |
| request | `canceled` | Canceled |
| request | `cancelled` | Canceled |
| transfer | `pending` | Awaiting Receipt |
| transfer | `received` | Received / Completed |
| transfer | `refused` | Damage Refused / Awaiting Sender |
| transfer | `canceled` | Canceled |
| transfer | `cancelled` | Canceled |
| return | `returned` | Returned |
| repair | `reported` | Reported |
| repair | `underrepair` | Under Repair |
| repair | `completed` | Completed |
| missing | `missing` | Missing |
| missing | `recovered` | Recovered |
| stock | `out` | Out of Stock |
| stock | `low` | Low Stock |
| stock | `ok` | Stock Sufficient |
| materialRequest | `pending` | Awaiting Delivery |
| materialRequest | `partial` | Partially Received |
| materialRequest | `received` | Received |
| materialRequest | `cancelled` | Canceled |
| materialRequest | `canceled` | Canceled |
| delivery | `pending` | Awaiting Delivery |
| delivery | `partial` | Partially Received |
| delivery | `received` | Received |
| delivery | `cancelled` | Linked Request Canceled |
| delivery | `unlinked` | No Linked Request |
| project | `active` | Active |
| project | `discrepancy` | Discrepancy |
| project | `verified` | Verified |
| project | `turnover` | Turnover |
| project | `idle` | Idle Stock |
| project | `planning` | Planning |
| project | `completed` | Completed |
| account | `active` | Active |
| account | `inactive` | Inactive |

### Account and stock events

| Area | Stored event | Display title |
|---|---|---|
| account | `person_created` | Person Added |
| account | `account_linked` | Sign-in Account Linked |
| account | `role_changed` | Account Role Changed |
| account | `account_reactivated` | Account Reactivated |
| account | `account_deactivated` | Account Deactivated |
| account | `person_renamed` | Person Name Updated |
| account | `user_invited` | Account Invitation Sent |
| account | `invitation_resent` | Account Invitation Resent |
| account | `development_account_created` | Test Account Created |
| stock | `opening` | Opening Stock Recorded |
| stock | `usage` | Stock Used |
| stock | `restock` | Stock Replenished |
| stock | `correction` | Stock Balance Corrected |
| stock | `receipt` | Requested Stock Received |

### Project events

| Stored event | Display title |
|---|---|
| `created` | Project Created |
| `baseline` | Earlier Project Details Recorded |
| `engineer` | Project Assignment Updated |
| `phase` | Earlier Project Phase Updated |
| `name` | Project Name Updated |
| `location` | Project Location Updated |
| `current_work_area` | Current Work Area Updated |
| `project_stage` | Project Stage Updated |
| `status` | Project Status Updated |
| `last_inventory_check` | Inventory Check Updated |
| `progress` | Earlier Completion Updated |
| `construction_progress` | Construction Progress Updated |
| `weights` | Work Area Weights Updated |
| `archived` | Project Archived |
| `restored` | Project Restored |
| `details` | Project Details Updated |
| `site_update` | Site Update Recorded |

### Roles, conditions and tracking

| Area | Stored value | Display |
|---|---|---|
| Role | `admin` | Admin |
| Role | `engineer` | Engineer |
| Role | `architect` | Architect |
| Role | `secretary` | Secretary |
| Role | `tool_handler` | Tool Handler |
| Condition | `good` | Good |
| Condition | `fair` | Fair |
| Condition | `damaged` | Damaged |
| Condition | `lost` | Missing |
| Condition | `missing` | Missing |
| Condition | `needsinspection` | Needs Inspection |
| Condition | `notassessed` | Not Assessed |
| Tracking | `Individual` | Individual Asset |
| Tracking | `Bulk` | Bulk Stock |

## Changed application components

- Shared scripts: `display.js` (new), `dashboard-view.js`, `movement-overview.js`, `movement-ui.js`, `equipment-tracking.js`, `equipment-photos.js`, `global-search.js`, `monitoring.js`, `pdf-reports.js`, `data.js`, and `permissions.js`.
- Admin module scripts: Equipment Tracking (`masterlist`), Projects (`sites`), Consumables, Purchases, Reports, and Users. Engineer/Architect and Tool Handler movement screens use the same shared renderers. Settings consumes the shared role vocabulary.
- Templates: both portal entry points, the equipment form/filter labels, and consumables stock/request filters. Existing control values and IDs are retained.
- Tests: the new display and browser terminology regressions, existing isolated JavaScript loaders, and assertions that previously required old labels/raw action names. No dependencies were added.
