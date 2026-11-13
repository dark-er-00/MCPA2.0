/* Shared presentation rules for Projects and the dashboard. RLS remains authoritative. */
(function () {
  'use strict';
  const active = (site, demo = false) => !site.archived_at && (demo ? site.is_active !== false : site.is_active === true);
  const assigned = (site, user, demo = false) => {
    if (site.assigned_engineer_id) return Boolean(user?.id) && site.assigned_engineer_id === user.id;
    return user?.role !== 'engineer' && demo && Boolean(user?.name) && (site.assigned_engineer || site.engineer) === user.name;
  };
  window.MCPAProjectScope = Object.freeze({
    active, assigned,
    // Scope the entire Engineer response before statistics, search or details.
    // Custody grants equipment visibility, never project access.
    projectSnapshot(data, user, {officeId = data.officeId} = {}) {
      if (user?.role !== 'engineer') return data;
      const sites = (data.sites || []).filter(site => site.id && site.id !== officeId && assigned(site,user));
      const ids = new Set(sites.map(site => site.id));
      return {...data,sites,
        tools:(data.tools || []).filter(tool => ids.has(tool.siteId ?? tool.site_id)),
        history:(data.history || []).filter(item => ids.has(item.project_id))};
    },
    // Engineer Inventory is narrower than the equipment request catalog.
    // Location, custody and assignment IDs are authoritative; labels never grant access.
    engineerInventory(data, user, {demo = false, eligible = () => false} = {}) {
      const officeId = typeof data.officeId === 'string' ? data.officeId : '';
      const sites = (data.sites || []).filter(site => site.id && site.id !== officeId && active(site,demo) && assigned(site,user,demo));
      const projectIds = new Set(sites.map(site => site.id));
      const tools = (data.tools || []).filter(tool => {
        const holderId = tool.holderId ?? tool.current_holder_id;
        const siteId = tool.siteId ?? tool.site_id;
        const own = Boolean(user?.id) && holderId === user.id;
        const demoOwn = user?.role !== 'engineer' && demo && !holderId && Boolean(user?.name) && tool.holder === user.name;
        return own || demoOwn || Boolean(officeId && siteId !== officeId && projectIds.has(siteId) && !holderId && eligible(tool));
      });
      return {...data,tools,sites};
    },
    projects(sites, user, demo = false) {
      const personal = ['engineer', 'architect'].includes(user?.role);
      return (sites || []).filter(site => active(site, demo) && (!personal || assigned(site, user, demo)));
    }
  });
})();
