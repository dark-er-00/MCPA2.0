'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const U=require('./drawio-style-utils.cjs');
const ROOT=path.resolve(__dirname,'..'),STAGE=path.join(ROOT,'A4_REVISED'),REPO=path.resolve(ROOT,'../../..');
const {WebSocket}=require(path.join(REPO,'documentation/user-manuals/source/cdp-socket.cjs'));
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'validation/Manual_Style_Manifest.json')));
const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser,socket;
async function main(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-a4-native-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=fs.readFileSync(f,'utf8').split('\n')[0].trim();break;}await pause(100);}if(!port)throw Error('Chrome did not start');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let counter=0;const pending=new Map();socket.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['http://*','https://*']});
 await cmd('Emulation.setDeviceMetricsOverride',{width:827,height:1169,deviceScaleFactor:1.75,mobile:false});
 const renderer=pathToFileURL(path.join(__dirname,'native-flowchart-renderer.html')).href;
 const navigate=async()=>{await cmd('Page.navigate',{url:renderer});for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete"&&typeof renderDiagram==="function"'))return;await pause(50);}throw Error('Renderer failed to load');};
 const report={passed:true,renderer:'mxGraph4.2.2 native XML decoder with official Draw.io custom shapes',paper:'A4 portrait',flows:[],violations:[],shapeTextWarnings:[],fontAdjustments:[]};
 const selected=process.argv.slice(2),chosen=manifest.flows.filter(f=>!selected.length||selected.includes(f.id));
 const pdf=async(entry,svgs)=>{
  await cmd('Page.navigate',{url:'about:blank'});const {frameTree}=await cmd('Page.getFrameTree');
  await cmd('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<!doctype html><html><head><meta charset="utf-8"><title>'+entry.id+'</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;background:white}.sheet{width:210mm;height:297mm;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:100%;height:100%}</style></head><body>'+svgs.map(svg=>'<section class="sheet">'+svg+'</section>').join('')+'</body></html>'});
  await evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  await cmd('Emulation.setEmulatedMedia',{media:'print'});const result=await cmd('Page.printToPDF',{printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,generateTaggedPDF:true});
  const data=Buffer.from(result.data,'base64');fs.writeFileSync(path.join(STAGE,entry.folder,entry.id+'.pdf'),data);return data.length;
 };
 for(const flow of chosen){
  await navigate();await cmd('Emulation.setEmulatedMedia',{media:'screen'});
  const doc=U.parseFile(path.join(STAGE,flow.folder,flow.id+'.drawio')),pages=U.physicalPages(doc),svgs=[];
  for(const [i,p]of pages.entries()){
   const xml='<mxGraphModel '+U.attributes(p.model)+'><root>'+U.serialize({attrs:{},diagrams:[p]}).match(/<root>([\s\S]*?)<\/root>/)[1]+'</root></mxGraphModel>';
   const result=await evaluate('renderDiagram('+JSON.stringify(xml)+')');svgs.push(result.svg);
   if(Object.keys(result.fontAdjustments).length){
    report.fontAdjustments.push({flow:flow.id,page:i+1,cells:result.fontAdjustments});
    for(const c of doc.diagrams[i].cells)if(result.fontAdjustments[c.attrs.id])U.setStyle(c,{...U.style(c),fontSize:String(result.fontAdjustments[c.attrs.id])});
   }
   if(result.violations.length)report.violations.push({flow:flow.id,page:i+1,violations:result.violations});
   if(result.shapeTextWarnings.length)report.shapeTextWarnings.push({flow:flow.id,page:i+1,warnings:result.shapeTextWarnings});
   const name=flow.id+'_P'+String(i+1).padStart(2,'0');fs.writeFileSync(path.join(STAGE,flow.folder,name+'.svg'),result.svg);
   // Capture the actual decoded graph, before print preparation.
   const screenshot=await cmd('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:827,height:1169,scale:1}});
   fs.writeFileSync(path.join(STAGE,flow.folder,name+'.png'),Buffer.from(screenshot.data,'base64'));
  }
  fs.writeFileSync(path.join(STAGE,flow.folder,flow.id+'.drawio'),U.serialize(doc));
  const bytes=await pdf(flow,svgs);report.flows.push({id:flow.id,pages:pages.length,pdfBytes:bytes});console.log('Rendered '+flow.id+' ('+pages.length+' A4 pages)');
 }
 if(!selected.length||selected.includes('--atlases'))for(const atlas of manifest.atlases){
  const flows=manifest.flows.filter(f=>f.folder.startsWith(atlas.folder+'/')),svgs=[];
  for(const f of flows)for(let i=1;i<=f.pages;i++)svgs.push(fs.readFileSync(path.join(STAGE,f.folder,f.id+'_P'+String(i).padStart(2,'0')+'.svg'),'utf8'));
  const diagrams=flows.flatMap(f=>U.physicalPages(U.parseFile(path.join(STAGE,f.folder,f.id+'.drawio'))).map(d=>({...d,attrs:{...d.attrs,name:f.title+' / '+d.attrs.name}})));
  fs.writeFileSync(path.join(STAGE,atlas.folder,atlas.id+'.drawio'),U.serialize({attrs:{host:'app.diagrams.net'},diagrams}));
  const bytes=await pdf(atlas,svgs);console.log('Rendered '+atlas.id+' ('+svgs.length+' A4 pages, '+bytes+' bytes)');
 }
 const reportFile=path.join(ROOT,'validation/Manual_Style_Render.json');
 if(selected.length&&fs.existsSync(reportFile)){
  const previous=JSON.parse(fs.readFileSync(reportFile)),ids=new Set(chosen.map(f=>f.id));
  for(const field of ['flows','violations','shapeTextWarnings','fontAdjustments'])report[field]=[...(previous[field]||[]).filter(item=>!ids.has(item.id||item.flow)),...report[field]];
 }
 report.passed=report.violations.length===0&&report.shapeTextWarnings.length===0;fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
 if(!report.passed)throw Error('Text exceeds A4 on '+report.violations.length+' pages');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();browser?.kill();});
