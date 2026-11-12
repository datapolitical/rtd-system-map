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
  ease: 9,
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
  // Bus streets: a stretch shorter than this takes the class of the stretches
  // it joins, and a loop or stub smaller than this is not drawn.
  busBlip: 14,
  busBlipMetres: 120,
  busRun: 45,
  busRing: 32,
  busBridgeMetres: 110,
  busRunMetres: 220,
  busSpeck: 10,
  // Bus streets closer together than this can't be told apart: they are drawn as one.
  busMerge: { 1: 4, 2: 7, 3: 7, 4: 24 },
  // A street's label lists this many routes, then how many more.
  busListed: 4,
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
export function stationMarks(stations, lines, sheet) {
  const byRoute = new Map(lines.map((l) => [l.route, l]));
  const pitch = SIZES.rail[sheet.id] + SIZES.gap[sheet.id];
  const marks = [];
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
      // A line whose path stops within a few pitches of the station ends here.
      h.end = h.along < 3 * pitch ? 0 : h.total - h.along < 3 * pitch ? 1 : null;
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
      const c = [g.reduce((x, h) => x + h.at[0], 0) / g.length, g.reduce((y, h) => y + h.at[1], 0) / g.length];
      for (const h of g) h.s = dot([h.at[0] - c[0], h.at[1] - c[1]], n);
      // A line that ends here is drawn into the bar square-on and stops at it, whatever the
      // track does in its last few yards; lines ending side by side keep their pitch.
      const reach = (h) => Math.min(14 * pitch, h.total / 3);
      const inward = (h) => {
        const q = pointAlong(h.line.paths[h.pi], h.end ? h.total - reach(h) : reach(h));
        return dot([q[0] - c[0], q[1] - c[1]], t) >= 0 ? 1 : -1;
      };
      const enders = g.filter((h) => h.end !== null);
      for (const side of [1, -1]) {
        const set = enders.filter((h) => inward(h) === side).sort((x, y) => x.s - y.s);
        if (!set.length) continue;
        const mid = set.reduce((x, h) => x + h.s, 0) / set.length;
        set.forEach((h, i) => {
          if (allEnd) h.s = mid + (i - (set.length - 1) / 2) * pitch;
          const path = h.line.paths[h.pi];
          const far = reach(h);
          const from = h.end ? h.total - far : far;
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
      return [Math.min(...ss), Math.max(...ss)].map((v) => [c[0] + n[0] * v, c[1] + n[1] * v]);
    });
    const ends = bars[0];
    marks.push({ id: q.id, name: q.label ?? q.name, hub: !!q.hub, end: !!q.end, lines: q.lines, count: hits.length, ends, span: dist(ends[0], ends[1]), more: bars.slice(1) });
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
  for (const m of [...marks].sort((a, b) => rank(a) - rank(b) || a.id - b.id)) {
    const must = m.hub || m.end;
    // Where not every name fits, the hub and line ends are lettered larger than the rest.
    const minor = !must && !SIZES.nameAll[sheet.id];
    const size = minor ? SIZES.nameMinor : SIZES.name[sheet.id];
    const c = lerp(m.ends[0], m.ends[1], 0.5);
    const half = [(m.ends[1][0] - m.ends[0][0]) / 2, (m.ends[1][1] - m.ends[0][1]) / 2];
    const placed = (text) => {
      const rows = text.split('\n');
      const [w, h] = [Math.max(...rows.map((r) => r.length)) * size * 0.56, rows.length * size * 1.12];
      let best = null;
      for (const reach of [1, 1.8, 2.8]) {
        for (const [dx, dy, anchor, cost] of sides) {
          const n = Math.hypot(dx, dy);
          const off = (rail / 2 + 5 + Math.abs((half[0] * dx + half[1] * dy) / n)) * reach;
          const at = [c[0] + (dx / n) * off, c[1] + (dy / n) * off];
          const x0 = at[0] + (dx > 0 ? 0 : dx < 0 ? -w : -w / 2);
          const y0 = at[1] + (dy > 0 ? 0 : dy < 0 ? -h : -h / 2);
          const box = [x0, y0, x0 + w, y0 + h];
          const hits = set.filter((o) => touch(box, o.box)).length;
          const score = hits * 1000 + inked(box) + cost + (reach - 1) * 2;
          if (!best || score < best.score) best = { text, score, hits, box, anchor, offset: [(at[0] - c[0]) / size, (at[1] - c[1]) / size] };
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
    set.push({ mark: m, text, minor, box: best.box, anchor: best.anchor, offset: best.offset, justify });
  }
  return set;
}

/**
 * Streets with every ring too small to read as a ring drawn as the point where its streets
 * meet: a turnaround at a station or the end of a route is a dot's width on the sheet, and
 * drawn true it is a knot of hooks. The streets that led into the ring now meet at its middle.
 */
function unringed(streets, most) {
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
  const edges = streets.map((st) => ({ st, a: key(st.path[0]), b: key(st.path.at(-1)), len: length(st.path) }));
  const small = edges.filter((e) => e.len < most && e.a !== e.b);
  const at = new Map();
  for (const e of small) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) ?? []), e]);
  const group = new Map();
  const find = (k) => { while (group.has(k) && group.get(k) !== k) k = group.get(k); return k; };
  for (const e of small) {
    // The shortest way round from one end of this street to the other without using it.
    const far = new Map([[e.a, { d: 0, via: [] }]]);
    const open = [e.a];
    while (open.length) {
      const k = open.sort((x, y) => far.get(y).d - far.get(x).d).pop();
      for (const o of at.get(k) ?? []) {
        if (o === e) continue;
        const to = o.a === k ? o.b : o.a;
        const d = far.get(k).d + o.len;
        if (d + e.len < most && (!far.has(to) || d < far.get(to).d)) { far.set(to, { d, via: [...far.get(k).via, to] }); open.push(to); }
      }
    }
    if (!far.has(e.b)) continue;
    for (const k of [e.a, ...far.get(e.b).via]) { if (!group.has(k)) group.set(k, k); group.set(find(k), find(e.a)); }
  }
  if (!group.size) return streets;
  const members = new Map();
  for (const e of edges) for (const [k, p] of [[e.a, e.st.path[0]], [e.b, e.st.path.at(-1)]]) {
    if (group.has(k)) members.set(find(k), [...(members.get(find(k)) ?? []), p]);
  }
  const middle = new Map([...members].map(([k, ps]) => [k, [ps.reduce((x, q) => x + q[0], 0) / ps.length, ps.reduce((y, q) => y + q[1], 0) / ps.length]]));
  const out = [];
  for (const e of edges) {
    const [ga, gb] = [group.has(e.a) ? find(e.a) : null, group.has(e.b) ? find(e.b) : null];
    if (ga && ga === gb && e.len < most) continue;
    const path = [...e.st.path];
    if (ga) path[0] = middle.get(ga);
    if (gb) path[path.length - 1] = middle.get(gb);
    out.push({ ...e.st, path });
  }
  return out;
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
export function busStreets(streets, sheet) {
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
      let longest = [next(e, 0), next(e, 1)].filter(Boolean).sort((a, b) => b.len - a.len)[0];
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
  return unringed(kept
    .filter((e) => {
      const closed = dist(e.path[0], e.path.at(-1)) < 1;
      const reachOf = Math.max(...e.path.map((p) => dist(p, e.path[0])));
      if (closed && reachOf < 2.4 * SIZES.busSpeck) return false;
      // A short spur off a street reads as a barb, not a route.
      return !(e.free && e.len < 2.5 * SIZES.busSpeck);
    })
    .map((e) => ({ cls: CLASS_ORDER[e.rank], routes: e.routes, n: e.n, hw: e.hw, path: simplify(rounded(simplify(e.path, 2), 2), 0.3) })), SIZES.busRing);
}

// --- One sheet, as GeoJSON -------------------------------------------------------

/** Everything one sheet draws, as a FeatureCollection the page loads. */
export function drawSheet({ routes, stations, streets }, sheet) {
  const lines = railLines(routes, sheet);
  const marks = stationMarks(stations, lines, sheet);
  const bus = busStreets(streets, sheet);
  const discs = letters(lines, marks, sheet);
  const back = (p) => toLonLat(p, sheet.zoom);
  const feature = (properties, geometry) => ({ type: 'Feature', properties, geometry });
  const features = [];
  for (const s of bus) {
    // Along the street: its first few routes; a tap gives them all.
    const list = String(s.routes).split(' ');
    const label = list.length > SIZES.busListed ? `${list.slice(0, SIZES.busListed).join(', ')} +${list.length - SIZES.busListed}` : list.join(', ');
    features.push(feature({ kind: 'bus', cls: s.cls, routes: list.join(', '), n: s.n, hw: s.hw, label }, { type: 'LineString', coordinates: s.path.map(back) }));
  }
  for (const l of lines) {
    features.push(feature({ kind: 'rail', route: l.route, color: l.color }, { type: 'MultiLineString', coordinates: l.paths.map((p) => p.map(back)) }));
  }
  for (const m of marks) {
    const properties = { kind: 'station', shape: 'bar', id: m.id, name: m.name, hub: m.hub, end: m.end, lines: m.lines };
    // A bar is drawn as a short round-ended line; a single stop is a bar of no length: a dot.
    for (const [a, b] of [m.ends, ...m.more]) {
      const single = dist(a, b) < 0.5;
      features.push(feature({ ...properties, single }, { type: 'LineString', coordinates: [back(a), back(single ? [a[0] + 0.5, a[1]] : b)] }));
    }
  }
  for (const b of discs) {
    features.push(feature({ kind: 'letter', route: b.route, color: b.color, ink: b.ink }, { type: 'Point', coordinates: back(b.at) }));
  }
  for (const n of names(marks, lines, discs, sheet, bus)) {
    const m = n.mark;
    features.push(feature({ kind: 'station', shape: 'name', id: m.id, name: m.name, hub: m.hub, end: m.end, lines: m.lines, minor: n.minor, text: n.text, anchor: n.anchor, offset: n.offset, justify: n.justify },
      { type: 'Point', coordinates: back(lerp(m.ends[0], m.ends[1], 0.5)) }));
  }
  const hub = marks.find((m) => m.hub);
  return { type: 'FeatureCollection', hub: hub ? back(lerp(hub.ends[0], hub.ends[1], 0.5)) : null, features };
}
