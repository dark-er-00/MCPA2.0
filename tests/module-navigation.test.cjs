// Runs the shipped loader/router with controlled local promises; no database or browser calls.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const loaderSource = appSource.slice(0, appSource.indexOf('function ensureModuleCSS('));
const navigationSource = fs.readFileSync(path.join(__dirname, '../js/navigation.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const fetches = [], scripts = [], opened = [], focused = [], events = [], appliedStatuses = [];
  const screens = new Map();
  const classes = () => {
    const values = new Set();
    return {add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value), toggle(value, enabled) {enabled ? values.add(value) : values.delete(value);}};
  };
  let html = '', disposed = 0, activeUI = '', targetToken = 0;
  const attributes = new Map();
  const retry = {};
  const content = {
    scrollTop: 0,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    getAttribute: name => attributes.get(name),
    get innerHTML() {return html;},
    set innerHTML(value) {
      html = value;
      screens.clear();
      if (value.startsWith('module:')) {
        const id = value.slice('module:'.length);
        screens.set('screen-' + id, {classList: classes()});
      }
    }
  };
  const sidebar = {classList: classes()};
  const location = {pathname: '/index.html', hash: '#activity'};
  const movementUI = {
    dispose() {disposed++; activeUI = ''; targetToken++;},
    cancelTarget() {targetToken++; events.push('cancel');},
    openRecord(kind, id) {
      events.push('open:' + id);
      opened.push({kind, id});
      const token = targetToken;
      return new Promise(resolve => {
        focused.push({kind, id, finish() {if (token === targetToken) focused.record = id; resolve();}});
      });
    }
  };
  const window = {
    MCPAAuth: {canRoute: () => true, profile: {role: 'admin'}, deny() {}},
    MovementUI: movementUI,
    MCPANavigation: {
      begin(route) { location.hash = '#' + route; return {}; },
      isCurrent() { return true; },
      activate(_ticket, _target, open) { return open(); }
    },
    scrollTo() {}, closeMobileSearch() {}
  };
  const context = vm.createContext({
    window, document: {
      getElementById(id) {return id === 'content' ? content : id === 'sidebar' ? sidebar : id === 'retry-module' ? retry : screens.get(id) || null;},
      querySelectorAll(selector) {return selector === '.screen' ? [...screens.values()] : [];}
    },
    location, history: {replaceState(_state, _title, hash) {location.hash = hash;}},
    MCPAPermissions: {operational: () => false}, AbortController, URLSearchParams, console,
    fetch(url, options) {return new Promise((resolve, reject) => fetches.push({url, options, resolve, reject}));},
    ensureModuleCSS() {}, showMasterlistView() {},
    loadModuleScript(mod, _source, callback, failed) {scripts.push({mod, callback, failed});}
  });
  vm.runInContext(loaderSource, context);
  vm.runInContext(navigationSource, context);
  const go = route => vm.runInContext('showScreen(' + JSON.stringify(route) + ')', context);
  const respond = async (index, screen, status = 200) => {
    fetches[index].resolve({ok: status === 200, status, text: async () => 'module:' + screen});
    await flush();
  };
  const finishScript = index => {
    const pending = scripts[index];
    if (pending.mod === 'masterlist') window.AdminEquipment = {disposed:false,dispose(){this.disposed=true;},setStatus(value){appliedStatuses.push(value);}};
    // Shipped module stubs mount the screen before their onload callback.
    const id = ({requests:'request', transfers:'transfer', dashboard:'dashboard', activity:'activity'})[pending.mod];
    if (screens.has('screen-' + id)) activeUI = id;
    pending.callback();
  };
  return {go, respond, finishScript, fetches, scripts, opened, focused, events, appliedStatuses, content, retry, location,
    get disposed() {return disposed;}, get activeUI() {return activeUI;}};
}

test('equipment shortcuts apply only the latest status after a pending module script loads and retain it on retry',async()=>{
  const app=harness();
  app.go('masterlist?status=available');
  await app.respond(0,'masterlist');
  app.go('masterlist?status=inuse');
  assert.deepEqual(app.appliedStatuses,[]);
  app.scripts[0].failed(new Error('isolated script failure'));
  app.retry.onclick();
  await app.respond(1,'masterlist');
  app.finishScript(1);
  await flush();
  assert.equal(app.location.hash,'#masterlist?status=inuse');
  assert.deepEqual(app.appliedStatuses,['inuse']);
  app.go('masterlist?status=all');await flush();
  assert.deepEqual(app.appliedStatuses,['inuse','all']);
});

test('same pending module fetch serves the latest requested record after its script is ready', async () => {
  const app = harness();
  app.go('request?record=REQ-FIRST');
  app.go('request?record=REQ-LATEST');
  assert.equal(app.fetches.length, 1, 'Repeated requests coalesce instead of fetching the same module twice');
  assert.equal(app.opened.length, 0);
  await app.respond(0, 'request');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.opened.length, 0, 'Record opening waits for the owning script');
  app.finishScript(0);
  assert.equal(app.location.hash, '#request?record=REQ-LATEST');
  assert.deepEqual(app.opened, [{kind:'request', id:'REQ-LATEST'}]);
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
});

test('requesting another target while a module script loads replaces its activation callback', async () => {
  const app = harness();
  app.go('request?record=REQ-FIRST');
  await app.respond(0, 'request');
  app.go('request?record=REQ-LATEST');
  assert.equal(app.opened.length, 0, 'The second route cannot reuse an unmounted screen');
  assert.equal(app.fetches.length, 1);
  app.finishScript(0);
  assert.deepEqual(app.opened, [{kind:'request', id:'REQ-LATEST'}]);
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
});

test('returning to a loaded module cancels an intervening load without disposing its working controls', async () => {
  const app = harness();
  app.go('request');
  await app.respond(0, 'request');
  app.finishScript(0);
  const before = app.disposed;
  app.go('transfer?record=TRF-STILL-LOADING');
  assert.equal(app.disposed, before, 'Current controls stay mounted until replacement HTML wins');
  assert.equal(app.activeUI, 'request');
  app.go('request');
  assert.equal(app.fetches[1].options.signal.aborted, true);
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
  assert.equal(app.activeUI, 'request');
  await app.respond(1, 'transfer'); // A transport can finish after abort; it must remain obsolete.
  assert.equal(app.content.innerHTML, 'module:request');
  assert.equal(app.disposed, before);
  assert.equal(app.scripts.length, 1);
  assert.equal(app.location.hash, '#request');
});

test('retrying a failed notification module load preserves the complete stable record route', async () => {
  const app = harness();
  const id = 'existing & unusual/#?record';
  app.go('request?record=' + encodeURIComponent(id));
  await app.respond(0, 'request', 503);
  assert.equal(app.location.hash, '#request?record=' + encodeURIComponent(id), 'Refresh retains the failed target');
  assert.equal(typeof app.retry.onclick, 'function');
  app.retry.onclick();
  await app.respond(1, 'request');
  app.finishScript(0);
  assert.equal(app.location.hash, '#request?record=' + encodeURIComponent(id));
  assert.deepEqual(app.opened, [{kind:'request', id}]);
});

test('plain navigation to the same module cancels an outstanding record focus', async () => {
  const app = harness();
  app.go('request?record=REQ-OLD');
  await app.respond(0, 'request');
  app.finishScript(0);
  const pending = app.focused[0];
  app.go('request');
  pending.finish();
  await flush();
  assert.equal(app.location.hash, '#request');
  assert.equal(app.focused.record, undefined, 'An obsolete record read cannot refocus the screen');
  assert.deepEqual(app.events, ['cancel', 'open:REQ-OLD', 'cancel']);
});

test('a failed module script retries the latest target without activating incomplete markup', async () => {
  const app = harness();
  app.go('request?record=REQ-FIRST');
  await app.respond(0, 'request');
  app.go('request?record=REQ-LATEST');
  assert.equal(typeof app.scripts[0].failed, 'function');
  app.scripts[0].failed(new Error('Isolated script download failure'));
  assert.equal(app.location.hash, '#request?record=REQ-LATEST');
  assert.equal(app.opened.length, 0);
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
  app.retry.onclick();
  await app.respond(1, 'request');
  app.finishScript(1);
  assert.equal(app.location.hash, '#request?record=REQ-LATEST');
  assert.deepEqual(app.opened, [{kind:'request', id:'REQ-LATEST'}]);
});

test('an obsolete module script callback cannot activate its record after another module wins', async () => {
  const app = harness();
  app.go('request?record=REQ-OBSOLETE');
  await app.respond(0, 'request');
  app.go('transfer?record=TRF-CURRENT');
  await app.respond(1, 'transfer');
  app.finishScript(1);
  app.finishScript(0);
  assert.equal(app.location.hash, '#transfer?record=TRF-CURRENT');
  assert.equal(app.activeUI, 'transfer');
  assert.deepEqual(app.opened, [{kind:'transfer', id:'TRF-CURRENT'}]);
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
});

test('a failed replacement disposes the previous screen before displaying the error', async () => {
  const app = harness();
  app.go('request');
  await app.respond(0, 'request');
  app.finishScript(0);
  const before = app.disposed;
  app.go('transfer?record=TRF-EXISTING');
  await app.respond(1, 'transfer', 503);
  assert.equal(app.disposed, before + 1);
  assert.equal(app.activeUI, '');
  assert.equal(app.content.getAttribute('aria-busy'), undefined);
  assert.equal(app.location.hash, '#transfer?record=TRF-EXISTING');
});
