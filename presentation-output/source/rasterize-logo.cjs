// Render the actual repository SVG through Chrome so SVG text is preserved.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'../..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-logo-'));
let chrome,socket;const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let n=0;n<100;n++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0];break;}await pause(100);}if(!port)throw Error('Chrome did not start');
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*','http://*']});await command('Page.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:256,height:256,deviceScaleFactor:1,mobile:false});
 await command('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
 const svg=fs.readFileSync(path.join(root,'images/favicon.svg'),'utf8');
 const html='<html><body style="margin:0;background:transparent"><img width="256" height="256" src="data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')+'"></body></html>';
 await command('Page.navigate',{url:'data:text/html;base64,'+Buffer.from(html).toString('base64')});await pause(500);
 const {data}=await command('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:256,height:256,scale:1}});
 fs.writeFileSync(path.join(root,'presentation-output/evidence/favicon-actual.png'),Buffer.from(data,'base64'));
 console.log('Rendered actual images/favicon.svg, with its original MCPA text.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.close();chrome?.kill()});
