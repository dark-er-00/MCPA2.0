const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
exports.verify=async(ctx)=>{
 const {fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,shot,artifactDirectory}=ctx;
 const out=path.join(__dirname,'artifacts/ui-corrections-20261103/after');fs.mkdirSync(out,{recursive:true});
 const capture=async name=>{await shot(name,true);fs.copyFileSync(path.join(artifactDirectory,name+'.png'),path.join(out,name+'.png'));};
 const visible=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&e.checkVisibility()&&e.getBoundingClientRect().width>0})()`);
 // Real pointer activation prevents hidden controls from passing by calling .click().
 const activate=async selector=>{
  assert.ok(await visible(selector),'Visible control: '+selector);
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 };
 const key=async value=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:value===' '?32:13,text:value===' '?' ':'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value===' '?'Space':value,windowsVirtualKeyCode:value===' '?32:13});};
 const protectedRows=async()=>(await f.db.query("select jsonb_build_object('equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),'movements',(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m),'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'sites',(select jsonb_agg(to_jsonb(s) order by id) from sites s)) value")).rows[0].value;
 const protectedBefore=await protectedRows();
 await command('Page.navigate',{url:base+'/index.html'});await login('admin');await wait("MCPAAuth.profile?.role==='admin'");
 const sourceEvidence=[];
 for(const file of ['app/core/navigation.js','app/portals/admin/sites/sites.js','app/features/equipment/equipment-tracking.js']){
  const response=await fetch(base+'/'+file),served=Buffer.from(await response.arrayBuffer()),source=fs.readFileSync(path.join(__dirname,'../public',file));
  assert.deepEqual(served,source,'Served bytes match feature checkout: '+file);assert.equal(response.headers.get('cache-control'),'no-store');
  sourceEvidence.push({file,sha256:crypto.createHash('sha256').update(served).digest('hex')});
 }
 fs.writeFileSync(path.join(out,'served-source-verification.json'),JSON.stringify({base,checkout:path.resolve(__dirname,'..'),files:sourceEvidence},null,2)+'\n');
 console.log('PASS Served application JavaScript matches the isolated feature source; no-store responses');
 const roles={admin:['masterlist','masterlist?mode=register','asset-retirement-v2','repair','missing','asset-retirement-v2?view=history'],sky:['masterlist','repair','missing','retired-equipment-v2'],architect:['masterlist','repair','missing','retired-equipment-v2'],handler:['masterlist','repair','missing'],secretary:[]};
 for(const [account,expected]of Object.entries(roles)){
  if(account!=='admin'){await logout();await login(account);await wait(`MCPAAuth.profile?.role===${JSON.stringify(f.actors[account].role)}`);}
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-nav-group=equipment] [data-target]')].map(e=>e.dataset.target)"),expected,account+' exact equipment modules and RBAC');
  const movement=await evaluate("[...document.querySelectorAll('[data-nav-group=movements] [data-target]')].map(e=>e.dataset.target)");
  assert.deepEqual(movement,account==='secretary'?[]:account==='handler'?['transfer','return']:['request','transfer','return']);
  assert.equal(await evaluate("[...document.querySelectorAll('#nav-list [data-target]')].some(e=>['repair','missing','asset-retirement-v2','retired-equipment-v2'].includes(e.dataset.target)&&e.closest('[data-nav-group]')?.dataset.navGroup!=='equipment')"),false);
  const projectsAllowed=account!=='secretary';
  assert.equal(await evaluate("document.querySelectorAll('#nav-list > [data-target=sites]').length"),projectsAllowed?1:0,account+' direct Projects permission');
  assert.equal(await evaluate("document.querySelector('[data-nav-group=projects],#nav-projects')"),null,'No nested Projects group');
  if(projectsAllowed){
   assert.ok(await evaluate("(()=>{const e=document.querySelector('#nav-list > [data-target=sites]');return e.textContent.trim()==='Projects'&&!!e.querySelector('svg')&&!e.classList.contains('nav-parent')&&!e.hasAttribute('aria-expanded')&&!e.hasAttribute('aria-controls')&&!e.querySelector('.nav-chevron')})()"),'Projects has its icon and no disclosure semantics');
   await activate('#nav-list > [data-target=sites]');
   await wait("document.querySelector('#screen-sites.active')&&!MCPANavigation.restoring");
   assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');
   assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),0);
   await activate('#nav-list > [data-target=sites]');
   assert.equal(await evaluate("document.querySelectorAll('.nav-parent[aria-expanded=true]').length"),0,'Repeated Projects click navigates without toggling a group');
   await command('Page.reload');await wait("document.querySelector('#screen-sites.active')&&!MCPANavigation.restoring");
   assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');
   await command('Page.navigate',{url:base+'/index.html#sites'});await wait("document.querySelector('#screen-sites.active')&&!MCPANavigation.restoring");
   assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');
  }
  if(!expected.length)continue;
  await go('masterlist');await wait("document.querySelector('#screen-masterlist.active')");
  assert.equal(await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').textContent.trim()"),'Equipment Tracking');
  assert.equal(await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').getAttribute('aria-expanded')"),'true');
  await activate('[data-nav-group=equipment] .nav-parent');assert.equal(await visible('[data-nav-group=equipment] .nav-children'),false);
  await evaluate("document.querySelector('[data-nav-group=equipment] .nav-parent').focus()");await key('Enter');assert.ok(await visible('[data-nav-group=equipment] .nav-children'));
  await key(' ');assert.equal(await visible('[data-nav-group=equipment] .nav-children'),false);
  await activate('[data-nav-group=equipment] .nav-parent');
  for(const route of expected.filter(r=>!r.includes('?'))){
   await activate(`[data-nav-group=equipment] [data-target="${route}"]`);await wait(`document.querySelector('#screen-${route}.active')&&!window.MCPANavigation?.restoring`);
   assert.equal(await evaluate(`document.querySelector('[data-nav-group=equipment] [data-target="${route}"]').getAttribute('aria-current')`),'page');
  }
  if(account==='admin'){
   await activate('[data-target="asset-retirement-v2?view=history"]');await wait("document.querySelector('#screen-asset-retirement-v2 h2')?.textContent==='Retired Equipment History'");
   assert.equal(await evaluate("document.querySelector('[data-proposal]')"),null,'History shortcut preserves proposals in the separate Asset Retirement view');
   assert.equal(await evaluate("document.querySelector('[data-target=\"asset-retirement-v2?view=history\"]').getAttribute('aria-current')"),'page');
   await command('Page.reload');await wait("document.querySelector('#screen-asset-retirement-v2 h2')?.textContent==='Retired Equipment History'");
   assert.equal(await evaluate("document.querySelector('[data-target=\"asset-retirement-v2?view=history\"]').getAttribute('aria-current')"),'page');
  }
 }
 console.log('PASS Exact Equipment Tracking nesting, Movement-only routes, five-role visibility, pointer/Enter/Space accordions, active states and original child routes');
 await logout();await login('admin');await wait("MCPAAuth.profile?.role==='admin'");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('#nav-list > [data-nav-group]')].map(e=>e.dataset.navGroup)"),['equipment','movements','materials','records','system']);
 await command('Page.navigate',{url:base+'/index.html#site-detail?record='+encodeURIComponent(f.sites.casa)});
 await wait("document.querySelector('#screen-site-detail.active')&&!MCPANavigation.restoring");
 assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page','Project deep links retain direct Projects active state');
 await command('Page.reload');await wait("document.querySelector('#screen-site-detail.active')&&!MCPANavigation.restoring");
 assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');
 for(const keyValue of ['Enter',' ']){await go('dashboard');await evaluate("document.querySelector('#nav-list > [data-target=sites]').focus()");await key(keyValue);await wait("document.querySelector('#screen-sites.active')&&!MCPANavigation.restoring");assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');}
 console.log('PASS Projects: direct one-click/repeated-click route, no nested item or chevron, preserved icon/RBAC, Enter/Space, refresh, direct URL and project deep links');
 for(const dark of [false,true])for(const width of [1440,393]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<900});await evaluate(`document.body.classList.toggle('dark',${dark})`);
  await go('masterlist');await wait("document.querySelector('#equipmentTableBody tr')");
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Inventory fits viewport');
  const disclosure='#equipmentTableBody .equipment-status-details';
  assert.equal(await evaluate(`document.querySelector('${disclosure}').open`),false);
  await activate(disclosure+' summary');assert.ok(await visible(disclosure+' .equipment-status-reason'));await activate(disclosure+' summary');
  if(width<900){await activate('.mobile-menu-btn');assert.equal(await evaluate("document.querySelector('#sidebar').getAttribute('aria-modal')"),'true');}
  assert.ok(await visible('[data-nav-group=equipment] [data-target=repair]'));
  await wait("document.querySelector('#sidebar').getAnimations({subtree:true}).every(a=>a.playState!=='running')");
  const targetSizes=await evaluate("[...document.querySelectorAll('[data-nav-group=equipment] button')].filter(e=>e.checkVisibility()).map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height}))");
  assert.ok(targetSizes.every(e=>e.height>=44),'44px sidebar controls '+JSON.stringify(targetSizes));
  await capture(`equipment-tracking-${width===1440?'desktop':'mobile'}-${dark?'dark':'light'}`);
  if(width<900){await activate('.drawer-close');assert.equal(await evaluate("document.querySelector('.mobile-menu-btn').getAttribute('aria-expanded')"),'false');}
  if(width<900)await activate('.mobile-menu-btn');
  await activate('#nav-list > [data-target=sites]');await wait("document.querySelector('.site-card')&&!document.querySelector('[data-action=add-site]').disabled");
  if(width<900)await activate('.mobile-menu-btn');
  assert.equal(await evaluate("document.querySelector('#nav-list > [data-target=sites]').getAttribute('aria-current')"),'page');
  assert.ok(await evaluate("(()=>{const e=document.querySelector('#nav-list > [data-target=sites]');return e.getBoundingClientRect().height>=44&&e.getBoundingClientRect().width>=200&&getComputedStyle(e).textAlign==='left'})()"),'Projects keeps a full-width 44px touch target');
  await capture(`projects-direct-${width===1440?'desktop':'mobile'}-${dark?'dark':'light'}`);
  if(width<900)await activate('.drawer-close');
  await activate('[data-action=add-site]');
  assert.deepEqual(await evaluate("[...document.querySelector('#site-profession').options].map(o=>({value:o.value,text:o.textContent}))"),[{value:'',text:'Choose profession'},{value:'engineer',text:'Engr'},{value:'architect',text:'Architect'}]);
  assert.equal(await evaluate("document.querySelector('label[for=site-engineer]').textContent"),'Assign Personnel *');
  assert.equal(await evaluate("document.querySelector('#site-profession').value"),'');assert.ok(await evaluate("document.querySelector('#site-engineer').disabled"));
  assert.ok(await visible('#site-profession'));assert.ok(await visible('#site-engineer'));
  assert.equal(await evaluate("document.querySelectorAll('#sites-form>.project-options[open]').length"),0,'Optional sections start collapsed');
  assert.ok(await visible('#sites-form [type=submit]'),'Primary action visible before scrolling');
  assert.ok(await evaluate("(()=>{const d=document.querySelector('#sites-dialog');return d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"),'Project form fits viewport');
  assert.ok(await evaluate("[...document.querySelectorAll('#sites-form select,#sites-form input:not([type=checkbox]),#sites-form button')].filter(e=>e.checkVisibility()).every(e=>e.getBoundingClientRect().height>=44)"),'44px project controls');
  for(const id of ['project-details','project-progress-section','project-note']){await activate('#'+id+'>summary');assert.ok(await evaluate(`document.querySelector('#${id}').open`));await activate('#'+id+'>summary');}
  await capture(`add-project-${width===1440?'desktop':'mobile'}-${dark?'dark':'light'}`);
  await activate('[data-action=close-dialog]');
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.body.classList.remove('dark')");
 assert.deepEqual(await protectedRows(),protectedBefore,'Navigation, disclosures and screenshots leave every fixture record unchanged');
 console.log('PASS Actual Admin screenshots: Equipment Tracking and Add Project at desktop/mobile, light/dark; visible action, disclosure, overflow and 44px checks');
 await activate('[data-action=add-site]');await fill('#site-name','UI review project');await fill('#site-location','Local fixture only');await submit('#sites-form');
 assert.equal(await evaluate("document.querySelector('#site-profession').validity.valueMissing"),true,'Profession selection required');
 for(const profession of ['engineer','architect']){
  await fill('#site-profession',profession);
  const people=await evaluate("[...document.querySelector('#site-engineer').options].filter(o=>o.value&&!o.disabled&&!o.hidden).map(o=>({id:o.value,role:o.dataset.profession}))");
  assert.ok(people.length);assert.ok(people.every(p=>p.role===profession));
 }
 await fill('#site-engineer',f.actors.sky.id);await submit('#sites-form');assert.ok(await evaluate("document.querySelector('#sites-dialog').open"));
 assert.equal((await f.db.query("select count(*)::int n from sites where name='UI review project'")).rows[0].n,0,'Mismatched profile cannot persist');
 await fill('#site-engineer',f.actors.architect.id);await submit('#sites-form');await wait("!document.querySelector('#sites-dialog').open");
 const created=(await f.db.query("select * from sites where name='UI review project'")).rows[0];assert.equal(created.assigned_engineer_id,f.actors.architect.id);
 await go('sites');await wait(`document.querySelector('[data-action=open-site][data-id="${created.id}"]')`);await activate(`[data-action=open-site][data-id="${created.id}"]`);await wait("document.querySelector('[data-action=edit-site]')&&!document.querySelector('[data-action=edit-site]').disabled");await activate('[data-action=edit-site]');
 assert.equal(await evaluate("document.querySelector('#site-profession').value"),'architect');assert.equal(await evaluate("document.querySelector('#site-engineer').value"),f.actors.architect.id);
 await fill('#site-location','Local metadata update');await submit('#sites-form');await wait("!document.querySelector('#sites-dialog').open");
 const saved=(await f.db.query('select * from sites where id=$1',[created.id])).rows[0];assert.equal(saved.assigned_engineer_id,created.assigned_engineer_id);
 assert.ok((await f.db.query('select * from project_history where project_id=$1',[created.id])).rows.length>=2,'Create and metadata edit retain audit history');
 await require('./legacy-profession.browser-checks.cjs').verify(ctx);
 console.log('PASS Required profession, exact choices, filtered personnel, mismatched-profile rejection, UUID relationship, edit restoration, legacy preservation and audit history');
};
