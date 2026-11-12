// The sizes and zooms the page draws rail and stations at, which the build
// also needs to place station marks (scripts/lib/stationmarks.mjs, DESIGN.md
// "Stations" and "Shared track"). One plain module with no DOM or MapLibre in
// it, so the page imports it as './sizes.js' and the build, run by Node,
// imports the same file as '../../public/js/sizes.js'. It lives here rather
// than in scripts/ because the site is served from public/ as it is, with no
// copy step: a file under scripts/ would need one to reach the page.

// The zooms the map's widths are given at (byZoom in shared.js).
export const ZOOMS = [9, 11, 13, 16];

// Rail is heavier than any bus at every zoom; this is a line's width at the
// ZOOMS stops where it runs every 15 minutes or better (the thinner bands
// for less frequent rail are RAIL_BANDS, network.js). On shared track, lines
// run side by side with RAIL_GAP between them (DESIGN.md, "Shared track").
export const RAIL_WIDTH = [3, 4, 5.6, 9];
export const RAIL_GAP = 2;
// Stations are drawn at the widest zoom's line spacing and scaled down with
// the lines, so a station's mark always spans the lines beside each other.
export const STATION_SPACING = RAIL_WIDTH.at(-1) + RAIL_GAP;
// The tick (symbols.js, "dot-"): its size across the track, before scaling,
// across several lines and on one.
export const TICK = { across: 10, single: 8 };

// Below this zoom the map is an overview of the whole network: the lines, a
// letter at each rail line's end, and city names. Station marks, the names
// on end signs, bus numbers and FlexRide zones start here, where stations
// along a line are far enough apart on screen to tell apart. A phone showing
// the whole network is below it; a laptop is just above.
export const OVERVIEW_UNTIL = 9;
// The names of stations where routes meet, and the letters along rail lines,
// start here: just under the zoom the smallest phones open at (about 9.9),
// so every opening view has them.
export const NAMES_FROM = 9.75;
// Stations are ticks until CAPSULE_FROM and capsules from CAPSULE_TO.
export const CAPSULE_FROM = 10.25;
export const CAPSULE_TO = 11;
// Below this the rail is drawn from the far set (the build's sharedtrack.mjs
// FAR): tracks a few hundred metres apart as one pack, rounded wide, so a
// knot of tracks smaller than a line's width reads as one calm pack (#115).
// The station marks below it stand on the far set's lines (`stationsfar`).
// It ends where capsules have replaced ticks, on a whole zoom so the line
// letters (one set per whole zoom) switch with it; at 10.25 to 11 the near
// set still knots at Union. Both phones open below it (9.99 and 10.11).
export const FAR_UNTIL = CAPSULE_TO;
// A layer drawn from both sets: from the far source below FAR_UNTIL (its id
// with "-far") and from its own source from FAR_UNTIL.
export const bothSets = (far) => (layer) => [
  { ...layer, id: `${layer.id}-far`, source: far, ...(layer.minzoom != null ? { minzoom: layer.minzoom } : {}), maxzoom: FAR_UNTIL },
  { ...layer, minzoom: Math.max(layer.minzoom ?? 0, FAR_UNTIL) },
];
export const bothRailSets = bothSets('railfar');
// A station's tick waits for zoom `tickFrom`, in quarter zooms, where a
// stronger station is too near (the build decides it in these steps).
export const FAR_STEP = 0.25;
// A one-way chevron's picture (symbols.js), in px [along, across] at
// icon-size 1.
export const CHEVRON = [10, 14];
