const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/equipment-tracking.js'), 'utf8');
function harness(db = {}) {
  const window = new EventTarget(), document = new EventTarget();
  window.supabaseClient = db;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/display.js'),'utf8'), {window});
  const timers = new Map(), intervals = new Map(); let id = 0;
  vm.runInNewContext(source, {window, document,
    setTimeout(fn) {timers.set(++id,fn); return id;}, clearTimeout(id) {timers.delete(id);},
    setInterval(fn,ms) {intervals.set(++id,{fn,ms});return id;}, clearInterval(id) {intervals.delete(id);}});
  return {api:window.EquipmentTracking, window, document, timers, intervals, async flush() {const list=[...timers.values()];timers.clear();for(const fn of list)await fn();}};
}
test('request availability follows condition and custody, never location alone', () => {
  const {api} = harness();
  for (const status of ['IN_USE','inuse','In Use']) assert.equal(api.availability({site_id:'project',status}), 'Deployed');
  assert.equal(api.availability({site_id:null,status:'IN_USE'}), 'Deployed');
  assert.equal(api.availability({site_id:'project',status:'IN_OFFICE'}), 'Unavailable');
  assert.equal(api.availability({site_id:'project',status:'AVAILABLE'}), 'Available');
  assert.equal(api.availability({site_id:'project',status:'REPAIR'}), 'Unavailable');
  assert.equal(api.availability({site_id:null,site:'Unassigned',status:'MISSING'}), 'Unavailable');
  assert.equal(api.availability({siteId:null,site:'Unassigned',status:'IN_USE'}), 'Deployed');
  assert.equal(api.matchesStatus({site_id:'p',status:'AVAILABLE'}, 'Available'), true);
  assert.equal(api.matchesStatus({site_id:'p',status:'IN_OFFICE'}, 'Available'), false);
  assert.equal(api.matchesStatus({site_id:'p',status:'REPAIR'}, 'For Repair'), true);
});
test('tallies sum eligible quantities and preserve deployed custody counts', () => {
  const {api} = harness();
  const result = api.tally([{quantity:4,site_id:null,status:'AVAILABLE'}, {qty:7,siteId:'p',status:'inuse'}, {quantity:0,site_id:null}, {quantity:2,site_id:'p',status:'AVAILABLE',current_holder_id:'person'}]);
  assert.equal(result.total,13); assert.equal(result.available,4); assert.equal(result.deployed,7);
});
test('asset presentation counts positive records without changing quantities or availability', () => {
  const {api} = harness();
  const tools = [{qty:7,status:'AVAILABLE'}, {qty:3,status:'IN_USE'}, {qty:0,status:'AVAILABLE'}];
  const before = JSON.stringify(tools), assets = api.tally(tools, undefined, {assetsOnly:true});
  assert.equal(assets.total,2); assert.equal(assets.available,1); assert.equal(assets.deployed,1);
  assert.equal(api.tally(tools).total,10);
  assert.equal(JSON.stringify(tools),before);
});
test('Office metadata uses the authenticated RPC on every call and fails closed', async () => {
  let calls=0, response={data:{id:'11111111-1111-4111-8111-111111111111',name:'Configured warehouse',label:'Office'}};
  const {api,window}=harness({async rpc(name){assert.equal(name,'mcpa_inventory_office');calls++;return response;}});
  let person={id:'admin-1',role:'admin'};
  window.MCPAAuth={requireLive:()=>person};
  assert.equal((await api.inventoryOffice()).name,'Configured warehouse','No site-name inference');
  response={error:{message:'Inactive Office'}};
  await assert.rejects(api.inventoryOffice(),/Office inventory configuration is unavailable/);
  assert.equal(calls,2,'A previous successful lookup must not mask a disabled Office');
  response={data:{id:'not-a-uuid',label:'Office'}};
  await assert.rejects(api.inventoryOffice(),/configuration is unavailable/);
  person={id:'secretary-1',role:'secretary'};
  await assert.rejects(api.inventoryOffice(),/Equipment access required/);
  assert.equal(calls,3,'Unauthorized metadata read rejected before calling transport');
});
test('stock requests exclude hidden reservations, pending/refused transfers, damage and holders',()=>{
  const {api,window}=harness();
  const base={id:'T-8861',status:'AVAILABLE',qty:1,siteId:'project',holderId:null,condition:'Good',movementLock:null};
  window.MCPAAuth={isDemo:false,profile:{role:'engineer',id:'other'}};
  assert.equal(api.requestability(base).eligible,true);
  for(const [change,code] of [[{movementLock:'request'},'reserved'],[{movementLock:'transfer'},'transfer'],[{holderId:'holder'},'assigned'],[{condition:'Damaged'},'damaged'],[{status:'MISSING'},'missing'],[{status:'REPAIR'},'damaged'],[{status:'DISPOSED'},'retired'],[{qty:0},'empty'],[{is_active:false},'inactive'],[{recordedStatus:'IN_OFFICE'},'status']]){
    const tool={...base,...change};assert.equal(api.requestability(tool).code,code);assert.equal(api.availability(tool),'Unavailable');
  }
  for(const status of ['pending','refused'])assert.equal(api.requestability(base,{transfers:[{status,toolIds:[base.id]}]}).code,'transfer');
  assert.equal(api.requestability(base,{requests:[{status:'approved',toolIds:[base.id]}]}).code,'reserved');
  assert.equal(api.requestability(base,{requests:[{status:'released',toolIds:[base.id]}]}).code,'transfer','A released request protects stock even when its transfer is missing from the scoped list');
  assert.match(api.requestability({...base,movementLock:'transfer'}).label,/Pending receipt/);
  assert.equal(api.requestability(base,{availabilityError:true}).code,'unknown','Previously verified stock fails closed after a refresh error');
  assert.equal(api.requestability(base,{requests:[{status:'pending',toolIds:[base.id]}],transfers:[{status:'received',toolIds:[base.id]}]}).eligible,true);
  const old={...base};delete old.movementLock;
  assert.equal(api.requestability(old,{requests:[],transfers:[]}).code,'unknown','Scoped movements cannot prove a stock item is unlocked');
  window.MCPAAuth.profile.role='admin';assert.equal(api.requestability(old,{availabilityLoaded:true,requests:[],transfers:[]}).code,'unknown','A full movement list still cannot rule out a stale reservation row');
  assert.match(api.statusMarkup({...base,movementLock:'request'}),/Recorded status[\s\S]*Available[\s\S]*New requests[\s\S]*Reserved/);
});
test('paged reads respect the actual response cap and active-project query', async () => {
  const filters=[];
  const {api}=harness({from(table) {
    let start=0, filter;
    const rows=table==='equipment' ? [{id:'1',asset_id:'DRILL',site_id:'a',quantity:2,status:'IN_USE',image_url:'/drill.png'}, {id:'2',asset_id:'ZERO',site_id:'a',quantity:0}] : table==='sites' ? [{id:'a',name:'Active',is_active:true},{id:'b',name:'Archived',is_active:false}] : [];
    return {select(){return this;},order(){return this;},eq(key,value){filter=[key,value];filters.push([table,key,value]);return this;},range(offset){start=offset;return this;},then(resolve){const visible=filter?rows.filter(r=>r[filter[0]]===filter[1]):rows;return Promise.resolve({data:visible.slice(start,start+1),count:visible.length}).then(resolve);}};
  }});
  const data=await api.snapshot();
  assert.equal(data.tools.length,2);assert.equal(data.activeProjects.length,1);
  assert.equal(data.tools[0].image_url,'/drill.png');assert.equal(data.tools[0].site,'Active');
  assert.deepEqual(filters,[['sites','is_active',true]]);
});
test('realtime watches both tables, coalesces bursts, and removes its channel on disposal', async () => {
  const listeners=[]; let subscribed, removed=0, reads=0;
  const channel={on(type,filter,fn){listeners.push({type,filter,fn});return this;},subscribe(fn){subscribed=fn;return this;}};
  const h=harness({channel(){return channel;},removeChannel(value){assert.equal(value,channel);removed++;}});
  const stop=h.api.watch(async()=>{reads++;});
  assert.deepEqual(listeners.map(l=>l.filter.table),['equipment','sites']);
  listeners[0].fn();listeners[1].fn();await h.flush();assert.equal(reads,1);
  subscribed('SUBSCRIBED');await h.flush();assert.equal(reads,2);
  stop();listeners[0].fn();await h.flush();assert.equal(reads,2);assert.equal(removed,1);
});
test('changes arriving during an in-flight reload trigger a follow-up read', async () => {
  let change, release, reads=0;
  const channel={on(type,filter,fn){change=fn;return this;},subscribe(){return this;}};
  const h=harness({channel(){return channel;},removeChannel(){}});
  const stop=h.api.watch(()=>{reads++;return reads===1?new Promise(r=>{release=r;}):Promise.resolve();});
  change();const first=h.flush();change();await h.flush();release();await first;await h.flush();
  assert.equal(reads,2);stop();
});

test('30-second fallback pauses when hidden, retries on return/online, and clears errors after recovery', async()=>{
  const h=harness();let offline=true,reads=0;const statuses=[];
  const stop=h.api.watch(async()=>{reads++;if(offline)throw new Error('Offline fixture');},message=>statuses.push(message));
  assert.equal([...h.intervals.values()][0].ms,30000);
  [...h.intervals.values()][0].fn();await h.flush();assert.equal(reads,1);assert.match(statuses.at(-1),/Unable to sync/);
  h.document.hidden=true;[...h.intervals.values()][0].fn();h.window.dispatchEvent(new Event('focus'));await h.flush();assert.equal(reads,1);
  h.document.hidden=false;offline=false;h.document.dispatchEvent(new Event('visibilitychange'));h.window.dispatchEvent(new Event('online'));await h.flush();assert.equal(reads,2);assert.equal(statuses.at(-1),'');
  stop();assert.equal(h.intervals.size,0);h.window.dispatchEvent(new Event('online'));await h.flush();assert.equal(reads,2);
});

test('account watcher subscribes only to its readable audit table and deduplicates table names',()=>{
  const tables=[];const channel={on(_event,filter){tables.push(filter.table);return this;},subscribe(){return this;}};
  const h=harness({channel(){return channel;},removeChannel(){}});
  const stop=h.api.watch(async()=>{},()=>{},{tables:['mcpa_account_audit','mcpa_account_audit']});
  assert.deepEqual(tables,['mcpa_account_audit']);stop();
});
