const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=process.cwd(),out=path.resolve(__dirname,'..');
(async()=>{
 const canvas=require(path.join(root,'tests/node_modules/@napi-rs/canvas'));
 for(const key of ['DOMMatrix','ImageData','Path2D'])globalThis[key]=canvas[key];
 const pdfjs=await import(pathToFileURL(path.join(root,'tests/node_modules/pdfjs-dist/legacy/build/pdf.mjs')));
 const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(out,'reference/FlowchartFinal.pdf'))),useSystemFonts:true,disableFontFace:true}).promise;
 const text=[];
 for(let i=1;i<=doc.numPages;i++){
  const p=await doc.getPage(i),content=await p.getTextContent(),view=p.getViewport({scale:1.6});
  text.push({page:i,width:p.view[2],height:p.view[3],items:content.items.map(x=>({text:x.str,x:x.transform[4],y:x.transform[5]}))});
  const c=canvas.createCanvas(Math.ceil(view.width),Math.ceil(view.height));
  await p.render({canvasContext:c.getContext('2d'),viewport:view}).promise;
  fs.writeFileSync(path.join(out,'reference/Page_'+String(i).padStart(2,'0')+'.png'),c.toBuffer('image/png'));
 }
 fs.writeFileSync(path.join(out,'reference/Extracted_Text.json'),JSON.stringify(text,null,2));
 const cols=3,w=660,h=950,rows=Math.ceil(doc.numPages/cols),sheet=canvas.createCanvas(cols*w,rows*h),ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);
 for(let i=1;i<=doc.numPages;i++){const im=await canvas.loadImage(path.join(out,'reference/Page_'+String(i).padStart(2,'0')+'.png'));const x=((i-1)%cols)*w,y=Math.floor((i-1)/cols)*h;ctx.drawImage(im,x+5,y+25,w-10,h-30);ctx.font='16px Arial';ctx.fillStyle='black';ctx.fillText('Reference page '+i,x+10,y+20);}
 fs.writeFileSync(path.join(out,'reference/Contact_Sheet.png'),sheet.toBuffer('image/png'));
 console.log(JSON.stringify({pages:doc.numPages,text:text.map(p=>({page:p.page,items:p.items.map(i=>i.text).join(' ')}))}));
 await doc.destroy();
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
