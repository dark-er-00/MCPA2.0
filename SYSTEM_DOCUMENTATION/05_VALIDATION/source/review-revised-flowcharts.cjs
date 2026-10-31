// Contact sheets of actual native PDF renders, for documentation visual review.
const fs=require('node:fs'),path=require('node:path');
const {out,root,write}=require('./build.cjs');
const {createCanvas,loadImage}=require(path.join(root,'tests/node_modules/@napi-rs/canvas'));
const {flows}=JSON.parse(fs.readFileSync(path.join(out,'05_VALIDATION/Revised_Flowchart_Model.json')));
const pages=flows.flatMap(f=>f.pages.map(p=>({stem:f.stem,id:p.id,title:f.title,page:p.number})));
(async()=>{
 for(let offset=0;offset<pages.length;offset+=9){const group=pages.slice(offset,offset+9),canvas=createCanvas(1800,100+Math.ceil(group.length/3)*875),ctx=canvas.getContext('2d');ctx.fillStyle='#e6ecf1';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='bold 27px Arial';ctx.fillStyle='#153952';ctx.fillText('SiteTrace · revised workflow PDF review · '+(offset+1)+'–'+(offset+group.length),30,44);
  for(const [i,p]of group.entries()){const x=20+(i%3)*595,y=85+Math.floor(i/3)*875;const png=await loadImage(path.join(out,'05_VALIDATION/Revised_PDF_Previews',p.id+'.png'));ctx.fillStyle='white';ctx.fillRect(x,y,570,808);ctx.drawImage(png,x,y,570,808);ctx.fillStyle='#153952';ctx.font='22px Arial';ctx.fillText(p.stem.split('_').slice(0,3).join(' ')+' · p'+p.page,x+8,y+838);}
  write('05_VALIDATION/Revised_PDF_Previews/Contact_Sheet_'+String(offset/9+1).padStart(2,'0')+'.png',canvas.toBuffer('image/png'));
 }
 console.log('Created '+Math.ceil(pages.length/9)+' contact sheets from all '+pages.length+' native PDF page renders.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
