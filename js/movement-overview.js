/* Read-only views of the same records used by movement forms. */
(function () {
  'use strict';
  let root, screen, controller, query = '', status = '', mine = false, site = '', inventory = null, stopWatching;
  let loading = false, reloadPending = false;
  let consumablesSummary = null;
  const viewData = () => ({...store().getState(), ...(inventory || {})});
  const store = () => window.MovementStore;
  const personal = () => screen === 'masterlist' && window.MCPAPermissions.operational(store().getContext().role);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const display = window.MCPADisplay;
  const when = display.dateTime;
  const button = (label, target) => `<button class="btn btn-secondary btn-sm" data-go="${target}">${label}</button>`;
  function contextBar() {
    const target=document.getElementById('movement-context'), user=window.MCPAAuth?.profile;
    if(!target || !user)return;
    target.innerHTML='<div class="movement-context-inner"><span class="movement-source">'+(window.MCPAAuth.isDemo?'Offline demo &middot; browser records':'Company workspace')+'</span><span>'+escape(user.name)+' &middot; '+escape(MCPAPermissions.labels[user.role])+'</span></div>';
  }
  function header(title, sub) {
    return `<div class="page-head"><div><h1 class="display">${escape(title)}</h1><p class="sub">${escape(sub)}</p></div>${store().mode === 'demo' ? '<span class="workspace-source">Offline demo</span>' : ''}</div><p class="sync-warning" data-sync-warning role="status"></p><div id="overview-feedback" role="status"></div>`;
  }
  function toolsTable(tools) {
    if (!tools.length && personal() && !(viewData().tools||[]).length) return '<div class="empty-state"><h3>No equipment is currently assigned to you.</h3><p>Confirmed receipts will appear here. Available tools can be requested in Requests.</p></div>';
    if (!tools.length) return '<div class="empty-state"><h3>No tools to show</h3><p>Request an available tool, or change the filters.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Project</th><th>Holder</th><th>Status / new requests</th>${MCPAPermissions.operational(userRole()) ? '' : '<th>Quantity</th>'}<th>Actions</th></tr></thead><tbody>${tools.map(t => `<tr><td><div class="equipment-identity">${window.EquipmentVisual.thumbnail(t)}<div><span class="tool-id-chip">${escape(t.id)}</span><div class="cell-name">${escape(t.name)}</div><div class="cell-sub">${escape(t.brand)}</div></div></div></td><td>${escape(t.site || 'Unassigned')}</td><td>${escape(t.holder || '—')}</td><td>${window.EquipmentTracking.statusMarkup(t,viewData())}</td>${MCPAPermissions.operational(userRole()) ? '' : `<td>${escape(t.qty)}</td>`}<td><button class="btn btn-secondary btn-sm" data-tool="${escape(t.id)}">Details</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function activityTable(rows) {
    if (!rows.length) return '<div class="empty-state"><h3>No recorded movement yet</h3><p>Saved requests, handovers, returns, and issues will appear here.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>When · Manila</th><th>Action / reference</th><th>Recorded by</th><th>Details</th></tr></thead><tbody>${rows.map(r => {
      const href = window.MCPAMovementLinks.href(r, store().getState());
      const event = display.activity(r, store().getState());
      const label = `<span class="cell-name">${escape(event.title)}</span><span class="mono">${escape(event.reference)}</span>`;
      return `<tr${href ? ' class="activity-linked-row"' : ''}><td><time datetime="${escape(r.createdAt || '')}">${escape(event.when)}</time></td><td>${href ? `<a class="activity-record-link" data-movement-link href="${escape(href)}" aria-label="Open ${escape(event.reference)}: ${escape(event.title)}">${label}</a>` : label}</td><td>${escape(event.actor)}</td><td>${escape(event.description)}<div class="cell-sub">${escape((r.toolIds || []).map(id => display.reference(id, 'Equipment reference unavailable')).join(', '))}</div></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function visibleActivity(data) {
    return [...data.activity].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).filter(r => [...Object.values(display.activity(r, data)), ...(r.toolIds || [])].join(' ').toLowerCase().includes(query.toLowerCase()));
  }
  let dashboardCondition = '';
  const dashboardState = () => ({query, status, site, condition: dashboardCondition});
  function dashboard(data, user) {
    return window.DashboardView.render({...data,consumablesSummary},user,dashboardState(),header,toolsTable,when);
  }
  function render() {
    if (!root?.isConnected) return;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
    const data = viewData(), user = store().getContext();
    contextBar();
    if (screen === 'dashboard') root.innerHTML = dashboard(data,user);
    else if (screen === 'activity') root.innerHTML = `${header('Activity logs', 'A history of saved movement actions and the people who recorded them.')}<div class="overview-filters"><div class="field"><label for="movement-activity-search">Search activity</label><input id="movement-activity-search" data-search value="${escape(query)}" placeholder="Reference, tool ID, person, action…"></div><button type="button" class="btn btn-secondary" data-export aria-label="Export activity logs as PDF">${SiteTracePDF.icon} Export PDF</button></div><div class="card" id="overview-results">${activityTable(visibleActivity(data))}</div>`;
    else root.innerHTML = `${header('Equipment Tracking', personal() ? 'Equipment in your confirmed custody. Open a tool to see its recorded history.' : 'Current location, condition, and custody. Open a tool to see its recorded history.')}<div class="overview-filters"><div class="field"><label for="movement-inventory-search">Search tools</label><input id="movement-inventory-search" data-search value="${escape(query)}" placeholder="Tool ID, name, brand, holder…"></div><div class="field"><label for="overview-status">Status</label><select id="overview-status"><option value="">All statuses</option>${Object.entries(STATUS_LABEL).map(([key,label]) => `<option value="${key}" ${status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label for="overview-site">Project</label><select id="overview-site"><option value="">All projects</option>${data.sites.map(s => `<option ${site === s.name ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></div>${personal() ? '' : `<label class="checkbox-row"><input type="checkbox" id="overview-mine" ${mine ? 'checked' : ''}>My custody only</label>`}</div><div class="card" id="overview-results"></div>`;
    if (screen === 'masterlist') filter();
    if (focusId) {
      const replacement = document.getElementById(focusId);
      replacement?.focus({preventScroll: true});
      if (typeof selectionStart === 'number') replacement?.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
  function filter() {
    const data = viewData(), user = store().getContext();
    const results = root.querySelector('#overview-results');
    if (!results) return;
    if (screen === 'dashboard') results.innerHTML = window.DashboardView.inventory(data,user,dashboardState(),toolsTable);
    else if (screen === 'activity') results.innerHTML = activityTable(visibleActivity(data));
    else results.innerHTML = toolsTable(data.tools.filter(t => window.EquipmentTracking.matchesStatus(t, status, data) && (!site || t.site === site) && (!mine || (store().mode === 'live' ? t.holderId === user.id : t.holder === user.name)) && [t.id,t.name,t.brand,t.site,t.holder,t.serial].join(' ').toLowerCase().includes(query.toLowerCase())));
  }
  function setSearch(value) {
    if (screen !== 'masterlist' || !root?.isConnected) return;
    query = value;
    const input = root.querySelector('#movement-inventory-search');
    if (input) input.value = value;
    filter();
  }
  const userRole = () => store().getContext().role;
  function detail(id) {
    const data = viewData(), item = data.tools.find(t => t.id === id);
    root.querySelector('dialog')?.remove();
    if (!item) {
      root.querySelector('#overview-feedback').textContent = 'This equipment is unavailable or your account no longer has access.';
      return;
    }
    const dialog = document.createElement('dialog'); dialog.className = 'overview-dialog'; dialog.id = 'equipment-detail';
    dialog.innerHTML = `<div class="page-head"><div><h2>${escape(item.name)}</h2><span class="tool-id-chip">${escape(item.id)}</span></div><button class="btn btn-secondary" data-close>Close</button></div><div class="overview-detail-grid"><div><span>Current holder</span><strong>${escape(item.holder || '—')}</strong></div><div><span>Project</span><strong>${escape(item.site || 'Unassigned')}</strong></div><div>${window.EquipmentTracking.statusMarkup(item,data)}</div>${MCPAPermissions.operational(userRole()) ? '' : `<div><span>Quantity</span><strong>${escape(item.qty)}</strong></div>`}</div><h3>Movement history</h3>${activityTable(visibleActivity({...data,activity:data.activity.filter(r => r.toolIds?.includes(id))}))}<div class="overview-actions">${MCPAPermissions.operational(userRole()) ? button('Request tools','request')+button('Transfer','transfer')+button('Return','return')+button('Report issue','repair') : button('View activity','activity')}</div>`;
    root.appendChild(dialog); dialog.showModal();
    const close = () => { if (window.MCPANavigation?.canBack()) window.MCPANavigation.back(); else showScreen('masterlist', null, {history:'replace'}); };
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { dialog.remove(); render(); }, {once: true});
  }
  async function load(automatic = false) {
    const owner = root;
    const sourceMode = store().mode;
    if (!owner?.isConnected) return;
    if (loading) { reloadPending = true; return; }
    loading = true;
    if (!automatic) owner.innerHTML = '<div class="card card-pad" role="status">Loading saved movement records…</div>';
    try {
      if(personal() && sourceMode==='live'){
        const {data,error}=await window.EquipmentTracking.client().rpc('mcpa_personal_equipment_snapshot');
        if(error)throw new Error(['PGRST202','42883'].includes(error.code)?'Personal equipment access is not installed yet. Contact your administrator.':'Your equipment could not load. Please retry.');
        if(!Array.isArray(data?.tools))throw new Error('Invalid personal equipment response.');
        if(root!==owner||!owner.isConnected||store().mode!==sourceMode)return;
        inventory=data;
        if(!owner.querySelector('dialog[open]'))render();
        return;
      }
      let movementError;
      // A field Dashboard must retain requests and unreceived handovers from
      // the authorized movement snapshot, distinct from confirmed custody.
      if (sourceMode === 'live' && screen === 'dashboard' && window.MCPAPermissions.operational(store().getContext().role)) {
        const data = await store().refresh();
        if (root !== owner || !owner.isConnected || store().mode !== sourceMode) return;
        inventory = {tools:data.tools,sites:data.sites,activeProjects:window.MCPAProjectScope.projects(data.sites, store().getContext(), false)};
        if (!owner.querySelector('dialog[open]')) render();
        return;
      }
      const [, latest] = await Promise.all([
        store().refresh().catch(error => { movementError = error; }),
        store().mode === 'live' && screen !== 'activity' ? window.EquipmentTracking.snapshot() : Promise.resolve(null),
        (async () => {
          if (sourceMode !== 'live' || screen !== 'dashboard' || store().getContext().role !== 'admin') return;
          try {
            // Reuse the existing dashboard refresh/watch cycle; no extra timer.
            // Generated stock_status is the same authority used by Consumables.
            const items = await window.EquipmentTracking.readAll('consumables');
            if (root === owner) consumablesSummary = {count: window.ConsumablesCatalog.attentionCount(items)};
          } catch (_) { if (root === owner) consumablesSummary = {error: true}; }
        })()
      ]);
      if (root !== owner || !owner.isConnected || store().mode !== sourceMode) return;
      if (movementError && !latest) throw movementError;
      inventory = latest;
      if (!owner.querySelector('dialog[open]')) render();
      if (movementError) owner.querySelector('#overview-feedback').textContent = 'Inventory is current. Movement history could not load; retrying automatically.';
    }
    catch(error) {
      if (root !== owner || !owner.isConnected) return;
      if (automatic && owner.querySelector('#overview-feedback')) {
        owner.querySelector('#overview-feedback').textContent = 'Updates interrupted. Showing the last loaded records; retrying automatically.';
        return;
      }
      owner.innerHTML = `${header('Movement workspace', 'Connect your project records or try the workflow with demo data.')}<div class="card card-pad" role="alert"><h2>Records could not load</h2><p class="overview-error">${escape(display.errorText(error))}</p><div class="overview-actions"><button class="btn btn-primary" data-refresh>Retry</button></div></div>`;
    }
    finally {
      if (root === owner) {
        loading = false;
        if (reloadPending) { reloadPending = false; void load(true); }
      }
    }
  }
  function dispose() { stopWatching?.(); stopWatching = null; controller?.abort(); controller = null; root = null; inventory = null; consumablesSummary = null; loading = false; reloadPending = false; }
  function watch() {
    stopWatching?.(); stopWatching = null;
    if (store().mode === 'live') stopWatching = window.EquipmentTracking.watch(() => load(true), message => {
      const label = root?.querySelector('[data-sync-warning]'); if (label) label.textContent = message;
    }, {tables: ['equipment','sites','mcpa_notifications', ...(screen === 'dashboard' && userRole() === 'admin' ? ['consumables'] : [])]});
  }
  async function mount(id) {
    const target = document.getElementById('screen-' + id); if (!target) return;
    dispose(); screen = id; query = id === 'masterlist' ? window.mcpaSearch || '' : ''; status = ''; mine = personal(); site = ''; dashboardCondition = '';
    root = target;
    root.classList.add('movement-overview'); controller = new AbortController(); const signal = controller.signal;
    root.addEventListener('click', async event => {
      const el = event.target.closest('button'); if (!el) return;
      if (el.hasAttribute('data-turnover-inbox')) {showScreen('transfer?view=receive');return;}
      if (el.hasAttribute('data-status')) {status = el.dataset.status; render(); root.querySelector('[data-status="' + status + '"]')?.focus({preventScroll:true}); return;}
      if (el.dataset.go) {showScreen(el.dataset.go); return;}
      if (el.dataset.tool) {showScreen('masterlist?record=' + encodeURIComponent(el.dataset.tool)); return;}
      if (el.hasAttribute('data-export')) {
        if (screen !== 'activity' || !window.MCPAAuth?.canRoute('activity')) return;
        const rows = visibleActivity(store().getState());
        await SiteTracePDF.download({button:el,feedback:root.querySelector('#overview-feedback'),route:'activity',report:{
          title:'Activity Logs',filename:'Activity_Logs',columns:SiteTracePDF.activityColumns,
          rows:SiteTracePDF.activityRows(rows, store().getState()),widths:[39,36,34,39,36,85],
          filters:['Search: '+(query || 'All activity'),'Scope: All loaded activity authorized for '+store().getContext().name+(store().mode==='demo'?' · Offline demonstration records':'')]
        }});
        return;
      }
      if (el.hasAttribute('data-refresh')) await load();
    }, {signal});
    root.addEventListener('input', event => {if (event.target.matches('[data-search]')) {query=event.target.value; filter();}}, {signal});
    root.addEventListener('change', async event => {
      if (event.target.id === 'dashboard-condition') dashboardCondition=event.target.value;
      if (event.target.id === 'overview-status') status=event.target.value;
      if (event.target.id === 'overview-site') site=event.target.value;
      if (event.target.id === 'overview-mine') mine=event.target.checked;
      filter();
    }, {signal});
    window.addEventListener('mcpa:movement-change', () => { if (!loading && root?.querySelector('#overview-feedback') && !root.querySelector('dialog[open]')) render(); }, {signal});
    watch();
    await load();
  }
  window.addEventListener('mcpa:movement-change', contextBar);
  window.MovementOverview = {
    mount(id) { const promise = mount(id); window.MCPANavigation?.track(root, promise); return promise; },
    dispose, contextBar, escape, setSearch, openRecord: detail,
    setStatus(value) {
      if (screen !== 'masterlist' || !root?.isConnected || userRole() !== 'admin') return;
      status = value === 'all' ? '' : value;
      render();
    },
    openActivity(id) {
      const record=store().getState().activity.find(r=>r.id===id);
      const feedback=root?.querySelector('#overview-feedback');
      if(!record){if(feedback)feedback.textContent='This activity is no longer available or access was denied.';return;}
      const dialog=document.createElement('dialog');dialog.className='overview-dialog';
      dialog.innerHTML='<h2>Activity record</h2>'+activityTable([record])+'<button class="btn btn-secondary">Close</button>';
      dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());root.append(dialog);dialog.showModal();
    },
    clearRecord() { root?.querySelectorAll('dialog').forEach(dialog => dialog.remove()); },
    capture: () => root?.isConnected ? {screen, query, status, mine, site, dashboardCondition} : null,
    restore(saved) {
      if (!saved || saved.screen !== screen || !root?.isConnected) return;
      ({query, status, mine, site, dashboardCondition} = saved); render();
    }
  };
})();
