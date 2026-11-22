const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
exports.verify = async c => {
  const {fixture:f,evaluate,command,wait,click,fill,submit,go,login,base,shot,artifactDirectory} = c;
  const phase = process.argv.includes('--before') ? 'before' : 'after';
  const out = path.join(__dirname,'artifacts/ui-review-20261112',phase);
  fs.mkdirSync(out,{recursive:true});
  const results = [];
  await require('./admin-pdf-fixture.cjs').seed(f);
  await command('Page.navigate',{url:base+'/index.html'});
  await login('admin'); await wait("MCPAAuth.profile?.role==='admin'");
  await evaluate(`(() => {
    const original = EquipmentTracking.client;
    window.__uiReview = {};
    EquipmentTracking.client = () => {
      const client = original();
      return new Proxy(client,{get(target,key) {
        if(key==='rpc') return async(name,args) => {
          const override = window.__uiReview.rpc?.[name];
          if(override?.reject) throw Error('Synthetic network interruption');
          if(override) return override;
          return target.rpc(name,args);
        };
        if(key==='functions') return {invoke:async(name,options) => {
          if(options?.body?.action==='capabilities') {
            window.__uiReview.capabilityCalls = (window.__uiReview.capabilityCalls||0)+1;
            return {data:window.__uiReview.capabilities||{development_enabled:false,pending_development_accounts:[],invitation_enabled:false}};
          }
          return target.functions.invoke(name,options);
        }};
        if(key==='storage') return {from:bucket => {
          const storage = target.storage.from(bucket);
          return new Proxy(storage,{get(value,method) {
            if(method==='upload'&&window.__uiReview.uploadSuccess) return async()=>{window.__uiReview.uploads=(window.__uiReview.uploads||0)+1;return {data:{path:'synthetic/upload.png'}};};
            if(method==='remove'&&window.__uiReview.uploadSuccess) return async()=>{window.__uiReview.removals=(window.__uiReview.removals||0)+1;return {data:[]};};
            if(method==='createSignedUrl'&&window.__uiReview.signReject) return async()=>{throw Error('Synthetic preview interruption');};
            return typeof value[method]==='function'?value[method].bind(value):value[method];
          }});
        }};
        return typeof target[key]==='function'?target[key].bind(target):target[key];
      }});
    };
  })()`);
  const reset = async state => { await go('dashboard'); await evaluate('window.__uiReview='+JSON.stringify(state||{})); };
  const test = async(name,run) => {
    try { await run(); results.push({name,status:'PASS'}); console.log('PASS '+name); }
    catch(error) { results.push({name,status:'FAIL',detail:error.message.slice(0,350)}); console.log('FAIL '+name+': '+error.message.slice(0,160)); }
  };
  await test('Settings recovers from a rejected photo capability request',async()=>{
    await reset({rpc:{mcpa_my_profile_picture:{reject:true}}}); await go('settings');
    await wait("!document.querySelector('#profile-picture-help').textContent.includes('Checking')");
    assert.equal(await evaluate("document.querySelector('#profile-picture-file').disabled"),true);
    assert.equal(await evaluate("document.querySelector('[data-retry-profile-photo]')?.checkVisibility()"),true);
    await evaluate("window.__uiReview.rpc.mcpa_my_profile_picture={data:{version:1,object_name:null}};");
    await click('[data-retry-profile-photo]'); await wait("!document.querySelector('#profile-picture-file').disabled");
  });
  await test('Settings handles rejected signed-image preview requests',async()=>{
    await reset({rpc:{mcpa_my_profile_picture:{data:{version:1,object_name:'synthetic/photo.png'}}},signReject:true}); await go('settings');
    await wait("document.querySelector('#profile-picture-help').textContent.includes('preview')");
    assert.equal(await evaluate("document.querySelector('#profile-picture-preview').hidden"),true);
    assert.equal(await evaluate("document.querySelector('[data-retry-profile-photo]')?.checkVisibility()"),true);
  });
  await test('Unconfirmed photo saves retain the upload and require a read before retry',async()=>{
    await reset({rpc:{mcpa_my_profile_picture:{data:{version:1,object_name:null}},mcpa_set_my_profile_picture:{error:{code:'503',message:'Synthetic save interruption'}}},uploadSuccess:true});
    await go('settings'); await wait("!document.querySelector('#profile-picture-file').disabled");
    await evaluate("(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').fillRect(0,0,1,1);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'synthetic.png',{type:'image/png'}));document.querySelector('#profile-picture-file').files=dt.files;})()");
    await submit('#profile-picture-form');
    await wait("document.querySelector('#profile-picture-help').textContent.includes('not confirmed')");
    assert.equal(await evaluate('window.__uiReview.removals||0'),0);
    assert.equal(await evaluate('window.__uiReview.uploads'),1);
    assert.equal(await evaluate("document.querySelector('#profile-picture-form [type=submit]').disabled"),true);
    await click('[data-retry-profile-photo]'); await wait("!document.querySelector('#profile-picture-file').disabled");
    assert.equal(await evaluate('window.__uiReview.uploads'),1,'Reading storage never repeats an upload');
  });
  await test('People exits its loading state and offers retry after a failed read',async()=>{
    await reset({rpc:{mcpa_accounts:{error:{code:'503',message:'Synthetic read failure'}}}}); await go('users');
    await wait("document.querySelector('#accounts-list').getAttribute('aria-busy')==='false'");
    assert.equal(await evaluate("document.querySelector('[data-retry-people]')?.checkVisibility()"),true);
    await evaluate('window.__uiReview.rpc={}'); await click('[data-retry-people]');
    await wait("document.querySelector('#accounts-list tbody tr')");
  });
  await test('People can automatically recover to a genuinely empty list',async()=>{
    await reset({rpc:{mcpa_accounts:{error:{code:'503',message:'Synthetic read failure'}}}}); await go('users');
    await wait("document.querySelector('[data-retry-people]')");
    const before=await evaluate('window.__uiReview.capabilityCalls');
    await evaluate("window.__uiReview.rpc.mcpa_accounts={data:[]};__tickSync()");
    await wait('window.__uiReview.capabilityCalls>'+before);
    assert.match(await evaluate("document.querySelector('#accounts-list').textContent"),/No people match your search/);
    assert.equal(await evaluate("document.querySelector('[data-retry-people]')"),null);
  });
  await test('Account save errors remain visible inside the open modal',async()=>{
    await reset({rpc:{mcpa_save_account:{error:{code:'22023',message:'Synthetic role update rejected.'}}}}); await go('users');
    await wait("document.querySelector('[data-edit]')"); await click('[data-edit]'); await submit('#edit-form');
    await wait("document.querySelector('#accounts-feedback').textContent.includes('Synthetic role update rejected')");
    assert.equal(await evaluate("document.querySelector('#edit-panel [data-account-feedback][role=alert]')?.checkVisibility()"),true);
    if(!process.argv.includes('--no-captures'))for(const width of [1440,393])for(const dark of [false,true]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<900});
      await evaluate('applyTheme('+dark+',false)');
      assert.equal(await evaluate("document.querySelector('#edit-panel [data-account-feedback]').checkVisibility()"),true);
      const name='account-error-'+width+'-'+(dark?'dark':'light');
      await shot(name+'-'+phase,true);
      fs.copyFileSync(path.join(artifactDirectory,name+'-'+phase+'.png'),path.join(out,name+'.png'));
    }
    await click('[data-close-edit]');
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('applyTheme(false,false)');
  });
  await test('Unavailable invitation fields stay disabled after automatic refresh',async()=>{
    await reset(); await go('users'); await wait("!document.querySelector('[data-invite]').disabled"); await click('[data-invite]');
    const before = await evaluate('window.__uiReview.capabilityCalls');
    await evaluate('__tickSync()'); await wait('window.__uiReview.capabilityCalls>'+before);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-invite-form] input,[data-invite-form] select,[data-invite-form] button')].every(e=>e.disabled)"),true);
    await click('[data-close-lifecycle]');
  });
  await test('Removal target is not offered approval or rejection actions',async()=>{
    await reset({rpc:{mcpa_admin_lifecycle_capabilities:{data:{version:1,removal:true}},mcpa_account_removals:{data:[{id:'synthetic-removal',profile_id:f.actors.admin.id,requested_by:f.actors.admin2.id,status:'pending',reason:'Synthetic target exclusion',requested_at:'2026-11-12T00:00:00Z'}]}}});
    await go('users'); await wait("document.querySelector('[data-remove]:not(:disabled)')"); await click('[data-account-history]');
    await wait("document.querySelector('[data-removal-history]').textContent.includes('Synthetic target exclusion')");
    assert.equal(await evaluate("document.querySelectorAll('[data-removal-decision]').length"),0);
    await click('[data-close-archive]');
  });
  await test('Retirement exposes its required equipment picker on invalid submission',async()=>{
    await reset(); await go('asset-retirement-v2'); await wait("document.querySelector('[data-proposal]')");
    await fill('[data-proposal] [name=effectiveDate]','2026-10-01'); await fill('[data-proposal] [name=reason]','Synthetic validation only');
    await submit('[data-proposal]');
    assert.equal(await evaluate("document.querySelector('[data-equipment-picker]').open"),true);
  });
  await test('Settings wraps a valid long display name at mobile width',async()=>{
    await reset(); await go('settings');
    await command('Emulation.setDeviceMetricsOverride',{width:320,height:1000,deviceScaleFactor:1,mobile:true});
    await evaluate("document.querySelector('[data-profile-name]').textContent='A'.repeat(120)");
    if(!process.argv.includes('--no-captures')){
      await shot('settings-long-name-'+phase,true);
      fs.copyFileSync(path.join(artifactDirectory,'settings-long-name-'+phase+'.png'),path.join(out,'settings-long-name.png'));
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  });
  await reset();
  for(const width of [1440,393,320]) for(const dark of [false,true]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<900});
    await evaluate('applyTheme('+dark+',false)');
    for(const route of ['masterlist','asset-retirement-v2','request','transfer?view=history','return','consumables','users','settings']) {
      await test(route+' fits '+width+' '+(dark?'dark':'light'),async()=>{
        await go(route); await wait("!document.querySelector('#content [aria-busy=true]')");
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
        if(width!==320&&!process.argv.includes('--no-captures')) {
          const name=route.split('?')[0]+'-'+width+'-'+(dark?'dark':'light');
          await shot(name+'-'+phase,true);
          fs.copyFileSync(path.join(artifactDirectory,name+'-'+phase+'.png'),path.join(out,name+'.png'));
        }
      });
    }
  }
  await test('Offline demo explains disabled profile pictures without a loading placeholder',async()=>{
    await c.logout(); await click('[data-auth-demo]'); await click('[data-demo-role=admin]'); await wait("MCPAAuth.isDemo && document.querySelector('.admin-review')");
    await go('settings');
    assert.match(await evaluate("document.querySelector('#profile-picture-help').textContent"),/unavailable in the offline demo/);
    assert.equal(await evaluate("document.querySelector('#profile-picture-file').disabled"),true);
  });
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({phase,scope:'Loopback-only synthetic UI fixtures',results},null,2)+'\n');
  assert.equal(results.filter(r=>r.status==='FAIL').length,0,'Focused UI review failures: '+results.filter(r=>r.status==='FAIL').map(r=>r.name).join('; '));
};
