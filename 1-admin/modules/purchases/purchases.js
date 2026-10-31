/* Record-only ledger. Delivery and stock mutations stay in Material Requests. */
(function () {
 'use strict';
 const root = document.getElementById('screen-purchase');
 if (!root || !MCPAAuth.canRoute('purchase')) return;
 const $ = selector => root.querySelector(selector), esc = MovementOverview.escape;
 const client = () => EquipmentTracking.client(), dialog = $('#purchase-dialog'), body = $('#purchase-dialog-body');
 const controller = new AbortController();
 let state = {purchases: [], requests: [], history: []}, ready = false, busy = false, editing, focus, dirty = false, staged;
 const money = value => Number(value).toLocaleString('en-PH', {style: 'currency', currency: 'PHP'});
 const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
 const status = p => window.MCPADisplay.status(p.delivery_status, 'delivery');
 function feedback(message, error = false) { $('#purchase-feedback').textContent = message; $('#purchase-feedback').setAttribute('role', error ? 'alert' : 'status'); }
 function explain(error) {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)) return 'Purchase setup is not installed. Ask your administrator to complete setup, then refresh.';
  if (error?.code === '42501') return 'Your account cannot manage purchase records.';
  if (error?.code === '23505') return 'A purchase with this supplier, reference and date already exists. Check the ledger.';
  return ['40001', '22023'].includes(error?.code) ? error.message : 'Purchase records could not be saved or loaded. Your form is kept; check your connection and retry.';
 }
 function render() {
  const q = $('#purchase-search').value.trim().toLowerCase(), from = $('#purchase-from').value, until = $('#purchase-until').value;
  if (from && until && from > until) { feedback('Choose an end date on or after the start date.', true); return; }
  const rows = state.purchases.filter(p => (!from || p.purchase_date >= from) && (!until || p.purchase_date <= until) && [p.supplier, p.reference, p.purchase_number, p.request_number, ...p.items.map(i => i.description)].join(' ').toLowerCase().includes(q));
  $('#purchase-results').innerHTML = rows.length ? `<table><caption class="mv-sr">Purchase records</caption><thead><tr><th>Purchase / Reference</th><th>Supplier</th><th>Date</th><th>Material Request / Delivery</th><th>Total</th><th>Actions</th></tr></thead><tbody>${rows.map(p => `<tr><td>${esc(window.MCPADisplay.numberedReference('PUR',p.purchase_number))}<div class="cell-sub">${esc(p.reference)}</div></td><td>${esc(p.supplier)}</td><td>${esc(window.MCPADisplay.date(p.purchase_date))}</td><td>${p.request_number ? esc(window.MCPADisplay.numberedReference('CR',p.request_number)) : 'No linked request'}<div class="cell-sub">${esc(status(p))}</div></td><td>${money(p.total)}</td><td><button type="button" class="btn btn-secondary btn-sm" data-purchase-view="${esc(p.id)}">View</button> <button type="button" class="btn btn-secondary btn-sm" data-purchase-edit="${esc(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><h3>No purchases to show</h3><p>Record a purchase or change the search and dates.</p></div>';
 }
 async function load() {
  if (busy || !root.isConnected) return;
  if (MCPAAuth.isDemo) { feedback('Sign in to the company workspace to manage purchases.'); $('#purchase-results').innerHTML = '<p class="empty-state">Live purchase records are not loaded in offline demo.</p>'; return; }
  $('#purchase-results').setAttribute('aria-busy', 'true');
  try {
   MCPAAuth.requireLive(); const {data, error} = await client().rpc('mcpa_purchase_snapshot'); if (error) throw error;
   if (!root.isConnected) return; state = data; ready = true; render(); $('[data-purchase-new]').disabled = false;
  } catch (error) { feedback(explain(error), true); }
  finally { $('#purchase-results')?.setAttribute('aria-busy', 'false'); }
 }
 function open(title) { focus = document.activeElement; $('#purchase-dialog-heading').textContent = title; dirty = false; dialog.showModal(); }
 function close(force = false) {
  if (busy || (!force && dirty && !confirm('Discard your unsaved purchase changes?'))) return;
  dialog.close(); body.replaceChildren(); editing = null; staged = null; dirty = false; focus?.focus();
 }
 function line(item = {description: '', quantity: 1, unit_price: 0}) {
  return `<div class="purchase-line"><label class="field">Item description<input name="description" required maxlength="300" value="${esc(item.description)}"></label><label class="field">Quantity<input name="quantity" type="number" min="0.001" max="999999999.999" step="0.001" required value="${esc(item.quantity)}"></label><label class="field">Unit price (PHP)<input name="unit_price" type="number" min="0" max="999999999999.99" step="0.01" required value="${esc(item.unit_price)}"></label><button type="button" class="btn btn-secondary btn-sm" data-purchase-remove>Remove item</button></div>`;
 }
 function total() {
  const sum = [...body.querySelectorAll('.purchase-line')].reduce((value, row) => value + Math.round(Number(row.querySelector('[name=quantity]').value) * Number(row.querySelector('[name=unit_price]').value) * 100) / 100, 0);
  body.querySelector('[data-purchase-total]').textContent = 'Total: ' + money(sum);
 }
 function form(record) {
  editing = {id: record?.id || crypto.randomUUID(), version: record?.version ?? null, record, operations: new Map()}; staged = null;
  body.innerHTML = `<form id="purchase-form"><p id="purchase-form-error" role="alert" tabindex="-1"></p><div class="form-grid"><label class="field">Supplier<input name="supplier" required maxlength="160" value="${esc(record?.supplier || '')}"></label><label class="field">Invoice / Reference<input name="reference" required maxlength="120" value="${esc(record?.reference || '')}"></label><label class="field">Purchase date<input name="purchase_date" type="date" required value="${esc(record?.purchase_date || today())}"></label><label class="field">Material Request (optional)<select name="request_id"><option value="">No linked request</option>${state.requests.filter(r => !r.consumable_archived || r.id === record?.request_id).map(r => `<option value="${esc(r.id)}" ${record?.request_id === r.id ? 'selected' : ''}>${esc(window.MCPADisplay.numberedReference('CR',r.request_number))} · ${esc([r.item_code,r.item_name,r.specification].filter(Boolean).join(" ? "))}</option>`).join('')}</select></label></div><h3>Purchased items</h3><div data-purchase-lines>${(record?.items || [undefined]).map(line).join('')}</div><button type="button" class="btn btn-secondary btn-sm" data-purchase-add-line>Add item</button><p class="purchase-total" data-purchase-total></p><label class="field">Receipt / Invoice ${record?.receipt_path ? '(select a file to replace the current attachment)' : '(optional)'}<input id="purchase-receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label><p class="purchase-note">PDF, JPEG, PNG or WebP, up to 10 MB. The current receipt stays attached unless you replace it.</p><label class="field">Notes<textarea name="notes" rows="3" maxlength="2000">${esc(record?.notes || '')}</textarea></label><div class="purchase-actions"><button type="button" class="btn btn-secondary" data-purchase-close>Cancel</button><button type="submit" class="btn btn-primary">Save purchase</button></div></form>`;
  total(); open(record ? 'Edit purchase' : 'Record purchase'); body.querySelector('[name=supplier]').focus();
 }
 function detail(p) {
  const history = state.history.filter(h => h.purchase_id === p.id);
  body.innerHTML = `<dl class="purchase-details"><dt>Supplier</dt><dd>${esc(p.supplier)}</dd><dt>Reference / Purchase date</dt><dd>${esc(p.reference)} · ${esc(window.MCPADisplay.date(p.purchase_date))}</dd><dt>Delivery</dt><dd>${esc(status(p))}</dd><dt>Recorded by</dt><dd>${esc(p.created_by_name)}</dd><dt>Notes</dt><dd>${esc(p.notes || 'No notes')}</dd></dl><div class="table-wrap"><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${p.items.map(i => `<tr><td>${esc(i.description)}</td><td>${esc(i.quantity)}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table></div><p class="purchase-total">Total: ${money(p.total)}</p>${p.receipt_path ? `<button type="button" class="btn btn-secondary" data-purchase-receipt="${esc(p.id)}">Open private receipt</button>` : '<p>No receipt attached.</p>'}${p.request_id ? '<button type="button" class="btn btn-secondary" data-purchase-materials>Open Material Requests</button>' : ''}<h3>Purchase history</h3><ol class="purchase-history">${history.map(h => `<li><strong>${h.before_record ? 'Updated' : 'Recorded'}</strong> by ${esc(window.MCPADisplay.person(h.actor_name))}<div class="cell-sub">${esc(window.MCPADisplay.dateTime(h.created_at))} Manila</div><div>${h.before_record ? money(h.before_record.total) + ' → ' : ''}${money(h.after_record.total)} · ${esc(h.after_record.reference)}</div></li>`).join('')}</ol>`;
  open('PUR-' + p.purchase_number);
 }
 async function save(event) {
  event.preventDefault(); if (busy || !editing || !event.target.reportValidity()) return;
  const formData = new FormData(event.target), record = Object.fromEntries(['supplier', 'reference', 'purchase_date', 'request_id', 'notes'].map(key => [key, String(formData.get(key) || '').trim()]));
  record.items = [...body.querySelectorAll('.purchase-line')].map(row => Object.fromEntries(['description', 'quantity', 'unit_price'].map(key => [key, row.querySelector('[name=' + key + ']').value.trim()])));
  const file = $('#purchase-receipt').files[0], errorBox = $('#purchase-form-error'), controls = [...event.target.querySelectorAll('button,input,select,textarea')];
  busy = true; errorBox.textContent = ''; controls.forEach(el => el.disabled = true); event.target.setAttribute('aria-busy', 'true');
  try {
   MCPAAuth.requireLive();
   if (file) {
    const types = {'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
    if (!types[file.type] || !file.size || file.size > 10 * 1024 * 1024) throw {code: '22023', message: 'Choose a PDF, JPEG, PNG or WebP receipt up to 10 MB.'};
    if (!staged || staged.file !== file) {
     const path = editing.id + '/' + crypto.randomUUID() + '.' + types[file.type];
     const {error} = await client().storage.from('purchase-receipts').upload(path, file, {upsert: false, contentType: file.type});
     if (error) throw {code: '22023', message: 'Receipt upload failed. Your form is kept; check your connection and retry.'}; staged = {file, path};
    }
    record.receipt_path = staged.path;
   }
   const fingerprint = JSON.stringify(record); if (!editing.operations.has(fingerprint)) editing.operations.set(fingerprint, crypto.randomUUID());
   const {data, error} = await client().rpc('mcpa_save_purchase', {p_id: editing.id, p_version: editing.version, p_operation_id: editing.operations.get(fingerprint), p_record: record});
   if (error) throw error; if (!data?.id) throw new Error('No saved purchase returned');
   busy = false; dirty = false; close(true); feedback('Purchase saved. Confirm deliveries in Material Requests.'); await load();
  } catch (error) { errorBox.textContent = explain(error); errorBox.focus(); }
  finally { busy = false; controls.forEach(el => el.disabled = false); event.target.setAttribute('aria-busy', 'false'); }
 }
 root.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.hasAttribute('data-purchase-close')) return close();
  if (button.hasAttribute('data-purchase-refresh')) return load();
  if (button.hasAttribute('data-purchase-new') && ready) return form();
  if (button.dataset.purchaseEdit) return form(state.purchases.find(p => p.id === button.dataset.purchaseEdit));
  if (button.dataset.purchaseView) return detail(state.purchases.find(p => p.id === button.dataset.purchaseView));
  if (button.hasAttribute('data-purchase-add-line')) { if (body.querySelectorAll('.purchase-line').length >= 100) return; body.querySelector('[data-purchase-lines]').insertAdjacentHTML('beforeend', line()); dirty = true; total(); return; }
  if (button.hasAttribute('data-purchase-remove')) { if (body.querySelectorAll('.purchase-line').length <= 1) return; button.closest('.purchase-line').remove(); dirty = true; total(); return; }
  if (button.hasAttribute('data-purchase-materials')) { close(true); showScreen('consumables'); return; }
  if (button.dataset.purchaseReceipt) {
   const p = state.purchases.find(p => p.id === button.dataset.purchaseReceipt), tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null;
   try { const {data, error} = await client().storage.from('purchase-receipts').createSignedUrl(p.receipt_path, 300); if (error || !data?.signedUrl) throw error || new Error('Receipt unavailable'); if (tab) tab.location.replace(data.signedUrl); else feedback('Allow popups to open the receipt, then try again.', true); }
   catch (_) { tab?.close(); feedback('Receipt could not load. Check your access and connection, then retry.', true); }
  }
 }, {signal: controller.signal});
 root.addEventListener('submit', event => { if (event.target.id === 'purchase-form') void save(event); }, {signal: controller.signal});
 root.addEventListener('input', event => { if (event.target.closest('#purchase-form')) { dirty = true; total(); } else if (event.target.id === 'purchase-search') render(); }, {signal: controller.signal});
 root.addEventListener('change', event => { if (event.target.closest('#purchase-form')) dirty = true; else render(); }, {signal: controller.signal});
 dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, {signal: controller.signal});
 window.MCPAPurchases = {clearRecord() { if (!dirty) close(true); }, async openRecord(id) { await mounted; if (!root.isConnected) return; const record=state.purchases.find(p=>p.id===id); if(record) detail(record); else feedback('This purchase is no longer available or access was denied.',true); }, dispose() { controller.abort(); dialog.close(); }};
 const mounted = load();
 window.MCPANavigation?.track(root, mounted);
})();
