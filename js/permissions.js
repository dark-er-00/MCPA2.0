/* UI permissions mirror the database migration. Database policies remain authoritative. */
(function () {
  'use strict';
  const operational = ['engineer', 'architect'];
  const monitoring = ['admin', 'tool_handler'];
  const routes = {
    admin: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','consumables','purchase','reports','activity','users','settings'],
    engineer: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','activity','settings'],
    architect: ['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','activity','settings'],
    secretary: ['consumables','purchase','settings'],
    tool_handler: ['dashboard','masterlist','tool-profile','sites','site-detail','transfer','return','repair','missing','activity','settings']
  };
  const actions = {
    admin: ['approveRequest','rejectRequest','releaseRequest','startRepair','completeRepair','recoverMissing'],
    engineer: ['createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing','withdrawRequest','cancelReservation','cancelTransfer','refuseTransfer','reopenTransfer'],
    architect: ['createRequest','createTransfer','receiveTransfer','createReturn','reportRepair','reportMissing','withdrawRequest','cancelReservation','cancelTransfer','refuseTransfer','reopenTransfer'],
    secretary: [], tool_handler: ['createTransfer']
  };
  routes.admin.push('quantity-request','outward-materials','asset-retirement-v2');
  for(const role of operational)routes[role].push('quantity-request','outward-materials','asset-transfer','transfer-inbox','retired-equipment-v2');
  window.MCPAPermissions = Object.freeze({
    labels: window.MCPADisplay.roles,
    route: (role, route) => !!routes[role]?.includes(route),
    action: (role, action) => !!actions[role]?.includes(action),
    movementAction(role, action, record, actor, mode, snapshot) {
      if (!record || !actions[role]?.includes(action)) return false;
      // These live eligibility hints are projected by the authenticated RPC.
      // The write gateway independently rechecks ownership and current state.
      if (mode === 'live') return !!record.allowedActions?.includes(action);
      const ownRequest = item => item?.requester === actor.name;
      const sender = record.sender === actor.name;
      const linked = snapshot?.requests?.find(item => item.id === record.requestId && item.status === 'released' && item.transferId === record.id);
      const senderRole = record.senderRole || snapshot?.users?.find(item => item.name === record.sender)?.role;
      if (action === 'withdrawRequest') return record.status === 'pending' && ownRequest(record);
      if (action === 'cancelReservation') return record.status === 'approved' && !record.transferId && ownRequest(record);
      if (action === 'cancelTransfer') return ['pending','refused'].includes(record.status) && (sender || ownRequest(linked));
      if (action === 'refuseTransfer') return record.status === 'pending' && record.receiver === actor.name && (operational.includes(senderRole) || ownRequest(linked));
      if (action === 'reopenTransfer') return record.status === 'refused' && sender;
      return false;
    },
    operational: role => operational.includes(role),
    fullInventory: role => monitoring.includes(role),
    home: role => role === 'secretary' ? 'consumables' : 'dashboard'
  });
})();
