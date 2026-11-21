// A rail line's letter where it enters the screen (DESIGN.md, "Rail bullets",
// "Edge letters"). The build places letters along each line about once a
// screen (scripts/lib/sharedtrack.mjs), but it can't know where the screen
// is: a line that only clips a corner, or whose nearest letter is a hundred
// pixels off one edge, crosses the screen as a color and nothing else. So
// when the map comes to rest, any rail line on screen with no letter drawn
// gets one, a little in from where it enters.
//
// Which lines there are, and where they run, is read from what the map has
// drawn: nothing here knows RTD's network. Work happens once per move, after
// the map is idle, on rail lines only. A pass took 1 to 2 ms at zoom 11 to 12
// over downtown on the phone profile (Playwright's iPhone 14, software GL,
// measured with performance.now around placeEdgeLetters), most of it
// queryRenderedFeatures. "On screen" means the part of the map no control
// covers (see uncovered): a letter under the search or Key cards can't be
// read, so it doesn't count, and none is put there.

const LAYER = 'rail-edge-letters';
const LETTERS = 'rail-bullets';
// From the edge to the middle of the letter: the circle's radius, and 8 px.
const INSET = 18;
// Two letters this near on screen can touch.
const APART = 28;
const STEP = 4;
// What sits over the map: found in the page by its position, not by name.
const COVERS = ['#finder', '#legend', '#live-button', '.maplibregl-ctrl-top-left', '.maplibregl-ctrl-top-right', '.maplibregl-ctrl-bottom-left', '.maplibregl-ctrl-bottom-right', '#panel:not([hidden])'];

// The part of the map no control covers, as a rectangle in map pixels: the
// whole width, less a band across the top for whatever sits in the upper half
// and a band across the bottom for the lower half.
export function uncovered(map) {
  const box = map.getContainer().getBoundingClientRect();
  let top = 0;
  let bottom = box.height;
  for (const el of document.querySelectorAll(COVERS.join(','))) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= box.top || r.top >= box.bottom) continue;
    if ((r.top + r.bottom) / 2 - box.top < box.height / 2) top = Math.max(top, r.bottom - box.top);
    else bottom = Math.min(bottom, r.top - box.top);
  }
  return { x0: 0, y0: top, x1: box.width, y1: Math.max(top, bottom) };
}

// The layer: a copy of the one that draws the letters along the lines (same
// image, text, size and offset by zoom, same fade when a route is open), drawn
// whether or not it touches another symbol. It does not ignore placement, so
// the names placed after it keep clear of it.
export function edgeLetterLayer(letters) {
  return {
    ...letters,
    id: LAYER,
    source: LAYER,
    filter: ['==', ['get', 'kind'], 'letter'],
    layout: { ...letters.layout, 'icon-allow-overlap': true, 'text-allow-overlap': true },
  };
}

export function initEdgeLetters(map) {
  let pending = false;
  const later = () => {
    if (pending) return;
    pending = true;
    // The map is idle once the letters along the lines are placed for this
    // view, so what is missing can be told.
    map.once('idle', () => {
      pending = false;
      const source = map.getSource(LAYER);
      if (!source) return;
      source.setData({ type: 'FeatureCollection', features: placeEdgeLetters(map) });
    });
  };
  map.on('moveend', later);
  map.once('load', later);
  // A theme change re-colors the letters along the lines in place; this
  // layer follows.
  map.on('styledata', () => {
    if (!map.getLayer(LAYER) || !map.getLayer(LETTERS)) return;
    for (const name of ['text-color', 'icon-opacity', 'text-opacity']) {
      const now = map.getPaintProperty(LETTERS, name);
      if (JSON.stringify(now) !== JSON.stringify(map.getPaintProperty(LAYER, name))) map.setPaintProperty(LAYER, name, now);
    }
  });
}

// The letters to add: a feature for each rail line on screen with no letter
// drawn on it.
export function placeEdgeLetters(map) {
  const layer = map.getLayer(LETTERS);
  if (!layer || map.getZoom() < layer.minzoom) return [];
  const area = uncovered(map);
  const drawn = map.queryRenderedFeatures({ layers: [LETTERS] });
  const taken = drawn.map((f) => {
    const p = map.project(f.geometry.coordinates);
    return [p.x, p.y];
  });
  // A line is named if one of its letters is in the open part of the map.
  const named = new Set(drawn.filter((f, i) => within(taken[i], area)).map((f) => f.properties.route));
  // Where each unnamed line is on screen, as runs of points inside it.
  const runs = new Map();
  for (const f of map.queryRenderedFeatures({ layers: ['rail'] })) {
    const { route, slot, tier } = f.properties;
    if (named.has(route)) continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const part of parts) {
      for (const run of inside(part.map((c) => map.project(c)).map((p) => [p.x, p.y]), area)) {
        if (!runs.has(route)) runs.set(route, []);
        runs.get(route).push({ ...run, slot: slot ?? 0, tier });
      }
    }
  }
  // One letter per line, on its longest run, in a fixed order so lines
  // entering together on shared track stack the same way each time.
  const out = [];
  for (const route of [...runs.keys()].sort()) {
    const run = runs.get(route).reduce((a, b) => (b.length > a.length ? b : a));
    const at = spot(run, taken);
    taken.push(at.point);
    const [lng, lat] = map.unproject(at.point).toArray();
    // How far right and down the screen the line is drawn from its track's
    // middle, in line widths (as the build gives for the letters along it).
    const [dx, dy] = at.direction;
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      // `rank` 0: the layer shares `rail-bullets`' sort key, and null there is a warning.
      properties: { kind: 'letter', route, tier: run.tier, rank: 0, sx: Math.round(-run.slot * dy * 100) / 100, sy: Math.round(run.slot * dx * 100) / 100 },
    });
  }
  return out;
}

// The stretches of a polyline (screen points) inside the screen, each with
// its length and whether it begins and ends at the screen's edge.
function within([x, y], a) {
  return x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;
}

function inside(points, area) {
  const runs = [];
  let run = null;
  const close = (endsAtEdge) => {
    if (run && run.points.length > 1) {
      run.endsAtEdge = endsAtEdge;
      run.length = run.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - run.points[i][0], p[1] - run.points[i][1]), 0);
      runs.push(run);
    }
    run = null;
  };
  for (let i = 1; i < points.length; i++) {
    const clip = clipSegment(points[i - 1], points[i], area);
    if (!clip) {
      close(false);
      continue;
    }
    const [a, b, aCut, bCut] = clip;
    if (!run || aCut) {
      close(false);
      run = { points: [a], startsAtEdge: aCut };
    }
    run.points.push(b);
    if (bCut) close(true);
  }
  close(false);
  return runs;
}

// Liang-Barsky: the part of segment a-b inside the rectangle, and whether each
// end was moved to its edge.
function clipSegment(a, b, { x0, y0, x1, y1 }) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1], t0 > 0, t1 < 1];
}

// Where on a run the letter goes: INSET px in from the edge the run enters
// at, pushed further along while it is within APART px of another letter.
// A run that is short, or touches no edge, gets it in the middle.
function spot(run, taken) {
  const from = run.startsAtEdge ? 0 : run.endsAtEdge ? run.length : run.length / 2;
  const sign = run.startsAtEdge || !run.endsAtEdge ? 1 : -1;
  const first = run.startsAtEdge || run.endsAtEdge ? INSET : 0;
  const room = Math.max(0, (run.startsAtEdge || run.endsAtEdge ? run.length : run.length / 2) - 4);
  let best = null;
  for (let s = Math.min(first, room / 2); s <= Math.max(room, first); s += STEP) {
    const here = along(run.points, from + sign * s);
    const gap = Math.min(Infinity, ...taken.map((p) => Math.hypot(p[0] - here.point[0], p[1] - here.point[1])));
    if (!best || gap > best.gap) best = { ...here, gap };
    if (gap >= APART) return here;
  }
  return best;
}

// The point `s` px along a polyline from its start, and the way it is going
// there (a unit vector), clamped to its ends.
function along(points, s) {
  let left = Math.min(Math.max(s, 0), points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0));
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= d || i === points.length - 1) {
      const t = d ? Math.min(left / d, 1) : 0;
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], direction: d ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [1, 0] };
    }
    left -= d;
  }
}
