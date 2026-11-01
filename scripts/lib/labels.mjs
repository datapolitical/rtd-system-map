// Where the map names its lines from far out (DESIGN.md, "Name what you
// draw"): a sign at each end of each rail line, with its bullet and where
// trains to that end say they're going, and one number tag per frequent bus
// route, where that route runs alone so the tag can only mean one line.

// A bus route "runs alone" where no other frequent route or rail line is this
// close: about a tag's width at the opening view.
const ALONE_METERS = 1500;
const STEP_METERS = 150;
// Signs are placed for the opening view, about zoom 9: 120 m to a screen pixel.
const METERS_PER_PX = 120;
// Ends shared by more lines than this are a hub, named without bullets.
const HUB_LINES = 3;

// Each icon anchor, and which way the sign then extends from its point (x
// east, y north): anchored by its left edge, a sign sits to the east.
export const ANCHORS = {
  left: [1, 0],
  'top-left': [1, -1],
  top: [0, -1],
  'top-right': [-1, -1],
  right: [-1, 0],
  'bottom-right': [-1, 1],
  bottom: [0, 1],
  'bottom-left': [1, 1],
};

/**
 * `routes` are the route features as drawn (rail with `slot`), `stations` the
 * station features, `ends` each line's two end stations (indexes into
 * `stations`), and `headsigns` what trains to each of those ends show. Returns
 * `labels`, point features: kind "end" or "hub" (lines, name, anchor) and kind
 * "bus" (route, tier); and `signBoxes`, the area each sign covers at the
 * opening view, as polygons.
 */
export function labelPoints(routes, stations, ends, headsigns = {}) {
  const origin = stations[0].geometry.coordinates;
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky];

  const rail = routes.filter((f) => f.properties.mode === 'rail');
  const frequent = routes.filter((f) => f.properties.mode === 'bus' && f.properties.tier === 'frequent');
  const railPoints = rail.flatMap((f) => sample(partsOf(f.geometry).map((p) => p.map(project))));
  // Phones open on the stations, so signs at the network's edge face inward.
  const placed = stations.map((f) => project(f.geometry.coordinates));
  const bounds = [
    Math.min(...placed.map((p) => p[0])),
    Math.min(...placed.map((p) => p[1])),
    Math.max(...placed.map((p) => p[0])),
    Math.max(...placed.map((p) => p[1])),
  ];

  // Rail ends, grouped by station.
  const byStation = new Map();
  const names = new Map(); // station index -> destinations trains show
  for (const [line, indexes] of Object.entries(ends)) {
    if (!rail.some((f) => f.properties.route === line)) continue;
    indexes.forEach((i, k) => {
      (byStation.get(i) ?? byStation.set(i, []).get(i)).push(line);
      const name = headsigns[line]?.[k] && destination(headsigns[line][k], line, stations[i].properties.label);
      if (name) (names.get(i) ?? names.set(i, []).get(i)).push(name);
    });
  }
  // The hub first, then the rest, each on the clearest side of its station
  // that no sign placed before it covers; then each in turn moves to its
  // clearest side given where all the others went, until none moves.
  const order = [...byStation]
    .map(([i, lines]) => {
      const name = commonest(names.get(i) ?? []) ?? stations[i].properties.label;
      const hub = lines.length > HUB_LINES;
      return {
        station: stations[i],
        at: project(stations[i].geometry.coordinates),
        name,
        hub,
        lines: lines.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
        // The sign's size on screen, roughly: bullets, then the name, then
        // the room its shadow takes.
        width: (hub ? 0 : lines.length * 18 + 4) + name.length * 6.6 + 19,
      };
    })
    .sort((a, b) => b.lines.length - a.lines.length);
  const taken = [];
  for (const sign of order) {
    Object.assign(sign, clearestSide(sign.at, sign.width, 30, railPoints, bounds, taken));
    taken.push(sign.box);
  }
  for (let round = 0, moved = true; moved && round < 4; round++) {
    moved = false;
    for (const sign of order) {
      const best = clearestSide(sign.at, sign.width, 30, railPoints, bounds, order.filter((o) => o !== sign).map((o) => o.box));
      if (best.anchor !== sign.anchor) moved = true;
      Object.assign(sign, best);
    }
  }
  const signs = order.map(({ station, name, hub, lines, anchor }) => ({
    type: 'Feature',
    geometry: station.geometry,
    properties: { kind: hub ? 'hub' : 'end', lines: lines.join(' '), name, anchor },
  }));
  // Where the signs reach at the opening view, so phones can open on them.
  const signBoxes = order.map(({ box: [w, s, e, n] }) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]].map((p) => unproject(p, origin, kx, ky))] },
    properties: {},
  }));

  // One tag per frequent route, mid-way along its longest stretch alone.
  // Rail counts several times over: a number knocked out of a train line
  // reads as that line's.
  const others = (route) => [
    ...railPoints,
    ...railPoints,
    ...railPoints,
    ...frequent.filter((f) => f.properties.route !== route).flatMap((f) => sample(partsOf(f.geometry).map((p) => p.map(project)))),
  ];
  const grid = (points) => {
    const g = new Map();
    for (const p of points) {
      const key = `${Math.floor(p[0] / ALONE_METERS)},${Math.floor(p[1] / ALONE_METERS)}`;
      (g.get(key) ?? g.set(key, []).get(key)).push(p);
    }
    return g;
  };
  const near = (g, p) => {
    const [cx, cy] = [Math.floor(p[0] / ALONE_METERS), Math.floor(p[1] / ALONE_METERS)];
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of g.get(`${cx + dx},${cy + dy}`) ?? []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < ALONE_METERS) n++;
      }
    }
    return n;
  };
  const tags = frequent.map((f) => {
    const g = grid(others(f.properties.route));
    let best = null;
    for (const part of partsOf(f.geometry)) {
      const pts = sample([part.map(project)]);
      const crowd = pts.map((p) => near(g, p));
      // Runs of the least crowded points; the longest wins.
      const least = Math.min(...crowd);
      let start = 0;
      for (let i = 0; i <= pts.length; i++) {
        if (i < pts.length && crowd[i] === least) continue;
        const length = i - start;
        if (length && (!best || least < best.least || (least === best.least && length > best.length))) {
          best = { least, length, at: pts[Math.floor((start + i - 1) / 2)] };
        }
        start = i + 1;
      }
    }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: unproject(best.at, origin, kx, ky) },
      properties: { kind: 'bus', route: f.properties.route, tier: f.properties.tier },
    };
  });

  return { labels: [...signs, ...tags], signBoxes };
}

// The side of a point where a sign of this size covers the least rail, no
// sign in `taken`, and stays inside `bounds`.
function clearestSide(at, width, height, railPoints, bounds, taken) {
  const w = width * METERS_PER_PX;
  const h = height * METERS_PER_PX;
  const gap = 3 * METERS_PER_PX;
  let best = null;
  for (const [anchor, [sx, sy]] of Object.entries(ANCHORS)) {
    const cx = at[0] + sx * (w / 2 + gap);
    const cy = at[1] + sy * (h / 2 + gap);
    const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const covered = railPoints.filter(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]).length;
    const outside = Math.max(0, bounds[0] - box[0]) + Math.max(0, box[2] - bounds[2]);
    const overlaps = taken.filter((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]).length;
    // Level signs read best: prefer left and right, then the corners.
    // Phones open on the signs too, so one past the network's edge costs
    // only a little zoom: a pixel of that is worth a rail point covered.
    const cost = covered + outside / METERS_PER_PX + overlaps * 1000 + (sy ? 0.5 : 0) + (sx ? 0 : 0.5);
    if (!best || cost < best.cost) best = { anchor, box, cost };
  }
  return best;
}

// A headsign without the line it's on ("E-Line RidgeGate", "Train to Alameda
// Station"): the sign's bullets already say that. One that names the station
// in full is just the station's label ("Union Station", "Peoria").
export function destination(headsign, line, label) {
  if (headsign.toLowerCase().includes(label.toLowerCase())) return label;
  const name = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return headsign
    .replace(new RegExp(`^(${name}[- ]?line|train)\\b\\s*`, 'i'), '')
    .replace(/^to\s+/i, '')
    .replace(/\s+station$/i, '')
    .replace(/\s+-\s+/g, ' – ')
    .trim();
}

// The most common name, the shortest of those tied; null for none.
function commonest(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null;
}

function sample(parts) {
  const out = [];
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const [a, b] = [part[i - 1], part[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP_METERS));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    out.push(part.at(-1));
  }
  return out;
}

const unproject = ([x, y], origin, kx, ky) => [
  Math.round((x / kx + origin[0]) * 1e5) / 1e5,
  Math.round((y / ky + origin[1]) * 1e5) / 1e5,
];

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
