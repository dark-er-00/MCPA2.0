# Documentation-only generator. Creates assets only beside this script.
$ErrorActionPreference = 'Stop'
$env:SITETRACE_ADMIN_FLOWCHART = $PSScriptRoot
@'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(process.env.SITETRACE_ADMIN_FLOWCHART),root=path.resolve(dir,'../../../..');
const stem='SiteTrace_Main_Admin_Flowchart';
const write=(file,body)=>{const dest=path.resolve(dir,file);if(!dest.startsWith(dir+path.sep))throw Error('Outside documentation folder');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);};
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const xml=s=>'<?xml version="1.0" encoding="UTF-8"?>'+s;
const attr=s=>esc(s).replace(/\n/g,'&#xa;');
const baseline=JSON.parse(fs.readFileSync(path.join(dir,'Validation/Source_Baseline.json')));
const navigation=read('js/navigation.js'),permission=read('js/permissions.js'),app=read('js/app.js');
const menu=[...navigation.match(/const ADMIN_NAV = \[([\s\S]*?)\];/)[1].matchAll(/\{id:"([^"]+)", label:"([^"]+)"/g)].map(m=>({route:m[1],label:m[2]}));
const allowed=[...permission.match(/admin:\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
const screenModules=Object.fromEntries([...app.match(/const SCREEN_MODULE = \{([\s\S]*?)\};/)[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
if(menu.length!==14||!menu.every(m=>allowed.includes(m.route)))throw Error('Admin navigation changed: review contents.');
const summaries={masterlist:'Register / edit equipment, view details and QR labels, search and export inventory.',sites:'View projects and project detail; Admin project management and assignments.',request:'Review requests; approve, reject and release eligible requests.',transfer:'Monitor handovers and their records; Admin cannot act as the named field receiver.',return:'Monitor recorded returns; no separate Admin acceptance stage.',repair:'Review repair cases; start and complete eligible repairs.',missing:'Review missing cases and record eligible Good / Damaged recovery.',consumables:'Manage consumable items / stock and material requests; record receipts or cancel outstanding requests.',purchase:'View and save purchase ledger records with optional private receipts; does not receive stock.',reports:'Load monitoring reports for a selected period and export PDF.',activity:'Search saved movement activity, follow record links and export PDF.',users:'Manage company people, accounts and accountability using Admin controls.',settings:'View My account identity, change display theme and log out; roles are managed by Admin.'};
const modules=menu.filter(m=>m.route!=='dashboard').map((m,i)=>({...m,ref:'M'+String(i+1).padStart(2,'0'),module:screenModules[m.route],summary:summaries[m.route],routes:m.route==='masterlist'?['masterlist','tool-profile']:m.route==='sites'?['sites','site-detail']:[m.route]}));
for(const m of modules)for(const ext of ['html','js'])if(!fs.existsSync(path.join(root,'1-admin/modules',m.module,m.module+'.'+ext)))throw Error('Missing module source '+m.module);
const t=text=>({type:'terminator',text}),p=text=>({type:'process',text}),io=text=>({type:'io',text});
const end=text=>t('End - '+text),circle=(ref,direction)=>({type:'onpage',text:ref,ref,direction});
const off=(ref,page,direction,context)=>({type:'offpage',ref,page,direction,text:ref+' - '+(direction==='out'?'To':'From')+' page '+page+'\n'+context});
const q=(text,branch,down='Yes',right='No')=>({type:'decision',text,branch,down,right});
const raw=[
 {title:'Login and verified Admin authorization',note:'Interactive company sign-in path. A retries credential entry. Other active roles enter their own permitted workspace; they are not rejected solely for being non-Admin.',nodes:[
  t('Start'),p('Open SiteTrace.'),io('Display the company Login page.'),circle('A','in'),io('Enter email and password; submit\nthe valid login form.'),
  p('Validate credentials using Supabase Auth\nsignInWithPassword(email, password).'),
  q('Authentication\nsuccessful?',[io('Display credential, email\nconfirmation or connection\nerror on the login form.'),circle('A','out')]),
  p('Clear the password field on success.\nFetch company profile with mcpa_my_profile.'),
  q('Profile verified,\nactive and supported?',[io('Display the actual profile /\ninactive / verification error\non the Login page.'),end('Admin access unavailable')]),
  q('Profile role is Admin?',[p('Open the active user\'s own\npermitted workspace.\nNo Admin access is granted.'),end('Other role workspace')]),
  p('Initialize the live workspace; hide Login.\nBuild the permitted Admin navigation\nand initialize monitoring.'),off('S',2,'out','Resolve Admin entry route')
 ]},
 {title:'Dashboard, persistent navigation and module selection',note:'D returns to Dashboard loading. R retries a failed Dashboard load. The persistent sidebar and account menu also remain available in loaded modules. Module details are deferred to Stage 2.',nodes:[
  off('S',1,'in','Verified active Admin'),p('Resolve the initial route using saved\nhistory / URL hash; default to Dashboard.'),
  q('Known non-Dashboard\nroute requested?',[off('H',3,'out','Resume the requested module')],'No','Yes'),circle('D','in'),circle('R','in'),
  p('Load or reuse the Dashboard module\nthrough showScreen("dashboard").'),
  q('Dashboard screen\nloaded?',[io('Display Unable to load\nthis screen. Admin selects\nRetry for this route.'),circle('R','out')]),
  io('Display Admin Dashboard\nand the available Admin modules.'),io('Admin selects a module or Dashboard\nfrom persistent navigation, or selects Log Out.'),
  q('Log Out selected?',[off('L',4,'out','Perform the verified logout')],'No','Yes'),
  q('Dashboard selected?',[circle('D','out')],'No','Yes'),off('N',3,'out','Navigate to the selected module')
 ]},
 {title:'Verified module destinations - Stage 1 only',note:'Follow exactly ONE labeled exit for the selected route. The common vertical line is a shared choice bus, not parallel execution. M01-M13 are future module flowcharts: PLANNED - STAGE 2.',catalog:true},
 {title:'Verified company logout and retry',note:'Logout clears the local UI and navigation before Supabase confirms sign-out. A retries unconfirmed sign-out. The call uses scope: local; this diagram makes no claim about other devices.',nodes:[
  off('L',2,'in','Admin selects Log Out'),circle('A','in'),p('End the navigation session; clear local\nprofile, workspace and setup/demo markers.\nRemove the route hash; show Signing out.'),
  p('Call Supabase Auth signOut({scope:"local"}).'),q('Sign-out confirmed?',[io('Show Sign out could not\nbe confirmed and the\nRetry sign out button.'),circle('A','out')]),
  io('Display Login with\nYou have been signed out.'),end('Company session signed out')
 ]}
];
function wrap(text,max){return text.split('\n').flatMap(line=>{const a=[];let s='';for(const word of line.split(' ')){if(s&&s.length+word.length+1>max){a.push(s);s='';}s+=(s?' ':'')+word;}return [...a,s];});}
function geometry(raw,id,cx,y,side=false){const lines=wrap(raw.text,side?32:raw.type==='decision'?28:50),font=raw.type==='onpage'?34:side?30:raw.type==='decision'?33:raw.type==='offpage'?31:34,lh=font*1.2;
 const w=raw.type==='onpage'?84:side?640:raw.type==='terminator'?900:raw.type==='offpage'?960:1040;
 const h=raw.type==='onpage'?84:raw.type==='terminator'?Math.max(96,lines.length*lh+34):raw.type==='decision'?260:raw.type==='offpage'?Math.max(150,lines.length*lh+64):Math.max(120,lines.length*lh+42);
 return {...raw,id,x:cx-w/2,y,w,h,lines,font,lh};
}
const isEnd=n=>n.type==='terminator'&&n.text.startsWith('End'),exit=n=>isEnd(n)||['onpage','offpage'].includes(n.type)&&n.direction==='out';
function standard(raw,number){let index=0,y=190,previous,branchBottom=0;const nodes=[],edges=[];
 const add=(r,cx,top,side)=>{const n=geometry(r,'P'+number+'N'+(++index),cx,top,side);nodes.push(n);return n;};
 const link=(a,b,label='',horizontal=false)=>edges.push({id:'P'+number+'E'+(edges.length+1),from:a.id,to:b.id,label,points:horizontal?[[a.x+a.w,a.y+a.h/2],[b.x,b.y+b.h/2]]:[[a.x+a.w/2,a.y+a.h],[b.x+b.w/2,b.y]],horizontal});
 for(const r of raw.nodes){const draft=geometry(r,'',650,y);if(r.type==='decision'&&draft.y+draft.h/2-100<branchBottom+35)y+=branchBottom+135-draft.y-draft.h/2;
  const n=add(r,650,y,false);if(previous){if(exit(previous))throw Error('Arrow follows exit');link(previous,n,previous.type==='decision'?previous.down:'');}
  if(r.type==='decision'){let prev,top;for(const [i,b]of r.branch.entries()){const draft=geometry(b,'',1730,0,true),next=add(b,1730,i?top:n.y+n.h/2-draft.h/2,true);link(prev||n,next,i?'':r.right,!i);prev=next;top=next.y+next.h+48;}if(!exit(prev))throw Error('Unfinished branch');branchBottom=top-48;}
  previous=n;y=n.y+n.h+48;
 }
 return {...raw,number,id:'Admin_P'+String(number).padStart(2,'0'),width:2100,height:2970,nodes,edges};
}
function catalog(raw,number){const nodes=[],edges=[];let index=0;
 const add=(r,cx,y,w,h,font=30)=>{const n={...geometry(r,'P'+number+'N'+(++index),cx,y),w,h,x:cx-w/2,font,lh:font*1.2,lines:wrap(r.text,r.type==='process'?34:r.planned?34:39)};nodes.push(n);return n;};
 const edge=(a,b,points,label='',extra={})=>edges.push({id:'P'+number+'E'+(edges.length+1),from:a.id,to:b.id,points,label,...extra});
 const incoming=add(off('N',2,'in','Selected module from navigation'),400,185,680,140,30),entry=add(circle('C','in'),400,360,84,84,34);
 edge(incoming,entry,[[400,325],[400,360]]);
 const alternative=add(off('H',2,'in','Known non-Dashboard initial route'),1740,185,640,140,30),leave=add(circle('C','out'),1740,360,84,84,34);edge(alternative,leave,[[1740,325],[1740,360]]);
 const router=add({type:'decision',text:'Which module owns\nthe selected route?',multiway:true},400,480,740,230,32);edge(entry,router,[[400,444],[400,480]]);
 for(const [i,m]of modules.entries()){
  const cy=780+i*164;
  const action=add(p('Navigate to\n'+m.label),1050,cy-58,600,116,32);
  const planned=add({type:'offpage',text:m.ref+' - '+m.label+'\nPLANNED \u2014 STAGE 2',ref:m.ref,direction:'out',planned:true,destination:'Future '+m.label+' module flowchart'},1755,cy-72,610,144,26);
  planned.lines=[m.ref+' - '+m.label,'PLANNED \u2014 STAGE 2'];planned.lh=33;
  edge(router,action,[[400,710],[400,cy],[750,cy]],m.routes.join(' / '),{bus:'module-choice',labelX:440,labelY:cy-19,labelLines:m.routes});
  edge(action,planned,[[1350,cy],[1450,cy]],'',{horizontal:true});
 }
 return {...raw,number,id:'Admin_P03',width:2100,height:2970,nodes,edges,bus:{x:400,top:710,bottom:780+12*164}};
}
const pages=raw.map((p,i)=>p.catalog?catalog(p,i+1):standard(p,i+1));
const model={title:'SiteTrace (MCPA) - Main Admin System Flowchart',date:'2026-10-20',revision:baseline.commit,stage:1,pages,modules,adminMenu:menu,adminAllowedRoutes:allowed,screenModules};
function shape(n){const {x,y,w,h,type}=n,style='fill="white" stroke="#292929" stroke-width="3"';
 if(type==='terminator')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${style}/>`;
 if(type==='onpage')return `<circle cx="${x+w/2}" cy="${y+h/2}" r="${w/2}" ${style}/>`;
 if(type==='decision')return `<polygon points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}" ${style}/>`;
 if(type==='io')return `<polygon points="${x+35},${y} ${x+w},${y} ${x+w-35},${y+h} ${x},${y+h}" ${style}/>`;
 if(type==='offpage')return `<polygon points="${x},${y} ${x+w},${y} ${x+w},${y+h-36} ${x+w/2},${y+h} ${x},${y+h-36}" ${style}/>`;
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${style}/>`;
}
const annotation=(page)=>[
 {x:60,y:48,font:23,text:'SITETRACE / MCPA  |  STAGE 1'},
 {x:60,y:102,font:44,text:'Main Admin System Flowchart'},
 {x:60,y:151,font:31,text:`Page ${page.number} of 4 - ${page.title}`},
 ...wrap(page.note,126).map((text,i)=>({x:60,y:2860+i*32,font:26,text})),
 {x:60,y:2944,font:23,text:'Source-reviewed '+baseline.commit.slice(0,7)+' | 20 October 2026 | White symbols / dark outlines | A3 portrait'}
];
function svg(page){let flowlines='';if(page.bus)flowlines+=`<path d="M${page.bus.x} ${page.bus.top} V${page.bus.bottom}" fill="none" stroke="#292929" stroke-width="3"/>`;
 for(const e of page.edges){const pts=e.bus?e.points.slice(1):e.points;flowlines+=`<polyline data-edge="${e.id}" points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#292929" stroke-width="3" marker-end="url(#arrow)"/>`;
  if(e.label){const x=e.bus?e.labelX:e.horizontal?(e.points[0][0]+e.points[1][0])/2:e.points[0][0]+34,y=e.bus?e.labelY:e.horizontal?e.points[0][1]-18:(e.points[0][1]+e.points[1][1])/2+7,lines=e.bus?e.labelLines:[e.label];flowlines+=`<text font-size="${e.bus?26:30}" font-weight="600" text-anchor="${e.horizontal?'middle':'start'}">${lines.map((s,i)=>`<tspan x="${x}" y="${y-(lines.length-1-i)*31}">${esc(s)}</tspan>`).join('')}</text>`;}
 }
 return xml(`<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="2970" viewBox="0 0 2100 2970" role="img" aria-labelledby="title"><title id="title">Main Admin Flowchart - page ${page.number}: ${esc(page.title)}</title><defs><marker id="arrow" markerWidth="14" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L12 6 L0 12 Z" fill="#292929"/></marker></defs><rect width="2100" height="2970" fill="white"/><g font-family="Arial, sans-serif" fill="#222">${annotation(page).map(a=>`<text x="${a.x}" y="${a.y}" font-size="${a.font}">${esc(a.text)}</text>`).join('')}${flowlines}${page.nodes.map(n=>{const center=n.y+n.h/2-(n.type==='offpage'?15:0),first=center-(n.lines.length-1)*n.lh/2;return `<g data-shape="${n.id}">${shape(n)}<text data-node="${n.id}" text-anchor="middle" font-size="${n.font}" font-weight="${['decision','terminator','onpage'].includes(n.type)?600:400}">${n.lines.map((s,i)=>`<tspan x="${n.x+n.w/2}" y="${first+i*n.lh}" dominant-baseline="central">${esc(s)}</tspan>`).join('')}</text></g>`;}).join('')}</g></svg>`);
}
function drawio(){
 const diagrams=pages.map(page=>{
  const captions=annotation(page).map((a,i)=>`<mxCell id="annotation${i}" value="${attr(a.text)}" vertex="1" parent="1" style="text;html=0;align=left;verticalAlign=middle;fontFamily=Arial;fontSize=${a.font};fontColor=#222222;"><mxGeometry x="${a.x}" y="${a.y-a.font}" width="1980" height="${a.font+10}" as="geometry"/></mxCell>`).join('');
  const vertices=page.nodes.map(n=>{const styles={process:'rounded=0;',terminator:'ellipse;',onpage:'ellipse;aspect=fixed;',decision:'rhombus;',io:'shape=parallelogram;size=35;fixedSize=1;',offpage:'shape=offPageConnector;'};return `<mxCell id="${n.id}" value="${attr(n.lines.join('\n'))}" vertex="1" parent="1" style="${styles[n.type]}html=0;whiteSpace=wrap;align=center;verticalAlign=middle;spacing=12;${n.type==='offpage'?'spacingBottom=30;':''}fontFamily=Arial;fontSize=${n.font};fontStyle=${['decision','terminator','onpage'].includes(n.type)?1:0};strokeWidth=3;strokeColor=#292929;fillColor=#ffffff;fontColor=#222222;"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;}).join('');
  const arrows=page.edges.map(e=>{
   // Position multiway case labels on their horizontal branch, away from the shared trunk.
   const labelX=e.bus?2*((e.points[1][1]-710+175)/(e.points[1][1]-710+350))-1:0;
   const labelY=e.bus?-28:e.horizontal?-25:-30;
   return `<mxCell id="${e.id}" value="${attr(e.label)}" edge="1" parent="1" source="${e.from}" target="${e.to}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;endFill=1;strokeWidth=3;strokeColor=#292929;fontFamily=Arial;fontSize=${e.bus?26:30};labelBackgroundColor=#ffffff;exitX=${e.horizontal?1:0.5};exitY=${e.horizontal?0.5:1};entryX=${e.horizontal||e.bus?0:0.5};entryY=${e.horizontal||e.bus?0.5:0};"><mxGeometry x="${labelX}" y="${labelY}" relative="1" as="geometry">${e.bus?`<Array as="points"><mxPoint x="400" y="${e.points[1][1]}"/></Array>`:''}</mxGeometry></mxCell>`;
  }).join('');
  return `<diagram id="${page.id}" name="${attr('P'+page.number+' - '+page.title)}"><mxGraphModel dx="2100" dy="2970" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="2100" pageHeight="2970"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${captions}${vertices}${arrows}</root></mxGraphModel></diagram>`;
 }).join('');
 return xml(`<mxfile host="app.diagrams.net" compressed="false" pages="4" agent="SiteTrace Stage 1 documentation">${diagrams}</mxfile>`);
}
function validate(){const errors=[],check=(ok,message)=>{if(!ok)errors.push(message);},all=new Map(),graph=[],pairs=new Map(),counts={pages:pages.length,nodes:0,decisions:0,arrows:0,onPagePairs:0,actualOffPagePairs:0,plannedModuleExits:0};
 for(const page of pages){const byId=new Map(page.nodes.map(n=>[n.id,n]));for(const n of page.nodes){const id=page.number+':'+n.id;all.set(id,n);counts.nodes++;check(n.x>=25&&n.y>=180&&n.x+n.w<=2080&&n.y+n.h<=2820,'Node outside drawing region '+id);
   if(n.type==='decision'){counts.decisions++;const outgoing=page.edges.filter(e=>e.from===n.id);check(n.text.endsWith('?'),'Decision is not a question '+id);check(n.multiway?outgoing.length===13&&new Set(outgoing.map(e=>e.label)).size===13:outgoing.length===2&&['Yes','No'].every(label=>outgoing.some(e=>e.label===label)),'Unlabeled/invalid decision '+id);}
   if(n.planned){counts.plannedModuleExits++;check(n.direction==='out'&&!n.page&&n.text.includes('PLANNED \u2014 STAGE 2'),'Stage 2 incorrectly claimed present '+id);}else if(['onpage','offpage'].includes(n.type)){const key=n.type+':'+(n.type==='onpage'?page.number+':':'')+n.ref;if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push({id,n,page:page.number});}
  }
  for(let i=0;i<page.nodes.length;i++)for(const b of page.nodes.slice(i+1)){const a=page.nodes[i];check(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h+8<=b.y||b.y+b.h+8<=a.y,'Overlapping nodes '+a.id+' / '+b.id);}
  for(const e of page.edges){counts.arrows++;check(byId.has(e.from)&&byId.has(e.to),'Dangling arrow '+e.id);graph.push([page.number+':'+e.from,page.number+':'+e.to]);for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];check((a[0]===b[0]||a[1]===b[1])&&b[0]>=a[0]&&b[1]>=a[1],'Diagonal/backward line '+e.id);for(const n of page.nodes.filter(n=>n.id!==e.from&&n.id!==e.to)){const hit=a[0]===b[0]?a[0]>n.x&&a[0]<n.x+n.w&&Math.max(a[1],b[1])>n.y&&Math.min(a[1],b[1])<n.y+n.h:a[1]>n.y&&a[1]<n.y+n.h&&Math.max(a[0],b[0])>n.x&&Math.min(a[0],b[0])<n.x+n.w;check(!hit,'Line through symbol '+e.id+' / '+n.id);}}
  }
  // Shared module-choice trunks are deliberate; all other unrelated line crossings are forbidden.
  for(let i=0;i<page.edges.length;i++)for(const b of page.edges.slice(i+1)){const a=page.edges[i];if(a.from===b.from||a.to===b.to||a.from===b.to||a.to===b.from)continue;for(let ai=1;ai<a.points.length;ai++)for(let bi=1;bi<b.points.length;bi++){const [a0,a1]=a.points.slice(ai-1,ai+1),[b0,b1]=b.points.slice(bi-1,bi+1),av=a0[0]===a1[0],bv=b0[0]===b1[0];let hit=false;if(av!==bv){const v=av?[a0,a1]:[b0,b1],h=av?[b0,b1]:[a0,a1];hit=v[0][0]>=h[0][0]&&v[0][0]<=h[1][0]&&h[0][1]>=v[0][1]&&h[0][1]<=v[1][1];}else if(av)hit=a0[0]===b0[0]&&Math.max(a0[1],b0[1])<Math.min(a1[1],b1[1]);else hit=a0[1]===b0[1]&&Math.max(a0[0],b0[0])<Math.min(a1[0],b1[0]);check(!hit,'Crossing unrelated arrows '+a.id+' / '+b.id);}}
 }
 for(const [key,list]of pairs){const a=list.find(x=>x.n.direction==='out'),b=list.find(x=>x.n.direction==='in');check(list.length===2&&a&&b,'Unmatched continuation '+key);if(!a||!b)continue;if(a.n.type==='offpage'){counts.actualOffPagePairs++;check(a.page!==b.page&&a.n.page===b.page&&b.n.page===a.page,'Incorrect off-page destination '+key);}else counts.onPagePairs++;graph.push([a.id,b.id]);}
 const visit=(initial,reverse=false)=>{const seen=new Set(initial),todo=[...initial];while(todo.length){const current=todo.pop();for(const edge of graph)if(edge[reverse?1:0]===current&&!seen.has(edge[reverse?0:1])){seen.add(edge[reverse?0:1]);todo.push(edge[reverse?0:1]);}}return seen;};
 const begins=[...all].filter(([,n])=>n.text==='Start').map(([id])=>id),ends=[...all].filter(([,n])=>isEnd(n)||n.planned).map(([id])=>id),reached=visit(begins),finished=visit(ends,true);
 for(const [id,n]of all){check(reached.has(id),'Unreachable shape '+id);check(finished.has(id),'No valid ending / planned endpoint '+id);const outgoing=graph.filter(e=>e[0]===id);check(isEnd(n)||n.planned?outgoing.length===0:outgoing.length>0,'Unfinished path '+id);}
 check(modules.length===13&&menu.length===14,'Admin module coverage mismatch');check(allowed.every(route=>route==='dashboard'||modules.some(m=>m.routes.includes(route))),'Unrepresented Admin route');
 if(errors.length)throw Error(errors.join('\n'));return{passed:true,...counts,allAdminRoutesCovered:allowed.length,sharedChoiceBus:'Intentional single-route dispatch, drawn once in SVG; not parallel execution',stage2:'13 named planned exits; no Stage 2 module flowcharts created'};
}
const structural=validate();write(stem+'.drawio',drawio());for(const page of pages)write(stem+'_P'+String(page.number).padStart(2,'0')+'.svg',svg(page));write('Validation/Diagram_Model.json',JSON.stringify(model,null,2));write('Validation/Structure.json',JSON.stringify(structural,null,2));
const sourceRows=[
 ['js/auth.js','32-53, 72-106','Login form and errors; signInWithPassword; profile validation and app entry.'],
 ['js/auth.js','120-134, 136-155','Local signOut and retry; route denial; boot/session/callback behavior.'],
 ['js/permissions.js','5-20, 39-42','Admin routes and actions; role labels; Dashboard home.'],
 ['js/navigation.js','8-30, 54-63, 107-160','Actual sidebar labels, permissions filter and showScreen routing / detail destinations.'],
 ['js/navigation-history.js','128-155','Account-scoped history, initialRoute and endSession clearing.'],
 ['js/app.js','8-25, 47-118, 257','Owning module map, module loading / retry, logout forwarding.'],
 ['supabase/migrations/202610040001_authenticated_access.sql','42-59','Profile auth_user_id matches auth.uid(); active authorized backend identity and mcpa_my_profile. Read only.'],
 ['js/movement-cloud.js','27-48, 95-106','Scoped live snapshot and explicit live/demo workspace modes.'],
 ['1-admin/modules/dashboard/dashboard.js','1','Dashboard mounts the shared MovementOverview.'],
 ['js/movement-overview.js','39-62, 85-145','Shared Dashboard / Activity display and data loading.'],
 ...modules.map(m=>['1-admin/modules/'+m.module+'/'+m.module+'.js','Module entry / controls','Source-confirmed '+m.label+' screen. '+m.summary])
];
for(const [file]of sourceRows)if(!fs.existsSync(path.join(root,file)))throw Error('Missing evidence '+file);
const moduleRows=modules.map(m=>`| ${m.ref} | ${m.label} | ${m.routes.map(r=>'#'+r).join(', ')} | ${m.summary} | **PLANNED \u2014 STAGE 2** |`).join('\n');
const explanation=`# SiteTrace (MCPA) - Main Admin Flowchart

Stage 1 only. Source-reviewed **20 October 2026**, repository **${baseline.commit.slice(0,7)}**. This is documentation of the implemented system, not a change to application behavior.

## Files and page order

- [Editable draw.io source](${stem}.drawio): four named pages, individual editable symbols, labels and flowlines.
- [Printable PDF](${stem}.pdf): four A3 portrait pages; print at actual size for the intended typography.
- [High-resolution PNG overview](${stem}.png): all four pages on one review sheet. Use the individual page PNGs for close reading.
${pages.map(page=>'- [Page '+page.number+' PNG]('+stem+'_P'+String(page.number).padStart(2,'0')+'.png): '+page.title+'.').join('\n')}

The four pages separate authentication, common navigation, thirteen module endpoints and logout. This keeps labels legible without expanding any module's internal operations. Page SVGs are supporting vector exports. The PowerShell build/render/validation scripts are documentation helpers stored only in this new folder; no HTML, CSS or JavaScript file is created or changed.

## Login and authentication

Page 1 begins with Start, Open SiteTrace, Display Login and credential entry. Native HTML email/required-field validation precedes a valid form submission. Supabase Auth owns credential authentication through signInWithPassword; the application supplies the trimmed email and password and never compares a password with a profile record.

The Authentication successful? diamond routes failures to the actual login feedback categories (invalid credentials, unconfirmed email or connection failure), then paired circle A returns to credential entry. A successful sign-in clears the password input and requests mcpa_my_profile using the authenticated session.

The profile decision requires a successfully returned company profile, a supported role and active status. Missing/unsupported profiles, inactive accounts and failed verification return to Login with their corresponding source-defined message. The RPC resolves profiles.auth_user_id against auth.uid(), rather than trusting a role supplied by the user.

The Profile role is Admin? decision describes entry into the Admin branch; it is not an additional Admin-only gate in the login code. An active supported non-Admin user is routed to their own permitted workspace. Secretary defaults to Material Requests, while other supported roles default to Dashboard; a valid requested route may take precedence. The diagram does not invent a non-Admin authentication error or force sign-out.

For Admin, the live workspace is initialized, Login hidden, account controls and filtered navigation built, and monitoring initialized. Page 2 then resolves the initial route.

## Dashboard and module navigation

Without a known requested screen, Admin home is Dashboard. The Dashboard module is loaded/reused by showScreen and mounts MovementOverview. Its module shell can display a connection error and Retry if HTML/script loading fails; circle R on page 2 repeats that load. Data-loading errors inside a successfully loaded Dashboard are handled by its own module and are outside this overview.

There is a source-defined exception to always landing on Dashboard: auth.enter reads the URL hash through MCPANavigation.initialRoute and preserves a recognized initial screen. A history entry owned by a different account/session instead falls back to the role home. A non-Dashboard initial route therefore follows H directly to page 3; no fictitious compulsory Dashboard visit is inserted.

The actual sidebar contains **Dashboard plus thirteen modules**. Admin chooses a module, Dashboard or Log Out from the persistent navigation/account controls. The Dashboard selected? Yes branch uses paired circle D to call showScreen('dashboard') again. The same sidebar is available from opened modules, so this return route is verified without inventing a universal Back-to-Dashboard button or an automatic return after module work.

On page 3, Which module owns the selected route? is a genuine multiway route-dispatch decision. Its thirteen mutually exclusive exits are labeled with actual route IDs. Follow exactly one. A common downward choice bus, drawn once, distributes the selected case left-to-right; it does not execute all modules in parallel. Each rectangle represents high-level navigation via showScreen to that screen. The router checks canRoute, loads/reuses the owning module and activates its screen; module operations and detailed errors belong in Stage 2.

The Equipment Tracking module also owns tool-profile. Projects also owns site-detail. These are detail routes, not extra sidebar modules. My Account in the account menu opens the existing Settings route; Change theme is an account/display action, not another module. Profile revalidation and backend policies continue to control access; this main chart does not replace server authorization.

## Verified modules and future connector register

Dashboard is the main hub, route #dashboard, and is already represented on page 2. All other menu names below match ADMIN_NAV and the Admin allowlist. Descriptions summarize available actions only; no detailed module flowchart is included.

| Reference | Actual Admin module | Source routes | Verified high-level scope | Destination status |
| --- | --- | --- | --- | --- |
${moduleRows}

M01-M13 identify **future named module flowcharts**, not existing continuation pages. Reuse the same reference in each corresponding Stage 2 entry when approved. None has a destination page number, existing-file claim or false matching continuation. Existing general workflow diagrams elsewhere in SYSTEM_DOCUMENTATION are preserved and are not presented as these future Admin module diagrams.

The six Admin movement actions in the current permission map are approveRequest, rejectRequest, releaseRequest, startRepair, completeRepair and recoverMissing. Admin can view Transfers and Returns, but is not the named field receiver and does not get a separate Office-return acceptance step. Other module-specific Admin controls (inventory, projects, materials, purchases, people and reports) enforce their own applicable backend authorization.

## Decisions and continuation references

Binary decisions have explicit Yes/No exits: authentication success, verified active supported profile, Admin role, known non-Dashboard initial route, Dashboard screen loaded, Log Out selected, Dashboard selected and confirmed sign-out. The single multiway dispatch has thirteen labeled cases corresponding to the verified module register.

| On-page reference | Page | Matching continuation purpose |
| --- | ---: | --- |
| A | 1 | Login error returns to credential entry |
| D | 2 | Dashboard selection resumes Dashboard loading |
| R | 2 | Dashboard module-load Retry resumes that load |
| C | 3 | Initial-route entry H joins ordinary module selection N |
| A | 4 | Unconfirmed sign-out Retry restarts the verified logout routine |

Circle letters are scoped to their page. Every on-page reference has exactly one outward and one inward endpoint. No upward or right-to-left arrows are needed to represent these retries.

| Actual off-page reference | Exit | Existing matching entry |
| --- | --- | --- |
| S | Page 1 | Page 2: verified Admin entry |
| N | Page 2 | Page 3: selected module |
| H | Page 2 | Page 3: known non-Dashboard initial route |
| L | Page 2 | Page 4: logout |

These four actual page-transition pairs differ from the thirteen explicitly planned M references. All actual references resolve to a page in this draw.io file/PDF.

## Verified logout

Page 4 expands the Log Out branch. The application ends its navigation session, clears local identity/workspace and setup/demo session markers, removes the route hash and displays Signing out before awaiting Supabase. It calls auth.signOut with scope local. Success displays Login with You have been signed out and ends the Admin session path. Failure displays Sign out could not be confirmed with Retry sign out; paired circle A repeats logout. Clearing the local UI is not falsely equated with confirmed Supabase sign-out. Other-device sessions are outside the local signOut scope.

Logout is available from the account menu, the existing shell logout control and Settings/My account. The offline-demo branch has different logout behavior and is outside this company Admin diagram.

## Source evidence

Paths are relative to the repository; anchors/line numbers refer to this source revision. SQL files were inspected as text only; nothing was executed against Supabase.

| Source | Location / anchor | Evidence |
| --- | --- | --- |
${sourceRows.map(([file,location,note])=>'| ['+file+'](../../../../'+file+') | '+location+' | '+note+' |').join('\n')}

## Verification boundary

The diagram is source-verified. No live sign-in, production session, private data, database call, migration, Edge Function, deployment, commit or push was performed. Current production installation, active Admin records, deployed RPC/policy versions, network behavior and real email/session expiration still require manual verification in an authorized test environment.

An existing Auth session can skip credential entry and go directly through profile restoration. Recovery/invitation links are processed before ordinary restoration. Forgot password, password visibility, offline demo and all role routing remain implemented as before; this overview intentionally focuses on interactive company Admin sign-in and common navigation rather than detailing those separate workflows. Page 1 does not claim that every application open forces new credentials.

## Notation and validation

Start/End use ovals; system actions use rectangles; user input/display uses parallelograms; branching questions use diamonds; same-page continuations use small circles; page/module destinations use pentagons. All diagram symbols have white fill and dark outlines. Main flow descends and module exits progress right. The shared module-choice trunk is intentional; unrelated crossing lines, diagonal arrows, overlapping symbols and dangling actual transitions are rejected by validation.

Structural, actual text-geometry and native PDF/PNG validation results are stored in [Validation](Validation/). The baseline covers all ${baseline.files.length} pre-existing tracked and untracked files, including previous flowchart revisions. Scope checks verify those files remain unchanged and that every new file is inside this folder.

**Stop at Stage 1. Individual Admin module flowcharts are PLANNED - STAGE 2 and require the user's next approval.**
`;
write(stem+'_Explanation.md',explanation);
console.log(JSON.stringify({generated:'Editable source, explanation and page SVGs',...structural},null,2));
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'Main Admin documentation build failed.' }
