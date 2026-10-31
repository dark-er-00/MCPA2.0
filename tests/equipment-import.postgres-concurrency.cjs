// Native PostgreSQL only. Creates its own fresh temporary cluster, random port,
// local credentials and database. Never accepts a connection URL or existing DB.
// Usage: node tests/equipment-import.postgres-concurrency.cjs <portable-pg-bin>
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),cp=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'documentation/equipment-import-2026-10-24/postgres-concurrency');
const bin=process.argv[2]&&path.resolve(process.argv[2]),exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
if(!bin||!['initdb','pg_ctl','psql','postgres'].every(n=>fs.existsSync(exe(n)))){console.error('BLOCKED: native PostgreSQL binaries unavailable; no concurrency pass is claimed.');process.exit(2);}
fs.mkdirSync(output,{recursive:true});
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-native-pg-')),data=path.join(work,'data');
const owner='mcpa_test_owner',dbname='mcpa_import_disposable_'+randomUUID().replaceAll('-','');
const password=randomBytes(32).toString('hex'),pwfile=path.join(work,'local-password');fs.writeFileSync(pwfile,password+'\n');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|SUPABASE|DATABASE_URL|^DB_/i.test(k)));
const report={status:'running',startedAt:new Date().toISOString(),environment:{platform:process.platform,os:os.release(),arch:os.arch(),node:process.version,bin,work,dbname},cases:[],observations:{}};
const persist=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
const sql=file=>fs.readFileSync(path.join(root,file),'utf8'),lit=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'";
const uid=()=>randomUUID(),json=v=>lit(JSON.stringify(v))+'::jsonb';
let port,started=false,current='environment',sessions=new Set();
function command(name,args){const r=cp.spawnSync(exe(name),args,{env,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw Error(name+': '+(r.error?.message||r.stderr||r.stdout));return r.stdout;}
function args(database=dbname){return ['-X','--no-password','--quiet','--no-align','--tuples-only','--set=ON_ERROR_STOP=1','--set=VERBOSITY=verbose','--host=127.0.0.1','--port='+port,'--username='+owner,'--dbname='+database];}
function connection(script,label='fixture',database=dbname,hold=false){
  const child=cp.spawn(exe('psql'),args(database),{env:{...env,PGPASSWORD:password,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const session={child,out:'',err:''};sessions.add(session);
  let readyResolve,readyReject;session.ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});session.ready.catch(()=>{});
  session.done=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('Native connection exceeded 25 seconds: '+label));},25000);
    child.stdout.on('data',b=>{session.out+=b.toString();if(session.out.includes('MCPA_HOLD_READY'))readyResolve(session);});
    child.stderr.on('data',b=>session.err+=b.toString());child.on('error',e=>{clearTimeout(timer);readyReject(e);reject(e);});
    child.on('close',code=>{clearTimeout(timer);sessions.delete(session);if(code===0)resolve(session.out);else{const e=Error(session.err||'psql exited '+code);e.code=session.err.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];readyReject(e);reject(e);}});
  });
  session.done.catch(()=>{});
  child.stdin.on('error',()=>{});
  if(hold)child.stdin.write(script+'\n\\echo MCPA_HOLD_READY\n');else child.stdin.end(script+'\n');
  return session;
}
const execute=(script,label,database)=>connection(script,label,database).done;
function parse(text){const lines=text.trim().split(/\r?\n/).filter(s=>s.startsWith('{')||s.startsWith('['));assert.ok(lines.length,'Expected JSON result: '+text);return JSON.parse(lines.at(-1));}
const query=async(script,label)=>parse(await execute(script,label));
const identity=(actor='admin')=>'set local role '+(actor==='anon'?'anon':'authenticated')+';'+(actor==='anon'?'':`select set_config('request.jwt.claim.sub',${lit(actors[actor].auth)},true);`);
const as=(script,actor='admin',options='')=>'begin;'+options+identity(actor)+script+';commit;';
const row=(source_row=2,extra={})=>({source_row,name:'Identical Electric Drill',category:'Power Tools',brand:'Bosch',tracking_type:'Individual',quantity:1,...extra});
const rows=n=>Array.from({length:n},(_,i)=>row(i+2,i%2?{tracking_type:'Bulk',quantity:5,unit:'Pieces'}:{}));
const rpcSQL=(operation,batch)=>`select jsonb_build_object('pid',pg_backend_pid(),'value',public.mcpa_import_equipment(${lit(operation)}::uuid,${json(batch)}))`;
const imported=(operation,batch,label,actor='admin',options='')=>query(as(rpcSQL(operation,batch),actor,options),label);
const manualSQL=(tag=null,photo=null)=>`insert into public.equipment(id,asset_id,name,category,brand,condition,tracking_type,quantity,image_url) values(${lit(uid())},${lit(tag)},'Identical Electric Drill','Power Tools','Bosch','Good','Individual',1,${lit(photo)}) returning jsonb_build_object('pid',pg_backend_pid(),'asset',to_jsonb(equipment))`;
const manual=(label,tag=null,photo=null)=>query(as(manualSQL(tag,photo)),label);
const state=()=>query(`select jsonb_build_object('equipment',(select count(*) from equipment),'imports',(select count(*) from mcpa_equipment_imports),'movements',(select count(*) from mcpa_movements),'movementAssets',(select count(*) from mcpa_movement_assets),'storage',(select count(*) from storage.objects))`);
const snapshot=()=>query(`select jsonb_build_object('equipment',(select coalesce(jsonb_agg(e order by id),'[]') from equipment e),'imports',(select coalesce(jsonb_agg(i order by operation_id),'[]') from mcpa_equipment_imports i),'movements',(select coalesce(jsonb_agg(m order by id),'[]') from mcpa_movements m),'storage',(select coalesce(jsonb_agg(s order by id),'[]') from storage.objects s))`);
const actors=Object.fromEntries(['admin','sky','architect','handler','secretary','inactive'].map(key=>[key,{id:uid(),auth:uid(),role:{sky:'engineer',handler:'tool_handler',inactive:'engineer'}[key]||key}]));
const sites={main:uid(),casa:uid(),office:uid()};
async function hold(script,label){const s=connection(script,label,dbname,true);await s.ready;return s;}
async function finish(s,commit=true){s.child.stdin.end((commit?'commit':'rollback')+';\n');return s.done;}
async function waitLocks(prefix,count){
  const deadline=Date.now()+7000;
  do{
    const value=await query(`select jsonb_build_object('sessions',coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait',wait_event,'blockers',pg_blocking_pids(pid))),'[]')) from pg_stat_activity where datname=current_database() and application_name like ${lit(prefix+'%')} and wait_event_type='Lock'`);
    if(value.sessions.length>=count){assert.ok(new Set(value.sessions.map(s=>s.pid)).size>=count);assert.ok(value.sessions.every(s=>s.blockers.length));return value.sessions;}
    await new Promise(resolve=>setTimeout(resolve,50));
  }while(Date.now()<deadline);throw Error('Independent backend lock wait not observed: '+prefix);
}
async function check(name,run){current=name;const start=Date.now();const details=await run();report.cases.push({name,status:'PASS',ms:Date.now()-start,...details});persist();console.log('PASS '+name);}
async function fails(promise,codes,pattern){let observed;await assert.rejects(promise,e=>{observed=e.code;return codes.includes(e.code)&&(!pattern||pattern.test(e.message));});return observed;}
async function fixture(){
  await execute(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    grant usage on schema public to anon,authenticated,service_role;
    create type equipment_status as enum ('AVAILABLE','IN_USE','REPAIR','MISSING','DISPOSED');
    create table profiles(id uuid primary key,name text not null);
    create table equipment(id uuid primary key,asset_id text unique not null,name text not null,category text,brand text,model text,serial_number text,condition text,tracking_type text,unit text,details text,
      quantity integer not null default 1,status equipment_status not null default 'AVAILABLE',current_holder_id uuid references profiles(id),created_at timestamptz not null default now());`);
  for(const key of ['admin','sky'])await execute(`insert into profiles values(${lit(actors[key].id)},${lit('Native '+key)})`);
  await execute(sql('1-admin/modules/sites/setup.sql'));
  await execute(`insert into sites(id,name,location,assigned_engineer) values(${lit(sites.main)},'Main Warehouse','Isolated local fixture','Native sky'),(${lit(sites.casa)},'Casa Buena','Isolated local fixture','Native sky')`);
  await execute(sql('1-admin/modules/movements/setup.sql'));
  await execute(`create schema auth;create table auth.users(id uuid primary key,email text,invited_at timestamptz,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await execute(sql('1-admin/modules/consumables/setup.sql'));
  await execute(sql('supabase/migrations/202610040001_authenticated_access.sql'));
  for(const key of ['architect','handler','secretary','inactive'])await execute(`insert into profiles(id,name) values(${lit(actors[key].id)},${lit('Native '+key)})`);
  for(const [key,a]of Object.entries(actors))await execute(`insert into auth.users(id,email,email_confirmed_at) values(${lit(a.auth)},${lit(key+'@native.invalid')},now());update profiles set auth_user_id=${lit(a.auth)},role=${lit(a.role)},account_status=${lit(key==='inactive'?'inactive':'active')} where id=${lit(a.id)}`);
  await execute(`update sites set assigned_engineer_id=${lit(actors.sky.id)} where id=${lit(sites.casa)}`);
  for(const name of ['202610060001_account_management.sql','202610060002_recipient_identity.sql','202610060003_development_accounts.sql','202610100001_engineer_portal.sql'])await execute(sql('supabase/migrations/'+name));
  await execute(`insert into sites(id,name,location,assigned_engineer) values(${lit(sites.office)},'Main Office','Native disposable receiving area','Native office')`);
  await execute(sql('supabase/migrations/202610120002_office_returns.sql').replace(/verified_office_id constant uuid := [^\r\n]*; -- OFFICE_ID_FROM_PREFLIGHT/,`verified_office_id constant uuid := ${lit(sites.office)}; -- OFFICE_ID_FROM_PREFLIGHT`));
  await execute(sql('supabase/migrations/202610120004_equipment_office_default.sql'));
  await execute(`create schema storage;grant usage on schema storage to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  await execute(sql('supabase/migrations/202610210001_equipment_photo_compatibility.sql'));
  // Pre-existing custody and photo data must survive migration and concurrent use.
  await execute(`insert into equipment(id,asset_id,name,status,current_holder_id,site_id,condition,quantity) values(${lit(uid())},'BASELINE-HELD','Existing held tool','IN_USE',${lit(actors.sky.id)},${lit(sites.casa)},'Good',1)`);
  const photo='BASELINE/'+uid()+'.png';
  await execute(as(`insert into storage.objects(bucket_id,name) values('equipment-photos',${lit(photo)});insert into equipment(id,asset_id,name,image_url) values(${lit(uid())},'BASELINE-PHOTO','Existing photo tool',${lit('storage://equipment-photos/'+photo)})`));
}
(async()=>{
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));port=listener.address().port;await new Promise(resolve=>listener.close(resolve));report.environment.port=port;
  command('initdb',['-D',data,'-U',owner,'--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+pwfile]);
  fs.appendFileSync(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=40\ndeadlock_timeout='200ms'\nlog_lock_waits=on\n`);
  command('pg_ctl',['-D',data,'-l',path.join(work,'server.log'),'-w','-t','15','start']);started=true;
  await execute('create database '+dbname,'create-disposable','postgres');
  report.environment.server=await query(`select jsonb_build_object('version',version(),'dataDirectory',current_setting('data_directory'),'address',inet_server_addr(),'isolation',current_setting('default_transaction_isolation'),'superuser',current_user)`);
  assert.equal(path.resolve(report.environment.server.dataDirectory),path.resolve(data));assert.equal(report.environment.server.address,'127.0.0.1');
  await fixture();
  const migration=sql('supabase/migrations/202610240001_equipment_import.sql');report.migrationSHA256=createHash('sha256').update(migration).digest('hex');
  const baseline=await query(`select jsonb_build_object('equipment',(select coalesce(jsonb_agg(e order by id),'[]') from equipment e),'storage',(select coalesce(jsonb_agg(s order by id),'[]') from storage.objects s))`);
  await check('latest migration installs into a fresh real PostgreSQL fixture without changing equipment/custody/photos',async()=>{
    const existing=await query(`select jsonb_build_object('rpc',to_regprocedure('public.mcpa_import_equipment(uuid,jsonb)'),'audit',to_regclass('public.mcpa_equipment_imports'),'triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid))) from pg_trigger where tgrelid='equipment'::regclass and not tgisinternal))`);
    assert.equal(existing.rpc,null);assert.equal(existing.audit,null);
    await execute(migration);
    const after=await snapshot();assert.deepEqual(after.equipment,baseline.equipment);assert.deepEqual(after.storage,baseline.storage);
    const installed=await query(`select jsonb_build_object('triggers',(select jsonb_agg(tgname order by tgname) from pg_trigger where tgrelid='equipment'::regclass and not tgisinternal))`);
    assert.deepEqual(installed.triggers,['mcpa_equipment_asset_id','mcpa_equipment_photo_guard','mcpa_new_equipment_office']);
    for(const trigger of existing.triggers){const now=await query(`select jsonb_build_object('definition',pg_get_triggerdef(oid)) from pg_trigger where tgrelid='equipment'::regclass and tgname=${lit(trigger.name)}`);assert.equal(now.definition,trigger.definition);}
    return {triggers:installed.triggers};
  });
  await check('independent concurrent manual and bulk registrations share the allocator without collisions',async()=>{
    const first=await hold('begin;'+identity()+manualSQL()+';','mixed-holder');
    const before=await state();
    const proposed='T-'+uid().replaceAll('-','').slice(0,16).toUpperCase();
    const concurrent=[manual('mixed-wait-manual-1'),manual('mixed-wait-manual-2',proposed),imported(uid(),rows(25),'mixed-wait-import-1'),imported(uid(),rows(25),'mixed-wait-import-2')];
    const waits=await waitLocks('mixed-wait-',4);await finish(first);
    const results=await Promise.all(concurrent);assert.equal(new Set(results.map(r=>r.pid)).size,4);
    assert.equal(results[1].asset.asset_id,proposed,'The current manual browser-proposed tag remains unchanged during concurrent imports');
    const ids=results.flatMap(r=>r.asset?[r.asset.asset_id]:r.value.assets.map(a=>a.asset_id));assert.equal(new Set(ids).size,52);assert.ok(ids.every(id=>/^T-[A-F0-9]{16}$/.test(id)));
    for(const r of results.filter(r=>r.value))assert.deepEqual(r.value.assets.map(a=>a.quantity),rows(25).map(r=>r.quantity),'Individual and Bulk rows retain their quantities without expansion');
    const after=await state();assert.equal(after.equipment-before.equipment,53);assert.equal(after.imports-before.imports,2);
    return {independentBackends:results.map(r=>r.pid),observedWaits:waits,created:53,trackingTypes:['Individual (1)','Bulk (5 Pieces, one record)']};
  });
  await check('simultaneous same-operation retries return exactly one committed import and receipt',async()=>{
    const operation=uid(),batch=rows(7),before=await state();
    const first=await hold('begin;'+identity()+rpcSQL(operation,batch)+';','retry-holder');
    const pending=Array.from({length:4},(_,i)=>imported(operation,batch,'retry-wait-'+i));
    const waits=await waitLocks('retry-wait-',4);await finish(first);const responses=await Promise.all(pending);
    for(const r of responses)assert.deepEqual(r.value,responses[0].value);
    assert.equal(new Set(responses.map(r=>r.pid)).size,4);const after=await state();assert.equal(after.equipment-before.equipment,7);assert.equal(after.imports-before.imports,1);
    return {created:7,receipts:1,waits};
  });
  await check('distinct simultaneous operations preserve identical physical-tool names as separate assets',async()=>{
    const before=await state(),results=await Promise.all(Array.from({length:3},(_,i)=>imported(uid(),rows(10),'distinct-'+i)));
    assert.equal(new Set(results.map(r=>r.pid)).size,3);assert.equal(new Set(results.flatMap(r=>r.value.assets.map(a=>a.asset_id))).size,30);
    assert.ok(results.every(r=>r.value.assets.every(a=>a.name==='Identical Electric Drill')));const after=await state();assert.equal(after.equipment-before.equipment,30);assert.equal(after.imports-before.imports,3);return {created:30,receipts:3};
  });
  await check('invalid later row rolls back all equipment and receipt; corrected operation can retry',async()=>{
    const operation=uid(),before=await snapshot();
    await fails(imported(operation,[row(),row(3,{quantity:0})],'invalid'),['22023'],/Spreadsheet row 3.*No rows were imported/);
    assert.deepEqual(await snapshot(),before);assert.equal((await imported(operation,rows(2),'invalid-recovery')).value.created,2);
  });
  await check('Admin-only import and direct Office/custody policies reject unauthorized writes atomically',async()=>{
    const before=await snapshot();
    const role=await query(as(`select jsonb_build_object('role',current_user,'bypassRLS',(select rolbypassrls from pg_roles where rolname=current_user))`));
    assert.deepEqual(role,{role:'authenticated',bypassRLS:false});
    for(const actor of ['sky','architect','handler','secretary','inactive','anon'])await fails(imported(uid(),rows(1),'unauthorized-'+actor,actor),['42501']);
    for(const extra of [`site_id=${lit(sites.casa)}`,`current_holder_id=${lit(actors.sky.id)}`,`status='IN_USE'`]){
      const [column,value]=extra.split('=');await fails(execute(as(`insert into equipment(id,name,asset_id,${column}) values(${lit(uid())},'Forged',null,${value})`)),['42501']);
    }
    await fails(execute(as(`update equipment set current_holder_id=${lit(actors.admin.id)} where asset_id='BASELINE-HELD'`)),['42501']);
    assert.deepEqual(await snapshot(),before);
  });
  await check('existing photo and Office triggers accept valid manual photos and reject invalid references',async()=>{
    const tag='T-'+uid().replaceAll('-','').slice(0,16).toUpperCase(),photo=tag+'/'+uid()+'.png';
    await execute(as(`insert into storage.objects(bucket_id,name) values('equipment-photos',${lit(photo)})`));
    const saved=await manual('manual-photo',tag,'storage://equipment-photos/'+photo);assert.equal(saved.asset.asset_id,tag);assert.equal(saved.asset.site_id,sites.office);assert.equal(saved.asset.current_holder_id,null);
    const before=await snapshot();await fails(manual('bad-photo',null,'storage://equipment-photos/INVALID/'+uid()+'.png'),['22023'],/valid uploaded equipment photo/);
    await fails(imported(uid(),[row(2,{image_url:'forged'})],'import-photo-forgery'),['22023'],/Unsupported column/);assert.deepEqual(await snapshot(),before);
  });
  await check('imported assets complete the existing request/release/tested receipt/return custody workflow',async()=>{
    const value=(await imported(uid(),rows(1),'custody-import')).value,tag=value.assets[0].asset_id;
    const action=async(actor,name,payload)=>(await query(as(`select jsonb_build_object('value',public.mcpa_movement_action(${lit(name)},${json(payload)},${lit(uid())}))`,actor),'custody-'+name)).value;
    const req=await action('sky','createRequest',{toolIds:[tag],destination:'Casa Buena',purpose:'Native concurrency verification'});
    await action('admin','approveRequest',{id:req.id});await action('admin','releaseRequest',{id:req.id});
    const snapshot=(await query(as(`select jsonb_build_object('value',public.mcpa_movement_snapshot())`,'sky'))).value,transfer=snapshot.transfers.find(t=>t.requestId===req.id);
    await action('sky','receiveTransfer',{id:transfer.id,inspections:[{toolId:tag,condition:'good',tested:true,notes:'Native local test'}]});
    await action('sky','createReturn',{toolIds:[tag],conditions:[{toolId:tag,condition:'good',notes:''}],notes:'Inspected local return'});
    const end=await query(`select to_jsonb(e) from equipment e where asset_id=${lit(tag)}`);assert.equal(end.status,'AVAILABLE');assert.equal(end.site_id,sites.office);assert.equal(end.current_holder_id,null);
  });
  await check('allocator contention exposes lock_timeout and retry restores exactly one import',async()=>{
    const h=await hold("begin;select pg_advisory_xact_lock(hashtextextended('mcpa:equipment-asset-id',0));",'timeout-allocator-holder');
    const operation=uid(),before=await snapshot();
    await fails(imported(operation,rows(2),'timeout-allocator','admin',"set local lock_timeout='250ms';"),['22023'],/lock timeout/);
    await fails(execute(as(manualSQL(),'admin',"set local lock_timeout='250ms';"),'timeout-manual'),['55P03'],/lock timeout/);
    assert.deepEqual(await snapshot(),before);await finish(h);
    const result=await imported(operation,rows(2),'timeout-allocator-retry');assert.equal(result.value.created,2);
    assert.deepEqual((await imported(operation,rows(2),'timeout-allocator-replay')).value,result.value);
    return {importSQLSTATE:'22023 (row error wraps 55P03)',manualSQLSTATE:'55P03',lockTimeoutMs:250};
  });
  await check('operation lock_timeout preserves leader result and same-operation retry recovery',async()=>{
    const operation=uid(),batch=rows(3),before=await state();const h=await hold('begin;'+identity()+rpcSQL(operation,batch)+';','operation-timeout-holder');
    await fails(imported(operation,batch,'operation-timeout','admin',"set local lock_timeout='250ms';"),['55P03'],/lock timeout/);
    assert.deepEqual(await state(),before);await finish(h);const recovered=await imported(operation,batch,'operation-timeout-retry');assert.equal(recovered.value.created,3);
    const after=await state();assert.equal(after.equipment-before.equipment,3);assert.equal(after.imports-before.imports,1);return {SQLSTATE:'55P03',created:3,receipts:1};
  });
  await check('statement timeout during allocator wait rolls back and safely retries',async()=>{
    const h=await hold("begin;select pg_advisory_xact_lock(hashtextextended('mcpa:equipment-asset-id',0));",'statement-holder'),operation=uid(),before=await snapshot();
    await fails(imported(operation,rows(1),'statement-timeout','admin',"set local statement_timeout='250ms';"),['57014'],/statement timeout/);
    assert.deepEqual(await snapshot(),before);await finish(h);assert.equal((await imported(operation,rows(1),'statement-retry')).value.created,1);return {SQLSTATE:'57014'};
  });
  await check('disconnect before commit releases operation/allocator locks and waiting retry commits once',async()=>{
    const operation=uid(),batch=rows(4),before=await state(),h=await hold('begin;'+identity()+rpcSQL(operation,batch)+';','disconnect-holder');
    const retry=imported(operation,batch,'disconnect-wait');const waits=await waitLocks('disconnect-wait',1);h.child.kill();await h.done.catch(()=>{});
    assert.equal((await retry).value.created,4);const after=await state();assert.equal(after.equipment-before.equipment,4);assert.equal(after.imports-before.imports,1);return {waits,created:4,receipts:1};
  });
  await check('repeatable-read stale snapshot conflict rolls back; a fresh retry returns the committed receipt',async()=>{
    const operation=uid(),batch=rows(2),before=await state(),h=await hold('begin;'+identity()+rpcSQL(operation,batch)+';','rr-holder');
    const retry=imported(operation,batch,'rr-wait','admin','set transaction isolation level repeatable read;');const rejected=fails(retry,['23505','40001']);
    const waits=await waitLocks('rr-wait',1);await finish(h);const observedSQLSTATE=await rejected;
    const after=await state();assert.equal(after.equipment-before.equipment,2);assert.equal(after.imports-before.imports,1);assert.equal((await imported(operation,batch,'rr-fresh')).value.created,2);return {waits,observedSQLSTATE};
  });
  await check('final integrity: all generated tags unique, receipts reference real UUID/tag pairs, baseline custody/photos unchanged',async()=>{
    const end=await snapshot();assert.deepEqual(end.equipment.filter(e=>e.asset_id.startsWith('BASELINE-')),baseline.equipment);
    const integrity=await query(`select jsonb_build_object('total',(select count(*) from equipment),'distinctTags',(select count(distinct asset_id) from equipment),'generated',(select count(*) from equipment where asset_id ~ '^T-[A-F0-9]{16}$'),'receipts',(select count(*) from mcpa_equipment_imports),'badReceiptReferences',(select count(*) from mcpa_equipment_imports i cross join lateral jsonb_array_elements(i.result->'assets') a left join equipment e on e.id=(a->>'id')::uuid and e.asset_id=a->>'asset_id' where e.id is null),'pendingLocks',(select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'))`);
    assert.equal(integrity.total,integrity.distinctTags);assert.equal(integrity.badReceiptReferences,0);assert.equal(integrity.pendingLocks,0);report.observations.integrity=integrity;return integrity;
  });
  report.status='PASS';
})().catch(error=>{report.status=started?'FAIL':'BLOCKED';report.cases.push({name:current,status:report.status,error:error.message,SQLSTATE:error.code});console.error(report.status+' '+current+': '+error.message);process.exitCode=started?1:2;}).finally(async()=>{
  for(const s of sessions)s.child.kill();await Promise.allSettled([...sessions].map(s=>s.done));
  if(started){try{command('pg_ctl',['-D',data,'-m','fast','-w','-t','15','stop']);report.stopped=true;}catch(e){report.stopped=false;report.shutdownError=e.message;process.exitCode=1;report.status='FAIL';}}
  report.finishedAt=new Date().toISOString();persist();console.log('RESULT '+report.status+' '+report.cases.filter(t=>t.status==='PASS').length+' passed; cluster stopped='+report.stopped);console.log('Artifacts '+output);
});
