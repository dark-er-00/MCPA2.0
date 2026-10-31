'use strict';
// Documentation specification only. Reviewed against current UI and checked-in SQL.
// This file does not connect to or mutate the application or database.
const roles = ['engineer', 'architect'];
const src = (path, line, note) => ({path, line, note});
const io = text => ({type:'io', text});
const process = text => ({type:'process', text});
const valid = (text, ...no) => ({type:'decision', text, no, retry:true});
const moveSources = [
  src('js/permissions.js', 6, 'Engineer and Architect share routes and operational actions.'),
  src('js/movement-ui.js', 33, 'Authorized records, tool eligibility and form fields.'),
  src('js/movement-ui.js', 397, 'Conditional follow-up forms and recorded details.'),
  src('js/movement-ui.js', 451, 'Inspection validation and submit dispatch.'),
  src('js/movement-cloud.js', 29, 'Authenticated snapshot, mutation, retained retry UUID and refresh guard.'),
  src('supabase/migrations/202610060002_recipient_identity.sql', 3, 'Movement transaction, stable recipient, custody and status outcomes.'),
  src('supabase/migrations/202610100001_engineer_portal.sql', 128, 'Active receiver and destination assignment verification.'),
  src('supabase/migrations/202610100004_movement_cancellation.sql', 65, 'Accountable field cancellation, refusal and reopening.'),
  src('supabase/migrations/202610120002_office_returns.sql', 111, 'Office-only return wrapper and damaged return custody.'),
  src('supabase/migrations/202610120003_optional_request_purpose.sql', 14, 'Latest purpose validation makes request purpose optional.'),
  src('supabase/migrations/202610200001_verified_request_inventory.sql', 12, 'Verified availability and reservation guard.')
];
const notes = [
  'Engineer and Architect have identical behavior; a combined role diagram is intended.',
  'Contract verified statically from current project files. Installation of checked-in SQL on the deployed database is unverified.',
  'Selections move whole equipment records, not a user-entered partial quantity; the server accepts 1 to 100 unique records.',
  'Live writes use mcpa_movement_action with a retained operation UUID. Uncertain network retries reuse the saved operation.',
  'A successful save followed by refresh failure blocks further writes until refresh; distinguish this from a failed transaction.',
  'Recorded AVAILABLE status does not alone prove request eligibility: damaged/missing condition and allocation guards still apply.',
  'Only actual returned statuses are documented; the UI has a discrepancy label but this reviewed transaction does not emit it.'
];
function load() {
  return [
    process('Load authorized records using mcpa_movement_snapshot'),
    valid('Did valid movement data load?', 'Show connection or setup error; preserve last loaded records when available', 'Retry connection or allow the active view to refresh'),
  ];
}
function save(action) {
  return [
    valid('Live account, action permission and latest records ready?', 'Show permission, session, busy or stale-record error', 'Refresh or sign in again before retrying'),
    process('Submit '+action+' to mcpa_movement_action with retained operation UUID'),
    valid('Did server validation and the atomic operation succeed?', 'Show server validation or connection error; keep the form', 'Correct values or refresh; retry with the same operation for unchanged values'),
    process('Refresh committed movement records and activity'),
    {type:'decision',text:'Did the saved records refresh?',retry:false,no:[
      'Saved successfully; stale guard blocks further mutations',
      'Load a fresh snapshot or reopen the module before another action; do not resubmit directly'
    ]},
  ];
}
function browse(kind, fields) {
  return {
    title:'Search and inspect '+kind+' records',
    steps:[...load(),io('Search reference, equipment, project or person; choose a status filter'),
      process('Filter loaded authorized records; sort newest first'),
      io('Select View details for a record'),
      valid('Is the record still authorized and available?', 'Show record unavailable or access denied', 'Refresh and choose an authorized record'),
      io('Read '+fields),
      process('Close details or follow the available record-specific action')],
    outcome:'Return to the filtered module list; loaded status and audit details remain visible.'
  };
}
function adjustment(title, method, eligibility, precheck, result) {
  return {title, steps:[...load(),io('Open the movement record'),
    valid(eligibility,'Action is unavailable for this account or current state','Refresh and review the accountable person and status'),
    io('Enter reason (1 to 2000 characters); tick confirmation'),
    valid('Reason and confirmation valid?','Show required-field error; keep the form','Complete the reason and confirmation'),
    process(precheck),...save(method),io('Saved: '+result)],outcome:result};
}
const inspectionValidation = [
  valid('Exactly one valid inspection for every selected tool?', 'Choose Good, Damaged or Missing for each tool once', 'Correct missing or duplicate inspection values'),
  valid('Notes supplied for damaged/missing tools, at most 2000 characters?', 'Show inspection-note validation error', 'Describe each damaged or missing tool'),
];
function receiveCase(title, entry, outcome) {
  return {title,steps:[...load(),io('Open pending handover from Receive Transfer, history or transfer code'),
    valid('Is this the pending handover named for your account?', 'Confirmation is unavailable for a different recipient or closed handover', 'Review the code, recipient and current handover status'),
    io(entry),...inspectionValidation,
    valid('All non-missing tools tested and damaged custody decisions accepted?', 'Test each received tool; explicitly accept damage or use eligible damage refusal', 'Correct inspection and custody decisions'),
    process('Server verifies all reservations and dispatch source holder, project, status and quantity'),
    ...save('receiveTransfer'),io('Saved: '+outcome),
    io('Display received transfer/request and released transfer allocation')],
    outcome:'Receipt and audit saved; personal custody and follow-up report views refresh.'};
}
function returnCase(title, condition, outcome) {
  return {title,steps:[...load(),process('Resolve configured Office with mcpa_return_destination'),
    valid('Is the active configured Office verified?', 'Disable Confirm return; show Office configuration or connection error', 'Retry Office connection or contact Admin'),
    io('Select held in-use asset records; inspect every selected item after delivery to Office'),
    valid('Own in-use tools, positive quantity and no request/transfer allocation?', 'Selected equipment is unavailable or no longer in your custody', 'Refresh and select eligible equipment'),
    io('Record '+condition+' condition; enter per-tool inspection notes and optional return notes'),
    ...inspectionValidation,
    process('Server enforces configured Office ID/name and records source custody'),...save('createReturn'),
    io('Saved: '+outcome),io('Display saved RTN source and inspection details in the refreshed module')],
    outcome:'Inspected return saved. Mixed selections apply the documented outcome independently to each tool.'};
}
module.exports = [
  {
    key:'masterlist', title:'Equipment Tracking / Personal Masterlist', roles,
    sources:[src('js/app.js', 84, 'Operational masterlist uses field module.'),src('js/movement-overview.js', 8, 'Personal custody scope.'),src('js/movement-overview.js', 58, 'Search, status, project and custody filters.'),src('js/movement-overview.js', 89, 'Personal RPC, error and retry behavior.'),src('supabase/migrations/202610100001_engineer_portal.sql', 20, 'Own holder ID only in personal snapshot.'),src('js/equipment-visual.js', 24, 'Thumbnail and image fallback.'),src('js/equipment-photos.js', 45, 'Authorized photo signed URLs and fallback.')],
    notes:['Personal Tracking contains confirmed current custody only; available request stock is a separate movement catalog.','No create, edit, delete, photo upload or custody override controls are present in this operational view.'],
    actions:[
      {title:'Load and filter personal equipment',steps:[process('Call mcpa_personal_equipment_snapshot for the signed-in account'),
        valid('Did an authorized tools array load?', 'Show personal access, setup or connection error', 'Retry; interrupted updates retain the last loaded list'),
        process('Keep only equipment whose current holder ID equals this account'),
        io('Enter search by ID, name, brand, holder, project or serial; choose status and project'),
        process('Filter personal rows and show recorded status with new-request eligibility'),
        io('Read equipment thumbnail, name, project, holder and status'),
        process('Display empty-custody message or no-matching-results state when applicable'),
        process('Refresh on watched equipment/site/notification updates, focus and reconnect')],
        outcome:'Filtered confirmed-custody inventory displayed; choose Details for tool profile.'},
      {title:'Display authorized equipment photo',steps:[io('Render a personal equipment thumbnail'),
        process('Use supported image URL or resolve a private equipment-photos storage reference'),
        process('Request authorized signed URL for private photo; cache per signed-in account'),
        valid('Did the image resolve and load?', 'Keep tool symbol and details; show Photo unavailable for failed private resolution', 'Reload or let photo hydration refresh'),
        io('Display saved photo with equipment name as alternative text')],outcome:'Equipment photo displayed; missing or invalid image uses the equipment symbol.'}
    ]
  },
  {
    key:'tool-profile',title:'Tool Profile / Equipment Details',roles,
    sources:[src('js/navigation.js', 129, 'tool-profile aliases masterlist screen and opens record.'),src('js/movement-overview.js', 74, 'Read-only equipment detail dialog and module links.')],
    notes:['Both masterlist?record=ID and tool-profile?record=ID open the same field detail dialog.','Only details actually rendered here are documented; this dialog does not expose the Admin editor.'],
    actions:[{title:'Open a personal tool profile and related history',steps:[io('Select Details or open an authorized tool-profile record link'),
      process('Find the selected asset in the loaded personal snapshot'),
      valid('Is the asset present and still accessible?', 'Show equipment unavailable or account no longer has access', 'Refresh the personal masterlist and choose an accessible tool'),
      io('Display equipment name/ID, current holder, project and recorded status/request eligibility'),
      process('Filter movement activity to entries containing this equipment ID'),
      io('Read dated movement actions, actor, reference and summary'),
      process('Open linked movement or select Request tools, Transfer, Return or Report issue'),
      process('Close details with Close/Escape; return through navigation history or personal masterlist')],outcome:'Read-only tool profile reviewed; each selected operation continues in its detailed module.'}]
  },
  {
    key:'request',title:'Requests',roles,sources:moveSources,notes:[...notes,'Purpose and needed-until are optional in current UI; optional purpose relies on migration 202610120003.','Pending requests do not reserve equipment; approval by Admin creates allocation.'],
    actions:[browse('request','status, requester, selected tools, project, purpose, due date, reason and linked handover'),
      {title:'Submit an equipment request',steps:[...load(),
        process('Find active projects assigned_engineer_id equals this account ID'),
        valid('Is at least one active project assigned?', 'Disable request submission; show no assigned project message', 'Contact Admin and refresh assigned projects'),
        io('Choose assigned project; one project is selected automatically'),
        process('Show verified requestable records: available, positive stock, no holder and no allocation'),
        io('Search available tools; choose 1 to 100 unique records; optional purpose and needed-until date'),
        valid('Selected stock still verified available?', 'Block unverified, held, reserved, damaged, missing or pending-receipt stock', 'Refresh inventory verification and choose eligible records'),
        valid('Optional purpose at most 2000 characters and date valid, today or later in Manila?', 'Show purpose/date validation error', 'Correct optional values'),
        process('Bind requester and receiving account to the authenticated Engineer/Architect'),
        ...save('createRequest'),io('Display saved pending REQ record and refreshed activity')],
        outcome:'Pending request awaits Admin approval or rejection; custody and allocation are unchanged.'},
      adjustment('Withdraw your pending request','withdrawRequest','Does this account own the pending request?',
        'Server verifies pending request has no reservation and no handover',
        'Set request withdrawn; record reason, actor and date; preserve request history'),
      adjustment('Cancel your approved reservation','cancelReservation','Own approved request with no linked transfer?',
        'Server verifies exact allocation, no created handover, stock available and no holder',
        'Set request canceled; release request allocation; preserve custody and audit history'),
      {title:'Follow approval, rejection, release and physical receipt',steps:[...load(),io('Open your request details'),
        io('Read pending, approved, rejected, withdrawn, canceled, released or received status'),
        process('For rejected requests, read the Admin reason before preparing a new request'),
        process('For approved requests, tools are reserved pending Admin release'),
        io('For released requests, copy the linked handover reference and select Open transfer'),
        process('Continue to Transfers for named-recipient inspection or eligible cancellation'),
        process('After successful receipt, show request Received / completed')],outcome:'Request history reviewed; actual receipt follows the separate Transfers workflow.'}
    ]
  },
  {
    key:'transfer',title:'Transfers',roles,sources:[...moveSources,src('supabase/migrations/202610100001_engineer_portal.sql', 67, 'Receiving QR validation and 15-minute expiry.'),src('js/movement-ui.js', 225, 'Receiving project, generate/revoke QR and scan flows.'),src('js/movement-ui.js', 570, 'Camera failures and manual alternatives.')],
    notes:[...notes,'Sending creates a reserved pending handover; custody changes only through named-recipient inspection.','A receiving QR identifies person/project before dispatch; a handover QR/code identifies a created transfer.','Receipt condition variants below share one inspection submission. Mixed selections apply each condition outcome independently.','Any eligible damaged-item refusal refuses the whole handover; it does not partially receive good items.'],
    actions:[browse('transfer','sender, named receiver, project, code, tools, notes, status, inspections and refusal/cancellation history'),
      {title:'Create a transfer using manual receiver details',steps:[...load(),io('Choose Send Transfer; select Enter Details Manually'),
        io('Choose held in-use asset records; destination project; active Engineer/Architect receiver; optional notes'),
        valid('1 to 100 unique positive-stock tools owned and in use, with no active allocation?', 'Show ownership, status, stock or reservation conflict', 'Refresh and choose eligible tools'),
        valid('Active destination assigned to the chosen active receiving account?', 'Show invalid receiver or project-assignment error', 'Choose valid details or contact Admin for assignment'),
        process('Capture dispatch source holder, project, database status and quantity for every tool'),
        ...save('createTransfer'),io('Display committed TRF reference, pending status and reserved equipment'),
        io('Share handover code/QR with named receiver; use manual code if QR display or clipboard fails')],
        outcome:'Pending transfer saved; source holder and project remain recorded until inspected receipt.'},
      {title:'Create a transfer by scanning the receiver QR',steps:[...load(),io('Choose Scan Receiver QR before creating a handover'),
        valid('Scanner loaded, HTTPS/localhost and camera access available?', 'Show scanner or camera error', 'Allow camera, retry scan or select manual receiver entry'),
        io('Scan MCPA-RECEIVER QR shown by receiving Engineer/Architect'),
        valid('Correct token format, unexpired/unrevoked, active receiver and assigned active project?', 'Show invalid, expired, revoked or changed-assignment message', 'Ask receiver for a new QR or use verified manual entry'),
        process('Resolve QR with mcpa_resolve_receiving_qr; fill receiver ID and project'),
        io('Review verified person/project; choose held in-use tools; optional handover notes'),
        valid('Eligible unique tools and QR still matches the receiver/project?', 'Show stock, custody, allocation or QR-context conflict', 'Refresh or rescan; manual field edits clear the receiving token'),
        process('Server rechecks receiving token and source custody before dispatch'),...save('createTransfer'),
        io('Share the new TRF handover code/QR with the receiver')],outcome:'Pending reserved handover created; scanning alone never changes equipment custody.'},
      {title:'Generate or replace your receiving QR',steps:[...load(),io('Choose Receive Transfer; load receiving projects'),
        process('Call mcpa_project_snapshot; keep active projects assigned to this account'),
        valid('Did assigned receiving projects load and contain an active project?', 'Show retry-projects error or no assigned receiving project message', 'Retry connection or contact Admin for assignment'),
        io('Choose receiving project; select Generate My Receiving QR'),
        process('Call mcpa_create_receiving_qr; server rechecks active assignment'),
        valid('Did QR generation succeed?', 'Show receiving QR service or assignment error', 'Refresh projects and generate again'),
        process('Revoke older account QRs; store hash of new random token; set expiry to 15 minutes'),
        {type:'decision',text:'Is the QR display library available?',retry:false,no:[
          'Show QR display unavailable; token generation already succeeded',
          'Sender can enter receiving account and assigned project manually'
        ]},
        io('Show person, project, receiving QR and expiry; share with sender'),
        process('On expiry clear QR image; generate a new QR when needed')],
        outcome:'Receiving QR available until expiry/revocation; generation and scanning do not move tools.'},
      {title:'Revoke your displayed receiving QR',steps:[
        io('Choose Revoke receiving QR for your generated receiving token'),
        process('Call mcpa_revoke_receiving_qr for this account token'),
        valid('Did QR revocation succeed?', 'Show receiving QR service error; retain displayed QR',
          'Retry revocation; existing expiry still applies'),
        process('Clear expiry timer and QR display after successful revocation'),
        io('Display receiving QR revoked; generate a new one when needed')],
        outcome:'Receiving QR revoked; this action never changes equipment custody.'},
      {title:'Find an incoming handover using its code or QR',steps:[...load(),io('Choose Receive Transfer; select an incoming record or enter the sender handover code'),
        process('Optional camera scan requires scanner support, secure context and permission'),
        valid('Camera available if scanning was selected?', 'Show camera/start error', 'Allow camera or enter handover code manually'),
        process('Refresh movement snapshot; find exact transfer reference/code'),
        valid('Did an authorized transfer match?', 'Show no transfer found; keep entered code', 'Check code and refresh the company data source'),
        io('Review handover, named recipient, tools, source, project, code and current status'),
        valid('Pending transfer addressed to this account?', 'Show waiting-for-receiver or closed/refused history; confirmation unavailable', 'Use the correct receiving account or await sender reopening'),
        process('Open per-tool inspection form')],outcome:'Correct incoming handover ready for physical inspection.'},
      receiveCase('Confirm receipt — good tools',
        'Inspect and test every tool; choose Good; optional good-condition notes',
        'For each good tool, assign named receiver and destination; set equipment in use'),
      receiveCase('Confirm receipt — accept recorded damage',
        'Inspect every tool; damaged items need notes, testing and Accept custody with recorded damage',
        'For each accepted damaged tool, assign receiver/project; set repair; open reported REP linked to transfer'),
      receiveCase('Confirm receipt — missing/not received items',
        'Inspect all tools; mark not-received items Missing and describe them; test all items actually received',
        'For each missing item, retain last holder/project; set missing; open MIS report linked to transfer'),
      {title:'Refuse damaged handover and hold it for sender',steps:[...load(),io('Open pending incoming transfer; inspect every selected item'),
        valid('Named receiver with server-projected refuseTransfer eligibility?', 'Damage refusal unavailable for this account/handover', 'Review current status and accountable sender; contact sender before accepting'),
        io('For damaged item choose Refuse damaged handover; enter inspection notes'),
        ...inspectionValidation,
        valid('Non-missing items tested and at least one damaged item declined?', 'Show test, condition or damage-refusal validation error', 'Complete all inspections and choose valid damaged-item disposition'),
        io('Enter refusal reason (1 to 2000 characters); confirm refusal'),
        valid('Reason and confirmation complete?', 'Show required reason/confirmation error', 'Complete refusal fields'),
        process('Server verifies exact reservation and unchanged dispatch custody/status/quantity'),
        ...save('refuseTransfer'),io('Display committed refusal, inspections, reason, actor and timestamp'),
        io('Display held source custody/status and reservation; await sender follow-up')],
        outcome:'Refused handover held; field sender may reopen/cancel and linked requester may cancel when eligible.'},
      adjustment('Cancel an unreceived or refused handover','cancelTransfer',
        'Pending/refused transfer owned by sender or its linked released-request owner?',
        'Server rechecks full allocation, unchanged source values and matching released request when linked',
        'Set transfer canceled; cancel linked request if present; release allocation; preserve source custody'),
      adjustment('Sender reopens a refused handover','reopenTransfer',
        'Is this account the sender of a currently refused transfer?',
        'Server rechecks exact reservation and unchanged dispatch source values',
        'Set transfer pending; save reopening reason; preserve custody/allocation; receiver inspects again')
    ]
  },
  {
    key:'return',title:'Returns to Office',roles,sources:moveSources,
    notes:[...notes,'Return destination is the configured company Office, not a free project destination.','Good/damaged/missing are per-tool outcomes in the same return submission; mixed selections apply independently.','Return confirmation follows physical delivery and inspection. Missing items are reported without fabricating a physical return.'],
    actions:[browse('return','source tools, returned-by person, Office destination, return notes and recorded conditions'),
      returnCase('Confirm Office return — good tools','Good (notes optional)',
        'For each good tool: set Office site, clear holder and set available'),
      returnCase('Confirm Office return — damaged tools','Damaged with mandatory damage notes',
        'For each damaged tool: set Office site, clear holder, set repair and open reported REP linked to RTN'),
      returnCase('Confirm return inspection — missing items','Missing with mandatory circumstances notes',
        'For each missing item: keep last holder/site, set missing and open MIS report linked to RTN')
    ]
  },
  {
    key:'repair',title:'Repairs / Damage Reports',roles,sources:moveSources,
    notes:[...notes,'Field personnel report damage and monitor follow-up; only Admin starts and completes repairs.','Direct field damage report retains the current holder/project; an Office return with damage clears custody separately.'],
    actions:[
      {title:'Report damage or a repair issue',steps:[...load(),
        io('Choose one equipment record in your current in-use custody'),
        valid('Positive-stock own in-use tool with no request or transfer allocation?', 'Selected tool is unavailable, allocated or outside your custody', 'Refresh and choose eligible equipment'),
        io('Enter required damage/issue details (1 to 2000 characters)'),
        valid('Damage details valid?', 'Show required or overlength notes error', 'Describe the fault and correct the notes'),
        ...save('reportRepair'),io('Display saved reported REP; equipment repair with recorded holder/project retained')],
        outcome:'Repair report added to Admin queue; equipment is unavailable pending repair resolution.'},
      browse('repair','reported, under repair or completed status; reporter, fault notes, recorded conditions and resolution'),
      {title:'Track Admin repair progress and completion',steps:[...load(),io('Open your authorized repair report'),
        io('Read reported, under repair or completed status and resolution notes'),
        process('Reported remains unavailable until Admin starts repair'),
        process('Admin starts repair: report becomes underrepair; tool remains unavailable'),
        io('Admin completion: report completed; chosen project saved; holder cleared; recorded status available'),
        process('Apply condition and reservation checks separately before showing request eligibility'),
        process('Refresh personal custody and movement history after the update')],
        outcome:'Field personnel review saved repair progress; no field start/complete action is exposed.'}
    ]
  },
  {
    key:'missing',title:'Missing Tools',roles,sources:moveSources,
    notes:[...notes,'Field personnel report missing equipment and inspect recovery history; only Admin records recovery.','Initial missing report preserves last holder/project for accountability.'],
    actions:[
      {title:'Report a missing tool',steps:[...load(),
        io('Choose one equipment record in your current in-use custody'),
        valid('Positive-stock own in-use tool with no request or transfer allocation?', 'Tool already unavailable, allocated or outside your custody', 'Refresh and choose eligible equipment'),
        io('Enter last-seen details and circumstances (1 to 2000 characters)'),
        valid('Missing details valid?', 'Show required or overlength notes error', 'Describe the last known location and circumstances'),
        ...save('reportMissing'),io('Display saved MIS; equipment missing with last holder/project retained')],
        outcome:'Missing report saved in Admin register; equipment cannot be requested while missing.'},
      browse('missing','missing/recovered status, reporter, last-seen notes, recorded condition and recovery details'),
      {title:'Review Admin recovery outcome',steps:[...load(),io('Open your authorized missing report'),
        io('Read missing or recovered state and saved recovery notes'),
        process('While missing, last holder/project remains recorded and equipment unavailable'),
        io('Good recovery: report recovered; chosen site saved; holder cleared; recorded status available'),
        process('Apply condition and reservation checks separately before showing request eligibility'),
        process('Damaged recovery by Admin: report recovered; holder cleared; equipment repair; new reported REP created'),
        process('Follow authorized repair record for damage follow-up and refreshed equipment status')],
        outcome:'Recovery history reviewed; only Admin supplies recovery inspection and resolution.'}
    ]
  }
];
