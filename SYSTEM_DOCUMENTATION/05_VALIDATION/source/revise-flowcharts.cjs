// Generate only new documentation assets; originals and application files are never written.
const fs=require('node:fs'),path=require('node:path');
const {out,root,write,esc,xml}=require('./build.cjs');
const content=require('./revised-workflow-content.cjs');
const folder='02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams';
const W=1500,H=2180,mainX=550,sideX=1240,gap=53;
const baseline=JSON.parse(fs.readFileSync(path.join(out,'05_VALIDATION/Flowchart_Revision_Baseline.json')));
const revision=baseline.commit.slice(0,7);
function wrap(text,max){return text.split('\n').flatMap(line=>{const a=[];let s='';for(const word of line.split(' ')){if(s.length+word.length+1>max&&s){a.push(s);s='';}s+=(s?' ':'')+word;}a.push(s);return a;});}
function node(raw,id,cx,y,side=false){
 const type=raw.type,lines=wrap(raw.text,side?(type==='terminator'?24:25):(type==='decision'?28:type==='offpage'?42:46));
 const font=type==='onpage'?30:side?27:type==='decision'?28:type==='offpage'?28:30;
 const lh=font*1.22;
 const width=type==='onpage'?84:side?410:type==='decision'?740:type==='terminator'?680:type==='offpage'?660:760;
 const height=type==='onpage'?84:type==='decision'?260:type==='terminator'?Math.max(100,lines.length*lh+26):type==='offpage'?Math.max(164,lines.length*lh+64):Math.max(120,lines.length*lh+42);
 return {...raw,id,lines,font,lh,x:cx-width/2,y,w:width,h:height,side};
}
const terminal=n=>n.type==='terminator'&&n.text.startsWith('End')||['onpage','offpage'].includes(n.type)&&n.direction==='out';
function layout(f){return {...f,width:W,height:H,pages:f.pages.map((page,pi)=>{
 const nodes=[],edges=[];let sequence=0,y=190;
 const add=(raw,cx,top,side)=>{const n=node(raw,`p${pi+1}n${++sequence}`,cx,top,side);nodes.push(n);return n;};
 const link=(a,b,label='',horizontal=false)=>{if(terminal(a))throw Error('Physical arrow after exit '+a.id);const pts=horizontal?[[a.x+a.w,a.y+a.h/2],[b.x,b.y+b.h/2]]:[[a.x+a.w/2,a.y+a.h],[b.x+b.w/2,b.y]];edges.push({id:`p${pi+1}e${edges.length+1}`,from:a.id,to:b.id,label,points:pts,horizontal});};
 let previous,previousBranchBottom=0;
 for(const raw of page.nodes){
  let draft=node(raw,'',mainX,y);
  if(raw.type==='decision'&&draft.y+draft.h/2-100<previousBranchBottom+40)y+=previousBranchBottom+140-(draft.y+draft.h/2);
  const n=add(raw,mainX,y,false);if(previous)link(previous,n,previous.type==='decision'?previous.yes:'');
  if(raw.type==='decision'){
   let prev,top=n.y+n.h/2;
   for(const [bi,b]of raw.no.entries()){
    const pre=node(b,'',sideX,0,true);const branch=add(b,sideX,bi?top:n.y+n.h/2-pre.h/2,true);
    link(prev||n,branch,bi?'':raw.noLabel,!bi);prev=branch;top=branch.y+branch.h+gap;
   }
   if(!prev||!terminal(prev))throw Error('Decision branch must reach End or connector: '+f.stem+' '+raw.text);
   previousBranchBottom=top-gap;
  }
  previous=n;y=n.y+n.h+gap;
 }
 for(const chain of page.extras){let prev,top=Math.max(previousBranchBottom+90,1430);for(const raw of chain){const n=add(raw,sideX,top,true);if(prev)link(prev,n);prev=n;top=n.y+n.h+gap;}previousBranchBottom=top-gap;}
 const bottom=Math.max(...nodes.map(n=>n.y+n.h));
 return {...page,number:pi+1,id:f.stem+'_P'+String(pi+1).padStart(2,'0'),nodes,edges,bottom};
 })};}
function shape(n){const {x,y,w,h,type}=n;const common='stroke="#203e53" stroke-width="3" fill="'+(type==='decision'?'#fff7e5':type==='onpage'?'#203e53':type==='offpage'?'#edf2f7':'#ffffff')+'"';
 if(type==='terminator')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${common}/>`;
 if(type==='onpage')return `<circle cx="${x+w/2}" cy="${y+h/2}" r="${w/2}" ${common}/>`;
 if(type==='decision')return `<polygon points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}" ${common}/>`;
 if(type==='io')return `<polygon points="${x+36},${y} ${x+w},${y} ${x+w-36},${y+h} ${x},${y+h}" ${common}/>`;
 if(type==='offpage')return `<polygon points="${x},${y} ${x+w},${y} ${x+w},${y+h-42} ${x+w/2},${y+h} ${x},${y+h-42}" ${common}/>`;
 return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${common}/>`;
}
function label(n){const cy=n.y+n.h/2-(n.type==='offpage'?14:0),start=cy-(n.lines.length-1)*n.lh/2;
 return `<text data-node="${n.id}" text-anchor="middle" fill="${n.type==='onpage'?'white':'#162e40'}" font-size="${n.font}" font-weight="${['decision','onpage','terminator'].includes(n.type)?600:400}">${n.lines.map((s,i)=>`<tspan x="${n.x+n.w/2}" y="${start+i*n.lh}" dominant-baseline="central">${esc(s)}</tspan>`).join('')}</text>`;
}
function annotations(f,page){return[
 {x:65,y:48,text:'SITETRACE / MCPA',font:22,color:'#526578'},
 {x:65,y:98,text:f.title,font:40,color:'#153952'},
 {x:65,y:142,text:`${page.number} / ${f.pages.length}  ·  ${page.title}`,font:27,color:'#526578'},
 ...wrap(page.note,118).map((s,i)=>({x:65,y:2050+i*29,text:s,font:23,color:'#41556a'})),
 {x:65,y:2160,text:`Source-reviewed ${revision} · 20 Oct 2026 · Main flow ↓ / branches → · Paired circles: same page / pentagons: named page`,font:19,color:'#526578'}
 ];}
function svg(f,page){return xml(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">${esc(f.title)} — page ${page.number}</title><desc id="desc">${esc(page.title+'. '+page.note)}</desc><defs><marker id="arrow" markerWidth="13" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 11 5 L 0 10 Z" fill="#203e53"/></marker></defs><rect width="${W}" height="${H}" fill="white"/><g font-family="Arial, sans-serif">${annotations(f,page).map(a=>`<text x="${a.x}" y="${a.y}" font-size="${a.font}" fill="${a.color}">${esc(a.text)}</text>`).join('')}<line x1="65" x2="1435" y1="163" y2="163" stroke="#ced8df" stroke-width="2"/>${page.edges.map(e=>`<polyline data-edge="${e.id}" points="${e.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#203e53" stroke-width="3" marker-end="url(#arrow)"/>${e.label?`<text x="${e.horizontal?(e.points[0][0]+e.points[1][0])/2:e.points[0][0]+30}" y="${e.horizontal?e.points[0][1]-14:(e.points[0][1]+e.points[1][1])/2+7}" font-size="26" font-weight="600" fill="#203e53" text-anchor="${e.horizontal?'middle':'start'}">${esc(e.label)}</text>`:''}`).join('')}${page.nodes.map(n=>`<g data-shape="${n.id}">${shape(n)}${label(n)}</g>`).join('')}</g></svg>`);}
const attr=s=>esc(s).replace(/\n/g,'&#xa;');
function drawio(f){return xml(`<mxfile host="app.diagrams.net" agent="SiteTrace documentation revision" version="24.7.17" compressed="false" pages="${f.pages.length}">${f.pages.map(page=>`<diagram id="${page.id}" name="${attr('P'+page.number+' · '+page.title)}"><mxGraphModel dx="${W}" dy="${H}" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="${W}" pageHeight="${H}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${annotations(f,page).map((a,i)=>`<mxCell id="annotation${i}" value="${attr(a.text)}" style="text;html=0;align=left;verticalAlign=middle;whiteSpace=wrap;fontFamily=Arial;fontSize=${a.font};fontColor=${a.color};" vertex="1" parent="1"><mxGeometry x="${a.x}" y="${a.y-a.font}" width="1370" height="${a.font+10}" as="geometry"/></mxCell>`).join('')}${page.nodes.map(n=>{const styles={terminator:'ellipse;',onpage:'ellipse;aspect=fixed;',decision:'rhombus;',io:'shape=parallelogram;fixedSize=1;size=36;',offpage:'shape=offPageConnector;',process:'rounded=0;'};return `<mxCell id="${n.id}" value="${attr(n.lines.join('\n'))}" style="${styles[n.type]}html=0;whiteSpace=wrap;align=center;verticalAlign=middle;spacing=12;${n.type==='offpage'?'spacingBottom=28;':''}fontFamily=Arial;fontSize=${n.font};fontStyle=${['decision','onpage','terminator'].includes(n.type)?1:0};strokeColor=#203e53;strokeWidth=3;fillColor=${n.type==='decision'?'#fff7e5':n.type==='onpage'?'#203e53':n.type==='offpage'?'#edf2f7':'#ffffff'};fontColor=${n.type==='onpage'?'#ffffff':'#162e40'};" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;}).join('')}${page.edges.map(e=>`<mxCell id="${e.id}" value="${attr(e.label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;endFill=1;strokeWidth=3;strokeColor=#203e53;fontFamily=Arial;fontSize=26;fontStyle=1;labelBackgroundColor=#ffffff;exitX=${e.horizontal?1:0.5};exitY=${e.horizontal?0.5:1};entryX=${e.horizontal?0:0.5};entryY=${e.horizontal?0.5:0};exitPerimeter=1;entryPerimeter=1;" edge="1" parent="1" source="${e.from}" target="${e.to}"><mxGeometry relative="1" as="geometry"/></mxCell>`).join('')}</root></mxGraphModel></diagram>`).join('')}</mxfile>`);}
function validate(flows){const errors=[],counts={workflows:flows.length,pages:0,nodes:0,decisions:0,arrows:0,onPagePairs:0,offPagePairs:0};const assert=(ok,msg)=>{if(!ok)errors.push(msg);};
 for(const f of flows){const all=new Map(),physical=[],pairs=new Map();let starts=[];
  for(const source of f.sources)assert(fs.existsSync(path.join(root,source)),f.stem+' missing source '+source);
  for(const page of f.pages){counts.pages++;const byId=new Map(page.nodes.map(n=>[n.id,n]));
   for(const n of page.nodes){const key=page.number+':'+n.id;all.set(key,n);counts.nodes++;if(n.text.startsWith('Start ·'))starts.push(key);
    if(n.type==='decision'){counts.decisions++;const next=page.edges.filter(e=>e.from===n.id);assert(n.text.endsWith('?')&&next.length===2&&new Set(next.map(e=>e.label)).size===2&&next.every(e=>e.label),f.stem+' invalid decision '+key);}
    if(['onpage','offpage'].includes(n.type)){const pk=n.type+':'+(n.type==='onpage'?page.number+':':'')+n.ref;if(!pairs.has(pk))pairs.set(pk,[]);pairs.get(pk).push({key,n,page:page.number});}
    assert(n.x>=30&&n.x+n.w<=W-30&&n.y>=180&&n.y+n.h<=2000,f.stem+' out-of-page shape '+key);
   }
   for(let i=0;i<page.nodes.length;i++)for(const b of page.nodes.slice(i+1)){const a=page.nodes[i];assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h+8<=b.y||b.y+b.h+8<=a.y,f.stem+' overlapping shapes '+a.id+' / '+b.id);}
   for(const e of page.edges){counts.arrows++;assert(byId.has(e.from)&&byId.has(e.to),f.stem+' dangling arrow '+e.id);physical.push([page.number+':'+e.from,page.number+':'+e.to]);
    for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];assert((a[0]===b[0]||a[1]===b[1])&&b[0]>=a[0]&&b[1]>=a[1],f.stem+' diagonal / backward line '+e.id);for(const n of page.nodes.filter(n=>n.id!==e.from&&n.id!==e.to)){const hits=a[0]===b[0]?a[0]>n.x&&a[0]<n.x+n.w&&Math.max(a[1],b[1])>n.y&&Math.min(a[1],b[1])<n.y+n.h:a[1]>n.y&&a[1]<n.y+n.h&&Math.max(a[0],b[0])>n.x&&Math.min(a[0],b[0])<n.x+n.w;assert(!hits,f.stem+' arrow intersects shape '+e.id+' / '+n.id);}}
   }
   for(let i=0;i<page.edges.length;i++)for(const b of page.edges.slice(i+1)){const a=page.edges[i];if(a.from===b.from||a.to===b.to||a.from===b.to||a.to===b.from)continue;const [a0,a1]=a.points,[b0,b1]=b.points;const av=a0[0]===a1[0],bv=b0[0]===b1[0];let hit=false;if(av!==bv){const v=av?a:b,h=av?b:a;hit=v.points[0][0]>=h.points[0][0]&&v.points[0][0]<=h.points[1][0]&&h.points[0][1]>=v.points[0][1]&&h.points[0][1]<=v.points[1][1];}else if(av)hit=a0[0]===b0[0]&&Math.max(a0[1],b0[1])<Math.min(a1[1],b1[1]);else hit=a0[1]===b0[1]&&Math.max(a0[0],b0[0])<Math.min(a1[0],b1[0]);assert(!hit,f.stem+' crossing lines '+a.id+' / '+b.id);}
  }
  const edges=[...physical];for(const [pk,list]of pairs){const a=list.find(x=>x.n.direction==='out'),b=list.find(x=>x.n.direction==='in');assert(list.length===2&&a&&b,f.stem+' unmatched connector '+pk);if(!a||!b)continue;if(a.n.type==='offpage'){counts.offPagePairs++;assert(a.page!==b.page&&a.n.page===b.page&&b.n.page===a.page,f.stem+' incorrect page continuation '+pk);}else counts.onPagePairs++;edges.push([a.key,b.key]);}
  const visit=(initial,reverse=false)=>{const seen=new Set(initial),todo=[...initial];while(todo.length){const x=todo.pop();for(const e of edges){const a=e[reverse?1:0],b=e[reverse?0:1];if(a===x&&!seen.has(b)){seen.add(b);todo.push(b);}}}return seen;};
  const reached=visit(starts),ends=[...all].filter(([,n])=>n.type==='terminator'&&n.text.startsWith('End ·')).map(([k])=>k),finished=visit(ends,true);
  for(const [key,n]of all){assert(reached.has(key),f.stem+' unreachable node '+key);assert(finished.has(key),f.stem+' no path to End '+key);const incoming=edges.filter(e=>e[1]===key),outgoing=edges.filter(e=>e[0]===key);assert(n.text.startsWith('Start ·')?incoming.length===0:incoming.length>0,f.stem+' invalid incoming '+key);assert(n.text.startsWith('End ·')?outgoing.length===0:outgoing.length>0,f.stem+' dangling path '+key);}
 }
 if(errors.length)throw Error(errors.join('\n'));return{passed:true,...counts,checks:['Correctly labeled two-way decision branches','Reachable from Start and able to reach End','Paired same-page circles and actual cross-page pentagons','Orthogonal forward arrows; retries use explicitly paired connectors','No overlapping shapes, arrow/shape intersections or crossing arrows','All cited source files exist']};
}
const flows=content.map(layout),validation=validate(flows);
for(const f of flows){write(folder+'/'+f.stem+'.drawio',drawio(f));for(const page of f.pages)write(folder+'/'+page.id+'.svg',svg(f,page));write(folder+'/'+f.stem+'.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(f.title)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:white}.sheet{break-after:page;width:190mm;height:277mm;display:flex;align-items:flex-start;justify-content:center}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:190mm;height:auto;max-height:277mm}@media screen{.sheet{width:${W}px;height:${H}px}.sheet svg{width:${W}px;height:${H}px;max-height:none}}</style></head><body>${f.pages.map(page=>'<section class="sheet">'+svg(f,page).replace(/^<\?xml[^>]*>/,'')+'</section>').join('')}</body></html>`);}
write('05_VALIDATION/Revised_Flowchart_Model.json',JSON.stringify({revision,flows},null,2));write('05_VALIDATION/Revised_Flowchart_Structure.json',JSON.stringify(validation,null,2));console.log(JSON.stringify(validation,null,2));
