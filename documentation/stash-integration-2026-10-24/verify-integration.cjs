// Read-only history/index/source verification. Does not apply or modify a stash.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const str=(...args)=>git(...args).toString('utf8').trim();
const normalized=b=>b.toString('utf8').replace(/\r\n/g,'\n');
const head=str('rev-parse','HEAD'),stash=str('rev-parse','stash@{0}'),base=str('rev-parse',stash+'^1');
assert.equal(head,'82448632e47f747b88a549a0def302e202281100');
assert.equal(stash,'498e0e7a8d8cc7a8d119148646c2c5025bf2e868');
assert.ok(base.startsWith('39e72c6'));
assert.equal(str('ls-files','-u'),'');
const report={head,stash,base,merged:[],stashTracked:[],stashUntracked:[],entryPoints:[]};
const core=require('../../js/equipment-import-core.js'),form=fs.readFileSync(path.join(root,'1-admin/modules/masterlist/masterlist.html'),'utf8');
for(const [id,expected]of [['equipmentCategory',core.categories],['equipmentCondition',core.conditions],['trackingType',['Individual','Bulk']],['equipmentUnit',core.units]]){
  const select=form.match(new RegExp('<select[^>]+id="'+id+'"[\\s\\S]*?</select>'))?.[0];assert.ok(select,id);
  const values=[...select.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(values,expected,id);
}
report.registrationFields='Import enums exactly match the current manual form';
const merged=['1-admin/modules/masterlist/masterlist.html','1-admin/modules/masterlist/masterlist.js','2-engr/index.html','index.html','tests/auth.browser.cjs','tests/pdf-reports.test.cjs'];
// Reconstruct the automatic merge in temporary files, without touching the index.
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-merge-review-'));
for(const file of merged){
  const sources=[head,base,stash].map((ref,i)=>{const p=path.join(temporary,String(i));fs.writeFileSync(p,git('show',ref+':'+file));return p;});
  const expected=git('merge-file','-p',...sources);
  assert.equal(normalized(fs.readFileSync(path.join(root,file))),normalized(expected),'Automatic merge drift: '+file);
  report.merged.push({file,threeWayMerge:'exact match'});
}
const current=JSON.parse(fs.readFileSync(path.join(root,'tests/package.json'),'utf8'));
const upstream=JSON.parse(git('show',head+':tests/package.json'));
const saved=JSON.parse(git('show',stash+':tests/package.json'));
for(const p of [upstream,saved])for(const [key,value]of Object.entries(p)){
  if(key==='scripts'){for(const [name,command]of Object.entries(value))assert.equal(current.scripts[name],command,name);}
  else assert.deepEqual(current[key],value,key);
}
assert.equal(Object.keys(current.scripts).length,new Set([...Object.keys(upstream.scripts),...Object.keys(saved.scripts)]).size);
report.package={valid:true,scripts:Object.keys(current.scripts).length,bothCommands:true,dependenciesPreserved:true};
const tracked=str('diff','--name-only',base,stash).split('\n').filter(Boolean);
for(const file of tracked){
  if(merged.includes(file)||file==='tests/package.json')continue;
  assert.equal(normalized(fs.readFileSync(path.join(root,file))),normalized(git('show',stash+':'+file)),file);
  report.stashTracked.push({file,stash:'unchanged'});
}
const untracked=str('ls-tree','-r','--name-only',stash+'^3').split('\n').filter(Boolean);
for(const file of untracked){
  const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
  const local=fs.readFileSync(path.join(root,file)),original=git('show',stash+'^3:'+file),identical=digest(local)===digest(original);
  if(!identical){assert.ok(!local.includes(0)&&!original.includes(0),'Binary file changed: '+file);assert.equal(normalized(local),normalized(original),file);}
  report.stashUntracked.push({file,stash:identical?'byte-identical':'identical except CRLF checkout conversion'});
}
const changed=str('diff','HEAD','--name-only').split('\n').filter(Boolean);
assert.ok(changed.every(file=>tracked.includes(file)),'Unexpected tracked changes relative to teammate HEAD');
const teammateFiles=str('diff','--name-only',base,head).split('\n').filter(Boolean);
report.teammate={changedFiles:teammateFiles.length,overlap:teammateFiles.filter(f=>tracked.includes(f)),unchangedOutsideStash:teammateFiles.filter(f=>!tracked.includes(f)).length};
for(const file of ['index.html','2-engr/index.html']){
  const source=fs.readFileSync(path.join(root,file),'utf8'),scripts=[...source.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  for(const name of ['display.js','equipment-tracking.js','equipment-import-core.js','equipment-import.js','equipment-photos.js','app.js'])assert.equal(scripts.filter(s=>s.endsWith('/'+name)).length,1,file+' '+name);
  const i=name=>scripts.findIndex(s=>s.endsWith('/'+name));
  assert.ok(i('display.js')<i('equipment-tracking.js'));assert.ok(i('equipment-tracking.js')<i('equipment-import-core.js'));assert.ok(i('equipment-import-core.js')<i('equipment-import.js'));assert.ok(i('equipment-import.js')<i('app.js'));
  report.entryPoints.push({file,order:'valid',duplicateRegistrations:false});
}
assert.equal(str('rev-parse','stash@{0}'),stash);
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,stashUntracked:report.stashUntracked.length},null,2));
