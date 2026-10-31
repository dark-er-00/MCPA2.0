// Removes only obsolete intermediate exports produced inside this new documentation package.
const fs=require('node:fs'),path=require('node:path');
const OUT=path.resolve(__dirname,'..'),model=JSON.parse(fs.readFileSync(path.join(OUT,'validation/Model.json')));
let removed=0;
for(const f of model.flows){const dir=path.resolve(OUT,f.folder);if(!dir.startsWith(OUT+path.sep))throw Error('Outside new documentation package');const expected=new Set(f.pages.flatMap(p=>[p.id+'.svg',p.id+'.png']));for(const name of fs.readdirSync(dir)){if(name.startsWith(f.id+'_P')&&/_P\d+\.(png|svg)$/.test(name)&&!expected.has(name)){const target=path.resolve(dir,name);if(path.dirname(target)!==dir)throw Error('Outside diagram folder');fs.unlinkSync(target);removed++;}}}
console.log('Removed '+removed+' obsolete intermediate page exports; originals and backups untouched.');
