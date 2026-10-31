if (typeof supabaseClient === 'undefined') {
  const supabaseUrl = 'https://zpqxlmiqwevhlstjirei.supabase.co';
  const supabaseKey = 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58';
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

var equipmentList = [];
var currentEditId = null; 
var currentProfileId = null;

var currentPage = 1;
var selectedAssets = [];
var bulkActionMode = '';
var itemsPerPage = 10;
var equipmentPhotoState = {file:null,previewUrl:null,staged:null,revision:0,saving:false,validating:false,newAssetId:null,newRecordId:null};

function setEquipmentModalOpen(open) {
  const modal = document.getElementById('equipmentModal');
  if (!modal) return;
  if (open) {
    modal.showModal?.();
    modal.style.display = 'flex';
    modal.querySelector('.equipment-form-body')?.scrollTo(0,0);
  } else { modal.close?.(); modal.style.display = 'none'; }
  document.documentElement?.classList.toggle('equipment-modal-open',open);
}

async function discardEquipmentUpload() {
  const state = equipmentPhotoState;
  if (state.staged && window.EquipmentPhotos?.discard) await window.EquipmentPhotos.discard(state.staged);
  state.staged = null;
}

function resetEquipmentPhoto(item = null, keepSelection = false) {
  const state = equipmentPhotoState;
  ++state.revision;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = null; state.previewUrl = null; state.staged = null; state.validating = false;
  const input = document.getElementById('equipmentPhoto');
  if (input && !keepSelection) input.value = '';
  const preview = document.getElementById('equipmentPhotoPreview');
  if (preview) { preview.innerHTML = item?.image_url ? window.EquipmentVisual.thumbnail(item) : ''; preview.hidden = !item?.image_url; }
  const clear = document.getElementById('clearEquipmentPhoto');
  if (clear) clear.hidden = true;
  const label = document.getElementById('equipmentPhotoLabel');
  if (label) label.textContent = item?.image_url ? 'Replace item photo (optional)' : 'Item photo (optional)';
  const status = document.getElementById('equipmentPhotoStatus');
  if (status) status.textContent = item?.image_url ? 'The current photo is kept unless you select a replacement.' : '';
  const feedback = document.getElementById('equipmentFormFeedback');
  if (feedback) feedback.textContent = '';
}

function equipmentMatchesSearch(item, query) {
  const search = String(query || '').trim().toLowerCase();
  return !search || [item.assetId,item.equipmentType,item.brand,item.serialNumber,item.site,item.holder]
    .some(value => String(value ?? '').toLowerCase().includes(search));
}

function filteredEquipment() {
  const search = document.getElementById('searchEquipment')?.value || '';
  const category = document.getElementById('typeFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';
  const site = document.getElementById('siteFilter')?.value || '';
  return equipmentList.filter(item => equipmentMatchesSearch(item, search) && (!category || item.category === category)
    && window.EquipmentTracking.matchesStatus(item,status,item.availabilityData) && (!site || item.site === site));
}

function filterAndResetPage() {
  currentPage = 1;
  renderTable();
}

// Status has one owner: the existing dropdown. Use the app's hash/history
// navigation so dashboard links, local filters, back and reload agree.
function navigateEquipmentStatus(value) {
  const key = {'':'all',Available:'available','In Use':'inuse','For Repair':'repair',Missing:'missing',Sold:'sold',Disposed:'disposed'}[value] || value;
  if (['all','available','inuse','repair','missing','sold','disposed'].includes(key)) showScreen('masterlist?status=' + key);
}

function updateEquipmentSummary() {
  const tools = equipmentList.filter(item => window.EquipmentTracking.quantity(item) > 0);
  const totals = window.AdminEquipment?.loaded ? window.EquipmentTracking.tally(tools, tools[0]?.availabilityData) : null;
  document.querySelectorAll('[data-equipment-count]').forEach(el => { el.textContent = totals ? totals[el.dataset.equipmentCount] : '—'; });
  const status = document.getElementById('statusFilter')?.value || '';
  const selected = {'':'all',Available:'available','In Use':'inuse'}[status];
  document.querySelectorAll('[data-equipment-status]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.equipmentStatus === selected)));
}

async function initMasterlist() {
  const tbody = document.getElementById("equipmentTableBody");
  const owner = window.AdminEquipment;
  if (!tbody || owner?.disposed) return;
  const request = owner.request = (owner.request || 0) + 1;
  if (!tbody.children.length) tbody.innerHTML = '<tr><td colspan="10">Loading equipment…</td></tr>';
  let data, movement;
  try { [data, movement] = await Promise.all([window.EquipmentTracking.readAll('equipment'), window.MovementStore.refresh().catch(() => null)]); }
  catch (error) {
    console.error("Error fetching equipment:", error.message);
    if (tbody.isConnected) document.getElementById('inventory-sync').textContent = 'Equipment could not load. Retrying automatically.';
    throw error;
  }

  const [siteResult, holderResult] = await Promise.all([
    window.EquipmentTracking.readAll('sites').then(data => ({data})),
    window.EquipmentTracking.readAll('profiles', query => query.select('id,name,role', {count:'exact'})).then(data => ({data})).catch(() => ({data: []}))
  ]);
  if (!tbody?.isConnected || owner?.disposed || owner !== window.AdminEquipment || request !== owner.request) return;
  const siteNames = new Map((siteResult.data || []).map(site => [site.id, site.name]));
  const holderNames = new Map((holderResult.data || []).map(profile => [profile.id, profile.name]));
  const movementTools = new Map((movement?.tools || []).map(tool => [tool.id, tool]));
  equipmentList = (data || []).map(item => ({
    id: item.asset_id || item.id,
    archived_at: item.archived_at,
    is_active: item.is_active,
    site_id: item.site_id,
    current_holder_id: item.current_holder_id,
    movementLock: movementTools.get(item.asset_id)?.movementLock,
    retirementDisposition: movementTools.get(item.asset_id)?.retirementDisposition,
    availabilityData: movement || {availabilityError:true,requests:[],transfers:[]},
    image_url: item.image_url,
    assetId: item.asset_id,
    equipmentType: item.name,
    category: item.category || 'Uncategorized',
    brand: item.brand || 'Unknown',
    model: item.model || '—',
    serialNumber: item.serial_number || '—',
    site: siteNames.get(item.site_id) || (item.site_id ? 'Project unavailable' : 'Unassigned'),
    holder: holderNames.get(item.current_holder_id) || (item.current_holder_id ? 'Holder unavailable' : '—'),
    status: formatDbStatus(item.status),
    dbStatus: item.status,
    condition: item.condition || 'Not Assessed',
    trackingType: item.tracking_type || 'Individual',
    quantity: item.quantity ?? 1,
    unit: item.unit || '',
    details: item.details || '—',
    createdAt: item.created_at
  }));

  equipmentList.forEach(item => { item.availability = window.EquipmentTracking.availability(item, item.availabilityData); });
  owner.loaded = true;
  populateFilters();
  renderTable();
  if (currentProfileId && document.getElementById('screen-tool-profile')?.style.display === 'block') showToolProfile(currentProfileId, true);
  if (!tbody.dataset.listeners) { setupMasterlistListeners(); tbody.dataset.listeners = 'true'; }
  document.getElementById('inventory-sync').textContent = '';
}

function populateFilters() {
  const typeFilter = document.getElementById("typeFilter");
  const siteFilter = document.getElementById("siteFilter");
  
  if (typeFilter) {
    const currentType = typeFilter.value;
    const categories = [...new Set(equipmentList.map(item => item.category).filter(Boolean))].sort();
    typeFilter.innerHTML = '<option value="">Category</option>' + categories.map(c => `<option value="${c}">${escapeHTML(c)}</option>`).join('');
    typeFilter.value = currentType;
  }
  
  if (siteFilter) {
    const currentSite = siteFilter.value;
    const sites = [...new Set(equipmentList.map(item => item.site).filter(Boolean))].sort();
    siteFilter.innerHTML = '<option value="">Project</option>' + sites.map(s => `<option value="${s}">${escapeHTML(s)}</option>`).join('');
    siteFilter.value = currentSite;
  }
}

function formatDbStatus(status) {
  if (!status) return 'unknown';
  const s = status.toString().toUpperCase();
  if (s === 'IN_USE') return 'inuse';
  if (s === 'REPAIR' || s === 'FOR_REPAIR') return 'repair';
  if (s === 'UNDER_REPAIR') return 'underrepair';
  if (s === 'DISPOSED') return 'disposed';
  if (s === 'MISSING') return 'missing';
  return s.toLowerCase().replace(/[\s_-]/g, '');
}

function getBadgeClass(status) {
  switch (status) {
    case "available": return "badge-available";
    case "inuse": return "badge-inuse";
    case "repair": return "badge-repair";
    case "missing": return "badge-missing";
    default: return "";
  }
}

function getConditionColor(condition) {
  switch(condition.toLowerCase()) {
    case 'good': return 'color: #059669; background: #d1fae5;'; 
    case 'fair': return 'color: #d97706; background: #fef3c7;'; 
    case 'damaged': return 'color: #dc2626; background: #fee2e2;'; 
    default: return 'color: #6b7280; background: #f3f4f6;'; 
  }
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const countSpan = document.getElementById('selectedCount');
  if (!bar || !countSpan) return;

  if (selectedAssets.length > 0) {
    bar.style.display = 'flex';
    countSpan.innerText = selectedAssets.length;
  } else {
    bar.style.display = 'none';
  }
}

function updateSelectAllState() {
  const checkboxes = Array.from(document.querySelectorAll('.row-checkbox'));
  const selectAllCb = document.getElementById('selectAll');
  if (!selectAllCb) return;

  if (checkboxes.length > 0 && checkboxes.every(cb => cb.checked)) {
    selectAllCb.checked = true;
  } else {
    selectAllCb.checked = false;
  }
}

function handleCheckboxChange(assetId, isChecked) {
  if (isChecked && !selectedAssets.includes(assetId)) {
    selectedAssets.push(assetId);
  } else if (!isChecked) {
    selectedAssets = selectedAssets.filter(id => id !== assetId);
  }
}

// --- NEW MODAL BULK FUNCTIONS ---
function clearBulkSelection() {
  selectedAssets = []; 
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false); 
  updateSelectAllState();
  updateBulkActionBar();
}

function bulkUpdateStatus() {
  if (selectedAssets.length === 0) return;
  bulkActionMode = 'status';
  document.getElementById('bulkModalTitle').innerText = `Update Status (${selectedAssets.length} items)`;
  document.getElementById('bulkStatusField').style.display = 'block';
  document.getElementById('bulkLocationField').style.display = 'none';
  document.getElementById('bulkStatusSelect').required = true;
  document.getElementById('bulkLocationInput').required = false;
  document.getElementById('bulkActionForm').reset();
  document.getElementById('bulkActionModal').style.display = 'flex';
}

function bulkAssignLocation() {
  if (selectedAssets.length === 0) return;
  bulkActionMode = 'location';
  document.getElementById('bulkModalTitle').innerText = `Assign Location (${selectedAssets.length} items)`;
  document.getElementById('bulkStatusField').style.display = 'none';
  document.getElementById('bulkLocationField').style.display = 'block';
  document.getElementById('bulkStatusSelect').required = false;
  document.getElementById('bulkLocationInput').required = true;
  document.getElementById('bulkActionForm').reset();
  document.getElementById('bulkActionModal').style.display = 'flex';
}

function closeBulkModal() {
  document.getElementById('bulkActionModal').style.display = 'none';
  document.getElementById('bulkActionForm').reset();
}
// ---------------------------------

function renderTable() {
  updateEquipmentSummary();
  const filtered = filteredEquipment();

  const tbody = document.getElementById("equipmentTableBody");
  const emptyState = document.getElementById("emptyState");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    renderPagination(0, 0, 0, 0);
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedItems = filtered.slice(startIndex, endIndex);

  paginatedItems.forEach(item => {
    const row = document.createElement("tr");
    row.className = "clickable";
    
    row.innerHTML = `
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <input type="checkbox" class="row-checkbox" value="${escapeHTML(item.assetId)}" ${selectedAssets.includes(item.assetId) ? 'checked' : ''}>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <span class="tool-id-chip">${escapeHTML(item.assetId)}</span>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <div class="equipment-identity">${window.EquipmentVisual.thumbnail(item)}<div>
        <div class="cell-name" style="font-weight:600;">${escapeHTML(item.equipmentType)}</div>
        <div class="cell-sub" style="font-size:11px; color:var(--gray);">${escapeHTML(item.model !== '—' ? item.model : 'Standard')}</div>
        </div></div>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.category)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.brand)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.site)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${window.EquipmentTracking.statusMarkup(item,item.availabilityData)}</td>
      
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <span style="padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; ${getConditionColor(item.condition)}">
          ${escapeHTML(window.MCPADisplay.condition(item.condition))}
        </span>
      </td>
      
      <td style="padding:12px; border-bottom:1px solid var(--line);">${formatDate(item.createdAt)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line); text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="showToolProfile('${item.assetId}')" style="padding:4px 8px; border:none; background:none; color:var(--gold); font-weight:600; cursor:pointer;">View</button>
          <button class="btn btn-secondary btn-sm" onclick="editTool('${item.assetId}')" style="padding:4px 8px; border:none; background:none; color:var(--gray); cursor:pointer;">Edit</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  renderPagination(totalItems, startIndex, endIndex, totalPages);
  updateSelectAllState();
}

function renderPagination(total, start, end, totalPages) {
  const container = document.getElementById('paginationContainer');
  const infoEl = document.getElementById('paginationInfo');
  const controlsEl = document.getElementById('paginationControls');
  
  if (!container || !infoEl || !controlsEl) return;

  if (total === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  infoEl.innerHTML = `Showing <strong>${start + 1}-${end}</strong> of <strong>${total}</strong> entries`;

  let buttonsHtml = `<button class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Prev</button>`;
  
  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      buttonsHtml += `<button class="btn btn-accent btn-sm">${i}</button>`;
    } else {
      buttonsHtml += `<button class="btn btn-secondary btn-sm" onclick="changePage(${i})">${i}</button>`;
    }
  }

  buttonsHtml += `<button class="btn btn-secondary btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>`;
  controlsEl.innerHTML = buttonsHtml;
}

function changePage(page) {
  currentPage = page;
  renderTable();
}

function showMasterlistView(viewName) {
  const masterlistScreen = document.getElementById('screen-masterlist');
  const profileScreen = document.getElementById('screen-tool-profile');

  if (viewName === 'masterlist') {
    currentProfileId = null;
    if (masterlistScreen) masterlistScreen.style.display = 'block';
    if (profileScreen) profileScreen.style.display = 'none';
  } else if (viewName === 'tool-profile') {
    // A new detail visit must not inherit the inventory's old scroll offset.
    // History restoration runs afterward and can restore a previous visit.
    if (profileScreen?.style.display !== 'block') window.scrollTo(0,0);
    if (masterlistScreen) masterlistScreen.style.display = 'none';
    if (profileScreen) profileScreen.style.display = 'block';
  }
}

function showToolProfile(assetId, restoring = false) {
  if (!restoring) { showScreen('tool-profile?record=' + encodeURIComponent(assetId)); return; }
  const item = equipmentList.find(eq => eq.assetId === assetId);
  if (!item) {
    currentProfileId = null;
    document.getElementById('profileContent').textContent = 'This equipment is unavailable or your account no longer has access.';
    showMasterlistView('tool-profile');
    return;
  }
  currentProfileId = assetId;

  const content = document.getElementById("profileContent");
  if (!content) return;
  window.closeMobileSearch?.(false);

  content.innerHTML = `
    <div class="two-col" style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-top:16px;">
      <div>
        <div class="page-head" style="margin-bottom:16px;">
          <div>
            <h1 class="display" style="font-size:20px; font-weight:700; margin:0 0 4px 0;">${escapeHTML(item.equipmentType)} — ${escapeHTML(item.assetId)}</h1>
            <p class="sub" style="color:var(--gray); font-size:13px; margin:0;">${escapeHTML(item.brand)} · ${escapeHTML(item.model !== '—' ? item.model : 'Standard Model')}</p>
          </div>
        </div>

        <figure class="equipment-profile-photo">${window.EquipmentVisual.thumbnail(item)}${item.image_url ? '' : '<figcaption>No item photo saved</figcaption>'}</figure>

        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Movement History</h2></div>
        <div class="card card-pad" style="background:var(--surface); padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="timeline">
            <div class="tl-item">
              <div class="tl-date" style="font-size:11px; color:var(--gray);">${formatDate(item.createdAt)}</div>
              <div class="tl-title" style="font-weight:600; font-size:13px;">Registered into Masterlist</div>
              <div class="tl-detail" style="font-size:12px; color:var(--gray); margin-top:2px;">Equipment added to inventory. Current recorded condition: ${escapeHTML(window.MCPADisplay.condition(item.condition))}.</div>
              <div class="tl-meta" style="font-size:11px; margin-top:4px;"><span>Status <b>${escapeHTML(window.MCPADisplay.status(item.status))}</b></span></div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Tool Information</h2></div>
        <div class="card card-pad" style="background:var(--surface); padding:16px; border-radius:8px; border:1px solid var(--line); margin-bottom:22px;">
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Tool ID</span><span class="v" style="font-weight:600;"><span class="tool-id-chip">${escapeHTML(item.assetId)}</span></span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Category</span><span class="v" style="font-weight:600;">${escapeHTML(item.category)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Brand</span><span class="v" style="font-weight:600;">${escapeHTML(item.brand)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Model</span><span class="v" style="font-weight:600;">${escapeHTML(item.model)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Serial Number</span><span class="v mono" style="font-weight:600;">${escapeHTML(item.serialNumber)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Condition</span><span class="v" style="font-weight:600;">${escapeHTML(window.MCPADisplay.condition(item.condition))}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Tracking Type</span><span class="v" style="font-weight:600;">${escapeHTML(window.MCPADisplay.tracking(item.trackingType))}</span></div>
          ${item.trackingType === 'Bulk' ? `<div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Quantity & Unit</span><span class="v" style="font-weight:600;">${escapeHTML(item.quantity)}${escapeHTML(item.unit)}</span></div>` : ''}
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Identifying Details</span><span class="v" style="font-weight:600;">${escapeHTML(item.details)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Current Location</span><span class="v" style="font-weight:600;">${escapeHTML(item.site)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);"><span class="k" style="color:var(--gray); font-size:13px;">Current Holder</span><span class="v" style="font-weight:600;">${escapeHTML(item.holder)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0;">${window.EquipmentTracking.statusMarkup(item,item.availabilityData)}</div>
        </div>

        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Actions & QR Tag</h2></div>
        <div class="card card-pad" style="background:var(--surface); padding:16px; border-radius:8px; border:1px solid var(--line); text-align:center;">
          <div id="qrContainerProfile" class="equipment-qr-surface"></div>
          <div style="font-weight:700; font-size:13px; margin-bottom:14px;">${escapeHTML(item.assetId)}</div>
          
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary btn-block btn-sm" onclick="editTool('${item.assetId}')" style="padding:8px; cursor:pointer;">Edit Tool</button>
            <button class="btn btn-secondary btn-block btn-sm" onclick="printQRTag('${item.assetId}')" style="padding:8px; cursor:pointer;">Print Tag</button>
          </div>
        </div>
      </div>
    </div>
  `;

  showMasterlistView('tool-profile');

  const timeline = content.querySelector('.timeline');
  timeline.textContent = 'Loading recorded movement…';
  window.MovementStore.refresh().then(state => {
    if (!timeline.isConnected) return;
    const events = state.activity.filter(event => event.toolIds?.includes(assetId));
    timeline.innerHTML = events.length ? events.map(event => `<div class="tl-item"><div class="tl-date">${escapeHTML(window.MCPADisplay.dateTime(event.createdAt))}</div><div class="tl-title">${escapeHTML(window.MCPADisplay.activity(event,state).title)}</div><div class="tl-detail">${escapeHTML(window.MCPADisplay.activity(event,state).description)}</div><div class="tl-meta">${escapeHTML(window.MCPADisplay.activity(event).actor)} · ${escapeHTML(window.MCPADisplay.activity(event).reference)}</div></div>`).join('') : '<p>No movement has been recorded for this tool.</p>';
  }).catch(error => { if (timeline.isConnected) timeline.textContent = window.MCPADisplay.errorText(error); });

  setTimeout(() => {
    const qrEl = document.getElementById("qrContainerProfile");
    if (qrEl) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(item.assetId)}`;
      qrEl.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width:96px; height:96px; border-radius:4px; display:block; margin:0 auto;">`;
    }
  }, 50);
}

function editTool(assetId) {
  const item = equipmentList.find(eq => eq.assetId === assetId);
  if (!item) return;
  
  currentEditId = assetId;
  document.getElementById('equipmentInitialLocation').hidden = true;
  resetEquipmentPhoto(item);

  document.getElementById('equipmentType').value = item.equipmentType || '';
  document.getElementById('equipmentCategory').value = item.category || '';
  document.getElementById('brand').value = item.brand !== 'Unknown' ? item.brand : '';
  document.getElementById('equipmentModel').value = item.model !== '—' ? item.model : '';
  document.getElementById('serialNumber').value = item.serialNumber !== '—' ? item.serialNumber : '';
  document.getElementById('equipmentCondition').value = item.condition || 'Good';
  document.getElementById('trackingType').value = item.trackingType || 'Individual';
  document.getElementById('equipmentQuantity').value = item.quantity || 1;
  document.getElementById('equipmentUnit').value = item.unit || '';
  document.getElementById('identifyingDetails').value = item.details !== '—' ? item.details : '';

  const trackingSelect = document.getElementById('trackingType');
  if (trackingSelect) trackingSelect.dispatchEvent(new Event('change'));

  const modal = document.getElementById('equipmentModal');
  if (modal) {
    const modalTitle = modal.querySelector('h2');
    const modalSubmitBtn = modal.querySelector('button[type="submit"]');
    
    if (modalTitle) modalTitle.innerText = `Edit Tool: ${assetId}`;
    if (modalSubmitBtn) modalSubmitBtn.innerText = 'Update Item';
    
    setEquipmentModalOpen(true);
  }
}

function setupMasterlistListeners() {
  const openBtn = document.getElementById('openAddEquipment');
  const closeBtn = document.getElementById('closeEquipmentModal');
  const cancelBtn = document.getElementById('cancelEquipmentModal');
  const exportBtn = document.getElementById('exportBtn'); 
  const modal = document.getElementById('equipmentModal');
  const form = document.getElementById('equipmentForm');
  const trackingType = document.getElementById('trackingType');
  const photoInput = document.getElementById('equipmentPhoto');
  const photoClear = document.getElementById('clearEquipmentPhoto');
  const photoStatus = document.getElementById('equipmentPhotoStatus');
  const feedback = document.getElementById('equipmentFormFeedback');

  // --- CONNECTING THE NEW BULK BUTTONS ---
  const btnBulkStatus = document.getElementById('btnBulkStatus');
  const btnBulkLocation = document.getElementById('btnBulkLocation');
  const btnBulkCancel = document.getElementById('btnBulkCancel');
  
  if (btnBulkStatus) { btnBulkStatus.textContent = 'Review repairs'; btnBulkStatus.onclick = () => showScreen('repair'); }
  if (btnBulkLocation) { btnBulkLocation.textContent = 'Review transfers'; btnBulkLocation.onclick = () => showScreen('transfer'); }
  if (btnBulkCancel) btnBulkCancel.onclick = clearBulkSelection;

  // --- CONNECTING THE BULK MODAL CLOSE BUTTONS ---
  const closeBulkBtn = document.getElementById('closeBulkModal');
  const cancelBulkBtn = document.getElementById('cancelBulkModal');
  
  if (closeBulkBtn) closeBulkBtn.onclick = closeBulkModal;
  if (cancelBulkBtn) cancelBulkBtn.onclick = closeBulkModal;

  // --- HANDLING THE BULK FORM SUBMIT ---
  const bulkForm = document.getElementById('bulkActionForm');
  if (bulkForm) {
    bulkForm.onsubmit = (e) => {
      e.preventDefault();
      closeBulkModal();
      showScreen(bulkActionMode === 'location' ? 'transfer' : 'repair');
    };
  }
  // ----------------------------------------

  // Listen for clicks on the "Select All" header checkbox
  const selectAllBtn = document.getElementById('selectAll');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const rowCheckboxes = document.querySelectorAll('.row-checkbox');
      
      rowCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        handleCheckboxChange(cb.value, isChecked);
      });
      
      updateBulkActionBar();
    });
  }

  // Listen for clicks on individual row checkboxes (using event delegation)
  const tbody = document.getElementById('equipmentTableBody');
  if (tbody) {
    tbody.addEventListener('change', (e) => {
      if (e.target.classList.contains('row-checkbox')) {
        handleCheckboxChange(e.target.value, e.target.checked);
        updateSelectAllState();
        updateBulkActionBar();
      }
    });
  }

  if (openBtn && modal) {
    openBtn.onclick = () => {
      currentEditId = null;
      document.getElementById('equipmentInitialLocation').hidden = false;
      
      const modalTitle = modal.querySelector('h2');
      const modalSubmitBtn = modal.querySelector('button[type="submit"]');
      
      if (modalTitle) modalTitle.innerText = 'Add New Item';
      if (modalSubmitBtn) modalSubmitBtn.innerText = 'Save Item';
      if (form) form.reset();
      equipmentPhotoState.newAssetId = null;
      equipmentPhotoState.newRecordId = null;
      equipmentPhotoState.attempted = false;
      resetEquipmentPhoto();
      
      setEquipmentModalOpen(true);
    };
  }

  const closeModal = async (saved = false) => {
    if (equipmentPhotoState.saving) return;
    try { if (!saved) await discardEquipmentUpload(); }
    catch (error) { feedback.textContent = error.message; return; }
    setEquipmentModalOpen(false);
    if (form) form.reset();
    resetEquipmentPhoto();
    equipmentPhotoState.newAssetId = null;
    equipmentPhotoState.newRecordId = null;
    equipmentPhotoState.attempted = false;
    currentEditId = null;
  };

  if (closeBtn) closeBtn.onclick = () => closeModal();
  if (cancelBtn) cancelBtn.onclick = () => closeModal();
  if (modal) modal.oncancel = event => { event.preventDefault(); closeModal(); };
  if (exportBtn) exportBtn.onclick = exportMasterlist;
  if (photoClear) photoClear.onclick = async () => {
    try { await discardEquipmentUpload(); resetEquipmentPhoto(equipmentList.find(item => item.assetId === currentEditId)); }
    catch (error) { feedback.textContent = error.message; }
  };
  if (photoInput) photoInput.onchange = async () => {
    const file = photoInput.files?.[0];
    try { await discardEquipmentUpload(); }
    catch (error) { photoInput.value = ''; feedback.textContent = error.message; return; }
    resetEquipmentPhoto(equipmentList.find(item => item.assetId === currentEditId), true);
    if (!file) return;
    const state = equipmentPhotoState, revision = state.revision;
    state.validating = true;
    photoStatus.textContent = 'Checking photo…';
    try {
      await window.EquipmentPhotos.validate(file);
      if (state !== equipmentPhotoState || revision !== state.revision || !photoInput.isConnected) return;
      state.file = file; state.previewUrl = URL.createObjectURL(file);
      const preview = document.getElementById('equipmentPhotoPreview');
      const img = document.createElement('img'); img.alt = 'Selected equipment photo preview';
      const opened = new Promise((resolve,reject) => {img.onload = resolve; img.onerror = () => reject(new Error('This image could not be opened. Choose another JPEG, PNG, or WebP photo.'));});
      img.src = state.previewUrl;
      preview.replaceChildren(img); preview.hidden = false; photoClear.hidden = false;
      await opened;
      if (state !== equipmentPhotoState || revision !== state.revision || !photoInput.isConnected) return;
      photoClear.textContent = currentEditId && equipmentList.find(item => item.assetId === currentEditId)?.image_url ? 'Keep current photo' : 'Clear selected photo';
      photoStatus.textContent = currentEditId && equipmentList.find(item => item.assetId === currentEditId)?.image_url ? 'New photo selected. Saving will replace the current photo.' : 'Photo selected. It will be uploaded when you save the item.';
    } catch (error) { if (revision === state.revision && photoInput.isConnected) { resetEquipmentPhoto(equipmentList.find(item => item.assetId === currentEditId)); photoStatus.textContent = error.message; } }
    finally { if (revision === state.revision) state.validating = false; }
  };

  if (trackingType) {
    trackingType.onchange = function() {
      const qGroup = document.getElementById('quantityGroup');
      const uGroup = document.getElementById('unitGroup');
      if (this.value === 'Bulk') {
        if (qGroup) qGroup.style.display = 'block';
        if (uGroup) uGroup.style.display = 'block';
      } else {
        if (qGroup) qGroup.style.display = 'none';
        if (uGroup) uGroup.style.display = 'none';
      }
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const state = equipmentPhotoState, editId = currentEditId;
      if (state.saving) return;
      if (state.validating) { feedback.textContent = 'Please wait while the photo is checked.'; return; }
      let user;
      try { user = window.MCPAAuth.requireLive(); if (user.role !== 'admin') throw new Error('Only Admin can save inventory items.'); }
      catch (error) { feedback.textContent = error.message; return; }
      
      const payload = {
        name: document.getElementById('equipmentType').value,
        category: document.getElementById('equipmentCategory').value,
        brand: document.getElementById('brand').value,
        model: document.getElementById('equipmentModel').value,
        serial_number: document.getElementById('serialNumber').value,
        condition: document.getElementById('equipmentCondition').value,
        tracking_type: document.getElementById('trackingType').value,
        quantity: document.getElementById('trackingType').value === 'Bulk' ? document.getElementById('equipmentQuantity').value : 1,
        unit: document.getElementById('trackingType').value === 'Bulk' ? document.getElementById('equipmentUnit').value : null,
        details: document.getElementById('identifyingDetails').value
      };

      const assetId = editId || (state.newAssetId ||= 'T-' + crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase());
      const submit = form.querySelector('button[type="submit"]'), originalLabel = submit.textContent;
      const controls = [...form.querySelectorAll('input,select,textarea,button'),closeBtn];
      const disabled = controls.map(control => control.disabled);
      state.saving = true; form.setAttribute('aria-busy','true'); controls.forEach(control => { control.disabled = true; });
      submit.textContent = state.file ? 'Uploading photo…' : 'Saving item…'; feedback.textContent = '';
      let saved = false;
      try {
        const office = editId ? null : await window.EquipmentTracking.inventoryOffice();
        if (state.file) {
          await window.EquipmentPhotos.checkSchema?.();
          state.staged = await window.EquipmentPhotos.prepare(state.file,assetId,state.staged);
          payload.image_url = state.staged.reference;
        }
        if (!form.isConnected || window.MCPAAuth.requireLive().id !== user.id || equipmentPhotoState !== state) throw new Error('Your screen or account changed. Reopen the item before saving.');
        submit.textContent = 'Saving item…';
        const db = window.EquipmentTracking.client();
        // Resolve an interrupted response before retrying the same stable ID.
        if (!editId && state.newRecordId && state.attempted) {
          const recovery = await db.from('equipment').select('*').eq('id',state.newRecordId).limit(1);
          if (recovery.error) throw new Error('Could not verify the previous save. Check your connection and retry.');
          const record = recovery.data?.[0];
          if (record) {
            if (record.asset_id !== assetId || record.site_id !== office.id || Object.entries(payload).some(([key,value]) => String(record[key] ?? '') !== String(value ?? ''))) throw new Error('This Asset ID was already saved with different details. Refresh inventory and edit that item.');
            saved = true;
          }
        }
        if (!saved) {
          state.attempted = true;
          const query = editId ? db.from('equipment').update(payload).eq('asset_id',editId) : db.from('equipment').insert([{...payload,id:state.newRecordId ||= crypto.randomUUID(),asset_id:assetId,status:'AVAILABLE',site_id:office.id}]);
          const {data,error} = await query.select('asset_id,site_id').single();
          if (error) throw new Error('The item could not be saved. Your form and photo selection have been kept. Check your connection and retry. ' + error.message);
          if (!data || data.asset_id !== assetId) throw new Error('The saved item could not be verified. Refresh the inventory before retrying.');
          if (!editId && data.site_id !== office.id) throw new Error('The saved Office location could not be verified. Refresh inventory before retrying.');
          saved = true;
        }
      } catch (error) {
        if (error.staged) state.staged = error.staged;
        if (feedback.isConnected) feedback.textContent = error.message;
      }
      finally {
        state.saving = false;
        if (form.isConnected) {
          form.removeAttribute('aria-busy'); controls.forEach((control,index) => {control.disabled = disabled[index];}); submit.textContent = originalLabel;
        }
      }
      if (saved && form.isConnected && equipmentPhotoState === state) {
        await closeModal(true);
        const sync = document.getElementById('inventory-sync');
        sync.textContent = editId ? 'Item updated.' : 'Item saved.';
        initMasterlist().catch(() => { if (sync.isConnected) sync.textContent = 'Item saved. Inventory refresh failed; reload to see the changes.'; });
      }
    };
  }
}

function printQRTag(assetId) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(assetId)}`;
  const printWin = window.open('', '_blank', 'width=400,height=400');
  
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Tag - ${assetId}</title>
      <style>
        @page { margin: 2mm; }
        body { 
          font-family: 'Inter', system-ui, sans-serif; 
          display: flex; align-items: center; justify-content: center; 
          height: 100vh; margin: 0; background: #fff;
        }
        .label-container { text-align: center; padding: 8px; }
        .company-name {
          font-size: 8px; font-weight: 700; letter-spacing: 0.05em;
          text-transform: uppercase; color: #111; margin-bottom: 4px;
        }
        img { width: 30mm; height: 30mm; margin-bottom: 4px; }
        .asset-id { font-size: 11px; font-weight: 800; letter-spacing: 0.05em; color: #111; }
      </style>
    </head>
    <body>
      <div class="label-container">
        <div class="company-name">BuildRight Corp.</div>
        <img src="${qrUrl}" alt="QR Code" onload="window.print(); window.close();" />
        <div class="asset-id">${assetId}</div>
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
}

function exportMasterlist() {
  const filtered = filteredEquipment();

  const currentDate = window.MCPADisplay.dateTime(new Date()) + ' Manila';

  const tableRows = filtered.map(item => `
    <tr>
      <td style="font-family:monospace; font-weight:bold;">${escapeHTML(item.assetId)}</td>
      <td>${escapeHTML(item.equipmentType)}</td>
      <td>${escapeHTML(item.category)}</td>
      <td>${escapeHTML(item.site)}</td>
      <td>${escapeHTML(item.holder)}</td>
      <td>${escapeHTML(window.MCPADisplay.status(item.status))}</td>
    </tr>
  `).join('');

  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Masterlist Export Receipt</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; color: #111; padding: 40px; }
        .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 24px; margin: 0 0 4px 0; }
        .header p { font-size: 13px; color: #555; margin: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 20px; }
        th { text-align: left; background: #f4f4f4; padding: 12px; border-bottom: 2px solid #ddd; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
        td { padding: 12px; border-bottom: 1px solid #ddd; }
        .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BuildRight Corp. - Tools & Equipment Receipt</h1>
        <p><strong>Status Report Printed On:</strong> ${currentDate}</p>
        <p><strong>Total Items Listed:</strong> ${filtered.length}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Item Name</th>
            <th>Category</th>
            <th>Location</th>
            <th>Holder</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="footer">
        Generated by Fieldmark Asset Management System
      </div>
      
      <script>
        window.onload = () => {
          window.print();
          window.close();
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

function escapeHTML(str) {
  if (!str) return "";
  return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return window.MCPADisplay.date(dateString);
}

(function () {
  window.AdminEquipment?.dispose();
  const viewport = window.visualViewport;
  const resize = () => {
    const style = document.getElementById('equipmentModal')?.style;
    style?.setProperty('--equipment-viewport-height',(viewport?.height || window.innerHeight) + 'px');
    style?.setProperty('--equipment-viewport-top',(viewport?.offsetTop || 0) + 'px');
  };
  viewport?.addEventListener('resize',resize);
  viewport?.addEventListener('scroll',resize);
  window.addEventListener('resize',resize);
  resize();
  const owner = {disposed: false, dispose() { this.disposed = true; setEquipmentModalOpen(false); viewport?.removeEventListener('resize',resize); viewport?.removeEventListener('scroll',resize); window.removeEventListener('resize',resize); if (equipmentPhotoState.previewUrl) URL.revokeObjectURL(equipmentPhotoState.previewUrl); ++equipmentPhotoState.revision; stop(); }};
  let stop = () => {};
  window.AdminEquipment = owner;
  const disposeImport = window.EquipmentImport?.attach(owner);
  const disposeEquipment = owner.dispose.bind(owner);
  owner.dispose = () => { disposeImport?.(); disposeEquipment(); };
  document.querySelectorAll('[data-equipment-icon]').forEach(el => { el.innerHTML = icon(el.dataset.equipmentIcon); });
  document.querySelectorAll('[data-equipment-status]').forEach(el => {
    el.addEventListener('click', () => navigateEquipmentStatus(el.dataset.equipmentStatus));
  });
  owner.setStatus = key => {
    if (owner.disposed) return;
    const select = document.getElementById('statusFilter');
    const value = {all:'',available:'Available',inuse:'In Use',repair:'For Repair',missing:'Missing',sold:'Sold',disposed:'Disposed'}[key];
    if (!select || value === undefined) return;
    if (select.value !== value) currentPage = 1;
    select.value = value;
    renderTable();
  };
  owner.capture = () => owner.disposed ? null : ({search:document.getElementById('searchEquipment')?.value || '',category:document.getElementById('typeFilter')?.value || '',site:document.getElementById('siteFilter')?.value || '',page:currentPage});
  owner.restore = saved => {
    if (!saved || owner.disposed) return;
    for (const [id,key] of [['searchEquipment','search'],['typeFilter','category'],['siteFilter','site']]) document.getElementById(id).value = saved[key] || '';
    currentPage = saved.page || 1;
    renderTable();
  };
  stop = window.EquipmentTracking.watch(initMasterlist, message => {
    const target = document.getElementById('inventory-sync');
    if (target && !owner.disposed) target.textContent = message;
  }, {tables:['equipment','sites','mcpa_notifications']});
  const ready = initMasterlist().catch(() => {
    const target = document.getElementById('inventory-sync');
    if (target && !owner.disposed) target.textContent = 'Equipment could not load. Retrying automatically.';
  });
  owner.openRecord = assetId => showToolProfile(assetId, true);
  window.MCPANavigation?.track(document.getElementById('content').firstElementChild, ready);
  window.MCPANavigation?.track(document.getElementById('screen-tool-profile'), ready);
})();
