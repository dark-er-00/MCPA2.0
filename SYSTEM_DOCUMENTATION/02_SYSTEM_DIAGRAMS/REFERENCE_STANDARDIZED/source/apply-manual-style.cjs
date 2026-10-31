'use strict';
// Visual revision only. The previous logical node/edge model is the invariant.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const U=require('./drawio-style-utils.cjs');
const ROOT=path.resolve(__dirname,'..'),STAGE=path.join(ROOT,'A4_REVISED');
const model=JSON.parse(fs.readFileSync(path.join(ROOT,'validation/Model.json')));
const refs=['00_Main','01_Authentication','02_Masterlist','03_Tool Profile','04_Request','05_Transfer','06_Returns'];
const end=n=>n.type==='terminator'&&/^END\b/.test(n.text);
// Manual wrapping also adds spaces around slashes and split hyphens.
const norm=s=>String(s||'').replace(/\s+/g,'');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function setEnd(c) {
 const g=c.geometry.attrs,cx=+g.x+ +g.width/2;
 g.x=String(cx-24.5);g.width='49';g.height='48';
 c.attrs.value='XX';
 U.setStyle(c,{shape:'offPageConnector',size:'0.326',html:'0',whiteSpace:'wrap',align:'center',verticalAlign:'middle',spacing:'0',spacingBottom:'10',fontFamily:'Arial',fontSize:'13',fontColor:'#000000',strokeColor:'#000000',fillColor:'#ffffff',strokeWidth:'2.5'});
}
function directIO(d) {
 const by=new Map(d.cells.map(c=>[c.attrs.id,c]));
 for(const c of d.cells.filter(c=>c.attrs.edge==='1')) {
  const s=U.style(c);
  for(const [key,side] of [['source','exit'],['target','entry']]) {
   const n=by.get(c.attrs[key]);if(!n||U.type(n)!=='io')continue;
   const g=U.geometry(n),y=+(s[side+'Y']??(side==='entry'?0:1)),x=+(s[side+'X']??0.5);
   // Draw.io's fixed-size parallelogram uses a 38px slant. Attach to its
   // actual sloping border, rather than the rectangular bounding box.
   if(y>0.05&&y<0.95&&(x<0.2||x>0.8)) {
    s[side+'X']=String(x<0.5?38*(1-y)/g.width:1-38*y/g.width);
    s[side+'Perimeter']='0';s[side+'Dx']='0';s[side+'Dy']='0';
   }
  }
  s.sourcePerimeterSpacing='0';s.targetPerimeterSpacing='0';s.perimeterSpacing='0';
  U.setStyle(c,s);
 }
}
function manual(flow,file) {
 const source=U.parseFile(file),pages=U.physicalPages(source);
 if(pages.length!==flow.pages.length)throw Error('Reference page count '+flow.id);
 const result={attrs:{host:'app.diagrams.net',compressed:'false'},diagrams:[]},corrections=[];
 for(let i=0;i<pages.length;i++) {
  const d=pages[i],baseline=flow.pages[i],shapes=d.cells.filter(c=>c.attrs.vertex==='1'&&U.type(c)!=='text'),arrows=d.cells.filter(c=>c.attrs.edge==='1');
  const matches=new Map(),used=new Set();
  const outgoing=c=>arrows.filter(e=>e.attrs.source===c.attrs.id).length;
  for(const n of baseline.nodes.filter(n=>!end(n))) {
   let candidates=shapes.filter(c=>!used.has(c.attrs.id)&&U.type(c)===n.type&&norm(c.attrs.value)===norm(n.text));
   if(candidates.length>1) {
    const wanted=baseline.edges.some(e=>e.from===n.id);
    const role=candidates.filter(c=>Boolean(outgoing(c))===wanted);if(role.length)candidates=role;
   }
   candidates.sort((a,b)=>+a.geometry.attrs.y- +b.geometry.attrs.y);
   if(!candidates.length)throw Error('Missing reference node '+flow.id+'/'+(i+1)+' '+n.id+' '+n.text);
   matches.set(n.id,candidates[0]);used.add(candidates[0].attrs.id);
  }
  for(const n of baseline.nodes.filter(end)) {
   const candidates=shapes.filter(c=>!used.has(c.attrs.id)&&['offpage','terminator'].includes(U.type(c)));
   const old=candidates.find(c=>/^END\b/.test(c.attrs.value)) || candidates.find(c=>!outgoing(c)) || candidates[0];
   if(!old)throw Error('Missing endpoint '+flow.id+'/'+(i+1));
   if(old.attrs.value!=='XX')corrections.push({page:i+1,from:old.attrs.value,to:'XX'});
   matches.set(n.id,old);used.add(old.attrs.id);setEnd(old);
  }
  const mappedEdges=[],usedEdges=new Set();
  for(const e of baseline.edges) {
   const a=matches.get(e.from),b=matches.get(e.to);
   let candidates=arrows.filter(c=>!usedEdges.has(c.attrs.id)&&c.attrs.source===a.attrs.id);
   let c=candidates.find(c=>c.attrs.target===b.attrs.id&&norm(c.attrs.value)===norm(e.label)) || candidates.find(c=>norm(c.attrs.value)===norm(e.label)) || candidates.find(c=>c.attrs.target===b.attrs.id);
   if(!c)throw Error('Missing reference arrow '+flow.id+'/'+(i+1)+' '+e.id);
   usedEdges.add(c.attrs.id);c.attrs.source=a.attrs.id;c.attrs.target=b.attrs.id;c.attrs.value=e.label;
   const s=U.style(c);
   if(U.type(a)==='onpage'&&c.geometry.inner.includes('targetPoint')) {
    const targetPoint=U.attrs(c.geometry.inner.match(/<mxPoint\b([^>]*as="targetPoint"[^>]*)\/?\s*>/)?.[1] || '');
    if(targetPoint.y) {
     s.edgeStyle='none';s.exitX='1';s.exitY='0.5';s.exitPerimeter='0';
     s.entryX=String((+targetPoint.x- +b.geometry.attrs.x)/+b.geometry.attrs.width);
     s.entryY=String((+targetPoint.y- +b.geometry.attrs.y)/+b.geometry.attrs.height);s.entryPerimeter='0';
     c.geometry.inner='';U.setStyle(c,s);
    }
   } else if(U.type(b)==='offpage'&&b.attrs.value==='XX') {
    s.entryX='0.5';s.entryY='0';s.entryPerimeter='0';s.edgeStyle='orthogonalEdgeStyle';
    c.geometry.inner='';U.setStyle(c,s);
   }
   mappedEdges.push(c);
  }
  const excluded=shapes.filter(c=>!used.has(c.attrs.id));
  const extraEdges=arrows.filter(c=>!usedEdges.has(c.attrs.id));
  if(excluded.length||extraEdges.length)corrections.push({page:i+1,removedVisualSamples:excluded.map(c=>c.attrs.value),removedRedundantArrows:extraEdges.length});
  d.attrs={id:baseline.id,name:'P'+(i+1)+' '+baseline.title};
  d.model={...d.model,page:'1',pageScale:'1',pageWidth:'827',pageHeight:'1169'};
  d.cells=[...d.cells.filter(c=>!c.attrs.edge&&(!c.attrs.vertex||U.type(c)==='text'||used.has(c.attrs.id))),...mappedEdges];
  const byId=new Map(d.cells.map(c=>[c.attrs.id,c]));
  for(const edge of mappedEdges){
   const a=byId.get(edge.attrs.source),b=byId.get(edge.attrs.target);
   if(U.type(a)==='io'&&U.type(b)==='onpage'){
    const ga=U.geometry(a),gb=U.geometry(b),dx=(gb.x+gb.width/2)-(ga.x+ga.width/2),gap=gb.y-ga.y-ga.height;
    if(Math.abs(dx)>4||gap<10){
     b.geometry.attrs.x=String(ga.x+ga.width/2-gb.width/2);b.geometry.attrs.y=String(ga.y+ga.height+25);
     U.setStyle(edge,{...U.style(edge),edgeStyle:'none',exitX:'0.5',exitY:'1',entryX:'0.5',entryY:'0',exitPerimeter:'0',entryPerimeter:'0'});edge.geometry.inner='';
     corrections.push({page:i+1,centeredOutgoingCircle:b.attrs.id});
    }
   }
  }
  directIO(d);result.diagrams.push(d);
 }
 return {doc:result,corrections};
}
function check(flow,doc) {
 const pages=U.physicalPages(doc);let xx=0,edges=0,nodes=0;
 if(pages.length!==flow.pages.length)throw Error('Page count '+flow.id);
 for(let i=0;i<pages.length;i++) {
  const d=pages[i],p=flow.pages[i],v=d.cells.filter(c=>c.attrs.vertex==='1'&&U.type(c)!=='text'),e=d.cells.filter(c=>c.attrs.edge==='1');
  if(v.length!==p.nodes.length||e.length!==p.edges.length)throw Error('Logic counts '+flow.id+'/'+(i+1)+' '+v.length+'/'+p.nodes.length+' '+e.length+'/'+p.edges.length);
  const keys=a=>a.map(String).sort().join('\u0000');
  if(keys(v.map(c=>c.attrs.value==='XX'?'__END__':norm(c.attrs.value)))!==keys(p.nodes.map(n=>end(n)?'__END__':norm(n.text))))throw Error('Changed labels '+flow.id+'/'+(i+1));
  const by=new Map(v.map(c=>[c.attrs.id,c]));
  const label=c=>c.attrs.value==='XX'?'__END__':norm(c.attrs.value);
  const base=new Map(p.nodes.map(n=>[n.id,n]));
  if(keys(e.map(c=>[label(by.get(c.attrs.source)),label(by.get(c.attrs.target)),c.attrs.value].join('|')))!==keys(p.edges.map(c=>[end(base.get(c.from))?'__END__':norm(base.get(c.from).text),end(base.get(c.to))?'__END__':norm(base.get(c.to).text),c.label].join('|'))))throw Error('Changed branches '+flow.id+'/'+(i+1));
  for(const c of d.cells.filter(c=>c.attrs.vertex==='1')) {
   const g=U.geometry(c);
   if(g.x<0||g.y<0||g.x+g.width>827.1||g.y+g.height>1169.1)throw Error('Shape outside A4 '+flow.id+'/'+(i+1)+' '+c.attrs.id+' '+JSON.stringify(g));
   if(/Source-verified documentation|Legal portrait/.test(c.attrs.value))throw Error('Footer remains');
   if(c.attrs.value==='XX')xx++;
  }
  nodes+=v.length;edges+=e.length;
 }
 return {pages:pages.length,xxCount:xx,nodes,edges};
}
const manifest={date:'2026-10-23',paper:'A4 portrait',pageWidth:827,pageHeight:1169,logicBaseline:'validation/Model.json',flows:[],atlases:[],corrections:[]};
for(const flow of model.flows) {
 let doc;
 const canonical=path.join(ROOT,'reference/pre-a4-editable',flow.folder,flow.id+'.drawio');
 if(!fs.existsSync(canonical)){fs.mkdirSync(path.dirname(canonical),{recursive:true});fs.copyFileSync(path.join(ROOT,flow.folder,flow.id+'.drawio'),canonical);}
 const index=flow.role==='Admin'?model.flows.filter(f=>f.role==='Admin').indexOf(flow):-1;
 if(index>=0&&index<refs.length) {
  const cached=path.join(ROOT,'reference/manual-revisions',refs[index]+'.drawio');
  const file=fs.existsSync(cached)?cached:path.join('C:/Practice Files/DOCUMENTATION/FINAL',refs[index]+'.drawio');
  const result=manual(flow,file);doc=result.doc;manifest.corrections.push({id:flow.id,source:file,sha256:sha(file),corrections:result.corrections});
 } else {
  doc=require('./style-remaining.cjs').restyle(flow,U.parseFile(canonical));
  for(const d of doc.diagrams){for(const c of d.cells.filter(c=>c.attrs.vertex==='1'&&U.type(c)==='terminator'&&/^END\b/.test(c.attrs.value)))setEnd(c);directIO(d);}
 }
 const counts=check(flow,doc),file=path.join(STAGE,flow.folder,flow.id+'.drawio');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,U.serialize(doc));
 manifest.flows.push({id:flow.id,folder:flow.folder,role:flow.role,title:flow.title,...counts,pdf:path.join('A4_REVISED',flow.folder,flow.id+'.pdf').replace(/\\/g,'/')});
 console.log('Styled '+flow.id+' ('+counts.pages+' pages)');
}
for(const role of ['ADMIN','ENGINEER_ARCHITECT']) {
 const flows=manifest.flows.filter(f=>f.folder.startsWith(role+'/')),diagrams=[];
 for(const flow of flows)diagrams.push(...U.physicalPages(U.parseFile(path.join(STAGE,flow.folder,flow.id+'.drawio'))).map(d=>({...d,attrs:{...d.attrs,name:flow.title+' / '+d.attrs.name}})));
 const id='SiteTrace_'+role+'_Complete_Atlas',dir=path.join(STAGE,role);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.drawio'),U.serialize({attrs:{host:'app.diagrams.net'},diagrams}));
 manifest.atlases.push({id,folder:role,pages:diagrams.length,pdf:path.join('A4_REVISED',role,id+'.pdf').replace(/\\/g,'/')});
}
manifest.totals=manifest.flows.reduce((a,f)=>({flows:a.flows+1,pages:a.pages+f.pages,nodes:a.nodes+f.nodes,edges:a.edges+f.edges,xx:a.xx+f.xxCount}),{flows:0,pages:0,nodes:0,edges:0,xx:0});
manifest.passed=true;
fs.writeFileSync(path.join(ROOT,'validation/Manual_Style_Manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest.totals));
