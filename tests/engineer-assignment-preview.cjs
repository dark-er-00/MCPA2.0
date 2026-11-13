// Loopback-only, no-database UI preview. All RPC-shaped responses are JavaScript fixtures.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createFixture}=require('./engineer-assignment-preview-fixture.cjs');
exports.start=({port=4183}={})=>{
 const root=path.resolve(__dirname,'..'),publicRoot=path.join(root,'public'),fixture=createFixture();
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json'};
 const send=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'; form-action 'self'");
  res.setHeader('X-MCPA-Fixture','synthetic-javascript-no-database');
  try{
   const url=new URL(req.url,'http://127.0.0.1:'+port),pathname=url.pathname;
   if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+port)return send(res,{error:'Local preview only.'},403);
   if(pathname==='/__fixture'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>MCPA synthetic Engineer preview</title><style>body{font:16px system-ui;max-width:850px;margin:32px auto;padding:16px;background:#151513;color:#f5f5ef}a{display:inline-block;color:#ffcd00;padding:12px}li{margin:12px 0}</style><h1>Isolated synthetic UI preview</h1><p>JavaScript fixture data only. No database, SQL execution, Supabase, email or deployment. State resets on restart.</p><p>Casa Buena is assigned to Engr Pau. Engr Sky is assigned only to Sky Assigned Project. Synthetic Architect is assigned only to Architect Assigned Project. Each has a separate own-custody drill at Casa Buena; custody does not grant project access.</p><p>Admin and Engineer UI are manually accepted. Engineer/Architect parity awaits your confirmation. Backend authorization is not validated by this preview.</p><ul>${Object.entries(fixture.actors).map(([key,p])=>`<li><a href="/index.html?fixture=${key}#${['sky','architect','unassigned'].includes(key)?'sites':'dashboard'}">${p.name} · ${p.role}</a></li>`).join('')}</ul><a href="/index.html?fixture=sky#sites">Sky Projects</a><a href="/index.html?fixture=sky#masterlist">Sky Equipment Inventory</a></html>`);return;
   }
   if(pathname==='/__sdk.js'){
    res.setHeader('Content-Type','text/javascript');
    res.end(fs.readFileSync(path.join(__dirname,'fixtures/offline-sdk.js'),'utf8')+`\nconst fixtureRole=new URLSearchParams(location.search).get('fixture');if(${JSON.stringify(Object.keys(fixture.actors))}.includes(fixtureRole))localStorage.setItem('fixture.account',fixtureRole);else if(!localStorage.getItem('fixture.account'))localStorage.setItem('fixture.account','sky');document.addEventListener('DOMContentLoaded',()=>document.title='MCPA · Synthetic Engineer preview');`);return;
   }
   if(pathname==='/__fixture-api'&&req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4*1024*1024)return send(res,{error:'Fixture request too large.'},413);}
    const q=JSON.parse(body),result=fixture.handle(req.headers.authorization,q);send(res,result);return;
   }
   if(pathname.startsWith('/__stored/')){const stored=fixture.stored.get(decodeURIComponent(pathname.slice(10)));if(!stored)return send(res,{error:'Not found'},404);res.setHeader('Content-Type',stored.type);res.end(Buffer.from(stored.bytes,'base64'));return;}
   if(pathname==='/app/core/config.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'fixtures/offline-config.js')));return;}
   const file=path.resolve(publicRoot,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||path.extname(file)==='.php')return send(res,{error:'Not found'},404);
   let content=fs.readFileSync(file);
   if(file===path.join(publicRoot,'index.html'))content=content.toString().replace(/<script src="https:[^"]+"[^>]*><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(content);
  }catch(e){send(res,{error:'Invalid isolated fixture request.'},400);}
 });
 server.on('error',e=>{console.error('Preview did not start:',e.code);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log('Synthetic JavaScript preview (no database): http://127.0.0.1:'+port+'/index.html?fixture=sky#sites'));
 return server;
};
if(require.main===module)exports.start();
