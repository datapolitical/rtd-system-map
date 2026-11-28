// The loading sketch (DESIGN.md, "While it loads"): RTD's rail lines, drawn in the page itself while
// the map loads, where the map will draw them on the opening view. Written into public/index.html
// (<svg id="sketch">) from the built data, so it follows RTD's lines and colours with no change here:
// the lines from data/routes.geojson, the view from #poster's data-view (scripts/poster.mjs), and each
// line's colour in both themes from the map's own rule (style.js, railInk). Nothing to download: the
// sketch is part of the page's first bytes.
//
//   node scripts/sketch.mjs           writes it into public/index.html
//   import { sketch } from ...        the markup, for the publish check and the tests
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { railInk } from '../public/js/sheets/style.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
// The area drawn, in CSS pixels around the view's middle: a phone in either orientation and most
// laptop screens. A wider screen shows the sketch's edge; the map then draws the rest.
export const HALF = { w: 720, h: 500 };
// The timing cycle for the runs of the loading sketch. The page uses the phase of each run
// to bring up the ink starting near the hub. Keep the 2000 ms cycle in sync with index.html.
export const PULSE_PX = 360;
export const PULSE_MS = 2000;
// Points closer than this to the line through their neighbours are left out (CSS pixels).
const TOLERANCE = 1.2;
const SVG = /<svg id="sketch"[\s\S]*?<\/svg>/;

const round = (v) => Math.round(v * 10) / 10;

function simplify(points) {
  if (points.length < 3) return points;
  const [x1, y1] = points[0];
  const [x2, y2] = points.at(-1);
  const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy) || 1;
  let far = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / length;
    if (d > far) [far, at] = [d, i];
  }
  if (far <= TOLERANCE) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, at + 1)).slice(0, -1), ...simplify(points.slice(at))];
}

// A line cut to the drawn area: the runs of it inside, each ending where it leaves (Liang–Barsky).
function clip(points) {
  const runs = [];
  let run = [];
  const inside = ([x, y]) => Math.abs(x) <= HALF.w && Math.abs(y) <= HALF.h;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const ok = [[-dx, ax + HALF.w], [dx, HALF.w - ax], [-dy, ay + HALF.h], [dy, HALF.h - ay]].every(([p, q]) => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    });
    if (!ok) { if (run.length > 1) runs.push(run); run = []; continue; }
    const a = [ax + t0 * dx, ay + t0 * dy], b = [ax + t1 * dx, ay + t1 * dy];
    if (!run.length) run.push(a);
    run.push(b);
    if (!inside([bx, by])) { runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// The markup: a group per rail line, in route order, with its colour in light (--l) and dark (--d): the
// whole line faint (.base), and its runs, starting near the hub and pointing outward.
export async function sketch(site = PUBLIC) {
  const html = await readFile(`${site}index.html`, 'utf8');
  const view = html.match(/<div id="poster"[^>]*\sdata-view="([^"]*)"/)?.[1];
  const [z, lat, lon] = (view ?? '').split('/').map(Number);
  if (![z, lat, lon].every(Number.isFinite)) throw new Error('index.html has no #poster data-view: run scripts/poster.mjs first');
  const world = 512 * 2 ** z;
  const x = (lng) => ((lng + 180) / 360) * world;
  const y = (la) => ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360))) / 360) * world;
  const [cx, cy] = [x(lon), y(lat)];
  const { features } = JSON.parse(await readFile(`${site}data/routes.geojson`, 'utf8'));
  const lines = new Map();
  for (const { properties: p, geometry: g } of features) {
    if (p.mode !== 'rail' || !p.color || !g) continue;
    const parts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
    const line = lines.get(p.route) ?? { color: p.color, runs: [], seen: new Set() };
    for (const part of parts) {
      for (const r of clip(part.map(([a, b]) => [x(a) - cx, y(b) - cy]))) {
        // A stretch two of the line's pieces share is drawn once.
        const run = simplify(r).map(([a, b]) => [round(a), round(b)]);
        const key = JSON.stringify(run);
        if (!line.seen.has(key) && !line.seen.has(JSON.stringify([...run].reverse()))) line.seen.add(key), line.runs.push(run);
      }
    }
    lines.set(p.route, line);
  }
  // Where the lines branch out from: the network's hub (sheets.json), in the same pixels.
  const { hub } = JSON.parse(await readFile(`${site}data/sheets.json`, 'utf8'));
  const [hx, hy] = Array.isArray(hub) ? [x(hub[0]) - cx, y(hub[1]) - cy] : [0, 0];
  const far = ([a, b]) => Math.hypot(a - hx, b - hy);
  const length = (run) => run.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - run[i][0], p[1] - run[i][1]), 0);
  // Each run is drawn from its end nearer the hub, outward; one that passes the hub is two runs from there.
  const outward = (run) => {
    let near = 0;
    run.forEach((p, i) => { if (far(p) < far(run[near])) near = i; });
    return [run.slice(0, near + 1).reverse(), run.slice(near)].filter((r) => r.length > 1 && length(r) > 2);
  };
  const order = [...lines].filter(([, l]) => l.runs.length).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  const drawn = order.map(([, l]) => ({ l, runs: l.runs.flatMap(outward) }));
  // Each run's phase (--t) comes from how far it starts from the hub.
  const lag = (r) => (far(r[0]) / PULSE_PX) * PULSE_MS;
  const at = (r) => `M${r.map(([a, b]) => `${a} ${b}`).join(' ')}`;
  const groups = drawn.map(({ l, runs }) => {
    const base = `<path class="base" d="${l.runs.map(at).join('')}"/>`;
    const grow = runs.map((r) => `<path style="--t:${Math.round(PULSE_MS - (lag(r) % PULSE_MS)) % PULSE_MS}" d="${at(r)}"/>`).join('');
    return `<g style="--l:${railInk('light', l.color).line};--d:${railInk('dark', l.color).line}">${base}${grow}</g>`;
  });
  return `<svg id="sketch" width="${2 * HALF.w}" height="${2 * HALF.h}" viewBox="${-HALF.w} ${-HALF.h} ${2 * HALF.w} ${2 * HALF.h}" aria-hidden="true" focusable="false">${groups.join('')}</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = `${PUBLIC}index.html`;
  const html = await readFile(page, 'utf8');
  if (!SVG.test(html)) throw new Error('index.html has no <svg id="sketch"> to write the sketch in');
  const markup = await sketch();
  await writeFile(page, html.replace(SVG, () => markup));
  console.log(`wrote the loading sketch into public/index.html (${(markup.length / 1024).toFixed(1)} KB)`);
}
