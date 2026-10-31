/* Shared presentation rules for Projects and the dashboard. RLS remains authoritative. */
(function () {
  'use strict';
  const active = (site, demo = false) => !site.archived_at && (demo ? site.is_active !== false : site.is_active === true);
  const assigned = (site, user, demo = false) => {
    if (site.assigned_engineer_id) return Boolean(user?.id) && site.assigned_engineer_id === user.id;
    return demo && Boolean(user?.name) && (site.assigned_engineer || site.engineer) === user.name;
  };
  window.MCPAProjectScope = Object.freeze({
    active, assigned,
    projects(sites, user, demo = false) {
      const personal = ['engineer', 'architect'].includes(user?.role);
      return (sites || []).filter(site => active(site, demo) && (!personal || assigned(site, user, demo)));
    }
  });
})();
