/* Shared, scoped rendering helpers for the two optional quantity mounts. */
(function (scope) {
  'use strict';
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function title(group) { return group.type_name || group.name || 'Equipment type'; }
  function variant(group) {
    return [group.category, group.brand, group.model, group.details, group.condition, group.unit].filter(Boolean).join(' · ');
  }
  function count(value) { return value === null || value === undefined ? 'Unverified' : Number(value).toLocaleString(); }
  function stock(group) {
    return `<dl class="wa-q-stock"><div><dt>Available</dt><dd>${escape(count(group.available_quantity))}</dd></div><div><dt>Reserved</dt><dd>${escape(count(group.reserved_quantity))}</dd></div><div><dt>Deployed</dt><dd>${escape(count(group.deployed_quantity))}</dd></div></dl>`;
  }
  function date(value) {
    if (!value || Number.isNaN(Date.parse(value))) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(value));
  }
  const labels = { pending: 'Pending', approved: 'Approved / reserved', rejected: 'Rejected', released: 'Released', cancelled: 'Cancelled', fulfilled: 'Fulfilled' };
  function status(value) { return `<span class="wa-q-status" data-status="${escape(value)}">${escape(labels[value] || value || 'Status unavailable')}</span>`; }
  function details(record) {
    const assets = Array.isArray(record.assets) ? record.assets : [];
    return `<dl class="wa-q-details"><div><dt>Request ID</dt><dd>${escape(record.id)}</dd></div><div><dt>Requested</dt><dd>${escape(record.requested_quantity)}</dd></div><div><dt>Approved</dt><dd>${record.status === 'pending' || record.approved_quantity === null || record.approved_quantity === undefined ? 'Awaiting review' : escape(record.approved_quantity)}</dd></div><div><dt>Project / site</dt><dd>${escape(record.site_name || record.site_id)}</dd></div><div><dt>Purpose</dt><dd>${escape(record.purpose || 'No purpose entered')}</dd></div>${record.rejection_reason ? `<div><dt>Rejection reason</dt><dd>${escape(record.rejection_reason)}</dd></div>` : ''}${record.movement_id ? `<div><dt>Movement ID</dt><dd><a href="#request?record=${encodeURIComponent(record.movement_id)}" data-movement-link>${escape(record.movement_id)} · release and movement history</a></dd></div>` : ''}</dl>${assets.length ? `<p class="wa-q-label">Allocated Asset IDs</p><ul class="wa-q-assets">${assets.map(asset => `<li>${escape(asset.asset_id)}</li>`).join('')}</ul><p class="wa-q-muted">Admin releases the linked request. The named recipient then accepts physical custody from Accept equipment.</p>` : ''}`;
  }
  function shell(root, heading, description) {
    if (typeof root === 'string') root = document.querySelector(root);
    if (!root || typeof root.addEventListener !== 'function') throw new Error('Pass a mount root element.');
    root.classList.add('wa-quantity');
    root.innerHTML = `<header class="wa-q-header"><div><h2>${escape(heading)}</h2><p>${escape(description)}</p></div><button type="button" class="wa-q-button" data-q-action="refresh">Refresh</button></header><div class="wa-q-feedback" role="status" aria-live="polite" aria-atomic="true" data-q-feedback></div><div data-q-body><div class="wa-q-loading" role="status">Loading verified inventory and request history…</div></div>`;
    return root;
  }
  function notice(root, message, error = false) {
    const host = root.querySelector('[data-q-feedback]');
    if (!host) return;
    host.textContent = message;
    host.classList.toggle('wa-q-error', error);
    host.setAttribute('role', error ? 'alert' : 'status');
  }
  function history(records) {
    if (!records.length) return '<p class="wa-q-empty">Your submitted requests will appear here with quantities, status and assigned Asset IDs.</p>';
    return `<ul class="wa-q-history">${records.map(record => `<li><details><summary><span><strong>${escape(record.type_name || 'Equipment request')}</strong><small>${escape(record.site_name)} · ${escape(date(record.created_at))}</small></span><span class="wa-q-history-meta"><span>${escape(record.requested_quantity)} requested</span>${status(record.status)}</span></summary><div class="wa-q-history-detail">${details(record)}</div></details></li>`).join('')}</ul>`;
  }
  scope.MCPAQuantityView = Object.freeze({ escape, title, variant, count, stock, date, status, details, shell, notice, history });
})(window);
