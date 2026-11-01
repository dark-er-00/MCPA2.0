// Compatibility entry point; configuration generation now runs in PHP.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result = spawnSync(process.env.PHP_BINARY || 'php', ['server/console.php', 'configure'], {
  cwd:fileURLToPath(new URL('../', import.meta.url)), stdio:'inherit', windowsHide:true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
