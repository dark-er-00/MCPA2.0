/* Mount after core.js; use the existing authenticated Supabase client. */
(function (scope) {
  'use strict';
  async function mount({root, client, view=''}) {
    if (!root || typeof root.querySelector !== 'function') throw Error('A mount root is required.');
    const engineer=scope.MCPAPermissions.operational(scope.MCPAAuth?.profile?.role);
    const C = scope.MCPAConsumablesRequests, E = C.escape, api = C.createClient(client);
    let snapshot, busy = false, destroyed = false, selected = null;
    let message = '', error = false, search = '', category = '', status = '', tab = ['inventory','requests'].includes(view)?view:'available';
    let inventoryRows = [], inventorySelected = null, page = 1;
    let catalogPage=1, searchText='';
    const invalidInputs=new Set();
    const pageSize = 10, filters = {search:'',category:'',site:'',status:''};
    let draft = {site_id:'',purpose:'',quantities:{}};
    const date = value => value ? new Date(value).toLocaleString('en-PH', {timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}) : '—';
    const label = value => ({pending:'Pending',approved:'Approved',rejected:'Rejected',partially_fulfilled:'Partially fulfilled',partial:'Partially fulfilled',issued:'Issued'}[value] || value);
    const options = (rows, current, placeholder) => `<option value="">${placeholder}</option>` + rows.map(row => `<option value="${E(row.id)}" ${row.id === current ? 'selected' : ''}>${E(row.name)}</option>`).join('');
    const stock = row => `<span class="wa-status" data-stock-status="${E(row.status)}">${E(row.status)}</span>`;
    function quantityAttributes(unit) {
      const rules=scope.ConsumablesCatalog.quantityRules(unit);
      return `inputmode="${rules.inputmode}" min="${rules.min}" max="${rules.max}" step="${rules.step}"`;
    }
    function inventoryDetails() {
      const row = inventoryRows.find(row => row.key === inventorySelected);
      if (!row) return '';
      return `<section class="wa-details" data-inventory-details tabindex="-1" aria-label="Consumable details"><div class="wa-detail-heading"><h3>${E(row.item_name)}</h3><button type="button" data-action="close-inventory">Close details</button></div><p>${E(row.site_name)} · ${E(row.unit)} · ${stock(row)}</p><dl class="wa-detail-list"><div><dt>Quantity received</dt><dd>${C.format(row.received)} ${E(row.unit)}</dd></div><div><dt>Quantity used</dt><dd>${row.usage_recorded ? C.format(row.used)+' '+E(row.unit) : 'Not recorded'}</dd></div><div><dt>Available balance from records</dt><dd>${row.discrepancy ? 'Review required' : C.format(row.balance)+' '+E(row.unit)}</dd></div><div><dt>Low-stock threshold</dt><dd>${C.format(row.minimum_stock)} ${E(row.unit)} (catalog minimum)</dd></div></dl><h3>Issuance & transaction history</h3><div class="wa-table" tabindex="0" role="region" aria-label="Issuance history"><table><thead><tr><th scope="col">Date (Manila)</th><th scope="col">Transaction</th><th scope="col">Quantity received</th><th scope="col">Issued by</th><th scope="col">Request</th></tr></thead><tbody>${row.transactions.map(issue=>`<tr><td>${E(date(issue.issued_at))}</td><td>Confirmed issuance<small>Movement: ${E(issue.stock_movement_id || issue.id)}</small></td><td>${C.format(issue.quantity)} ${E(row.unit)}</td><td>${E(issue.issued_by_name)}</td><td><button type="button" data-open="${E(issue.request_id)}">View #${E(issue.request_number)}</button></td></tr>`).join('')}</tbody></table></div><p>No engineer usage, return or transfer transactions are recorded by the current consumables workflow.</p></section>`;
    }
    function inventoryResults() {
      const rows = C.filterInventory(inventoryRows, filters), pages = Math.max(1, Math.ceil(rows.length/pageSize));
      page = Math.min(page, pages);
      if (!rows.length) return `<div class="wa-empty"><h3>${inventoryRows.length ? 'No matching consumables' : 'No consumables issued to you yet'}</h3><p>${inventoryRows.length ? 'Try another search or clear the filters.' : 'Confirmed materials issued to your account will appear here, grouped by project/site. Pending and approved requests do not add to your inventory.'}</p><button type="button" data-action="${inventoryRows.length?'clear-filters':'request-materials'}">${inventoryRows.length?'Clear filters':'Request consumables'}</button></div>`;
      return `<div class="wa-table wa-inventory-table" tabindex="0" role="region" aria-label="My consumables inventory"><table><thead><tr>${['Consumable Name','Category','Quantity Received','Quantity Used','Available Balance','Unit','Project/Site','Last Updated (Manila)','Status','Action'].map(title=>`<th scope="col">${title}</th>`).join('')}</tr></thead><tbody>${rows.slice((page-1)*pageSize,page*pageSize).map(row=>`<tr>${[
        ['Consumable Name',`${E(row.item_name)}<small>${E(row.item_code)} ${E(row.specification)}</small>`],['Category',E(row.category)],['Quantity Received',C.format(row.received)],['Quantity Used',row.usage_recorded?C.format(row.used):'<span class="wa-muted">Not recorded</span>'],['Available Balance',`<strong>${row.discrepancy?'Review required':C.format(row.balance)}</strong>`],['Unit',E(row.unit)],['Project/Site',E(row.site_name)],['Last Updated (Manila)',E(date(row.updated_at))],['Status',stock(row)],['Action',`<button type="button" data-inventory-open="${E(row.key)}" aria-label="View details for ${E(row.item_name)} at ${E(row.site_name)}">View Details</button>`]
      ].map(([name,value])=>`<td data-label="${name}">${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="wa-pagination"><span role="status">${(page-1)*pageSize+1}–${Math.min(page*pageSize,rows.length)} of ${rows.length} allocations · Page ${page} of ${pages}</span><div><button type="button" data-page="previous" ${page===1?'disabled':''}>Previous</button><button type="button" data-page="next" ${page===pages?'disabled':''}>Next</button></div></div>`;
    }
    function myInventory() {
      const categories = [...new Set(inventoryRows.map(row=>row.category))].sort();
      const sites = [...new Map(inventoryRows.map(row=>[row.site_id,{id:row.site_id,name:row.site_name}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
      return `<h2>My Consumables</h2>${engineer?'':'<p>Confirmed materials issued to your account, separated by project/site and unit.</p>'}<dl class="wa-inventory-summary">${[['Total consumable types',inventoryRows.length],...['Available','Low Stock','Depleted'].map(value=>[value+' types',inventoryRows.filter(row=>row.status===value).length])].map(([title,count])=>`<div><dt>${title}</dt><dd>${count}</dd></div>`).join('')}</dl>${engineer?'':'<p class="wa-muted">Types are counted per consumable, unit and project/site. Low stock uses the catalog minimum.</p>'}<p class="wa-inventory-note">${engineer?'Balances show confirmed issuances. Consumption is not tracked; verify physical stock separately.':'Balances reflect confirmed issues minus recorded consumption. Engineer consumption is not recorded in the current workflow, so the balance does not verify physical stock remaining.'}</p>${inventoryRows.some(row=>row.discrepancy)?'<p class="wa-message error" role="alert">Consumption exceeds confirmed issues for an item. Ask your administrator to review its records.</p>':''}<div class="wa-fields"><label>Search my consumables<input type="search" data-inventory-filter="search" value="${E(filters.search)}" placeholder="Name, category, code or specification"></label><label>Project/site<select data-inventory-filter="site">${options(sites,filters.site,'All projects/sites')}</select></label><label>Category<select data-inventory-filter="category">${options(categories.map(name=>({id:name,name})),filters.category,'All categories')}</select></label><label>Stock status<select data-inventory-filter="status">${options(['Available','Low Stock','Depleted','Review required'].map(name=>({id:name,name})),filters.status,'All stock statuses')}</select></label><button type="button" data-action="clear-filters">Clear filters</button></div><div data-inventory-results>${inventoryResults()}</div>${inventoryDetails()}`;
    }
    function history() {
      const rows = snapshot.requests.filter(request => !status || request.status === status);
      return `<div class="wa-fields"><label>Request status<select data-field="status"><option value="">All statuses</option>${[...new Set(snapshot.requests.map(r=>r.status))].map(value=>`<option value="${E(value)}" ${value===status?'selected':''}>${E(label(value))}</option>`).join('')}</select></label></div><div class="wa-table">${rows.length ? `<table><thead><tr><th>Request</th><th>Project/site</th><th>Items</th><th>Status</th><th>Submitted</th><th>Details</th></tr></thead><tbody>${rows.map(request=>`<tr><td>#${E(request.request_number)}</td><td>${E(request.site_name)}</td><td>${request.items.length}</td><td><span class="wa-status">${E(label(request.status))}</span></td><td>${E(date(request.created_at))}</td><td><button type="button" data-open="${E(request.id)}" aria-label="View request ${E(request.request_number)}">View</button></td></tr>`).join('')}</tbody></table>` : '<div class="wa-empty">Your requests will appear here after submission. Change the status filter to see more history.</div>'}</div>`;
    }
    function detail() {
      const request = snapshot.requests.find(r=>r.id===selected);
      if (!request) return '';
      return `<section class="wa-details" aria-label="Request details"><h2>Request #${E(request.request_number)}</h2><p>${E(request.site_name)} · ${E(label(request.status))}</p>${request.purpose?`<p>Purpose: ${E(request.purpose)}</p>`:''}${request.note?`<p>Admin note: ${E(request.note)}</p>`:''}<div class="wa-table"><table><thead><tr><th>Consumable</th><th>Unit</th><th>Requested</th><th>Approved</th><th>Issued</th><th>Confirmed consumed</th></tr></thead><tbody>${request.items.map(item=>`<tr><td>${E(item.item_name)}<small>${E(item.item_code)} ${E(item.specification)}</small></td><td>${E(item.unit)}</td><td>${C.format(item.requested_quantity)}</td><td>${request.status==='pending'?'Awaiting review':C.format(item.approved_quantity)}</td><td>${C.format(item.issued_quantity)}</td><td>${item.confirmed_consumed_quantity == null ? 'Not recorded' : C.format(item.confirmed_consumed_quantity)}</td></tr>`).join('')}</tbody></table></div><h3>Issuance history</h3>${request.issues.length?`<div class="wa-table"><table><thead><tr><th>Item</th><th>Issued</th><th>Issued by</th><th>Issuance date (Manila)</th></tr></thead><tbody>${request.issues.map(issue=>{const item=request.items.find(i=>i.id===issue.item_id);return `<tr><td>${E(item?.item_name)}</td><td>${C.format(issue.quantity)} ${E(item?.unit)}</td><td>${E(issue.issued_by_name)}</td><td>${E(date(issue.issued_at))}</td></tr>`;}).join('')}</tbody></table></div>`:'<p>No quantities have been issued for this request.</p>'}</section>`;
    }
    function catalogRows() {
      const rows = snapshot.catalog.filter(item => (!category || (item.category || 'Unclassified') === category) && (!search || [item.name,item.category,item.item_code,item.specification].join(' ').toLowerCase().includes(search.trim().toLowerCase())));
      const pages=Math.max(1,Math.ceil(rows.length/pageSize));
      catalogPage=Math.min(catalogPage,pages);
      const start=(catalogPage-1)*pageSize;
      const records=rows.slice(start,start+pageSize);
      const list=rows.length ? `<table><thead><tr><th>Consumable</th><th>Required quantity</th><th>Available stock</th><th>Category</th></tr></thead><tbody>${records.map(item=>`<tr><td>${E(item.name)}<small>${E(item.item_code)} ${E(item.specification)}</small><small class="wa-mobile-stock">Available: ${C.format(item.current_stock)} ${E(item.unit)}</small></td><td><input data-quantity="${E(item.id)}" aria-label="Required quantity for ${E(item.name)} ${E(item.specification)}" type="number" ${quantityAttributes(item.unit)} value="${E(draft.quantities[item.id] || '')}"><small>${E(item.unit)}</small></td><td>${C.format(item.current_stock)} ${E(item.unit)}</td><td>${E(item.category || 'Unclassified')}</td></tr>`).join('')}</tbody></table>` : '<div class="wa-empty">No consumables match. Try another item or category.</div>';
      return `<div class="wa-table" data-catalog>${list}</div><div class="wa-pagination"><span role="status">Page ${catalogPage} of ${pages} · ${rows.length} consumables</span><div><button type="button" data-catalog-page="previous" ${catalogPage===1?'disabled':''}>Previous</button><button type="button" data-catalog-page="next" ${catalogPage===pages?'disabled':''}>Next</button></div></div>`;
    }
    function render() {
      if (destroyed) return;
      root.classList.add('wa-cons','wa-engineer');
      root.setAttribute('aria-busy', String(busy));
      if (!snapshot) {root.innerHTML=`<header><div><h1>Consumables</h1>${engineer?'':'<p>Request materials for your project/site.</p>'}</div><button data-action="refresh" ${engineer&&!error?'hidden':''} ${busy?'disabled':''}>${engineer?'Retry loading consumables':'Refresh'}</button></header><div role="status" class="wa-message ${error?'error':''}">${E(message)}</div>${busy?'<div class="wa-skeleton" aria-label="Loading consumables"></div>':''}`;return;}
      const categories = [...new Set(snapshot.catalog.map(item=>item.category || 'Unclassified'))].sort();
      root.innerHTML = `<header><div><h1>Consumables</h1>${engineer?'':'<p>Request materials and track confirmed issues for your projects.</p>'}</div><button type="button" data-action="refresh" ${engineer&&!error?'hidden':''} ${busy?'disabled':''}>${engineer?'Retry loading consumables':busy?'Refreshing…':'Refresh'}</button></header><div class="wa-message ${error?'error':''}" role="status" aria-live="polite">${E(message)}</div>${api.getPending()?'<div class="wa-actions"><button type="button" data-action="recover">Retry interrupted submission</button></div>':''}<div class="wa-request-toolbar"><div class="wa-tabs" role="tablist" aria-label="Consumables views">${[['available','Available Consumables'],['inventory','My Consumables'],['requests','My Requests']].map(([id,title])=>`<button type="button" role="tab" id="wa-tab-${id}" data-tab="${id}" aria-controls="wa-panel-${id}" aria-selected="${tab===id}" tabindex="${tab===id?'0':'-1'}">${title}</button>`).join('')}</div><button type="button" class="primary" data-action="review-request" ${tab==='available'?'':'hidden'}>Submit Request</button></div><section id="wa-panel-available" role="tabpanel" aria-labelledby="wa-tab-available" ${tab==='available'?'':'hidden'}><form data-request-form novalidate><fieldset ${busy?'disabled':''} style="border:0;padding:0;margin:0;min-width:0"><h2>New request</h2><div class="wa-fields"><label>Project/site<select required data-field="site_id">${options(snapshot.sites,draft.site_id,'Choose project/site')}</select></label><label>Category<select data-field="category"><option value="">All categories</option>${categories.map(value=>`<option value="${E(value)}" ${value===category?'selected':''}>${E(value)}</option>`).join('')}</select></label><div class="wa-catalog-search"><label for="wa-catalog-query">Search consumables</label><span class="wa-search-box"><input id="wa-catalog-query" data-field="search" type="search" value="${E(searchText)}"><button type="button" data-action="filter" aria-label="Search consumables" title="Search consumables"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg></button></span></div><button type="button" data-action="clear-search" ${search||searchText?'':'hidden'}>Clear search</button></div>${catalogRows()}<p data-selection>${Object.values(draft.quantities).filter(Boolean).length} item(s) selected across all categories.</p>${snapshot.sites.length?'':'<p class="wa-message">No active project/site is assigned to your account. Ask your administrator to assign a project before requesting materials.</p>'}</fieldset></form></section><section id="wa-panel-inventory" role="tabpanel" aria-labelledby="wa-tab-inventory" ${tab==='inventory'?'':'hidden'}>${myInventory()}</section><section id="wa-panel-requests" role="tabpanel" aria-labelledby="wa-tab-requests" ${tab==='requests'?'':'hidden'}><h2>My Requests</h2>${history()}${detail()}</section>`;
      if (busy) root.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
    }
    async function refresh() {
      if (busy || destroyed || root.querySelector('[data-confirm-dialog][open]')) return;
      const focused=root.contains(document.activeElement)?document.activeElement:null;
      const focusField=focused?.dataset.inventoryFilter || focused?.dataset.field;
      const focusKind=focused?.dataset.inventoryFilter?'inventoryFilter':'field';
      const selection=focused?.selectionStart;
      const priorError=error;
      busy=true;error=false;if(priorError)message='';render();
      try {
        const value=await api.call('mcpa_wa_consumables_snapshot',{});
        if (destroyed) return;
        if (!['engineer','architect'].includes(value.profile?.role)) throw Object.assign(Error('An active Engineer or Architect account is required for this screen.'),{code:'42501'});
        api.bindActor(value.profile.id);
        const rows=C.inventory(value);
        snapshot=value;inventoryRows=rows;
      } catch (e) {
        if (['42501','PGRST301','PGRST303'].includes(e.code)) {snapshot=null;inventoryRows=[];}
        message=C.errorText(e)+(snapshot?' Showing previously loaded records; refresh to retry.':'');error=true;
      }
      finally {
        busy=false;render();
        if (!destroyed && focusField) {
          const control=[...root.querySelectorAll('input,select,textarea')].find(node=>node.dataset[focusKind]===focusField);
          control?.focus({preventScroll:true});
          if (selection!=null && control?.type==='search') control.setSelectionRange(selection,selection);
        }
      }
    }
    function input(event) {
      if (event.target.dataset.inventoryFilter==='search') {
        filters.search=event.target.value;page=1;
        root.querySelector('[data-inventory-results]').innerHTML=inventoryResults();return;
      }
      const field=event.target.dataset.field, item=event.target.dataset.quantity;
      if (item) {if(event.target.validity.badInput)invalidInputs.add(item);else invalidInputs.delete(item);draft.quantities[item]=event.target.value;const count=root.querySelector('[data-selection]');if(count)count.textContent=Object.values(draft.quantities).filter(Boolean).length+' item(s) selected across all categories.';}
      if (field==='purpose' || field==='site_id') draft[field]=event.target.value;
      if (field==='search'){searchText=event.target.value;root.querySelector('[data-action="clear-search"]').hidden=!search&&!searchText;}
    }
    function change(event) {
      if (event.target.dataset.inventoryFilter) {
        filters[event.target.dataset.inventoryFilter]=event.target.value;page=1;
        root.querySelector('[data-inventory-results]').innerHTML=inventoryResults();return;
      }
      const field=event.target.dataset.field;
      if (field==='category') {category=event.target.value;catalogPage=1;render();root.querySelector('[data-field="category"]').focus();}
      if (field==='status') {status=event.target.value;render();}
    }
    function keydown(event) {
      if(event.key==='Enter'&&event.target.dataset.field==='search'){event.preventDefault();applySearch();}
      if (event.target.dataset.tab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();const tabs=['available','inventory','requests'], index=tabs.indexOf(tab);
        tab=tabs[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3];render();root.querySelector(`[data-tab="${tab}"]`).focus();
      }
    }
    async function click(event) {
      const button=event.target.closest('button');if (!button || !root.contains(button) || busy) return;
      if(button.dataset.catalogPage){
        catalogPage+=button.dataset.catalogPage==='next'?1:-1;render();
        const next=root.querySelector('[data-catalog-page="'+button.dataset.catalogPage+'"]:not(:disabled)')||root.querySelector('[data-catalog-page]:not(:disabled)');
        next?.focus();return;
      }
      if(button.dataset.action==='review-request')return review();
      if(button.dataset.action==='cancel-request')return button.closest('dialog').close();
      if(button.dataset.action==='clear-search'){searchText='';return applySearch();}
      if (button.dataset.tab) {tab=button.dataset.tab;if(!error)message='';render();root.querySelector(`[data-tab="${tab}"]`).focus();return;}
      if (button.dataset.inventoryOpen) {inventorySelected=button.dataset.inventoryOpen;render();root.querySelector('[data-inventory-details]')?.focus();return;}
      if (button.dataset.action==='close-inventory') {const key=inventorySelected;inventorySelected=null;render();[...root.querySelectorAll('[data-inventory-open]')].find(button=>button.dataset.inventoryOpen===key)?.focus();return;}
      if (button.dataset.action==='clear-filters') {Object.keys(filters).forEach(key=>{filters[key]='';});page=1;render();root.querySelector('[data-inventory-filter="search"]')?.focus();return;}
      if (button.dataset.action==='request-materials') {tab='available';render();root.querySelector('[data-field="site_id"]')?.focus();return;}
      if (button.dataset.page) {page+=button.dataset.page==='next'?1:-1;render();root.querySelector('.wa-inventory-table')?.focus();return;}
      if (button.dataset.action==='refresh') return refresh();
      if (button.dataset.action==='recover') {
        busy=true;render();
        try {const saved=await api.retryPending();selected=saved.id || saved.request_id;tab='requests';draft={site_id:draft.site_id,purpose:'',quantities:{}};message='Interrupted submission recovered.';error=false;}
        catch(e){message=C.errorText(e);error=true;}
        finally{busy=false;render();}
        if(!error)await refresh();return;
      }
      if (button.dataset.action==='filter') return applySearch();
      if (button.dataset.open) {selected=button.dataset.open;tab='requests';render();const details=root.querySelector('#wa-panel-requests .wa-details');details?.setAttribute('tabindex','-1');details?.focus();}
    }
    function applySearch(){
      search=searchText.trim();catalogPage=1;render();root.querySelector('[data-field="search"]').focus();
    }
    function validatedDraft(){
      if(invalidInputs.size)throw Error('Enter a valid number for '+(snapshot.catalog.find(i=>invalidInputs.has(i.id))?.name||'the selected consumable')+'.');
      const items=Object.entries(draft.quantities).filter(([,q])=>q!=='').map(([id,q])=>({
        consumable_id:id,quantity:q,unit:snapshot.catalog.find(i=>i.id===id)?.unit
      }));
      return C.validateRequest({...draft,items},snapshot.catalog,snapshot.sites);
    }
    function review(){
      if(!snapshot||busy||root.querySelector('dialog[open]'))return;
      let payload;
      try{payload=validatedDraft();}catch(e){
        message=C.errorText(e);error=true;render();
        const notice=root.querySelector('.wa-message');notice.tabIndex=-1;notice.focus();return;
      }
      if(error){error=false;message='';render();}
      const dialog=document.createElement('dialog');
      dialog.className='wa-submit-dialog';dialog.dataset.confirmDialog='';
      dialog.setAttribute('aria-labelledby','wa-confirm-title');
      const rows=payload.items.map(line=>{
        const item=snapshot.catalog.find(i=>i.id===line.consumable_id);
        return `<li><span>${E(item.name)}<small>${E(item.item_code)} ${E(item.specification)}</small></span><strong>${C.format(line.quantity)} ${E(line.unit)}</strong></li>`;
      }).join('');
      dialog.innerHTML=`<form data-confirm-request><h2 id="wa-confirm-title">Submit Consumables Request</h2><p>Project/site · <strong>${E(snapshot.sites.find(s=>s.id===payload.site_id).name)}</strong></p><ul>${rows}</ul><label>Purpose (optional)<textarea data-field="purpose" maxlength="1000">${E(draft.purpose)}</textarea></label><div data-confirm-feedback role="alert"></div><div class="wa-actions"><button type="button" data-action="cancel-request">Cancel</button><button type="submit" class="primary">Confirm Submit Request</button></div></form>`;
      root.append(dialog);
      dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
      dialog.addEventListener('close',()=>{dialog.remove();if(!destroyed&&!root.querySelector('dialog[open]'))root.querySelector('[data-action="review-request"]:not([hidden])')?.focus();},{once:true});
      dialog.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const stops=[...dialog.querySelectorAll('textarea:not(:disabled),button:not(:disabled)')];
        const first=stops[0],last=stops.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      });
      dialog.showModal();dialog.querySelector('textarea').focus();
    }
    async function submit(event) {
      event.preventDefault();if(busy || !snapshot)return;
      if(event.target.matches('[data-request-form]'))return review();
      const dialog=event.target.closest('[data-confirm-dialog][open]');
      if(!dialog||!event.target.matches('[data-confirm-request]'))return;
      try {
        const payload=validatedDraft();
        busy=true;root.setAttribute('aria-busy','true');error=false;
        dialog.querySelectorAll('textarea,button').forEach(el=>el.disabled=true);
        const saved=await api.mutate('mcpa_wa_submit_consumables',{p_site_id:payload.site_id,p_purpose:payload.purpose,p_items:payload.items});
        draft={site_id:draft.site_id,purpose:'',quantities:{}};selected=saved.id || saved.request_id || null;tab='requests';
        message='Request saved. Your Admin can now review it.';
      } catch(e) {
        message=C.errorText(e);error=true;
        if(!destroyed){dialog.querySelector('[data-confirm-feedback]').textContent=message;dialog.querySelectorAll('textarea,button').forEach(el=>el.disabled=false);dialog.querySelector('[type=submit]').focus();}
      } finally {busy=false;root.setAttribute('aria-busy','false');}
      if(!error&&!destroyed){dialog.close();render();await refresh();root.querySelector('[data-tab="requests"]')?.focus();}
      else if(api.getPending()&&!destroyed){dialog.close();render();root.querySelector('[data-action="recover"]')?.focus();}
    }
    root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('keydown',keydown);root.addEventListener('click',click);root.addEventListener('submit',submit);
    await refresh();
    return {refresh,destroy(){destroyed=true;snapshot=null;inventoryRows=[];root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.replaceChildren();root.classList.remove('wa-cons','wa-engineer');}};
  }
  scope.MCPAConsumablesRequesterV2={mount};
})(globalThis);
