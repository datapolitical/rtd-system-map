// The zoom trial's shared spine. Match the original (un-offset) track, then
// share one rounded curve before assigning any screen-space line offsets.
import { SIZES, toLonLat, nearest, length } from './sheets.mjs';

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function easedSlots(points, reach = SIZES.ease) {
  let slots = points.map((p) => p[2]);
  for (let pass = 0; pass < 2; pass++) {
    const was = slots;
    slots = was.map((_, i) => {
      const k = Math.min(reach, i, was.length - i - 1);
      let total = 0;
      for (let j = i - k; j <= i + k; j++) total += was[j];
      return total / (2 * k + 1);
    });
  }
  return slots;
}

function nearestOn(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
  const at = [a[0] + dx * t, a[1] + dy * t];
  return { t, d: distance(p, at) };
}

function tangent(points, i) {
  const a = points[Math.max(0, i - 3)], b = points[Math.min(points.length - 1, i + 3)];
  const d = distance(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}

export function canonicalTracks(raw, sheet) {
  const tracks = raw.joined.flatMap((line, i) => raw.tracks[i].map((t, run) => ({
    route: line.route, color: line.color, run, original: t.pts,
    center: t.track.map((p) => [...p]), slots: easedSlots(t.pts),
  }))).sort((a, b) => a.route.localeCompare(b.route, 'en', { numeric: true }) || a.run - b.run);
  if (!tracks.length) return [];
  const grid = new Map();
  const cell = 2;
  const key = (x, y) => `${x},${y}`;
  const latitude = toLonLat(tracks[0].original[0], sheet.zoom)[1];
  const metresPerPixel = Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137 / (512 * 2 ** sheet.zoom);
  const tolerance = Math.max(0.05, SIZES.sharedMetres / metresPerPixel);
  for (const track of tracks) {
    const moves = track.original.map((p, i) => {
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      const direction = tangent(track.original, i);
      let best = null;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const segment of grid.get(key(cx + dx, cy + dy)) ?? []) {
          if (segment.track.route === track.route) continue;
          const other = segment.track, j = segment.index;
          const hit = nearestOn(p, other.original[j - 1], other.original[j]);
          if (hit.d > tolerance) continue;
          const heading = tangent(other.original, j);
          if (Math.abs(direction[0] * heading[0] + direction[1] * heading[1]) < 0.9) continue;
          if (!best || other.order < best.order || (other.order === best.order && hit.d < best.d)) {
            best = { order: other.order, d: hit.d, point: mix(other.center[j - 1], other.center[j], hit.t) };
          }
        }
      }
      return best && [best.point[0] - track.center[i][0], best.point[1] - track.center[i][1]];
    });
    // Keep the shared curve exact. Outside a shared run, ease its displacement
    // back into the branch's own curve rather than stepping at the junction.
    const nearest = [[], []];
    for (let i = 0, last = null; i < moves.length; i++) nearest[0][i] = last = moves[i] ? i : last;
    for (let i = moves.length - 1, last = null; i >= 0; i--) nearest[1][i] = last = moves[i] ? i : last;
    const reach = Math.max(8 * raw.pitch, 16);
    track.center = track.center.map((p, i) => {
      if (moves[i]) return [p[0] + moves[i][0], p[1] + moves[i][1]];
      let x = 0, y = 0, weight = 0;
      for (const j of [nearest[0][i], nearest[1][i]]) {
        if (j === null) continue;
        const u = Math.min(1, Math.abs(i - j) / reach);
        const fade = 1 - u * u * u * (10 - 15 * u + 6 * u * u);
        x += moves[j][0] * fade; y += moves[j][1] * fade; weight += fade;
      }
      return [p[0] + x / Math.max(1, weight), p[1] + y / Math.max(1, weight)];
    });
    track.order = tracks.indexOf(track);
    for (let i = 1; i < track.original.length; i++) {
      const a = track.original[i - 1], b = track.original[i];
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
          const k = key(x, y);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push({ track, index: i });
        }
      }
    }
  }
  return tracks;
}

export function slotPieces(track) {
  const slots = track.slots.map((s) => Math.round(s * 32) / 32);
  const pieces = [];
  let start = 0;
  for (let i = 1; i < track.center.length; i++) {
    if (i < track.center.length - 1 && slots[i] === slots[start]) continue;
    pieces.push({ slot: slots[start], from: start, points: track.center.slice(start, i + 1) });
    start = i;
  }
  return pieces;
}

function atDistance(points, far) {
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    if (along + d >= far && d) return mix(points[i - 1], points[i], Math.max(0, far - along) / d);
    along += d;
  }
  return [...points.at(-1)];
}

function afterDistance(points, far) {
  const rest = [atDistance(points, far)];
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    along += distance(points[i - 1], points[i]);
    if (along > far) rest.push(points[i]);
  }
  return rest;
}

// Production station layout decides which platform a line ends at. Reconcile
// those ends on the shared spine itself, so every zoom reaches the same bar.
export function fitTerminalSpines(tracks, lines, marks, pitch) {
  const byRoute = new Map(lines.map((line) => [line.route, line]));
  const assigned = new Set();
  for (const mark of marks) for (const bar of mark.bars ?? []) {
    const endings = [];
    for (const ending of bar.ending) {
      let best = null;
      for (const track of tracks.filter((t) => t.route === ending.route)) {
        const path = byRoute.get(track.route).paths[track.run];
        for (const end of [0, 1]) {
          if (assigned.has(`${track.route}:${track.run}:${end}`)) continue;
          const at = end ? path.at(-1) : path[0];
          const d = nearest(bar.ends, at).d;
          if (!best || d < best.d) best = { track, path, end, at, d };
        }
      }
      if (!best || best.d > pitch) continue;
      const { track, path, end, at } = best;
      const a = end ? path.at(-2) : path[0], b = end ? path.at(-1) : path[1];
      const n = distance(a, b) || 1;
      const direction = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
      const slot = end ? track.slots.at(-1) : track.slots[0];
      const center = [at[0] + direction[1] * slot * pitch, at[1] - direction[0] * slot * pitch];
      endings.push({ ...best, slot, center, outward: direction.map((v) => end ? -v : v) });
      assigned.add(`${track.route}:${track.run}:${end}`);
    }
    const groups = [];
    for (const ending of endings) {
      const group = groups.find((g) => g[0].outward[0] * ending.outward[0] + g[0].outward[1] * ending.outward[1] > 0.9);
      if (group) group.push(ending); else groups.push([ending]);
    }
    for (const group of groups) {
      const center = [0, 1].map((k) => group.reduce((sum, e) => sum + e.center[k], 0) / group.length);
      const vector = [0, 1].map((k) => group.reduce((sum, e) => sum + e.outward[k], 0));
      const norm = Math.hypot(...vector) || 1;
      const outward = vector.map((v) => v / norm);
      for (const { track, end, slot } of group) {
        let points = track.center.map((p, i) => [...p, track.slots[i]]);
        if (end) points.reverse();
        const hit = nearest(points, center);
        const reach = Math.min(4 * pitch, length(points) / 4, length(points) - hit.along);
        if (reach < 1) continue;
        const join = hit.along + reach;
        const tail = afterDistance(points, join);
        const p3 = tail[0];
        const a = atDistance(points, Math.max(0, join - 2)), b = atDistance(points, Math.min(length(points), join + 2));
        const d = distance(a, b) || 1;
        const heading = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
        const p1 = [center[0] + outward[0] * reach * 0.4, center[1] + outward[1] * reach * 0.4];
        const p2 = [p3[0] - heading[0] * reach * 0.4, p3[1] - heading[1] * reach * 0.4];
        const steps = Math.max(16, Math.ceil(reach));
        const curve = Array.from({ length: steps }, (_, i) => {
          const t = i / steps, u = 1 - t;
          return [0, 1].map((k) => u ** 3 * center[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k])
            .concat(slot + (p3[2] - slot) * t);
        });
        points = [...curve, ...tail];
        if (end) points.reverse();
        track.center = points.map((p) => p.slice(0, 2));
        track.slots = points.map((p) => p[2]);
      }
    }
  }
  return tracks;
}
