'use strict';
const fs = require('node:fs');
const decode = s => String(s ?? '').replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_, h, n, e) => h ? String.fromCodePoint(parseInt(h,16)) : n ? String.fromCodePoint(+n) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e]);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/\n/g,'&#xa;');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1],decode(m[2])]));
const attributes = obj => Object.entries(obj || {}).map(([k,v]) => `${k}="${escape(v)}"`).join(' ');
function parse(text) {
 const file = {attrs:attrs(text.match(/<mxfile\b([^>]*)>/)?.[1] || ''),diagrams:[]};
 for (const m of text.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)) {
  if (!m[2].includes('<mxGraphModel')) throw Error('Compressed diagram is unsupported');
  const d = {attrs:attrs(m[1]),model:attrs(m[2].match(/<mxGraphModel\b([^>]*)>/)[1]),cells:[]};
  for (const c of m[2].matchAll(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g)) {
   const inner=c[2] || '', g=inner.match(/<mxGeometry\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxGeometry>)/);
   d.cells.push({attrs:attrs(c[1]),inner:inner.replace(g?.[0] || /$^/g,''),geometry:g?{attrs:attrs(g[1]),inner:g[2] || ''}:null});
  }
  file.diagrams.push(d);
 }
 if (!file.diagrams.length) throw Error('No editable diagrams');
 return file;
}
function serialize(doc) {
 return '<?xml version="1.0" encoding="UTF-8"?>\n<mxfile '+attributes({...doc.attrs,compressed:'false',pages:String(doc.diagrams.length)})+'>'+doc.diagrams.map(d=>'<diagram '+attributes(d.attrs)+'><mxGraphModel '+attributes(d.model)+'><root>'+d.cells.map(c=>'<mxCell '+attributes(c.attrs)+(c.geometry||c.inner?'>'+(c.geometry?'<mxGeometry '+attributes(c.geometry.attrs)+(c.geometry.inner?'>'+c.geometry.inner+'</mxGeometry>':'/>'):'')+(c.inner||'')+'</mxCell>':'/>')).join('')+'</root></mxGraphModel></diagram>').join('')+'</mxfile>\n';
}
const style = c => Object.fromEntries(String(c.attrs.style || '').split(';').filter(Boolean).map(v=>v.includes('=')?v.split(/=(.*)/s).slice(0,2):[v,'']));
const setStyle = (c,s) => {c.attrs.style=Object.entries(s).map(([k,v])=>v===''?k:k+'='+v).join(';')+';';return c;};
function type(c) {
 const s=style(c);
 if ('text' in s) return 'text';
 if(s.shape==='parallelogram') return 'io';
 if(s.shape==='offPageConnector') return 'offpage';
 if('rhombus' in s || s.shape==='rhombus') return 'decision';
 if('ellipse' in s || s.shape==='ellipse') return s.aspect==='fixed' || /^\d+$/.test(c.attrs.value || '')?'onpage':'terminator';
 return c.attrs.edge==='1'?'edge':'process';
}
const geometry = c => Object.fromEntries(Object.entries(c.geometry?.attrs || {}).map(([k,v])=>[k,Number.isFinite(+v)?+v:v]));
function physicalPages(doc) {
 const result=[];
 for(const original of doc.diagrams) {
  const h=+original.model.pageHeight || 1169;
  const vertices=original.cells.filter(c=>c.attrs.vertex==='1');
  const count=Math.max(1,...vertices.map(c=>Math.floor((+c.geometry.attrs.y + +c.geometry.attrs.height/2)/h)+1));
  const bands=new Map(vertices.map(c=>[c.attrs.id,Math.floor((+c.geometry.attrs.y + +c.geometry.attrs.height/2)/h)]));
  for(let band=0;band<count;band++) {
   const d=structuredClone(original);d.cells=d.cells.filter(c=>!c.attrs.vertex&&!c.attrs.edge || bands.get(c.attrs.id)===band || c.attrs.edge==='1'&&(bands.get(c.attrs.source)??bands.get(c.attrs.target)??Math.floor(+(c.geometry?.inner.match(/<mxPoint[^>]*\by="([^"]*)"/)?.[1]||0)/h))===band);
   if(count>1){d.attrs.id=(original.attrs.id||'page')+'_A4_'+(band+1);d.attrs.name='P'+(band+1);}
   for(const c of d.cells) {
    if(c.attrs.vertex==='1') c.geometry.attrs.y=String(+c.geometry.attrs.y-band*h);
    if(c.attrs.edge==='1'&&c.geometry) c.geometry.inner=c.geometry.inner.replace(/(<mxPoint\b[^>]*\by=")([^"]*)(")/g,(_,a,y,b)=>a+(+y-band*h)+b);
   }
   result.push(d);
  }
 }
 return result;
}
module.exports={parse,parseFile:file=>parse(fs.readFileSync(file,'utf8')),serialize,style,setStyle,type,geometry,attrs,attributes,decode,escape,physicalPages};
