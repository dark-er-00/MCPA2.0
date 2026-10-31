# SiteTrace / MCPA — revised flowcharts

Source review: **20 October 2026**, repository **071ae16**. This revision supplies **14 workflows, 37 printable pages, 14 editable draw.io files, 37 PNGs and 14 PDFs**. These are documentation revisions; they do not change system behavior.

## Open the revised diagrams

Every PDF contains all pages of its workflow. PNGs are separate per page at **2250 × 3270 pixels**. The draw.io files contain editable shapes, labels and connectors on named pages. The matching SVG and print HTML files are supporting documentation assets.

| Revised workflow | Pages | Editable | Print PDF | PNG pages |
| --- | ---: | --- | --- | --- |
| User authentication and login | 2 | [DRAWIO](01_Authentication_Revised.drawio) | [PDF](01_Authentication_Revised.pdf) | [P1](01_Authentication_Revised_P01.png) · [P2](01_Authentication_Revised_P02.png) |
| Equipment registration | 3 | [DRAWIO](02_Equipment_Registration_Revised.drawio) | [PDF](02_Equipment_Registration_Revised.pdf) | [P1](02_Equipment_Registration_Revised_P01.png) · [P2](02_Equipment_Registration_Revised_P02.png) · [P3](02_Equipment_Registration_Revised_P03.png) |
| Equipment request and approval | 3 | [DRAWIO](03_Equipment_Request_Approval_Revised.drawio) | [PDF](03_Equipment_Request_Approval_Revised.pdf) | [P1](03_Equipment_Request_Approval_Revised_P01.png) · [P2](03_Equipment_Request_Approval_Revised_P02.png) · [P3](03_Equipment_Request_Approval_Revised_P03.png) |
| Equipment release and assignment | 2 | [DRAWIO](04_Equipment_Release_Assignment_Revised.drawio) | [PDF](04_Equipment_Release_Assignment_Revised.pdf) | [P1](04_Equipment_Release_Assignment_Revised_P01.png) · [P2](04_Equipment_Release_Assignment_Revised_P02.png) |
| QR-based equipment transfer | 2 | [DRAWIO](05_QR_Equipment_Transfer_Revised.drawio) | [PDF](05_QR_Equipment_Transfer_Revised.pdf) | [P1](05_QR_Equipment_Transfer_Revised_P01.png) · [P2](05_QR_Equipment_Transfer_Revised_P02.png) |
| Transfer receipt and confirmation | 4 | [DRAWIO](06_Transfer_Receipt_Revised.drawio) | [PDF](06_Transfer_Receipt_Revised.pdf) | [P1](06_Transfer_Receipt_Revised_P01.png) · [P2](06_Transfer_Receipt_Revised_P02.png) · [P3](06_Transfer_Receipt_Revised_P03.png) · [P4](06_Transfer_Receipt_Revised_P04.png) |
| Equipment return and Office receiving | 4 | [DRAWIO](07_Office_Return_Receiving_Revised.drawio) | [PDF](07_Office_Return_Receiving_Revised.pdf) | [P1](07_Office_Return_Receiving_Revised_P01.png) · [P2](07_Office_Return_Receiving_Revised_P02.png) · [P3](07_Office_Return_Receiving_Revised_P03.png) · [P4](07_Office_Return_Receiving_Revised_P04.png) |
| Equipment repair | 3 | [DRAWIO](08_Equipment_Repair_Revised.drawio) | [PDF](08_Equipment_Repair_Revised.pdf) | [P1](08_Equipment_Repair_Revised_P01.png) · [P2](08_Equipment_Repair_Revised_P02.png) · [P3](08_Equipment_Repair_Revised_P03.png) |
| Missing equipment and recovery | 3 | [DRAWIO](09_Missing_Recovery_Revised.drawio) | [PDF](09_Missing_Recovery_Revised.pdf) | [P1](09_Missing_Recovery_Revised_P01.png) · [P2](09_Missing_Recovery_Revised_P02.png) · [P3](09_Missing_Recovery_Revised_P03.png) |
| Consumables procurement and receipt | 3 | [DRAWIO](10_Consumables_Procurement_Revised.drawio) | [PDF](10_Consumables_Procurement_Revised.pdf) | [P1](10_Consumables_Procurement_Revised_P01.png) · [P2](10_Consumables_Procurement_Revised_P02.png) · [P3](10_Consumables_Procurement_Revised_P03.png) |
| Controlled cancellation and refusal | 4 | [DRAWIO](11_Cancellation_Refusal_Revised.drawio) | [PDF](11_Cancellation_Refusal_Revised.pdf) | [P1](11_Cancellation_Refusal_Revised_P01.png) · [P2](11_Cancellation_Refusal_Revised_P02.png) · [P3](11_Cancellation_Refusal_Revised_P03.png) · [P4](11_Cancellation_Refusal_Revised_P04.png) |
| Password recovery and account setup | 2 | [DRAWIO](12_Password_Recovery_Setup_Revised.drawio) | [PDF](12_Password_Recovery_Setup_Revised.pdf) | [P1](12_Password_Recovery_Setup_Revised_P01.png) · [P2](12_Password_Recovery_Setup_Revised_P02.png) |
| Purchase ledger | 1 | [DRAWIO](13_Purchase_Ledger_Revised.drawio) | [PDF](13_Purchase_Ledger_Revised.pdf) | [P1](13_Purchase_Ledger_Revised_P01.png) |
| Offline demonstration | 1 | [DRAWIO](14_Offline_Demo_Revised.drawio) | [PDF](14_Offline_Demo_Revised.pdf) | [P1](14_Offline_Demo_Revised_P01.png) |

## Original coverage

All eight original workflow sets remain byte-for-byte unchanged. Use the clearly named _Revised files above for the corrected notation and execution sequence. The new split separates approval, release, transfer creation and receipt so their distinct state changes are visible.

| Preserved original | Revised coverage |
| --- | --- |
| [01_Authentication](01_Authentication.drawio) | 01 login; 12 recovery/setup; 14 offline demo |
| [02_Equipment_Registration](02_Equipment_Registration.drawio) | 02 registration, verified Office and optional photo |
| [03_Request_Approval_Release](03_Request_Approval_Release.drawio) | 03 request/approval/rejection; 04 release/assignment |
| [04_QR_Transfer_Receiving](04_QR_Transfer_Receiving.drawio) | 05 QR/manual transfer creation; 06 receipt/inspection |
| [05_Office_Return](05_Office_Return.drawio) | 07 Office return and receiving |
| [06_Repair](06_Repair.drawio) | 08 field report, Admin start and completion |
| [07_Missing_Recovery](07_Missing_Recovery.drawio) | 09 report, Good/Damaged recovery and closure |
| [08_Consumables_Procurement](08_Consumables_Procurement.drawio) | 10 procurement/receipts; 11 page 4 cancellation; 13 purchase ledger |

Workflow 11 also documents the source-defined optional field cancellation/refusal/reopen controls. Its fourth page has an independent Start for Admin/Secretary consumables cancellation. Workflow 14 is an independent browser-only demo; it is not production authentication.

## Symbol and connector rules

| Symbol | Meaning in these diagrams |
| --- | --- |
| Oval | Start or End of the depicted attempt/process |
| Rectangle | System query, validation, calculation or state change |
| Parallelogram | User entry, inspection, selected action or displayed information |
| Diamond | A question with exactly two labeled Yes/No exits |
| Arrow | Horizontal or vertical direction, with a visible arrowhead and attached destination |
| Small circle | Paired same-page continuation; follow the matching letter on this page |
| Pentagon | Paired cross-page continuation; follow its letter and explicit page number in this workflow |

Main paths run down; branches run right and then down. Circle pairs avoid long backward return lines. Letters are scoped to the workflow and connector type; circle letters are additionally scoped to their page. An outward connector is an exit, and its matching inward connector resumes the same path. Every pair is reachable and resolves to an actual continuation.

Examples: authentication A retries credential entry; registration B skips optional photo work; receipt/return D loops to classify the next item. Receipt/return C brings completed Good/Damaged classification back from page 3 to the loop on page 2. Consumables B returns from page 3 to page 2 for a later partial delivery, then circle D resumes quantity entry.

An error End closes the current attempt; users can correct the issue and make another attempt. It does not imply that their account is signed out. State transitions expanded across transaction pages are part of a **single atomic backend action**, not separate page-by-page commits. A failed transaction rolls back all its item changes. A refresh failure after commit leaves the saved operation intact.

## Verification

- **70 decisions:** meaningful questions; exactly two labeled branches, each reaching a valid continuation or End.
- **337 arrows:** attached endpoints, orthogonal forward segments, no crossing lines or lines through unrelated symbols.
- **11 on-page pairs and 25 off-page pairs:** matching letters, matching destinations, no orphan connectors.
- **377 nodes:** all reachable from a Start and able to reach an End, including inspection and delivery loops.
- **All 37 pages:** browser text bounds checked against actual symbol geometry; native PDF renders visually reviewed using five contact sheets.
- **All outputs:** draw.io XML parsed and checked against the model; every PNG decoded; every PDF opened and all pages rendered by Windows.Data.Pdf; portrait A4 paper verified.
- **All 1,273 pre-existing tracked files:** SHA-256 hashes match the pre-task baseline. Original workflows, Use Case diagrams, ERDs, Architecture diagrams, application files and SQL remain unchanged.

See the [validation report](../../05_VALIDATION/Flowchart_Revision_Validation.json), [source-review record](../../05_VALIDATION/Flowchart_Revision_Source_Review.md), [structural checks](../../05_VALIDATION/Revised_Flowchart_Structure.json), [render checks](../../05_VALIDATION/Revised_Flowchart_Render.json) and [artifact hashes](../../05_VALIDATION/Flowchart_Revision_Manifest.json). [Contact sheets](../../05_VALIDATION/Revised_PDF_Previews/) show the actual PDF renders, including all 37 pages.

Verification boundary: workflows were checked against repository source and SQL definitions **read-only**. Current production migration installation and live behavior were not accessed. Cancellation, Office configuration and private Storage availability depend on the deployed installation.

## Rebuild documentation only

From the repository root, run these commands in order; stop if any command fails:

1. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/revise-flowcharts.cjs
2. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/render-revised-flowcharts.cjs
3. powershell -NoProfile -ExecutionPolicy Bypass -File SYSTEM_DOCUMENTATION/05_VALIDATION/source/validate-revised-flowcharts.ps1
4. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/review-revised-flowcharts.cjs
5. node SYSTEM_DOCUMENTATION/05_VALIDATION/source/package-revised-flowcharts.cjs

Rendering uses the installed Chrome, a fresh temporary profile and local documentation files with outbound HTTP(S) blocked. Native PDF validation uses Windows. Contact-sheet generation uses the already installed @napi-rs/canvas in the test dependencies. No application tests, migrations, live writes, commits or deployments are performed by this documentation workflow. The baseline records this revision's starting files; future intentional repository changes require a new, explicitly scoped documentation baseline.
