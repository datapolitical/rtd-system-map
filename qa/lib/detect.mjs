// The detectors behind qa/checks/*.spec.mjs and the sweep (qa/sweep/). Each
// looks at whatever view the map is showing and returns findings: a fault
// it found, where on screen, how bad, and a sentence saying what is wrong.
// They look for faults nobody has listed yet, so nothing in them names a
// line, station, color or place: lines and stations come from the data the
// page serves, sizes and colors from the style's own expressions (inpage.js).
//
//   const raw = await measure(page, { bus: zoom >= 14 });
//   const findings = [...continuity(raw), ...marks(raw), ...labels(raw), ...letters(raw), ...contrastOf(raw)];
//   const png = await annotate(raw.capture, findings, raw.view.dpr);
//
// Severity orders the sweep's report (DESIGN.md, "Hierarchy": a line that
// breaks is worse than marks that touch, which is worse than a line with no
// letter, a name under a card, or a color that reads weakly). Notes (9) are
// reported but never fail anything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

export const SEVERITY = {
  'line-gap': 1, 'line-covered': 1, 'line-jog': 1,
  'mark-overlap': 2, 'mark-crowded': 2.5, 'label-overlap': 2.5,
  'letter-missing': 3, 'label-far': 3.5, 'label-under-card': 4,
  contrast: 5, note: 9,
};
export const SEVERITY_NAME = { 1: 'broken line', 2: 'overlapping marks', 2.5: 'crowding', 3: 'missing letter', 3.5: 'name far from mark', 4: 'label under a card', 5: 'contrast', 9: 'note' };

// Thresholds, in CSS px unless said (each detector's header in qa/checks says why).
export const LIMITS = {
  gapPx: 4, // a run longer than this with no pixel of the line's own color
  jogPx: 2, // ... or a sideways jump between joined pieces wider than this and 0.4 of the line's width
  colorTol: 48, // max channel difference for "the line's own color"
  namePx: 25, // a station name's box this far from its station (or 1.4 ems on each axis, if more)
  letterStubPx: 130, // a line spanning less than this on screen with no letter is a note
  lineContrast: 3, markContrast: 3, letterContrast: 4.5,
  darkTickLuma: 70, // median luma (0-255) across a dark-mode tick
};

// ---------------------------------------------------------------- pixels

const rgbOf = (c) => (typeof c === 'string' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c);
export const lum = (c) => {
  const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgbOf(c);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
export const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export async function pixels(buf) {
  const img = await loadImage(buf);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const at = ([x, y]) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    const i = (y * img.width + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  return { w: img.width, h: img.height, d, at };
}

const near = (a, b, tol) => a && b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// ---------------------------------------------------------------- page

export async function install(page) {
  await page.addScriptTag({ path: path.join(HERE, 'inpage.js') });
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'evaluate.js'), 'utf8');
  return page.evaluate((src) => window.__qa.init(src), src);
}

export async function jump(page, v, quiet = 700) {
  return page.evaluate(([v, q]) => window.__qa.jump(v, q), [v, quiet]);
}

// Everything the detectors read from one view: two captures (as drawn, and
// with every symbol and circle layer hidden so lines can be read from their
// pixels), the lines, marks, placed boxes, letters and colors.
export async function measure(page, { bus = false, lines = true } = {}) {
  const raw = await page.evaluate(() => {
    const q = window.__qa;
    return {
      view: q.view(), marks: q.marks(), placed: q.placed(), stations: q.stationAt(), letters: q.letters(),
      bullets: q.bullets(), tiers: q.busTiers(), land: q.land(), nameSize: window.__map.getLayer('station-labels') ? q.textSize('station-labels') : 12,
      theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      cover: q.cover(4),
    };
  });
  const { step, cols, bits } = raw.cover;
  const one = (x, y) => bits[Math.floor(y / step) * cols + Math.floor(x / step)] === '1';
  // Under a control, or within 6 px of one (its shadow).
  raw.covered = (x, y, m = 6) => one(x, y) || one(x - m, y) || one(x + m, y) || one(x, y - m) || one(x, y + m);
  raw.capture = await page.screenshot();
  raw.px = await pixels(raw.capture);
  raw.lines = [];
  if (lines) {
    await page.evaluate(() => { window.__qa.hideSymbols(); return window.__qa.settle(300); });
    raw.bare = await page.screenshot();
    raw.barePx = await pixels(raw.bare);
    raw.lines = await page.evaluate((bus) => window.__qa.lines({ bus }), bus);
    await page.evaluate(() => { window.__qa.showSymbols(); return window.__qa.settle(400); });
  }
  return raw;
}

const where = (raw, x, y) => {
  // The map position of a screen point, from the view's centre and zoom
  // (Mercator, 512 px tiles), for the report.
  const { zoom, lat, lon, w, h } = raw.view;
  const s = 512 * 2 ** zoom, r = (lat * Math.PI) / 180;
  const cx = ((lon + 180) / 360) * s, cy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s;
  const X = cx + (x - w / 2), Y = cy + (y - h / 2);
  return { lon: +((X / s) * 360 - 180).toFixed(5), lat: +((Math.atan(Math.sinh(Math.PI * (1 - (2 * Y) / s))) * 180) / Math.PI).toFixed(5) };
};
const finding = (raw, kind, x, y, r, msg, extra = {}) => ({
  kind, severity: SEVERITY[kind], x: Math.round(x), y: Math.round(y), r: Math.round(r), msg,
  zoom: +raw.view.zoom.toFixed(2), theme: raw.theme, ...where(raw, x, y), ...extra,
});

const inArea = (A, x, y, inset = 0) => x >= A.x0 + inset && x <= A.x1 - inset && y >= A.y0 + inset && y <= A.y1 - inset;

// ---------------------------------------------------------------- 1. continuity

// The way a polyline runs at its end `i`, pointing into it (s = 1 from the
// start, -1 from the end), as a unit vector in the chain's direction.
function dirAt(pts, i, s) {
  const j = Math.max(0, Math.min(pts.length - 1, i + s));
  const v = s > 0 ? [pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]] : [pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]];
  const L = Math.hypot(...v) || 1;
  return [v[0] / L, v[1] / L];
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function segGrid(lines, cell = 24) {
  const g = new Map();
  lines.forEach((L, li) => {
    const pad = (L.casing || L.width) / 2 + 6;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i];
      for (let cx = Math.floor((Math.min(a[0], b[0]) - pad) / cell); cx <= Math.floor((Math.max(a[0], b[0]) + pad) / cell); cx++)
        for (let cy = Math.floor((Math.min(a[1], b[1]) - pad) / cell); cy <= Math.floor((Math.max(a[1], b[1]) + pad) / cell); cy++) {
          const k = cx * 100003 + cy;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push([li, i]);
        }
    }
  });
  return (x, y) => g.get(Math.floor(x / cell) * 100003 + Math.floor(y / cell)) || [];
}

// Pieces of one route joined end to end (ends within ~1 m), each oriented.
function chainsOf(pieces) {
  const key = (c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`;
  const at = new Map();
  pieces.forEach((p, i) => p.ends.forEach((c, e) => { const k = key(c); if (!at.has(k)) at.set(k, []); at.get(k).push([i, e]); }));
  const used = new Set(), out = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const chain = [{ i, rev: false }];
    for (const dir of [1, 0]) { // forward from the end, then back from the start
      let cur = { i, rev: false };
      for (;;) {
        const end = pieces[cur.i].ends[cur.rev ? 0 : 1];
        const startEnd = pieces[cur.i].ends[cur.rev ? 1 : 0];
        const k = key(dir ? end : startEnd);
        const next = (at.get(k) || []).find(([j]) => !used.has(j));
        if (!next) break;
        const [j, e] = next;
        used.add(j);
        // Going forward, the next piece should start here (e = 0); going back, end here (e = 1).
        cur = { i: j, rev: dir ? e === 1 : e === 0 };
        if (dir) chain.push(cur); else chain.unshift(cur);
      }
    }
    out.push(chain);
  }
  return out;
}

export function continuity(raw, limits = LIMITS) {
  const { lines, barePx: px, view } = raw;
  if (!px || !lines.length) return [];
  const A = view.area, dpr = view.dpr, out = [];
  const stats = (raw.stats ??= {});
  stats.hit = 0; stats.miss = 0; stats.skip = 0; stats.joins = 0;
  const near = segGrid(lines);
  const railColors = [...new Map(lines.filter((l) => l.layer === 'rail').map((l) => [l.route, l.color])).entries()];
  // A pixel of `color` within rr px; with `edge` (the line's outline), only
  // one nearer the fill than the outline counts, so a line whose fill is
  // gone but whose outline is still drawn reads as broken.
  const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  const has = (color, x, y, rr, edge) => {
    const R = Math.max(1, Math.round(rr * dpr));
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const c = px.at([x * dpr + dx, y * dpr + dy]);
      if (nearC(c, color, limits.colorTol) && (!edge || dist(c, color) < dist(c, edge))) return true;
    }
    return false;
  };
  const nearC = (a, b, t) => a && Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
  const excused = (P, p, dir) => {
    for (const [li, i] of near(p[0], p[1])) {
      const Q = lines[li];
      if (Q === P || (Q.route === P.route && Q.layer === P.layer)) continue;
      if (P.layer === 'bus' && Q.layer === 'bus') continue;
      const a = Q.pts[i - 1], b = Q.pts[i];
      const d = segDist(p, a, b);
      if (d > (Q.casing || Q.width) / 2 + P.width / 2 + (P.layer === 'bus' ? 2.5 : 1)) continue;
      if (P.layer === 'bus') return true; // rail is drawn over buses
      const qd = [b[0] - a[0], b[1] - a[1]], ql = Math.hypot(...qd) || 1;
      const cos = Math.abs((dir[0] * qd[0] + dir[1] * qd[1]) / ql);
      if (cos < Math.cos((20 * Math.PI) / 180)) return true; // another line crosses here
    }
    return false;
  };

  const groups = new Map();
  for (const l of lines) if (l.layer === 'rail' || l.layer === 'bus') {
    const k = `${l.layer}|${l.route}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  for (const [, pieces] of groups) {
    for (const chain of chainsOf(pieces)) {
      // Joins: the two pieces' drawn ends should meet.
      for (let k = 1; k < chain.length; k++) {
        const a = pieces[chain[k - 1].i], b = pieces[chain[k].i];
        const pa = chain[k - 1].rev ? a.pts[0] : a.pts.at(-1), pb = chain[k].rev ? b.pts.at(-1) : b.pts[0];
        // Sideways only: on a bend the two offset ends also part along the
        // line, which the round caps close (and the walk below would catch).
        const neg = ([x, y]) => [-x, -y];
        const ta = chain[k - 1].rev ? neg(dirAt(a.pts, 0, 1)) : dirAt(a.pts, a.pts.length - 1, -1), tb = chain[k].rev ? neg(dirAt(b.pts, b.pts.length - 1, -1)) : dirAt(b.pts, 0, 1);
        const t = [ta[0] + tb[0], ta[1] + tb[1]], tl = Math.hypot(...t) || 1;
        const d = Math.abs(((pb[0] - pa[0]) * -t[1] + (pb[1] - pa[1]) * t[0]) / tl);
        const w = Math.min(a.width, b.width);
        stats.joins++;
        if (d > Math.max(limits.jogPx, 0.4 * w) && inArea(A, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 4) && !raw.covered((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)) {
          out.push(finding(raw, 'line-jog', (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, d / 2 + 14,
            `${a.layer === 'bus' ? 'bus' : 'line'} ${a.route}: drawn ends of two joined pieces are ${d.toFixed(1)} px apart (width ${w.toFixed(1)}; slots ${a.slot} and ${b.slot}, offsets ${a.offset.toFixed(1)} and ${b.offset.toFixed(1)} px)`,
            { route: a.route, jump: +d.toFixed(1) }));
        }
      }
      // Walk the drawn path, joins included, every 1.5 px.
      const path = [];
      for (const { i, rev } of chain) for (const p of rev ? [...pieces[i].pts].reverse() : pieces[i].pts) path.push([p, pieces[i]]);
      let run = [];
      const close = () => {
        if (run.length) {
          const len = run.length * 1.5;
          if (len >= limits.gapPx) {
            const P = run[0].P, mid = run[Math.floor(run.length / 2)].p;
            const covered = run.filter((s) => s.covered).length > run.length / 2;
            const by = covered ? railColors.find(([r, c]) => r !== P.route && has(c, mid[0], mid[1], P.width / 2, P.edge))?.[0] : null;
            out.push(finding(raw, covered ? 'line-covered' : 'line-gap', mid[0], mid[1], len / 2 + 12,
              covered ? `${P.layer === 'bus' ? 'bus' : 'line'} ${P.route}: its color is missing for ${len.toFixed(0)} px where ${by ? `line ${by}` : 'another line'} is drawn instead`
                : `${P.layer === 'bus' ? 'bus' : 'line'} ${P.route}: no pixel of its color for ${len.toFixed(0)} px along where it runs (width ${P.width.toFixed(1)} px)`,
              { route: P.route, length: Math.round(len) }));
          }
        }
        run = [];
      };
      for (let k = 1; k < path.length; k++) {
        const [a, Pa] = path[k - 1], [b] = path[k];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dir = L ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0];
        const n = Math.max(1, Math.round(L / 1.5));
        const P = Pa;
        for (let s = 0; s < n; s++) {
          const p = [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n];
          if (!inArea(A, p[0], p[1], P.width / 2 + 8) || raw.covered(p[0], p[1])) { stats.off = (stats.off || 0) + 1; close(); continue; }
          if (excused(P, p, dir)) { stats.skip++; close(); continue; }
          const rr = Math.max(1, Math.min(P.width * 0.35, 2));
          if (has(P.color, p[0], p[1], rr, P.edge)) { stats.hit++; close(); continue; }
          stats.miss++;
          const covered = railColors.some(([r, c]) => r !== P.route && has(c, p[0], p[1], rr, P.edge));
          run.push({ p, P, covered });
        }
      }
      close();
    }
  }
  return dedupe(out, 16);
}

function dedupe(fs, d) {
  const out = [];
  for (const f of fs) if (!out.some((g) => g.kind === f.kind && g.route === f.route && Math.hypot(g.x - f.x, g.y - f.y) < d)) out.push(f);
  return out;
}

// The data side of continuity, from routes.geojson alone: pieces of one
// route whose ends nearly meet but don't (0.3 to 30 m apart, with no piece
// meeting either end exactly), and joined pieces whose slots differ, taking
// each piece's direction into account, by more than one easing step (a
// sixteenth of a line width; DESIGN.md "Shared track", step 8).
export function routeJoins(geojson, { step = 1 / 16 } = {}) {
  const m = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111320, (b[1] - a[1]) * 110540);
  const out = [];
  const byRoute = new Map();
  for (const f of geojson.features) {
    if (f.properties.mode !== 'rail' || f.geometry.type !== 'LineString') continue;
    if (!byRoute.has(f.properties.route)) byRoute.set(f.properties.route, []);
    byRoute.get(f.properties.route).push(f);
  }
  // Where each line ends: an end of one of its pieces that no other of its
  // pieces carries on from. A pack changes width there under the line's end
  // mark, so the lines that run on step to their new places at that point
  // (scripts/lib/sharedtrack.mjs, `eased`): not a fault.
  const lineEnds = [];
  for (const [route, fs] of byRoute) {
    const ends = fs.flatMap((f, i) => [{ i, p: f.geometry.coordinates[0] }, { i, p: f.geometry.coordinates.at(-1) }]);
    for (const a of ends) if (!ends.some((b) => b.i !== a.i && m(a.p, b.p) < 30)) lineEnds.push({ route, p: a.p });
  }
  const atAnEnd = (route, p) => lineEnds.some((e) => e.route !== route && m(e.p, p) <= 40);
  for (const [route, fs] of byRoute) {
    const ends = fs.flatMap((f, i) => [{ i, e: 0, p: f.geometry.coordinates[0], slot: f.properties.slot ?? 0 }, { i, e: 1, p: f.geometry.coordinates.at(-1), slot: f.properties.slot ?? 0 }]);
    for (const a of ends) {
      const others = ends.filter((b) => b.i !== a.i).map((b) => ({ b, d: m(a.p, b.p) })).sort((x, y) => x.d - y.d);
      const best = others[0];
      if (!best) continue;
      if (best.d < 0.3) {
        if (a.i > best.b.i) continue; // each join once
        // End-to-start keeps direction; start-to-start or end-to-end flips it, and the slot's sign with it.
        const sb = a.e !== best.b.e ? best.b.slot : -best.b.slot;
        if (Math.abs(a.slot - sb) > step + 1e-6 && !atAnEnd(route, a.p)) out.push({ kind: 'slot-jump', route, at: a.p, slots: [a.slot, sb], msg: `line ${route}: joined pieces at ${a.p.map((v) => v.toFixed(5)).join(', ')} are in slots ${a.slot} and ${sb} (more than one easing step apart)` });
      } else if (best.d < 30) {
        out.push({ kind: 'near-miss', route, at: a.p, metres: +best.d.toFixed(1), msg: `line ${route}: a piece ends ${best.d.toFixed(1)} m from the next piece's end instead of on it, at ${a.p.map((v) => v.toFixed(5)).join(', ')}` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 2. marks

const corners = (k) => {
  const a = (k.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [k.x + u * (k.w / 2) * c - v * (k.h / 2) * s, k.y + u * (k.w / 2) * s + v * (k.h / 2) * c]);
};
function sat(A, B) {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], n = [y2 - y1, x1 - x2];
    const pa = A.map(([x, y]) => x * n[0] + y * n[1]), pb = B.map(([x, y]) => x * n[0] + y * n[1]);
    if (Math.max(...pa) <= Math.min(...pb) + 0.01 || Math.max(...pb) <= Math.min(...pa) + 0.01) return false;
  }
  return true;
}

// Marks that overlap, and marks nearer each other (centre to centre) than
// the longer side of either: two stations that read as one.
export function marks(raw) {
  const out = [];
  const list = raw.marks.filter((k) => inArea(raw.view.area, k.x, k.y));
  const C = list.map(corners);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y), longer = Math.max(a.w, a.h, b.w, b.h);
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    if (sat(C[i], C[j])) out.push(finding(raw, 'mark-overlap', x, y, d / 2 + longer / 2 + 6, `marks overlap: ${a.label} (${a.layer}) and ${b.label} (${b.layer}), ${d.toFixed(1)} px apart, ${a.w.toFixed(0)}x${a.h.toFixed(0)} and ${b.w.toFixed(0)}x${b.h.toFixed(0)} px`, { pair: [a.label, b.label] }));
    else if (d < longer) out.push(finding(raw, 'mark-crowded', x, y, d / 2 + longer / 2 + 6, `marks crowd: ${a.label} and ${b.label} are ${d.toFixed(1)} px apart, under the longer one's ${longer.toFixed(1)} px`, { pair: [a.label, b.label] }));
  }
  return out;
}

// ---------------------------------------------------------------- 3. labels

// The layers whose symbols are station marks (inpage.js reads their boxes).
const MARK_LAYERS = new Set(['stations-dot', 'stations', 'stations-hub', 'facilities', 'stations-unserved']);
const NETWORK_LABELS = (layers) => layers.some((id) => id.startsWith('station-labels') || id === 'rail-bullets' || id === 'rail-edge-letters' || id === 'line-signs');
// Layers the network draws (as opposed to the basemap's), by the page's own naming.
const isNetworkLayer = (id) => /^(rail|bus|station|stops|facilities|vehicles|line-|flexride|keep-out|selection)/.test(id);
const aabb = (k) => { const c = corners(k); return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))]; };
const inter = (a, b) => [Math.min(a[2], b[2]) - Math.max(a[0], b[0]), Math.min(a[3], b[3]) - Math.max(a[1], b[1])];

export function labels(raw, limits = LIMITS) {
  const out = [];
  const A = raw.view.area, W = raw.view.w, H = raw.view.h;
  const placed = raw.placed.filter((p) => { const cx = (p.box[0] + p.box[2]) / 2, cy = (p.box[1] + p.box[3]) / 2; return cx >= 0 && cy >= 0 && cx <= W && cy <= H; });
  const byId = new Map(raw.stations.map((s) => [String(s.id), s]));
  const byLabel = new Map(raw.stations.map((s) => [s.label, s]));
  const nameLimit = Math.max(limits.namePx, 1.4 * Math.SQRT2 * (raw.nameSize || 12));
  for (const p of placed) {
    const [x1, y1, x2, y2] = p.box, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const isName = p.layers.some((id) => id.startsWith('station-labels'));
    const what = isName ? `the name "${p.props.label}"` : p.layers.includes('line-signs') ? `the sign for ${p.props.lines}` : `letter ${p.props.route}`;
    if (isName) {
      const s = byId.get(String(p.props.id)) ?? byLabel.get(p.props.label);
      if (s && s.x >= 0 && s.y >= 0 && s.x <= W && s.y <= H) {
        const gap = Math.hypot(Math.max(x1 - s.x, 0, s.x - x2), Math.max(y1 - s.y, 0, s.y - y2));
        if (gap > nameLimit) out.push(finding(raw, 'label-far', (cx + s.x) / 2, (cy + s.y) / 2, gap / 2 + 16, `${what} is ${gap.toFixed(1)} px from its station (limit ${nameLimit.toFixed(1)})`, { gap: +gap.toFixed(1) }));
      }
    }
    if (NETWORK_LABELS(p.layers) && !p.layers.includes('rail-bullets') && (cy < A.y0 || cy > A.y1) && p.covered > 0.3) {
      // A name whose own station is in the band too has nowhere else to go:
      // a note. One whose station is in the open part was placed badly.
      const own = isName ? byId.get(String(p.props.id)) ?? byLabel.get(p.props.label) : null;
      const stuck = own && !inArea(A, own.x, own.y);
      out.push(finding(raw, stuck ? 'note' : 'label-under-card', cx, cy, Math.max(x2 - x1, y2 - y1) / 2 + 6, `${what} is placed in the ${cy < A.y0 ? 'top' : 'bottom'} band uncovered() leaves out, ${Math.round(p.covered * 100)}% of it under ${p.coveredBy || 'a control'}, where it can't be read${stuck ? ' (its station is under the card too)' : ''}`));
    }
  }
  // Network labels against every other placed box and every mark.
  const net = placed.filter((p) => NETWORK_LABELS(p.layers) && inArea(A, (p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2));
  const seen = new Set();
  for (const p of net) {
    for (const q of placed) {
      if (q === p || q.key === p.key || q.ignored) continue; // marks that ignore placement are checked below
      if (q.layers.every((id) => MARK_LAYERS.has(id))) continue; // so are marks placed in the grid
      const pair = [p.key, q.key].sort().join('|');
      if (seen.has(pair)) continue;
      const [ix, iy] = inter(p.box, q.box);
      if (ix > 2 && iy > 2) {
        seen.add(pair);
        const nm = (r) => (r.props.label ? `"${r.props.label}"` : r.props.route ? `letter ${r.props.route}` : r.props.name ? `"${r.props.name}"` : r.layers[0]);
        out.push(finding(raw, 'label-overlap', (Math.max(p.box[0], q.box[0]) + Math.min(p.box[2], q.box[2])) / 2, (Math.max(p.box[1], q.box[1]) + Math.min(p.box[3], q.box[3])) / 2, Math.max(ix, iy) / 2 + 12,
          `${nm(p)} (${p.layers[0]}) overlaps ${nm(q)} (${q.layers[0]}) by ${ix.toFixed(0)}x${iy.toFixed(0)} px`,
          // The basemap's own labels (roads, places) are the basemap's to place; reported, not failed.
          { basemap: !NETWORK_LABELS(q.layers) && !q.layers.some(isNetworkLayer) }));
      }
    }
    for (const k of raw.marks) {
      const [ix, iy] = inter(p.box, aabb({ ...k, w: k.w - 2, h: k.h - 2 }));
      // A name and a mark: the mark's turned box, shrunk by a pixel for its soft edge.
      if (ix > 1.5 && iy > 1.5 && sat(corners({ ...k, w: k.w - 2, h: k.h - 2 }), [[p.box[0], p.box[1]], [p.box[2], p.box[1]], [p.box[2], p.box[3]], [p.box[0], p.box[3]]])) {
        const nm = p.props.label ? `"${p.props.label}"` : `letter ${p.props.route}`;
        out.push(finding(raw, 'label-overlap', k.x, k.y, Math.max(k.w, k.h) / 2 + 14, `${nm} (${p.layers[0]}) overlaps the mark for ${k.label} (${k.layer})`));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 4. letters

// letters.spec.mjs's rule on any view: a rail line in the uncovered part of
// the screen with no letter there. Under `letterStubPx` of line, a note.
export function letters(raw, limits = LIMITS) {
  const { lines, letters: shown, reach } = raw.letters;
  return lines.filter((l) => !shown.includes(l)).map((l) => {
    const r = reach[l];
    const big = r.span >= limits.letterStubPx;
    return finding(raw, big ? 'letter-missing' : 'note', r.x, r.y, 26, `line ${l} crosses the screen (${r.span} px) with no letter on it${big ? '' : ' (a stub)'}`, { route: l, span: r.span });
  });
}

// ---------------------------------------------------------------- 5. contrast

export function contrastOf(raw, limits = LIMITS) {
  const out = [];
  const A = raw.view.area, dpr = raw.view.dpr;
  // Lines against the land beside them: the line's fill or its edge (the
  // light theme's outline), whichever reads more, from 3 px past the casing.
  if (raw.barePx && raw.lines.length) {
    const px = raw.barePx, segs = segGrid(raw.lines);
    const onLine = (p) => segs(p[0], p[1]).some(([li, i]) => segDist(p, raw.lines[li].pts[i - 1], raw.lines[li].pts[i]) < (raw.lines[li].casing || raw.lines[li].width) / 2 + 2);
    const per = new Map();
    const others = [...raw.tiers.map((t) => t.color), ...raw.lines.map((l) => l.color)].filter(Boolean);
    for (const L of raw.lines) {
      if (L.layer !== 'rail' && L.layer !== 'bus') continue;
      for (let i = 1; i < L.pts.length; i++) {
        const a = L.pts[i - 1], b = L.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!len) continue;
        const nrm = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        for (let s = 4; s < len; s += 12) {
          const p = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
          if (!inArea(A, p[0], p[1], 12) || raw.covered(p[0], p[1])) continue;
          const fill = px.at([p[0] * dpr, p[1] * dpr]);
          if (!near(fill, L.color, LIMITS.colorTol)) continue; // under something, or a crossing
          for (const sgn of [1, -1]) {
            const q = [p[0] + sgn * nrm[0] * ((L.casing || L.width) / 2 + 3), p[1] + sgn * nrm[1] * ((L.casing || L.width) / 2 + 3)];
            if (!inArea(A, q[0], q[1], 2) || raw.covered(q[0], q[1]) || onLine(q)) continue;
            const land = px.at([q[0] * dpr, q[1] * dpr]);
            // Beside it is another line (a lighter bus tier the walk doesn't
            // know), not the land: no sample.
            if (others.some((c) => !near(c, L.color, 8) && near(land, c, LIMITS.colorTol))) continue;
            const k = `${L.layer}|${L.route}`;
            if (!per.has(k)) per.set(k, { L, r: [], at: [] });
            per.get(k).r.push(Math.max(contrast(fill, land), L.edge ? contrast(L.edge, land) : 0));
            per.get(k).at.push(p);
          }
        }
      }
    }
    for (const [, { L, r, at }] of per) {
      if (r.length < 8) continue;
      const med = median(r);
      if (med < limits.lineContrast) {
        const p = at[Math.floor(at.length / 2)];
        out.push(finding(raw, 'contrast', p[0], p[1], 20, `${L.layer === 'bus' ? 'bus' : 'line'} ${L.route} (${hex(L.color)}${L.edge ? `, edge ${hex(L.edge)}` : ''}) against the land beside it: median ${med.toFixed(2)}:1 over ${r.length} samples (floor ${limits.lineContrast}:1)`, { route: L.route, ratio: +med.toFixed(2) }));
      }
    }
  }
  // Marks against what surrounds them, and dark-mode ticks reading dark.
  const px = raw.px;
  for (const k of raw.marks) {
    if (!inArea(A, k.x, k.y, 6) || raw.covered(k.x, k.y) || Math.min(k.w, k.h) < 4) continue;
    const a = (k.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const inner = [], ring = [];
    const R = Math.max(k.w, k.h) / 2 + 3;
    for (let t = 0; t < 24; t++) { const v = px.at([(k.x + R * Math.cos((t * Math.PI) / 12)) * dpr, (k.y + R * Math.sin((t * Math.PI) / 12)) * dpr]); if (v) ring.push(v); }
    for (let u = -0.48; u <= 0.481; u += 0.04) for (let v = -0.48; v <= 0.481; v += 0.08) {
      const x = k.x + u * k.w * c - v * k.h * s, y = k.y + u * k.w * s + v * k.h * c;
      const p = px.at([x * dpr, y * dpr]);
      if (p) inner.push(p);
    }
    if (!inner.length || !ring.length) continue;
    const around = [0, 1, 2].map((i) => median(ring.map((p) => p[i])));
    const ratios = inner.map((p) => contrast(p, around)).sort((x, y) => x - y);
    const best = ratios[Math.floor(ratios.length * 0.95)];
    if (best < limits.markContrast) out.push(finding(raw, 'contrast', k.x, k.y, Math.max(k.w, k.h) / 2 + 10, `the mark for ${k.label} (${k.layer}) stands out from what surrounds it (${hex(around)}) at only ${best.toFixed(2)}:1`, { ratio: +best.toFixed(2) }));
    if (raw.theme === 'dark' && k.layer === 'stations-dot') {
      const l = median(inner.map(luma));
      if (l > limits.darkTickLuma) out.push(finding(raw, 'contrast', k.x, k.y, Math.max(k.w, k.h) / 2 + 10, `dark-mode tick for ${k.label} reads light: median luma ${l.toFixed(0)} of 255 across it (limit ${limits.darkTickLuma})`, { luma: Math.round(l) }));
    }
  }
  // Letters on their bullets.
  for (const b of raw.bullets) {
    if (!b.text || !b.fill) continue;
    const r = contrast(b.text, b.fill);
    if (r < limits.letterContrast && inArea(A, b.x, b.y)) out.push(finding(raw, 'contrast', b.x, b.y, 18, `letter ${b.route}: text ${hex(b.text)} on its bullet ${hex(b.fill)} is ${r.toFixed(2)}:1 (floor ${limits.letterContrast}:1)`, { route: b.route, ratio: +r.toFixed(2) }));
  }
  // Bus tiers keep their order against the land: each at least as strong as the next.
  if (raw.tiers.length && raw.land) {
    const seen = new Map();
    for (const t of raw.tiers) if (!seen.has(hex(t.color))) seen.set(hex(t.color), { ...t, r: contrast(t.color, raw.land) });
    const ts = [...seen.values()];
    for (let i = 1; i < ts.length; i++) if (ts[i].r > ts[i - 1].r + 0.05) {
      out.push(finding(raw, 'contrast', raw.view.w / 2, (A.y0 + A.y1) / 2, 30, `bus tier ${ts[i].tier} (${hex(ts[i].color)}, ${ts[i].r.toFixed(2)}:1 on land) reads stronger than the tier above it, ${ts[i - 1].tier} (${hex(ts[i - 1].color)}, ${ts[i - 1].r.toFixed(2)}:1)`, { whole: true }));
    }
  }
  return out;
}

export const DETECTORS = { continuity, marks, labels, letters, contrast: contrastOf };
export function detect(raw, which = Object.keys(DETECTORS)) {
  return which.flatMap((k) => DETECTORS[k](raw).map((f) => ({ ...f, detector: k })));
}

// ---------------------------------------------------------------- captures

// The capture with each finding circled and numbered (1-based, in order).
export async function annotate(buf, findings, dpr, { scale = 1 } = {}) {
  const img = await loadImage(buf);
  const c = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  const k = dpr * scale;
  findings.forEach((f, i) => {
    const r = Math.max(10, Math.min(f.r || 14, 120)) * k;
    for (const [col, lw] of [['#ffffff', 6], [f.severity <= 1 ? '#ff0055' : f.severity <= 3 ? '#ff8800' : '#7a00ff', 3]]) {
      g.strokeStyle = col; g.lineWidth = lw * k * 0.5;
      g.beginPath(); g.arc(f.x * k, f.y * k, r, 0, Math.PI * 2); g.stroke();
    }
    g.font = `bold ${Math.round(11 * k)}px sans-serif`;
    g.lineWidth = 3 * k; g.strokeStyle = '#ffffff'; g.fillStyle = '#000000';
    const tx = f.x * k + r * 0.72, ty = f.y * k - r * 0.72;
    g.strokeText(String(i + 1), tx, ty); g.fillText(String(i + 1), tx, ty);
  });
  return c.toBuffer('image/png');
}

// A square crop around one finding, circled, as JPEG.
export async function crop(buf, f, dpr, size = 140) {
  const img = await loadImage(buf);
  const half = Math.max(size / 2, (f.r || 14) + 20) * dpr;
  const c = createCanvas(Math.round(2 * half), Math.round(2 * half));
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, f.x * dpr - half, f.y * dpr - half, 2 * half, 2 * half, 0, 0, 2 * half, 2 * half);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3 * dpr;
  g.beginPath(); g.arc(half, half, Math.max(10, Math.min(f.r || 14, 120)) * dpr, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#ff0055'; g.lineWidth = 1.5 * dpr; g.stroke();
  return c.toBuffer('image/jpeg', 85);
}
