// A plain static server for qa/ checks: `npm run serve` from qa/.
//
// `npm run dev` in the repo root needs wrangler, which is not installed here
// and is not needed — the site is static files under public/.
//
// It compresses like Cloudflare Pages does (brotli, gzip fallback). That is
// not a nicety: public/data is 2.4 MB of JSON and 241 KB brotli, so a server
// that ships it raw inflates every load-time measurement by seconds.

import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..', '..', 'public');
const port = Number(process.env.PORT ?? 8788);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.geojson', '.svg']);
const cache = new Map();

function encoded(file, ext, accept) {
  if (!COMPRESSIBLE.has(ext)) return null;
  const stamp = statSync(file);
  const key = `${file}:${stamp.mtimeMs}:${stamp.size}:${/br\b/.test(accept) ? 'br' : /gzip\b/.test(accept) ? 'gz' : 'id'}`;
  if (cache.has(key)) return cache.get(key);
  const raw = readFileSync(file);
  const out =
    key.endsWith(':br')
      ? { body: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), encoding: 'br' }
      : key.endsWith(':gz')
        ? { body: gzipSync(raw, { level: 9 }), encoding: 'gzip' }
        : null;
  cache.set(key, out);
  return out;
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    statSync(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${url.pathname}`);
    return;
  }
  const ext = path.extname(file);
  const hit = encoded(file, ext, req.headers['accept-encoding'] ?? '');
  if (hit) {
    res.writeHead(200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'content-encoding': hit.encoding,
      vary: 'accept-encoding',
      'cache-control': 'no-store',
    });
    res.end(hit.body);
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port} (brotli)`));
