// Keep a tapped place in the part of the map that its card leaves clear.
// Rectangles and points are in the map's screen pixels.
export function clearPoint(point, view, blocks, margin = 18) {
  const [x, y] = point;
  const inside = (p, b) => p[0] >= b.left - margin && p[0] <= b.right + margin && p[1] >= b.top - margin && p[1] <= b.bottom + margin;
  if (!blocks.some((b) => inside(point, b))) return point;
  const xs = [x, margin, view.width - margin, ...blocks.flatMap((b) => [b.left - margin - 1, b.right + margin + 1])];
  const ys = [y, margin, view.height - margin, ...blocks.flatMap((b) => [b.top - margin - 1, b.bottom + margin + 1])];
  return xs.flatMap((a) => ys.map((b) => [a, b]))
    .filter((p) => p[0] >= margin && p[0] <= view.width - margin && p[1] >= margin && p[1] <= view.height - margin && !blocks.some((b) => inside(p, b)))
    .sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y))[0] ?? null;
}

// A station name has places chosen by the build. Keep its normal place when it fits;
// otherwise pick a whole alternative clear of controls and the names already on screen.
export function nameChoices(features, view, blocks, bus = '') {
  const groups = new Map();
  const tag = `|${bus}|`;
  for (const { properties: p, at } of features) {
    if (!p.nid || !p.bx || (p.alt ? !bus || !p.alt.includes(tag) : bus && p.under?.includes(tag))) continue;
    const [a, b, c, d] = String(p.bx).split(',').map(Number);
    const box = { left: at[0] + a, top: at[1] + b, right: at[0] + c, bottom: at[1] + d };
    const g = groups.get(p.nid) ?? { id: p.nid, hub: p.hub, end: p.end, places: new Map() };
    g.places.set(p.edge ?? '', { edge: p.edge, box });
    groups.set(p.nid, g);
  }
  const overlaps = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
  const fits = (b) => b.left >= 2 && b.top >= 2 && b.right <= view.width - 2 && b.bottom <= view.height - 2 && !blocks.some((r) => overlaps(b, r));
  const outside = (b) => b.right < 0 || b.bottom < 0 || b.left > view.width || b.top > view.height;
  const occupied = [];
  const waiting = [];
  for (const g of groups.values()) {
    const normal = g.places.get('');
    if (!normal || [...g.places.values()].every((p) => outside(p.box))) continue;
    if (fits(normal.box)) occupied.push(normal.box);
    else waiting.push(g);
  }
  waiting.sort((a, b) => Number(b.hub) - Number(a.hub) || Number(b.end) - Number(a.end) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const clipped = [], edges = [];
  for (const g of waiting) {
    clipped.push(g.id);
    const place = [...g.places.values()].find((p) => p.edge && fits(p.box) && !occupied.some((b) => overlaps(p.box, b)));
    if (place) { edges.push(place.edge); occupied.push(place.box); }
  }
  return { clipped: clipped.sort(), edges: edges.sort() };
}
