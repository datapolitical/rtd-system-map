import { toLonLat, toWorld } from '../drawn/mercator.mjs';

const position = (a, b, t) => {
  const from = toWorld(a, 0), to = toWorld(b, 0);
  return toLonLat(from.map((x, i) => x + (to[i] - x) * t), 0);
};

// Use the producer's actual stops and ink room (#234). A stop holds until the
// next one. Interpolate only when the build declares that the page does so.
function visibleUntil(plan, stop) {
  return stop.until ?? plan.drawings?.find((drawing) => drawing.zoom > stop.zoom)?.zoom ?? Infinity;
}

export function planAt(plan, zoom) {
  return plan.labels.flatMap(({ id, key, kind, partOf, stops }) => {
    const i = stops.findLastIndex((stop) => stop.zoom <= zoom);
    if (i < 0 || zoom >= visibleUntil(plan, stops[i])) return [];
    const stop = stops[i], next = stops[i + 1];
    if (next && stop.interpolate) {
      const t = (zoom - stop.zoom) / (next.zoom - stop.zoom);
      return [{ id, key, kind, partOf, ...stop, at: position(stop.at, next.at, t),
        room: stop.room.map((x, j) => x + (next.room[j] - x) * t),
        angle: stop.angle + (((next.angle - stop.angle + 540) % 360) - 180) * t }];
    }
    return [{ id, key, kind, partOf, ...stop }];
  });
}

export function planEvents(plan) {
  return plan.labels.flatMap(({ id, stops }) => [
    { kind: 'arrival', zoom: stops[0].zoom, at: stops[0].at, id },
    ...stops.slice(1).flatMap((stop, i) => stops[i].interpolate ? [] : [{ kind: 'handover', zoom: stop.zoom, at: stop.at, id }]),
    ...stops.flatMap((stop, i) => {
      const end = visibleUntil(plan, stop);
      return Number.isFinite(end) && end < (stops[i + 1]?.zoom ?? Infinity)
        ? [{ kind: 'handover', zoom: end, at: stop.at, id }]
        : [];
    }),
  ]);
}

export function validatePlan(plan) {
  if (plan?.version !== 1 || !plan.labels?.length) throw new Error('Expected a non-empty v1 lettering plan');
  if (plan.drawings?.some(({ zoom }, i) => !Number.isFinite(zoom) || (i && zoom <= plan.drawings[i - 1].zoom))) {
    throw new Error('Lettering drawings must be in zoom order');
  }
  const ids = new Set();
  for (const { id, stops } of plan.labels) {
    if (!id || ids.has(id) || !stops?.length) throw new Error(`Invalid label identity or missing stops: ${id}`);
    ids.add(id);
    for (const [i, stop] of stops.entries()) {
      if (!Number.isFinite(stop.zoom) || !Number.isFinite(stop.angle)
        || stop.at?.length !== 2 || !stop.at.every(Number.isFinite)
        || stop.room?.length !== 2 || !stop.room.every((v) => Number.isFinite(v) && v > 0)
        || (i && stop.zoom <= stops[i - 1].zoom)
        || (stop.until !== undefined && (!Number.isFinite(stop.until) || stop.until <= stop.zoom))) {
        throw new Error(`Invalid lettering stop for ${id} at z${stop.zoom}`);
      }
    }
  }
}
