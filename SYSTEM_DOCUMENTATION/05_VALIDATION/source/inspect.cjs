// Read-only repository index. Writes documentation artifacts only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(__dirname,'..');
const files=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
if(!fs.existsSync(path.join(out,'Source_Baseline.json')))fs.writeFileSync(path.join(out,'Source_Baseline.json'),JSON.stringify({date:'2026-10-20',timezone:'Asia/Manila',commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),initialStatus:cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}),files:files.map(file=>({file,sha256:hash(file)}))},null,2));
const sources=files.filter(f=>/\.(js|mjs|cjs|ts|sql|html|css|toml|md)$/.test(f)&&!f.startsWith('vendor/')&&!f.startsWith('.'));
const tables=[],functions=[],policies=[],errors=[],calls=[];
for(const file of sources){const s=fs.readFileSync(path.join(root,file),'utf8'),lines=s.split(/\r?\n/);const lineAt=i=>s.slice(0,i).split('\n').length;
 if(file.endsWith('.sql')){
  for(const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\s*\(/gi)){let p=m.index+m[0].length,depth=1,quote=false;const start=p;for(;p<s.length&&depth;p++){if(s[p]==="'"){if(quote&&s[p+1]==="'"){p++;continue;}quote=!quote;}if(!quote){if(s[p]==='(')depth++;if(s[p]===')')depth--;}}tables.push({name:m[1],file,line:lineAt(m.index),definition:s.slice(start,p-1).trim()});}
  for(const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(/gi))functions.push({name:m[1],file,line:lineAt(m.index)});
  lines.forEach((v,i)=>{if(/^\s*create policy /i.test(v))policies.push({file,line:i+1,definition:v.trim()});});
 }
 if(!file.startsWith('tests/')&&!file.includes('/tests/')&&!file.startsWith('documentation/')&&!file.startsWith('scripts/'))lines.forEach((v,i)=>{
  for(const m of v.matchAll(/\.rpc\(['"]([^'"]+)['"]/g))calls.push({name:m[1],file,line:i+1});
  if(/throw new Error\(|raise exception /.test(v)&&!/(password|token|secret|credential|https?:)/i.test(v)&&v.length<500)errors.push({file,line:i+1,text:v.trim()});
 });
}
fs.writeFileSync(path.join(out,'Repository_Index.json'),JSON.stringify({scope:'Static source index; test-fixture DDL excluded from schema evidence',sources:sources.map(file=>({file,lines:fs.readFileSync(path.join(root,file),'utf8').split('\n').length})),tables,functions,policies,calls,errors},null,2));
console.log(JSON.stringify({tracked:files.length,sources:sources.length,tables:tables.map(x=>x.name),functions:functions.length,rpcCalls:calls.length},null,2));
