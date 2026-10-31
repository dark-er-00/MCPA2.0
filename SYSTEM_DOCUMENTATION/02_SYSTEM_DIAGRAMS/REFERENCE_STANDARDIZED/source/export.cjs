'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const ROOT=process.cwd(),OUT=path.resolve(__dirname,'..');
const {WebSocket}=require(path.join(ROOT,'documentation/user-manuals/source/cdp-socket.cjs'));
const {createCanvas,loadImage}=require(path.join(ROOT,'tests/node_modules/@napi-rs/canvas'));
const model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/Model.json'))),W=model.width,H=model.height;
const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser,socket;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sitettrace-flow-docs-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Chrome start failure');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');let next=0;const pending=new Map();
 socket.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description);return r.result.value;};
 const nav=async url=>{await cmd('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url)))return;await pause(30);}throw Error('Navigation failed');};
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['http://*','https://*']});await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1.25,mobile:false});
 const report={passed:true,outboundHttpBlocked:true,applicationPagesOpened:0,databaseCalls:0,exports:[],textFitViolations:[]};
 const selected=process.argv.slice(2);
 for(const f of model.flows.filter(f=>!selected.length||selected.includes(f.id))){
  const folder=path.join(OUT,f.folder);await cmd('Emulation.setEmulatedMedia',{media:'screen'});
  for(const p of f.pages){
   const file=path.join(folder,p.id+'.svg');await nav(pathToFileURL(file).href);
   const violations=await evaluate(`(()=>{const nodes=${JSON.stringify(p.nodes)},bad=[];for(const n of nodes){const label=document.querySelector('[data-node="'+n.id+'"]');for(const s of label.querySelectorAll('tspan')){const b=s.getBBox(),pad=7;let ok=b.x>=n.x+pad&&b.y>=n.y+pad&&b.x+b.width<=n.x+n.w-pad&&b.y+b.height<=n.y+n.h-pad;if(ok&&['decision','terminator','onpage'].includes(n.type)){for(const [x,y]of[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){const dx=Math.abs(x-n.x-n.w/2)/(n.w/2-pad),dy=Math.abs(y-n.y-n.h/2)/(n.h/2-pad);if(n.type==='decision'?dx+dy>1:dx*dx+dy*dy>1)ok=false;}}if(ok&&n.type==='offpage')ok=b.y+b.height<n.y+n.h-28;if(!ok)bad.push({node:n.id,text:s.textContent,bounds:{x:b.x,y:b.y,w:b.width,h:b.height}});}}for(const t of document.querySelectorAll('text')){const b=t.getBBox();if(b.x<0||b.y<0||b.x+b.width>${W}||b.y+b.height>${H})bad.push({text:t.textContent,reason:'Outside page'});}return bad;})()`);
   if(violations.length)report.textFitViolations.push({flow:f.id,page:p.number,violations});
   const png=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:W,height:H,scale:1}});fs.writeFileSync(path.join(folder,p.id+'.png'),Buffer.from(png.data,'base64'));
  }
  // Print only the generated SVG documentation, with network blocked and no application session.
  await nav('about:blank');const {frameTree}=await cmd('Page.getFrameTree');const html='<!doctype html><html><head><meta charset="utf-8"><title>'+f.id+'</title><style>@page{size:8.5in 14in;margin:0}*{box-sizing:border-box}html,body{margin:0;background:white}.sheet{width:8.5in;height:14in;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:100%;height:100%}</style></head><body>'+f.pages.map(p=>'<section class="sheet">'+fs.readFileSync(path.join(folder,p.id+'.svg'),'utf8').replace(/^<\?xml[^>]*>/,'')+'</section>').join('')+'</body></html>';
  await cmd('Page.setDocumentContent',{frameId:frameTree.frame.id,html});await evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await cmd('Emulation.setEmulatedMedia',{media:'print'});
  const pdf=await cmd('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true,generateDocumentOutline:true}),bytes=Buffer.from(pdf.data,'base64'),pdfPages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  if(pdfPages!==f.pages.length)throw Error('PDF page mismatch '+f.id+' '+pdfPages+'/'+f.pages.length);fs.writeFileSync(path.join(folder,f.id+'.pdf'),bytes);
  const cols=Math.min(4,f.pages.length),tw=500,th=Math.round(tw*H/W),rows=Math.ceil(f.pages.length/cols),canvas=createCanvas(cols*tw,rows*(th+35)+80),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='black';ctx.font='bold 28px Arial';ctx.fillText(f.role+' - '+f.title,18,38);ctx.font='20px Arial';ctx.fillText('Page overview. Use individual PNGs or PDF for full reading size.',18,66);
  for(const [i,p]of f.pages.entries()){const img=await loadImage(path.join(folder,p.id+'.png')),x=(i%cols)*tw,y=80+Math.floor(i/cols)*(th+35);ctx.drawImage(img,x,y,tw,th);ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.strokeRect(x+1,y+1,tw-2,th-2);ctx.fillStyle='black';ctx.font='20px Arial';ctx.fillText('P'+p.number,x+10,y+th+25);}
  fs.writeFileSync(path.join(folder,f.id+'.png'),canvas.toBuffer('image/png'));
  report.exports.push({flow:f.id,pages:f.pages.length,pdfPages,pngPages:f.pages.length,overviewPng:true,pdfBytes:bytes.length});
  console.log('Exported '+f.id+' ('+pdfPages+' pages)');
 }
 if(selected.length){const priorFile=path.join(OUT,'validation/Export.json');if(fs.existsSync(priorFile)){const old=JSON.parse(fs.readFileSync(priorFile));report.exports=[...old.exports.filter(e=>!selected.includes(e.flow)),...report.exports];report.textFitViolations=[...old.textFitViolations.filter(e=>!selected.includes(e.flow)),...report.textFitViolations];}}
 report.passed=report.textFitViolations.length===0;fs.writeFileSync(path.join(OUT,'validation/Export.json'),JSON.stringify(report,null,2));if(!report.passed)throw Error('Correct text fit issues: '+report.textFitViolations.length+' pages');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();});
