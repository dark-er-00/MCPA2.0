/* Presentation vocabulary. Stored values, authorization and workflow decisions
 * stay in their existing repositories. All helpers return text, never HTML. */
(function () {
  'use strict';
  const freeze = values => Object.freeze(values);
  const actions = freeze({
    createRequest: ['Equipment Request Submitted', 'Submitted a new equipment request.'],
    approveRequest: ['Equipment Request Approved', 'Approved the equipment request and reserved its equipment.'],
    rejectRequest: ['Equipment Request Rejected', 'Rejected the equipment request.'],
    releaseRequest: ['Equipment Released for Transfer', 'Released the approved equipment for transfer. Receipt confirmation is still required.'],
    createTransfer: ['Equipment Transfer Dispatched', 'Dispatched equipment to the named receiver. Receipt confirmation is still required.'],
    receiveTransfer: ['Transfer Received', 'Recorded the transfer inspection and receipt outcome.'],
    createReturn: ['Equipment Return Recorded', 'Recorded the equipment return and its inspected condition.'],
    reportRepair: ['Equipment Damage Reported', 'Reported equipment damage for repair.'],
    startRepair: ['Equipment Repair Started', 'Started the equipment repair.'],
    completeRepair: ['Equipment Repair Completed', 'Completed the repair and made the equipment available for use.'],
    reportMissing: ['Missing Equipment Reported', 'Reported equipment as missing.'],
    recoverMissing: ['Missing Equipment Recovered', 'Recorded the recovery and inspected condition of missing equipment.'],
    withdrawRequest: ['Equipment Request Withdrawn', 'Withdrew the pending equipment request.'],
    cancelReservation: ['Equipment Reservation Canceled', 'Canceled the approved reservation before equipment was released.'],
    cancelTransfer: ['Equipment Transfer Canceled', 'Canceled the unreceived transfer. Equipment custody did not change.'],
    refuseTransfer: ['Damaged Equipment Refused', 'Refused damaged equipment after inspection. Custody remained with the sender.'],
    reopenTransfer: ['Transfer Inspection Reopened', 'Reopened the refused transfer for another inspection by the receiver.']
  });
  Object.values(actions).forEach(freeze);
  // These older server summaries repeat the mapped description. Keep useful
  // notes and outcomes, without repeating this generic operation boilerplate.
  const boilerplate = new Set(['Requested equipment', 'Approved request', 'Rejected request',
    'Released request for transfer', 'Dispatched transfer', 'Received and inspected transfer',
    'Returned and inspected equipment', 'Reported equipment damage', 'Reported missing equipment',
    'Started repair', 'Completed repair', 'Recovered missing equipment']);
  const aliases = freeze({
    request_created:'createRequest', request_approved:'approveRequest', request_rejected:'rejectRequest',
    transfer_created:'createTransfer', transfer_received:'receiveTransfer', return_created:'createReturn',
    repair_reported:'reportRepair', repair_started:'startRepair', repair_completed:'completeRepair',
    missing_reported:'reportMissing', missing_recovered:'recoverMissing', request_withdrawn:'withdrawRequest',
    reservation_cancelled:'cancelReservation', reservation_canceled:'cancelReservation',
    transfer_cancelled:'cancelTransfer', transfer_canceled:'cancelTransfer',
    transfer_refused:'refuseTransfer', transfer_reopened:'reopenTransfer'
  });
  const statuses = freeze({
    equipment: freeze({available:'Available', inuse:'In Use', inoffice:'In Office', repair:'For Repair', underrepair:'Under Repair', missing:'Missing', disposed:'Retired'}),
    availability: freeze({available:'Available', deployed:'In Use', unavailable:'Unavailable'}),
    request: freeze({pending:'Pending Review', approved:'Approved', rejected:'Rejected', released:'Released / Awaiting Receipt', received:'Received / Completed', discrepancy:'Receipt Discrepancy', withdrawn:'Withdrawn', canceled:'Canceled', cancelled:'Canceled'}),
    transfer: freeze({pending:'Awaiting Receipt', received:'Received / Completed', refused:'Damage Refused / Awaiting Sender', canceled:'Canceled', cancelled:'Canceled'}),
    return: freeze({returned:'Returned',pendinginspection:'Awaiting Admin Inspection',partialinspection:'Inspection Follow-up',completed:'Inspection Complete'}),
    repair: freeze({reported:'Reported', underrepair:'Under Repair', completed:'Completed'}),
    missing: freeze({missing:'Missing', recovered:'Recovered'}),
    stock: freeze({out:'Out of Stock', low:'Low Stock', ok:'Stock Sufficient'}),
    materialRequest: freeze({pending:'Awaiting Delivery', partial:'Partially Received', received:'Received', cancelled:'Canceled', canceled:'Canceled'}),
    delivery: freeze({pending:'Awaiting Delivery', partial:'Partially Received', received:'Received', cancelled:'Linked Request Canceled', unlinked:'No Linked Request'}),
    project: freeze({active:'Active', discrepancy:'Discrepancy', verified:'Verified', turnover:'Turnover', idle:'Idle Stock', planning:'Planning', completed:'Completed'}),
    account: freeze({active:'Active', inactive:'Inactive'})
  });
  const conditions = freeze({good:'Good', fair:'Fair', damaged:'Damaged', lost:'Missing', missing:'Missing', needsinspection:'Needs Inspection', notassessed:'Not Assessed'});
  const roles = freeze({admin:'Admin', engineer:'Engineer', architect:'Architect', secretary:'Secretary', tool_handler:'Tool Handler'});
  const accountEvents = freeze({username_changed:['Username Updated','Updated the account username.'], person_created:['Person Added','Added a person to the company directory.'], account_linked:['Sign-in Account Linked','Linked a verified sign-in account to the person.'], role_changed:['Account Role Changed','Changed the person’s authorized role.'], account_reactivated:['Account Reactivated','Reactivated account access.'], account_deactivated:['Account Deactivated','Deactivated account access.'], person_renamed:['Person Name Updated','Updated the person’s display name.'], user_invited:['Account Invitation Sent','Sent an account invitation.'], invitation_resent:['Account Invitation Resent','Resent the account invitation.'], development_account_created:['Test Account Created','Created an account for development and testing.']});
  const stockEvents = freeze({opening:['Opening Stock Recorded','Recorded the opening stock balance.'], usage:['Stock Used','Recorded materials used.'], restock:['Stock Replenished','Added stock to inventory.'], correction:['Stock Balance Corrected','Recorded a stock balance correction.'], receipt:['Requested Stock Received','Received stock against a material request.']});
  const projectEvents = freeze({created:'Project Created', baseline:'Earlier Project Details Recorded', engineer:'Project Assignment Updated', phase:'Earlier Project Phase Updated', name:'Project Name Updated', location:'Project Location Updated', current_work_area:'Current Work Area Updated', project_stage:'Project Stage Updated', status:'Project Status Updated', last_inventory_check:'Inventory Check Updated', progress:'Earlier Completion Updated', construction_progress:'Construction Progress Updated', weights:'Work Area Weights Updated', archived:'Project Archived', restored:'Project Restored', details:'Project Details Updated', site_update:'Site Update Recorded'});
  const normal = value => typeof value === 'string' ? value.replace(/[\s_-]/g, '').toLowerCase() : '';
  const own = (map, key) => Object.hasOwn(map, key) ? map[key] : undefined;
  const opaque = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^[0-9a-f]{32,}$/i.test(value);
  const timestampFormat = new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila', dateStyle:'medium', timeStyle:'medium'});
  const calendarFormat = new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila', dateStyle:'medium'});
  function status(value, domain = 'equipment') {
    const key = normal(value);
    const equipmentAlias = own({forrepair:'repair', lost:'missing', retired:'disposed'}, key);
    return own(own(statuses, domain) || {}, domain === 'equipment' && equipmentAlias ? equipmentAlias : key) || (value == null || value === '' ? 'Status Not Recorded' : 'Status Unavailable');
  }
  function person(value, role) {
    const name = typeof value === 'string' ? value.trim() : '';
    return name && !opaque(name) && !['—','-','?'].includes(name) ? name : own(roles, role) || 'User not recorded';
  }
  function reference(value, fallback = 'Related record unavailable') {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && !opaque(text) ? text : fallback;
  }
  function numberedReference(prefix, value) {
    return /^\d+$/.test(String(value ?? '')) ? prefix + '-' + String(value).padStart(5, '0') : 'Reference unavailable';
  }
  function safeText(value, fallback = '') {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    const text = value.trim();
    if (opaque(text) || /^\{/.test(text) || /^[a-z]+(?:[A-Z][a-z]+|_[a-z]+)+$/.test(text)) return fallback;
    if (text.startsWith('[')) { try { if (Array.isArray(JSON.parse(text))) return fallback; } catch (_) { /* Preserve bracketed human notes. */ } }
    return text.replace(/\b[a-zA-Z][a-zA-Z_]*\b/g, token => actions[own(aliases, token) || token]?.[0] || token);
  }
  function actionKey(value) { return own(aliases, value) || (own(actions, value) ? value : ''); }
  function activity(record = {}, data) {
    record = record || {};
    let key = actionKey(record.action);
    // Older demo events share a dispatch identifier. Only use the release
    // wording if an already-authorized related transfer records the request.
    if (record.action === 'transfer_created' && data?.transfers?.some(r => r.id === record.entityId && r.requestId)) key = 'releaseRequest';
    const entry = actions[key];
    const title = entry?.[0] || 'Activity Recorded';
    const summary = safeText(record.summary);
    const detail = boilerplate.has(summary) || summary === record.action ? '' : summary;
    const description = entry ? entry[1] + (detail && detail !== title && detail !== entry[1] ? ' ' + detail : '') : detail || 'An activity was recorded. Further details are unavailable.';
    return {title, description, actor:person(record.actor, record.role), reference:reference(record.entityId), when:dateTime(record.createdAt)};
  }
  function dateValue(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string' || !value.trim()) return null;
    // Date-only business fields must not shift to a different calendar day.
    const isoDay = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    if (isoDay) {
      const calendar = new Date(Date.UTC(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])));
      if (calendar.getUTCFullYear() !== Number(isoDay[1]) || calendar.getUTCMonth() + 1 !== Number(isoDay[2]) || calendar.getUTCDate() !== Number(isoDay[3])) return null;
    }
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00+08:00' : value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function dateTime(value) { const d = dateValue(value); return d ? timestampFormat.format(d) : 'Date not recorded'; }
  function date(value) { const d = dateValue(value); return d ? calendarFormat.format(d) : 'Date not recorded'; }
  function event(value, domain) {
    const entry = own(domain === 'account' ? accountEvents : stockEvents, value);
    return entry ? {title:entry[0], description:entry[1]} : {title:'Activity Recorded', description:'An activity was recorded. Further details are unavailable.'};
  }
  function notification(notice) {
    if (notice.kind === 'movement' && notice.title !== 'Equipment Pending Turnover') {
      const entry = activity({action:notice.data?.action, summary:notice.message});
      return {title:entry.title, message:entry.description};
    }
    return {title:safeText(notice.title, 'Notification'), message:safeText(notice.message, 'Open the related record for details.')};
  }
  function errorText(value, fallback = 'The operation could not be completed. Please retry or contact your administrator.') {
    const text = typeof value === 'string' ? value : value?.message;
    return !text || /\b(?:PGRST\d+|mcpa_[a-z_]+|uuid|sqlstate|constraint|schema|column|rpc)\b|\.sql\b|supabase\//i.test(text) ? fallback : safeText(text, fallback);
  }
  window.MCPADisplay = freeze({actions, aliases, statuses, roles, projectEvents, actionKey, activity, status, person, reference, numberedReference, safeText, dateTime, date, event, notification, errorText,
    condition:value => own(conditions, normal(value)) || 'Condition Not Recorded',
    tracking:value => own({individual:'Individual Asset',bulk:'Bulk Stock'}, normal(value)) || 'Tracking Method Not Recorded',
    projectEvent:value => own(projectEvents, value) || 'Project Activity Recorded'});
})();
