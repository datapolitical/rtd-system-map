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
