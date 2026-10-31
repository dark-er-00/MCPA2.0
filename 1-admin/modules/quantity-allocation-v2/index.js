/* Optional Admin review mount; no release, custody or movement writes here. */
(function (scope) {
  'use strict';
  let instance = 0;
  function mount({ root, supabase, embedded = false }) {
    const Q = scope.MCPAQuantityRequests, V = scope.MCPAQuantityView;
    if (!Q || !V) throw new Error('Load the Workstream A quantity client and view helpers first.');
    root = V.shell(root, 'Allocate equipment quantities', 'Review the requested type and reserve the exact number of eligible individual assets.');
    if (embedded) root.classList.add('equipment-quantity-review');
    const client = Q.createClient(supabase), prefix = 'wa-q-admin-' + (++instance);
    const state = { catalog: null, records: [], requestId: '', suggestion: null, selected: new Set(), reason: '', filter: 'pending', busy: false, destroyed: false };
    const body = () => root.querySelector('[data-q-body]');
    const record = () => state.records.find(item => item.id === state.requestId);
    function renderQueue() {
      const records = state.records.filter(item => state.filter === 'all' || item.status === state.filter);
      const host = root.querySelector('[data-q-queue]');
      if (!host) return;
      host.innerHTML = records.length ? records.map(item => `<li><button class="wa-q-queue-item${item.id === state.requestId ? ' wa-q-selected' : ''}" type="button" data-q-request="${V.escape(item.id)}" aria-pressed="${item.id === state.requestId}" ${state.busy ? 'disabled' : ''}><span><strong>${V.escape(item.type_name)}</strong><small>${V.escape(item.requester_name)} · ${V.escape(item.site_name)}</small><small>${V.escape(V.date(item.created_at))}</small></span><span class="wa-q-queue-meta"><strong>${V.escape(item.requested_quantity)} requested</strong>${V.status(item.status)}</span></button></li>`).join('') : '<li class="wa-q-empty">No requests match this status. Choose All statuses to review past allocations.</li>';
    }
    function updateSelection() {
      const current = record(); if (!current) return;
      const host = root.querySelector('[data-q-selection-count]');
      if (host) host.textContent = `${state.selected.size} of ${current.requested_quantity} Asset IDs selected`;
      const approve = root.querySelector('[data-q-approve]');
      if (approve) approve.disabled = state.busy || state.selected.size !== Number(current.requested_quantity);
    }
    function renderReview() {
      const host = root.querySelector('[data-q-review]'); if (!host) return;
      const current = record();
      if (!current) { host.innerHTML = '<section class="wa-q-request"><h3>Request review</h3><p class="wa-q-empty">Choose a request to review its project, quantity and eligible Asset IDs.</p></section>'; return; }
      const group = state.catalog.groups.find(item => item.type_id === current.type_id);
      const header = `<h3>${V.escape(current.type_name || 'Equipment request')}</h3><p class="wa-q-muted">${V.escape(current.requester_name)} · ${V.escape(current.site_name)}</p>${V.status(current.status)}${group ? `<p class="wa-q-muted">${V.escape(V.variant(group))}</p>${V.stock(group)}` : ''}${V.details(current)}`;
      if (current.status !== 'pending') { host.innerHTML = `<section class="wa-q-request">${header}</section>`; return; }
      const eligible = state.suggestion?.eligible_assets || [];
      host.innerHTML = `<section class="wa-q-request">${header}<hr><h4>Proposed individual allocation</h4><p class="wa-q-muted">${eligible.length} eligible assets. Review the suggestion or adjust the Asset IDs below. Availability is checked again atomically when you approve.</p>${!state.suggestion ? '<p class="wa-q-error">Eligible assets could not be verified. Refresh before allocating.</p>' : ''}${eligible.length < Number(current.requested_quantity) ? `<p class="wa-q-error">This request needs ${V.escape(current.requested_quantity)} assets; only ${eligible.length} are eligible now. Refresh after stock becomes available or reject with a reason.</p>` : ''}<form data-q-allocate-form><fieldset ${state.busy ? 'disabled' : ''}><legend class="wa-q-sr-only">Choose individual Asset IDs</legend><div class="wa-q-selection-toolbar"><p class="wa-q-label" aria-live="polite" data-q-selection-count></p><div class="wa-q-actions"><button class="wa-q-button" type="button" data-q-action="suggested" ${!state.suggestion ? 'disabled' : ''}>Use suggestion</button><button class="wa-q-button" type="button" data-q-action="clear">Clear selection</button></div></div><div class="wa-q-asset-options">${eligible.map(asset => `<label class="wa-q-asset-option"><input type="checkbox" name="assetId" value="${V.escape(asset.id)}" ${state.selected.has(asset.id) ? 'checked' : ''}><span><strong>${V.escape(asset.asset_id)}</strong><small>${V.escape(asset.name || current.type_name)}</small></span></label>`).join('') || '<p class="wa-q-empty">No eligible physical Asset IDs are available.</p>'}</div><button class="wa-q-button wa-q-primary" type="submit" data-q-approve>Approve and reserve ${V.escape(current.requested_quantity)} assets</button></fieldset></form><form class="wa-q-rejection" data-q-reject-form><fieldset ${state.busy ? 'disabled' : ''}><legend>Reject request</legend><label for="${prefix}-reason">Reason for rejection</label><textarea id="${prefix}-reason" name="reason" maxlength="2000" rows="2" required placeholder="Explain why this quantity request cannot be approved.">${V.escape(state.reason)}</textarea><button class="wa-q-button wa-q-danger" type="submit">Reject request</button></fieldset></form></section>`;
      updateSelection();
    }
    function render() {
      if (state.destroyed) return;
      body().innerHTML = `<div class="wa-q-workspace wa-q-admin-workspace"><section class="wa-q-browse"><div class="wa-q-section-heading"><h3>Quantity requests</h3><label class="wa-q-inline-label" for="${prefix}-filter">Status <select id="${prefix}-filter" data-q-filter><option value="pending"${state.filter === 'pending' ? ' selected' : ''}>Pending</option><option value="all"${state.filter === 'all' ? ' selected' : ''}>All statuses</option><option value="approved"${state.filter === 'approved' ? ' selected' : ''}>Approved / reserved</option><option value="rejected"${state.filter === 'rejected' ? ' selected' : ''}>Rejected</option></select></label></div><ul class="wa-q-queue" data-q-queue></ul></section><div data-q-review></div></div>`;
      renderQueue(); renderReview();
    }
    function selectSuggestion() {
      const eligible = new Set((state.suggestion?.eligible_assets || []).map(asset => asset.id));
      state.selected = new Set((state.suggestion?.suggested_asset_ids || []).filter(assetId => eligible.has(assetId)));
    }
    async function readSuggestion() {
      state.suggestion = null; state.selected.clear();
      if (record()?.status === 'pending') { state.suggestion = await client.suggest(state.requestId); selectSuggestion(); }
    }
    async function refresh(message = '') {
      if (state.busy || state.destroyed) return;
      state.busy = true; root.setAttribute('aria-busy', 'true'); root.querySelector('[data-q-action="refresh"]').disabled = true;
      try {
        const catalog = await client.catalog();
        if (state.destroyed) return;
        if (catalog.profile.role !== 'admin') { body().innerHTML = '<p class="wa-q-empty">Individual allocation review is available to Admin accounts.</p>'; V.notice(root, 'Your account cannot allocate quantity requests.', true); return; }
        state.catalog = catalog; state.records = await client.history();
        if (state.destroyed) return;
        if (!record()) state.requestId = (state.records.find(item => item.status === 'pending') || state.records[0])?.id || '';
        await readSuggestion();
        if (state.destroyed) return;
        state.busy = false; render(); V.notice(root, message);
      } catch (error) {
        if (!state.destroyed) {
          state.busy = false;
          if (state.catalog) render(); else body().innerHTML = '<p class="wa-q-empty">Verified requests are unavailable. Use Refresh to try again.</p>';
          V.notice(root, error.message, true);
        }
      } finally { state.busy = false; if (!state.destroyed) { root.removeAttribute('aria-busy'); root.querySelector('[data-q-action="refresh"]').disabled = false; } }
    }
    async function onClick(event) {
      const target = event.target.closest('button');
      if (!target || !root.contains(target) || state.busy) return;
      if (target.dataset.qAction === 'refresh') { await refresh(); return; }
      if (target.dataset.qAction === 'suggested') { selectSuggestion(); renderReview(); return; }
      if (target.dataset.qAction === 'clear') { state.selected.clear(); renderReview(); return; }
      if (target.dataset.qRequest) {
        state.requestId = target.dataset.qRequest; state.reason = ''; state.busy = true;
        root.setAttribute('aria-busy', 'true');
        try { await readSuggestion(); if (!state.destroyed) { state.busy = false; renderQueue(); renderReview(); V.notice(root, ''); } }
        catch (error) { if (!state.destroyed) { state.busy = false; renderReview(); V.notice(root, error.message, true); } }
        finally { state.busy = false; if (!state.destroyed) root.removeAttribute('aria-busy'); }
      }
    }
    function onInput(event) {
      const control = event.target;
      if (control.name === 'reason') state.reason = control.value;
      if (control.name === 'assetId') { if (control.checked) state.selected.add(control.value); else state.selected.delete(control.value); updateSelection(); }
      if (control.hasAttribute('data-q-filter')) { state.filter = control.value; renderQueue(); }
    }
    async function onSubmit(event) {
      const approve = event.target.matches('[data-q-allocate-form]'), reject = event.target.matches('[data-q-reject-form]');
      if (!approve && !reject) return;
      event.preventDefault();
      if (state.busy || !event.target.reportValidity()) return;
      const current = record(); if (!current) return;
      state.busy = true; root.setAttribute('aria-busy', 'true');
      root.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
      try {
        if (approve) await client.allocate({ requestId: current.id, assetIds: [...state.selected], requestedQuantity: current.requested_quantity, eligibleAssets: state.suggestion?.eligible_assets || [] });
        else await client.reject({ requestId: current.id, reason: state.reason });
        if (state.destroyed) return;
        state.reason = ''; state.busy = false;
        await refresh(approve ? `${current.requested_quantity} individual Asset IDs reserved. Release continues in the existing movement workflow.` : 'Request rejected. The requester can review the reason in their history.');
      } catch (error) { if (!state.destroyed) V.notice(root, error.message + ' Refresh to verify current availability before changing the selection.', true); }
      finally {
        state.busy = false;
        if (!state.destroyed) { root.removeAttribute('aria-busy'); root.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; }); updateSelection(); }
      }
    }
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onInput); root.addEventListener('submit', onSubmit);
    const ready = refresh();
    return Object.freeze({ ready, refresh, async openRecord(id) {
      if (state.busy || state.destroyed) return;
      state.requestId = id; state.reason = ''; state.busy = true;
      root.setAttribute('aria-busy', 'true');
      root.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
      try {
        state.catalog = await client.catalog();
        state.records = await client.history();
        if (state.destroyed) return;
        await readSuggestion();
        if (!state.destroyed) { state.busy = false; render(); }
      }
      catch (error) { if (!state.destroyed) { state.busy = false; if (state.catalog) renderReview(); V.notice(root, error.message, true); } }
      finally { state.busy = false; if (!state.destroyed) root.removeAttribute('aria-busy'); }
    }, destroy() { state.destroyed = true; root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); root.removeEventListener('submit', onSubmit); root.removeAttribute('aria-busy'); root.classList.remove('wa-quantity'); root.replaceChildren(); } });
  }
  scope.MCPAQuantityAdmin = Object.freeze({ mount });
})(window);
