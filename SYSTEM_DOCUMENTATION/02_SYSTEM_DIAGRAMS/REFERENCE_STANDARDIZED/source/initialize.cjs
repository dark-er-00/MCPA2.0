const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=process.cwd(),out=path.resolve(__dirname,'..');
for(const dir of ['reference','validation','backups'])fs.mkdirSync(path.join(out,dir),{recursive:true});
const baseline=path.join(out,'validation/baseline.json');
if(!fs.existsSync(baseline)){
 const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
 const hashes=files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
 fs.writeFileSync(baseline,JSON.stringify({date:'2026-10-21',commit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:hashes},null,2));
 console.log('Preserved baseline: '+hashes.length+' tracked files.');
}
fs.copyFileSync('C:/Users/Roland Carl/Downloads/FlowchartFinal.pdf',path.join(out,'reference/FlowchartFinal.pdf'));
console.log('Reference copied; originals will remain untouched.');
