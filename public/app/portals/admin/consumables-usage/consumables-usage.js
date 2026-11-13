/* Mount after Workstream A core.js + analytics.js. */
(function(scope){
  'use strict';
  async function mount({root,client}) {
    if(!root||!root.querySelector)throw Error('A mount root is required.');
    const C=scope.MCPAConsumablesRequests,A=scope.MCPAConsumablesAnalytics,E=C.escape,api=C.createClient(client);
    let snapshot,selected=null,busy=false,stale=true,destroyed=false,message='',error=false,view;
    const drafts=new Map();
    const filters={from:'',to:'',site_id:'',requester_id:'',consumable_id:''};
    const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'—';
    const statusLabel=value=>({partially_fulfilled:'Partially fulfilled',partial:'Partially fulfilled'}[value]||String(value).replace(/_/g,' '));
    function table(headers,rows,empty='No records match these filters.') {return `<div class="wa-table">${rows.length?`<table><thead><tr>${headers.map(h=>`<th scope="col">${E(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,index)=>`<td data-label="${E(headers[index])}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<div class="wa-empty">${E(empty)}</div>`}</div>`;}
    const itemName=item=>`${E(item.item_name||item.name)}<small>${E(item.item_code)} ${E(item.specification)}</small>`;
    const input=(item,kind,value,max)=>{const rules=scope.ConsumablesCatalog.quantityRules(item.unit,true);return `<input type="number" data-line="${E(item.id)}" data-kind="${kind}" aria-label="${kind==='approve'?'Approved':'Issue now'} quantity for ${E(item.item_name)}" inputmode="${rules.inputmode}" step="${rules.step}" min="0" max="${max}" value="${E(drafts.get(selected)?.[item.id]??value)}">`;};
    function details(){
      const request=snapshot.requests.find(r=>r.id===selected);if(!request)return '';
      const pending=request.status==='pending',issuable=['approved','partially_fulfilled','partial'].includes(request.status);
      return `<section class="wa-details" aria-label="Selected request"><h2>Review request #${E(request.request_number)}</h2><dl class="wa-detail-list"><div><dt>Requested by</dt><dd>${E(request.requester_name)}</dd></div><div><dt>Project/site</dt><dd>${E(request.site_name)}</dd></div><div><dt>Status</dt><dd>${E(statusLabel(request.status))}</dd></div><div><dt>Purpose</dt><dd>${E(request.purpose||'No purpose entered')}</dd></div></dl><form data-review><fieldset ${busy||stale?'disabled':''} style="border:0;padding:0;min-width:0"><div class="wa-review-table">${table(['Consumable','Unit','Requested','Approved','Issued','Confirmed consumed',...(pending?['Approve quantity']:issuable?['Stock now','Issue now']:[])],request.items.map(item=>{const stock=snapshot.catalog.find(c=>c.id===item.consumable_id);const remaining=(Math.round(Number(item.approved_quantity||0)*1000)-Math.round(Number(item.issued_quantity)*1000))/1000;return [itemName(item),E(item.unit),C.format(item.requested_quantity),pending?'Awaiting review':C.format(item.approved_quantity),C.format(item.issued_quantity),item.confirmed_consumed_quantity==null?'Not recorded':C.format(item.confirmed_consumed_quantity),...(pending?[input(item,'approve',item.requested_quantity,item.requested_quantity)]:issuable?[stock?C.format(stock.current_stock):'Archived/unavailable',input(item,'issue',0,Math.max(0,Math.min(remaining,Number(stock?.current_stock||0))))]:[])];}))}</div>${pending?'<label style="margin-top:16px">Review note <small>Required when rejecting; up to 1,000 characters</small><textarea data-note maxlength="1000">'+E(drafts.get(selected)?.note||'')+'</textarea></label><div class="wa-actions"><button class="primary" type="submit" data-decision="approve">Approve quantities</button><button type="submit" formnovalidate data-decision="reject">Reject request</button></div>':issuable?'<p>Enter the quantities handed over now. You can issue the remainder later.</p><div class="wa-actions"><button class="primary" type="submit" data-decision="issue">Record issuance</button></div>':`<p>${E(request.note||'This request has already been reviewed.')}</p>`}</fieldset></form><h3>Issuance transactions</h3>${table(['Item','Quantity issued','Issued by','Date (Manila)','Stock movement'],(request.issues||[]).map(issue=>{const item=request.items.find(i=>i.id===issue.item_id);return [E(item?.item_name),`${C.format(issue.quantity)} ${E(item?.unit)}`,E(issue.issued_by_name),E(date(issue.issued_at)),E(issue.stock_movement_id)];}),'No stock has been issued for this request.')}</section>`;
    }
    function filterOptions(rows,current,placeholder){return `<option value="">${placeholder}</option>`+rows.map(r=>`<option value="${E(r.id)}" ${r.id===current?'selected':''}>${E(r.name)}</option>`).join('');}
    function render(){
      if(destroyed)return;
      root.classList.add('wa-cons');root.setAttribute('aria-busy',String(busy));
      const head=`<header><div><h1>Consumables usage & accountability</h1><p>Review requests, record material issuance and trace who received each quantity.</p></div><button data-action="refresh" ${busy?'disabled':''}>Refresh</button></header><div class="wa-message ${error?'error':''}" role="status" aria-live="polite">${E(message)}</div>`;
      if(!snapshot){root.innerHTML=head+(busy?'<div class="wa-skeleton" aria-label="Loading request records"></div>':'');return;}
      try{view=A.report(snapshot,filters);}catch(e){message=e.message;error=true;return;}
      const people=[...new Map(snapshot.requests.map(r=>[r.requester_id,{id:r.requester_id,name:r.requester_name}])).values()];
      const catalog=[...new Map([...snapshot.catalog.map(c=>({id:c.id,name:c.name+' · '+c.unit})),...snapshot.requests.flatMap(r=>r.items.map(i=>({id:i.consumable_id,name:i.item_name+' · '+i.unit})))].map(i=>[i.id,i])).values()];
      const requestRows=snapshot.requests.filter(r=>(!filters.site_id||r.site_id===filters.site_id)&&(!filters.requester_id||r.requester_id===filters.requester_id)&&(!filters.consumable_id||r.items.some(i=>i.consumable_id===filters.consumable_id)));
      const groupRows=(groups,by)=>groups.map(g=>{const transaction=view.transactions.find(t=>t.consumable_id===g.consumable_id&&(by==='day'?C.dayInManila(t.issued_at)===g.value:t[by+'_id']===g.value));return [E(by==='day'?g.value:transaction?.[by+'_name']||g.value),E(g.item_name),E(g.unit),C.format(g.quantity),String(g.transactions)];});
      root.innerHTML=head+(api.getPending()?'<div class="wa-actions"><button data-action="recover">Recover interrupted action</button></div>':'')+`<h2>Requests to review and issue</h2>${table(['Request','Requester','Project/site','Status','Submitted','Details'],requestRows.map(r=>[`#${E(r.request_number)}`,E(r.requester_name),E(r.site_name),`<span class="wa-status">${E(statusLabel(r.status))}</span>`,E(date(r.created_at)),`<button type="button" data-open="${E(r.id)}">Review #${E(r.request_number)}</button>`]),'Requests submitted by Engineers and Architects will appear here.')}${details()}<h2>Usage analytics</h2><form data-filters><div class="wa-fields"><label>From date (Manila)<input type="date" name="from" value="${E(filters.from)}"></label><label>Through date (Manila)<input type="date" name="to" value="${E(filters.to)}"></label><label>Engineer/Architect<select name="requester_id">${filterOptions(people,filters.requester_id,'All requesters')}</select></label><label>Project/site<select name="site_id">${filterOptions(snapshot.sites,filters.site_id,'All projects/sites')}</select></label><label>Consumable<select name="consumable_id">${filterOptions(catalog,filters.consumable_id,'All consumables')}</select></label><button type="submit" ${busy?'disabled':''}>Apply filters</button></div></form><p>Requested and approved totals cover requests submitted in the selected period. Issued totals cover handovers in the period, including older requests. Issued material has not been confirmed consumed. Quantities remain separate for each item and unit.</p><div class="wa-actions"><button data-export="summary">Download summary CSV</button><button data-export="transactions">Download transactions CSV</button></div><h3>Most frequently issued consumables</h3>${table(['Consumable','Unit','Requested','Approved','Issued','Issuance transactions','Details'],view.summary.map(r=>[itemName(r),E(r.unit),C.format(r.requested),C.format(r.approved),C.format(r.issued),String(r.issuances),`<button data-drill="${E(r.consumable_id)}">View transactions</button>`]))}<h3>Issued by Engineer/Architect</h3>${table(['Requester','Consumable','Unit','Issued','Transactions'],groupRows(view.byRequester,'requester'))}<h3>Issued by project/site</h3>${table(['Project/site','Consumable','Unit','Issued','Transactions'],groupRows(view.bySite,'site'))}<h3>Daily issuance trends</h3>${table(['Date (Manila)','Consumable','Unit','Issued','Transactions'],groupRows(view.trend,'day'))}<h3>Current low stock</h3><p>Current balances, independent of the historical date filter.</p>${table(['Consumable','Unit','Available stock','Minimum stock'],view.lowStock.map(item=>[itemName(item),E(item.unit),C.format(item.current_stock),C.format(item.minimum_stock)]),'No active consumables are at or below their minimum stock.')}<section data-transactions><h3>Transaction history</h3>${table(['Date (Manila)','Request','Consumable','Issued','Requester','Project/site','Issued by','Stock movement'],view.transactions.map(r=>[E(date(r.issued_at)),`<button data-open="${E(r.request_id)}">#${E(r.request_number)}</button>`,itemName(r),`${C.format(r.quantity)} ${E(r.unit)}`,E(r.requester_name),E(r.site_name),E(r.issued_by_name),E(r.stock_movement_id)]))}</section>`;
    }
    async function refresh(){
      if(busy||destroyed)return;busy=true;render();
      try{const value=await api.call('mcpa_wa_consumables_snapshot',{});if(value.profile?.role!=='admin')throw Error('An active Admin account is required for this screen.');api.bindActor(value.profile.id);snapshot=value;stale=false;}
      catch(e){message=C.errorText(e);error=true;stale=true;}
      finally{busy=false;render();}
    }
    async function click(event){
      const button=event.target.closest('button');if(!button||!root.contains(button)||busy)return;
      if(button.dataset.action==='refresh')return refresh();
      if(button.dataset.action==='recover'){
        busy=true;render();
        try{await api.retryPending();drafts.clear();message='Interrupted action recovered. Refreshing stock and request history.';error=false;stale=true;}
        catch(e){message=C.errorText(e);error=true;}
        finally{busy=false;render();}
        if(!error)await refresh();return;
      }
      if(button.dataset.open){selected=button.dataset.open;render();root.querySelector('.wa-details')?.scrollIntoView({block:'start'});}
      if(button.dataset.drill){filters.consumable_id=button.dataset.drill;render();root.querySelector('[data-transactions]')?.scrollIntoView({block:'start'});}
      if(button.dataset.export){const blob=new Blob([button.dataset.export==='summary'?A.summaryCSV(view):A.transactionsCSV(view)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='mcpa-consumables-'+button.dataset.export+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }
    async function submit(event){
      event.preventDefault();if(busy)return;
      if(event.target.matches('[data-filters]')){
        const values=Object.fromEntries(new FormData(event.target));
        try{C.dateRange(values.from,values.to);Object.assign(filters,values);message='Filters applied.';error=false;}catch(e){message=e.message;error=true;}
        render();return;
      }
      if(!event.target.matches('[data-review]')||stale)return;
      const request=snapshot.requests.find(r=>r.id===selected),decision=event.submitter?.dataset.decision;
      try{
        if(!request)throw Error('Select a request to review.');
        const controls=[...event.target.querySelectorAll('input[data-line]')];
        let items=decision==='reject'?[]:controls.map(control=>({item_id:control.dataset.line,quantity:C.quantity(control.value,true,request.items.find(item=>item.id===control.dataset.line)?.unit)}));
        if(decision==='issue')items=items.filter(i=>i.quantity>0);
        if(decision!=='reject'&&!items.some(i=>i.quantity>0))throw Error('Enter a positive quantity for at least one item.');
        const note=event.target.querySelector('[data-note]')?.value.trim()||'';
        if(decision==='reject'&&!note)throw Error('Enter a reason for rejecting this request.');
        if(!['approve','reject','issue'].includes(decision))throw Error('Choose an action.');
        busy=true;message='Saving…';error=false;
        // Read inputs before disabling/replacing the form.
        const payload={p_request_id:request.id,p_items:items};
        render();
        if(decision==='issue')await api.mutate('mcpa_wa_issue_consumables',{...payload,p_issued_at:null});
        else await api.mutate('mcpa_wa_review_consumables',{...payload,p_decision:decision,p_note:note});
        drafts.delete(selected);stale=true;message=decision==='issue'?'Issuance recorded. Stock was deducted.':decision==='approve'?'Request approved. No stock has been deducted.':'Request rejected.';
      }catch(e){message=C.errorText(e);error=true;}
      finally{busy=false;render();}
      if(!error)await refresh();
    }
    function inputChanged(event){if(!selected)return;const draft=drafts.get(selected)||{};if(event.target.dataset.line)draft[event.target.dataset.line]=event.target.value;if(event.target.matches('[data-note]'))draft.note=event.target.value;drafts.set(selected,draft);}
    root.addEventListener('input',inputChanged);root.addEventListener('click',click);root.addEventListener('submit',submit);await refresh();
    return{refresh,destroy(){destroyed=true;root.removeEventListener('input',inputChanged);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.replaceChildren();root.classList.remove('wa-cons');}};
  }
  scope.MCPAConsumablesUsageV2={mount};
})(globalThis);
