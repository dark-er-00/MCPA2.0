/* Workstream A: pure quantity/analytics helpers. No stock or custody writes. */
(function (scope, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../../consumables-catalog.js') : scope.ConsumablesCatalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.MCPAConsumablesRequests = api;
})(typeof globalThis === 'object' ? globalThis : this, function (units) {
  'use strict';
  const MAX = 1000000000;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function quantity(value, allowZero = false, unit = '') {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,3})?$/.test(text)) throw Error('Enter a quantity with at most three decimal places.');
    const number = Number(text);
    if (!Number.isFinite(number) || number >= MAX || (allowZero ? number < 0 : number <= 0)) throw Error(allowZero ? 'Enter a quantity from 0 to 999,999,999.999.' : 'Enter a quantity greater than 0 and below 1,000,000,000.');
    if (units.isWholeUnit(unit) && !Number.isInteger(number)) throw Error('Enter a whole number for '+unit+'. Fractions are not allowed.');
    return number;
  }
  const millis = value => Math.round(Number(value) * 1000);
  const add = (a, b) => (millis(a) + millis(b)) / 1000;
  const format = value => new Intl.NumberFormat('en-PH', {maximumFractionDigits:3}).format(Number(value || 0));
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function validateRequest({site_id, purpose = '', items}, catalog, sites) {
    if (!uuidPattern.test(site_id) || !sites.some(site => site.id === site_id)) throw Error('Select an active project/site.');
    if (typeof purpose !== 'string' || purpose.trim().length > 1000) throw Error('Keep the purpose within 1,000 characters.');
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw Error('Choose between 1 and 100 consumables.');
    const seen = new Set();
    return {site_id, purpose:purpose.trim(), items:items.map(line => {
      const item = catalog.find(item => item.id === line.consumable_id && !item.archived_at);
      if (!item || !uuidPattern.test(line.consumable_id)) throw Error('Choose an active consumable from the catalog.');
      if (seen.has(item.id)) throw Error('Each consumable can appear only once. Adjust its quantity.');
      seen.add(item.id);
      if (line.unit !== item.unit) throw Error('Use the catalog unit. Unit conversions are not supported.');
      return {consumable_id:item.id, quantity:quantity(line.quantity,false,item.unit), unit:item.unit};
    })};
  }
  function csvCell(value) {
    let cell = String(value ?? '');
    // Prevent formulas when an exported label is opened in spreadsheet software.
    if (/^[\s]*[=+@-]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  }
  const csv = (headers, rows) => '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  function dateRange(from, to) {
    const valid = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day + 'T00:00:00Z')) && new Date(day + 'T00:00:00Z').toISOString().slice(0,10) === day;
    if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) throw Error('Choose a valid date range with the start on or before the end.');
    // Manila calendar days, inclusive end date; use half-open timestamps.
    return {from:from ? from + 'T00:00:00+08:00' : null, to:to ? new Date(Date.parse(to + 'T00:00:00+08:00') + 86400000).toISOString() : null};
  }
  const dayInManila = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
  };
  function aggregate(transactions, by, catalog = []) {
    const groups = new Map();
    for (const row of transactions) {
      const item = catalog.find(item => item.id === row.consumable_id);
      const unit = row.unit || item?.unit || '';
      const value = by === 'day' ? dayInManila(row.issued_at) : row[by + '_id'] || row[by] || 'Unknown';
      // Keep SKUs and units distinct: adding boxes to pieces is meaningless.
      const key = JSON.stringify([value, row.consumable_id, unit]);
      const group = groups.get(key) || {key, value, consumable_id:row.consumable_id, item_name:row.item_name || item?.name || 'Legacy item', unit, quantity:0, transactions:0};
      group.quantity = add(group.quantity, row.quantity);
      group.transactions++;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a,b) => b.transactions - a.transactions || b.quantity - a.quantity || a.key.localeCompare(b.key));
  }
  // Projection of the authenticated request snapshot, never a second stock store.
  // Central stock kind='usage' is an OUTWARD ISSUE, not engineer consumption.
  function inventory(snapshot) {
    if (!snapshot?.profile?.id || !['engineer','architect'].includes(snapshot.profile.role)) throw Error('An active Engineer or Architect account is required.');
    const groups = new Map(), movements = new Set(), lines = new Set();
    for (const request of snapshot.requests || []) {
      if (request.requester_id !== snapshot.profile.id || !['partial','partially_fulfilled','issued'].includes(request.status)) continue;
      for (const item of request.items || []) {
        const receipts = [];
        for (const issue of request.issues || []) {
          if (issue.item_id !== item.id) continue;
          const key = issue.stock_movement_id || issue.id;
          if (!key || movements.has(key)) continue;
          const amount = Number(issue.quantity);
          if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(Date.parse(issue.issued_at))) throw Error('An issuance record is invalid. Ask your administrator to review the ledger.');
          movements.add(key);
          receipts.push({...issue, quantity:amount, request_id:request.id, request_number:request.request_number});
        }
        if (!receipts.length) continue;
        const key = JSON.stringify([item.consumable_id, item.unit, request.site_id]);
        const catalog = (snapshot.catalog || []).find(c => c.id === item.consumable_id && c.unit === item.unit);
        const row = groups.get(key) || {key, consumable_id:item.consumable_id, item_name:catalog?.name || item.item_name,
          item_code:item.item_code, specification:item.specification, category:catalog?.category || item.category || 'Unclassified',
          unit:item.unit, site_id:request.site_id, site_name:request.site_name, received:0, used:0, usage_recorded:true,
          minimum_stock:Math.max(0, Number(catalog?.minimum_stock) || 0), updated_at:null, transactions:[]};
        for (const issue of receipts) {
          row.received = add(row.received, issue.quantity);
          row.transactions.push(issue);
          if (!row.updated_at || Date.parse(issue.issued_at) > Date.parse(row.updated_at)) row.updated_at = issue.issued_at;
        }
        // The installed backend returns null: no engineer usage ledger exists.
        // Keep that distinction visible instead of claiming actual usage is zero.
        if (!lines.has(item.id)) {
          lines.add(item.id);
          if (item.confirmed_consumed_quantity == null) row.usage_recorded = false;
          else {
            const used = Number(item.confirmed_consumed_quantity);
            if (!Number.isFinite(used) || used < 0) throw Error('A consumption total is invalid. Ask your administrator to review the ledger.');
            row.used = add(row.used, used);
            if (used > 0 && Date.parse(request.updated_at) > Date.parse(row.updated_at)) row.updated_at = request.updated_at;
          }
        }
        groups.set(key, row);
      }
    }
    return [...groups.values()].map(row => {
      const balance = add(row.received, -row.used);
      // A discrepancy must never masquerade as depleted/available inventory.
      return {...row, balance:Math.max(0, balance), discrepancy:balance < 0,
        status:balance < 0 ? 'Review required' : balance === 0 ? 'Depleted' : balance <= row.minimum_stock ? 'Low Stock' : 'Available',
        transactions:row.transactions.sort((a,b) => Date.parse(b.issued_at) - Date.parse(a.issued_at))};
    }).sort((a,b) => a.item_name.localeCompare(b.item_name) || a.site_name.localeCompare(b.site_name) || a.unit.localeCompare(b.unit));
  }
  function filterInventory(rows, {search='', category='', site='', status=''} = {}) {
    const term = search.trim().toLowerCase();
    return rows.filter(row => (!category || row.category === category) && (!site || row.site_id === site) && (!status || row.status === status)
      && (!term || [row.item_name,row.category,row.item_code,row.specification].join(' ').toLowerCase().includes(term)));
  }
  function errorText(error) {
    if (['42P01','42883','PGRST202','PGRST205'].includes(error?.code)) return 'Request setup is incomplete. Ask your administrator to install the Workstream A migration, then refresh.';
    if (error?.code === '42501') return 'Your account cannot perform this action. Sign in with the correct active role.';
    if (['PGRST301','PGRST303'].includes(error?.code)) return 'Your session expired. Sign in again and retry the same action.';
    return error?.message || 'The request could not be saved. Check your connection and retry the same action.';
  }
  function createClient(client, storage = (() => {try{return globalThis.sessionStorage;}catch{return null;}})()) {
    if (!client || typeof client.rpc !== 'function') throw Error('Pass the authenticated Supabase client.');
    let pending = null, actor = '';
    const storageKey = () => 'mcpa.wa.consumables.pending.' + actor;
    function persist() {try {if(actor && storage){if(pending)storage.setItem(storageKey(),JSON.stringify(pending));else storage.removeItem(storageKey());}}catch{/* In-memory retry remains available if storage is unavailable. */}}
    async function call(name, args) {
      const response = await client.rpc(name, args);
      if (response?.error) throw Object.assign(Error(errorText(response.error)), {code:response.error.code});
      if (!response || !response.data || typeof response.data !== 'object') throw Error('The server returned no result. Retry the interrupted action to check whether it completed.');
      return response.data;
    }
    return {call, bindActor(id) {
      if(actor===id)return;
      actor=id;pending=null;
      try{const saved=storage?.getItem(storageKey());if(saved){const value=JSON.parse(saved);if(uuidPattern.test(value.operation)&&typeof value.action==='string'&&value.payload&&value.key===JSON.stringify([value.action,value.payload]))pending=value;}}catch{/* Ignore corrupt local recovery data; server still validates every argument. */}
    }, getPending(){return pending?JSON.parse(JSON.stringify(pending)):null;}, async retryPending(){if(!pending)throw Error('No interrupted action to retry.');return this.mutate(pending.action,pending.payload);}, async mutate(action, payload) {
      const key = JSON.stringify([action,payload]);
      if(pending&&pending.key!==key)throw Error('An earlier action has an uncertain result. Retry that action before submitting different values.');
      const operation = pending?.operation || globalThis.crypto.randomUUID();
      pending={key,operation,action,payload:JSON.parse(JSON.stringify(payload))};persist();
      try {
        const value = await call(action, {p_operation_id:operation, ...payload});
        pending=null;persist();return value;
      } catch(error) {
        // PostgreSQL errors imply a rolled-back transaction. Transport failures
        // keep the exact operation/payload for receipt recovery, including reload.
        if (/^(22|23|40|42|P0)/.test(error.code || '')) {pending=null;persist();}
        throw error;
      }
    }};
  }
  return {MAX,escape,quantity,format,add,validateRequest,csv,dateRange,dayInManila,aggregate,inventory,filterInventory,errorText,createClient};
});
