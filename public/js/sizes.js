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
// The hub's ring (symbols.js, "hub-"): as wide as a tick across its lines
// plus this much, so it encloses the knot.
export const HUB_EXTRA = 12;

// A frequent bus's width at the ZOOMS stops (shared.js's TIERS draws it;
// the thinner tiers are there too). Bus routes that share a street are
// drawn side by side (scripts/lib/busbundles.mjs): each piece is `slot`
// slots from the street's path, a slot being a frequent bus's width times
// BUS_PITCH, the same for every route in a bundle so thin routes don't
// overlap thick ones. Up to BUS_BUNDLE_FROM the map draws each street once,
// on RTD's own paths, as main does (the stretches marked `flat`). From
// there it draws the bundles' pieces, and the slots open from nothing at
// BUS_BUNDLE_FROM to their full pitch at BUS_BUNDLE_OPEN, so a pack fans
// out over half a zoom instead of one line becoming twelve in a step
// (busOffset, bundledByZoom, shared.js; a paint property that reads the
// feature and the zoom is worked out at the whole zooms and blended between
// them, so each stage is a layer of its own with stops set to land right at
// these zooms). At BUS_BUNDLE_OPEN the widest downtown bundle (12 routes,
// 2026-11-08) is 59 px from first line to last; the two widest streets
// are two blocks (98 px) apart there, so the packs clear each other. The
// pitch leaves 0.4 of a width of land between neighbours at a route's full
// width, and 0.65 at a pack member's (PACK_WIDTH, shared.js): 2.5 px at
// 14.5. At 1.15 the gap was under a pixel and neighbours fused.
export const FREQUENT_BUS_WIDTH = [1.2, 1.9, 3, 5.2];
export const BUS_PITCH = 1.4;
export const BUS_BUNDLE_FROM = 14;
export const BUS_BUNDLE_OPEN = 14.5;
// A frequent bus's width at `zoom`, as the map interpolates it (byZoom,
// shared.js: exponential, base 1.4, between the ZOOMS stops).
export const frequentWidth = (zoom) => {
  const w = FREQUENT_BUS_WIDTH;
  if (zoom <= ZOOMS[0]) return w[0];
  for (let i = 1; i < ZOOMS.length; i++) {
    if (zoom > ZOOMS[i]) continue;
    const t = (1.4 ** (zoom - ZOOMS[i - 1]) - 1) / (1.4 ** (ZOOMS[i] - ZOOMS[i - 1]) - 1);
    return w[i - 1] + t * (w[i] - w[i - 1]);
  }
  return w.at(-1);
};

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
// The hub's ring from here.
export const HUB_FROM = NAMES_FROM;
// A station's tick waits for zoom `tickFrom`, in quarter zooms, where a
// stronger station is too near (the build decides it in these steps).
export const FAR_STEP = 0.25;
