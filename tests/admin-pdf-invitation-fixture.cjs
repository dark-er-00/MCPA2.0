// Offline HTTP boundary: real PHP -> local Auth model + real PGlite SQL/RLS.
const http=require('node:http'),{spawn}=require('node:child_process'),{once}=require('node:events'),{randomUUID}=require('node:crypto');
exports.open=async(f,{appUrl='',enabled=true}={})=>{
 const state={calls:[],mails:[],failFinish:false,loseAuth:false,failMail:false,passwords:new Map()};let php,queue=Promise.resolve();
 const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;};
 const reply=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 const secret='sb_secret_synthetic_invitation_fixture',key='sb_publishable_synthetic_invitation_fixture';
 const upstream=http.createServer((req,res)=>{queue=queue.then(async()=>{
  let raw='';for await(const part of req)raw+=part;const input=raw?JSON.parse(raw):{},url=new URL(req.url,'http://localhost');
  const actorKey=(req.headers.authorization||'').replace('Bearer ',''),actor=f.actors[actorKey];
  state.calls.push({path:url.pathname,privileged:req.headers.apikey===secret,input});
  try{
   if(url.pathname==='/auth/v1/user')return actor?reply(res,{id:actor.authId,email:actorKey+'@example.test'}):reply(res,{message:'Invalid identity'},401);
   if(url.pathname==='/auth/v1/admin/users'){
    if(req.headers.apikey!==secret)throw Error('Privileged credential missing');
    if(input.email_confirm!==false)throw Error('Invitation must not confirm email');
    const id=randomUUID();await f.runExclusive(db=>db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,input.email,input.app_metadata]));state.passwords.set(id,input.password);
    if(state.loseAuth){state.loseAuth=false;req.socket.destroy();return;}return reply(res,{id,email:input.email});
   }
   if(url.pathname==='/auth/v1/resend'){
    if(state.failMail)return reply(res,{message:'Synthetic mail failure'},429);
    state.mails.push({...input,redirect:url.searchParams.get('redirect_to')});return reply(res,{});
   }
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const name=url.pathname.split('/').at(-1);
    if(name==='mcpa_registration_finish'&&state.failFinish){state.failFinish=false;return reply(res,{message:'Synthetic finish failure'},503);}
    const service=name.startsWith('mcpa_registration_');
    if(service){if(req.headers.apikey!==secret)throw Error('Missing service authorization');}
    else if(!actor)return reply(res,{message:'Unauthorized'},401);
    const run=async()=>{const sql=`select public.${name}(${Object.keys(input).map((k,i)=>k+' => $'+(i+1)).join(',')}) value`;
     if(service)await f.db.exec('set role service_role');
     const result=service?await f.db.query(sql,Object.values(input)):await f.query(actor,sql,Object.values(input));
     if(name==='mcpa_registration_finish'){
      await f.db.exec('reset role');
      const row=(await f.db.query('select * from profiles where id=$1',[result.rows[0].value])).rows[0],user=(await f.db.query('select email from auth.users where id=$1',[row.auth_user_id])).rows[0];
      const key='invited-'+row.id.slice(0,8);f.actors[key]={id:row.id,authId:row.auth_user_id,name:row.name,role:row.role};state.identities??=new Map();state.identities.set(user.email,key);
     }
     return reply(res,result.rows[0].value);
    };return service?await f.runExclusive(run):await run();
   }
   return reply(res,{message:'Unexpected fixture route'},404);
  }catch(error){reply(res,{code:error.code||'TEST',message:error.message},error.code==='42501'?403:400);}
 }).catch(error=>reply(res,{message:error.message},500));});
 const upstreamUrl=await listen(upstream),reservation=http.createServer(),base=await listen(reservation);await new Promise(r=>reservation.close(r));
 appUrl=appUrl||base;let stderr='';
 php=spawn(process.env.PHP_BINARY||'C:/xampp/php/php.exe',['-d','display_errors=0','-d','log_errors=1','-S','127.0.0.1:'+new URL(base).port,'-t','public','server/router.php'],{cwd:require('node:path').resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,SUPABASE_URL:upstreamUrl,SUPABASE_PUBLISHABLE_KEY:key,MCPA_SUPABASE_SECRET_KEY:secret,MCPA_ENABLE_DEVELOPMENT_ACCOUNTS:'false',MCPA_ENABLE_REGISTRATION_INVITATIONS:String(enabled),MCPA_APP_URL:appUrl}});
 php.stderr.on('data',d=>stderr+=d);let startError;php.on('error',e=>startError=e);
 for(let i=0;i<100;i++){if(startError)throw startError;try{if((await fetch(base+'/index.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
 state.base=base;state.appUrl=appUrl;
 state.request=(body,actor='admin',registration=false,extra={})=>new Promise((resolve,reject)=>{
  const request=http.request(base+'/api/index.php?route='+encodeURIComponent('/functions/v1/'+(registration?'register-invitation':'manage-accounts')),{method:'POST',headers:{'content-type':'application/json','x-mcpa-request':'1','host':new URL(appUrl).host,'origin':new URL(appUrl).origin,...(actor?{authorization:'Bearer '+actor}:{}),...extra}},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});request.on('error',reject);request.end(JSON.stringify(body));
 });
 state.close=async()=>{if(php.exitCode===null){php.kill();await once(php,'exit');}upstream.closeAllConnections();await new Promise(r=>upstream.close(r));if(/PHP (Warning|Fatal error)/.test(stderr))throw Error(stderr);};
 return state;
};
