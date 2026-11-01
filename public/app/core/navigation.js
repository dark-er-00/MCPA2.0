/* ============================================================
   NAVIGATION CONFIG
   ============================================================ */
/* ============================================================
   NAVIGATION CONFIG
   ============================================================ */
// 1. The full menu for Admins
const ADMIN_NAV = [
  {sec:"Overview"},
  {id:"dashboard", label:"Dashboard", icon:"grid"},
  {sec:"Assets"},
  {id:"masterlist", label:"Equipment Tracking", icon:"list"},
  {id:"sites", label:"Projects", icon:"map"},
  
  {sec:"Movement"},
  {id:"request", label:"Equipment Requests", icon:"inbox"},
  {id:"transfer", label:"Transfers", icon:"swap"},
  {id:"return", label:"Returns", icon:"undo"},
  {id:"asset-retirement-v2", label:"Asset retirement", icon:"list"},
  {id:"repair", label:"Repairs", icon:"wrench"},
  {id:"missing", label:"Missing", icon:"alert"},
  {sec:"Materials"},
  {id:"consumables", label:"Consumables", icon:"box"},
  {id:"outward-materials", label:"Material issuance & usage", icon:"box"},
  {sec:"Records"},
  {id:"purchase", label:"Purchases", icon:"cart"},
  {id:"reports", label:"Reports", icon:"chart"},
  {id:"activity", label:"Activity Logs", icon:"clock"},
  {sec:"System"},
  {id:"users", label:"People & Accountability", icon:"users"},
  {id:"settings", label:"Settings", icon:"cog"},
];

// 2. The restricted menu for Engineers (Customize this as needed!)
const ENGR_NAV = [
  {sec:"Overview"},
  {id:"dashboard", label:"Dashboard", icon:"grid"},
  {sec:"Assets"},
  {id:"masterlist", label:"Equipment Tracking", icon:"list"},
  {id:"sites", label:"Projects", icon:"map"},
  
  {sec:"Movement"},
  {id:"request", label:"Equipment Requests", icon:"inbox"},
  {id:"asset-transfer", label:"Scan & transfer equipment", icon:"swap"},
  {id:"transfer-inbox", label:"Accept equipment", icon:"inbox"},
  {id:"transfer", label:"Transfers", icon:"swap"},
  {id:"return", label:"Returns", icon:"undo"},
  {id:"repair", label:"Repairs", icon:"wrench"},
  {id:"missing", label:"Missing", icon:"alert"},
  {sec:"Materials"},
  {id:"outward-materials", label:"Consumables", icon:"box"},
  {id:"retired-equipment-v2", label:"Sold & disposed history", icon:"list"},
  {sec:"Records"},
  {id:"activity", label:"Activity Logs", icon:"clock"},
  {id:"settings", label:"Settings", icon:"cog"},
  // Notice that Records, Purchases, Reports, and System sections are removed here
];

function buildNav(){
  const el = document.getElementById('nav-list');
  
  const role = window.MCPAAuth?.profile?.role;
  const source = MCPAPermissions.operational(role) ? ENGR_NAV : ADMIN_NAV;
  const liveOnly=['quantity-request','outward-materials','asset-transfer','transfer-inbox','asset-retirement-v2','retired-equipment-v2'];
  const currentNav = source.filter(n => !n.id || window.MCPAAuth.canRoute(n.id)).filter(n=>!window.MCPAAuth.isDemo||!liveOnly.includes(n.id)).filter((n,index,list) => n.id || list[index+1]?.id);
  el.innerHTML = currentNav.map(n=>{
    if(n.sec) return `<div class="nav-section-label">${n.sec}</div>`;
    return `<button type="button" class="nav-item" data-target="${n.id}" onclick="showScreen('${n.id}')">${icon(n.icon)}<span>${n.label}</span></button>`;
  }).join('');
}

function setActiveNav(id){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.target===id));
}

/* ============================================================
   SCREEN SWITCHING
   Loads the owning module (see js/app.js) if it isn't already
   in the DOM, then activates the requested screen within it.
   ============================================================ */
// Existing activity already carries an action and stable entityId. Resolve its
// record type from the snapshot, never from human-readable notification text.
window.MCPAMovementLinks = {
  collections: {request:'requests', transfer:'transfers', return:'returns', repair:'repairs', missing:'missing'},
  href(event, snapshot) {
    if (typeof event.entityId !== 'string' || !event.entityId || event.entityId.length > 120) return '';
    const known = Object.entries(this.collections).find(([,collection]) => snapshot[collection]?.some(record => record.id === event.entityId));
    const actions = {
      createRequest:'request', approveRequest:'request', rejectRequest:'request',
      withdrawRequest:'request', cancelReservation:'request', cancelTransfer:'transfer', refuseTransfer:'transfer', reopenTransfer:'transfer',
      releaseRequest:'transfer', createTransfer:'transfer', receiveTransfer:'transfer',
      createReturn:'return', reportRepair:'repair', startRepair:'repair', completeRepair:'repair',
      reportMissing:'missing', recoverMissing:'missing',
      request_created:'request', request_approved:'request', request_rejected:'request',
      request_withdrawn:'request', reservation_canceled:'request', transfer_canceled:'transfer', transfer_refused:'transfer', transfer_reopened:'transfer',
      transfer_created:'transfer', transfer_received:'transfer', return_created:'return',
      repair_reported:'repair', repair_started:'repair', repair_completed:'repair',
      missing_reported:'missing', missing_recovered:'missing'
    };
    const kind = known?.[0] || (Object.hasOwn(actions, event.action) ? actions[event.action] : '');
    return kind ? '#' + kind + '?record=' + encodeURIComponent(event.entityId) : '';
  },
  parse(value) {
    const [screen, query = ''] = String(value).replace(/^#/, '').split('?');
    const params = new URLSearchParams(query), record = params.get('record');
    const result = {screen, record: (Object.hasOwn(this.collections, screen) || ['masterlist','tool-profile','site-detail','activity','purchase','consumables','reports','asset-retirement-v2','quantity-request','transfer-inbox','outward-materials'].includes(screen)) && record && record.length <= 120 ? record : ''};
    if (screen === 'site-detail' && params.get('tool')?.length <= 120) result.tool = params.get('tool');
    if (screen === 'transfer' && ['send','receive','history'].includes(params.get('view'))) result.view = params.get('view');
    if (screen === 'masterlist' && ['all','available','inuse','repair','missing','sold','disposed'].includes(params.get('status'))) result.status = params.get('status');
    return result;
  }
};

function showScreen(route, afterActivate, options){
  const {screen:id, record, tool, view, status} = window.MCPAMovementLinks.parse(route);
  if (!window.MCPAAuth?.profile) return;
  const params = new URLSearchParams();
  if (record) params.set('record', record);
  if (tool) params.set('tool', tool);
  if (view) params.set('view', view);
  if (status) params.set('status', status);
  const normalized = id + (params.size ? '?' + params.toString().replaceAll('+', '%20') : '');
  const navigation = window.MCPANavigation;
  const ticket = navigation?.begin(normalized, options);
  if (!window.MCPAAuth.canRoute(id)) {
    resetApplication({keepMonitoring: true}); MCPAAuth.deny();
    if (ticket) void navigation.activate(ticket, document.getElementById('content'), () => {});
    return;
  }
  window.MovementUI?.cancelTarget();
  window.MCPAProjects?.cancelTarget?.();
  if(!options?.keepSearch) window.closeMobileSearch?.(false);
  window.MCPADrawer?.close(false);
  loadModule(id, function(){
    if (ticket && !navigation.isCurrent(ticket)) return;
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const target = document.getElementById('screen-'+id) || (id === 'tool-profile' ? document.getElementById('screen-masterlist') : null);
    if(target) target.classList.add('active');
    document.getElementById('sidebar')?.classList.remove('open');
    setActiveNav(id === 'site-detail' ? 'sites' : id === 'tool-profile' ? 'masterlist' : id === 'quantity-request' ? 'request' : id);
    const open = async () => {
      if(afterActivate) await afterActivate();
      if (ticket && !navigation.isCurrent(ticket)) return;
      if (view) await window.MovementUI?.showTransferView(view);
      // activate waits for the module's registered data-loading promise.
      if (id === 'masterlist' && status && window.MCPAAuth.profile.role === 'admin') {
        if (window.AdminEquipment && !window.AdminEquipment.disposed) window.AdminEquipment.setStatus(status);
        else window.MovementOverview?.setStatus?.(status);
      }
      if (id === 'site-detail') await window.MCPAProjects?.openRecord(record, tool);
      else if (record && ['masterlist','tool-profile'].includes(id)) {
        if (window.AdminEquipment && !window.AdminEquipment.disposed) window.AdminEquipment.openRecord(record);
        else window.MovementOverview?.openRecord(record);
      } else if (record && id === 'purchase') await window.MCPAPurchases?.openRecord(record);
      else if (record && id === 'consumables') await window.MCPAConsumables?.openRecord(record);
      else if (record && id === 'reports') window.MCPAReports?.openRecord(record);
      else if (record && id === 'activity') window.MovementOverview?.openActivity(record);
      else if(record&&!window.MCPAIntegration?.handles(id)) await window.MovementUI?.openRecord(id, record);
      else {
        if(!window.MCPAIntegration?.handles(id)) window.MovementUI?.clearRecord?.();
        if (id === 'activity') window.MovementOverview?.clearRecord?.();
        if (id === 'purchase') window.MCPAPurchases?.clearRecord?.();
        if (id === 'consumables') window.MCPAConsumables?.clearRecord?.();
        if (id === 'masterlist') window.MovementOverview?.clearRecord?.();
        if (id === 'masterlist' && window.AdminEquipment && !window.AdminEquipment.disposed) showMasterlistView('masterlist');
        if (id === 'sites') document.getElementById('sites-dialog')?.close();
      }
    };
    if (ticket) void navigation.activate(ticket, target, open);
    else void open();
  }, route);
}

