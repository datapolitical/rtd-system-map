// Static server for profiling only: serves <root> on 127.0.0.1:<port>, gzip for text.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
const [root, port] = [process.argv[2], Number(process.argv[3])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf' };
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(root, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch {}
  try {
    let body = await readFile(f);
    const t = types[extname(f)] || 'application/octet-stream';
    const h = { 'content-type': t, 'cache-control': 'no-store' };
    if (/text|json|javascript|svg|protobuf/.test(t) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body); h['content-encoding'] = 'gzip'; }
    res.writeHead(200, h); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '127.0.0.1');
