/* Mount after Workstream A core.js + analytics.js. */
(function(scope){
  'use strict';
  async function mount({root,client,record='',view:initialView='',analytics={}}) {
    if(!root||!root.querySelector)throw Error('A mount root is required.');
    const C=scope.MCPAConsumablesRequests,A=scope.MCPAConsumablesAnalytics,E=C.escape,api=C.createClient(client);
    let snapshot,selected=null,busy=false,stale=true,destroyed=false,message='',error=false,view;
    const drafts=new Map();
    const filters={from:'',to:'',site_id:'',requester_id:'',consumable_id:''};
    const screen=initialView||(record?'requests':'');
    selected=screen==='requests'?record:null;
    for(const key of Object.keys(filters))filters[key]=analytics[key]||'';
    const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'—';
    const statusLabel=value=>({partially_fulfilled:'Partially fulfilled',partial:'Partially fulfilled'}[value]||String(value||'Unknown').replace(/_/g,' ').replace(/^./,s=>s.toUpperCase()));
    function table(headers,rows,empty='No records match these filters.') {return `<div class="wa-table">${rows.length?`<table><thead><tr>${headers.map(h=>`<th scope="col">${E(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,index)=>`<td data-label="${E(headers[index])}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<div class="wa-empty">${E(empty)}</div>`}</div>`;}
    const itemName=item=>`${E(item.item_name||item.name)}<small>${E(item.item_code)} ${E(item.specification)}</small>`;
    const input=(item,kind,value,max)=>{const rules=scope.ConsumablesCatalog.quantityRules(item.unit,true);return `<input type="number" data-line="${E(item.id)}" data-kind="${kind}" aria-label="${kind==='approve'?'Approved':'Issue now'} quantity for ${E(item.item_name)}" inputmode="${rules.inputmode}" step="${rules.step}" min="0" max="${max}" value="${E(drafts.get(selected)?.[item.id]??value)}">`;};
    function details(){
      const request=snapshot.requests.find(r=>r.id===selected);if(!request)return '';
      const pending=request.status==='pending',issuable=['approved','partially_fulfilled','partial'].includes(request.status);
      return `<section class="wa-details" aria-label="Selected request"><h2 tabindex="-1">Review request #${E(request.request_number)}</h2><dl class="wa-detail-list"><div><dt>Requested by</dt><dd>${E(request.requester_name)}</dd></div><div><dt>Project/site</dt><dd>${E(request.site_name)}</dd></div><div><dt>Status</dt><dd>${E(statusLabel(request.status))}</dd></div><div><dt>Purpose</dt><dd>${E(request.purpose||'No purpose entered')}</dd></div></dl><form data-review><fieldset ${busy||stale?'disabled':''} style="border:0;padding:0;min-width:0"><div class="wa-review-table">${table(['Consumable','Unit','Requested','Approved','Issued','Confirmed consumed',...(pending?['Approve quantity']:issuable?['Stock now','Issue now']:[])],request.items.map(item=>{const stock=snapshot.catalog.find(c=>c.id===item.consumable_id);const remaining=(Math.round(Number(item.approved_quantity||0)*1000)-Math.round(Number(item.issued_quantity)*1000))/1000;return [itemName(item),E(item.unit),C.format(item.requested_quantity),pending?'Awaiting review':C.format(item.approved_quantity),C.format(item.issued_quantity),item.confirmed_consumed_quantity==null?'Not recorded':C.format(item.confirmed_consumed_quantity),...(pending?[input(item,'approve',item.requested_quantity,item.requested_quantity)]:issuable?[stock?C.format(stock.current_stock):'Archived/unavailable',input(item,'issue',0,Math.max(0,Math.min(remaining,Number(stock?.current_stock||0))))]:[])];}))}</div>${pending?'<label style="margin-top:16px">Review note <small>Required when rejecting; up to 1,000 characters</small><textarea data-note maxlength="1000">'+E(drafts.get(selected)?.note||'')+'</textarea></label><div class="wa-actions"><button class="primary" type="submit" data-decision="approve">Approve quantities</button><button type="submit" formnovalidate data-decision="reject">Reject request</button></div>':issuable?'<p>Enter the quantities handed over now. You can issue the remainder later.</p><div class="wa-actions"><button class="primary" type="submit" data-decision="issue">Record issuance</button></div>':`<p>${E(request.note||'This request has already been reviewed.')}</p>`}</fieldset></form><h3>Issuance transactions</h3>${table(['Item','Quantity issued','Issued by','Date (Manila)','Stock movement'],(request.issues||[]).map(issue=>{const item=request.items.find(i=>i.id===issue.item_id);return [E(item?.item_name),`${C.format(issue.quantity)} ${E(item?.unit)}`,E(issue.issued_by_name),E(date(issue.issued_at)),E(issue.stock_movement_id)];}),'No stock has been issued for this request.')}</section>`;
    }
    function filterOptions(rows,current,placeholder){return `<option value="">${placeholder}</option>`+rows.map(r=>`<option value="${E(r.id)}" ${r.id===current?'selected':''}>${E(r.name)}</option>`).join('');}
    const titles={'request-trend':'Request Trend',projects:'Projects',stock:'Current low stock',usage:'Usage Analytics',ranking:'Most Frequently Issued Consumables',sites:'Issued by Project/Site',daily:'Daily Issuance Trends',requests:'Requests to review and issue',history:'Transaction history',transactions:'Consumable transactions'};
    const Charts=scope.MCPAMaterialCharts;
    const siteName=row=>row.site_name||'Project not recorded';
    const projectLabel=row=>row.site_id?siteName(row):'No linked project/site';
    const projectCounts=rows=>A.counts(rows,r=>r.site_id||null,projectLabel);
    const period=['today','week','month','year'].includes(analytics.period)?analytics.period:'month';
    let page=0,reportedSnapshot;
    const pageSize=25;
    function go(target,extra={},focus){
      const params=new URLSearchParams({...filters,period,...extra});
      for(const [key,value] of [...params])if(!value)params.delete(key);
      if(target)params.set('view',target);
      const route='outward-materials'+(params.size?'?'+params:'');
      document.addEventListener('mcpa:navigation-ready',event=>{
        if(event.detail.route.split('?')[0]!=='outward-materials')return;
        const host=document.querySelector('#screen-outward-materials');
        const el=host?.querySelector(focus||'[data-view-heading]')||host?.querySelector('[data-view-heading]');
        el?.focus({preventScroll:true});
        if(focus)el?.scrollIntoView({block:'nearest',behavior:'instant'});
      },{once:true});
      scope.showScreen(route);
    }
    function paged(headers,rows,formatRow,empty){
      const count=rows.length;
      page=Math.min(page,Math.max(0,Math.ceil(count/pageSize)-1));
      const start=page*pageSize;
      return table(headers,rows.slice(start,start+pageSize).map(formatRow),empty)+
        (count>pageSize?`<div class="wa-pager"><button data-page="-1" ${page?'':'disabled'}>Previous</button><span>${start+1}–${Math.min(start+pageSize,count)} of ${count}</span><button data-page="1" ${start+pageSize<count?'':'disabled'}>Next</button></div>`:'');
    }
    const openRequest=r=>`<button type="button" data-open="${E(r.id)}">Review #${E(r.request_number)}</button>`;
    function requestList(rows){
      return paged(['Request','Requester','Project/site','Status','Submitted (Manila)','Details'],rows,r=>[
        '#'+E(r.request_number),E(r.requester_name),E(siteName(r)),E(statusLabel(r.status)),E(date(r.created_at)),openRequest(r)
      ],'No requests match this selection.');
    }
    function reportDetail(trend){
      if(screen==='requests')return details()+requestList(view.submitted);
      if(screen==='usage')return requestList(view.submitted);
      if(screen==='request-trend')return requestList(trend.records);
      if(screen==='projects')return paged(['Project/site','Submitted requests'],projectCounts(trend.records),r=>[E(r.label),C.format(r.value)]);
      if(screen==='stock')return paged(['Consumable','Unit','Available stock','Minimum stock'],view.lowStock,r=>[itemName(r),E(r.unit),C.format(r.current_stock),C.format(r.minimum_stock)]);
      if(screen==='ranking')return paged(['Consumable','Consumable ID','Unit','Requested','Approved','Issued','Issuance transactions','Details'],view.summary,r=>[itemName(r),E(r.consumable_id),E(r.unit),C.format(r.requested),C.format(r.approved),C.format(r.issued),C.format(r.issuances),`<button data-drill="${E(r.consumable_id)}" data-unit="${E(r.unit)}">View transactions</button>`]);
      if(screen==='sites'||screen==='daily'){
        const daily=screen==='daily';
        const names=new Map(view.transactions.map(t=>[t.site_id||'Unknown',projectLabel(t)]));
        return paged([daily?'Date (Manila)':'Project/site','Consumable','Consumable ID','Unit','Issued','Transactions'],daily?view.trend:view.bySite,g=>[
          E(daily?g.value:names.get(g.value)),E(g.item_name),E(g.consumable_id),E(g.unit),C.format(g.quantity),C.format(g.transactions)]);
      }
      const transactions=screen==='transactions'?view.transactions.filter(t=>t.consumable_id===record&&t.unit===analytics.unit):view.transactions;
      return paged(['Date (Manila)','Request','Consumable','Issued','Requester','Project/site','Issued by','Stock movement'],transactions,r=>[
        E(date(r.issued_at)),`<button data-open="${E(r.request_id)}">#${E(r.request_number)}</button>`,itemName(r),C.format(r.quantity)+' '+E(r.unit),E(r.requester_name),E(siteName(r)),E(r.issued_by_name),E(r.stock_movement_id)]);
    }
    function filterForm(){
      const people=new Map(snapshot.requests.map(r=>[r.requester_id,r.requester_name]));
      const sites=new Map([...snapshot.requests.filter(r=>r.site_id).map(r=>[r.site_id,siteName(r)]),...snapshot.sites.map(s=>[s.id,s.name])]);
      const catalog=new Map([...snapshot.catalog.map(c=>[c.id,c.name+' · '+c.unit]),...snapshot.requests.flatMap(r=>r.items.map(i=>[i.consumable_id,i.item_name+' · '+i.unit]))]);
      const select=(name,title,all,options)=>`<label>${title}<select name="${name}">${filterOptions(Array.from(options,([id,name])=>({id,name})),filters[name],all)}</select></label>`;
      return `<form data-filters><h2>Analytics filters</h2><div class="wa-fields"><label>From date (Manila)<input type="date" name="from" value="${E(filters.from)}"></label><label>Through date (Manila)<input type="date" name="to" value="${E(filters.to)}"></label>${select('requester_id','Engineer/Architect','All requesters',people)}${select('site_id','Project/site','All projects/sites',sites)}${select('consumable_id','Consumable','All consumables',catalog)}<button type="submit">Apply filters</button></div></form>`;
    }
    const more=id=>`<button class="wa-more" data-view="${id}" aria-label="View More — ${titles[id]}">View More</button>`;
    function card(id,note,body,control=''){
      return `<section class="wa-chart-card"><div class="wa-card-head"><div><h3>${titles[id]}</h3><p>${E(note)}</p></div>${control}</div>${body}<footer>${more(id)}</footer></section>`;
    }
    const exportsUI=()=>'<div class="wa-actions"><button data-export="summary">Download summary CSV</button><button data-export="transactions">Download transactions CSV</button></div>';
    function overview(trend){
      const periodNames={today:filters.to?'Final day':'Today',week:'7 days',month:'30 days',year:'12 months'};
      const selector='<label class="wa-period">Period<select data-period>'+Object.entries(periodNames).map(([key,name])=>`<option value="${key}" ${key===period?'selected':''}>${name}</option>`).join('')+'</select></label>';
      const periodDate=label=>new Date(label.slice(0,7)+(label.length===7?'-01':label.slice(7,10))+'T12:00:00Z').toLocaleDateString('en-PH',{timeZone:'UTC',month:'short',...(label.length===7?{year:'numeric'}:{day:'numeric'})});
      const firstLabel=trend.points[0]?.label,lastLabel=trend.points.at(-1)?.label;
      const timeCaption=firstLabel?' · '+periodDate(firstLabel)+(periodDate(firstLabel)===periodDate(lastLabel)?'':' – '+periodDate(lastLabel)):'';
      const count=trend.records.length;
      const lead=card('request-trend','Submitted requests · Manila'+timeCaption,`<strong class="wa-total">${C.format(count)} <small>${count===1?'request':'requests'}</small></strong>`+Charts.line(trend.points,'requests','No requests were submitted in this period.'),selector);
      const projects=card('projects','Requests by site · trend period',Charts.bars(projectCounts(trend.records),'requests','No project requests in this period.'));
      const low=view.lowStock,first=low[0];
      const stock=`<section class="wa-stock"><div><h3>Current low stock</h3><p>${first?E(first.name)+' · '+C.format(first.current_stock)+' '+E(first.unit)+' available (minimum '+C.format(first.minimum_stock)+')'+(low.length>1?' · '+(low.length-1)+' more':''):'No active consumables at or below minimum stock.'}</p></div>${more('stock')}</section>`;
      const usage=A.counts(view.submitted,r=>r.status,r=>statusLabel(r.status));
      const rank=view.summary.filter(r=>r.issuances>0).map(r=>({label:r.item_name+' · '+r.unit,value:r.issuances}));
      const daily=A.counts(view.transactions,r=>C.dayInManila(r.issued_at),r=>C.dayInManila(r.issued_at)).sort((a,b)=>a.id.localeCompare(b.id));
      const dailyRecent=daily.slice(-5);
      return '<div class="wa-lead-grid">'+lead+projects+'</div>'+stock+filterForm()+'<h2>Report Analytics</h2><p class="wa-report-note">Request totals use the submission date. Issuance totals use the handover date.</p><div class="wa-report-grid">'+
        card('usage','Submitted requests by current status',Charts.bars(usage,'requests','No requests match these filters.'))+
        card('ranking','Ranked by issuance transactions',Charts.bars(rank,'issuance transactions','No consumables issued in this selection.'))+
        card('sites','Issuance transactions by recorded site',Charts.bars(projectCounts(view.transactions),'issuance transactions','No project issuances match these filters.'))+
        card('daily','Transactions on the latest 5 active days',Charts.bars(dailyRecent,'issuance transactions','No issuances in this period.'))+
        '</div>'+exportsUI();
    }
    function context(){
      const names=[filters.from&&'From '+filters.from,filters.to&&'Through '+filters.to,
        filters.requester_id&&(snapshot.requests.find(r=>r.requester_id===filters.requester_id)?.requester_name||filters.requester_id),
        filters.site_id&&(snapshot.sites.find(s=>s.id===filters.site_id)?.name||snapshot.requests.find(r=>r.site_id===filters.site_id)?.site_name||filters.site_id),
        filters.consumable_id&&(snapshot.catalog.find(i=>i.id===filters.consumable_id)?.name||filters.consumable_id)];
      return names.filter(Boolean).map(E).join(' · ')||'All dates, projects, requesters and consumables';
    }
    function render(){
      if(destroyed)return;
      root.classList.add('wa-cons','wa-admin');root.setAttribute('aria-busy',String(busy));
      const links=screen?`<button data-view="" data-focus-card="${E(screen)}">Back to Analytics</button>${screen==='requests'?'<button data-action="refresh">Refresh</button>':''}`:
        '<button data-view="requests">Requests</button><button data-view="history">History</button>';
      const head=`<header><div><h1 tabindex="-1" data-view-heading>${titles[screen]||'Consumables usage & accountability'}</h1><p>${screen&&snapshot?context():'Review requests, record material issuance and trace who received each quantity.'}</p></div><div class="wa-nav">${links}</div></header>`;
      const status=()=>`<div class="wa-message ${error?'error':''}" role="status">${E(message)}</div>`;
      if(!snapshot){root.innerHTML=head+status()+(busy?'<div class="wa-skeleton" role="status">Loading request records…</div>':'<button data-action="refresh">Retry loading records</button>');return;}
      try{
        if(reportedSnapshot!==snapshot){view=A.report(snapshot,filters);reportedSnapshot=snapshot;}
        const trend=A.requestTrend(view.submitted,filters,period);
        const back=screen==='transactions'?'<button data-view="ranking">Back to consumable ranking</button>':'';
        const periodNote=['projects','request-trend'].includes(screen)&&trend.points.length?`<p>Trend period (Manila) · ${E(trend.points[0].label)} – ${E(trend.points.at(-1).label)}</p>`:'';
        root.innerHTML=head+status()+(stale?'<button data-action="refresh">Retry loading current records</button>':'')+
          (api.getPending()?'<button data-action="recover">Recover interrupted action</button>':'')+
          (screen?back+periodNote+reportDetail(trend):overview(trend));
      }catch(e){error=true;message=e.message;root.innerHTML=head+status()+'<button data-view="" data-reset>Reset filters</button>';}
    }
    async function refresh(){
      if(busy||destroyed)return;if(stale&&error){message='';error=false;}busy=true;render();
      try{const value=await api.call('mcpa_wa_consumables_snapshot',{});if(value.profile?.role!=='admin')throw Object.assign(Error('An active Admin account is required for this screen.'),{code:'42501'});api.bindActor(value.profile.id);snapshot=value;stale=false;}
      catch(e){if(['42501','PGRST301','PGRST303'].includes(e.code))snapshot=null;message=C.errorText(e);error=true;stale=true;}
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
      if(button.hasAttribute('data-reset'))return scope.showScreen('outward-materials');
      if(button.hasAttribute('data-view'))return go(button.dataset.view,{},button.dataset.focusCard?'[data-view="'+button.dataset.focusCard+'"]':null);
      if(button.dataset.page){page+=Number(button.dataset.page);render();root.querySelector('[data-view-heading]').focus();return;}
      if(button.dataset.open&&screen!=='requests')return go('requests',{record:button.dataset.open},'.wa-details h2');
      if(button.dataset.open){selected=button.dataset.open;render();root.querySelector('.wa-details h2')?.focus();root.querySelector('.wa-details')?.scrollIntoView({block:'start'});}
      if(button.dataset.drill)return go('transactions',{record:button.dataset.drill,unit:button.dataset.unit});
      if(button.dataset.export){
        if(stale||!view[button.dataset.export].length){message=stale?'Refresh records before exporting.':'No matching rows to export. Adjust the analytics filters.';error=true;render();return;}
        try{const blob=new Blob([button.dataset.export==='summary'?A.summaryCSV(view):A.transactionsCSV(view)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='mcpa-consumables-'+button.dataset.export+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message='Could not generate the CSV. Please retry.';error=true;render();}}
    }
    async function submit(event){
      event.preventDefault();if(busy)return;
      if(event.target.matches('[data-filters]')){
        const values=Object.fromEntries(new FormData(event.target));
        try{C.dateRange(values.from,values.to);return go('',values,'[data-filters] button');}catch(e){message=e.message;error=true;}
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
    const events=new AbortController();
    root.addEventListener('change',event=>{if(event.target.matches('[data-period]'))go('',{period:event.target.value},'[data-period]');},{signal:events.signal});
    function showTip(event){
      const point=event.target.closest('[data-chart-tip]');if(point)point.closest('figure').querySelector('.wa-plot-readout').textContent=point.dataset.chartTip;
    }
    for(const type of ['focusin','pointerover'])root.addEventListener(type,showTip,{signal:events.signal});
    root.addEventListener('input',inputChanged);root.addEventListener('click',click);root.addEventListener('submit',submit);await refresh();
    return{refresh,destroy(){destroyed=true;events.abort();root.removeEventListener('input',inputChanged);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.replaceChildren();root.classList.remove('wa-cons','wa-admin');}};
  }
  scope.MCPAConsumablesUsageV2={mount};
})(globalThis);
