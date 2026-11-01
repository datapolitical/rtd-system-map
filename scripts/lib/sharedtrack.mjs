// Rail lines that share track are drawn side by side rather than on top of
// each other (DESIGN.md, "Shared track"). RTD's map draws each line on its own,
// so shared track is found here by distance: where another line runs within a
// few meters, the two share track. Each line is cut into pieces wherever the
// set of lines it shares with changes, and each piece gets a `slot`: how many
// line widths to the side of the shared centerline it is drawn, which the map
// turns into a `line-offset`.

// Lines this close are on the same track (RTD's lines run 0 to 15 m apart).
const SHARED_METERS = 20;
// Points are compared this often along each line.
const STEP_METERS = 20;
// Shorter changes are noise (a station's platform tracks, a crossing).
const MIN_RUN_METERS = 200;
// How far past the end of a shared piece to look to see which way a line goes.
const LOOK_METERS = 1200;
// A line's end station is at most this far from its track.
const TRIM_METERS = 300;
// A path that doubles back over less than this is a kink in the data.
const SPIKE_METERS = 100;

/**
 * `features` are rail line features ({ route } in properties). Returns new
 * features: each line in pieces, with `slot` in properties (0 where it runs
 * alone), and pieces on shared track all pointing the same way, since a line's
 * offset is to the right of the direction it's drawn in.
 */
export function sharedTrack(features) {
  const origin = centerOf(features);
  const project = ([lon, lat]) => [(lon - origin[0]) * origin.kx, (lat - origin[1]) * origin.ky];
  const unproject = ([x, y]) => [round(x / origin.kx + origin[0]), round(y / origin.ky + origin[1])];

  const lines = features.map((f) => ({
    feature: f,
    route: f.properties.route,
    parts: joinParts(ownTrack(partsOf(f.geometry).map((part) => densify(despike(part.map(project)))))),
  }));

  // A grid of every line's segments, to find nearby lines quickly.
  const grid = new Map();
  const cell = (x, y) => `${Math.floor(x / 100)},${Math.floor(y / 100)}`;
  for (const line of lines) {
    for (const part of line.parts) {
      for (let i = 1; i < part.length; i++) {
        const [a, b] = [part[i - 1], part[i]];
        const keys = new Set([cell(...a), cell(...b)]);
        for (const key of keys) (grid.get(key) ?? grid.set(key, []).get(key)).push({ route: line.route, a, b });
      }
    }
  }
  const sharing = (route, p) => {
    const found = new Set([route]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const [cx, cy] = cell(...p).split(',').map(Number);
        for (const s of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (!found.has(s.route) && segmentDistance(p, s.a, s.b) <= SHARED_METERS) found.add(s.route);
        }
      }
    }
    return [...found].sort().join(' ');
  };

  // Each part becomes runs of points that share with the same lines.
  const runs = [];
  for (const line of lines) {
    for (const part of line.parts) {
      const sets = part.map((p) => sharing(line.route, p));
      for (const run of smooth(runsOf(part, sets))) runs.push({ ...run, line });
    }
  }

  // Shared pieces all point the same way, so offsets land on the same side.
  for (const run of runs) {
    if (run.set.includes(' ') && !forward(run.points)) run.points.reverse();
  }

  // The same lines can share track in more than one place; each place is
  // ordered on its own. A place is the runs of one set that touch.
  const places = [];
  for (const run of runs) {
    if (!run.set.includes(' ')) continue;
    const touching = places.filter((pl) => pl.set === run.set && pl.runs.some((r) => near(r.points, run.points)));
    const place = touching[0] ?? { set: run.set, runs: [] };
    if (!touching.length) places.push(place);
    for (const other of touching.slice(1)) {
      place.runs.push(...other.runs);
      places.splice(places.indexOf(other), 1);
    }
    place.runs.push(run);
  }

  // Lines take the side they leave the shared track toward, so lines don't
  // cross where they part: past each end of the place, which side of it each
  // line's track goes, then left to right. Lines that go on together into a
  // bigger place keep the order they have there, so they don't cross where a
  // line joins or leaves them; bigger places are ordered first.
  const size = (pl) => [pl.set.split(' ').length, Math.max(...pl.runs.map((r) => length(r.points)))];
  places.sort((a, b) => size(b)[0] - size(a)[0] || size(b)[1] - size(a)[1]);
  const ordered = [];
  for (const place of places) {
    const corridor = place.runs.reduce((a, b) => (length(b.points) > length(a.points) ? b : a)).points;
    const score = new Map(place.set.split(' ').map((route) => [route, sideScore(lines.find((l) => l.route === route), corridor)]));
    place.order = [...score].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([route]) => route);
    const next = ordered.find(
      (pl) => pl.order.filter((r) => score.has(r)).length > 1 && pl.runs.some((r) => place.runs.some((q) => near(q.points, r.points))),
    );
    if (next) {
      const together = next.order.filter((r) => score.has(r));
      let k = 0;
      place.order = place.order.map((r) => (together.includes(r) ? together[k++] : r));
    }
    for (const run of place.runs) run.place = place;
    ordered.push(place);
  }

  return runs.map((run) => {
    const members = run.place?.order;
    const slot = members ? members.indexOf(run.line.route) - (members.length - 1) / 2 : 0;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: simplifyCollinear(run.points).map(unproject) },
      properties: { ...run.line.feature.properties, slot },
    };
  });
}

// Which side of a shared corridor a line's track runs on just past its ends:
// positive is right of the corridor's direction, negative left. A line that
// runs both ways past an end (a spur, say) scores near zero there.
function sideScore(line, corridor) {
  let score = 0;
  const ends = [
    { at: corridor.at(-1), dir: direction(corridor, true), out: 1 },
    { at: corridor[0], dir: direction(corridor, false), out: -1 },
  ];
  for (const { at, dir, out } of ends) {
    let sum = 0;
    let n = 0;
    for (const part of line.parts) {
      for (const p of part) {
        const v = [p[0] - at[0], p[1] - at[1]];
        const d = Math.hypot(...v);
        // Past this end, off the shared track.
        if (d < SHARED_METERS * 2 || d > LOOK_METERS || (v[0] * dir[0] + v[1] * dir[1]) * out <= 0) continue;
        // Cross product: positive when the point is to the left.
        sum += (dir[0] * v[1] - dir[1] * v[0]) / d;
        n++;
      }
    }
    if (n) score -= sum / n;
  }
  return score;
}

// Whether two runs come within shared-track distance of each other.
function near(a, b) {
  for (let i = 0; i < a.length; i += 5) {
    for (let j = 1; j < b.length; j++) if (segmentDistance(a[i], b[j - 1], b[j]) <= SHARED_METERS) return true;
  }
  return false;
}

// Shapes can double back for a few meters at a stop or a switch; offset lines
// turn that into a spike. Drop any point where the path reverses over a short
// step.
function despike(points) {
  let out = points;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
      const [u, v] = [[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]];
      const [lu, lv] = [Math.hypot(...u), Math.hypot(...v)];
      // Turned back by more than 120 degrees: track can't.
      if ((u[0] * v[0] + u[1] * v[1]) / (lu * lv || 1) < -0.5 && Math.min(lu, lv) < SPIKE_METERS) {
        out = [...out.slice(0, i), ...out.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return out;
}

// A line's track once: GTFS gives a path per direction, mostly on the same
// track. The longest path is kept whole; the others only where they go
// somewhere it doesn't, joined onto it where they leave it.
function ownTrack(parts) {
  const kept = [];
  for (const part of [...parts].sort((a, b) => length(b) - length(a))) {
    const segments = kept.flatMap((k) => k.slice(1).map((b, i) => [k[i], b]));
    const onKept = (p) => segments.some(([a, b]) => segmentDistance(p, a, b) <= SHARED_METERS);
    const off = part.map((p) => !onKept(p));
    for (let i = 0; i < part.length; i++) {
      if (!off[i]) continue;
      let j = i;
      while (j < part.length && off[j]) j++;
      const stretch = part.slice(Math.max(0, i - 1), Math.min(part.length, j + 1));
      if (!kept.length || length(stretch) >= MIN_RUN_METERS) kept.push(stretch);
      i = j;
    }
  }
  return kept;
}

// RTD's map draws some lines in many pieces; pieces that meet end to end
// become one, where no third piece meets them, so runs aren't cut short.
function joinParts(parts) {
  const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
  const out = parts.map((p) => [...p]);
  for (let merged = true; merged; ) {
    merged = false;
    const ends = new Map();
    out.forEach((p, i) => {
      for (const k of [key(p[0]), key(p.at(-1))]) (ends.get(k) ?? ends.set(k, []).get(k)).push(i);
    });
    for (const [, at] of ends) {
      if (at.length !== 2 || at[0] === at[1]) continue;
      const [a, b] = at.map((i) => out[i]);
      const k = [...ends].find(([, v]) => v === at)[0];
      const first = key(a.at(-1)) === k ? a : [...a].reverse();
      const second = key(b[0]) === k ? b : [...b].reverse();
      // A line's two directions meet at its ends; never fold them together.
      const [p, q, r] = [first.at(-2) ?? first[0], first.at(-1), second[1] ?? second[0]];
      if ((q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]) < 0) {
        ends.delete(k);
        continue;
      }
      out[at[0]] = [...first, ...second.slice(1)];
      out.splice(at[1], 1);
      merged = true;
      break;
    }
  }
  return out;
}

function pointAlong(points, meters) {
  let left = meters;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (d >= left) {
      const t = left / d;
      return [points[i - 1][0] + t * (points[i][0] - points[i - 1][0]), points[i - 1][1] + t * (points[i][1] - points[i - 1][1])];
    }
    left -= d;
  }
  return points.at(-1);
}

/**
 * The track at a station `point` ([lon, lat]), from the pieces `sharedTrack`
 * returned: how many lines run side by side there, and the track's bearing
 * (degrees clockwise from north), so the station's mark can span the lines.
 */
export function trackAt(pieces, point) {
  const kx = 111320 * Math.cos((point[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - point[0]) * kx, (lat - point[1]) * ky];
  let best = null;
  for (const piece of pieces) {
    const pts = piece.geometry.coordinates.map(project);
    for (let i = 1; i < pts.length; i++) {
      const d = segmentDistance([0, 0], pts[i - 1], pts[i]);
      if (d > SHARED_METERS) continue;
      const slot = Math.abs(piece.properties.slot);
      // The widest track here, and the nearest piece of it.
      if (!best || slot > best.slot || (slot === best.slot && d < best.d)) {
        const [dx, dy] = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
        best = { slot, d, bearing: Math.round((Math.atan2(dx, dy) * 180) / Math.PI) };
      }
    }
  }
  // Slots run from -(n - 1) / 2 to (n - 1) / 2.
  return best ? { span: best.slot * 2 + 1, bearing: best.bearing } : { span: 1, bearing: 0 };
}

/**
 * Cut track that runs on past a line's end station (tail track trains pull
 * into to turn back): each path is split where it passes closest to each end
 * station, and only the longer side kept. `paths` are [[lon, lat], ...].
 */
export function trimToEnds(paths, ends) {
  return paths.map((path) => {
    let out = path;
    for (const end of ends) {
      const at = closestOn(out, end);
      if (!at || at.meters > TRIM_METERS) continue;
      const before = [...out.slice(0, at.index), at.point];
      const after = [at.point, ...out.slice(at.index)];
      out = metersAlong(before) >= metersAlong(after) ? before : after;
    }
    return out;
  });
}

/**
 * The nearest point on the track to `point` ([lon, lat]), among the pieces
 * `sharedTrack` returned, or null if none is within `maxMeters`.
 */
export function nearestOnTrack(pieces, point, maxMeters) {
  let best = null;
  for (const piece of pieces) {
    const at = closestOn(piece.geometry.coordinates, point);
    if (at && at.meters <= maxMeters && (!best || at.meters < best.meters)) best = at;
  }
  return best && best.point.map(round);
}

// Where a [lon, lat] path passes closest to a point: the point, its distance,
// and the index of the vertex after it.
function closestOn(path, point) {
  const kx = 111320 * Math.cos((point[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - point[0]) * kx, (lat - point[1]) * ky];
  let best = null;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [project(path[i - 1]), project(path[i])];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / l)) : 0;
    const [x, y] = [a[0] + t * dx, a[1] + t * dy];
    const meters = Math.hypot(x, y);
    if (!best || meters < best.meters) best = { meters, index: i, point: [x / kx + point[0], y / ky + point[1]] };
  }
  return best;
}

function metersAlong(path) {
  const k = 111320 * Math.cos((path[0][1] * Math.PI) / 180);
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot((path[i][0] - path[i - 1][0]) * k, (path[i][1] - path[i - 1][1]) * 110540);
  return d;
}

// The unit direction at the end (or start) of a piece, over its last 200 m.
function direction(points, atEnd) {
  const pts = atEnd ? points : [...points].reverse();
  const end = pts.at(-1);
  const back = pointAlong([...pts].reverse(), 200);
  const v = atEnd ? [end[0] - back[0], end[1] - back[1]] : [back[0] - end[0], back[1] - end[1]];
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len];
}

// A piece points "forward" if it heads east, or north when it runs more
// north-south than east-west.
function forward(points) {
  const [dx, dy] = [points.at(-1)[0] - points[0][0], points.at(-1)[1] - points[0][1]];
  return Math.abs(dx) >= Math.abs(dy) ? dx > 0 : dy > 0;
}

function runsOf(points, sets) {
  const runs = [];
  for (let i = 0; i < points.length; i++) {
    const last = runs.at(-1);
    if (last && last.set === sets[i]) last.points.push(points[i]);
    else {
      // Each run starts where the last ended, so the pieces join up.
      runs.push({ set: sets[i], points: last ? [last.points.at(-1), points[i]] : [points[i]] });
    }
  }
  return runs;
}

// Merge runs too short to be real into a neighbor, shortest first.
function smooth(runs) {
  for (;;) {
    let shortest = -1;
    for (let i = 0; i < runs.length; i++) {
      if (runs.length > 1 && length(runs[i].points) < MIN_RUN_METERS && (shortest < 0 || length(runs[i].points) < length(runs[shortest].points))) {
        shortest = i;
      }
    }
    if (shortest < 0) break;
    const run = runs[shortest];
    const prev = runs[shortest - 1];
    const next = runs[shortest + 1];
    // Into the longer neighbor, which takes its points.
    const into = !next || (prev && length(prev.points) >= length(next.points)) ? prev : next;
    if (into === prev) prev.points.push(...run.points.slice(1));
    else next.points.unshift(...run.points.slice(0, -1));
    runs.splice(shortest, 1);
    // Neighbors with the same lines become one run.
    for (let i = runs.length - 1; i > 0; i--) {
      if (runs[i].set === runs[i - 1].set) {
        runs[i - 1].points.push(...runs[i].points.slice(1));
        runs.splice(i, 1);
      }
    }
  }
  return runs;
}

function densify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP_METERS));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// Drop the points densify added back out where the line is straight.
function simplifyCollinear(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [out.at(-1), points[i], points[i + 1]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1) > 0.5) out.push(b);
  }
  out.push(points.at(-1));
  return out;
}

function length(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return d;
}

function segmentDistance(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
const round = (v) => Math.round(v * 1e5) / 1e5;

function centerOf(features) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    for (const part of partsOf(f.geometry)) {
      for (const [x, y] of part) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    }
  }
  const center = [(w + e) / 2, (s + n) / 2];
  center.kx = 111320 * Math.cos((center[1] * Math.PI) / 180);
  center.ky = 110540;
  return center;
}
