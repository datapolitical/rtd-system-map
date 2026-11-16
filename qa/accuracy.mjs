// Is every bus route drawn where it runs? (#117; DESIGN.md, "Route accuracy")
//
//   node qa/accuracy.mjs [--json out.json]     (npm run check:accuracy)
//
// Reads the build (public/data: the four sheets, RTD's route lines, stations) and RTD's GTFS
// feed (downloaded once to qa/.scratch/gtfs.zip, or RTD_GTFS_ZIP), and for each sheet reports:
//
// - wrong street: a drawn piece that carries a route for most of its length where neither
//   RTD's route line nor the route's GTFS shapes run (one that keeps within a short bulge the
//   sheet draws through, SIZES.busSlim + busSnap, is counted apart);
// - missing: stretches of a route's line with no drawn piece carrying that route nearby,
//   each sorted into: a loop, ramp or divided road the street graph draws simpler on every
//   sheet (DESIGN.md, "Bus routes": within LOOP_REACH of the route's street); a stretch
//   reaching less than the short end the sheet leaves off; a route end drawn to its station; a place where RTD's two
//   sources disagree; or a fault;
// - off: stretches of drawn route farther from the route than the sheet's fold distance
//   plus a street's width, sorted the same way;
// - offsets: how far drawn routes sit from RTD's line and from GTFS, and how far the two
//   sources sit from each other, so a source difference is not taken for a drawing fault.
//
// "Near" on a sheet is what the sheet draws as one street: streets closer than its fold
// distance (SIZES.busMerge) are drawn as one, a street is SIZES.rail wide, and 30 m is left
// for the two sources' own differences. Exits 1 when a sheet has a wrong-street piece or a
// fault, so it can't come back unseen.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS, SIZES } from '../scripts/lib/sheets.mjs';
import { loadGtfs, readCsv, shapePoints } from '../scripts/lib/gtfs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public/data');
const GTFS_URL = 'https://www.rtd-denver.com/files/gtfs/google_transit.zip';
const GTFS_ZIP = process.env.RTD_GTFS_ZIP ?? path.join(ROOT, 'qa/.scratch/gtfs.zip');
const SLACK = 30; // metres: the two sources' own differences
const AGREE = 50; // metres: RTD's line and GTFS this far apart disagree
const STATION = SIZES.busBridgeMetres + 40; // a route end led to its station's mark (toStations)
const STEP = 20; // metres between samples
const LOOP_REACH = 250; // metres: the street graph's loops and ramps reach no farther (scripts/lib/streets.mjs)

const read = (n) => JSON.parse(readFileSync(path.join(DATA, `${n}.geojson`), 'utf8')).features;
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const LAT0 = 39.7;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const xy = ([lon, lat]) => [lon * KX, lat * 111320];
const routesOf = (s) => String(s ?? '').split(/[ ,]+/).filter(Boolean);
const mpp = (zoom) => (40075016.686 * Math.cos((LAT0 * Math.PI) / 180)) / (512 * 2 ** zoom);

function dense(coords, step = STEP) {
  const p = coords.map(xy);
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const k = Math.max(1, Math.ceil(d / step));
    for (let j = 1; j <= k; j++) out.push([p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * j) / k, p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * j) / k]);
  }
  return out;
}

/** Segments by route in a grid, and the distance from a point to the nearest of one route's. */
class Index {
  constructor(cell = 250) { this.cell = cell; this.grid = new Map(); }
  add(route, coords) {
    const p = coords.map(xy);
    for (let i = 1; i < p.length; i++) {
      const [a, b] = [p[i - 1], p[i]];
      const [x0, x1] = [Math.floor(Math.min(a[0], b[0]) / this.cell), Math.floor(Math.max(a[0], b[0]) / this.cell)];
      const [y0, y1] = [Math.floor(Math.min(a[1], b[1]) / this.cell), Math.floor(Math.max(a[1], b[1]) / this.cell)];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${route}|${x},${y}`;
        (this.grid.get(k) ?? this.grid.set(k, []).get(k)).push([a, b]);
      }
    }
  }
  has(route) { return [...this.grid.keys()].some((k) => k.startsWith(`${route}|`)); }
  /** Distance to the route, or Infinity past `cap` metres. */
  to(route, p, cap) {
    const n = Math.ceil(cap / this.cell);
    const [cx, cy] = [Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell)];
    let best = Infinity;
    for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) {
      for (const [a, b] of this.grid.get(`${route}|${x},${y}`) ?? []) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
      }
    }
    return best <= cap ? best : Infinity;
  }
  /** The nearest point of the route, or null past `cap` metres. */
  at(route, p, cap) {
    const n = Math.ceil(cap / this.cell);
    const [cx, cy] = [Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell)];
    let best = null;
    for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) {
      for (const [a, b] of this.grid.get(`${route}|${x},${y}`) ?? []) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const q = [a[0] + t * dx, a[1] + t * dy];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d <= cap && (!best || d < best.d)) best = { d, q };
      }
    }
    return best;
  }
}

/** Runs of consecutive samples that pass `bad`, as [from, to] index pairs. */
function runs(samples, bad) {
  const out = [];
  let start = -1;
  samples.forEach((s, i) => {
    if (bad(s) && start < 0) start = i;
    if (!bad(s) && start >= 0) { out.push([start, i - 1]); start = -1; }
  });
  if (start >= 0) out.push([start, samples.length - 1]);
  return out;
}

const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const round = (v) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10) / 10);
const back = ([x, y]) => [+(x / KX).toFixed(5), +(y / 111320).toFixed(5)];

export async function accuracy() {
  const routes = read('routes').filter((f) => f.properties.mode === 'bus');
  const places = [...read('stations'), ...read('terminals')].map((f) => xy(f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0][0]));
  const nearStation = (p) => places.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= STATION);

  // RTD's route lines (what the build draws from) and the GTFS shapes of each route's trips.
  const arc = new Index();
  const arcLines = new Map();
  for (const f of routes) for (const l of lines(f.geometry)) {
    arc.add(f.properties.route, l);
    (arcLines.get(f.properties.route) ?? arcLines.set(f.properties.route, []).get(f.properties.route)).push(l);
  }
  // The street graph the sheets are drawn from (scripts/lib/streets.mjs).
  const street = new Index();
  for (const f of read('streets')) for (const l of lines(f.geometry)) for (const r of routesOf(f.properties.routes)) street.add(r, l);
  const gtfs = await loadGtfs(GTFS_URL, GTFS_ZIP);
  const byName = new Map();
  for (const r of readCsv(gtfs.text['routes.txt'])) for (const k of new Set([r.route_short_name, r.route_id].filter(Boolean))) (byName.get(k) ?? byName.set(k, []).get(k)).push(r.route_id);
  const shapesOf = new Map();
  for (const t of readCsv(gtfs.text['trips.txt'])) if (t.shape_id) (shapesOf.get(t.route_id) ?? shapesOf.set(t.route_id, new Set()).get(t.route_id)).add(t.shape_id);
  const points = shapePoints(gtfs.text);
  const shape = new Index();
  const withShapes = new Set();
  for (const f of routes) {
    if (withShapes.has(f.properties.route)) continue;
    const ids = routesOf(f.properties.gtfs).flatMap((n) => byName.get(n) ?? []);
    for (const id of new Set(ids)) for (const s of shapesOf.get(id) ?? []) if (points.get(s)) { shape.add(f.properties.route, points.get(s)); withShapes.add(f.properties.route); }
  }

  // Where the two sources disagree, route by route: RTD's line with no GTFS shape near it.
  const disagree = (r, p) => withShapes.has(r) && shape.to(r, p, AGREE) === Infinity;
  const sources = { routes: arcLines.size, withGtfs: withShapes.size, arcOffGtfs: [] };
  const arcToGtfs = [];
  for (const [r, ls] of arcLines) {
    if (!withShapes.has(r)) continue;
    let off = 0, all = 0;
    for (const l of ls) for (const p of dense(l, 50)) { const d = shape.to(r, p, 200); all++; if (d === Infinity || d > AGREE) off++; else arcToGtfs.push(d); }
    if (off * 50 > 200) sources.arcOffGtfs.push({ route: r, metres: off * 50, share: round(off / all) });
  }
  sources.arcOffGtfs.sort((a, b) => b.metres - a.metres);
  sources.arcToGtfs = { p50: round(quantile(arcToGtfs, 0.5)), p90: round(quantile(arcToGtfs, 0.9)), p99: round(quantile(arcToGtfs, 0.99)) };

  const report = { sources, sheets: [] };
  for (const sheet of SHEETS) {
    const m = mpp(sheet.zoom);
    const width = SIZES.rail[sheet.id] * m;
    const fold = SIZES.busMerge[sheet.id] * m;
    const near = fold + width + SLACK;
    // A short end that leads nowhere (DESIGN.md: under 25 px, 2.5 specks, from where it leaves the
    // drawn streets) is left off by design, a terminal loop with it: what counts is how far it
    // reaches from the drawn route, not how long it is round the loop.
    // A terminal loop under 2.4 specks' reach is drawn as the point where it meets its street (it is
    // too small to read as a ring), and the stub to that point is then a short end: together a
    // route's end can stop up to 4.9 specks short.
    const small = (2.5 + 2.4) * SIZES.busSpeck * m;
    const pieces = read(`sheet-${sheet.id}`).filter((f) => f.properties.kind === 'bus');
    const drawn = new Index();
    for (const f of pieces) for (const r of routesOf(f.properties.routes)) drawn.add(r, f.geometry.coordinates);

    // Wrong street: most of a piece is far from every source of a route it carries.
    const wrong = [];
    const through = [];
    // (and a pixel for the corners later rounded to whole pixels)
    const bulge = (SIZES.busSlim + SIZES.busSnap + 1) * m + width / 2 + SLACK;
    const offs = { arc: [], gtfs: [] };
    const why = { street: 0, middle: 0, simpler: 0, other: 0 };
    const off = [];
    for (const f of pieces) {
      const s = dense(f.geometry.coordinates);
      const len = (s.length - 1) * STEP;
      for (const r of routesOf(f.properties.routes)) {
        if (!arcLines.has(r)) continue;
        const d = s.map((p) => Math.min(arc.to(r, p, 2 * near), shape.to(r, p, 2 * near)));
        for (const p of s) {
          offs.arc.push(arc.to(r, p, 500));
          if (withShapes.has(r)) offs.gtfs.push(shape.to(r, p, 500));
          // Why a piece sits off the route's line: on the street (within half its drawn width); down
          // the middle of a divided road (the route's line as far off on the other side too); or
          // drawn simpler (a fold, a rounded corner, a fillet), within the sheet's fold distance.
          const hit = arc.at(r, p, near);
          if (!hit) continue;
          const other = [2 * p[0] - hit.q[0], 2 * p[1] - hit.q[1]];
          why[hit.d <= width / 2 ? 'street' : arc.to(r, other, hit.d * 1.5 + SLACK) <= hit.d * 0.5 + SLACK / 3 ? 'middle' : hit.d <= fold + width / 2 ? 'simpler' : 'other']++;
        }
        const far = d.filter((x) => x > near).length;
        // A strip whose two ways round part by no more than a slim width plus a snap for most of
        // it is drawn as one street (DESIGN.md, "a shorter bulge is drawn through"): by design.
        if (far > s.length / 2 && len > near) (d.every((x) => x <= bulge) ? through : wrong).push({ route: r, routes: f.properties.routes, metres: Math.round(len), most: Math.round(Math.max(...d)), at: back(s[Math.floor(s.length / 2)]) });
        // Off: a stretch longer than three street widths farther than `near`.
        for (const [a, b] of runs(d, (x) => x > near)) {
          const metres = (b - a + 1) * STEP;
          if (metres <= 3 * width) continue;
          const at = s.slice(a, b + 1);
          const kind = at.some(nearStation) ? 'station' : d.slice(a, b + 1).every((x) => x <= bulge) ? 'bulge' : 'fault';
          off.push({ route: r, kind, metres, at: back(at[Math.floor(at.length / 2)]) });
        }
      }
    }

    // Missing: RTD's line for a route with nothing carrying the route near it.
    const missing = [];
    let samples = 0;
    for (const [r, ls] of arcLines) for (const l of ls) {
      const s = dense(l);
      samples += s.length;
      const gone = s.map((p) => drawn.to(r, p, near) === Infinity);
      for (const [a, b] of runs(gone, (x) => x)) {
        const at = s.slice(a, b + 1);
        const metres = at.length * STEP;
        const graph = at.every((p) => street.to(r, p, LOOP_REACH) < LOOP_REACH) && at.some((p) => street.to(r, p, near) === Infinity);
        const kind = at.filter((p) => disagree(r, p)).length > at.length / 2 ? 'source'
          : graph ? 'graph'
          : at.some(nearStation) ? 'station'
          : at.every((p) => drawn.to(r, p, near + small) < near + small) ? 'small'
          : 'fault';
        missing.push({ route: r, kind, metres, at: back(at[Math.floor(at.length / 2)]) });
      }
    }
    const tally = (list) => list.reduce((t, x) => ({ ...t, [x.kind]: (t[x.kind] ?? 0) + 1 }), {});
    const metres = (list) => list.reduce((t, x) => ({ ...t, [x.kind]: (t[x.kind] ?? 0) + x.metres }), {});
    const finite = (xs) => xs.filter(Number.isFinite);
    report.sheets.push({
      sheet: sheet.id, zoom: sheet.zoom,
      metres: { width: round(width), fold: round(fold), near: round(near), small: round(small) },
      wrong,
      through,
      missing: { count: tally(missing), metres: metres(missing), samples, list: missing.sort((a, b) => b.metres - a.metres) },
      off: { count: tally(off), list: off.sort((a, b) => b.metres - a.metres) },
      why: Object.fromEntries(Object.entries(why).map(([k, n]) => [k, Math.round((1000 * n) / (Object.values(why).reduce((a, b) => a + b, 0) || 1)) / 1000])),
      offsets: Object.fromEntries(Object.entries(offs).map(([k, xs]) => [k, { p50: round(quantile(finite(xs), 0.5)), p90: round(quantile(finite(xs), 0.9)), p99: round(quantile(finite(xs), 0.99)), overWidth: round(finite(xs).filter((x) => x > width).length / (finite(xs).length || 1)) }])),
    });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await accuracy();
  const out = process.argv.indexOf('--json');
  if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 1));
  const { sources } = report;
  console.log(`sources: ${sources.withGtfs}/${sources.routes} bus routes have GTFS shapes; RTD's line to GTFS p50 ${sources.arcToGtfs.p50} m, p90 ${sources.arcToGtfs.p90} m, p99 ${sources.arcToGtfs.p99} m`);
  console.log(`  RTD's line off GTFS (> ${AGREE} m) for over 200 m: ${sources.arcOffGtfs.map((x) => `${x.route} ${x.metres} m`).join(', ') || 'none'}`);
  let bad = 0;
  for (const s of report.sheets) {
    const faults = (s.missing.count.fault ?? 0) + (s.off.count.fault ?? 0);
    bad += s.wrong.length + faults;
    console.log(`sheet ${s.sheet} (near ${s.metres.near} m, street ${s.metres.width} m): wrong street ${s.wrong.length} (bulges drawn through ${s.through.length}); missing ${JSON.stringify(s.missing.count)} ${JSON.stringify(s.missing.metres)} m; off ${JSON.stringify(s.off.count)}; offsets to RTD's line p50/p90 ${s.offsets.arc.p50}/${s.offsets.arc.p90} m, to GTFS ${s.offsets.gtfs.p50}/${s.offsets.gtfs.p90} m; drawn ${Object.entries(s.why).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ')}`);
    for (const w of s.wrong.slice(0, 5)) console.log(`  wrong: ${w.route} on "${w.routes}" ${w.metres} m at ${w.at}`);
    for (const x of [...s.missing.list, ...s.off.list].filter((x) => x.kind === 'fault').slice(0, +(process.env.V ?? 8))) console.log(`  fault: ${x.route} ${x.metres} m at ${x.at}`);
  }
  process.exitCode = bad ? 1 : 0;
}
