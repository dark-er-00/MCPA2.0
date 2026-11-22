const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
test('Original preview command branches before database imports or SQL file access',()=>{
 const program=`
  const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs');
  const load=Module._load,read=fs.readFileSync;
  Module._load=function(name,...args){if(/pglite|postgres|auth-test-db|movement-test-db|^(pg|sqlite|better-sqlite3)$/.test(name))throw Error('Database dependency reached: '+name);return load.call(this,name,...args);};
  fs.readFileSync=function(file,...args){if(String(file).endsWith('.sql'))throw Error('SQL file reached');return read.call(this,file,...args);};
  const preview=require('./tests/engineer-assignment-preview.cjs'),start=preview.start;
  let server;preview.start=()=>{server=start({port:0});return server;};
  process.argv.push('--ui-preview','--admin-pdf');require('./tests/auth.browser.cjs');
  assert.ok(server,'Preview branch started');
  server.on('listening',async()=>{try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/index.html');assert.equal(response.status,200);assert.equal(response.headers.get('x-mcpa-fixture'),'synthetic-javascript-no-database');console.log('No database imports or SQL reads.');}catch(e){console.error(e);process.exitCode=1;}finally{server.close();}});
 `;
 const result=spawnSync(process.execPath,['-e',program],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:15000,windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/No database imports or SQL reads/);
});
