const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
exports.verify=async({fixture:f,evaluate,command,wait,click,go,login,logout,shot})=>{
  const viewport=width=>command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
  const configuration='Projects needs a database configuration update.';
  const protectedRows=async()=>(await f.db.query(`select jsonb_build_object(
    'sites',(select jsonb_agg(to_jsonb(s) order by id) from sites s),
    'equipment',(select jsonb_agg(to_jsonb(e) order by id) from equipment e),
    'movements',(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m),
    'accounts',(select jsonb_agg(to_jsonb(p) order by id) from profiles p)) as value`)).rows[0].value;
  const before=await protectedRows();
  // The isolated fixture matches the reviewed live failure: the RPC is installed
  // but the legacy history table and capture trigger have never been installed.
  assert.equal((await f.db.query("select to_regclass('public.project_history') as history")).rows[0].history,null);
  await logout();await login('sky');await wait("document.querySelector('.overview-actions')");
  for(const width of [393,1440]){
    await viewport(width);await go('sites');await wait("document.querySelector('#sites-feedback').textContent.includes('database configuration update')");
    const text=await evaluate("document.querySelector('#sites-module').textContent");
    assert.ok(text.includes(configuration));
    assert.ok(!text.includes('public.project_history')&&!text.includes('Please check the database connection'));
    assert.equal(await evaluate("document.querySelectorAll('[data-action=add-site],[data-action=edit-site]').length"),0);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await shot('projects-schema-error-'+width,true);
    await go('dashboard');
  }
  // Admin's list remains readable; opening history reports the same safe error.
  await logout();await login('admin');await wait("document.querySelector('.admin-review')");
  await go('sites');await wait("document.querySelector('.site-card')");await click('.site-card');
  await click('[data-action=project-history]');await wait("document.querySelector('#sites-feedback').textContent.includes('database configuration update')");
  assert.ok(!(await evaluate("document.querySelector('#sites-module').textContent")).includes('public.project_history'));
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100002_project_history.sql'),'utf8'));
  // Healthy Admin/Engineer views retain actual assignments, history and controls.
  for(const actor of ['admin','sky','pau']){
    await logout();await login(actor);await wait("document.querySelector('.admin-review,.overview-actions')");
    for(const width of [393,1440]){
      await viewport(width);await go('sites');
      if(actor==='pau'){
        await wait("document.querySelector('#sites-list').textContent.includes('No projects assigned')");
      }else{
        await wait("document.querySelector('.site-card')");
        assert.equal(await evaluate("document.querySelectorAll('[data-action=add-site]').length"),actor==='admin'?1:0);
        const cards=await evaluate("[...document.querySelectorAll('.site-card')].map(el=>({id:el.dataset.id,text:el.textContent}))");
        const expected=(await f.query(f.actors.admin,'select s.id,p.name from sites s join profiles p on p.id=s.assigned_engineer_id')).rows;
        for(const card of cards){const match=expected.find(s=>s.id===card.id);if(match)assert.ok(card.text.includes(match.name));}
        if(actor==='sky')assert.ok(cards.every(card=>card.text.includes(f.actors.sky.name)));
        await click('.site-card');await wait("document.querySelector('#screen-site-detail.active')");
        assert.equal(await evaluate("document.querySelectorAll('[data-action=edit-site]').length"),actor==='admin'?1:0);
        await click('[data-action=project-history]');await wait("document.querySelector('#sites-dialog').open");
        assert.ok((await evaluate("document.querySelector('#sites-dialog-content').textContent")).trim().length>0);
        await click('[data-action=close-dialog]');await wait("!document.querySelector('#sites-dialog').open");
      }
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      if(actor!=='pau')await shot('projects-healthy-'+actor+'-'+width,true);
      await go('dashboard');
    }
  }
  assert.deepEqual(await protectedRows(),before,'Read-only UI checks retain all fixture business records');
  assert.deepEqual((await f.db.query('select * from project_history order by id')).rows,[],'Repair/read-only UI checks create no invented history');
  // B with an assignment is distinct from B's valid empty state above.
  const receiving=randomUUID();await f.query(f.actors.admin,"insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'B fixture project','Local test only',$2,$3)",[receiving,f.actors.pau.name,f.actors.pau.id]);
  await go('sites');await wait("document.querySelector('.site-card')");
  assert.equal(await evaluate("document.querySelectorAll('.site-card').length"),1);
  assert.ok((await evaluate("document.querySelector('.site-card').textContent")).includes(f.actors.pau.name));
  await click('.site-card');await click('[data-action=project-history]');await wait("document.querySelector('#sites-dialog').open");
  assert.ok((await evaluate("document.querySelector('#sites-dialog-content').textContent")).includes('created'));
  await click('[data-action=close-dialog]');await wait("!document.querySelector('#sites-dialog').open");
  // Missing-RPC and unknown errors must not display raw SQL/server text either.
  await evaluate(`window.__originalProjectRpc=supabaseClient.rpc.bind(supabaseClient);
    window.__projectFailure=null;
    supabaseClient.rpc=(name,args)=>name==='mcpa_project_snapshot'&&__projectFailure
      ?Promise.resolve({error:__projectFailure}):__originalProjectRpc(name,args);`);
  for(const [code,expected] of [['PGRST202','database configuration update'],['XX000','could not complete this request'],['42501','does not have permission']]){
    await go('dashboard');await evaluate(`__projectFailure=${JSON.stringify({code,message:'sensitive_schema.internal_table must never appear in the UI'})}`);
    await go('sites');await wait(`document.querySelector('#sites-feedback').textContent.includes(${JSON.stringify(expected)})`);
    assert.ok(!(await evaluate("document.querySelector('#sites-module').textContent")).includes('sensitive_schema'));
  }
  await evaluate('__projectFailure=null');await click('[data-action=refresh]');await wait("document.querySelector('.site-card')");
  assert.equal(await evaluate("document.querySelector('#sites-feedback').textContent"),'');
  console.log('PASS Missing relation/RPC and unknown errors sanitized; retry, desktop/mobile Engineer A/B and Admin views, actual accountability, history and read-only controls');
};
