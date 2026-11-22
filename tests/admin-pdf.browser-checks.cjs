const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.verify=async c=>{
 const {fixture:f,evaluate,command,wait,click,fill,submit,go,login,logout,base,shot,artifactDirectory}=c;
 const phase=process.argv.includes('--before')?'before':'after',captures=!process.argv.includes('--no-captures');
 const out=path.join(__dirname,'../docs/admin-pdf-review/screenshots',phase);if(captures)fs.mkdirSync(out,{recursive:true});
 const seed=await require('./admin-pdf-fixture.cjs').seed(f);
 await command('Page.navigate',{url:base+'/index.html'});await login('admin');await wait("MCPAAuth.profile?.role==='admin'");
 const crypto=require('node:crypto'),sourceFiles=['app/core/navigation.js','app/core/integration.js','app/features/equipment-retirement/retirement.mjs','app/features/equipment-requests/unified.mjs','app/portals/admin/return-inspection/return-inspection.mjs','app/portals/admin/consumables/consumables.html','app/portals/admin/users/users.js','app/portals/admin/settings/settings.js'];
 const verified=[];for(const file of sourceFiles){const served=Buffer.from(await(await fetch(base+'/'+file)).arrayBuffer()),source=fs.readFileSync(path.join(__dirname,'../public',file));assert.deepEqual(served,source,'Screenshot app uses checkout bytes: '+file);verified.push({file,sha256:crypto.createHash('sha256').update(served).digest('hex')});}
 if(captures)fs.writeFileSync(path.join(out,'served-source.json'),JSON.stringify({checkout:path.resolve(__dirname,'..'),phase,files:verified},null,2));
 if(phase==='after')await require('./admin-pdf-functional.cjs').verify({...c,seed});
 for(const width of (process.argv.includes('--no-captures')?[]:[1440,393]))for(const dark of [false,true]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<900});
  await evaluate(`applyTheme(${dark},false)`);
  for(const [page,route]of [['p01-inventory','masterlist'],['p02-retirement','asset-retirement-v2'],['p03-projects','sites'],['p04-requests','request'],['p07-transfers','transfer?view=history'],['p09-returns','return'],['p10-consumables','consumables'],['p11-people','users'],['p12-settings','settings']].filter(([,route])=>!process.argv.includes('--dialogs-only')||['request','return','users'].includes(route))){
   await go(route);await wait("!document.querySelector('#content [aria-busy=true]')");
   if(phase==='after')assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route+' fits '+width);
   const name=`${page}-${width}-${dark?'dark':'light'}`;await shot(name,true);fs.copyFileSync(path.join(artifactDirectory,name+'.png'),path.join(out,name+'.png'));
   if(phase==='after'&&process.argv.includes('--detail-captures')){
    const capture=async suffix=>{const n=`${page}-${suffix}-${width}-${dark?'dark':'light'}`;await shot(n,true);fs.copyFileSync(path.join(artifactDirectory,n+'.png'),path.join(out,n+'.png'));};
    if(route==='asset-retirement-v2'){await click('[data-equipment-picker] summary');await capture('equipment-list');await click('[data-retirement-tab=history]');await capture('history');await click('[data-view-retirement]');await wait("document.querySelector('[data-retirement-dialog][open]')");await capture('history-dialog');await click('[data-close-retirement]');}
    if(route==='request'){await click('[data-request-tab=history]');await capture('history');await click('[data-open-request]');await wait("document.querySelector('[data-equipment-review][open]')");await capture('received-dialog');}
    if(route==='return'){await click('[data-view-return]');await capture('detail-dialog');}
    if(route==='consumables'){await click('[data-cons-tab=requests]');await capture('purchase-request');}
    if(route==='users'){await click('[data-open-account]');await capture('add-account');await click('#account-panel [data-close-account]');await click('[data-edit]');await capture('edit-access');await click('#edit-panel [data-close-edit]');await click('[data-invite]');await capture('invite-unavailable');await click('[data-close-lifecycle]');await click('[data-account-history]');await wait("document.querySelector('#account-archive-dialog[open]')");await capture('archives-dialog');await click('[data-close-archive]');}
   }
  }
 }
 if(!process.argv.includes('--no-captures'))console.log('PASS '+phase+' actual application desktop/mobile light/dark screenshots');
 if(phase==='after')await require('./admin-pdf-backends.browser.cjs').verify(c);
};
