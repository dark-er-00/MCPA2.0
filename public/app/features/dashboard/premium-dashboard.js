/* MCPA2.0 Premium Enterprise Dashboard V2
 * Presentation-only upgrade over the accepted MCPA2.0 data contracts.
 * Preserves all existing permissions, RPC/fixture readers, and delegated DOM events.
 */
(function () {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const units = (tools, assetsOnly = false) =>
    tools.reduce((sum, t) => sum + (assetsOnly ? Number(window.EquipmentTracking.quantity(t) > 0) : window.EquipmentTracking.quantity(t)), 0);

  const glyph = name => (typeof icon === 'function' ? icon(name).replace('<svg ', '<svg aria-hidden="true" ') : '');

  const go = (text, target, extraClass = '') =>
    `<button type="button" class="btn btn-secondary btn-sm ${extraClass}" data-go="${target}">${text}</button>`;

  const panel = (title, body, extra = '', cls = '', subtitle = '') =>
    `<section class="command-panel ${cls}"><div class="command-panel-head"><div class="v2-panel-title-wrap"><h2>${title}</h2>${subtitle ? `<span class="v2-panel-subtitle">${subtitle}</span>` : ''}</div>${extra ? `<div class="v2-panel-actions">${extra}</div>` : ''}</div>${body}</section>`;

  const empty = text => `<div class="command-empty" role="status"><p>${text}</p></div>`;

  const isOfficeSite = (site, data) => {
    if (!site) return false;
    if (data?.officeId && site.id) return site.id === data.officeId;
    return String(site.name || '').trim().toLowerCase() === 'office';
  };

  const activeSites = (data, user) =>
    window.MCPAProjectScope.projects(data.activeProjects || data.sites, user, window.MCPAAuth?.isDemo === true);

  // Distinguish active construction projects from the central Office warehouse.
  const activeConstructionProjects = (data, user) =>
    activeSites(data, user).filter(site => !isOfficeSite(site, data));

  const isOwnCustody = (t, user) => {
    const holderId = t.holderId ?? t.current_holder_id;
    if (holderId) return Boolean(user?.id) && holderId === user.id;
    return window.MCPAAuth?.isDemo === true &&
      Boolean(user?.name) && t.holder === user.name;
  };

  const scoped = (data, user) =>
    (data.tools || []).filter(t =>
      window.EquipmentTracking.quantity(t) > 0 &&
      (['admin', 'tool_handler'].includes(user.role) || isOwnCustody(t, user))
    );

  // Main's authenticated movement snapshot supplies the records. Keep its
  // confirmed-custody scope; do not import the prototype's broader stock policy.
  const dashboardInventory = (data, user) => scoped(data, user);

  // IDs are authoritative. A legacy name is used only when no location ID exists.
  function location(tool, data) {
    const id = tool.siteId ?? tool.site_id;
    const sites = data.sites || [];
    if (id) {
      const site = sites.find(candidate => candidate.id === id);
      return { key: String(id), name: site?.name || tool.site || 'Unknown location',
        isOffice: isOfficeSite(site || { id }, data), known: Boolean(site) };
    }
    const name = String(tool.site || '').trim();
    return !name || name === 'Unassigned'
      ? { key: '__unassigned', name: 'Unassigned', isOffice: false, known: false }
      : { key: '__location_name:' + name, name, isOffice: false, known: false };
  }

  function locationRows(data, tools, assetsOnly) {
    const rows = new Map();
    for (const tool of tools) {
      const place = location(tool, data);
      if (!rows.has(place.key)) rows.set(place.key, { ...place, count: 0 });
      rows.get(place.key).count += units([tool], assetsOnly);
    }
    return [...rows.values()].filter(row => row.count > 0)
      .sort((a, b) => Number(a.isOffice) - Number(b.isOffice) || b.count - a.count);
  }

  const condition = t =>
    ['repair', 'underrepair'].includes(t.status) ? 'repair'
    : t.status === 'inuse' ? 'deployed'
    : t.status === 'inoffice' ? 'available'
    : ['available', 'missing'].includes(t.status) ? t.status
    : 'other';

  const match = (t, status, data) =>
    status === 'repair' ? condition(t) === 'repair' : window.EquipmentTracking.matchesStatus(t, status, data);

  const groups = [
    ['available', 'Available'],
    ['deployed', 'In Use'],
    ['repair', 'Repair / under repair'],
    ['missing', 'Missing'],
    ['other', 'Other / retired']
  ];

  const actionKey = action => ({
    createRequest: 'request_created',
    approveRequest: 'request_approved',
    rejectRequest: 'request_rejected',
    releaseRequest: 'transfer_created',
    createTransfer: 'transfer_created',
    receiveTransfer: 'transfer_received',
    createReturn: 'return_created',
    reportRepair: 'repair_reported',
    startRepair: 'repair_started',
    completeRepair: 'repair_completed',
    reportMissing: 'missing_reported',
    recoverMissing: 'missing_recovered'
  }[window.MCPADisplay.actionKey(action)] || '');

  // Miniature 5-column segmented vertical bar indicator for KPI cards (inspired by reference screenshot)
  // Driven strictly by actual current ratio (value / max), never random or historical.
  function kpiMiniBars(value, total, tone = 'amber') {
    const safeTotal = Math.max(1, total || 1);
    const ratio = Math.max(0, Math.min(1, value / safeTotal));
    const heights = [0.42, 0.64, 0.52, 0.82, 1.0];
    const activeCols = value === 0 ? 0 : Math.max(1, Math.round(ratio * 5));
    const cols = heights.map((h, idx) => {
      const x = idx * 8;
      const segments = 5;
      const activeSegs = idx < activeCols ? Math.max(1, Math.round(h * segments)) : 0;
      const rects = [];
      for (let s = 0; s < segments; s++) {
        const y = 30 - (s + 1) * 5.5;
        const filled = s < activeSegs;
        rects.push(`<rect x="${x}" y="${y.toFixed(1)}" width="5" height="4" rx="0.8" class="${filled ? `v2-bar-seg is-filled tone-${tone}` : 'v2-bar-seg'}"/>`);
      }
      return rects.join('');
    }).join('');
    return `<svg class="v2-kpi-viz" viewBox="0 0 38 30" width="38" height="30" aria-hidden="true">${cols}</svg>`;
  }

  function consumablesCard(summary) {
    const count = summary?.count;
    return `<button type="button" class="card kpi consumables-shortcut" data-go="consumables"><span class="command-kpi-copy"><span class="lbl">Consumables</span><span class="kpi-description">View stock, requests, and restocking</span>${Number.isInteger(count) && count > 0 ? `<span class="consumables-warning">${count} item${count === 1 ? '' : 's'} low stock</span>` : summary?.error ? '<span class="kpi-description">Stock status unavailable</span>' : ''}</span></button>`;
  }

  // Chart 1: Equipment Status — Filled Pie Chart with Hatch/Stripe Patterns (No Donut, Minimal Legend)
  function statusChart(tools, assetsOnly, state, data, user, extraStock = []) {
    const fieldRole = ['engineer', 'architect'].includes(user.role);
    const chartTools = fieldRole ? [...tools, ...extraStock] : tools;
    const total = units(chartTools, assetsOnly);

    const counts = groups.map(([key, label]) => ({
      key,
      filterKey: key === 'deployed' ? 'inuse' : key,
      label: key === 'deployed' ? window.MCPADisplay.status('inuse') : label,
      count: units(chartTools.filter(t => condition(t) === key), assetsOnly)
    }));

    const cx = 68;
    const cy = 68;
    const r = 58;
    let startAngle = -Math.PI * 0.82;
    const targets = [];

    const slices = total > 0
      ? counts.map(g => {
          if (g.count <= 0) return '';
          const frac = g.count / total;
          const sliceAngle = frac * Math.PI * 2;
          const midAngle = startAngle + sliceAngle / 2;
          const motion = `data-pie-visual="${g.key}" style="--pie-x:${(6 * Math.cos(midAngle)).toFixed(3)}px;--pie-y:${(6 * Math.sin(midAngle)).toFixed(3)}px"`;
          const target = `class="v2-pie-hit" data-pie-hit="${g.key}" data-pie-angle="${midAngle}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(g.label)}: ${g.count} of ${total} ${assetsOnly ? 'assets' : 'units'}" fill="transparent"`;
          if (frac >= 0.9999) {
            targets.push(`<circle ${target} cx="${cx}" cy="${cy}" r="${r}"/>`);
            return `<circle class="v2-pie-slice tone-${g.key}" ${motion} cx="${cx}" cy="${cy}" r="${r}" fill="url(#pie-pat-${g.key})" stroke="var(--surface)" stroke-width="1.5"/>`;
          }
          const endAngle = startAngle + sliceAngle;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const largeArc = sliceAngle > Math.PI ? 1 : 0;
          startAngle = endAngle;
          const shape = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
          targets.push(`<path ${target} d="${shape}"/>`);
          return `<path class="v2-pie-slice tone-${g.key}" ${motion} d="${shape}" fill="url(#pie-pat-${g.key})" stroke="var(--surface)" stroke-width="1.5"/>`;
        }).join('')
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--surface-elevated)" stroke="var(--border)" stroke-width="1.5"/>`;

    const visibleCounts = counts.filter(g => g.key !== 'other' || g.count > 0);
    const legendItems = visibleCounts.map(g => {
      const isSelected = state?.status && (state.status === g.filterKey || (state.status === 'inuse' && g.key === 'deployed'));
      return `<li>
        <button type="button" class="v2-legend-row ${isSelected ? 'is-active' : ''}" data-status="${isSelected ? '' : g.filterKey}" aria-pressed="${isSelected ? 'true' : 'false'}" title="Filter inventory by ${esc(g.label)}">
          <i class="legend-dot tone-${g.key}"></i>
          <span class="v2-legend-label">${esc(g.label)}</span>
          <strong>${g.count}</strong>
        </button>
      </li>`;
    }).join('');

    return panel(
      'Equipment status',
      `<div class="status-chart v2-status-layout">
        <div class="status-ring v2-filled-pie">
          <svg viewBox="0 0 136 136" data-pie-chart role="group" aria-label="Equipment status breakdown: ${total} total ${assetsOnly ? 'assets' : 'units'}">
            <defs>
              <pattern id="pie-pat-available" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(42)">
                <rect width="5" height="5" class="v2-pat-bg tone-available"/>
                <line x1="0" y1="0" x2="0" y2="5" class="v2-pat-line tone-available" stroke-width="2.6"/>
              </pattern>
              <pattern id="pie-pat-deployed" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
                <rect width="5" height="5" class="v2-pat-bg tone-deployed"/>
                <line x1="0" y1="0" x2="0" y2="5" class="v2-pat-line tone-deployed" stroke-width="2.6"/>
              </pattern>
              <pattern id="pie-pat-repair" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(72)">
                <rect width="5" height="5" class="v2-pat-bg tone-repair"/>
                <line x1="0" y1="0" x2="0" y2="5" class="v2-pat-line tone-repair" stroke-width="2.6"/>
              </pattern>
              <pattern id="pie-pat-missing" width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" class="v2-pat-bg tone-missing"/>
                <path d="M 0 3 H 6 M 3 0 V 6" class="v2-pat-line tone-missing" stroke-width="1.6" fill="none"/>
              </pattern>
              <pattern id="pie-pat-other" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                <rect width="5" height="5" class="v2-pat-bg tone-other"/>
                <line x1="0" y1="0" x2="0" y2="5" class="v2-pat-line tone-other" stroke-width="2.4"/>
              </pattern>
            </defs>
            <g aria-hidden="true" pointer-events="none">${slices}</g>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="1" pointer-events="none"/>
            <g class="v2-pie-targets">${targets.join('')}</g>
          </svg>
        </div>
        <ul class="chart-legend v2-tabular-legend" aria-label="Status distribution">${legendItems}</ul>
      </div>
      <p class="panel-note">${fieldRole ? 'Confirmed custody' : 'Recorded condition · requestability shown below'}</p>`,
      '',
      'v2-panel-status',
      ''
    );
  }

  // Chart 2: Equipment by Project / Site — Clean Horizontal Comparison Bars
  function siteChart(data, user, assetsOnly, state) {
    const fieldRole = ['engineer', 'architect'].includes(user.role);
    const chartTools = dashboardInventory(data, user);
    const rows = locationRows(data, chartTools, assetsOnly);
    const total = units(chartTools, assetsOnly);

    const max = Math.max(1, ...rows.map(r => r.count));

    const barsMarkup = rows.length
      ? `<div class="site-bars v2-site-bars" role="list" aria-label="Equipment counts by location">${rows.map(r => {
          const barW = r.count > 0 ? Math.max(8, Math.round((r.count / max) * 100)) : 0;
          const activeSite = state?.site === r.key;
          return `<div class="site-bar v2-site-row ${activeSite ? 'is-selected' : ''}" role="listitem" data-site-filter="${esc(r.key)}" data-site-kind="${r.isOffice ? 'office' : fieldRole && !activeConstructionProjects(data, user).some(p => p.id === r.key) ? 'custody' : r.known ? 'project' : 'unassigned'}" tabindex="0" title="Filter inventory by ${esc(r.name)}">
            <span class="v2-site-name" title="${esc(r.name)}">${esc(r.name)}</span>
            <div class="bar-track v2-simple-track" aria-hidden="true">
              <span class="bar-fill" style="width:${barW}%"></span>
            </div>
            <div class="v2-site-numbers"><strong>${r.count}</strong></div>
          </div>`;
        }).join('')}</div>`
      : empty('No authorized project locations to display.');

    return panel(
      'Equipment by project / site',
      `${barsMarkup}<p class="panel-note">${total} ${assetsOnly ? 'assets · custody + site stock' : 'units · all locations'}</p>`,
      `<button type="button" class="v2-link-btn" data-go="sites">All projects</button>`,
      'v2-panel-sites',
      ''
    );
  }

  // Active series filter for the 7-day movement chart
  let activeMovementSeries = 'all';

  // Chart 3: Recorded Asset Movement (7-Day Segmented Column Chart)
  function movementChart(data) {
    const dayKey = d => new Date(new Date(d).getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const today = dayKey(Date.now());
    const days = Array.from({ length: 7 }, (_, i) =>
      new Date(Date.parse(today + 'T00:00:00Z') - (6 - i) * 86400000).toISOString().slice(0, 10)
    );

    const allSeries = [
      ['request_created', 'Requests', 'deployed'],
      ['transfer_created', 'Releases', 'other'],
      ['transfer_received', 'Receipts', 'available'],
      ['return_created', 'Returns', 'repair']
    ];

    const values = allSeries.map(([key]) =>
      days.map(day =>
        (data.activity || []).filter(r =>
          actionKey(r.action) === key &&
          Number.isFinite(Date.parse(r.createdAt)) &&
          dayKey(r.createdAt) === day
        ).length
      )
    );

    const seriesTotals = values.map(arr => arr.reduce((a, b) => a + b, 0));
    const grandTotal = seriesTotals.reduce((a, b) => a + b, 0);

    // Filter series if user selected a specific event type pill
    const activeIndices = activeMovementSeries === 'all'
      ? [0, 1, 2, 3]
      : [allSeries.findIndex(([k]) => k === activeMovementSeries)].filter(i => i >= 0);

    const dayTotals = days.map((_, dayIdx) =>
      activeIndices.reduce((sum, sIdx) => sum + values[sIdx][dayIdx], 0)
    );
    const maxDay = Math.max(2, ...dayTotals);

    // Build segmented vertical bar columns + polyline for compatibility and clarity
    const colWidth = 28;
    const plotTop = 14;
    const plotBottom = 86;
    const plotHeight = plotBottom - plotTop;

    const columnsSvg = days.map((day, j) => {
      const cx = 36 + j * 48;
      const x = cx - colWidth / 2;
      // Background segmented column slot (subtle architectural brick grid like Screenshot 3)
      const bgBricks = Array.from({ length: 6 }, (_, b) => {
        const by = plotBottom - (b + 1) * (plotHeight / 6) + 1.5;
        return `<rect x="${x}" y="${by.toFixed(1)}" width="${colWidth}" height="${(plotHeight / 6 - 2.5).toFixed(1)}" rx="1.5" class="v2-col-slot"/>`;
      }).join('');

      // Active stacked segments for recorded events on this day
      let currentY = plotBottom;
      const unitHeight = Math.min(24, plotHeight / maxDay);
      const activeRects = [];
      activeIndices.forEach(sIdx => {
        const [, label, tone] = allSeries[sIdx];
        const count = values[sIdx][j];
        for (let c = 0; c < count; c++) {
          const brickH = Math.max(8, unitHeight - 3);
          currentY -= unitHeight;
          activeRects.push(
            `<rect x="${x}" y="${currentY.toFixed(1)}" width="${colWidth}" height="${brickH.toFixed(1)}" rx="2" class="v2-col-brick tone-${tone}"><title>${esc(label)}: ${count} on ${day}</title></rect>`
          );
        }
      });

      const daySum = dayTotals[j];
      const badge = daySum > 0
        ? `<text x="${cx}" y="${Math.max(11, currentY - 4).toFixed(1)}" text-anchor="middle" class="v2-col-val">${daySum}</text>`
        : '';

      return `<g class="v2-day-col">${bgBricks}${activeRects.join('')}${badge}</g>`;
    }).join('');

    const polylinesSvg = activeIndices.map(sIdx => {
      const [, label, tone] = allSeries[sIdx];
      const v = values[sIdx];
      return `<polyline class="tone-${tone} v2-trend-line" fill="none" stroke="currentColor" stroke-width="1.75" points="${v.map((val, j) => `${36 + j * 48},${plotBottom - (val / maxDay) * plotHeight}`).join(' ')}"/>` +
        v.map((val, j) => val > 0 ? `<circle class="tone-${tone}" fill="currentColor" cx="${36 + j * 48}" cy="${plotBottom - (val / maxDay) * plotHeight}" r="3"><title>${esc(label)}: ${val} · ${days[j]}</title></circle>` : '').join('');
    }).join('');

    const filterPills = [
      ['all', 'All', grandTotal, 'all'],
      ...allSeries.map(([key, label, tone], idx) => [key, label, seriesTotals[idx], tone])
    ].map(([key, label, count, tone]) =>
      `<button type="button" class="v2-series-pill ${activeMovementSeries === key ? 'is-active' : ''}" data-series-filter="${key}" aria-pressed="${activeMovementSeries === key ? 'true' : 'false'}">
        ${tone !== 'all' ? `<i class="legend-dot tone-${tone}"></i>` : ''}
        <span>${esc(label)}</span>
        <strong>${count}</strong>
      </button>`
    ).join('');

    const chart = grandTotal
      ? `<svg class="movement-chart v2-movement-svg" viewBox="0 0 360 112" role="img" aria-label="Movement events over the last seven days; daily counts below">
          <path class="chart-grid" stroke-dasharray="2 3" d="M22 14H348M22 50H348M22 86H348"/>
          <text x="4" y="18">${maxDay}</text>
          <text x="4" y="54">${Math.round(maxDay / 2)}</text>
          <text x="4" y="89">0</text>
          ${columnsSvg}
          ${polylinesSvg}
          ${days.map((d, i) => `<text x="${36 + i * 48}" y="106" text-anchor="middle">${d.slice(5).replace('-', '/')}</text>`).join('')}
        </svg>
        <details class="chart-data">
          <summary>View daily counts (${grandTotal} recorded ${grandTotal === 1 ? 'event' : 'events'})</summary>
          <div class="table-wrap">
            <table>
              <caption>Events per day · Manila time</caption>
              <thead><tr><th>Date</th>${allSeries.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead>
              <tbody>${days.map((d, i) => `<tr><th>${d}</th>${values.map(v => `<td>${v[i]}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        </details>`
      : empty('No equipment movements recorded in this period.');

    return panel(
      'Asset movement',
      `<div class="movement-legend v2-series-toolbar" role="group" aria-label="Filter movement chart by event type">${filterPills}</div>
       ${chart}`,
      '',
      'v2-panel-movement',
      `${grandTotal} recorded ${grandTotal === 1 ? 'event' : 'events'} in window`
    );
  }

  function filters(data, tools, state, assetsOnly) {
    return `<div class="inventory-tabs" role="group" aria-label="Inventory status">${[
      ['', 'All equipment'],
      ['available', 'Available'],
      ['inuse', window.MCPADisplay.status('inuse')],
      ['repair', 'Repair'],
      ['missing', 'Missing']
    ].map(([key, label]) =>
      `<button type="button" data-status="${key}" aria-pressed="${state.status === key}" class="inventory-tab">${esc(label)} <span>${units(tools.filter(t => match(t, key, data)), assetsOnly)}</span></button>`
    ).join('')}</div>
    <div class="dashboard-filters">
      <input id="dashboard-search" data-search aria-label="Search inventory" placeholder="Search Inventory..." value="${esc(state.query)}">
      <select id="overview-site" aria-label="Filter inventory by project">
        <option value="">All locations</option>
        ${locationRows(data, tools, assetsOnly).map(row => `<option value="${esc(row.key)}" ${state.site === row.key ? 'selected' : ''}>${esc(row.name)}</option>`).join('')}
      </select>
      <select id="dashboard-condition" aria-label="Filter inventory by condition">
        <option value="">All conditions</option>
        ${groups.map(([key, label]) => `<option value="${key}" ${state.condition === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
    </div>`;
  }

  const inventoryPageSize = 5;
  let inventoryPage = 1, inventorySignature = '', inventoryContext;

  // Keep the accepted recorded-status badge. Expanded eligibility explanations
  // remain in the existing authorized Details screen, not in summary rows.
  function inventoryBadge(tool, data) {
    const template = document.createElement('template');
    template.innerHTML = window.EquipmentTracking.statusMarkup(tool, data, { compact: true });
    return template.content.querySelector('.badge').outerHTML;
  }

  function inventoryTable(tools, data) {
    if (!tools.length) return empty('No equipment matches your filters.');
    return `<div id="dashboard-inventory-table" class="table-wrap v2-current-inventory" role="region" aria-label="Current inventory table" tabindex="0"><table>
      <thead><tr>${['Equipment', 'Project', 'Holder', 'Status', 'Quantity', 'Actions'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${tools.map(tool => `<tr>
        <td data-label="Equipment"><div class="equipment-identity">${window.EquipmentVisual.thumbnail(tool)}<div><span class="tool-id-chip">${esc(tool.id)}</span><div class="cell-name">${esc(tool.name)}</div></div></div></td>
        <td data-label="Project">${esc(location(tool, data).name)}</td>
        <td data-label="Holder">${esc(tool.holder || '—')}</td>
        <td data-label="Status">${inventoryBadge(tool, data)}</td>
        <td data-label="Quantity">${esc(window.EquipmentTracking.quantity(tool))}</td>
        <td data-label="Actions"><button type="button" class="btn btn-secondary btn-sm" data-tool="${esc(tool.id)}" aria-label="Details for ${esc(tool.id)}">Details</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function inventory(data, user, state, table) {
    const signature = JSON.stringify([user.id, user.role, state.query || '', state.status || '', state.site || '', state.condition || '']);
    if (signature !== inventorySignature) inventoryPage = 1;
    inventorySignature = signature;
    inventoryContext = { data, user, state: { ...state }, table };
    const tools = dashboardInventory(data, user).filter(t =>
      match(t, state.status, data) &&
      (!state.condition || condition(t) === state.condition) &&
      (!state.site || location(t, data).key === state.site) &&
      [t.id, t.name, t.brand, t.site, t.holder, t.serial].join(' ').toLowerCase().includes((state.query || '').toLowerCase())
    ).map(tool => ({ tool, eligible: window.EquipmentTracking.requestability(tool, data).eligible }))
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || String(a.tool.id).localeCompare(String(b.tool.id), 'en', { numeric: true }))
      .map(item => item.tool);

    const pages = Math.max(1, Math.ceil(tools.length / inventoryPageSize));
    inventoryPage = Math.max(1, Math.min(inventoryPage, pages));
    const start = (inventoryPage - 1) * inventoryPageSize;
    const count = tools.length ? `${start + 1}–${Math.min(start + inventoryPageSize, tools.length)} of ${tools.length} equipment records` : 'No matching equipment';
    return `${inventoryTable(tools.slice(start, start + inventoryPageSize), data)}
      <div class="inventory-footer v2-inventory-pagination"><span role="status" aria-live="polite">${count}</span>
        <nav aria-label="Current inventory pages"><button id="inventory-previous" type="button" class="btn btn-secondary btn-sm" data-inventory-page="-1" ${inventoryPage === 1 ? 'disabled' : ''}>Previous</button><span id="inventory-page-status" tabindex="-1" aria-label="Page ${inventoryPage} of ${pages}">${inventoryPage} / ${pages}</span><button id="inventory-next" type="button" class="btn btn-secondary btn-sm" data-inventory-page="1" ${inventoryPage === pages ? 'disabled' : ''}>Next</button></nav>
      </div>`;
  }

  function review(data) {
    const items = [
      [(data.requests || []).filter(r => r.status === 'pending').length, 'Tool requests', 'request'],
      [(data.transfers || []).filter(t => t.status === 'pending').length, 'Transfers in progress', 'transfer'],
      [(data.repairs || []).filter(r => ['reported', 'underrepair'].includes(r.status)).length, 'Repair tickets', 'repair'],
      [(data.missing || []).filter(r => r.status === 'missing').length, 'Missing cases', 'missing']
    ];

    return '<div class="admin-review" aria-label="Needs review"><strong>Needs Review</strong>' +
      items.map(([count, label, target]) => go(`${label} <span>${count}</span>`, target)).join('') +
      '</div>';
  }

  const addressed = (record, user) =>
    window.MCPAAuth && !window.MCPAAuth.isDemo
      ? Boolean(user.id) && record.receiverId === user.id
      : Boolean(user.name) && (record.receiver === user.name || record.requester === user.name);

  const recordDate = record => record.updatedAt || record.createdAt || '';

  const recordLink = (label, kind, record, prefix) =>
    `<button type="button" class="btn btn-secondary btn-sm" id="dashboard-${prefix}-${esc(record.id)}" data-go="${kind}?record=${esc(encodeURIComponent(record.id))}">${label}</button>`;

  function turnover(data, user, when) {
    const pending = (data.transfers || [])
      .filter(record => record.status === 'pending' && addressed(record, user))
      .sort((a, b) => recordDate(b).localeCompare(recordDate(a)));

    const rows = pending.slice(0, 4).map(record => {
      const equipment = (record.toolIds || []).map(id => {
        const tool = (data.tools || []).find(item => item.id === id);
        return `<li><strong>${esc(tool?.name || 'Equipment')}</strong> <span class="tool-id-chip">${esc(id)}</span></li>`;
      }).join('');

      const origins = [...new Set((record.source || []).map(item => item.site).filter(Boolean))].join(', ') || 'Not recorded';

      return `<li class="dashboard-turnover" data-turnover-id="${esc(record.id)}">
        <div class="workflow-row-head">
          <strong>${esc(record.id)}</strong>
          <span class="badge badge-pending">Awaiting receipt</span>
        </div>
        <ul class="turnover-equipment">${equipment}</ul>
        <dl class="turnover-context">
          <div><dt>Request</dt><dd>${esc(record.requestId || 'Direct transfer')}</dd></div>
          <div><dt>From</dt><dd>${esc(origins)}</dd></div>
          <div><dt>Destination</dt><dd>${esc(record.destination || 'Not recorded')}</dd></div>
          <div><dt>Released</dt><dd>${esc(when(record.createdAt))}</dd></div>
        </dl>
        ${recordLink('View Turnover', 'transfer', record, 'turnover')}
      </li>`;
    }).join('');

    const body = pending.length
      ? `<ul class="workflow-list">${rows}</ul>`
      : empty('No equipment is currently awaiting your confirmation.');

    return panel(
      'Pending Equipment Turnover',
      body,
      '<button type="button" class="btn btn-secondary btn-sm" data-turnover-inbox>Receive Transfer</button>',
      'dashboard-turnovers',
      ''
    );
  }

  function requestsOverview(data, user) {
    const requestLabels = window.MCPADisplay.statuses.request;
    const records = (data.requests || [])
      .filter(record => addressed(record, user))
      .sort((a, b) => recordDate(b).localeCompare(recordDate(a)));

    const summary = Object.entries(requestLabels)
      .filter(([status]) => records.some(record => record.status === status))
      .map(([status, label]) => `<span>${esc(label)}: <strong>${records.filter(record => record.status === status).length}</strong></span>`)
      .join('');

    const rows = records.slice(0, 4).map(record =>
      `<li class="dashboard-request" data-request-id="${esc(record.id)}">
        <div class="workflow-row-head">
          <strong>${esc(record.id)}</strong>
          <span class="badge badge-${record.status === 'rejected' ? 'discrepancy' : record.status === 'received' ? 'verified' : 'pending'}">${esc(window.MCPADisplay.status(record.status, 'request'))}</span>
        </div>
        <p>${esc(record.destination || 'Destination not recorded')} · ${(record.toolIds || []).length} equipment record${(record.toolIds || []).length === 1 ? '' : 's'}</p>
        ${recordLink('View request', 'request', record, 'request')}
      </li>`
    ).join('');

    return panel(
      'My Requests',
      records.length
        ? `<div class="request-phase-summary" aria-label="Request statuses">${summary}</div><ul class="workflow-list">${rows}</ul>`
        : empty('No equipment requests yet.'),
      `<button type="button" class="v2-link-btn" data-go="request">All requests</button>`,
      'dashboard-requests',
      ''
    );
  }

  function render(data, user, state, header, table, when) {
    const display = window.MCPADisplay;
    const fieldRole = ['engineer', 'architect'].includes(user.role);
    const assetsOnly = fieldRole;
    const admin = ['admin', 'tool_handler'].includes(user.role);

    const tools = scoped(data, user);
    const totals = window.EquipmentTracking.tally(tools, data, { assetsOnly });
    const constructionProjects = activeConstructionProjects(data, user);
    const extraProjectStock = []; // Assigned-stock reader is not installed on main.

    const incoming = (data.transfers || []).filter(t =>
      ['pending', 'refused'].includes(t.status) &&
      (admin || (window.MCPAAuth && !window.MCPAAuth.isDemo
        ? (t.receiverId === user.id || (t.status === 'refused' && t.senderId === user.id))
        : (t.receiver === user.name || (t.status === 'refused' && t.sender === user.name))))
    );

    const openRequests = (data.requests || []).filter(r =>
      (admin ? ['pending', 'approved'] : ['pending', 'approved', 'released']).includes(r.status) &&
      (admin || addressed(r, user))
    );

    const repairUnits = units(tools.filter(t => condition(t) === 'repair'), assetsOnly);
    const missingUnits = units(tools.filter(t => condition(t) === 'missing'), assetsOnly);

    const equipmentTarget = status => user.role === 'admin' ? 'masterlist?status=' + status : 'masterlist';

    const assignedProjectsWithEngineer = constructionProjects.filter(p => p.assigned_engineer_id || (p.assigned_engineer && p.assigned_engineer !== 'Unassigned')).length;
    const cards = fieldRole
      ? [
          [
            totals.total,
            'In My Custody',
            totals.deployed ? `${totals.deployed} active in use` : 'No equipment in custody',
            'box',
            'masterlist',
            kpiMiniBars(totals.total, Math.max(2, totals.total + extraProjectStock.length), 'amber')
          ],
          [
            totals.available,
            'Available in Custody',
            'Requestable within your custody',
            'inbox',
            'masterlist',
            kpiMiniBars(totals.available, Math.max(1, totals.total), 'emerald')
          ],
          [
            constructionProjects.length,
            'Assigned Projects',
            constructionProjects.length
              ? constructionProjects.map(p => p.name).join(', ')
              : '0 active projects tracked',
            'map',
            'sites',
            kpiMiniBars(constructionProjects.length, Math.max(1, constructionProjects.length), 'info')
          ],
          [
            incoming.length,
            'Pending Turnovers',
            incoming.length
              ? `${incoming.length} awaiting receipt`
              : '0 handovers pending',
            'swap',
            'transfer',
            kpiMiniBars(incoming.length, Math.max(2, incoming.length + openRequests.length), 'warning')
          ]
        ]
      : [
          [
            totals.total,
            'Total Equipment',
            `Across all locations`,
            'box',
            equipmentTarget('all'),
            kpiMiniBars(totals.total, totals.total, 'amber')
          ],
          [
            totals.available,
            'Available Stock',
            `${totals.total ? Math.round((totals.available / totals.total) * 100) : 0}% eligible for new requests`,
            'inbox',
            equipmentTarget('available'),
            kpiMiniBars(totals.available, totals.total, 'emerald')
          ],
          [
            totals.deployed,
            display.status('inuse'),
            'Equipment currently in use',
            'swap',
            equipmentTarget('inuse'),
            kpiMiniBars(totals.deployed, totals.total, 'amber')
          ],
          [
            constructionProjects.length,
            'Active Projects',
            `Construction sites only`,
            'map',
            'sites',
            kpiMiniBars(assignedProjectsWithEngineer, Math.max(1, constructionProjects.length), 'info')
          ]
        ];

    const tasks = [
      [
        incoming.length,
        'Transfers awaiting receipt',
        admin ? 'Monitor handovers; named receivers confirm custody.' : 'Inspect equipment before accepting custody.',
        'swap',
        'transfer'
      ],
      [
        openRequests.length,
        'Open requests',
        admin ? 'Review requests and release approved tools.' : 'Track approval and release by the Admin.',
        'inbox',
        'request'
      ],
      [
        repairUnits,
        'Maintenance alerts',
        repairUnits
          ? 'Equipment requires maintenance or repair.'
          : 'No equipment currently requires repair.',
        'wrench',
        'repair'
      ],
      [
        missingUnits,
        'Missing equipment',
        missingUnits ? 'Review unresolved missing equipment.' : 'No equipment currently reported missing.',
        'alert',
        'missing'
      ]
    ];

    const recent = [...(data.activity || [])]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 2);

    const timeline = recent.length
      ? `<ol class="asset-timeline">${recent.map(r => {
          const href = window.MCPAMovementLinks?.href(r, data);
          const event = display.activity(r, data);
          const content = `<span class="timeline-mark">${glyph(actionKey(r.action).startsWith('transfer') ? 'swap' : actionKey(r.action).startsWith('return') ? 'undo' : 'clock')}</span><div><strong>${esc(event.title)}</strong><span class="${window.MCPAPermissions.operational(user.role) ? 'engineer-activity-reference' : 'cell-sub'} brand-activity-reference sr-only">${esc(event.reference)}</span><span class="${window.MCPAPermissions.operational(user.role) ? 'engineer-activity-meta ' : ''}brand-activity-meta">${esc(event.actor)} · <time datetime="${esc(r.createdAt)}">${esc(when(r.createdAt))}</time></span></div>`;
          return `<li>${href ? `<a class="activity-timeline-link" data-movement-link href="${esc(href)}" aria-label="Open ${esc(event.reference)}: ${esc(event.title)}">${content}</a>` : content}</li>`;
        }).join('')}</ol>`
      : empty('No recent equipment movements.');

    const held = units(tools.filter(t => !!t.holder && t.holder !== '—' && t.holder !== 'Unassigned'), assetsOnly);

    const custody = `<div class="custody-list">${[
      [held, 'With assigned holder', 'users', 'masterlist'],
      [Math.max(0, totals.total - held), 'Without assigned holder (stock / repair)', 'users', 'masterlist'],
      [incoming.length, 'Awaiting transfer confirmation', 'clock', 'transfer']
    ].map(([count, label, symbol, target]) =>
      `<button type="button" data-go="${target}">${glyph(symbol)}<span class="v2-custody-label">${esc(label)}</span><strong>${count}</strong></button>`
    ).join('')}</div>
    <p class="panel-note">Custody changes after confirmed receipt. Pending transfers keep the current holder.</p>`;

    const recentPanel = panel(
      'Recent asset activity',
      timeline,
      `<button type="button" class="v2-link-btn" data-go="activity">View all</button>`,
      'dashboard-recent',
      ''
    );

    const inventoryPanel = panel(
      admin ? 'Current inventory' : 'Current inventory',
      `${filters(data, dashboardInventory(data, user), state, assetsOnly)}<div id="overview-results">${inventory(data, user, state, table)}</div>`,
      '',
      'inventory-panel',
      ''
    );

    const nextActionsPanel = panel(
      'Next actions',
      `<div class="command-tasks">${tasks.filter(t => user.role !== 'tool_handler' || t[4] !== 'request').map(([count, label, description, symbol, target]) =>
        `<button type="button" class="command-task v2-compact-task ${count ? '' : 'is-clear'}" data-go="${target}" aria-label="Open ${esc(label.toLowerCase())}">
          <span class="task-icon">${glyph(symbol)}</span>
          <div class="v2-task-copy">
            <strong>${esc(label)} <span>${count}</span></strong>
            <p>${esc(description)}</p>
          </div>
        </button>`
      ).join('')}</div>`,
      '',
      'v2-panel-actions-queue',
      ''
    );

    const custodyPanel = panel(
      'Custody overview',
      custody,
      '',
      'v2-panel-custody',
      'Holder accountability'
    );

    const kpiGrid = `<div class="grid grid-4 overview-kpis">${cards.map(([count, label, description, symbol, target, vizSvg]) =>
      `<button type="button" class="card kpi v2-kpi-card" data-go="${target}">
        <div class="v2-kpi-top">
          <span class="lbl">${esc(label)}</span>
          <span class="command-kpi-icon">${glyph(symbol)}</span>
        </div>
        <span class="num">${count}</span>
        <div class="v2-kpi-bottom">
          <span class="kpi-description">${esc(description)}</span>
          ${vizSvg}
        </div>
      </button>`
    ).join('')}${user.role === 'admin' && window.MCPAAuth?.isDemo !== true ? consumablesCard(data.consumablesSummary) : ''}</div>`;

    const analyticsGrid = `<div class="command-analytics">${statusChart(tools, assetsOnly, state, data, user, extraProjectStock)}${siteChart(data, user, assetsOnly, state)}${movementChart(data)}</div>`;

    return `${fieldRole ? '<div class="field-dashboard">' : ''}${header('Movement overview', 'Track requests, custody, equipment condition, and movement across project sites.')}
      <div class="dashboard-toolbar">
        <p class="dashboard-scope">${admin ? 'Company equipment' : 'Confirmed custody'} <span>· Authorized equipment</span></p>
        ${fieldRole
          ? '<div class="overview-actions">' + [
              ['Request Tools', 'request', 'inbox'],
              ['Receive / Transfer', 'transfer', 'swap'],
              ['Return Tools', 'return', 'undo'],
              ['Report an Issue', 'repair', 'alert']
            ].map(([label, target, symbol]) => go(glyph(symbol) + label, target)).join('') + '</div>'
          : user.role === 'admin'
            ? review(data)
            : go('View inventory', 'masterlist')}
      </div>
      ${kpiGrid}
      ${analyticsGrid}
      ${fieldRole ? '<div class="dashboard-workflow">' + turnover(data, user, when) + requestsOverview(data, user) + '</div>' : ''}
      <div class="brand-overview-grid">
        ${inventoryPanel}
        <div class="v2-side-stack">
          ${recentPanel}
          <div class="v2-side-subgrid">
            ${nextActionsPanel}
            ${custodyPanel}
          </div>
        </div>
      </div>
      ${fieldRole ? '</div>' : ''}`;
  }

  window.DashboardView = { render, inventory, consumablesCard };

  // One delegated controller survives dashboard refreshes. Static transparent
  // hit paths keep pointer geometry fixed while the painted slices move.
  function enhancePieMotion() {
    const states = new WeakMap();
    const chartOf = node => node?.closest?.('[data-pie-chart]');
    const hitOf = node => node?.closest?.('[data-pie-hit]');
    const stateOf = svg => {
      if (!states.has(svg)) states.set(svg, { hover: null, focus: null, pinned: null });
      return states.get(svg);
    };
    const paint = svg => {
      const state = stateOf(svg), key = state.hover || state.focus || state.pinned;
      svg.classList.toggle('has-pie-emphasis', Boolean(key));
      svg.querySelectorAll('[data-pie-visual]').forEach(slice => {
        slice.classList.toggle('is-emphasized', slice.dataset.pieVisual === key);
        slice.classList.toggle('is-keyboard-focus', slice.dataset.pieVisual === state.focus);
      });
      svg.querySelectorAll('[data-pie-hit]').forEach(hit => {
        const pressed = String(hit.dataset.pieHit === state.pinned);
        if (hit.getAttribute('aria-pressed') !== pressed) hit.setAttribute('aria-pressed', pressed);
      });
    };
    const toggle = hit => {
      const svg = chartOf(hit), state = stateOf(svg);
      state.pinned = state.pinned === hit.dataset.pieHit ? null : hit.dataset.pieHit;
      paint(svg);
    };
    document.addEventListener('pointerover', event => {
      const hit = hitOf(event.target);
      if (!hit || event.pointerType === 'touch') return;
      const svg = chartOf(hit);
      stateOf(svg).hover = hit.dataset.pieHit;
      paint(svg);
    });
    document.addEventListener('pointerout', event => {
      const svg = chartOf(event.target);
      if (!svg || chartOf(event.relatedTarget) === svg || event.pointerType === 'touch') return;
      stateOf(svg).hover = null;
      paint(svg);
    });
    document.addEventListener('pointermove', event => {
      const svg = chartOf(event.target);
      if (!svg || event.pointerType === 'touch' || hitOf(event.target) || !stateOf(svg).hover) return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      // Retain emphasis across the small outward gap, clear past the visible pie.
      if (Math.hypot(point.x - 68, point.y - 68) > 65) { stateOf(svg).hover = null; paint(svg); }
    }, { passive: true });
    document.addEventListener('focusin', event => {
      const hit = hitOf(event.target);
      if (!hit || !hit.matches(':focus-visible')) return;
      const svg = chartOf(hit);
      stateOf(svg).focus = hit.dataset.pieHit;
      paint(svg);
    });
    document.addEventListener('focusout', event => {
      const svg = chartOf(event.target);
      if (!svg) return;
      const next = hitOf(event.relatedTarget);
      stateOf(svg).focus = next && chartOf(next) === svg && next.matches(':focus-visible') ? next.dataset.pieHit : null;
      paint(svg);
    });
    document.addEventListener('pointerdown', event => {
      const current = chartOf(event.target);
      document.querySelectorAll('[data-pie-chart].has-pie-emphasis').forEach(svg => {
        if (svg !== current) { stateOf(svg).pinned = null; paint(svg); }
      });
      if (current && event.pointerType === 'touch') { stateOf(current).focus = null; paint(current); }
      // Never capture/prevent touch gestures; native scrolling cancels clicks.
    }, { passive: true });
    document.addEventListener('click', event => {
      const hit = hitOf(event.target);
      if (hit && (event.pointerType === 'touch' || event.pointerType === 'pen' || event.detail === 0)) toggle(hit);
    });
    document.addEventListener('keydown', event => {
      const hit = hitOf(event.target);
      if (!hit) return;
      const svg = chartOf(hit);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) toggle(hit);
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const hits = [...svg.querySelectorAll('[data-pie-hit]')], direction = event.key === 'ArrowRight' ? 1 : -1;
        hits[(hits.indexOf(hit) + direction + hits.length) % hits.length].focus({ preventScroll: true });
      } else if (event.key === 'Escape') {
        stateOf(svg).pinned = null;
        stateOf(svg).hover = null;
        paint(svg);
      }
    });
  }

  // Presentation only: the accepted navigation still owns routes, accordion
  // state, aria-current, role menus, and mobile focus management.
  function enhanceNavigation() {
    const nav = document.querySelector('#nav-list');
    if (!nav) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const indicator = document.createElement('span');
    indicator.className = 'v2-nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    let frame = 0, ready = false;
    const update = () => {
      frame = 0;
      if (!indicator.isConnected) { nav.append(indicator); ready = false; }
      nav.querySelectorAll('.nav-children').forEach(children => {
        if (!children.querySelector(':scope > .v2-submenu-inner')) {
          const inner = document.createElement('div');
          inner.className = 'v2-submenu-inner';
          inner.append(...children.childNodes);
          children.append(inner);
          resize.observe(children);
        }
        children.inert = children.hidden;
        children.setAttribute('aria-hidden', String(children.hidden));
      });
      nav.classList.add('v2-nav-motion');
      const active = nav.querySelector('.nav-item.active');
      const target = active?.closest('.nav-group')?.querySelector('.nav-parent') || active;
      nav.querySelectorAll('.v2-module-active').forEach(button => {
        if (button !== target) button.classList.remove('v2-module-active');
      });
      if (!target) { indicator.hidden = true; return; }
      target.classList.add('v2-module-active');
      const rect = target.getBoundingClientRect(), parent = nav.getBoundingClientRect();
      indicator.hidden = false;
      indicator.style.transitionDuration = !ready || motion.matches ? '0s' : '';
      indicator.style.width = rect.width + 'px';
      indicator.style.height = rect.height + 'px';
      indicator.style.transform = `translate(${rect.left - parent.left + nav.scrollLeft}px, ${rect.top - parent.top + nav.scrollTop}px)`;
      // First placement is immediate; subsequent selections travel between modules.
      if (!ready) { indicator.getBoundingClientRect(); ready = true; }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(nav);
    new MutationObserver(records => {
      if (records.some(record => record.target !== indicator &&
        !(record.type === 'attributes' && record.attributeName === 'class' &&
          record.oldValue === record.target.className))) schedule();
    }).observe(nav, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden', 'aria-current'] });
    motion.addEventListener('change', schedule);
    update();
  }

  // Shell & non-dashboard screen polish (preserves all accepted functionality and mobile card labels)
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('premium-dashboard', 'premium-v2');
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load("700 28px 'Plus Jakarta Sans'"),
        document.fonts.load("700 28px Manrope"),
        document.fonts.load("500 14px Inter"),
        document.fonts.load("400 12px 'Geist Mono'")
      ]).catch(() => {});
    }
    const mark = document.querySelector('.brand-mark');
    if (mark) {
      mark.innerHTML = `<picture><source srcset="${esc(window.MCPAPaths.url('assets/premium-v2/company-logo.svg').href)}" media="(prefers-color-scheme: light)"><img src="${esc(window.MCPAPaths.url('assets/premium-v2/company-logo-white.svg').href)}" width="174" height="56" alt="MCPA Construction and Supply"></picture>`;
      mark.classList.add('official-brand');
      // Follow the application preference, which may differ from the OS theme.
      const logoTheme = () => {
        mark.querySelector('source').media = document.body.classList.contains('dark') ? 'not all' : 'all';
      };
      new MutationObserver(logoTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      logoTheme();
    }
    const subtitle = document.querySelector('.brand-sub');
    if (subtitle) subtitle.textContent = 'Construction & Supply';
    const wordmark = document.querySelector('.brand-name');
    if (wordmark) wordmark.innerHTML = 'MCPA<span class="brand-version">2.0</span>';
    enhanceNavigation();
    enhancePieMotion();

    const topbar = document.querySelector('#topbar');
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'brand-breadcrumb';
    breadcrumb.innerHTML = '<span>Workspace</span><svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"><path d="m8 5 5 5-5 5"/></svg><strong>Dashboard</strong>';
    topbar?.insertBefore(breadcrumb, topbar.querySelector('.search-wrap'));

    const content = document.querySelector('#content');
    let scheduled = false;

    const polish = () => {
      scheduled = false;
      const active = content?.querySelector('.screen.active');
      const nav = document.querySelector('.nav-item.active');
      if (nav) {
        const name = nav.textContent.trim();
        if (breadcrumb.lastElementChild.textContent !== name) breadcrumb.lastElementChild.textContent = name;
      }
      if (!active) return;

      active.querySelectorAll('.asset-timeline li>div,.activity-timeline-link>div').forEach(div => {
        const spans = [...div.children].filter(x => x.tagName === 'SPAN');
        if (spans[0]) spans[0].classList.add('brand-activity-reference');
        if (spans[1]) spans[1].classList.add('brand-activity-meta');
      });

      active.querySelectorAll('.equipment-status:not(.equipment-status-compact)').forEach(status => {
        const reason = status.querySelector(':scope > .equipment-status-reason');
        if (reason && !status.querySelector('.brand-availability-info')) {
          const details = document.createElement('details');
          details.className = 'brand-availability-info';
          const summary = document.createElement('summary');
          summary.textContent = 'Availability details';
          details.append(summary, reason);
          status.append(details);
        }
      });

      active.querySelectorAll('table').forEach(table => {
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
        table.querySelectorAll('tbody tr').forEach(tr =>
          [...tr.children].forEach((td, i) => {
            if (td.dataset.label !== headers[i]) td.dataset.label = headers[i] || 'Select';
          })
        );
      });

      active.querySelectorAll('input,select,textarea').forEach(control => {
        if (control.getAttribute('aria-label') || control.labels?.length) return;
        if (control.id === 'selectAll') control.setAttribute('aria-label', 'Select all equipment');
        else if (control.type === 'checkbox') control.setAttribute('aria-label', 'Select equipment');
      });
    };

    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(polish);
      }
    };

    if (content) new MutationObserver(schedule).observe(content, { childList: true, subtree: true });
    const navList = document.querySelector('#nav-list');
    if (navList) new MutationObserver(schedule).observe(navList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('hashchange', schedule);
    schedule();

    // Interactive chart filters (Movement series pills + Project site rows)
    document.addEventListener('click', event => {
      const pageButton = event.target.closest('#screen-dashboard [data-inventory-page]');
      if (pageButton && !pageButton.disabled && inventoryContext) {
        const results = document.querySelector('#screen-dashboard #overview-results');
        if (!results) return;
        inventoryPage += Number(pageButton.dataset.inventoryPage);
        const { data, user, state, table } = inventoryContext;
        results.innerHTML = inventory(data, user, state, table);
        const button = document.getElementById(pageButton.id);
        (button && !button.disabled ? button : document.querySelector('#inventory-page-status')).focus({ preventScroll: true });
        return;
      }
      const seriesBtn = event.target.closest('[data-series-filter]');
      if (seriesBtn) {
        activeMovementSeries = seriesBtn.dataset.seriesFilter || 'all';
        window.dispatchEvent(new CustomEvent('mcpa:movement-change'));
        return;
      }
      const siteRow = event.target.closest('[data-site-filter]');
      if (siteRow) {
        const select = document.querySelector('#screen-dashboard #overview-site');
        if (select) {
          const targetSite = siteRow.dataset.siteFilter;
          const nextValue = select.value === targetSite ? '' : targetSite;
          select.value = nextValue;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelectorAll('[data-site-filter]').forEach(el => {
            el.classList.toggle('is-selected', el.dataset.siteFilter === nextValue && nextValue !== '');
          });
        }
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        const siteRow = event.target.closest('[data-site-filter]');
        if (siteRow) {
          event.preventDefault();
          siteRow.click();
        }
      }
    });
  });
})();
