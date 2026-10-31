/* Search only explicit display fields from existing authorized repositories.
 * No user/profile index, raw SQL, query-dependent network reads, or local-filter writes. */
(function () {
  'use strict';
  const groups = {masterlist:['Equipment Tracking','list'],sites:['Projects','map'],request:['Requests','inbox'],transfer:['Transfers','swap'],return:['Returns','undo'],repair:['Repairs','wrench'],missing:['Missing Equipment','alert'],activity:['Activity Logs','clock'],purchase:['Purchases','cart'],consumables:['Materials','box'],reports:['Reports','chart']};
  const display = window.MCPADisplay;
  const collections = {request:'requests',transfer:'transfers',return:'returns',repair:'repairs',missing:'missing'};
  const text = value => String(value ?? '');
  const join = values => values.filter(value => value != null && value !== '').join(' · ');
  function index(data, user, demo = false) {
    const rows = [], personal = MCPAPermissions.operational(user?.role);
    const allowed = route => MCPAPermissions.route(user?.role, route);
    const add = (module, id, title, context, route, reference = id) => {
      if (!allowed(module) || !id) return;
      rows.push({key:module+':'+id,module,id:text(id),title:text(title),reference:display.reference(reference),context:text(context),route});
    };
    const tools = data.inventory || data.tools || [];
    tools.forEach(t => {
      if (demo && personal && t.holder !== user.name) return;
      add('masterlist',t.id,t.name,join([t.serial || t.serial_number,t.cat || t.category,t.brand,t.site,t.holder,t.status ? display.status(t.status) : '',t.condition ? display.condition(t.condition) : '']),'masterlist?record='+encodeURIComponent(t.id));
    });
    (data.projects || data.sites || []).forEach(s => {
      if (personal && !MCPAProjectScope.assigned(s,user,demo)) return;
      add('sites',s.id,s.name,join([s.location,s.assigned_engineer || s.engineer]),'site-detail?record='+encodeURIComponent(s.id));
    });
    const names = new Map((data.tools || []).map(t => [t.id,t.name]));
    const visibleIds = new Set();
    Object.entries(collections).forEach(([module,collection]) => (data[collection] || []).forEach(r => {
      if (demo && personal && ![r.requester,r.receiver,r.sender,r.returnedBy,r.reportedBy].includes(user.name) && !(r.toolId && tools.find(t => t.id === r.toolId)?.holder === user.name)) return;
      if (!allowed(module)) return;
      visibleIds.add(r.id);
      const equipment = (r.toolIds || [r.toolId]).filter(Boolean).map(id => join([id,names.get(id)]));
      add(module,r.id,join(equipment) || r.id,join([display.status(r.status || (module === 'return' ? 'returned' : ''), module),r.destination,r.requester,r.sender,r.receiver,r.returnedBy,r.reportedBy]),module+'?record='+encodeURIComponent(r.id));
    }));
    (data.activity || []).forEach(r => {
      if (demo && personal && r.actor !== user.name && !visibleIds.has(r.entityId)) return;
      const event = display.activity(r, data);
      add('activity',r.id,event.title,join([event.description,event.actor,...(r.toolIds || [])]),'activity?record='+encodeURIComponent(r.id),event.reference);
    });
    (data.purchases || []).forEach(r => add('purchase',r.id,r.supplier,join([r.reference,display.status(r.delivery_status, 'delivery'),...(r.items || []).map(i=>i.description)]),'purchase?record='+encodeURIComponent(r.id),display.numberedReference('PUR',r.purchase_number)));
    (data.materials || []).filter(r => !r.archived_at).forEach(r => add('consumables',r.id,r.name,join([r.unit,display.status(r.stock_status, 'stock')]),'consumables?record='+encodeURIComponent(r.id)));
    (data.materialRequests || []).forEach(r => add('consumables',r.id,r.item_name,join([display.status(r.status, 'materialRequest'),r.requester]),'consumables?record='+encodeURIComponent(r.id),display.numberedReference('CR',r.request_number)));
    // These are real report views, not invented saved reports or historical snapshots.
    [['current','Current inventory report'],['history','Historical inventory report'],['activity','Movement activity report']].forEach(([id,title]) => add('reports',id,title,'Choose a date range in Reports','reports?record='+id,'Report'));
    return rows;
  }
  function match(rows, query) {
    const terms = text(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return rows.filter(r => terms.every(term => join([groups[r.module][0],r.title,r.reference,r.context]).toLocaleLowerCase().includes(term)));
  }
  let generation = 0, timer, cache, pending, results = [], selected = -1, limit = 40;
  const input = document.getElementById('global-search-input');
  const host = document.getElementById('global-search-panel');
  const panel = document.createElement('div'); panel.id='global-search-results'; panel.className='global-search-results'; panel.hidden=true;
  const status = document.createElement('div'); status.className='global-search-status'; status.setAttribute('role','status');
  const list = document.createElement('div'); list.id='global-search-list'; list.setAttribute('role','listbox'); list.setAttribute('aria-label','Search results');
  const more = document.createElement('button'); more.type='button'; more.className='global-search-more'; more.textContent='Show more results'; more.hidden=true;
  panel.append(status,list,more); host.append(panel);
  const clear = document.createElement('button'); clear.type='button'; clear.className='global-search-clear'; clear.textContent='Clear'; clear.setAttribute('aria-label','Clear global search'); host.insertBefore(clear,panel);
  input.maxLength=300;
  input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-controls',list.id); input.setAttribute('aria-expanded','false'); input.setAttribute('autocomplete','off'); input.setAttribute('aria-label','Search accessible records across SiteTrace');
  const identity = () => { const p=window.MCPAAuth?.profile; return p ? [p.id,p.name,p.role,window.MCPAAuth.isDemo].join('|') : ''; };
  const rpc = async name => {const {data,error}=await EquipmentTracking.client().rpc(name); if(error)throw error;return data;};
  const records = (data, key) => {if(!Array.isArray(data?.[key]))throw new Error('Invalid search source');return data[key];};
  async function read() {
    const key=identity(), now=Date.now();
    if (!key) return {rows:[],failed:[]};
    if(cache?.key===key && !cache.failed.length && now-cache.time<30000)return cache;
    if(pending?.key===key)return pending.promise;
    const user={...MCPAAuth.profile}, demo=MCPAAuth.isDemo;
    const job={key};
    job.promise=(async()=>{
      // A failed personal inventory read must never fall back to the broader
      // movement catalog (which also includes equipment eligible for requests).
      const data={inventory:[],projects:[]}, failed=[];
      const tasks=[];
      const get=(label,fn)=>tasks.push(Promise.resolve().then(fn).catch(()=>failed.push(label)));
      if(MCPAPermissions.route(user.role,'activity'))get('Movements',async()=>Object.assign(data,await MovementStore.initialize()));
      if(MCPAPermissions.route(user.role,'masterlist'))get('Equipment',async()=>{
        if(demo){await MovementStore.initialize();data.inventory=MovementStore.getState().tools;}
        else if(MCPAPermissions.operational(user.role))data.inventory=records(await rpc('mcpa_personal_equipment_snapshot'),'tools');
        else data.inventory=records(await EquipmentTracking.snapshot(),'tools');
      });
      if(MCPAPermissions.route(user.role,'sites'))get('Projects',async()=>{
        if(demo){await MovementStore.initialize();data.projects=MovementStore.getState().sites;}
        else data.projects=MCPAPermissions.operational(user.role)?records(await rpc('mcpa_project_snapshot'),'sites'):await EquipmentTracking.readAll('sites');
      });
      if(!demo && MCPAPermissions.route(user.role,'purchase'))get('Purchases',async()=>{data.purchases=records(await rpc('mcpa_purchase_snapshot'),'purchases');});
      if(!demo && MCPAPermissions.route(user.role,'consumables'))get('Materials',async()=>{
        [data.materials,data.materialRequests]=await Promise.all([EquipmentTracking.readAll('consumables'),EquipmentTracking.readAll('consumable_requests')]);
      });
      await Promise.all(tasks);
      const value={key,time:Date.now(),rows:index(data,user,demo),failed};
      if(identity()===key && pending===job)cache=value;
      return value;
    })().finally(()=>{if(pending===job)pending=null;});
    pending=job; return job.promise;
  }
  function close(){generation++;clearTimeout(timer);panel.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function reset(){close();cache=null;pending=null;results=[];list.replaceChildren();status.textContent='';input.value='';}
  function highlight(node,value){
    const terms=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean), source=text(value), lower=source.toLocaleLowerCase();
    // Text nodes only: even markup-like queries and stored titles remain inert.
    let start=0;
    while(start<source.length){
      let at=source.length, length=0;
      terms.forEach(term=>{const n=lower.indexOf(term,start);if(n>=0&&n<at){at=n;length=term.length;}});
      node.append(document.createTextNode(source.slice(start,at)));
      if(!length)break;
      const mark=document.createElement('mark');mark.textContent=source.slice(at,at+length);node.append(mark);start=at+length;
    }
  }
  function render(){
    list.replaceChildren();selected=-1;input.removeAttribute('aria-activedescendant');
    const shown=results.slice(0,limit);
    for(const [module,[label,iconName]] of Object.entries(groups)){
      const rows=shown.filter(r=>r.module===module);if(!rows.length)continue;
      const group=document.createElement('div');group.setAttribute('role','group');group.setAttribute('aria-label',label);
      const heading=document.createElement('div');heading.className='global-search-heading';heading.textContent=label;group.append(heading);
      rows.forEach(r=>{
        const option=document.createElement('div');option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.id='search-option-'+shown.indexOf(r);option.dataset.key=r.key;option.className='global-search-option';
        const glyph=document.createElement('span');glyph.className='global-search-icon';glyph.setAttribute('aria-hidden','true');glyph.innerHTML=icon(iconName);
        const copy=document.createElement('span'), title=document.createElement('strong'), detail=document.createElement('span');highlight(title,r.title);highlight(detail,join([r.reference,r.context]));copy.append(title,detail);option.append(glyph,copy);group.append(option);
      });list.append(group);
    }
    more.hidden=results.length<=limit;
  }
  async function search(q){
    const token=++generation,key=identity();clearTimeout(timer);results=[];list.replaceChildren();more.hidden=true;input.removeAttribute('aria-activedescendant');
    if(!q.trim()||!key){close();return;}
    panel.hidden=false;input.setAttribute('aria-expanded','true');status.textContent='Searching accessible records…';
    timer=setTimeout(async()=>{
      try{
        const data=await read();if(token!==generation||key!==identity())return;
        results=match(data.rows,q);limit=40;render();
        status.textContent=(results.length?results.length+' results':'No matching records. Try a name or reference ID.')+(data.failed.length?' Some records could not load ('+data.failed.join(', ')+'). Clear and retry.':'');
      }catch(_){if(token===generation)status.textContent='Search could not load. Clear and retry.';}
    },180);
  }
  function choose(key){const result=results.find(r=>r.key===key);if(!result||cache?.key!==identity())return;close();showScreen(result.route);}
  list.addEventListener('mousedown',event=>event.preventDefault());
  list.addEventListener('click',event=>{const row=event.target.closest('[data-key]');if(row)choose(row.dataset.key);});
  input.addEventListener('focus',()=>{if(input.value && panel.hidden)search(input.value);});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){close();return;}
    if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)||panel.hidden)return;
    event.preventDefault();event.stopPropagation();
    const options=[...list.querySelectorAll('[role=option]')];if(!options.length)return;
    if(event.key==='Enter'){choose(options[Math.max(0,selected)].dataset.key);return;}
    selected=selected<0?(event.key==='ArrowDown'?0:options.length-1):(selected+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options.forEach((el,i)=>el.setAttribute('aria-selected',String(i===selected)));
    input.setAttribute('aria-activedescendant',options[selected].id);options[selected].scrollIntoView({block:'nearest'});
  });
  clear.addEventListener('click',()=>{input.value='';close();input.focus();});
  more.addEventListener('click',()=>{limit+=40;render();input.focus({preventScroll:true});});
  document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close();});
  window.addEventListener('mcpa:movement-change',()=>{cache=null;if(!panel.hidden)search(input.value);});
  window.MCPAGlobalSearch={search,close,reset,index,match};
})();
