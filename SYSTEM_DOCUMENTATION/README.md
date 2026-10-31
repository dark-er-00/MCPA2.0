# SiteTrace / MCPA system documentation

Prepared **20 October 2026 (Asia/Manila)** from repository revision **a5d51b3**. All files are new and confined to this SYSTEM_DOCUMENTATION folder.

## Main deliverables

| Deliverable | Files / result |
| --- | --- |
| Feature inventory | [XLSX](01_FEATURE_INVENTORY/SiteTrace_Feature_Inventory.xlsx): **83 rows**, all 11 requested columns; five worksheets for features, roles, guidance, evidence and module counts. |
| Technical documentation | [DOCX](03_TECHNICAL_DOCUMENTATION/SiteTrace_Technical_Documentation.docx) · [PDF](03_TECHNICAL_DOCUMENTATION/SiteTrace_Technical_Documentation.pdf): **19 technical sections / 29 PDF pages**; editable Markdown and print HTML included. |
| Troubleshooting | [DOCX](04_TROUBLESHOOTING/SiteTrace_Troubleshooting_Guide.docx) · [PDF](04_TROUBLESHOOTING/SiteTrace_Troubleshooting_Guide.pdf): **28 issue cases / 19 PDF pages** with confirmed behavior, causes, recommendations, expected results and escalation; editable Markdown/HTML included. |
| Diagrams | **14 sets**, each with editable .drawio and .svg, PNG, single-page PDF and local print HTML. Listed below. |
| Schema and evidence | [Schema catalog](03_TECHNICAL_DOCUMENTATION/Schema_Catalog.md); [source evidence register](05_VALIDATION/Source_Evidence_Register.md); machine-readable static index and exact table extracts. |
| Review and QA | [Review checklist](05_VALIDATION/Documentation_Review_Checklist.md); [format/integrity results](05_VALIDATION/Validation_Report.json); [content results](05_VALIDATION/Content_Validation.json). |
| Complete file list | [Documentation_File_Manifest.md](Documentation_File_Manifest.md), including supporting sources and local PDF preview images. |

## System analyzed

Plain HTML/CSS/JavaScript construction equipment and consumable accountability application, backed by Supabase Auth/PostgreSQL/RLS/RPC/Storage, an account-management Edge Function and prospective monitoring. Five supported authenticated roles: Admin, Engineer, Architect, Secretary and Tool Handler. Engineer/Architect share permissions. Equipment approval reserves records; dispatch creates a handover; named-recipient inspected receipt changes custody. Returns use configured Office and condition-specific outcomes. Purchase ledger and consumable stock receipt are separate workflows.

## Diagram index

| Diagram | Editable source | PNG | PDF |
| --- | --- | --- | --- |
| Use case diagram — effective application permissions | [draw.io](02_SYSTEM_DIAGRAMS/Use_Case_Diagram/Use_Case.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Use_Case_Diagram/Use_Case.svg) | [PNG](02_SYSTEM_DIAGRAMS/Use_Case_Diagram/Use_Case.png) | [PDF](02_SYSTEM_DIAGRAMS/Use_Case_Diagram/Use_Case.pdf) |
| Authentication and company-profile verification | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/01_Authentication.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/01_Authentication.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/01_Authentication.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/01_Authentication.pdf) |
| Equipment registration and Office default | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/02_Equipment_Registration.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/02_Equipment_Registration.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/02_Equipment_Registration.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/02_Equipment_Registration.pdf) |
| Equipment request, approval and release | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/03_Request_Approval_Release.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/03_Request_Approval_Release.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/03_Request_Approval_Release.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/03_Request_Approval_Release.pdf) |
| QR transfer and named-receiver confirmation | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/04_QR_Transfer_Receiving.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/04_QR_Transfer_Receiving.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/04_QR_Transfer_Receiving.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/04_QR_Transfer_Receiving.pdf) |
| Office return and inspected receiving | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/05_Office_Return.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/05_Office_Return.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/05_Office_Return.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/05_Office_Return.pdf) |
| Repair reporting and Admin resolution | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/06_Repair.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/06_Repair.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/06_Repair.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/06_Repair.pdf) |
| Missing reporting and recovery | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/07_Missing_Recovery.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/07_Missing_Recovery.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/07_Missing_Recovery.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/07_Missing_Recovery.pdf) |
| Consumable requests, stock receipts and ledger | [draw.io](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/08_Consumables_Procurement.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/08_Consumables_Procurement.svg) | [PNG](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/08_Consumables_Procurement.png) | [PDF](02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/08_Consumables_Procurement.pdf) |
| System architecture and data movement | [draw.io](02_SYSTEM_DIAGRAMS/System_Architecture_Diagram/System_Architecture.drawio) / [SVG](02_SYSTEM_DIAGRAMS/System_Architecture_Diagram/System_Architecture.svg) | [PNG](02_SYSTEM_DIAGRAMS/System_Architecture_Diagram/System_Architecture.png) | [PDF](02_SYSTEM_DIAGRAMS/System_Architecture_Diagram/System_Architecture.pdf) |
| ERD 1 / 4 — identity, projects and equipment | [draw.io](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_01_Core.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_01_Core.svg) | [PNG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_01_Core.png) | [PDF](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_01_Core.pdf) |
| ERD 2 / 4 — movements, allocation and interruption audit | [draw.io](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_02_Movements.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_02_Movements.svg) | [PNG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_02_Movements.png) | [PDF](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_02_Movements.pdf) |
| ERD 3 / 4 — consumable stock and procurement | [draw.io](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_03_Materials.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_03_Materials.svg) | [PNG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_03_Materials.png) | [PDF](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_03_Materials.pdf) |
| ERD 4 / 4 — account jobs, notifications and receiving context | [draw.io](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_04_Support.drawio) / [SVG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_04_Support.svg) | [PNG](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_04_Support.png) | [PDF](02_SYSTEM_DIAGRAMS/Entity_Relationship_Diagram/ERD_04_Support.pdf) |

## Successfully verified

- Current source modules, five-role route/action mapping, operational validations, RPC/RLS responsibilities, Storage/account service and code-defined dependency boundaries. The workbook cites evidence per feature; Source_Evidence_Register.md records function/RPC locations.
- Twenty-one distinct explicit application CREATE TABLE definitions, plus two referenced core entities with incomplete base DDL: **23 documented application entities**. ERDs use declared FK evidence and mark unverified equipment site/holder constraints as dashed semantic links.
- Three genuine OOXML packages: both DOCX and the XLSX have all XML parts parsed and internal relationships resolved. The workbook contains 83 complete 11-column data rows, five worksheets and frozen panes/filtering.
- Fourteen editable diagram graphs and SVGs parsed, every required PNG decoded, and **all 16 PDFs opened with the native Windows PDF reader**. All diagram PDFs are one A3 page; document PDFs are 29 and 19 A4 pages. Representative actual PDF page previews were visually reviewed.
- Documentation renderer opened local documentation only, with outbound HTTP(S) blocked and a fresh browser profile. It did not serve/open the application, call production APIs or reuse user sessions.
- SHA-256 checks confirmed **all 1,098 pre-existing tracked files unchanged**. Git changes are limited to SYSTEM_DOCUMENTATION/.

## NEEDS VERIFICATION

- Full current production schema, especially original profiles/equipment DDL, actual equipment PK/FKs/unique/defaults/nullability/status enum, effective grants/policies/owners and complete installed wrapper/delegate chain.
- Actual deployed frontend version/Pages settings, current Office singleton/registration default, optional cancellation support and inventoryAvailabilityVersion enrichment. Two current files share migration prefix 202610120003; review installed/manual history before any release decision.
- Live Auth/email/redirect, private Storage upload/signing, Realtime/publication and trusted external scheduler status; actual historical capture availability; physical device camera/QR/printing behavior.
- Authenticated live interface/screenshots: unavailable for this review. A web-tool read of the candidate https://waquinn.github.io/MCPA/ address inferred from the remote was inaccessible; this is not proof of downtime. No live screenshot or record was collected.
- Native Word/Excel editor visual rendering: packages were structurally checked; matching document PDFs were actually rendered. DOCX pagination may differ by editor.
- Project Manager/Lead Developer and QA Lead approval: no approval evidence exists. Checklist fields are intentionally unsigned. Historical QA reports were reviewed, not rerun or represented as fresh live results.

## Source files used

Primary evidence: index.html; 2-engr/index.html; js/permissions.js, auth.js, data.js, movement-store.js, movement-cloud.js, movement-ui.js, movement-overview.js, equipment-tracking.js, equipment-photos.js, project-scope.js, dashboard-view.js, global-search.js, monitoring.js and pdf-reports.js; current module handlers in 1-admin/modules/ and 2-engr/modules/; Sites/Movements/Consumables setup SQL; all available supabase/migrations; supabase/config.toml and functions/manage-accounts; vendor/pdf/manifest.json; current release and QA reports. Detailed lines/index are in 05_VALIDATION/Source_Evidence_Register.md and Repository_Index.json.

## Format/dependency status

**No requested output format is missing.** No package was installed. Generation used locally available Node.js, Chrome, .NET XML/ZIP/image readers and Windows.Data.Pdf, plus the existing local DevTools socket helper. The supporting generation source is included under 05_VALIDATION/source/. The drawings are editable in a compatible draw.io editor; SVG is an additional vector source.

## Documentation-only guarantee

No existing HTML/CSS/JS/SQL/migration/function/configuration/application file was modified. No Supabase database, Auth record, Storage object, QR token or notification read state was accessed or changed. No seed/repair/migration/application test suite, deployment, push or publication was executed. Only the public candidate Pages web read was attempted; it returned no accessible content. Existing tracked-file hashes and Git scope checks confirm repository preservation.

## Regeneration of documentation

Run from the repository root with the existing local tools. These commands target documentation outputs only; they do not authorize any application/database action. inspect.cjs preserves the first baseline rather than overwriting it. If reviewing a future revision, preserve the historical baseline and deliberately establish a separately named new review rather than obscuring the previous evidence.

1. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/inspect.cjs
2. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/catalog.cjs
3. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/diagrams.cjs
4. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/render.cjs --diagrams
5. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/build.cjs
6. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/render.cjs --documents
7. Run validate.ps1 with DocumentationScriptRoot set to its source directory (or invoke its script block if script policy requires).
8. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/finalize.cjs

The local PDF previews are documentation-render evidence, not application screenshots. Generated files are complete; remaining production and team validation is explicitly pending.
