// Where the map names its lines from far out (DESIGN.md, "Name what you
// draw"): a sign at each end of each rail line, with its bullet and where
// trains to that end say they're going, and one number tag per frequent bus
// route, where that route runs alone so the tag can only mean one line.

// A bus route "runs alone" where no other frequent route or rail line is this
// close: about a tag's width at the opening view.
const ALONE_METERS = 1500;
const STEP_METERS = 150;
// Signs are placed for the opening view on a phone, about 150 m to a pixel
// of sign. They're kept apart from the smallest phones' opening, about 175 m,
// in to where they give way, about 8 m, because two signs facing each other
// can clear at one scale and meet at another.
const METERS_PER_PX = 150;
const SCALES = [175, 150, 110, 80, 60, 44, 32, 24, 18, 13, 10, 8];
// Room kept between two signs, in pixels.
const SIGN_GAP = 4;
// What a sign meeting another costs, against a rail point covered.
const CLASH = 1000;
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
 * `stations`), `headsigns` what trains to each of those ends show, and
 * `frame` the [[west, south], [east, north]] wider screens open on. Returns
 * `labels`, point features: kind "end" or "hub" (lines, name, anchor) and kind
 * "bus" (route, tier); and `signBoxes`, the area each sign covers at the
 * opening view, as polygons.
 */
export function labelPoints(routes, stations, ends, headsigns = {}, frame = null) {
  const origin = stations[0].geometry.coordinates;
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky];

  const rail = routes.filter((f) => f.properties.mode === 'rail');
  const frequent = routes.filter((f) => f.properties.mode === 'bus' && f.properties.tier === 'frequent');
  const railPoints = rail.flatMap((f) => sample(partsOf(f.geometry).map((p) => p.map(project))));
  // Phones open on the stations and are narrow, so signs at the network's
  // sides face inward; wider screens are short, so signs stay inside the
  // frame they open on, above and below.
  const placed = stations.map((f) => project(f.geometry.coordinates));
  const [south, north] = frame ? [project(frame[0])[1], project(frame[1])[1]] : [Math.min(...placed.map((p) => p[1])), Math.max(...placed.map((p) => p[1]))];
  const bounds = [Math.min(...placed.map((p) => p[0])), south, Math.max(...placed.map((p) => p[0])), north];

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
  // Each sign on its station's clearest side, where no two signs meet.
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
  const options = order.map((sign) => sides(sign.at, sign.width, 30, railPoints, bounds));
  const picks = arrange(options);
  order.forEach((sign, k) => Object.assign(sign, options[k][picks[k]]));
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
  // reads as that line's. Tags are placed one at a time, the routes that run
  // most alone first, each clear of the signs and the tags before it; `rank`
  // keeps that order on screen, so where there's no room, the route left
  // without a number is one that shares its street with another.
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
  // A tag is hidden under a sign or a tag placed before it. Each opening
  // view it would be hidden in, on a phone, a large phone and a desktop,
  // costs a share of a clash, so a tag that can't clear them all on a phone
  // is at least seen on wider screens. Views are in meters to a pixel of
  // text, and to a pixel of sign, which is drawn smaller from far out.
  const VIEWS = [
    [175, 150],
    [115, 110],
    [90, 80],
  ];
  const tagged = []; // [x, y, half width, half height in pixels]
  const hidden = ([x, y], hw, hh) => {
    let views = 0;
    for (const [m, sm] of VIEWS) {
      const k = SCALES.indexOf(sm);
      const covered = (w, s, e, n) => x > w - hw * m && x < e + hw * m && y > s - hh * m && y < n + hh * m;
      if (
        order.some(({ boxes }) => covered(...boxes[k])) ||
        tagged.some(([tx, ty, tw, th]) => covered(tx - tw * m, ty - th * m, tx + tw * m, ty + th * m))
      ) {
        views++;
      }
    }
    return (views * CLASH) / VIEWS.length;
  };
  const candidates = frequent
    .map((f) => {
      const g = grid(others(f.properties.route));
      const parts = partsOf(f.geometry).map((part) => {
        const pts = sample([part.map(project)]);
        return { pts, alone: pts.map((p) => near(g, p)) };
      });
      return { f, parts, alone: Math.min(...parts.flatMap((p) => p.alone)) };
    })
    .sort((a, b) => a.alone - b.alone);
  const tags = candidates.map(({ f, parts }, rank) => {
    // Half a tag, in pixels: about 6 for each character, and its halo.
    const [hw, hh] = [(f.properties.route.length * 6 + 8) / 2, 8];
    let best = null;
    for (const { pts, alone } of parts) {
      const crowd = alone.map((n, i) => n + hidden(pts[i], hw, hh));
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
    tagged.push([...best.at, hw, hh]);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: unproject(best.at, origin, kx, ky) },
      properties: { kind: 'bus', route: f.properties.route, tier: f.properties.tier, rank },
    };
  });

  return { labels: [...signs, ...tags], signBoxes };
}

// Each side of a point a sign of this size can take, with the box it covers
// at each of SCALES and its cost at the opening view: the rail it covers and
// how far it reaches past `bounds`.
function sides(at, width, height, railPoints, bounds) {
  return Object.entries(ANCHORS).map(([anchor, [sx, sy]]) => {
    const boxes = SCALES.map((m) => {
      const [w, h, gap] = [width * m, height * m, 3 * m];
      const cx = at[0] + sx * (w / 2 + gap);
      const cy = at[1] + sy * (h / 2 + gap);
      return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    });
    const box = boxes[SCALES.indexOf(METERS_PER_PX)];
    const covered = railPoints.filter(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]).length;
    const outside =
      Math.max(0, bounds[0] - box[0]) + Math.max(0, box[2] - bounds[2]) + Math.max(0, bounds[1] - box[1]) + Math.max(0, box[3] - bounds[3]);
    // Level signs read best: prefer left and right, then the corners. One
    // past the edge costs the opening view a little zoom: a pixel of that is
    // worth a rail point covered.
    const cost = covered + outside / METERS_PER_PX + (sy ? 0.5 : 0) + (sx ? 0 : 0.5);
    return { anchor, box, boxes, cost };
  });
}

// Whether two signs' boxes meet at any scale, with SIGN_GAP between them.
function clash(a, b) {
  return a.boxes.some((p, k) => {
    const q = b.boxes[k];
    const gap = SIGN_GAP * SCALES[k];
    return p[0] < q[2] + gap && p[2] + gap > q[0] && p[1] < q[3] + gap && p[3] + gap > q[1];
  });
}

// The side for each sign that costs least in all, each clash costing CLASH:
// branch and bound over the signs in order, bounding each unplaced sign by
// its cheapest side.
function arrange(options) {
  const cheapest = options.map((o) => Math.min(...o.map((x) => x.cost)));
  const rest = cheapest.map((_, i) => cheapest.slice(i).reduce((a, b) => a + b, 0));
  const tried = options.map((o) => o.map((_, k) => k).sort((a, b) => o[a].cost - o[b].cost));
  let best = { cost: Infinity, picks: [] };
  const picks = [];
  const visit = (i, cost) => {
    if (cost + (rest[i] ?? 0) >= best.cost) return;
    if (i === options.length) return void (best = { cost, picks: [...picks] });
    for (const k of tried[i]) {
      let c = cost + options[i][k].cost;
      for (let j = 0; j < i; j++) if (clash(options[j][picks[j]], options[i][k])) c += CLASH;
      picks[i] = k;
      visit(i + 1, c);
    }
  };
  visit(0, 0);
  return best.picks;
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
