// Loopback test server for the actual main-based integrated public/ tree.
// The older synthetic fixture models API contracts; it does not prove deployed schema compatibility.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createFixture}=require('./engineer-assignment-preview-fixture.cjs');
const root=path.resolve(__dirname,'../..'),publicRoot=path.join(root,'public'),v2Root=path.join(__dirname,'offline-assets');
const adminReview=process.argv.includes('--admin-review');
const fieldReview=process.argv.includes('--field-review');
const fixture=createFixture({adminReview,fieldReview}),port=Number(process.env.PORT||(fieldReview?4197:adminReview?4196:4192));
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const mime={'.js':'text/javascript','.cjs':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.webm':'video/webm','.json':'application/json','.txt':'text/plain; charset=utf-8'};
const calls=[];
function seed(){
 const act=(who,action,payload)=>{const result=fixture.handle(who,{rpc:'mcpa_movement_action',args:{p_operation_id:require('node:crypto').randomUUID(),p_action:action,p_payload:payload}});if(result.error)throw Error(result.error.message);};
 if(fieldReview){
  for(const [n,who] of ['sky','architect'].entries()){
   act(who,'reportRepair',{toolId:'SYN-0'+(21+n*10),notes:'Synthetic motor inspection'});
   act(who,'reportMissing',{toolId:'SYN-0'+(22+n*10),notes:'Synthetic site stocktake'});
  }
 }
 act('sky','createRequest',{toolIds:['SYN-001'],destination:fixture.sites.sky.name,purpose:'Synthetic site preparation'});
 act('architect','createRequest',{toolIds:['SYN-009'],destination:fixture.sites.architect.name,purpose:'Synthetic survey preparation'});
 act('pau','createTransfer',{toolIds:['SYN-005'],receiverId:fixture.actors.sky.id,destinationId:fixture.sites.sky.id,notes:'Synthetic handover for design review'});
 act('pau','createTransfer',{toolIds:['SYN-011'],receiverId:fixture.actors.architect.id,destinationId:fixture.sites.architect.id,notes:'Synthetic handover for design review'});
}
seed();
const send=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
function page(html,branded){
 return html.replace('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js','/v2/vendor/qrcode.min.js')
  .replace('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js','/v2/vendor/html5-qrcode.min.js')
  .replace(/<script\s+src="https:[^"]+"[^>]*><\/script>/g,'')
  .replace(/<link[^>]+href="https:[^"]+"[^>]*>/g,'')
  .replace('</head>', '<script src="/__sdk.js"></script><script src="/v2/offline-qr.js"></script></head>');
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'self'");
 res.setHeader('X-MCPA-Fixture','synthetic-javascript-no-database');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port),pathname=url.pathname.replace(/^\/nested(?=\/)/,'');
  if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+port)return send(res,{error:'Local preview only.'},403);
  if(pathname==='/__sdk.js'){
   res.setHeader('Content-Type','text/javascript');
   const reviewScript=fieldReview?fs.readFileSync(path.join(__dirname,'fixtures/field-review.js'),'utf8'):'';
   return res.end(fs.readFileSync(path.join(__dirname,'fixtures/offline-sdk.js'),'utf8')+'\n'+reviewScript+
    '\nconst fixtureRole=new URLSearchParams(location.search).get("fixture");if('+JSON.stringify(Object.keys(fixture.actors))+'.includes(fixtureRole))localStorage.setItem("fixture.account",fixtureRole);else if(!localStorage.getItem("fixture.account"))localStorage.setItem("fixture.account","admin");\n'+
    'const reviewTheme=new URLSearchParams(location.search).get("theme");if(["dark","light"].includes(reviewTheme))localStorage.setItem("mcpa.theme",reviewTheme);else if(!localStorage.getItem("mcpa.theme"))localStorage.setItem("mcpa.theme","dark");');
  }
  if(pathname==='/__fixture-api'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4*1024*1024)return send(res,{error:'Fixture request too large'},413);}
   const q=JSON.parse(body);calls.push({actor:req.headers.authorization,rpc:q.rpc||null,table:q.table||null,write:q.write||null});
   return send(res,fixture.handle(req.headers.authorization,q));
  }
  if(pathname==='/__health')return send(res,{status:'ok',port,version:'v2',fixture:'synthetic-javascript-no-database',baseline:'f6e022df84fcce0c0243b0aa9a7106c3ec292c31'});
  if(pathname==='/__calls')return send(res,calls);
  if(pathname==='/__fixture'){res.setHeader('Location','/index.html?fixture=admin&theme=dark#dashboard');return res.writeHead(302).end();}
  if(pathname.startsWith('/__stored/')){const stored=fixture.stored.get(decodeURIComponent(pathname.slice(10)));if(!stored)return send(res,{error:'Not found'},404);res.setHeader('Content-Type',stored.type);return res.end(Buffer.from(stored.bytes,'base64'));}
  if(pathname==='/app/core/config.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(__dirname,'fixtures/offline-config.js')));}
  let directory=publicRoot,relative=pathname==='/'?'/index.html':pathname==='/favicon.ico'?'/assets/images/favicon.svg':pathname;
  if(pathname.startsWith('/v2/')){directory=v2Root;relative=pathname.slice(3);}
  else if(pathname.startsWith('/brand/')){directory=v2Root;relative=pathname.slice(6);}
  else if(['/review.html','/showcase.html','/comparison.html'].includes(pathname)){directory=v2Root;relative=pathname;}
  else if(pathname.startsWith('/screenshots/')){directory=path.join(root,'screenshots');relative=pathname.slice(12);}
  if(!['GET','HEAD'].includes(req.method))return send(res,{error:'Method not allowed'},405);
  const file=path.resolve(directory,'.'+(relative.startsWith('/')?relative:'/'+relative));
  if(!file.startsWith(directory+path.sep)||relative.split(/[\\/]/).some(p=>p.startsWith('.'))||!fs.existsSync(file)||!fs.statSync(file).isFile()||!mime[path.extname(file)])return send(res,{error:'Not found'},404);
  const real=fs.realpathSync(file);if(!real.startsWith(fs.realpathSync(directory)+path.sep))return send(res,{error:'Not found'},404);
  let content=fs.readFileSync(file);
  if(path.extname(file)==='.js')content=content.toString().replace(/`https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/\?size=(\d+)x\d+&data=\$\{encodeURIComponent\(([^)]+)\)\}`/g,(_match,size,value)=>'window.MCPAOfflineQR.image('+value+','+size+')');
  if(file===path.join(publicRoot,'index.html'))content=page(content.toString(),url.searchParams.get('design')!=='original');
  res.setHeader('Content-Type',mime[path.extname(file)]);
  res.end(req.method==='HEAD'?undefined:content);
 }catch(e){send(res,{error:'Invalid isolated preview request'},400);}
});
server.on('error',e=>{console.error('Preview failed:',e.code);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('MCPA2.0 integrated review http://127.0.0.1:'+port+'/index.html?fixture=admin&theme=dark#dashboard — synthetic only, no database'));
