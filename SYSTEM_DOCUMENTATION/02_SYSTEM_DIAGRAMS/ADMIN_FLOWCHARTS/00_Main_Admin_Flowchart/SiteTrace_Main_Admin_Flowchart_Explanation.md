# SiteTrace (MCPA) - Main Admin Flowchart

Stage 1 only. Source-reviewed **20 October 2026**, repository **071ae16**. This is documentation of the implemented system, not a change to application behavior.

## Files and page order

- [Editable draw.io source](SiteTrace_Main_Admin_Flowchart.drawio): four named pages, individual editable symbols, labels and flowlines.
- [Printable PDF](SiteTrace_Main_Admin_Flowchart.pdf): four A3 portrait pages; print at actual size for the intended typography.
- [High-resolution PNG overview](SiteTrace_Main_Admin_Flowchart.png): all four pages on one review sheet. Use the individual page PNGs for close reading.
- [Page 1 PNG](SiteTrace_Main_Admin_Flowchart_P01.png): Login and verified Admin authorization.
- [Page 2 PNG](SiteTrace_Main_Admin_Flowchart_P02.png): Dashboard, persistent navigation and module selection.
- [Page 3 PNG](SiteTrace_Main_Admin_Flowchart_P03.png): Verified module destinations - Stage 1 only.
- [Page 4 PNG](SiteTrace_Main_Admin_Flowchart_P04.png): Verified company logout and retry.

The four pages separate authentication, common navigation, thirteen module endpoints and logout. This keeps labels legible without expanding any module's internal operations. Page SVGs are supporting vector exports. The PowerShell build/render/validation scripts are documentation helpers stored only in this new folder; no HTML, CSS or JavaScript file is created or changed.

## Login and authentication

Page 1 begins with Start, Open SiteTrace, Display Login and credential entry. Native HTML email/required-field validation precedes a valid form submission. Supabase Auth owns credential authentication through signInWithPassword; the application supplies the trimmed email and password and never compares a password with a profile record.

The Authentication successful? diamond routes failures to the actual login feedback categories (invalid credentials, unconfirmed email or connection failure), then paired circle A returns to credential entry. A successful sign-in clears the password input and requests mcpa_my_profile using the authenticated session.

The profile decision requires a successfully returned company profile, a supported role and active status. Missing/unsupported profiles, inactive accounts and failed verification return to Login with their corresponding source-defined message. The RPC resolves profiles.auth_user_id against auth.uid(), rather than trusting a role supplied by the user.

The Profile role is Admin? decision describes entry into the Admin branch; it is not an additional Admin-only gate in the login code. An active supported non-Admin user is routed to their own permitted workspace. Secretary defaults to Material Requests, while other supported roles default to Dashboard; a valid requested route may take precedence. The diagram does not invent a non-Admin authentication error or force sign-out.

For Admin, the live workspace is initialized, Login hidden, account controls and filtered navigation built, and monitoring initialized. Page 2 then resolves the initial route.

## Dashboard and module navigation

Without a known requested screen, Admin home is Dashboard. The Dashboard module is loaded/reused by showScreen and mounts MovementOverview. Its module shell can display a connection error and Retry if HTML/script loading fails; circle R on page 2 repeats that load. Data-loading errors inside a successfully loaded Dashboard are handled by its own module and are outside this overview.

There is a source-defined exception to always landing on Dashboard: auth.enter reads the URL hash through MCPANavigation.initialRoute and preserves a recognized initial screen. A history entry owned by a different account/session instead falls back to the role home. A non-Dashboard initial route therefore follows H directly to page 3; no fictitious compulsory Dashboard visit is inserted.

The actual sidebar contains **Dashboard plus thirteen modules**. Admin chooses a module, Dashboard or Log Out from the persistent navigation/account controls. The Dashboard selected? Yes branch uses paired circle D to call showScreen('dashboard') again. The same sidebar is available from opened modules, so this return route is verified without inventing a universal Back-to-Dashboard button or an automatic return after module work.

On page 3, Which module owns the selected route? is a genuine multiway route-dispatch decision. Its thirteen mutually exclusive exits are labeled with actual route IDs. Follow exactly one. A common downward choice bus, drawn once, distributes the selected case left-to-right; it does not execute all modules in parallel. Each rectangle represents high-level navigation via showScreen to that screen. The router checks canRoute, loads/reuses the owning module and activates its screen; module operations and detailed errors belong in Stage 2.

The Equipment Tracking module also owns tool-profile. Projects also owns site-detail. These are detail routes, not extra sidebar modules. My Account in the account menu opens the existing Settings route; Change theme is an account/display action, not another module. Profile revalidation and backend policies continue to control access; this main chart does not replace server authorization.

## Verified modules and future connector register

Dashboard is the main hub, route #dashboard, and is already represented on page 2. All other menu names below match ADMIN_NAV and the Admin allowlist. Descriptions summarize available actions only; no detailed module flowchart is included.

| Reference | Actual Admin module | Source routes | Verified high-level scope | Destination status |
| --- | --- | --- | --- | --- |
| M01 | Equipment Tracking | #masterlist, #tool-profile | Register / edit equipment, view details and QR labels, search and export inventory. | **PLANNED — STAGE 2** |
| M02 | Projects | #sites, #site-detail | View projects and project detail; Admin project management and assignments. | **PLANNED — STAGE 2** |
| M03 | Requests | #request | Review requests; approve, reject and release eligible requests. | **PLANNED — STAGE 2** |
| M04 | Transfers | #transfer | Monitor handovers and their records; Admin cannot act as the named field receiver. | **PLANNED — STAGE 2** |
| M05 | Returns | #return | Monitor recorded returns; no separate Admin acceptance stage. | **PLANNED — STAGE 2** |
| M06 | Repairs | #repair | Review repair cases; start and complete eligible repairs. | **PLANNED — STAGE 2** |
| M07 | Missing | #missing | Review missing cases and record eligible Good / Damaged recovery. | **PLANNED — STAGE 2** |
| M08 | Material Requests | #consumables | Manage consumable items / stock and material requests; record receipts or cancel outstanding requests. | **PLANNED — STAGE 2** |
| M09 | Purchases | #purchase | View and save purchase ledger records with optional private receipts; does not receive stock. | **PLANNED — STAGE 2** |
| M10 | Reports | #reports | Load monitoring reports for a selected period and export PDF. | **PLANNED — STAGE 2** |
| M11 | Activity Logs | #activity | Search saved movement activity, follow record links and export PDF. | **PLANNED — STAGE 2** |
| M12 | People & Accountability | #users | Manage company people, accounts and accountability using Admin controls. | **PLANNED — STAGE 2** |
| M13 | Settings | #settings | View My account identity, change display theme and log out; roles are managed by Admin. | **PLANNED — STAGE 2** |

M01-M13 identify **future named module flowcharts**, not existing continuation pages. Reuse the same reference in each corresponding Stage 2 entry when approved. None has a destination page number, existing-file claim or false matching continuation. Existing general workflow diagrams elsewhere in SYSTEM_DOCUMENTATION are preserved and are not presented as these future Admin module diagrams.

The six Admin movement actions in the current permission map are approveRequest, rejectRequest, releaseRequest, startRepair, completeRepair and recoverMissing. Admin can view Transfers and Returns, but is not the named field receiver and does not get a separate Office-return acceptance step. Other module-specific Admin controls (inventory, projects, materials, purchases, people and reports) enforce their own applicable backend authorization.

## Decisions and continuation references

Binary decisions have explicit Yes/No exits: authentication success, verified active supported profile, Admin role, known non-Dashboard initial route, Dashboard screen loaded, Log Out selected, Dashboard selected and confirmed sign-out. The single multiway dispatch has thirteen labeled cases corresponding to the verified module register.

| On-page reference | Page | Matching continuation purpose |
| --- | ---: | --- |
| A | 1 | Login error returns to credential entry |
| D | 2 | Dashboard selection resumes Dashboard loading |
| R | 2 | Dashboard module-load Retry resumes that load |
| C | 3 | Initial-route entry H joins ordinary module selection N |
| A | 4 | Unconfirmed sign-out Retry restarts the verified logout routine |

Circle letters are scoped to their page. Every on-page reference has exactly one outward and one inward endpoint. No upward or right-to-left arrows are needed to represent these retries.

| Actual off-page reference | Exit | Existing matching entry |
| --- | --- | --- |
| S | Page 1 | Page 2: verified Admin entry |
| N | Page 2 | Page 3: selected module |
| H | Page 2 | Page 3: known non-Dashboard initial route |
| L | Page 2 | Page 4: logout |

These four actual page-transition pairs differ from the thirteen explicitly planned M references. All actual references resolve to a page in this draw.io file/PDF.

## Verified logout

Page 4 expands the Log Out branch. The application ends its navigation session, clears local identity/workspace and setup/demo session markers, removes the route hash and displays Signing out before awaiting Supabase. It calls auth.signOut with scope local. Success displays Login with You have been signed out and ends the Admin session path. Failure displays Sign out could not be confirmed with Retry sign out; paired circle A repeats logout. Clearing the local UI is not falsely equated with confirmed Supabase sign-out. Other-device sessions are outside the local signOut scope.

Logout is available from the account menu, the existing shell logout control and Settings/My account. The offline-demo branch has different logout behavior and is outside this company Admin diagram.

## Source evidence

Paths are relative to the repository; anchors/line numbers refer to this source revision. SQL files were inspected as text only; nothing was executed against Supabase.

| Source | Location / anchor | Evidence |
| --- | --- | --- |
| [js/auth.js](../../../../js/auth.js) | 32-53, 72-106 | Login form and errors; signInWithPassword; profile validation and app entry. |
| [js/auth.js](../../../../js/auth.js) | 120-134, 136-155 | Local signOut and retry; route denial; boot/session/callback behavior. |
| [js/permissions.js](../../../../js/permissions.js) | 5-20, 39-42 | Admin routes and actions; role labels; Dashboard home. |
| [js/navigation.js](../../../../js/navigation.js) | 8-30, 54-63, 107-160 | Actual sidebar labels, permissions filter and showScreen routing / detail destinations. |
| [js/navigation-history.js](../../../../js/navigation-history.js) | 128-155 | Account-scoped history, initialRoute and endSession clearing. |
| [js/app.js](../../../../js/app.js) | 8-25, 47-118, 257 | Owning module map, module loading / retry, logout forwarding. |
| [supabase/migrations/202610040001_authenticated_access.sql](../../../../supabase/migrations/202610040001_authenticated_access.sql) | 42-59 | Profile auth_user_id matches auth.uid(); active authorized backend identity and mcpa_my_profile. Read only. |
| [js/movement-cloud.js](../../../../js/movement-cloud.js) | 27-48, 95-106 | Scoped live snapshot and explicit live/demo workspace modes. |
| [1-admin/modules/dashboard/dashboard.js](../../../../1-admin/modules/dashboard/dashboard.js) | 1 | Dashboard mounts the shared MovementOverview. |
| [js/movement-overview.js](../../../../js/movement-overview.js) | 39-62, 85-145 | Shared Dashboard / Activity display and data loading. |
| [1-admin/modules/masterlist/masterlist.js](../../../../1-admin/modules/masterlist/masterlist.js) | Module entry / controls | Source-confirmed Equipment Tracking screen. Register / edit equipment, view details and QR labels, search and export inventory. |
| [1-admin/modules/sites/sites.js](../../../../1-admin/modules/sites/sites.js) | Module entry / controls | Source-confirmed Projects screen. View projects and project detail; Admin project management and assignments. |
| [1-admin/modules/requests/requests.js](../../../../1-admin/modules/requests/requests.js) | Module entry / controls | Source-confirmed Requests screen. Review requests; approve, reject and release eligible requests. |
| [1-admin/modules/transfers/transfers.js](../../../../1-admin/modules/transfers/transfers.js) | Module entry / controls | Source-confirmed Transfers screen. Monitor handovers and their records; Admin cannot act as the named field receiver. |
| [1-admin/modules/returns/returns.js](../../../../1-admin/modules/returns/returns.js) | Module entry / controls | Source-confirmed Returns screen. Monitor recorded returns; no separate Admin acceptance stage. |
| [1-admin/modules/repairs/repairs.js](../../../../1-admin/modules/repairs/repairs.js) | Module entry / controls | Source-confirmed Repairs screen. Review repair cases; start and complete eligible repairs. |
| [1-admin/modules/missing/missing.js](../../../../1-admin/modules/missing/missing.js) | Module entry / controls | Source-confirmed Missing screen. Review missing cases and record eligible Good / Damaged recovery. |
| [1-admin/modules/consumables/consumables.js](../../../../1-admin/modules/consumables/consumables.js) | Module entry / controls | Source-confirmed Material Requests screen. Manage consumable items / stock and material requests; record receipts or cancel outstanding requests. |
| [1-admin/modules/purchases/purchases.js](../../../../1-admin/modules/purchases/purchases.js) | Module entry / controls | Source-confirmed Purchases screen. View and save purchase ledger records with optional private receipts; does not receive stock. |
| [1-admin/modules/reports/reports.js](../../../../1-admin/modules/reports/reports.js) | Module entry / controls | Source-confirmed Reports screen. Load monitoring reports for a selected period and export PDF. |
| [1-admin/modules/activity/activity.js](../../../../1-admin/modules/activity/activity.js) | Module entry / controls | Source-confirmed Activity Logs screen. Search saved movement activity, follow record links and export PDF. |
| [1-admin/modules/users/users.js](../../../../1-admin/modules/users/users.js) | Module entry / controls | Source-confirmed People & Accountability screen. Manage company people, accounts and accountability using Admin controls. |
| [1-admin/modules/settings/settings.js](../../../../1-admin/modules/settings/settings.js) | Module entry / controls | Source-confirmed Settings screen. View My account identity, change display theme and log out; roles are managed by Admin. |

## Verification boundary

The diagram is source-verified. No live sign-in, production session, private data, database call, migration, Edge Function, deployment, commit or push was performed. Current production installation, active Admin records, deployed RPC/policy versions, network behavior and real email/session expiration still require manual verification in an authorized test environment.

An existing Auth session can skip credential entry and go directly through profile restoration. Recovery/invitation links are processed before ordinary restoration. Forgot password, password visibility, offline demo and all role routing remain implemented as before; this overview intentionally focuses on interactive company Admin sign-in and common navigation rather than detailing those separate workflows. Page 1 does not claim that every application open forces new credentials.

## Notation and validation

Start/End use ovals; system actions use rectangles; user input/display uses parallelograms; branching questions use diamonds; same-page continuations use small circles; page/module destinations use pentagons. All diagram symbols have white fill and dark outlines. Main flow descends and module exits progress right. The shared module-choice trunk is intentional; unrelated crossing lines, diagonal arrows, overlapping symbols and dangling actual transitions are rejected by validation.

Structural, actual text-geometry and native PDF/PNG validation results are stored in [Validation](Validation/). The baseline covers all 1445 pre-existing tracked and untracked files, including previous flowchart revisions. Scope checks verify those files remain unchanged and that every new file is inside this folder.

**Stop at Stage 1. Individual Admin module flowcharts are PLANNED - STAGE 2 and require the user's next approval.**
