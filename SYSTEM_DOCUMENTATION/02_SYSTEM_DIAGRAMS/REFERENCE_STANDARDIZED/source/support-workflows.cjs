'use strict';

// Source-audited documentation data. This file never connects to the application or database.
const A = ['admin'];
const F = ['engineer', 'architect'];
const R = ['admin', 'engineer', 'architect'];
const s = (path, line, note) => ({path, line, note});
const io = text => ({type:'io',text});
const p = text => ({type:'process',text});
const d = (text, no, retry = true) => ({type:'decision',text,no:Array.isArray(no)?no:[no],retry});
const action = (title, steps, outcome, roles) => ({title,steps,outcome,...(roles?{roles}:{})});
const save = (rpc, effect) => [
  p(`Submit ${rpc}; disable form controls while saving`),
  d('Server validates current state and confirms the save?',
    ['Show validation, permission, duplicate, stale-version or network error','Keep the form; correct values or refresh and reopen stale records']),
  p(effect),
  d('Updated records reload successfully?',
    ['Show saved-change warning; disable further stock actions','Close the saved form; use Refresh to verify latest records'],false),
  io('Close the form; show success and updated stock / request records')
];
const pdf = () => [
  p('Load bundled PDF libraries; capture current authorized matching rows and filter labels'),
  d('Screen remains active and the same account still has export permission?',
    'Stop export if the screen or account changed',false),
  p('Create paginated A4 report with generation time, repeated headings and record count'),
  d('A non-empty PDF is generated?',
    ['Show PDF resource / generation error; release export control','Retry export; reload SiteTrace if resources remain unavailable']),
  io('Download SiteTrace PDF; show ready message and restore export button')
];

module.exports = [
  {
    key:'dashboard',title:'Dashboard / Movement Overview',roles:R,
    sources:[
      s('js/movement-overview.js',89,'Role-aware dashboard load, partial failure, retry and watch'),
      s('js/dashboard-view.js',23,'Company versus confirmed personal custody scope'),
      s('js/dashboard-view.js',161,'KPI cards, tasks, active projects, activity and workflow panels'),
      s('js/permissions.js',7,'Authorized route matrix; Engineer and Architect share routes')
    ],
    notes:[
      'Admin sees company equipment quantities; Engineer/Architect sees individual assets in confirmed custody.',
      'Dashboard actions open their owning module; mutation validation is documented in those module diagrams.',
      'Pending turnover has not yet changed custody. Engineer/Architect dashboard uses movement data to retain those handovers.'
    ],
    actions:[
      action('Load Admin company overview',[
        p('Refresh MovementStore and read EquipmentTracking snapshot in parallel'),
        d('The inventory snapshot read succeeds?',
          ['Show Records could not load with service error','Select Retry to repeat the dashboard load']),
        p('Use current inventory; preserve movement warning if movement history failed'),
        io('Display equipment KPIs, status/project charts, seven-day events, tasks, projects and custody summary'),
        p('Watch equipment, sites and notifications; retain last loaded data during interrupted updates')
      ],'Company overview is displayed; module links retain route authorization.',A),
      action('Load Engineer / Architect overview',[
        p('Refresh authorized movement snapshot; derive active projects assigned to the signed-in profile'),
        d('Movement data loads?',
          ['Display load error and Retry','Select Retry; automatic updates also retry interrupted loading']),
        p('Filter visible equipment to positive-quantity assets held by this profile'),
        io('Show personal KPIs, recent activity, pending addressed turnover and addressed request status summaries'),
        io('Show personal status charts, active assigned projects and custody / issue tasks')
      ],'Confirmed custody and unreceived addressed handovers are shown separately.',F),
      action('Filter dashboard inventory and open records',[
        io('Select status tab; enter equipment search; select project / unassigned and condition'),
        p('Apply status, project, condition and text filters to the dashboard inventory scope'),
        d('Matching equipment exists?',
          ['Show No matching equipment','Change or clear filters and search']),
        io('Display up to six matching equipment records and the full matching count'),
        io('Select a tool to open Equipment Tracking details, or View full inventory to open the masterlist')
      ],'Dashboard results or the authorized equipment record are displayed.'),
      action('Open pending turnover or request',[
        io('Choose a displayed turnover, request, or Receive Transfer'),
        p('Open transfer?record=ID, request?record=ID, or transfer?view=receive'),
        d('Destination route and record remain authorized?',
          'Show access / unavailable-record feedback from the owning module',false),
        io('Inspect the saved record in the corresponding detailed movement workflow')
      ],'The selected movement record is opened without changing custody.',F),
      action('Open module from a KPI, task, project or activity',[
        io('Select an equipment KPI, review task, active-project card, or recent movement link'),
        p('Resolve target route; activity links use stable action / entity ID'),
        d('Signed-in role can open the target route?',
          'Reset protected content and display access denial',false),
        io('Load target module; select Retry if its HTML or script cannot load')
      ],'The target module handles its own read and mutation workflow.')
    ]
  },
  {
    key:'sites',title:'Projects / Site List',roles:R,
    sources:[
      s('1-admin/modules/sites/sites.js',110,'Repository selects scoped project RPC or full inventory table reads'),
      s('1-admin/modules/sites/sites.js',219,'Refresh, stale record removal and Try Again'),
      s('1-admin/modules/sites/sites.js',355,'Project form and complete client validation'),
      s('1-admin/modules/sites/sites.js',149,'Admin-only insert/update with updated_at concurrency condition'),
      s('supabase/migrations/202610100001_engineer_portal.sql',49,'Project snapshot restricted to assigned Engineer/Architect'),
      s('supabase/migrations/202610040001_authenticated_access.sql',196,'Only Admin inserts/updates projects'),
      s('supabase/migrations/202610100002_project_history.sql',116,'After-insert/update project history trigger')
    ],
    notes:[
      'The project list and site-detail route share one loaded module but have separate diagrams.',
      'Only Admin has project creation/edit/archive controls. Engineer/Architect remains read-only and assigned-project scoped.',
      'Archival, equipment and history inspection are detailed under Project Details.'
    ],
    actions:[
      action('Read and search company projects',[
        p('Page through sites and equipment; resolve accountable names from accessible profiles'),
        d('Projects and equipment load?',
          ['Display project service / access / setup error','Select Try Again; retain previously loaded records when available']),
        io('Search project name, location, assigned person or phase; choose all / my projects and include archived'),
        p('Apply scope, archive and text filters; tally positive-quantity equipment at each project'),
        d('Any project matches?',
          ['Display No matching projects','Adjust filters or use Add Project']),
        io('Select project card; open site-detail with the project ID')
      ],'Company project list or the selected Project Details is displayed.',A),
      action('Read assigned projects',[
        p('Call mcpa_project_snapshot and read assigned sites, scoped equipment and history'),
        d('Scoped project snapshot loads?',
          ['Display project service / access / setup error','Select Try Again to repeat loading']),
        io('Search assigned projects; optionally include archived records'),
        p('Filter by current profile assignment, archive selection and search text'),
        d('Any assigned project matches?',
          ['Show No projects assigned / No matching projects','Clear filters; an Admin must create or change assignment']),
        io('Open selected project card; keep all metadata and assignments read-only')
      ],'Only the signed-in Engineer/Architect assigned project records are displayed.',F),
      action('Create project',[
        io('Choose Add Project; enter name, location, Engineer/Architect profile, phase, status, progress and check date'),
        d('Existing accountable profile and nonblank name / location selected?',
          'Show required-field / profile error; complete the form'),
        d('Name is unique; progress is whole 0-100; status is valid; check date is not future?',
          'Show the specific invalid-field or duplicate-name error; correct input'),
        p('Insert validated metadata into sites; server enforces Admin policy and creates project history'),
        d('Insert returns the saved project?',
          ['Show permission, duplicate, setup or network error','Keep the form; correct fields or retry after service recovery']),
        io('Select saved project; update list; close form; display creation success')
      ],'New project metadata and corresponding history are recorded.',A)
    ]
  },
  {
    key:'site-detail',title:'Project Details / Accountability and History',roles:R,
    sources:[
      s('1-admin/modules/sites/sites.js',286,'Project summary and positive-quantity project inventory'),
      s('1-admin/modules/sites/sites.js',377,'Edit validation, insert/update save and failure'),
      s('1-admin/modules/sites/sites.js',429,'Archive/restore confirmation and metadata-only save'),
      s('1-admin/modules/sites/sites.js',458,'Assigned-tool review and search/status filtering'),
      s('1-admin/modules/sites/sites.js',175,'Confirmed transfer / return movement history projection'),
      s('1-admin/modules/sites/sites.js',521,'Project-history read and errors'),
      s('1-admin/modules/sites/sites.js',566,'Deep link validates target and current assignment')
    ],
    notes:[
      'Project metadata operations preserve equipment assignments; no project deletion action is implemented.',
      'Movement views derive received transfers and returns; inspections marked lost are excluded from the projected movement list.',
      'Engineer/Architect equipment totals count asset records; quantity and tracking-type fields are hidden.'
    ],
    actions:[
      action('Open authorized project details',[
        io('Select a project or follow site-detail?record=project-ID'),
        p('Resolve the exact project ID; Engineer/Architect additionally requires assignment to current profile'),
        d('The requested project is available and authorized?',
          ['Display No project selected; never substitute another project','Return to All Projects and select an available project']),
        io('Show location, phase, progress, accountable profile, inventory check and positive-quantity project inventory'),
        p('Refresh saved movements to compute last movement; show History unavailable if that read fails')
      ],'Project accountability and inventory are displayed without editing equipment.'),
      action('Edit project metadata or accountable profile',[
        io('Choose Edit Project; revise name, location, assigned profile, phase, status, progress and check date'),
        d('Valid existing profile selected, or the unchanged legacy assignment is retained?',
          'Show Select an existing Engineer / Architect profile; correct the assignment'),
        d('Required values, unique name, status, whole 0-100 progress and nonfuture check date are valid?',
          'Show the specific validation error; correct values'),
        p('Update sites where ID and original updated_at both match; history trigger retains change record'),
        d('Server returns the updated project?',
          ['Show duplicate / permission / service error or changed-record warning','For stale data, close form and reopen after the next update; otherwise retry']),
        io('Replace local project record; render details; close form; show updated successfully')
      ],'Validated metadata changes and accountability assignment history are recorded.',A),
      action('Archive or restore a project',[
        io('Choose Archive Project or Restore Project; review preservation message'),
        d('Confirm the archive / restore?',
          'Cancel and close the confirmation without saving',false),
        p('Update is_active and archived_at with original updated_at concurrency condition'),
        d('Server confirms the updated site record?',
          ['Show stale-record / permission / service error','Refresh and reopen stale record, or retry the confirmation']),
        io('Return to Projects; show archived / restored success and retained history')
      ],'Project activity flag changes; equipment and full project history are retained.',A),
      action('Review assigned equipment and inspect a tool',[
        io('Choose Review Assigned Tools; search name, asset ID, brand or holder and select status'),
        p('Filter this project equipment; Admin review includes zero-quantity records'),
        d('Any assigned equipment matches?',
          ['Show no matching / no assigned equipment message','Change search or status filters']),
        io('Select View for a listed tool; resolve it within the current project'),
        p('Read confirmed movement history for the selected tool'),
        io('Display identity, category, brand, model, serial, condition, holder, project, status and movement history')
      ],'Selected project tool is inspected read-only; history errors are shown in the dialog.'),
      action('Read project history',[
        io('Choose Project History'),
        p('Read paginated project_history; Engineer/Architect uses mcpa_project_snapshot history for its project'),
        d('History read succeeds?',
          ['Show the project-history service error','Retry Project History after access / connection recovery']),
        io('Display recorded Manila timestamps and change types, or No project changes recorded')
      ],'Recorded project metadata changes are displayed.'),
      action('Read movement history',[
        io('Choose View movement history'),
        p('Refresh MovementStore; derive this project received transfers and returns excluding lost inspections'),
        d('Movement snapshot is available?',
          ['Show Movement history unavailable with service error','Close and reopen movement history to retry']),
        io('Show date, tool, from and to project; Admin also sees quantity; show explicit empty state if none')
      ],'Confirmed movements into and out of the project are displayed read-only.')
    ]
  },
  {
    key:'consumables',title:'Material Requests / Consumables Procurement',roles:A,
    sources:[
      s('1-admin/modules/consumables/consumables.js',62,'Paged reads, refresh, failure, stock and request filters'),
      s('1-admin/modules/consumables/consumables.js',197,'Create/edit item and stock forms'),
      s('1-admin/modules/consumables/consumables.js',226,'Request, receive, cancellation and history forms'),
      s('1-admin/modules/consumables/consumables.js',286,'Payload validation and actual RPC names'),
      s('1-admin/modules/consumables/consumables.js',312,'Save errors, confirmed-save refresh failures and retry behavior'),
      s('1-admin/modules/consumables/setup.sql',62,'Server item, stock, request, receipt and cancellation validation'),
      s('supabase/migrations/202610040001_authenticated_access.sql',242,'Authenticated RPC wrappers restrict materials roles and replace requester with actor.name')
    ],
    notes:[
      'The UI labels consumable procurement records Purchase Request; these records are distinct from equipment Requests.',
      'Only one pending/partial material request per consumable is permitted.',
      'The Requested by input is sent by the UI, but the authenticated server wrapper records the signed-in actor name.',
      'Quantities support up to three decimal places and a maximum 999999999.999.',
      'Admin Material Requests is a live-only route; offline demo does not allow it.'
    ],
    actions:[
      action('Load, refresh and filter stock / procurement requests',[
        p('Read all consumables and consumable_requests in 500-row pages; sort names and request numbers'),
        d('Both reads complete?',
          ['Warn stock levels could not be verified; disable mutations','Retain stale displayed rows; use Refresh to retry']),
        io('Show current / minimum stock, stock status, open-request outstanding quantity and request statuses'),
        io('Search inventory; select stock status and request status / open filter'),
        p('Render matching items and requests or explicit empty states; check again every 30 seconds when visible')
      ],'Verified stock and request records are available for the next action.'),
      action('Add consumable with opening stock',[
        io('Choose Add Consumable; enter item name, unit, minimum stock and actual opening stock'),
        d('Name and unit are nonblank, name unique and quantities nonnegative with at most three decimals?',
          'Display required / duplicate-name / quantity error; correct the form'),
        ...save('consumables_save_item','Create item and opening-stock movement; store minimum stock')
      ],'A consumable and its actual opening stock are recorded.'),
      action('Edit consumable metadata',[
        io('Choose Edit; change name and minimum stock; unit remains fixed'),
        d('Name is nonblank and unique; minimum stock is a valid nonnegative quantity?',
          'Show invalid name / duplicate / quantity error; correct input'),
        ...save('consumables_save_item','Verify item version; update name/minimum only; retain fixed unit and current stock')
      ],'Consumable name / threshold is updated while stock history is preserved.'),
      action('Record stock usage',[
        io('Choose Update Stock → Record usage; enter positive quantity and reason / reference'),
        d('Quantity is valid and not greater than displayed stock; reason is nonblank?',
          'Show required / quantity error; adjust quantity or reason'),
        p('Preview reduced stock balance; retain operation ID for a safe same-form retry'),
        ...save('consumables_adjust_stock','Check item version and nonnegative server balance; subtract usage and append stock movement')
      ],'Usage reduces available stock and records the resulting balance.'),
      action('Restock without a material request',[
        io('Choose Update Stock → Restock without a request; enter positive added quantity and reference'),
        d('Quantity, resulting stock limit and nonblank reference are valid?',
          'Show quantity / required-field error; correct input'),
        p('Preview increased balance; if an open request exists, show guidance to receive on that request'),
        ...save('consumables_adjust_stock','Check version; add restock quantity and append stock movement')
      ],'Unlinked restock increases stock; it does not receive an outstanding request.'),
      action('Correct the physical stock count',[
        io('Choose Update Stock → Correct physical count; enter nonnegative counted total and reason'),
        d('Count is a valid bounded quantity and reason is nonblank?',
          'Show quantity / required-field error; correct input'),
        p('Preview counted stock total; retain operation ID for the same-form retry'),
        ...save('consumables_adjust_stock','Check version; set current stock to count and record signed correction delta')
      ],'Stock equals the physical count and the adjustment is retained in history.'),
      action('Create material purchase request',[
        io('Choose Purchase Request or an item request action; select a consumable without an open request'),
        p('Suggest shortage to minimum stock, or 1; allow quantity / purpose correction'),
        io('Enter positive quantity, optional needed-by date, Requested by and purpose'),
        d('Required values and quantity valid; needed-by date is not past; no open request exists?',
          ['Show field / duplicate-open-request error','Correct fields, or view the existing pending/partial request']),
        ...save('consumables_create_request','Server records actor.name, pending request and fixed item identity; stock does not change')
      ],'A pending procurement request is recorded; available stock remains unchanged.'),
      action('Inspect material request',[
        io('Choose View Request or follow a material-request search result'),
        d('Selected item or request is still available?',
          'Show material record unavailable / access denied feedback',false),
        io('Show CR reference, item/unit, requested, received/outstanding quantity, requester, dates and purpose'),
        io('Display cancellation reason if present; pending/partial requests expose Receive and Cancel')
      ],'Request details and only applicable next actions are shown.'),
      action('Receive partial or full material delivery',[
        io('Choose Receive Stock on a pending/partial request; review outstanding quantity'),
        io('Enter positive actual delivered quantity and delivery reference / notes'),
        d('Received quantity is valid and does not exceed outstanding; notes are nonblank?',
          'Show quantity / required-note error; correct delivery details'),
        ...save('consumables_receive_request','Check request version/open state; add stock, increase received, set partial/received and append receipt')
      ],'Actual delivery increases available stock; request is partial or fully received.'),
      action('Cancel outstanding material request',[
        io('Choose Cancel on pending/partial request; review outstanding quantity and enter cancellation reason'),
        d('Cancellation reason is nonblank?',
          'Show required-reason error; correct the form before confirming cancellation'),
        ...save('consumables_cancel_request','Verify version and pending/partial state; set cancelled and record reason; retain received stock')
      ],'Only outstanding procurement is cancelled; already received stock and history remain.'),
      action('Read stock movement history',[
        io('Choose History or Stock History for a consumable'),
        p('Page through consumable_stock_movements for the item; sort newest first'),
        d('Stock history loads?',
          ['Show history error with Try Again','Select Try Again to repeat the item history read']),
        io('Show Manila date, opening/usage/restock/correction/receipt, signed change, balance and reason/reference')
      ],'The item stock audit trail is displayed read-only.')
    ]
  },
  {
    key:'purchase',title:'Purchases / Recorded Purchase Ledger',roles:A,
    sources:[
      s('1-admin/modules/purchases/purchases.js',20,'Date/search filter and mcpa_purchase_snapshot'),
      s('1-admin/modules/purchases/purchases.js',48,'Create/edit form, line items, details and history'),
      s('1-admin/modules/purchases/purchases.js',58,'Private receipt staging, operation ID and save RPC'),
      s('1-admin/modules/purchases/purchases.js',93,'Receipt signed URL and errors'),
      s('supabase/migrations/202610100005_purchase_ledger.sql',53,'Authoritative record, items, amount, receipt and concurrency validation')
    ],
    notes:[
      'Purchases is a record-only ledger. Delivery and consumable stock changes occur only in Material Requests.',
      'No purchase delete action is implemented. Previous receipt is retained unless a replacement is uploaded.',
      'A purchase can link one existing Material Request; delivery status is read from that linked request.'
    ],
    actions:[
      action('Load and filter purchase records',[
        p('Require live session; call mcpa_purchase_snapshot for purchases, material requests and purchase history'),
        d('Snapshot loads?',
          ['Show setup / permission / connection error','Use Refresh after service recovery']),
        io('Search supplier, reference, purchase/request number or item description; optionally select date range'),
        d('End date is on or after start date?',
          'Show date-range error; correct the dates'),
        io('Show matching ledger rows, linked delivery status and total; show empty state if no matches')
      ],'Purchase ledger records are displayed without changing stock.'),
      action('Record a purchase',[
        io('Choose Record purchase; enter supplier, invoice/reference, date and optional Material Request / notes'),
        io('Add 1-100 item lines: description, positive quantity (3 decimals) and unit price (2 decimals)'),
        p('Preview sum of rounded line totals; optionally select PDF/JPEG/PNG/WebP receipt up to 10 MB'),
        d('Required fields and optional nonempty receipt type / size are valid?',
          'Show form / attachment error; retain input and correct it'),
        p('Upload selected receipt to private purchase-receipts bucket; retain staged path for retry'),
        d('Optional receipt upload succeeds?',
          ['Show receipt upload error; retain form','Check connection and retry the same form']),
        p('Call mcpa_save_purchase with purchase ID, null version, operation ID and complete record'),
        d('Server validates items, amounts, date, linked request, duplicate reference and receipt path?',
          ['Show server validation / duplicate / access error; retain the form','Correct input; retry same payload with its retained operation ID']),
        p('Close saved form; show Purchase saved and delivery confirmation guidance; reload ledger'),
        d('Latest ledger reload succeeds?',
          ['Show load error after the confirmed save','Use Refresh; do not submit a new purchase to recover the display'],false),
        io('Display updated purchase ledger')
      ],'Purchase, item totals and append-only purchase history are recorded; stock is unchanged.'),
      action('Edit an existing purchase',[
        io('Choose Edit; revise supplier/reference/date/link, item lines or notes; optional receipt replaces existing attachment'),
        d('Required fields, item lines and optional attachment satisfy purchase limits?',
          'Show field / attachment error; retain and correct input'),
        p('Stage replacement receipt if supplied; otherwise retain current receipt path'),
        p('Call mcpa_save_purchase with original version and payload-specific operation ID'),
        d('Original version still matches and server confirms validated save?',
          ['Show duplicate / stale / validation / service error','Reopen changed records; otherwise correct fields and retry same form']),
        p('Close saved form; show Purchase saved; reload ledger and history'),
        d('Latest ledger reload succeeds?',
          ['Show load error after the confirmed save','Use Refresh to verify the saved version before making another edit'],false),
        io('Display updated purchase and history')
      ],'Purchase version advances and before/after history is appended; stock remains unchanged.'),
      action('Inspect purchase and open linked procurement',[
        io('Choose View or follow purchase?record=ID'),
        d('Purchase remains in the authorized loaded snapshot?',
          'Show purchase unavailable / access denied message',false),
        io('Display supplier, reference/date, recorder, delivery status, item totals, notes and before/after history'),
        io('If linked, choose Open Material Requests to navigate to consumables')
      ],'Purchase details and the corresponding procurement module are available read-only.'),
      action('Open private receipt',[
        io('Choose Open private receipt on an attached purchase'),
        p('Open blank tab; request a 300-second signed URL from purchase-receipts'),
        d('Authorized receipt URL is returned?',
          ['Close blank tab; show receipt access / connection failure','Retry after connection or access recovery']),
        d('Browser opened the receipt tab?',
          ['Show Allow popups message','Allow popups and retry opening the receipt']),
        io('Navigate tab to signed receipt URL')
      ],'The existing private receipt opens with a temporary authorized URL.'),
      action('Cancel an unsaved purchase form',[
        io('Choose Cancel or press Escape'),
        d('Discard unsaved changes when confirmation is required?',
          'Keep the purchase form and its current edits',false),
        p('Close form; clear editing/staged references; restore focus')
      ],'Unsaved purchase form is closed without a ledger save.')
    ]
  },
  {
    key:'reports',title:'Reports / Current and Historical Monitoring',roles:A,
    sources:[
      s('1-admin/modules/reports/reports.js',17,'Current inventory, historical snapshot and movement report views'),
      s('1-admin/modules/reports/reports.js',41,'Period load, invalid range and RPC failures'),
      s('1-admin/modules/reports/reports.js',75,'Export uses applied reporting period and actual visible report rows'),
      s('supabase/migrations/202610100006_monitoring.sql',201,'Admin-only report RPC and inclusive maximum 367-day date range'),
      s('supabase/migrations/202610100006_monitoring.sql',156,'Prospective server-clock weekly snapshots; scheduler role only'),
      s('js/pdf-reports.js',108,'Export guards, library loading, PDF generation and download failure')
    ],
    notes:[
      'Only Admin has the Reports route. Duplicate engineer reports files are not a supported route.',
      'Current inventory is present-day truth even when the selected period is historical.',
      'Historical inventory is an existing prospective saved observation; no past inventory reconstruction is implemented.',
      'Weekly capture depends on the installed monitoring scheduler; this documentation does not run it.'
    ],
    actions:[
      action('Load reporting period',[
        io('Select start and end dates; default is first day of current Manila month through today'),
        d('Both dates are present, ordered and at most 367 days inclusive?',
          'Show valid-range error; correct dates and select Load report'),
        p('Call mcpa_monitoring_report(start,end); server verifies Admin access'),
        d('Report RPC returns authorized data?',
          ['Show setup / permission / invalid-range / connection error; disable export','Retry Load report after correction or recovery']),
        p('Populate current inventory, saved period snapshots and movement events; restore valid snapshot selection'),
        io('Display selected report kind; mark this period as loaded for export')
      ],'A reporting period is applied to saved snapshots and movement history.'),
      action('View current inventory report',[
        io('Choose Current inventory'),
        p('Use current tools from loaded report; exclude zero-quantity records'),
        io('Display equipment ID, name, project, holder, quantity, status and availability'),
        io('Show generated-at Manila time and explain current inventory is present-day')
      ],'Present-day inventory is shown independently of historical date filters.'),
      action('View saved historical inventory snapshot',[
        io('Choose Historical inventory and select an available captured snapshot'),
        d('A saved snapshot exists in the loaded period?',
          ['Show no snapshot and first available date, or scheduler guidance','Choose another period and load it; historical inventory is never reconstructed']),
        p('Use the selected snapshot tools; exclude zero-quantity rows'),
        io('Display captured inventory and its actual Manila capture time')
      ],'An immutable saved inventory observation is displayed.'),
      action('View movement history report',[
        io('Choose Movement history'),
        p('Use saved operation events from start through end inclusive in Manila time'),
        io('Display timestamp, action, reference, recorder, tool IDs and details, or no-records empty state')
      ],'Recorded movement events in the applied period are displayed.'),
      action('Export selected report PDF',[
        io('Select Export PDF after loading the desired report kind and period'),
        d('Selected date inputs still match the loaded reporting period?',
          ['Disable export and show Select Load report to apply this period','Load the changed period before exporting']),
        p('Capture selected report rows, scope, inclusive period and snapshot identity / capture time if applicable'),
        ...pdf()
      ],'The selected authorized report is downloaded as a local PDF.')
    ]
  },
  {
    key:'activity',title:'Activity Logs / Saved Movement Audit',roles:R,
    sources:[
      s('js/movement-overview.js',26,'Activity rows and stable movement deep links'),
      s('js/movement-overview.js',89,'Authorized MovementStore reads, failure and retry'),
      s('js/movement-overview.js',159,'Filtered activity PDF export'),
      s('js/movement-overview.js',187,'Exact activity-ID detail and unavailable record'),
      s('js/navigation.js',70,'Action/entity-ID movement route resolution'),
      s('js/pdf-reports.js',108,'Same-account authorization and local PDF generation')
    ],
    notes:['Activity is read-only and contains saved movement actions, not invented general application analytics.'],
    actions:[
      action('Read and search authorized activity',[
        p('Refresh MovementStore authorized snapshot; sort activity newest first'),
        d('Movement activity loads?',
          ['Show Records could not load with Retry','Select Retry; interrupted automatic updates retain prior records']),
        io('Enter reference, tool ID, person, action or summary search'),
        p('Filter authorized activity by matching action, entity ID, actor, summary or tool ID'),
        io('Show timestamp, action/reference, recorded-by name and details, or no matching activity')
      ],'Matching saved movement events are displayed within the account scope.'),
      action('Inspect an activity or open its movement record',[
        io('Follow activity?record=event-ID, or select a linked movement action in the table'),
        d('Exact activity record remains authorized and loaded?',
          'Show activity no longer available / access denied feedback',false),
        p('For activity detail show only the exact event; for movement link resolve stable entity ID and action'),
        d('Linked movement route is authorized?',
          'Display access denial or unavailable record in the owning module',false),
        io('Show activity dialog or open the corresponding request / transfer / return / repair / missing record')
      ],'The saved activity or its referenced authorized movement record is displayed.'),
      action('Export filtered activity PDF',[
        io('Enter optional search; choose Export PDF'),
        p('Capture every authorized matching loaded activity row and the search / account scope'),
        ...pdf()
      ],'A local PDF contains all loaded activity matching the current search.')
    ]
  },
  {
    key:'users',title:'People and Accountability / Account Management',roles:A,
    sources:[
      s('1-admin/modules/users/users.js',1,'Admin-only live people/account module'),
      s('1-admin/modules/users/users.js',55,'Capabilities, people reads, invoke/save helper and mutation status handling'),
      s('1-admin/modules/users/users.js',105,'Invite, development creation, recovery, role/status and retry actions'),
      s('supabase/functions/manage-accounts/handler.mjs',19,'Origin/session/Admin validation and account service actions'),
      s('supabase/functions/manage-accounts/handler.mjs',52,'Capability-gated development-account creation and durable retry'),
      s('supabase/functions/manage-accounts/handler.mjs',85,'Invitation prepare/claim/email/finish/release lifecycle'),
      s('supabase/migrations/202610060001_account_management.sql',65,'Save-account validation, protected Admin and immutable Auth links'),
      s('supabase/migrations/202610060001_account_management.sql',113,'Durable invitation validations, leases and identity checks'),
      s('supabase/migrations/202610060003_development_accounts.sql',26,'Distinct test identity, durable lease, verified Auth linking and current account-list extension')
    ],
    notes:[
      'Invitations and development creation are conditional implemented features; availability is read from server capabilities.',
      'These diagrams document existing account mutations only; this documentation task invokes none of them.',
      'New account roles are Engineer, Architect, Secretary or Tool Handler. Creating new Admin accounts is disallowed here.',
      'Existing equipment custody and history remain attached to the stable company-person profile.'
    ],
    actions:[
      action('Load people, account capabilities and search',[
        p('Require live Admin; call mcpa_accounts and manage-accounts capabilities'),
        d('People load?',
          ['Show People unavailable; watch retries automatically','Refresh after Admin access / account-migration recovery']),
        io('Show name, email, authorized role, status, linked/invitation state and applicable actions'),
        p('Enable invitations only when configured; reveal Development / Testing Only only when enabled'),
        io('Search by name, email or role; show matching people or no-match state')
      ],'Company identities and only currently available account actions are displayed.'),
      action('Invite an existing or new company person',[
        d('Production email invitations capability is enabled?',
          'Keep Send Invitation disabled and display configuration status',false),
        io('Select existing unlinked person or enter new name; enter email and supported non-Admin role'),
        io('If a new person shares an existing name, explicitly confirm a distinct person'),
        d('Name/email/role valid; profile unlinked; duplicate identity rules satisfied?',
          ['Show field / duplicate / existing-Auth error','Correct identity; use the actual existing profile or verified recovery linking']),
        p('Invoke manage-accounts invite with durable invitation ID; server verifies active Admin and origin'),
        p('Prepare invitation/profile; claim a lease; send invitation email unless prior Auth step is confirmed'),
        d('Email / durable invitation finalization succeeds?',
          ['Release lease when possible; retain durable job and company person','Show rate-limit / service error; retry the existing invitation after recovery']),
        p('Finish verified Auth link; set profile active; append account audit'),
        io('Close invite panel; reload people and capabilities; show sent or already-sent confirmation')
      ],'A verified invitation is linked to one company identity; recipient receives account setup email.'),
      action('Retry a prepared invitation',[
        io('Choose Retry invitation on a durable unfinished job'),
        p('Invoke manage-accounts retry using the same job ID'),
        d('Job exists, lease is available and Auth identity still matches?',
          ['Show changed-link / active-lease / email identity error','Wait for lease expiry or correct identity through verified recovery; retry existing job']),
        p('Claim job; send email only if required; finish the existing verified Auth link'),
        d('Invitation finishes?',
          ['Show delivery / link service error; keep job','Retry existing invitation after connection / SMTP recovery']),
        io('Reload people; show sent or existing invitation account linked')
      ],'The original invitation completes without creating a second company identity.'),
      action('Resend an unaccepted invitation',[
        io('Choose Resend invitation on active invitation-pending person'),
        p('Invoke manage-accounts resend for original invitation ID'),
        d('One-minute resend wait elapsed; lease free; invitation not accepted and account active?',
          ['Show wait / inactive / accepted / changed-identity message','Wait as instructed or use password recovery for an accepted account']),
        p('Claim original invitation; send email and verify/finalize the same account link'),
        d('Email resend and finalization succeed?',
          ['Show rate-limit / email service error; retain durable invitation','Retry this invitation after service recovery']),
        io('Reload list and capabilities; display invitation sent')
      ],'The existing unaccepted invitation is resent subject to identity and rate-limit checks.'),
      action('Create a development test account when enabled',[
        d('Development-account capability is enabled?',
          'Hide Development / Testing Only creation panel',false),
        io('Enter distinct test name/email, Engineer or Architect role and a 12-128 character temporary password'),
        d('Fields valid and a new test identity is allowed?',
          'Display invalid-field / existing-name / existing-email error; correct the test details'),
        p('Invoke createDevelopmentAccount; prepare/claim durable job; create confirmed Auth account only if absent'),
        d('Auth creation and verified profile linking succeed?',
          ['Release lease when possible; show service / rate-limit error; clear password','Retry unfinished job with original details and original password']),
        p('Finish active test-profile link and audit; preserve an already-created account password on retry'),
        io('Reload people/capabilities; clear temporary password; show test-account creation / link confirmation')
      ],'A real enabled test login is created or its original durable job completes without sending email.'),
      action('Edit authorized role or deactivate / reactivate account',[
        io('Choose Edit access; select supported authorized role and Active / Inactive status'),
        p('Call mcpa_save_account with stable person ID and unchanged Auth account link'),
        d('Admin, link and status rules pass?',
          ['Reject self-removal of Admin, new Admin promotion, active unlinked profile or prepared invitation','Show specific account error; correct permitted settings and retry']),
        p('Update profile role / status; append applicable account audit events'),
        d('Updated people list reloads?',
          ['Show action completed but list refresh failed','Refresh the people list before another account change'],false),
        io('Close edit panel; show account access updated')
      ],'Account access changes while stable person accountability remains attached.'),
      action('Link an existing Auth account through verified recovery',[
        io('Open Advanced / Recovery; verify actual person/email in Supabase Authentication externally'),
        io('Select unlinked company person or create a new person; supply supported role, verified Auth UUID and status'),
        d('Required identity fields and Auth UUID format are valid?',
          'Keep form open; correct verified identity / UUID'),
        p('Call mcpa_save_account; server verifies existing Auth identity and immutable existing links'),
        d('Auth account exists, is not linked elsewhere, and all identity / Admin rules pass?',
          ['Reject duplicate person, reassigned link, new Admin or invalid activation','Show error; verify the intended identity and retry correct linking']),
        io('Reset recovery form; reload people; show account linked and accountability retained')
      ],'An already-existing verified Auth account is linked to the intended stable company person.'),
      action('Inspect account access history',[
        io('Open Account access history and choose Load recent history'),
        p('Read latest 100 mcpa_account_audit rows ordered newest first'),
        d('Audit read succeeds?',
          ['Display history unavailable message','Retry Load recent history after recovery']),
        io('Show event, affected person, acting Admin and Manila timestamp, or no changes recorded')
      ],'Recent account access audit events are displayed read-only.')
    ]
  },
  {
    key:'settings',title:'My Account / Display Preferences and Sign Out',roles:R,
    sources:[
      s('js/app.js',89,'All authorized roles load the shared Admin settings module'),
      s('1-admin/modules/settings/settings.js',1,'Actual settings identity, theme and logout actions'),
      s('js/app.js',154,'Apply/toggle theme and best-effort localStorage persistence'),
      s('js/auth.js',141,'Local signout, application cleanup, confirmation and retry')
    ],
    notes:[
      'Settings displays existing authorized identity. Role edits occur only in Admin People and Accountability.',
      'Password reset is reached after signout through Forgot password; it is part of authentication documentation.'
    ],
    actions:[
      action('View authorized account identity',[
        p('Read current MCPAAuth profile'),
        d('A signed-in profile exists?',
          'Do not initialize protected settings; return through the authentication flow',false),
        io('Display person name, authorized role and live/demo account status'),
        io('Show administrator role-management guidance and signout / Forgot password instructions')
      ],'The existing authorized identity is displayed without account mutation.'),
      action('Change light / night mode',[
        io('Select Change light / night mode'),
        p('Toggle dark class, theme icon, label and pressed state; respect reduced-motion preference'),
        p('Attempt to store mcpa.theme in localStorage; storage failure leaves the active display theme applied'),
        io('Display the selected theme; restore theme control after any transition')
      ],'Display preference changes in the browser without changing server records.'),
    ]
  },
  {
    key:'global-search',title:'Global Search / Authorized Record Discovery',roles:R,
    sources:[
      s('js/global-search.js',9,'Role-aware display-field index and exact record routes'),
      s('js/global-search.js',64,'Parallel existing repositories and no broad fallback for failed personal read'),
      s('js/global-search.js',127,'Debounced search, partial errors, result selection and retry'),
      s('js/navigation.js',109,'Navigation authorization and exact-record activation')
    ],
    notes:[
      'This shared utility is included separately so implemented search behavior is not omitted.',
      'Search indexes explicit authorized display fields. It does not search users, raw SQL, hidden fields or invented saved reports.',
      'Engineer/Architect equipment is read through the personal-equipment RPC; failed personal read never falls back to a broader catalog.',
      'Admin additionally indexes Purchases, Materials and the three real Reports views.'
    ],
    actions:[
      action('Search records available to the current account',[
        io('Enter words, equipment ID, person, or reference in global search; maximum 300 characters'),
        d('Query is nonblank and an account identity exists?',
          'Close results until a signed-in account enters a nonblank query',false),
        p('Wait 180 ms; reuse valid same-identity cache for up to 30 seconds or read authorized repositories'),
        p('Read movements, allowed equipment/project data and permitted purchase/material sources in parallel'),
        d('All requested repositories load?',
          ['Show available results with names of failed sources','Clear and retry to recover missing sources; no broader-access fallback']),
        p('Match every lowercase query term across visible title, reference, module and context fields'),
        io('Group results by module; show first 40 and total; show No matching records when none')
      ],'Only authorized display-field matches are offered.'),
      action('Show more or open a matching record',[
        io('Choose Show more for another 40 results, or select a result by click / arrow keys and Enter'),
        d('Selected result belongs to the current account cache?',
          'Discard stale selection after identity change; search again',false),
        p('Close search; navigate to the exact record route; enforce current route permission'),
        d('Target record is still available and authorized?',
          ['Show owning-module unavailable / access-denied feedback','Return to search and refresh matches']),
        io('Open equipment, project, movement, activity, purchase, material history/request, or a real Reports view')
      ],'The owning module opens the exact selected authorized record.'),
      action('Clear or close search',[
        io('Choose Clear, press Escape, or click outside results'),
        p('Cancel pending search generation; close result panel; Clear also empties query and restores input focus'),
        p('Invalidate cached results after movement change or identity/session reset')
      ],'Search is dismissed without changing application records.')
    ]
  },
  {
    key:'notifications',title:'Notifications / Own-Recipient Monitoring',roles:R,
    sources:[
      s('js/monitoring.js',9,'Live activity-route eligibility and configuration-error handling'),
      s('js/monitoring.js',56,'Own snapshot read, refresh serialization and retries'),
      s('js/monitoring.js',81,'Mark-all serialized writes, partial failure and reconciliation'),
      s('js/monitoring.js',111,'Individual notice read acknowledgment and record navigation'),
      s('supabase/migrations/202610100006_monitoring.sql',128,'Own-recipient notification snapshot and overdue scope'),
      s('supabase/migrations/202610100006_monitoring.sql',145,'Only current recipient can mark an existing notice read')
    ],
    notes:[
      'Only live sessions with Activity route use notifications; offline demo bell opens Activity instead.',
      'Notification-generation and weekly-snapshot scheduler operations are server-owned background jobs, not user-triggered actions.',
      'Admin overdue overview is company-wide; Engineer/Architect overdue overview is filtered to its receiver profile.',
      'Old notifications are not backfilled; installed migrations and scheduler state require deployment verification.'
    ],
    actions:[
      action('Open and refresh own notifications',[
        io('Select notification bell in a live session'),
        p('Call mcpa_monitoring_snapshot; read own notifications, unread count and authorized overdue records'),
        d('Monitoring snapshot has valid notifications and overdue arrays?',
          ['Show service error; retain last loaded notices with stale warning','Try Again for connection errors; Retry after setup for missing service / permission failures']),
        p('Sort notices newest first; update unread bell; subscribe to notification changes'),
        io('Show Manila timestamps, unread status, overdue references and explicit empty state')
      ],'Current-recipient notification records and permitted overdue summary are displayed.'),
      action('Open one notice and acknowledge it',[
        io('Select a displayed notification'),
        p('If unread, call mcpa_monitoring_mark_read with this notice ID; verify same active profile'),
        d('Own-recipient mark-read is confirmed, or the notice was already read?',
          ['Show read state not confirmed; keep notification dialog','Retry selecting the notice; setup / permission failures need service correction']),
        p('Update local read time/count; resolve stable record route from notice kind and data'),
        d('Current role can access the resolved destination?',
          'Close dialog and refresh notices without opening an unauthorized route',false),
        io('Open request, transfer, return, repair, missing, reports, masterlist or activity; refresh notice state')
      ],'The notice is acknowledged and its allowed record destination opens.'),
      action('Mark all currently loaded unread notices',[
        io('Choose Mark all as read after notices load'),
        p('Freeze the IDs of currently loaded unread notices; disable overlapping writes'),
        p('For each ID, call mcpa_monitoring_mark_read; update count only after server confirmation'),
        d('Every frozen notice write succeeds?',
          ['Show number confirmed and partial-failure message; retain completed changes','Retry Mark all as read for notices still unread']),
        p('Re-read monitoring snapshot after all writes, including a partial failure'),
        io('Show reconciled read count; new notices received during the batch remain unread')
      ],'Confirmed notice reads are retained without erasing newly arrived unread notices.'),
      action('Open overdue request or activity logs',[
        io('Select an overdue request reference or Open activity logs'),
        p('Close notification panel and navigate to the exact request ID or activity module'),
        d('Destination route and record remain authorized?',
          'Show access denial / unavailable-record feedback in the owning module',false),
        io('Review actual overdue request or authorized activity; use its own workflow for any further action')
      ],'The referenced existing record is displayed; overdue reminders do not change custody.')
    ]
  }
];
