// Label faults on the drawn model (issue #47): names that cross a line,
// names with no room to show, and names that end up far from their mark.
//
// MapLibre places symbols greedily in layer order: for each feature it takes
// the first candidate anchor whose box is clear of the boxes already placed,
// and hides the feature when every candidate collides. The model's label
// entries carry the same candidate boxes, so the placement can be replayed in
// plain Node, per view, and the placed boxes checked against the lines and
// marks the page draws.

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a, b, c, d) => side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);

// Does a segment touch a box? An endpoint inside is a touch; so is a crossing
// of any of the four edges.
export function segmentHitsBox(a, b, box) {
  if (inside(a, box) || inside(b, box)) return true;
  const edges = [
    [[box[0], box[1]], [box[2], box[1]]],
    [[box[2], box[1]], [box[2], box[3]]],
    [[box[2], box[3]], [box[0], box[3]]],
    [[box[0], box[3]], [box[0], box[1]]],
  ];
  return edges.some(([c, d]) => crosses(a, b, c, d));
}

function boxHitsLines(box, lines) {
  for (const line of lines) {
    for (const part of line.parts) {
      for (let i = 1; i < part.length; i++) if (segmentHitsBox(part[i - 1], part[i], box)) return true;
    }
  }
  return false;
}

function distToBox([x, y], box) {
  const dx = Math.max(box[0] - x, 0, x - box[2]);
  const dy = Math.max(box[1] - y, 0, y - box[3]);
  return Math.hypot(dx, dy);
}

// Replay MapLibre's text placement: first clear candidate wins, else hidden.
// `width` and `height` are the screen; a box wholly off it is not placed.
export function placeLabels(labels, { width, height }) {
  const placed = [];
  const hidden = [];
  for (const label of labels) {
    const boxes = (label.candidates?.length ? label.candidates.map((c) => c.box) : [])
      .filter((b) => b[2] > 0 && b[3] > 0 && b[0] < width && b[1] < height);
    if (!boxes.length) continue;
    const clear = boxes.find((b) => !placed.some((p) => overlaps(b, p.box)));
    if (clear) placed.push({ ...label, box: clear });
    else hidden.push({ ...label, boxes });
  }
  return { placed, hidden };
}

/**
 * Faults among a view's placed labels.
 * @param {{labels: Array, marks: Array, lines: Array, width: number, height: number}} frame
 * @param {{layers?: Set<string>|string[], maxFromMark?: number}} opts name layers
 * @returns {Array<{kind:string, layer:string, text:string, px:number[], msg:string}>}
 */
export function labelFaults(frame, { layers = null, maxFromMark = 25 } = {}) {
  const wanted = layers ? new Set(layers) : null;
  const labels = frame.labels.filter((l) => !wanted || wanted.has(l.layer));
  const { placed, hidden } = placeLabels(labels, frame);
  const faults = [];
  for (const l of placed) {
    const [x0, y0, x1, y1] = l.box;
    if (boxHitsLines(l.box, frame.lines.filter((line) => !/-(casing|edge|outline)$/.test(line.layer)))) {
      faults.push({ kind: 'over-line', layer: l.layer, text: l.text, px: [(x0 + x1) / 2, (y0 + y1) / 2], msg: `"${l.text}" crosses a line` });
    }
    const id = l.properties?.id;
    if (id != null) {
      const marks = frame.marks.filter((m) => m.properties?.id === id);
      const from = marks.length ? Math.min(...marks.map((m) => distToBox(m.at, l.box))) : null;
      if (from != null && from > maxFromMark) {
        faults.push({ kind: 'far', layer: l.layer, text: l.text, px: [(x0 + x1) / 2, (y0 + y1) / 2], msg: `"${l.text}" ${from.toFixed(0)} px from its mark` });
      }
    }
  }
  for (const l of hidden) {
    const [x0, y0, x1, y1] = l.boxes[0];
    faults.push({ kind: 'hidden', layer: l.layer, text: l.text, px: [(x0 + x1) / 2, (y0 + y1) / 2], msg: `"${l.text}" has no room to show` });
  }
  return faults;
}
