/* Shared inventory reads and lifecycle-managed Supabase subscriptions. */
(function () {
  'use strict';
  let sequence = 0;
  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Please try again.');
      window.supabaseClient = window.supabase.createClient('https://zpqxlmiqwevhlstjirei.supabase.co', 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58');
    }
    return window.supabaseClient;
  }
  async function readAll(table, configure = query => query) {
    const rows = [];
    for (let offset = 0; ;) {
      const {data, count, error} = await configure(client().from(table).select('*', {count: 'exact'})).order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data?.length || (count != null ? rows.length >= count : data.length < 500)) return rows;
      offset += data.length;
    }
  }
  // Resolve afresh before each creation; never infer Office from a display name.
  async function inventoryOffice() {
    const person = window.MCPAAuth.requireLive();
    if (!['admin','tool_handler','engineer','architect'].includes(person.role)) throw new Error('Equipment access required.');
    const {data, error} = await client().rpc('mcpa_inventory_office');
    if (error || !data || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) || data.label !== 'Office') {
      throw new Error('Office inventory configuration is unavailable. Ask your administrator to review the Office setup, then retry.');
    }
    return data;
  }
  function quantity(tool) {
    const value = Number(tool.quantity ?? tool.qty ?? 1);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const normalized = value => String(value || '').replace(/[\s_-]/g, '').toLowerCase().replace(/^forrepair$/, 'repair');
  function requestability(tool, data = window.MovementStore?.getState()) {
    const status = normalized(tool.recordedStatus ?? tool.dbStatus ?? tool.status);
    const id = tool.asset_id || tool.assetId || tool.id;
    const includes = record => (record.toolIds || [record.toolId]).includes(id);
    const result = (code, label, reason) => ({eligible: code === 'available', code, label, reason});
    if (tool.archived_at || tool.is_active === false) return result('inactive', 'Unavailable', 'This equipment record is inactive or archived.');
    if (quantity(tool) <= 0) return result('empty', 'No stock', 'The recorded quantity is zero.');
    if (['missing','lost'].includes(status) || ['missing','lost'].includes(normalized(tool.condition))) return result('missing', 'Unavailable', 'Equipment is recorded as missing.');
    if (['repair','underrepair','damaged'].includes(status) || ['damaged','repair','underrepair'].includes(normalized(tool.condition))) return result('damaged', 'Unavailable', 'Equipment needs repair before it can be requested.');
    if (['disposed','retired'].includes(status)) return result('retired', 'Unavailable', 'Equipment has been retired from service.');
    const lock = tool.movementLock;
    if(lock==='inspection')return result('inspection','Awaiting Admin inspection','Custody stays with the current holder until Admin verifies physical receipt.');
    if(data?.integrationVersion>=3&&(quantity(tool)!==1||!['individual','individualasset','serialized'].includes(normalized(tool.tracking_type??tool.trackingType))))return result('aggregate','Legacy aggregate — unavailable','This workflow needs separate individual Asset IDs with quantity one. Ask Admin to review this inventory record.');
    if (lock === 'transfer' || (data?.transfers || []).some(record => ['pending','refused'].includes(record.status) && includes(record))
      || (data?.requests || []).some(record => record.status === 'released' && includes(record))) return result('transfer', 'Pending receipt — unavailable for new requests', 'A handover is awaiting receipt or sender follow-up. Recorded status and custody remain unchanged until an authorized workflow resolves it.');
    if (lock === 'request' || lock === 'reserved' || (data?.requests || []).some(record => record.status === 'approved' && includes(record))) return result('reserved', 'Reserved', 'Allocated to an approved request; unavailable for another request.');
    const holderId = tool.current_holder_id ?? tool.holderId;
    const holder = String(tool.holder || '').trim();
    const held = holderId || (!Object.hasOwn(tool,'current_holder_id') && !Object.hasOwn(tool,'holderId') && holder && !['—','–','-','?'].includes(holder));
    if (status === 'inuse') return result('deployed', 'In Use', 'Already in use. The current holder must transfer or return it.');
    if (held) return result('assigned', 'In custody', 'Assigned to a holder; unavailable for a new stock request.');
    // IN_OFFICE is normalized to available by old snapshots, but the action RPC
    // accepts only recorded AVAILABLE stock. Do not promise an invalid request.
    if (status !== 'available') return result('status', 'Unavailable', status === 'inoffice' ? 'Recorded as In Office. Admin must review its movement status before a request.' : 'The recorded status does not permit a new request.');
    const verified = lock === null || typeof lock === 'string' || data?.inventoryAvailabilityVersion === 1
      || !window.MCPAAuth || window.MCPAAuth.isDemo === true;
    if (data?.availabilityError) return result('unknown', 'Availability unverified', 'The latest inventory verification failed. Refresh to verify reservations before requesting.');
    if (!verified) return result('unknown', 'Availability unverified', 'The server did not provide reservation verification. Ask your administrator to update inventory availability verification, then refresh.');
    return result('available', 'Available to request', 'No holder or reservation. Admin approval is required.');
  }
  function availability(tool, data) {
    const result = requestability(tool, data);
    if (result.eligible) return 'Available';
    if (normalized(tool.recordedStatus ?? tool.dbStatus ?? tool.status) === 'inuse') return 'Deployed';
    return 'Unavailable';
  }
  function statusMarkup(tool, data) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const status = normalized(tool.recordedStatus ?? tool.dbStatus ?? tool.status), result = requestability(tool, data);
    const tone = ['available','inuse','repair','underrepair','missing'].includes(status) ? status : 'pending';
    return `<div class="equipment-status"><span class="equipment-status-caption">Recorded status</span><span class="badge badge-${tone}">${escape(tool.retirementDisposition==='sold'?'Sold':tool.retirementDisposition==='disposed'?'Disposed':window.MCPADisplay.status(status))}</span><span class="equipment-request-state" data-requestability="${result.code}"><span class="equipment-status-caption">New requests</span><strong>${escape(result.label)}</strong></span><span class="equipment-status-reason">${escape(result.reason)}</span></div>`;
  }
  function tally(tools, data, {assetsOnly = false} = {}) {
    return tools.reduce((totals, tool) => {
      const units = assetsOnly ? Number(quantity(tool) > 0) : quantity(tool);
      totals.total += units;
      if (availability(tool, data) === 'Available') totals.available += units;
      if (availability(tool, data) === 'Deployed') totals.deployed += units;
      return totals;
    }, {total: 0, available: 0, deployed: 0});
  }
  function matchesStatus(tool, value, data) {
    if (!value) return true;
    const normalize = status => String(status || '').toLowerCase().replace(/[\s_-]/g, '').replace(/^forrepair$/, 'repair');
    const expected = normalize(value);
    const retired = normalize(tool.retirementDisposition);
    if (expected === 'sold') return retired === 'sold' || normalize(tool.status) === 'sold';
    if (expected === 'disposed') return normalize(tool.status) === 'disposed' && retired !== 'sold';
    if (expected === 'repair') return ['repair','underrepair'].includes(normalize(tool.status));
    if (expected === 'available') return availability(tool, data) === 'Available';
    if (['inuse', 'deployed'].includes(expected)) return availability(tool, data) === 'Deployed';
    return normalize(tool.status) === expected;
  }
  async function snapshot() {
    if (window.MCPAAuth && !window.MCPAPermissions.fullInventory(window.MCPAAuth.profile?.role)) {
      await window.MovementStore.refresh();
      const data=window.MovementStore.getState();
      return {tools:data.tools,sites:data.sites,activeProjects:data.sites.filter(s=>s.is_active!==false)};
    }
    if(window.MCPAAuth) window.MCPAAuth.requireLive();
    const [equipment, sites, activeProjects, profiles] = await Promise.all([
      readAll('equipment'), readAll('sites'),
      readAll('sites', query => query.eq('is_active', true)),
      readAll('profiles', query => query.select('id,name,role', {count:'exact'})).catch(() => [])
    ]);
    const names = new Map(sites.map(site => [site.id, site.name]));
    const holders = new Map(profiles.map(profile => [profile.id, profile.name]));
    return {
      sites, activeProjects,
      tools: equipment.map(item => ({...item, dbId: item.id, id: item.asset_id || item.id,
        qty: quantity(item), cat: item.category, siteId: item.site_id,
        site: names.get(item.site_id) || (item.site_id ? 'Unknown project' : 'Unassigned'),
        holder: holders.get(item.current_holder_id) || (item.current_holder_id ? 'Holder unavailable' : ''),
        status: String(item.status || '').toLowerCase().replace(/[\s_-]/g, '').replace(/^forrepair$/, 'repair')
      }))
    };
  }
  function watch(reload, onStatus = () => {}, {tables = ['equipment','sites']} = {}) {
    let disposed = false, timer, channel, running = false, pending = false;
    const run = async () => {
      if (disposed || document.hidden) return;
      if (running) { pending = true; return; }
      running = true;
      try { await reload(); if (!disposed) onStatus(''); }
      catch (error) { if (!disposed) onStatus('Unable to sync changes. Retrying automatically…', error); }
      finally {
        running = false;
        if (pending && !disposed) { pending = false; schedule(); }
      }
    };
    const schedule = () => { if (!disposed) { clearTimeout(timer); timer = setTimeout(run, 180); } };
    const visible = () => { if (!document.hidden) schedule(); };
    try {
      const db = client();
      if (typeof db.channel === 'function') {
        channel = db.channel('workspace-' + ++sequence);
        for (const table of new Set(tables)) channel.on('postgres_changes', {event: '*', schema: 'public', table}, visible);
        channel.subscribe(status => {
          if (disposed) return;
          // Realtime may be unavailable while authorized RPC reads still work.
          // Verify through the normal reader; report only actual sync failures.
          if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) visible();
        });
      }
    } catch (_) { visible(); }
    // Catch missed events after reconnect and installations without Realtime enabled.
    const interval = setInterval(visible, 30000);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    const dispose = () => {
      if (disposed) return;
      disposed = true; clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('pagehide', dispose);
      document.removeEventListener('visibilitychange', visible);
      if (channel) Promise.resolve(client().removeChannel(channel)).catch(() => {});
    };
    window.addEventListener('pagehide', dispose);
    return dispose;
  }
  window.EquipmentTracking = {client, readAll, snapshot, inventoryOffice, quantity, requestability, statusMarkup, availability, matchesStatus, tally, watch};
})();
