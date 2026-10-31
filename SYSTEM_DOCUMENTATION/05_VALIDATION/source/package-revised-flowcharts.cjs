// Build the revision index, source-review record and documentation-only hash manifest.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {out,root,write}=require('./build.cjs');
const {flows,revision}=JSON.parse(fs.readFileSync(path.join(out,'05_VALIDATION/Revised_Flowchart_Model.json')));
const validation=JSON.parse(fs.readFileSync(path.join(out,'05_VALIDATION/Flowchart_Revision_Validation.json'),'utf8').replace(/^\uFEFF/,''));
if(!validation.passed)throw Error('Validate exports before packaging.');
const folder='02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams';
const links=(f,ext)=>`[${ext.toUpperCase()}](${f.stem}.${ext})`;
const rows=flows.map(f=>`| ${f.title} | ${f.pages.length} | ${links(f,'drawio')} | ${links(f,'pdf')} | ${f.pages.map(p=>`[P${p.number}](${p.id}.png)`).join(' · ')} |`).join('\n');
const originalMap=[
 ['01_Authentication','01 login; 12 recovery/setup; 14 offline demo'],
 ['02_Equipment_Registration','02 registration, verified Office and optional photo'],
 ['03_Request_Approval_Release','03 request/approval/rejection; 04 release/assignment'],
 ['04_QR_Transfer_Receiving','05 QR/manual transfer creation; 06 receipt/inspection'],
 ['05_Office_Return','07 Office return and receiving'],
 ['06_Repair','08 field report, Admin start and completion'],
 ['07_Missing_Recovery','09 report, Good/Damaged recovery and closure'],
 ['08_Consumables_Procurement','10 procurement/receipts; 11 page 4 cancellation; 13 purchase ledger']
 ];
write(folder+'/Revised_Flowcharts_Index.md',`# SiteTrace / MCPA — revised flowcharts

Source review: **20 October 2026**, repository **${revision}**. This revision supplies **14 workflows, 37 printable pages, 14 editable draw.io files, 37 PNGs and 14 PDFs**. These are documentation revisions; they do not change system behavior.

## Open the revised diagrams

Every PDF contains all pages of its workflow. PNGs are separate per page at **2250 × 3270 pixels**. The draw.io files contain editable shapes, labels and connectors on named pages. The matching SVG and print HTML files are supporting documentation assets.

| Revised workflow | Pages | Editable | Print PDF | PNG pages |
| --- | ---: | --- | --- | --- |
${rows}

## Original coverage

All eight original workflow sets remain byte-for-byte unchanged. Use the clearly named _Revised files above for the corrected notation and execution sequence. The new split separates approval, release, transfer creation and receipt so their distinct state changes are visible.

| Preserved original | Revised coverage |
| --- | --- |
${originalMap.map(([stem,coverage])=>`| [${stem}](${stem}.drawio) | ${coverage} |`).join('\n')}

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
`);
const evidence=[
 ['01','js/auth.js','72–106, 136–155','Sign-in clears password on success; session restore calls mcpa_my_profile and requires active supported role. Secretary enters consumables; other supported roles enter dashboard. Callback setup takes precedence over ordinary restoration.'],
 ['02','1-admin/modules/masterlist/masterlist.js','620–670','Active Admin, stable asset identity, inventoryOffice before photo preparation, then explicit AVAILABLE / Office insert. Verify returned IDs. Saved insert and failed inventory refresh are distinct outcomes.'],
 ['02','js/equipment-photos.js','8–43','Admin identity, MIME/signature and 1-byte–5-MiB checks; private immutable upload with upsert false; staged retry reuse.'],
 ['02,07','js/equipment-tracking.js','23–30','inventoryOffice reads the configured destination RPC and fails on missing/invalid Office.'],
 ['03–09','supabase/migrations/202610060002_recipient_identity.sql','28–253, 260 onward','Atomic lifecycle engine: positive whole-record quantities, locks, Pending versus Approved reservations, release without custody change, inspection outcomes, return/report/repair/recovery states. Authenticated outer wrapper requires the named field receiver for receipt.'],
 ['03,05','supabase/migrations/202610100001_engineer_portal.sql','mcpa_create_receiving_token; mcpa_resolve_receiving_token; movement wrapper','Own active site assignment; active named field receiver; short-lived hashed token; manual receiver path remains supported; token resolution itself changes no custody.'],
 ['03','supabase/migrations/202610120003_optional_request_purpose.sql','createRequest validation wrapper','Equipment request purpose is optional (maximum 2,000 characters); no obsolete required-purpose rule was carried into the revision.'],
 ['03–11','js/movement-cloud.js','49–78, 126–151','Stable operation UUID per submitted action/values; backend permission and validation authority. Successful save plus refresh failure marks state stale and blocks further mutations until reload.'],
 ['03–11','js/permissions.js','action role definitions','Admin approve/reject/release/resolve cases; field request/transfer/receipt/return/report; Handler dispatch scope; no Handler named receipt.'],
 ['07','supabase/migrations/202610120002_office_returns.sql','createReturn wrapper and destination helper','Pinned active unique Office, forged destination rejection, saved operation destination reuse. Good and physically returned Damaged items clear personal holder; Missing retains source holder/site. No separate Admin return acceptance.'],
 ['10,11','1-admin/modules/consumables/setup.sql','117–181','Pending/partial uniqueness, request does not change stock, receipt validates outstanding quantity and increments stock with receipt history. Cancellation preserves already received stock.'],
 ['10,11','supabase/migrations/202610040001_authenticated_access.sql','238–258','Authenticated wrappers enforce Admin/Secretary consumables authority and trusted actor name; prototype anon grants in the older base setup are not the final authority.'],
 ['11','supabase/migrations/202610100004_movement_cancellation.sql','63–87, 104–233, 274 onward','Server allowedActions and original field ownership. Required reason and confirmation; damage refusal needs complete inspections and at least one Damaged/declined item. Entire transfer Refused with custody/status/reservations unchanged; original sender may reopen.'],
 ['12','js/auth.js','11–53, 96–114, 138–155','Recovery/invite session guards, single new-password field with HTML minlength 12, updateUser then sign-out and login confirmation. Invalid email uses field validity; reset response is generic. No invented confirmation-password field.'],
 ['13','supabase/migrations/202610100005_purchase_ledger.sql','52–96','Admin/Secretary ledger save, 1–100 lines, three-decimal quantities and two-decimal unit prices, computed totals, optional request/private receipt, version and idempotency checks. Ledger does not receive stock.'],
 ['14','js/auth.js','115–129','Explicit Admin/Engineer/Architect demo identities; browser-only mode with production-only routes blocked.'],
 ['14','js/movement-cloud.js','25–54, 95–106','Demo uses local MovementDemoStore; switching between company and demo workspaces is explicitly isolated.']
 ];
write('05_VALIDATION/Flowchart_Revision_Source_Review.md',`# Revised flowcharts — source review

Reviewed 20 October 2026 against repository ${revision}. All source and SQL inspection was read-only. This records implemented definitions, not proof of live production installation.

The eight existing workflow sets were all reviewed and retained. The revised set separates combined workflows, resolves incomplete error branches, replaces action-shaped terminators, applies real labeled decisions, and adds meaningful paired continuations. It also documents related source-defined recovery, cancellation, ledger and demo paths.

| Workflow | Source | Location / anchor | Verified behavior |
| --- | --- | --- | --- |
${evidence.map(([n,file,anchor,note])=>`| ${n} | [${file}](../../${file}) | ${anchor} | ${note} |`).join('\n')}

## Interpretation boundaries

- “Field” means Engineer or Architect unless Tool Handler is explicitly named. “Missing” is the displayed inspection condition; the SQL payload uses 'lost' for that classification.
- Validation diamonds summarize related input, identity, lock and current-state checks from the cited code. Later commit checks still capture transaction failures and concurrent changes.
- Multi-item classification is expanded for clarity but remains within one atomic receipt/return action. Damage cases and missing cases are not separately committed by visiting a different diagram page.
- Receiving a transfer is restricted to its named active field receiver. Older private-engine wording mentioning Admin is superseded by the authenticated wrapper in the same migration.
- Off-page references remain inside their named workflow/PDF. Cross-workflow relationships (for example, release awaiting receipt or repair following damaged recovery) are described as state handoffs, rather than unmatched off-page symbols.
- SQL definitions include optional capabilities. Cancellation availability, configured Office, Storage buckets/policies and deployed migration order need installation verification; no production session or database was used here.

## Visual and export review

All 37 native PDF page renders were inspected on five contact sheets. Header/page references, shape meaning, branch labels, text fit and continuation placement were checked. The source model and automated validators additionally check every node, edge and continuation pair. Native draw.io application interaction was not used; editable uncompressed XML, page IDs, labels, geometry and edge endpoints were validated directly.

See [Flowchart_Revision_Validation.json](Flowchart_Revision_Validation.json) for export checks and [Revised_Flowcharts_Index.md](../02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams/Revised_Flowcharts_Index.md) for the complete deliverable list.
`);
// Only untracked additions inside the documentation directory belong to this revision.
const status=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const paths=status.map(s=>{if(!s.startsWith('?? SYSTEM_DOCUMENTATION/'))throw Error('Expected only new documentation files: '+s);return s.slice(3);});
const manifestPath='SYSTEM_DOCUMENTATION/05_VALIDATION/Flowchart_Revision_Manifest.json';
const files=paths.filter(file=>file!==manifestPath).sort().map(file=>{const bytes=fs.readFileSync(path.join(root,file));return {file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
write('05_VALIDATION/Flowchart_Revision_Manifest.json',JSON.stringify({date:'2026-10-20',revision,scope:'Only new documentation additions. Manifest excludes its own hash.',workflows:14,pages:37,files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)},null,2));
console.log('Packaged index, source review and hashes for '+files.length+' new documentation files.');
