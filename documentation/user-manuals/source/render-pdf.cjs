// Print only the generated local documentation HTML; no application is served.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const {WebSocket}=require('./cdp-socket.cjs'),{admin,engineer}=require('./manual-content.cjs');
const out=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sitettrace-doc-pdf-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));let chrome,socket;
(async()=>{
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-extensions','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Local Chrome unavailable');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const task=pending.get(data.id);if(task){pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error.message)):task.resolve(data.result);}});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('Print timeout '+method)),60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.result.description);return result.result.value;};
 await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*','http://*']});await command('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
 const stats=[];
 for(const manual of [admin,engineer]){
  const url=pathToFileURL(path.join(out,manual.stem+'.html')).href;await command('Page.navigate',{url});
  for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && document.title.includes("User Manual")'))break;await pause(50);}
  const images=await evaluate('Promise.all([...document.images].map(async img=>{try{await img.decode();return {src:img.getAttribute("src"),width:img.naturalWidth,height:img.naturalHeight};}catch(_){return {src:img.getAttribute("src"),failed:true};}}))');
  if(images.some(img=>img.failed||!img.width))throw Error('Documentation screenshot failed to load');
  await command('Emulation.setEmulatedMedia',{media:'print'});
  const footer=`<div style="width:100%;font-family:Arial;font-size:8px;color:#52616c;padding:0 18mm;display:flex;justify-content:space-between"><span>SiteTrace · ${manual.audience} · v${manual.version}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
  const result=await command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:footer,marginTop:.75,marginBottom:.75,marginLeft:.7,marginRight:.7,generateDocumentOutline:true,generateTaggedPDF:true});
  const bytes=Buffer.from(result.data,'base64');fs.writeFileSync(path.join(out,manual.stem+'.pdf'),bytes);const pages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  stats.push({stem:manual.stem,pages,bytes:bytes.length,loadedScreenshots:images.length});console.log('PDF '+manual.stem+': '+pages+' pages; '+images.length+' verified loaded images');
  await command('Emulation.setEmulatedMedia',{media:'screen'});
  const preview=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'source',manual.stem+'-layout-preview.png'),Buffer.from(preview.data,'base64'));
 }
 fs.writeFileSync(path.join(out,'pdf-build.json'),JSON.stringify(stats,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();});
