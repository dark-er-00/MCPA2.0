/* Optional Engineer / Architect mount; loaded after client.js and view.js. */
(function (scope) {
  'use strict';
  let instance = 0;
  function mount({ root, supabase, embedded = false }) {
    const Q = scope.MCPAQuantityRequests, V = scope.MCPAQuantityView;
    if (!Q || !V) throw new Error('Load the Workstream A quantity client and view helpers first.');
    root = V.shell(root, 'Request equipment by quantity', 'Choose a compatible equipment type and quantity. Admin assigns the individual Asset IDs.');
    if (embedded) root.classList.add('equipment-quantity-create');
    const engineer = scope.MCPAPermissions.operational(scope.MCPAAuth?.profile?.role);
    const retryButton = root.querySelector('[data-q-action="refresh"]');
    if(engineer){retryButton.hidden=true;retryButton.textContent='Retry loading inventory';}
    const recoverButton=document.createElement('button');recoverButton.type='button';recoverButton.className='wa-q-button';recoverButton.dataset.qRecover='';recoverButton.hidden=true;recoverButton.textContent='Check interrupted submission';root.querySelector('[data-q-feedback]').after(recoverButton);
    const client = Q.createClient(supabase), prefix = 'wa-q-engineer-' + (++instance);
    const state = { catalog: null, history: [], typeId: '', search: '', siteId: '', quantity: '1', purpose: '', filter: 'all', busy: false, destroyed: false, pendingDraft: null, confirmed: '' };
    // Success confirmation modal. Lives outside [data-q-body] so re-renders never remove it.
    const dialog = document.createElement('dialog');
    dialog.className = 'wa-q-dialog'; dialog.dataset.qSuccessDialog = '';
    dialog.setAttribute('aria-labelledby', prefix + '-dialog-title'); dialog.setAttribute('aria-describedby', prefix + '-dialog-body');
    dialog.innerHTML = `<div class="wa-q-dialog-icon" aria-hidden="true">✓</div><h3 id="${prefix}-dialog-title">Quantity request submitted</h3><p id="${prefix}-dialog-body">Admin will review availability and allocate the individual Asset IDs. You can follow its progress in My Requests.</p><dl class="wa-q-dialog-summary" data-q-dialog-summary></dl><div class="wa-q-dialog-actions"><button type="button" class="wa-q-button" data-q-dialog-history ${embedded ? 'data-jump-history' : ''}>View My Requests</button><button type="button" class="wa-q-button wa-q-primary" data-q-dialog-close>Done</button></div>`;
    root.append(dialog);
    let dialogSkipFocus = false;
    dialog.addEventListener('close', () => {
      if (state.destroyed || dialogSkipFocus) { dialogSkipFocus = false; return; }
      root.querySelector('[data-q-search]')?.focus({ preventScroll: true });
    });
    function showConfirmation(saved, draft, group, site) {
      const rows = [
        ['Request ID', saved.id],
        ['Equipment', saved.type_name || (group ? V.title(group) : 'Equipment type')],
        ['Quantity', (saved.requested_quantity ?? draft.quantity) + ' individual asset(s)'],
        ['Project / site', saved.site_name || site?.name || 'Assigned project'],
        ['Status', 'Awaiting Admin review']
      ];
      dialog.querySelector('[data-q-dialog-summary]').innerHTML = rows.map(([term, value]) => `<div><dt>${V.escape(term)}</dt><dd>${V.escape(value)}</dd></div>`).join('');
      dialogSkipFocus = false;
      if (dialog.open) return;
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      dialog.querySelector('[data-q-dialog-close]').focus();
    }
    function closeDialog(skipFocus = false) {
      dialogSkipFocus = skipFocus;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else { dialog.removeAttribute('open'); dialogSkipFocus = false; }
    }
    function resetForm() {
      state.typeId = ''; state.quantity = '1'; state.purpose = ''; state.search = '';
      state.siteId = state.catalog?.sites.length === 1 ? state.catalog.sites[0].id : '';
    }
    const body = () => root.querySelector('[data-q-body]');
    const selected = () => state.catalog?.groups.find(group => group.type_id === state.typeId);
    function renderCatalog() {
      const host = root.querySelector('[data-q-catalog]');
      if (!host) return;
      const query = state.search.trim().toLowerCase();
      const groups = state.catalog.groups.filter(group => [V.title(group), V.variant(group), group.tracking_type].join(' ').toLowerCase().includes(query));
      host.innerHTML = groups.length ? groups.map(group => {
        const eligible = group.requestable && group.available_quantity > 0;
        return `<li class="wa-q-type${state.typeId === group.type_id ? ' wa-q-selected' : ''}"><div class="wa-q-type-heading"><div><strong>${V.escape(V.title(group))}</strong><p>${V.escape(V.variant(group))}</p></div><span class="wa-q-tracking">${V.escape(group.tracking_type)}</span></div>${V.stock(group)}${!group.requestable ? '<p class="wa-q-muted">Grouped Bulk, empty or ineligible records cannot be requested here. Admin can review these records in the existing equipment workflow.</p>' : ''}<button class="wa-q-button" type="button" data-q-type="${V.escape(group.type_id)}" aria-pressed="${state.typeId === group.type_id}" ${!eligible || state.busy ? 'disabled' : ''}>${!group.requestable ? 'Unavailable in this workflow' : group.available_quantity === 0 ? 'No available stock' : state.typeId === group.type_id ? 'Selected type' : 'Choose type'}</button></li>`;
      }).join('') : '<li class="wa-q-empty">No matching equipment types. Try another name, category or variant.</li>';
    }
    function renderHistory() {
      const records = state.history.filter(record => state.filter === 'all' || record.status === state.filter);
      root.querySelector('[data-q-history]').innerHTML = V.history(records);
    }
    function renderForm() {
      const group = selected(), host = root.querySelector('[data-q-form-host]');
      if (!host) return;
      if (!group) { host.innerHTML = '<section class="wa-q-request"><h3>Request details</h3><p class="wa-q-empty">Choose an available individual equipment type to enter the quantity and project.</p></section>'; return; }
      const noSites = state.catalog.sites.length === 0, maxQuantity = Math.min(group.available_quantity, Q.MAX_REQUEST_QUANTITY);
      host.innerHTML = `<section class="wa-q-request"><h3>Request details</h3><p class="wa-q-chosen"><strong>${V.escape(V.title(group))}</strong><span>${V.escape(V.variant(group))}</span></p>${V.stock(group)}<form data-q-form><fieldset ${state.busy ? 'disabled' : ''}><legend class="wa-q-sr-only">Equipment request details</legend><label for="${prefix}-quantity">Quantity <span>(individual assets)</span></label><input id="${prefix}-quantity" name="quantity" type="number" min="1" max="${V.escape(maxQuantity)}" step="1" inputmode="numeric" required value="${V.escape(state.quantity)}" aria-describedby="${prefix}-availability"><p class="wa-q-help" id="${prefix}-availability">${V.escape(V.count(group.available_quantity))} currently available. Request up to 100 at once. Reserved and deployed equipment cannot be requested.</p><label for="${prefix}-site">Project / site</label><select id="${prefix}-site" name="siteId" required ${noSites ? 'disabled' : ''}><option value="">Choose an assigned project / site</option>${state.catalog.sites.map(site => `<option value="${V.escape(site.id)}"${state.siteId === site.id ? ' selected' : ''}>${V.escape(site.name)}</option>`).join('')}</select>${noSites ? '<p class="wa-q-error">No active project is assigned to your account. Ask Admin to assign a project before requesting.</p>' : ''}<label for="${prefix}-purpose">Purpose <span>(optional)</span></label><textarea id="${prefix}-purpose" name="purpose" rows="3" maxlength="2000" placeholder="Describe the work these tools will support.">${V.escape(state.purpose)}</textarea><p class="wa-q-review" data-q-review></p><button class="wa-q-button wa-q-primary" type="submit" ${noSites || !group.requestable || group.available_quantity < 1 || state.busy ? 'disabled' : ''}>${state.busy ? 'Submitting…' : 'Submit quantity request'}</button></fieldset></form></section>`;
      updateReview();
    }
    function updateReview() {
      const host = root.querySelector('[data-q-review]');
      if (!host) return;
      const site = state.catalog.sites.find(item => item.id === state.siteId);
      host.textContent = `${state.quantity || '0'} individual assets${site ? ' for ' + site.name : ''}. Admin will review availability and reserve the exact quantity.`;
    }
    function render() {
      if (state.destroyed) return;
      body().innerHTML = `<div class="wa-q-workspace"><section class="wa-q-browse"><h3>Compatible equipment types</h3><p class="wa-q-muted">Variants stay separate. Similar names do not mean tools are interchangeable.</p><label for="${prefix}-search">Find a type or variant</label><input type="search" id="${prefix}-search" data-q-search value="${V.escape(state.search)}" placeholder="Search name, category or variant"><ul class="wa-q-catalog" data-q-catalog></ul></section><div data-q-form-host></div></div><section class="wa-q-history-section"><div class="wa-q-section-heading"><h3>Request history</h3><label class="wa-q-inline-label" for="${prefix}-filter">Status <select id="${prefix}-filter" data-q-filter><option value="all">All statuses</option>${['pending', 'approved', 'rejected', 'released', 'cancelled'].map(status => `<option value="${status}"${state.filter === status ? ' selected' : ''}>${V.escape(({ approved: 'Approved / reserved' })[status] || status[0].toUpperCase() + status.slice(1))}</option>`).join('')}</select></label></div><div data-q-history></div></section>`;
      renderCatalog(); renderForm(); renderHistory();
    }
    async function refresh(message = '') {
      if (state.busy || state.destroyed || state.pendingDraft) return;
      state.busy = true; root.setAttribute('aria-busy', 'true');
      root.querySelector('[data-q-action="refresh"]').disabled = true;
      try {
        const catalog = await client.catalog();
        if (state.destroyed) return;
        if (!['engineer', 'architect'].includes(catalog.profile.role)) {
          body().innerHTML = '<p class="wa-q-empty">Quantity requesting is available to Engineer and Architect accounts.</p>';
          V.notice(root, 'Your account cannot submit equipment quantity requests.', true); return false;
        }
        const records = await client.history();
        if (state.destroyed) return false;
        state.catalog = catalog; state.history = records;
        if (!catalog.groups.some(group => group.type_id === state.typeId)) state.typeId = '';
        if (!catalog.sites.some(site => site.id === state.siteId)) state.siteId = catalog.sites.length === 1 ? catalog.sites[0].id : '';
        state.confirmed = '';
        state.busy = false; render(); V.notice(root, message);if(engineer)retryButton.hidden=true;
        return true;
      } catch (error) {
        if (!state.destroyed) {
          if (!state.catalog) body().innerHTML = '<p class="wa-q-empty">Verified inventory is unavailable. Retry loading when the connection is restored.</p>';
          if(engineer)retryButton.hidden=false;
          V.notice(root, state.confirmed ? state.confirmed+' Request history or inventory could not reload. Retry loading; do not submit it again.' : error.message, !state.confirmed);
        }
        return false;
      } finally {
        state.busy = false;
        if (!state.destroyed) { root.removeAttribute('aria-busy'); root.querySelector('[data-q-action="refresh"]').disabled = false; }
      }
    }
    async function onClick(event) {
      const target = event.target.closest('button');
      if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-q-dialog-close')) { closeDialog(); return; }
      if (target.hasAttribute('data-q-dialog-history')) {
        // Embedded: the unified Equipment Requests view handles [data-jump-history] as the click bubbles.
        closeDialog(true);
        if (!embedded) { const heading = root.querySelector('.wa-q-history-section h3'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start' }); } }
        return;
      }
      if (state.busy) return;
      if(target.hasAttribute('data-q-recover')){await submitDraft(state.pendingDraft);return;}
      if(state.pendingDraft)return;
      if (target.dataset.qAction === 'refresh') { await refresh(); return; }
      if (target.dataset.qType) {
        state.typeId = target.dataset.qType; state.quantity = '1';
        renderCatalog(); renderForm();
        root.querySelector('[name="quantity"]')?.focus();
      }
    }
    function onInput(event) {
      const control = event.target;
      if (control.hasAttribute('data-q-search')) { state.search = control.value; renderCatalog(); }
      else if (['quantity', 'siteId', 'purpose'].includes(control.name)) { state[control.name] = control.value; updateReview(); }
      else if (control.hasAttribute('data-q-filter')) { state.filter = control.value; renderHistory(); }
    }
    async function submitDraft(draft) {
      if(state.busy||!draft)return;
      state.busy=true;state.confirmed='';root.setAttribute('aria-busy','true');
      root.querySelectorAll('form fieldset').forEach(node=>node.disabled=true);recoverButton.disabled=true;
      V.notice(root,'Submitting quantity request…');
      let saved;
      try {
        saved=await client.submit(draft);
        if(!saved?.id)throw Object.assign(Error('The server did not confirm a request identifier.'),{outcomeUncertain:true});
        if(state.destroyed)return;
        state.pendingDraft=null;recoverButton.hidden=true;
        state.confirmed='Quantity request '+saved.id+' submitted. Admin will review and allocate individual Asset IDs.';
        const group=state.catalog?.groups.find(item=>item.type_id===draft.typeId), site=state.catalog?.sites.find(item=>item.id===draft.siteId);
        resetForm();
        V.notice(root,'');
        showConfirmation(saved,draft,group,site);
      } catch(error) {
        if(state.destroyed)return;
        if(error.outcomeUncertain){
          state.pendingDraft={...draft};recoverButton.hidden=false;
          V.notice(root,'Submission status is uncertain. Your request may already be saved. Check My Requests or use “Check interrupted submission” to verify the same action safely. Do not create a duplicate.',true);
        }else{state.pendingDraft=null;recoverButton.hidden=true;V.notice(root,error.message,true);}
      } finally {
        state.busy=false;
        if(!state.destroyed){root.removeAttribute('aria-busy');recoverButton.disabled=false;root.querySelectorAll('form fieldset').forEach(node=>node.disabled=!!state.pendingDraft);}
      }
      if(saved?.id&&!state.destroyed){
        // Clear the whole form immediately, then reload verified stock and history.
        render();
        const reloaded=await refresh();
        if(!state.destroyed)root.dispatchEvent(new CustomEvent('mcpa:quantity-request-confirmed',{bubbles:true,detail:{id:saved.id,history:reloaded?state.history:null}}));
      }
    }
    async function onSubmit(event) {
      if (!event.target.matches('[data-q-form]')) return;
      event.preventDefault();
      if(state.busy||state.pendingDraft||!event.target.reportValidity())return;
      await submitDraft({typeId:state.typeId,siteId:state.siteId,quantity:state.quantity,purpose:state.purpose});
    }
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onInput); root.addEventListener('submit', onSubmit);
    const ready = refresh();
    return Object.freeze({ ready, refresh, destroy() { state.destroyed = true; if (dialog.open) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); } root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); root.removeEventListener('submit', onSubmit); root.removeAttribute('aria-busy'); root.classList.remove('wa-quantity'); root.replaceChildren(); } });
  }
  scope.MCPAQuantityEngineer = Object.freeze({ mount });
})(window);
