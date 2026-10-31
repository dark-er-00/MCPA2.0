const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'../../../../..');
const canvas=require(path.join(root,'tests/node_modules/@napi-rs/canvas'));
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
const files=['00_Main','01_Authentication','02_Masterlist','03_Tool Profile','04_Request','05_Transfer'];
async function main(){
 const {getDocument}=await import(require('node:url').pathToFileURL(path.join(root,'tests/node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
 const metadata=[];
 for(const name of files){
  const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(path.join('C:/Users/Roland Carl/Downloads',name+'.drawio.pdf'))),isEvalSupported:false,useSystemFonts:true}).promise;
  const rows=Math.ceil(pdf.numPages/3), thumbW=340,thumbH=500, contact=canvas.createCanvas(thumbW*3,rows*thumbH),ctx=contact.getContext('2d');
  ctx.fillStyle='#ddd';ctx.fillRect(0,0,contact.width,contact.height);
  const record={name,pageCount:pdf.numPages,pages:[]};
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),base=page.getViewport({scale:1}),items=(await page.getTextContent()).items.filter(x=>'str'in x&&x.str.trim());
   const fonts=items.map(x=>Math.hypot(x.transform[2],x.transform[3])).filter(x=>x>0);
   record.pages.push({number,widthPt:base.width,heightPt:base.height,minFontPt:Math.min(...fonts),medianFontPt:fonts.sort((a,b)=>a-b)[Math.floor(fonts.length/2)],text:items.map(x=>x.str).join(' ')});
   const viewport=page.getViewport({scale:Math.min((thumbW-20)/base.width,(thumbH-35)/base.height)}),surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvasContext:surface.getContext('2d'),viewport,canvas:surface}).promise;
   const tx=((number-1)%3)*thumbW,ty=Math.floor((number-1)/3)*thumbH;
   ctx.drawImage(surface,tx+(thumbW-surface.width)/2,ty+25);ctx.fillStyle='#222';ctx.font='14px Arial';ctx.fillText(name+' — '+number,tx+10,ty+18);
   if((name==='00_Main'&&number===1)||(name==='05_Transfer'&&number===Math.min(pdf.numPages,2))){
    const fullViewport=page.getViewport({scale:1.5}),full=canvas.createCanvas(Math.ceil(fullViewport.width),Math.ceil(fullViewport.height));
    await page.render({canvasContext:full.getContext('2d'),viewport:fullViewport,canvas:full}).promise;
    fs.writeFileSync(path.join(__dirname,name.replace(/ /g,'_')+'-page-'+number+'.png'),full.toBuffer('image/png'));
   }
  }
  fs.writeFileSync(path.join(__dirname,name.replace(/ /g,'_')+'-contact.png'),contact.toBuffer('image/png')); metadata.push(record);
 }
 fs.writeFileSync(path.join(__dirname,'reference-metadata.json'),JSON.stringify(metadata,null,2));
 console.log(JSON.stringify(metadata.map(x=>({name:x.name,pageCount:x.pageCount,pages:x.pages.map(({number,widthPt,heightPt,minFontPt,medianFontPt})=>({number,widthPt,heightPt,minFontPt,medianFontPt}))})),null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
