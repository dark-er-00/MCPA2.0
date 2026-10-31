const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/display.js'),'utf8'),sandbox);
const display=sandbox.window.MCPADisplay;

test('action descriptions preserve approval, receipt discrepancies and custody facts',()=>{
  const records=[
    {action:'createRequest',entityId:'REQ-12',actor:'Engr. Ana',createdAt:'2026-10-24T03:04:05.123456Z'},
    {action:'approveRequest',entityId:'REQ-12'}, {action:'releaseRequest',entityId:'TRF-12'},
    {action:'receiveTransfer',entityId:'TRF-12',summary:'Inspected: 1 accepted, 1 missing'},
    {action:'refuseTransfer',entityId:'TRF-13'}, {action:'recoverMissing',entityId:'MIS-12'}
  ];
  const before=JSON.stringify(records), events=records.map(record=>display.activity(record));
  assert.equal(events[0].title,'Equipment Request Submitted');
  assert.match(events[1].description,/reserved/);
  assert.match(events[2].description,/Receipt confirmation is still required/);
  assert.match(events[3].description,/1 accepted, 1 missing/);
  assert.doesNotMatch(events[3].description,/all equipment|all tools|good condition/i);
  assert.match(events[4].description,/Custody remained with the sender/);
  assert.doesNotMatch(events[5].description,/available for use/);
  assert.equal(events[0].reference,'REQ-12');assert.equal(events[0].actor,'Engr. Ana');
  assert.equal(JSON.stringify(records),before,'Original actions, timestamps and records are retained');
});

test('historical dispatch only implies request release when an authorized transfer records the request',()=>{
  assert.equal(display.activity({action:'request_created'}).title,display.activity({action:'createRequest'}).title);
  assert.equal(display.activity({action:'transfer_received'}).title,'Transfer Received');
  assert.equal(display.activity({action:'transfer_created',entityId:'TRF-1'}).title,'Equipment Transfer Dispatched');
  const data={transfers:[{id:'TRF-1',requestId:'REQ-1'}]};
  assert.equal(display.activity({action:'transfer_created',entityId:'TRF-1'},data).title,'Equipment Released for Transfer');
  assert.equal(display.activity({action:'transfer_created',entityId:'TRF-2'},data).title,'Equipment Transfer Dispatched');
});

test('unknown, null and prototype-like values have neutral readable fallbacks',()=>{
  for(const action of ['newInternalEvent','legacy_event_v99','constructor','__proto__',null,undefined]){
    const event=display.activity({action,summary:action,actor:'c41e1c31-9892-4e4d-991e-17d5d48c4f0c'});
    assert.equal(event.title,'Activity Recorded');assert.equal(event.actor,'User not recorded');
    if(action)assert.ok(!event.description.includes(action));
  }
  assert.equal(display.activity(null).when,'Date not recorded');
  assert.equal(display.activity({role:'tool_handler'}).actor,'Tool Handler');
  assert.equal(display.status('unsupported_state'),'Status Unavailable');
  assert.equal(display.status(null),'Status Not Recorded');
  assert.equal(display.condition('unknown_condition'),'Condition Not Recorded');
  assert.equal(display.tracking('constructor'),'Tracking Method Not Recorded');
  assert.equal(display.projectEvent('unexpected_field'),'Project Activity Recorded');
  assert.equal(display.event(null,'stock').title,'Activity Recorded');
  assert.equal(display.reference('c41e1c31-9892-4e4d-991e-17d5d48c4f0c'),'Related record unavailable');
});

test('status labels distinguish review, receipt and delivery and support historical spellings',()=>{
  assert.equal(display.status('pending','request'),'Pending Review');
  assert.equal(display.status('pending','transfer'),'Awaiting Receipt');
  assert.equal(display.status('pending','materialRequest'),'Awaiting Delivery');
  assert.equal(display.status('IN_USE'),'In Use');assert.equal(display.status('For Repair'),'For Repair');
  assert.equal(display.status('disposed'),'Retired');assert.equal(display.status('retired'),'Retired');
  assert.equal(display.status('ok','stock'),'Stock Sufficient');
  assert.equal(display.status('cancelled','materialRequest'),'Canceled');
  assert.equal(display.status('canceled','request'),'Canceled');
  assert.equal(display.numberedReference('CR',12),'CR-00012');
  assert.equal(display.numberedReference('PUR',12),'PUR-00012');
  assert.equal(display.numberedReference('CR',null),'Reference unavailable');
});

test('Manila timestamps include seconds; date-only and invalid dates remain accurate',()=>{
  assert.equal(display.dateTime('2026-10-24T16:01:02Z'),'Oct 25, 2026, 12:01:02 AM');
  assert.equal(display.date('2026-10-24'),'Oct 24, 2026');
  assert.equal(display.dateTime(new Date('2026-10-24T16:01:02Z')),display.dateTime('2026-10-24T16:01:02Z'));
  for(const value of [null,'','invalid','2026-02-30','2026-13-01','2026-02-30T12:00:00Z'])assert.equal(display.dateTime(value),'Date not recorded');
});

test('human notes survive while technical summaries and infrastructure errors receive safe wording',()=>{
  assert.match(display.activity({action:'createRequest',summary:'For concrete cutting at Site A.'}).description,/For concrete cutting at Site A/);
  assert.equal(display.activity({action:'createRequest',summary:'Requested equipment'}).description,'Submitted a new equipment request.');
  assert.equal(display.safeText('[\"internal_value\"]'),'');
  assert.equal(display.safeText('[Inspection] Guard needs replacement.'),'[Inspection] Guard needs replacement.');
  assert.equal(display.safeText('{"auth_user_id":"secret"}'),'');
  assert.equal(display.errorText({message:'column mcpa_secret does not exist'}),'The operation could not be completed. Please retry or contact your administrator.');
  assert.equal(display.errorText('Choose a condition for every tool.'),'Choose a condition for every tool.');
  assert.doesNotMatch(display.safeText('Completed receiveTransfer.'),/receiveTransfer/);
});

test('notifications preserve recipient turnover instructions and normalize other movement actions',()=>{
  const message='Inspect and test each received tool before confirming receipt.';
  assert.equal(display.notification({kind:'movement',title:'Equipment Pending Turnover',message,data:{action:'releaseRequest'}}).message,message);
  const notice=display.notification({kind:'movement',title:'receiveTransfer',message:'Received and inspected transfer',data:{action:'receiveTransfer'}});
  assert.equal(notice.title,'Transfer Received');assert.match(notice.message,/inspection and receipt outcome/);
  assert.equal(display.event('account_deactivated','account').title,'Account Deactivated');
  assert.equal(display.event('receipt','stock').title,'Requested Stock Received');
});
