
/* Presentation only: consumes the existing live/demo snapshot and navigation. */

(function () {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const units = (tools, assetsOnly = false) => tools.reduce((sum,t) => sum + (assetsOnly ? Number(EquipmentTracking.quantity(t)>0) : EquipmentTracking.quantity(t)),0);

  const glyph = name => icon(name).replace('<svg ', '<svg aria-hidden="true" ');

  const go = (text,target) => `<button class="btn btn-secondary btn-sm" data-go="${target}">${text}</button>`;
  function consumablesCard(summary) {
    const count = summary?.count;
    return `<button type="button" class="card kpi consumables-shortcut" data-go="consumables"><span class="command-kpi-icon">${glyph('box')}</span><span class="command-kpi-copy"><span class="lbl">Consumables</span><span class="kpi-description">View stock, requests, and restocking</span>${Number.isInteger(count) && count > 0 ? `<span class="consumables-warning">${count} item${count === 1 ? '' : 's'} low stock</span>` : summary?.error ? '<span class="kpi-description">Stock status unavailable</span>' : ''}</span></button>`;
  }

  const panel = (title,body,extra='',cls='') => `<section class="command-panel ${cls}"><div class="command-panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;

  const empty = text => `<p class="command-empty">${text}</p>`;

  const activeSites = (data, user) => window.MCPAProjectScope.projects(data.activeProjects || data.sites, user, window.MCPAAuth?.isDemo === true);

  const belongs = (t,p) => t.site_id === p.id || t.siteId === p.id || t.site === p.name;

  const scoped = (data,user) => data.tools.filter(t => EquipmentTracking.quantity(t)>0 && (['admin','tool_handler'].includes(user.role) || (window.MCPAAuth && !window.MCPAAuth.isDemo ? t.holderId === user.id : !!user.name && t.holder === user.name)));

  const condition = t => ['repair','underrepair'].includes(t.status) ? 'repair' : t.status === 'inuse' ? 'deployed' : t.status === 'inoffice' ? 'available' : ['available','missing'].includes(t.status) ? t.status : 'other';

  const match = (t,status,data) => status === 'repair' ? condition(t)==='repair' : EquipmentTracking.matchesStatus(t,status,data);

  const groups = [['available','Available'],['deployed',window.MCPADisplay.status('inuse')],['repair','Repair / under repair'],['missing','Missing'],['other','Other / retired']];

  const display = window.MCPADisplay;

  // The live RPC audit uses operation names; demo history uses event names.

  const actionKey = action => ({createRequest:'request_created',approveRequest:'request_approved',rejectRequest:'request_rejected',releaseRequest:'transfer_created',createTransfer:'transfer_created',receiveTransfer:'transfer_received',createReturn:'return_created',reportRepair:'repair_reported',startRepair:'repair_started',completeRepair:'repair_completed',reportMissing:'missing_reported',recoverMissing:'missing_recovered'}[display.actionKey(action)] || '');

  function statusChart(tools, assetsOnly) {
    const total=units(tools,assetsOnly); let offset=0;

    const counts=groups.map(([key,label]) => ({key,label,count:units(tools.filter(t => condition(t)===key),assetsOnly)}));

    const rings=counts.map(g => {
      const part=total ? g.count/total*100 : 0;
      const html=`<circle class="tone-${g.key}" cx="60" cy="60" r="47" pathLength="100" fill="none" stroke="currentColor" stroke-width="13" stroke-dasharray="${part} ${100-part}" stroke-dashoffset="${-offset}"/>`;
      offset+=part; return html;
    }).join('');

    return panel('Equipment status',`<div class="status-chart"><div class="status-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="47" fill="none" stroke-width="13"/>${rings}</svg><div><strong>${total}</strong><span>${assetsOnly?'Assets':'Units'}</span></div></div><ul class="chart-legend">${counts.filter(g => g.key!=='other'||g.count).map(g => `<li><i class="legend-dot tone-${g.key}"></i><span>${g.label}</span><strong>${g.count}</strong></li>`).join('')}</ul></div><p class="panel-note">Recorded condition · availability tracked separately.</p>`);
  }

  function siteChart(projects,tools,assetsOnly) {
    const sites=projects, hasSite=t => t.site_id || t.siteId || (t.site && t.site!=='Unassigned');

    const rows=[{name:'Unassigned',count:units(tools.filter(t => !hasSite(t)),assetsOnly)}].concat(sites.map(p => ({name:p.name,count:units(tools.filter(t => belongs(t,p)),assetsOnly)})).sort((a,b) => b.count-a.count));

    const other=units(tools.filter(t => hasSite(t) && !sites.some(p => belongs(t,p))),assetsOnly);

    if(other) rows.push({name:'Other / archived sites',count:other});

    const max=Math.max(1,...rows.map(r => r.count));

    return panel('Equipment by project / site',`<div class="site-bars">${rows.slice(0,4).map(r => `<div class="site-bar"><span title="${esc(r.name)}">${esc(r.name)}</span><div class="bar-track"><span style="width:${r.count/max*100}%"></span></div><strong>${r.count}</strong></div>`).join('')}</div><p class="panel-note">${assetsOnly?'Equipment assets':'Equipment quantities'} · ${rows.length>4?'top locations shown':'current assignments'}</p>`,go('All projects','sites'));
  }

  function movementChart(data) {
    const dayKey=d => new Date(new Date(d).getTime()+8*3600000).toISOString().slice(0,10);

    const today=dayKey(Date.now()), days=Array.from({length:7},(_,i) => new Date(Date.parse(today+'T00:00:00Z')-(6-i)*86400000).toISOString().slice(0,10));

    const series=[['request_created','Requests','deployed'],['transfer_created','Releases','other'],['transfer_received','Receipts','available'],['return_created','Returns','repair']];

    const values=series.map(([key]) => days.map(day => data.activity.filter(r => actionKey(r.action)===key && Number.isFinite(Date.parse(r.createdAt)) && dayKey(r.createdAt)===day).length));

    const total=values.flat().reduce((a,b) => a+b,0), max=Math.max(1,...values.flat());

    const chart=total ? `<svg class="movement-chart" viewBox="0 0 360 112" role="img" aria-label="Movement events over the last seven days; daily counts below"><path class="chart-grid" d="M26 12H342M26 48H342M26 84H342"/><text x="4" y="16">${max}</text><text x="4" y="88">0</text>${series.map(([,label,tone],i) => `<polyline class="tone-${tone}" fill="none" stroke="currentColor" stroke-width="2" points="${values[i].map((v,j) => `${28+j*52},${84-v/max*72}`).join(' ')}"/>${values[i].map((v,j) => `<circle class="tone-${tone}" fill="currentColor" cx="${28+j*52}" cy="${84-v/max*72}" r="3"><title>${label}: ${v} · ${days[j]}</title></circle>`).join('')}`).join('')}${days.map((d,i) => `<text x="${28+i*52}" y="107" text-anchor="middle">${d.slice(5).replace('-','/')}</text>`).join('')}</svg><details class="chart-data"><summary>View daily counts</summary><div class="table-wrap"><table><caption>Events per day · Manila time</caption><thead><tr><th>Date</th>${series.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${days.map((d,i)=>`<tr><th>${d}</th>${values.map(v=>`<td>${v[i]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : empty('No equipment movements recorded in this period.');

    return panel('Asset movement',`<div class="movement-legend">${series.map(([,label,tone]) => `<span><i class="legend-dot tone-${tone}"></i>${label}</span>`).join('')}</div>${chart}<p class="panel-note">Last 7 days · Manila time · recorded events</p>`);
  }

  function filters(data,tools,state,assetsOnly) {
    return `<div class="inventory-tabs" role="group" aria-label="Inventory status">${[['','All equipment'],['available','Available'],['inuse',window.MCPADisplay.status('inuse')],['repair','Repair'],['missing','Missing']].map(([key,label]) => `<button data-status="${key}" aria-pressed="${state.status===key}" class="inventory-tab">${label} <span>${units(tools.filter(t=>match(t,key,data)),assetsOnly)}</span></button>`).join('')}</div><div class="dashboard-filters"><input id="dashboard-search" data-search aria-label="Search inventory" placeholder="Search inventory…" value="${esc(state.query)}"><select id="overview-site" aria-label="Filter inventory by project"><option value="">All projects</option><option value="__unassigned" ${state.site==='__unassigned'?'selected':''}>Unassigned</option>${data.sites.map(p=>`<option value="${esc(p.name)}" ${state.site===p.name?'selected':''}>${esc(p.name)}</option>`).join('')}</select><select id="dashboard-condition" aria-label="Filter inventory by condition"><option value="">All conditions</option>${groups.map(([key,label])=>`<option value="${key}" ${state.condition===key?'selected':''}>${label}</option>`).join('')}</select></div>`;
  }

  function inventory(data,user,state,table) {
    const tools=scoped(data,user).filter(t=>match(t,state.status,data) && (!state.condition || condition(t)===state.condition) && (!state.site || (state.site==='__unassigned' ? !t.site || t.site==='Unassigned' : t.site===state.site)) && [t.id,t.name,t.brand,t.site,t.holder,t.serial].join(' ').toLowerCase().includes(state.query.toLowerCase()));

    return `${table(tools.slice(0,6))}<div class="inventory-footer" role="status">${tools.length?`Showing ${Math.min(6,tools.length)} of ${tools.length} equipment records`:'No matching equipment'}${go('View full inventory','masterlist')}</div>`;
  }

  function review(data) {
    const items=[[data.requests.filter(r=>r.status==='pending').length,'Tool requests','request'],[data.transfers.filter(t=>t.status==='pending').length,'Transfers in progress','transfer'],[data.repairs.filter(r=>['reported','underrepair'].includes(r.status)).length,'Repair cases','repair'],[data.missing.filter(r=>r.status==='missing').length,'Missing cases','missing']];

    return '<div class="admin-review" aria-label="Needs review"><strong>Needs Review</strong>'+items.map(([count,label,target])=>go(label+' <span>'+count+'</span>',target)).join('')+'</div>';
  }

  const addressed = (record,user) => window.MCPAAuth && !window.MCPAAuth.isDemo
    ? Boolean(user.id) && record.receiverId === user.id
    : Boolean(user.name) && (record.receiver === user.name || record.requester === user.name);

  const requestLabels = display.statuses.request;

  const recordDate = record => record.updatedAt || record.createdAt || '';

  const recordLink = (label,kind,record,prefix) => `<button class="btn btn-secondary btn-sm" id="dashboard-${prefix}-${esc(record.id)}" data-go="${kind}?record=${esc(encodeURIComponent(record.id))}">${label}</button>`;

  function turnover(data,user,when) {
    const pending=data.transfers.filter(record=>record.status==='pending' && addressed(record,user)).sort((a,b)=>recordDate(b).localeCompare(recordDate(a)));

    const rows=pending.slice(0,4).map(record=>{
      const equipment=(record.toolIds||[]).map(id=>{const tool=data.tools.find(item=>item.id===id);return `<li><strong>${esc(tool?.name||'Equipment')}</strong> <span class="tool-id-chip">${esc(id)}</span></li>`;}).join('');

      const origins=[...new Set((record.source||[]).map(item=>item.site).filter(Boolean))].join(', ') || 'Not recorded';

      return `<li class="dashboard-turnover" data-turnover-id="${esc(record.id)}"><div class="workflow-row-head"><strong>${esc(record.id)}</strong><span class="badge badge-pending">Awaiting receipt</span></div><ul class="turnover-equipment">${equipment}</ul><dl class="turnover-context"><div><dt>Request</dt><dd>${esc(record.requestId || 'Direct transfer')}</dd></div><div><dt>From</dt><dd>${esc(origins)}</dd></div><div><dt>Destination</dt><dd>${esc(record.destination || 'Not recorded')}</dd></div><div><dt>Released</dt><dd>${esc(when(record.createdAt))}</dd></div></dl>${recordLink('View Turnover','transfer',record,'turnover')}</li>`;
    }).join('');

    const body=pending.length?`<ul class="workflow-list">${rows}</ul><p class="panel-note">${pending.length>4?`Showing 4 of ${pending.length} pending handovers. `:''}Inspect every tool before confirming receipt. Custody has not changed.</p>`:empty('No equipment is currently awaiting your confirmation.');

    return panel('Pending Equipment Turnover',body,'<button class="btn btn-secondary btn-sm" data-turnover-inbox>Receive Transfer</button>','dashboard-turnovers');
  }

  function requestsOverview(data,user) {
    const records=data.requests.filter(record=>addressed(record,user)).sort((a,b)=>recordDate(b).localeCompare(recordDate(a)));

    const summary=Object.entries(requestLabels).filter(([status])=>records.some(record=>record.status===status)).map(([status,label])=>`<span>${label}: <strong>${records.filter(record=>record.status===status).length}</strong></span>`).join('');

    const rows=records.slice(0,5).map(record=>`<li class="dashboard-request" data-request-id="${esc(record.id)}"><div class="workflow-row-head"><strong>${esc(record.id)}</strong><span class="badge badge-${record.status==='rejected'?'discrepancy':record.status==='received'?'verified':'pending'}">${esc(display.status(record.status, 'request'))}</span></div><p>${esc(record.destination||'Destination not recorded')} · ${(record.toolIds||[]).length} equipment record${(record.toolIds||[]).length===1?'':'s'}</p>${recordLink('View request','request',record,'request')}</li>`).join('');

    return panel('My Requests',records.length?`<div class="request-phase-summary" aria-label="Request statuses">${summary}</div><ul class="workflow-list">${rows}</ul>${records.length>5?`<p class="panel-note">Showing 5 of ${records.length} requests. Open Requests for your full history.</p>`:''}`:empty('No equipment requests yet. Submit a request for available tools.'),go('All requests','request'),'dashboard-requests');
  }

  function render(data,user,state,header,table,when) {
    const assetsOnly=['engineer','architect'].includes(user.role), admin=['admin','tool_handler'].includes(user.role), tools=scoped(data,user), totals=EquipmentTracking.tally(tools,data,{assetsOnly}), projects=activeSites(data,user);

    const incoming=data.transfers.filter(t=>['pending','refused'].includes(t.status) && (admin || (window.MCPAAuth && !window.MCPAAuth.isDemo ? (t.receiverId===user.id || (t.status==='refused'&&t.senderId===user.id)) : (t.receiver===user.name || (t.status==='refused'&&t.sender===user.name)))));

    const requests=data.requests.filter(r=>(admin?['pending','approved']:['pending','approved','released']).includes(r.status) && (admin || addressed(r,user)));

    const repair=units(tools.filter(t=>condition(t)==='repair'),assetsOnly), missing=units(tools.filter(t=>condition(t)==='missing'),assetsOnly);

    const equipmentTarget = status => user.role === 'admin' ? 'masterlist?status=' + status : 'masterlist';
    const cards=[[totals.total,'Total Equipment',assetsOnly?'Tracked asset records':'Tracked equipment units','box',equipmentTarget('all')],[totals.available,'Available',`${totals.total?Math.round(totals.available/totals.total*100):0}% eligible for new requests`,'inbox',equipmentTarget('available')],[totals.deployed,display.status('inuse'),totals.deployed?'Equipment currently in use':'No equipment currently in use','swap',equipmentTarget('inuse')],[projects.length,'Active Projects',`${projects.length} active project${projects.length === 1 ? '' : 's'} ${['engineer','architect'].includes(user.role) ? 'assigned to you' : 'tracked'}`,'map','sites']];

    const tasks=[[incoming.length,'Transfers awaiting receipt',admin?'Monitor handovers; named receivers confirm custody.':'Inspect equipment before accepting custody.','swap','transfer'],[requests.length,'Open requests',admin?'Review requests and release approved tools.':'Track approval and release by the Admin.','inbox','request'],[repair,'Maintenance alerts',repair?'Equipment requires maintenance or repair.':'No equipment currently requires repair.','wrench','repair'],[missing,'Missing equipment',missing?'Review unresolved missing equipment.':'No equipment currently reported missing.','alert','missing']];

    const recent=[...data.activity].sort((a,b)=>String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0,4);

    const timeline=recent.length?`<ol class="asset-timeline">${recent.map(r=>{
      const href=window.MCPAMovementLinks?.href(r,data);

      const event = display.activity(r, data);
      const content=`<span class="timeline-mark">${glyph(actionKey(r.action).startsWith('transfer')?'swap':actionKey(r.action).startsWith('return')?'undo':'clock')}</span><div><strong>${esc(event.title)}</strong><p>${esc(event.description)}</p><span class="cell-sub">${esc(event.reference)}</span><span>${esc(event.actor)} · <time datetime="${esc(r.createdAt)}">${esc(when(r.createdAt))}</time></span></div>`;

      return `<li>${href ? `<a class="activity-timeline-link" data-movement-link href="${esc(href)}" aria-label="Open ${esc(event.reference)}: ${esc(event.title)}">${content}</a>` : content}</li>`;
    }).join('')}</ol>`:empty('No recent equipment movements. Saved actions will appear here.');

    const projectCards=projects.length?`<div class="project-overview">${projects.slice(0,3).map(p=>{
      const assets=data.tools.filter(t=>belongs(t,p)&&EquipmentTracking.quantity(t)>0), tally=EquipmentTracking.tally(assets,data,{assetsOnly}), counts=new Map();

      assets.forEach(t=>counts.set(t.name,(counts.get(t.name)||0)+EquipmentTracking.quantity(t)));

      return `<button class="project-summary" data-go="sites"><span class="project-heading">${glyph('map')}<strong>${esc(p.name)}</strong><span class="project-state">Active</span></span>${p.location?`<span class="project-location">${esc(p.location)}</span>`:''}<span class="project-count"><strong>${tally.deployed}</strong> in use <span>· ${tally.total} assigned ${assetsOnly?'assets':'units'}</span></span><span class="project-tally">${esc((assetsOnly ? assets.map(t=>`${t.name} · ${t.id}`) : [...counts].map(([name,count])=>`${name}: ${count}`)).join(' · ')||'No equipment assigned')}</span>${p.assigned_engineer?`<span class="project-tally">Engineer: ${esc(p.assigned_engineer)}</span>`:''}</button>`;
    }).join('')}</div>`:empty('No active projects.');

    const held=units(tools.filter(t=>!!t.holder&&t.holder!=='—'),assetsOnly);

    const custody=`<div class="custody-list">${[[held,'With assigned holder','users','masterlist'],[totals.total-held,'Without assigned holder','users','masterlist'],[incoming.length,'Awaiting transfer confirmation','clock','transfer']].map(([count,label,symbol,target])=>`<button data-go="${target}">${glyph(symbol)}<span>${label}</span><strong>${count}</strong><span aria-hidden="true">›</span></button>`).join('')}</div><p class="panel-note">Custody changes after confirmed receipt. Pending transfers keep the current holder.</p>`;

    // Keep Recent Activity above workflow panels for Engineers and Architects.
    // Preserve the existing lower placement for Admin and other roles.
    const fieldRole = ['engineer','architect'].includes(user.role);

    const recentPanel = panel(
      'Recent asset activity',
      timeline,
      go('View all','activity'),
      'dashboard-recent'
    );

    return `${fieldRole?'<div class="field-dashboard">':''}${header('Movement overview','Track requests, custody, equipment condition, and movement across project sites.')}<div class="dashboard-toolbar"><p class="dashboard-scope">${admin?'Company equipment':'My assigned equipment'} <span>· ${assetsOnly?'Individual asset records':'Quantities across saved records'}</span></p>${['engineer','architect'].includes(user.role) ? '<div class="overview-actions">'+[['Request Tools','request','inbox'],['Receive / Transfer','transfer','swap'],['Return Tools','return','undo'],['Report an Issue','repair','alert']].map(([label,target,symbol])=>go(glyph(symbol)+label,target)).join('')+'</div>' : user.role==='admin' ? review(data) : go('View inventory','masterlist')}</div><div class="grid grid-4 overview-kpis">${cards.map(([count,label,description,symbol,target])=>`<button class="card kpi" data-go="${target}"><span class="command-kpi-icon">${glyph(symbol)}</span><span class="command-kpi-copy"><span class="lbl">${label}</span><span class="num">${count}</span><span class="kpi-description">${description}</span></span></button>`).join('')}${user.role==='admin' && window.MCPAAuth?.isDemo !== true ? consumablesCard(data.consumablesSummary) : ''}</div>${fieldRole?recentPanel:''}${fieldRole?'<div class="dashboard-workflow">'+turnover(data,user,when)+requestsOverview(data,user)+'</div>':''}<div class="command-analytics">${statusChart(tools,assetsOnly)}${siteChart(projects,tools,assetsOnly)}${movementChart(data)}</div><div class="overview-columns">${panel(admin?'Current inventory':'My assigned tools',`${filters({...data,sites:projects},tools,state,assetsOnly)}<div id="overview-results">${inventory(data,user,state,table)}</div>`,'','inventory-panel')}${panel('Next actions',`<div class="command-tasks">${tasks.filter(t=>user.role!=='tool_handler'||t[4]!=='request').map(([count,label,description,symbol,target])=>`<div class="command-task ${count?'':'is-clear'}"><span class="task-icon">${glyph(symbol)}</span><div><strong>${label} <span>${count}</span></strong><p>${description}</p></div><button class="btn btn-secondary btn-sm" data-go="${target}" aria-label="Open ${label.toLowerCase()}">Open</button></div>`).join('')}</div>`)}</div><div class="command-bottom">${fieldRole?'':panel('Recent asset activity',timeline,go('View all','activity'))}${panel('Active Projects',projectCards,go('View all','sites'),'dashboard-projects')}${panel('Custody overview',custody)}</div>${fieldRole?'</div>':''}`;
  }

  window.DashboardView={render,inventory,consumablesCard};
})();
