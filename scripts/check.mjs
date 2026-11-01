import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDirectory = path.join(root, 'public');
const files = readdirSync(publicDirectory, {recursive:true})
  .filter(file => statSync(path.join(publicDirectory, file)).isFile());
const failures = [];
function resource(owner, reference, fromRoot = false) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(reference) || reference.includes('${')) return;
  const name = reference.split(/[?#]/)[0];
  const target = path.resolve(fromRoot || name.startsWith('/') ? publicDirectory : path.dirname(owner), name.replace(/^\//, ''));
  if ((target !== publicDirectory && !target.startsWith(publicDirectory + path.sep)) || !existsSync(target)) failures.push(`${path.relative(root,owner)}: missing resource ${reference}`);
}
for (const relative of files) {
  const file = path.join(publicDirectory, relative);
  if (/\.(sql|md|log|psql)$|(?:^|[\\/])(?:tests|node_modules|\.env)(?:[\\/]|$)/i.test(relative)) failures.push(`Non-runtime file in public/: ${relative}`);
  if (/\.(html|js|mjs|css)$/.test(relative) && !relative.startsWith('assets' + path.sep + 'vendor' + path.sep)) {
    const source = readFileSync(file, 'utf8');
    if (file.endsWith('.html')) for (const [,reference] of source.matchAll(/(?:src|href)="([^"<>]+)"/g)) resource(file, reference);
    for (const [,reference] of source.matchAll(/(?:from\s+|(?:import|require)\(\s*)['"](\.[^'"]+)['"]/g)) resource(file, reference);
    for (const [,reference] of source.matchAll(/new URL\(['"]([^'"]+)['"],\s*(?:document\.currentScript\.src|scriptUrl)\)/g)) resource(file, reference);
    for (const [,args] of source.matchAll(/importScripts\(([^)]+)\)/g)) for (const [,reference] of args.matchAll(/['"]([^'"]+)['"]/g)) resource(file, reference);
    for (const [,reference] of source.matchAll(/['"](app\/[^'"]+\.(?:js|mjs|html|css))['"]/g)) resource(file, reference, true);
    for (const [,reference] of source.matchAll(/url\(['"]?(\.\.?\/[^)'"\s]+)['"]?\)/g)) resource(file, reference);
  }
  if (/\.(js|mjs)$/.test(relative)) {
    const result = spawnSync(process.execPath, ['--check', file], {encoding:'utf8', windowsHide:true});
    if (result.status !== 0) failures.push(result.stderr || result.error?.message || `Syntax error: ${relative}`);
  }
}
const loader = readFileSync(path.join(publicDirectory, 'app/core/app.js'), 'utf8');
const screenModules = [...new Set([...loader.slice(0, loader.indexOf('let currentModule')).matchAll(/:\s*"([^"]+)"/g)].map(match => match[1]))];
for (const name of screenModules) for (const extension of ['html','css','js']) resource(path.join(publicDirectory,'index.html'), `app/portals/admin/${name}/${name}.${extension}`, true);
for (const name of screenModules.filter(name => !['sites','consumables','users','settings','reports','purchases'].includes(name))) for (const extension of ['html','css','js']) resource(path.join(publicDirectory,'index.html'), `app/portals/engineer/${name}/${name}.${extension}`, true);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${files.length} public files, script syntax, imports, assets and portal modules.`);
