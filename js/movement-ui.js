(function () {
  'use strict';

  const TITLES = { request: 'Requests', transfer: 'Transfers', return: 'Returns', repair: 'Repairs', missing: 'Missing tools' };
  const COLLECTIONS = { request: 'requests', transfer: 'transfers', return: 'returns', repair: 'repairs', missing: 'missing' };
  const display = window.MCPADisplay;
  let current = null;
  let generation = 0;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = () => window.MovementStore;
  const state = () => store().getState();
  const context = () => store().getContext();
  const admin = () => context().role === 'admin';
  const operational = () => ['engineer','architect'].includes(context().role);
  const handler = () => context().role === 'tool_handler';
  const mode = () => typeof store().getMode === 'function' ? store().getMode() : (store().mode || state().mode || 'live');
  const tools = () => state().tools || [];
  const toolById = id => tools().find(tool => tool.id === id);
  const ids = record => record.toolIds || (record.toolId ? [record.toolId] : []);
  const canAdjust = (record, action) => window.MCPAPermissions.movementAction(context().role, action, record, context(), mode(), state());
  const recordStatus = record => record.status || 'returned';
  const date = display.dateTime;
  const button = (label, action, id, style) => `<button type="button" class="btn ${style || 'btn-secondary'} btn-sm" data-action="${esc(action)}"${id ? ` data-id="${esc(id)}"` : ''}>${esc(label)}</button>`;
  const statusLabel = (status,kind) => display.status(status, kind || current.kind);
  const badge = (status, kind) => {
    const tones = { pending: 'pending', approved: 'verified', rejected: 'discrepancy', withdrawn: 'pending', canceled: 'pending', refused: 'discrepancy', discrepancy: 'discrepancy', released: 'inuse', received: 'verified', reported: 'repair', underrepair: 'underrepair', completed: 'verified', missing: 'missing', recovered: 'verified', returned: 'verified' };
    return `<span class="badge badge-${Object.hasOwn(tones,status) ? tones[status] : 'pending'}">${esc(statusLabel(status,kind))}</span>`;
  };
  const toolNames = record => ids(record).map(id => { const tool = toolById(id); return tool ? `${tool.name} (${id})` : id; }).join(', ');

  function visibleRecords() {
    const records = state()[COLLECTIONS[current.kind]] || [];
    const name = context().name;
    if (mode() === 'live' || admin() || handler()) return records;
    return records.filter(record => [record.requester, record.receiver, record.sender, record.returnedBy, record.reportedBy].includes(name) || (record.toolId && toolById(record.toolId)?.holder === name));
  }

  function eligibleTools(kind) {
    const data = state();
    const locked = new Set((data.transfers || []).filter(t => ['pending','refused'].includes(t.status)).flatMap(ids));
    const reserved = new Set((data.requests || []).filter(r => r.status === 'approved').flatMap(ids));
    return (data.tools || []).filter(tool => {
      if(mode()==='live'&&data.integrationVersion>=3&&['request','transfer','return'].includes(kind)
        &&(Number(tool.qty)!==1||!['individual','individualasset','serialized'].includes(String(tool.trackingType||'').toLowerCase().replace(/[ _-]/g,''))))return false;
      if (locked.has(tool.id) || reserved.has(tool.id) || !(tool.qty > 0)) return false;
      const owns = mode() === 'live' ? tool.holderId === context().id : tool.holder === context().name;
      if (kind === 'request') return window.EquipmentTracking.requestability(tool, data).eligible;
      if (kind === 'transfer') return (handler() && tool.status === 'available' && (!tool.holder || tool.holder === '?')) || (tool.status === 'inuse' && owns);
      if (kind === 'repair' || kind === 'missing') return (tool.status === 'inuse' && owns) || (admin() && tool.status === 'available');
      return tool.status === 'inuse' && owns;
    });
  }

  const scopedRequest = () => current?.kind === 'request' && operational() && mode() === 'live';
  const projectPreferenceKey = () => 'mcpa.request-project.' + context().id;
  function requestProjectValue() {
    let saved = current?.requestProjectId || '';
    try { saved = sessionStorage.getItem(projectPreferenceKey()) || saved; } catch (_) { /* Storage can be unavailable. */ }
    const sites = requestSites();
    return sites.find(site => site.id === saved)?.name || (sites.length === 1 ? sites[0].name : '');
  }
  function projectCaption(select) {
    const caption = select?.parentElement.querySelector('[data-project-caption]');
    if (caption) caption.textContent = select.value ? 'Selected project: ' + select.selectedOptions[0].textContent : '';
    if (select) select.title = select.selectedOptions[0]?.textContent || '';
  }
  function siteField(name, label, required, value) {
    const sites = [...new Set([...(state().sites || []).map(site => typeof site === 'string' ? site : site.name), ...tools().map(tool => tool.site)].filter(Boolean))];
    return `<div class="field"><label for="mv-${esc(name)}">${esc(label)}</label><select id="mv-${esc(name)}" name="${esc(name)}" ${required ? 'required' : ''}><option value="">Choose an existing project</option>${sites.map(site => `<option value="${esc(site)}"${site === value ? ' selected' : ''}>${esc(site)}</option>`).join('')}</select></div>`;
  }

  const noRequestProject = 'No assigned project site. Please contact your administrator.';
  function requestSites() {
    const person=context().id;
    return (state().sites||[]).filter(site=>person && site && site.is_active===true &&
      site.assigned_engineer_id===person && site.id && typeof site.name==='string' && site.name.trim())
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  function requestDestinationOptions(sites,value) {
    return (sites.length===1?'':'<option value="">Choose your assigned project</option>')+
      sites.map(site=>`<option value="${esc(site.name)}"${sites.length===1||site.name===value?' selected':''}>${esc(site.name)}</option>`).join('');
  }
  function requestDestinationField() {
    if(mode()!=='live')return siteField('destination','Destination project',true);
    const sites=requestSites();
    return `<div class="field"><label for="mv-destination">Destination project</label><select id="mv-destination" name="destination" required aria-describedby="mv-request-project-status mv-project-selection"${sites.length?'':' disabled'}>${requestDestinationOptions(sites,requestProjectValue())}</select><p class="mv-help" id="mv-request-project-status" role="status"${sites.length?' hidden':''}>${sites.length?'':noRequestProject}</p><p id="mv-project-selection" class="mv-project-selection" data-project-caption aria-live="polite">${requestProjectValue()?'Selected project: '+esc(requestProjectValue()):''}</p></div>`;
  }
  function syncRequestDestination() {
    if(current?.kind!=='request'||mode()!=='live'||!operational())return;
    const select=current.root.querySelector('[data-form="create"] [name="destination"]');
    if(!select)return;
    const sites=requestSites(),value=select.value || requestProjectValue();
    const choices=[...(sites.length===1?[]:[['','Choose your assigned project']]),...sites.map(site=>[site.name,site.name])];
    if(JSON.stringify(Array.from(select.options,option=>[option.value,option.textContent]))!==JSON.stringify(choices))select.innerHTML=requestDestinationOptions(sites,value);
    if(sites.length===1)select.value=sites[0].name;
    else select.value=sites.some(site=>site.name===value)?value:'';
    projectCaption(select);
    select.disabled=!sites.length;
    const message=current.root.querySelector('#mv-request-project-status');
    if(message){message.hidden=Boolean(sites.length);message.textContent=sites.length?'':noRequestProject;}
    const submit=current.root.querySelector('[data-request-submit]');
    if(submit)submit.disabled=current.busy||!sites.length||!eligibleTools('request').length;
  }

  function receiverField() {
    const users = state().users || state().profiles || [];
    if (store().mode === 'live') {
      const recipients = users.filter(user => ['engineer','architect'].includes(user.role));
      const label=user=>`${user.name} · ${MCPAPermissions.labels[user.role]} · ${user.projects?.join(', ') || 'No assigned project'}`;
      return `<div class="field"><label for="mv-receiver">Receiving Engineer / Architect</label><select id="mv-receiver" name="receiverId" required><option value="">Choose a recipient</option>${recipients.map(user => {
        const same=recipients.filter(other=>label(other)===label(user)).sort((a,b)=>a.id.localeCompare(b.id));
        return `<option value="${esc(user.id)}">${esc(label(user))}${same.length>1?' · Person '+(same.findIndex(other=>other.id===user.id)+1):''}</option>`;
      }).join('')}</select><p class="mv-help">Only the named recipient can confirm receipt. For people with identical names and projects, scan their receiving QR to confirm the correct account.</p></div>`;
    }
    return `<div class="field"><label for="mv-receiver">Receiving Engineer / Architect</label><input id="mv-receiver" name="receiver" list="mv-receivers" required maxlength="120" placeholder="Choose an existing Engineer / Architect"><datalist id="mv-receivers">${users.filter(user => !user.role || ['engineer', 'engr', 'architect'].includes(user.role.toLowerCase())).map(user => `<option value="${esc(user.name || user.full_name)}">${user.role ? esc(user.role) : 'Role awaiting verification'}</option>`).join('')}</datalist><p class="mv-help">Only the named receiving Engineer or Architect can inspect and confirm receipt.</p></div>`;
  }

  function toolPicker(kind) {
    const available = eligibleTools(kind);
    const checks = kind === 'request' ? tools().map(tool => window.EquipmentTracking.requestability(tool,state())) : [];
    const unverified = checks.some(check => check.code === 'unknown');
    const verificationMessage = state().availabilityError
      ? 'The latest availability verification failed. Refresh to retry; previously loaded stock cannot be requested until verification succeeds.'
      : 'The server did not provide reservation verification for some stock. Ask Admin to update inventory availability verification, then refresh.';
    const blocked = checks.filter(check => ['reserved','transfer'].includes(check.code)).length;
    if (kind === 'repair' || kind === 'missing') {
      return `<div class="field"><label for="mv-tool">Tool</label><select id="mv-tool" name="toolId" required><option value="">Select a tool</option>${available.map(tool => `<option value="${esc(tool.id)}">${esc(tool.id)} · ${esc(tool.name)} · ${esc(tool.site)}</option>`).join('')}</select>${available.length ? '' : '<p class="mv-help">No eligible tools. Tools already reserved or in transit cannot be reported here.</p>'}</div>`;
    }
    const markup = `${unverified ? `<p class="mv-help" role="status" data-availability-warning>${esc(verificationMessage)}</p>` : ''}${blocked ? `<p class="mv-help" data-stock-blocked>${blocked} asset record(s) reserved or pending receipt; unavailable for new requests.</p>` : ''}<fieldset class="mv-tools"><legend>Choose asset records <span data-selected-count>0 selected</span></legend><label class="mv-sr" for="mv-tool-search">Search available tools</label><input id="mv-tool-search" class="mv-input" type="search" data-tool-search placeholder="Search tool name, ID or project"><div class="mv-tool-options">${available.length ? available.map(tool => `<label class="mv-tool-option" data-tool-text="${esc(`${tool.id} ${tool.name} ${tool.site}`.toLowerCase())}"><input type="checkbox" name="toolIds" value="${esc(tool.id)}"><span><strong>${esc(tool.name)}</strong><small>${esc(tool.id)} · ${esc(tool.site)}${operational() ? '' : ` · Qty ${esc(tool.qty)} (whole record)`}</small></span><span class="mv-tool-state">${esc(kind === 'request' ? 'Available to request' : display.status(tool.status, 'equipment'))}</span></label>`).join('') : `<p class="mv-help mv-empty-tools">${unverified ? 'Availability is unverified. Stock has not been confirmed unavailable.' : 'No eligible tools are available. Held, reserved, damaged, and pending-handover stock cannot be requested.'}</p>`}<p class="mv-help mv-empty-tools" data-tool-no-results hidden>No tools match this search.</p></div></fieldset>`;
    return kind === 'request' ? `<div data-request-stock>${markup}</div>` : markup;
  }

  function conditionFields(toolIds, prefix) {
    return toolIds.map(id => {
      const tool = toolById(id);
      const key = `${prefix}-${id}`;
      const canRefuse=prefix==='receive'&&canAdjust(detailRecord(),'refuseTransfer');
      const decision = prefix === 'receive' ? `<div class="field mv-custody-decision" data-decision-field hidden><label for="${esc(key)}-disposition">Custody decision for damaged equipment</label><select id="${esc(key)}-disposition" data-disposition disabled><option value="">Choose after reviewing the damage</option>${canRefuse?'<option value="declined">Refuse damaged handover</option>':''}<option value="accepted">Accept custody with recorded damage</option></select><p class="mv-help">Acceptance changes custody and records the damage. ${canRefuse?'Refusal holds all tools with the current holder and keeps the handover reserved for sender follow-up.':'If you cannot accept custody, contact the original sender before confirming.'} This record does not determine who caused the damage.</p></div>` : '';
      return `<div class="mv-inspection" data-inspection="${esc(id)}"><div class="mv-inspection-title"><strong>${esc(tool?.name || id)}</strong><span class="tool-id-chip">${esc(id)}</span></div>${prefix === 'receive' ? `<p class="mv-help">Current holder: <strong>${esc(tool?.holder || 'Unassigned')}</strong> · ${esc(tool?.site || 'Unassigned project')}</p>` : ''}<div class="field"><label for="${esc(key)}-condition">Inspected condition</label><select id="${esc(key)}-condition" data-condition required><option value="">Select after inspection</option><option value="good">Good — ready for use</option><option value="damaged">Damaged — needs repair</option><option value="lost">Missing — not received</option></select></div><div class="field"><label for="${esc(key)}-notes">Inspection notes <span class="mv-optional">(required for damaged or missing)</span></label><textarea id="${esc(key)}-notes" data-condition-notes rows="2" maxlength="2000" placeholder="Describe the condition and any pre-existing issue"></textarea></div>${decision}${prefix === 'receive' ? `<label class="checkbox-row"><input type="checkbox" data-tested> I tested this tool (not required for missing items).</label>` : ''}</div>`;
    }).join('');
  }

  function syncRequestStock() {
    if (current.kind !== 'request') return;
    const picker = current.root.querySelector('[data-request-stock]');
    if (!picker) return;
    const selected = new Set([...picker.querySelectorAll('[name="toolIds"]:checked')].map(input => input.value));
    const search = picker.querySelector('[data-tool-search]');
    const query = search?.value || '';
    const focused = document.activeElement === search;
    const replacement = document.createElement('div');
    replacement.innerHTML = toolPicker('request');
    const next = replacement.firstElementChild;
    picker.replaceWith(next);
    next.querySelectorAll('[name="toolIds"]').forEach(input => { input.checked = selected.has(input.value); });
    next.querySelector('[data-selected-count]').textContent = `${next.querySelectorAll('[name="toolIds"]:checked').length} selected`;
    const nextSearch = next.querySelector('[data-tool-search]');
    nextSearch.value = query;
    nextSearch.dispatchEvent(new Event('input', {bubbles:true}));
    if (focused) nextSearch.focus({preventScroll:true});
  }

  function returnDestinationField() {
    const office=current.returnOffice;
    const problem=current.returnOfficeError;
    return `<span class="mv-field-label">Return destination</span><div class="mv-fixed-destination" role="group" aria-label="Return destination"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5h12v16M16 11h4v10M2 21h20M8 9h4M8 13h4M8 17h4"/></svg><div><strong>Office</strong><p>Company equipment receiving location</p>${office&&office.name!=='Office'?`<small>${esc(office.name)}</small>`:''}</div></div>${problem?`<p class="mv-help" role="status">${esc(problem)}</p>${button('Retry Office connection','retry-office')}`:''}`;
  }

  async function loadReturnOffice(active) {
    if (active.kind!=='return' || !operational()) return;
    try {
      const office=await store().returnDestination();
      if (current!==active) return;
      active.returnOffice=office;active.returnOfficeError='';
    } catch(error) {
      if (current!==active) return;
      active.returnOffice=null;active.returnOfficeError=error.message||'The Office destination could not load. Retry or contact Admin.';
    }
    if (current!==active) return;
    const host=active.root.querySelector('[data-return-destination]');
    if(host)host.innerHTML=returnDestinationField();
    const submit=active.root.querySelector('[data-return-submit]');
    if(submit)submit.disabled=active.busy||!active.returnOffice||!eligibleTools('return').length;
  }

  function createForm() {
    if(current.kind==='return'&&mode()==='live')return '<p class="mv-help">New returns require individual Admin inspection. Open Returns from navigation to submit physical Asset IDs. Historical returns remain available below.</p>';
    const kind = current.kind;
    if (!operational() && kind !== 'request' && !(handler() && kind === 'transfer')) return '<aside class="card card-pad mv-guide"><h2>Review saved '+TITLES[kind].toLowerCase()+'</h2><p class="mv-help">Open a record to inspect its history and available follow-up actions. The named receiving Engineer or Architect confirms physical custody.</p></aside>';
    if (!operational() && !(handler() && kind === 'transfer')) return `<aside class="card card-pad mv-guide"><p class="eyebrow">Admin review</p><h2>Keep the handover moving</h2><ol><li>Review the engineer's selected tools and destination.</li><li>Approve to reserve the tools, or reject with a reason.</li><li>Release to generate a transfer code for the receiver.</li></ol><p class="mv-help">Stock and custody change as each movement is confirmed. Select a request to review it.</p></aside>`;
    const title = { request: 'Request tools', transfer: 'Create a transfer', return: 'Return tools', repair: 'Report a repair', missing: 'Report a missing tool' }[kind];
    const submit = { request: 'Submit request', transfer: 'Create transfer', return: 'Confirm return', repair: 'Submit repair report', missing: 'Submit missing report' }[kind];
    let fields = '';
    if (kind === 'request') fields = `${requestDestinationField()}<div class="field"><label for="mv-needed-until">Needed until (optional)</label><input id="mv-needed-until" name="neededUntil" type="date"></div><div class="field"><label for="mv-purpose">Purpose (optional)</label><textarea id="mv-purpose" name="purpose" rows="3" maxlength="2000" placeholder="What work are these tools needed for?"></textarea></div>`;
    if (kind === 'transfer') fields = `<div data-receiver-fields ${mode()==='live'?'hidden':''}>${siteField('destination', 'Destination project', true)}${receiverField()}</div><div class="field"><label for="mv-notes">Handover notes <span class="mv-optional">(optional)</span></label><textarea id="mv-notes" name="notes" rows="2" maxlength="2000" placeholder="Instructions for the receiver"></textarea></div>`;
    if (kind === 'return') fields = `<div class="field" data-return-destination>${returnDestinationField()}</div><div data-return-conditions></div><div class="field"><label for="mv-notes">Return notes <span class="mv-optional">(optional)</span></label><textarea id="mv-notes" name="notes" rows="2" maxlength="2000"></textarea></div><p class="mv-help">Confirm after delivering the equipment to Office and inspecting it. Good tools become available; damaged tools go to repair. Missing items retain their last holder and location for follow-up.</p>`;
    if (kind === 'repair' || kind === 'missing') fields = `<div class="field"><label for="mv-notes">${kind === 'repair' ? 'Damage / issue details' : 'Last seen and circumstances'}</label><textarea id="mv-notes" name="notes" required rows="4" maxlength="2000" placeholder="${kind === 'repair' ? 'Describe the fault and when it occurred' : 'Describe the last known location and what happened'}"></textarea></div><p class="mv-help">Submitting updates the tool's status and adds it to the admin ${kind === 'repair' ? 'repair queue' : 'missing tools register'}.</p>`;
    // Hidden manual fields cannot receive native validation focus. Require them
    // when revealed, and explicitly require a receiver before submission below.
    if(kind==='transfer'&&mode()==='live')fields=fields.replaceAll(' required','');
    return `<section class="card card-pad mv-create"><h2>${title}</h2><p class="mv-help mv-identity">${esc(context().name ? `Submitting as ${context().name}` : 'Sign in to submit movements.')}</p><form data-form="create">${kind==='transfer'?`${mode()==='live'?`<div class="mv-receiver-assist">${button('Scan Receiver QR','scan-receiver',null,'btn-accent')}<p class="mv-help">Scan the receiving person's QR to fill their name and assigned project. Scanning does not move equipment.</p><p data-receiver-context role="status"></p><button type="button" class="btn btn-secondary btn-sm" data-action="manual-receiver">Enter Details Manually</button></div>`:''}`:""}${toolPicker(kind)}${fields}<button class="btn btn-primary btn-block" type="submit"${kind==='return'?' data-return-submit':kind==='request'?' data-request-submit':''}${!eligibleTools(kind).length || (kind==='return'&&!current.returnOffice) || (kind==='request'&&mode()==='live'&&!requestSites().length) ? ' disabled' : ''}>${submit}</button></form></section>`;
  }

  function transferLookup() {
    return `<section class="card card-pad mv-receive"><div class="mv-section-heading"><div><p class="eyebrow">Incoming handover</p><h2>Receive a transfer</h2></div>${window.Html5Qrcode ? button('Scan Handover QR', 'camera') : ''}</div><p class="mv-help">Enter the transfer code shared by the sender, then inspect every tool.</p><form data-form="lookup" class="mv-lookup"><label class="mv-sr" for="mv-code">Transfer code</label><input id="mv-code" name="code" class="mv-input" required maxlength="150" autocomplete="off" placeholder="e.g. TRF-000001"><button class="btn btn-accent" type="submit">Find transfer</button></form><div data-camera hidden><div id="mv-camera"></div>${button('Stop camera', 'stop-camera')}</div></section>`;
  }

  function receivingQrPanel(){
    return `<section class="card card-pad"><h2>Your receiving QR</h2><p class="mv-help">Show this to the sender before they create a transfer. Your handover code is separate and is used after dispatch.</p><div data-receiving-projects><p class="mv-help">Loading your assigned receiving projects…</p></div><div data-own-qr></div></section>`;
  }

  function transferTabs(){
    const options=[...((operational()||handler())?[['send','Send Transfer']]:[]),...(operational()?[['receive','Receive Transfer']]:[]),['history','History']];
    return `<div class="mv-tabs" role="tablist" aria-label="Transfer workflow">${options.map(([id,label])=>`<button type="button" class="btn btn-secondary" role="tab" id="mv-tab-${id}" aria-controls="mv-panel-${id}" aria-selected="${current.transferView===id}" tabindex="${current.transferView===id?0:-1}" data-transfer-tab="${id}">${label}</button>`).join('')}</div>`;
  }

  function setTransferView(view){
    if(!current||current.kind!=='transfer')return;
    if(!current.root.querySelector(`[data-transfer-tab="${view}"]`))return;
    current.transferView=view;
    current.root.querySelectorAll('[data-transfer-tab]').forEach(tab=>{const selected=tab.dataset.transferTab===view;tab.setAttribute('aria-selected',selected);tab.tabIndex=selected?0:-1;});
    current.root.querySelectorAll('[data-transfer-panel]').forEach(panel=>panel.hidden=panel.dataset.transferPanel!==view);
    void stopCamera();
  }

  async function receivingProjects(){
    const active=current,host=active?.root.querySelector('[data-receiving-projects]');
    if(!host)return;
    if(mode()!=='live'){host.innerHTML='<p class="mv-help">Receiving QR is available for authenticated company accounts.</p>';return;}
    try{
      const {data,error}=await window.EquipmentTracking.client().rpc('mcpa_project_snapshot');
      if(error)throw new Error('Assigned projects could not load. Check your connection and retry.');
      if(current!==active)return;
      active.receivingSites=(data?.sites||[]).filter(site=>site.is_active&&site.assigned_engineer_id===context().id);
      host.innerHTML=active.receivingSites.length?`<div class="field"><label for="mv-receiving-site">Receiving project</label><select id="mv-receiving-site" ${active.receivingSites.length===1?'disabled':''}>${active.receivingSites.map(site=>`<option value="${esc(site.id)}">${esc(site.name)}</option>`).join('')}</select></div>${button('Generate My Receiving QR','generate-receiver',null,'btn-accent')}`:'<p class="mv-help">No assigned receiving project. Contact your administrator.</p>';
    }catch(error){if(current===active)host.innerHTML=`<p role="alert">${esc(display.errorText(error))}</p>${button('Retry projects','retry-projects')}`;}
  }

  async function qrRpc(name,args){
    window.MCPAAuth.requireLive();
    const {data,error}=await window.EquipmentTracking.client().rpc(name,args);
    if(error)throw new Error(['22023','42501'].includes(error.code)?error.message:'Receiving QR service is unavailable. Check your connection or contact your administrator.');
    return data;
  }

  async function generateReceivingQr(){
    const active=current;
    if(active.qrBusy)return;active.qrBusy=true;
    try{
      const data=await qrRpc('mcpa_create_receiving_qr',{p_site_id:active.root.querySelector('#mv-receiving-site').value});
      if(current!==active)return;
      active.ownQr=data;
      const host=active.root.querySelector('[data-own-qr]');
      host.innerHTML=`<p><strong>${esc(data.receiver_name)}</strong><br>${esc(data.site_name)}</p><div class="mv-qr-image" data-receiver-qr></div><p class="mv-help" data-qr-expiry>Expires ${esc(date(data.expires_at))}. Generating another QR revokes this one.</p>${button('Revoke receiving QR','revoke-receiver')}`;
      if(window.QRCode)new window.QRCode(host.querySelector('[data-receiver-qr]'),{text:'MCPA-RECEIVER:'+data.token,width:220,height:220});
      else host.querySelector('[data-receiver-qr]').textContent='QR display could not load. The sender can enter your details manually.';
      clearTimeout(active.qrExpiry);
      active.qrExpiry=setTimeout(()=>{if(current===active){host.querySelector('[data-receiver-qr]')?.replaceChildren();host.querySelector('[data-qr-expiry]').textContent='This receiving QR expired. Generate a new one.';}},Math.max(0,new Date(data.expires_at)-Date.now()));
    }catch(error){if(current===active)notify(error.message,true);}
    finally{active.qrBusy=false;}
  }

  async function resolveReceivingQr(decoded){
    const active=current;
    if(!/^MCPA-RECEIVER:[a-f0-9]{64}$/.test(decoded))throw new Error('This is not a receiving QR. Ask the receiving person to generate their receiving QR.');
    const token=decoded.slice('MCPA-RECEIVER:'.length),data=await qrRpc('mcpa_resolve_receiving_qr',{p_token:token});
    if(current!==active)return;
    const form=active.root.querySelector('[data-form="create"]');
    for(const [name,value,label] of [['receiverId',data.receiver_id,data.receiver_name],['destination',data.site_name,data.site_name]]){
      const select=form.elements[name];
      if(![...select.options].some(option=>option.value===value)){const option=new Option(label,value);select.add(option);}
      select.value=value;
    }
    active.receivingToken=token;active.createDirty=true;
    form.querySelector('[data-receiver-fields]').hidden=false;
    form.querySelectorAll('[data-receiver-fields] select').forEach(select=>select.required=true);
    form.querySelector('[data-receiver-context]').textContent=`Verified receiving account: ${data.receiver_name} · ${data.site_name}. Review these details before creating the transfer.`;
    form.querySelector('[data-receiver-context]').tabIndex=-1;form.querySelector('[data-receiver-context]').focus();
  }

  function descriptions() {
    return {
      request: admin() ? 'Review requests, reserve tools and release them for a documented handover.' : 'Request available tools and follow approval, release and receipt in one place.',
      transfer: 'Create a handover, share its code and record the condition of every tool received.',
      return: 'Close tool custody and send damaged or missing items to the right follow-up queue.',
      repair: admin() ? 'Track reported faults, start repairs and return completed tools to service.' : 'Report tool faults and track repair progress with the admin team.',
      missing: admin() ? 'Review missing-tool reports and record recovery with an inspected condition.' : 'Record missing tools with their last known details and track their recovery.'
    }[current.kind];
  }

  function renderShell() {
    if (!current) return;
    const transfer=current.kind==='transfer';
    const list=`<section class="card mv-records${transfer || current.kind==='request'?' mv-transfer-history':''}"><div class="mv-record-header"><h2>${transfer?'Transfer history':(admin()?'All':'Your')+' '+TITLES[current.kind].toLowerCase()}</h2><div class="mv-list-filters"><label class="mv-sr" for="mv-search">Search movement records</label><input id="mv-search" class="mv-input" type="search" data-record-search placeholder="Search ID, tool, person or project" value="${esc(current.search)}"><label class="mv-sr" for="mv-status">Filter by status</label><select id="mv-status" class="mv-input" data-status><option value="">All statuses</option></select></div></div><div data-list></div></section>`;
    const workspace=transfer?`${transferTabs()}<section role="tabpanel" id="mv-panel-send" aria-labelledby="mv-tab-send" data-transfer-panel="send"><div data-create-panel>${createForm()}</div></section>${operational()?`<section role="tabpanel" id="mv-panel-receive" aria-labelledby="mv-tab-receive" data-transfer-panel="receive"><div class="mv-receive-grid">${receivingQrPanel()}${transferLookup()}</div><section class="card card-pad"><h2>Incoming transfers awaiting confirmation</h2><div data-incoming></div></section></section>`:''}<section role="tabpanel" id="mv-panel-history" aria-labelledby="mv-tab-history" data-transfer-panel="history">${list}</section>`:`<div class="mv-workspace"><div data-create-panel>${createForm()}</div><div class="mv-record-area">${list}</div></div>`;
    current.root.innerHTML=`<div class="movement-ui"><div class="page-head"><div><p class="eyebrow">Tool movement</p><h1 class="display">${TITLES[current.kind]}</h1><p class="sub">${descriptions()}</p></div></div><p class="sync-warning" data-sync-warning role="status"></p><div data-notice role="status" aria-live="polite"></div>${mode()==='demo'?'<div class="mv-demo-banner">Offline demo &middot; browser records</div>':''}<div data-summary class="mv-summary"></div>${workspace}<dialog id="movement-detail" class="mv-detail" data-detail aria-label="Movement details"><div data-detail-body></div></dialog><dialog class="mv-scanner" data-scanner-dialog aria-labelledby="mv-scanner-title"><div class="mv-section-heading"><h2 id="mv-scanner-title">Scan Receiver QR</h2>${button('Close','close-scanner')}</div><p class="mv-help">Ask the recipient to open Receive Transfer and generate their receiving QR.</p><div id="mv-receiver-camera"></div><p data-scanner-error role="alert"></p>${button('Try camera again','scan-receiver')}</dialog></div>`;
    const detail=current.root.querySelector('[data-detail]');
    detail.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
    detail.addEventListener('close',()=>{
      // Some native back/close requests are non-cancelable. Keep an unsaved form
      // intact until our explicit close path has confirmed discarding it.
      if(current?.root.contains(detail)&&current.detailId&&current.detailDirty&&!detail.open)detail.showModal();
      syncModalLock();
    });
    detail.addEventListener('click',event=>{if(event.target===detail){const r=detail.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDetail();}});
    const scanner=current.root.querySelector('[data-scanner-dialog]');
    scanner.addEventListener('cancel',event=>{event.preventDefault();void stopCamera();scanner.close();syncModalLock();});
    scanner.addEventListener('close',()=>{if(!scanner.open){void stopCamera();syncModalLock();}});
    renderLists();renderNotice();
    if(transfer){setTransferView(current.transferView);void receivingProjects();}
    if(current.detailId)renderDetail();
  }

  function syncModalLock(){document.documentElement.classList.toggle('movement-modal-open',Boolean(current?.root.querySelector('dialog[open]')));}
  function closeDetail(){
    if(!current||current.busy)return;
    if(current.detailDirty&&!window.confirm('Discard your unsaved inspection or notes?'))return;
    current.detailDirty = false;
    if (window.MCPAMovementLinks?.parse(location.hash).record) {
      if (window.MCPANavigation?.canBack()) window.MCPANavigation.back();
      else showScreen(current.kind, null, {history:'replace'});
      return;
    }
    const detail=current.root.querySelector('[data-detail]');
    const id=current.detailId;
    cancelTarget();current.detailId='';current.detailDirty=false;detail.close();syncModalLock();renderLists();
    const visible=element=>element?.isConnected&&element.getClientRects().length>0;
    const focus=[...current.root.querySelectorAll('button[data-action="view"]')].find(button=>button.dataset.id===id&&visible(button))||current.detailFocus;
    if(visible(focus))focus.focus({preventScroll:true});
    else current.root.querySelector('[data-transfer-tab][aria-selected="true"], [data-record-search]')?.focus({preventScroll:true});
  }

  function renderNotice() {
    const host = current?.root.querySelector('[data-notice]');
    if (!host) return;
    host.innerHTML = current.message ? `<div class="mv-notice ${current.error ? 'mv-notice-error' : 'mv-notice-success'}">${esc(current.message)}${button('Dismiss', 'dismiss')}</div>` : '';
    host.setAttribute('role', current.error ? 'alert' : 'status');
    const modal=current.root.querySelector('[data-detail][open] [data-modal-feedback]');
    if(modal){modal.textContent=current.message||'';modal.setAttribute('role',current.error?'alert':'status');}
  }

  function notify(message, error) {
    if (!current) return;
    current.message = error ? display.errorText(message) : message;
    current.error = Boolean(error);
    renderNotice();
  }

  function transferCard(record) {
    const request = current.kind === 'request';
    const toolIds=ids(record);
    // Source projects come from the saved handover, never a tool's current site.
    const sources=[...new Set((Array.isArray(record.source)?record.source:[]).map(item=>item?.site).filter(site=>typeof site==='string'&&site.trim()))];
    const row=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value||'—')}</dd></div>`;
    const headingId=`mv-history-${record.id}`;
    const created=new Date(record.createdAt);
    return `<li><article class="mv-transfer-card${record.id===current.detailId?' mv-selected-row':''}" aria-labelledby="${esc(headingId)}" data-action="view" data-id="${esc(record.id)}">
      <header class="mv-transfer-card-top"><h3 id="${esc(headingId)}"><span class="tool-id-chip">${esc(record.id)}</span></h3>${badge(recordStatus(record),current.kind)}</header>
      <ul class="mv-transfer-equipment" aria-label="Equipment">${toolIds.slice(0,2).map(id=>{
        const tool=toolById(id);
        return `<li>${tool?.name?`<strong>${esc(tool.name)}</strong>`:''}<span class="mv-transfer-tool-id">${esc(id)}</span></li>`;
      }).join('')}</ul>
      ${toolIds.length>2?`<p class="mv-transfer-more">+ ${toolIds.length-2} more equipment items in details</p>`:''}
      ${request ? `<dl class="mv-transfer-projects">${row('Requested by',record.requester)}</dl>` : `<dl class="mv-transfer-people">${row('From',record.sender)}${row('To',record.receiver)}</dl>`}
      <dl class="mv-transfer-projects">${sources.length?row(sources.length>1?'Source projects':'Source project',sources.join(', ')):''}${row('Destination',record.destination)}</dl>
      <footer class="mv-transfer-card-footer"><span class="mv-transfer-date"><span class="mv-sr">${request ? 'Submitted' : 'Transfer date'}: </span>${record.createdAt&&!isNaN(created.getTime())?`<time datetime="${esc(created.toISOString())}">${esc(date(record.createdAt))}</time>`:esc(date(record.createdAt))}</span><button type="button" class="btn btn-secondary" data-action="view" data-id="${esc(record.id)}" aria-label="View details for ${request ? 'request' : 'transfer'} ${esc(record.id)}">View details</button></footer>
    </article></li>`;
  }

  function renderLists() {
    if (!current?.root.isConnected) return;
    syncRequestDestination();
    const records = visibleRecords();
    const incoming=current.root.querySelector('[data-incoming]');
    if(incoming){
      const rows=records.filter(record=>record.status==='pending'&&(mode()==='live'?record.receiverId===context().id:record.receiver===context().name));
      incoming.innerHTML=rows.length?rows.map(record=>`<div class="mv-incoming-row"><div><strong>${esc(record.id)}</strong><p class="mv-help">${esc(toolNames(record))} · From ${esc(record.sender)} · ${esc(record.destination)}</p></div>${button('Inspect','view',record.id,'btn-accent')}</div>`).join(''):'<p class="mv-help">No incoming transfers awaiting your confirmation.</p>';
    }
    const statusSelect = current.root.querySelector('[data-status]');
    if (!statusSelect) return;
    const statuses = [...new Set(records.map(recordStatus))];
    statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map(status => `<option value="${esc(status)}">${esc(statusLabel(status,current.kind))}</option>`).join('');
    statusSelect.value = statuses.includes(current.status) ? current.status : '';
    if (!statusSelect.value) current.status = '';
    const open = records.filter(record => !['received', 'rejected', 'completed', 'recovered', 'returned'].includes(recordStatus(record))).length;
    const summary = current.root.querySelector('[data-summary]');
    if (summary) summary.innerHTML = `<div><span class="mv-summary-number">${records.length}</span><span>total ${TITLES[current.kind].toLowerCase()}</span></div><div><span class="mv-summary-number">${open}</span><span>${current.kind === 'transfer' ? 'awaiting receipt' : 'open records'}</span></div><div><span class="mv-summary-number">${current.kind === 'request' && tools().some(tool => window.EquipmentTracking.requestability(tool,state()).code === 'unknown') ? 'Unverified' : eligibleTools(current.kind).length}</span><span>eligible tools</span></div>`;
    const query = current.search.toLowerCase();
    const filtered = records.filter(record => (!current.status || recordStatus(record) === current.status) && `${record.id} ${toolNames(record)} ${record.destination || ''} ${record.requester || record.sender || record.returnedBy || record.reportedBy || ''} ${record.receiver || ''} ${record.notes || ''}`.toLowerCase().includes(query)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const list = current.root.querySelector('[data-list]');
    list.innerHTML = filtered.length ? `<div class="table-wrap${['request','transfer'].includes(current.kind)?' mv-transfer-table':''}"><table><thead><tr><th>Movement / tools</th><th>Details</th><th>Status</th><th><span class="mv-sr">Actions</span></th></tr></thead><tbody>${filtered.map(record => `<tr${record.id === current.detailId ? ' class="mv-selected-row"' : ''}><td><span class="tool-id-chip">${esc(record.id)}</span><div class="cell-name mv-record-tools">${esc(toolNames(record))}</div><div class="cell-sub">${esc(date(record.createdAt))}</div></td><td><div class="cell-name">${esc(record.destination || toolById(record.toolId)?.site || '—')}</div><div class="cell-sub">${esc(record.requester || record.sender || record.returnedBy || record.reportedBy || '—')}</div>${record.receiver ? `<div class="cell-sub">To ${esc(record.receiver)}</div>` : ''}</td><td>${badge(recordStatus(record), current.kind)}</td><td>${button('View', 'view', record.id)}</td></tr>`).join('')}</tbody></table></div>${['request','transfer'].includes(current.kind)?`<ul class="mv-transfer-cards" aria-label="${current.kind==='request'?'Request':'Transfer'} history">${filtered.map(transferCard).join('')}</ul>`:''}` : `<div class="empty-state"><div class="t">${records.length ? 'No matching movements' : `No ${TITLES[current.kind].toLowerCase()} yet`}</div><div class="d">${records.length ? 'Try another search or status filter.' : current.kind === 'request' && admin() ? 'Submitted engineer requests will appear here for review.' : 'Create a movement to start its history here.'}</div></div>`;
  }

  function detailRecord() {
    return (state()[COLLECTIONS[current.kind]] || []).find(record => record.id === current.detailId);
  }

  function adjustmentForm(record, action) {
    const labels = {withdrawRequest:'Withdraw request',cancelReservation:'Cancel reservation',cancelTransfer:'Cancel handover',reopenTransfer:'Reopen for receiver inspection'};
    const help = action === 'withdrawRequest' ? 'Withdraw your pending request. Its original record and history remain available.' : action === 'cancelReservation' ? 'Release the allocation for your unfulfilled request. Its original record and history remain available.' : action === 'reopenTransfer' ? 'Ask the named receiver to inspect this handover again. Custody and reservations remain unchanged.' : record.requestId ? 'Cancel this unreceived handover and close its linked request. Custody stays unchanged. Submit a new request if equipment is still needed.' : 'Cancel this unreceived handover. Custody stays with the original holder and the handover allocation is released.';
    return `<form data-form="adjust-movement" data-method="${action}" data-id="${esc(record.id)}" class="mv-followup"><h3>${labels[action]}</h3><p class="mv-help">${help}</p><div class="field"><label for="mv-${action}-reason">Reason</label><textarea id="mv-${action}-reason" name="reason" required maxlength="2000" rows="2" placeholder="Explain why this action is needed"></textarea></div><label class="checkbox-row"><input type="checkbox" name="confirmed" value="yes" required> I confirm this action for ${esc(record.id)}.</label><button class="btn ${action === 'reopenTransfer' ? 'btn-secondary' : 'btn-danger'} btn-sm" type="submit">${labels[action]}</button></form>`;
  }

  function renderDetail() {
    const dialog = current?.root.querySelector('[data-detail]');
    const host = dialog?.querySelector('[data-detail-body]');
    if (!host) return;
    const record = detailRecord();
    if (!record) { dialog.close(); syncModalLock(); return; }
    current.detailDirty = false;
    const kind = current.kind;
    const row = (label, value) => value ? `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
    let actions = '';
    if (kind === 'request' && admin() && record.status === 'pending') actions = `<div class="mv-action-row">${button('Approve request', 'approve', record.id, 'btn-accent')}</div><form data-form="reject" data-id="${esc(record.id)}" class="mv-followup"><div class="field"><label for="mv-reason">Reason for rejection</label><textarea id="mv-reason" name="reason" required maxlength="2000" rows="2" placeholder="Explain what needs to change"></textarea></div><button class="btn btn-danger btn-sm" type="submit">Reject request</button></form>`;
    if (kind === 'request' && admin() && record.status === 'approved') actions = `<p class="mv-help">The selected tools are reserved. Release them when they are ready for collection.</p><div class="mv-action-row">${button('Release tools & create transfer', 'release', record.id, 'btn-accent')}</div>`;
    if (kind === 'request' && record.transferId) actions += `<div class="mv-transfer-code"><span>Handover code</span><strong>${esc(record.transferId)}</strong>${button('Open transfer', 'open-transfer', record.transferId)}</div>`;
    if (kind === 'request') {
      if (canAdjust(record,'withdrawRequest')) actions += adjustmentForm(record,'withdrawRequest');
      if (canAdjust(record,'cancelReservation')) actions += adjustmentForm(record,'cancelReservation');
    }
    if (kind === 'transfer') {
      actions = `<div class="mv-transfer-code"><span>Share this code with ${esc(record.receiver)}</span><strong>${esc(record.code || record.id)}</strong>${button('Copy handover code', 'copy', record.code || record.id)}<div data-transfer-qr></div></div>`;
      if (record.status === 'pending' && (operational() && (mode() === 'live' ? record.receiverId === context().id : record.receiver === context().name))) actions += `<form data-form="receive" data-id="${esc(record.id)}" class="mv-followup"><h3>Inspect the handover</h3><p class="mv-help">Choose a condition for every tool. Accepted damage and missing items open follow-up reports. Refusing damaged equipment holds the whole handover for the accountable sender.</p>${conditionFields(ids(record), 'receive')}<div data-refusal-fields hidden><div class="field"><label for="mv-refusal-reason">Reason for refusing this handover</label><textarea id="mv-refusal-reason" name="refusalReason" maxlength="2000" rows="2" disabled></textarea></div><label class="checkbox-row"><input type="checkbox" name="refusalConfirmed" value="yes" disabled> I confirm refusal of this handover. Custody and reservations remain unchanged.</label></div><button type="submit" class="btn btn-primary btn-block" data-receipt-submit>Confirm receipt of all inspected tools</button></form>`;
      else if (record.status === 'pending') actions += `<p class="mv-help">Waiting for ${esc(record.receiver)} to inspect and confirm this transfer.</p>`;
      if (record.status === 'refused') actions += `<p class="mv-help">Damage was refused. Custody and reservations remain held. The original field sender can reopen for inspection or cancel; the requester can cancel an initial request-linked handover. Admin can monitor this record.</p>`;
      if (canAdjust(record,'cancelTransfer')) actions += adjustmentForm(record,'cancelTransfer');
      if (canAdjust(record,'reopenTransfer')) actions += adjustmentForm(record,'reopenTransfer');
    }
    if (kind === 'repair' && admin() && record.status === 'reported') actions = `<div class="mv-action-row">${button('Start repair', 'start-repair', record.id, 'btn-accent')}</div>`;
    if (kind === 'repair' && admin() && record.status === 'underrepair') actions += `<form data-form="complete-repair" data-id="${esc(record.id)}" class="mv-followup"><h3>Return to service</h3>${siteField('repairDestination', 'Available at project', true, toolById(record.toolId)?.site)}<div class="field"><label for="mv-resolution">Repair completion notes</label><textarea name="notes" id="mv-resolution" required rows="2" maxlength="2000" placeholder="Describe the repair and checks performed"></textarea></div><button class="btn btn-primary" type="submit">Complete repair</button></form>`;
    if (kind === 'missing' && admin() && record.status === 'missing') actions = `<form data-form="recover" data-id="${esc(record.id)}" class="mv-followup"><h3>Record recovery</h3>${siteField('recoveryDestination', 'Recovered at project', true, toolById(record.toolId)?.site)}<div class="field"><label for="mv-recovered-condition">Recovered condition</label><select name="condition" id="mv-recovered-condition" required><option value="">Select inspected condition</option><option value="good">Good — available for use</option><option value="damaged">Damaged — send for repair</option></select></div><div class="field"><label for="mv-recovery-notes">Recovery details</label><textarea id="mv-recovery-notes" name="notes" required rows="2" maxlength="2000" placeholder="Where and how was the tool recovered?"></textarea></div><button class="btn btn-primary" type="submit">Confirm recovery</button></form>`;
    const inspections = record.inspections || record.refusalInspections || record.conditions || [];
    const requestIntro = kind === 'request' ? current.requestIntro?.(record) || '' : '';

    host.innerHTML = `<div class="mv-section-heading mv-detail-heading"><div><h2>${esc(record.id)}</h2></div>${button('Close', 'close-detail')}</div>${badge(recordStatus(record), kind)}${requestIntro}<div class="mv-detail-tools">${ids(record).map(id => `<div><span class="tool-id-chip">${esc(id)}</span> ${esc(toolById(id)?.name || '')}</div>`).join('')}</div>${row('Created', date(record.createdAt))}${row('Requested by', record.requester)}${row('Sent by', record.sender)}${row('Returned by', record.returnedBy)}${row('Reported by', record.reportedBy)}${row('Receiver', record.receiver)}${row('Destination', record.destination)}${row('Needed until', record.neededUntil ? display.date(record.neededUntil) : '')}${row('Purpose', record.purpose)}${row('Notes', record.notes)}${row('Rejection reason', record.reason)}${row('Canceled / withdrawn by', record.canceledBy)}${row('Canceled / withdrawn', record.canceledAt ? date(record.canceledAt) : '')}${row('Cancellation reason', record.cancellationReason)}${row('Refused by', record.refusedBy)}${row('Refused', record.refusedAt ? date(record.refusedAt) : '')}${row('Refusal reason', record.refusalReason)}${row('Reopened by', record.reopenedBy)}${row('Reopened', record.reopenedAt ? date(record.reopenedAt) : '')}${row('Reopening reason', record.reopenReason)}${row('Received', record.receivedAt ? date(record.receivedAt) : '')}${row('Resolution', record.resolutionNotes || record.completionNotes || record.recoveryNotes || record.resolution)}${inspections.length ? `<div class="mv-inspection-results"><h3>Recorded condition</h3>${inspections.map(item => `<div class="kv"><span class="k">${esc(item.toolId)}</span><span class="v">${esc(display.condition(item.condition))}${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</span></div>`).join('')}</div>` : ''}${actions}<p data-modal-feedback role="status"></p>`;
    if(!dialog.open){current.detailFocus=document.activeElement;dialog.showModal();syncModalLock();host.querySelector('[data-action="close-detail"]').focus({preventScroll:true});}
    if (kind === 'transfer' && window.QRCode) {
      try { new window.QRCode(host.querySelector('[data-transfer-qr]'), { text: record.code || record.id, width: 128, height: 128 }); } catch (_) { /* The manual transfer code remains available. */ }
    }
  }

  function syncReturnConditions() {
    const host = current.root.querySelector('[data-return-conditions]');
    if (!host) return;
    const existing = new Map([...host.querySelectorAll('[data-inspection]')].map(item => [item.dataset.inspection, item]));
    const selected = [...current.root.querySelectorAll('[name="toolIds"]:checked')].map(input => input.value);
    host.replaceChildren();
    selected.forEach(id => {
      if (existing.has(id)) host.append(existing.get(id));
      else host.insertAdjacentHTML('beforeend', conditionFields([id], 'return'));
    });
  }

  function readConditions(form) {
    return [...form.querySelectorAll('[data-inspection]')].map(item => {
      const condition = item.querySelector('[data-condition]').value;
      const notes = item.querySelector('[data-condition-notes]').value.trim();
      if (!condition) throw new Error('Inspect every selected tool before confirming.');
      if (condition !== 'good' && !notes) throw new Error('Add inspection notes for every damaged or missing tool.');
      const tested = item.querySelector('[data-tested]')?.checked;
      if (form.dataset.form === 'receive' && condition !== 'lost' && !tested) throw new Error('Test each received tool before confirming receipt.');
      const disposition = condition === 'damaged' ? item.querySelector('[data-disposition]')?.value : condition === 'lost' ? 'declined' : 'accepted';
      if (form.dataset.form === 'receive' && !disposition) throw new Error('Choose a custody decision for each damaged tool.');
      return { toolId: item.dataset.inspection, condition, notes, ...(tested !== undefined ? {tested, disposition} : {}) };
    });
  }

  async function perform(operation, message, options) {
    const active = current;
    if (!active || active.busy) return;
    active.busy = true;
    const controls = [...active.root.querySelectorAll('button, input, select, textarea')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    active.root.setAttribute('aria-busy', 'true');
    try {
      const result = await operation();
      if (current !== active) return result;
      if (options?.resetCreate || !active.createDirty) {
        active.receivingToken=null;
        active.root.querySelector('[data-create-panel]').innerHTML = createForm();
        active.createDirty = false;
      }
      active.detailDirty=false;
      if (options?.showResult && result?.id) active.detailId = result.id;
      renderLists();
      if (!options?.preserveDetail || !active.detailDirty) renderDetail();
      notify(typeof message === 'function' ? message(result) : message);
      return result;
    } catch (error) {
      if (current === active) notify(error.message || 'The movement could not be saved. Please refresh and try again.', true);
    } finally {
      active.busy = false;
      controls.forEach((control, index) => { if (control.isConnected) control.disabled = disabled[index]; });
      active.root.removeAttribute('aria-busy');
      if (current === active) syncRequestDestination();
    }
  }

  async function submit(event) {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (current.busy) return;
    if(form.dataset.form==='create'&&current.kind==='transfer'&&!form.elements.receiverId?.value&&mode()==='live'){notify('Scan a receiving QR or enter the recipient and destination manually.',true);return;}
    if(!form.reportValidity())return;
    const data = new FormData(form);
    const value = name => String(data.get(name) || '').trim();
    const action = form.dataset.form;
    try {
      if (action === 'lookup') {
        const code = value('code');
        await perform(async () => {
          await store().refresh();
          const transfer = store().findTransfer(code);
          if (!transfer) throw new Error('No transfer found for that code. Check the code and data source.');
          current.detailId = transfer.id;
          return transfer;
        }, 'Transfer found. Review the handover before confirming receipt.');

        return;
      }
      if (action === 'create') {
        const kind = current.kind;
        const toolIds = data.getAll('toolIds');
        if (['request', 'transfer', 'return'].includes(kind) && !toolIds.length) throw new Error('Select at least one tool.');
        if (kind === 'request' && toolIds.some(id => !eligibleTools('request').some(tool => tool.id === id))) throw new Error('Selected stock is no longer verified as available. Refresh and select eligible equipment again.');
        const payload = { toolIds, destination: value('destination'), receiver: value('receiver'), purpose: value('purpose'), notes: value('notes'), toolId: value('toolId'), neededUntil: value('neededUntil') };
        if(kind==='request'&&mode()==='live'&&!requestSites().some(site=>site.name===payload.destination))throw new Error(requestSites().length?'Choose a project assigned to your account.':noRequestProject);
        if (store().mode === 'live') { delete payload.receiver; if (kind === 'transfer') {payload.receiverId = value('receiverId');if(current.receivingToken)payload.receivingToken=current.receivingToken;} }
        if (kind === 'return') {
          if(!current.returnOffice)throw new Error('The company Office destination is unavailable. Retry the Office connection or contact Admin.');
          payload.destination=current.returnOffice.name;payload.destinationId=current.returnOffice.id;
          payload.conditions = readConditions(form);
        }
        const methods = { request: 'createRequest', transfer: 'createTransfer', return: 'createReturn', repair: 'reportRepair', missing: 'reportMissing' };
        if(kind==='return'&&mode()==='live')throw new Error('Use the inspected return submission screen from navigation.');
        await perform(() => store()[methods[kind]](payload), result => kind === 'transfer' ? `Transfer ${result?.code || result?.id || ''} created. Share the code with the receiver.` : `${TITLES[kind] === 'Missing tools' ? 'Missing report' : { request: 'Request', return: 'Return', repair: 'Repair report' }[kind]} saved successfully.`, { resetCreate: true, showResult: true });
      } else if (action === 'reject') await perform(() => store().rejectRequest(form.dataset.id, value('reason')), 'Request rejected. The reason is visible to the requester.');
      else if (action === 'adjust-movement') {
        const method=form.dataset.method;
        if(!['withdrawRequest','cancelReservation','cancelTransfer','reopenTransfer'].includes(method))throw new Error('Unknown movement action. Refresh and try again.');
        const reason=value('reason'),confirmed=value('confirmed')==='yes';
        if(!reason||!confirmed)throw new Error('Enter a reason and confirm the action before submitting.');
        await perform(() => store()[method](form.dataset.id,{reason,confirmed}),method==='reopenTransfer'?'Handover reopened. The named receiver can inspect it again.':method==='withdrawRequest'?'Request withdrawn. Its history remains available.':'Movement canceled. Custody is unchanged and the allocation has been released.');
      }
      else if (action === 'receive') {
        const inspections = readConditions(form);
        const refused=inspections.some(item=>item.condition==='damaged'&&item.disposition==='declined');
        if(refused){
          if(!canAdjust(detailRecord(),'refuseTransfer'))throw new Error('Damage refusal is unavailable for this account or handover. Refresh and try again.');
          const reason=value('refusalReason'),confirmed=value('refusalConfirmed')==='yes';
          if(!reason||!confirmed)throw new Error('Enter a refusal reason and confirm the refusal.');
          await perform(() => store().refuseTransfer(form.dataset.id,{inspections,reason,confirmed}),'Damage refusal recorded. Custody and reservations are held for sender follow-up.');
        }else await perform(() => store().receiveTransfer(form.dataset.id, { inspections }), 'Receipt confirmed. Custody and any repair or missing reports have been updated.', { resetCreate: true });
      } else if (action === 'complete-repair') await perform(() => store().completeRepair(form.dataset.id, { notes: value('notes'), destination: value('repairDestination') }), 'Repair completed. The tool is available for use.', { resetCreate: true });
      else if (action === 'recover') await perform(() => store().recoverMissing(form.dataset.id, { condition: value('condition'), notes: value('notes'), destination: value('recoveryDestination') }), value('condition') === 'damaged' ? 'Recovery recorded. A repair report has been opened.' : 'Recovery recorded. The tool is available for use.', { resetCreate: true });
    } catch (error) { notify(error.message, true); }
  }

  async function stopCamera(active) {
    active = active || current;
    if (!active) return;
    const scanner = active.scanner;
    active.scanner = null;
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop(); } catch (_) { /* Camera may already be stopped. */ }
      try { scanner.clear(); } catch (_) { /* Container may have been removed by navigation. */ }
    }
    const camera = active.root.querySelector('[data-camera]');
    if (camera) camera.hidden = true;
  }

  async function startCamera(purpose='handover') {
    const active = current;
    if(active.scanner)return;
    const receiver=purpose==='receiver',dialog=active.root.querySelector('[data-scanner-dialog]');
    if(receiver){if(!dialog.open)dialog.showModal();syncModalLock();dialog.querySelector('[data-scanner-error]').textContent='';}
    if(!window.Html5Qrcode){const message='Camera scanning could not load. Check your connection or enter details manually.';if(receiver)dialog.querySelector('[data-scanner-error]').textContent=message;else notify(message,true);return;}
    if(!isSecureContext){const message='Camera scanning requires HTTPS or localhost. Use manual entry here.';if(receiver)dialog.querySelector('[data-scanner-error]').textContent=message;else notify(message,true);return;}
    const camera = active.root.querySelector('[data-camera]');
    if(!receiver)camera.hidden = false;
    const scanner = new window.Html5Qrcode(receiver?'mv-receiver-camera':'mv-camera');
    active.scanner = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 220, height: 220 } }, async decoded => {
        if (current !== active || active.scanner !== scanner) return;
        await stopCamera(active);
        if (current !== active) return;
        if(receiver){
          try{await resolveReceivingQr(decoded.trim());if(current===active){dialog.close();syncModalLock();}}
          catch(error){if(current===active)dialog.querySelector('[data-scanner-error]').textContent=error.message;}
          return;
        }
        active.root.querySelector('[name="code"]').value = decoded.trim();
        active.root.querySelector('[data-form="lookup"]').requestSubmit();
      }, () => {});
      if (current !== active || active.scanner !== scanner) {
        try { await scanner.stop(); scanner.clear(); } catch (_) { /* Navigation interrupted startup. */ }
      }
    } catch (_) {
      await stopCamera(active);
      if (current === active){const message='Camera could not start. Allow camera access, check that a camera is connected, or use manual entry.';if(receiver)dialog.querySelector('[data-scanner-error]').textContent=message;else notify(message,true);}
    }
  }

  async function click(event) {
    const tab=event.target.closest('[data-transfer-tab]');
    if(tab&&!current.busy){setTransferView(tab.dataset.transferTab);return;}
    const target = event.target.closest('[data-action]');
    if (!target || current.busy) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'dismiss') { current.message = ''; renderNotice(); }
    else if(action==='retry-office')await loadReturnOffice(current);
    else if(action==='scan-receiver')await startCamera('receiver');
    else if(action==='close-scanner'){await stopCamera();current?.root.querySelector('[data-scanner-dialog]').close();syncModalLock();}
    else if(action==='manual-receiver'){
      current.receivingToken=null;current.createDirty=true;
      const fields=current.root.querySelector('[data-receiver-fields]');fields.hidden=false;
      fields.querySelectorAll('select').forEach(select=>select.required=true);
      current.root.querySelector('[data-receiver-context]').textContent='Choose the receiver and their assigned destination. The server verifies both when you create the transfer.';
      fields.querySelector('select').focus();
    }
    else if(action==='retry-projects')await receivingProjects();
    else if(action==='generate-receiver')await generateReceivingQr();
    else if(action==='revoke-receiver'){
      const active=current;
      try{await qrRpc('mcpa_revoke_receiving_qr',{p_token:active.ownQr?.token});if(current===active){clearTimeout(active.qrExpiry);active.ownQr=null;active.root.querySelector('[data-own-qr]').textContent='Receiving QR revoked. Generate a new one when needed.';}}
      catch(error){if(current===active)notify(error.message,true);}
    }
    else if (action === 'view') { showScreen(current.kind + '?record=' + encodeURIComponent(id)); }
    else if (action === 'close-detail') closeDetail();
    else if (action === 'approve') await perform(() => store().approveRequest(id), 'Request approved. Its tools are reserved and ready for release.');
    else if (action === 'release') await perform(() => store().releaseRequest(id), 'Tools released. Share the handover code with the receiver.');
    else if (action === 'start-repair') await perform(() => store().startRepair(id), 'Repair started. The tool remains unavailable.');
    else if (action === 'open-transfer') {
      if (typeof window.showScreen === 'function') window.showScreen('transfer?record=' + encodeURIComponent(id));
    } else if (action === 'copy') {
      try { await navigator.clipboard.writeText(id); notify('Transfer code copied.'); } catch (_) { notify(`Copy this transfer code: ${id}`); }
    } else if (action === 'camera') await startCamera();
    else if (action === 'stop-camera') await stopCamera();
    else if (action === 'retry') {
      const {kind, pendingTarget} = current;
      const remount = mount(kind);
      if (pendingTarget) void openRecord(kind, pendingTarget);
      await remount;
    }
  }

  function input(event) {
    const target = event.target;
    if (target.matches('[data-record-search]')) { current.search = target.value; renderLists(); }
    if (target.matches('[data-tool-search]')) {
      const query = target.value.toLowerCase();
      let visible = 0;
      current.root.querySelectorAll('[data-tool-text]').forEach(row => { row.hidden = !row.dataset.toolText.includes(query); if (!row.hidden) visible++; });
      const empty = current.root.querySelector('[data-tool-no-results]');
      if (empty) empty.hidden = visible > 0 || !current.root.querySelector('[data-tool-text]');
    }
    if (target.closest('[data-form="create"]')) current.createDirty = true;
    if (target.closest('[data-detail] form')) current.detailDirty = true;
  }

  async function change(event) {
    const target = event.target;
    if (target.matches('#mv-destination')) {
      projectCaption(target);
      if (scopedRequest()) {
        const project = requestSites().find(site => site.name === target.value);
        current.requestProjectId = project?.id || '';
        try { if (project) sessionStorage.setItem(projectPreferenceKey(), project.id); else sessionStorage.removeItem(projectPreferenceKey()); } catch (_) {}
      }
    }
    if(current.kind==='transfer'&&target.matches('[name="receiverId"],[name="destination"]')){
      current.receivingToken=null;current.createDirty=true;
      const message=current.root.querySelector('[data-receiver-context]');if(message)message.textContent='Details entered manually. The receiving account and project will be verified when you create the transfer.';
    }
    if (target.matches('[data-status]')) { current.status = target.value; renderLists(); }
    if (target.matches('[name="toolIds"]')) {
      const count = current.root.querySelectorAll('[name="toolIds"]:checked').length;
      current.root.querySelector('[data-selected-count]').textContent = `${count} selected`;
      syncReturnConditions();
    }
    if (target.matches('[data-condition]')) {
      const inspection = target.closest('[data-inspection]');
      inspection.querySelector('[data-condition-notes]').required = Boolean(target.value && target.value !== 'good');
      const decision = inspection.querySelector('[data-decision-field]');
      if (decision) {
        const damaged = target.value === 'damaged';
        decision.hidden = !damaged;
        const select = decision.querySelector('select');
        select.disabled = !damaged; select.required = damaged;
        if (!damaged) select.value = '';
      }
    }
    if(target.matches('[data-condition],[data-disposition]')){
      const receipt=target.closest('[data-form="receive"]');
      if(receipt){
        const refused=[...receipt.querySelectorAll('[data-inspection]')].some(item=>item.querySelector('[data-condition]').value==='damaged'&&item.querySelector('[data-disposition]')?.value==='declined');
        const fields=receipt.querySelector('[data-refusal-fields]');fields.hidden=!refused;
        fields.querySelectorAll('textarea,input').forEach(input=>{input.disabled=!refused;input.required=refused;});
        receipt.querySelector('[data-receipt-submit]').textContent=refused?'Refuse handover & notify sender':'Confirm receipt of all inspected tools';
      }
    }
  }

  function renderError(error) {
    current.root.innerHTML = `<div class="movement-ui"><div class="page-head"><div><p class="eyebrow">Tool movement</p><h1 class="display">${TITLES[current.kind]}</h1></div></div><div class="card card-pad mv-setup" role="alert"><h2>Movement data is unavailable</h2><p>${esc(display.errorText(error))}</p><p class="mv-help">We will retry automatically. Contact your administrator if access is unavailable.</p><div class="mv-action-row">${button('Retry connection', 'retry', null, 'btn-primary')}</div></div></div>`;
  }

  async function mount(kind, options = {}) {
    const root = options.root || document.getElementById(`screen-${kind}`);
    if (!root || !TITLES[kind]) return;
    dispose();
    const active = { kind, root, requestIntro: options.requestIntro, generation: ++generation, search: '', status: '', detailId: '', message: '', busy: false, scanner: null, transferView: operational()||handler()?'send':'history', receivingToken:null, createDirty: false, detailDirty: false };
    let finishMount;
    active.mounted = new Promise(resolve => { finishMount = resolve; });
    current = active;
    window.MCPANavigation?.track(root, active.mounted);
    root.innerHTML = '<div class="movement-ui"><div class="card card-pad mv-loading" role="status">Loading movement records…</div></div>';
    root.addEventListener('click', click);
    root.addEventListener('submit', submit);
    root.addEventListener('input', input);
    root.addEventListener('change', change);
    active.keydown=event=>{
      if(event.key==='Escape'&&root.querySelector('[data-detail][open]')&&!event.target.matches('select')){event.preventDefault();event.stopPropagation();closeDetail();return;}
      const tab=event.target.closest('[data-transfer-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const tabs=[...root.querySelectorAll('[data-transfer-tab]')],index=tabs.indexOf(tab);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      setTransferView(tabs[next].dataset.transferTab);tabs[next].focus();
    };root.addEventListener('keydown',active.keydown);
    if (mode() === 'live') active.stopWatching = window.EquipmentTracking.watch(async () => {
      await active.mounted;
      if (current !== active || active.busy) return;
      await store().refresh();
      if (current !== active) return;
      syncRequestDestination();
      await loadReturnOffice(active);
      if (current !== active) return;
      if (!root.querySelector('[data-list]')) renderShell();
      if (active.pendingTarget && !active.openingTarget) await openRecord(kind, active.pendingTarget);
    }, message => {
      if (current !== active) return;
      const status = root.querySelector('[data-sync-warning]');
      if (status) status.textContent = message;
    }, {tables: ['equipment','sites','mcpa_notifications']});
    try {
      if (!store()) throw new Error('The movement service has not loaded. Reload the page and try again.');
      await store().refresh();
      if (current !== active) return;
      await loadReturnOffice(active);
      if (current !== active) return;
      renderShell();
      if (window.movementDraft?.kind === kind) {
        const selected = window.movementDraft.toolIds;
        window.movementDraft = null;
        root.querySelectorAll('[name="toolIds"]').forEach(input => {
          if (selected.includes(input.value)) { input.checked = true; input.dispatchEvent(new Event('change', {bubbles:true})); }
        });
        const toolSelect = root.querySelector('[name="toolId"]');
        if (toolSelect && [...toolSelect.options].some(option => option.value === selected[0])) toolSelect.value = selected[0];
        active.createDirty = true;
      }
    } catch (error) { if (current === active) renderError(error); }
    finally { finishMount(); }
  }

  function dispose() {
    const active = current;
    if (!active) return;
    current = null;
    active.stopWatching?.();clearTimeout(active.qrExpiry);
    active.root.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.documentElement.classList.remove('movement-modal-open');
    void stopCamera(active);
    active.root.removeEventListener('click', click);
    active.root.removeEventListener('submit', submit);
    active.root.removeEventListener('input', input);
    active.root.removeEventListener('change', change);
    active.root.removeEventListener('keydown',active.keydown);
  }

  window.addEventListener('mcpa:movement-change', () => {
    if (!current || current.busy || !current.root.isConnected || !current.root.querySelector('[data-list]')) return;
    renderLists();
    if (!current.createDirty && !document.activeElement?.closest('[data-form="create"]')) {
      const host = current.root.querySelector('[data-create-panel]');
      if (host) host.innerHTML = createForm();
    } else syncRequestStock();
    syncRequestDestination();
    if (!current.detailDirty && !document.activeElement?.closest('[data-detail] form')) renderDetail();
  });
  function cancelTarget() {
    if (!current) return;
    current.navigation = (current.navigation || 0) + 1;
    current.pendingTarget = '';
    current.openingTarget = false;
  }

  async function openRecord(kind, id) {
      if (current?.kind !== kind) return;
      const active = current;
      const navigation = active.navigation = (active.navigation || 0) + 1;
      active.pendingTarget = id;
      active.openingTarget = true;
      // The initial snapshot and module script can finish in either order.
      // Wait for the initial render so it cannot replace the focused target.
      try {
        await active.mounted;
        if (current !== active || active.navigation !== navigation) return;
        active.detailId = ''; active.detailDirty = false;
        renderDetail();
        if (active.root.querySelector('[data-list]')) renderLists();
        await store().refresh();
        if (current !== active || active.navigation !== navigation) return;
        active.pendingTarget = '';
        if (!active.root.querySelector('[data-list]')) renderShell();
        if (!visibleRecords().some(record => record.id === id)) {
          notify('This record is unavailable or your account no longer has access. Refresh the activity list.', true);
          active.root.querySelector('[data-notice]')?.setAttribute('tabindex', '-1');
          active.root.querySelector('[data-notice]')?.focus();
          return;
        }
        if (kind === 'transfer') {
          const record = visibleRecords().find(item=>item.id===id);
          const receiver = mode()==='live' ? record.receiverId===context().id : record.receiver===context().name;
          setTransferView(operational() && receiver && record.status==='pending' ? 'receive' : 'history');
        }
        active.message = ''; active.error = false; renderNotice();
        active.detailId = id; active.search = ''; active.status = '';
        active.root.querySelector('[data-record-search]').value = '';
        renderLists(); renderDetail();
        const detail = active.root.querySelector('[data-detail]');
        detail.setAttribute('tabindex', '-1');
        detail.focus({preventScroll:true});

      } catch (error) {
        if (current === active && active.navigation === navigation) notify(error.message, true);
      } finally {
        if (current === active && active.navigation === navigation) active.openingTarget = false;
      }
  }

  window.MovementUI = {
    mount,
    dispose,
    cancelTarget,
    openRecord,
    clearRecord() {
      if (!current) return;
      current.detailId = ''; current.detailDirty = false;
      current.root.querySelector('[data-detail]')?.close(); syncModalLock();
    },
    capture() {
      if (!current) return null;
      const fields = [...current.root.querySelectorAll('[data-form="create"] input, [data-form="create"] select, [data-form="create"] textarea')]
        .filter(el => el.name && !['file','password'].includes(el.type))
        .map(el => ({name:el.name, type:el.type, value:el.value, checked:el.checked}));
      const detailFields = [...current.root.querySelectorAll('[data-detail] input, [data-detail] select, [data-detail] textarea')]
        .filter(el => !['file','password'].includes(el.type))
        .map(el => ({id:el.id, name:el.name, inspection:el.closest('[data-inspection]')?.dataset.inspection, type:el.type, value:el.value, checked:el.checked}));
      return {kind:current.kind, search:current.search, status:current.status, transferView:current.transferView, createDirty:current.createDirty, fields,
        detailId:current.detailId, detailDirty:current.detailDirty, detailFields};
    },
    restore(saved) {
      if (!current || saved?.kind !== current.kind) return;
      current.search = saved.search; current.status = saved.status;
      if (current.kind === 'transfer') setTransferView(saved.transferView);
      renderLists();
      const search = current.root.querySelector('[data-record-search]'); if (search) search.value = saved.search;
      if (!saved.createDirty) return;
      for (const el of current.root.querySelectorAll('[data-form="create"] input, [data-form="create"] select, [data-form="create"] textarea')) {
        const field = saved.fields.find(f => f.name === el.name && (el.type !== 'checkbox' && el.type !== 'radio' || f.value === el.value));
        if (!field || ['file','password'].includes(el.type)) continue;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = field.checked;
        else if (el.tagName !== 'SELECT' || [...el.options].some(option => option.value === field.value)) el.value = field.value;
        el.dispatchEvent(new Event('change', {bubbles:true}));
      }
      current.createDirty = true;
    },
    restoreDetail(saved) {
      if (!current || saved?.kind !== current.kind || !saved.detailDirty || saved.detailId !== current.detailId) return;
      for (const el of current.root.querySelectorAll('[data-detail] input, [data-detail] select, [data-detail] textarea')) {
        if (el.disabled || ['file','password'].includes(el.type)) continue;
        const field = saved.detailFields?.find(f => f.id === el.id && f.name === el.name && f.type === el.type && f.inspection === el.closest('[data-inspection]')?.dataset.inspection);
        if (!field) continue;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = field.checked;
        else if (el.tagName !== 'SELECT' || [...el.options].some(option => option.value === field.value)) el.value = field.value;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      }
      current.detailDirty = true;
    },
    async showTransferView(view) {
      const active=current;
      if (active?.kind !== 'transfer') return;
      await active.mounted;
      if (current === active) setTransferView(view);
    },
    render: () => { if (current) { renderLists(); if (!current.detailDirty) renderDetail(); } },
    openTransfer: async id => {
      if (current?.kind !== 'transfer') return;
      const active = current;
      try {
        await store().initialize();
        if (current !== active) return;
        const transfer = store().findTransfer(id);
        if (!transfer) { notify('This transfer could not be found in the current data source.', true); return; }
        active.detailId = transfer.id;
        renderLists(); renderDetail();

      } catch (error) { if (current === active) notify(error.message, true); }
    }
  };
}());

