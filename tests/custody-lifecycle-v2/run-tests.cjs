// Run from repository root; does not edit tests/package.json or shared fixtures.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'documentation/workstream-b/test-results');
fs.mkdirSync(out,{recursive:true});
const files=['custody-lifecycle-v2/returns.test.cjs','custody-lifecycle-v2/security.test.cjs','qr-movement-v2/qr-transfer.test.cjs',
  'qr-movement-v2/camera.test.cjs','movement-evidence-v2/evidence.test.cjs','equipment-retirement-v2/retirement.test.cjs'];
const child=spawn(process.execPath,['--test','--test-concurrency=1',...files.map(file=>'tests/'+file)],{cwd:root,windowsHide:true});
let output='';for(const channel of ['stdout','stderr'])child[channel].on('data',data=>{output+=data;process[channel].write(data);});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('close',code=>{
  fs.writeFileSync(path.join(out,'unit-database.tap'),output);
  const count=name=>Number(output.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]||0);
  fs.writeFileSync(path.join(out,'unit-database.json'),JSON.stringify({passed:code===0,exitCode:code,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),
    files,scope:'Disposable single-connection PostgreSQL (PGlite), module unit tests and RLS fixtures; no live Supabase or multi-session contention test'},null,2));
  process.exitCode=code||0;
});
