// Browser transport models Supabase Auth; RPCs and RLS run against real local PostgreSQL.
// External resources are blocked. No requests to the live Supabase project.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
// The default application smoke test follows the integrated production routes.
// Historical fixture-specific modes remain explicit flags below.
if(process.argv.length===2)process.argv.push('--combined-integration');
if(process.argv.includes('--review-fixes')||process.argv.includes('--final-races')||process.argv.includes('--unified-requests')||process.argv.includes('--engineer-consumables')||process.argv.includes('--functionality-audit'))process.argv.push('--combined-integration');
const {spawn}=require('node:child_process'),{once}=require('node:events'),{authDatabase}=require('./auth-test-db.cjs');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-auth-'));
let fixture,chrome,socket,passwordLogged=false;const errors=[],calls=[];
const storedFiles=new Map(),signedFiles=new Map();
const turnoverRun=process.argv.includes('--turnover-sync'),fixtureStreams=new Map(),fixtureEvents=new Set();
const accountServiceRun=process.argv.includes('--functionality-audit');
const sdk=`window.__syncTimers=new Map();const realInterval=window.setInterval,realClear=window.clearInterval;window.setInterval=(fn,ms,...args)=>{const id=realInterval(fn,ms,...args);if(ms===30000)__syncTimers.set(id,fn);return id;};window.clearInterval=id=>{__syncTimers.delete(id);realClear(id);};window.__tickSync=()=>__syncTimers.forEach(fn=>fn());window.__channels=new Set();
window.supabase={createClient(){let listener;const session=()=>{const key=localStorage.getItem('fixture.account');return key?{user:{id:key},access_token:key}:null};const request=q=>window.__failReads&&q.rpc==='mcpa_movement_snapshot'?Promise.resolve({error:{code:'TEST'}}):fetch('/__db',{method:'POST',headers:{'Authorization':session()?.access_token||''},body:JSON.stringify(q)}).then(r=>r.json()).then(result=>{if(window.__legacyAvailability&&q.rpc==='mcpa_movement_snapshot'&&result.data){delete result.data.inventoryAvailabilityVersion;delete result.data.inventoryVerificationRevision;for(const tool of result.data.tools){delete tool.movementLock;delete tool.recordedStatus;}}return result;});window.__authEvent=event=>listener?.(event,session());window.__expire=()=>{localStorage.removeItem('fixture.account');listener?.('SIGNED_OUT',null)};return {
 channel(){const c={tables:[],on(_type,filter,fn){this.tables.push(filter.table);this.notify=fn;return this},subscribe(){return this}};__channels.add(c);return c;},removeChannel(c){__channels.delete(c);return Promise.resolve();},
 auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},async signInWithPassword({email,password}){let key=email.split('@')[0];if(window.__auditTransport){const result=await request({authLogin:{email,password}});if(result.error)return result;key=result.data.key;}else if(!['admin','sky','pau','architect','secretary','handler','inactive','missing'].includes(key)||password!=='test-password')return {error:{code:'invalid_credentials'}};localStorage.setItem('fixture.account',key);listener?.('SIGNED_IN',session());return {data:{session:session()}}},async signOut(){localStorage.removeItem('fixture.account');listener?.('SIGNED_OUT',null);return {error:null}},resetPasswordForEmail:async()=>({error:null}),updateUser:async values=>{if(window.__auditTransport)return request({authUpdate:values});window.__savedPassword=values.password;return {error:null}} },
 functions:{invoke:async(name,{body})=>{if(window.__auditTransport){const result=await request({edge:name,args:body});return result.error?{error:{context:{json:async()=>({error:result.error.message})}}}:result;}if(body.action==='capabilities')return {data:window.__accountCapabilities||{development_enabled:true,pending_development_accounts:[]}};window.__accountRequest={name,body};return window.__developmentFailure?{error:{context:{json:async()=>({error:'Creation interrupted. Retry the same test account.'})}}}:{data:{message:'Test account created.'}};}},
 storage:{from(bucket){return {async upload(name,file,options){if(window.__failUpload)return {error:{message:'Isolated upload failure'}};const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(const value of bytes)raw+=String.fromCharCode(value);return request({storage:'upload',bucket,name,type:file.type,size:file.size,body:btoa(raw),options});},createSignedUrl(name,expires){return request({storage:'sign',bucket,name,expires});},remove(names){return request({storage:'remove',bucket,names});}}}},
 rpc(name,args){return request({rpc:name,args})},from(table){const q={table,columns:'*',filters:[]};return {select(cols='*'){q.columns=cols;return this},insert(values){q.write='insert';q.values=values;return this},update(values){q.write='update';q.values=values;return this},single(){q.single=true;return this},order(){return this},limit(n){q.end=n-1;return this},range(start,end){q.start=start;q.end=end;return this},eq(key,value){q.filters.push([key,value]);return this},then(resolve,reject){return request(q).then(resolve,reject)}}}
}}};`;
const server=http.createServer(async(req,res)=>{
 if(process.argv.includes('--equipment-fixes')&&req.url.startsWith('/__qr?')){
  const asset=new URL(req.url,'http://localhost').searchParams.get('data');
  res.setHeader('Content-Type','image/png');res.end(await require('qrcode').toBuffer(asset,{width:120,margin:0}));return;
 }
 if(req.url==='/__sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk+(accountServiceRun?'window.__auditTransport=true;':'')+(turnoverRun?`
  const originalFixtureClient=window.supabase.createClient;
  window.supabase.createClient=(...args)=>{const client=originalFixtureClient(...args);let stream=null;const channel=client.channel.bind(client),remove=client.removeChannel.bind(client);
    client.channel=(...values)=>{const current=channel(...values),subscribe=current.subscribe.bind(current);current.subscribe=(...subscriptions)=>{if(!stream){stream=new EventSource('/__events?account='+encodeURIComponent(localStorage.getItem('fixture.account')||''));stream.onopen=()=>window.__fixtureRealtimeReady=true;stream.onmessage=event=>{if(window.__fixtureRealtime===false)return;const notice=JSON.parse(event.data);for(const c of __channels)if(c.tables.includes(notice.table))c.notify?.({eventType:'INSERT'});};}return subscribe(...subscriptions);};return current;};
    client.removeChannel=current=>{const result=remove(current);if(!__channels.size){stream?.close();stream=null;window.__fixtureRealtimeReady=false;}return result;};return client;};
 `:''));return;}
 if(turnoverRun&&req.url.startsWith('/__events?')){
  const account=new URL(req.url,'http://localhost').searchParams.get('account'),actor=fixture.actors[account];
  if(!actor){res.writeHead(403);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(': connected\n\n');
  fixtureStreams.set(res,actor);req.on('close',()=>fixtureStreams.delete(res));return;
 }
 if(req.url.startsWith('/__stored/')){
  const signed=signedFiles.get(req.url.slice('/__stored/'.length));
  if(!signed||signed.expires<Date.now()){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',signed.type);res.end(signed.bytes);return;
 }
 if(req.url==='/__db'){
  let body='';for await(const part of req)body+=part;const q=JSON.parse(body),actor=fixture.actors[req.headers.authorization];calls.push({rpc:q.rpc,table:q.table,actor:req.headers.authorization});
  let data=null,error=null,count=null;
  try{
   if(q.edge&&fixture.authModel){
    const result=await fixture.authModel.request(q.args,req.headers.authorization||'invalid');const value=await result.json();if(!result.ok)throw Error(value.error);data=value;
   }else if(q.authLogin&&fixture.authModel){data={key:await fixture.authModel.signIn(q.authLogin.email,q.authLogin.password)};
   }else if(q.authUpdate&&fixture.authModel){await fixture.authModel.setPassword(actor,q.authUpdate.password);data={};
   }else if(q.storage){
    if(q.storage==='upload'){
     const bucket=(await fixture.db.query('select * from storage.buckets where id=$1',[q.bucket])).rows[0];
     if(!bucket||q.size>Number(bucket.file_size_limit)||!bucket.allowed_mime_types.includes(q.type)||q.options?.upsert)throw new Error('Invalid isolated upload');
     if(process.argv.includes('--combined-integration'))await fixture.query(actor,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[q.bucket,q.name,JSON.stringify({mimetype:q.type,size:q.size})]);else await fixture.query(actor,'insert into storage.objects(bucket_id,name) values($1,$2)',[q.bucket,q.name]);
     storedFiles.set(q.bucket+'/'+q.name,{bytes:Buffer.from(q.body,'base64'),type:q.type});data={path:q.name};
    }else if(q.storage==='remove'){
     for(const name of q.names){const rows=(await fixture.query(actor,'delete from storage.objects where bucket_id=$1 and name=$2 returning name',[q.bucket,name])).rows;if(rows.length)storedFiles.delete(q.bucket+'/'+name);}data=[];
    }else if(q.storage==='sign'){
     const rows=(await fixture.query(actor,'select name from storage.objects where bucket_id=$1 and name=$2',[q.bucket,q.name])).rows;
     const file=storedFiles.get(q.bucket+'/'+q.name);if(!rows.length||!file)throw new Error('File access denied');
     const token=require('node:crypto').randomUUID();signedFiles.set(token,{...file,expires:Date.now()+Math.min(q.expires,3600)*1000});data={signedUrl:'/__stored/'+token};
    }else throw new Error('Unsupported isolated storage operation');
   }
   else if(q.rpc){
    data=await fixture.rpc(actor,q.rpc,q.args||{});
    if(turnoverRun&&q.rpc==='mcpa_movement_action'&&!fixtureEvents.has(q.args.p_operation_id)){
     fixtureEvents.add(q.args.p_operation_id);
     // A local transport hint models own-recipient Realtime. Real RPCs/RLS
     // remain authoritative; no notification/record contents are broadcast.
     for(const [response,recipient]of fixtureStreams)if(recipient.id!==actor?.id&&(recipient.role==='admin'||recipient.id===data?.receiverId))response.write('data: '+JSON.stringify({table:'mcpa_notifications'})+'\n\n');
    }
   }
   else if(q.write){
    if(q.table!=='equipment')throw new Error('Unsupported isolated write');
    const values=Array.isArray(q.values)?q.values[0]:q.values,keys=Object.keys(values);
    if(!keys.length||keys.some(key=>!/^[a-z_]+$/.test(key)))throw new Error('Bad write column');
    let result;
    const returning=q.columns==='*'?'*':q.columns.split(',').map(c=>{if(!/^[a-z_]+$/.test(c))throw new Error('Bad return column');return c;}).join(',');
    if(q.write==='insert')result=await fixture.query(actor,`insert into public.equipment(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning ${returning}`,keys.map(key=>values[key]));
    else if(q.write==='update'&&q.filters.length===1&&q.filters[0][0]==='asset_id')result=await fixture.query(actor,`update public.equipment set ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} where asset_id=$${keys.length+1} returning ${returning}`,[...keys.map(key=>values[key]),q.filters[0][1]]);
    else throw new Error('Unsupported isolated update');
    data=q.single?result.rows[0]:result.rows;
   }
   else{
    if(!['equipment','sites','profiles','consumables','consumable_requests','consumable_stock_movements','project_history','mcpa_account_audit','mcpa_equipment_imports'].includes(q.table))throw new Error('Unsupported test table');
    const cols=q.columns==='*'?'*':q.columns.split(',').map(c=>{if(!/^[a-z_]+$/.test(c))throw new Error('Bad column');return '"'+c+'"'}).join(',');
    let rows=(await fixture.query(actor,`select ${cols} from public.${q.table}`)).rows;
    rows=rows.filter(r=>q.filters.every(([key,value])=>r[key]===value));count=rows.length;data=rows.slice(q.start||0,(q.end??999)+1);
   }
  }catch(e){error={code:e.code||'TEST',message:e.message};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error,count}));return;
 }
 // Also exercise GitHub Pages' project subpath using the same local fixture.
 const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/MCPA\//,'/');
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 let content=fs.readFileSync(file);if(file.endsWith('index.html'))content=content.toString().replace(/<script src="https:[^"]+"[^>]*><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
 if(process.argv.includes('--equipment-fixes')&&file.endsWith('masterlist.js'))content=content.toString().replaceAll('https://api.qrserver.com/v1/create-qr-code/','/__qr');
 res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'text/plain');res.end(content);
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fixture=process.argv.includes('--combined-integration')?await require('./integration-quantity-custody-v2/fixture.cjs').fixture():await authDatabase({engineerPortal:true,missingProjectHistory:process.argv.includes('--projects-errors')});fixture.actors.missing={authId:require('node:crypto').randomUUID()};
 if(process.argv.includes('--functionality-audit'))await require('./functionality-audit-v2/fixture.cjs').upgrade(fixture);
 if(!process.argv.includes('--combined-integration')){
 if(process.argv.includes('--project-construction') || process.argv.includes('--admin-equipment-summary'))await require('./project-construction-fixture.cjs').upgrade(fixture);
 console.log('Browser fixture ready; isolated local database');
 // Compose each fixture dependency once, then install Office returns after the
 // existing optional-purpose patch to reproduce the already-deployed SQL order.
 const fixtureMigrations=new Set();
 if(turnoverRun||process.argv.includes('--request-projects')){
  for(const file of ['202610100004_movement_cancellation.sql','202610100006_monitoring.sql','202610120001_request_turnover_notifications.sql'])fixtureMigrations.add(file);
 }
 if(process.argv.includes('--terminology')||process.argv.includes('--header-notifications')||process.argv.includes('--pdf-reports')||process.argv.includes('--engineer-ux')||process.argv.includes('--navigation')||process.argv.includes('--inventory-availability')||process.argv.length===2)fixtureMigrations.add('202610100006_monitoring.sql');
 fixtureMigrations.add('202610120003_optional_request_purpose.sql');
 fixtureMigrations.add('202610150001_inventory_availability.sql');
 if(process.argv.includes('--feature-completion')||process.argv.includes('--global-search')||process.argv.includes('--equipment-fixes')||process.argv.includes('--consumables-upgrade')){
  await fixture.db.exec(`create schema storage;create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
   alter table storage.objects enable row level security;alter table storage.buckets enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;
   alter table equipment alter column id set default gen_random_uuid();`);
  if(!process.argv.includes('--equipment-fixes')){
   // Reproduce the split production dependency order; never execute legacy
   // feature_storage.sql over the deployed Equipment Photo cleanup policy.
   for(const file of ['202610210001_equipment_photo_compatibility.sql','202610230001_purchase_receipts_compatibility.sql'])await fixture.db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
   for(const file of ['202610100004_movement_cancellation.sql','202610100005_purchase_ledger.sql','202610100006_monitoring.sql'])fixtureMigrations.add(file);
  }
 }
 for(const file of [...fixtureMigrations].sort())await fixture.db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 await require('./office-return-fixture.cjs').configure(fixture);
 await fixture.db.exec(fs.readFileSync(path.join(root,'supabase/migrations/202610120004_equipment_office_default.sql'),'utf8'));
 await fixture.db.exec(fs.readFileSync(path.join(root,'supabase/migrations/202610200001_verified_request_inventory.sql'),'utf8'));
 if(process.argv.includes('--consumables-upgrade')){
  await require('./consumables-upgrade-fixture.cjs').createSample(fixture);
  await require('./consumables-upgrade-fixture.cjs').upgrade(fixture);
  await fixture.db.exec(require('./consumables-upgrade-fixture.cjs').read('documentation/consumables-upgrade-2026-10-22/02-archive-sample.sql'));
  await fixture.db.exec(require('./consumables-upgrade-fixture.cjs').seed);
 }
 await fixture.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'MCPA Development Transfer Test','Local fixture only','Engr Sky',$2)",[require('node:crypto').randomUUID(),fixture.actors.sky.id]);
 if(process.argv.includes('--equipment-import'))await require('./equipment-import-fixture.cjs').upgrade(fixture);
 }
 if(process.argv.includes('--combined-integration')){const original=fixture.rpc;fixture.rpc=(actor,name,args)=>/^(mcpa_(wa_|b_|import_equipment_v2))/.test(name)?fixture.call(actor,name,args):original(actor,name,args);}
 if(process.argv.includes('--functionality-audit')){const original=fixture.rpc;fixture.rpc=(actor,name,args)=>name==='mcpa_update_my_profile'?fixture.query(actor,'select public.mcpa_update_my_profile($1,$2) value',[args.p_name,args.p_username]).then(r=>r.rows[0].value):original(actor,name,args);}
 server.listen(0,'127.0.0.1');await once(server,'listening');
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',...(process.env.MCPA_CHROME_NO_SANDBOX==='1'?['--no-sandbox','--disable-gpu','--disable-gpu-sandbox']:[]),'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const p=path.join(profile,'DevToolsActivePort');if(fs.existsSync(p)){port=fs.readFileSync(p,'utf8').split('\n')[0];break;}await pause(100);}assert.ok(port);
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let next=0;const pending=new Map();socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&JSON.stringify(m.params.args).includes('Local-browser-fixture'))passwordLogged=true;const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>reject(new Error('CDP timeout '+method)),10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(50);}throw new Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText'));};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 const go=async route=>{await evaluate(`showScreen(${JSON.stringify(route)})`);await wait(`document.querySelector('#screen-${route.split('?')[0]}.active') && !window.MCPANavigation?.restoring`);};
 const login=async(key,password='test-password')=>{await wait("document.querySelector('#auth-email')");await fill('#auth-email',key+'@example.test');await fill('#auth-password',password);await submit('#auth-form');};
 const logout=async()=>{await evaluate('MCPAAuth.logout()');await wait("document.querySelector('#auth-email')");};
 const shot=async (name,viewport=false)=>{if(process.env.MCPA_SKIP_SCREENSHOTS==='1')return;await pause(300);const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!viewport});fs.writeFileSync(path.join(profile,name+'.png'),Buffer.from(data,'base64'));console.log('SCREENSHOT '+path.join(profile,name+'.png'));};
 await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 console.log('Local Chrome ready; external HTTPS blocked');
 const base=`http://127.0.0.1:${server.address().port}`;
 if(accountServiceRun)fixture.authModel=(await import('./functionality-audit-v2/account-service.mjs')).accountService(fixture,{base});
 if(process.argv.includes('--combined-integration')){
  await require(process.argv.includes('--functionality-audit')?'./functionality-audit-v2/browser-checks.cjs':process.argv.includes('--engineer-consumables')?'./consumables-requests-v2/inventory.browser-checks.cjs':process.argv.includes('--unified-requests')?'./unified-requests.browser-checks.cjs':process.argv.includes('--final-races')?'./integration-quantity-custody-v2/final-races.browser-checks.cjs':process.argv.includes('--review-fixes')?'./integration-quantity-custody-v2/review-fixes.browser-checks.cjs':'./integration-quantity-custody-v2/browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,base,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--terminology')){
  await require('./terminology.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,base,calls});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--header-notifications')){
  await require('./header-notifications.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,login,logout,base,calls});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--login-slideshow') || process.argv.includes('--login-slideshow-fallback') || process.argv.includes('--login-slideshow-controls')){
  await require('./login-slideshow.browser-checks.cjs').verify({evaluate,command,wait,click,fill,login,logout,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Manual gallery: ten photos, Project 10 default, no autoplay, responsive layout, arrows, auth lifecycle and image failures');return;
 }
 await command('Page.navigate',{url:base+'/2-engr/index.html#users'});await wait("document.querySelector('#auth-email')");
 assert.equal(calls.length,0,'Protected pages do not fetch business records while signed out');
 assert.ok(await evaluate("document.getElementById('app-shell').classList.contains('hidden') && !document.body.classList.contains('dark')"));
 await shot('login-light');
 const enter=async selector=>{
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 };
 await fill('#auth-email','admin@example.test');await fill('#auth-password','test-password');
 await click('[data-auth-toggle-password]');
 assert.ok(await evaluate("document.querySelector('#auth-password').type==='text' && document.querySelector('[data-auth-toggle-password]').getAttribute('aria-label')==='Hide password' && !localStorage.getItem('fixture.account')"));
 await click('[data-auth-toggle-password]');
 assert.ok(await evaluate("document.querySelector('#auth-password').type==='password' && document.querySelector('#auth-password').value==='test-password'"));
 await command('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
 await shot('login-mobile');
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 await enter('#auth-password');await wait("MCPAAuth.profile?.role==='admin' && !document.querySelector('#app-shell').classList.contains('hidden')");await logout();
 await fill('#auth-email','admin@example.test');await fill('#auth-password','test-password');
 await enter('#auth-email');await wait("document.querySelector('.admin-review')");await logout();
 await fill('#auth-email','admin@example.test');await enter('#auth-email');
 assert.ok(await evaluate("!localStorage.getItem('fixture.account') && document.querySelector('#auth-password').matches(':invalid')"));
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await login('sky','wrong');await wait("document.querySelector('#auth-feedback').textContent.includes('Incorrect')");
 await login('inactive');await wait("document.querySelector('#auth-feedback').textContent.includes('inactive')");await logout();
 await login('missing');await wait("document.querySelector('#auth-feedback').textContent.includes('not assigned')");await logout();
 await login('admin');await wait("document.querySelector('.admin-review')");
 if(process.argv.includes('--equipment-import')){
  await require('./equipment-import.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,shot,artifactDirectory:profile,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--admin-equipment-summary')){
  await require('./admin-equipment-summary.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,shot,artifactDirectory:profile,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--project-construction')){
  await require('./project-construction.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,shot,artifactDirectory:profile,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--consumables-upgrade')){
  await require('./consumables-upgrade.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,shot,base,artifactDirectory:profile});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--equipment-fixes')){
  await require('./equipment-fixes.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,shot,base,artifactDirectory:profile});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--asset-interface')){
  await require('./equipment-office.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,artifactDirectory:profile});
  assert.deepEqual(errors,[],'No uncaught browser errors');return;
 }
 if(process.argv.includes('--global-search')){
  await require('./global-search.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,calls,shot,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS global search');return;
 }
 if(process.argv.includes('--pdf-reports')){
  await require('./pdf-reports.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,calls,shot,enter,artifactDirectory:profile,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS PDF exports: all authorized roles, account isolation, filters, downloads, desktop/mobile, errors, empty and multipage reports; isolated fixture only');return;
 }
 if(process.argv.includes('--inventory-availability')){
  await require('./inventory-availability.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Inventory availability and mobile rendering; isolated fixture only');return;
 }
 if(process.argv.includes('--navigation')){
  await require('./navigation-history.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,calls,shot,base});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Project scoping and browser history; local fixture only');return;
 }
 if(process.argv.includes('--engineer-ux')){
  await require('./engineer-ux.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,enter});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Engineer UX browser checks; isolated database, no live writes');return;
 }
 if(turnoverRun){
  await require('./request-turnover.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,port,base,errors});
  assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS Request turnover synchronization; isolated independent sessions, no live requests');return;
 }
 if(process.argv.includes('--office-returns')){
  await require('./office-return.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS Office returns; isolated local records, no live writes');return;
 }
 if(process.argv.includes('--request-projects')){
  await require('./request-projects.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot,port,base,errors,artifactDirectory:profile});
  assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS Assigned request projects; isolated Engineer A/B/Architect sessions, no live writes');return;
 }
 if(process.argv.includes('--feature-completion')){
  await require('./feature-frontend.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  await require('./procurement-monitoring.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  await require('./cancellation.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Feature completion browser checks; isolated storage/database, no live requests');return;
 }
 if(process.argv.includes('--transfer-history')){
  await require('./transfer-history.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,go,login,logout,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Responsive Transfer History; isolated fixture, no live requests');return;
 }
 if(process.argv.includes('--projects-errors')){
  await require('./projects-errors.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,go,login,logout,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Projects schema errors and authorized views; isolated database only');return;
 }
 if(process.argv.includes('--portal')){
  await require('./engineer-portal.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Engineer portal browser checks; isolated database only');return;
 }
 if(process.argv.includes('--mobile-search-only')){
  await require('./mobile-search-ui-checks.cjs').verify({evaluate,command,wait,click,fill,go,login,logout});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Mobile search browser checks; isolated database only');return;
 }
 if(!process.argv.includes('--flows-only')){
 const headerBaseline=await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
 // Trusted touch runs before the native animation inspection suite injects
 // paused transitions and repeatedly changes device emulation. Both suites
 // retain their real input assertions and preserve the database baseline.
 if(!process.argv.includes('--theme-only'))await require('./mobile-search-ui-checks.cjs').verify({evaluate,command,wait,click,fill,go,login,logout});
 await require('./workspace-ui-checks.cjs').header({evaluate,command,wait,click,fill,go,shot});
 if(process.argv.includes('--theme-only')){
  assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),headerBaseline,'Theme checks preserve fixture records');
  assert.equal(calls.filter(call=>call.rpc==='mcpa_movement_action').length,0,'Theme checks perform no business writes');
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Theme browser checks; fixture records unchanged');
  return;
 }
 assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),headerBaseline,'Theme/search interactions preserve all fixture records');
 assert.equal(calls.filter(call=>call.rpc==='mcpa_movement_action').length,0,'Theme/search checks perform no business writes');
 if(process.argv.includes('--header-only')){
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Read-only theme/search browser checks; fixture records unchanged');
  return;
 }
 }
 await go('dashboard');await wait("document.querySelector('.admin-review')");
 assert.ok(await evaluate("!document.querySelector('#movement-profile') && !document.body.innerText.includes('Open Engineer') && !document.querySelector('.dashboard-toolbar .overview-actions')"));
 await command('Page.reload');await wait("document.querySelector('.admin-review')");
 await go('request');await wait("document.querySelector('[data-list]')");assert.ok(await evaluate("!document.querySelector('[data-form=create]')"));
 await go('transfer');await wait("document.querySelector('[data-list]')");assert.ok(await evaluate("!document.querySelector('[data-form=create]') && !document.querySelector('[data-form=lookup]')"));
 await go('users');await wait("document.querySelector('#account-profile option[value]') && document.querySelector('#accounts-list tbody tr')");

 assert.equal(await evaluate("!!document.querySelector('[data-open-invite],#invite-panel')"),false);
 await evaluate("window.__accountCapabilities={development_enabled:true,pending_development_accounts:[]}");
 await evaluate('window.dispatchEvent(new Event("focus"))');await wait("document.querySelector('#account-availability').textContent.includes('creation is enabled')");
 assert.equal(await evaluate("!!document.querySelector('[data-open-invite]')"),false);
 assert.deepEqual(await evaluate("[...document.querySelector('#development-role').options].map(o=>o.value)"),['engineer','architect']);
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-controls')"),'development-password');
 await shot('development-accounts-desktop');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('development-accounts-mobile');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await fill('#development-name','Development Engineer A');await fill('#development-email','deva@example.test');
 await fill('#development-password','Local-browser-fixture-2026!');
 const toggleIcon=await evaluate("document.querySelector('#development-password-toggle').innerHTML");
 const pointer=await evaluate("(()=>{const input=document.querySelector('#development-password');input.scrollIntoView({block:'center'});input.focus();input.setSelectionRange(3,7);const r=document.querySelector('#development-password-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pointer});
 await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pointer});
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'text');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Hide password');
 assert.notEqual(await evaluate("document.querySelector('#development-password-toggle').innerHTML"),toggleIcon);
 assert.deepEqual(await evaluate("[document.activeElement.id,document.querySelector('#development-password').selectionStart,document.querySelector('#development-password').selectionEnd]"),['development-password',3,7],'Pointer toggle preserves input focus and selection');
 await click('#development-password-toggle');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate('document.activeElement.id'),'development-password-toggle','Toggle is next in keyboard tab order');
 await enter('#development-password-toggle');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'text');
 assert.equal(await evaluate('document.activeElement.id'),'development-password-toggle','Keyboard activation keeps button focus');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("!!window.__accountRequest"),false,'Visibility toggles never submit the creation form');
 await click('#development-password-toggle');
 await evaluate('window.__developmentFailure=true');await submit('#development-form');
 await wait("document.querySelector('#accounts-feedback').textContent.includes('Creation interrupted')");
 assert.equal(await evaluate("document.querySelector('#development-password').value"),'');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password','Failure also restores hidden state');
 assert.equal(await evaluate("document.querySelector('#development-name').value"),'Development Engineer A');
 const failedRequest=await evaluate('window.__accountRequest.body');
 await wait("!document.querySelector('#development-form button').disabled");
 await evaluate('window.__developmentFailure=false');await fill('#development-password','Local-browser-fixture-2026!');await click('#development-password-toggle');await submit('#development-form');
 await wait("document.querySelector('#accounts-feedback').textContent==='Test account created.'");
 const developmentRequest=await evaluate('window.__accountRequest');
 assert.equal(developmentRequest.name,'manage-accounts');assert.equal(developmentRequest.body.action,'createDevelopmentAccount');
 assert.equal(developmentRequest.body.role,'engineer');assert.equal(developmentRequest.body.id,failedRequest.id,'Retry keeps the request identity');
 assert.equal(await evaluate("document.querySelector('#development-password').value"),'');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password','Success restores hidden state');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').innerHTML"),toggleIcon);
 assert.equal(await evaluate("document.body.innerText.includes('Local-browser-fixture')"),false);
 assert.equal(passwordLogged,false,'Temporary password is never logged');
 assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('Local-browser-fixture')"),false);
 assert.equal(await evaluate("!!document.querySelector('[data-open-invite]')"),false,'Completing development creation does not expose removed controls');
 await wait("!document.querySelector('[data-audit]').disabled");
 await click('[data-audit]');await wait("document.querySelector('#account-audit').textContent.length>0");
 await go('dashboard');await wait("document.querySelector('.admin-review')");await evaluate('toggleTheme()');await shot('admin-dark');
 await logout();assert.equal(await evaluate("MovementStore.getState().tools.length"),0);
 await login('sky');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");
 await evaluate("showScreen('users')");await wait("document.querySelector('#content').textContent.includes('Access restricted')");
 await go('request');await wait("document.querySelector('[data-form=create]')");
 // Unified requests default to quantity mode; activate the existing specific-
 // asset form before checking its native project selector and submitting it.
 await click('[data-method=specific]');await wait('document.querySelector("#mv-destination")?.getBoundingClientRect().height>0');
 const key=async(key,code,windowsVirtualKeyCode)=>{
  await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
 };
 for(const width of [375,390,430,768,1440]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
  await command('Emulation.setTouchEmulationEnabled',{enabled:width<900});
  await pause(200);
  const control=await evaluate(`(()=>{const s=document.querySelector('#mv-destination');s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return {tag:s.tagName,disabled:s.disabled,x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,right:r.right,height:r.height,font:parseFloat(getComputedStyle(s).fontSize),options:[...s.options].map(o=>o.value),top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===s};})()`);
  assert.equal(control.tag,'SELECT');assert.equal(control.disabled,false);assert.equal(control.top,true,JSON.stringify({width,...control}));
  assert.ok(control.left>=0 && control.right<=width && control.height>=44);
  if(width<=768)assert.ok(control.font>=16);
  assert.ok(control.options.includes('MCPA Development Transfer Test'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  if(width<900){
   await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:control.x,y:control.y}]});
   await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await evaluate("document.querySelector('#mv-destination').focus()");}
  await key('End','End',35);await key('Enter','Enter',13);
  assert.equal(await evaluate("document.querySelector('#mv-destination').value"),'MCPA Development Transfer Test');
  if([375,1440].includes(width))await shot('project-select-'+width);
 }
 await command('Emulation.setTouchEmulationEnabled',{enabled:false});
 console.log('PASS Native project select: touch hit targets, keyboard selection, all options and viewport fit at 375/390/430/768/1440');
 await click('[name="toolIds"][value="TOOL-001"]');await fill('[name=destination]','Casa Buena');await fill('[name=purpose]','Structural works');await submit('[data-form=create]');
 await wait("document.querySelector('[data-list]').textContent.includes('Pending Review')");
 const request=await evaluate('MovementStore.getState().requests[0]');
 await logout();await login('admin');await wait("document.querySelector('.admin-review')");
 const beforeNavigation=await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
 const writeCount=calls.filter(c=>c.rpc==='mcpa_movement_action').length;
 for(const width of [375,390,430,768,1440]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
  await command('Emulation.setTouchEmulationEnabled',{enabled:width<900});
  await go('activity');await wait("document.querySelector('a[data-movement-link]')");
  assert.equal(await evaluate("document.querySelector('a[data-movement-link]').getAttribute('href')"),'#request?record='+request.id);
  if([375,1440].includes(width))await shot('activity-links-'+width);
  if(width===1440)await enter('a[data-movement-link]');
  else{
   const point=await evaluate("(()=>{const row=document.querySelector('.activity-linked-row');row.scrollIntoView({block:'center'});const r=row.querySelector('td').getBoundingClientRect();const x=r.left+12,y=r.top+12;return {x,y,linked:!!document.elementFromPoint(x,y)?.closest('a[data-movement-link]')};})()");
   assert.ok(point.linked,'The first cell, outside the link text, is tappable');
   await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
   await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await wait("document.querySelector('#screen-request.active [data-detail]:not([hidden])')?.textContent.includes('Pending Review') && document.activeElement.matches('[data-detail]')");
  assert.equal(await evaluate('location.hash'),'#request?record='+request.id);
  assert.ok(await evaluate("document.querySelector('.mv-selected-row').textContent.includes("+JSON.stringify(request.id)+") && document.querySelector('dialog[data-detail][open]') && !document.querySelector('#sidebar.open')"));
  if([375,1440].includes(width)){
   await shot('targeted-request-'+width);
   await command('Page.reload');
   await wait("document.querySelector('#screen-request.active [data-detail]:not([hidden])')?.textContent.includes('Pending Review') && document.activeElement.matches('[data-detail]')");
  }
 }
 await command('Emulation.setTouchEmulationEnabled',{enabled:false});
 await go('dashboard');await wait("document.querySelector('.asset-timeline a[data-movement-link]')");
 await enter('.asset-timeline a[data-movement-link]');
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes('Pending Review')");
 await evaluate("location.hash='#request?record=does-not-exist'");
 await wait("document.querySelector('[data-notice]')?.textContent.includes('unavailable')");
 assert.ok(await evaluate("!document.querySelector('[data-detail]').open"));
 await evaluate("location.hash="+JSON.stringify('#request?record='+request.id));
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes('Pending Review')");
 assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),beforeNavigation,'Opening notification targets preserves requests, custody and activity');
 assert.equal(calls.filter(c=>c.rpc==='mcpa_movement_action').length,writeCount,'Navigation only reads data');
 console.log('PASS Activity/dashboard links, full-row touch, keyboard, deep-link refresh, missing record and unchanged pending request at all five widths');
 await require('./notification-ui-checks.cjs').targeting({fixture,request,evaluate,command,wait,click,go,enter,calls,shot,login,logout});
 await go('request');await wait("document.querySelector('[data-action=view]')");await click('[data-action=view]');await click('[data-action=approve]');await wait("document.querySelector('[data-action=release]')");await click('[data-action=release]');await wait("MovementStore.getState().transfers.some(t=>t.requestId==="+JSON.stringify(request.id)+")");
 const transfer=await evaluate('MovementStore.getState().transfers.find(t=>t.requestId==='+JSON.stringify(request.id)+')');assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='TOOL-001').holder"),'');
 await logout();await login('sky');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await go('transfer');await wait("document.querySelector('[data-form=lookup]')");await click('[data-transfer-tab=receive]');await fill('[name=code]',transfer.code);await submit('[data-form=lookup]');await wait("document.querySelector('[data-form=receive]')");await fill('[data-condition]','good');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Test each')");await click('[data-tested]');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Receipt confirmed')");
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='TOOL-001').holder"),'Engr Sky');
 await go('return');await wait("document.querySelector('[data-form=create]')");await click('[name="toolIds"][value="TOOL-001"]');await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Guard broken');await submit('[data-form=create]');await wait("MovementStore.getState().repairs.some(r=>r.toolId==='TOOL-001')");
 await go('dashboard');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('engineer-mobile-dark');
 await evaluate('__expire()');await wait("document.querySelector('#auth-email')");assert.equal(await evaluate('MovementStore.getState().tools.length'),0);
 await login('architect');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");assert.equal(await evaluate('MCPAAuth.profile.role'),'architect');await logout();
 await login('secretary');await wait("document.querySelector('#screen-consumables.active') && document.querySelector('#consumables-feedback')");assert.ok(await evaluate("!document.querySelector('[data-target=masterlist]') && !document.querySelector('[data-target=users]')"));await evaluate("showScreen('dashboard')");await wait("document.querySelector('#content').textContent.includes('Access restricted')");await logout();
 await login('handler');await wait("document.querySelector('.overview-kpis')");assert.ok(await evaluate("!document.querySelector('.dashboard-toolbar .overview-actions') && !document.querySelector('[data-target=users]')"));await go('transfer');await wait("document.querySelector('[data-form=create]')");await logout();
 const before=calls.length;await click('[data-auth-demo]');await click('[data-demo-role=engineer]');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");assert.equal(await evaluate('MovementStore.mode'),'demo');await go('request');await wait("document.querySelector('[name=toolIds][value=\"GRD-002\"]')");await click('[name=toolIds][value="GRD-002"]');await fill('[name=destination]','Casa Buena');await fill('[name=purpose]','Demo only');await submit('[data-form=create]');await wait("MovementStore.getState().requests.length===1");await command('Page.reload');await wait("document.querySelector('[data-list]')?.textContent.includes('GRD-002')");assert.equal(calls.length,before,'Offline demo performs no live RPC/table requests');
 await logout();await click('[data-auth-demo]');await click('[data-demo-role=admin]');await wait("document.querySelector('.admin-review')");await go('request');await wait("document.querySelector('[data-list]')?.textContent.includes('GRD-002')");await click('[data-action=view]');await click('[data-action=approve]');await wait("document.querySelector('[data-action=release]')");
 await click('[data-action=release]');await wait("MovementStore.getState().transfers.length===1");const demoTransfer=await evaluate('MovementStore.getState().transfers[0]');
 await logout();await click('[data-auth-demo]');await click('[data-demo-role=engineer]');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await go('transfer');await wait("document.querySelector('[data-form=lookup]')");await click('[data-transfer-tab=receive]');await fill('[name=code]',demoTransfer.code);await submit('[data-form=lookup]');await wait("document.querySelector('[data-form=receive]')");await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Damage found during demo inspection');
 assert.ok(await evaluate("!document.querySelector('[data-decision-field]').hidden && !document.querySelector('[data-disposition]').disabled"));
 await fill('[data-disposition]','declined');await click('[data-tested]');await fill('[name=refusalReason]','Damage found during demo inspection');await click('[name=refusalConfirmed]');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Damage refusal recorded')");
 assert.equal(await evaluate('MovementStore.getState().transfers[0].status'),'refused');
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='GRD-002').holder"),'\u2014');assert.equal(calls.length,before,'Damaged demo receipt stays offline');
 await logout();await login('admin');await wait("document.querySelector('.admin-review')");await evaluate('__expire()');await wait("document.querySelector('#auth-email')");assert.equal(await evaluate('MovementStore.getState().tools.length'),0,'Auth events remain connected after restoring and exiting demo');

 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");
 await logout();
 await require('./workspace-ui-checks.cjs').sync({fixture,evaluate,command,wait,fill,go,login,logout,calls});
 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");
 await go('dashboard');await wait("document.querySelector('#screen-dashboard.active .overview-kpis')");
 const beforeSetup=calls.length;
 await evaluate("sessionStorage.setItem('mcpa.demo.role','engineer')");
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html?account_setup=invite#type=invite'});
 await wait('document.querySelector("#auth-feedback")?.textContent.includes("no longer supported")');
 assert.equal(await evaluate('MCPAAuth.profile'),null);
 assert.equal(calls.length,beforeSetup,'Retired callbacks load no company data');
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html?expired_test=1#error=access_denied&error_code=otp_expired'});
 await wait("document.querySelector('#auth-feedback')?.textContent.includes('invalid or expired')");
 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await logout();
 assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS Account access, password recovery, retired setup links, Auth/session, all five roles, direct route guards, review/release/tested receipt/return, damaged demo receipt, theme, mobile, and offline demo isolation');
})().catch(error=>{console.error(error);console.error(JSON.stringify(errors));process.exitCode=1;}).finally(async()=>{socket?.close();chrome?.kill();server.closeAllConnections();server.close();await fixture?.close();console.log('Browser artifacts: '+profile);});
