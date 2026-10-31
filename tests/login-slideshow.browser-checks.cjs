const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.verify=async({evaluate,command,wait,click,fill,login,logout,base})=>{
  const directory=path.join(__dirname,'artifacts/manual-gallery');fs.mkdirSync(directory,{recursive:true});
  const checks=[],viewports=[];
  const check=name=>{checks.push(name);console.log('PASS '+name);};
  const shot=async name=>{const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(data,'base64'));};
  const current="document.querySelector('#login-slideshow')?.dataset.project";
  const settled=`(()=>{const stage=document.querySelector('#login-slideshow');if(!stage)return false;const slide=stage.querySelector('.login-slide[data-project="'+stage.dataset.project+'"]');return slide?.querySelector('img').naturalWidth>0&&getComputedStyle(slide).opacity==='1'&&slide.getAnimations().length===0;})()`;
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__loginTimers=new Set();const timeout=window.setTimeout,clear=window.clearTimeout;
    window.setTimeout=(fn,ms,...args)=>{const gallery=new Error().stack.includes('/js/login-slideshow.js');const id=timeout(()=>{__loginTimers.delete(id);fn(...args)},ms);if(gallery)__loginTimers.add(id);return id};
    window.clearTimeout=id=>{__loginTimers.delete(id);clear(id)};
  `});
  const navigate=async(route='/MCPA/index.html')=>{await command('Page.navigate',{url:base+route});await wait("document.querySelector('#auth-email') && !document.querySelector('[data-login-step=\"1\"]').hidden");await wait(settled);};
  const compactNavigate=async()=>{await command('Page.navigate',{url:base+'/MCPA/index.html'});await wait("document.querySelector('#auth-email') && document.querySelector('.login-mobile-photo').dataset.project==='10'");};
  const step=async(direction,project)=>{await click(`[data-login-step="${direction}"]`);await wait(`${current}==='${project}'`);await wait(settled);};
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../images/login-slideshow/manifest.json')));
  assert.equal(manifest.assets.length,10);assert.equal(new Set(manifest.assets.map(a=>a.sourceSha256)).size,10);
  for(const asset of manifest.assets){const bytes=fs.readFileSync(path.join(__dirname,'../images/login-slideshow',asset.source));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sourceSha256);}
  const originals=fs.readdirSync(path.join(__dirname,'../images/login-slideshow')).filter(name=>/^project-\d+\.(png|jpg)$/.test(name));assert.equal(originals.length,10);
  check('Exactly ten unique registered photographs; every original hash is preserved');
  for(const [width,height]of [[375,812],[393,852],[430,932],[768,1024],[900,900],[901,900],[1024,1366],[1024,768],[1200,800],[1201,800],[1366,768],[1440,900],[1920,1080],[2560,1440],[2560,1080]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
    const compact=width<=900||(width<=1200&&width/height<=1.5);
    if(compact)await compactNavigate();else await navigate();
    assert.equal(await evaluate(current),'10');
    const layout=await evaluate(`(()=>{const gallery=document.querySelector('.login-gallery').getBoundingClientRect(),card=document.querySelector('.login-card').getBoundingClientRect(),footer=document.querySelector('.login-gallery-footer'),photo=document.querySelector('.login-mobile-photo');return {overflow:document.documentElement.scrollWidth>innerWidth,card:{x:card.x,width:card.width,bottom:card.bottom},gallery:{right:gallery.right,height:gallery.height,width:gallery.width},controls:getComputedStyle(footer).display,controlsTop:footer.getBoundingClientRect().top,glass:getComputedStyle(document.querySelector('.login-card')).backdropFilter,mobileFilter:getComputedStyle(photo).filter,mobileFit:getComputedStyle(photo).objectFit,mobileProject:photo.dataset.project}})()`);
    assert.equal(layout.overflow,false);assert.ok(layout.card.bottom<=height);
    assert.ok(Math.abs(layout.card.x+layout.card.width/2-(compact?width/2:(layout.gallery.right+width)/2))<1);
    assert.equal(await evaluate("document.querySelector('[data-login-counter]').textContent.trim()"),'01 / 10');
    assert.equal(await evaluate("document.querySelector('[data-login-progress]').style.transform"),'scaleX(0.1)');
    if(compact){assert.equal(layout.controls,'none');assert.equal(layout.glass,'blur(14px)');assert.equal(layout.mobileFilter,'blur(16px)');assert.equal(layout.mobileFit,'cover');assert.equal(layout.mobileProject,'10');assert.ok(await evaluate('[...document.querySelectorAll("[data-login-step]")].every(b=>b.hidden)'));}
    else{assert.equal(layout.gallery.height,height);assert.ok(layout.gallery.width/height>=.749&&layout.gallery.width/height<=.801);assert.ok(layout.card.x>=layout.gallery.right);assert.ok(layout.controlsTop>=layout.card.bottom);assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-photo')).objectFit"),'cover');}
    await shot(`login-${width}x${height}-project-10`);viewports.push({width,height,compact,...layout});
    check(`Project 10 default and preserved layout at ${width}x${height}`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await navigate();
  // Longer than the former 5.5-second autoplay interval, with timer instrumentation.
  await pause(5800);assert.equal(await evaluate(current),'10');assert.equal(await evaluate('__loginTimers.size'),0);assert.equal(await evaluate('document.getAnimations().length'),0);
  check('Desktop stays on Project 10 beyond the former autoplay interval, with zero gallery timers');
  for(let position=1;position<=10;position++){
    const project=position===1?10:position-1;
    assert.equal(await evaluate(current),String(project));assert.equal(await evaluate("document.querySelector('[data-login-number]').textContent"),String(position).padStart(2,'0'));
    assert.equal(await evaluate("document.querySelector('[data-login-progress]').style.transform"),`scaleX(${position/10})`);
    assert.equal(await evaluate(`document.querySelector('.login-slide[data-project="${project}"] img').naturalWidth>0`),true);
    await shot(`manual-project-${project}`);await step(1,position===10?10:position);
  }
  await step(-1,9);await shot('desktop-previous');await step(1,10);await step(1,1);await shot('desktop-next');
  check('All ten photographs, counter and static indicator update; Previous and Next wrap both ways');
  await click('[data-login-step="1"]');await wait(`${current}==='2'`);
  await evaluate(`for(let i=0;i<20;i++)document.querySelector('[data-login-step="1"]').click()`);assert.equal(await evaluate(current),'2');await wait(settled);assert.equal(await evaluate('document.querySelectorAll(".login-slide").length'),2);
  check('Rapid arrow clicks cannot overlap transitions or create additional layers');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await evaluate(`document.querySelector('[data-login-step="1"]').focus()`);assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(`${current}==='3'`);await wait(settled);
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Next photograph');
  await command('Page.reload');await wait(`${current}==='10'`);await wait(settled);assert.equal(await evaluate(current),'10');check('Native keyboard activation, visible focus and reload reset work');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await navigate();await step(-1,9);assert.equal(await evaluate('document.getAnimations().length'),0);await command('Emulation.setEmulatedMedia',{features:[]});check('Reduced motion keeps manual navigation without animation');
  for(const route of ['/index.html','/2-engr/index.html','/MCPA/2-engr/index.html']){await navigate(route);assert.equal(await evaluate(current),'10');}check('Both portals and GitHub Pages subpaths load Project 10');
  await command('Emulation.setScriptExecutionDisabled',{value:true});await command('Page.navigate',{url:base+'/index.html'});await wait('document.querySelector(".login-photo")?.naturalWidth>0');assert.ok(await evaluate('document.querySelector(".login-photo").src.endsWith("project-10.jpg")'));await command('Emulation.setScriptExecutionDisabled',{value:false});await navigate();check('Project 10 is visible from initial HTML before gallery JavaScript');
  await fill('#auth-email','admin@example.test');await fill('#auth-password','test-password');await click('[data-auth-toggle-password]');assert.equal(await evaluate('document.querySelector("#auth-password").type'),'text');await click('[data-auth-toggle-password]');await click('[data-auth-reset]');await wait('document.querySelector("#auth-feedback").textContent.includes("reset link")');
  await login('admin');await wait('window.MCPAAuth?.profile?.role==="admin"');assert.equal(await evaluate('document.querySelector("#login-slideshow").getClientRects().length'),0);await command('Page.reload');await wait('window.MCPAAuth?.profile?.role==="admin"');await logout();await wait(settled);assert.equal(await evaluate(current),'10');
  for(let i=0;i<3;i++){await click('[data-auth-demo]');await click('[data-auth-back]');}await click('[data-auth-demo]');await click('[data-demo-role=engineer]');await wait('window.MCPAAuth?.isDemo');await logout();await wait(settled);assert.equal(await evaluate(current),'10');assert.equal(await evaluate('__loginTimers.size'),0);check('Sign in, restored session, password toggle, recovery, repeated renders, demo and logout preserve gallery lifecycle');
  await command('Emulation.setDeviceMetricsOverride',{width:393,height:420,deviceScaleFactor:1,mobile:true});await compactNavigate();
  for(const selector of ['#auth-email','#auth-password','#auth-form [type=submit]','[data-auth-reset]','[data-auth-demo]']){assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`));}
  await shot('mobile-keyboard-height');await pause(5800);assert.equal(await evaluate(current),'10');assert.equal(await evaluate('__loginTimers.size'),0);check('Mobile background stays static; all authentication controls remain reachable with a keyboard-height viewport');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await command('Network.setBlockedURLs',{urls:['https://*','*project-1.webp','*project-2.webp','*project-2.png']});await navigate();await step(1,1);assert.ok(await evaluate(`document.querySelector('.login-slide[data-project="1"] img').src.endsWith('project-1.png')`));await step(1,3);check('Preserved PNG fallback and skipping an unavailable photograph remain functional');
  await command('Network.setBlockedURLs',{urls:['https://*','*project-10.jpg']});await navigate();assert.equal(await evaluate(current),'1');check('Unavailable featured JPEG falls back to the first working photograph');
  await command('Network.setBlockedURLs',{urls:['https://*','*images/login-slideshow/*']});await command('Page.navigate',{url:base+'/index.html'});await wait('document.querySelector("#auth-email")&&document.querySelector("#login-slideshow").dataset.unavailable==="true"');assert.ok(await evaluate('[...document.querySelectorAll("[data-login-step]")].every(b=>b.hidden)'));await shot('all-images-unavailable');await login('admin');await wait('window.MCPAAuth?.profile?.role==="admin"');check('All-image failure leaves usable authentication with hidden gallery controls');
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({passed:checks.length,failed:0,checks,viewports},null,2));console.log(`Gallery browser checks: ${checks.length} passed, 0 failed; screenshots: ${directory}`);
};
