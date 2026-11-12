// A bus street beside rail (DESIGN.md, "Bus routes", "Beside rail"; #97).
// Rail is drawn at a width on screen that doesn't change with zoom, so a pack
// of lines covers more ground the further out you go, and a street that
// really runs beside the track ends up under it, its stops on the rail. From
// BESIDE_FROM in, the build draws each bus line near rail again for every
// zoom band (BESIDE_BANDS), moved straight away from the track by just enough
// to clear the pack's edge at that zoom, and no more: where the street is
// already clear it stays where it is, so it is never drawn nearer the rail
// than it is (scripts/lib/beside.mjs). The page shows the copy for the zoom
// it is at (network.js, `besideLayers`). These are the numbers both sides
// use. One plain module with no DOM or MapLibre in it: the page imports it as
// './beside.js' and the build as '../../public/js/beside.js'.

import { RAIL_GAP, RAIL_WIDTH, ZOOMS } from './sizes.js';
import { classWidthAt, interpolateAt } from './frequency.js';

// From this zoom a bus line beside rail is drawn clear of it, eased in over
// BESIDE_EASE; further out, rail floats over the buses as it does everywhere
// (the overview is lines, not streets).
export const BESIDE_FROM = 14;
export const BESIDE_EASE = 1;
// The land between the rail's white casing and the street's edge: the gap the
// map already leaves between a street and a part-time line beside it
// (network.js, BESIDE_GAP), so a street beside rail reads as a line beside it.
export const BESIDE_GAP_PX = 2.2;
// The zoom bands, each drawn with its own copy, a quarter of a zoom wide
// (across a band the gap grows by at most a fifth, and the move grows in
// steps of a pixel or two while it eases in). A copy is moved for its band's
// lowest zoom, where it needs moving most. Past the last band, nothing is
// near enough to the track to need moving (MIN_APART, beside.mjs).
export const BESIDE_UNTIL = 18;
export const BESIDE_BANDS = Array.from({ length: (BESIDE_UNTIL - BESIDE_FROM) * 4 }, (_, i) => BESIDE_FROM + i / 4);
// How much of the move a band makes: none at BESIDE_FROM, all of it by
// BESIDE_FROM + BESIDE_EASE (measured at the band's middle).
export const besideRamp = (k) => {
  const mid = (BESIDE_BANDS[k] + (BESIDE_BANDS[k + 1] ?? BESIDE_BANDS[k] + 0.25)) / 2;
  return Math.min(1, Math.max(0, (mid - BESIDE_FROM) / BESIDE_EASE));
};

// Meters on the ground per screen pixel at the equator at zoom 0 (512 px
// tiles); multiply by cos(latitude) and divide by 2^zoom.
export const METERS_PER_PX_Z0 = 78271.517;
export const metersPerPx = (zoom, lat) => (METERS_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

// A full-width rail line's width at a zoom, as network.js draws it (railWidth).
export const railWidthAt = (zoom) => interpolateAt(RAIL_WIDTH, zoom, ZOOMS);

// How far from a pack's middle, in px, a street's middle must be drawn to
// clear it: `edge` is the outermost line's slot toward the street (network.js
// railOffset: a slot is a line width and a gap), plus that line's casing,
// the gap, and half the street's width.
export function clearPx(edge, cls, zoom) {
  const w = railWidthAt(zoom);
  return edge * (w + RAIL_GAP) + (w + RAIL_GAP + 1) / 2 + BESIDE_GAP_PX + classWidthAt(cls, zoom) / 2;
}

// The farthest from the track, in meters, a street can be and still need
// moving: where it would be under the pack at the first band that moves it.
export const reachMeters = (edge, cls, lat) => clearPx(edge, cls, BESIDE_FROM) * metersPerPx(BESIDE_FROM, lat);
