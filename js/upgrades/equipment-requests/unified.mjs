import {requests} from './model.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function timeline(r) {
  const approved = r.approvalRecorded;
  const released = r.releaseRecorded;
  const received = r.inspectionRecorded;
  return `<ol class="equipment-progress" aria-label="Request progress">${[['Submitted',true],['Approved',approved],['Released',released],['Inspected / Received',received]].map(([label,done]) => `<li data-complete="${done}">${escape(label)}<small>${done ? 'Recorded' : 'Not recorded'}</small></li>`).join('')}</ol>`;
}
export async function mount(root, {client, record = ''}) {
  const admin = window.MCPAAuth.profile.role === 'admin', abort = new AbortController();
  const specificDraft = window.movementDraft?.kind === 'request';
  const qClient = window.MCPAQuantityRequests.createClient(client);
  let destroyed = false, records = [], quantities = [], search = '', status = '', type = '', loading = false, selected = '', quantityMount, historyVersion = 0;
  root.classList.add('equipment-requests');
  root.innerHTML = `<header class="page-head"><div><h1 class="display">Equipment Requests</h1><p class="sub">${admin ? 'Review both request types, reserve exact Asset IDs, then release a documented handover.' : 'Request equipment, follow its handover, then inspect before accepting custody.'}</p></div><div class="equipment-header-actions"><button type="button" class="btn btn-secondary" data-jump-history>${admin ? "Request queue" : "My Requests"}</button><button type="button" class="btn btn-secondary" data-equipment-refresh>Refresh requests</button></div></header><p role="status" aria-live="polite" data-equipment-notice></p>
    ${admin ? '' : '<div class="equipment-methods" role="group" aria-label="Request method"><button class="btn btn-accent" type="button" data-method="quantity" aria-pressed="true">Request by Quantity</button><button class="btn btn-secondary" type="button" data-method="specific" aria-pressed="false">Request Specific Asset</button></div>'}
    <div data-quantity-pane ${admin ? 'hidden' : ''}></div><div class="equipment-specific" data-specific-pane></div>
    <section class="card card-pad equipment-history" aria-labelledby="equipment-history-title"><h2 id="equipment-history-title">${admin ? 'Request queue' : 'My Requests'}</h2><div class="equipment-filters"><label>Search requests<input class="mv-input" type="search" data-equipment-search placeholder="ID, equipment, Asset ID, person or project"></label><label>Stage<select class="mv-input" data-equipment-stage><option value="">All stages</option><option value="pending">Awaiting review</option><option value="approved">Awaiting Admin release</option><option value="inspection">Awaiting inspection</option><option value="received">Inspected / Received</option><option value="follow-up">Needs follow-up</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="withdrawn">Withdrawn</option><option value="unverified">Needs verification</option></select></label><label>Request type<select class="mv-input" data-equipment-type><option value="">Both types</option><option value="quantity">By quantity</option><option value="specific">Specific assets</option></select></label></div><div data-equipment-list></div></section><section data-equipment-review hidden aria-label="Quantity request review"><button class="btn btn-secondary" type="button" data-close-review>Close request review</button><div data-review-stage></div><div data-quantity-review></div></section>`;
  const notice = (message, error = false) => {if (destroyed) return; const node = root.querySelector('[data-equipment-notice]'); node.textContent = message; node.setAttribute('role', error ? 'alert' : 'status');};
  const intro = r => `<p class="equipment-stage"><strong>${escape(admin && r.stage.key === 'inspection' ? 'Awaiting Recipient Inspection' : r.stage.label)}</strong></p><p>${escape(admin && r.stage.key === 'inspection' ? 'The named recipient must inspect and confirm the handover in Accept Equipment.' : r.stage.next)}</p>${timeline(r)}${!admin && r.stage.key === 'inspection' && r.transfer?.receiverId === window.MCPAAuth.profile.id ? `<a class="btn btn-accent" href="#transfer-inbox?record=${encodeURIComponent(r.transfer.id)}" data-movement-link>Inspect &amp; Accept Equipment</a>` : ''}`;
  function render() {
    if (destroyed) return;
    const query = search.trim().toLowerCase();
    const filtered = records.filter(r => (!type || r.kind === type) && (!status || r.stage.key === status) && [r.id,r.movement?.id,r.name,r.requester,r.destination,...r.assetIds].join(' ').toLowerCase().includes(query));
    root.querySelector('[data-equipment-list]').innerHTML = filtered.length ? `<ul class="equipment-queue">${filtered.map(r => `<li data-equipment-record="${escape(r.id)}"><div class="equipment-row"><div><strong>${escape(r.name || 'Equipment request')}</strong><p><span class="tool-id-chip">${escape(r.id)}</span> · ${r.kind === 'quantity' ? 'By quantity' : 'Specific assets'} · ${escape(r.quantity)} requested</p><p>${escape(r.requester)} · ${escape(r.destination)} · ${escape(window.MCPAQuantityView.date(r.createdAt))}</p>${r.assetIds.length ? `<p>Asset IDs: ${r.assetIds.map(escape).join(', ')}</p>` : ''}</div><div><strong>${escape(admin && r.stage.key === 'inspection' ? 'Awaiting Recipient Inspection' : r.stage.label)}</strong><p>${escape(admin && r.stage.key === 'inspection' ? 'The recipient can open Accept Equipment.' : r.stage.next)}</p></div></div><details><summary>Progress and next action</summary>${timeline(r)}</details><div class="equipment-actions"><button class="btn btn-secondary" type="button" data-open-request="${escape(r.id)}">${admin && r.kind === 'quantity' && r.status === 'pending' ? 'Review allocation' : 'View request details'}</button>${!admin && r.stage.key === 'inspection' && r.transfer?.receiverId === window.MCPAAuth.profile.id ? `<a class="btn btn-accent" href="#transfer-inbox?record=${encodeURIComponent(r.transfer.id)}" data-movement-link>Inspect &amp; Accept Equipment</a>` : ''}${admin && r.status === 'approved' && r.movement ? `<button class="btn btn-accent" type="button" data-release-request="${escape(r.movement.id)}">Review &amp; Release Equipment</button>` : ''}</div></li>`).join('')}</ul>` : `<p class="equipment-empty">${records.length ? 'No requests match these filters.' : 'No equipment requests yet. Submitted requests will appear here.'}</p>`;
    const current = records.find(r => r.id === selected);
    if (current) root.querySelector('[data-review-stage]').innerHTML = intro(current) + (admin ? '' : window.MCPAQuantityView.details(current.raw));
  }
  async function readHistory() {
    const version = ++historyVersion, result = await qClient.history();
    if (destroyed || version !== historyVersion) return;
    quantities = result;
    records = requests(window.MovementStore.getState(), quantities);render();
  }
  async function refresh() {
    if (loading || destroyed) return;
    loading = true;root.querySelector('[data-equipment-refresh]').disabled = true;
    try {await window.MovementStore.refresh();await readHistory();notice('');}
    catch (error) {notice('Request history could not be fully verified. ' + error.message, true);root.querySelector('[data-equipment-list]').innerHTML = '<p>Refresh to load both request types before reviewing requests.</p>';}
    finally {loading = false;if (!destroyed) root.querySelector('[data-equipment-refresh]').disabled = false;}
  }
  const specific = root.querySelector('[data-specific-pane]');
  specific.classList.toggle('equipment-hide-create', !admin);
  function setMethod(quantity) {
    root.querySelector('[data-quantity-pane]').hidden = !quantity;
    specific.classList.toggle('equipment-hide-create', quantity);
    root.querySelectorAll('[data-method]').forEach(button => {
      const active = (button.dataset.method === 'quantity') === quantity;
      button.setAttribute('aria-pressed',String(active));button.classList.toggle('btn-accent',active);
    });
  }
  if (!admin && specificDraft) setMethod(false);
  await window.MovementUI.mount('request', {root:specific, requestIntro: movement => {
    const r = requests(window.MovementStore.getState(), quantities).find(r => r.movement?.id === movement.id);
    return r ? intro(r) : '';
  }});
  if (destroyed) return {destroy(){}};
  const quantityRoot = root.querySelector(admin ? '[data-quantity-review]' : '[data-quantity-pane]');
  quantityMount = (admin ? window.MCPAQuantityAdmin : window.MCPAQuantityEngineer).mount({root:quantityRoot,supabase:client,embedded:true});
  await quantityMount.ready;await refresh();
  async function open(id) {
    const r = records.find(r => r.id === id || r.movement?.id === id);
    if (!r) {notice('This request is unavailable or your account no longer has access.',true);return;}
    if (r.kind === 'specific' || (r.movement && (id === r.movement.id || !admin))) {await window.MovementUI.openRecord('request',r.movement.id);return;}
    selected = r.id;
    const review = root.querySelector('[data-equipment-review]');review.hidden = false;
    root.querySelector('[data-review-stage]').innerHTML = intro(r) + (admin ? '' : window.MCPAQuantityView.details(r.raw));
    if (admin) await quantityMount.openRecord(r.id);
    if (destroyed) return;
    review.tabIndex = -1;review.focus({preventScroll:true});review.scrollIntoView({block:'start'});
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');if (!button) return;
    if (button.hasAttribute('data-jump-history')) {const history = root.querySelector('#equipment-history-title');history.tabIndex = -1;history.focus({preventScroll:true});history.scrollIntoView({block:'start'});}
    if (button.hasAttribute('data-equipment-refresh')) {void refresh();void quantityMount.refresh();}
    if (button.dataset.openRequest) void open(button.dataset.openRequest);
    if (button.dataset.releaseRequest) void window.MovementUI.openRecord('request',button.dataset.releaseRequest);
    if (button.hasAttribute('data-close-review')) {root.querySelector('[data-equipment-review]').hidden = true;selected = '';root.querySelector('[data-equipment-search]').focus();}
    if (button.dataset.method) {
      setMethod(button.dataset.method === 'quantity');
    }
  },{signal:abort.signal});
  root.addEventListener('input',event => {if(event.target.hasAttribute('data-equipment-search')) {search = event.target.value;render();}},{signal:abort.signal});
  root.addEventListener('change',event => {if(event.target.hasAttribute('data-equipment-stage')) status = event.target.value;else if(event.target.hasAttribute('data-equipment-type')) type = event.target.value;else return;render();},{signal:abort.signal});
  // Movement refreshes update labels without replacing a draft or inspection form.
  window.addEventListener('mcpa:movement-change',() => {if(!destroyed && !loading) {records = requests(window.MovementStore.getState(), quantities);render();void readHistory().catch(error => notice(error.message,true));}},{signal:abort.signal});
  if(record) await open(record);
  return {refresh: async () => {await refresh();}, destroy() {destroyed = true;abort.abort();quantityMount?.destroy();window.MovementUI.dispose();}};
}
