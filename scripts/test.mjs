import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url), {recursive:true})
  .filter(file => !file.split(/[\\/]/).some(part => ['node_modules', 'artifacts'].includes(part)) && /(?:\.test\.(cjs|mjs)|\.database\.cjs)$/.test(file))
  .sort().map(file => 'tests/' + file.replaceAll('\\', '/'));
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(2), ...files], {cwd:root, stdio:'inherit', windowsHide:true});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
