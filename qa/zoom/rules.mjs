import { bbox, clipSegment, segmentDistance, toLonLat, toWorld } from '../drawn/mercator.mjs';
import { nearest, resample } from '../../scripts/lib/sheets.mjs';

export const MIN_ZOOM = 8.75;
export const MAX_ZOOM = 16;
export const MOVE_PX = 2;
const EDGE = 0.01;
const round = (n) => Number(n.toFixed(6));

export function sampleZooms(events, min = MIN_ZOOM, max = MAX_ZOOM) {
  const zooms = [min, max];
  for (let z = Math.ceil(min * 10); z / 10 < max; z++) zooms.push(z / 10);
  for (const { zoom, kind } of events) {
    zooms.push(zoom);
    if (kind === 'handover') zooms.push(zoom - EDGE, zoom + EDGE);
  }
  return [...new Set(zooms.map(round))].filter((z) => z >= min && z <= max).sort((a, b) => a - b);
}

// Footprints are the build's ink
// rectangles in CSS pixels, with angles clockwise from screen east.
function corners({ x, y, w, h, angle }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}

function overlaps(a, b) {
  return [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2].every((angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const project = (pts) => pts.map(([x, y]) => x * c + y * s);
    const pa = project(a.corners), pb = project(b.corners);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 1e-7;
  });
}

function strokeHits(box, { a, b, radius }) {
  const c = Math.cos(box.angle), s = Math.sin(box.angle);
  const local = ([x, y]) => [(x - box.x) * c + (y - box.y) * s, -(x - box.x) * s + (y - box.y) * c];
  const p = local(a), q = local(b);
  const w = box.w / 2, h = box.h / 2;
  if (clipSegment(p, q, [-w, -h, w, h])) return true;
  const endpoint = ([x, y]) => Math.hypot(Math.max(0, Math.abs(x) - w), Math.max(0, Math.abs(y) - h));
  return Math.min(endpoint(p), endpoint(q), ...[[-w, -h], [-w, h], [w, -h], [w, h]]
    .map((point) => segmentDistance(point, p, q).d)) < radius - 1e-7;
}

function cells([x0, y0, x1, y1]) {
  const keys = [];
  for (let x = Math.floor(x0 / 64); x <= Math.floor(x1 / 64); x++) {
    for (let y = Math.floor(y0 / 64); y <= Math.floor(y1 / 64); y++) keys.push(`${x},${y}`);
  }
  return keys;
}

export function overlapFindings(labels, strokes, zoom) {
  const grid = new Map();
  const findings = [];
  function add(item, bounds) {
    for (const key of cells(bounds)) {
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  }
  for (const stroke of strokes) {
    const points = stroke.path.map((at) => toWorld(at, zoom));
    const radius = stroke.width / 2;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      const bounds = bbox([a, b]).map((v, j) => v + (j < 2 ? -radius : radius));
      add({ stroke, a, b, radius }, bounds);
    }
  }
  for (const label of labels) {
    const [x, y] = toWorld(label.at, zoom);
    const [w, h] = label.room;
    const box = { label, x, y, w, h, angle: label.angle * Math.PI / 180 };
    box.corners = corners(box);
    const bounds = bbox(box.corners);
    const checked = new Set();
    for (const key of cells(bounds)) {
      for (const other of grid.get(key) ?? []) {
        const id = other.label?.id ?? other.stroke.id;
        if (checked.has(id)) continue;
        if ((label.partOf && label.partOf === other.label?.key) || (other.label?.partOf && other.label.partOf === label.key)) continue;
        if (other.stroke && other.stroke.labelOwns?.includes(label.id)) continue;
        if (other.label ? overlaps(box, other) : strokeHits(box, other)) {
          findings.push({ kind: other.label ? 'label-overlap' : 'label-on-stroke', zoom, at: label.at, ids: [label.id, id] });
          checked.add(id);
        }
      }
    }
    add(box, bounds);
  }
  return findings;
}

export function continuityFindings(before, after, zoom, handovers = []) {
  const next = new Map(after.map((label) => [label.id, label]));
  const replacements = new Map(handovers.map(({ from, to }) => [from, to]));
  return before.flatMap((label) => {
    const current = next.get(label.id) ?? next.get(replacements.get(label.id));
    if (!current) return [{ kind: 'label-disappeared', zoom, at: label.at, ids: [label.id] }];
    let px;
    if (label.at && current.at) {
      const [x, y] = toWorld(label.at, zoom);
      const [nx, ny] = toWorld(current.at, zoom);
      px = Math.hypot(nx - x, ny - y);
    }
    if (px > MOVE_PX || (label.anchorSide && current.anchorSide && label.anchorSide !== current.anchorSide)) {
      return [{ kind: 'label-moved', zoom, at: current.at, ids: [label.id], px, before: label.anchorSide, after: current.anchorSide }];
    }
    return [];
  });
}

// Both directions are sampled so a squeeze affecting only part of either
// path is visible. Paths must already be cut to the common pack stretch.
export function measureGap(a, b, width, bounds = [-Infinity, -Infinity, Infinity, Infinity]) {
  let min = Infinity, max = -Infinity, at, samples = 0;
  for (const [one, other] of [[a, b], [b, a]]) {
    for (const path of one) for (const point of resample(path, 2)) {
      if (point[0] < bounds[0] || point[0] > bounds[2] || point[1] < bounds[1] || point[1] > bounds[3]) continue;
      const distance = Math.min(...other.map((line) => nearest(line, point).d));
      if (distance < min) { min = distance; at = point; }
      max = Math.max(max, distance);
      samples++;
    }
  }
  return { min, max, gap: min - width, at, samples };
}

export function spacingFinding(measurement, minimum, zoom, ids, fallback, origin = [0, 0]) {
  if (measurement.samples && Number.isFinite(measurement.gap) && measurement.gap + 1e-7 >= minimum) return null;
  const at = measurement.at ? toLonLat(measurement.at.map((v, i) => v + origin[i]), zoom) : fallback;
  return { kind: 'rail-spacing', zoom, at, ids, gap: Number.isFinite(measurement.gap) ? measurement.gap : null, minimum };
}

export function terminalFinding(end, bars, zoom) {
  const point = toWorld(end.at, zoom);
  const distance = Math.min(...bars.filter((bar) => bar.id === end.bar)
    .map((bar) => nearest(bar.path.map((at) => toWorld(at, zoom)), point).d));
  return distance > 1 ? { kind: 'rail-end', zoom, at: end.at, ids: [end.id, end.bar], distance: Number.isFinite(distance) ? distance : null } : null;
}

// The trial paints each drawing in a separate set of MapLibre layers.
export function railOrderFindings(style) {
  const rail = style.layers.findIndex(({ id }) => /^trial-rail(?:-rim|-casing)?(?:-\d+)?$/.test(id));
  if (rail < 0) throw new Error('Style has no trial rail layer');
  return style.layers.flatMap(({ id }, index) => index > rail && /^(bus(?:-rim|-spine)?|marked-dash)-(?:[234]|13|15)$/.test(id)
    ? [{ kind: 'prototype-layer-order', ids: [id, style.layers[rail].id] }] : []);
}
