// The seam check for the zoomable map's drawings served as tiles (#237): labels the build places
// must not be cut or doubled at a tile edge. Pure geometry over the same cut the tiles get
// (scripts/tiles.mjs, cutData), so what it says here is what the tiles hold.
//
// Two faults, each with a planted control the caller must run first (a detector that reports
// nothing at a known fault is broken, not proof the map is right — CLAUDE.md, "Checks"):
//   cut     a label the page always shows as one line — a placed list's room (`list-room`), a
//           station's bar (`station`), a terminal's hall (`hall`) — that no tile holds whole
//           within its buffer, so it is clipped at every edge it crosses and the label is drawn
//           in pieces. The sheets are cut the same way with the same buffer, and a placed list's
//           stretch of street is whole in the tile that places it (DESIGN.md, "Tiles"): this is
//           the same rule, checked rather than assumed for the zoom map's five drawings and two
//           rail ones.
//   doubled the build's own fault at an edge: one label placed twice at one place, so the page
//           (which draws every placed label with allow-overlap, hiding none) letters it twice —
//           and where the two differ in what the page letters by, MapLibre's cross-tile dedup
//           has nothing to collapse either.
import { TILING } from '../../public/js/sheets/style.js';

// The tiles are cut 512 px across with TILING.buffer px of buffer beyond every edge
// (scripts/tiles.mjs cut them that way; MapLibre cut the sheets' GeoJSON the same on the phone).
const SPAN = 512;

/** A lon/lat point in the mercator pixels of a whole `zoom`, 512 px to a tile. */
export const px = ([lon, lat], zoom) => {
  const world = SPAN * 2 ** zoom;
  return [(lon + 180) / 360 * world, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * world];
};

/** A feature's lon/lat bounds as [w, s, e, n]. */
export const boundsOf = (f) => {
  let [w, s, e, n] = [180, 90, -180, -90];
  const each = (c) => (typeof c[0] === 'number'
    ? (() => { const [x, y] = c; w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); })()
    : c.forEach(each));
  each(f.geometry.coordinates);
  return [w, s, e, n];
};

/** Which tile at `zoom` holds `bounds` whole, its buffer included, if any does: the tile's
 * buffered extent is the tile grown by TILING.buffer px on every side of a 512 px tile, and the
 * tiles cover the world 512 px apart at that zoom. */
export const wholeInOneTile = (bounds, zoom, buffer = TILING.buffer) => {
  const [w, s, e, n] = bounds;
  const [Ex, Ny] = px([e, n], zoom), [Wx, Sy] = px([w, s], zoom);
  if (Ex - Wx > SPAN + 2 * buffer || Ny - Sy > SPAN + 2 * buffer) return null;
  for (let x = Math.max(0, Math.floor(Wx / SPAN) - 1); x <= Math.min(2 ** zoom - 1, Math.floor(Ex / SPAN) + 1); x++) {
    for (let y = Math.max(0, Math.floor(Ny / SPAN) - 1); y <= Math.min(2 ** zoom - 1, Math.floor(Sy / SPAN) + 1); y++) {
      if (Wx >= x * SPAN - buffer && Ex <= (x + 1) * SPAN + buffer && Ny >= y * SPAN - buffer && Sy <= (y + 1) * SPAN + buffer) return { x, y };
    }
  }
  return null;
};

/** What the page letters a placed label by: its own key where it has one, else its kind and text.
 * A feature carried by one drawing for each of the sets the page hands over between (`ref`: the
 * rail drawings' two copies of one station's bar or line letter, one of which ever shows) is one
 * label per set, not one placed twice. */
export const labelKey = (f) => `${f.properties.key ?? `${f.properties.kind}|${f.properties.label ?? f.properties.text ?? f.properties.routes ?? f.properties.id ?? ''}`}${f.properties.ref !== undefined ? ` @${f.properties.ref}` : ''}`;

/** The seam faults of `features` at each of `zooms`, as the tiles are cut there. `whole` are the
 * kinds the page always shows as one line; `points` are the kinds it always shows at a place.
 * Returns [{ fault, zoom, kind, key, detail }]. */
export function seamFaults(features, { zooms, buffer = TILING.buffer, whole = ['list-room', 'station', 'hall'], points = ['bus-list', 'bus-stack', 'bus-end', 'letter', 'name'] }) {
  const faults = [];
  for (const zoom of zooms) {
    for (const f of features) {
      const kind = f.properties?.kind;
      if (whole.includes(kind) && f.geometry.type !== 'Point' && !wholeInOneTile(boundsOf(f), zoom, buffer)) {
        faults.push({ fault: 'cut', zoom, kind, key: labelKey(f), detail: 'no tile at this zoom holds it whole' });
      }
    }
    // One label placed twice at one place — within 2 px of it at this zoom for a point, or
    // bounds overlapping for a line: two lists on different streets share a key and are not one.
    // Labels group by kind and key first, so a drawing of many only compares its own names.
    const placed = features.filter((f) => points.includes(f.properties?.kind) || (whole.includes(f.properties?.kind) && f.geometry.type === 'Point'));
    const overlaps = (a, b) => {
      const [aw, as, ae, an] = boundsOf(a), [bw, bs, be, bn] = boundsOf(b);
      return aw <= be && bw <= ae && as <= bn && bs <= an;
    };
    const byKey = new Map();
    for (const f of placed) {
      const key = `${f.properties.kind}|${labelKey(f)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(f);
    }
    for (const group of byKey.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const [a, b] = [group[i], group[j]];
          const near = a.geometry.type === 'Point'
            ? Math.hypot(...[0, 1].map((k) => px(a.geometry.coordinates, zoom)[k] - px(b.geometry.coordinates, zoom)[k])) <= 2
            : overlaps(a, b);
          if (!near) continue;
          const placement = (f) => JSON.stringify([f.properties.angle, f.properties.anchor, f.properties.justify, f.properties.offset, f.geometry.coordinates]);
          faults.push({ fault: 'doubled', zoom, kind: a.properties.kind, key: labelKey(a),
            detail: placement(a) === placement(b) ? 'placed twice, identical' : 'placed twice, differing' });
        }
      }
    }
  }
  return faults;
}

/** The planted controls (CLAUDE.md, "Checks"): each fault this check names, planted where it
 * lives, must be caught. Throws if any passes silently; returns what was planted, for the report. */
export function seamControls({ zoom = 12 } = {}) {
  // A tile at `zoom` spans 360/2**zoom degrees of longitude, 512 px; the buffer (256 px) reaches
  // half a tile again beyond each edge. A room line three tiles wide crosses every edge it meets
  // with no tile holding it whole; one that straddles an edge but stays within the buffer is
  // held whole by both tiles and must not be flagged.
  const step = 360 / 2 ** zoom;
  const center = [-104.99, 39.74];
  const line = (coordinates, label, kind = 'list-room') => ({ type: 'Feature', properties: { kind, label }, geometry: { type: 'LineString', coordinates } });
  const point = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
  const planted = {
    cut: line([[center[0] - 1.5 * step, center[1]], [center[0] + 1.5 * step, center[1]]], 'planted-cut'),
    whole: line([[center[0] - 0.45 * step, center[1] + 0.01], [center[0] + 0.45 * step, center[1] + 0.01]], 'planted-whole'),
    doubled: [point({ kind: 'bus-list', key: 'planted-doubled', label: '0', angle: 0 }, center),
      point({ kind: 'bus-list', key: 'planted-doubled', label: '0', angle: 90 }, center)],
    apart: [point({ kind: 'bus-list', label: '0', angle: 0 }, center),
      point({ kind: 'bus-list', label: '0', angle: 90 }, [center[0] + 5 * step, center[1]])],
  };
  const faults = seamFaults([planted.cut, planted.whole, ...planted.doubled, ...planted.apart], { zooms: [zoom] });
  const caught = new Map(faults.map((f) => [f.fault, f]));
  for (const fault of ['cut', 'doubled']) if (!caught.has(fault)) throw new Error(`the seam check missed a planted ${fault} fault at zoom ${zoom}`);
  if (faults.some((f) => f.key === labelKey(planted.whole))) throw new Error('the seam check flagged a room line a tile holds whole');
  if (faults.some((f) => f.key === labelKey(planted.apart[0]))) throw new Error('the seam check called two lists a tile apart one label placed twice');
  return { planted: ['cut', 'whole', 'doubled', 'apart'], caught: faults.length };
}
