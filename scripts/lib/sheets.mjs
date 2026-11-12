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
  // Another line this close means the line isn't running alone.
  alone: 9,
  // Station names: lettering size, and whether the sheet names every station or only the hub and line ends.
  name: { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 },
  nameAll: { 1: false, 2: true, 3: true, 4: true },
  nameMinor: 10,
  // A name whose best spot still sits on this much line is left for a closer sheet.
  nameCrowd: 26,
  // Bus streets: a stretch shorter than this takes the class of the stretches
  // it joins, and a loop or stub smaller than this is not drawn.
  busBlip: 14,
  busSpeck: 8,
  // Bus streets closer together than this can't be told apart: they are drawn as one.
  busMerge: 2.2,
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
  // The track itself is rounded over two pitches before anything is set beside it, so the
  // line on the inside of a tight bend still has room to curve: the pack turns as one.
  const reach = Math.round(2 * pitch);
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
    const hits = listed.map((line) => line.paths.map((p) => nearest(p, at)).sort((a, b) => a.d - b.d)[0]).filter((h) => h && h.d <= walk).map((h) => h.at);
    if (!hits.length) continue;
    // Platforms apart from each other get a bar each; the bar with the most lines carries the name.
    const bars = [];
    for (const h of hits) {
      const bar = bars.find((g) => g.some((o) => dist(o, h) <= 2.5 * pitch));
      if (bar) bar.push(h); else bars.push([h]);
    }
    const spanOf = (on) => {
      let ends = [on[0], on[0]];
      for (const a of on) for (const b of on) if (dist(a, b) > dist(ends[0], ends[1])) ends = [a, b];
      return ends;
    };
    bars.sort((a, b) => b.length - a.length);
    const ends = spanOf(bars[0]);
    marks.push({ id: q.id, name: q.label ?? q.name, hub: !!q.hub, end: !!q.end, lines: q.lines, count: hits.length, ends, span: dist(ends[0], ends[1]), more: bars.slice(1).map(spanOf) });
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
  for (const line of lines) {
    const others = lines.filter((l) => l !== line).flatMap((l) => l.paths);
    for (const path of line.paths) {
      const pts = resample(path, 2);
      const mine = [];
      const fits = (i, alone = true) => {
        const p = pts[i];
        return Math.min(i, pts.length - 1 - i) * 2 >= 2 * clear
          && !stops.some((s) => dist(s, p) < clear)
          && ![...placed, ...mine].some((s) => dist(s.at, p) < 2 * clear)
          && !(alone && others.some((o) => nearest(o, p).d < SIZES.alone));
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
      for (let i = 0, from = -every / 4; i < pts.length; i++) {
        if (mine.some((m) => m.i === i)) from = i;
        else if ((i - from) * 2 >= every && !mine.some((m) => m.i > i && (m.i - i) * 2 < every / 2) && fits(i, false)) { put(i); from = i; }
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
    const text = wrapped(m.name);
    const rows = text.split('\n');
    const [w, h] = [Math.max(...rows.map((r) => r.length)) * size * 0.56, rows.length * size * 1.12];
    const c = lerp(m.ends[0], m.ends[1], 0.5);
    const half = [(m.ends[1][0] - m.ends[0][0]) / 2, (m.ends[1][1] - m.ends[0][1]) / 2];
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
        if (!best || score < best.score) best = { score, hits, box, anchor, offset: [(at[0] - c[0]) / size, (at[1] - c[1]) / size] };
      }
    }
    // Where every station is named, a name gives way only to another name; where they are
    // not, it also gives way to lines.
    if (!must && (best.hits || (minor && best.score >= SIZES.nameCrowd))) continue;
    const justify = best.anchor.includes('left') ? 'left' : best.anchor.includes('right') ? 'right' : 'center';
    set.push({ mark: m, text, minor, box: best.box, anchor: best.anchor, offset: best.offset, justify });
  }
  return set;
}

/** A long name on two rows: broken at its slash, or at the space nearest its middle. */
function wrapped(name) {
  const text = String(name);
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
  for (let pass = 0; pass < 2; pass++) {
    for (const e of edges) {
      if (e.len >= SIZES.busBlip) continue;
      const [a, b] = [onward(e, 0), onward(e, 1)];
      if (a && b && a.rank === b.rank && a.rank !== e.rank && a.len + b.len > 2 * e.len) e.rank = a.rank;
    }
  }
  // Streets closer together than a line can be told apart are drawn as one: the busier
  // (then the longer) is kept and carries the other's routes. Streets that meet end to end
  // are never folded into each other, so no street gains a gap.
  const cell = SIZES.busMerge;
  const grid = new Map();
  const at = (p, dx = 0, dy = 0) => `${Math.floor(p[0] / cell) + dx},${Math.floor(p[1] / cell) + dy}`;
  const meets = (a, b) => [a.path[0], a.path.at(-1)].some((p) => (nodes.get(key(p)) ?? []).includes(b));
  const beside = (e, p) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const hit of grid.get(at(p, dx, dy)) ?? []) if (hit.e !== e && dist(hit.p, p) <= cell && !meets(e, hit.e)) return hit.e;
    }
    return null;
  };
  const kept = [];
  for (const e of [...edges].sort((a, b) => b.rank - a.rank || b.len - a.len)) {
    const pts = resample(e.path, 1);
    const hits = pts.map((p) => beside(e, p));
    if (hits.filter(Boolean).length >= 0.85 * pts.length) {
      const into = hits.find(Boolean);
      const routes = [...new Set(`${into.routes} ${e.routes}`.split(' '))];
      [into.routes, into.n] = [routes.join(' '), Math.max(into.n, routes.length)];
      continue;
    }
    kept.push(e);
    for (const p of pts) {
      if (!grid.has(at(p))) grid.set(at(p), []);
      grid.get(at(p)).push({ e, p });
    }
  }
  const ends = new Map();
  for (const e of kept) for (const end of [e.path[0], e.path.at(-1)]) ends.set(key(end), (ends.get(key(end)) ?? 0) + 1);
  return kept
    .filter((e) => {
      const closed = dist(e.path[0], e.path.at(-1)) < 1;
      const reachOf = Math.max(...e.path.map((p) => dist(p, e.path[0])));
      if (closed && reachOf < SIZES.busSpeck) return false;
      const stub = ends.get(key(e.path[0])) === 1 || ends.get(key(e.path.at(-1))) === 1;
      return !(stub && e.len < SIZES.busSpeck);
    })
    .map((e) => ({ cls: CLASS_ORDER[e.rank], routes: e.routes, n: e.n, hw: e.hw, path: simplify(e.path, 0.3) }));
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
