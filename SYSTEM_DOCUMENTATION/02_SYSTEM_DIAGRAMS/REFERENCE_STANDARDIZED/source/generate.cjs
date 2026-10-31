// Documentation renderer: never imports or executes application code.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.cwd(),OUT=path.resolve(__dirname,'..');
const {createCanvas}=require(path.join(ROOT,'tests/node_modules/@napi-rs/canvas'));
const measure=createCanvas(10,10).getContext('2d');
const W=1600,H=2635,TOP=220,LIMIT=2350,MAIN=485,SIDE=1230,GAP=48;
const roles=[{id:'admin',folder:'ADMIN',label:'Admin'},{id:'engineer',folder:'ENGINEER_ARCHITECT',label:'Engineer / Architect'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attr=s=>esc(s).replace(/\n/g,'&#xa;');
const write=(rel,data)=>{const file=path.resolve(OUT,rel);if(!file.startsWith(OUT+path.sep))throw Error('Outside documentation');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
const width=(s,font=30)=>{measure.font=font+'px Arial';return measure.measureText(s).width;};
function wrap(text,max,font=30){return String(text).split('\n').flatMap(line=>{const lines=[];let current='';const words=line.split(/\s+/).flatMap(word=>width(word,font)>max?word.split(/(?<=[/-])/):[word]);for(const word of words){if(width((current?current+' ':'')+word,font)>max&&current){lines.push(current);current='';}current+=(current?' ':'')+word;}lines.push(current);return lines;});}
let codeCount=0;
function letters(n){let s='';do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
const connectors=[];
function connector(context){const item={code:letters(codeCount++),context,ends:[]};connectors.push(item);return item;}
function size(raw,side=false){const type=raw.type,font=['onpage','offpage'].includes(type)?28:30;
 const w=type==='offpage'?100:type==='onpage'?64:side?490:type==='decision'?680:type==='terminator'?560:700;
 const max=type==='decision'?360:type==='offpage'?90:type==='onpage'?60:w-(type==='io'?105:type==='terminator'?110:60);
 const lines=wrap(raw.text,max,font),lh=36;
 const h=type==='offpage'?86:type==='onpage'?64:type==='decision'?Math.max(230,lines.length*70+45):type==='terminator'?Math.max(92,lines.length*lh+50):Math.max(105,lines.length*lh+38);
 return {...raw,font,lines,lh,w,h};
}
function page(flow,title){const p={number:flow.pages.length+1,title,nodes:[],edges:[]};p.id=flow.id+'_P'+String(p.number).padStart(2,'0');flow.pages.push(p);return p;}
function node(p,raw,cx,y,side=false){const n={...size(raw,side),id:'n'+(p.nodes.length+1),x:0,y};n.x=cx-n.w/2;p.nodes.push(n);return n;}
function edge(p,a,b,label='',direction='down'){
 const pts=direction==='right'?[[a.x+a.w,a.y+a.h/2],[b.x,b.y+b.h/2]]:[[a.x+a.w/2,a.y+a.h],[b.x+b.w/2,b.y]];
 p.edges.push({id:'e'+(p.edges.length+1),from:a.id,to:b.id,label,direction,points:pts});
}
function port(flow,p,con,direction,y,cx=MAIN){const n=node(p,{type:'offpage',text:con.code,connector:con.code,direction},cx,y);con.ends.push({flow:flow.id,page:p.number,node:n.id,direction});return n;}
function note(p,x,y,text,max=600,font=25){p.notes??=[];const lines=wrap(text,max,font);p.notes.push({x,y,font,lines});}
function estimate(raw){const n=size(raw),branch=raw.type==='decision'?size({type:'io',text:(raw.no||['Show validation or load failure.']).join('\n')},true):null;return Math.max(n.h,branch?n.h/2+branch.h/2+GAP+100:0)+GAP;}
const retryCheckpoint={type:'io',text:'Continue with current screen / retained form;\nretry as directed by the displayed feedback.'};
function needsCheckpoint(part){const q=part.findIndex(s=>s.type==='decision'&&s.retry),input=part.findIndex(s=>s.type==='io');return q>=0&&(input<0||q<input);}
function chunk(steps,reserve=300){
 const groups=[];for(let i=0;i<steps.length;i++){const group=[steps[i]];if(steps[i].type==='process'){while(steps[i+1]?.type==='process')group.push(steps[++i]);if(steps[i+1]?.type==='decision')group.push(steps[++i]);}groups.push(group);}
 const result=[];let current=[];
 const cost=part=>reserve+part.reduce((s,x)=>s+estimate(x),0)+(result.length&&needsCheckpoint(part)?estimate(retryCheckpoint):0);
 for(const group of groups){if(current.length&&cost([...current,...group])>LIMIT-TOP-210){result.push(current);current=[];}current.push(...group);}
 if(current.length)result.push(current);return result.map((part,i)=>i&&needsCheckpoint(part)?[retryCheckpoint,...part]:part);
}
function chain(flow,steps,{entry,title,finalText,exit=null,start=false}){
 if(finalText)steps=[...steps,{type:'io',text:finalText}];
 const chunks=chunk(steps);let incoming=entry;
 for(let ci=0;ci<chunks.length;ci++){
  const part=chunks[ci],p=page(flow,title+(chunks.length>1?' - '+(ci+1)+' / '+chunks.length:''));
  let previous=start&&ci===0?node(p,{type:'terminator',text:'START'},MAIN,TOP):port(flow,p,incoming,'in',TOP);
  if(previous.type==='offpage')note(p,MAIN+75,TOP+32,'From '+incoming.context,900,24);
  let y=previous.y+previous.h+GAP;let retryTarget,lastProcess,localCode=1;
  for(const raw of part){
   const n=node(p,raw,MAIN,y);edge(p,previous,n,previous.type==='decision'?'Yes':'');
   if(raw.type==='io'||(!retryTarget&&ci===0))retryTarget=n;
   if(raw.type==='process')lastProcess=n;
   let bottom=n.y+n.h;
   if(raw.type==='decision'){
    const noText=(raw.no?.length?raw.no:['Display validation / load failure.']).join('\n');
    const errorSize=size({type:'io',text:noText},true),err=node(p,{type:'io',text:noText},SIDE,n.y+n.h/2-errorSize.h/2,true);
    edge(p,n,err,'No','right');
    let terminal;
    const target=raw.retryTarget==='previous-process'?lastProcess:retryTarget;
    if(raw.retry&&target){
     const code=String(localCode++),incomingCircle=node(p,{type:'onpage',text:code,connector:code,direction:'in'},62,target.y+target.h/2-32);
     // Several validation retries can share a target input, but each has its own numbered pair.
     if(p.nodes.some(a=>a!==incomingCircle&&a.type==='onpage'&&a.direction==='in'&&Math.abs(a.y-incomingCircle.y)<70)){
      p.nodes.pop();
      const existing=p.nodes.find(a=>a.type==='onpage'&&a.direction==='in'&&a.target===target.id);
      if(existing){terminal=node(p,{type:'onpage',text:existing.text,connector:existing.text,direction:'out'},SIDE,err.y+err.h+GAP);}
      else throw Error('Retry target collision');
     }else{
      incomingCircle.target=target.id;edge(p,incomingCircle,target,'','right');
      terminal=node(p,{type:'onpage',text:code,connector:code,direction:'out'},SIDE,err.y+err.h+GAP);
     }
    }else if(raw.retry)throw Error('Missing retained retry checkpoint '+flow.id+'/'+p.title);
    else terminal=node(p,{type:'terminator',text:'END ATTEMPT'},SIDE,err.y+err.h+GAP,true);
    edge(p,err,terminal);bottom=Math.max(bottom,terminal.y+terminal.h);
   }
   previous=n;y=bottom+GAP;
  }
  if(ci<chunks.length-1){const next=connector(flow.title+' / '+title+' continuation');const n=port(flow,p,next,'out',y);edge(p,previous,n,previous.type==='decision'?'Yes':'');note(p,MAIN+75,y+30,'Continue on next page',850,24);incoming=next;}
  else if(exit){const n=port(flow,p,exit,'out',y);edge(p,previous,n,previous.type==='decision'?'Yes':'');note(p,MAIN+75,y+30,'Continue to '+exit.context,850,24);}
  else{
   const n=node(p,{type:'terminator',text:'END'},MAIN,y);edge(p,previous,n,previous.type==='decision'?'Yes':'');
  }
 }
}
function menu(flow,items,{entry,title,returnTo}){
 const pages=[];let incoming=entry;
 for(let i=0;i<items.length;i+=4){
  const p=page(flow,title+' - '+(i/4+1));pages.push(p);let prev=port(flow,p,incoming,'in',TOP);note(p,MAIN+75,TOP+32,'From '+incoming.context,900,24);let y=TOP+prev.h+GAP;
  for(const item of items.slice(i,i+4)){
   const d=node(p,{type:'decision',text:item.text.endsWith('?')?item.text:item.text+'?'},MAIN,y);edge(p,prev,d,prev.type==='decision'?'No':'');
   const out=port(flow,p,item.entry,'out',d.y+d.h/2-43,1085);edge(p,d,out,'Yes','right');
   note(p,1160,out.y+28,'Continue: '+item.targetLabel,370,24);prev=d;y=d.y+d.h+GAP;
  }
  const next=i+4<items.length?connector(flow.title+' / '+title+' next choices'):returnTo;
  const out=port(flow,p,next,'out',y);edge(p,prev,out,prev.type==='decision'?'No':'');note(p,MAIN+75,y+30,i+4<items.length?'More choices on next page':'Use workspace navigation to return',850,24);incoming=next;
 }
 return pages;
}
function shape(n){const {x,y,w,h,type}=n,c='stroke="black" stroke-width="2.5" fill="white"';
 if(type==='terminator')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${c}/>`;
 if(type==='onpage')return `<circle cx="${x+w/2}" cy="${y+h/2}" r="${w/2}" ${c}/>`;
 if(type==='decision')return `<polygon points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}" ${c}/>`;
 if(type==='io')return `<polygon points="${x+38},${y} ${x+w},${y} ${x+w-38},${y+h} ${x},${y+h}" ${c}/>`;
 if(type==='offpage')return `<polygon points="${x},${y} ${x+w},${y} ${x+w},${y+h-28} ${x+w/2},${y+h} ${x},${y+h-28}" ${c}/>`;
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${c}/>`;
}
function textAt(lines,x,y,font,anchor='start',extra=''){return `<text x="${x}" y="${y}" font-size="${font}" text-anchor="${anchor}" ${extra}>${lines.map((s,i)=>`<tspan x="${x}" dy="${i?font*1.2:0}">${esc(s)}</tspan>`).join('')}</text>`;}
function annotations(f,p){return[
 {x:80,y:55,font:26,lines:['SITETRACE (MCPA) - '+f.role]},
 {x:80,y:105,font:36,lines:wrap(f.title,W-160,36)},
 {x:80,y:177,font:25,lines:wrap('Page '+p.number+' of '+f.pages.length+' | '+p.title,W-160,25)},
 {x:80,y:H-55,font:22,lines:['21 October 2026 | Source-verified documentation | '+f.id+' | Legal portrait']},
 ...(p.notes||[])
 ];}
function svg(f,p){return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>${esc(f.role+' / '+f.title+' / page '+p.number)}</title><desc>${esc(p.title)}</desc><defs><marker id="arrow" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 11 5 L 0 10 Z" fill="black"/></marker></defs><rect width="${W}" height="${H}" fill="white"/><g font-family="Arial, sans-serif" fill="black">${annotations(f,p).map(a=>textAt(a.lines,a.x,a.y,a.font)).join('')}${p.edges.map(e=>{const [a,b]=e.points;return `<polyline data-edge="${e.id}" points="${e.points.map(v=>v.join(',')).join(' ')}" fill="none" stroke="black" stroke-width="2.5" marker-end="url(#arrow)"/>${e.label?textAt([e.label],e.direction==='right'?(a[0]+b[0])/2:a[0]+20,e.direction==='right'?a[1]-15:(a[1]+b[1])/2+8,26,e.direction==='right'?'middle':'start'):''}`;}).join('')}${p.nodes.map(n=>{const cy=n.y+n.h/2-(n.type==='offpage'?9:0),y=cy-(n.lines.length-1)*n.lh/2+10;return `<g data-node="${n.id}">${shape(n)}${textAt(n.lines,n.x+n.w/2,y,n.font,'middle')}</g>`;}).join('')}</g></svg>`;}
function drawio(f){const styles={terminator:'ellipse;',onpage:'ellipse;aspect=fixed;',decision:'rhombus;',io:'shape=parallelogram;fixedSize=1;size=38;',offpage:'shape=offPageConnector;size=0.326;',process:'rounded=0;'};
 return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" compressed="false" pages="${f.pages.length}" version="24.7.17">${f.pages.map(p=>`<diagram id="${p.id}" name="${attr('P'+p.number+' '+p.title)}"><mxGraphModel dx="${W}" dy="${H}" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="${W}" pageHeight="${H}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${annotations(f,p).map((a,i)=>`<mxCell id="a${i}" value="${attr(a.lines.join('\n'))}" style="text;html=0;whiteSpace=wrap;align=left;verticalAlign=top;fontFamily=Arial;fontSize=${a.font};fontColor=#000000;spacing=0;" vertex="1" parent="1"><mxGeometry x="${a.x}" y="${a.y-a.font}" width="${W-a.x-50}" height="${a.lines.length*a.font*1.2+10}" as="geometry"/></mxCell>`).join('')}${p.nodes.map(n=>`<mxCell id="${n.id}" value="${attr(n.lines.join('\n'))}" style="${styles[n.type]}html=0;whiteSpace=wrap;align=center;verticalAlign=middle;spacing=0;${n.type==='offpage'?'spacingBottom=18;':''}fontFamily=Arial;fontSize=${n.font};fontColor=#000000;strokeColor=#000000;fillColor=#ffffff;strokeWidth=2.5;" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`).join('')}${p.edges.map(e=>`<mxCell id="${e.id}" value="${attr(e.label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;endFill=1;strokeWidth=2.5;strokeColor=#000000;fontFamily=Arial;fontSize=26;fontColor=#000000;labelBackgroundColor=#ffffff;exitX=${e.direction==='right'?1:0.5};exitY=${e.direction==='right'?0.5:1};entryX=${e.direction==='right'?0:0.5};entryY=${e.direction==='right'?0.5:0};exitPerimeter=1;entryPerimeter=1;" edge="1" parent="1" source="${e.from}" target="${e.to}"><mxGeometry relative="1" as="geometry"/></mxCell>`).join('')}</root></mxGraphModel></diagram>`).join('')}</mxfile>`;
}
function validate(flows){const errors=[],counts={flows:flows.length,pages:0,nodes:0,decisions:0,edges:0,offPageCodes:connectors.length,onPageGroups:0};
 const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 for(const con of connectors){const ins=con.ends.filter(e=>e.direction==='in'),outs=con.ends.filter(e=>e.direction==='out');check(ins.length===1&&outs.length>=1,'Unmatched connector '+con.code);}
 for(const f of flows)for(const p of f.pages){counts.pages++;const local=new Map();for(const n of p.nodes){counts.nodes++;check(n.x>=20&&n.x+n.w<=W-20&&n.y>=TOP&&n.y+n.h<=LIMIT,f.id+'/'+p.number+' outside page '+n.id+' '+(n.y+n.h));if(n.type==='onpage'){const list=local.get(n.connector)||[];list.push(n);local.set(n.connector,list);}if(n.type==='decision'){counts.decisions++;const out=p.edges.filter(e=>e.from===n.id);check(out.length===2&&out.some(e=>e.label==='Yes')&&out.some(e=>e.label==='No'),f.id+' decision labels '+n.id);}}
  for(const [c,nodes]of local){counts.onPageGroups++;check(nodes.filter(n=>n.direction==='in').length===1&&nodes.some(n=>n.direction==='out'),f.id+' local connector '+c);}
  for(let i=0;i<p.nodes.length;i++)for(const b of p.nodes.slice(i+1)){const a=p.nodes[i];check(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h+5<=b.y||b.y+b.h+5<=a.y,f.id+'/'+p.number+' overlapping '+a.id+'/'+b.id);}
  for(const e of p.edges){counts.edges++;const [a,b]=e.points;check((a[0]===b[0]||a[1]===b[1])&&b[0]>=a[0]&&b[1]>=a[1],f.id+' non-forward edge');for(const n of p.nodes.filter(n=>n.id!==e.from&&n.id!==e.to)){const hit=a[0]===b[0]?a[0]>n.x&&a[0]<n.x+n.w&&Math.max(a[1],b[1])>n.y&&Math.min(a[1],b[1])<n.y+n.h:a[1]>n.y&&a[1]<n.y+n.h&&Math.max(a[0],b[0])>n.x&&Math.min(a[0],b[0])<n.x+n.w;check(!hit,f.id+'/'+p.number+' edge crosses shape '+e.id+'/'+n.id);}}
  for(let i=0;i<p.edges.length;i++)for(const b of p.edges.slice(i+1)){const a=p.edges[i];if(a.from===b.from||a.to===b.to||a.from===b.to||a.to===b.from)continue;const av=a.points[0][0]===a.points[1][0],bv=b.points[0][0]===b.points[1][0];let hit=false;if(av!==bv){const v=av?a:b,h=av?b:a;hit=v.points[0][0]>=h.points[0][0]&&v.points[0][0]<=h.points[1][0]&&h.points[0][1]>=v.points[0][1]&&h.points[0][1]<=v.points[1][1];}check(!hit,f.id+'/'+p.number+' crossing arrows '+a.id+'/'+b.id);}
 }
 // Physical edges plus explicitly matched continuation jumps must reach every node from role START.
 const graph=[],all=new Map();for(const f of flows)for(const p of f.pages){const k=n=>f.id+'/'+p.number+'/'+n;for(const n of p.nodes)all.set(k(n.id),n);for(const e of p.edges)graph.push([k(e.from),k(e.to)]);for(const n of p.nodes.filter(n=>n.type==='onpage'&&n.direction==='out')){const dest=p.nodes.find(m=>m.type==='onpage'&&m.direction==='in'&&m.connector===n.connector);if(dest)graph.push([k(n.id),k(dest.id)]);}}
 for(const c of connectors){const dest=c.ends.find(e=>e.direction==='in');if(dest)for(const src of c.ends.filter(e=>e.direction==='out'))graph.push([src.flow+'/'+src.page+'/'+src.node,dest.flow+'/'+dest.page+'/'+dest.node]);}
 const visit=(starts,reverse=false)=>{const seen=new Set(starts),todo=[...starts],adj=new Map();for(const e of graph){const a=e[reverse?1:0],b=e[reverse?0:1];if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}while(todo.length)for(const n of adj.get(todo.pop())||[])if(!seen.has(n)){seen.add(n);todo.push(n);}return seen;};
 const reached=visit([...all].filter(([,n])=>n.text==='START').map(([k])=>k)),finished=visit([...all].filter(([,n])=>n.type==='terminator'&&n.text.startsWith('END')).map(([k])=>k),true);
 for(const [k,n]of all){check(reached.has(k),'Unreachable '+k);check(finished.has(k),'No end reachable '+k);}
 const result={passed:errors.length===0,...counts,errors,checks:['All decisions have Yes/No','Top-to-bottom process; left-to-right branches','No overlapping shapes, crossing arrows or arrows through shapes','Every off-page code has one destination and all references match','Local numeric connectors match within a page','All nodes reachable from role Start and can reach an End']};write('validation/Structure.json',JSON.stringify(result,null,2));if(errors.length)throw Error(errors.slice(0,30).join('\n'));return result;
}
const content=['authentication','admin-operational','field-operational','support-workflows'].flatMap(file=>require('./'+file+'.cjs'));
for(const m of content){if(!m.actions?.length)throw Error('No actions '+m.key);for(const s of m.sources||[])if(!fs.existsSync(path.join(ROOT,s.path)))throw Error('Missing source '+s.path);}
const flows=[];
for(const role of roles){
 const modules=content.filter(m=>m.roles.includes(role.id)).map(m=>({...m,actions:m.actions.filter(a=>!a.roles||a.roles.includes(role.id))}));
 if(new Set(modules.map(m=>m.key)).size!==modules.length)throw Error('Duplicate module key '+role.id);
 const dashboard=connector(role.label+' workspace modules');
 const main={id:role.folder+'_MAIN',role:role.label,title:'Main role flowchart',key:'main',folder:role.folder+'/00_MAIN',pages:[],sources:[{path:'js/auth.js',line:115,note:'Authentication and profile verification.'},{path:'js/permissions.js',line:6,note:'Route and action whitelist.'},{path:'js/navigation.js',line:7,note:'Menu construction filters route permissions.'}],notes:[],actionCount:0};flows.push(main);
 const entries=new Map(modules.map(m=>[m.key,connector(role.label+' / '+m.title)]));
 const loginSteps=[{type:'io',text:'Open SiteTrace; enter email and password,\nor restore an existing Auth session.'},{type:'process',text:'Restore Auth session or submit signInWithPassword.'},{type:'decision',text:'Authentication\nsuccessful?',no:['Show normal sign-in for no session.\nShow feedback for a failed submitted login.'],retry:true},{type:'process',text:'Read authorized company profile\nusing mcpa_my_profile.'},{type:'decision',text:'Active, authorized\ncompany profile?',no:['Show inactive/unauthorized profile or\nverification feedback; contact Admin.']},{type:'process',text:'Switch movement store to live mode; build\n'+role.label+' menus; initialize monitoring.'},{type:'io',text:'Display Dashboard, or a permitted\ninitial route requested by the user.'}];
 chain(main,loginSteps,{title:'Login to Dashboard',start:true,exit:dashboard});
 menu(main,modules.map(m=>({text:m.key==='authentication'?'Use sign-in help, email callback or sign-out':'Open '+m.title,entry:entries.get(m.key),targetLabel:m.title})),{entry:dashboard,title:'Available modules and entry events',returnTo:dashboard});
 main.notes.push('This role chart assumes the verified company profile is '+(role.id==='admin'?'Admin.':'Engineer or Architect; those roles share permissions.')+' Other supported profile roles are outside the requested documentation scope. Authentication choices describe sign-in/help/callback/account-menu events; they are not an authenticated route.');
 let index=1;
 for(const m of modules){
  const f={id:role.folder+'_'+m.key.toUpperCase().replace(/[^A-Z0-9]/g,'_'),role:role.label,title:m.title,key:m.key,folder:role.folder+'/'+String(index++).padStart(2,'0')+'_'+m.key.replace(/[^a-z0-9_-]/gi,'_'),pages:[],sources:m.sources,notes:m.notes||[],actionCount:m.actions.length};flows.push(f);
  const entriesAction=m.actions.map(a=>connector(role.label+' / '+m.title+' / '+a.title));
  menu(f,m.actions.map((a,i)=>({text:a.title,entry:entriesAction[i],targetLabel:'action pages'})),{entry:entries.get(m.key),title:'Action selection',returnTo:dashboard});
  m.actions.forEach((a,i)=>chain(f,a.steps,{entry:entriesAction[i],title:a.title,finalText:a.outcome}));
 }
}
// Add exact destination references to every lettered pentagon.
for(const c of connectors){const dest=c.ends.find(e=>e.direction==='in');if(!dest)continue;for(const end of c.ends){const f=flows.find(f=>f.id===end.flow),p=f.pages[end.page-1],n=p.nodes.find(n=>n.id===end.node);if(end.direction==='out'){if(n.x>1100)note(p,1000,n.y+126,'Retry: '+dest.flow.replace(/_/g,' ')+' / P'+dest.page,500,19);else note(p,n.x+n.w+22,n.y+75,'To '+dest.flow.replace(/_/g,' ')+' / P'+dest.page,Math.min(650,W-n.x-n.w-80),19);}}}
const validation=validate(flows);
for(const f of flows){write(f.folder+'/'+f.id+'.drawio',drawio(f));for(const p of f.pages)write(f.folder+'/'+p.id+'.svg',svg(f,p));
 write(f.folder+'/Evidence.md','# '+f.role+' - '+f.title+'\n\n'+(f.notes||[]).map(n=>'- '+n).join('\n')+'\n\n## Source evidence\n\n'+f.sources.map(s=>'- ['+s.path+':'+s.line+']('+path.relative(path.join(OUT,f.folder),path.join(ROOT,s.path)).replace(/\\/g,'/')+'#L'+s.line+'): '+s.note).join('\n')+'\n');
}
// Role atlases contain the same editable pages so all module continuations travel within one file.
for(const role of roles){const group=flows.filter(f=>f.role===role.label);write(role.folder+'/SiteTrace_'+role.folder+'_Complete_Atlas.drawio','<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" compressed="false" pages="'+group.reduce((s,f)=>s+f.pages.length,0)+'" version="24.7.17">'+group.map(f=>drawio(f).replace(/^.*?<mxfile[^>]*>/s,'').replace(/<\/mxfile>$/,'').replace(/<diagram id="([^"]+)" name="[^"]*">/g,(_,id)=>'<diagram id="'+id+'" name="'+attr(f.key+' / P'+f.pages.find(p=>p.id===id).number+' / '+f.title)+'">')).join('')+'</mxfile>');}
write('validation/Model.json',JSON.stringify({width:W,height:H,paper:'US Legal portrait (612 x 1008 pt)',date:'2026-10-21',flows,connectors},null,2));
const roleRoutes={admin:['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','consumables','purchase','reports','activity','users','settings'],engineer:['dashboard','masterlist','tool-profile','sites','site-detail','request','transfer','return','repair','missing','activity','settings']};
for(const role of roles)for(const route of roleRoutes[role.id])if(!flows.some(f=>f.role===role.label&&f.key===route))throw Error('Missing implemented route '+role.label+'/'+route);
write('validation/Coverage.json',JSON.stringify({roles:roles.map(r=>r.label),permissionRoutes:roleRoutes,modules:flows.map(f=>({role:f.role,module:f.key,actions:f.actionCount,pages:f.pages.length,folder:f.folder})),sourceRolesOutsideUserScope:['secretary','tool_handler'],engineerArchitectSamePermissions:true},null,2));
console.log(JSON.stringify(validation));
