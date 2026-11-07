// Rail lines that share track are drawn side by side rather than on top of
// each other (DESIGN.md, "Shared track"). RTD's map draws each line on its own,
// so shared track is found here by distance: where another line runs within a
// few meters, the two share track. Each line is cut into pieces wherever the
// set of lines it shares with changes, and each piece gets a `slot`: how many
// line widths to the side of the shared centerline it is drawn, which the map
// turns into a `line-offset`. The pieces are not RTD's exact paths: lines
// sharing track are moved onto the middle of their tracks, and every line is
// rounded, so the map looks drawn on purpose (DESIGN.md, "It looks
// designed").

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
// A path that turns around and comes back this close to itself is retracing
// its steps.
const RETRACE_METERS = 5;
// Where a line leaves others it shared track with, it eases from its slot
// beside them to its slot without them: done once they are this far away, or
// this far along at the latest, and in steps of this part of a line's width.
const APART_METERS = 250;
const EASE_METERS = 1500;
const EASE_STEP = 1 / 16;
// Lines whose ends are this close, and run within 20 degrees of the same
// way, end at the same station: their ends are drawn level (see flushEnds).
const FLUSH_METERS = 150;
const FLUSH_COS = Math.cos((20 * Math.PI) / 180);
// Lines sharing track are drawn as one pack, on the middle of their tracks
// (see packed). A line counts in full toward that middle while it is within
// SHARED_METERS of another line of the pack, and less and less over this
// much further. Where a line joins or leaves a pack it swings between its
// own track and the pack's middle over BLEND_METERS.
const PACK_FADE_METERS = 20;
const BLEND_METERS = 300;
// A line's path is rounded over this far either side of each point, sampled
// this many times each side (see rounded).
const ROUND_METERS = 60;
const ROUND_STEPS = 12;
// A station's point can be this far from its track (build-data.mjs snaps it
// on). A station's mark is drawn on the track, so a line is eased before it
// gets there: this far short of it, unless the station is this near the
// start, where the line hasn't moved yet.
const STATION_METERS = 200;
const STATION_CLEAR_METERS = 100;
// Letters along the lines: a set for each whole zoom from the first to the
// last of these. The map shows a set across its whole zoom (a filter sees
// the zoom as a whole number, so it can't change sets any finer), and
// screen spacing doubles across it. LETTER_PX is the spacing, in pixels, at
// the middle of that range; at its two ends the same letters are 0.7 and 1.4
// times as far apart (270 and 540 px). So a line has a letter at least once
// per phone screen (the screen is 844 px tall, 390 wide, and a line crossing
// it is mostly 500 px or more of it) wherever in the zoom it is looked at,
// and two letters of one line are never much closer than a third of a screen
// (DESIGN.md, "Rail bullets"). (The map shows letters from a little before
// the first zoom; they sit closer there.)
const LETTER_ZOOMS = [10, 16];
const LETTER_PX = 380;
// A letter sits this far past a fork, where a line leaves others; a stretch
// shorter than LETTER_MIN_PX gets none of its own; a letter may move this
// far along its line to sit clear of stations and other letters.
const LETTER_FORK_PX = 90;
const LETTER_MIN_PX = 60;
// On shared track a line's second letter is not placed this near (at the
// middle of the zoom) its first: in a knot of short stretches that was a
// second B beside the first, and another line's first letter left out.
const LETTER_SAME_PX = 110;
const LETTER_SLACK_PX = 60;
// Two letters closer than this many pixels can touch; so can a letter and a
// station's mark this close.
const LETTER_CLEAR_PX = 28;
const STATION_CLEAR_PX = 16;

/**
 * `features` are rail line features ({ route } in properties). Returns
 * `pieces`, new features: each line in pieces, with `slot` in properties (0
 * where it runs alone), and pieces on shared track all pointing the same
 * way, since a line's offset is to the right of the direction it's drawn in;
 * and `letters`, point features (kind "letter", route, tier, from, to, sx,
 * sy): where each line carries its letter between two zooms, on the track's
 * middle, and how many line widths across and down the line is from there.
 * `stations` are [lon, lat] points no line is eased past, and letters keep
 * off.
 */
export function sharedTrack(features, stations = []) {
  const origin = centerOf(features);
  const project = ([lon, lat]) => [(lon - origin[0]) * origin.kx, (lat - origin[1]) * origin.ky];
  const unproject = ([x, y]) => [round(x / origin.kx + origin[0]), round(y / origin.ky + origin[1])];

  const lines = features.map((f) => ({
    feature: f,
    route: f.properties.route,
    parts: joinParts(ownTrack(partsOf(f.geometry).map((part) => densify(despike(part.map(project)))))),
  }));
  flushEnds(lines);

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
  // The lines on the same track as `route` at p: those within SHARED_METERS,
  // and those within it of them in turn. Three lines on tracks side by side
  // are then one bundle to each of them, though the outer two are further
  // apart; otherwise each would be placed in a different bundle and two of
  // them drawn in the same slot.
  const sharing = (route, p) => {
    const found = new Set([route]);
    const from = [p];
    for (const at of from) {
      const [cx, cy] = cell(...at).split(',').map(Number);
      const nearest = new Map();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const s of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (found.has(s.route)) continue;
            const q = closestOnSegment(at, s.a, s.b);
            const d = Math.hypot(q[0] - at[0], q[1] - at[1]);
            if (d <= SHARED_METERS && !(nearest.get(s.route)?.d <= d)) nearest.set(s.route, { d, q });
          }
        }
      }
      for (const [other, { q }] of nearest) {
        found.add(other);
        from.push(q);
      }
    }
    return [...found].sort().join(' ');
  };
  // How far a point is from the nearest of some lines, as far as APART_METERS.
  const reach = Math.ceil(APART_METERS / 100);
  const apart = (routes, p) => {
    let best = Infinity;
    const [cx, cy] = cell(...p).split(',').map(Number);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (const s of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (routes.has(s.route)) best = Math.min(best, segmentDistance(p, s.a, s.b));
        }
      }
    }
    return best;
  };

  // Each part becomes runs of points that share with the same lines. A run
  // knows the runs before and after it along its line.
  const runs = [];
  for (const line of lines) {
    for (const part of line.parts) {
      const sets = part.map((p) => sharing(line.route, p));
      const inPart = smooth(runsOf(part, sets)).map((run) => ({ ...run, line, part, flipped: false }));
      inPart.forEach((run, i) => Object.assign(run, { before: inPart[i - 1], after: inPart[i + 1] }));
      runs.push(...inPart);
    }
  }

  // Shared pieces all point the same way, so offsets land on the same side.
  for (const run of runs) {
    if (run.set.includes(' ') && !forward(run.points)) {
      run.points.reverse();
      run.flipped = true;
    }
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
  // cross where they part: past each end of a place, which side of it each
  // line's track goes (`score`, lower is further left).
  for (const place of places) {
    place.routes = place.set.split(' ');
    const corridor = place.runs.reduce((a, b) => (length(b.points) > length(a.points) ? b : a)).points;
    const way = (points) => [points.at(-1)[0] - points[0][0], points.at(-1)[1] - points[0][1]];
    for (const run of place.runs) {
      // All of a place's runs point the way its longest does.
      if (way(run.points)[0] * way(corridor)[0] + way(run.points)[1] * way(corridor)[1] < 0) {
        run.points.reverse();
        run.flipped = !run.flipped;
      }
      run.place = place;
    }
    place.score = new Map(place.routes.map((route) => [route, sideScore(lines.find((l) => l.route === route), corridor)]));
    place.left = new Map();
  }
  // Two lines that go on together from one place into the next say nothing
  // there about which is left of the other. So each pair of lines is ordered
  // once for all the places it runs through in a row, on what all of them
  // say together, and doesn't swap sides on the way. `links`: the places a
  // line runs straight on into, and whether both point the same way along it.
  const links = new Map(places.map((place) => [place, []]));
  for (const run of runs) {
    const [a, b] = [run.place, run.after?.place];
    if (!a || !b || a === b) continue;
    const same = run.flipped === run.after.flipped;
    links.get(a).push({ to: b, same });
    links.get(b).push({ to: a, same });
  }
  for (const start of places) {
    for (const [i, x] of start.routes.entries()) {
      for (const y of start.routes.slice(i + 1)) {
        if (start.left.has(`${x} ${y}`)) continue;
        // 1 where a place points the way `start` does, -1 where it's turned
        // around and left is right.
        const sense = new Map([[start, 1]]);
        let sum = 0;
        for (const place of sense.keys()) {
          sum += sense.get(place) * (place.score.get(y) - place.score.get(x));
          for (const { to, same } of links.get(place)) {
            if (!sense.has(to) && to.score.has(x) && to.score.has(y)) sense.set(to, same ? sense.get(place) : -sense.get(place));
          }
        }
        for (const [place, s] of sense) place.left.set(`${x} ${y}`, sum >= 0 === s > 0);
      }
    }
  }
  for (const place of places) {
    const leftOf = (x, y) => (x < y ? place.left.get(`${x} ${y}`) : !place.left.get(`${y} ${x}`));
    const rank = (x) => place.routes.filter((y) => y !== x && leftOf(y, x)).length;
    place.order = [...place.routes].sort((a, b) => rank(a) - rank(b) || place.score.get(a) - place.score.get(b) || a.localeCompare(b));
  }

  for (const run of runs) {
    const members = run.place?.order;
    run.slot = members ? members.indexOf(run.line.route) - (members.length - 1) / 2 : 0;
  }
  // The nearest point of a line's track to p, and how far it is (within
  // 100 m).
  const onLine = (route, p) => {
    const [cx, cy] = cell(...p).split(',').map(Number);
    let best = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const s of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (s.route !== route) continue;
          const q = closestOnSegment(p, s.a, s.b);
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (!best || d < best.d) best = { q, d };
        }
      }
    }
    return best;
  };
  packed(runs, onLine);
  rounded(runs);
  const marks = stations.map(project);
  for (const run of runs) run.slots = eased(run, apart, marks);
  const pieces = runs.flatMap((run) =>
    inPieces(run.points, run.slots).map(({ slot, points }) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: simplifyCollinear(points).map(unproject) },
      properties: { ...run.line.feature.properties, slot },
    })),
  );

  // Each stretch of track once: where a line runs alone, and each place
  // lines share, left to right.
  const tracks = [
    ...runs.filter((run) => !run.place).map((run) => [run]),
    ...places.map((place) =>
      place.order.map((route) => place.runs.filter((r) => r.line.route === route).reduce((a, b) => (length(b.points) > length(a.points) ? b : a))),
    ),
  ];
  const metersPerPixel = (zoom) => (40075017 * Math.cos((origin[1] * Math.PI) / 180)) / (512 * 2 ** zoom);
  const letters = lettersAlong(tracks, marks, metersPerPixel).map(({ run, zoom, point, meters, rank }) => {
    const { slot, right } = sideAt(run, meters);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: unproject(point) },
      // Shown from zoom `from` up to `to`: the first set from as far out as
      // the map goes, the last as far in. `sx`, `sy`: how many line widths
      // right and down the screen the line is drawn from this point, so the
      // map can put the letter on the line and not on the track's middle.
      properties: {
        kind: 'letter',
        rank,
        route: run.line.route,
        tier: run.line.feature.properties.tier,
        from: zoom === LETTER_ZOOMS[0] ? 0 : zoom,
        to: zoom === LETTER_ZOOMS[1] ? 99 : zoom + 1,
        sx: Math.round(slot * right[0] * 100) / 100,
        sy: Math.round(slot * -right[1] * 100) / 100,
      },
    };
  });
  return { pieces, letters };
}

// Lines that end side by side end together (DESIGN.md, "Shared track"). Each
// line's path stops at its own platform, and platforms at one terminal are
// staggered by a train's length or so; drawn that way the lines look ragged,
// as if they ended at different places. The ends of lines that stop within
// FLUSH_METERS of each other, running the same way, are carried on to where
// the furthest of them stops, square across the track. No line is cut short.
// `lines` are { route, parts }; their parts are changed in place.
function flushEnds(lines) {
  const ends = [];
  for (const line of lines) {
    for (const part of line.parts) {
      for (const atEnd of [false, true]) {
        const inward = atEnd ? [...part].reverse() : part;
        const point = inward[0];
        // Not where the line ends: another part of it carries on from here.
        const others = line.parts.filter((p) => p !== part);
        if (others.some((p) => p.slice(1).some((b, i) => segmentDistance(point, p[i], b) <= SHARED_METERS))) continue;
        // The way the track runs out of its end, over its last 100 m.
        const back = pointAlong(inward, Math.min(100, length(part)));
        const far = Math.hypot(point[0] - back[0], point[1] - back[1]);
        if (far) ends.push({ line, part, atEnd, point, out: [(point[0] - back[0]) / far, (point[1] - back[1]) / far] });
      }
    }
  }
  const together = (a, b) =>
    a.line !== b.line &&
    Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]) <= FLUSH_METERS &&
    a.out[0] * b.out[0] + a.out[1] * b.out[1] >= FLUSH_COS;
  const groups = [];
  for (const end of ends) {
    const joined = groups.filter((group) => group.some((other) => together(end, other)));
    const group = [end, ...joined.flat()];
    for (const old of joined) groups.splice(groups.indexOf(old), 1);
    groups.push(group);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    // Square across the way they run, taken together.
    const sum = group.reduce((s, e) => [s[0] + e.out[0], s[1] + e.out[1]], [0, 0]);
    const way = [sum[0] / Math.hypot(...sum), sum[1] / Math.hypot(...sum)];
    const along = (e) => e.point[0] * way[0] + e.point[1] * way[1];
    const furthest = Math.max(...group.map(along));
    for (const end of group) {
      const more = furthest - along(end);
      if (more < 1) continue;
      const n = Math.ceil(more / STEP_METERS);
      const added = Array.from({ length: n }, (_, k) => [end.point[0] + (way[0] * more * (k + 1)) / n, end.point[1] + (way[1] * more * (k + 1)) / n]);
      if (end.atEnd) end.part.push(...added);
      else end.part.unshift(...added.reverse());
    }
  }
}

// Lines that share track are drawn as one pack (DESIGN.md, "Shared track").
// Each line's path is on its own track, and tracks side by side are anything
// from 0 to 20 m apart; drawn there, each a slot to the side, the gaps
// between the lines come out uneven. So every line of a pack is moved onto
// the middle of the pack's tracks, where the slots space them evenly. Where a
// line joins or leaves a pack, the run with fewer lines swings between the
// two middles over BLEND_METERS, so a line never jumps sideways: lines leave
// a pack together and then part. `onLine(route, p)` is the nearest point of
// a line's track to p. Changes each run's points in place.
function packed(runs, onLine) {
  for (const run of runs) {
    run.moves = run.points.map(() => [0, 0]);
    if (!run.place) continue;
    const others = run.place.routes.filter((route) => route !== run.line.route);
    const middle = run.points.map((p) => {
      // The lines on the track here, as in `sharing`: within SHARED_METERS
      // of this one, or of one that is. A line that has started to leave
      // (a run's ends are rounded to MIN_RUN_METERS) counts for less and
      // less, not suddenly for nothing, and doesn't pull the rest after it.
      const counted = [{ q: p, weight: 1 }];
      const feet = others.map((route) => onLine(route, p)?.q).filter(Boolean);
      while (feet.length) {
        let next = null;
        for (const q of feet) {
          for (const c of counted) {
            const d = Math.hypot(q[0] - c.q[0], q[1] - c.q[1]);
            const weight = c.weight * Math.max(0, Math.min(1, 1 - (d - SHARED_METERS) / PACK_FADE_METERS));
            if (!next || weight > next.weight) next = { q, weight };
          }
        }
        if (!next.weight) break;
        counted.push(next);
        feet.splice(feet.indexOf(next.q), 1);
      }
      const total = counted.reduce((sum, c) => sum + c.weight, 0);
      return [0, 1].map((k) => counted.reduce((sum, c) => sum + c.q[k] * c.weight, 0) / total);
    });
    run.moves = middle.map((c, i) => [c[0] - run.points[i][0], c[1] - run.points[i][1]]);
  }

  // Where one run meets the next, the one with fewer lines takes up the
  // difference. `from` is the index of the point where they meet.
  const head = (run) => (run.flipped ? run.points.length - 1 : 0);
  const tail = (run) => (run.flipped ? 0 : run.points.length - 1);
  const size = (run) => run.set.split(' ').length;
  const less = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const blends = [];
  for (const run of runs) {
    const next = run.after;
    if (next) {
      const [mine, theirs] = [run.moves[tail(run)], next.moves[head(next)]];
      if (size(run) < size(next)) blends.push({ run, from: tail(run), by: less(theirs, mine) });
      else blends.push({ run: next, from: head(next), by: less(mine, theirs) });
    }
    // An end with no run after it may join another part of its own line (a
    // line's two directions on their own tracks): it follows that part.
    for (const [other, from] of [[run.before, head(run)], [run.after, tail(run)]]) {
      if (other) continue;
      const p = run.points[from];
      let best = null;
      for (const r of runs) {
        if (r.line !== run.line || r.part === run.part) continue;
        for (let i = 1; i < r.points.length; i++) {
          const d = segmentDistance(p, r.points[i - 1], r.points[i]);
          if (d <= SHARED_METERS && !(best?.d <= d)) best = { d, move: r.moves[i] };
        }
      }
      if (best) blends.push({ run, from, by: less(best.move, run.moves[from]) });
    }
  }
  const ends = new Map();
  for (const { run } of blends) ends.set(run, (ends.get(run) ?? 0) + 1);
  for (const { run, from, by } of blends) {
    if (Math.hypot(...by) < 0.01) continue;
    // Back on its own middle within the run: by half way, if it swings at
    // both ends.
    const room = Math.min(BLEND_METERS, length(run.points) / ends.get(run));
    const step = from ? -1 : 1;
    let along = 0;
    for (let k = from; k >= 0 && k < run.points.length; k += step) {
      if (k !== from) along += Math.hypot(run.points[k][0] - run.points[k - step][0], run.points[k][1] - run.points[k - step][1]);
      if (along >= room && k !== from) break;
      const t = Math.min(1, along / room);
      const keep = 1 - t * t * (3 - 2 * t);
      run.moves[k] = [run.moves[k][0] + by[0] * keep, run.moves[k][1] + by[1] * keep];
    }
  }
  for (const run of runs) run.points = run.points.map((p, i) => [p[0] + run.moves[i][0], p[1] + run.moves[i][1]]);
}

// Track doesn't turn at a point, but RTD's paths do: they are drawn with a
// corner every hundred meters or so, and a line swinging into a pack adds
// more. Each line is rounded: every point goes to the average of the path
// for ROUND_METERS either side of it, nearer path counting for more. The
// ends stay where they are, and lines on one path come out on one path.
// Changes each run's points in place.
function rounded(runs) {
  for (const first of runs) {
    if (first.before) continue;
    const chain = [];
    for (let run = first; run; run = run.after) chain.push(run);
    // The whole part in the order the line runs; runs meet at a shared point.
    const inOrder = (run) => (run.flipped ? [...run.points].reverse() : run.points);
    const path = chain.flatMap((run, i) => inOrder(run).slice(i ? 1 : 0));
    const along = [0];
    for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = along.at(-1);
    // The path `meters` along, looking from segment `i` on.
    const at = (meters, i) => {
      while (i > 1 && along[i - 1] > meters) i--;
      while (i < path.length - 1 && along[i] < meters) i++;
      const t = along[i] > along[i - 1] ? (meters - along[i - 1]) / (along[i] - along[i - 1]) : 0;
      return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
    };
    const smooth = path.map((p, i) => {
      const reach = Math.min(ROUND_METERS, along[i], total - along[i]);
      if (reach < 1 || path.length < 3) return p;
      let [x, y, n] = [0, 0, 0];
      for (let k = -ROUND_STEPS; k <= ROUND_STEPS; k++) {
        const q = at(along[i] + (k / ROUND_STEPS) * reach, Math.max(1, i));
        const weight = 1 - Math.abs(k) / (ROUND_STEPS + 1);
        x += q[0] * weight;
        y += q[1] * weight;
        n += weight;
      }
      return [x / n, y / n];
    });
    let from = 0;
    for (const run of chain) {
      const mine = smooth.slice(from, from + run.points.length);
      run.points = run.flipped ? mine.reverse() : mine;
      from += run.points.length - 1;
    }
  }
}

// Where each line carries its letter, zoom by zoom (DESIGN.md, "Rail
// bullets"). Each line gets a letter just past each fork it leaves, and
// about every LETTER_PX along it between, evenly. On shared track the
// spacing is LETTER_PX divided by the lines there, and the lines take turns:
// each place goes to the line whose nearest letter is furthest away, so
// every line is named along track it shares at the same rate as a line
// alone. Each letter sits clear of other letters and of stations, and as far
// from a station as it can, within LETTER_SLACK_PX either way (twice that,
// if nowhere nearer is clear).
// `tracks` are the runs side by side on each stretch of track; returns
// { run, zoom, point, meters } for each letter, `meters` along its run.
function lettersAlong(tracks, marks, metersPerPixel) {
  const out = [];
  for (let zoom = LETTER_ZOOMS[0]; zoom <= LETTER_ZOOMS[1]; zoom++) {
    // The map shows this set from `zoom` to the next: sized for halfway.
    const px = (n) => n * metersPerPixel(zoom + 0.5);
    // Clear of other letters at the set's near end (its first whole zoom),
    // where the same meters are fewest pixels: a pair clear there is clear
    // wherever the set is shown.
    const clear = LETTER_CLEAR_PX * metersPerPixel(zoom);
    const clearOfStation = px(STATION_CLEAR_PX);
    const all = [];
    const placed = new Map(tracks.flat().map((run) => [run.line.route, []]));
    const away = (points, p) => Math.min(Infinity, ...points.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
    const put = (run, meters, slack, rank = 0) => {
      // Clear of the letters already there and of stations first (the map
      // draws only one of two that touch), then as far from a station as it
      // can be.
      const room = (p) => Math.min(1, away(all, p) / clear, away(marks, p) / clearOfStation);
      const best = (steps) =>
        steps
          .map((k) => meters + (k * slack) / 4)
          .filter((m) => m > 0 && m < length(run.points))
          .map((m) => ({ point: pointAlong(run.points, m), at: m }))
          .reduce((a, b) => (room(b.point) !== room(a.point) ? (room(b.point) > room(a.point) ? b : a) : away(marks, b.point) > away(marks, a.point) + 1 ? b : a));
      let { point, at } = best(slack ? [-4, -3, -2, -1, 0, 1, 2, 3, 4] : [0]);
      // Nowhere clear that near: look twice as far each way.
      if (slack && room(point) < 1) {
        const wider = best([-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
        if (room(wider.point) > room(point)) ({ point, at } = wider);
      }
      out.push({ run, zoom, point, meters: at, rank });
      placed.get(run.line.route).push(point);
      all.push(point);
    };
    for (const members of tracks) {
      const reach = Math.max(...members.map((run) => length(run.points)));
      if (reach < px(LETTER_MIN_PX)) continue;
      // A stretch ends at a fork (a line on it goes on along other track)
      // or at the end of its lines. A letter sits just past each fork, where
      // the branches are told apart, and the rest are spread evenly between,
      // never further apart than the spacing. A stretch with no fork at
      // either end is lettered from its middle out.
      const named = new Set();
      let pass = 0;
      const spacing = px(LETTER_PX) / members.length;
      const edge = px(LETTER_FORK_PX);
      const forkAtStart = members.some((run) => (run.flipped ? run.after : run.before));
      const forkAtEnd = members.some((run) => (run.flipped ? run.before : run.after));
      const first = forkAtStart ? edge : Math.min(spacing / 2, reach / 2);
      const last = reach - (forkAtEnd ? edge : Math.min(spacing / 2, reach / 2));
      // At least one place for each line on the stretch, if they fit.
      const fit = last < first ? 1 : Math.floor((last - first) / clear) + 1;
      const count = last < first ? 1 : Math.max(Math.round((last - first) / spacing) + 1, Math.min(members.length, fit));
      const places =
        last < first
          ? [forkAtStart === forkAtEnd ? reach / 2 : forkAtStart ? first : last]
          : Array.from({ length: count }, (_, k) => (count === 1 ? (first + last) / 2 : first + ((last - first) * k) / (count - 1)));
      for (const at of places) {
        // Its own run can be a little longer or shorter than the others'.
        const here = (run) => pointAlong(run.points, (at / reach) * length(run.points));
        // A line with no letter on this stretch yet goes before any line has
        // a second: the lines take turns, and each is named on every piece
        // it shares.
        if (members.every((run) => named.has(run.line.route))) named.clear();
        // A line with a letter of its own this near, on this stretch or the
        // next (a knot of short stretches), is named here already: a second
        // would crowd out another line's first.
        const waiting = members.filter((run) => !named.has(run.line.route) && away(placed.get(run.line.route), here(run)) >= px(LETTER_SAME_PX));
        if (!waiting.length) continue;
        const turn = waiting.reduce((a, b) => (away(placed.get(b.line.route), here(b)) > away(placed.get(a.line.route), here(a)) ? b : a));
        named.add(turn.line.route);
        // The first letter of each line on the stretch is drawn before the
        // rest, wherever the map is short of room (`rank`).
        put(turn, (at / reach) * length(turn.points), Math.min(px(LETTER_SLACK_PX), spacing / 4), pass);
        if (members.every((run) => named.has(run.line.route))) pass = 1;
      }
    }
    // A line too short to have come up anywhere: once, mid-way along its
    // longest stretch.
    for (const [route, points] of placed) {
      if (points.length) continue;
      const run = tracks.flat().filter((r) => r.line.route === route).reduce((a, b) => (length(b.points) > length(a.points) ? b : a));
      put(run, length(run.points) / 2, 0);
    }
  }
  return out;
}

// A run's slot at each of its points. It is the run's own slot, except past
// an end where the line has just left others it shared track with: there it
// starts in the slot it had beside them and eases to its own as they get
// further away, so the line doesn't step sideways where the others leave, and
// isn't drawn over one of them while their tracks are still close. Only the
// run with fewer lines moves; the lines still together stay in their slots.
function eased(run, apart, marks) {
  const { points } = run;
  const slots = points.map(() => run.slot);
  const members = (r) => r.set.split(' ');
  // `before` meets the run where it started, which is its last point if the
  // run has been turned around.
  const ends = [[run.before, !run.flipped], [run.after, run.flipped]]
    .filter(([other]) => other && members(other).length > members(run).length)
    // The other run's slot, as an offset to the right of this run's direction.
    .map(([other, fromStart]) => ({ other, fromStart, shift: (other.flipped === run.flipped ? other.slot : -other.slot) - run.slot }))
    .filter((end) => end.shift);
  for (const { other, fromStart, shift } of ends) {
    const gone = new Set(members(other).filter((route) => !members(run).includes(route)));
    const order = points.map((_, i) => (fromStart ? i : points.length - 1 - i));
    const along = [0];
    for (let k = 1; k < order.length; k++) {
      const [a, b] = [points[order[k - 1]], points[order[k]]];
      along.push(along[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    // Done by the first station along, by EASE_METERS, or within the run: by
    // its middle if it moves over from both ends.
    let room = Math.min(EASE_METERS, along.at(-1) / ends.length);
    for (const mark of marks) {
      let nearest = null;
      for (let k = 0; k < order.length && along[k] <= EASE_METERS + STATION_METERS; k++) {
        const d = Math.hypot(points[order[k]][0] - mark[0], points[order[k]][1] - mark[1]);
        if (d <= STATION_METERS && (!nearest || d < nearest.d)) nearest = { d, at: along[k] };
      }
      if (nearest && nearest.at > STATION_CLEAR_METERS) room = Math.min(room, nearest.at - STATION_CLEAR_METERS);
    }
    let done = 0;
    for (let k = 0; k < order.length && done < 1; k++) {
      const farEnough = (apart(gone, points[order[k]]) - SHARED_METERS) / (APART_METERS - SHARED_METERS);
      done = Math.max(done, Math.min(1, Math.max(farEnough, along[k] / room)));
      // Eased at both ends, so the line bends into and out of the move.
      slots[order[k]] += shift * (1 - done * done * (3 - 2 * done));
    }
  }
  return slots;
}

// A run cut wherever its slot has moved another EASE_STEP: a line's offset
// is one number for a whole piece, so a move across is many short pieces.
function inPieces(points, slots) {
  if (points.length < 2) return [{ slot: slots[0], points }];
  const pieces = [];
  for (let i = 1; i < points.length; i++) {
    // A step between two points that moves further than that is cut again.
    const n = Math.max(1, Math.ceil(Math.abs(slots[i] - slots[i - 1]) / EASE_STEP));
    const at = (k) => [0, 1].map((c) => points[i - 1][c] + ((points[i][c] - points[i - 1][c]) * k) / n);
    for (let k = 1; k <= n; k++) {
      const middle = slots[i - 1] + ((slots[i] - slots[i - 1]) * (k - 0.5)) / n;
      const slot = Math.round(middle / EASE_STEP) * EASE_STEP + 0;
      const last = pieces.at(-1);
      if (last && last.slot === slot) last.points.push(at(k));
      else pieces.push({ slot, points: [at(k - 1), at(k)] });
    }
  }
  return pieces;
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

// Whether two runs come within shared-track distance of each other. Every
// fifth point of `a` is tried, and its last: runs often touch only at an end.
function near(a, b) {
  for (let i = 0; i < a.length; i = i === a.length - 1 ? a.length : Math.min(i + 5, a.length - 1)) {
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
      // Turned back by more than 120 degrees: track can't. Nor can it step
      // sideways onto the next track: a short step that turns more than 60
      // degrees one way going in and the other coming out.
      const d = out[i + 2];
      const w = d && [d[0] - c[0], d[1] - c[1]];
      const sharp = (p, q) => (p[0] * q[0] + p[1] * q[1]) / (Math.hypot(...p) * Math.hypot(...q) || 1) < 0.5;
      const sidestep = w && lv < SHARED_METERS && sharp(u, v) && sharp(v, w) && (u[0] * v[1] - u[1] * v[0]) * (v[0] * w[1] - v[1] * w[0]) < 0;
      if (sidestep || ((u[0] * v[0] + u[1] * v[1]) / (lu * lv || 1) < -0.5 && Math.min(lu, lv) < SPIKE_METERS)) {
        out = [...out.slice(0, i), ...out.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  const rest = withoutRetrace(out.filter((p, i) => !i || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]));
  // What a retrace leaves behind can be a kink of its own.
  return rest.length < out.length ? despike(rest) : rest;
}

// A longer out-and-back, where the path turns around and comes back the way
// it went (trains reversing on a siding): dropped where the rest of the path
// runs alongside it anyway, so the line isn't drawn there twice. An
// out-and-back to somewhere the path doesn't otherwise go is kept.
function withoutRetrace(points) {
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const [u, v] = [[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]];
    const [lu, lv] = [Math.hypot(...u), Math.hypot(...v)];
    if ((u[0] * v[0] + u[1] * v[1]) / (lu * lv || 1) >= -0.5 || segmentDistance(c, a, b) > RETRACE_METERS) continue;
    const rest = [...points.slice(0, i), ...points.slice(i + 1)];
    const alongside = (p) => rest.some((q, j) => j && segmentDistance(p, rest[j - 1], q) <= SHARED_METERS);
    const n = Math.ceil(lv / STEP_METERS);
    const leg = Array.from({ length: n }, (_, k) => [b[0] + (v[0] * k) / n, b[1] + (v[1] * k) / n]);
    if (leg.every(alongside)) return withoutRetrace(rest.filter((p, j) => !j || p[0] !== rest[j - 1][0] || p[1] !== rest[j - 1][1]));
  }
  return points;
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

// A run's slot `meters` along it, and the unit vector ([east, north]) to the
// right of the way it's drawn there: the side a positive slot is on.
function sideAt(run, meters) {
  const { points, slots } = run;
  let left = meters;
  for (let i = 1; i < points.length; i++) {
    const [dx, dy] = [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]];
    const d = Math.hypot(dx, dy);
    if (d && (d >= left || i === points.length - 1)) {
      const t = Math.min(1, left / d);
      return { slot: slots[i - 1] + t * (slots[i] - slots[i - 1]), right: [dy / d, -dx / d] };
    }
    left -= d;
  }
  return { slot: run.slot, right: [0, 0] };
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
  // Slots run from -(n - 1) / 2 to (n - 1) / 2. Rounded: a line easing out
  // of a bundle nearby is a fraction of a slot off.
  return best ? { span: Math.round(best.slot * 2) + 1, bearing: best.bearing } : { span: 1, bearing: 0 };
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

function closestOnSegment(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

function segmentDistance(p, a, b) {
  const q = closestOnSegment(p, a, b);
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
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
