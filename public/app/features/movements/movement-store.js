/* Browser-only demonstration workflow. This store never writes to Supabase.
 * activate() must be called explicitly before sample data becomes visible.
 * Roles here demonstrate UI behavior; production authorization belongs in the database.
 */
(function (global) {
  'use strict';
  var KEY = 'mcpa.movement.demo.v1';
  var VERSION = 1;
  var state = null;
  var active = false;
  var originalTools = null;
  var subscribers = new Set();
  var seedTools = typeof TOOLS !== 'undefined' ? clone(TOOLS) : [];
  var collections = ['tools', 'sites', 'users', 'requests', 'transfers', 'returns', 'repairs', 'missing', 'activity'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message) { throw new Error(message); }
  function context() {
    if (global.MCPAAuth) {
      if (!global.MCPAAuth.isDemo) fail('Open the offline demonstration to use sample records.');
      const user=global.MCPAAuth.profile;
      return {role:user.role === 'architect' ? 'engineer' : user.role,name:user.name};
    }
    fail('Open the offline demonstration before selecting sample records.');
  }
  function requireAdmin() {
    if (context().role !== 'admin') fail('Only an administrator can perform this action.');
  }
  function text(value, label, required) {
    var result = typeof value === 'string' ? value.trim() : '';
    if (required && !result) fail(label + ' is required.');
    if (result.length > 2000) fail(label + ' must be 2,000 characters or fewer.');
    return result;
  }
  function id(next, prefix) {
    next.sequence += 1;
    return prefix + '-' + String(next.sequence).padStart(6, '0');
  }
  function now() { return new Date().toISOString(); }
  function requestDate(value) {
    var date = text(value, 'Needed until');
    if (!date) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('Choose a valid needed-until date.');
    var localDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (date < localDate) fail('The needed-until date cannot be in the past.');
    return date;
  }
  function seeded() {
    var next = { version: VERSION, revision: 0, sequence: 0, tools: clone(seedTools), sites: [], users: [], requests: [], transfers: [], returns: [], repairs: [], missing: [], activity: [] };
    var timestamp = now();
    Array.from(new Set(next.tools.map(function (tool) { return tool.site; }))).forEach(function (name, index) {
      next.sites.push({ id: 'demo-site-' + (index + 1), name: name });
    });
    ['Engr Sky', 'Engr Pau'].concat(next.tools.map(function (tool) { return tool.holder; })).filter(function (name) { return name && name !== '—'; }).forEach(function (name) {
      if (!next.users.some(function (user) { return user.name === name; })) next.users.push({ id: 'demo-user-' + (next.users.length + 1), name: name, role: name === 'Engr Pau' ? 'admin' : 'engineer' });
    });
    next.tools.forEach(function (tool) {
      if (['repair', 'underrepair', 'missing'].indexOf(tool.status) === -1) return;
      var missing = tool.status === 'missing';
      next[missing ? 'missing' : 'repairs'].push({ id: id(next, missing ? 'MIS' : 'REP'), toolId: tool.id, status: missing ? 'missing' : tool.status === 'underrepair' ? 'underrepair' : 'reported', notes: 'Existing demo inventory status.', reportedBy: 'Demo inventory', createdAt: timestamp, updatedAt: timestamp, sourceId: null });
    });
    return next;
  }
  function validateStored(value) {
    if (!value || value.version !== VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 0) fail('Saved demo movements are incompatible or damaged. Export or clear this browser’s demo data before trying again.');
    if (collections.some(function (name) { return !Array.isArray(value[name]); })) fail('Saved demo movements are incomplete. No changes were saved.');
    collections.forEach(function (name) {
      var ids = new Set();
      value[name].forEach(function (record) {
        if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) fail('Saved demo ' + name + ' records are damaged. No changes were saved.');
        ids.add(record.id);
      });
    });
    value.tools.forEach(function (tool) {
      if (!tool.name || !tool.site || typeof tool.holder !== 'string' || !Number.isFinite(tool.qty) || tool.qty <= 0 || ['available', 'inuse', 'repair', 'underrepair', 'missing', 'disposed'].indexOf(tool.status) === -1) fail('Saved demo equipment is damaged. No changes were saved.');
    });
    ['requests', 'transfers', 'returns'].forEach(function (name) {
      value[name].forEach(function (record) {
        if (!Array.isArray(record.toolIds) || !record.toolIds.length || record.toolIds.some(function (toolId) { return !value.tools.some(function (tool) { return tool.id === toolId; }); })) fail('Saved demo movement refers to missing equipment. No changes were saved.');
      });
    });
    return value;
  }
  function readStored() {
    var raw;
    try { raw = global.localStorage.getItem(KEY); }
    catch (error) { fail('Browser storage is unavailable. Enable browser storage to use the demo.'); }
    if (!raw) return null;
    try { return validateStored(JSON.parse(raw)); }
    catch (error) { fail(error instanceof SyntaxError ? 'Saved demo movements could not be read. No changes were saved.' : error.message); }
  }
  function save(next) {
    try { global.localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (error) { fail('The movement could not be saved to this browser. Check available storage and try again; nothing was changed.'); }
  }
  function syncTools() {
    if (active && typeof TOOLS !== 'undefined') TOOLS.splice.apply(TOOLS, [0, TOOLS.length].concat(clone(state.tools)));
  }
  function emit(error) {
    var detail = { mode: 'demo', active: active, revision: state ? state.revision : null, error: error || null };
    subscribers.forEach(function (listener) {
      try { listener(detail); } catch (listenerError) { global.console.error(listenerError); }
    });
    if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new global.CustomEvent('mcpa:movement-change', { detail: detail }));
  }
  function ensureActive() { if (!active) fail('Enable demo mode before using sample movements.'); }
  function change(operation) {
    ensureActive();
    var stored = readStored();
    if (!stored) fail('Demo data was cleared in another tab. Reload demo mode to continue.');
    var next = clone(stored);
    var result = operation(next);
    next.revision += 1;
    save(next); // A failed write must not mutate the visible inventory or workflow.
    state = next;
    syncTools();
    emit();
    return clone(result);
  }
  function entity(next, collection, recordId) {
    var result = next[collection].find(function (record) { return record.id === recordId; });
    if (!result) fail('This ' + collection.replace(/s$/, '') + ' record no longer exists. Refresh and try again.');
    return result;
  }
  function selected(next, toolIds) {
    if (!Array.isArray(toolIds) || !toolIds.length) fail('Select at least one tracked equipment record.');
    if (new Set(toolIds).size !== toolIds.length) fail('The same equipment cannot be selected twice.');
    return toolIds.map(function (toolId) { return entity(next, 'tools', toolId); });
  }
  function site(next, name, required) {
    var result = text(name, 'Destination', required);
    if (result && !next.sites.some(function (record) { return record.name === result || record.id === result; })) fail('Choose an existing destination project.');
    var match = next.sites.find(function (record) { return record.name === result || record.id === result; });
    return match ? match.name : result;
  }
  function receiver(next, name) {
    var result = text(name, 'Receiver', true);
    var match = next.users.find(function (record) { return record.name === result || record.id === result; });
    if (!match) fail('Choose an existing receiver.');
    if (match.role && ['engineer', 'engr', 'architect'].indexOf(match.role.toLowerCase()) === -1) fail('Choose an existing Engineer / Architect receiver.');
    return match.name;
  }
  function snapshot(tool) { return { toolId: tool.id, site: tool.site, holder: tool.holder, status: tool.status }; }
  function assertSnapshot(tool, source) {
    if (!source || tool.site !== source.site || tool.holder !== source.holder || tool.status !== source.status) fail('Custody or condition of ' + tool.id + ' changed. Refresh and create a new movement from its current state.');
  }
  function assertCustody(tool) {
    if (context().role !== 'admin' && tool.holder !== context().name && tool.status !== 'available') fail('You can only move or report equipment currently assigned to you.');
  }
  function assertUnlocked(next, tools, allowedRequestId) {
    tools.forEach(function (tool) {
      if (next.transfers.some(function (record) { return ['pending','refused'].indexOf(record.status) !== -1 && record.toolIds.indexOf(tool.id) !== -1; })) fail(tool.id + ' already has a transfer awaiting receipt or sender follow-up.');
      if (next.requests.some(function (record) { return record.status === 'approved' && record.id !== allowedRequestId && record.toolIds.indexOf(tool.id) !== -1; })) fail(tool.id + ' is allocated to an approved request.');
    });
  }
  function assertMovable(tools) {
    tools.forEach(function (tool) { if (['available', 'inuse'].indexOf(tool.status) === -1) fail(tool.id + ' is not available for movement.'); });
  }
  function inspections(tools, entries, receipt) {
    if (!Array.isArray(entries) || entries.length !== tools.length) fail('Inspect every selected equipment record before submitting.');
    var seen = new Set();
    return entries.map(function (entry) {
      if (!entry || seen.has(entry.toolId) || !tools.some(function (tool) { return tool.id === entry.toolId; })) fail('Inspection records must match the selected equipment exactly.');
      seen.add(entry.toolId);
      if (['good', 'damaged', 'lost'].indexOf(entry.condition) === -1) fail('Choose Good, Damaged, or Lost for each record.');
      var result = { toolId: entry.toolId, condition: entry.condition, notes: text(entry.notes, 'Condition notes', entry.condition !== 'good') };
      if (entry.tested !== undefined) result.tested = entry.tested === true;
      if (receipt) {
        if (entry.condition === 'damaged' && ['accepted', 'declined'].indexOf(entry.disposition) === -1) fail('Explicitly accept or decline custody of each damaged tool.');
        if (entry.condition === 'lost' && entry.disposition && entry.disposition !== 'declined') fail('Missing equipment cannot be accepted.');
        if (entry.condition === 'good' && entry.disposition && entry.disposition !== 'accepted') fail('Good inspected equipment must be accepted.');
        result.disposition = entry.condition === 'lost' ? 'declined' : entry.condition === 'good' ? 'accepted' : entry.disposition;
      }
      return result;
    });
  }
  function activity(next, action, record, toolIds, summary) {
    next.activity.unshift({ id: id(next, 'ACT'), action: action, entityId: record.id, toolIds: toolIds.slice(), actor: context().name, role: context().role, summary: summary, createdAt: now() });
  }
  function report(next, tool, kind, notes, sourceId) {
    var missing = kind === 'missing';
    var list = next[missing ? 'missing' : 'repairs'];
    if (list.some(function (record) { return record.toolId === tool.id && (missing ? record.status === 'missing' : record.status !== 'completed'); })) fail(tool.id + ' already has an open ' + kind + ' report.');
    var record = { id: id(next, missing ? 'MIS' : 'REP'), toolId: tool.id, status: missing ? 'missing' : 'reported', notes: notes, reportedBy: context().name, createdAt: now(), updatedAt: now(), sourceId: sourceId || null };
    list.unshift(record);
    tool.status = missing ? 'missing' : 'repair';
    activity(next, missing ? 'missing_reported' : 'repair_reported', record, [tool.id], tool.id + (missing ? ' reported missing' : ' reported for repair'));
    return record;
  }
  function newTransfer(next, input, requestId) {
    var tools = selected(next, input.toolIds);
    assertMovable(tools);
    assertUnlocked(next, tools, requestId);
    if (context().role !== 'admin' && tools.some(function (tool) { return tool.status !== 'inuse' || tool.holder !== context().name; })) fail('You can only transfer equipment currently assigned to you and in use. Request available stock for administrator approval.');
    tools.forEach(assertCustody);
    var destination = site(next, input.destination, true);
    var person = receiver(next, input.receiver);
    if (tools.some(function (tool) { return tool.status === 'inuse' && tool.site === destination && tool.holder === person; })) fail('The receiver already holds selected equipment at this destination.');
    var recordId = id(next, 'TRF');
    var record = { id: recordId, code: recordId, toolIds: tools.map(function (tool) { return tool.id; }), source: tools.map(snapshot), destination: destination, receiver: person, sender: context().name, senderRole: global.MCPAAuth.profile.role, notes: text(input.notes, 'Notes'), requestId: requestId || null, status: 'pending', createdAt: now() };
    next.transfers.unshift(record);
    activity(next, 'transfer_created', record, record.toolIds, record.id + ' released to ' + person + ' at ' + destination);
    return record;
  }

  function adjustMovement(action, recordId, input) {
    input = input || {};
    var actor = context();
    if (actor.role !== 'engineer') fail('Only the accountable Engineer or Architect can perform this action.');
    var reason = text(input.reason, 'Reason', true);
    if (input.confirmed !== true) fail('Confirm the action before submitting.');
    return change(function (next) {
      var requestAction = ['withdrawRequest','cancelReservation'].indexOf(action) !== -1;
      var record = entity(next, requestAction ? 'requests' : 'transfers', recordId);
      var linked = !requestAction && record.requestId ? entity(next, 'requests', record.requestId) : null;
      var ownsRequest = requestAction && record.requester === actor.name;
      var sender = !requestAction && record.sender === actor.name;
      var senderRole = record.senderRole || next.users.find(function (person) { return person.name === record.sender; })?.role;
      var fieldSender = ['engineer','architect'].indexOf(senderRole) !== -1;
      var linkedOwner = linked && linked.requester === actor.name && linked.status === 'released' && linked.transferId === record.id;
      var allowed = action === 'withdrawRequest' ? ownsRequest && record.status === 'pending'
        : action === 'cancelReservation' ? ownsRequest && record.status === 'approved' && !record.transferId
        : action === 'cancelTransfer' ? ['pending','refused'].indexOf(record.status) !== -1 && (sender || linkedOwner)
        : action === 'refuseTransfer' ? record.status === 'pending' && record.receiver === actor.name && (fieldSender || linkedOwner)
        : action === 'reopenTransfer' ? record.status === 'refused' && sender : false;
      if (!allowed) fail('This movement is no longer eligible, or belongs to another accountable person.');
      var tools = selected(next, record.toolIds);
      if (action !== 'withdrawRequest') {
        tools.forEach(function (tool) {
          if (next.requests.some(function (other) { return other.id !== record.id && other.status === 'approved' && other.toolIds.indexOf(tool.id) !== -1; })
            || next.transfers.some(function (other) { return other.id !== record.id && ['pending','refused'].indexOf(other.status) !== -1 && other.toolIds.indexOf(tool.id) !== -1; })) fail('The reservation changed. Refresh before continuing.');
          if (action === 'cancelReservation') {
            if (tool.status !== 'available' || (tool.holder && tool.holder !== '\u2014') || next.transfers.some(function (transfer) { return transfer.requestId === record.id; })) fail('This reservation has already been fulfilled or its inventory changed.');
          } else assertSnapshot(tool, record.source.find(function (item) { return item.toolId === tool.id; }));
        });
      }
      var before = clone(record), linkedBefore = linked ? clone(linked) : null, timestamp = now();
      var history = {action:action, actor:actor.name, role:global.MCPAAuth.profile.role, reason:reason, createdAt:timestamp, entityId:record.id, before:before};
      if (action === 'refuseTransfer') {
        var results = inspections(tools, input.inspections, true);
        if (results.some(function (item) { return item.condition !== 'lost' && item.tested !== true; })) fail('Test every received tool before recording the inspection.');
        if (!results.some(function (item) { return item.condition === 'damaged' && item.disposition === 'declined'; })) fail('Damage refusal requires at least one damaged tool declined with inspection notes.');
        record.status='refused'; record.refusedBy=actor.name; record.refusedAt=timestamp; record.refusalReason=reason; record.refusalInspections=results;
      } else if (action === 'reopenTransfer') {
        record.status='pending'; record.reopenedBy=actor.name; record.reopenedAt=timestamp; record.reopenReason=reason;
      } else {
        record.status=action==='withdrawRequest'?'withdrawn':'canceled'; record.canceledBy=actor.name; record.canceledAt=timestamp; record.cancellationReason=reason;
        if (action === 'cancelTransfer' && linked) {
          if (linked.status !== 'released' || linked.transferId !== record.id) fail('The linked request changed. Refresh before canceling.');
          linked.status='canceled'; linked.canceledBy=actor.name; linked.canceledAt=timestamp; linked.cancellationReason=reason; linked.updatedAt=timestamp;
          history.linkedBefore=linkedBefore; history.linkedAfter=clone(linked);
        }
      }
      record.updatedAt=timestamp; history.after=clone(record);
      var historyKey=['refuseTransfer','reopenTransfer'].indexOf(action)!==-1?'refusalHistory':'cancellationHistory';
      if (!next[historyKey]) next[historyKey]=[];
      next[historyKey].push(history);
      var labels={withdrawRequest:'Requester withdrew pending request',cancelReservation:'Requester canceled unfulfilled reservation',cancelTransfer:'Field user canceled unreceived handover; custody unchanged',refuseTransfer:'Receiver refused damaged handover; custody and reservations held',reopenTransfer:'Sender reopened handover for receiver inspection'};
      activity(next,action,record,record.toolIds,labels[action]+'. Reason: '+reason);
      return record;
    });
  }

  var api = {
    mode: 'demo',
    storageKey: KEY,
    getContext: context,
    isActive: function () { return active; },
    activate: function () {
      if (active) return api.refresh();
      var next = readStored();
      if (!next) { next = seeded(); save(next); }
      originalTools = typeof TOOLS !== 'undefined' ? clone(TOOLS) : null;
      state = next;
      active = true;
      syncTools();
      emit();
      return clone(state);
    },
    initialize: function () { return api.activate(); },
    deactivate: function () {
      active = false;
      if (originalTools && typeof TOOLS !== 'undefined') TOOLS.splice.apply(TOOLS, [0, TOOLS.length].concat(originalTools));
      originalTools = null;
      state = null;
      emit();
    },
    getState: function () { ensureActive(); return clone(state); },
    refresh: function () {
      ensureActive();
      var next = readStored();
      if (!next) fail('Demo data was cleared in another tab. Reload demo mode to continue.');
      state = next;
      syncTools();
      return clone(state);
    },
    subscribe: function (listener) { subscribers.add(listener); return function () { subscribers.delete(listener); }; },
    createRequest: function (input) {
      input = input || {};
      return change(function (next) {
        var tools = selected(next, input.toolIds);
        assertMovable(tools);
        assertUnlocked(next, tools);
        if (context().role !== 'admin' && input.receiver && receiver(next, input.receiver) !== context().name) fail('Engineers can only request equipment for themselves.');
        var record = { id: id(next, 'REQ'), toolIds: tools.map(function (tool) { return tool.id; }), source: tools.map(snapshot), destination: site(next, input.destination, true), receiver: receiver(next, input.receiver || context().name), purpose: text(input.purpose, 'Purpose', false), neededUntil: requestDate(input.neededUntil), requester: context().name, status: 'pending', createdAt: now(), updatedAt: now() };
        next.requests.unshift(record);
        activity(next, 'request_created', record, record.toolIds, record.id + ' requested for ' + record.destination);
        return record;
      });
    },
    approveRequest: function (recordId) {
      requireAdmin();
      return change(function (next) {
        var record = entity(next, 'requests', recordId);
        if (record.status !== 'pending') fail('Only a pending request can be approved.');
        var tools = selected(next, record.toolIds);
        assertMovable(tools);
        assertUnlocked(next, tools);
        tools.forEach(function (tool) { assertSnapshot(tool, record.source.find(function (item) { return item.toolId === tool.id; })); });
        record.status = 'approved'; record.updatedAt = now(); record.approvedBy = context().name;
        activity(next, 'request_approved', record, record.toolIds, record.id + ' approved and allocated');
        return record;
      });
    },
    rejectRequest: function (recordId, reason) {
      requireAdmin();
      return change(function (next) {
        var record = entity(next, 'requests', recordId);
        if (['pending', 'approved'].indexOf(record.status) === -1) fail('Only a pending or approved request can be rejected.');
        record.reason = text(reason, 'Rejection reason', true);
        record.status = 'rejected'; record.updatedAt = now(); record.rejectedBy = context().name;
        activity(next, 'request_rejected', record, record.toolIds, record.id + ' rejected');
        return record;
      });
    },
    releaseRequest: function (recordId) {
      requireAdmin();
      return change(function (next) {
        var request = entity(next, 'requests', recordId);
        if (request.status !== 'approved') fail('Approve the request before releasing equipment.');
        selected(next, request.toolIds).forEach(function (tool) { assertSnapshot(tool, request.source.find(function (item) { return item.toolId === tool.id; })); });
        var record = newTransfer(next, request, request.id);
        request.status = 'released'; request.transferId = record.id; request.updatedAt = now();
        return record;
      });
    },
    createTransfer: function (input) { return change(function (next) { return newTransfer(next, input || {}, null); }); },
    withdrawRequest: function (id,input) { return adjustMovement('withdrawRequest',id,input); },
    cancelReservation: function (id,input) { return adjustMovement('cancelReservation',id,input); },
    cancelTransfer: function (id,input) { return adjustMovement('cancelTransfer',id,input); },
    refuseTransfer: function (id,input) { return adjustMovement('refuseTransfer',id,input); },
    reopenTransfer: function (id,input) { return adjustMovement('reopenTransfer',id,input); },
    findTransfer: function (code) {
      ensureActive();
      var normalized = text(code, 'Transfer code', true).toUpperCase();
      var result = state.transfers.find(function (record) { return record.code === normalized || record.id === normalized; });
      return result ? clone(result) : null;
    },
    resolveQr: function (value) {
      ensureActive();
      var code = text(value, 'Equipment tag or transfer code', true);
      var transfer = api.findTransfer(code);
      if (transfer) {
        if (context().role !== 'admin' && transfer.receiver !== context().name) fail('Only the named receiver or an administrator can open this handover for receipt.');
        return { kind: 'transfer', transfer: transfer };
      }
      var asset = state.tools.find(function (tool) { return tool.id === code; });
      if (!asset) fail('No equipment tag or transfer matches this code. Scan the original tag or enter its exact ID.');
      var matches = state.transfers.filter(function (record) { return record.status === 'pending' && record.toolIds.indexOf(asset.id) !== -1 && (context().role === 'admin' || record.receiver === context().name); });
      if (matches.length > 1) fail('This equipment has multiple pending handovers. Use the transfer reference and ask Admin to review the conflict.');
      return matches.length ? { kind: 'transfer', transfer: clone(matches[0]), asset: clone(asset) } : { kind: 'asset', asset: clone(asset), reason: 'No pending handover is addressed to you. Equipment details are available; scanning does not change custody.' };
    },
    receiveTransfer: function (recordId, input) {
      input = input || {};
      return change(function (next) {
        var record = entity(next, 'transfers', recordId);
        if (record.status !== 'pending') fail('This transfer has already been received.');
        if (context().role !== 'admin' && record.receiver !== context().name) fail('Only the named receiver or an administrator can receive this transfer.');
        var tools = selected(next, record.toolIds);
        var results = inspections(tools, input.inspections, true);
        tools.forEach(function (tool) {
          assertSnapshot(tool, record.source.find(function (item) { return item.toolId === tool.id; }));
          var result = results.find(function (item) { return item.toolId === tool.id; });
          if (result.disposition === 'accepted') { tool.site = record.destination; tool.holder = record.receiver; tool.status = 'inuse'; }
          if (result.condition !== 'good') report(next, tool, result.condition === 'lost' ? 'missing' : 'repair', result.notes, record.id);
        });
        record.status = 'received'; record.receivedAt = now(); record.receivedBy = context().name; record.inspections = results;
        record.acceptedCount = results.filter(function (result) { return result.disposition === 'accepted'; }).length;
        record.declinedCount = results.length - record.acceptedCount;
        if (record.requestId) { var request = entity(next, 'requests', record.requestId); request.status = record.declinedCount ? 'discrepancy' : 'received'; request.updatedAt = now(); }
        activity(next, 'transfer_received', record, record.toolIds, record.id + ' inspected: ' + record.acceptedCount + ' accepted, ' + record.declinedCount + ' declined');
        return record;
      });
    },
    // Explicit offline demo location only; live returns use the authenticated RPC.
    returnDestination: function () { return {id:'demo-return-office',name:'Office',label:'Office'}; },
    createReturn: function (input) {
      input = input || {};
      return change(function (next) {
        var tools = selected(next, input.toolIds);
        assertUnlocked(next, tools);
        tools.forEach(function (tool) { if (tool.status !== 'inuse') fail('Only equipment currently in use can be returned.'); assertCustody(tool); });
        var results = inspections(tools, input.conditions);
        var destination = 'Office';
        if (text(input.destination, 'Return destination') && input.destination !== destination) fail('Equipment returns must go to the company Office. Use Transfers for project handovers.');
        if (!next.sites.some(function (record) { return record.id === 'demo-return-office'; })) next.sites.push({id:'demo-return-office',name:destination});
        var record = { id: id(next, 'RET'), toolIds: tools.map(function (tool) { return tool.id; }), source: tools.map(snapshot), destination: destination || null, returnedBy: context().name, conditions: results, notes: text(input.notes, 'Notes'), createdAt: now() };
        tools.forEach(function (tool) {
          var result = results.find(function (item) { return item.toolId === tool.id; });
          if (result.condition === 'good') { tool.status = 'available'; tool.holder = '—'; if (destination) tool.site = destination; }
          else {
            if (result.condition === 'damaged') { tool.site = destination; tool.holder = '—'; }
            report(next, tool, result.condition === 'lost' ? 'missing' : 'repair', result.notes, record.id);
          }
        });
        next.returns.unshift(record);
        activity(next, 'return_created', record, record.toolIds, record.id + ' returned with inspection');
        return record;
      });
    },
    reportRepair: function (input) { return manualReport(input, 'repair'); },
    reportMissing: function (input) { return manualReport(input, 'missing'); },
    startRepair: function (recordId) {
      requireAdmin();
      return change(function (next) {
        var record = entity(next, 'repairs', recordId);
        var tool = entity(next, 'tools', record.toolId);
        if (record.status !== 'reported' || tool.status !== 'repair') fail('Only equipment reported for repair can enter repair.');
        record.status = 'underrepair'; record.updatedAt = now(); record.startedAt = now(); tool.status = 'underrepair';
        activity(next, 'repair_started', record, [tool.id], tool.id + ' sent for repair');
        return record;
      });
    },
    completeRepair: function (recordId, input) {
      requireAdmin(); input = input || {};
      return change(function (next) {
        var record = entity(next, 'repairs', recordId);
        var tool = entity(next, 'tools', record.toolId);
        if (record.status !== 'underrepair' || tool.status !== 'underrepair') fail('Start the repair before completing it.');
        var destination = site(next, input.destination, false);
        record.status = 'completed'; record.updatedAt = now(); record.completedAt = now(); record.resolution = text(input.notes, 'Resolution notes');
        tool.status = 'available'; tool.holder = '—'; if (destination) tool.site = destination;
        activity(next, 'repair_completed', record, [tool.id], tool.id + ' repaired and available');
        return record;
      });
    },
    recoverMissing: function (recordId, input) {
      requireAdmin(); input = input || {};
      return change(function (next) {
        var record = entity(next, 'missing', recordId);
        var tool = entity(next, 'tools', record.toolId);
        if (record.status !== 'missing' || tool.status !== 'missing') fail('This missing report has already been resolved.');
        if (['good', 'damaged'].indexOf(input.condition) === -1) fail('Inspect recovered equipment as Good or Damaged.');
        var destination = site(next, input.destination, false);
        var notes = text(input.notes, 'Recovery notes', input.condition === 'damaged');
        record.status = 'recovered'; record.updatedAt = now(); record.recoveredAt = now(); record.resolution = notes; record.condition = input.condition;
        if (destination) tool.site = destination;
        if (input.condition === 'damaged') report(next, tool, 'repair', notes, record.id);
        else { tool.status = 'available'; tool.holder = '—'; }
        activity(next, 'missing_recovered', record, [tool.id], tool.id + ' recovered');
        return record;
      });
    }
  };
  function manualReport(input, kind) {
    input = input || {};
    return change(function (next) {
      var tool = entity(next, 'tools', input.toolId);
      assertMovable([tool]); assertUnlocked(next, [tool]); assertCustody(tool);
      return report(next, tool, kind, text(input.notes, 'Report details', true), null);
    });
  }
  if (global.addEventListener) global.addEventListener('storage', function (event) {
    if (!active || (event.key !== KEY && event.key !== null)) return;
    try { api.refresh(); emit(); } catch (error) { emit(error.message); }
  });
  global.MovementDemoStore = Object.freeze(api);
})(window);
