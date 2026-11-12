import { ZOOMS } from './sizes.js';

// How often a bus comes along a street, all routes counted together
// (DESIGN.md, "Bus routes"): the classes the map draws streets in, from the
// combined buses per hour in the busier direction over the weekday window.
// One plain module with no DOM or MapLibre in it, so the page imports it as
// './frequency.js' and the build (scripts/lib/streets.mjs), run by Node,
// imports the same file as '../../public/js/frequency.js', the way sizes.js
// is shared. Strongest first. `min` is the least buses per hour for the
// class; the label says it as a wait, the way riders think of it.
export const STREET_CLASSES = [
  { id: 'c3', label: 'Every 3 min or better', min: 20 },
  { id: 'c5', label: 'Every 4 to 5 min', min: 12 },
  { id: 'c10', label: 'Every 6 to 10 min', min: 6 },
  { id: 'c15', label: 'Every 11 to 15 min', min: 4 },
  { id: 'c30', label: 'Every 16 to 30 min', min: 2 },
  { id: 'c60', label: 'Every 31 min or more', min: 0 },
];

// The class for a street carrying `bph` buses per hour (busier direction).
export const classOf = (bph) => STREET_CLASSES.find((c) => bph >= c.min - 1e-9)?.id ?? STREET_CLASSES.at(-1).id;
export const CLASS_RANK = Object.fromEntries(STREET_CLASSES.map((c, i) => [c.id, STREET_CLASSES.length - i]));

// How wide each class is drawn, in px at the zooms in sizes.js (ZOOMS), and the
// zoom it fades in from (DESIGN.md, "Bus routes"). Here rather than in
// shared.js so the build can read the widths too (scripts/lib/beside.mjs: how
// far a street beside rail must be drawn from the track to clear it).
export const STREET_WIDTH = { c3: { width: [2.8, 4.4, 7, 14], from: 0 }, c5: { width: [2.1, 3.3, 5, 10], from: 0 }, c10: { width: [1.6, 2.5, 3.6, 7.2], from: 0 }, c15: { width: [1.2, 1.8, 2.6, 5.2], from: 0 }, c30: { width: [0.8, 1.2, 1.7, 3.4], from: 9 }, c60: { width: [0.45, 0.6, 1, 2], from: 10.5 } };

// A class's width in pixels at a zoom, as the map interpolates it
// (exponential, base 1.4, between the ZOOMS stops).
export function classWidthAt(cls, zoom, zooms = ZOOMS) {
  const c = STREET_WIDTH[cls] ?? STREET_WIDTH.c60;
  return interpolateAt(c.width, zoom, zooms);
}

// A value given at `zooms`, at `zoom`, interpolated the way the map's
// ['interpolate', ['exponential', 1.4], ['zoom'], ...] does.
export function interpolateAt(values, zoom, zooms = ZOOMS) {
  if (zoom <= zooms[0]) return values[0];
  if (zoom >= zooms.at(-1)) return values.at(-1);
  const i = zooms.findIndex((z, k) => zoom < zooms[k + 1]);
  const t = (1.4 ** (zoom - zooms[i]) - 1) / (1.4 ** (zooms[i + 1] - zooms[i]) - 1);
  return values[i] + (values[i + 1] - values[i]) * t;
}
