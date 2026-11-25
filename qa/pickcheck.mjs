// Does every picked route look right? (DESIGN.md, Quality floor: "A picked route looks right".)
//
// From the built sheets (public/data/sheet-<n>.geojson), for every bus route on every sheet, the
// line the page draws when it is picked (`route-line`), in that sheet's screen pixels:
//   gaps      parts of the line that don't meet (a picked route is one continuous stroke)
//   stubs     a part shorter than a stub (SIZES.pickStub)
//   crossings the line crossing itself, or a second part running along the first
//   steps     a turn sharper than STEP° followed within JOG px by one back the other way
//   names     a station name shown while the route is picked whose box the line runs through
//             (a name it runs under by design, `cover`, is counted apart as `under`)
//   strays    points of the line farther from the route's own street pieces than a line's width
//             (DESIGN.md: the smoothing's allowance, the only tolerance the picked line gets)
// qa/pickcheck-browser.mjs opens a pick link for each route on a phone (chromium, both themes)
// and counts routes not framed whole above the card. Cropped names are reported as information
// on the fixed printed sheet. Prints counts per sheet and the worst routes; JSON with --json.
import fs from 'node:fs';
import { SHEETS, SIZES, toPx, length, resample } from '../scripts/lib/sheets.mjs';

const STEP = 35;
const JOG = 8;
const args = process.argv.slice(2);
const json = args.includes('--json');
const only = args.includes('--route') ? args[args.indexOf('--route') + 1] : null;

const heading = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const turnOf = (h0, h1) => { let d = (h1 - h0) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestD(path, p) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
  }
  return best;
}
const cross = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/** Steps: a sharp turn and one back within JOG px, measured over a 3 px run each side. */
export function steps(path) {
  const pts = resample(path, 1);
  const turns = [];
  for (let i = 3; i < pts.length - 3; i++) turns.push([i, turnOf(heading(pts[i - 3], pts[i]), heading(pts[i], pts[i + 3]))]);
  let n = 0;
  for (let k = 0; k < turns.length; k++) {
    const [i, t] = turns[k];
    if (Math.abs(t) < STEP) continue;
    const back = turns.find(([j, u]) => j > i + 2 && j <= i + JOG && Math.abs(u) >= STEP && Math.sign(u) !== Math.sign(t));
    if (back) { n++; k = turns.indexOf(back); }
  }
  return n;
}

export function checkRoute(paths, names, route, sheet, streets = []) {
  const w = SIZES.rail[sheet.id];
  const out = { gaps: 0, stubs: 0, crossings: 0, steps: 0, names: 0, under: 0, strays: 0, where: [] };
  // Parts that meet: an end within 2 px of another part.
  const part = paths.map((_, i) => i);
  const root = (i) => (part[i] === i ? i : (part[i] = root(part[i])));
  paths.forEach((p, i) => paths.forEach((q, j) => {
    if (i >= j) return;
    if ([p[0], p.at(-1)].some((e) => nearestD(q, e) <= 2) || [q[0], q.at(-1)].some((e) => nearestD(p, e) <= 2)) part[root(i)] = root(j);
  }));
  out.gaps = new Set(paths.map((_, i) => root(i))).size - 1;
  if (out.gaps) out.where.push(...paths.map((p) => p[0]));
  // A stub: a short part with a loose end (a short link between two parts is no stub).
  const touches = (p, e) => paths.some((q) => q !== p && nearestD(q, e) <= 2);
  out.stubs = paths.filter((p) => length(p) < SIZES.pickStub[sheet.id] && !(touches(p, p[0]) && touches(p, p.at(-1)))).length;
  for (const [pi, p] of paths.entries()) {
    out.steps += steps(p);
    for (let i = 1; i < p.length; i++) for (let j = i + 2; j < p.length; j++) if (cross(p[i - 1], p[i], p[j - 1], p[j])) { out.crossings++; out.where.push(p[i]); }
    // A second part along the first: more than 6 px of it within half a line of the main path.
    if (pi) { const along = resample(p, 1).filter((q) => nearestD(paths[0], q) < w / 2).length; if (along > 6 + 2 * w) out.crossings++; }
  }
  // Off its streets by more than the smoothing allows (bridges across a gap are measured too).
  if (streets.length) {
    const allow = SIZES.rail[sheet.id];
    for (const p of paths) for (const q of resample(p, 2)) if (!streets.some((st) => nearestD(st, q) <= allow)) { out.strays++; if (out.strays === 1) out.where.push(q); }
  }
  // Names shown while this route is picked, over its line.
  const bar = `|${route}|`;
  for (const n of names) {
    const alt = n.alt ?? '';
    const shown = alt ? alt.includes(bar) : !(n.under ?? '').includes(bar);
    if (!shown) continue;
    const [x0, y0, x1, y1] = n.box;
    const pad = w / 2;
    const hit = paths.some((p) => resample(p, 1).some((q) => q[0] > x0 - pad && q[0] < x1 + pad && q[1] > y0 - pad && q[1] < y1 + pad));
    if (!hit) continue;
    if ((n.cover ?? '').includes(bar)) out.under++;
    else { out.names++; out.where.push([(x0 + x1) / 2, (y0 + y1) / 2]); }
  }
  return out;
}

const KEYS = ['gaps', 'stubs', 'crossings', 'steps', 'names', 'under', 'strays'];
const report = { sheets: {}, worst: [] };
for (const sheet of SHEETS) {
  const file = new URL(`../public/data/sheet-${sheet.id}.geojson`, import.meta.url);
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Picked routes' lines live in their own file since #193 (loaded at the first pick).
  const routesFile = new URL(`../public/data/sheet-${sheet.id}-routes.geojson`, import.meta.url);
  if (fs.existsSync(routesFile)) fc.features.push(...JSON.parse(fs.readFileSync(routesFile, 'utf8')).features);
  const px = (c) => toPx(c, sheet.zoom);
  const lines = new Map();
  const names = [];
  const streets = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    if (p.kind === 'bus') for (const r of String(p.routes).split(/,\s*/)) (streets.get(r) ?? streets.set(r, []).get(r)).push(f.geometry.coordinates.map(px));
    if (p.kind === 'route-line') (lines.get(p.routes) ?? lines.set(p.routes, []).get(p.routes)).push(f.geometry.coordinates.map(px));
    if (p.kind === 'station' && p.shape === 'name' && p.bx && !p.edge) {
      const at = px(f.geometry.coordinates);
      const [a, b, c, d] = String(p.bx).split(',').map(Number);
      names.push({ ...p, box: [at[0] + a, at[1] + b, at[0] + c, at[1] + d] });
    }
  }
  const sum = Object.fromEntries([['routes', 0], ...KEYS.map((k) => [k, 0])]);
  for (const [route, paths] of lines) {
    if (only && route !== only) continue;
    const r = checkRoute(paths, names, route, sheet, streets.get(route) ?? []);
    sum.routes++;
    for (const k of KEYS) sum[k] += r[k];
    const bad = r.gaps * 5 + r.crossings * 3 + r.steps * 2 + r.names * 3 + r.stubs + (r.strays ? 2 : 0);
    if (bad) report.worst.push({ sheet: sheet.id, route, bad, ...Object.fromEntries(KEYS.map((k) => [k, r[k]])),
      at: r.where.slice(0, 3).map((q) => { const s = 512 * 2 ** sheet.zoom; const lon = q[0] / s * 360 - 180; const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * q[1] / s))) * 180 / Math.PI; return [+lon.toFixed(5), +lat.toFixed(5)]; }) });
  }
  report.sheets[sheet.id] = sum;
}
report.worst.sort((a, b) => b.bad - a.bad);
report.worst = report.worst.slice(0, 25);

if (json) console.log(JSON.stringify(report, null, 1));
else {
  console.log('sheet  routes  ' + KEYS.join('  '));
  for (const [id, s] of Object.entries(report.sheets)) console.log(`  ${id}    ${String(s.routes).padStart(4)}   ${KEYS.map((k) => String(s[k]).padStart(k.length)).join('  ')}`);
  console.log('\nworst:');
  for (const w of report.worst.slice(0, 12)) console.log(`  s${w.sheet} ${w.route.padEnd(5)} ${KEYS.filter((k) => w[k]).map((k) => `${k} ${w[k]}`).join(', ')}  at ${JSON.stringify(w.at[0] ?? '')}`);
}
