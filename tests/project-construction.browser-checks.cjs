const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {areas,labels}=require('./project-construction-fixture.cjs');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,shot,artifactDirectory,base})=>{
 const output=path.join(__dirname,'../documentation/project-construction-2026-10-23/screenshots');fs.mkdirSync(output,{recursive:true});
 const screenshot=async name=>{await shot(name,true);const file=path.join(artifactDirectory,name+'.png');if(fs.existsSync(file))fs.copyFileSync(file,path.join(output,name+'.png'));};
 const protectedRows=async()=>(await f.db.query("select jsonb_build_object('equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),'movements',(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m),'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p)) as value")).rows[0].value;
 const before=await protectedRows();
 await f.query(f.actors.admin,"update sites set phase='Unmatched legacy phase',progress=73,status='active' where id=$1",[f.sites.casa]);
 await go('sites');await wait("document.querySelector('.site-card')");await click(`[data-action="open-site"][data-id="${f.sites.casa}"]`);
 await click('[data-action=edit-site]');
 assert.equal(await evaluate("document.querySelector('#site-status, #sites-form [name=status]')"),null);
 assert.equal(await evaluate("document.querySelector('#sites-form').textContent.includes('Operational Status')"),false);
 assert.deepEqual(await evaluate("[...document.querySelector('#site-phase').options].map(o=>o.text).slice(1)"),labels);
 assert.deepEqual(await evaluate("[...document.querySelector('#site-stage').options].map(o=>o.text).slice(1)"),['Planning/Designing','Permitting','Groundbreaking','Construction Phase','Turnover']);
 assert.ok((await evaluate("document.querySelector('#sites-form').textContent")).includes('Unmatched legacy phase'));
 assert.equal(await evaluate("document.querySelector('#project-computed-value').textContent"),'Not configured');
 assert.equal(await evaluate("document.querySelector('#site-progress')"),null);
 await click('#project-progress-enabled');
 const initial=areas();for(let i=0;i<labels.length;i++)await fill('#area-completion-'+i,String(initial[labels[i]].completion));
 assert.equal(await evaluate("document.querySelector('#project-computed-value').textContent"),'45%');
 const decimal=areas([33.33,25.25,99.99,3.33,5.55,77.77],[33.33,16.67,10,10,10,20]);
 for(let i=0;i<labels.length;i++){await fill('#area-completion-'+i,String(decimal[labels[i]].completion));await fill('#area-weight-'+i,String(decimal[labels[i]].weight));}
 assert.equal(await evaluate("document.querySelector('#project-computed-value').textContent"),'41.76%');
 const na=areas([100,0,0,0,0,0],[50,0,20,10,0,20]);
 for(let i=0;i<labels.length;i++){await fill('#area-completion-'+i,String(na[labels[i]].completion));await fill('#area-weight-'+i,String(na[labels[i]].weight));}
 await evaluate("[...document.querySelectorAll('[data-progress=applicable]')].forEach((el,i)=>{el.checked=![1,4].includes(i);el.dispatchEvent(new Event('input',{bubbles:true}));})");
 assert.equal(await evaluate("document.querySelector('#project-computed-value').textContent"),'50%');
 await evaluate("document.querySelectorAll('[data-progress=applicable]').forEach(el=>{el.checked=true;el.dispatchEvent(new Event('input',{bubbles:true}));})");
 for(let i=0;i<labels.length;i++){await fill('#area-completion-'+i,String(initial[labels[i]].completion));await fill('#area-weight-'+i,String(initial[labels[i]].weight));}
 await fill('#area-weight-0','29.99');assert.ok((await evaluate("document.querySelector('#project-progress-error').textContent")).includes('99.99%'));
 await submit('#sites-form');await wait("!document.querySelector('#sites-form-error').classList.contains('hidden')");
 await fill('#area-weight-0','30');await fill('#site-stage','Construction Phase');await fill('#site-phase','Structural');await fill('#site-reason','Structural works inspected.');
 await evaluate("document.querySelector('#sites-form').requestSubmit();document.querySelector('#sites-form').requestSubmit()");await wait("!document.querySelector('#sites-dialog').open");
 let row=(await f.db.query('select * from sites where id=$1',[f.sites.casa])).rows[0];assert.equal(Number(row.construction_completion),45);assert.equal(row.progress,73);assert.equal(row.phase,'Unmatched legacy phase');assert.equal(row.status,'active');assert.equal(row.project_stage,'Construction Phase');
 assert.equal((await f.db.query("select count(*)::int as n from project_history where project_id=$1 and reason='Structural works inspected.'",[f.sites.casa])).rows[0].n,1);
 assert.equal((await f.db.query("select change_types from project_history where project_id=$1 and reason='Structural works inspected.'",[f.sites.casa])).rows[0].change_types.includes('status'),false);
 await command('Page.reload');await wait("document.querySelector('.site-card')");await click(`[data-action="open-site"][data-id="${f.sites.casa}"]`);await click('[data-action=edit-site]');
 assert.equal(await evaluate("document.querySelector('#site-stage').value"),'Construction Phase');assert.equal(await evaluate("document.querySelector('#site-phase').value"),'Structural');
 assert.equal(await evaluate("document.querySelector('#project-computed-value').textContent"),'45%');
 // Stale editor loses to a competing metadata writer; progress remains intact.
 await f.query(f.actors.admin,"update sites set location='Concurrent location' where id=$1",[f.sites.casa]);await fill('#site-location','Stale location');await submit('#sites-form');await wait("document.querySelector('#sites-form-error').textContent.includes('changed while')");
 assert.equal((await f.db.query('select location from sites where id=$1',[f.sites.casa])).rows[0].location,'Concurrent location');
 await click('[data-action=close-dialog]');await wait("!document.querySelector('#sites-dialog').open && !document.querySelector('[data-action=edit-site]').disabled");
 // Simulate a lost response after COMMIT. Same form + payload reuses its key.
 await click('[data-action=site-update]');await fill('#site-update-type','Milestone');const longNote='Site inspection completed. <script>not executable</script> '+('Long site note about approved structural measurements. '.repeat(35));await fill('#site-update-description',longNote);await fill('#site-update-area','Structural');
 await evaluate(`window.__projectOriginalRpc=supabaseClient.rpc.bind(supabaseClient);window.__loseSiteResponse=true;supabaseClient.rpc=async(name,args)=>{const value=await __projectOriginalRpc(name,args);if(name==='mcpa_add_site_update'&&__loseSiteResponse&&!value.error){__loseSiteResponse=false;return {error:{code:'TEST'}};}return value;};`);
 await submit('#site-update-form');await wait("!document.querySelector('#sites-form-error').classList.contains('hidden')");await submit('#site-update-form');await wait("!document.querySelector('#sites-dialog').open");
 assert.equal((await f.db.query("select count(*)::int as n from project_history where project_id=$1 and change_types='{site_update}'",[f.sites.casa])).rows[0].n,1);
 await evaluate('supabaseClient.rpc=__projectOriginalRpc');
 let matrix=0;
 for(const dark of [false,true])for(const width of [375,393,430,768,1024,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.body.classList.toggle('dark',${dark})`);
  const layout=async label=>{
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' page overflow '+width);
   const dims=await evaluate("(()=>{const d=document.querySelector('#sites-dialog');return {client:d.clientWidth,scroll:d.scrollWidth,top:d.getBoundingClientRect().top,left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right};})()");
   assert.ok(dims.scroll<=dims.client+1,label+' modal overflow '+width+' '+JSON.stringify(dims));assert.ok(dims.left>=0&&dims.right<=width+1,label+' modal viewport');
  };
  await wait("!document.querySelector('[data-action=edit-site]').disabled");await evaluate("document.querySelector('[data-action=edit-site]').focus()");await click('[data-action=edit-site]');await wait("document.querySelector('#sites-dialog').open");await layout('edit/progress');
  assert.equal(await evaluate("document.querySelectorAll('[data-area]').length"),6);
  if([375,1440].includes(width)){
   await screenshot(`projects-edit-${width}-${dark?'dark':'light'}`);
   await evaluate("document.querySelector('#project-progress-editor').scrollIntoView({block:'start'})");
   await screenshot(`projects-progress-${width}-${dark?'dark':'light'}`);
  }
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('#sites-dialog').open");
  await wait("document.activeElement.matches('[data-action=edit-site]')");
  await wait("!document.querySelector('[data-action=site-update]').disabled");await click('[data-action=site-update]');await fill('#site-update-description','Responsive draft');await layout('site update');
  if(width===375)await screenshot(`projects-site-update-${dark?'dark':'light'}`);
  await click('[data-action=close-dialog]');await wait("!document.querySelector('#sites-dialog').open");await click('[data-action=project-history]');await wait("document.querySelector('#project-history-events')");await layout('history');
  assert.ok((await evaluate("document.querySelector('#project-history-events').textContent")).includes(longNote.trim()));assert.equal(await evaluate("document.querySelectorAll('#project-history-events script').length"),0);
  await fill('#project-history-search','Structural works inspected.');assert.equal(await evaluate("document.querySelectorAll('.project-history-event').length"),1);
  await fill('#project-history-search','No matching site update');assert.equal(await evaluate("document.querySelectorAll('.project-history-event').length"),0);
  await fill('#project-history-search','');await fill('#project-history-type','site_update');assert.equal(await evaluate("document.querySelectorAll('.project-history-event').length"),1);
  if([375,1440].includes(width))await screenshot(`projects-history-${width}-${dark?'dark':'light'}`);
  await click('[data-action=close-dialog]');await wait("!document.querySelector('#sites-dialog').open");matrix++;
 }
 // Corrections append a linked record. Original descriptions remain unchanged.
 await click('[data-action=project-history]');await wait("document.querySelector('[data-action=correct-site-update]')");const correctionId=await evaluate("document.querySelector('[data-action=correct-site-update]').dataset.id");
 // readOnly is captured at mount; operational-role checks use current context.
 // A changed context must also hide corrections when the timeline rerenders.
 await evaluate('window.__correctionOriginalContext=MovementStore.getContext');
 try{
  for(const role of ['engineer','architect']){
   await evaluate(`MovementStore.getContext=()=>({...__correctionOriginalContext.call(MovementStore),role:${JSON.stringify(role)}})`);
   await fill('#project-history-search','');
   assert.equal(await evaluate("document.querySelectorAll('[data-action=correct-site-update]').length"),0,role+' changed context hides correction');
  }
 }finally{await evaluate('MovementStore.getContext=__correctionOriginalContext;delete window.__correctionOriginalContext');}
 await fill('#project-history-search','');await click('[data-action=correct-site-update]');await fill('#site-update-description','Inspection note corrected after review.');await submit('#site-update-form');await wait("!document.querySelector('#sites-dialog').open");
 assert.equal((await f.db.query('select count(*)::int as n from project_history where correction_of=$1',[correctionId])).rows[0].n,1);
 await wait("!document.querySelector('[data-action=archive-site]').disabled");await click('[data-action=archive-site]');await click('[data-action=confirm-archive]');await wait("!document.querySelector('#sites-dialog').open");await fill('#projects-archived',true);await evaluate("document.querySelector('#projects-archived').checked=true;document.querySelector('#projects-archived').dispatchEvent(new Event('change',{bubbles:true}))");await click(`[data-action="open-site"][data-id="${f.sites.casa}"]`);await click('[data-action=archive-site]');await click('[data-action=confirm-archive]');await wait("!document.querySelector('#sites-dialog').open");
 // Creation uses server-generated history and never accepts an arbitrary %.
 await go('sites');await wait("!document.querySelector('[data-action=add-site]').disabled");await click('[data-action=add-site]');
 assert.equal(await evaluate("document.querySelector('#site-status, #sites-form [name=status]')"),null);
 assert.equal(await evaluate("document.querySelector('#sites-form').textContent.includes('Operational Status')"),false);
 await fill('#site-name','Browser-created fixture');await fill('#site-location','Isolated local fixture');await fill('#site-engineer',f.actors.architect.id);await fill('#site-stage','Planning/Designing');await submit('#sites-form');await wait("!document.querySelector('#sites-dialog').open");
 const created=(await f.db.query("select * from sites where name='Browser-created fixture'")).rows[0];assert.equal(created.construction_completion,null);assert.equal(created.assigned_engineer_id,f.actors.architect.id);assert.equal(created.status,'planning');
 const creation=(await f.db.query('select * from project_history where project_id=$1',[created.id])).rows;assert.equal(creation.length,1);assert.deepEqual(creation[0].change_types,['created']);
 for(const [account,projectId]of [['sky',f.sites.casa],['architect',created.id],['handler',f.sites.casa]]){
  await logout();await login(account);await wait(`MCPAAuth.profile?.role===${JSON.stringify(f.actors[account].role)}`);await go('sites');await wait("document.querySelector('.site-card')");await click(`[data-action="open-site"][data-id="${projectId}"]`);
  assert.equal(await evaluate("document.querySelectorAll('[data-action=edit-site],[data-action=site-update],[data-action=archive-site]').length"),0);
  await click('[data-action=project-history]');await wait("document.querySelector('.project-history-event')");
  assert.equal(await evaluate("document.querySelectorAll('[data-action=correct-site-update]').length"),0,account+' has read-only history');
  const eventsBefore=(await f.db.query('select * from project_history order by id')).rows;
  // An injected action still cannot open the editor or submit a correction.
  await evaluate(`(()=>{const b=document.createElement('button');b.dataset.action='correct-site-update';b.dataset.id=${JSON.stringify(correctionId)};document.querySelector('#project-history-events').append(b);b.click();b.remove();})()`);
  assert.equal(await evaluate("document.querySelector('#site-update-form')"),null);
  const result=await evaluate(`supabaseClient.rpc('mcpa_add_site_update',{p_project_id:${JSON.stringify(projectId)},p_operation_id:crypto.randomUUID(),p_type:'Correction',p_description:'Unauthorized correction',p_work_area:null,p_correction_of:${JSON.stringify(correctionId)}})`);
  assert.equal(result.error?.code,'42501',account+' cannot submit correction RPC');
  assert.deepEqual((await f.db.query('select * from project_history order by id')).rows,eventsBefore);
 }
 assert.deepEqual(await protectedRows(),before,'Project workflows preserve equipment, movements and identities');
 console.log(`PASS Projects: ${matrix} viewport/theme combinations, edit/progress/site/history overflow, exact options, persistence, weighted preview, validation, stale save, duplicate submit, lost-response retry, escaped notes, Admin correction, Engineer/Architect context changes, read-only Engineer/Architect/Tool Handler history and denied corrections, archive/restore, creation, Escape/focus and protected records`);
};
