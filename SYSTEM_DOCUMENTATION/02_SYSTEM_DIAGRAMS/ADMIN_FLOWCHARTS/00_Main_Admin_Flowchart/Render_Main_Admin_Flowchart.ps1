# Renders local documentation only; no HTML/CSS/JavaScript file is written.
$ErrorActionPreference = 'Stop'
$env:SITETRACE_ADMIN_FLOWCHART = $PSScriptRoot
@'
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const dir=path.resolve(process.env.SITETRACE_ADMIN_FLOWCHART),root=path.resolve(dir,'../../../..'),stem='SiteTrace_Main_Admin_Flowchart';
const {WebSocket}=require(path.join(root,'documentation/user-manuals/source/cdp-socket.cjs'));
const model=JSON.parse(fs.readFileSync(path.join(dir,'Validation/Diagram_Model.json')));
const write=(file,body)=>{const dest=path.resolve(dir,file);if(!dest.startsWith(dir+path.sep))throw Error('Outside new documentation folder');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let chrome,socket;
(async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sitettrace-main-admin-doc-'));
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const p=path.join(profile,'DevToolsActivePort');if(fs.existsSync(p)){port=fs.readFileSync(p,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Local Chrome did not start');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');let nextId=0;const pending=new Map();
 socket.addEventListener('message',e=>{const data=JSON.parse(e.data),p=pending.get(data.id);if(p){clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description);return r.result.value;};
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['https://*','http://*']});await cmd('Emulation.setDeviceMetricsOverride',{width:2100,height:2970,deviceScaleFactor:1.5,mobile:false});
 const fit=[];
 for(const page of model.pages){const file=stem+'_P'+String(page.number).padStart(2,'0'),url=pathToFileURL(path.join(dir,file+'.svg')).href;await cmd('Page.navigate',{url});let ready=false;for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url))){ready=true;break;}await pause(50);}if(!ready)throw Error('SVG load timeout');
  const violations=await evaluate(`(()=>{const bad=[],nodes=${JSON.stringify(page.nodes)};for(const n of nodes){const label=document.querySelector('[data-node="'+n.id+'"]');if(!label){bad.push({node:n.id,reason:'Missing label'});continue;}for(const s of label.querySelectorAll('tspan')){const b=s.getBBox(),pad=8;let ok=b.x>=n.x+pad&&b.y>=n.y+pad&&b.x+b.width<=n.x+n.w-pad&&b.y+b.height<=n.y+n.h-pad;if(ok&&['decision','terminator','onpage'].includes(n.type)){for(const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){const dx=Math.abs(x-n.x-n.w/2)/(n.w/2-pad),dy=Math.abs(y-n.y-n.h/2)/(n.h/2-pad);if(n.type==='decision'?dx+dy>1:dx*dx+dy*dy>1)ok=false;}}if(ok&&n.type==='offpage')ok=b.y+b.height<n.y+n.h-36;if(ok&&n.type==='io')ok=b.x>=n.x+35*(1-(b.y-n.y)/n.h)&&b.x+b.width<=n.x+n.w-35*((b.y+b.height-n.y)/n.h);if(!ok)bad.push({node:n.id,type:n.type,text:s.textContent,box:{x:b.x,y:b.y,w:b.width,h:b.height}});}}for(const t of document.querySelectorAll('text')){const b=t.getBBox();if(b.x<0||b.y<0||b.x+b.width>2100||b.y+b.height>2970)bad.push({text:t.textContent,reason:'Outside page'});}return bad;})()`);
  if(violations.length)fit.push({page:page.number,violations});
  const png=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:2100,height:2970,scale:1}});write(file+'.png',Buffer.from(png.data,'base64'));console.log('Rendered Admin page '+page.number);
 }
 // Print content exists only in the isolated browser memory, never as an app or HTML file.
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Main Admin System Flowchart</title><style>@page{size:A3 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0}.sheet{width:277mm;height:400mm;break-after:page}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:277mm;height:auto;max-height:400mm}</style></head><body>'+model.pages.map(page=>'<section class="sheet">'+fs.readFileSync(path.join(dir,stem+'_P'+String(page.number).padStart(2,'0')+'.svg'),'utf8').replace(/^<\?xml[^>]*>/,'')+'</section>').join('')+'</body></html>';
 await cmd('Page.navigate',{url:'about:blank'});for(let i=0;i<100;i++){if(await evaluate('location.href==="about:blank" && document.readyState==="complete"'))break;await pause(30);}
 const {frameTree}=await cmd('Page.getFrameTree');await cmd('Page.setDocumentContent',{frameId:frameTree.frame.id,html});await cmd('Emulation.setEmulatedMedia',{media:'print'});
 const sheets=await evaluate('document.querySelectorAll(".sheet").length');if(sheets!==4)throw Error('Print document did not load four pages');await evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 const result=await cmd('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true,generateDocumentOutline:true});const pdf=Buffer.from(result.data,'base64'),pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;write(stem+'.pdf',pdf);if(pages!==4)throw Error('Unexpected PDF page count '+pages);
 const {createCanvas,loadImage}=require(path.join(root,'tests/node_modules/@napi-rs/canvas'));
 const canvas=createCanvas(4800,3440),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,4800,3440);ctx.fillStyle='#222';ctx.font='bold 44px Arial';ctx.fillText('SiteTrace (MCPA) - Main Admin Flowchart - Stage 1',50,65);ctx.font='29px Arial';ctx.fillText('Four-page overview. Individual page PNGs and the PDF preserve full reading size.',50,112);
 for(const [i,page]of model.pages.entries()){const img=await loadImage(path.join(dir,stem+'_P'+String(page.number).padStart(2,'0')+'.png')),x=45+i*1190;ctx.drawImage(img,x,175,1150,1626);ctx.strokeStyle='#bbb';ctx.lineWidth=2;ctx.strokeRect(x,175,1150,1626);ctx.font='bold 27px Arial';ctx.fillStyle='#222';ctx.fillText('Page '+page.number,x+20,1842);}
 // The overview is a single row; crop unused canvas area without editing any photograph.
 const overview=createCanvas(4800,1890);overview.getContext('2d').drawImage(canvas,0,0);write(stem+'.png',overview.toBuffer('image/png'));
 write('Validation/Render.json',JSON.stringify({passed:fit.length===0,localDocumentsOnly:true,outboundHttpBlocked:true,appPagesOpened:0,databaseCalls:0,pdfPages:pages,paper:'A3 portrait',pagePngPixels:[3150,4455],overviewPixels:[4800,1890],textFitViolations:fit},null,2));
 if(fit.length)throw Error('Correct '+fit.reduce((s,x)=>s+x.violations.length,0)+' label-fit issues in Validation/Render.json');
 console.log('Generated 4 page PNGs, requested PNG overview and 4-page A3 PDF. Text geometry passed.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();chrome?.kill();});
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'Main Admin documentation rendering failed.' }
