// The loading pictures, taken in the build that deploys them (DESIGN.md, "Quality floor"):
// the site just built in public/ is served on this machine and scripts/poster.mjs takes its
// pictures from it, so the picture and the drawing it fronts always go live together.
//
//   node scripts/poster-build.mjs
//
// A browser that won't install or start leaves the build as it is: the page then hides a
// picture whose fingerprint doesn't match the drawing, and shows "Loading…" on plain ground.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.css': 'text/css', '.pbf': 'application/x-protobuf', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

// Not spawnSync: the server below answers the browser from this same process.
const run = (cmd, args) => new Promise((ok) => spawn(cmd, args, { stdio: 'inherit', env: process.env }).on('close', (code) => ok(code === 0)).on('error', () => ok(false)));

const server = createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.includes('..')) throw new Error('outside');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const site = `http://127.0.0.1:${server.address().port}/`;

let done = false;
try {
  if (!(await run('npx', ['playwright', 'install', 'chromium', '--only-shell']))) console.log('poster: the browser did not install');
  else done = await run(process.execPath, [fileURLToPath(new URL('poster.mjs', import.meta.url)), site]);
} finally {
  server.close();
}
console.log(done ? 'poster: pictures taken from this build' : 'poster: no pictures from this build; the page shows "Loading…" on plain ground until a build takes them');
