const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const PORT=Number(process.env.PORT||4192);
fs.mkdirSync(path.join(__dirname,'../screenshots'),{recursive:true});
fs.mkdirSync(path.join(__dirname,'../reports'),{recursive:true});
exports.open=async({width=1440,height=1050}={})=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-v2-qa-'));
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<120;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];if(port)break;}catch{}await pause(100);}
 if(!port){chrome.kill();throw Error('Chrome failed to start');}
 const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page');
 const socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open');
 let next=0;const pending=new Map(),errors=[],blocked=[],network=[],logs=[];
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 socket.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  if(m.method==='Log.entryAdded')logs.push(m.params.entry);
  if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);
  if(m.method==='Fetch.requestPaused'){
   const p=m.params,u=new URL(p.request.url);
   const action=['data:','blob:','about:'].includes(u.protocol)||u.origin==='http://127.0.0.1:'+PORT
    ? command('Fetch.continueRequest',{requestId:p.requestId})
    : (blocked.push(u.href),command('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}));
   // Navigation can cancel a paused request before its continuation reaches CDP.
   // Only this known cancellation is benign; other protocol errors fail checks.
   void action.catch(error=>{if(error.message!=='Invalid InterceptionId.')errors.push({source:'CDP interception',message:error.message});});
  }
  const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
 });
 const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description);return r.result.value;};
 const wait=async(expression,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await pause(70);}throw Error('Wait failed: '+expression+'\n'+await evaluate('document.body.innerText'));};
 const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
 const fill=(selector,value)=>evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');n.value='+JSON.stringify(value)+';n.dispatchEvent(new Event("input",{bubbles:true}));n.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const go=async route=>{await evaluate('showScreen('+JSON.stringify(route)+')');await wait('document.querySelector("#screen-'+route.split('?')[0]+'.active") && !MCPANavigation.restoring');await pause(150);};
 const viewport=(w,h)=>command('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
 const shot=async(name,full=true)=>{
  await evaluate('document.fonts.ready');await evaluate('window.scrollTo(0,0)');await pause(250);
  const metrics=await command('Page.getLayoutMetrics');const height=Math.ceil(metrics.cssContentSize.height);
  const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,clip:full?{x:0,y:0,width:width,height,scale:1}:undefined});
  fs.writeFileSync(path.join(__dirname,'../screenshots',name+'.png'),Buffer.from(result.data,'base64'));
 };
 const resize=async(w,h)=>{width=w;height=h;await viewport(w,h);await evaluate('Promise.all([document.fonts.load("700 28px \'Plus Jakarta Sans\'"),document.fonts.load("700 28px Manrope"),document.fonts.load("500 14px Inter"),document.fonts.load("400 12px \'Geist Mono\'")]).then(()=>document.fonts.ready)');await pause(150);};
 const navigate=async(url,app=true)=>{await command('Page.navigate',{url:'http://127.0.0.1:'+PORT+url});if(app){await wait('window.MCPAAuth?.profile?.role');await wait('!MCPANavigation.restoring');await wait('document.querySelector(".screen.active")?.textContent.length>50');}else await wait('document.readyState==="complete"');await evaluate('document.fonts.ready');await pause(300);};
 await command('Runtime.enable');await command('Page.enable');await command('Network.enable');await command('Log.enable');await command('Fetch.enable',{patterns:[{urlPattern:'*'}]});await viewport(width,height);
 return {command,evaluate,wait,click,fill,go,resize,shot,navigate,errors,blocked,network,logs,pause,async close(){
  await command('Browser.close').catch(()=>{});socket.close();
  if(chrome.exitCode===null){chrome.kill();await Promise.race([once(chrome,'exit'),pause(2000)]);}
  const resolved=path.resolve(profile);
  if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('mcpa-v2-qa-'))throw Error('Unexpected browser profile cleanup path');
  await fs.promises.rm(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:250});
 }};
};
