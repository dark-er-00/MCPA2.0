/* Projects retains the projects DOM IDs for existing navigation. */
(function () {
  'use strict';

  const root = document.getElementById('sites-module');
  window.MCPAProjects?.dispose();
  const dialog = root.querySelector('#sites-dialog');
  const demo = window.MovementStore?.mode === 'demo';
  const context = () => window.MovementStore?.getContext() || {role:null,name:'',id:null};
  const isEngineer = () => window.MCPAPermissions.operational(context().role);
  const readOnly = demo || context().role !== 'admin';
  if(isEngineer())root.querySelector('#screen-sites .sub').textContent='Your assigned projects and their recorded accountability.';
  const display = window.MCPADisplay;
  const workAreas = ['Structural', 'Mechanical', 'Electrical', 'Plumbing', 'Fire Safety', 'Architectural / Finishing Stage'];
  const projectStages = ['Planning/Designing', 'Permitting', 'Groundbreaking', 'Construction Phase', 'Turnover'];
  const updateTypes = ['Site inspection', 'Milestone', 'Delay', 'Work started', 'Work completed', 'Safety inspection', 'Work suspended', 'Work resumed', 'Correction', 'Other'];
  const defaultWeights = [30, 15, 15, 10, 10, 20];
  const percent = value => Number(value).toLocaleString('en-PH', {maximumFractionDigits: 2}) + '%';
  const options = (items, selected, empty = 'Not recorded') => `<option value="">${empty}</option>` + items.map(label => `<option${selected === label ? ' selected' : ''}>${escape(label)}</option>`).join('');
  const toolStatuses = Object.fromEntries(Object.entries(display.statuses.equipment).map(([key,label]) => [key,[label,['available','inuse','repair','underrepair','missing'].includes(key)?key:'disposed']]));
  const state = { sites: [], equipment: [], profiles: [], selectedId: null, loading: false, saving: false, ready: false, dirty: false, disposed: false, scope: isEngineer() ? 'mine' : 'all', search: '', includeArchived: false, review: { search: '', status: '' } };
  let dialogReturnFocus = null;

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function normalizeName(value) { return value.trim().replace(/\s+/g, ' '); }
  function today() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(value => value.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const formatDate = display.date;
  const formatTimestamp = display.dateTime;
  function badge(value, statuses) {
    const [label, style] = Object.hasOwn(statuses,value) ? statuses[value] : [display.status(value), 'disposed'];
    return `<span class="badge badge-${style}">${escape(label)}</span>`;
  }
  function currentSite() { return state.sites.find(site => site.id === state.selectedId); }
  function assignedToMe(site) {
    return window.MCPAProjectScope.assigned(site, context(), demo);
  }
  function filteredSites() {
    return state.sites.filter(site => (state.includeArchived || window.MCPAProjectScope.active(site, demo))
      && (state.scope !== 'mine' || assignedToMe(site))
      && (!state.search || [site.name, site.location, site.assigned_engineer, site.phase].some(value => String(value || '').toLowerCase().includes(state.search))));
  }
  function siteEquipment(site) { return state.equipment.filter(item => item.site_id === site.id); }
  function visibleEquipment(site) { return siteEquipment(site).filter(item => item.quantity > 0); }
  function totalQuantity(items) { return isEngineer() ? items.filter(item => item.quantity > 0).length : items.reduce((sum, item) => sum + item.quantity, 0); }

  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw projectError('The project service could not load. Reload the page and try again.');
      // Same public project configuration as Masterlist. Reuse its client when loaded.
      window.supabaseClient = window.supabase.createClient(
        'https://zpqxlmiqwevhlstjirei.supabase.co',
        'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58'
      );
    }
    return window.supabaseClient;
  }

  function projectError(message) {
    return Object.assign(new Error(message), {projectUserMessage: message});
  }

  function databaseError(error = {}, operation = 'request') {
    // Keep a diagnostic code in DevTools, never server messages, SQL, form values
    // or response details. The Network response retains the original diagnostic.
    const code = /^[A-Z0-9]{5,12}$/.test(error.code || '') ? error.code : 'UNKNOWN';
    console.warn('[Projects] Request failed', {operation, code});
    if (['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
      return 'Projects needs a database configuration update. Contact your administrator, then retry.';
    }
    if (error.code === '23505') return 'A project with this name already exists. Please use a different name.';
    if (['23503', '23001'].includes(error.code)) return 'This project has linked records. Preserve its equipment and history by archiving it.';
    if (error.code === '42501') return 'Your account does not have permission to perform this project action. Contact your administrator if you need access.';
    if (['PGRST301', 'PGRST303'].includes(error.code)) return 'Your database session has expired or is invalid. Sign in again, then retry.';
    if (error.code === '23514') return 'Some project details are invalid. Please check the form and try again.';
    if (error.code === '40001') return 'This project changed while you were editing. Close the form, reload the project and apply your changes again.';
    if (error.projectUserMessage) return error.projectUserMessage;
    if (navigator.onLine === false || /failed to fetch|networkerror|network request failed|load failed/i.test(error.message || '')) {
      return 'The project service could not be reached. Check your connection and try again.';
    }
    return 'Projects could not complete this request. Try again. If the problem continues, contact your administrator.';
  }

  async function readAll(table, columns, order) {
    const records = [];
    // Supabase caps responses; fetch every page so counts do not silently truncate.
    for (let offset = 0; ;) {
      const { data, count, error } = await client().from(table).select(columns, { count: 'exact' }).order(order).range(offset, offset + 499);
      if (error) throw error;
      records.push(...(data || []));
      if (!data?.length || (count != null ? records.length >= count : data.length < 500)) return records;
      offset += data.length;
    }
  }

  // All database writes concern site metadata. Equipment and movement are read-only here.
  const repository = {
    async load() {
      if (!demo && window.MCPAPermissions.operational(context().role)) {
        const {data:snapshot,error}=await client().rpc('mcpa_project_snapshot');
        if(error)throw error;
        if(!Array.isArray(snapshot?.sites)||!Array.isArray(snapshot?.tools)||!Array.isArray(snapshot?.history))throw projectError('Projects returned an unexpected response. Contact your administrator, then retry.');
        state.history=snapshot.history||[];
        return {sites:snapshot.sites,profiles:[],equipment:snapshot.tools.map(tool=>({...tool,id:tool.dbId,asset_id:tool.id,quantity:tool.qty,category:tool.cat,site_id:tool.siteId,current_holder_id:tool.holderId,holder:tool.holder||'Unassigned'}))};
      }
      if (demo || !window.MCPAPermissions.fullInventory(context().role)) {
        await window.MovementStore.initialize();
        const snapshot = window.MovementStore.getState();
        return {
          sites: snapshot.sites.map(site => ({...site, location: site.location || 'Demo project', assigned_engineer: site.assigned_engineer || site.engineer || 'Unassigned', phase: site.phase || '', status: site.status || 'active', progress: site.progress || 0})),
          equipment: snapshot.tools.map(tool => ({...tool, id: tool.id, asset_id: tool.id, quantity: tool.qty, category: tool.cat, site_id: tool.siteId || snapshot.sites.find(site => site.name === tool.site)?.id, current_holder_id: tool.holderId, holder: tool.holder || 'Unassigned'})),
          profiles: snapshot.users || []
        };
      }
      const [sites, equipment, profiles] = await Promise.all([
        readAll('sites', '*', 'id'),
        readAll('equipment', '*', 'id'),
        // A restricted profile must not hide otherwise readable equipment.
        readAll('profiles', 'id,name,role', 'id').catch(() => [])
      ]);
      const holders = new Map(profiles.map(profile => [profile.id, profile.name]));
      return {
        sites: sites.map(site=>({...site,assigned_engineer:site.assigned_engineer_id?holders.get(site.assigned_engineer_id)||'Accountable profile unavailable':site.assigned_engineer})).sort((a, b) => a.name.localeCompare(b.name)),
        profiles: profiles.filter(profile => /^(engineer|architect)$/.test(profile.role)),
        equipment: equipment.map(item => {
          const status = String(item.status || '').toLowerCase().replace(/[\s_-]/g, '');
          const quantity = Number(item.quantity ?? (item.tracking_type === 'Individual' ? 1 : 0));
          return { ...item, holder: holders.get(item.current_holder_id) || item.current_holder_id || '—', quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0, status: status === 'forrepair' ? 'repair' : status };
        })
      };
    },
    async save(values, original, operationId, reason) {
      if (readOnly || isEngineer()) throw projectError('Only an Admin can edit live project records.');
      const { data, error } = await client().rpc('mcpa_save_project', {
        p_id: original?.id || null, p_version: original?.project_version ?? null,
        p_operation_id: operationId, p_patch: values, p_reason: reason || null
      });
      if (error) throw error;
      if (!data?.id) throw projectError('This project changed or is no longer editable. Close this form and retry after the next update.');
      return data;
    },
    async history(siteId) {
      if (demo) return [];
      if (window.MCPAPermissions.operational(context().role)) {
        const {data,error}=await client().rpc('mcpa_project_snapshot');
        if(error)throw error;
        if(!Array.isArray(data?.history))throw projectError('Project history returned an unexpected response. Contact your administrator, then retry.');
        return data.history.filter(item=>item.project_id===siteId);
      }
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, count, error } = await client().from('project_history').select('*', {count: 'exact'}).eq('project_id', siteId).order('changed_at', {ascending: false}).order('id', {ascending: false}).range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data?.length || (count != null ? rows.length >= count : data.length < 500)) return rows;
      }
    },
    async movements(siteId, equipmentId) {
      if (!window.MovementStore) return [];
      const snapshot = await window.MovementStore.refresh();
      const site = state.sites.find(item => item.id === siteId);
      const asset = snapshot.tools.find(item => (item.dbId || item.id) === equipmentId);
      const rows = [];
      [...snapshot.transfers.filter(item => item.status === 'received'), ...snapshot.returns].forEach(record => {
        (record.source || []).forEach(source => {
          if (equipmentId && source.toolId !== asset?.id) return;
          const inspection = (record.inspections || record.conditions || []).find(item => item.toolId === source.toolId);
          if (!inspection || inspection.condition === 'lost') return;
          if (source.siteId !== siteId && record.destinationId !== siteId && source.site !== site?.name && record.destination !== site?.name) return;
          rows.push({date: record.receivedAt || record.createdAt, asset_id: source.toolId, from: source.site || 'Unassigned', to: record.destination || source.site, quantity: source.qty ?? snapshot.tools.find(item => item.id === source.toolId)?.qty ?? 1});
        });
      });
      return rows.sort((a,b) => b.date.localeCompare(a.date));
    }
  };

  function feedback(message, isError = false) {
    const element = root.querySelector('#sites-feedback');
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    element.classList.toggle('is-error', isError);
    element.setAttribute('role', isError ? 'alert' : 'status');
  }

  function formError(message) {
    const element = root.querySelector('#sites-form-error');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    if (message) element.focus();
  }

  function syncControls() {
    root.querySelectorAll('[data-action="refresh"]').forEach(button => { button.disabled = state.loading || state.saving; });
    root.querySelectorAll('[data-action="add-site"], [data-action="edit-site"], [data-action="archive-site"], [data-action="site-update"]').forEach(button => {
      if(readOnly){button.remove();return;}
      button.disabled = readOnly || isEngineer() || !state.ready || state.loading || state.saving;
      button.hidden = readOnly || isEngineer();
    });
  }

  async function refresh(automatic = false) {
    if (state.loading || state.saving || state.disposed || (automatic && (dialog.open || state.dirty || document.hidden || !root.querySelector('.screen.active')))) return;
    state.loading = true;
    feedback('');
    root.querySelector('#sites-list').setAttribute('aria-busy', 'true');
    syncControls();
    try {
      const result = await repository.load();
      if (!root.isConnected) return;
      const firstLoad = !state.ready;
      state.sites = result.sites;
      state.equipment = result.equipment;
      state.profiles = result.profiles;
      if (firstLoad) state.selectedId = filteredSites()[0]?.id || null;
      else if (state.selectedId && !currentSite()) {
        state.selectedId = null;
        if (root.querySelector('#screen-site-detail.active')) showScreen('sites');
        feedback('This project is no longer available. The project list has been updated.');
      }
      render();
      state.ready = true;
    } catch (error) {
      if (!root.isConnected) return;
      const message = databaseError(error, 'load');
      feedback(message, true);
      if (!state.ready) {
        root.querySelector('#sites-list').innerHTML = `<div class="card empty-state sites-full"><p class="t">Unable to load projects</p><p class="d">${escape(message)}</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>`;
        root.querySelector('#site-detail-content').innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button><div class="card empty-state"><p class="t">Unable to load project details</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>';
      }
    } finally {
      state.loading = false;
      root.querySelector('#sites-list').setAttribute('aria-busy', 'false');
      syncControls();
    }
  }

  function render() {
    const projects = filteredSites();
    root.querySelector('#projects-count').textContent = `${projects.length} of ${state.sites.length} projects · ${new Set(state.sites.filter(site => !site.archived_at).map(site => site.assigned_engineer_id || site.assigned_engineer).filter(value => value && value !== 'Unassigned')).size} assigned engineers / architects`;
    const scope=root.querySelector('#projects-scope');
    if(scope){scope.value=state.scope;scope.closest('label').hidden=readOnly;}
    root.querySelector('#projects-mode-note').textContent = demo ? 'Demo projects are read-only.' : 'Projects and equipment update automatically. Admins manage project details and assignments.';
    root.querySelector('#sites-list').innerHTML = projects.length ? projects.map(site => {
      const items = visibleEquipment(site);
      const count = (...statuses) => totalQuantity(items.filter(item => statuses.includes(item.status)));
      const totals = window.EquipmentTracking.tally(items, undefined, {assetsOnly:isEngineer()});
      const stats = [['Total', totals.total], ['Available', totals.available], [display.status('inuse'), totals.deployed], ['Repair', count('repair', 'underrepair')]];
      if (count('missing')) stats.push(['Missing', count('missing')]);
      if (count('disposed')) stats.push([display.status('disposed'), count('disposed')]);
      return `<button type="button" class="card site-card" data-action="open-site" data-id="${escape(site.id)}" aria-label="View ${escape(site.name)}">
        <span class="site-card-top"><span><span class="site-card-title">${escape(site.name)}</span><span class="eng">${escape(site.assigned_engineer)} · ${escape(site.current_work_area || site.phase || 'Work area not recorded')}</span><span class="sites-muted">${escape(site.location)}${site.project_stage ? ' · ' + escape(site.project_stage) : ''}</span></span>${site.is_active === false ? '<span class="badge badge-disposed">Archived</span>' : ''}</span>
        <span class="site-stat-row">${stats.filter(([, number]) => number > 0).map(([label, number]) => `<span class="site-stat"><span class="n">${number}</span><span class="l">${label}</span></span>`).join('')}</span>
      </button>`;
    }).join('') : `<div class="card empty-state sites-full"><p class="t">${state.scope === 'mine' ? 'No projects assigned to you' : 'No matching projects'}</p><p class="d">${state.scope === 'mine' ? 'An Admin can assign your profile to a project.' : 'Adjust the filters or add a project to track its equipment.'}</p><button type="button" class="btn btn-secondary btn-sm" data-action="add-site">+ Add Project</button></div>`;
    renderDetail();
    syncControls();
  }

  function inventoryTable(items, emptyText = 'No equipment is currently assigned to this project.') {
    return `<div class="table-wrap"><table><thead><tr><th>Tool</th>${isEngineer() ? '' : '<th>Quantity</th>'}<th>Status</th><th>Current Holder</th><th><span class="sites-muted">Details</span></th></tr></thead><tbody>${items.length ? items.map(item => `<tr>
      <td class="cell-name"><div class="equipment-identity">${window.EquipmentVisual.thumbnail(item)}<div>${escape(item.name)}<div class="cell-sub mono">${escape(item.asset_id)}</div></div></div></td>
      ${isEngineer() ? '' : `<td class="mono">${item.quantity}${item.unit ? ` <span class="sites-muted">${escape(item.unit)}</span>` : ''}</td>`}
      <td>${badge(item.status, toolStatuses)}<div class="cell-sub">${escape(display.status(window.EquipmentTracking.availability(item), 'availability'))}</div></td><td>${escape(item.holder)}</td>
      <td class="sites-row-action"><button type="button" class="sites-text-button" data-action="view-tool" data-id="${escape(item.id)}" aria-label="View ${escape(item.name)} ${escape(item.asset_id)}">View →</button></td>
    </tr>`).join('') : `<tr><td colspan="${isEngineer()?4:5}" class="empty-state">${escape(emptyText)}</td></tr>`}</tbody></table></div>`;
  }

  function renderDetail() {
    const container = root.querySelector('#site-detail-content');
    const site = currentSite();
    if (!site) {
      container.innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button><div class="card empty-state"><h1 class="t" id="site-heading">No project selected</h1><p class="d">Select a project from your authorized project list.</p></div>';
      return;
    }
    const items = visibleEquipment(site);
    const hiddenCount = siteEquipment(site).length - items.length;
    container.innerHTML = `
      <div class="page-head"><div>
        <button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button>
        <h1 class="display" id="site-heading">${escape(site.name)}</h1>
        <p class="sub">${escape(site.location)} · ${escape(site.current_work_area || 'Current work area not recorded')} · ${escape(site.project_stage || 'Project stage not recorded')}</p>
        <p class="sites-muted">${site.construction_completion != null ? `Construction Completion: ${percent(site.construction_completion)} · ` : 'Construction Completion: Not configured · '}Legacy completion: ${percent(site.progress)}${site.phase ? ' · Legacy phase: ' + escape(site.phase) : ''}</p>
      </div><div class="page-head-actions">
        ${site.is_active === false ? '<span class="badge badge-disposed">Archived</span>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-action="project-history">Project History</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="site-update">Add Site Update</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-site">Edit Project</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="archive-site">${site.is_active === false ? 'Restore Project' : 'Archive Project'}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="review-tools">Review Assigned Tools</button>
      </div></div>
      <div class="grid grid-4 sites-summary">
        <div class="card card-pad"><span class="k">Accountable Engineer / Architect</span><div class="v">${escape(site.assigned_engineer)}</div>${site.assigned_engineer_id ? '' : '<span class="sites-muted">Profile link not recorded</span>'}</div>
        <div class="card card-pad"><span class="k">Equipment at Project</span><div class="v">${totalQuantity(items)} ${isEngineer()?'assets':'units'}</div></div>
        <div class="card card-pad"><span class="k">Last Inventory Check</span><div class="v">${formatDate(site.last_inventory_check)}</div></div>
        <div class="card card-pad"><span class="k">Last Movement</span><div class="v" data-last-movement>Loading…</div><button type="button" class="sites-text-button" data-action="view-movements">View movement history →</button></div>
      </div>
      <div class="section-title sites-section-title"><h2>Project Inventory</h2>${isEngineer() ? '' : '<span class="eyebrow">Zero-quantity items are hidden</span>'}</div>
      <div class="card">${inventoryTable(items)}</div>
      <p class="sites-muted sites-inventory-note">${!isEngineer() && hiddenCount ? `${hiddenCount} zero-quantity record${hiddenCount === 1 ? ' is' : 's are'} hidden. ` : ''}Equipment assignments and movement are shown for reference only.</p>`;
    syncControls();
    const lastMovement = container.querySelector('[data-last-movement]');
    repository.movements(site.id).then(records => {
      if (lastMovement.isConnected) lastMovement.textContent = records.length ? formatDate(records[0].date) : 'Not recorded';
    }).catch(() => { if (lastMovement.isConnected) lastMovement.textContent = 'History unavailable'; });
  }

  function openSite(id) {
    if (!state.sites.some(site => site.id === id)) return;
    showScreen('site-detail?record=' + encodeURIComponent(id));
  }

  function openDialog(title, content, wide = false, view = '') {
    if (!root.isConnected) return;
    if (!dialog.open) dialogReturnFocus = document.activeElement;
    root.querySelector('#sites-dialog-title').textContent = title;
    root.querySelector('#sites-dialog-content').innerHTML = content;
    dialog.classList.toggle('is-wide', wide);
    dialog.dataset.view = view;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    (dialog.querySelector('[autofocus]') || dialog.querySelector('.sites-close')).focus();
  }

  function closeDialog() {
    if (state.saving) return;
    const route = window.MCPAMovementLinks?.parse(location.hash);
    if (route?.tool) {
      if (window.MCPANavigation.canBack()) window.MCPANavigation.back();
      else showScreen('site-detail?record=' + encodeURIComponent(route.record), null, {history:'replace'});
      return;
    }
    dialog.close();
    state.dirty = false;
    const returnAction = dialogReturnFocus?.dataset?.action;
    const restoreFocus = () => {
      if (dialog.open || !root.isConnected) return;
      if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
      else root.querySelector(returnAction ? `[data-action="${returnAction}"]` : '#screen-site-detail.active [data-action="edit-site"], #screen-sites.active [data-action="add-site"]')?.focus();
    };
    restoreFocus();
    void refresh(true).then(() => {
      // Refresh replaces detail controls; restore only if the user has not
      // already moved focus to another live control while it was loading.
      if (document.activeElement === document.body) restoreFocus();
    });
  }

  function editSite(site = null) {
    if (readOnly || isEngineer() || !state.ready || state.loading) return;
    if (site && site.project_version == null) { feedback('Projects needs a database configuration update. Contact your administrator, then retry.', true); return; }
    const value = (field, fallback = '') => escape(site?.[field] ?? fallback);
    const legacy = site && !state.profiles.some(profile => profile.id === site.assigned_engineer_id);
    state.dirty = false;
    openDialog(site ? 'Edit Project' : 'Add Project', `
      <form id="sites-form" data-id="${value('id')}">
        <p class="sites-dialog-description">Changes retain the previous and new values in Project History. Select an existing Engineer / Architect profile; one person may handle multiple projects. Required fields are marked *.</p>
        <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
        <fieldset class="project-section"><legend>Project Information</legend><div class="form-grid">
          <div class="field full"><label for="site-name">Project Name *</label><input id="site-name" name="name" value="${value('name')}" maxlength="120" required autofocus autocomplete="off"></div>
          <div class="field full"><label for="site-location">Location *</label><input id="site-location" name="location" value="${value('location')}" maxlength="240" required></div>
          <div class="field"><label for="site-engineer">Engineer / Architect *</label><select id="site-engineer" name="assigned_engineer_id" required><option value="">Select an existing profile</option>${legacy ? `<option value="legacy" selected>${value('assigned_engineer')} (existing assignment)</option>` : ''}${state.profiles.map(profile => `<option value="${escape(profile.id)}"${profile.id === site?.assigned_engineer_id ? ' selected' : ''}>${escape(profile.name)}</option>`).join('')}</select>${!state.profiles.length ? '<small class="sites-muted">No accessible profiles. An Admin must add or make the actual Engineer / Architect profiles available before assigning a new project.</small>' : ''}</div>
          <div class="field"><label for="site-check">Last Inventory Check</label><input id="site-check" name="last_inventory_check" type="date" value="${value('last_inventory_check')}" max="${today()}"></div>
        </div></fieldset>
        <fieldset class="project-section"><legend>Construction Lifecycle</legend><div class="form-grid">
          <div class="field"><label for="site-stage">Project Stage</label><select id="site-stage" name="project_stage">${options(projectStages, site?.project_stage)}</select></div>
          <div class="field"><label for="site-phase">Current Work Area</label><select id="site-phase" name="current_work_area">${options(workAreas, site?.current_work_area, 'Select when known')}</select></div>
        </div>${site?.phase ? `<p class="sites-muted project-legacy">Original phase retained: <strong>${value('phase')}</strong>. ${workAreas.some(area => area.toLowerCase() === site.phase.trim().toLowerCase()) ? 'Select its matching area when ready.' : 'Review this legacy value before choosing a work area.'}</p>` : ''}<p class="sites-muted">Work areas may overlap. Construction completion does not change the project stage.</p></fieldset>
        <fieldset class="project-section"><legend>Construction Progress</legend>
          <p class="sites-muted">${site ? `Legacy completion: ${percent(site.progress)} (preserved). ` : ''}Enable measured tracking after reviewing the scope and measurements.</p>
          <label class="project-enable"><input type="checkbox" id="project-progress-enabled"${site?.construction_work_areas ? ' checked disabled' : ''}> Use work-area measurements</label>
          <div class="project-computed"><span>Construction Completion</span><output id="project-computed-value" aria-live="polite">Not configured</output></div>
          <progress id="project-progress-bar" max="100" value="0" aria-label="Construction Completion"></progress>
          <details id="project-progress-editor"${site?.construction_work_areas ? ' open' : ''}><summary>Manage Work Area Progress</summary>
            <p class="sites-muted">Starting weights are illustrative, not construction standards. Adjust them to this project's quantities, effort or budget. N/A requires zero weight; redistribute applicable weights to total 100%.</p>
            <div class="project-area-list">${workAreas.map((label, i) => {
              const area = site?.construction_work_areas?.[label] || {completion: 0, weight: defaultWeights[i], applicable: true, note: ''};
              return `<fieldset class="project-area" data-area="${escape(label)}"><legend>${escape(label)}</legend>
                <label class="project-applicable"><input type="checkbox" data-progress="applicable"${area.applicable ? ' checked' : ''}> Applicable</label>
                <div class="form-grid"><div class="field"><label for="area-completion-${i}">Completion (%)</label><input id="area-completion-${i}" data-progress="completion" type="number" min="0" max="100" step="0.01" value="${escape(area.completion)}" required></div>
                <div class="field"><label for="area-weight-${i}">Scope weight (%)</label><input id="area-weight-${i}" data-progress="weight" type="number" min="0" max="100" step="0.01" value="${escape(area.weight)}" required></div>
                <div class="field full"><label for="area-note-${i}">Progress note (optional)</label><input id="area-note-${i}" data-progress="note" value="${escape(area.note)}" maxlength="1000"></div></div></fieldset>`;
            }).join('')}</div>
            <p id="project-weight-total" class="project-weight-total" aria-live="polite"></p>
            <p id="project-progress-error" class="sites-form-error hidden" role="alert"></p>
          </details>
        </fieldset>
        <fieldset class="project-section"><legend>Project Update</legend><div class="field"><label for="site-reason">Reason / Progress Note (optional)</label><textarea id="site-reason" name="reason" rows="3" maxlength="4000" placeholder="Explain the change for Project History"></textarea></div></fieldset>
        <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn-primary">${site ? 'Save Changes' : 'Create Project'}</button></div>
      </form>`, true, 'edit');
    state.editOriginal = site ? structuredClone(site) : null;
    updateProgressPreview();
  }

  // Integer basis points match PostgreSQL NUMERIC round(...,2); no binary-float
  // multiplication of user percentages. Six bounded rows stay within safe ints.
  function readProgress() {
    if (!root.querySelector('#project-progress-enabled').checked) return {areas: null, completion: null, total: 0};
    const areas = {}; let total = 0, weighted = 0;
    for (const row of root.querySelectorAll('[data-area]')) {
      const get = key => row.querySelector(`[data-progress="${key}"]`);
      const completion = get('completion').value, weight = get('weight').value;
      const applicable = get('applicable').checked;
      if (![completion, weight].every(value => /^(?:\d+)(?:\.\d{1,2})?$/.test(value) && Number(value) <= 100)) throw new Error('Enter completion and scope weight from 0 to 100, with at most two decimal places.');
      const c = Math.round(Number(completion) * 100), w = Math.round(Number(weight) * 100);
      if (!applicable && w !== 0) throw new Error('Set N/A work areas to zero weight, then redistribute the remaining weights.');
      if (applicable) { total += w; weighted += c * w; }
      areas[row.dataset.area] = {completion: c / 100, weight: w / 100, applicable, note: get('note').value.trim()};
    }
    if (total !== 10000) throw new Error(`Applicable scope weights total ${percent(total / 100)}. Adjust them to exactly 100%.`);
    return {areas, completion: Math.floor((weighted + 5000) / 10000) / 100, total: total / 100};
  }

  function updateProgressPreview() {
    const enabled = root.querySelector('#project-progress-enabled').checked;
    const editor = root.querySelector('#project-progress-editor');
    editor.hidden = !enabled;
    editor.querySelectorAll('input').forEach(input => { input.disabled = !enabled; });
    const result = root.querySelector('#project-computed-value'), bar = root.querySelector('#project-progress-bar'), error = root.querySelector('#project-progress-error');
    let total = 0;
    editor.querySelectorAll('[data-area]').forEach(row => { if (row.querySelector('[data-progress="applicable"]').checked) total += Math.round(Number(row.querySelector('[data-progress="weight"]').value) * 100) || 0; });
    root.querySelector('#project-weight-total').textContent = 'Applicable scope weight: ' + percent(total / 100) + ' / 100%';
    try { const data = readProgress(); result.textContent = data.completion == null ? 'Not configured' : percent(data.completion); bar.value = data.completion || 0; error.classList.add('hidden'); }
    catch (e) { result.textContent = 'Check weights and values'; bar.value = 0; error.textContent = e.message; error.classList.remove('hidden'); }
  }

  function operationFor(form, payload) {
    const serialized = JSON.stringify(payload);
    if (form.dataset.request !== serialized) { form.dataset.request = serialized; form.dataset.operation = crypto.randomUUID(); }
    return form.dataset.operation;
  }

  async function saveSite(form) {
    if (readOnly || isEngineer() || state.saving || state.loading || !form.reportValidity()) return;
    const original = state.editOriginal;
    const values = Object.fromEntries(new FormData(form));
    const reason = values.reason; delete values.reason;
    const profile = state.profiles.find(profile => profile.id === values.assigned_engineer_id);
    if (values.assigned_engineer_id === 'legacy' && original) {
      values.assigned_engineer_id = original.assigned_engineer_id || null;
    } else if (profile) { /* Database snapshots the selected profile's name. */ }
    else { formError('Select an existing Engineer / Architect profile.'); return; }
    for (const field of ['name', 'location']) {
      values[field] = normalizeName(values[field]);
      if (!values[field]) { formError('Please complete all required fields. Blank spaces are not valid values.'); return; }
    }
    if (state.sites.some(site => site.id !== original?.id && normalizeName(site.name).toLowerCase() === values.name.toLowerCase())) {
      formError('A site with this name already exists. Please use a different name.'); return;
    }
    values.project_stage ||= null;
    values.current_work_area ||= null;
    try { const progress = readProgress(); if (progress.areas) values.construction_work_areas = progress.areas; }
    catch (error) { formError(error.message); root.querySelector('#project-progress-editor').open = true; return; }
    // The RPC defaults new projects to planning and retains existing status.
    // Operational status is intentionally absent from this metadata patch.
    if (values.last_inventory_check > today()) { formError('The inventory check cannot be in the future.'); return; }
    values.last_inventory_check ||= null;
    formError('');
    setSaving(true);
    try {
      const saved = await repository.save(values, original, operationFor(form, {values, reason}), reason);
      if (!root.isConnected) return;
      state.sites = [...state.sites.filter(site => site.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
      state.selectedId = saved.id;
      render();
      setSaving(false);
      closeDialog();
      if (original) renderDetail();
      feedback(`${saved.name} ${original ? 'updated' : 'created'} successfully.`);
    } catch (error) {
      formError(databaseError(error, 'save'));
    } finally { setSaving(false); }
  }

  function setSaving(saving) {
    state.saving = saving;
    syncControls();
    dialog.setAttribute('aria-busy', String(saving));
    dialog.querySelectorAll('button, input, select, textarea').forEach(element => {
      if (saving) { element.dataset.wasDisabled = String(element.disabled); element.disabled = true; }
      else if (element.dataset.wasDisabled !== undefined) { element.disabled = element.dataset.wasDisabled === 'true'; delete element.dataset.wasDisabled; }
    });
    const submit = dialog.querySelector('[type="submit"], [data-action="confirm-archive"]');
    if (submit) {
      if (saving) { submit.dataset.label = submit.textContent; submit.textContent = 'Saving…'; }
      else if (submit.dataset.label) submit.textContent = submit.dataset.label;
    }
  }

  function archiveSite() {
    if (readOnly || isEngineer()) return;
    const site = currentSite();
    if (!site) return;
    state.archiveOriginal = structuredClone(site);
    state.archiveOperation = crypto.randomUUID();
    openDialog(site.is_active === false ? 'Restore Project' : 'Archive Project', `
      <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
      <p class="sites-dialog-description">${site.is_active === false ? 'Restore' : 'Archive'} ${escape(site.name)}? Its equipment assignments and full history will remain available. Archiving does not transfer or return equipment.</p>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog" autofocus>Cancel</button><button type="button" class="btn btn-primary" data-action="confirm-archive">${site.is_active === false ? 'Restore' : 'Archive'}</button></div>`);
  }

  async function confirmArchive() {
    if (readOnly || isEngineer() || state.saving) return;
    const site = state.archiveOriginal;
    if (!site) return;
    setSaving(true);
    try {
      const restore = site.is_active === false;
      const saved = await repository.save({ is_active: restore }, site, state.archiveOperation);
      if (!root.isConnected) return;
      state.sites = state.sites.map(record => record.id === site.id ? saved : record);
      render();
      setSaving(false);
      closeDialog();
      showScreen('sites');
      feedback(`${site.name} ${saved.is_active === false ? 'archived' : 'restored'}. Its history has been preserved.`);
    } catch (error) { formError(databaseError(error, 'archive')); }
    finally { setSaving(false); }
  }

  const fieldLabels = {name: 'Project name', location: 'Location', assigned_engineer: 'Engineer / Architect', phase: 'Earlier project phase', status: 'Operational status', is_active: 'Active', archived_at: 'Archived at', progress: 'Earlier completion', last_inventory_check: 'Last Inventory Check', project_stage: 'Project Stage', current_work_area: 'Current Work Area', construction_completion: 'Construction Completion'};
  function historyValue(key, value) {
    if (value == null || value === '') return 'Not recorded';
    if (['progress', 'construction_completion', 'completion', 'weight'].includes(key)) return percent(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'status') return display.status(value, 'project');
    if (key === 'archived_at') return display.dateTime(value);
    if (key === 'last_inventory_check') return display.date(value);
    return typeof value === 'object' ? 'Details updated' : display.safeText(String(value), 'Details not available');
  }
  function historyChanges(record) {
    const before = record.before_values || {}, after = record.after_values || {};
    const initial = !record.before_values;
    const changes = [];
    const add = (label, key, oldValue, newValue) => {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
      changes.push(`<li><span>${escape(label)}</span><div>${initial ? '' : `<del>${escape(historyValue(key, oldValue))}</del><span aria-hidden="true"> → </span><span class="sr-only"> changed to </span>`}<ins>${escape(historyValue(key, newValue))}</ins></div></li>`);
    };
    if (before.assigned_engineer_id !== after.assigned_engineer_id && before.assigned_engineer === after.assigned_engineer) changes.push('<li>Project assignment changed.</li>');
    Object.entries(fieldLabels).forEach(([key, label]) => add(label, key, before[key], after[key]));
    workAreas.forEach(area => {
      const oldArea = before.construction_work_areas?.[area] || {}, newArea = after.construction_work_areas?.[area] || {};
      [['completion', 'completion'], ['weight', 'scope weight'], ['applicable', 'applicable'], ['note', 'note']].forEach(([key, label]) => add(`${area} · ${label}`, key, oldArea[key], newArea[key]));
    });
    // Unknown fields stay in the audit store; describe the change without
    // exposing database keys, nested metadata or profile identifiers.
    const excluded = new Set([...Object.keys(fieldLabels), 'id', 'created_at', 'updated_at', 'project_version', 'construction_work_areas', 'assigned_engineer_id']);
    if ([...new Set([...Object.keys(before), ...Object.keys(after)])].some(key => !excluded.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))) changes.push('<li>Additional project details changed.</li>');
    return changes.length ? `<ul class="project-change-list">${changes.join('')}</ul>` : '<p class="sites-muted">No field differences recorded in this entry.</p>';
  }
  async function viewProjectHistory() {
    const site = currentSite(); if (!site) return;
    const navigation = state.navigation;
    try {
      const records = await repository.history(site.id);
      if (!root.isConnected || currentSite()?.id !== site.id || state.navigation !== navigation) return;
      state.projectHistory = records.sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || '') || b.id.localeCompare(a.id));
      openDialog(`Project History — ${site.name}`, `<p class="sites-dialog-description">Permanent, read-only activity. Newest first. Times shown in Asia/Manila. Older records retain only the information originally recorded.</p>
        <div class="project-history-filters"><div class="field"><label for="project-history-search">Search history</label><input id="project-history-search" type="search" placeholder="Person, change, value or note"></div>
        <div class="field"><label for="project-history-type">Event type</label><select id="project-history-type"><option value="">All events</option>${[...new Set(records.flatMap(row => row.change_types || []))].map(type => `<option value="${escape(type)}">${escape(display.projectEvent(type))}</option>`).join('')}</select></div></div>
        <p id="project-history-count" class="sites-muted" aria-live="polite"></p><ol id="project-history-events" class="project-timeline"></ol>
        <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true, 'history');
      filterHistory();
    } catch (error) { feedback(databaseError(error, 'history'), true); }
  }
  function filterHistory() {
    const search = root.querySelector('#project-history-search').value.trim().toLowerCase(), type = root.querySelector('#project-history-type').value;
    const records = state.projectHistory.filter(record => (!type || (record.change_types || []).includes(type)) && (!search || JSON.stringify(record).toLowerCase().includes(search) || (record.change_types || []).some(kind => (display.projectEvent(kind)).toLowerCase().includes(search))));
    root.querySelector('#project-history-count').textContent = `${records.length} of ${state.projectHistory.length} recorded events`;
    root.querySelector('#project-history-events').innerHTML = records.length ? records.map(record => `<li class="project-history-event"><article>
      <div class="project-event-head"><h3>${escape(display.safeText(record.site_update_type) || (record.change_types || []).map(kind => display.projectEvent(kind)).join(' · ') || 'Project Activity Recorded')}</h3><time datetime="${escape(record.changed_at || '')}">${escape(formatTimestamp(record.changed_at))}</time></div>
      <p class="sites-muted">Recorded by: ${escape(display.person(record.actor_name))}${record.work_area ? ' · ' + escape(record.work_area) : ''}</p>
      ${(record.change_types || []).includes('site_update') ? '' : historyChanges(record)}
      ${record.reason ? `<p class="project-history-note">${escape(record.reason)}</p>` : ''}
      ${!readOnly && !isEngineer() ? `<button type="button" class="sites-text-button" data-action="correct-site-update" data-id="${escape(record.id)}">Add a correction</button>` : ''}
    </article></li>`).join('') : '<li class="empty-state">No project history matches. Older activity may not have been recorded.</li>';
  }
  function addSiteUpdate(correctionOf = '') {
    if (readOnly || isEngineer() || !currentSite()) return;
    const site = currentSite();
    openDialog(`Add Site Update — ${site.name}`, `<form id="site-update-form" data-project="${escape(site.id)}" data-correction="${escape(correctionOf)}">
      <p class="sites-dialog-description">This update becomes a permanent part of Project History. Your signed-in identity and submission time are recorded by the server.</p>
      <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
      ${correctionOf ? `<p class="project-history-note">This correction will be linked to the original entry. The original entry is retained.</p>` : ''}
      <div class="form-grid"><div class="field"><label for="site-update-type">Update type *</label><select id="site-update-type" name="type" required>${options(updateTypes, correctionOf ? 'Correction' : '', 'Choose an update type')}</select></div>
      <div class="field"><label for="site-update-area">Relevant work area (optional)</label><select id="site-update-area" name="area">${options(workAreas, '', 'Project-wide')}</select></div>
      <div class="field full"><label for="site-update-description">Description *</label><textarea id="site-update-description" name="description" rows="6" maxlength="4000" required autofocus></textarea></div></div>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn-primary">Record Site Update</button></div>
      </form>`, false, 'site-update');
  }
  async function saveSiteUpdate(form) {
    if (readOnly || state.saving || !form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    if (!data.description.trim()) { formError('Describe the site update before recording it.'); return; }
    const args = {p_project_id: form.dataset.project, p_type: data.type, p_description: data.description.trim(), p_work_area: data.area || null, p_correction_of: form.dataset.correction || null};
    const operation = operationFor(form, args); setSaving(true);
    try {
      const {error} = await client().rpc('mcpa_add_site_update', {...args, p_operation_id: operation});
      if (error) throw error;
      if (!root.isConnected) return;
      setSaving(false); closeDialog(); feedback('Site update recorded in Project History.');
    } catch (error) { formError(databaseError(error, 'site-update')); }
    finally { setSaving(false); }
  }

  function reviewTools(preserve = false) {
    const site = currentSite();
    if (!site) return;
    if (!dialog.open && !preserve) state.review = { search: '', status: '' };
    openDialog(`Assigned Tools — ${site.name}`, `
      <p class="sites-dialog-description">Review the equipment assigned to this project, ${isEngineer()?'by Asset ID.':'including zero-quantity records.'} Assignments and holders are read-only.</p>
      <div class="table-toolbar">
        <div class="field sites-review-search"><label for="sites-tool-search">Search equipment</label><input type="search" id="sites-tool-search" value="${escape(state.review.search)}" placeholder="Tool name, asset ID, brand or holder" autofocus></div>
        <div class="field"><label for="sites-tool-status">Status</label><select id="sites-tool-status" class="chip-filter"><option value="">All statuses</option>${Object.entries(toolStatuses).map(([key, [label]]) => `<option value="${key}"${state.review.status === key ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      </div>
      <div id="sites-review-results" class="card" aria-live="polite"></div>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true, 'review');
    filterTools();
  }

  function filterTools() {
    const target = root.querySelector('#sites-review-results');
    if (!target || !currentSite()) return;
    const search = root.querySelector('#sites-tool-search').value.trim().toLowerCase();
    const status = root.querySelector('#sites-tool-status').value;
    state.review = { search: root.querySelector('#sites-tool-search').value, status };
    const items = siteEquipment(currentSite()).filter(item => (!status || item.status === status) && (!search || [item.name, item.asset_id, item.brand, item.holder, item.current_holder_id].some(value => String(value || '').toLowerCase().includes(search))));
    target.innerHTML = inventoryTable(items, search || status ? 'No equipment matches your filters.' : 'No equipment is currently assigned to this project.');
  }

  function movementTable(records) {
    if (records.error) return `<div class="empty-state"><p class="t">Movement history unavailable</p><p class="d">${escape(records.error)}</p></div>`;
    if (!records.length) return '<div class="empty-state sites-movement-empty"><p class="t">No movement records available</p><p class="d">Movement history will appear here when records are available. This view is read-only.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Tool</th><th>From</th><th>To</th>${isEngineer() ? '' : '<th>Quantity</th>'}</tr></thead><tbody>${records.map(record => `<tr><td>${escape(formatTimestamp(record.date))}</td><td>${escape(record.asset_id)}</td><td>${escape(record.from)}</td><td>${escape(record.to)}</td>${isEngineer() ? '' : `<td>${escape(record.quantity)}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }

  async function viewMovements() {
    const site = currentSite();
    if (!site) return;
    const records = await repository.movements(site.id).catch(error => ({error: databaseError(error, 'movements')}));
    if (!root.isConnected) return;
    openDialog(`Movement History — ${site.name}`, `<p class="sites-dialog-description">Equipment movement into and out of this project.</p><div class="card">${movementTable(records)}</div><div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true);
  }

  async function viewTool(id, fromReview = dialog.open && dialog.dataset.view === 'review') {
    const site = currentSite();
    const item = site && siteEquipment(site).find(record => record.id === id);
    if (!item) return;
    const navigation = state.navigation;
    const records = await repository.movements(site.id, item.id).catch(error => ({error: databaseError(error, 'tool-movements')}));
    if (!root.isConnected || state.disposed || state.navigation !== navigation || state.selectedId !== site.id) return;
    const fields = [['Asset ID', item.asset_id], ['Category', item.category], ['Brand', item.brand], ['Model', item.model], ['Serial Number', item.serial_number], ['Condition', display.condition(item.condition)], ['Tracking Type', display.tracking(item.tracking_type)], ['Quantity', `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`], ['Current Project', site.name], ['Current Holder', item.holder], ['Identifying Details', item.details]];
    openDialog(item.name, `
      <p class="sites-dialog-description">Equipment details for ${escape(site.name)}.</p>
      <div class="sites-tool-details">${fields.filter(([label]) => !isEngineer() || !['Quantity','Tracking Type'].includes(label)).map(([label, value]) => `<div class="kv"><span class="k">${label}</span><span class="v">${escape(value ?? '—') || '—'}</span></div>`).join('')}<div class="kv"><span class="k">Status</span><span class="v">${badge(item.status, toolStatuses)}</span></div></div>
      <div class="section-title"><h2>Movement History</h2><span class="eyebrow">Read only</span></div>
      <div class="card">${movementTable(records)}</div>
      <div class="sites-dialog-actions">${fromReview ? '<button type="button" class="btn btn-secondary" data-action="review-tools">← Assigned Tools</button>' : ''}<button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`);
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || state.saving) return;
    const actions = {
      refresh, 'add-site': () => editSite(), 'open-site': () => openSite(button.dataset.id),
      'all-sites': () => { feedback(''); showScreen('sites'); },
      'edit-site': () => { if (currentSite()) editSite(currentSite()); },
      'archive-site': archiveSite, 'confirm-archive': confirmArchive,
      'project-history': viewProjectHistory,
      'site-update': () => addSiteUpdate(), 'correct-site-update': () => addSiteUpdate(button.dataset.id),
      'review-tools': () => window.MCPAMovementLinks.parse(location.hash).tool && window.MCPANavigation.canBack() ? window.MCPANavigation.back() : reviewTools(),
      'view-tool': () => showScreen('site-detail?record=' + encodeURIComponent(state.selectedId) + '&tool=' + encodeURIComponent(button.dataset.id)),
      'view-movements': viewMovements, 'close-dialog': closeDialog
    };
    actions[button.dataset.action]?.();
  });
  root.addEventListener('submit', event => {
    if (!['sites-form', 'site-update-form'].includes(event.target.id)) return;
    event.preventDefault();
    if (event.target.id === 'sites-form') saveSite(event.target);
    else saveSiteUpdate(event.target);
  });
  root.addEventListener('input', event => {
    if (event.target.closest('#sites-form')) { state.dirty = true; if (event.target.matches('[data-progress], #project-progress-enabled')) updateProgressPreview(); }
    if (event.target.id === 'project-history-search') filterHistory();
    if (event.target.id === 'sites-tool-search') filterTools();
    if (event.target.id === 'projects-search') { state.search = event.target.value.trim().toLowerCase(); render(); }
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'project-history-type') filterHistory();
    if (event.target.id === 'project-progress-enabled') { updateProgressPreview(); if (event.target.checked) root.querySelector('#project-progress-editor').open = true; }
    if (event.target.id === 'sites-tool-status') filterTools();
    if (event.target.id === 'projects-scope' && !readOnly) { state.scope = event.target.value; render(); }
    if (event.target.id === 'projects-archived') { state.includeArchived = event.target.checked; render(); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  const stopWatching = demo ? () => {} : window.EquipmentTracking.watch(() => refresh(true), message => {
    const label = root.querySelector('.inventory-sync'); if (label && !state.disposed) label.textContent = message;
  });
  window.MCPAProjects = {
    dispose() { state.disposed = true; stopWatching(); },
    cancelTarget() { state.navigation = (state.navigation || 0) + 1; },
    capture: () => state.disposed ? null : ({search: state.search, scope: state.scope, includeArchived: state.includeArchived, review: state.review, reviewOpen: dialog.open && dialog.dataset.view === 'review'}),
    restore(saved) {
      if (!saved || state.disposed) return;
      state.search = saved.search; state.includeArchived = saved.includeArchived;
      state.scope = isEngineer() ? 'mine' : saved.scope;
      state.review = saved.review || {search:'',status:''}; state.restoreReview = saved.reviewOpen;
      root.querySelector('#projects-search').value = state.search;
      root.querySelector('#projects-archived').checked = state.includeArchived;
      render();
    },
    async openRecord(id, tool) {
      if (state.disposed) return;
      const fromReview = dialog.open && dialog.dataset.view === 'review';
      dialog.close();
      // Never substitute the first project for a missing deep-linked record.
      state.selectedId = state.sites.find(site => site.id === id && (!isEngineer() || assignedToMe(site)))?.id || null;
      renderDetail();
      if (state.selectedId && tool) await viewTool(tool, fromReview);
      else if (state.selectedId && state.restoreReview) reviewTools(true);
      state.restoreReview = false;
    }
  };
  const ready = refresh();
  window.MCPANavigation?.track(root, ready);
})();
