// SOLMAR BAY — a tiny static server for game/ (Node 22, standard
// library only), so the game can be played locally with no build step:
//   node serve.ts            serves game/ on http://localhost:8080
//   node serve.ts --port 9000
// It answers only files inside game/, sends the MIME types a browser
// game needs, and does nothing clever: a development convenience, not a
// web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(): number {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf('--port');
  const wanted = flagAt === -1 ? 8080 : Number(args[flagAt + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

const mimeFor: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const port = pickPort();

createServer((request, response) => {
  const rawPath = request.url ?? '/';
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(rawPath, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(gameRoot, normalize(pathname)));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  console.log(`${request.method} ${pathname}`);
  response.writeHead(200, {
    'content-type': mimeFor[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`SOLMAR BAY is on http://localhost:${port}`);
});

// Second pass on serve.ts: log each request line so a play-test can prove
// the game loads with no network request — the log should show only
// paths under game/ (index.html, the vendor bundle, the src modules).
