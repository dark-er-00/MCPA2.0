// Native PostgreSQL only. Creates its own fresh temporary cluster, random port,
// local credentials and database. Never accepts a connection URL or existing DB.
// Usage: node tests/individual-import-expansion-v2/postgres-concurrency.cjs <portable-pg-bin>
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),cp=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const combined=process.argv.includes('--combined');
const root=path.resolve(__dirname,'../..'),output=path.join(root,combined?'documentation/integration-quantity-custody-v2/native':'documentation/workstream-a/postgres-concurrency');
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
const row=(source_row=2,extra={})=>({source_row,name:'Identical Electric Drill',category:'Power Tools',brand:'Bosch',model:'',serial_number:'',condition:'Good',tracking_type:'Individual',quantity:1,...extra});
const rows=n=>Array.from({length:n},(_,i)=>row(i+2,i%2?{tracking_type:'Bulk',quantity:5,unit:'Pieces'}:{}));
const rpcSQL=(operation,batch)=>`select jsonb_build_object('pid',pg_backend_pid(),'value',public.mcpa_import_equipment_v2(${lit(operation)}::uuid,${json(batch)}))`;
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
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  await execute(sql('supabase/migrations/202610210001_equipment_photo_compatibility.sql'));
  // Pre-existing custody and photo data must survive migration and concurrent use.
  await execute(`insert into equipment(id,asset_id,name,status,current_holder_id,site_id,condition,quantity) values(${lit(uid())},'BASELINE-HELD','Existing held tool','IN_USE',${lit(actors.sky.id)},${lit(sites.casa)},'Good',1)`);
  const photo='BASELINE/'+uid()+'.png';
  await execute(as(`insert into storage.objects(bucket_id,name) values('equipment-photos',${lit(photo)});insert into equipment(id,asset_id,name,image_url) values(${lit(uid())},'BASELINE-PHOTO','Existing photo tool',${lit('storage://equipment-photos/'+photo)})`));
}
const waSQL=(name,argumentsSQL='')=>`select jsonb_build_object('pid',pg_backend_pid(),'value',public.${name}(${argumentsSQL}))`;
const wa=(name,argumentsSQL='',label='workstream',actor='admin')=>query(as(waSQL(name,argumentsSQL),actor),label);
const array=ids=>'array['+ids.map(id=>lit(id)+'::uuid').join(',')+']';
const allocateSQL=(request,assets,operation=uid())=>waSQL('mcpa_wa_allocate_equipment',`${lit(operation)}::uuid,${lit(request)}::uuid,${array(assets)}`);
const issueSQL=(request,line,quantity,operation=uid())=>waSQL('mcpa_wa_issue_consumables',`${lit(operation)}::uuid,${lit(request)}::uuid,${json([{item_id:line,quantity}])},null`);
const nativeState=()=>query(`select jsonb_build_object('equipment',(select count(*) from equipment),'imports',(select count(*) from mcpa_equipment_imports),'expansions',(select count(*) from mcpa_wa_import_operations),'reservations',(select count(*) from mcpa_movement_reservations),'issues',(select count(*) from mcpa_wa_material_issues),'usage',(select count(*) from consumable_stock_movements where kind='usage'))`);
async function equipmentRequests(label){
  const items=(await imported(uid(),[row(2,{name:label,quantity:2})],label+'-seed')).value.assets;
  const catalog=(await wa('mcpa_wa_equipment_catalog','',label+'-catalog','sky')).value;
  const type=catalog.groups.find(g=>g.name===label).type_id;
  const requests=[];
  for(let i=0;i<2;i++)requests.push((await wa('mcpa_wa_submit_equipment',`${lit(uid())}::uuid,${lit(type)},${lit(sites.casa)}::uuid,2,''`,label+'-request-'+i,'sky')).value);
  return {items,requests};
}
async function materialRequests(label,opening,quantity,count=1){
  const item=(await wa('consumables_save_item',`${lit(uid())}::uuid,null,${lit(label)},'bags',1,${opening},'Masonry & Carpentry','Native fixture',null`,label+'-seed')).value;
  const requests=[];
  for(let i=0;i<count;i++){
    const request=(await wa('mcpa_wa_submit_consumables',`${lit(uid())}::uuid,${lit(sites.casa)}::uuid,'Native fixture',${json([{consumable_id:item.id,quantity,unit:item.unit}])}`,label+'-request-'+i,'sky')).value;
    await wa('mcpa_wa_review_consumables',`${lit(uid())}::uuid,${lit(request.id)}::uuid,'approve',${json([{item_id:request.items[0].id,quantity}])},'Native fixture approval'`,label+'-review-'+i);
    requests.push(request);
  }
  return {item,requests};
}
(async()=>{
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));port=listener.address().port;await new Promise(resolve=>listener.close(resolve));report.environment.port=port;
  command('initdb',['-D',data,'-U',owner,'--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+pwfile]);
  fs.appendFileSync(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=40\ndeadlock_timeout='200ms'\nlog_lock_waits=on\n`);
  command('pg_ctl',['-D',data,'-l',path.join(work,'server.log'),'-w','-t','15','start']);started=true;
  await execute('create database '+dbname,'create-disposable','postgres');
  report.environment.server=await query(`select jsonb_build_object('version',version(),'dataDirectory',current_setting('data_directory'),'address',inet_server_addr(),'isolation',current_setting('default_transaction_isolation'))`);
  assert.equal(path.resolve(report.environment.server.dataDirectory),path.resolve(data));assert.equal(report.environment.server.address,'127.0.0.1');
  await fixture();
  const baseline=await query(`select jsonb_build_object('equipment',(select coalesce(jsonb_agg(e order by id),'[]') from equipment e),'storage',(select coalesce(jsonb_agg(s order by id),'[]') from storage.objects s),'movements',(select coalesce(jsonb_agg(m order by id),'[]') from mcpa_movements m))`);
  await check('additive migration installs without altering existing equipment, custody, photos or legacy movements',async()=>{
    for(const name of ['202610240001_equipment_import.sql','202610120003_optional_request_purpose.sql','202610200001_verified_request_inventory.sql','202610220000_consumable_categories.sql','202610220001_consumables_skus.sql','202610220002_consumables_archive.sql','202610250001_quantity_material_requests.sql']){
      const migration=sql('supabase/migrations/'+name);await execute(migration,'install-'+name);
      if(name==='202610250001_quantity_material_requests.sql')report.migrationSHA256=createHash('sha256').update(migration).digest('hex');
    }
    if(combined)for(const name of ['202610100004_movement_cancellation.sql','202610100006_monitoring.sql','202610250002_custody_lifecycle.sql','202610250003_quantity_custody_integration.sql'])await execute(sql('supabase/migrations/'+name),'combined-install-'+name);
    const after=await snapshot();assert.deepEqual(after.equipment,baseline.equipment);assert.deepEqual(after.storage,baseline.storage);assert.deepEqual(after.movements,baseline.movements);
  });
  await check('simultaneous Individual expansion retries commit one physical set and one pair of immutable receipts',async()=>{
    const operation=uid(),batch=[row(7,{quantity:20}),row(19,{name:'GI Pipes',tracking_type:'Bulk',quantity:225,unit:'Pieces'})],before=await nativeState();
    const leader=await hold('begin;'+identity()+rpcSQL(operation,batch)+';','wa-import-holder');
    const pending=Array.from({length:3},(_,i)=>imported(operation,batch,'wa-import-wait-'+i));
    const waits=await waitLocks('wa-import-wait-',3);await finish(leader);const responses=await Promise.all(pending);
    assert.equal(new Set(responses.map(r=>r.pid)).size,3);for(const r of responses)assert.deepEqual(r.value,responses[0].value);
    const result=responses[0].value;assert.equal(result.created,21);assert.equal(result.spreadsheet_rows,2);assert.equal(result.expanded_records,21);
    assert.deepEqual(result.assets.slice(0,20).map(a=>[a.source_row,a.expansion_index,a.quantity]),Array.from({length:20},(_,i)=>[7,i+1,1]));
    assert.equal(new Set(result.assets.map(a=>a.asset_id)).size,21);assert.equal(result.assets.at(-1).source_row,19);assert.equal(result.assets.at(-1).quantity,225);
    const after=await nativeState();assert.equal(after.equipment-before.equipment,21);assert.equal(after.imports-before.imports,1);assert.equal(after.expansions-before.expansions,1);
    return {waits,independentBackends:responses.map(r=>r.pid),created:21};
  });
  await check('two quantity requests competing for the same physical assets have one allocation winner',async()=>{
    const {items,requests}=await equipmentRequests('Native competing shovels'),assets=items.map(a=>a.id),before=await nativeState();
    const leader=await hold('begin;'+identity()+allocateSQL(requests[0].id,assets)+';','wa-allocate-holder');
    const contender=query(as(allocateSQL(requests[1].id,assets)),'wa-allocate-wait');const rejected=fails(contender,['40001'],/unavailable|incompatible/);
    const waits=await waitLocks('wa-allocate-wait',1);await finish(leader);await rejected;
    const after=await nativeState();assert.equal(after.reservations-before.reservations,2);
    const statuses=await query(`select jsonb_build_object('statuses',jsonb_agg(status order by status),'movements',count(movement_id)) from mcpa_wa_equipment_requests where id in (${requests.map(r=>lit(r.id)).join(',')})`);
    assert.deepEqual(statuses.statuses,['approved','pending']);assert.equal(statuses.movements,1);return {waits,reservedPhysicalAssets:2};
  });
  await check('legacy and quantity approvals share the same authoritative reservation lock',async()=>{
    const {items,requests}=await equipmentRequests('Native legacy conflict'),assets=items.map(a=>a.id),before=await nativeState();
    const legacy=(await wa('mcpa_movement_action',`'createRequest',${json({toolIds:items.map(a=>a.asset_id),destination:'Casa Buena',purpose:'Native mixed race'})},${lit(uid())}::uuid`,'legacy-create','sky')).value;
    const leader=await hold('begin;'+identity()+allocateSQL(requests[0].id,assets)+';','wa-mixed-holder');
    const contender=wa('mcpa_movement_action',`'approveRequest',${json({id:legacy.id})},${lit(uid())}::uuid`,'wa-mixed-wait');
    const rejected=fails(contender,['P0001','40001','23505'],/reserved|unavailable/);const waits=await waitLocks('wa-mixed-wait',1);await finish(leader);await rejected;
    const after=await nativeState();assert.equal(after.reservations-before.reservations,2);return {waits,reservedPhysicalAssets:2};
  });
  await check('simultaneous same-operation material issuance deducts stock exactly once',async()=>{
    const {item,requests:[request]}=await materialRequests('Native duplicate cement',10,6),operation=uid(),statement=issueSQL(request.id,request.items[0].id,6,operation),before=await nativeState();
    const leader=await hold('begin;'+identity()+statement+';','wa-issue-retry-holder');
    const pending=Array.from({length:3},(_,i)=>query(as(statement),'wa-issue-retry-wait-'+i));
    const waits=await waitLocks('wa-issue-retry-wait-',3);await finish(leader);const responses=await Promise.all(pending);
    assert.equal(new Set(responses.map(r=>r.pid)).size,3);for(const r of responses)assert.deepEqual(r.value,responses[0].value);
    const after=await nativeState();assert.equal(after.issues-before.issues,1);assert.equal(after.usage-before.usage,1);
    const stock=await query(`select jsonb_build_object('stock',current_stock) from consumables where id=${lit(item.id)}`);assert.equal(stock.stock,4);return {waits,issues:1,stock:4};
  });
  await check('independent approved material requests cannot overspend one stock record',async()=>{
    const {item,requests}=await materialRequests('Native scarce cement',5,4,2),before=await nativeState();
    const leader=await hold('begin;'+identity()+issueSQL(requests[0].id,requests[0].items[0].id,4)+';','wa-stock-holder');
    const contender=query(as(issueSQL(requests[1].id,requests[1].items[0].id,4)),'wa-stock-wait');
    const rejected=fails(contender,['40001'],/available active stock/);const waits=await waitLocks('wa-stock-wait',1);await finish(leader);await rejected;
    const after=await nativeState();assert.equal(after.issues-before.issues,1);assert.equal(after.usage-before.usage,1);
    const stock=await query(`select jsonb_build_object('stock',current_stock) from consumables where id=${lit(item.id)}`);assert.equal(stock.stock,1);
    const statuses=await query(`select jsonb_build_object('statuses',jsonb_agg(status order by status)) from mcpa_wa_material_requests where id in (${requests.map(r=>lit(r.id)).join(',')})`);
    assert.deepEqual(statuses.statuses,['approved','issued']);return {waits,issues:1,stock:1};
  });
  if(combined)await require('../integration-quantity-custody-v2/native-cases.cjs').run({check,execute,query,wa,as,identity,hold,finish,waitLocks,fails,parse,imported,row,lit,json,uid,actors,sites,equipmentRequests,allocateSQL});
  await check('final integrity preserves baseline data and all receipts reference authoritative equipment and stock movements',async()=>{
    const end=await snapshot();assert.deepEqual(end.equipment.filter(e=>e.asset_id.startsWith('BASELINE-')),baseline.equipment);assert.deepEqual(end.storage.filter(s=>baseline.storage.some(b=>b.id===s.id)),baseline.storage);
    const integrity=await query(`select jsonb_build_object('equipment',(select count(*) from equipment),'distinctTags',(select count(distinct asset_id) from equipment),'badImportReferences',(select count(*) from mcpa_wa_import_operations i cross join lateral jsonb_array_elements(i.result->'assets') a left join equipment e on e.id=(a->>'id')::uuid and e.asset_id=a->>'asset_id' where e.id is null),'badIssueReferences',(select count(*) from mcpa_wa_material_issues i left join consumable_stock_movements m on m.id=i.stock_movement_id where m.id is null or m.quantity_change>=0),'negativeStock',(select count(*) from consumables where current_stock<0),'waitingLocks',(select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'))`);
    assert.equal(integrity.equipment,integrity.distinctTags);assert.equal(integrity.badImportReferences,0);assert.equal(integrity.badIssueReferences,0);assert.equal(integrity.negativeStock,0);assert.equal(integrity.waitingLocks,0);report.observations.integrity=integrity;return integrity;
  });
  report.status='PASS';
})().catch(error=>{report.status=started?'FAIL':'BLOCKED';report.cases.push({name:current,status:report.status,error:error.message,SQLSTATE:error.code});console.error(report.status+' '+current+': '+error.message);process.exitCode=started?1:2;}).finally(async()=>{
  for(const s of sessions)s.child.kill();await Promise.allSettled([...sessions].map(s=>s.done));
  if(started){try{command('pg_ctl',['-D',data,'-m','fast','-w','-t','15','stop']);report.stopped=true;}catch(e){report.stopped=false;report.shutdownError=e.message;process.exitCode=1;report.status='FAIL';}}
  report.finishedAt=new Date().toISOString();persist();console.log('RESULT '+report.status+' '+report.cases.filter(t=>t.status==='PASS').length+' passed; cluster stopped='+report.stopped);console.log('Artifacts '+output);
});
