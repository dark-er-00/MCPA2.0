/* Shared presentation rules for Projects and the dashboard. RLS remains authoritative. */
(function () {
  'use strict';
  const active = site => !site.archived_at && site.is_active === true;
  const assigned = (site, user) => Boolean(site.assigned_engineer_id && user?.id && site.assigned_engineer_id === user.id);
  window.MCPAProjectScope = Object.freeze({
    active, assigned,
    // Scope the entire Engineer response before statistics, search or details.
    // Custody grants equipment visibility, never project access.
    projectSnapshot(data, user, {officeId = data.officeId} = {}) {
      if (!window.MCPAPermissions.operational(user?.role)) return data;
      const sites = (data.sites || []).filter(site => site.id && site.id !== officeId && active(site) && assigned(site,user));
      const ids = new Set(sites.map(site => site.id));
      return {...data,sites,
        tools:(data.tools || []).filter(tool => {
          const siteId = tool.siteId ?? tool.site_id;
          const holderId = tool.holderId ?? tool.current_holder_id;
          return ids.has(siteId) && Boolean(user?.id) && holderId === user.id;
        }),
        history:(data.history || []).filter(item => ids.has(item.project_id))};
    },
    // Engineer Inventory only shows equipment in the user's confirmed custody
    // at their active, non-Office assigned projects. Office stock is requested in Requests.
    engineerInventory(data, user) {
      const officeId = typeof data.officeId === 'string' ? data.officeId : '';
      const sites = (data.sites || []).filter(site => site.id && site.id !== officeId && active(site) && assigned(site,user));
      const projectIds = new Set(sites.map(site => site.id));
      const tools = (data.tools || []).filter(tool => {
        const holderId = tool.holderId ?? tool.current_holder_id;
        const siteId = tool.siteId ?? tool.site_id;
        const own = Boolean(user?.id) && holderId === user.id;
        return Boolean(officeId && siteId && siteId !== officeId && projectIds.has(siteId) && own);
      });
      return {...data,tools,sites};
    },
    projects(sites, user) {
      const personal = window.MCPAPermissions.operational(user?.role);
      return (sites || []).filter(site => active(site) && (!personal || assigned(site, user)));
    }
  });
})();
