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
    async readEngineerInventory(client, user) {
      const missing = error => ['PGRST202','42883'].includes(error?.code);
      const response = await client.rpc('mcpa_engineer_equipment_snapshot');
      let snapshot = response.data;
      if (missing(response.error)) {
        const [personal, projects, office] = await Promise.all([
          client.rpc('mcpa_personal_equipment_snapshot'), client.rpc('mcpa_project_snapshot'), client.rpc('mcpa_inventory_office')
        ]);
        const results = [personal, projects, office];
        for (const result of results) if (result.error && !missing(result.error)) throw result.error;
        const catalog = results.some(result => result.error) ? await window.MovementStore.refresh() : null;
        snapshot = {...(personal.error ? catalog : personal.data), sites: projects.error ? catalog.sites : projects.data?.sites,
          officeId: office.data?.id || catalog?.officeId, engineerInventoryVersion: 2};
      } else if (response.error) throw response.error;
      if (snapshot?.engineerInventoryVersion !== 2 || typeof snapshot.officeId !== 'string' || !snapshot.officeId
          || !Array.isArray(snapshot.tools) || !Array.isArray(snapshot.sites)) {
        throw new Error('Inventory authorization could not be verified. Contact your administrator.');
      }
      return this.engineerInventory(snapshot, user);
    },
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
        return Boolean(officeId && siteId && siteId !== officeId && projectIds.has(siteId) && own && !tool.retirementDisposition);
      });
      return {...data,tools,sites};
    },
    projects(sites, user, demo = false) {
      const personal = window.MCPAPermissions.operational(user?.role);
      return (sites || []).filter(site => active(site, demo) && (!personal || assigned(site, user, demo)));
    }
  });
})();
