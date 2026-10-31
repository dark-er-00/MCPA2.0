// Chrome + mounted v2 modules + real disposable PostgreSQL RPCs/RLS.
// Synthetic Storage transport; external resources and production URLs blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {fixture,root}=require('./fixture.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-b-browser-'));
const output=path.join(root,'documentation/workstream-b/test-results');fs.mkdirSync(output,{recursive:true});
const shots=path.join(output,'screenshots');fs.mkdirSync(shots,{recursive:true});
const checks=[],exceptions=[];let f,chrome,socket;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64');
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/__rpc'){
      let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw),actor=f.actors[req.headers['x-fixture-actor']];
      let data=null,error=null;
      try{
        if(body.storage){
          if(body.bucket!=='mcpa-movement-evidence-v2')throw Error('Unknown fixture bucket');
          if(body.storage==='upload'){
            if(body.options.upsert||body.size>5242880||!['image/png','image/jpeg','image/webp'].includes(body.mimeType))throw Error('Invalid fixture upload');
            await f.query(actor,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[body.bucket,body.name,JSON.stringify({mimetype:body.mimeType,size:body.size})]);data={path:body.name};
          }else if(body.storage==='sign'){
            const visible=await f.query(actor,'select name from storage.objects where bucket_id=$1 and name=$2',[body.bucket,body.name]);
            if(!visible.rows.length)throw Error('Photo denied');data={signedUrl:'/__photo.png'};
          }else if(body.storage==='delete'){
            await f.query(actor,'delete from storage.objects where bucket_id=$1 and name=any($2)',[body.bucket,body.names]);data=[];
          }
        }else{
          const order={mcpa_b_snapshot:[],mcpa_b_lookup:['p_reference','p_intent'],mcpa_b_action:['p_action','p_payload','p_operation_id'],mcpa_b_evidence_action:['p_action','p_payload','p_operation_id']};
          if(!order[body.name])throw Error('RPC not allowlisted');
          data=await f.bRpc(actor,body.name,order[body.name].map(key=>key==='p_payload'?JSON.stringify(body.args[key]):body.args[key]));
        }
      }catch(e){error={message:e.message,code:e.code};}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));return;
    }
    if(req.url==='/__photo.png'){res.setHeader('Content-Type','image/png');res.end(png);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    const allowed=['tests/custody-lifecycle-v2/','js/upgrades/','1-admin/modules/return-inspection-v2/','1-admin/modules/asset-retirement-v2/','2-engr/modules/return-inspection-v2/','2-engr/modules/qr-movements-v2/','2-engr/modules/retired-equipment-v2/','css/','vendor/'];
    const relative=path.relative(root,file).replaceAll('\\','/');
    if(!allowed.some(prefix=>relative.startsWith(prefix))||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500);res.end(error.message);}
});
(async()=>{
  f=await fixture();
  const pending=await f.submit(['TOOL-004','TOOL-005']);
  await f.action(f.actors.sky,'createTransfer',{assetIds:['TOOL-003'],destinationId:f.sites.main,receiverId:f.actors.pau.id});
  await f.action(f.actors.admin,'proposeRetirement',{assetId:'TOOL-001',disposition:'sold',reason:'Synthetic sale proposal',effectiveDate:'2026-10-01'});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new',...(process.env.MCPA_CHROME_NO_SANDBOX==='1'?['--no-sandbox','--disable-gpu','--disable-gpu-sandbox']:[]),'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
  ],{windowsHide:true,stdio:'ignore'});
  chrome.on('error',error=>exceptions.push(error.message));
  let port;for(let n=0;n<100;n++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0];break;}await pause(100);}
  assert.ok(port,'Chrome started');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let seq=0;const requests=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails);
    const pending=requests.get(msg.id);if(pending){requests.delete(msg.id);msg.error?pending.reject(Error(msg.error.message)):pending.resolve(msg.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(`CDP timeout ${method}`)),15000);requests.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.result.description);return result.result.value;};
  const wait=async expr=>{for(let n=0;n<100;n++){if(await evaluate(expr))return;await pause(60);}throw Error(`Timed out: ${expr}\n${await evaluate('document.body.innerText')}`);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,value)=>evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)};document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('input',{bubbles:true}))`);
  const mount=(view,actor)=>evaluate(`mountFixture(${JSON.stringify(view)},${JSON.stringify(actor)})`);
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  const shot=async name=>{await pause(300);const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(data,'base64'));};
  let deviceWidth=1440;
  const metrics=async(width,mobile)=>{deviceWidth=width;return command('Emulation.setDeviceMetricsOverride',{width,height:mobile?844:1050,deviceScaleFactor:1,mobile});};
  const fits=()=>evaluate(`document.documentElement.scrollWidth<=${deviceWidth}+1 && innerWidth<=${deviceWidth}+1`);
  await command('Runtime.enable');await command('Page.enable');await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:['https://*','http://*.supabase.co/*']});await metrics(1440,false);
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/tests/custody-lifecycle-v2/harness.html`});
  await wait("window.fixtureReady==='return'");await fill('[data-reference]','TOOL-002');await click('[data-add]');await wait("document.querySelectorAll('[data-asset]').length===1");
  await fill('[data-reference]','mcpa:asset:TOOL-002');await click('[data-add]');await wait("document.querySelector('.b-feedback').textContent.includes('already')");
  check('Manual Asset ID fallback and QR duplicate suppression',await evaluate("document.querySelectorAll('[data-asset]').length===1"));
  await fill('[data-reference]','UNKNOWN');await click('[data-add]');await wait("document.querySelector('.b-feedback').textContent.includes('outside your custody')");
  check('Unknown or unauthorized asset errors preserve selected batch',await evaluate("document.querySelectorAll('[data-asset]').length===1"));
  // Attach a real browser File; Storage transport still goes through SQL RLS.
  await evaluate(`{const file=new File([Uint8Array.from(atob('${png.toString('base64')}'),c=>c.charCodeAt(0))],'receipt.png',{type:'image/png'});const data=new DataTransfer();data.items.add(file);document.querySelector('[data-files]').files=data.files;}`);
  await shot('return-desktop-light');await metrics(393,true);check('Return submission fits mobile',await fits());await shot('return-mobile-light');
  await click('#theme');await shot('return-mobile-dark');await metrics(1440,false);await shot('return-desktop-dark');await click('#theme');
  await click('[type=submit]');await wait("document.querySelector('.b-feedback').textContent.includes('submitted')");
  check('Browser return upload submits pending inspection with original custody',(await f.tool('TOOL-002')).current_holder_id===f.actors.sky.id);
  check('Browser photo linked to correct return asset',(await f.snapshot(f.actors.admin)).evidence.some(v=>v.equipment_id===f.tools['TOOL-002']));
  await mount('inspection','admin');await fill('[data-batch]',pending.id);await evaluate("document.querySelector('[data-batch]').dispatchEvent(new Event('change'))");
  await fill('[data-inspect-asset="TOOL-004"] [name=outcome]','good');await click('[data-inspect-asset="TOOL-004"] [name=received]');
  await fill('[data-inspect-asset="TOOL-005"] [name=outcome]','missing');await fill('[data-inspect-asset="TOOL-005"] [name=notes]','Unit not physically received');
  check('Receipt label has a 44px tap target',await evaluate("document.querySelector('.b-check').getBoundingClientRect().height>=44"));
  await fill('[data-inspect-asset="TOOL-005"] [name=notes]','');await evaluate("document.querySelector('[type=submit]').scrollIntoView();document.querySelector('[type=submit]').click()");
  await wait("document.activeElement.classList.contains('b-feedback')");
  check('Failed save focuses and reveals recovery feedback',await evaluate("document.activeElement.getBoundingClientRect().top>=0 && document.activeElement.getBoundingClientRect().bottom<=innerHeight"));
  await fill('[data-inspect-asset="TOOL-005"] [name=notes]','Unit not physically received');
  await shot('inspection-desktop-light');await metrics(393,true);check('Admin per-asset inspection fits mobile',await fits());await shot('inspection-mobile-light');
  await click('[type=submit]');await wait("document.querySelector('.b-feedback').textContent.includes('inspection saved')");
  check('Browser partial inspection releases only physically received asset',(await f.tool('TOOL-004')).status==='AVAILABLE'&&(await f.tool('TOOL-005')).current_holder_id===f.actors.sky.id);
  await mount('inbox','pau');await fill('[name=condition]','good');await click('[name=received]');await shot('recipient-mobile-light');
  await click('[type=submit]');await wait("document.querySelector('.b-feedback').textContent.includes('accepted')");
  check('Browser named recipient acceptance moves exact custody',(await f.tool('TOOL-003')).current_holder_id===f.actors.pau.id);
  await mount('retirement','admin2');await evaluate("document.querySelector('[data-retirement-list] details').open=true");await shot('retirement-mobile-light');check('Retirement approval fits mobile',await fits());
  await metrics(1440,false);await shot('retirement-desktop-light');await click('[value=approveRetirement]');await wait("document.querySelector('.b-feedback').textContent.includes('approved')");
  check('Browser second Admin approval retires asset',(await f.tool('TOOL-001')).status==='DISPOSED');
  check('Retirement history uses product language',await evaluate("!document.querySelector('[data-retirement-list]').textContent.includes('proposeRetirement') && document.querySelector('[data-retirement-list]').textContent.includes('Retirement proposed')"));
  await mount('transfer','sky');check('Transfer manual selectors render',await evaluate("!!document.querySelector('[name=recipient]') && !!document.querySelector('[name=destination]')"));
  await mount('return','sky');await click('[data-camera]');
  // Headless camera is denied or unsupported; manual entry stays operable.
  await wait("document.querySelector('.b-feedback').textContent.length>0");check('Camera failure retains manual fallback',await evaluate("!!document.querySelector('[data-reference]') && !document.querySelector('[data-add]').disabled"));
  await evaluate("mountFixture('return','sky');");
  check('No uncaught browser exceptions',exceptions.length===0);
  fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:true,checks,exceptions,screenshotDirectory:'test-results/screenshots',scope:'Mounted modules, local PostgreSQL, synthetic Storage transport; not deployed MCPA integration'},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,screenshots:shots},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:false,checks,error:error.message,exceptions},null,2));}).finally(async()=>{
  socket?.close();chrome?.kill();server.closeAllConnections();server.close();await f?.close();
  // Own freshly created profile only; resolved target checked before deletion.
  const target=path.resolve(profile),temp=path.resolve(os.tmpdir())+path.sep;
  if(target.startsWith(temp)&&path.basename(target).startsWith('mcpa-b-browser-')){await pause(200);try{fs.rmSync(target,{recursive:true,force:true});}catch{}}
});
