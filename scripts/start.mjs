import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Set PORT to a valid TCP port.');
const preflight = spawnSync(process.env.PHP_BINARY || 'php', ['server/console.php', 'preflight'], {cwd:root, stdio:'inherit', windowsHide:true});
if (preflight.error) {
  console.error(`PHP could not start: ${preflight.error.message}`);
  process.exit(1);
}
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
const child = spawn(process.env.PHP_BINARY || 'php', [
  '-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'upload_max_filesize=10M', '-d', 'post_max_size=16M',
  '-S', `127.0.0.1:${port}`, '-t', 'public', 'server/router.php',
], {cwd:root, stdio:'inherit', windowsHide:true});
child.on('error', error => { console.error(`PHP could not start: ${error.message}`); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 0; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
console.log(`MCPA (PHP): http://127.0.0.1:${port}`);
