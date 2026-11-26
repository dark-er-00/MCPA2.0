// Isolated UI model. Plain JavaScript only: no SQL, database driver or upstream service.
const {randomUUID}=require('node:crypto');
const clone=value=>structuredClone(value);
exports.createFixture=({adminReview=false,fieldReview=false,projectReview=false}={})=>{
 const uuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const actors=Object.fromEntries([
  ['admin','Synthetic Admin','admin'],['admin2','Synthetic Second Admin','admin'],
  ['sky','Engr Sky','engineer'],['pau','Engr Pau','engineer'],
  ['unassigned','Synthetic Unassigned Engineer','engineer'],['architect','Synthetic Architect','architect'],
  ['handler','Synthetic Tool Handler','tool_handler'],['secretary','Synthetic Secretary','secretary']
 ].map(([key,name,role],i)=>[key,{id:uuid(i+1),name,role,account_status:'active',email:key+'@synthetic.invalid',username:key}]));
 const site=(n,name,person)=>({id:uuid(n),name,location:'Synthetic preview location',assigned_engineer_id:person?.id||null,assigned_engineer:person?.name||'Unassigned',is_active:true,archived_at:null,phase:'Structural',current_work_area:'Structural',project_stage:'Construction Phase',progress:15,status:'active',project_version:1});
 const sites={office:site(101,'Office'),casa:site(102,'Casa Buena',actors.pau),sky:site(103,'Sky Assigned Project',actors.sky),unassigned:site(104,'Synthetic Unassigned Project'),architect:site(105,'Architect Assigned Project',actors.architect)};
 const projectCards=projectReview ? require('./fixtures/project-cards.cjs') : null;
 projectCards?.seed({sites,actors,site});
 const tool=(n,name,place,holder=null,status='available')=>({id:'SYN-'+String(n).padStart(3,'0'),dbId:uuid(200+n),name,siteId:place.id,site:place.name,holderId:holder?.id||null,holder:holder?.name||'Unassigned',status,recordedStatus:status==='inuse'?'IN_USE':status.toUpperCase(),qty:1,cat:'Power Tools',brand:'Synthetic',model:'Fixture drill',condition:'Good',serial:'SYNTHETIC-'+n,trackingType:'Individual',movementLock:null,photo:null,notes:'Synthetic acceptance fixture only'});
 const tools=[
  tool(1,'Synthetic Assigned Project Drill',sites.sky),
  tool(2,'Synthetic Casa Available Drill',sites.casa),
  tool(3,'Synthetic Office Drill',sites.office),
  tool(4,'Synthetic Own Custody Drill',sites.casa,actors.sky,'inuse'),
  tool(5,'Synthetic Other Custodian Drill',sites.sky,actors.pau,'inuse'),
  tool(6,'Synthetic Unassigned Project Drill',sites.unassigned),
  tool(7,'Synthetic Unrelated Repair Drill',sites.sky,null,'repair'),
  tool(8,'Synthetic No Project Custody Drill',sites.casa,actors.unassigned,'inuse'),
  tool(9,'Synthetic Architect Project Drill',sites.architect),
  tool(10,'Synthetic Architect Custody Drill',sites.casa,actors.architect,'inuse'),
  tool(11,'Synthetic Architect Other Holder Drill',sites.architect,actors.pau,'inuse'),
  tool(12,'Synthetic Architect Repair Drill',sites.architect,null,'repair')
 ];
 const history=Object.values(sites).filter(s=>s.id!==sites.office.id).map(s=>({id:randomUUID(),project_id:s.id,action:'created',changed_at:'2026-11-13T01:00:00Z',changed_by:actors.admin.id,changed_by_name:actors.admin.name,reason:'Synthetic project record',changes:{}}));
 const requests=[],quantityRequests=[],transfers=[],returns=[],repairs=[],missing=[],activity=[],operations=new Map(),photos=new Map(),stored=new Map();
 const consumable={id:uuid(401),name:'Synthetic Safety Gloves',item_code:'SYN-GLOVES',category:'Safety',unit:'pair',current_stock:25,minimum_stock:5,specification:'Synthetic acceptance stock',archived_at:null};
 const materialRequests=['sky','architect'].map((key,index)=>{const person=actors[key],place=sites[key],itemId=uuid(420+index);return {id:uuid(410+index),request_number:index+1,site_id:place.id,site_name:place.name,requester_id:person.id,requester_name:person.name,status:'issued',purpose:'Synthetic confirmed issuance',created_at:'2026-11-13T02:00:00Z',items:[{id:itemId,consumable_id:consumable.id,item_name:consumable.name,item_code:consumable.item_code,category:consumable.category,unit:consumable.unit,requested_quantity:5,confirmed_consumed_quantity:null}],issues:[{id:uuid(430+index),stock_movement_id:uuid(440+index),item_id:itemId,quantity:5,issued_at:'2026-11-13T02:00:00Z',issued_by_name:actors.admin.name}]};});
 const catalog=[consumable],evidence=[];
 if(fieldReview){
   const varieties=[['Cutting disc','piece','Abrasives'],['Sealant','tube','Adhesives'],['Sandpaper','sheet','Abrasives'],['Masking tape','roll','Adhesives']];
   for(let i=0;i<22;i++){
     const [name,unit,category]=varieties[i%varieties.length];
     catalog.push({...consumable,id:uuid(510+i),item_code:'SYN-MAT-'+(i+1),name,category,unit,specification:'Synthetic grade '+(i+1),current_stock:12+i});
   }
   for(const [n,key] of ['sky','architect'].entries()){
     for(const [j,name] of ['Rotary drill','Angle grinder','Laser level'].entries()){
       tools.push(tool(20+10*n+j,'Synthetic '+name,sites[key],actors[key],'inuse'));
     }
   }
 }
 if(adminReview){
   const items=[['MIG welding wire','kg','WIR-005'],['Acrylic gap sealant','tube','ADH-007'],['Cutting disc','piece','DSC-012'],['Masking tape','roll','TAP-002']];
   catalog.push(...items.map(([name,unit,item_code],i)=>({...consumable,id:uuid(501+i),name,unit,item_code,current_stock:i?20:3,minimum_stock:4,specification:'Synthetic review stock'})));
   materialRequests.length=0;
   for(let n=0;n<36;n++){
     const actor=[actors.sky,actors.pau,actors.architect][n%3],place=[sites.sky,sites.casa,sites.architect][n%3];
     const stock=catalog[(n%7)%catalog.length],qty=1+n%4,status=n<4?'pending':n<6?'approved':'issued';
     const at=new Date(Date.now()-Math.floor(n*n/48)*86400000-n*60000).toISOString();
     const item={id:uuid(650+n),consumable_id:stock.id,item_name:stock.name,item_code:stock.item_code,unit:stock.unit,requested_quantity:qty,approved_quantity:status==='pending'?null:qty,issued_quantity:status==='issued'?qty:0};
     materialRequests.push({id:uuid(550+n),request_number:100+n,requester_id:actor.id,requester_name:actor.name,site_id:place.id,site_name:place.name,status,created_at:at,purpose:'Synthetic site supply request',items:[item],issues:status==='issued'?[{id:uuid(750+n),stock_movement_id:uuid(850+n),item_id:item.id,quantity:qty,issued_at:at,issued_by_name:actors.admin.name}]:[]});
   }
   const batch={id:'SYN-RETURN-01',inspectionBatchId:'SYN-RETURN-01',custodyVersion:2,actorId:actors.sky.id,ownerId:actors.sky.id,returnedBy:actors.sky.name,origin:sites.casa.name,destination:'Office',destinationId:sites.office.id,status:'pendingInspection',createdAt:new Date().toISOString(),notes:'Synthetic inspection fixture with a demonstration photo.',toolIds:['SYN-004'],items:[{asset_id:'SYN-004',outcome:'pending',notes:''}]};
   returns.push(batch);tools.find(t=>t.id==='SYN-004').movementLock='inspection';
   evidence.push({id:uuid(990),movement_id:batch.id,uploader_id:actors.sky.id,object_name:'synthetic/return.webp',phase:'submit_return'});
   const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../public/assets/images/login-slideshow/project-1.webp')).toString('base64');
   stored.set('mcpa-movement-evidence-v2/synthetic/return.webp',{bytes,type:'image/webp'});
 }
 const activeAssigned=person=>Object.values(sites).filter(s=>s.id!==sites.office.id&&s.assigned_engineer_id===person.id&&s.is_active&&!s.archived_at);
 const stock=t=>t.status==='available'&&t.qty===1&&!t.holderId&&!t.movementLock&&t.condition==='Good';
 const field=person=>['engineer','architect'].includes(person.role);
 const related=(person,records)=>records.filter(r=>!field(person)||[r.actorId,r.receiverId,r.requesterId,r.ownerId].includes(person.id));
 const snapshot=person=>({version:1,revision:1,profile:person,tools:clone(tools),sites:clone(Object.values(sites)),users:clone(Object.values(actors)),requests:clone(related(person,requests)),transfers:clone(related(person,transfers).map(t=>({...t,allowedActions:t.status!=='pending'?[]:t.receiverId===person.id?['receiveTransfer','refuseTransfer']:t.actorId===person.id?['cancelTransfer']:[]}))),returns:clone(related(person,returns)),repairs:clone(related(person,repairs)),missing:clone(related(person,missing)),activity:clone(activity.filter(e=>!field(person)||e.actorId===person.id)),inventoryAvailabilityVersion:1,inventoryVerificationRevision:2,integrationVersion:3,officeId:sites.office.id});
 const projectSnapshot=person=>{
  const visible=activeAssigned(person),ids=new Set(visible.map(s=>s.id));
  return {...snapshot(person),sites:clone(visible),tools:clone(tools.filter(t=>ids.has(t.siteId))),history:clone(history.filter(h=>ids.has(h.project_id)))};
 };
 const inventory=person=>{
  const visible=activeAssigned(person),ids=new Set(visible.map(s=>s.id));
  return {...snapshot(person),engineerInventoryVersion:2,sites:clone(visible),tools:clone(tools.filter(t=>t.holderId===person.id||t.siteId!==sites.office.id&&ids.has(t.siteId)&&stock(t)))};
 };
 const error=(message,code='22023')=>{throw Object.assign(Error(message),{code});};
 const requireProject=(person,id)=>{if(!activeAssigned(person).some(s=>s.id===id))error('Choose an explicitly assigned active project.','42501');};
 const once=(person,args,fn)=>{const key=person.id+':'+args.p_operation_id;if(operations.has(key))return clone(operations.get(key));const result=fn();operations.set(key,clone(result));return result;};
 const groups=()=>[{type_id:uuid(301),type_name:'Synthetic Fixture Drill',name:'Synthetic Fixture Drill',category:'Power Tools',brand:'Synthetic',model:'Fixture drill',condition:'Good',unit:'piece',tracking_type:'Individual',requestable:true,available_quantity:tools.filter(stock).length,reserved_quantity:0,deployed_quantity:tools.filter(t=>t.holderId).length,physical_records:tools.length}];
 const ownAsset=(person,id)=>{const t=tools.find(t=>t.id===id);if(!field(person)||!t||t.holderId!==person.id||t.status!=='inuse'||t.movementLock)error('Choose eligible equipment in your own custody.','42501');return t;};
 const event=(person,action,record,assetIds)=>activity.push({id:randomUUID(),actorId:person.id,actor:person.name,action,entityId:record.id,toolIds:assetIds,createdAt:new Date().toISOString(),summary:'Synthetic fixture action'});
 const assetShape=t=>({...t,equipmentId:t.dbId,individual:true,status:t.recordedStatus,quantity:t.qty});
 const transfer=(person,payload)=>{
  const ids=payload.toolIds||payload.assetIds;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)error('Choose distinct Asset IDs.');
  const selected=ids.map(id=>ownAsset(person,id)),recipient=Object.values(actors).find(p=>p.id===payload.receiverId),place=Object.values(sites).find(s=>s.id===payload.destinationId);
  if(!recipient||recipient.id===person.id||!field(recipient)||!place||place.assigned_engineer_id!==recipient.id||!place.is_active||place.archived_at)error('Choose the recipient and their assigned project.','42501');
  const row={id:'SYN-TRF-'+randomUUID(),actorId:person.id,senderId:person.id,sender:person.name,senderRole:person.role,receiverId:recipient.id,receiver:recipient.name,destinationId:place.id,destination:place.name,toolIds:ids,status:'pending',transferVersion:3,createdAt:new Date().toISOString(),notes:payload.notes||'',source:selected.map(t=>({toolId:t.id,name:t.name,siteId:t.siteId,site:t.site,holder:t.holder,holderId:t.holderId,condition:t.condition,qty:t.qty}))};
  selected.forEach(t=>t.movementLock='transfer');transfers.push(row);event(person,'createTransfer',row,ids);return row;
 };
 const movement=(person,action,payload)=>{
  if(action==='createTransfer')return transfer(person,payload);
  const t=transfers.find(t=>t.id===payload.id);
  if(['receiveTransfer','refuseTransfer','cancelTransfer'].includes(action)){
   if(!field(person)||!t||t.status!=='pending'||(action==='cancelTransfer'?t.actorId!==person.id:t.receiverId!==person.id))error('This transfer action is not authorized.','42501');
   if(action==='receiveTransfer'){
    const checks=payload.inspections;if(!Array.isArray(checks)||checks.length!==t.toolIds.length||!t.toolIds.every(id=>checks.some(c=>c.toolId===id&&c.tested===true&&['good','damaged'].includes(c.condition))))error('Inspect and test every Asset ID.');
    for(const id of t.toolIds){const tool=tools.find(t=>t.id===id),check=checks.find(c=>c.toolId===id);Object.assign(tool,{holderId:person.id,holder:person.name,siteId:t.destinationId,site:t.destination,status:check.condition==='damaged'?'repair':'inuse',recordedStatus:check.condition==='damaged'?'REPAIR':'IN_USE',movementLock:null});}t.status='received';t.inspections=checks;t.receivedAt=new Date().toISOString();t.receivedBy=person.name;
   }else{if(!payload.reason?.trim())error('Enter a reason.');t.status=action==='cancelTransfer'?'canceled':'refused';t.reason=payload.reason;if(action==='cancelTransfer')t.toolIds.forEach(id=>tools.find(t=>t.id===id).movementLock=null);}
   event(person,action,t,t.toolIds);return t;
  }
  if(action==='createRequest'){
   const ids=payload.toolIds,place=Object.values(sites).find(s=>s.name===payload.destination);requireProject(person,place?.id);if(!Array.isArray(ids)||!ids.length||ids.some(id=>!tools.some(t=>t.id===id&&stock(t))))error('Choose available stock.');
   const row={id:'SYN-REQ-'+randomUUID(),actorId:person.id,requesterId:person.id,requester:person.name,receiverId:person.id,receiver:person.name,destinationId:place.id,destination:place.name,toolIds:ids,purpose:payload.purpose||'',status:'pending',createdAt:new Date().toISOString()};requests.push(row);event(person,action,row,ids);return row;
  }
  if(['reportRepair','reportMissing'].includes(action)){
   const tool=ownAsset(person,payload.toolId),row={id:'SYN-ISSUE-'+randomUUID(),actorId:person.id,ownerId:person.id,toolId:tool.id,reportedBy:person.name,notes:payload.notes||'',status:action==='reportRepair'?'reported':'missing',createdAt:new Date().toISOString()};
   tool.status=action==='reportRepair'?'repair':'missing';tool.recordedStatus=tool.status.toUpperCase();(action==='reportRepair'?repairs:missing).push(row);event(person,action,row,[tool.id]);return row;
  }
  error('This synthetic movement operation is not modeled.','PGRST202');
 };
 const rpc=(person,name,args={})=>{
  switch(name){
   case 'mcpa_my_profile':return person;
   case 'mcpa_monitoring_snapshot':return {notifications:[],overdue:[],unreadCount:0};
   case 'mcpa_monitoring_mark_read':return {id:args.p_id};
   case 'mcpa_return_destination':return sites.office;
   case 'mcpa_movement_action':return once(person,args,()=>movement(person,args.p_action,args.p_payload||{}));
   case 'mcpa_b_lookup':return assetShape(ownAsset(person,args.p_reference));
   case 'mcpa_b_action':return once(person,args,()=>{
    const payload=args.p_payload||{};
    if(adminReview&&args.p_action==='inspectReturn'){
      if(person.role!=='admin')error('Admin inspection required.','42501');
      const row=returns.find(r=>r.id===payload.id),check=payload.inspections?.[0],item=row?.items.find(i=>i.asset_id===check?.assetId);
      if(!item||!['pending','missing','disputed'].includes(item.outcome)||!['good','damaged','missing','disputed'].includes(check.outcome)||check.physicallyReceived!==['good','damaged'].includes(check.outcome))error('Invalid receipt.');
      Object.assign(item,{outcome:check.outcome,notes:check.notes,inspector_id:person.id,inspected_at:new Date().toISOString()});
      row.unresolvedCount=row.items.filter(i=>['pending','missing','disputed'].includes(i.outcome)).length;row.status=row.unresolvedCount?'partialInspection':'completed';
      if(check.physicallyReceived)Object.assign(tools.find(t=>t.id===item.asset_id),{holder:null,holderId:null,siteId:sites.office.id,site:sites.office.name,movementLock:null,status:check.outcome==='good'?'available':'repair',recordedStatus:check.outcome==='good'?'AVAILABLE':'REPAIR'});
      event(person,'inspectReturn',row,row.toolIds);return row;
    }
    if(args.p_action==='createTransfer')return transfer(person,payload);
    if(args.p_action!=='submitReturn')error('This synthetic custody operation is not modeled.','PGRST202');
    if(payload.destinationId!==sites.office.id)error('Return destination must be Office.');
    if(!Array.isArray(payload.assetIds)||!payload.assetIds.length||new Set(payload.assetIds).size!==payload.assetIds.length)error('Choose distinct Asset IDs.');
    const selected=payload.assetIds.map(id=>ownAsset(person,id));
    const row={id:'SYN-RTN-'+randomUUID(),ownerId:person.id,actorId:person.id,custodyVersion:2,inspectionBatchId:randomUUID(),returnedBy:person.name,destinationId:sites.office.id,destination:'Office',status:'pending',toolIds:payload.assetIds,createdAt:new Date().toISOString(),notes:payload.notes||'',items:selected.map(t=>({asset_id:t.id,outcome:'pending',notes:''}))};
    selected.forEach(t=>t.movementLock='inspection');returns.push(row);event(person,'submitReturn',row,payload.assetIds);return row;
   });
   case 'mcpa_inventory_office':return {id:sites.office.id,name:'Office',label:'Office'};
   case 'mcpa_movement_snapshot':return snapshot(person);
   case 'mcpa_project_snapshot':return projectSnapshot(person);
   case 'mcpa_save_project':
    if (!projectCards) error('This synthetic project operation is not modeled.','PGRST202');
    return once(person,args,()=>projectCards.save({sites,actors,history,person,args,error}));
   case 'mcpa_engineer_equipment_snapshot':if(!field(person))error('Engineer or Architect access required.','42501');return inventory(person);
   case 'mcpa_personal_equipment_snapshot':return {...snapshot(person),sites:activeAssigned(person),tools:clone(tools.filter(t=>t.holderId===person.id))};
   case 'mcpa_transfer_snapshot':return {...snapshot(person),transferVersion:3,recipients:Object.values(actors).filter(p=>['admin','engineer','architect'].includes(p.role))};
   case 'mcpa_b_snapshot':return {profile:person,assets:tools.filter(t=>person.role==='admin'||t.holderId===person.id).map(t=>({...t,equipmentId:t.dbId,individual:true,status:t.recordedStatus,quantity:1})),sites:activeAssigned(person).map(s=>({...s,assignedEngineerId:s.assigned_engineer_id})),recipients:Object.values(actors).filter(p=>['engineer','architect'].includes(p.role)),returnDestination:sites.office,returns:clone(related(person,returns)),transfers:clone(related(person,transfers)),retirements:[],events:[],evidence:evidence.filter(e=>person.role==='admin'||e.uploader_id===person.id),missing:clone(related(person,missing)),repairs:clone(related(person,repairs))};
   case 'mcpa_wa_equipment_catalog':return {profile:person,groups:groups(),sites:activeAssigned(person).map(({id,name})=>({id,name}))};
   case 'mcpa_wa_equipment_requests':return quantityRequests.filter(r=>person.role==='admin'||r.requester_id===person.id);
   case 'mcpa_wa_submit_equipment':return once(person,args,()=>{
    requireProject(person,args.p_site_id);if(args.p_type_id!==uuid(301)||!Number.isInteger(args.p_quantity)||args.p_quantity<1||args.p_quantity>groups()[0].available_quantity)error('Quantity is not available.');
    const row={id:randomUUID(),requester_id:person.id,requester_name:person.name,type_id:uuid(301),type_name:'Synthetic Fixture Drill',requested_quantity:args.p_quantity,approved_quantity:null,site_id:args.p_site_id,site_name:Object.values(sites).find(s=>s.id===args.p_site_id).name,purpose:args.p_purpose||'',status:'pending',created_at:new Date().toISOString(),assets:[]};quantityRequests.push(row);return row;
   });
   case 'mcpa_wa_review_consumables':
   case 'mcpa_wa_issue_consumables':return once(person,args,()=>{
    if(!adminReview||person.role!=='admin')error('Admin review required.','42501');
    const row=materialRequests.find(r=>r.id===args.p_request_id);
    const issuing=name==='mcpa_wa_issue_consumables';
    if(!row||(issuing?!['approved','partially_fulfilled'].includes(row.status):row.status!=='pending'))error('Request status changed.');
    const item=row.items[0],stock=catalog.find(c=>c.id===item.consumable_id);
    if(!issuing&&args.p_decision==='reject'){if(!args.p_note?.trim())error('Enter a reason.');row.status='rejected';row.note=args.p_note;return row;}
    const line=args.p_items?.[0],qty=line?.quantity;
    if(line?.item_id!==item.id||!Number.isFinite(qty)||qty<=0||qty>(issuing?Math.min(stock.current_stock,item.approved_quantity-item.issued_quantity):item.requested_quantity))error('Invalid quantity.');
    if(issuing){stock.current_stock-=qty;item.issued_quantity+=qty;row.status=item.issued_quantity===item.approved_quantity?'issued':'partially_fulfilled';row.issues.push({id:randomUUID(),stock_movement_id:randomUUID(),item_id:item.id,quantity:qty,issued_at:new Date().toISOString(),issued_by_name:person.name});}
    else{item.approved_quantity=qty;row.status='approved';row.note=args.p_note;}
    return row;
   });
   case 'mcpa_wa_consumables_snapshot':return {profile:person,catalog,sites:adminReview&&person.role==='admin'?Object.values(sites):activeAssigned(person),requests:materialRequests.filter(r=>person.role==='admin'||r.requester_id===person.id)};
   case 'mcpa_wa_submit_consumables':return once(person,args,()=>{
    requireProject(person,args.p_site_id);if(!args.p_items?.length)error('Choose a consumable.');
    const row={id:randomUUID(),request_number:materialRequests.length+1,site_id:args.p_site_id,site_name:Object.values(sites).find(s=>s.id===args.p_site_id).name,requester_id:person.id,requester_name:person.name,purpose:args.p_purpose||'',status:'pending',created_at:new Date().toISOString(),items:args.p_items.map(i=>{const stock=catalog.find(c=>c.id===i.consumable_id);if(!stock||stock.unit!==i.unit||!(i.quantity>0))error('Invalid consumable or quantity.');return {...i,id:randomUUID(),item_name:stock.name,item_code:stock.item_code,unit:stock.unit,requested_quantity:i.quantity,confirmed_consumed_quantity:null};}),issues:[]};materialRequests.push(row);return row;
   });
   case 'mcpa_my_profile_picture':return {version:1,object_name:photos.get(person.id)||null};
   case 'mcpa_set_my_profile_picture':if(!args.p_object_name?.startsWith(person.id+'/'))error('Own profile only.','42501');photos.set(person.id,args.p_object_name);return {version:1,object_name:args.p_object_name};
   case 'mcpa_update_my_profile':if(!args.p_name?.trim())error('Enter a name.');Object.assign(person,{name:args.p_name.trim(),username:args.p_username});return person;
   case 'mcpa_purchase_snapshot':return {purchases:[],allocations:[],receipts:[],suppliers:[]};
   default:error('This isolated JavaScript preview does not simulate this operation.','PGRST202');
  }
 };
 const tables=()=>({sites:Object.values(sites),profiles:Object.values(actors),equipment:tools.map(t=>({...t,id:t.dbId,asset_id:t.id,site_id:t.siteId,current_holder_id:t.holderId,quantity:t.qty,category:t.cat,status:t.recordedStatus,tracking_type:t.trackingType})),consumables:catalog,consumable_requests:materialRequests,project_history:history,consumable_stock_movements:[],consumable_restock_orders:[]});
 return {actors,sites,tools,history,activeAssigned,inventory,projectSnapshot,groups,
  handle(key,q){
   const person=actors[key];if(!person||person.account_status!=='active')return {data:null,error:{code:'42501',message:'Choose a synthetic preview identity.'}};
   try{
    let data,count=null;
    if(q.rpc)data=rpc(person,q.rpc,q.args);
    else if(q.table){if(q.write)error('Table writes are disabled in this preview.');let rows=tables()[q.table];if(!rows)error('This synthetic table is not modeled.','PGRST205');rows=rows.filter(r=>(q.filters||[]).every(([k,v])=>r[k]===v));count=rows.length;rows=rows.slice(q.start||0,q.end==null?undefined:q.end+1);data=q.single?rows[0]||null:rows;}
    else if(q.storage){
     const key=q.bucket+'/'+q.name;
     if(q.storage==='upload'){if(q.bucket!=='mcpa-profile-photos'||!q.name.startsWith(person.id+'/'))error('Own profile only.','42501');stored.set(key,{bytes:q.body,type:q.type});data={path:q.name};}
     else if(q.storage==='sign'){if(!stored.has(key))error('Synthetic object unavailable.');data={signedUrl:'/__stored/'+encodeURIComponent(key)};}
     else if(q.storage==='remove'){if(q.bucket==='mcpa-movement-evidence-v2')error('Submitted proof is read-only.','42501');for(const name of q.names||[])stored.delete(q.bucket+'/'+name);data=[];}
    }else error('Unsupported synthetic operation.');
    return {data:clone(data),error:null,count};
   }catch(e){return {data:null,error:{code:e.code||'22023',message:e.message},count:null};}
  },stored};
};
