// The four sheets (DESIGN.md, "Four sheets"). The map is four finished
// drawings, each for one fixed zoom on a phone, like four printed maps. This
// turns the build's network into what one sheet draws: every rail line as one
// smooth path, each station as one mark across the lines that stop there, a
// letter for each line wherever it runs alone, and every bus street.
//
// Every rule here is in screen pixels at the sheet's zoom, and none names a
// place, a line or a sheet. A sheet is this procedure run at its zoom, so
// RTD's changes redraw all of them and another sheet is one more row in SHEETS.

/** The sheets: the zoom each is drawn for and which set of bus streets it uses. */
export const SHEETS = [
  { id: 1, zoom: 10, streets: 'far' },
  { id: 2, zoom: 12, streets: 'far' },
  { id: 3, zoom: 14, streets: 'near' },
  { id: 4, zoom: 16, streets: 'near' },
];

/** Sizes in pixels, by sheet id. The page draws with these; so does the build. */
export const SIZES = {
  // Width of a rail line, and the gap between two lines that share track.
  rail: { 1: 3.6, 2: 4.4, 3: 5.6, 4: 8 },
  gap: { 1: 1.4, 2: 1.6, 3: 2, 4: 2.5 },
  // A line's path is rounded over this far, so it reads as drawn by hand.
  round: { 1: 2.5, 2: 3, 3: 3, 4: 3 },
  // Where a line changes its place beside others, it slides across over about this far each side.
  ease: 26,
  // Station marks this close would run together: the lesser one is left off the sheet.
  markRoom: 8.5,
  // A line within this many metres of a station stops there.
  walk: 600,
  // A letter sits at least this far from a station mark and from another letter,
  // and repeats along its line about this often.
  letterClear: { 1: 15, 2: 16, 3: 19, 4: 22 },
  letterEvery: { 1: 190, 2: 260, 3: 340, 4: 420 },
  // Another line within this many pitches means the line isn't running alone.
  alone: 1.6,
  // Station names: lettering size, and whether the sheet names every station or only the hub and line ends.
  name: { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 },
  nameAll: { 1: false, 2: true, 3: true, 4: true },
  nameMinor: 10,
  // A name whose best spot still sits on this much line is left for a closer sheet.
  nameCrowd: 26,
  nameShorten: 3,
  // A station's other bar this far from its first is named too, so each end of a long station says what it is.
  nameAgain: 120,
  // Where two or more lines end at a bar, its name carries their letters in a row: each disc this big, this far apart.
  nameLetter: { 1: 5.6, 2: 6, 3: 6.6, 4: 7.4 },
  // Bus streets: a stretch shorter than this takes the class of the stretches
  // it joins, and a loop or stub smaller than this is not drawn.
  busBlip: 14,
  busBlipMetres: 120,
  busRun: 45,
  busRing: 32,
  busBridgeMetres: 110,
  busRunMetres: 220,
  busSpeck: 10,
  // Two ways round that enclose a strip thinner than this are drawn as one street.
  busSlim: 6,
  // A street's end this near another street is on it.
  busSnap: 3,
  // A street that carries straight on and strays no farther than this from a straight line is drawn straight.
  busStraight: 2.5,
  // Where a street turns at a corner the turn is rounded over about this far, as a pen would take it.
  busTurn: { 1: 3, 2: 4, 3: 6, 4: 9 },
  // Bus streets closer together than this can't be told apart: they are drawn as one.
  busMerge: { 1: 4, 2: 7, 3: 7, 4: 24 },
  // Along one street, the blocks that carry its label are at least this far apart.
  busLabelEvery: { 1: 150, 2: 170, 3: 240, 4: 320 },
  busLabelSize: { 1: 8.5, 2: 8.5, 3: 10, 4: 11.5 },
  // Clear air at each end of a labelled block: the figures' halo and a little more, so they stop short of the cross streets.
  busLabelAir: 4,
  // A bus station's hall is drawn where it is at least this wide; a street that ends this near its wall ends on it.
  hallWide: 5,
  hallReach: 10,
  // The size of the lettering that says what a hall is.
  hallLetter: 9.5,
  // The sheet from which bus stops are drawn, each a ring.
  stopSheet: 4,
  // A stop's ring, out to its edge (public/js/sheets/style.js, STOP_RING).
  stopRing: 3.7,
};

// --- Screen pixels at a zoom (512-pixel tiles, as MapLibre draws) -----------

const world = (zoom) => 512 * 2 ** zoom;

/** Metres on the ground to one pixel, at a latitude and zoom. */
export const metresPerPixel = (lat, zoom) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / world(zoom);

export function toPx([lon, lat], zoom) {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * world(zoom), (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world(zoom)];
}

export function toLonLat([x, y], zoom) {
  const n = Math.PI - (2 * Math.PI * y) / world(zoom);
  return [round6((x / world(zoom)) * 360 - 180), round6((180 / Math.PI) * Math.atan(Math.sinh(n)))];
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function length(path) {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += dist(path[i - 1], path[i]);
  return sum;
}

/** The path with a point every `step` pixels (and its last point). */
export function resample(path, step = 1) {
  const out = [path[0]];
  let need = step;
  for (let i = 1; i < path.length; i++) {
    let a = path[i - 1];
    const b = path[i];
    let left = dist(a, b);
    while (left >= need) {
      a = lerp(a, b, need / left);
      out.push(a);
      left -= need;
      need = step;
    }
    need -= left;
  }
  if (dist(out.at(-1), path.at(-1)) > 1e-6) out.push(path.at(-1));
  return out;
}

/** A path moved `by` pixels to its right (the way MapLibre's line-offset goes). */
export function offset(path, by) {
  if (!by) return path.map((p) => [...p]);
  const normal = (a, b) => {
    const d = dist(a, b) || 1;
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  };
  return path.map((p, i) => {
    const before = i > 0 ? normal(path[i - 1], p) : null;
    const after = i < path.length - 1 ? normal(p, path[i + 1]) : null;
    const n = before && after ? [before[0] + after[0], before[1] + after[1]] : before ?? after;
    const len = Math.hypot(n[0], n[1]) || 1;
    // A mitre, held to twice the offset at a sharp turn.
    const cos = before && after ? Math.max(0.5, (len / 2)) : 1;
    return [p[0] + ((n[0] / len) * by) / cos, p[1] + ((n[1] / len) * by) / cos];
  });
}

/** A path rounded over `radius` pixels: evenly spaced points, each the average of its neighbours. Ends stay put. */
export function rounded(path, radius) {
  const pts = resample(path, 1);
  const r = Math.max(1, Math.round(radius));
  if (pts.length < 2 * r + 3) return pts;
  let now = pts;
  // Two passes of a moving average are close to a Gaussian.
  for (let pass = 0; pass < 2; pass++) {
    const next = now.map((p, i) => {
      const k = Math.min(r, i, now.length - 1 - i);
      if (!k) return p;
      let x = 0;
      let y = 0;
      for (let j = i - k; j <= i + k; j++) {
        x += now[j][0];
        y += now[j][1];
      }
      return [x / (2 * k + 1), y / (2 * k + 1)];
    });
    now = next;
  }
  return now;
}

/** Douglas-Peucker: drop points that move the path less than `tolerance` pixels. */
export function simplify(path, tolerance = 0.2) {
  if (path.length < 3) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    let worst = 0;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const d = toSegment(path[i], path[from], path[to]).d;
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

function toSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const at = [a[0] + dx * t, a[1] + dy * t];
  return { d: dist(p, at), at, t };
}

/** The nearest point of a path to `p`: its distance, the point, and how far along the path it is. */
export function nearest(path, p) {
  let best = { d: Infinity, at: path[0], along: 0 };
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1], path[i]);
    const hit = toSegment(p, path[i - 1], path[i]);
    if (hit.d < best.d) best = { d: hit.d, at: hit.at, along: run + seg * hit.t };
    run += seg;
  }
  return best;
}

/** Pieces joined end to end into as few paths as their ends allow (ends within `reach` pixels meet). */
export function chained(pieces, reach = 1.5, turned = (p) => [...p].reverse()) {
  const left = pieces.filter((p) => p.length > 1).map((p) => [...p]);
  const runs = [];
  while (left.length) {
    let run = left.shift();
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const p = left[i];
        const joins = [
          [dist(run.at(-1), p[0]), () => run.concat(p.slice(1))],
          [dist(run.at(-1), p.at(-1)), () => run.concat(turned(p).slice(1))],
          [dist(run[0], p.at(-1)), () => p.concat(run.slice(1))],
          [dist(run[0], p[0]), () => turned(p).concat(run.slice(1))],
        ].sort((a, b) => a[0] - b[0])[0];
        if (joins[0] <= reach) {
          run = joins[1]();
          left.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    runs.push(run);
  }
  return runs;
}

// --- Rail --------------------------------------------------------------------

/**
 * Every rail line as smooth whole paths in pixels: `{ route, color, paths }`.
 * The build's pieces carry a `slot` (how many line widths to the side of the
 * shared track a piece sits). Here a line's pieces are joined on the track
 * first, so the line is whole; then each point is moved to its slot, and where
 * the slot changes the line slides across over `ease` pixels, not in a step.
 */
export function railLines(routes, sheet) {
  const pitch = SIZES.rail[sheet.id] + SIZES.gap[sheet.id];
  const lines = new Map();
  for (const f of routes.features) {
    const q = f.properties;
    if (q.mode !== 'rail' || f.geometry.type !== 'LineString') continue;
    if (!lines.has(q.route)) lines.set(q.route, { route: q.route, color: q.color, pieces: [] });
    // A third number rides along with each point: its slot.
    lines.get(q.route).pieces.push(f.geometry.coordinates.map((c) => [...toPx(c, sheet.zoom), q.slot ?? 0]));
  }
  return [...lines.values()].map(({ route, color, pieces }) => ({
    route,
    color,
    // Pieces that meet are joined first. A scrap lying beside the line (a second track in
    // the data) is not part of the drawing; then a short break in the data is bridged.
    paths: whole(chained(apart(chained(pieces, 0.75, turned), 4 * pitch), 4 * pitch, turned), SIZES.busBlip)
      .map((run) => simplify(rounded(slotted(run, pitch, SIZES.ease), SIZES.round[sheet.id]))),
  }));
}

/** A piece of [x, y, slot] points run the other way: its slot is then on the other hand. */
const turned = (p) => [...p].reverse().map(([x, y, slot]) => [x, y, -slot]);

/** The runs, longest first, without those that lie wholly within `beside` of a longer one: a second track of the same line. */
function apart(runs, beside) {
  const kept = [];
  for (const run of [...runs].sort((a, b) => length(b) - length(a))) {
    if (!kept.length || !run.every((p) => kept.some((k) => nearest(k, p).d <= beside))) kept.push(run);
  }
  return kept;
}

/** The runs worth drawing: scraps shorter than `scrap` go when the line has a longer run. */
function whole(runs, scrap) {
  const long = runs.filter((r) => length(r) >= scrap);
  return long.length ? long : runs;
}

/** A run of [x, y, slot] points, each moved `slot * pitch` to its right, the slot eased along the run. */
function slotted(run, pitch, ease) {
  // A point every pixel, each with the slot of the piece it is on.
  const pts = [];
  for (let i = 1; i < run.length; i++) {
    const [a, b] = [run[i - 1], run[i]];
    const steps = Math.max(1, Math.round(dist(a, b)));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) pts.push([...lerp(a, b, k / steps), k / steps < 0.5 ? a[2] : b[2]]);
  }
  // The track itself is rounded over three pitches before anything is set beside it, so the
  // line on the inside of a tight bend still has room to curve: the pack turns as one.
  const reach = Math.round(3 * pitch);
  for (let pass = 0; pass < 2; pass++) {
    const was = pts.map(([x, y]) => [x, y]);
    pts.forEach((p, i) => {
      const k = Math.min(reach, i, pts.length - 1 - i);
      let [x, y] = [0, 0];
      for (let j = i - k; j <= i + k; j++) { x += was[j][0]; y += was[j][1]; }
      p[0] = x / (2 * k + 1);
      p[1] = y / (2 * k + 1);
    });
  }
  let slots = pts.map((p) => p[2]);
  for (let pass = 0; pass < 2; pass++) {
    slots = slots.map((_, i) => {
      const k = Math.min(ease, i, slots.length - 1 - i);
      let sum = 0;
      for (let j = i - k; j <= i + k; j++) sum += slots[j];
      return sum / (2 * k + 1);
    });
  }
  return pts.map((p, i) => {
    // The side is judged over a stretch about twice as long as the move is far, so a line set
    // well to the side of a tight bend sweeps round it and doesn't fold over itself.
    const span = Math.max(2, Math.round(2 * Math.abs(slots[i]) * pitch));
    const [a, b] = [pts[Math.max(0, i - span)], pts[Math.min(pts.length - 1, i + span)]];
    const d = dist(a, b) || 1;
    return [p[0] - ((b[1] - a[1]) / d) * slots[i] * pitch, p[1] + ((b[0] - a[0]) / d) * slots[i] * pitch];
  });
}

/** The point `far` pixels along a path. */
function pointAlong(path, far) {
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1], path[i]);
    if (run + seg >= far && seg > 0) return lerp(path[i - 1], path[i], Math.max(0, far - run) / seg);
    run += seg;
  }
  return path.at(-1);
}

/** The part of a path between two distances along it. */
function partOf(path, from, to) {
  const out = [pointAlong(path, from)];
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    run += dist(path[i - 1], path[i]);
    if (run > from && run < to) out.push(path[i]);
  }
  out.push(pointAlong(path, to));
  return out;
}

/** Which way a path is heading `far` pixels along it. */
function headingAt(path, far, total = length(path)) {
  const [a, b] = [pointAlong(path, Math.max(0, far - 3)), pointAlong(path, Math.min(total, far + 3))];
  const d = dist(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}

/**
 * One mark for each station trains stop at: a bar across the lines that stop
 * there, from the first to the last (a dot when there is one line).
 */
export function stationMarks(stations, lines, sheet, walls = []) {
  const byRoute = new Map(lines.map((l) => [l.route, l]));
  const pitch = SIZES.rail[sheet.id] + SIZES.gap[sheet.id];
  const marks = [];
  // Where each line stops, so a line can tell whether any of its stations lie beyond another.
  const stopsOf = new Map();
  for (const f of stations.features) {
    if (!f.properties.served) continue;
    f.px = toPx(f.geometry.coordinates, sheet.zoom);
    for (const r of String(f.properties.lines ?? '').split(' ')) {
      if (!stopsOf.has(r)) stopsOf.set(r, []);
      stopsOf.get(r).push(f);
    }
  }
  for (const f of stations.features) {
    const q = f.properties;
    if (!q.served) continue;
    const at = toPx(f.geometry.coordinates, sheet.zoom);
    // A line stops here if its drawn path passes within a walk of the station (or, on a
    // wide sheet where a walk is under a pixel, within the width of the lines listed).
    const listed = String(q.lines ?? '').split(' ').map((r) => byRoute.get(r)).filter(Boolean);
    const walk = Math.max(SIZES.walk / metresPerPixel(f.geometry.coordinates[1], sheet.zoom), listed.length * pitch);
    const hits = listed.map((line) => {
      let best = null;
      line.paths.forEach((path, pi) => {
        const h = nearest(path, at);
        if (!best || h.d < best.d) best = { ...h, line, pi };
      });
      return best;
    }).filter((h) => h && h.d <= walk);
    if (!hits.length) continue;
    for (const h of hits) {
      const path = h.line.paths[h.pi];
      h.total = length(path);
      h.heading = headingAt(path, h.along, h.total);
      // A line whose path stops within a few pitches of the station ends here, and so does one
      // that runs on no farther than a walk with none of its stations beyond: its tail track
      // past the platform is no part of the line.
      const others = (stopsOf.get(h.line.route) ?? []).filter((o) => o !== f)
        .map((o) => nearest(path, o.px)).filter((o) => o.d <= walk).map((o) => o.along);
      const open = (side) => !others.some((a) => (side ? a > h.along + pitch : a < h.along - pitch));
      h.end = h.along < 3 * pitch ? 0 : h.total - h.along < 3 * pitch ? 1
        : h.total - h.along <= walk && open(1) ? 1 : h.along <= walk && open(0) ? 0 : null;
    }
    // Platforms apart from each other get a bar each; the bar with the most lines carries the name.
    const groups = [];
    for (const h of hits) {
      const g = groups.find((o) => o.some((x) => dist(x.at, h.at) <= 3.5 * pitch));
      if (g) g.push(h); else groups.push([h]);
    }
    groups.sort((x, y) => y.length - x.length);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
    // A bar lies square across its lines: across the heading most of them share.
    const across = (g) => [...g].sort((x, y) => g.reduce((n, o) => n + Math.abs(dot(y.heading, o.heading)) - Math.abs(dot(x.heading, o.heading)), 0))[0].heading;
    const first = across(groups[0]);
    const bars = groups.map((g, gi) => {
      const allEnd = g.every((h) => h.end !== null);
      // Platforms of one station where lines end are drawn parallel, as one station.
      let t = across(g);
      if (gi && allEnd && Math.abs(dot(t, first)) > 0.5) t = first;
      const n = [-t[1], t[0]];
      let c = [g.reduce((x, h) => x + h.at[0], 0) / g.length, g.reduce((y, h) => y + h.at[1], 0) / g.length];
      for (const h of g) h.s = dot([h.at[0] - c[0], h.at[1] - c[1]], n);
      // A line that ends here is drawn into the bar square-on and stops at it, whatever the
      // track does in its last few yards; lines ending side by side keep their pitch.
      const reach = (h) => Math.min(14 * pitch, h.total / 3);
      // Where a line's lead-in begins: that far back along it from the station, not from the end of any tail track.
      const start = (h) => (h.end ? Math.max(0, Math.min(h.along, h.total) - reach(h)) : Math.min(h.total, h.along + reach(h)));
      const inward = (h) => {
        const q = pointAlong(h.line.paths[h.pi], start(h));
        return dot([q[0] - c[0], q[1] - c[1]], t) >= 0 ? 1 : -1;
      };
      const enders = g.filter((h) => h.end !== null);
      const sets = [1, -1].map((side) => enders.filter((h) => inward(h) === side).sort((x, y) => x.s - y.s));
      // Lines that end here coming in from either side meet back to back at one bar, each set
      // centred on it: the bar is drawn fat, with a divider down it, so they don't read as
      // running through.
      g.fat = allEnd && sets.every((set) => set.length);
      // Lines that end over a bus station's hall end at its wall, not somewhere inside the
      // room: the bar is drawn where they come in.
      const room = allEnd && !g.fat && walls.find((w) => within(c, w.ring));
      if (room) {
        const side = sets[0].length ? 1 : -1;
        const out = crossing(c, [t[0] * side, t[1] * side], room.ring);
        if (out) c = out;
      }
      const all = enders.reduce((x, h) => x + h.s, 0) / (enders.length || 1);
      for (const [k, side] of [1, -1].entries()) {
        const set = sets[k];
        if (!set.length) continue;
        const mid = g.fat ? all : set.reduce((x, h) => x + h.s, 0) / set.length;
        set.forEach((h, i) => {
          if (allEnd) h.s = mid + (i - (set.length - 1) / 2) * pitch;
          const path = h.line.paths[h.pi];
          const far = reach(h);
          const from = start(h);
          const p0 = pointAlong(path, from);
          const u = headingAt(path, from, h.total).map((v) => (h.end ? v : -v));
          const p3 = [c[0] + n[0] * h.s, c[1] + n[1] * h.s];
          const p1 = [p0[0] + u[0] * far * 0.4, p0[1] + u[1] * far * 0.4];
          const p2 = [p3[0] + t[0] * side * far * 0.4, p3[1] + t[1] * side * far * 0.4];
          const curve = [];
          for (let k = 1; k <= 16; k++) {
            const [v, w] = [k / 16, 1 - k / 16];
            curve.push([0, 1].map((j) => w * w * w * p0[j] + 3 * w * w * v * p1[j] + 3 * w * v * v * p2[j] + v * v * v * p3[j]));
          }
          h.line.paths[h.pi] = h.end ? [...partOf(path, 0, from), ...curve] : [...curve.reverse(), ...partOf(path, from, h.total)];
          h.at = p3;
        });
      }
      const ss = g.map((h) => h.s);
      // Each side's lines together, in the order a reader meets them at the bar, left to right.
      g.ending = sets.flatMap((set) => set.filter((h) => h.at).sort((x, y) => x.at[0] - y.at[0] || x.at[1] - y.at[1])).map((h) => ({ route: h.line.route, color: h.line.color }));
      return [Math.min(...ss), Math.max(...ss)].map((v) => [c[0] + n[0] * v, c[1] + n[1] * v]);
    });
    const ends = bars[0];
    marks.push({ id: q.id, name: q.label ?? q.name, hub: !!q.hub, end: !!q.end, lines: q.lines, count: hits.length, ends, span: dist(ends[0], ends[1]), more: bars.slice(1), fat: !!groups[0].fat,
      // Each bar with the lines that end at it, for its name.
      bars: bars.map((ends, i) => ({ ends, ending: groups[i].ending })) });
  }
  // Marks need room. The hub first, then line ends, then stations with more lines; a mark
  // that would touch one already drawn is left for a closer sheet.
  const rank = (m) => (m.hub ? 0 : m.end ? 1 : 2) * 100 - m.count;
  const drawn = [];
  for (const m of marks.sort((a, b) => rank(a) - rank(b) || a.id - b.id)) {
    const near = (o) => Math.min(...m.ends.flatMap((a) => o.ends.map((b) => dist(a, b)))) < SIZES.markRoom;
    if (!drawn.some(near)) drawn.push(m);
  }
  return drawn;
}

/** Whether a point is within `by` of a path's bounding box: a quick no before measuring. */
const boxes = new WeakMap();
function boxed(path, p, by) {
  if (!boxes.has(path)) boxes.set(path, [Math.min(...path.map((q) => q[0])), Math.min(...path.map((q) => q[1])), Math.max(...path.map((q) => q[0])), Math.max(...path.map((q) => q[1]))]);
  const b = boxes.get(path);
  return p[0] >= b[0] - by && p[0] <= b[2] + by && p[1] >= b[1] - by && p[1] <= b[3] + by;
}

/** Whether a point is inside a ring. */
function within(p, ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) inside = !inside;
  }
  return inside;
}

/** Where a ray from a point first crosses a ring. */
function crossing(p, u, ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    const e = [b[0] - a[0], b[1] - a[1]];
    const den = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const far = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den;
    const on = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den;
    if (far > 0 && on >= 0 && on <= 1 && far < best) best = far;
  }
  return best < Infinity ? [p[0] + u[0] * best, p[1] + u[1] * best] : null;
}

/**
 * Where each line's letter goes: on the line, where no other line is beside
 * it, clear of station marks and other letters, near each end and then every
 * so often, so any phone screen with a line on it has its letter.
 */
export function letters(lines, marks, sheet) {
  const placed = [];
  const stops = marks.flatMap((m) => [m.ends, ...m.more].flat());
  const clear = SIZES.letterClear[sheet.id];
  const every = SIZES.letterEvery[sheet.id];
  const pitch = SIZES.rail[sheet.id] + SIZES.gap[sheet.id];
  for (const line of lines) {
    const others = lines.filter((l) => l !== line).flatMap((l) => l.paths);
    for (const path of line.paths) {
      const pts = resample(path, 2);
      const mine = [];
      const near = Math.round(clear / 4);
      const fits = (i, alone = true) => {
        const p = pts[i];
        return Math.min(i, pts.length - 1 - i) * 2 >= 2 * clear
          && !stops.some((s) => dist(s, p) < 1.4 * clear)
          && ![...placed, ...mine].some((s) => dist(s.at, p) < 2 * clear)
          // Alone means alone for a letter's width each way, so no letter sits where lines part.
          && !(alone && [i - near, i, i + near].some((j) => pts[j] && others.some((o) => nearest(o, pts[j]).d < SIZES.alone * pitch)));
      };
      const put = (i) => mine.push({ route: line.route, color: line.color, ink: inkOn(line.color), at: pts[i], i });
      // The first clear spot from each end, so the letter is as near the line's ends (and
      // the hub, where lines are told apart) as it can be; then one every so often between.
      const first = pts.findIndex((_, i) => fits(i));
      if (first >= 0) {
        put(first);
        for (let i = pts.length - 1; i > first; i--) if (fits(i)) { put(i); break; }
        const last = Math.max(...mine.map((m) => m.i));
        for (let i = first, from = first; i < last; i++) {
          if ((i - from) * 2 >= every && (last - i) * 2 >= every / 2 && fits(i)) { put(i); from = i; }
        }
      }
      // A line that shares its track for a long way would go unlettered there: where it has
      // gone further than that without a letter, one sits on it among its neighbours.
      for (let i = 0, from = -every / 2; i < pts.length; i++) {
        if (mine.some((m) => m.i === i)) from = i;
        else if ((i - from) * 2 >= 2 * every && !mine.some((m) => m.i > i && (m.i - i) * 2 < every) && fits(i, false)) { put(i); from = i; }
      }
      placed.push(...mine);
    }
  }
  return placed;
}

/**
 * Where each station's name goes, chosen the way a cartographer would: beside
 * its mark, on the side with the most open ground, clear of every rail line,
 * letter and name already set. Important stations choose first. A name with
 * nowhere clear to go is left for a closer sheet, unless it is the hub or a
 * line's end. Returns `{ mark, text, anchor, offset, justify }`, offset in ems.
 */
export function names(marks, lines, discs, sheet, streets = []) {
  const rail = SIZES.rail[sheet.id];
  const cell = 3;
  // What a name must not sit on, and how much each costs: rail and marks most, then busy
  // bus streets, then quiet ones.
  const ink = new Map();
  const stamp = (p, r, cost) => {
    for (let x = Math.floor((p[0] - r) / cell); x <= Math.floor((p[0] + r) / cell); x++) {
      for (let y = Math.floor((p[1] - r) / cell); y <= Math.floor((p[1] + r) / cell); y++) {
        const k = `${x},${y}`;
        if ((ink.get(k) ?? 0) < cost) ink.set(k, cost);
      }
    }
  };
  for (const st of streets) for (const p of resample(st.path, 2)) stamp(p, 1, CLASS_ORDER.indexOf(st.cls) >= 2 ? 2 : 1);
  for (const l of lines) for (const path of l.paths) for (const p of resample(path, 2)) stamp(p, rail / 2 + 1.5, 4);
  for (const d of discs) stamp(d.at, 9, 4);
  for (const m of marks) for (const bar of [m.ends, ...m.more]) for (const p of resample(bar, 2)) stamp(p, rail / 2 + 2, 4);
  const inked = (box) => {
    let n = 0;
    for (let x = Math.floor(box[0] / cell); x <= Math.floor(box[2] / cell); x++) {
      for (let y = Math.floor(box[1] / cell); y <= Math.floor(box[3] / cell); y++) n += ink.get(`${x},${y}`) ?? 0;
    }
    return n;
  };
  const touch = (a, b) => a[0] < b[2] + 3 && b[0] < a[2] + 3 && a[1] < b[3] + 2 && b[1] < a[3] + 2;
  // Sides in the order a reader expects, each with a small cost so ties go to the right of the mark.
  const sides = [
    [1, 0, 'left', 0], [-1, 0, 'right', 0.5], [1, -1, 'bottom-left', 0.7], [1, 1, 'top-left', 0.7],
    [-1, -1, 'bottom-right', 1], [-1, 1, 'top-right', 1], [0, 1, 'top', 1.2], [0, -1, 'bottom', 1.2],
  ];
  const set = [];
  const rank = (m) => (m.hub ? 0 : m.end ? 1 : 2) * 100 - m.count;
  const r = SIZES.nameLetter[sheet.id];
  for (const m of [...marks].sort((a, b) => rank(a) - rank(b) || a.id - b.id)) for (const [bi, bar] of (m.bars ?? [{ ends: m.ends, ending: [] }]).entries()) {
    const mid = lerp(bar.ends[0], bar.ends[1], 0.5);
    const again = (b) => dist(lerp(b.ends[0], b.ends[1], 0.5), lerp(m.ends[0], m.ends[1], 0.5)) >= SIZES.nameAgain;
    if (bi && !again(bar)) continue;
    const must = m.hub || m.end;
    // The letters of the lines that end here together, which no letter on the line can sit near.
    // A bar too near the first for a name of its own has its letters on the first's.
    const ending = bi ? bar.ending : (m.bars ?? [bar]).filter((b, i) => !i || !again(b)).flatMap((b) => b.ending);
    const row = ending.length >= 2 ? ending : [];
    // Where not every name fits, the hub and line ends are lettered larger than the rest.
    const minor = !must && !SIZES.nameAll[sheet.id];
    const size = minor ? SIZES.nameMinor : SIZES.name[sheet.id];
    const c = mid;
    const half = [(bar.ends[1][0] - bar.ends[0][0]) / 2, (bar.ends[1][1] - bar.ends[0][1]) / 2];
    const placed = (text) => {
      const rows = text.split('\n');
      const wide = Math.max(...rows.map((t) => t.length)) * size * 0.56;
      const tall = rows.length * size * 1.12;
      // The row of letters sits under the name, and the name's room includes it.
      const [w, h] = [Math.max(wide, row.length * (2 * r + 2)), tall + (row.length ? 2 * r + 5 : 0)];
      let best = null;
      for (const reach of [1, 1.8, 2.8]) {
        for (const [dx, dy, anchor, cost] of sides) {
          const n = Math.hypot(dx, dy);
          const off = (rail / 2 + 5 + Math.abs((half[0] * dx + half[1] * dy) / n)) * reach;
          const at = [c[0] + (dx / n) * off, c[1] + (dy / n) * off];
          const x0 = at[0] + (dx > 0 ? 0 : dx < 0 ? -w : -w / 2);
          const y0 = at[1] + (dy > 0 ? 0 : dy < 0 ? -h : -h / 2);
          const box = [x0, y0, x0 + w, y0 + h];
          // The name keeps its own anchor: where the row makes the box taller, the text sits at its top.
          const ty = dy > 0 ? at[1] : dy < 0 ? y0 + tall : y0 + tall / 2;
          const hits = set.filter((o) => touch(box, o.box)).length;
          const score = hits * 1000 + inked(box) + cost + (reach - 1) * 2;
          if (!best || score < best.score) best = { text, score, hits, box, anchor, tall, offset: [(at[0] - c[0]) / size, (ty - c[1]) / size] };
        }
      }
      return best;
    };
    // A name is written out where it has room; where it would sit on lines or stand off from
    // its mark, the shortened name is used if that sits better.
    let best = placed(wrapped(m.name));
    const brief = wrapped(shortened(m.name));
    if (brief !== best.text && best.score >= SIZES.nameShorten) {
      const other = placed(brief);
      if (other.score < best.score - 1) best = other;
    }
    const text = best.text;
    // Where every station is named, a name gives way only to another name; where they are
    // not, it also gives way to lines.
    if (!must && (best.hits || (minor && best.score >= SIZES.nameCrowd))) continue;
    const justify = best.anchor.includes('left') ? 'left' : best.anchor.includes('right') ? 'right' : 'center';
    const [x0, , x1] = best.box;
    const span = row.length * (2 * r + 2) - 2;
    const left = justify === 'left' ? x0 : justify === 'right' ? x1 - span : (x0 + x1 - span) / 2;
    const letters = row.map((l, i) => ({ route: l.route, color: l.color, ink: inkOn(l.color), at: [left + r + i * (2 * r + 2), best.box[1] + best.tall + 3 + r] }));
    set.push({ mark: m, at: c, text, minor, box: best.box, anchor: best.anchor, offset: best.offset, justify, letters });
  }
  return set;
}

/**
 * Streets with every ring too small to read as a ring drawn as the point where its streets
 * meet: a turnaround at a station or the end of a route is a dot's width on the sheet, and
 * drawn true it is a knot of hooks. The streets that led into the ring now meet at its middle.
 */
function unringed(streets, most) {
  const edges = cornered(streets);
  const small = edges.filter((e) => e.len < most && e.a !== e.b);
  const at = new Map();
  for (const e of small) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), e]);
  const group = new Map();
  const find = (k) => { while (group.has(k) && group.get(k) !== k) k = group.get(k); return k; };
  const meet = new Map();
  const corner = new Map();
  const twice = new Set();
  for (const e of edges) for (const k of new Set([e.a, e.b])) meet.set(k, [...(meet.get(k) ?? []), e]);
  for (const e of edges) for (const [k, q] of [[e.a, e.st.path[0]], [e.b, e.st.path.at(-1)]]) if (!corner.has(k)) corner.set(k, q);
  // Which way a street leaves a corner.
  const leaves = (o, k) => {
    const path = o.a === k ? o.st.path : [...o.st.path].reverse();
    const q = pointAlong(path, Math.min(4, o.len));
    const d = dist(path[0], q) || 1;
    return [(q[0] - path[0][0]) / d, (q[1] - path[0][1]) / d];
  };
  for (const e of small) {
    // The shortest way round from one end of this street to the other without using it.
    const far = new Map([[e.a, { d: 0, via: [], by: [] }]]);
    const open = [e.a];
    while (open.length) {
      const k = open.sort((x, y) => far.get(y).d - far.get(x).d).pop();
      for (const o of at.get(k) ?? []) {
        if (o === e) continue;
        const to = o.a === k ? o.b : o.a;
        const d = far.get(k).d + o.len;
        if (d + e.len < most && (!far.has(to) || d < far.get(to).d)) { far.set(to, { d, via: [...far.get(k).via, to], by: [...far.get(k).by, o] }); open.push(to); }
      }
    }
    if (!far.has(e.b)) continue;
    // A block between streets that carry on past it is not a turnaround, however small: a side
    // of the ring with a street straight on from it at both ends is part of a street going through.
    const ring = [e, ...far.get(e.b).by];
    const through = ring.filter((o) => o.a !== o.b && [o.a, o.b].every((k) => {
      const mine = leaves(o, k);
      return (meet.get(k) ?? []).some((x) => !ring.includes(x) && x.a !== x.b && ((v) => mine[0] * v[0] + mine[1] * v[1] < -0.8)(leaves(x, k)));
    }));
    // Two streets between the same two corners that never part are one street said twice, not
    // a ring: the busier is drawn and carries the other's routes.
    if (ring.length === 2 && ring[1].st.path.every((q) => nearest(ring[0].st.path, q).d < 2)) {
      const [keep, drop] = CLASS_ORDER.indexOf(ring[0].st.cls) >= CLASS_ORDER.indexOf(ring[1].st.cls) ? ring : [ring[1], ring[0]];
      if (!twice.has(keep) && !twice.has(drop)) {
        twice.add(drop);
        const all = [...new Set(`${keep.st.routes} ${drop.st.routes}`.split(' '))].sort();
        keep.st = { ...keep.st, routes: all.join(' '), n: Math.max(keep.st.n ?? 0, all.length) };
      }
      continue;
    }
    if (through.length >= 2) continue;
    const ks = [e.a, ...far.get(e.b).via];
    for (const k of ks) { if (!group.has(k)) group.set(k, k); group.set(find(k), find(ks[0])); }
  }
  if (!group.size && !twice.size) return streets;
  const members = new Map();
  for (const e of edges) for (const [k, p] of [[e.a, e.st.path[0]], [e.b, e.st.path.at(-1)]]) {
    if (group.has(k)) members.set(find(k), [...(members.get(find(k)) ?? []), p]);
  }
  const middle = new Map([...members].map(([k, ps]) => [k, [ps.reduce((x, q) => x + q[0], 0) / ps.length, ps.reduce((y, q) => y + q[1], 0) / ps.length]]));
  // A street that runs straight through what is gathered stays straight: the meeting point is
  // on the line between where it comes in and where it goes out, not off to the side of it.
  const into = new Map();
  for (const e of edges) {
    const [ga, gb] = [group.has(e.a) ? find(e.a) : null, group.has(e.b) ? find(e.b) : null];
    if (ga && ga === gb) continue;
    if (ga) into.set(ga, [...(into.get(ga) ?? []), { e, k: e.a }]);
    if (gb) into.set(gb, [...(into.get(gb) ?? []), { e, k: e.b }]);
  }
  for (const [g, list] of into) {
    let best = null;
    for (const x of list) for (const y of list) {
      if (x === y) continue;
      const [u, v] = [leaves(x.e, x.k), leaves(y.e, y.k)];
      const [p, q] = [corner.get(x.k), corner.get(y.k)];
      const off = Math.abs((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]);
      const busy = Math.min(CLASS_ORDER.indexOf(x.e.st.cls), CLASS_ORDER.indexOf(y.e.st.cls));
      if (u[0] * v[0] + u[1] * v[1] < -0.8 && off < 3 && (!best || busy > best.busy)) best = { p, q, busy };
    }
    if (best) middle.set(g, toSegment(middle.get(g), best.p, best.q).at);
  }
  const out = [];
  for (const e of edges) {
    const [ga, gb] = [group.has(e.a) ? find(e.a) : null, group.has(e.b) ? find(e.b) : null];
    if (twice.has(e) || (ga && ga === gb && e.len < most)) continue;
    const path = [...e.st.path];
    if (ga) path[0] = middle.get(ga);
    if (gb) path[path.length - 1] = middle.get(gb);
    out.push({ ...e.st, path });
  }
  return out;
}

/** Each street with the corners its two ends are at. */
function cornered(streets) {
  // Ends within a pixel and a half of each other are one corner.
  const seen = new Map();
  const key = (p) => {
    const [x, y] = [Math.round(p[0] / 2), Math.round(p[1] / 2)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const q of seen.get(`${x + dx},${y + dy}`) ?? []) if (dist(q.p, p) <= 1.5) return q.id;
    }
    const id = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    seen.set(`${x},${y}`, [...(seen.get(`${x},${y}`) ?? []), { p, id }]);
    return id;
  };
  return streets.map((st) => ({ st, a: key(st.path[0]), b: key(st.path.at(-1)), len: length(st.path) }));
}

/**
 * Streets without slivers. Where two ways between the same two corners enclose a strip too
 * thin to see into (a route that leaves a street and comes back to it a block later, or the
 * cell between two streets that run side by side), the drawing is a notch or a hook on the
 * street. The strip has two tips, its corners farthest apart, and a way round each side
 * between them: the quieter way (or, of two alike, the longer) is not drawn, the other carries
 * its routes, and a street that met the way not drawn is led across to the one that is. A thin
 * loop that hangs from one corner is made one closed street, for `unlooped` to draw.
 */
function unslivered(streets, most, slim, snap) {
  const edges = cornered(streets);
  const at = new Map();
  const add = (e) => { for (const k of new Set([e.a, e.b])) at.set(k, [...(at.get(k) ?? []), e]); };
  edges.forEach(add);
  const where = new Map();
  for (const e of edges) for (const [k, p] of [[e.a, e.st.path[0]], [e.b, e.st.path.at(-1)]]) if (!where.has(k)) where.set(k, p);
  const gone = new Set();
  const rank = (o) => CLASS_ORDER.indexOf(o.st.cls);
  const live = (k) => (at.get(k) ?? []).filter((o) => !gone.has(o));
  const routesOf = (list) => [...new Set(list.flatMap((o) => String(o.st.routes).split(' ')))];
  for (const e of [...edges].sort((x, y) => x.len - y.len)) {
    if (gone.has(e) || e.a === e.b || e.len >= most) continue;
    // The shortest way round from one end of this street to the other without using it.
    const far = new Map([[e.a, { d: 0, by: [] }]]);
    const open = [e.a];
    while (open.length) {
      const k = open.sort((x, y) => far.get(y).d - far.get(x).d).pop();
      for (const o of at.get(k) ?? []) {
        if (o === e || gone.has(o) || o.a === o.b) continue;
        const to = o.a === k ? o.b : o.a;
        const d = far.get(k).d + o.len;
        if (d + e.len < most && (!far.has(to) || d < far.get(to).d)) { far.set(to, { d, by: [...far.get(k).by, { o, from: k }] }); open.push(to); }
      }
    }
    if (!far.has(e.b)) continue;
    const ring = [{ o: e, from: e.b }, ...far.get(e.b).by];
    const round = ring.reduce((n, r) => n + r.o.len, 0);
    const run = (r) => (r.o.a === r.from ? r.o.st.path : [...r.o.st.path].reverse());
    const pts = ring.flatMap(run);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [p, q] = [pts[i], pts[(i + 1) % pts.length]]; area += p[0] * q[1] - q[0] * p[1]; }
    const joins = ring.map((r, i) => i).filter((i) => live(ring[i].from).length > 2);
    if (!joins.length) continue;
    // The strip's tips are its corners farthest apart (a loop hanging from one corner: that corner and its far side).
    let tips = null;
    for (const i of joins) for (const j of joins) {
      if (i >= j) continue;
      const d = dist(where.get(ring[i].from), where.get(ring[j].from));
      if (!tips || d > tips.d) tips = { i, j, d };
    }
    const reach = tips?.d ?? Math.max(...pts.map((p) => dist(p, where.get(ring[joins[0]].from))));
    // The shoelace sum is twice the area; a strip's area over its length is its width. A strip
    // is long and thin: a small square block is not one.
    const wide = Math.abs(area) / 2 / (reach || 1);
    if (wide >= slim || reach < 3 * wide) continue;
    const longest = (list) => [...list].sort((x, y) => y.len - x.len)[0];
    if (joins.length === 1) {
      const turn = [...ring.slice(joins[0]), ...ring.slice(0, joins[0])];
      const path = turn.flatMap((r, i) => (i ? run(r).slice(1) : run(r)));
      path[path.length - 1] = path[0];
      const all = routesOf(turn.map((r) => r.o));
      const loop = { st: { ...longest(turn.map((r) => r.o)).st, routes: all.join(' '), n: all.length, path }, a: turn[0].from, b: turn[0].from, len: round };
      for (const r of ring) gone.add(r.o);
      edges.push(loop);
      add(loop);
      continue;
    }
    // The ring is a few sides, each from one corner where another street joins it to the next.
    const sides = joins.map((from, n) => (n + 1 < joins.length ? ring.slice(from, joins[n + 1]) : [...ring.slice(from), ...ring.slice(0, joins[0])]));
    const leaves = (o, k) => {
      const path = o.a === k ? o.st.path : [...o.st.path].reverse();
      const q = pointAlong(path, Math.min(4, o.len));
      const d = dist(path[0], q) || 1;
      return [(q[0] - path[0][0]) / d, (q[1] - path[0][1]) / d];
    };
    const inRing = new Set(ring.map((r) => r.o));
    // A side goes through when another street carries straight on from it at both ends.
    const onward = (o, k) => live(k).some((x) => x !== o && x.a !== x.b && ((u, v) => u[0] * v[0] + u[1] * v[1] < -0.8)(leaves(o, k), leaves(x, k)));
    const through = (side) => onward(side[0].o, side[0].from) && onward(side.at(-1).o, side.at(-1).o.a === side.at(-1).from ? side.at(-1).o.b : side.at(-1).o.a) ? 1 : 0;
    const busy = (side) => Math.max(...side.map((r) => rank(r.o)));
    const count = (side) => Math.max(...side.map((r) => String(r.o.st.routes).split(' ').length));
    const long = (side) => side.reduce((n, r) => n + r.o.len, 0);
    // The side not drawn: the quietest, then one that no street runs straight through, the one with fewest routes, the longest.
    const order = (x, y) => busy(x) - busy(y) || through(x) - through(y) || count(x) - count(y) || long(y) - long(x);
    const rails = sides.filter((side) => long(side) > slim);
    const rungs = sides.filter((side) => long(side) <= slim);
    let drop = [[...sides].sort(order)[0]];
    let keep = sides.filter((side) => side !== drop[0]);
    // A cell of a ladder, two streets side by side with a short rung at one end or both: one of
    // the two is drawn, the rungs go, and what met the other's ends is led the rung's length across.
    const ladder = rails.length === 2 && rungs.length && !rungs.some(through);
    if (ladder) {
      const gone1 = [...rails].sort(order)[0];
      keep = [rails.find((side) => side !== gone1)];
      drop = [gone1, ...rungs];
      const n = sides.length;
      const [d, k] = [sides.indexOf(gone1), sides.indexOf(keep[0])];
      const corner = (i) => sides[((i % n) + n) % n][0].from;
      const moves = [];
      for (let i = d + 1; ((i % n) + n) % n !== k; i++) moves.push([corner(i), corner(k)]);
      for (let i = k + 2; ((((i - 1) % n) + n) % n) !== d; i++) moves.push([corner(i), corner(k + 1)]);
      for (const [k0, to] of moves) {
        if (k0 === to) continue;
        const point = where.get(to);
        for (const o of live(k0).filter((x) => !inRing.has(x))) {
          let path = o.st.path;
          if (o.a === k0) { path = ledTo(path, 0, point); o.a = to; }
          if (o.b === k0) { path = ledTo(path, 1, point); o.b = to; }
          o.st = { ...o.st, path };
          o.len = length(path);
          at.set(to, [...(at.get(to) ?? []), o]);
        }
      }
    }
    const routes = routesOf(drop.flat().map((r) => r.o));
    const top = ladder ? busy(drop[0]) : -1;
    for (const r of keep.flat()) {
      const all = [...new Set([...String(r.o.st.routes).split(' '), ...routes])];
      r.o.st = { ...r.o.st, routes: all.join(' '), n: Math.max(r.o.st.n ?? 0, all.length), cls: CLASS_ORDER[Math.max(rank(r.o), top)] };
    }
    for (const r of drop.flat()) gone.add(r.o);
  }
  return edges.filter((e) => !gone.has(e) && e.len > 0.5).map((e) => e.st);
}

/** A path with one end moved to `to`, the move taken up smoothly over the last stretch of it. */
function ledTo(path, end, to) {
  const pts = end ? [...path] : [...path].reverse();
  const shift = [to[0] - pts.at(-1)[0], to[1] - pts.at(-1)[1]];
  const far = Math.hypot(shift[0], shift[1]);
  if (far < 1e-6) return path;
  const total = length(pts);
  const over = Math.min(total, Math.max(4 * far, 12));
  const tail = resample(partOf(pts, total - over, total), 2);
  const moved = tail.map((p, i) => {
    const t = i / (tail.length - 1);
    const w = t * t * (3 - 2 * t);
    return [p[0] + shift[0] * w, p[1] + shift[1] * w];
  });
  const out = simplify([...partOf(pts, 0, total - over).slice(0, -1), ...moved], 0.3);
  out[0] = pts[0];
  out[out.length - 1] = to;
  return end ? out : out.reverse();
}

/**
 * Streets without jogs. Where one street comes into a cross street at two corners a few pixels
 * apart (the halves of a street that meet a cross street a little off each other), the drawing
 * is a step in the street and a break in its weight where the cross street's link shows between
 * them. The two corners are one: they meet half way, and the link between them is not drawn.
 * Only where the two halves carry on straight across from each other, share a route, and are at
 * least as busy as the link. The last stretch of each half into its old corner goes, so both run
 * straight into the shared one.
 */
export function unjogged(streets, most) {
  const edges = cornered(streets);
  const at = new Map();
  for (const e of edges) for (const k of new Set([e.a, e.b])) at.set(k, [...(at.get(k) ?? []), e]);
  const where = new Map();
  for (const e of edges) for (const [k, p] of [[e.a, e.st.path[0]], [e.b, e.st.path.at(-1)]]) if (!where.has(k)) where.set(k, p);
  const leaves = (o, k) => {
    const path = o.a === k ? o.st.path : [...o.st.path].reverse();
    const q = pointAlong(path, Math.min(12, o.len));
    const d = dist(path[0], q) || 1;
    return [(q[0] - path[0][0]) / d, (q[1] - path[0][1]) / d];
  };
  const rank = (o) => CLASS_ORDER.indexOf(o.st.cls);
  const routes = (o) => new Set(String(o.st.routes).split(' '));
  const gone = new Set();
  const moved = new Set();
  for (const e of [...edges].sort((x, y) => x.len - y.len)) {
    if (e.a === e.b || e.len > most || moved.has(e.a) || moved.has(e.b)) continue;
    const [pa, pb] = [where.get(e.a), where.get(e.b)];
    const d = dist(pa, pb);
    if (d < 0.5) continue;
    const link = [(pb[0] - pa[0]) / d, (pb[1] - pa[1]) / d];
    const others = (k) => at.get(k).filter((o) => o !== e && o.a !== o.b && !gone.has(o));
    const halves = others(e.a).some((x) => others(e.b).some((y) => {
      const [u, v] = [leaves(x, e.a), leaves(y, e.b)];
      // Each half ends at its corner: nothing there carries it on past (as two streets of a
      // ladder do, tied by a rung).
      const ends = (k, w, half) => !others(k).some((o) => o !== half && o.a !== o.b && (() => { const t = leaves(o, k); return t[0] * w[0] + t[1] * w[1] < -0.9; })());
      return u[0] * v[0] + u[1] * v[1] < -0.9 && Math.abs(u[0] * link[0] + u[1] * link[1]) < 0.5
        && ends(e.a, u, x) && ends(e.b, v, y)
        && Math.min(rank(x), rank(y)) >= rank(e) && [...routes(x)].some((r) => routes(y).has(r));
    }));
    if (!halves) continue;
    const mid = lerp(pa, pb, 0.5);
    gone.add(e);
    for (const k of [e.a, e.b]) {
      moved.add(k);
      for (const o of others(k)) {
        // The last stretch into the old corner is the hook that made the jog: it is cut off and
        // the street runs straight from there to the shared corner.
        const straight = (pts) => {
          const total = length(pts);
          return [...partOf(pts, 0, total - Math.min(2 * most, total / 2)), mid];
        };
        let path = o.st.path;
        if (o.a === k) path = straight([...path].reverse()).reverse();
        if (o.b === k) path = straight(path);
        o.st = { ...o.st, path };
      }
    }
  }
  return edges.filter((e) => !gone.has(e) && length(e.st.path) > 0.5).map((e) => e.st);
}

/**
 * Loops drawn in one sweep. Where two streets run between the same two corners and one bows out
 * well past the other (a turnaround: out one way, back the other), the route data along the bow
 * wanders, bulging and pinching. The bow is drawn as one smooth curve that leaves each corner the
 * way the street does and reaches out as far as it did.
 */
export function arced(streets, away = () => Infinity, clear = 0) {
  const edges = cornered(streets);
  const out = streets.map((st) => st);
  const pairs = new Map();
  edges.forEach((e, i) => {
    if (e.a === e.b) return;
    const k = [e.a, e.b].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), i]);
  });
  for (const list of pairs.values()) {
    if (list.length !== 2) continue;
    const [i, j] = edges[list[0]].len >= edges[list[1]].len ? list : [list[1], list[0]];
    const path = edges[i].st.path;
    const [A, B] = [path[0], path.at(-1)];
    const chord = dist(A, B);
    if (chord < 1 || edges[i].len < 1.25 * Math.max(chord, edges[j].len)) continue;
    const dir = (pts) => {
      const q = pointAlong(pts, Math.min(12, length(pts) / 4));
      const d = dist(pts[0], q) || 1;
      return [(q[0] - pts[0][0]) / d, (q[1] - pts[0][1]) / d];
    };
    const [uA, uB] = [dir(path), dir([...path].reverse())];
    const nrm = [-(B[1] - A[1]) / chord, (B[0] - A[0]) / chord];
    const off = (p) => (p[0] - A[0]) * nrm[0] + (p[1] - A[1]) * nrm[1];
    const far = path.reduce((m, p) => (Math.abs(off(p)) > Math.abs(m) ? off(p) : m), 0);
    const pull = 0.375 * ((uA[0] + uB[0]) * nrm[0] + (uA[1] + uB[1]) * nrm[1]);
    if (Math.abs(pull) < 0.05 || Math.sign(pull) !== Math.sign(far)) continue;
    const sweep = (h) => {
      const [c1, c2] = [[A[0] + uA[0] * h, A[1] + uA[1] * h], [B[0] + uB[0] * h, B[1] + uB[1] * h]];
      return Array.from({ length: 33 }, (_, n) => {
        const t = n / 32;
        const w = 1 - t;
        return [0, 1].map((k) => w * w * w * A[k] + 3 * w * w * t * c1[k] + 3 * w * t * t * c2[k] + t * t * t * B[k]);
      });
    };
    // The bow is the drawing's own, so it gives way to rail: where it would run against a
    // line or a station's bar it is drawn tighter, down to half its reach, until it stands clear.
    let h = Math.min(1.5 * chord, far / pull);
    let curve = sweep(h);
    for (const least = h / 2; h > least && curve.some((p) => away(p) < clear); curve = sweep(h)) h *= 0.94;
    out[i] = { ...edges[i].st, path: curve };
  }
  return out;
}

/**
 * Streets turned as a pen turns them. Where the two pieces at a corner that carry on most nearly
 * straight still bend (an L, a loop's corner), the bend is rounded: both are cut back by up to
 * `radius` pixels and joined by a curve, and a third street meeting them there ends on its
 * middle. A corner where a street carries straight on, or where four or more meet, is left.
 * Each street's own bends are smoothed over half that, so a curve has no facets.
 */
export function filleted(streets, radius) {
  const edges = cornered(streets).map((e) => ({ ...e, path: e.st.path.map((p) => [...p]) }));
  const at = new Map();
  edges.forEach((e, i) => { if (e.a !== e.b) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), i]); });
  // A path from corner k outward, and the same path put back the way the edge runs.
  const outward = (e, k) => (e.a === k ? e.path : [...e.path].reverse());
  const put = (e, k, path) => { e.path = e.a === k ? path : [...path].reverse(); };
  for (const [k, list] of at) {
    if (list.length < 2 || list.length > 3) continue;
    const r = (e) => Math.min(radius, 0.4 * length(e.path));
    const leaves = (e) => {
      const path = outward(e, k);
      const q = pointAlong(path, Math.max(1, r(e)));
      const d = dist(path[0], q) || 1;
      return [(q[0] - path[0][0]) / d, (q[1] - path[0][1]) / d];
    };
    let best = null;
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const [u, v] = [leaves(edges[list[x]]), leaves(edges[list[y]])];
      const d = u[0] * v[0] + u[1] * v[1];
      if (!best || d < best.d) best = { x: edges[list[x]], y: edges[list[y]], d };
    }
    // Straight on, or folded back on itself: nothing to round.
    if (best.d < -0.97 || best.d > 0.7) continue;
    const [px, py] = [outward(best.x, k), outward(best.y, k)];
    const c = px[0];
    const reach = Math.min(r(best.x), r(best.y));
    if (reach < 1) continue;
    const [p, q] = [pointAlong(px, reach), pointAlong(py, reach)];
    const bez = (t) => [0, 1].map((j) => (1 - t) * (1 - t) * p[j] + 2 * (1 - t) * t * c[j] + t * t * q[j]);
    const steps = 8;
    const half = (from, to) => Array.from({ length: steps + 1 }, (_, i) => bez(from + ((to - from) * i) / steps));
    const mid = bez(0.5);
    put(best.x, k, [...half(0.5, 0), ...partOf(px, reach, length(px)).slice(1)]);
    put(best.y, k, [...half(0.5, 1), ...partOf(py, reach, length(py)).slice(1)]);
    for (const i of list) {
      const e = edges[i];
      if (e === best.x || e === best.y) continue;
      const path = outward(e, k);
      put(e, k, [mid, ...path.slice(1)]);
    }
  }
  // Each street's own bends are smoothed the same way, so a curve has no facets; ends stay put.
  return edges.map((e) => ({ ...e.st, path: e.path.length > 2 ? simplify(rounded(e.path, radius / 2), 0.2) : e.path }));
}

/**
 * Streets drawn straight. A street that carries straight on through its corners can still
 * drift a pixel or three between them (the middle of a divided road found block by block, a
 * corner placed where two halves met): a gentle bend either side of a cross street, where the
 * street on the ground runs straight. Along a street that carries straight on, a stretch whose
 * every point lies within `tol` of the line between its two ends is drawn on that line, its
 * corners with it; the streets that meet it there move their ends the same few pixels. A real
 * bend sits farther off the line than that and stays. The longest streets go first, and a
 * corner once placed stays put.
 */
export function straightened(streets, tol) {
  const edges = cornered(streets).map((e) => ({ ...e, path: e.st.path.map((p) => [...p]) }));
  const at = new Map();
  edges.forEach((e, i) => { if (e.a !== e.b) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), i]); });
  const pos = new Map();
  for (const e of edges) for (const [k, p] of [[e.a, e.path[0]], [e.b, e.path.at(-1)]]) if (!pos.has(k)) pos.set(k, [...p]);
  const leaves = (e, k) => {
    const path = e.a === k ? e.path : [...e.path].reverse();
    const q = pointAlong(path, Math.min(12, e.len));
    const d = dist(path[0], q) || 1;
    return [(q[0] - path[0][0]) / d, (q[1] - path[0][1]) / d];
  };
  // At each corner the pieces pair off with the one most nearly straight ahead.
  const on = new Map();
  for (const [k, list] of at) {
    const pairs = [];
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const [u, v] = [leaves(edges[list[x]], k), leaves(edges[list[y]], k)];
      const straight = -(u[0] * v[0] + u[1] * v[1]);
      if (straight > 0.97) pairs.push({ x: list[x], y: list[y], straight });
    }
    const used = new Set();
    for (const { x, y } of pairs.sort((m, n) => n.straight - m.straight)) {
      if (used.has(x) || used.has(y)) continue;
      used.add(x).add(y);
      on.set(`${x}@${k}`, y);
      on.set(`${y}@${k}`, x);
    }
  }
  // Streets: runs of pieces that carry straight on, each piece with the corner it is entered by.
  const seen = new Set();
  const chains = [];
  edges.forEach((e, i) => {
    if (seen.has(i) || e.a === e.b) return;
    seen.add(i);
    const walk = (from, k) => {
      const out = [];
      for (let j = on.get(`${from}@${k}`); j !== undefined && !seen.has(j); j = on.get(`${j}@${k}`)) {
        seen.add(j);
        out.push({ i: j, from: k });
        k = edges[j].a === k ? edges[j].b : edges[j].a;
      }
      return out;
    };
    const back = walk(i, e.a).reverse().map(({ i: j, from }) => ({ i: j, from: edges[j].a === from ? edges[j].b : edges[j].a }));
    chains.push([...back, { i, from: e.a }, ...walk(i, e.b)]);
  });
  const pinned = new Set();
  const total = (c) => c.reduce((s, x) => s + edges[x.i].len, 0);
  for (const chain of chains.sort((m, n) => total(n) - total(m))) {
    // The street as one line: its corners, and the points of each piece between them.
    const corners = [chain[0].from];
    const pieces = [];
    for (const { i, from } of chain) {
      const e = edges[i];
      const fwd = e.a === from;
      pieces.push({ e, fwd, inner: (fwd ? e.path : [...e.path].reverse()).slice(1, -1) });
      corners.push(fwd ? e.b : e.a);
    }
    if (corners[0] === corners.at(-1)) continue;
    const near = (from, to) => {
      const [a, b] = [pos.get(corners[from]), pos.get(corners[to])];
      const len = dist(a, b);
      if (len < 1e-6) return false;
      const off = (p) => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len;
      for (let c = from; c < to; c++) {
        if (c > from && off(pos.get(corners[c])) > tol) return false;
        if (pieces[c].inner.some((p) => off(p) > tol)) return false;
      }
      return true;
    };
    const onto = (p, a, b) => {
      const d = [b[0] - a[0], b[1] - a[1]];
      const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
      return [a[0] + d[0] * t, a[1] + d[1] * t];
    };
    for (let from = 0; from < pieces.length;) {
      let to = from + 1;
      while (to < pieces.length && !pinned.has(corners[to]) && near(from, to + 1)) to++;
      if (near(from, to)) {
        const [a, b] = [pos.get(corners[from]), pos.get(corners[to])];
        for (let c = from; c < to; c++) {
          pieces[c].inner = pieces[c].inner.map((p) => onto(p, a, b));
          if (c > from) pos.set(corners[c], onto(pos.get(corners[c]), a, b));
        }
      }
      from = to;
    }
    for (const k of corners) pinned.add(k);
    for (const { e, fwd, inner } of pieces) e.path = [e.path[0], ...(fwd ? inner : [...inner].reverse()), e.path.at(-1)];
  }
  return edges.map((e) => {
    const path = [...e.path];
    path[0] = pos.get(e.a);
    path[path.length - 1] = pos.get(e.b);
    return { ...e.st, path };
  });
}

/**
 * Streets that end at a station. A route that turns round at a rail station has its loop drawn
 * as one street out to its far end, and the bays it serves are a short walk from the station's
 * mark: the street stops in the open. A loose end (nothing meets it) within `reach` of a
 * station's mark, with the mark ahead of it rather than behind, is led straight on to the mark.
 */
export function toStations(streets, marks, reach, walls = []) {
  if (!marks.length) return streets;
  const edges = cornered(streets);
  const count = new Map();
  for (const e of edges) for (const k of [e.a, e.b]) count.set(k, (count.get(k) ?? 0) + 1);
  const bars = marks.flatMap((m) => [m.ends, ...(m.more ?? [])]);
  return edges.map((e) => {
    let path = e.st.path;
    if (e.a === e.b) return e.st;
    for (const [end, k] of [[0, e.a], [1, e.b]]) {
      if (count.get(k) > 1) continue;
      const v = end ? path : [...path].reverse();
      const tip = v.at(-1);
      if (streets.some((o) => o !== e.st && nearest(o.path, tip).d < 1.5)) continue;
      // An end at a bus station's hall is where its buses go: it is not led on to a rail station.
      if (walls.some((w) => nearest(w.ring, tip).d <= SIZES.hallReach)) continue;
      const hit = bars.map((b) => nearest(b, tip)).sort((x, y) => x.d - y.d)[0];
      if (!hit || hit.d > reach || hit.d < 0.5) continue;
      const back = pointAlong([...v].reverse(), Math.min(12, length(v)));
      const d = dist(back, tip) || 1;
      const ahead = ((tip[0] - back[0]) * (hit.at[0] - tip[0]) + (tip[1] - back[1]) * (hit.at[1] - tip[1])) / d / hit.d;
      if (ahead < 0.5) continue;
      path = end ? [...path, hit.at] : [hit.at, ...path];
    }
    return path === e.st.path ? e.st : { ...e.st, path };
  });
}

/**
 * Streets of one weight. A street is cut at every corner and each piece is weighed on its own,
 * so along a street that nothing else meets, a few pieces can come out a class apart from the
 * rest: a short dark tick on the end of a pale street. Along such a street, a stretch of one
 * weight shorter than `most` takes the weight of the longer stretch beside it; a longer one is a
 * real change of service and stays.
 */
export function evened(streets, most) {
  const edges = cornered(streets);
  const at = new Map();
  for (const e of edges) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), e]);
  const seen = new Set();
  const onward = (e, k) => {
    const here = at.get(k);
    if (here.length !== 2 || e.a === e.b) return null;
    const next = here.find((o) => o !== e);
    return next && !seen.has(next) && next.a !== next.b ? next : null;
  };
  for (const start of edges) {
    if (seen.has(start) || start.a === start.b) continue;
    seen.add(start);
    const run = [start];
    for (const [k, add] of [[start.b, (e) => run.push(e)], [start.a, (e) => run.unshift(e)]]) {
      let [e, corner] = [start, k];
      for (let next = onward(e, corner); next; next = onward(e, corner)) {
        seen.add(next);
        add(next);
        corner = next.a === corner ? next.b : next.a;
        e = next;
      }
    }
    if (run.length < 2) continue;
    const stretches = [];
    for (const e of run) {
      if (stretches.at(-1)?.cls === e.st.cls) { stretches.at(-1).edges.push(e); stretches.at(-1).len += e.len; }
      else stretches.push({ cls: e.st.cls, edges: [e], len: e.len });
    }
    while (stretches.length > 1) {
      const i = stretches.reduce((m, x, j) => (x.len < stretches[m].len ? j : m), 0);
      if (stretches[i].len >= most) break;
      const [l, r] = [stretches[i - 1], stretches[i + 1]];
      const into = !r || (l && l.len >= r.len) ? l : r;
      into.edges.push(...stretches[i].edges);
      into.len += stretches[i].len;
      stretches.splice(i, 1);
      for (let j = stretches.length - 1; j > 0; j--) {
        if (stretches[j].cls === stretches[j - 1].cls) {
          stretches[j - 1].edges.push(...stretches[j].edges);
          stretches[j - 1].len += stretches[j].len;
          stretches.splice(j, 1);
        }
      }
    }
    for (const x of stretches) for (const e of x.edges) if (e.st.cls !== x.cls) e.st = { ...e.st, cls: x.cls };
  }
  return edges.map((e) => e.st);
}

/** A name with its common words in their usual short forms, still plain to read. */
const SHORT = { Station: 'Stn', Avenue: 'Ave', Street: 'St', Boulevard: 'Blvd', Parkway: 'Pkwy', Road: 'Rd', Center: 'Ctr', Junction: 'Jct', University: 'Univ', Government: 'Govt' };
export function shortened(name) {
  return String(name).replace(/[A-Za-z]+/g, (word) => SHORT[word] ?? word);
}

/** A long name on two rows: broken at its slash, or at the space nearest its middle. */
function wrapped(name) {
  // A name RTD writes with an at-sign or a tight slash is set as words: 'A/B@C' is 'A / B' over 'C'.
  const text = String(name).replace(/\s*@\s*/, '\n').replace(/(\S)\/(\S)/g, '$1 / $2');
  if (text.includes('\n')) return text;
  if (text.includes(' / ')) return text.replace(' / ', ' /\n');
  if (text.length <= 14 || !text.includes(' ')) return text;
  const spaces = [...text.matchAll(/ /g)].map((s) => s.index);
  const at = spaces.sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2))[0];
  return `${text.slice(0, at)}\n${text.slice(at + 1)}`;
}

/** Dark or white lettering, whichever reads on this colour. */
export function inkOn(color) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(String(color).slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#10151d' : '#ffffff';
}

// --- Bus streets ---------------------------------------------------------------

const CLASS_ORDER = ['c60', 'c30', 'c15', 'c10', 'c5', 'c3'];

/**
 * The sheet's bus streets in pixels, `{ cls, routes, path }`. Every street with
 * service is here. Two things are tidied for the scale: a stretch too short to
 * read takes the class of the stretches it joins (a street doesn't blink
 * between weights), and loops and stubs smaller than a few pixels go.
 */
export function busStreets(streets, sheet, walls = [], marks = [], lines = []) {
  const edges = streets.features
    // A stretch marked for one set of sheets is drawn only on those; one with no mark is the same on all.
    .filter((f) => (f.properties.zoom ?? sheet.streets) === sheet.streets && f.geometry.type === 'LineString')
    .map((f) => {
      const path = f.geometry.coordinates.map((c) => toPx(c, sheet.zoom));
      return { cls: f.properties.cls, rank: CLASS_ORDER.indexOf(f.properties.cls), routes: f.properties.routes, n: f.properties.n, hw: f.properties.hw, path, len: length(path) };
    });
  const key = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  // A short break in the data between two ends that share a route is bridged, as on the rail.
  const lat = streets.features.find((f) => f.geometry.type === 'LineString')?.geometry.coordinates[0][1] ?? 0;
  const perMetre = 1 / metresPerPixel(lat, sheet.zoom);
  const met = new Map();
  for (const e of edges) for (const end of [e.path[0], e.path.at(-1)]) met.set(key(end), (met.get(key(end)) ?? 0) + 1);
  const loose = edges.flatMap((e) => [0, 1].map((end) => ({ e, end, p: end ? e.path.at(-1) : e.path[0] }))).filter((x) => met.get(key(x.p)) === 1);
  const reach = Math.max(SIZES.busSpeck, SIZES.busBridgeMetres * perMetre);
  const pairs = [];
  for (let i = 0; i < loose.length; i++) for (let j = i + 1; j < loose.length; j++) {
    const [a, b] = [loose[i], loose[j]];
    if (a.e === b.e) continue;
    const d = dist(a.p, b.p);
    if (d > reach) continue;
    const mine = new Set(a.e.routes.split(' '));
    if (b.e.routes.split(' ').some((r) => mine.has(r))) pairs.push({ a, b, d });
  }
  const joined = new Set();
  for (const { a, b } of pairs.sort((x, y) => x.d - y.d)) {
    if (joined.has(a) || joined.has(b)) continue;
    joined.add(a).add(b);
    if (a.end) a.e.path.push(b.p); else a.e.path.unshift(b.p);
    a.e.len = length(a.e.path);
  }
  // A loose end left over, with a street that shares a route a short walk away (and not one this
  // street already meets), is led to the nearest point of it: a turnaround whose data stops short
  // of the street it leaves from is drawn closed.
  const walkTo = SIZES.busBridgeMetres * perMetre;
  if (walkTo >= SIZES.busMerge[sheet.id]) {
    for (const x of loose) {
      if (joined.has(x) || x.e.len < SIZES.busSpeck) continue;
      const mine = new Set(x.e.routes.split(' '));
      const ends = [x.e.path[0], x.e.path.at(-1)];
      let best = null;
      for (const o of edges) {
        if (o === x.e || !o.routes.split(' ').some((r) => mine.has(r))) continue;
        if ([o.path[0], o.path.at(-1)].some((q) => ends.some((p) => dist(p, q) < 1))) continue;
        const hit = nearest(o.path, x.p);
        if (hit.d <= walkTo && (!best || hit.d < best.d)) best = hit;
      }
      if (!best) continue;
      if (x.end) x.e.path.push(best.at); else x.e.path.unshift(best.at);
      x.e.len = length(x.e.path);
    }
  }
  const nodes = new Map();
  for (const e of edges) for (const end of [e.path[0], e.path.at(-1)]) {
    if (!nodes.has(key(end))) nodes.set(key(end), []);
    nodes.get(key(end)).push(e);
  }
  const heading = (e, end) => {
    const pts = e.path;
    const [a, b] = end === 0 ? [pts[0], pts[Math.min(pts.length - 1, 3)]] : [pts.at(-1), pts[Math.max(0, pts.length - 4)]];
    const d = dist(a, b) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  // The stretch that carries straight on from an end of this one, if any.
  const onward = (e, end) => {
    const here = end === 0 ? e.path[0] : e.path.at(-1);
    const mine = heading(e, end);
    let best = null;
    for (const o of nodes.get(key(here)) ?? []) {
      if (o === e) continue;
      const oEnd = dist(o.path[0], here) < 1 ? 0 : 1;
      const theirs = heading(o, oEnd);
      const straight = -(mine[0] * theirs[0] + mine[1] * theirs[1]);
      if (straight > 0.8 && (!best || straight > best.straight)) best = { o, straight };
    }
    return best?.o;
  };
  // A blip takes the class of the stretches either side when they agree; pass twice for blips in a row.
  // A blip is short on the sheet or short on the ground (a block or so), whichever is longer.
  const blip = Math.max(SIZES.busBlip, SIZES.busBlipMetres / metresPerPixel(lat, sheet.zoom));
  for (let pass = 0; pass < 2; pass++) {
    for (const e of edges) {
      if (e.len >= blip) continue;
      const [a, b] = [onward(e, 0), onward(e, 1)];
      if (a && b && a.rank === b.rank && a.rank !== e.rank && a.len + b.len > 2 * e.len) e.rank = a.rank;
    }
  }
  // A line weight holds for a few blocks: a short stretch takes the class of the longest stretch
  // it carries on into (straight ahead, or round a corner where only the two meet), so a street
  // is not drawn as dashes of different weights where routes join and leave every half block.
  const next = (e, end) => {
    const straight = onward(e, end);
    if (straight) return straight;
    const here = end === 0 ? e.path[0] : e.path.at(-1);
    const met = (nodes.get(key(here)) ?? []).filter((o) => o !== e);
    return met.length === 1 ? met[0] : null;
  };
  const run = Math.max(SIZES.busRun, SIZES.busRunMetres / metresPerPixel(lat, sheet.zoom));
  for (let pass = 0; pass < 3; pass++) {
    for (const e of [...edges].sort((a, b) => a.len - b.len)) {
      if (e.len >= run) continue;
      // Of the two it runs into, the busier one if that is longer than this stretch, else the longer.
      const into = [next(e, 0), next(e, 1)].filter(Boolean);
      let longest = into.filter((o) => o.len > e.len).sort((a, b) => b.rank - a.rank || b.len - a.len)[0] ?? into.sort((a, b) => b.len - a.len)[0];
      // A scrap a few pixels long with no way straight on takes the weight of the longest street it touches,
      // so the corner of a transfer centre is not a heavy blot.
      if (!longest && e.len < 1.5 * SIZES.busSpeck) {
        longest = [e.path[0], e.path.at(-1)].flatMap((q) => nodes.get(key(q)) ?? []).filter((o) => o !== e).sort((a, b) => b.len - a.len)[0];
      }
      if (longest && longest.len > e.len && longest.rank !== e.rank) e.rank = longest.rank;
    }
  }
  // Streets closer together than a line can be told apart are drawn as one: the busier
  // (then the longer) is kept and carries the other's routes. Streets that meet end to end
  // are never folded into each other, so no street gains a gap.
  const cell = SIZES.busMerge[sheet.id];
  const step = Math.min(2, cell / 3);
  const grid = new Map();
  const at = (p, dx = 0, dy = 0) => `${Math.floor(p[0] / cell) + dx},${Math.floor(p[1] / cell) + dy}`;
  // Each point along a street with the way the street runs there.
  const walked = (path) => {
    const pts = resample(path, step);
    return pts.map((p, i) => {
      const [a, b] = [pts[Math.max(0, i - 2)], pts[Math.min(pts.length - 1, i + 2)]];
      const d = dist(a, b) || 1;
      return { p, t: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] };
    });
  };
  // The kept street running beside this point, the same way, if there is one.
  const beside = (w) => {
    let best = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const hit of grid.get(at(w.p, dx, dy)) ?? []) {
        const d = dist(hit.p, w.p);
        // Beside means abreast: a street that carries on from this one's end is ahead of it, not beside it.
        const ahead = Math.abs((hit.p[0] - w.p[0]) * w.t[0] + (hit.p[1] - w.p[1]) * w.t[1]);
        if (d <= cell && ahead <= step && Math.abs(hit.t[0] * w.t[0] + hit.t[1] * w.t[1]) > 0.8 && (!best || d < best.d)) best = { ...hit, d };
      }
    }
    return best;
  };
  const kept = [];
  const keep = (e) => {
    kept.push(e);
    e.pts = walked(e.path);
    e.pull = e.pts.map(() => null);
    e.tails = [];
    e.pts.forEach((w, i) => {
      if (!grid.has(at(w.p))) grid.set(at(w.p), []);
      grid.get(at(w.p)).push({ e, i, p: w.p, t: w.t });
    });
  };
  const long = Math.max(2, Math.round((3 * cell) / step));
  for (const e of [...edges].sort((a, b) => b.rank - a.rank || b.len - a.len)) {
    // A link shorter than the merge distance that carries straight on at both ends only joins two
    // stretches of one street: it is kept as it is. (A rung between the halves of a divided road is not.)
    if (e.len < cell && onward(e, 0) && onward(e, 1)) { keep(e); continue; }
    const pts = walked(e.path);
    const hits = pts.map(beside);
    // Only a long enough run beside another street is folded into it, or a whole short street.
    const folded = pts.map(() => false);
    for (let i = 0; i < pts.length;) {
      let j = i;
      while (j < pts.length && !!hits[j] === !!hits[i]) j++;
      if (hits[i] && (j - i >= long || j - i === pts.length)) folded.fill(true, i, j);
      i = j;
    }
    if (!folded.includes(true)) { keep(e); continue; }
    for (const into of new Set(hits.filter((h, i) => h && folded[i]).map((h) => h.e))) {
      const routes = [...new Set(`${into.routes} ${e.routes}`.split(' '))];
      [into.routes, into.n] = [routes.join(' '), Math.max(into.n, routes.length)];
    }
    // The street kept is drawn midway between the two, so the two halves of a divided road
    // make one straight line down its middle and not a line that hops from side to side.
    hits.forEach((h, i) => { if (h && folded[i]) (h.e.pull[h.i] ??= []).push(pts[i].p); });
    // What is left of the street joins the one it was folded into, so nothing ends in mid-air.
    for (let i = 0; i < pts.length;) {
      let j = i;
      while (j < pts.length && folded[j] === folded[i]) j++;
      if (!folded[i]) {
        const piece = pts.slice(i, j).map((w) => w.p);
        if (length(piece) >= SIZES.busSpeck) {
          const rest = { ...e, path: piece, len: length(piece) };
          keep(rest);
          if (i > 0) rest.tails.push({ end: 0, on: hits[i - 1] });
          if (j < pts.length) rest.tails.push({ end: 1, on: hits[j] });
        }
      }
      i = j;
    }
  }
  // Move each kept street to the middle of what was folded into it, then bring the streets
  // that met at a corner back to one point.
  for (const e of kept) {
    e.moved = e.pts.map((w, i) => {
      const from = e.pull[i];
      if (!from) return w.p;
      const mid = [from.reduce((x, q) => x + q[0], 0) / from.length, from.reduce((y, q) => y + q[1], 0) / from.length];
      return lerp(w.p, mid, 0.5);
    });
  }
  const corners = new Map();
  for (const e of kept) for (const i of [0, e.pts.length - 1]) {
    const k = key(e.pts[i].p);
    if (!corners.has(k)) corners.set(k, []);
    corners.get(k).push(e.moved[i]);
  }
  for (const e of kept) {
    const path = [...e.moved];
    for (const i of [0, path.length - 1]) {
      const all = corners.get(key(e.pts[i].p));
      path[i] = [all.reduce((x, q) => x + q[0], 0) / all.length, all.reduce((y, q) => y + q[1], 0) / all.length];
    }
    for (const tail of e.tails) {
      const to = tail.on.e.moved[tail.on.i];
      if (tail.end) path.push(to); else path.unshift(to);
    }
    // An end is free when nothing else meets it: no street at its corner or close by, and it was not joined on.
    e.free = [0, e.pts.length - 1].some((i, end) => {
      if (corners.get(key(e.pts[i].p)).length > 1 || e.tails.some((tl) => tl.end === end)) return false;
      const p = e.pts[i].p;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((grid.get(at(p, dx, dy)) ?? []).some((hit) => hit.e !== e && dist(hit.p, p) <= cell)) return false;
      }
      return true;
    });
    e.path = rounded(path, cell);
    e.len = length(e.path);
  }
  const drawn = kept
    .filter((e) => {
      const closed = dist(e.path[0], e.path.at(-1)) < 1;
      const reachOf = Math.max(...e.path.map((p) => dist(p, e.path[0])));
      if (closed && reachOf < 2.4 * SIZES.busSpeck) return false;
      // A short spur off a street reads as a barb, not a route.
      return !(e.free && e.len < 2.5 * SIZES.busSpeck);
    })
    .map((e) => ({ cls: CLASS_ORDER[e.rank], routes: e.routes, n: e.n, hw: e.hw, path: simplify(rounded(simplify(e.path, 2), 2), 0.3) }));
  // Corners first, then the rings, strips and loops they show. Taking a side away can leave an
  // end a hair from the street it met, so the round is made twice.
  const tidied = (list) => unjogged(unlooped(unslivered(unringed(noded(list, SIZES.busSnap, cell), SIZES.busRing), 5 * SIZES.busRing, SIZES.busSlim, SIZES.busSnap), SIZES.busSlim, SIZES.busSpeck), 3 * SIZES.busSlim);
  // How far a point is from the nearest rail line or station bar.
  const inked = [...lines.flatMap((l) => l.paths), ...marks.flatMap((m) => [m.ends, ...(m.more ?? [])])];
  const railOff = (p) => inked.reduce((d, path) => (boxed(path, p, d) ? Math.min(d, nearest(path, p).d) : d), 1e9);
  return gathered(onWalls(toStations(filleted(arced(evened(straightened(pruned(walled(tidied(tidied(drawn)), walls), 2.5 * SIZES.busSpeck, walls), SIZES.busStraight), SIZES.busRing), railOff, SIZES.rail[sheet.id] + 1.5 * SIZES.gap[sheet.id] + SIZES.rail[sheet.id] / 2 + 3), SIZES.busTurn[sheet.id]), marks, SIZES.busBridgeMetres * perMetre, walls), walls, SIZES.hallReach));
}

/**
 * A corner beside a hall's wall sits on it. A turnaround that comes back to the hall, or two
 * streets that meet at its door, are drawn to the wall, not to a point a few pixels off it.
 */
export function onWalls(streets, walls, reach) {
  if (!walls.length) return streets;
  const moved = (p) => {
    let best = null;
    for (const w of walls) {
      const h = nearest(w.ring, p);
      if (h.d <= reach && (!best || h.d < best.d)) best = h;
    }
    return best && best.d > 0.5 ? best.at : null;
  };
  return streets.map((st) => {
    let path = st.path;
    for (const end of [0, 1]) {
      const to = moved(end ? path.at(-1) : path[0]);
      if (!to) continue;
      // The last few points go with the end, so the street comes to the wall without a hook.
      const kept = (end ? path.slice(0, -1) : path.slice(1)).filter((q) => dist(q, to) > 1.5 * reach);
      if (!kept.length) continue;
      path = end ? [...kept, to] : [to, ...kept];
    }
    return path === st.path ? st : { ...st, path };
  });
}

/**
 * A street that carries every route of a street it meets is drawn no lighter than it: where
 * streets gather into one, the one they make is at least as heavy as the heaviest of them.
 */
export function gathered(streets) {
  const edges = cornered(streets);
  const at = new Map();
  for (const e of edges) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), e]);
  const sets = new Map(edges.map((e) => [e, new Set(String(e.st.routes).split(' '))]));
  const now = new Map(edges.map((e) => [e, e.st]));
  for (let turn = 0, changed = true; changed && turn < 50; turn++) {
    changed = false;
    for (const e of edges) for (const k of [e.a, e.b]) for (const o of at.get(k)) {
      if (o === e || [...sets.get(o)].some((r) => !sets.get(e).has(r))) continue;
      const [mine, theirs] = [now.get(e), now.get(o)];
      if (CLASS_ORDER.indexOf(theirs.cls) > CLASS_ORDER.indexOf(mine.cls)) { now.set(e, { ...mine, cls: theirs.cls, hw: theirs.hw }); changed = true; }
    }
  }
  return edges.map((e) => now.get(e));
}

/**
 * Streets cut so that wherever two meet, both have a corner there. A street that ends on the
 * middle of another, or stops a hair short of it or past it, and two streets that cross, all
 * meet at one point. Every later rule reads the drawing by its corners, so it sees what the
 * eye sees: a strip, a ring or a stub is found however the data was cut.
 */
export function noded(streets, snap, reach = snap) {
  const paths = streets.map((st) => st.path.map((p) => [...p]));
  // Ends within `snap` of each other are one corner, at the first of them.
  const corners = [];
  const cornerAt = (p) => corners.find((c) => Math.abs(c[0] - p[0]) <= snap && Math.abs(c[1] - p[1]) <= snap && dist(c, p) <= snap);
  const near = new Map();
  const cellOf = (p) => `${Math.floor(p[0] / 16)},${Math.floor(p[1] / 16)}`;
  const weld = (p) => {
    const [x, y] = [Math.floor(p[0] / 16), Math.floor(p[1] / 16)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const c of near.get(`${x + dx},${y + dy}`) ?? []) if (dist(c, p) <= snap) return c;
    const c = [...p];
    near.set(cellOf(c), [...(near.get(cellOf(c)) ?? []), c]);
    corners.push(c);
    return c;
  };
  for (const path of paths) {
    path[0] = weld(path[0]);
    path[path.length - 1] = weld(path.at(-1));
  }
  const nearCorner = (p) => {
    const [x, y] = [Math.floor(p[0] / 16), Math.floor(p[1] / 16)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const c of near.get(`${x + dx},${y + dy}`) ?? []) if (dist(c, p) <= snap) return c;
    return null;
  };
  // Every segment, by the squares of ground it passes over.
  const gridded = () => {
    const grid = new Map();
    paths.forEach((path, si) => {
      for (let i = 1; i < path.length; i++) {
        const [a, b] = [path[i - 1], path[i]];
        for (let x = Math.floor(Math.min(a[0], b[0]) / 16); x <= Math.floor(Math.max(a[0], b[0]) / 16); x++) {
          for (let y = Math.floor(Math.min(a[1], b[1]) / 16); y <= Math.floor(Math.max(a[1], b[1]) / 16); y++) {
            const k = `${x},${y}`;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push({ si, i });
          }
        }
      }
    });
    return grid;
  };
  let grid = gridded();
  // A loose end that stops within `reach` of another street is led to it: the gap would read as a slip of the pen.
  const ends = new Map();
  for (const path of paths) for (const c of new Set([path[0], path.at(-1)])) ends.set(c, (ends.get(c) ?? 0) + 1);
  const span = Math.ceil(reach / 16);
  paths.forEach((path, si) => {
    const total = length(path);
    for (const end of [0, 1]) {
      const tip = end ? path.at(-1) : path[0];
      const base = end ? path[0] : path.at(-1);
      if (ends.get(tip) !== 1 || tip === base) continue;
      const [x, y] = [Math.floor(tip[0] / 16), Math.floor(tip[1] / 16)];
      const seen = new Set([si]);
      let best = null;
      for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) for (const o of grid.get(`${x + dx},${y + dy}`) ?? []) {
        if (seen.has(o.si)) continue;
        seen.add(o.si);
        const host = paths[o.si];
        // A short street is not bent back onto the street it has just left.
        if ((host[0] === base || host.at(-1) === base) && total < 2 * reach) continue;
        const hit = nearest(host, tip);
        if (hit.d <= reach && (!best || hit.d < best.d)) best = hit;
      }
      if (!best || best.d <= snap) continue;
      const to = weld(best.at);
      if (to === base) continue;
      if (end) path.push(to); else path.unshift(to);
    }
  });
  grid = gridded();
  const before = paths.map((path) => { const run = [0]; for (let i = 1; i < path.length; i++) run.push(run[i - 1] + dist(path[i - 1], path[i])); return run; });
  const cuts = paths.map(() => []);
  // A corner on the middle of a street: the street is cut there and passes through the corner.
  for (const c of corners) {
    const seen = new Set();
    const [x, y] = [Math.floor(c[0] / 16), Math.floor(c[1] / 16)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const { si } of grid.get(`${x + dx},${y + dy}`) ?? []) {
      if (seen.has(si)) continue;
      seen.add(si);
      const path = paths[si];
      if (path[0] === c || path.at(-1) === c) continue;
      const hit = nearest(path, c);
      if (hit.d > snap || hit.along <= snap || hit.along >= before[si].at(-1) - snap) continue;
      // The corner is on the street: it moves to the first street it lies beside, so that
      // street stays straight, rather than the street bending out to it.
      if (!cuts.some((list) => list.some((cut) => cut.at === c))) [c[0], c[1]] = hit.at;
      cuts[si].push({ along: hit.along, at: c });
    }
  }
  // Two streets that cross: both are cut at the crossing.
  const crossings = new Map();
  for (const segs of grid.values()) {
    for (let m = 0; m < segs.length; m++) for (let n = m + 1; n < segs.length; n++) {
      const [s, t] = [segs[m], segs[n]];
      if (s.si === t.si) continue;
      const k = s.si < t.si ? `${s.si}/${s.i}/${t.si}/${t.i}` : `${t.si}/${t.i}/${s.si}/${s.i}`;
      if (crossings.has(k)) continue;
      const [a, b, c, d] = [paths[s.si][s.i - 1], paths[s.si][s.i], paths[t.si][t.i - 1], paths[t.si][t.i]];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-9) { crossings.set(k, null); continue; }
      const u = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const v = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      crossings.set(k, u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { s, t, u, v, at: lerp(a, b, u) } : null);
    }
  }
  for (const x of crossings.values()) {
    if (!x || nearCorner(x.at)) continue;
    const at = weld(x.at);
    for (const [g, f] of [[x.s, x.u], [x.t, x.v]]) cuts[g.si].push({ along: before[g.si][g.i - 1] + f * (before[g.si][g.i] - before[g.si][g.i - 1]), at });
  }
  const out = [];
  streets.forEach((st, si) => {
    const path = paths[si];
    const total = before[si].at(-1);
    const at = [{ along: 0, at: path[0] }];
    for (const cut of cuts[si].sort((p, q) => p.along - q.along)) if (cut.at !== at.at(-1).at && cut.at !== path.at(-1)) at.push(cut);
    at.push({ along: total, at: path.at(-1) });
    for (let i = 1; i < at.length; i++) {
      const piece = at.length === 2 ? [...path] : partOf(path, at[i - 1].along, at[i].along);
      piece[0] = at[i - 1].at;
      piece[piece.length - 1] = at[i].at;
      // A link shorter than the reach of a corner, both ends at one corner, is the corner itself.
      if (piece[0] === piece.at(-1) && length(piece) <= 2 * snap) continue;
      out.push({ ...st, path: piece });
    }
  });
  return out;
}

/**
 * Streets without stubs: a short run from a corner to an end where nothing else is (no
 * street, no hall's wall) reads as a barb on the street it leaves, not as a route.
 */
export function pruned(streets, stub, walls = []) {
  const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  // The last steps of a street to a hall's wall are drawn as the street they carry on from: cut
  // at the wall, a few pixels of a busier street that ran on through the hall would be a blot.
  const ends = new Map();
  for (const st of streets) for (const p of new Set([key(st.path[0]), key(st.path.at(-1))])) ends.set(p, [...(ends.get(p) ?? []), st]);
  // Where several streets run those last steps from one corner, one is drawn: the one that
  // shares most routes with the streets it carries on from.
  const lastSteps = (st) => {
    if (length(st.path) >= stub) return null;
    const tips = [st.path[0], st.path.at(-1)];
    const wall = tips.findIndex((tip) => ends.get(key(tip)).length === 1 && walls.some((w) => nearest(w.ring, tip).d < 1));
    return wall < 0 ? null : key(tips[1 - wall]);
  };
  const said = new Set();
  for (const [k, list] of ends) {
    const steps = list.filter((st) => lastSteps(st) === k);
    if (steps.length < 2 || steps.length === list.length) continue;
    const on = new Set(list.filter((st) => !steps.includes(st)).flatMap((st) => String(st.routes).split(' ')));
    const shared = (st) => String(st.routes).split(' ').filter((r) => on.has(r)).length;
    steps.sort((x, y) => shared(y) - shared(x) || length(y.path) - length(x.path));
    for (const st of steps.slice(1)) said.add(st);
  }
  if (said.size) {
    streets = streets.filter((st) => !said.has(st));
    ends.clear();
    for (const st of streets) for (const p of new Set([key(st.path[0]), key(st.path.at(-1))])) ends.set(p, [...(ends.get(p) ?? []), st]);
  }
  let left = streets.map((st) => {
    if (length(st.path) >= stub) return st;
    const tips = [st.path[0], st.path.at(-1)];
    const wall = tips.findIndex((tip) => ends.get(key(tip)).length === 1 && walls.some((w) => nearest(w.ring, tip).d < 1));
    const others = wall < 0 ? [] : ends.get(key(tips[1 - wall])).filter((o) => o !== st);
    return others.length === 1 ? { ...st, cls: others[0].cls, hw: others[0].hw } : st;
  });
  for (let pass = 0; pass < 6; pass++) {
    const at = new Map();
    for (const st of left) for (const p of new Set([key(st.path[0]), key(st.path.at(-1))])) at.set(p, [...(at.get(p) ?? []), st]);
    const gone = new Set();
    const onWall = (tip) => walls.some((w) => nearest(w.ring, tip).d < 1);
    for (const st of left) {
      if (gone.has(st)) continue;
      // A scrap along a hall's wall, both ends on it and nothing else at either, goes too.
      if (length(st.path) < stub && [st.path[0], st.path.at(-1)].every((tip) => at.get(key(tip)).length === 1 && onWall(tip))) { gone.add(st); continue; }
      for (const end of [0, 1]) {
        const tip = end ? st.path.at(-1) : st.path[0];
        if (at.get(key(tip)).length !== 1 || onWall(tip)) continue;
        // Along the street from its loose end to the first corner where streets part.
        const run = [st];
        let far = length(st.path);
        let here = key(end ? st.path[0] : st.path.at(-1));
        while (far < stub && at.get(here).length === 2) {
          const next = at.get(here).find((o) => o !== run.at(-1));
          if (run.includes(next)) break;
          run.push(next);
          far += length(next.path);
          here = key(next.path[0]) === here ? key(next.path.at(-1)) : key(next.path[0]);
        }
        if (far < stub) for (const o of run) gone.add(o);
      }
    }
    if (!gone.size) break;
    left = left.filter((st) => !gone.has(st));
  }
  return left;
}

/**
 * Streets with each closed loop drawn as a hand would: where the way out and the way back
 * lie closer than `slim` they are one street down the middle, and a loop that never opens
 * wider than that is all one street, out to its far end.
 */
export function unlooped(streets, slim, speck) {
  const out = [];
  for (const st of streets) {
    if (st.path.length < 3 || dist(st.path[0], st.path.at(-1)) > 1.5) { out.push(st); continue; }
    const pts = resample([...st.path.slice(0, -1), st.path[0]], 2);
    const n = pts.length;
    // The way out and the way back are zipped together from the corner, each step taking
    // whichever next pair lies closest, so a side that wanders a little longer than the other
    // stays paired with it. The loop opens where the two first lie `slim` apart for longer than
    // three times that; a shorter bulge is drawn through.
    const all = [[0, n - 1, 0]];
    for (let [i, j] = [0, n - 1]; j - i > 2;) {
      const steps = [[i + 1, j - 1], [i + 1, j], [i, j - 1]].map(([a, b]) => [a, b, dist(pts[a], pts[b])]);
      [i, j] = steps.reduce((m, x) => (x[2] < m[2] - 0.01 ? x : m));
      all.push([i, j, dist(pts[i], pts[j])]);
    }
    let cut = all.length - 1;
    for (let k = 1, from = -1, run = 0; k < all.length; k++) {
      if (all[k][2] < slim) { from = -1; continue; }
      if (from < 0) { from = k; run = 0; }
      run += Math.max(dist(pts[all[k][0]], pts[all[k - 1][0]]), dist(pts[all[k][1]], pts[all[k - 1][1]]));
      if (run >= 3 * slim) { cut = from - 1; break; }
    }
    const pairs = all.slice(0, cut + 1);
    const [i, j] = pairs.at(-1);
    const mid = ([a, b]) => lerp(pts[a], pts[b], 0.5);
    const stick = pairs.map(mid);
    const eye = pts.slice(i, j + 1);
    let area = 0;
    for (let k = 0; k < eye.length; k++) { const [p, q] = [eye[k], eye[(k + 1) % eye.length]]; area += p[0] * q[1] - q[0] * p[1]; }
    if (j - i <= 2 || Math.abs(area) / (length(eye) || 1) < slim) {
      // Never opens wider than `slim`: all one street, out to its far end.
      const m = eye.length - 1;
      const rest = [];
      for (let k = 1; k <= m / 2; k++) rest.push(lerp(eye[k], eye[m - k], 0.5));
      out.push({ ...st, path: simplify([pts[0], ...stick.slice(1), ...rest], 0.3) });
      continue;
    }
    // A stick too short to draw is left as part of the loop.
    if (length(stick) < speck) { out.push(st); continue; }
    const join = stick.at(-1);
    out.push({ ...st, path: simplify([pts[0], ...stick.slice(1)], 0.3) });
    out.push({ ...st, path: simplify([join, ...eye, join], 0.3) });
  }
  return out;
}

/**
 * Streets with each loose end that stops at a bus station's wall drawn onto the wall, square:
 * route data stops where buses go indoors, and the last few yards of it wander.
 */
function walled(streets, walls) {
  if (!walls.length) return streets;
  const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
  const met = new Map();
  for (const st of streets) for (const p of [st.path[0], st.path.at(-1)]) met.set(key(p), (met.get(key(p)) ?? 0) + 1);
  const reach = SIZES.hallReach;
  // Where a street reaching a wall meets it: of straight on along the way it has come for the
  // last few blocks' worth, and the nearest point of the wall, whichever turns it less, so it
  // arrives without a hook.
  const onWall = (ring, pts) => {
    const tip = pts.at(-1);
    const near = nearest(ring, tip);
    const back = pointAlong([...pts].reverse(), Math.min(24, length(pts)));
    const d = dist(back, tip);
    if (d < 1) return near.at;
    const u = [(tip[0] - back[0]) / d, (tip[1] - back[1]) / d];
    let best = null;
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      const e = [b[0] - a[0], b[1] - a[1]];
      const den = u[0] * e[1] - u[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - tip[0]) * e[1] - (a[1] - tip[1]) * e[0]) / den;
      const s = ((a[0] - tip[0]) * u[1] - (a[1] - tip[1]) * u[0]) / den;
      if (t >= -1 && s >= 0 && s <= 1 && (!best || t < best)) best = t;
    }
    if (best === null || best > Math.max(2 * near.d, near.d + 4)) return near.at;
    const ahead = [tip[0] + u[0] * best, tip[1] + u[1] * best];
    const turn = (q) => { const l = dist(tip, q); return l < 0.5 ? 0 : 1 - ((q[0] - tip[0]) * u[0] + (q[1] - tip[1]) * u[1]) / l; };
    return turn(near.at) <= turn(ahead) ? near.at : ahead;
  };
  // No street is drawn inside a hall: one that runs in stops at the wall it meets, and one that
  // runs through is two streets, each ending on its wall.
  const inside = (p, ring) => {
    let on = false;
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])) on = !on;
    }
    return on;
  };
  const outside = [];
  for (const st of streets) {
    const pts = resample(st.path, 1);
    const ring = walls.map((w) => w.ring).find((r) => pts.some((p) => inside(p, r)));
    if (!ring) { outside.push(st); continue; }
    const within = pts.map((p) => inside(p, ring));
    const [first, last] = [within.indexOf(true), within.lastIndexOf(true)];
    // A street that only clips a hall's edge or corner is left as it is; one that runs on
    // through the room is cut at both walls, so the room reads whole.
    const across = !within[0] && !within.at(-1) && within.slice(first, last + 1).every(Boolean) && last - first < SIZES.hallReach;
    if (across) { outside.push(st); continue; }
    let run = [];
    const done = () => { if (run.length > 1 && length(run) > 1) outside.push({ ...st, path: simplify(run, 0.3) }); run = []; };
    for (let i = 0; i < pts.length; i++) {
      if (!within[i]) {
        // A street coming out of a hall leaves its wall the way it carries on.
        if (!run.length && i) run.push(onWall(ring, pts.slice(i, i + 9).reverse()));
        run.push(pts[i]);
      }
      else if (run.length) { run.push(onWall(ring, run)); done(); }
    }
    done();
  }
  streets = outside;
  met.clear();
  for (const st of streets) for (const p of [st.path[0], st.path.at(-1)]) met.set(key(p), (met.get(key(p)) ?? 0) + 1);
  return streets.map((st) => {
    let path = st.path;
    for (const end of [0, 1]) {
      const tip = end ? path.at(-1) : path[0];
      if (met.get(key(tip)) > 1) continue;
      const wall = walls.map((w) => w.ring).sort((a, b) => nearest(a, tip).d - nearest(b, tip).d)[0];
      if (nearest(wall, tip).d > reach) continue;
      // Back along the street to where it is clear of the wall, and past any gentle bend in
      // its last yards (a hook in the data, not a corner), then on to the wall.
      const v = end ? [...path] : [...path].reverse();
      const bend = (a, b, c) => {
        const [p, q] = [[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]];
        const l = Math.hypot(...p) * Math.hypot(...q);
        return l ? Math.acos(Math.max(-1, Math.min(1, (p[0] * q[0] + p[1] * q[1]) / l))) : 0;
      };
      while (v.length > 2 && nearest(wall, v.at(-2)).d <= 3 * reach && ((t) => t > 0.07 && t < 0.5)(bend(...v.slice(-3)))) v.pop();
      const pts = resample(v, 2);
      while (pts.length > 2 && nearest(wall, pts.at(-1)).d <= reach) pts.pop();
      if (nearest(wall, pts.at(-1)).d > 3 * reach) continue;
      pts.push(onWall(wall, pts));
      path = simplify(end ? pts : pts.reverse(), 0.3);
    }
    return path === st.path ? st : { ...st, path };
  });
}

/**
 * A closed ring drawn as a room: the tightest rectangle round it, along its own lie, brought in
 * about its middle until it covers the ground the ring does. A surveyed outline has a notch
 * and a slant for every doorway and bay; at a sheet's size they read as a torn scrap.
 */
export function squared(ring) {
  let area = 0;
  for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  area = Math.abs(area) / 2;
  let best = null;
  for (let i = 1; i < ring.length; i++) {
    const d = dist(ring[i - 1], ring[i]);
    if (d < 1e-9) continue;
    const u = [(ring[i][0] - ring[i - 1][0]) / d, (ring[i][1] - ring[i - 1][1]) / d];
    const along = ring.map((p) => p[0] * u[0] + p[1] * u[1]);
    const across = ring.map((p) => p[1] * u[0] - p[0] * u[1]);
    const box = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
    const size = (box[1] - box[0]) * (box[3] - box[2]);
    if (!best || size < best.size) best = { u, box, size };
  }
  if (!best || !best.size || !area) return ring;
  const { u, box } = best;
  const k = Math.sqrt(area / best.size);
  const mid = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
  const half = [((box[1] - box[0]) / 2) * k, ((box[3] - box[2]) / 2) * k];
  const at = (a, c) => [(mid[0] + a * half[0]) * u[0] - (mid[1] + c * half[1]) * u[1], (mid[0] + a * half[0]) * u[1] + (mid[1] + c * half[1]) * u[0]];
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), at(-1, -1)];
}

/**
 * The halls of bus stations wide enough to draw on this sheet, `{ id, name, ring }` in pixels
 * (the ring closed). Streets end on a hall's wall: it is where their buses go.
 */
export function halls(terminals, sheet) {
  const out = [];
  for (const f of terminals?.features ?? []) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const rings of polygons) {
      const ring = rings[0].map((c) => toPx(c, sheet.zoom));
      if (dist(ring[0], ring.at(-1)) > 1e-6) ring.push(ring[0]);
      let area = 0;
      for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      // How wide it is: its area over its longest reach.
      const far = Math.max(...ring.map((p) => Math.max(...ring.map((q) => dist(p, q)))));
      if (Math.abs(area) / 2 / (far || 1) >= SIZES.hallWide) out.push({ id: f.properties.id, name: f.properties.name, underground: !!f.properties.underground, ring: squared(ring) });
    }
  }
  return out;
}

/** A hall's long axis: through its middle, the way its longest wall runs, three fifths of its length, reading left to right. */
export function hallAxis(ring) {
  let wall = [ring[0], ring[1]];
  for (let i = 1; i < ring.length; i++) if (dist(ring[i - 1], ring[i]) > dist(...wall)) wall = [ring[i - 1], ring[i]];
  const d = dist(...wall) || 1;
  let u = [(wall[1][0] - wall[0][0]) / d, (wall[1][1] - wall[0][1]) / d];
  if (u[0] < 0) u = [-u[0], -u[1]];
  const along = ring.map((p) => p[0] * u[0] + p[1] * u[1]);
  const across = ring.map((p) => p[1] * u[0] - p[0] * u[1]);
  const [a, c] = [(Math.min(...along) + Math.max(...along)) / 2, (Math.min(...across) + Math.max(...across)) / 2];
  const len = Math.max(...along) - Math.min(...along);
  return [-0.3, 0.3].map((k) => [(a + len * k) * u[0] - c * u[1], (a + len * k) * u[1] + c * u[0]]);
}

/**
 * Where streets carry their label, each a stretch of street for the label to run along. A
 * label is the street's whole list of routes, never part of one. A street is cut into a piece
 * at every corner; pieces that carry straight on from each other are one street, and along it
 * neighbours with the same list are one run. A run long enough for its list is labelled, the
 * longest first, no two labels of a street closer than `every`. A label sits within one block
 * where a block holds it, and runs on across cross streets only where none does. Returns
 * `{ path, routes, cls, n }` for each; `ok(path)` can turn a stretch down (no room beside it).
 */
export function labelRuns(streets, every, width = () => 0, ok = () => true) {
  const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
  const at = new Map();
  streets.forEach((st, i) => { for (const end of [0, 1]) { const k = key(end ? st.path.at(-1) : st.path[0]); at.set(k, [...(at.get(k) ?? []), { i, end }]); } });
  const away = (st, end) => {
    const [a, b] = end ? [st.path.at(-1), pointAlong([...st.path].reverse(), 6)] : [st.path[0], pointAlong(st.path, 6)];
    const d = dist(a, b) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  // At each corner the pieces pair off with the one most nearly straight ahead.
  const on = new Map();
  for (const meet of at.values()) {
    const pairs = [];
    for (let a = 0; a < meet.length; a++) for (let b = a + 1; b < meet.length; b++) {
      if (meet[a].i === meet[b].i) continue;
      const [u, v] = [away(streets[meet[a].i], meet[a].end), away(streets[meet[b].i], meet[b].end)];
      const straight = -(u[0] * v[0] + u[1] * v[1]);
      if (straight > 0.8) pairs.push({ a: meet[a], b: meet[b], straight });
    }
    const used = new Set();
    for (const { a, b } of pairs.sort((x, y) => y.straight - x.straight)) {
      const [ka, kb] = [`${a.i}/${a.end}`, `${b.i}/${b.end}`];
      if (used.has(ka) || used.has(kb)) continue;
      used.add(ka).add(kb);
      on.set(ka, b);
      on.set(kb, a);
    }
  }
  const seen = new Set();
  const out = [];
  const walk = (i, end, list) => {
    // From piece `i`, leaving by its `end`: the pieces after it, in order.
    for (let next = on.get(`${i}/${end}`); next && !seen.has(next.i); next = on.get(`${next.i}/${next.end ? 0 : 1}`)) { seen.add(next.i); list.push(next.i); }
    return list;
  };
  const list = (st) => inOrder(String(st.routes).split(' ')).join(' ');
  streets.forEach((_, i) => {
    if (seen.has(i)) return;
    seen.add(i);
    const chain = [...walk(i, 0, []).reverse(), i, ...walk(i, 1, [])];
    // Each piece turned to run on from the one before.
    const paths = [];
    chain.forEach((j, n) => {
      let path = streets[j].path;
      const next = n === 0 && chain.length > 1 ? streets[chain[1]].path : null;
      const far = (p, q) => Math.min(dist(p, q[0]), dist(p, q.at(-1)));
      if (next ? far(path[0], next) < far(path.at(-1), next) : n > 0 && dist(path.at(-1), paths[n - 1].at(-1)) < dist(path[0], paths[n - 1].at(-1))) path = [...path].reverse();
      paths.push(path);
    });
    // Runs of one list, each with where it starts along the street.
    const runs = [];
    let along = 0;
    chain.forEach((j, n) => {
      const len = length(paths[n]);
      const last = runs.at(-1);
      if (last && last.list === list(streets[j])) { last.pieces.push({ from: last.len, len }); last.len += len; last.path.push(...paths[n].slice(1)); last.of.push(streets[j]); }
      else runs.push({ list: list(streets[j]), at: along, len, path: [...paths[n]], pieces: [{ from: 0, len }], of: [streets[j]] });
      along += len;
    });
    const set = [];
    for (const run of runs.sort((a, b) => b.len - a.len)) {
      const top = run.of.reduce((a, b) => (CLASS_ORDER.indexOf(b.cls) > CLASS_ORDER.indexOf(a.cls) ? b : a));
      const need = width(top);
      if (run.len < need) continue;
      const count = Math.max(1, Math.floor(run.len / every));
      // A little slack past the figures, so the page's own measure of them still fits.
      const span = Math.min(run.len, need * 1.15);
      for (let c = 0; c < count; c++) {
        let mid = (run.len * (c + 0.5)) / count;
        const blocks = run.pieces.filter((q) => q.len >= span).sort((a, b) => Math.abs(a.from + a.len / 2 - mid) - Math.abs(b.from + b.len / 2 - mid));
        const [lo, hi] = blocks.length ? [blocks[0].from, blocks[0].from + blocks[0].len] : [0, run.len];
        mid = Math.min(hi - span / 2, Math.max(lo + span / 2, mid));
        if (set.some((o) => Math.abs(o - (run.at + mid)) < every)) continue;
        const path = partOf(run.path, mid - span / 2, mid + span / 2);
        if (path.length < 2 || !ok(path)) continue;
        set.push(run.at + mid);
        out.push({ path, routes: run.list, cls: top.cls, n: Math.max(...run.of.map((o) => o.n ?? 0)) });
      }
    }
  });
  return out;
}

/**
 * Which side of its street a block's route numbers go on: 1 for the side above the upright
 * figures (as the page sets them by default), -1 for the side below, 0 where neither has room.
 * A side is crowded where another street runs within the figures' reach of the street along
 * a quarter or more of the block (a parallel street, the other half of a one-way pair): there
 * the numbers would sit on that street. The page sets figures upright, so which side is above
 * them follows the way the block runs across the screen.
 */
export function labelSide(street, streets, size) {
  const len = length(street.path);
  // Near its corners a block meets its cross streets; a short block is judged at its middle.
  const margin = Math.min(size + 2, len / 2);
  const a = street.path[0];
  const b = street.path.at(-1);
  // Upright: figures run left to right, so a block running leftward is read from its far end.
  const run = a[0] > b[0] ? [a[0] - b[0], a[1] - b[1]] : [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(...run) || 1;
  const up = [run[1] / l, -run[0] / l];
  const reach = [2.5, 2.5 + 0.72 * size + 2];
  const box = street.path.reduce((m, p) => [Math.min(m[0], p[0]), Math.min(m[1], p[1]), Math.max(m[2], p[0]), Math.max(m[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const pad = reach[1] + 2;
  const others = streets.filter((o) => o !== street && o.path.some((p) => p[0] > box[0] - pad && p[0] < box[2] + pad && p[1] > box[1] - pad && p[1] < box[3] + pad));
  const crowded = (sign) => {
    let hits = 0;
    let probes = 0;
    for (let at = margin; at <= len - margin; at += 3) {
      const p = pointAlong(street.path, at);
      probes++;
      if ([reach[0], (reach[0] + reach[1]) / 2, reach[1]].some((r) => {
        const q = [p[0] + sign * up[0] * r, p[1] + sign * up[1] * r];
        return others.some((o) => nearest(o.path, q).d < 1.5);
      })) hits++;
    }
    return probes && hits / probes >= 0.25;
  };
  if (!crowded(1)) return 1;
  return crowded(-1) ? 0 : -1;
}

/**
 * The bus stops a sheet draws as rings. A stop the build counted as a bus station's is left
 * off (its hall stands for it), and so is one only trains call at (its station's bar does).
 */
export function busStops(stops, routes) {
  if (!stops) return [];
  const rail = new Set(routes.features.filter((f) => f.properties.mode === 'rail').map((f) => f.properties.route));
  return stops.features.filter((f) => {
    const q = f.properties;
    const served = String(q.lines ?? q.routes ?? '').split(/[ ,]+/).filter(Boolean);
    return !q.terminal && !(served.length && served.every((r) => rail.has(r)));
  });
}

/** Routes in one order everywhere: numbers by their value, then names by the alphabet. */
export function inOrder(routes) {
  const key = (r) => { const n = parseInt(r, 10); return Number.isNaN(n) ? [1, 0, r] : [0, n, r]; };
  return [...routes].sort((a, b) => { const [x, y] = [key(a), key(b)]; return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
}

/**
 * Where each stop's ring goes: on the street its buses are drawn on. The streets are drawn,
 * not traced, so a stop at its true place can sit off its line, or between two. Each is moved
 * to the nearest point of the nearest street within `reach` that carries one of its routes.
 * Stops that land ring on ring (the two sides of one street) are one ring with the routes of all.
 */
export function stopRings(stops, streets, sheet, reach = 2 * SIZES.busMerge[sheet.id]) {
  const cell = 64;
  const grid = new Map();
  const key = (p) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
  streets.forEach((st, i) => {
    for (const p of resample(st.path, 16)) {
      const k = key(p);
      if (!grid.has(k)) grid.set(k, new Set());
      grid.get(k).add(i);
    }
  });
  const sets = streets.map((st) => new Set(String(st.routes).split(' ')));
  const rings = [];
  const apart = 2 * SIZES.stopRing + 1.5;
  for (const f of stops) {
    const q = f.properties;
    const p = toPx(f.geometry.coordinates, sheet.zoom);
    const mine = String(q.lines ?? q.routes ?? '').split(/[ ,]+/).filter(Boolean);
    let best = null;
    const tried = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(key([p[0] + dx * cell, p[1] + dy * cell])) ?? []) {
        if (tried.has(i) || !mine.some((r) => sets[i].has(r))) continue;
        tried.add(i);
        const h = nearest(streets[i].path, p);
        if (h.d <= reach && (!best || h.d < best.d)) best = h;
      }
    }
    const at = best ? best.at : p;
    const same = rings.find((r) => dist(r.at, at) < apart);
    if (same) {
      same.routes = inOrder([...new Set([...same.routes, ...mine])]);
      if (same.heading !== (q.heading ?? '')) same.heading = '';
    } else rings.push({ id: q.id, name: q.name, heading: q.heading ?? '', routes: inOrder(mine), at });
  }
  return rings;
}

// --- One sheet, as GeoJSON -------------------------------------------------------

/** Everything one sheet draws, as a FeatureCollection the page loads. */
export function drawSheet({ routes, stations, streets, terminals, stops }, sheet) {
  const lines = railLines(routes, sheet);
  const walls = halls(terminals, sheet);
  const marks = stationMarks(stations, lines, sheet, walls);
  const bus = busStreets(streets, sheet, walls, marks, lines);
  const discs = letters(lines, marks, sheet);
  const back = (p) => toLonLat(p, sheet.zoom);
  const feature = (properties, geometry) => ({ type: 'Feature', properties, geometry });
  const features = [];
  for (const h of walls) {
    features.push(feature({ kind: 'hall', id: h.id, name: h.name }, { type: 'Polygon', coordinates: [h.ring.map(back)] }));
    // What the room is, lettered down its length where it is long enough to hold the words.
    const text = h.underground ? 'Bus concourse' : 'Bus station';
    const axis = hallAxis(h.ring);
    if (dist(...axis) >= text.length * SIZES.hallLetter * 1.1) features.push(feature({ kind: 'hall-name', text }, { type: 'LineString', coordinates: axis.map(back) }));
  }
  // Along a street: every route on it, in full. A stretch too short for its list is not
  // labelled on this sheet; a tap gives the list anywhere.
  const size = SIZES.busLabelSize[sheet.id];
  const listed = (routes) => inOrder(String(routes).split(' ')).join(', ');
  for (const s of bus) features.push(feature({ kind: 'bus', cls: s.cls, routes: listed(s.routes), n: s.n, hw: s.hw }, { type: 'LineString', coordinates: s.path.map(back) }));
  // The figures and their halo, with clear air at each end so they stop short of a cross street.
  const width = (s) => listed(s.routes).length * size * 0.5 + 2 * SIZES.busLabelAir;
  const sides = new Map();
  const side = (path) => { if (!sides.has(path)) sides.set(path, labelSide({ path }, bus, size)); return sides.get(path); };
  for (const run of labelRuns(bus, SIZES.busLabelEvery[sheet.id], width, (path) => side(path) !== 0)) {
    features.push(feature({ kind: 'bus-label', cls: run.cls, label: listed(run.routes), n: run.n, ...(side(run.path) < 0 ? { side: -1 } : {}) }, { type: 'LineString', coordinates: run.path.map(back) }));
  }
  for (const l of lines) {
    features.push(feature({ kind: 'rail', route: l.route, color: l.color }, { type: 'MultiLineString', coordinates: l.paths.map((p) => p.map(back)) }));
  }
  for (const m of marks) {
    const properties = { kind: 'station', shape: 'bar', id: m.id, name: m.name, hub: m.hub, end: m.end, lines: m.lines };
    // A bar is drawn as a short round-ended line; a single stop is a bar of no length: a dot.
    for (const [i, [a, b]] of [m.ends, ...m.more].entries()) {
      const single = dist(a, b) < 0.5;
      features.push(feature({ ...properties, single, fat: !i && m.fat }, { type: 'LineString', coordinates: [back(a), back(single ? [a[0] + 0.5, a[1]] : b)] }));
    }
  }
  for (const b of discs) {
    features.push(feature({ kind: 'letter', route: b.route, color: b.color, ink: b.ink }, { type: 'Point', coordinates: back(b.at) }));
  }
  for (const n of names(marks, lines, discs, sheet, bus)) {
    const m = n.mark;
    features.push(feature({ kind: 'station', shape: 'name', id: m.id, name: m.name, hub: m.hub, end: m.end, lines: m.lines, minor: n.minor, text: n.text, anchor: n.anchor, offset: n.offset, justify: n.justify },
      { type: 'Point', coordinates: back(n.at) }));
    for (const b of n.letters) features.push(feature({ kind: 'letter', small: true, route: b.route, color: b.color, ink: b.ink }, { type: 'Point', coordinates: back(b.at) }));
  }
  if (sheet.id >= SIZES.stopSheet) {
    // A ring half under a rail line can't be read as a stop: one that close to a line is not drawn.
    const clear = SIZES.rail[sheet.id] / 2 + SIZES.stopRing;
    for (const r of stopRings(busStops(stops, routes), bus, sheet)) {
      const p = r.at;
      if (lines.some((l) => l.paths.some((path) => boxed(path, p, clear) && nearest(path, p).d < clear))) continue;
      features.push(feature({ kind: 'stop', id: r.id, name: r.name, heading: r.heading, routes: r.routes.join(', ') }, { type: 'Point', coordinates: back(p) }));
    }
  }
  const hub = marks.find((m) => m.hub);
  return { type: 'FeatureCollection', hub: hub ? back(lerp(hub.ends[0], hub.ends[1], 0.5)) : null, features };
}
