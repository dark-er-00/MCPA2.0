// Local documentation rendering only. Fresh Chrome profile; outbound HTTP(S) blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const {out,root,write}=require('./build.cjs');
const {WebSocket}=require(path.join(root,'documentation/user-manuals/source/cdp-socket.cjs'));
const {flows}=JSON.parse(fs.readFileSync(path.join(out,'05_VALIDATION/Revised_Flowchart_Model.json')));
const folder='02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams';
const pause=ms=>new Promise(r=>setTimeout(r,ms));let chrome,socket;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sitettrace-revised-flows-'));
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Local Chrome did not start');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let id=0;const pending=new Map();socket.addEventListener('message',e=>{const data=JSON.parse(e.data),p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},60000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description);return r.result.value;};
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['https://*','http://*']});
 const navigate=async file=>{const url=pathToFileURL(file).href;await cmd('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url)))return;await pause(50);}throw Error('Local documentation load timeout');};
 const fit=[],exports=[];
 for(const f of flows){
  await cmd('Emulation.setDeviceMetricsOverride',{width:f.width,height:f.height,deviceScaleFactor:1.5,mobile:false});await cmd('Emulation.setEmulatedMedia',{media:'screen'});
  for(const page of f.pages){
   const rel=folder+'/'+page.id;await navigate(path.join(out,rel+'.svg'));
   const violations=await evaluate(`(()=>{const nodes=${JSON.stringify(page.nodes)},bad=[];for(const n of nodes){const spans=[...document.querySelector('[data-node="'+n.id+'"]').querySelectorAll('tspan')];for(const s of spans){const b=s.getBBox(),pad=8;let ok=b.x>=n.x+pad&&b.y>=n.y+pad&&b.x+b.width<=n.x+n.w-pad&&b.y+b.height<=n.y+n.h-pad;if(ok&&['decision','terminator','onpage'].includes(n.type)){for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){const dx=Math.abs(x-n.x-n.w/2)/(n.w/2-pad),dy=Math.abs(y-n.y-n.h/2)/(n.h/2-pad);if(n.type==='decision'?dx+dy>1:dx*dx+dy*dy>1)ok=false;}}if(ok&&n.type==='io'){const inset=36*(1-(b.y-n.y)/n.h);ok=b.x>=n.x+Math.max(8,inset)&&b.x+b.width<=n.x+n.w-8;}if(ok&&n.type==='offpage')ok=b.y+b.height<n.y+n.h-42;if(!ok)bad.push({node:n.id,type:n.type,text:s.textContent,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},shape:{x:n.x,y:n.y,w:n.w,h:n.h}});}}for(const t of document.querySelectorAll('text')){const b=t.getBBox();if(b.x<0||b.y<0||b.x+b.width>${f.width}||b.y+b.height>${f.height})bad.push({text:t.textContent,reason:'Outside canvas'});}return bad;})()`);
   if(violations.length)fit.push({file:rel+'.svg',violations});
   const png=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:f.width,height:f.height,scale:1}});write(rel+'.png',Buffer.from(png.data,'base64'));
  }
  await navigate(path.join(out,folder+'/'+f.stem+'.html'));await cmd('Emulation.setEmulatedMedia',{media:'print'});
  const pdf=await cmd('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true,generateDocumentOutline:true});const bytes=Buffer.from(pdf.data,'base64');write(folder+'/'+f.stem+'.pdf',bytes);
  const pages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;if(pages!==f.pages.length)throw Error('Unexpected print page count '+f.stem+': '+pages);
  exports.push({stem:f.stem,pdfPages:pages,pngPages:f.pages.length,pdfBytes:bytes.length,pngPixels:[f.width*1.5,f.height*1.5]});console.log('Rendered '+f.stem+' ('+pages+' pages)');
 }
 write('05_VALIDATION/Revised_Flowchart_Render.json',JSON.stringify({passed:fit.length===0,localOnly:true,outboundHttpBlocked:true,applicationOrDatabaseCalls:0,exports,textFitViolations:fit},null,2));
 if(fit.length)throw Error('Text fit requires correction; see Revised_Flowchart_Render.json ('+fit.reduce((s,x)=>s+x.violations.length,0)+' lines)');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();});
