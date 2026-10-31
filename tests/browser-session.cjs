// Independent local browser context for cross-account integration checks.
const {once}=require('node:events');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.create=async({port,base,errors})=>{
 const info=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
 const socket=new WebSocket(info.webSocketDebuggerUrl);await once(socket,'open');let next=0,sessionId;
 const pending=new Map();
 socket.addEventListener('message',event=>{const result=JSON.parse(event.data);if(result.method==='Runtime.exceptionThrown')errors.push(result.params.exceptionDetails);const job=pending.get(result.id);if(job){pending.delete(result.id);clearTimeout(job.timer);result.error?job.reject(Error(result.error.message)):job.resolve(result.result);}});
 const raw=(method,params={},session)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>reject(Error('Independent session timeout '+method)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});
 const context=await raw('Target.createBrowserContext'),target=await raw('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId});
 sessionId=(await raw('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const command=(method,params={})=>raw(method,params,sessionId);
 const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.result.description);return result.result.value;};
 const wait=async(expression,timeout=8000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await pause(60);}throw Error('Independent session wait: '+expression);};
 const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
 const fill=(selector,value)=>evaluate('(()=>{const control=document.querySelector('+JSON.stringify(selector)+');control.value='+JSON.stringify(value)+';control.dispatchEvent(new Event("input",{bubbles:true}));control.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const go=async route=>{await evaluate('showScreen('+JSON.stringify(route)+')');await wait('document.querySelector("#screen-'+route.split('?')[0]+'.active") && !window.MCPANavigation?.restoring');};
 const login=async key=>{await wait('document.querySelector("#auth-email")');await fill('#auth-email',key+'@example.test');await fill('#auth-password','test-password');await evaluate('document.querySelector("#auth-form").requestSubmit()');await wait('MCPAAuth.profile!==null');};
 const logout=async()=>{await evaluate('MCPAAuth.logout()');await wait('document.querySelector("#auth-email")');};
 await command('Runtime.enable');await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:base+'/index.html'});await wait('document.querySelector("#auth-email")');
 return {command,evaluate,wait,click,fill,go,login,logout,async close(){await raw('Target.disposeBrowserContext',{browserContextId:context.browserContextId});socket.close();}};
};
