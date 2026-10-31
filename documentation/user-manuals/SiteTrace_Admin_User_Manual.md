# SiteTrace Web Application — Administrator User Manual

Version 1.1 · Prepared 27 October 2026 · Admin

## Table of contents

- Document control
- Chapter 1 — Introduction
- Chapter 2 — Getting Started
- Chapter 3 — Administrator Modules and Features
- Chapter 4 — Step-by-Step Operational Procedures
- Chapter 5 — Common Issues and Troubleshooting
- Chapter 6 — Administrator Best Practices
- Glossary
- Evidence, validation and revision information


## Document control

| Item | Value |
| --- | --- |
| Version | 1.1 |
| Prepared | 27 October 2026 · Asia/Manila |
| Audience | Active Admin accounts |
| Basis | Current local repository, source and isolated browser review |
| Scope | 14 primary modules; authentication and account access are cross-cutting functions |
| Companion | SiteTrace_Engineer_Architect_User_Manual; SiteTrace_System_Module_and_Role_Review.md |

Naming: these documents use the requested SiteTrace title. The inspected application displays MCPA (Material & Construction Property Allocation), Construction Asset Management and Accountability System, and BuildRight Corp. Follow the on-screen MCPA labels when using the application. No application branding was changed.

Verification scope: instructions describe the current repository implementation. Most interface screenshots were captured on 12 October using isolated local PGlite records. People & Accountability was refreshed on 27 October after feature removal, using the local functionality-audit fixture. Authentication is modeled locally. They are training illustrations, not production screenshots or proof of deployed services.

The capture browser blocked external HTTPS. Original training captures permitted business reads only after fixture setup; the updated People capture came from a test run that writes only to disposable local fixtures. No live login, migration, stock change, approval, handover, receipt, return, role change, or notification-read update was performed. The live REQ-00001 test was not accessed. Its unchanged state was not independently compared because production was not contacted.

Operational availability: use the procedures only in an authorized company workspace whose required Supabase database functions, policies and services are installed. The original training captures did not execute write procedures; current automated regression checks use disposable local records. Supabase deployment, email delivery, private file retrieval, optical QR scanning and the monitoring scheduler remain unverified in production.

Screenshot conventions: all figure captions identify the local training environment. Fixture names, example.test addresses, asset references beginning DOC-, and transaction numbers in the 007xx range are synthetic. Password fields are empty or absent. No authentication tokens or receiving QR secrets are embedded in the manuals. Figures are numbered separately in each manual.


## Chapter 1 — Introduction


### 1.1 Purpose and scope

SiteTrace/MCPA tracks construction equipment, accountable holders, projects, requests, physical handovers, returns, damage, loss and consumable stock. Admin registers and maintains inventory metadata, assigns project accountability, reviews equipment requests, releases approved stock, resolves repair and missing cases, manages company access and reviews purchasing and monitoring records.

The system is a plain HTML, CSS and JavaScript application backed by Supabase Auth, PostgreSQL database functions, row-level security, private Storage and a Deno Edge Function for account creation. Daily operation should use the deployed company address and an active Admin identity.


### 1.2 Responsibilities and role boundaries

Admin coordinates approval and oversight. The named Engineer or Architect inspects and confirms receipt; Admin cannot receive transfers, create routine field requests, submit returns, withdraw requests, cancel reservations/handovers, refuse damage or reopen field handovers through the current action map. Resolve physical custody through the responsible field account instead of editing metadata to imitate a movement.

| Role | Implemented responsibility |
| --- | --- |
| Admin | Company oversight, inventory metadata, Projects writes, request approval/rejection/release, repair completion/recovery, materials, purchase ledger, reports and access management. |
| Engineer / Architect | Same permissions: request available tools for assigned projects; transfer, receive, return and report issues within ownership constraints. |
| Secretary | Material Requests, Purchases and Settings; no equipment monitoring. |
| Tool Handler | Company equipment/project monitoring and dispatch of eligible available stock without a holder; no Admin approvals or field receipt/return actions. |


### 1.3 Access requirements

- A modern browser with JavaScript enabled and access to the company application and configured Supabase services. Chrome was used for the local screenshots; no cross-browser or mobile-hardware certification is claimed.
- An issued active account and working Internet for company data. Offline demo cannot manage company accounts, consumables or purchases.
- HTTPS or localhost and camera permission for field QR scanning; Admin monitors handovers rather than scanning to accept custody.
- Allow popups/printing when using inventory Export or equipment tag printing. Private images and receipts require authorized Storage access.

Source evidence: index.html; js/auth.js; js/permissions.js; supabase/functions/manage-accounts/handler.mjs.


## Chapter 2 — Getting Started


### 2.1 Login and first access


### Sign in to your company workspace

**Purpose:** Open the pages and actions authorized for your company identity.

**Access / prerequisites:** An issued company account, an Active company profile.

1. Open the application address supplied by your administrator. Both index.html and 2-engr/index.html use authenticated role checks; the URL alone does not select your role.
2. In Welcome back, enter your company Email and Password. Show reveals the password locally; Hide masks it again. Keep passwords out of shared screenshots.
3. Select Sign In, or press Enter in a completed login form. Wait for your profile and authorized navigation to load.
4. Check the account name and role in the top-right Account menu and sidebar. If they are wrong, stop and contact Admin.

**Expected result:** The application opens the role’s home module. Admin, Engineer, Architect and Tool Handler open Dashboard; Secretary opens Material Requests.

**Limits / errors:** An Auth login without an authorized active profile is refused. Incorrect email or password., an inactive-account message, or a profile-verification failure requires correction or administrator assistance. There is no public account registration.

![Figure 1. Welcome back sign-in screen. Local capture; credential fields are empty. [Isolated local training environment.]](screenshots/shared-login.png)

Figure 1. Welcome back sign-in screen. Local capture; credential fields are empty. [Isolated local training environment.]


### Reset your password

**Purpose:** Recover access to an existing company account.

**Access / prerequisites:** A valid password-reset email, configured Supabase Auth redirects and working email delivery.

1. Enter your Email on the login page and select Forgot password?.
2. For a reset request, read the neutral response: If an account exists for this email, a password reset link has been sent. This message does not confirm that the email exists or that delivery succeeded.
3. Open the fresh email link and use Set your password. Enter a New password of at least 12 characters and select Save password.
4. After the application signs you out, sign in with the new password. Cancel and sign out abandons the setup screen.

**Expected result:** The password is saved by Supabase Auth and the user signs in again.

**Limits / errors:** An invalid or expired reset link needs a fresh password reset. This documentation session did not send or receive email.


### 2.2 Understand the Dashboard

Dashboard opens Movement overview. Company equipment totals count quantities across records, rather than just the number of rows. The page includes Total Equipment, Available, Deployed, Active Projects, Equipment status, Equipment by project / site, Asset movement, Current inventory, Next actions, Recent asset activity, Active Projects and Custody overview.

Needs Review links to Tool requests, Transfers in progress, Repair cases and Missing cases. Select a KPI or Open to go to the corresponding module. The current inventory preview shows at most six records; View full inventory opens Equipment Tracking. Asset movement charts count saved events during the last seven days in Manila time.

Status and availability are separate. The current availability helper shows Deployed for equipment at a project with In Use status, Available when there is no project or the normalized state is In Office, and Unavailable otherwise. An Available status at a project can therefore display Unavailable. Request eligibility separately requires available stock with no holder, positive quantity and no approved reservation or pending/refused transfer. Do not use a dashboard count or availability caption alone as permission to issue equipment. Movement summary totals can also include Withdrawn/Canceled records in the open count; use each saved status badge to decide what remains actionable.

![Figure 2. Admin Movement overview and sidebar, with isolated training records. [Isolated local training environment.]](screenshots/admin-dashboard.png)

Figure 2. Admin Movement overview and sidebar, with isolated training records. [Isolated local training environment.]


### 2.3 Navigation guide

| Sidebar section | Menu labels and purpose |
| --- | --- |
| Overview | Dashboard — monitoring and action queues. |
| Assets | Equipment Tracking — registered tools; Projects — project metadata and inventory. |
| Movement | Requests; Transfers; Returns; Repairs; Missing. |
| Materials | Material Requests — opens the page headed Consumables. |
| Records | Purchases; Reports — opens Inventory monitoring; Activity Logs. |
| System | People & Accountability; Settings — opens My account. |

Use the sidebar to change modules. On narrow screens, use the navigation menu button to open the drawer and select a module. Top search opens Equipment Tracking with your query applied; use View or Details on a matching row. The bell opens Notifications for roles authorized for Activity Logs. The Account menu contains My Account, Change theme and Log Out.


### Review your account, change display mode, and log out

**Purpose:** Confirm your identity, select a display preference and close your session.

**Access / prerequisites:** Any authorized role; offline demo uses Exit demo.

1. Open the top-right Account menu and select My Account, or select Settings in the sidebar.
2. Review the name, role and Active company account message. Account roles are managed by an administrator.
3. Select Change light / night mode. The Account menu also offers Change theme. The preference is stored in the current browser.
4. Select Log Out from My account or the Account menu. Wait for the sign-in screen and its sign-out confirmation.

**Expected result:** Display mode changes immediately. Log Out clears the local application workspace and asks Supabase to end the local session.

**Limits / errors:** Sign out could not be confirmed. requires Retry sign out before leaving a shared device. Settings does not provide a profile editor, email editor, role switcher or in-session password-change form.

![Figure 3. My account controls under an Admin fixture identity. [Isolated local training environment.]](screenshots/shared-account.png)

Figure 3. My account controls under an Admin fixture identity. [Isolated local training environment.]


## Chapter 3 — Administrator Modules and Features


### 3.1 Equipment Tracking

The Admin table shows Asset ID, Item, Category, Brand, Location, Status, Condition, Acquired and Actions. Use search for ID, item, brand, serial, project or holder; combine Project, Category and Status filters; use Prev, numbered pages and Next. View opens Tool Information. Edit opens the metadata form. + Add Item registers an item; Export opens a printable filtered receipt.

Equipment pictures support JPEG, PNG and WebP up to 5 MB, using configured private Storage and authorized image reads. Asset IDs are generated during save. The profile displays an equipment tag QR through an external QR service and offers printing. The Admin profile’s Movement History currently shows a registration entry only; use Activity Logs or the movement modules for actual saved transactions.

Row selection currently offers Review repairs, Review transfers and Cancel Selection after JavaScript initialization. These navigate to the review modules. They do not bulk-change status or location. Legacy HTML labels and old bulk modal functions must not be treated as operational reassignment tools.

![Figure 4. Admin Equipment Tracking table and filters. [Isolated local training environment.]](screenshots/admin-inventory.png)

Figure 4. Admin Equipment Tracking table and filters. [Isolated local training environment.]

![Figure 5. Add New Item dialog. The displayed form is unsaved. [Isolated local training environment.]](screenshots/admin-add-item.png)

Figure 5. Add New Item dialog. The displayed form is unsaved. [Isolated local training environment.]

Source evidence: 1-admin/modules/masterlist/masterlist.js: initMasterlist, showToolProfile, setupMasterlistListeners, printQRTag, exportMasterlist; js/equipment-photos.js; migration 202610100003_feature_storage.sql.


### 3.2 Projects

Projects stores project name, location, one accountable Engineer/Architect profile, free-text phase, project status, completion percentage and last inventory-check date. One person can be assigned to multiple projects; a project has one accountable person. There is no multi-member assignment table or separate project membership editor.

Use Scope (My projects or All projects), Search projects and Include archived projects. Open a project card to see Project Inventory, accountability, Last Inventory Check and Last Movement. Review Assigned Tools includes zero-quantity records; the operational Project Inventory hides them. Project History is a metadata audit; View movement history → opens movement records. Assignments are read-only in these inventory views.

Admin can Add Project, Edit Project, Archive Project and Restore Project. Archiving preserves inventory assignments and history; it does not move equipment, clear holders or complete returns. Project History and Engineer/Architect Projects require the project_history dependency. Existing deployment notes record a missing-history issue; this task did not verify its live resolution.

![Figure 6. Projects list in the isolated environment. [Isolated local training environment.]](screenshots/admin-projects.png)

Figure 6. Projects list in the isolated environment. [Isolated local training environment.]

![Figure 7. Add Project fields and accountable-profile selection. [Isolated local training environment.]](screenshots/admin-project-form.png)

Figure 7. Add Project fields and accountable-profile selection. [Isolated local training environment.]

Source evidence: 1-admin/modules/sites/sites.js; supabase/migrations/202610100001_engineer_portal.sql; 202610100002_project_history.sql.


### 3.3 Requests and reservations

Requests is the equipment approval queue. Admin reviews Pending review records, uses Approve request or Reject request with a reason, then Release tools & create transfer for Approved records. Approval reserves all selected whole asset records. Release creates the linked transfer and code; it does not assign custody to the receiver. Reservations are part of Requests and Transfers, with no separate Reservations menu.

![Figure 8. Requests queue with current saved statuses. [Isolated local training environment.]](screenshots/admin-requests.png)

Figure 8. Requests queue with current saved statuses. [Isolated local training environment.]

![Figure 9. Pending request detail and Admin approval/rejection controls. [Isolated local training environment.]](screenshots/admin-request-review.png)

Figure 9. Pending request detail and Admin approval/rejection controls. [Isolated local training environment.]

![Figure 10. Approved request and release control. [Isolated local training environment.]](screenshots/admin-release.png)

Figure 10. Approved request and release control. [Isolated local training environment.]


### 3.4 Transfers and receipt confirmations

Admin has History in Transfers. Search movement records, filter by status and use View to inspect sender, receiver, destination, transfer reference and saved inspections. Admin can copy the handover code from transfer details. The receiving field account performs testing, notes damage/missing items and confirms receipt. Your receiving QR, Send Transfer and Receive Transfer are field-role interfaces; they are not Admin receipt actions.

A refusal is available only to eligible named field receivers. Refusing any damaged item holds the entire transfer, including the other tools, with existing custody and reservations. Admin monitors the refusal and contacts the accountable sender/requester. Cancellation or reopening is not an Admin action.

![Figure 11. Admin Transfers History view. [Isolated local training environment.]](screenshots/admin-transfers.png)

Figure 11. Admin Transfers History view. [Isolated local training environment.]


### 3.5 Returns, Repairs and Missing

Returns lists the recorded return, returner, destination, notes and per-tool conditions. Field users save returns directly. There is no scheduling, separate handover QR, pending-return approval or Admin Confirm return action. Good returns clear the holder and set Available status; damaged returns open repairs and retain the holder until the appropriate resolution; missing returns retain existing custody/location and open a missing case.

![Figure 12. Returns review page with a locally seeded completed return. [Isolated local training environment.]](screenshots/admin-returns.png)

Figure 12. Returns review page with a locally seeded completed return. [Isolated local training environment.]

Repairs lists Reported, Under repair and Completed cases. Admin starts a Reported repair and completes an Under repair case with destination and completion notes. Missing lists Missing and Recovered cases. Admin records recovery with condition and location; damaged recovery opens a repair case. Reports from receipt and return inspection appear here as well as reports submitted by field users.

![Figure 13. Under repair completion fields. [Isolated local training environment.]](screenshots/admin-repair.png)

Figure 13. Under repair completion fields. [Isolated local training environment.]

![Figure 14. Missing case recovery fields. [Isolated local training environment.]](screenshots/admin-recovery.png)

Figure 14. Missing case recovery fields. [Isolated local training environment.]

Source evidence: js/movement-ui.js: createForm, renderDetail, submit; js/movement-cloud.js; 1-admin/modules/movements/setup.sql; supabase/migrations/202610060002_recipient_identity.sql and 202610100004_movement_cancellation.sql.


### 3.6 Material Requests / Consumables

The sidebar label Material Requests opens Consumables. This module manages bulk material stock, minimum levels, purchase alerts and consumable Purchase Requests. Admin and Secretary have access. Equipment requests use the separate Requests module. Consumable requests have no implemented Admin approval/rejection stage: creation, partial/full receipt and cancellation are the supported stages.

Stock levels show Out of Stock, Low Stock or OK. Use Search consumables and Stock status; Purchase Requests has a separate Request status filter. Only one Pending or Partially Received purchase request is permitted per consumable. Quantity supports up to three decimal places. Stock History records opening stock, usage, restock, correction and request receipt.

![Figure 15. Material Requests / Consumables inventory and purchase-request table. [Isolated local training environment.]](screenshots/admin-materials.png)

Figure 15. Material Requests / Consumables inventory and purchase-request table. [Isolated local training environment.]

![Figure 16. Consumable Purchase Request dialog; submission does not itself change stock. [Isolated local training environment.]](screenshots/admin-material-request.png)

Figure 16. Consumable Purchase Request dialog; submission does not itself change stock. [Isolated local training environment.]


### 3.7 Purchases

Purchases is a record-only ledger for Admin and Secretary. It records supplier, Invoice / Reference, purchase date, one optional Material Request, purchased item descriptions/quantities/prices, optional receipt and notes. Amounts display in PHP. Purchase history preserves prior and new values. Saving a purchase does not receive stock, approve a request or create equipment.

Delivery status follows the linked consumable request. Use View to see items and Purchase history; Open Material Requests goes to the stock receipt workflow. Open private receipt is available only when a receipt is attached. PDF, JPEG, PNG and WebP receipts may be up to 10 MB; an authorized link lasts five minutes. There is no purchase delete or ledger-export control.

![Figure 17. Purchases ledger and linked delivery status. [Isolated local training environment.]](screenshots/admin-purchases.png)

Figure 17. Purchases ledger and linked delivery status. [Isolated local training environment.]

![Figure 18. Record purchase dialog and line-item fields. [Isolated local training environment.]](screenshots/admin-purchase-form.png)

Figure 18. Record purchase dialog and line-item fields. [Isolated local training environment.]

Source evidence: 1-admin/modules/consumables/consumables.js and setup.sql; 1-admin/modules/purchases/purchases.js; migrations 202610100005_purchase_ledger.sql and 202610100003_feature_storage.sql.


### 3.8 Reports, Activity Logs and Notifications

Reports opens Inventory monitoring, with Current inventory, Saved inventory snapshot and Movement history. Current inventory reflects now; selecting past From/Until dates does not turn it into historical inventory. Saved snapshots record real observation times and are not reconstructed for earlier dates. Movement history filters actual saved events. Export CSV downloads the selected non-empty report.

![Figure 19. Inventory monitoring report controls and current inventory. [Isolated local training environment.]](screenshots/admin-reports.png)

Figure 19. Inventory monitoring report controls and current inventory. [Isolated local training environment.]

Activity Logs lists saved movement action, reference, actor, timestamp, tool IDs and summary. Search activity filters the visible authorized history. A reference link opens the exact transaction when available. Export CSV downloads the authorized movement activity; this is not a combined audit of accounts, project edits, purchases and consumable stock.

![Figure 20. Activity Logs with transaction references and CSV export. [Isolated local training environment.]](screenshots/admin-activity.png)

Figure 20. Activity Logs with transaction references and CSV export. [Isolated local training environment.]

The bell opens recipient-specific Notifications and a Currently overdue list. Open and mark read changes only the selected notice’s read state and opens its authorized target. Overdue notices concern received requests with a needed-until date whose accepted equipment is still held under that request’s latest receipt. Weekly equipment review and inventory capture target Monday at or after 16:00 Asia/Manila, but require a trusted backend scheduler. In-app notices are implemented; no operational SMS, push or scheduled report email was confirmed.

![Figure 21. Notifications interface. The empty local notice list is a real captured state. [Isolated local training environment.]](screenshots/admin-notifications.png)

Figure 21. Notifications interface. The empty local notice list is a real captured state. [Isolated local training environment.]

Source evidence: js/monitoring.js; 1-admin/modules/reports/reports.js; js/movement-overview.js; supabase/migrations/202610100006_monitoring.sql.


### 3.9 People & Accountability and Settings

People & Accountability is restricted to Admin. Find a person searches name, email or role. Rows show Person, Email, Role, Status, Account and Actions. Edit access changes role/status, while preserving person identity and accountability history.

Add Account is a visible form for a new or existing company profile. Enter Full name, Authorized role, Supabase Auth user ID and Account status. Create the sign-in account in Supabase Authentication > Users first for active access; an inactive profile can be saved without a sign-in link. Existing Auth links cannot be reassigned through this form. Account access history loads recent changes. No account deletion or general personal-profile editing interface is implemented. Edit access can retain an existing Admin, but a non-Admin row has no Admin promotion option.

Development / Testing Only appears only when that capability is enabled. It can create Engineer/Architect test accounts without email. These are real logins with access to live company records; the feature is not the browser-only offline demo. Its visibility depends on the server configuration.

![Figure 22. People & Accountability with the restored Add Account form; synthetic local identities. [Isolated local training environment.]](screenshots/admin-people.png)

Figure 22. People & Accountability with the restored Add Account form; synthetic local identities. [Isolated local training environment.]

Source evidence: 1-admin/modules/users/users.js; 1-admin/modules/settings/settings.js; migrations 202610060001_account_management.sql and 202610060003_development_accounts.sql; supabase/functions/manage-accounts/handler.mjs.


## Chapter 4 — Step-by-Step Operational Procedures

The following procedures describe source-supported company operations. They were inspected and cross-checked against the genuine local UI; the capture browser did not execute their writes. Confirm the physical facts and current record state before using them in an authorized workspace.


### 4.1 Find and review equipment

**Purpose:** Check a tool’s identifying data and current status.

**Access / prerequisites:** Admin; Equipment Tracking must load.

1. Select Equipment Tracking. Type an asset ID, item name, brand, serial number, project or holder in the search field.
2. Choose Project, Category and Status filters as needed. Use Prev or Next for additional rows.
3. Select View beside the correct asset. Review Tool Information, photo, holder, location, quantity and condition.
4. Use ← MASTERLIST to return. Open Activity Logs or a relevant movement module for full saved movement evidence.

**Expected result:** The correct asset profile is displayed without changing equipment.

**Limits / errors:** The profile’s registration-only Movement History is not a full transaction history. Equipment with positive quantity may still be reserved or unusable.


### 4.2 Add an inventory item

**Purpose:** Register new equipment metadata.

**Access / prerequisites:** Active Admin; required equipment table policies and private Storage for a photo.

1. Select Equipment Tracking > + Add Item.
2. Enter Item Name / Classification and select Category. Optionally enter Brand, Model and Serial Number.
3. Select Initial Condition and Tracking Type (Individual or Bulk). For Bulk, enter Quantity and select Unit; use Sets for set-based records if that matches the physical count.
4. Optionally enter Identifying Details and choose an Item photo. JPEG, PNG or WebP must be non-empty and no more than 5 MB. Review the photo preview.
5. Select Save Item. Wait for completion and check the returned asset ID in the inventory.

**Expected result:** A generated T- asset ID identifies the new item, registered with AVAILABLE status and no holder/project. The list refreshes.

**Limits / errors:** Initial Condition is metadata; choosing Damaged does not create a repair transaction or automatically change AVAILABLE status. Review usability before issue. Photos require Storage configuration. A failure keeps the form/photo; a verified save followed by refresh failure requires checking the saved asset before retry.


### 4.3 Edit metadata or replace an equipment photo

**Purpose:** Correct identification without bypassing custody.

**Access / prerequisites:** Admin; an existing asset.

1. Find the row in Equipment Tracking and select Edit.
2. Update the name, category, brand, model, serial, condition, tracking type, quantity/unit or identifying details as needed.
3. Select a replacement photo only if required. Keep current photo discards an unsaved replacement; the current attachment is kept when no new file is selected.
4. Select Update Item and verify the refreshed row.

**Expected result:** The same asset ID remains; the selected metadata and optional photo are saved.

**Limits / errors:** The editor does not change current_holder_id, site_id or status. No delete/remove-current-photo operation is provided. Quantity/type edits affect totals; verify the physical record and prefer traceable movement procedures for custody changes.


### 4.4 Print a filtered inventory list or an asset tag

**Purpose:** Produce a physical identification or review document.

**Access / prerequisites:** Admin; printer/Save as PDF support, popups allowed; external QR service for a tag.

1. For an inventory list, select Equipment Tracking and apply the intended filters, then select Export.
2. Review the printable Tools & Equipment Receipt and use the browser print dialog or Save as PDF. This export includes all filtered rows, not just the visible page.
3. For an equipment tag, open View and use Print Tag in the profile. Check the printed asset ID against the physical item.

**Expected result:** A printable filtered receipt or equipment-identification tag is produced.

**Limits / errors:** Inventory Export is print output, not CSV. The print receipt’s footer currently says Fieldmark Asset Management System. QR images need api.qrserver.com; blocked images can prevent tag printing. QR image retrieval was unavailable in the capture session.


### 4.5 Add or edit a project

**Purpose:** Maintain project metadata and the accountable profile.

**Access / prerequisites:** Admin; existing accessible Engineer/Architect profile; Projects database dependencies.

1. Select Projects > + Add Project, or open a project card and select Edit Project.
2. Enter Project Name and Location. Select the actual Engineer / Architect. One project has one accountable person.
3. Enter optional Project Phase; select Status and enter Completion (%) as a whole number from 0 to 100.
4. Optionally enter Last Inventory Check, no later than today in Manila.
5. Select Create Project or Save Changes and verify the project card/detail.

**Expected result:** The project is created/updated and installed audit triggers record metadata changes.

**Limits / errors:** Duplicate names, blank required text, an inaccessible profile, invalid percentage or future check date are refused. A concurrent edit requires closing/reopening the form. Project assignment does not transfer existing equipment custody.


### 4.6 Archive or restore a project

**Purpose:** Control visibility while preserving accountability.

**Access / prerequisites:** Admin; a saved project.

1. Select Projects and open the correct project.
2. Select Archive Project. Read that equipment assignments and full history remain; select Archive to confirm.
3. To restore, enable Include archived projects, open the archived project and select Restore Project, then Restore.

**Expected result:** The project’s active flag changes and its history remains.

**Limits / errors:** Archiving does not return or transfer equipment. New receiving QR/direct transfers require active receiving projects. Existing inventory must still be reviewed.


### 4.7 Review project equipment and history

**Purpose:** Inspect assignments and supporting evidence.

**Access / prerequisites:** Admin; readable project/equipment/history records.

1. Open Projects and the relevant project card.
2. Review Project Inventory. Select Review Assigned Tools to include zero-quantity records and filter by equipment search/status. Close the dialog when finished.
3. Select Project History for metadata changes; use View movement history → for saved movements.
4. For an equipment row, select View → to open the appropriate equipment detail.

**Expected result:** Read-only views show the selected project’s equipment and available history.

**Limits / errors:** Review Assigned Tools cannot reassign equipment. Missing project_history is a configuration issue, not an invitation to reconstruct or edit old history.


### 4.8 Approve or reject an equipment request

**Purpose:** Review the need and allocate eligible stock.

**Access / prerequisites:** Admin; Pending review request and still-available, unheld, unreserved equipment.

1. Select Requests. Search movement records or filter status to find Pending review.
2. Select View on the request. Review Requested by, destination, purpose, needed-until date and tool IDs.
3. To approve, select Approve request. To reject, enter Reason for rejection and select Reject request.
4. Check the new status in the saved record and the requester’s recorded reason where applicable.

**Expected result:** Approval changes the request to Approved and reserves the whole selected records. Rejection changes it to Rejected without custody assignment.

**Limits / errors:** Approval is not a receipt. Competing approvals may fail if stock became reserved. The request cannot be silently edited or reallocated to different tools in this dialog.


### 4.9 Release approved tools

**Purpose:** Create a recorded handover for approved stock.

**Access / prerequisites:** Admin; Approved request with intact reservations and an active operational receiver.

1. Select Requests and open the Approved record.
2. Confirm physical readiness, selected tool IDs, destination and named receiver.
3. Select Release tools & create transfer.
4. Record the resulting Handover code and select Open transfer to review it. Share the code with the named receiver using your authorized work process.

**Expected result:** The request becomes Released and a pending transfer reserves the tools for receipt.

**Limits / errors:** Release leaves current custody unchanged. Admin does not confirm the receiver’s testing. Cancellations after release belong to eligible field users and preserve history.


### 4.10 Monitor a transfer, refusal or receipt

**Purpose:** Track handover completion and condition evidence.

**Access / prerequisites:** Admin; Transfers access.

1. Select Transfers > History. Search by reference, tool, person or project and choose a status if needed.
2. Select View on the transfer. Review Sent by, Receiver, Destination, code and the saved inspection information.
3. Use Copy handover code if coordination requires the reference.
4. For Awaiting receipt, contact the named receiver; for Damage refused · awaiting sender, coordinate with the accountable sender/requester; for Inspected / completed, review Recorded condition.

**Expected result:** The actual saved handover state is understood; no custody changes occur from monitoring.

**Limits / errors:** Admin has no receive/refuse/cancel/reopen controls. Do not use inventory edits to simulate a completed handover. Accepted damage may complete the transfer while opening a repair case.


### 4.11 Review equipment returns

**Purpose:** Verify return records and route damage/loss follow-up.

**Access / prerequisites:** Admin; a saved return.

1. Select Returns. Find the return by reference, tool, person or destination.
2. Select View and inspect Returned by, destination, notes and Recorded condition for every tool.
3. Open Repairs or Missing to review any resulting cases. Compare current inventory holder/location with the recorded outcome.

**Expected result:** The saved return and generated follow-up cases can be reviewed.

**Limits / errors:** There is no Admin acceptance button or separate pending-return status. A damaged return retains its holder; a missing item retains source custody/location until resolution.


### 4.12 Start and complete a repair

**Purpose:** Move a reported case through repair and restore service.

**Access / prerequisites:** Admin; Reported case for start, Under repair case for completion.

1. Select Repairs, locate the case and select View.
2. For a Reported case, select Start repair. Confirm its case status is Under repair.
3. When work and checks are complete, reopen the Under repair case. Select Available at project and enter Repair completion notes.
4. Select Complete repair and verify the case and inventory.

**Expected result:** The case becomes Completed; the tool status becomes Available, the holder is cleared and the selected destination is recorded.

**Limits / errors:** Start repair changes the report state; the raw equipment status may remain REPAIR. The destination-based availability caption may still say Unavailable for Available equipment at a project. Changed/closed cases require refresh.


### 4.13 Record recovery of missing equipment

**Purpose:** Restore a found tool with an inspected condition.

**Access / prerequisites:** Admin; Missing case and physically inspected recovered equipment.

1. Select Missing and View the case.
2. Select Recovered at project and Recovered condition: Good — available for use or Damaged — send for repair.
3. Enter Recovery details explaining where/how it was found.
4. Select Confirm recovery and verify the resulting case, inventory and any new repair report.

**Expected result:** The missing case becomes Recovered, holder is cleared, destination is recorded, and status becomes Available or For repair. Damaged recovery opens a repair case.

**Limits / errors:** Recovery does not prove who caused the loss/damage. An already changed equipment status or closed case is rejected.


### 4.14 Add or edit a consumable

**Purpose:** Set material identity and minimum stock.

**Access / prerequisites:** Admin or Secretary; Material Requests access.

1. Select Material Requests, which opens Consumables. Select + Add Consumable.
2. Enter Item name, Unit, Minimum stock and actual Opening stock. Quantities may have up to three decimal places.
3. Select Add Consumable. To change an existing name/minimum, use Edit and Save Changes.

**Expected result:** The material appears with its opening-stock history and computed stock status.

**Limits / errors:** Unit is read-only during edit. Current quantity changes belong in Update Stock or Receive Stock. Duplicate normalized names and invalid quantities are refused.


### 4.15 Record usage, restock or a physical-count correction

**Purpose:** Keep consumable stock and history accurate.

**Access / prerequisites:** Admin or Secretary; existing item and a physical quantity/reference.

1. Select Material Requests > Update Stock on the correct item.
2. Choose Change type: Record usage, Restock without a request, or Correct physical count.
3. Enter Quantity used, Quantity added or Correct total stock as displayed. For correction, enter the resulting total, not a signed difference.
4. Enter Reason / reference and inspect Stock after change.
5. Select Save Stock Change; review the balance and History.

**Expected result:** Usage subtracts; restock adds; correction sets the stated total. A stock movement records the reason and resulting balance.

**Limits / errors:** Usage cannot exceed current stock. Use Receive Stock for deliveries belonging to an open request; recording the same delivery here and there would double-count it. Quantity changes are version checked.


### 4.16 Create a consumable Purchase Request

**Purpose:** Record material stock required from purchasing.

**Access / prerequisites:** Admin or Secretary; consumable without a Pending/Partially Received request.

1. Select Material Requests > + Purchase Request, Request Stock or Purchase Required on an item.
2. Select Consumable and enter Quantity requested. Review the suggested shortage; adjust to the actual need.
3. Optionally enter Needed by, not in the past. Enter Requested by and Purpose.
4. Select Submit Request and review the new CR- reference in Purchase Requests.

**Expected result:** A Pending purchase request is saved; available stock stays unchanged.

**Limits / errors:** Requested by is entered text rather than proof of a field account. There is no approval/rejection step. One open request per consumable is enforced.


### 4.17 Receive partial/full material deliveries or cancel the remainder

**Purpose:** Update stock from actual deliveries and preserve purchasing history.

**Access / prerequisites:** Admin or Secretary; Pending or Partially Received purchase request.

1. In Material Requests > Purchase Requests, select Receive Stock on the correct CR- record.
2. Enter Quantity received greater than zero and no greater than the outstanding amount. Enter Delivery reference / notes.
3. Select Confirm Receipt; check the stock balance and request status. Repeat for later actual partial deliveries.
4. To close an unfulfilled remainder, select Cancel or Cancel Request, enter Cancellation reason and select Confirm Cancellation.

**Expected result:** Received stock increases immediately. The request becomes Partially Received or Received. Cancellation closes the outstanding amount and retains earlier receipts.

**Limits / errors:** Cancellation does not reverse stock already received. Saved receipts with a list-refresh failure must be checked before re-entry.


### 4.18 View consumable Stock History

**Purpose:** Reconcile stock against supporting records.

**Access / prerequisites:** Admin or Secretary; existing material.

1. Select History on a consumable, or Stock History in its Purchase Request detail.
2. Review Date, Change, Quantity, Balance and Reason / Reference. Dates use Manila time.
3. Match request-receipt entries with the correct CR- reference, then Close.

**Expected result:** The saved stock movements explain the balance.

**Limits / errors:** The interface does not offer a stock-history export/delete/edit control. Use explicit future correction entries for verified count changes.


### 4.19 Record or edit a purchase

**Purpose:** Store an invoice record independently of physical receipt.

**Access / prerequisites:** Admin or Secretary; configured purchase ledger; private receipt Storage if attaching a file.

1. Select Purchases > Record purchase, or Edit an existing row.
2. Enter Supplier, Invoice / Reference and Purchase date. Optionally select Material Request.
3. For each Purchased item, enter Item description, positive Quantity (up to three decimal places) and Unit price (PHP) (up to two decimal places). Use Add item or Remove item; at least one and no more than 100 lines are allowed.
4. Optionally attach Receipt / Invoice (PDF/JPEG/PNG/WebP, up to 10 MB) and enter Notes. Review Total.
5. Select Save purchase and verify the ledger row.

**Expected result:** The purchase and append-only history are saved. Linked delivery status follows the consumable request.

**Limits / errors:** Saving never increases stock. A duplicate supplier/reference/date is refused. A changed purchase requires reopening before save. The current receipt is retained unless replaced.


### 4.20 Review a purchase, its private receipt and linked delivery

**Purpose:** Inspect purchase evidence and continue to materials receipt.

**Access / prerequisites:** Admin or Secretary; readable purchase and attached receipt where applicable.

1. Select Purchases, set Search purchases and date filters if needed, then View the correct PUR- row.
2. Review supplier/reference, items, total, notes, Delivery and Purchase history.
3. Select Open private receipt if attached; allow the popup and retrieve it before the short-lived link expires.
4. Select Open Material Requests to record an actual delivery through Receive Stock.

**Expected result:** The ledger evidence is displayed and any delivery is recorded in the correct stock workflow.

**Limits / errors:** An attachment is not proof of delivery. Private receipt URLs expire after five minutes. Ledger deletion/export and receipt removal without replacement are not offered.


### 4.21 Load monitoring reports and export CSV

**Purpose:** Review present inventory or saved historical observations.

**Access / prerequisites:** Admin; monitoring report RPC and actual snapshots if requesting history.

1. Select Reports. Choose Current inventory, Saved inventory snapshot or Movement history from Report.
2. Enter From and Until; choose a valid inclusive range no longer than 367 days and select Load report.
3. For Saved inventory snapshot, select the actual Saved snapshot capture time.
4. Read the scope message, then select Export CSV if data rows are available. Open the mcpa-current, mcpa-history or mcpa-activity CSV file.

**Expected result:** The chosen report is displayed/exported with the documented scope.

**Limits / errors:** Current inventory always describes now; date filters apply to snapshots/history. Empty periods cannot be exported. No prior snapshot is invented when historical captures are absent.


### 4.22 Review activity and notifications

**Purpose:** Follow recorded actions to their supporting transactions.

**Access / prerequisites:** Admin; Activity Logs and configured monitoring.

1. Select Activity Logs and use Search activity. Select a linked action/reference to open its exact saved record.
2. Select Export CSV to download the authorized movement activity when needed.
3. Select the topbar bell. Review Currently overdue and saved notices.
4. Select an overdue request reference to inspect it, or Open and mark read on a notice to update that notice’s read state and open its authorized module. Close the dialog when done.

**Expected result:** Movement links resolve to records; selected notice read state persists when the server confirms it.

**Limits / errors:** Activity Logs does not include all module-specific audits. Scheduled weekly/overdue notices depend on a backend scheduler. Opening the bell alone does not mark every notice read.


### 4.23 Add an account or update an existing company profile

**Purpose:** Create company access while preserving accountability identities.

**Access / prerequisites:** Admin; existing verified Auth user ID for active sign-in access.

1. Select People & Accountability > Add Account. The account form is visible on the main page.
2. Keep New company profile selected and enter Full name and Authorized role. To update a person, select their Company profile instead.
3. For active access, create or verify the person in Supabase Authentication > Users, copy their user ID into Supabase Auth user ID and select Active. You may instead save an Inactive company profile without an Auth link.
4. Select Add Account for a new profile, or Save account access for an existing one. Confirm the saved row. Existing linked Auth IDs cannot be reassigned.
5. For a quick role/status change, use the row Edit access action. Load Account access history to review recorded changes.

**Expected result:** The account is saved through the existing account-management RPC. The form remains available when the optional test-account service is unavailable.

**Limits / errors:** Active access requires a valid Auth link. The server prevents removing your own Admin access, reassigning a linked Auth identity or promoting a new Admin. This form does not create Auth credentials or send email.


### 4.24 Use development accounts only in authorized testing

**Purpose:** Create a controlled test login when email-based onboarding is unavailable.

**Access / prerequisites:** Admin; explicitly enabled Development / Testing Only capability; approved isolated/staging use.

1. In People & Accountability, locate Development / Testing Only if shown.
2. Enter distinct test Full name, testing Email, Temporary password of 12–128 characters and Role (Engineer or Architect).
3. Select Create test account. Keep the password privately; do not capture it in documentation.
4. If creation is unfinished, use the corresponding Retry control and original details/password. When testing ends, deactivate the account in Edit access.

**Expected result:** A real test Auth login is created without sending email; repeated completed creation retains its original account/password.

**Limits / errors:** These accounts can access company records. They are not offline demo identities. Do not create test accounts in production merely to obtain screenshots. This procedure was not run during documentation.

Source evidence: Procedures 4.1–4.25 follow the module handlers cited in Chapter 3, js/permissions.js, and the authenticated, identity, account-management, portal, cancellation, ledger and monitoring migrations.


## Chapter 5 — Common Issues and Troubleshooting

| Message / symptom | Action |
| --- | --- |
| Incorrect email or password. | Re-enter the issued email and password. Use Forgot password? with a valid email if needed. |
| Inactive / unauthorized profile | Contact Admin to verify account status and Auth linkage. A successful Auth login alone does not grant application access. |
| Access restricted | Use Return to your workspace. Changing the URL does not provide a missing permission. |
| Unable to load this screen | Use Retry after checking the connection. A module download failure is different from a database configuration failure. |
| Saved successfully, but the updated records could not load. | Refresh and check the original reference before any new submission. The save may already have committed. |
| Unable to sync changes. Retrying automatically… | The active page retries on focus, reconnect and roughly every 30 seconds while visible. Keep drafts and compare refreshed records before acting. |
| This record is unavailable or your account no longer has access. | Refresh the activity list. The record may have changed or be outside your role/ownership scope. |
| Projects needs a database configuration update. | Report the message to the system maintainer. Repository deployment notes identify project_history as a required dependency. Do not rerun legacy setup scripts as an end-user workaround. |
| Movement storage is not configured. | Ask the system maintainer to verify the current authenticated movement installation; refresh after configuration is completed. |
| A tool is reserved by an approved request or pending transfer. | Open the owning request/transfer and coordinate with the eligible field user. Do not clear assignments manually. |
| Purchase setup / Monitoring setup is not installed. | Report the configuration message and module. A visible menu does not establish that its deployed database functions exist. |
| Photo or private receipt could not load/upload | Check permitted format/size, network, Storage access and popup permissions. Confirm the intended asset/purchase before retrying. |
| Unexpected Available / Unavailable display | Read both status and location availability; inspect reservations/holder and eligibility. The helper is not a complete issue-readiness check. |
| Counts differ from the number of rows | Dashboard/project totals sum quantities, zero-quantity records may be hidden, and inventory previews show only six rows. |
| No saved historical snapshots | Historical capture begins prospectively. Ask the maintainer to verify scheduler installation; use actual movement history without inferring past inventory. |


### 5.1 Frequently Asked Questions


### Can Admin confirm equipment receipt?

**Purpose:** Clarify the custody boundary.

**Access / prerequisites:** Admin.



**Expected result:** No. Only the named receiving Engineer/Architect has receiveTransfer and the inspection form. Admin monitors the saved receipt.

**Limits / errors:** A legacy backend error string mentioning Admin is not the current permission gateway.

Can Admin cancel a reservation or refused handover? No. The current cancellation migration restricts these actions to eligible accountable Engineer/Architect accounts. Admin approval/rejection/release remains supported.

Does a purchase change stock? No. Record the actual delivery in Material Requests > Receive Stock. Does a consumable Purchase Request need approval? No separate approval stage is implemented.

Does archiving a project return its equipment? No. Archiving changes project visibility/active state while retaining inventory and history.

Can I edit a historical transaction? No historical editor is provided. Use an authorized follow-up action, new request or future stock correction and preserve the original record.


## Chapter 6 — Administrator Best Practices

- Verify physical stock and tool condition before approving/releasing. A database record or printed tag does not prove a tool is ready or physically present.
- Keep role assignments narrow and review active access regularly. Select existing company people to preserve permanent accountability identities.
- Assign the actual receiving Engineer/Architect to an active project before direct transfer. Do not replace one person’s project assignment merely to imitate multi-person membership.
- Track pending/refused handovers through the original reference. Ask the named receiver to inspect every tool; do not claim that release or QR scanning completed custody.
- Use Repairs and Missing for resolution; keep damage descriptions factual. Acceptance/refusal records do not determine who caused damage.
- Reconcile consumable stock against History and purchase deliveries. Use correction with a reason for a verified physical-count discrepancy and avoid double-counting requests/ledger receipts.
- Check successful-save messages before retrying a form after network loss. A failed refresh may follow a committed transaction.
- Review weekly snapshots by actual capture time and follow up on overdue equipment. Treat scheduler and email deployment as maintainer prerequisites, not ordinary user operations.
- Protect private receipts, personnel details and passwords in exports/screenshots. Sign out fully from shared devices.


## Glossary

| Term | Meaning |
| --- | --- |
| Accountable profile | Permanent company person record linked to an Auth login. Custody and history remain attached to this identity. |
| Active account | Authorized profile whose account_status is active and whose Auth linkage is valid. |
| Asset record | One inventory record identified by an asset ID. It may represent one item or an entire bulk quantity. |
| Availability | Location/state-derived caption; separate from movement eligibility and equipment condition. |
| Custody / holder | The person recorded as accountable for the equipment. Pending dispatch does not change the holder. |
| Destination project | Existing project selected for a request, transfer, return or resolution. |
| Receiving QR | A short-lived receiver-and-project reference generated before dispatch; valid for 15 minutes and revocable. It never confirms receipt. |
| Handover code / QR | The transfer reference shared after dispatch, for example TRF-00705. It opens the saved transfer for inspection. |
| Equipment tag | An asset ID QR tag used to identify equipment. It does not grant custody or override named-recipient rules. |
| Reservation | Allocation of the whole selected asset record to an approved request or pending/refused transfer. |
| Inspection | Per-tool condition, notes when needed, testing confirmation for received non-missing items, and a custody decision for damaged items. |
| REQ / TRF / RTN / REP / MIS | Equipment request, transfer, return, repair and missing-report reference prefixes. Numbering comes from a shared sequence; gaps are normal. |
| CR / PUR | Consumable purchase request and record-only purchase ledger reference prefixes. These are different from equipment requests. |
| RPC | Database function called by the application. It validates the authenticated role, current state and ownership. |
| RLS | Row-level security: database rules restricting which records an authenticated account may read or change. |
| Snapshot | An observation of inventory saved at an actual capture time. It does not reconstruct earlier inventory. |
| Offline demonstration | Explicit browser-only workspace with sample identities and records, separate from live company data. |


## Evidence, validation and revision information

The companion system review contains the five-role permission matrix, module inventory, implementation gaps, source references and capture manifest. Source and screenshot hashes were checked against the completed artifacts. The captured states demonstrate role-correct rendering; they do not certify production deployment or execute all write procedures.

| Version | Date | Revision |
| --- | --- | --- |
| 1.1 | 27 October 2026 | Initial source-based Administrator manual; genuine isolated screenshots; deployment and hardware limits identified. |

Future revision: repeat source/permission review after any workflow, label, migration or role change. Replace the corresponding figures using dedicated staging accounts and approved records. Do not reuse production transactions merely to illustrate a procedure.

