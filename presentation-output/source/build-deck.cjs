const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {createCanvas,loadImage}=require('../../tests/node_modules/@napi-rs/canvas');
const out=path.resolve(__dirname,'..'),root=path.resolve(out,'..');
const C={navy:'142235',charcoal:'242B33',white:'FFFFFF',gray:'F3F5F7',gold:'C4A15A',muted:'66717D',line:'D8DEE5',darkline:'3A495C'};
const slides=[];
function rect(s,x,y,w,h,fill,stroke=null,radius=false){s.shapes.push({type:radius?'roundrect':'rect',x,y,w,h,fill,stroke});}
function text(s,content,x,y,w,h,size=18,color=C.charcoal,bold=false,extra={}){s.shapes.push({type:'text',text:content,x,y,w,h,size,color,bold,...extra});}
function line(s,x,y,x2,y2,color=C.line,width=1,arrow=false){s.shapes.push({type:'line',x,y,x2,y2,color,width,arrow});}
function img(s,file,x,y,w,h){s.shapes.push({type:'image',file:path.join(out,'evidence',file+'.png'),x,y,w,h});}
function tag(s,label,x,y,w,dark=false){rect(s,x,y,w,22,dark?C.darkline:C.gray);text(s,label,x+8,y+4,w-16,15,10.5,dark?C.white:C.muted,true);}
function slide(title,section,keyMessage,dark=false){
 const s={title,section,keyMessage,bg:dark?C.navy:C.white,shapes:[],notes:'',screens:[]};slides.push(s);
 text(s,section.toUpperCase(),46,25,800,17,10.5,C.gold,true,{tracking:1.5});
 text(s,title,46,55,868,72,30,dark?C.white:C.navy,true,{name:'Slide title'});
 line(s,46,509,914,509,dark?C.darkline:C.line,0.7);
 text(s,'MCPA / SITETRACE',46,518,185,14,9.5,dark?'C4CDD7':C.muted,true);
 text(s,'Code + isolated application evidence · 24 October 2026',270,518,555,14,9.5,dark?'C4CDD7':C.muted,false,{align:'right'});
 text(s,String(slides.length).padStart(2,'0'),867,516,47,17,11,dark?C.gold:C.navy,true,{align:'right'});
 return s;
}
function provenance(s,x=46,y=482,w=868){text(s,'ACTUAL APPLICATION · LOCAL TEST ENVIRONMENT · SYNTHETIC DATA',x,y,w,16,9.5,C.muted,true);}
function point(s,label,detail,x,y,w=250){text(s,label,x,y,w,24,16.5,C.navy,true);text(s,detail,x,y+28,w,42,14.5,C.muted);}
async function crop(name,source,x,y,w,h){const im=await loadImage(path.join(out,'evidence',source+'.png'));const canvas=createCanvas(w,h);canvas.getContext('2d').drawImage(im,x,y,w,h,0,0,w,h);fs.writeFileSync(path.join(out,'evidence',name+'.png'),canvas.toBuffer('image/png'));return {name,source,x,y,w,h};}
async function build(){
const crops=[];
crops.push(await crop('dashboard-focus','dashboard',0,0,1491,780));
crops.push(await crop('equipment-focus','equipment-list',0,0,1491,810));
crops.push(await crop('custody-focus','received-detail',0,0,1140,480));
crops.push(await crop('project-progress-focus','project-editor',18,919,1410,351));
crops.push(await crop('consumables-focus','consumables',0,0,1491,800));
crops.push(await crop('report-focus','reports',0,0,1491,470));
crops.push(await crop('inspection-focus','inspection-confirm',36,314,1070,548));
crops.push(await crop('release-focus','release',12,0,1430,935));
crops.push(await crop('request-focus','request-form',0,0,740,1170));
fs.writeFileSync(path.join(out,'evidence','crop-manifest.json'),JSON.stringify(crops,null,2));

// 01 — Identity. Wordmark and all structural graphics remain editable.
let s=slide('MCPA / SiteTrace','System presentation','Centralized equipment, project and inventory operations.',true);
s.shapes=s.shapes.filter(x=>x.name!=='Slide title');
text(s,'MCPA /\nSiteTrace',46,95,650,150,58,C.white,true);
rect(s,46,269,64,4,C.gold);
text(s,'Construction Equipment Accountability\nand Inventory Management System',46,295,810,68,26,C.white);
text(s,'A centralized platform supporting organized equipment,\nproject, and inventory operations.',46,387,800,50,19,'C4CDD7');
['Equipment','Movement','Projects','Consumables'].forEach((t,i)=>{text(s,t,46+i*218,461,200,20,13.5,i===1?C.gold:C.white,i===1);});
img(s,'favicon-actual',812,89,102,102);
s.notes=`Introduce MCPA / SiteTrace as the existing construction equipment accountability and inventory application reviewed in this repository. The audience includes management, system evaluators, administrators and field personnel. The central operational question is which equipment exists, where it is assigned, who holds it and which recorded action moved it.

The implemented architecture is a plain HTML, CSS and JavaScript frontend with Supabase Auth, PostgreSQL functions, row-level policies and optional private Storage. Both portals use shared movement code. This presentation draws on source inspection, fresh isolated database tests and genuine running-application captures. It does not certify a live production installation. All application values and names shown later come from disposable local test records, with Auth and Storage transport modeled by the repository harness. External HTTPS was blocked. No production account, inventory or transaction was used.

Use the four editable labels at the bottom to frame the system. Spend the greatest attention on Movement. The top-right MCPA mark is the actual repository favicon (images/favicon.svg), rasterized unchanged for PowerPoint compatibility. The system title is editable text; no invented logo or construction photograph is used.

Evidence: index.html; 1-admin/index.html; 2-engr/index.html; js/auth.js; js/movement-cloud.js; supabase/migrations/202610040001_authenticated_access.sql. PRODUCT.md and the old movement README contain historical prototype statements, so current executable code takes priority.`;
s.screens=[];

// 02 — Five evidence-backed problem/capability/value mappings.
s=slide('The Challenge of Equipment Accountability','Operational need','Structured records connect operational questions to recorded actions.');
const cols=[46,336,665];
['OPERATIONAL CHALLENGE','IMPLEMENTED CAPABILITY','SUPPORTED VALUE'].forEach((t,i)=>text(s,t,cols[i],139,i===1?300:249,20,11,C.muted,true));
const rows=[
 ['Fragmented equipment records','Shared equipment inventory','One reference for asset information'],
 ['Unclear responsibility','Named holder + inspected receipt','Visible recorded custody'],
 ['Hard-to-trace movements','Linked requests, transfers and activity','Reviewable movement sequence'],
 ['Limited project visibility','Equipment linked to project records','Visible deployment context'],
 ['Consumable stock uncertainty','SKU balances + low-stock thresholds','Structured stock review']
];
rows.forEach((r,i)=>{const y=174+i*57;rect(s,46,y,868,49,i%2?C.white:C.gray);r.forEach((t,j)=>text(s,t,cols[j]+8,y+11,j===1?298:241,32,15,j===1?C.navy:C.charcoal,j===1));});
text(s,'These are supported capabilities. Time savings, cost reductions and business impact have not been measured.',46,476,868,20,11.5,C.muted);
s.notes=`Describe these as common operational questions in construction, rather than claiming an observed failure at a specific company. Walk across each row from a question to an implemented capability and then its practical use. The application maintains shared equipment records, profile/project references, movement records and consumable balances. The benefits are supported ways of working, not quantified outcomes.

For custody, emphasize that a pending handover is different from confirmed receipt. The named Engineer or Architect must record an inspection and physical-test confirmation. The same stored movement records feed the equipment detail and activity views. Project links provide recorded deployment visibility; they do not supply GPS or automatically establish physical location. Consumable thresholds produce low-stock labels from the saved balance and minimum.

The capability mapping is backed by the current frontend, movement SQL, project modules and consumable modules, with local execution evidence. Do not infer financial savings, productivity gains, reduced losses or complete coverage of historical records. No before/after business measurements were available.

Presenter action: trace the unclear-responsibility row, then preview the custody-change point on Slide 5. Evidence: js/movement-ui.js; js/movement-overview.js; 1-admin/modules/movements/setup.sql; 1-admin/modules/sites/sites.js; 1-admin/modules/consumables/consumables.js; evidence/demonstration-transaction.json.`;

// 03 — Real dashboard, with four concise role groups (five actual roles).
s=slide('Centralized Operational Visibility','Dashboard & access','A shared operational view is scoped by the signed-in role.');
rect(s,46,142,601,321,C.gray);img(s,'dashboard-focus',52,148,589,308);
tag(s,'Inventory & availability',46,119,181);tag(s,'Project allocation',241,119,155);tag(s,'Review queues',410,119,135);
point(s,'Admin','Company overview; request review\nand equipment release.',676,141,238);
point(s,'Engineer · Architect','Own custody and assigned projects;\nrequests, transfers and receipt.',676,224,238);
point(s,'Tool Handler','Inventory monitoring; dispatch\nof available, unheld equipment.',676,307,238);
point(s,'Secretary','Consumables and purchasing;\nequipment routes are restricted.',676,390,238);
provenance(s);
s.screens=['dashboard.png'];
s.notes=`Reference the actual Admin Movement overview on the left. Its saved-record summaries include total equipment quantity, available equipment, deployed equipment, active projects and low-stock consumables. Review queues include tool requests, transfers in progress, repair cases and missing cases. The charts shown are genuine application components using synthetic fixture values. They are not production metrics or invented presentation graphics.

Explain the five roles exactly as found in permissions.js and the authenticated migrations: Admin, Engineer, Architect, Secretary and Tool Handler. Engineer and Architect share operational permissions, but remain separate roles. Admin reviews and releases requests and resolves repairs/recovery. Field users request equipment for assigned active projects and receive only a handover naming their stable profile ID. The Tool Handler monitors company equipment and can dispatch eligible unheld stock; the current holder must transfer equipment already in custody. Secretary navigation is limited to consumables, purchases and settings.

UI route checks mirror the database; they are not the only access control. Current SQL resolves the actor from the authenticated profile and tests cover unauthorized actions and row scope. Older prototype documentation is superseded for this description. These protections were verified locally with modeled Auth transport; deployed Auth configuration and all live policy fingerprints were not inspected.

Presenter action: point to summary cards, project allocation and review queues, then compare the four role groups on the right. Screenshot: evidence/dashboard.png, cropped without altering content. Evidence: js/permissions.js; js/auth.js; 202610040001_authenticated_access.sql; 202610100001_engineer_portal.sql; tests/auth-database.test.cjs.`;

// 04 — Inventory and genuine post-receipt detail.
s=slide('Knowing What Equipment Exists and Who Is Responsible','Equipment accountability','Asset identity, current holder and project are visible together.');
text(s,'EQUIPMENT REGISTER',46,132,500,19,11,C.muted,true);text(s,'RECORDED CUSTODY',643,132,271,19,11,C.muted,true);
rect(s,46,157,562,306,C.gray);img(s,'equipment-focus',52,163,550,299);
img(s,'custody-focus',643,157,271,114);
point(s,'Identify the asset','Asset ID, name and registration\nspecifications.',643,291,271);
point(s,'Review responsibility','Saved holder and project;\nstatus and request availability.',643,378,271);
provenance(s);
s.screens=['equipment-list.png','received-detail.png'];
s.notes=`The left screenshot is the Admin Equipment Tracking register. It includes asset identity, quantity, project, holder, recorded status and new-request availability. The right screenshot is the top of the same demonstration equipment's detail after a completed local receipt. Point to DEMO-EQ-001, Demo Engineer and Demonstration Project A. These values were written by the tested receipt, not manually painted onto a screen.

Registration supports identifiers and descriptive fields including category, brand, model, serial number, tracking type, unit, quantity and recorded condition. The equipment page has add/edit behavior, and local tests cover the configured Office default for new records. Office configuration must be installed and verified in the target environment.

Separate three concepts: registration condition metadata, operational status and request eligibility. Movement receipts save per-item inspection outcomes and update operational status/custody. The movement routine does not prove that the free-text equipment.condition field is continuously synchronized with every inspection. Do not call it a live condition sensor or automatically maintained physical condition. Project/site is a recorded database association; it is not GPS.

Reservations and in-use status can prevent a new request even if a viewer sees the item in an inventory list. The current holder must transfer or return a held asset. Movement history is retained under the authorized detail view; the full after-receipt history appears on Slide 9.

Two fresh legacy availability-installation tests failed because the migration guard rejected the legacy-scoped-reader and v1-metadata lifecycle fingerprints. Other modern request/custody cases and the displayed transaction passed. Legacy installation compatibility therefore remains unresolved; do not claim every upgrade path works.

Presenter action: point first to asset identity, then current holder/project, then availability. Evidence: js/equipment-tracking.js; 1-admin/modules/masterlist/masterlist.js; js/movement-ui.js; 202610120004_equipment_office_default.sql; 202610150001_inventory_availability.sql; 202610200001_verified_request_inventory.sql; evidence/demonstration-transaction.json.`;

// 05 — Primary highlight. All boxes, arrows, state labels and text are native.
s=slide('From Equipment Request to Accountable Handover','Core workflow','Custody changes on tested receipt, after approval and release.',true);
const stage=[
 {n:'01',title:'REQUEST',role:'Engineer / Architect',state:'request: pending',detail:'Select eligible equipment\nand an assigned project.\nCustody stays unchanged.'},
 {n:'02',title:'REVIEW',role:'Admin',state:'request: approved',detail:'Approve to reserve tools.\nReject with a recorded reason.\nRejected requests stop here.'},
 {n:'03',title:'RELEASE',role:'Admin',state:'request: released\ntransfer: pending',detail:'Create the named handover\nand retain a source snapshot.\nCustody stays unchanged.'},
 {n:'04',title:'INSPECT + RECEIVE',role:'Named Engineer / Architect',state:'request + transfer: received',detail:'Record every item’s condition\nand confirm physical testing.\nAccepted items change custody.'}
];
stage.forEach((a,i)=>{const x=46+i*222,highlight=i===3;rect(s,x,143,202,210,highlight?C.gold:C.darkline);text(s,a.n,x+14,154,170,24,19,highlight?C.navy:C.gold,true);text(s,a.title,x+14,185,178,23,i===3?14.5:18,highlight?C.navy:C.white,true);text(s,a.role,x+14,217,177,32,12.5,highlight?C.navy:'D5DCE5',true);text(s,a.state,x+14,255,177,37,12.5,highlight?C.navy:C.gold,true);text(s,a.detail,x+14,300,177,48,12,highlight?C.navy:C.white);if(i<3)line(s,x+205,247,x+218,247,C.gold,1.5,true);});
text(s,'CUSTODY CHANGES HERE',710,121,202,18,10.5,C.gold,true);
line(s,812,356,812,369,C.gold,1.4);line(s,257,369,812,369,C.gold,1.4);line(s,257,369,257,379,C.gold,1.4,true);line(s,812,369,812,379,C.gold,1.4,true);
rect(s,46,382,422,77,C.darkline);rect(s,490,382,424,77,C.darkline);
text(s,'TRANSFER TO ANOTHER PROJECT',60,394,392,22,13.5,C.white,true);text(s,'Engineer / Architect sends → named receiver inspects.',60,423,392,23,12.5,'D5DCE5');
text(s,'RETURN TO CONFIGURED OFFICE',504,394,392,22,13.5,C.white,true);text(s,'Engineer / Architect; good / damaged clear custody.',504,423,392,23,12.5,'D5DCE5');
text(s,'Exceptions: accepted damage → repair case; missing item → prior holder and last recorded site retained.',46,479,868,19,11.5,'D5DCE5');
s.notes=`This is the primary workflow slide. Allow about three minutes. All stage boxes and connectors are editable PowerPoint shapes. They represent the implemented authenticated workflow, verified in disposable local PostgreSQL and through a running UI transaction. They are not proof that the same migrations are installed in production.

1. REQUEST — The signed-in Engineer or Architect selects one or more eligible whole equipment records and an active project assigned to that profile. Purpose is optional under migration 202610120003; a supplied purpose is bounded. Needed-until is optional and must be a valid nonpast Manila date when provided. Request creation saves the requester, named receiver profile ID, asset IDs, destination, purpose, due date and timestamps in a mcpa_movements request record, with linked asset/site references. The status is pending. No equipment custody is changed. Eligibility is checked server-side; a visible asset button alone does not prove it can be requested.

2. REVIEW — Only Admin can approve or reject. Approval requires a pending request and eligible unassigned stock. It changes request status to approved and inserts mcpa_movement_reservations, preventing competing allocations. It does not set current_holder_id or site_id. Rejection changes status to rejected and requires a recorded reason. The reviewed actor and timestamp are retained. A requester's own withdrawal/cancellation controls are separate branches supported by migration 202610100004; they are not additional approval stages.

3. RELEASE — Admin releases an approved request. The transaction checks the reservation and active receiving account. It creates a transfer record with status pending, a TRF reference/manual handover code, sender, named receiver, destination and a per-asset source snapshot of holder, site, recorded status and quantity. The request becomes released and links to that transfer. Reservation ownership moves to the transfer. Equipment remains in its prior recorded custody/location until receipt. No transport carrier, departure time or signature is invented. Notification creation, when its migration is installed, does not itself receive equipment.

4. INSPECT AND RECEIVE — Only the named active Engineer or Architect can confirm the transfer. A caller-supplied name or receiver ID cannot impersonate that person. The server rechecks the original holder, site, status and whole-record quantity to catch stale dispatches. Every asset requires an inspection. Nonmissing items require tested:true; accepted damage requires an explicit accepted disposition and notes. On success the transfer and linked request both become received, inspection evidence is retained and reservations are cleared. Good items set current_holder_id to the receiver, site_id to the destination and status to IN_USE. Accepted damaged items take the same receiver/destination, become REPAIR and open a linked repair case. A missing/lost item becomes MISSING, opens a missing case and retains the prior holder and last recorded site. A received transfer therefore does not imply that every included item physically arrived.

This tested receipt is the explicit custody-change point for accepted incoming equipment. The local scenario asserts custody is null after request, approval and release, then equals the receiver's stable profile ID only after good tested receipt. mcpa_movements, mcpa_movement_assets, mcpa_movement_sites, reservations and immutable mcpa_movement_operations capture the transaction and activity. Writes are atomic, and operation IDs protect retries. This supports recorded traceability; it is not a guarantee that every legacy or out-of-system action is audited.

5. TRANSFER OR RETURN — These are later alternatives, not mandatory sequential stages. A current Engineer/Architect holder can directly transfer in-use equipment, creating another pending transfer. The recipient must repeat the inspection/receipt step before custody changes. Tool Handler can dispatch available unheld stock but cannot take over another person's held tools. Admin has initial request release, not general field-transfer/receipt authority in current authenticated permissions. A field holder can instead submit an inspected return to the pinned company Office. The current Office wrapper clears personal custody for good returns (AVAILABLE) and physically returned damaged items (REPAIR). Missing items keep prior accountability. Return creates a return record immediately; there is no verified second Office receiving-approval stage. Do not draw one.

Damage refusal holds an eligible pending handover as refused without custody change. Only the named receiver may refuse with required evidence; sender/requester cancellation eligibility and sender reopening are state/ownership checked. Admin and Tool Handler do not gain those field interruption controls. Whole set/bulk records move together; partial equipment splitting is unsupported.

Evidence: 1-admin/modules/movements/setup.sql (base transaction engine); 202610040001_authenticated_access.sql (authenticated actor, role and tested receipt); 202610060002_recipient_identity.sql (stable IDs); 202610100004_movement_cancellation.sql; 202610120002_office_returns.sql; js/permissions.js; js/movement-ui.js; tests/request-turnover.database.test.cjs; tests/office-return.database.test.cjs; evidence/demonstration-transaction.json.`;

// 06 — Project links and verified local weighted completion.
s=slide('Connecting Equipment to Construction Projects','Project management','Project records connect assignments, equipment and recorded progress.');
img(s,'project-detail',46,145,526,350);
point(s,'Assigned responsibility','Project information links to an\nEngineer / Architect profile.',604,145,310);
point(s,'Deployment visibility','Review linked equipment, saved\nholders and recorded statuses.',604,225,310);
text(s,'WEIGHTED COMPLETION',604,312,310,20,11,C.muted,true);
img(s,'project-progress-focus',604,339,310,77);
text(s,'Calculated from configured work-area\nweights. Locally verified upgrade;\nproduction installation unconfirmed.',604,430,310,54,13.5,C.muted);
provenance(s,46,490,526);
s.screens=['project-detail.png','project-editor.png'];
s.notes=`Reference the actual Demonstration Project A detail at left. It shows the accountable Engineer/Architect, equipment at the project, recorded inventory-check and last-movement information, and the equipment table. Project identity, location, assignments and archive state are managed by Admin. Engineer/Architect views are scoped to assigned projects; Tool Handler retains monitoring visibility. Editing project metadata does not move equipment or change custody.

The small lower-right capture is the real project editor's Construction Completion component. The current repository implements a six-area construction model: Structural, Mechanical, Electrical, Plumbing, Fire Safety and Architectural / Finishing Stage. Each configured area has completion, weight, applicability and notes. Applicable weights must total exactly 100%; an N/A area must have zero weight. The server computes round(sum(completion × weight / 100), 2). The fixture shown uses completions 100,40,60,0,0,0 and weights 30,15,15,10,10,20, producing 45%. This is a synthetic calculation example, not a real project percentage. Fresh database tests cover the formula, rounding, invalid configurations and per-project weights.

Project stage and current work area are distinct. Stage options are Planning/Designing, Permitting, Groundbreaking, Construction Phase and Turnover. Weighted completion does not automatically change stage. Legacy progress/phase values remain preserved and are not silently converted. Project History records future old/new values, actors when available, reasons, updates and linked corrections; it cannot reconstruct missing past history. There is no automatic schedule forecasting claim.

The October 23 construction upgrade is documented as prepared locally and not applied to production. Its local calculation is demonstrably working, so it is included with that explicit limitation. Presenter action: point from accountable profile to linked equipment, then explain the local weighted example briefly. Evidence: 1-admin/modules/sites/sites.js; 1-admin/modules/sites/README.md; 202610230002_project_construction.sql; tests/project-construction.test.cjs; evidence/project-editor.png.`;

// 07 — Actual stock view, without provisional global SKU counts.
s=slide('Managing Materials and Consumable Stock','Consumables inventory','SKU specifications and ledger-backed balances support stock review.');
img(s,'consumables-focus',46,145,600,332);
point(s,'Organized catalog','Item codes, categories, variants\nand specifications.',677,145,237);
point(s,'Stock visibility','Saved quantity, minimum level\nand low-stock indicators.',677,243,237);
point(s,'Controlled movements','Restock, usage and adjustments;\nrequest receipt updates stock.',677,341,237);
provenance(s);
s.screens=['consumables.png'];
s.notes=`The screenshot shows the actual consumables screen with three explicitly synthetic SKU records. Point to code/specification, current stock, minimum level and low-stock label. The red panel is a legitimate restocking alert, not a database error. The three on-screen records are local fixture values and must not be described as the organization's catalog size.

The current implementation supports categories, distinct SKU specifications, item codes, search, category/status filtering, stock quantities, threshold-derived status, opening balances, restock, usage and adjustments. Database RPCs validate quantities, version checks and operation IDs and preserve stock-movement history. Admin and Secretary manage this module. Purchase requests can be created and received partially or fully; confirmed receipt updates the balance and retains a movement record. Purchase-ledger entry alone does not increase stock. Archived SKUs retain historical references.

The code library and local seed tests contain 126 variants across 12 categories, but no current authoritative live application data was queried. Those provisional global figures are intentionally omitted from the slides. They can appear only after a stakeholder provides an authoritative current production catalog query and clarifies active versus archived counts. Do not treat a seed script or a passing seed test as proof of production totals.

Presenter action: compare an OK record with a low-stock record, then describe Update Stock and History as implemented actions supported by local SQL tests. They were not executed as a business demonstration in this presentation capture. Evidence: js/consumables-catalog.js; 1-admin/modules/consumables/consumables.js; 202610220000_consumable_categories.sql; 202610220001_consumables_skus.sql; 202610220002_consumables_archive.sql; tests/consumables-upgrade.test.cjs; tests/purchase-ledger.test.cjs.`;

// 08 — Genuine ledger, report and activity captures; precise audit scope.
s=slide('Records That Support Operational Traceability','Purchasing, reporting & controls','Recorded transactions can be reviewed with role-appropriate access.');
text(s,'PURCHASING LEDGER',46,132,410,18,11,C.muted,true);img(s,'purchases',46,157,420,155);
text(s,'CURRENT INVENTORY REPORT',46,330,420,18,11,C.muted,true);img(s,'report-focus',46,354,420,132);
text(s,'MOVEMENT ACTIVITY',500,132,414,18,11,C.muted,true);img(s,'activity',500,157,414,161);
rect(s,500,340,414,134,C.gray);
text(s,'Retained evidence',516,354,381,23,17,C.navy,true);
text(s,'Purchase history and private receipt files\nMovement actors, timestamps and references\nServer-side role and record checks',516,388,381,73,15,C.charcoal);
provenance(s,46,490,868);
s.screens=['purchases.png','reports.png','activity.png'];
s.notes=`Use the three real UI captures: purchasing ledger at upper left, current inventory report below it, and recorded movement activity at upper right. All data is synthetic. The activity log includes the locally executed createRequest, approveRequest, releaseRequest and receiveTransfer events. It supports inspection of linked records rather than proving universal coverage of every application action.

Purchases are available to Admin and Secretary. Records include supplier/reference/date, line items, server-calculated totals, optional linked material request and private receipt reference. History preserves before/after records and actor data; optimistic versions and retry IDs prevent silent stale overwrites and duplicate retries. Private receipt upload/read policies and signed URLs are implemented and locally tested with modeled Storage. No actual external Storage upload, email or live file-access test was performed here. The displayed synthetic purchase has no attached receipt, so do not imply that this screenshot demonstrates an attachment opening.

Reports include current inventory, dated movement activity and captured inventory snapshots, with export support. The captured screen is Current inventory. A historical snapshot is a saved observation at its actual capture time, not a reconstructed past inventory. A backend scheduler for regular captures/reminders is not deployed by this repository task. The deck therefore makes no claim that automated historical collection or email/push reminders are operational. CSV and PDF capabilities have source/local test evidence; the screenshots were not used to claim every export path was executed in this session.

Access is enforced in current SQL through authenticated profile identity, role checks, scoped reads and row-level policies. These controls were tested locally. They do not by themselves certify production security. Managed equipment photos, purchasing history and recorded movement operations have specific enforcement; unrelated metadata edits and all legacy history are not assumed to share complete audit coverage.

Presenter action: connect the movement reference to the actor/time evidence. Explain what is retained and the limits of the claim. Evidence: 1-admin/modules/purchases/purchases.js; 1-admin/modules/reports/reports.js; js/movement-ui.js; 202610100005_purchase_ledger.sql; 202610100006_monitoring.sql; 202610230001_purchase_receipts_compatibility.sql; tests/purchase-ledger.test.cjs; tests/purchase-receipts-compatibility.test.cjs; tests/monitoring-database.test.cjs; tests/pdf-reports.test.cjs.`;

// 09 — Executed local transaction, with readable, cropped genuine evidence.
s=slide('A Practical Equipment Request Scenario','Executed local demonstration','The same equipment record moves from unassigned to named custody.');
tag(s,'DEMO-EQ-001 · Training concrete vibrator',46,127,431);
text(s,'Executed in the local test application; no production transaction.',500,130,414,30,12.5,C.muted);
const sx=[46,341,636];
['01  REQUEST + REVIEW','02  RELEASE + INSPECTION','03  UPDATED CUSTODY'].forEach((t,i)=>text(s,t,sx[i],176,278,20,12,C.navy,true));
img(s,'approval',46,207,278,219);
img(s,'inspection-focus',341,207,278,219);
img(s,'received-detail',636,207,278,260);
line(s,325,314,338,314,C.gold,1.6,true);line(s,620,314,633,314,C.gold,1.6,true);
text(s,'pending → approved\nHolder remains unassigned.',46,440,278,37,14,C.charcoal);
text(s,'released → received\nTest + condition required.',341,440,278,37,14,C.charcoal);
provenance(s,46,490,868);
s.screens=['approval.png','inspection-confirm.png','received-detail.png'];
s.notes=`Narrate this as an executed local demonstration, not an illustrative transaction or a production record. The presentation capture runner served the unmodified repository UI with disposable PGlite SQL and modeled Auth/Storage transport, while external HTTPS was blocked. The runner used actual application controls to submit, approve, release, inspect and confirm receipt. It queried the local SQL snapshot between stages and asserted request/transfer statuses and stable custody IDs. Evidence is saved in demonstration-transaction.json and capture.log. The local record uses REQ-00001 and TRF-00002; these IDs belong only to the disposable fixture and must not be confused with any protected live record bearing the same label.

BEFORE — Training concrete vibrator, asset DEMO-EQ-001, is AVAILABLE at the configured local Main Office with no holder. Demo Engineer has an active Engineer profile assigned to Demonstration Project A. On Request tools the user selects the eligible asset and that assigned project and enters the demonstration purpose. Submission creates a pending request. Point to the left screenshot, which is the actual Admin review of this same pending request. The saved receiver is Demo Engineer. Admin can approve or reject; the demonstration approves. The request becomes approved, a reservation is created, and current_holder_id remains null.

ACTION — Admin chooses Release tools & create transfer. The request becomes released and transfer TRF-00002 becomes pending. Its source snapshot retains the prior Office/null-holder/AVAILABLE state. A manual code identifies the handover. The capture runner asserts that release still has not assigned custody. Demo Engineer signs in, opens Receive Transfer, enters the transfer code and inspects the equipment. Point to the center capture: the actual lower receipt form shows Good, the physical-test confirmation and the receipt action. The good condition and tested:true are submitted through the UI. Do not say a barcode scan, a physical signature or transport event was demonstrated.

AFTER — Both the request and transfer become received. DEMO-EQ-001 now has current_holder_id equal to Demo Engineer's stable profile ID, site_id equal to Demonstration Project A and recorded database status IN_USE. Its reservation is removed. Point to the right capture: the same equipment detail now shows the named holder/project and the recorded sequence receiveTransfer, releaseRequest, approveRequest and createRequest, with actors, timestamps and references. These are saved application records, not presentation annotations pretending to be a transaction. The detailed screenshot remains embedded at full source resolution and is also supplied separately for zooming.

The return form was captured later but not submitted in this demonstration, so do not claim this same asset was returned. Separate passing database tests establish Office return, damage, missing-item, rollback, unauthorized-recipient and retry behavior. Accepted damage would create repair accountability; a lost item would retain its prior holder/site. Those are verified alternative paths, not outcomes of the displayed good receipt.

Presenter actions: compare the unassigned pre-release state in the transaction evidence with the named holder at right; pause on the required physical-test checkbox; finish by following the linked history references. This explains how movement controls add accountability beyond basic record editing. The broader existing --flows-only browser suite failed a later synchronization watcher-count assertion (workspace-ui-checks.cjs:214, 1 versus expected 2); it must not be described as a complete browser regression pass. The dedicated capture/transaction sequence completed with no uncaught browser errors.`;

// 10 — Five supported capabilities, followed by the requested vision statement.
s=slide('Building Accountability Into Construction Operations','Conclusion','Accountability is built through structured records and explicit handovers.',true);
const benefits=['Centralized equipment information','Clearer recorded responsibility','Traceable saved equipment movements','Visible project deployments','Organized consumable stock records'];
benefits.forEach((t,i)=>{const y=151+i*47;rect(s,46,y+6,7,7,C.gold);text(s,t,70,y,820,30,22,C.white,i===2);});
line(s,46,408,914,408,C.darkline,1);
text(s,'MCPA / SiteTrace — Every Asset Accounted For.\nEvery Movement Traceable.',46,430,868,55,22,C.gold,true);
text(s,'SYSTEM VISION · supported capabilities, not measured business outcomes',46,489,868,14,9.5,'C4CDD7');
s.notes=`Close on the five supported capabilities. Equipment identity and descriptive records are centralized. Named holders and projects expose recorded responsibility. Requests, reservations, releases, tested receipts, onward transfers and Office returns provide a reviewable sequence when users perform them through the implemented workflow. Consumable stock has distinct SKU identities, thresholds and movement history. These are capabilities verified in source and local execution, not claims of measured cost savings or complete real-world asset coverage.

Repeat the most important operational boundary: approval and release do not themselves transfer custody. The named receiver's successful tested inspection changes accountability for accepted equipment. Missing-item and damage exceptions retain evidence and route into follow-up cases. Project metadata changes do not bypass the movement process.

Read the closing statement as a system vision. It is not a certification that every asset is registered, every historic movement has been backfilled or every edit is audited. Production migration/configuration, real Auth/Storage behavior and the remaining browser synchronization check need final review. The October 23 construction tracking upgrade is locally validated but not established in production. Live consumable counts remain unconfirmed. No screenshot placeholders are needed because genuine local application captures were available.

Presenter action: finish by returning to the four-stage workflow and the demonstration history if asked for evidence. Use SITETRACE_FEATURE_VERIFICATION.md for per-feature sources and limitations and SITETRACE_PRESENTATION_CHECKLIST.md for stakeholder review. Do not promise GPS, predictive analytics, automated logistics, email/push delivery, financial improvement or blanket database security; none is established by this presentation.`;

if(slides.length!==10)throw Error('Expected exactly ten slides');
fs.writeFileSync(path.join(__dirname,'deck.json'),JSON.stringify({width:960,height:540,font:'Aptos',palette:C,slides},null,2));
writeDocuments();
console.log('Prepared 10 editable slide layouts, notes and required documentation.');
}

function writeDocuments(){
 const logBytes=fs.readFileSync(path.join(out,'evidence','node-regression.log'));
 const log=logBytes.toString(logBytes[0]===255&&logBytes[1]===254?'utf16le':'utf8');
 const extract=name=>log.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]||'still running';
 const revision=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const checks=`Fresh Node regression: ${extract('tests')} tests; ${extract('pass')} passed; ${extract('fail')} failed; ${extract('skipped')} skipped. See evidence/node-regression.log. The two failures are legacy-scoped-reader and v1-metadata installation/retry cases in tests/verified-request-inventory.database.test.cjs:24; the migration guard reports that the request lifecycle differs from the reviewed implementation. Other modern availability/custody cases passed, and the dedicated transaction completed, but legacy installation compatibility is unresolved. Dedicated capture: 20 genuine screenshots and one executed local request/approval/release/tested receipt; no uncaught browser errors. Existing broad browser --flows-only run FAILED at tests/workspace-ui-checks.cjs:214 (watcher count actual 1, expected 2); earlier request/release/receipt/return checks ran, but the suite is not an overall pass.`;
 const pre=`# SiteTrace feature verification\n\nReviewed 24 October 2026 (Asia/Manila). Repository revision: \`${revision}\`. Source tree was not modified for presentation generation.\n\nArchitecture: static HTML/CSS/JavaScript portals; shared movement and authorization UI; Supabase Auth, PostgreSQL RPC transactions and RLS; private Storage for managed attachments. Local test transport models Auth/Storage while the shipped SQL runs in disposable PGlite. External HTTPS was blocked. No production account, data query, schema write or deployment was used.\n\n${checks}\n\nStatus definitions: **Verified locally** = fresh local execution/testing; **Source-supported** = implementation/schema inspected but the specific operation not rerun; **Partial / deployment unverified** = installed/live dependencies or external execution unproven; **Unsupported / omitted** = no adequate implementation/evidence for a presentation claim. These are not production certification labels. Historical README/PRODUCT prototype statements are not authoritative over current code.\n\n`;
 const features=[
 ['Admin dashboard and summaries','Verified locally','js/movement-overview.js; js/equipment-tracking.js; #dashboard','Admin','Actual dashboard capture; dashboard-view/admin-equipment-summary tests','3','Quantities and chart values are synthetic, not production counts.'],
 ['Authenticated identity and five roles','Verified locally','js/auth.js; js/permissions.js; 202610040001_authenticated_access.sql','Admin; Engineer; Architect; Secretary; Tool Handler','auth-database, accounts-database and development-account tests; local role-based UI','3,8','Auth network transport is modeled; live Auth configuration not reviewed.'],
 ['Role-scoped routes and actions','Verified locally','js/permissions.js; 202610100001_engineer_portal.sql','All five roles','Database role/RLS tests; current source inspected','3,5,8','No blanket security certification; target policies/migrations need review.'],
 ['Equipment registration and Office default','Verified locally','1-admin/modules/masterlist/masterlist.js; 202610120004_equipment_office_default.sql','Admin; eligible Tool Handler backend scope','equipment-office.database and feature-frontend tests; real inventory capture','4','No new UI registration was submitted in the capture; Office must be pinned in the target environment.'],
 ['Asset ID, specifications and quantities','Verified locally','js/equipment-tracking.js; equipment table; #masterlist','Admin; role-scoped readers','inventory/availability database tests; equipment-list.png','4','Descriptive fields are registration metadata, not sensors.'],
 ['Recorded status versus request availability','Verified locally','202610150001_inventory_availability.sql; 202610200001_verified_request_inventory.sql','Admin; Engineer; Architect; Tool Handler','inventory-availability and verified-request-inventory tests','3,4','Reservations can block a new request while recorded equipment status remains AVAILABLE.'],
 ['Holder/project and equipment history','Verified locally','js/movement-ui.js; equipment.current_holder_id/site_id; #masterlist','Authorized equipment readers','Executed local receipt; received-detail.png; transaction assertions','4,9','Recorded site is not GPS; legacy history may be incomplete.'],
 ['Registration condition always synchronized to receipt','Unsupported / omitted','equipment.condition versus movement inspections in movements/setup.sql','N/A','Source review shows status/custody writes and retained inspection data, not continuous condition-field synchronization','4 notes','Do not claim the free-text condition field is automatically maintained by every receipt.'],
 ['Request creation','Verified locally','js/movement-ui.js #request; mcpa_movement_action(createRequest)','Engineer; Architect','Browser-submitted request; request-projects/verified-request tests','5,9','Assigned active project required; optional purpose/date; whole-record quantities.'],
 ['Approve and reject','Verified locally','movements/setup.sql; authenticated_access.sql','Admin','Actual UI approval; request-turnover and movement database tests','5,9','Approval reserves tools; it does not assign custody. Rejection needs reason.'],
 ['Release approved request','Verified locally','mcpa_movement_action(releaseRequest); mcpa_movement_reservations','Admin','Actual UI release; before/after SQL snapshot','5,9','Request released; transfer pending. No custody change or separate transport event.'],
 ['Tested inspection and named-receiver receipt','Verified locally','authenticated_access.sql; 202610060002_recipient_identity.sql','Named Engineer / Architect','Actual UI Good + tested receipt; request-turnover SQL tests','5,9','Only accepted nonmissing equipment takes receiver/destination.'],
 ['Direct project transfer','Verified locally','mcpa_movement_action(createTransfer); engineer_portal.sql','Current Engineer / Architect holder; Tool Handler for unheld stock','Movement/portal/identity/cancellation tests','5','New pending handover; receipt still required. Admin is not given general field transfer authority.'],
 ['Office return and exceptions','Verified locally','202610120002_office_returns.sql; mcpa_return_destination','Engineer; Architect','office-return.database tests; return-form.png (form only)','5','Good and damaged physical returns clear holder; lost retains prior holder/site. No second Office approval verified.'],
 ['Repair and missing follow-up','Verified locally','movements/setup.sql; movement SQL tests','Field reports; Admin start/complete repair/recovery','Movement database and request-turnover tests','5 notes','Accepted incoming damage assigns receiver; damaged Office return clears personal holder under latest wrapper.'],
 ['Withdrawal, cancellation and refusal','Verified locally','202610100004_movement_cancellation.sql; js/permissions.js','Eligible owning field requester/sender; named receiver','movement-cancellation tests','5 notes','Optional installed migration; current state/ownership required. Not Admin/Handler interruption controls.'],
 ['Atomic movements, retries and retained activity','Verified locally','mcpa_movements/assets/sites/operations/reservations; setup.sql','Authorized actors','Rollback, retry, identity and history SQL tests; activity.png','5,8,9','Specific movement operations are logged; not every possible metadata edit or off-system event.'],
 ['Project identity, assignments and equipment','Verified locally','1-admin/modules/sites/sites.js; mcpa_project_snapshot','Admin edit; assigned Engineer/Architect; Tool Handler view','projects/project-detail screenshots; project database tests','6','Metadata saves do not transfer equipment.'],
 ['Project history, stage and weighted completion','Verified locally; production deployment unverified','202610230002_project_construction.sql; mcpa_construction_completion','Admin writes; authorized scoped reads','project-construction tests, including formula/rounding/invalid weights; project-editor.png','6','Upgrade prepared locally, not established live. Example 45% is synthetic. No automatic stage change or backfilled history.'],
 ['Consumable categories, variants and specifications','Verified locally','js/consumables-catalog.js; 202610220000/001/002 migrations','Admin; Secretary','consumables-upgrade/archive tests; actual catalog screenshot','7','Three displayed fixture SKUs are illustrative local data, not live totals.'],
 ['Stock thresholds, movements and request receipts','Verified locally','consumables_adjust_stock; consumables_receive_request; stock movement table','Admin; Secretary','consumables-upgrade/archive tests; screenshot of thresholds/actions','7','UI stock movement was not submitted in this capture. Purchase recording alone does not replenish stock.'],
 ['126 SKUs / 12 categories as live catalog totals','Unsupported as live count / omitted','js/consumables-catalog.js; catalog seed','N/A','Only source/seed tests establish configured catalog variants, not current authoritative live inventory','7 notes','No production catalog query; both headline figures intentionally omitted.'],
 ['Purchase ledger and immutable change history','Verified locally','202610100005_purchase_ledger.sql; #purchase','Admin; Secretary','purchase-ledger tests; purchases.png','8','Synthetic record; no financial/business outcome claimed.'],
 ['Private supporting receipt files','Verified locally in modeled Storage','202610230001_purchase_receipts_compatibility.sql; 1-admin/modules/purchases/purchases.js','Admin; Secretary','purchase-receipts compatibility and feature-storage policy tests','8','Real Supabase Storage network/upload/access not tested; shown ledger row has no attachment.'],
 ['Current inventory, movement and snapshot reports','Verified locally','202610100006_monitoring.sql; 1-admin/modules/reports/reports.js','Admin','monitoring/pdf-reports tests; actual current inventory report screenshot','8','Capture demonstrates current report. Historical data starts at genuine captures; scheduling not deployed.'],
 ['CSV / PDF export','Verified locally at test level','reports.js; js/pdf-reports.js; tests/pdf-reports.test.cjs','Authorized module roles','Fresh pdf-reports/monitoring tests; source review','8 notes','Not every browser export path executed in the capture.'],
 ['Automated external reminders and scheduled captures','Partial / deployment unverified','mcpa_generate_monitoring; mcpa_capture_inventory_snapshot','Trusted backend/service role','Source and local monitoring tests','8 notes; omitted as operational claim','No deployed scheduler, email or push provider verified.'],
 ['QR/camera scanning','Source-supported; optical behavior unverified','js/movement-ui.js; receiver QR RPCs','Authorized sender/receiver','Source inspection; manual handover code used in demonstration','5/9 notes only','No optical scan or real phone permission test; not promoted as a demonstrated feature.'],
 ['Legacy inventory migration compatibility','Unresolved local test failures','tests/verified-request-inventory.database.test.cjs:24; 202610200001_verified_request_inventory.sql','Local legacy installation fixtures','Two install/retry tests failed: lifecycle fingerprint guard rejects legacy-scoped-reader and v1-metadata cases','Checklist; notes 4/10','Modern fixture movement/availability cases passed; target legacy installations need review before migration.'],
 ['Broad browser synchronization regression','Unresolved local test failure','tests/workspace-ui-checks.cjs:214','Local test environment','--flows-only: expected watcher/channel count 2, observed 1','Checklist; notes 9/10','No claim of full browser regression success or production real-time operation.'],
 ['GPS, predictive analytics, integrations and measured ROI','Unsupported / omitted','No adequate evidence found','N/A','Repository inspection','None','Do not add these promotional claims.']
 ];
 const h='| Feature | Verification status | Supporting source / route | Relevant role | Evidence / test | Slide | Outstanding limitations |\n|---|---|---|---|---|---|---|\n';
 fs.writeFileSync(path.join(out,'SITETRACE_FEATURE_VERIFICATION.md'),pre+h+features.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n\nAll migration paths above are relative to supabase/migrations/ unless otherwise stated. Base movements/setup.sql means 1-admin/modules/movements/setup.sql. See screenshot-manifest.json for capture provenance and crop-manifest.json for exact image crops.\n');
 const guide=`# SiteTrace presentation guide\n\nEditable 16:9 PowerPoint, exactly 10 slides. Native text, shapes, connectors and speaker notes; application screenshots are embedded PNG images. Palette: navy #142235, charcoal #242B33, white #FFFFFF, light gray #F3F5F7, muted gold #C4A15A. Font: Aptos. Footer and slide numbering are consistent. No animations.\n\nUse the navy workflow slide as the centerpiece. Suggested time: 12–15 minutes, with approximately 3 minutes for Slide 5 and 2 minutes for Slide 9. All screenshots are genuine captures of unchanged application code on a disposable local test backend; none is generated or a production screenshot.\n\n| Slide | Title | Key message | Screenshot placement | Suggested explanation / visual decision |\n|---|---|---|---|---|\n`+slides.map((s,i)=>`| ${i+1} | ${s.title} | ${s.keyMessage} | ${s.screens.length?s.screens.join(', '):'No screenshot; native editable typography/diagram.'} | ${['Restrained navy title, editable wordmark and four operational pillars. Introduce evidence scope.','Five aligned problem → capability → value rows. No outcome statistics.','Large dashboard left; exact role groups right. Point to genuine metrics and clarify synthetic values.','Register left and post-receipt custody detail right. Distinguish status, availability and registration metadata.','Four large native stages; gold receipt stage marks custody change. Later transfer and Office return are alternatives.','Project equipment at left; real weighted-progress crop at right. Explicit local-upgrade limitation.','Large SKU/stock screenshot with three brief explanations. Global catalog counts omitted.','Actual ledger, report and activity captures. Discuss retained records and specific access boundaries.','Three genuine stages from the same executed local transaction. Pause on testing and changed holder.','Five supported capabilities on navy. Treat the final statement as a vision.'][i]} |`).join('\n')+'\n\n## Speaker notes\n\n'+slides.map((s,i)=>`### ${i+1}. ${s.title}\n\n${s.notes}\n`).join('\n');
 fs.writeFileSync(path.join(out,'SITETRACE_PRESENTATION_GUIDE.md'),guide);
 const checklist=`# SiteTrace presentation checklist\n\nReview date: 24 October 2026 (Asia/Manila).\n\n## Evidence and application scope\n\n- [x] Existing codebase, schemas, role checks, modules and tests inspected.\n- [x] Application business logic, roles, permissions and production data left unchanged.\n- [x] Genuine screens captured from the unchanged local application using synthetic identities/data; external HTTPS blocked.\n- [x] Dedicated request → approval → release → tested Good receipt executed and asserted against local SQL snapshots.\n- [x] Provisional live catalog totals (126 SKUs / 12 categories) omitted. Source/seed counts do not establish live counts.\n- [x] No GPS, financial gains, predictive analytics, transport signatures or complete-audit/security claim.\n\n## Fresh verification\n\n${checks}\n\n- [ ] Review/fix the existing broad browser synchronization assertion independently before claiming a complete browser pass. Presentation work did not change application code to satisfy it.\n- [ ] Verify target Supabase Auth, actual role-policy/RPC fingerprints, installed migrations, pinned Office and Storage configuration before using this deck as proof of deployed behavior.\n- [ ] Review project construction/history migration deployment; weighted formula is verified locally, production installation is unconfirmed.\n- [ ] Verify real private upload/signed-URL access in authorized staging. Transport was modeled locally.\n- [ ] If automated monitoring is discussed, confirm a real trusted scheduler and actual captures. No scheduler/email/push operation is established here.\n- [ ] Confirm current active/archived consumables counts through authoritative live data before adding any global totals.\n\n## Workflow limits and roles\n\n- [x] Exactly five current roles used: Admin, Engineer, Architect, Secretary, Tool Handler.\n- [x] Approval reserves and release creates a pending transfer; custody is unchanged until accepted tested receipt.\n- [x] Accepted incoming damage assigns receiver and opens repair; missing items keep prior holder/site.\n- [x] Current Office wrapper clears holder for good and damaged physical returns; missing retains accountability.\n- [x] No second Office receipt approval, partial equipment splitting or automatically synchronized free-text condition claim.\n- [x] Direct holder transfer and Tool Handler unheld-stock dispatch are distinguished from Admin initial release.\n- [ ] Confirm optional cancellation/refusal/monitoring migrations on the intended deployed system before a live demo.\n- [ ] Confirm field users physically test equipment as required; software captures confirmation, not independent proof of a test.\n\n## Screenshots and placeholders\n\n- [x] No missing screenshot placeholders. No fictional interfaces or generated images.\n- [x] Dashboard, inventory/detail, request, approval, release, receipt/inspection, movement history, projects, consumables, purchasing, reporting and activity genuinely captured.\n- [x] Each screenshot slide labels the local environment and synthetic data; manifests and original full-resolution PNGs supplied.\n- [x] The example is explicitly an executed local test transaction. REQ-00001 / TRF-00002 are isolated local identifiers, unrelated to any same-named production record.\n- [ ] Optional: replace local screenshots with authorized, redacted production/staging captures if the intended audience expects deployed evidence. Current deck has no placeholder requiring this.\n- [ ] Review screenshot readability on the actual meeting projector; originals are supplied for zooming.\n\n## PowerPoint quality assurance\n\n- [x] Design source specifies exactly 10 titled slides with one key message each.\n- [x] Speaker notes authored on every slide, with detailed workflow and demonstration narration.\n- [x] Native editable text/shapes/diagram; screenshots remain genuine raster evidence.\n- [ ] Native PowerPoint generation, reopen, 16:9/slide/notes checks, text-bound checks and every-slide render review: see evidence/powerpoint-qa.json when complete.\n- [ ] Final stakeholder review: naming, operational policy wording, real deployment status, approved audience and treatment of the closing slogan as a system vision.\n\n## Outstanding items affecting claims\n\nThe local test results and screenshots demonstrate repository behavior, not production installation or business effectiveness. The existing browser synchronization assertion remains unresolved. No presentation placeholder remains. Production role/configuration verification, real external Storage behavior, scheduler status and authoritative inventory counts remain stakeholder review items.\n`;
 fs.writeFileSync(path.join(out,'SITETRACE_PRESENTATION_CHECKLIST.md'),checklist);
}
build().catch(e=>{console.error(e);process.exitCode=1;});
