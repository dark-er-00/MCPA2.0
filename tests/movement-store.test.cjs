const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const dataScript = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const storeScript = fs.readFileSync(path.join(root, 'js/movement-store.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function browser(options = {}) {
  const saved = options.saved || new Map();
  const events = [];
  const listeners = {};
  let failWrites = false;
  const window = {
    MCPAAuth: {isDemo:true,profile:options.engineer ? {role:'engineer',name:'Engr Sky'} : {role:'admin',name:'Engr Pau'}},
    location: { pathname: options.engineer ? '/2-engr/index.html' : '/index.html' },
    console,
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => { if (failWrites) throw Error('Quota exceeded'); saved.set(key, value); },
    },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    dispatchEvent: event => { events.push(event); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  const sandbox = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(path.join(root,'js/display.js'),'utf8'), sandbox);
  vm.runInContext(dataScript, sandbox);
  const tools = vm.runInContext('TOOLS', sandbox);
  vm.runInContext(storeScript, sandbox);
  const api = window.MovementDemoStore;
  return {
    api, window, tools, saved, events,
    activate: () => api.activate(),
    engineer: () => { window.MCPAAuth.profile={role:'engineer',name:'Engr Sky'}; },
    admin: () => { window.MCPAAuth.profile={role:'admin',name:'Engr Pau'}; },
    failWrites: value => { failWrites = value; },
    storageEvent: () => listeners.storage({ key: api.storageKey }),
    tamper: mutate => {
      const state = JSON.parse(saved.get(api.storageKey));
      mutate(state);
      saved.set(api.storageKey, JSON.stringify(state));
    },
  };
}
const tool = (api, id) => api.getState().tools.find(item => item.id === id);
const transferInput = (toolIds = ['GRD-002']) => ({ toolIds, destination: 'San Gabriel', receiver: 'Engr Sky', notes: 'Site handover' });
const good = toolIds => toolIds.map(toolId => ({ toolId, condition: 'good' }));
function handover(browser, toolIds = ['GRD-002']) {
  const transfer = browser.api.createTransfer(transferInput(toolIds));
  browser.engineer();
  browser.api.receiveTransfer(transfer.id, { inspections: good(toolIds) });
  return transfer;
}

test('demo activation is explicit, seeds independent of later live inventory, and restores live tools on exit', () => {
  const env = browser();
  assert.equal(env.api.isActive(), false);
  assert.equal(env.saved.size, 0);
  assert.throws(() => env.api.getState(), /Enable demo mode/);
  env.tools.splice(0, env.tools.length, { id: 'LIVE-001', name: 'Live equipment' });
  env.activate();
  assert.equal(env.tools.length, 16);
  assert.equal(env.api.getState().tools.length, 16);
  assert.equal(env.api.getState().repairs.length, 5);
  assert.equal(env.api.getState().missing.length, 2);
  env.api.deactivate();
  assert.deepEqual(plain(env.tools), [{ id: 'LIVE-001', name: 'Live equipment' }]);
});

test('request approval, allocation, release and inspected receipt persist custody across reload', () => {
  const env = browser({ engineer: true });
  env.activate();
  const request = env.api.createRequest({ ...transferInput(), purpose: 'Concrete preparation', neededUntil: '2099-12-31' });
  assert.equal(request.requester, 'Engr Sky');
  assert.equal(request.status, 'pending');
  assert.throws(() => env.api.approveRequest(request.id), /administrator/);
  assert.throws(() => env.api.releaseRequest(request.id), /administrator/);
  env.admin();
  env.api.approveRequest(request.id);
  const transfer = env.api.releaseRequest(request.id);
  assert.equal(env.api.getState().requests[0].status, 'released');
  assert.equal(tool(env.api, 'GRD-002').holder, '—');
  env.engineer();
  env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) });
  assert.equal(env.api.getState().requests[0].status, 'received');
  assert.equal(tool(env.api, 'GRD-002').holder, 'Engr Sky');
  assert.equal(tool(env.api, 'GRD-002').site, 'San Gabriel');
  assert.equal(tool(env.api, 'GRD-002').status, 'inuse');
  assert.equal(env.tools.find(item => item.id === 'GRD-002').holder, 'Engr Sky');
  const reload = browser({ saved: env.saved });
  reload.activate();
  assert.deepEqual(plain(reload.api.getState()), plain(env.api.getState()));
  assert.equal(reload.api.getState().activity.length, 4);
});

test('active transfers and approved allocations prevent double release and competing movements', () => {
  const env = browser(); env.activate();
  const request = env.api.createRequest({ ...transferInput(), purpose: 'Foundation' });
  const competing = env.api.createRequest({ ...transferInput(), purpose: 'Other project' });
  env.api.approveRequest(request.id);
  assert.throws(() => env.api.approveRequest(competing.id), /allocated/);
  assert.throws(() => env.api.createTransfer(transferInput()), /allocated/);
  assert.throws(() => env.api.reportMissing({ toolId: 'GRD-002', notes: 'Missing in stocktake' }), /allocated/);
  env.api.releaseRequest(request.id);
  assert.throws(() => env.api.releaseRequest(request.id), /Approve/);
  assert.throws(() => env.api.createTransfer(transferInput()), /awaiting receipt/);
  assert.throws(() => env.api.reportRepair({ toolId: 'GRD-002', notes: 'Broken handle' }), /awaiting receipt/);
});

test('rejection requires administrator and a reason, then releases the approved allocation', () => {
  const env = browser(); env.activate();
  const request = env.api.createRequest({ ...transferInput(), purpose: 'Foundation' });
  env.api.approveRequest(request.id);
  assert.throws(() => env.api.rejectRequest(request.id, ''), /reason is required/);
  env.engineer();
  assert.throws(() => env.api.rejectRequest(request.id, 'No longer needed'), /administrator/);
  env.admin();
  env.api.rejectRequest(request.id, 'No longer needed');
  assert.equal(env.api.getState().requests[0].status, 'rejected');
  assert.doesNotThrow(() => env.api.createTransfer(transferInput()));
});

test('receipt requires named receiver and complete inspections and cannot run twice', () => {
  const env = browser(); env.activate();
  const transfer = env.api.createTransfer({ ...transferInput(), receiver: 'Mark Reyes' });
  env.engineer();
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) }), /named receiver/);
  env.admin();
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: [] }), /Inspect every/);
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: [{ toolId: 'GRD-002', condition: 'damaged' }] }), /notes is required/);
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: good(['JHM-003']) }), /match/);
  env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) });
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) }), /already been received/);
});

test('Office returns release good/damaged custody; missing items retain accountability and open reports', () => {
  const env = browser(); env.activate();
  handover(env, ['GRD-002', 'BRN-001', 'JHM-003']);
  const returned = env.api.createReturn({
    toolIds: ['GRD-002', 'BRN-001', 'JHM-003'], destination: 'Office',
    conditions: [
      { toolId: 'GRD-002', condition: 'good' },
      { toolId: 'BRN-001', condition: 'damaged', notes: 'Bent shaft' },
      { toolId: 'JHM-003', condition: 'lost', notes: 'Absent at dispatch' },
    ],
  });
  assert.equal(tool(env.api, 'GRD-002').holder, '—');
  assert.equal(tool(env.api, 'GRD-002').status, 'available');
  assert.equal(tool(env.api, 'GRD-002').site, 'Office');
  for (const [id, status] of [['BRN-001', 'repair'], ['JHM-003', 'missing']]) {
    assert.equal(tool(env.api, id).holder, status === 'repair' ? '—' : 'Engr Sky');
    assert.equal(tool(env.api, id).site, status === 'repair' ? 'Office' : 'San Gabriel');
    assert.equal(tool(env.api, id).status, status);
  }
  assert.equal(env.api.getState().repairs[0].sourceId, returned.id);
  assert.equal(env.api.getState().missing[0].sourceId, returned.id);
});

test('damaged receipt transfers physical custody; lost receipt retains the dispatch custodian', () => {
  const env = browser(); env.activate();
  const transfer = env.api.createTransfer(transferInput(['GRD-001', 'BRC-002']));
  env.engineer();
  env.api.receiveTransfer(transfer.id, { inspections: [
    { toolId: 'GRD-001', condition: 'damaged', notes: 'Cable cut', disposition: 'accepted' },
    { toolId: 'BRC-002', condition: 'lost', notes: 'Not delivered' },
  ] });
  assert.equal(tool(env.api, 'GRD-001').status, 'repair');
  assert.equal(tool(env.api, 'GRD-001').holder, 'Engr Sky');
  assert.equal(tool(env.api, 'BRC-002').status, 'missing');
  assert.equal(tool(env.api, 'BRC-002').holder, 'Mark Reyes');
  assert.equal(tool(env.api, 'BRC-002').site, 'Casa Buena');
});

test('repair and missing resolution obey admin role and state transitions', () => {
  const env = browser(); env.activate();
  const repair = env.api.reportRepair({ toolId: 'GRD-001', notes: 'Grinding disk guard broken' });
  assert.throws(() => env.api.completeRepair(repair.id), /Start the repair/);
  env.engineer();
  assert.throws(() => env.api.startRepair(repair.id), /administrator/);
  env.admin();
  env.api.startRepair(repair.id);
  assert.equal(tool(env.api, 'GRD-001').status, 'underrepair');
  env.api.completeRepair(repair.id, { destination: 'Riverside Warehouse', notes: 'Guard replaced' });
  assert.equal(tool(env.api, 'GRD-001').status, 'available');
  assert.equal(tool(env.api, 'GRD-001').holder, '—');
  assert.throws(() => env.api.completeRepair(repair.id), /Start the repair/);
  const missing = env.api.reportMissing({ toolId: 'BRC-002', notes: 'Stocktake shortage' });
  assert.equal(tool(env.api, 'BRC-002').holder, 'Mark Reyes');
  env.engineer();
  assert.throws(() => env.api.recoverMissing(missing.id, { condition: 'good' }), /administrator/);
  env.admin();
  env.api.recoverMissing(missing.id, { condition: 'damaged', notes: 'Recovered with cracked casing' });
  assert.equal(tool(env.api, 'BRC-002').status, 'repair');
  assert.equal(env.api.getState().repairs[0].sourceId, missing.id);
  assert.throws(() => env.api.recoverMissing(missing.id, { condition: 'good' }), /already been resolved/);
});

test('engineer cannot move or report another holder equipment and unavailable records cannot move', () => {
  const env = browser({ engineer: true }); env.activate();
  assert.throws(() => env.api.createTransfer(transferInput(['GRD-001'])), /assigned to you/);
  assert.throws(() => env.api.createTransfer(transferInput(['GRD-002'])), /administrator approval/);
  assert.throws(() => env.api.createRequest({ ...transferInput(), receiver: 'Mark Reyes', purpose: 'Attempted bypass' }), /for themselves/);
  assert.throws(() => env.api.createReturn({ toolIds: ['GRD-001'], conditions: good(['GRD-001']) }), /assigned to you/);
  assert.throws(() => env.api.reportMissing({ toolId: 'GRD-001', notes: 'Lost' }), /assigned to you/);
  assert.throws(() => env.api.createTransfer(transferInput(['GRD-004'])), /not available/);
  assert.throws(() => env.api.createTransfer(transferInput(['GRD-009'])), /not available/);
});

test('failed storage write changes no in-memory tools, records, revision or notifications', () => {
  const env = browser(); env.activate();
  const transfer = env.api.createTransfer(transferInput());
  const before = plain(env.api.getState());
  const beforeTools = plain(env.tools);
  const eventCount = env.events.length;
  env.failWrites(true);
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) }), /nothing was changed/);
  assert.deepEqual(plain(env.api.getState()), before);
  assert.deepEqual(plain(env.tools), beforeTools);
  assert.equal(env.events.length, eventCount);
  env.failWrites(false);
  env.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) });
  assert.equal(env.api.getState().revision, before.revision + 1);
});

test('stale custody rejects receipt atomically even when a preceding item inspection succeeded', () => {
  const env = browser(); env.activate();
  const transfer = env.api.createTransfer(transferInput(['GRD-002', 'JHM-003']));
  env.tamper(state => { state.tools.find(item => item.id === 'JHM-003').holder = 'New custodian'; });
  assert.throws(() => env.api.receiveTransfer(transfer.id, { inspections: [
    { toolId: 'GRD-002', condition: 'damaged', notes: 'Bent handle', disposition: 'accepted' },
    { toolId: 'JHM-003', condition: 'good' },
  ] }), /Custody or condition/);
  const stored = JSON.parse(env.saved.get(env.api.storageKey));
  assert.equal(stored.tools.find(item => item.id === 'GRD-002').status, 'available');
  assert.equal(stored.repairs.length, 5);
  assert.equal(stored.transfers[0].status, 'pending');
});

test('separate tabs read current storage before writes and storage events update visible tools', () => {
  const first = browser(); first.activate();
  const second = browser({ saved: first.saved }); second.activate();
  const transfer = first.api.createTransfer(transferInput());
  assert.throws(() => second.api.createTransfer(transferInput()), /awaiting receipt/);
  second.api.receiveTransfer(transfer.id, { inspections: good(['GRD-002']) });
  first.storageEvent();
  assert.equal(first.tools.find(item => item.id === 'GRD-002').holder, 'Engr Sky');
  assert.equal(first.api.getState().transfers[0].status, 'received');
});

test('unknown manual codes or serialized payloads cannot create transfers or alter state', () => {
  const env = browser(); env.activate();
  const before = plain(env.api.getState());
  assert.equal(env.api.findTransfer('TRF-000000'), null);
  assert.equal(env.api.findTransfer('{"toolIds":["GRD-002"],"destination":"Metropolis"}'), null);
  assert.throws(() => env.api.receiveTransfer('TRF-000000', { inspections: good(['GRD-002']) }), /no longer exists/);
  assert.deepEqual(plain(env.api.getState()), before);
  const transfer = env.api.createTransfer(transferInput());
  assert.equal(env.api.findTransfer('  ' + transfer.code.toLowerCase() + '  ').id, transfer.id);
});

test('validation rejects malformed selection, nonexistent destinations, receivers and dates', () => {
  const env = browser(); env.activate();
  assert.throws(() => env.api.createTransfer(transferInput([])), /Select at least/);
  assert.throws(() => env.api.createTransfer(transferInput(['GRD-002', 'GRD-002'])), /selected twice/);
  assert.throws(() => env.api.createTransfer(transferInput(['UNKNOWN'])), /no longer exists/);
  assert.throws(() => env.api.createTransfer({ ...transferInput(), destination: 'Phantom site' }), /existing destination/);
  assert.throws(() => env.api.createTransfer({ ...transferInput(), receiver: '' }), /Receiver is required/);
  assert.throws(() => env.api.createTransfer({ ...transferInput(), receiver: 'Unknown person' }), /existing receiver/);
  assert.throws(() => env.api.createRequest({ ...transferInput(), purpose: 'x'.repeat(2001) }), /2,000/);
  assert.throws(() => env.api.createRequest({ ...transferInput(), purpose: 'Work', neededUntil: '2000-01-01' }), /in the past/);
  assert.throws(() => env.api.createRequest({ ...transferInput(), purpose: 'Work', neededUntil: '2099-02-31' }), /valid needed-until/);
  assert.equal(env.api.getState().revision, 0);
  assert.equal(env.api.createRequest({ ...transferInput(), purpose: '' }).purpose, '');
});

test('tracked bulk sets move in full and returned snapshots cannot mutate saved state', () => {
  const env = browser(); env.activate();
  const transfer = handover(env, ['SCF-010']);
  assert.equal(tool(env.api, 'SCF-010').qty, 5);
  assert.equal(tool(env.api, 'SCF-010').holder, 'Engr Sky');
  transfer.destination = 'Untrusted';
  const state = env.api.getState();
  state.tools[0].status = 'disposed';
  state.transfers[0].receiver = 'Impersonator';
  assert.notEqual(env.api.getState().tools[0].status, 'disposed');
  assert.equal(env.api.getState().transfers[0].receiver, 'Engr Sky');
});

test('damaged or cleared browser storage is not silently replaced by sample data', () => {
  const env = browser(); env.activate();
  env.saved.set(env.api.storageKey, '{broken');
  const reload = browser({ saved: env.saved });
  assert.throws(() => reload.activate(), /could not be read/);
  assert.equal(reload.api.isActive(), false);
  assert.equal(env.saved.get(env.api.storageKey), '{broken');
  env.saved.clear();
  assert.throws(() => env.api.createTransfer(transferInput()), /cleared in another tab/);
  assert.equal(env.saved.size, 0);
});

test('identifiers stay unique through reload and all successful transactions emit change events', () => {
  const env = browser(); env.activate();
  const first = env.api.createTransfer(transferInput());
  const reload = browser({ saved: env.saved }); reload.activate();
  const second = reload.api.createTransfer(transferInput(['JHM-003']));
  assert.notEqual(first.id, second.id);
  const state = reload.api.getState();
  const ids = ['requests', 'transfers', 'returns', 'repairs', 'missing', 'activity'].flatMap(name => state[name].map(item => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(reload.events.at(-1).type, 'mcpa:movement-change');
  assert.equal(reload.events.at(-1).detail.revision, state.revision);
});
