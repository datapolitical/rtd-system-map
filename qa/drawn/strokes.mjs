// Lines as drawn (issue #55): a line's centreline moved by its `line-offset`
// the way MapLibre moves it, so a check can measure the line a rider sees
// rather than the street it was drawn from.
//
// MapLibre builds a line's vertices in its line bucket
// (src/data/bucket/line_bucket.ts) and the shader moves each vertex by
// `line-offset` along an offset normal it stores per vertex
// (src/shaders/glsl/line.vertex.glsl: `offset2 = offset * a_offset_normal`).
// That normal is:
//   - at a line's two ends, the segment's normal;
//   - at a join, whatever the join type (miter, bevel or round), the join's
//     bisector scaled by its miter length, capped at MAX_OFFSET_MITER_LENGTH;
//   - easing to the two segments' own normals as the corner sharpens, from
//     OFFSET_FALLBACK_START to OFFSET_FALLBACK_END (a near hairpin's bisector
//     points along the line, not across it);
//   - and a corner sharper than 75 degrees gets an extra vertex a short way
//     before and after it, each moved by its segment's plain normal.
// Normals point to the right of the line's direction (y down: east's normal
// is south), so a positive offset moves a line to its right, as the style
// spec says.
//
// The constants below are MapLibre's; the drift test (qa/checks/drawn.spec.mjs)
// measures the page's lines against these and fails when they part.

const MAX_OFFSET_MITER_LENGTH = 2;
const OFFSET_FALLBACK_START = 3;
const OFFSET_FALLBACK_END = 8;
const COS_HALF_SHARP_CORNER = Math.cos((75 / 2) * (Math.PI / 180));
// SHARP_CORNER_OFFSET is 15 px at the tile's own zoom; a GeoJSON source's
// tiles are cut at whole zooms, so at zoom z it is 15 * 2^(z - floor(z)).
const SHARP_CORNER_PX = 15;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The normal to the right of a -> b, unit length.
function rightNormal(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return len ? [-dy / len, dx / len] : null;
}

// Consecutive repeated points carry no direction; MapLibre skips them too.
function dedupe(part) {
  const out = [];
  for (const p of part) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/**
 * One polyline moved sideways by `offset` px, as MapLibre draws it.
 * @param {number[][]} part points in screen (world) px at zoom z
 * @param {number} offset line-offset in px, positive to the right
 * @param {number} z the zoom the part is drawn at (for the sharp-corner step)
 * @returns {number[][]} the offset polyline
 */
export function offsetPart(part, offset, z = 0) {
  const pts = dedupe(part);
  if (!offset || pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const sharpStep = SHARP_CORNER_PX * 2 ** (z - Math.floor(z));
  const out = [];
  const at = (p, v) => out.push([p[0] + v[0] * offset, p[1] + v[1] * offset]);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prevN = i > 0 ? rightNormal(pts[i - 1], p) : null;
    const nextN = i < pts.length - 1 ? rightNormal(p, pts[i + 1]) : null;
    if (!prevN || !nextN) {
      at(p, prevN ?? nextN);
      continue;
    }
    let jx = prevN[0] + nextN[0], jy = prevN[1] + nextN[1];
    const jl = Math.hypot(jx, jy);
    if (jl) { jx /= jl; jy /= jl; }
    const cosHalf = jx * nextN[0] + jy * nextN[1];
    const miter = cosHalf !== 0 ? 1 / cosHalf : Infinity;
    const scale = Math.min(miter, MAX_OFFSET_MITER_LENGTH);
    const join = [jx * scale, jy * scale];
    const fallback = clamp((miter - OFFSET_FALLBACK_START) / (OFFSET_FALLBACK_END - OFFSET_FALLBACK_START), 0, 1);
    const sharp = cosHalf < COS_HALF_SHARP_CORNER;
    // A sharp corner's extra vertex before it, on the previous segment.
    if (sharp) {
      const a = pts[i - 1];
      const len = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (len > 2 * sharpStep) at([p[0] - ((p[0] - a[0]) * sharpStep) / len, p[1] - ((p[1] - a[1]) * sharpStep) / len], prevN);
    }
    if (fallback > 0) {
      // Two vertices, each eased from the join towards its segment's normal.
      at(p, [join[0] + (prevN[0] - join[0]) * fallback, join[1] + (prevN[1] - join[1]) * fallback]);
      at(p, [join[0] + (nextN[0] - join[0]) * fallback, join[1] + (nextN[1] - join[1]) * fallback]);
    } else {
      at(p, join);
    }
    // And after it, on the next segment.
    if (sharp) {
      const b = pts[i + 1];
      const len = Math.hypot(b[0] - p[0], b[1] - p[1]);
      if (len > 2 * sharpStep) at([p[0] + ((b[0] - p[0]) * sharpStep) / len, p[1] + ((b[1] - p[1]) * sharpStep) / len], nextN);
    }
  }
  return out;
}

export const offsetParts = (parts, offset, z) => parts.map((part) => offsetPart(part, offset, z));

// The width MapLibre draws and hit-tests a line at (getLineWidth in
// src/style/style_layer/line_style_layer.ts): with a gap, the gap plus a line
// on each side; without, the line's own width.
export const drawnWidth = (width, gapWidth = 0) => (gapWidth > 0 ? gapWidth + 2 * width : width);

// How far a line's end reaches past its last point: half its width for a
// round or square cap, nothing for a butt cap.
export const capReach = (cap, width) => (cap === 'round' || cap === 'square' ? width / 2 : 0);
