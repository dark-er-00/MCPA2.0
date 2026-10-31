# SiteTrace (MCPA) standardized system flowcharts

Prepared 2026-10-21 from the repository and the copied [FlowchartFinal.pdf](reference/FlowchartFinal.pdf). The package contains **36 individual flowcharts, 331 diagram pages and 143 documented role-scoped action workflows**, plus two editable role atlases.

Scope follows the user correction: **Admin** and a combined **Engineer / Architect** set. Engineer and Architect have identical verified route/action permissions. The repository also defines Secretary and Tool Handler; those roles are intentionally excluded from these deliverables. Their names may still appear as actual Admin account-form options.

## Start here

- [Flowchart index and every editable / PNG / PDF download](Flowchart_Index.md) · [CSV](Flowchart_Index.csv)
- [Exact continuation and retry connector destinations](Connector_Index.md) · [CSV](Connector_Index.csv)
- [File inventory with byte lengths and SHA-256 hashes](File_Manifest.csv)

| Role set | Implemented routes / details | Supporting workflows | Main role flows | Individual diagrams | Actions | Pages | Editable complete atlas |
|---|---:|---:|---:|---:|---:|---:|---|
| Admin | 16 | 3 | 1 | 20 | 85 | 178 | [.drawio atlas](ADMIN/SiteTrace_ADMIN_Complete_Atlas.drawio) |
| Engineer / Architect | 12 | 3 | 1 | 16 | 58 | 153 | [.drawio atlas](ENGINEER_ARCHITECT/SiteTrace_ENGINEER_ARCHITECT_Complete_Atlas.drawio) |

Counts include separate tool-profile and site-detail routes. The supporting workflows are Authentication/session, Global Search and Notifications. Shared behavior is counted once per delivered role set; it is not a count of unique application features.

## Organization and conventions

Each role has a main Login → Dashboard → available-module flow, followed by a separate detailed file for every authorized route and supporting workflow. Each diagram folder contains editable native `.drawio` nodes and arrows, a multi-page PDF, an overview/contact-sheet PNG, individual full-resolution PNG and SVG pages, and `Evidence.md` source references.

The complete atlases contain the same editable pages in role order. They make cross-module continuation easier to follow in one file. Individual files remain independently editable; consult the connector index when a continuation points to another module.

Layout follows the reference: US Legal portrait (612 × 1008 PDF points), black shapes/arrows/text on white, top-to-bottom main flow and left-to-right decision/error branches. Symbols are ovals for Start/End, rectangles for processing, parallelograms for input/output, Yes/No diamonds, numbered circular on-page links and lettered pentagonal off-page links.

Generated module/action-selection menus are documentation maps of implemented controls and entry events. They do not introduce new application UI. An `END` or end-attempt node closes that documented branch; it does **not** assert transaction rollback. A source-confirmed save remains saved if its subsequent refresh fails. Stale-state and saved-but-unrefreshed branches require the stated refresh/reopen step before further mutation.

## Source evidence and verification limits

Behavior was checked against actual route permissions, module loaders, event handlers, gateways and SQL migration definitions. Per-diagram [evidence references](Flowchart_Index.md) distinguish role restrictions, confirmations, validation, retries and saved outcomes. Engineer/Architect is not given Admin-only Materials, Purchases, Reports or People routes merely because similarly named legacy files exist.

No live application session, Supabase database, production records or deployed authentication settings were accessed for this documentation. Website/source/database changes and production writes are outside this package. Deployment verification still needs the installed RPC/migration versions and policies, real Auth/profile links, email/SMTP capability flags, browser camera permissions and QR scanning/expiry behavior, and the monitoring scheduler / prospective historical snapshots. These are implemented source paths, not certified production test results.

Material Requests records actual receipts and stock changes; Purchases is a record-only ledger. Current inventory reports show present state; historical reports use existing prospective snapshots and never reconstruct unavailable past inventory.

## Validation evidence

- Model/geometry validation passed. [Structure.json](validation/Structure.json)
- Export/text-fit validation passed. [Export.json](validation/Export.json)
- Native artifact validation passed. [Native_Validation.json](validation/Native_Validation.json)
- Structure report: 36 diagrams, 331 pages, 3259 nodes, 548 Yes/No decisions, 329 off-page codes and 210 local numbered connector groups.
- Export report: 36 recorded exports; 0 unresolved text-fit violations. Generated-document rendering blocks outbound HTTP/HTTPS; application pages opened: 0; database calls: 0.
- Native validation parsed editable drawio XML, compared native node labels and edge endpoints, decoded 331 full-size page PNGs, natively rendered 331 PDF pages and checked Legal portrait geometry. All 1483 baseline tracked-file hashes remained unchanged.
- Contact sheets were visually reviewed separately after generation. This statement records that explicit review; it does not claim every page was manually reviewed at full reading size.
- No native drawio editor visual review is claimed. Native validation checks editable structure as XML; native editor font/rendering may vary.

[Coverage report](validation/Coverage.json) · [Complete model](validation/Model.json) · [Original-file baseline](validation/baseline.json) · [Native PDF review contact sheets](validation/PDF_Review)

[Static role / source / reference audit](validation/Scope_Audit.json) · [Reference study](reference/Reference_Study.md) · [Native PDF visual review](validation/Visual_Native_PDF_Review.md)

[Admin operational visual review](validation/Visual_Admin_Operational.md) · [Admin support visual review](validation/Visual_Admin_Support.md) · [Engineer/Architect visual review](validation/Visual_Engineer_Architect.md)

## Preserved originals and reference

This revised set lives only in `REFERENCE_STANDARDIZED/`. Earlier [activity workflow documents](../Activity_Workflow_Diagrams) and [Admin flowchart documents](../ADMIN_FLOWCHARTS) remain in their original directories. The explicit backup below preserves the pre-existing flowchart documentation; no original was replaced.

- [Original_Flowchart_Documentation_2026-10-21.zip](backups/Original_Flowchart_Documentation_2026-10-21.zip)
- [Copied primary reference PDF](reference/FlowchartFinal.pdf) · [Reference contact sheet](reference/Contact_Sheet.png)

The file manifest inventories the current package, including source scripts, per-page exports, reports, copied reference and backup. Its own CSV is excluded from hashing to avoid a self-referential digest. Rerun it after any artifact change.

## Regeneration

Run from the repository root using the existing local Node dependencies and Chrome installation. The scripts generate documentation only. `initialize.cjs` also reads the original PDF from its recorded Downloads path; the already copied reference is sufficient for later regeneration.

```powershell
node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/generate.cjs
node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/export.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/validate-native.ps1
node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/finalize.cjs
```

After separate contact-sheet inspection, rerun the last command with `--contact-sheets-reviewed` to record that completed review. Rebuild copied-reference previews only if needed with `source/study-reference.cjs`. Do not run application migrations or account/movement operations to regenerate this documentation.

Finalizer inputs are the current model and available validation JSON reports. Missing export/native reports are recorded as pending rather than assumed successful. The finalizer writes only this README, both indexes and the manifest.
