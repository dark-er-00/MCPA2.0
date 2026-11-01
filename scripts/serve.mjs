import http from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const publicDirectory = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const insidePublic = file => file === publicDirectory || file.startsWith(publicDirectory + path.sep);
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp'};

export function createStaticServer() {
  return http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {Allow:'GET, HEAD'}).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.split('/').some(segment => segment.startsWith('.'))) throw Error('Private path');
      let file = path.resolve(publicDirectory, '.' + pathname);
      if (!insidePublic(file)) throw Error('Outside public directory');
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      file = await realpath(file);
      if (!insidePublic(file)) throw Error('Outside public directory');
      const info = await stat(file);
      if (!info.isFile()) throw Error('Not a file');
      response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-cache'});
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Retain the static helper for isolated fixtures; actual hosting executes PHP.
  await import('./start.mjs');
}
