// RTD's network as map layers (DESIGN.md, "Map design"): the rail style for
// each theme (railStyle), the lines and areas beneath the basemap's place
// names (transitLines), and the stations, signs, letters and names above
// them (transitMarks), with the zooms and rules that place them ("Stations",
// "Shared track", "Bus routes", "Where the labeling rules come from"). Also
// the GeoJSON sources the layers read (dataSources) and the one file that
// loads only when the map gets close (loadWhenNeeded). Layer definitions
// only: the pictures they name are drawn by symbols.js, and the Key reads the
// same definitions (legend.js).

import { FONT, lineKeepOut } from './basemap.js';
import { lightenTo, shade, textOn } from './color.js';
import { DARK_RAIL_MIN, P, PALETTES } from './palette.js';
import { CLASS_RANK, DETAIL_FROM, PART_TIME, byZoom, classMatch, classWidth, classWidthAt, classWidthTimes, tierMatch, tierWidth } from './shared.js';
import { CAPSULE_FROM, CAPSULE_TO, FAR_STEP, HUB_FROM, NAMES_FROM, OVERVIEW_UNTIL, RAIL_GAP, RAIL_WIDTH, STATION_SPACING, ZOOMS } from './sizes.js';
import { fade, isRoute, inList, onRoute, selectionLines, selectionMarks } from './highlight.js';
import { edgeLetterLayer } from './edgeletters.js';

// Rail is heavier than any bus at every zoom. On shared track, lines run side
// by side with a white gap between them (DESIGN.md, "Shared track"). Width
// steps at the bus headway boundaries: 15 minutes or better is full width,
// 16-30 and 31-60 are a step thinner, over 60 thinner still (DESIGN.md,
// "Rail frequency"). Widths are at zoom 9, 11, 13 and 16. The full width
// (RAIL_WIDTH) and the gap (RAIL_GAP) are in sizes.js.
const RAIL_BANDS = [
  { max: 15, width: RAIL_WIDTH },
  { max: 30, width: [2.2, 3, 4.3, 6.8] },
  { max: 60, width: [1.6, 2.3, 3.5, 6] },
  { max: Infinity, width: [1.4, 2, 3.1, 5.4] },
];

// Bus stops are the largest file, so they load only near the zoom that shows them.
const STOPS_ZOOM = 15;
const STOPS_PRELOAD_ZOOM = 14;

// A bus line fades in by tier as you zoom, and to 20% when another route is open.
const fadeIn = ['interpolate', ['linear'], ['zoom'], ...[8, 9, 10, 11, 12, 13].flatMap((z) => [z, ['*', tierMatch((t) => Math.min(1, Math.max(0, (z - t.from) / 1.5 + 0.25))), fade(isRoute())]])];
// A street fades in by class the same way, and to 20% when a route that
// isn't on it is open.
const onStreet = inList('routes');
const streetFade = ['interpolate', ['linear'], ['zoom'], ...[8, 9, 10, 11, 12, 13].flatMap((z) => [z, ['*', classMatch((c) => Math.min(1, Math.max(0, (z - c.from) / 1.5 + 0.25))), fade(onStreet)]])];
// Inside a shared street, from STRANDS_FROM, a hairline between each pair
// of routes hints how many run there, like strands in a cable: no gap and no
// land between them, so the street still reads as one line. Up to
// STRANDS_MAX routes; a street with more is too crowded for strands to read
// and gets a core line instead, which says "many routes" without counting.
const STRANDS_FROM = 13.5;
const STRANDS_MAX = 6;
// A strand narrower than this (the street's width over its routes) can't
// hold a seam: the seams wait for the zoom where the strands have room.
// Every route on the street has a strand, part-time ones too (`pt`, beside
// the all-day ones), and a seam that bounds a part-time strand is dashed.
const STRAND_MIN = 2.6;
const strands = ['+', ['get', 'n'], ['coalesce', ['get', 'pt'], 0]];
const strandWidth = ['interpolate', ['linear'], ['zoom'], STRANDS_FROM, 0.6, 16, 1];
// A strand's width in pixels at a zoom, as the map interpolates it (the
// hairline beside a narrow street needs a gap measured from its edge).
const strandAt = (z) => 0.6 + (Math.min(16, Math.max(STRANDS_FROM, z)) - STRANDS_FROM) * (0.4 / (16 - STRANDS_FROM));
// The land between a narrow street's edge and a part-time hairline beside
// it: wide enough to read as a gap at phone scale, no wider.
const BESIDE_GAP = 2.2;
// ...and only along a street at least this long (metres): on the few metres
// of street where a route turns round or two junctions nearly meet, a
// dashed piece that short reads as a speck, not a line.
const BESIDE_MIN_LEN = 25;
const strandRoom = (zoom) => ['>=', ['/', classMatch((c) => classWidthAt(c.id, zoom)), strands], STRAND_MIN];
const strandZooms = Array.from({ length: Math.round((18 - STRANDS_FROM) / 0.5) + 1 }, (_, i) => STRANDS_FROM + i / 2);
const strandFade = ['step', ['zoom'], 0, ...strandZooms.flatMap((z) => [z, ['case', strandRoom(z), fade(onStreet), 0]])];
const coreFade = ['interpolate', ['linear'], ['zoom'], STRANDS_FROM, 0, STRANDS_FROM + 1, fade(onStreet)];
// One-way streets (the build's `oneway`, drawn the way the buses go) carry
// chevrons from ARROWS_FROM, about ARROW_SPACING px apart; two-way streets
// none, so an arrow means "one way" (DESIGN.md, "Bus routes"). One glyph,
// one size on every street (a light chevron cased in the darkest ink, which
// reads inside a wide line and over a hairline alike), so two arrows never
// differ; none on a one-way piece shorter than ARROW_MIN_LEN meters, where
// an arrow would sit at a junction rather than along a street.
const ARROWS_FROM = 14;
const ARROW_SPACING = 300;
const ARROW_MIN_LEN = 250;
const arrowSize = ['interpolate', ['linear'], ['zoom'], ARROWS_FROM, 0.62, 16, 0.78];
const arrowFade = ['interpolate', ['linear'], ['zoom'], ARROWS_FROM, 0, ARROWS_FROM + 0.5, fade(onStreet)];
// Width from the line's weekday headway, at the bus tier boundaries: <=15
// minutes full width, 16-30 and 31-60 a step down, over 60 thinner still. A
// line with no weekday headway (weekend-only, or not running) is thinnest.
const railWidth = (extra = 0) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [
    z,
    ['step', ['coalesce', ['get', 'wk'], 1000], RAIL_BANDS[0].width[i] + extra, ...RAIL_BANDS.slice(1).flatMap((band, k) => [RAIL_BANDS[k].max + 1, band.width[i] + extra])],
  ])];
// Each piece of rail is `slot` line widths to the side of its track's center.
const railOffset = byZoom(RAIL_WIDTH.map((w) => ['*', ['get', 'slot'], w + RAIL_GAP]));
// Stations are drawn at the widest zoom's line spacing (STATION_SPACING,
// sizes.js) and scaled down with the lines.
const stationSize = byZoom(RAIL_WIDTH.map((w) => (w + RAIL_GAP) / STATION_SPACING));
// A rail letter: its text size in px, and its circle's scale by zoom.
const LETTER_SIZE = 11;
const LETTER_SCALE = [{ zoom: 10.5, size: 0.85 }, { zoom: 14, size: 1 }];
// Moves a rail letter from the middle of its track onto its own line. The
// build gives each letter `sx` and `sy`: how many line spacings right and
// down the screen its line is drawn (the map doesn't turn). An offset can't
// be made from two numbers, so it is interpolated between the corners of a
// square LETTER_REACH spacings each way. A symbol is laid out once per whole
// zoom and kept until the next, so the stops are half a zoom early: the
// letter is right in the middle of that range and within a pixel or two at
// its ends. `unit(zoom)`: how many px one unit of the offset is.
const LETTER_REACH = 4;
const letterOffset = (unit) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => {
    const reach = (LETTER_REACH * (RAIL_WIDTH[i] + RAIL_GAP)) / unit(z);
    const down = (x) => ['interpolate', ['linear'], ['coalesce', ['get', 'sy'], 0], -LETTER_REACH, ['literal', [x, -reach]], LETTER_REACH, ['literal', [x, reach]]];
    return [z - 0.5, ['interpolate', ['linear'], ['coalesce', ['get', 'sx'], 0], -LETTER_REACH, down(-reach), LETTER_REACH, down(reach)]];
  })];

// A line's letter claims its space before a bus number does: a line with no
// letter can't be named, and a number has the rest of its route to sit on.
export function lettersFirst(layers) {
  const [letters] = layers.splice(layers.findIndex((l) => l.id === 'rail-bullets'), 1);
  // The letters added where a line enters the screen (edgeletters.js) go right after.
  layers.splice(layers.findIndex((l) => l.id === 'line-signs'), 0, letters, edgeLetterLayer(letters));
  return layers;
}

export const DATA_SOURCES = ['flexride', 'routes', 'streets', 'stations', 'facilities', 'labels', 'stops'];
// Loaded when the map gets close enough to need them (see loadWhenNeeded).
const LAZY = ['stops'];
const EMPTY = { type: 'FeatureCollection', features: [] };

// By URL, so each file downloads and parses in the map's worker.
export function dataSources() {
  return {
    ...Object.fromEntries(
      DATA_SOURCES.map((name) => [name, { type: 'geojson', data: LAZY.includes(name) ? EMPTY : `data/${name}.geojson` }]),
    ),
    // A letter for each rail line on screen that has none (edgeletters.js).
    'rail-edge-letters': { type: 'geojson', data: EMPTY },
    // The route that is open: its two ends, named on the map.
    selection: { type: 'geojson', data: EMPTY },
    // Vehicles at their live positions (live.js), while Live is on.
    vehicles: { type: 'geojson', data: EMPTY },
  };
}

// Each rail line keeps RTD's own color; a thin outline in a darker shade of
// the same hue keeps light colors (A, C, G, R) visible on the light map
// (DESIGN.md, "Rail line colors"). Bullet letters are white or ink, whichever
// reads better.
//
// On the dark map the rule runs the other way: a color that is too dark to see
// against the dark land (E, N, T, sometimes D) is lifted, in OKLab, with its
// hue kept, only as far as DARK_RAIL_MIN; colors already bright enough are
// untouched. The outline is then a darker shade of the lifted color. Both
// themes' values are worked out here from the data and nothing else; the one
// in use is `lines.color`, `.edge` and `.letter` (map expressions), and
// `lines.of(route)`. `byRoute` entries carry both, as `.light` and `.dark`.
export function railStyle(rail) {
  const byRoute = new Map(
    rail.map((r) => {
      const lifted = lightenTo(r.color, PALETTES.dark.land, DARK_RAIL_MIN);
      return [
        r.route,
        {
          ...r,
          light: { color: r.color, edge: shade(r.color, 0.72, PALETTES.light.land, 3), letter: textOn(r.color, PALETTES.light.onColor) },
          dark: { color: lifted, edge: shade(lifted, 0.6, PALETTES.dark.land, 1), letter: textOn(lifted, PALETTES.dark.onColor) },
        },
      ];
    }),
  );
  const match = (key, fallback) =>
    byRoute.size ? ['match', ['get', 'route'], ...[...byRoute].flatMap(([route, s]) => [route, s[P.scheme][key]]), fallback] : fallback;
  return {
    byRoute,
    of: (route) => byRoute.get(route)?.[P.scheme],
    get color() {
      return match('color', ['coalesce', ['get', 'color'], P.ink]);
    },
    get edge() {
      return match('edge', P.ink);
    },
    get letter() {
      return match('letter', P.white);
    },
  };
}

const bus = ['==', ['get', 'mode'], 'bus'];
const rail = ['==', ['get', 'mode'], 'rail'];
const partTime = ['in', ['get', 'tier'], ['literal', PART_TIME]];
const served = ['==', ['get', 'served'], true];

// Lines and areas, beneath the basemap's place names.
// A divided road is one line out to MERGED_UNTIL and its two carriageways
// from there in (scripts/lib/streets.mjs, #81): the build tags those streets
// `zoom: 'far'` or `'near'`, and every street layer shows each set only on
// its side of the zoom. A street with no tag shows at every zoom.
const MERGED_UNTIL = 16;
const streetZoom = [
  'any',
  ['==', ['coalesce', ['get', 'zoom'], ''], ''],
  ['all', ['==', ['get', 'zoom'], 'far'], ['<', ['zoom'], MERGED_UNTIL]],
  ['all', ['==', ['get', 'zoom'], 'near'], ['>=', ['zoom'], MERGED_UNTIL]],
];
// The street layers draw streets with an all-day route (`n` > 0); a street
// with only part-time routes (`n` 0) is drawn by the part-time layers.
const allDayStreet = ['>', ['coalesce', ['get', 'n'], 0], 0];
const withStreetZooms = (layers) =>
  layers.map((l) => (l.source === 'streets' ? { ...l, filter: ['all', streetZoom, ...(l.id.startsWith('street') ? [allDayStreet] : []), ...(l.filter ? [l.filter] : [])] } : l));

export function transitLines(lines) {
  return withStreetZooms([
    // FlexRide: a light hatch with a dashed edge, never a green that reads as park.
    // Not until close in: further out, zone outlines are boxes around
    // nothing, and read as city limits.
    {
      id: 'flexride-fill',
      type: 'fill',
      source: 'flexride',
      minzoom: DETAIL_FROM,
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], DETAIL_FROM, 0, 11.75, 0.6, 12.5, 0.85] },
    },
    {
      id: 'flexride-line',
      type: 'line',
      source: 'flexride',
      minzoom: DETAIL_FROM,
      paint: {
        'line-color': P.flex.edge,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], DETAIL_FROM, 0, 11.75, 0.9],
        'line-dasharray': [3, 2],
      },
    },

    {
      id: 'bus-part-time',
      type: 'line',
      // Part-time streets from the street graph (streets.mjs, `n` 0), so a
      // part-time line meets the streets it joins.
      source: 'streets',
      filter: ['all', bus, ['==', ['coalesce', ['get', 'n'], 0], 0], partTime, ['!=', ['get', 'tier'], 'limited']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(), 'line-opacity': fadeIn, 'line-dasharray': [3, 2] },
    },
    {
      id: 'bus-limited',
      type: 'line',
      source: 'streets',
      filter: ['all', bus, ['==', ['coalesce', ['get', 'n'], 0], 0], ['==', ['get', 'tier'], 'limited']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(), 'line-opacity': fadeIn, 'line-dasharray': [0.1, 2.2] },
    },
    // Every street a bus runs on all day, drawn once at the width of the
    // buses along it, all routes counted (DESIGN.md, "Bus routes"; the
    // build: scripts/lib/streets.mjs). Butt ends: a run ends flush where
    // its routes part, and the heavier run carries on through the crossing
    // (the build gives it the point), so widths step with no blob or notch.
    {
      id: 'street',
      type: 'line',
      source: 'streets',
      // Round ends: streets meet at the street graph's nodes (#80), so a
      // street turning into another at an angle shows no notch at the
      // corner, and a route's own end is rounded.
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': classMatch((c) => CLASS_RANK[c.id]),
      },
      paint: { 'line-color': classMatch((c) => c.color), 'line-width': classWidth(), 'line-opacity': streetFade },
    },
    ...[false, true].flatMap((dashed) =>
      Array.from({ length: STRANDS_MAX - 1 }, (_, i) => i + 1).map((k) => ({
        id: `street-strand-${dashed ? 'pt-' : ''}${k}`,
        type: 'line',
        source: 'streets',
        minzoom: STRANDS_FROM,
        // Seam k lies between strand k and k + 1; past the all-day strands
        // it bounds a part-time one.
        filter: ['all', ['>', strands, k], ['<=', strands, STRANDS_MAX], [dashed ? '>=' : '<', k, ['get', 'n']]],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': P.strand,
          'line-width': strandWidth,
          // The k-th seam of n equal strands, measured from the line's middle.
          'line-offset': classWidthTimes(['-', ['/', k, strands], 0.5]),
          'line-opacity': strandFade,
          ...(dashed ? { 'line-dasharray': [3, 2] } : {}),
        },
      })),
    ),
    // A part-time route on a street too narrow for strands rides beside
    // it: a dashed hairline clear of the solid line, with a gap of land
    // between them so it reads as a second line rather than the first
    // line's edge, until the strands have room.
    {
      id: 'street-part-time-beside',
      type: 'line',
      source: 'streets',
      minzoom: ARROWS_FROM,
      filter: ['all', ['>', ['coalesce', ['get', 'pt'], 0], 0], ['<=', strands, STRANDS_MAX], ['>=', ['coalesce', ['get', 'len'], 0], BESIDE_MIN_LEN]],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': P.strand,
        'line-width': strandWidth,
        'line-offset': ['interpolate', ['linear'], ['zoom'], ...strandZooms.filter((z) => z >= ARROWS_FROM).flatMap((z) => [z, classMatch((c) => classWidthAt(c.id, z) / 2 + strandAt(z) / 2 + BESIDE_GAP)])],
        'line-dasharray': [3, 2],
        'line-opacity': ['step', ['zoom'], 0, ...strandZooms.filter((z) => z >= ARROWS_FROM).flatMap((z) => [z, ['case', strandRoom(z), 0, fade(onStreet)]])],
      },
    },
    {
      id: 'street-core',
      type: 'line',
      source: 'streets',
      minzoom: STRANDS_FROM,
      filter: ['>', strands, STRANDS_MAX],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': P.strand, 'line-width': classWidthTimes(0.34), 'line-opacity': coreFade },
    },

    {
      id: 'street-oneway',
      type: 'symbol',
      source: 'streets',
      minzoom: ARROWS_FROM,
      filter: ['all', ['==', ['get', 'oneway'], 1], ['>=', ['coalesce', ['get', 'len'], 0], ARROW_MIN_LEN]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': ARROW_SPACING,
        'icon-image': 'chevron',
        'icon-size': arrowSize,
        'icon-rotation-alignment': 'map',
        'icon-keep-upright': false,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': arrowFade },
    },
    // The open bus route, drawn over its faded neighbours.
    ...selectionLines(),

    // Rail floats over the buses on a white casing. Part-time rail goes
    // beneath full-service rail, so on shared track the line that runs wins.
    {
      id: 'rail-casing',
      type: 'line',
      source: 'routes',
      filter: rail,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.casing, 'line-width': railWidth(RAIL_GAP + 1), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail-part-time',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, partTime],
      paint: { 'line-color': lines.color, 'line-width': railWidth(-0.5), 'line-dasharray': [1.5, 1.2], 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail-edge',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.edge, 'line-width': railWidth(1), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.color, 'line-width': railWidth(), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
  ]);
}

// Stations, stops, symbols and our labels, above everything else.
export function transitMarks(lines) {
  const halo = { 'text-halo-color': P.land, 'text-halo-width': 1.8, 'text-halo-blur': 0.4 };
  return [
    {
      id: 'stops',
      type: 'circle',
      source: 'stops',
      minzoom: STOPS_ZOOM,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.4, 18, 5],
        'circle-color': P.stop.fill,
        'circle-stroke-color': P.stop.edge,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 18, 1.6],
        'circle-opacity': fade(inList('lines')),
        'circle-stroke-opacity': fade(inList('lines')),
      },
    },
    // Stations with no trains this week: a hollow gray ring, from closer in.
    {
      id: 'stations-unserved',
      type: 'circle',
      source: 'stations',
      // Rings and names arrive together (names are where there's room).
      minzoom: UNSERVED_ZOOM,
      filter: ['!', served],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], UNSERVED_ZOOM, 3.2, 16, 6.5],
        'circle-color': P.unserved.fill,
        'circle-stroke-color': P.unserved.edge,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], UNSERVED_ZOOM, 1.2, 16, 2],
        'circle-opacity': fade(onRoute),
        'circle-stroke-opacity': fade(onRoute),
      },
    },
    // In the overview stations aren't marked: a corridor of them is a ladder
    // over its line. From there a station is a small tick across the track,
    // which grows into the capsule by zoom 11. The build says how (DESIGN.md,
    // "Stations"): `tick` is the lines it spans (1, a dot, where they part
    // within its length), `tickBearing` the stretch's direction, and
    // `tickFrom` the zoom from which it's clear of a stronger station nearby.
    // The hub has its own ring from HUB_FROM.
    {
      id: 'stations-dot',
      type: 'symbol',
      source: 'stations',
      minzoom: OVERVIEW_UNTIL,
      maxzoom: CAPSULE_TO,
      filter: served,
      layout: {
        'icon-image': ['concat', 'dot-', ['coalesce', ['get', 'tick'], ['get', 'span']]],
        'icon-size': stationSize,
        'icon-rotate': ['coalesce', ['get', 'tickBearing'], ['get', 'bearing']],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': farOpacity((z) => (z < OVERVIEW_UNTIL + 0.4 ? (z - OVERVIEW_UNTIL) / 0.4 : z <= CAPSULE_FROM ? 1 : Math.max(0, (CAPSULE_TO - z) / (CAPSULE_TO - CAPSULE_FROM))), { hub: false }),
      },
    },
    // A white capsule across the track, as wide as the lines through it.
    // Until CAPSULE_TO, while it crossfades with the tick, it takes the
    // tick's span and direction, so the two are one mark.
    {
      id: 'stations',
      type: 'symbol',
      source: 'stations',
      minzoom: CAPSULE_FROM,
      filter: served,
      layout: {
        'icon-image': ['step', ['zoom'], ['concat', 'station-', ['coalesce', ['get', 'tick'], ['get', 'span']]], CAPSULE_TO, ['concat', 'station-', ['get', 'span']]],
        'icon-size': stationSize,
        'icon-rotate': ['step', ['zoom'], ['coalesce', ['get', 'tickBearing'], ['get', 'bearing']], CAPSULE_TO, ['get', 'bearing']],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': farOpacity((z) => Math.min(1, Math.max(0, (z - CAPSULE_FROM) / (CAPSULE_TO - CAPSULE_FROM))), { until: CAPSULE_TO + FAR_STEP }) },
    },
    // The place where the most lines meet (Union Station): a ring around the
    // knot from HUB_FROM, where its name and the lines' letters arrive, until
    // its capsule takes over. Nothing else on the map is a ring this size.
    {
      id: 'stations-hub',
      type: 'symbol',
      source: 'stations',
      minzoom: HUB_FROM,
      maxzoom: CAPSULE_TO,
      filter: ['all', served, ['==', ['get', 'meet'], true]],
      layout: {
        'icon-image': ['concat', 'hub-', ['get', 'span']],
        'icon-size': stationSize,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], HUB_FROM, 0, HUB_FROM + 0.15, fade(onRoute), CAPSULE_FROM, fade(onRoute), CAPSULE_TO, 0] },
    },
    {
      id: 'facilities',
      type: 'symbol',
      source: 'facilities',
      minzoom: 12.5,
      filter: ['any', ['>', ['coalesce', ['get', 'spaces'], 0], 0], ['==', ['get', 'class'], 'TS']],
      layout: {
        'icon-image': ['case', ['>', ['coalesce', ['get', 'spaces'], 0], 0], 'parking', 'transit-center'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.75, 16, 1],
        // Up and to the left of the spot, so a sign never covers a station.
        'icon-anchor': 'bottom-right',
        'icon-offset': [-3, -3],
        'icon-allow-overlap': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': fade(['==', 1, 0]) },
    },
    // Station names sit beside their station, clear of every line: beside
    // the mark first, then a little further out, on whichever side is free.
    // They're placed after the lines' own letters and numbers and after the
    // lines themselves (the keep-out layers just above), so a name never
    // covers rail or a frequent bus line; a station with no side clear of
    // those goes unnamed until there is one. The lighter bus lines are placed
    // after these names (basemap.js), so a name can cross one of them.
    {
      id: 'station-labels-unserved',
      type: 'symbol',
      source: 'stations',
      minzoom: UNSERVED_ZOOM,
      filter: ['!', served],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.regular,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 16, 13],
        'text-variable-anchor-offset': BESIDE,
        'text-max-width': 8,
      },
      paint: { 'text-color': P.unserved.label, 'text-opacity': fade(onRoute), ...halo },
    },
    {
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      minzoom: NAMES_FROM,
      // Before every station has room for its name (EVERY_NAME_FROM), the
      // ones named are the ends of the rail lines, Union Station first: at
      // the metro zooms the question is where the trains go. Naming the
      // stations where the most bus routes meet instead was tried and read as
      // a random handful (Decatur-Federal, Alameda, Englewood) while Union
      // Station and the line ends went unnamed: the count is of lines a
      // reader can't see at that zoom. The hub is named by its own layer
      // (station-labels-hub), before all of these.
      filter: ['all', served, ['!', isHub], ['any', ['>=', ['zoom'], EVERY_NAME_FROM], ['==', ['get', 'end'], true]]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10.5, 13, 12, 16, 14.5],
        'text-variable-anchor-offset': BESIDE,
        'text-justify': 'auto',
        'text-max-width': 8,
        // The stations where most routes meet claim their space first.
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'links'], 0]],
      },
      paint: { 'text-color': P.ink, 'text-opacity': fade(onRoute), ...halo },
    },
    // Rail and the frequent buses take up their own room here (basemap.js),
    // so everything placed after them, which is every name on the map, stays
    // off them. Above these: only what names a line and so sits on it. The
    // hub's name is placed between the two (see below).
    ...lineKeepOut().filter((l) => l.id !== 'keep-out-rail'),
    // The hub (Union Station: where the most lines meet, and more end than
    // get a sign) is the one name the metro zooms must have, and the one with
    // the least room beside it: seven lines leave it in four directions, and
    // frequent buses fill the rest. So at every zoom its name is placed
    // before every other station's and before the frequent
    // buses claim their room: it stays off rail, may cross a bus line, and
    // sits as near its ring as any other name sits to its mark. It used to
    // go up to six ems out, a quarter of a phone's width, where it read as
    // some other place's.
    {
      id: 'station-labels-hub',
      type: 'symbol',
      source: 'stations',
      minzoom: NAMES_FROM,
      filter: ['all', served, isHub],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10.5, 13, 12, 16, 14.5],
        'text-variable-anchor-offset': HUB_BESIDE,
        'text-justify': 'auto',
        'text-max-width': 8,
      },
      paint: { 'text-color': P.ink, 'text-opacity': fade(onRoute), ...halo },
    },
    ...lineKeepOut().filter((l) => l.id === 'keep-out-rail'),
    // Rail letters ride along their lines, placed before the bus numbers
    // below. The build says where (scripts/lib/sharedtrack.mjs): lines that
    // share track take turns, so each is named, and a letter sits between
    // stations. One set of places per whole zoom; a filter sees the zoom as
    // a whole number. Each is moved sideways onto its own line (letterOffset).
    {
      id: 'rail-bullets',
      type: 'symbol',
      source: 'labels',
      minzoom: NAMES_FROM,
      filter: ['all', ['==', ['get', 'kind'], 'letter'], ['!', partTime], ['<=', ['get', 'from'], ['zoom']], ['<', ['zoom'], ['get', 'to']]],
      layout: {
        'icon-image': ['concat', 'bullet-', ['get', 'route']],
        'text-field': ['get', 'route'],
        // A line's first letter on a piece of track is drawn before the rest.
        'symbol-sort-key': ['get', 'rank'],
        'text-font': FONT.heavy,
        'text-size': LETTER_SIZE,
        'icon-size': ['interpolate', ['linear'], ['zoom'], LETTER_SCALE[0].zoom, LETTER_SCALE[0].size, LETTER_SCALE[1].zoom, LETTER_SCALE[1].size],
        // An icon's offset is in px times its size; a text's is in ems.
        'icon-offset': letterOffset((zoom) => {
          const [a, b] = LETTER_SCALE;
          return a.size + (b.size - a.size) * Math.min(1, Math.max(0, (zoom - a.zoom) / (b.zoom - a.zoom)));
        }),
        'text-offset': letterOffset(() => LETTER_SIZE),
      },
      paint: { 'text-color': lines.letter, 'icon-opacity': fade(isRoute()), 'text-opacity': fade(isRoute()) },
    },
    // No bus route numbers on the map (DESIGN.md, "Bus routes", "Numbers").
    // Three tries at them (one number per frequent route, rows of numbers in
    // the line, rows of pills) each read as clutter whose meaning wasn't
    // plain. The lines' weight says how often a bus comes; a tap says which.
    // Numbers come back only where a reason to read one is shown.
    // In the overview, where no letters ride the lines yet, each rail line
    // has its letter at each end. The station where many lines end has none
    // (scripts/lib/labels.mjs).
    sign('line-signs'),
    ...selectionMarks(),
  ];
}

function sign(id) {
  return {
    id,
    type: 'symbol',
    source: 'labels',
    // Only until letters ride along the lines: a letter at the end of a
    // line that carries the same letter an inch away says it twice.
    maxzoom: NAMES_FROM,
    filter: ['==', ['get', 'kind'], 'end'],
    layout: {
      // The letter alone. A destination beside it ("N 124th – Eastlake") is
      // a line's name spelled out on the map; the key and the line's panel
      // say where it goes, and the station at its end is named like any
      // station.
      'icon-image': ['concat', 'sign|', ['get', 'lines'], '|'],
      // Just off the end station, on the side the build found clear: the
      // sign's middle is SIGN_REACH px from the station, so its edge all but
      // touches the end of the line and the letter reads as the line's cap.
      // A sign for lines that end together is wider, and moves out by half
      // of each extra letter so it doesn't sit on the station.
      'icon-offset': [
        'match',
        ['get', 'anchor'],
        ...Object.entries(AWAY).flatMap(([a, [x, y]]) => {
          const reach = SIGN_REACH / Math.hypot(x, y);
          const at = (letters) => ['literal', [x * reach + Math.sign(x) * (letters - 1) * 9, y * reach]];
          // `lines` is letters with spaces between: 1, 3, 5 characters.
          return [a, ['match', ['length', ['get', 'lines']], 1, at(1), 3, at(2), at(3)]];
        }),
        ['literal', [0, 0]],
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 10, 1],
      'icon-padding': 0,
    },
    paint: { 'icon-opacity': fade(inList('lines')) },
  };
}

// The names of stations where routes meet, and the letters along rail lines,
// start at NAMES_FROM (sizes.js), and so are the ends of the rail lines
// named. Every other station is named from EVERY_NAME_FROM, where stations
// are far enough apart that most names fit. (A whole zoom: filters read the zoom in whole steps.)
const EVERY_NAME_FROM = DETAIL_FROM;
// Where a station's name can sit: beside its mark, its nearest corner at
// most 1.4 ems across and 1.4 down from the station, so under two ems away
// (the first that is clear of every line and name wins). Until 2026-11-07
// the last ring was 1.8, two and a half ems on the diagonal. A name that can't
// sit that near isn't drawn at that zoom: further out it reads as some other
// place's (DESIGN.md, "Where the labeling rules come from"). The corners
// first, up and to the right before the others, then the sides: the
// cartographic convention for naming a point, since a name directly beside
// a mark runs into it.
const beside = (distances) =>
  distances.flatMap((d) => [
    'bottom-left', [d, -d], 'bottom-right', [-d, -d], 'top-left', [d, d], 'top-right', [-d, d],
    'left', [d, 0], 'right', [-d, 0], 'top', [0, d], 'bottom', [0, -d],
  ]);
const BESIDE = beside([0.7, 1.1, 1.4]);
// The hub's name starts a little further out, clear of its ring (about 0.85
// em across at the metro zooms), and goes no further than any other's.
const HUB_BESIDE = beside([1, 1.4]);
// The hub: where the most lines meet (`meet`), and where more lines end than
// get a sign (`hub`); the same station on RTD's network.
const isHub = ['any', ['==', ['get', 'hub'], true], ['==', ['get', 'meet'], true]];
// Closed stations: ring and name from the same zoom.
const UNSERVED_ZOOM = 13;
// Stations are ticks until CAPSULE_FROM and capsules from CAPSULE_TO; the
// hub has its ring from HUB_FROM; a station's tick waits for zoom `tickFrom`,
// in steps of FAR_STEP, where a stronger station is too near. All in
// sizes.js, since the build places the marks by the same zooms.
//
// The opacity of a station's far-out mark: `base(zoom)` (its fade in and its
// crossfade with the capsule) where the station is clear of the stronger one
// beside it, fading in over the quarter after `tickFrom`. With `hub: false`,
// the hub's tick gives way to its ring from HUB_FROM. A paint property can
// read the zoom as it is, so this is a stop for every quarter.
function farOpacity(base, { hub = true, until = CAPSULE_TO } = {}) {
  const stops = [];
  for (let z = OVERVIEW_UNTIL; z <= until + 1e-9; z += FAR_STEP / 2) stops.push(Math.round(z * 1000) / 1000);
  return ['interpolate', ['linear'], ['zoom'], ...stops.flatMap((z) => {
    const from = ['coalesce', ['get', 'tickFrom'], OVERVIEW_UNTIL];
    const clear = ['any', ['<=', from, OVERVIEW_UNTIL], ['<=', from, z - FAR_STEP]];
    const shown = !hub && z >= HUB_FROM ? ['all', clear, ['!=', ['get', 'meet'], true]] : clear;
    const b = Math.round(Math.max(0, Math.min(1, base(z))) * 1000) / 1000;
    return [z, b ? ['case', shown, ['*', b, fade(onRoute)], 0] : 0];
  })];
}
// Which way a symbol sits from its point, on screen, for each icon anchor.
const SIGN_REACH = 14;
const AWAY = {
  left: [1, 0],
  right: [-1, 0],
  top: [0, 1],
  bottom: [0, -1],
  'top-left': [1, 1],
  'top-right': [-1, 1],
  'bottom-left': [1, -1],
  'bottom-right': [-1, -1],
};

// The biggest file loads when the map first gets near the zoom that shows it.
export function loadWhenNeeded(map) {
  const load1 = (name) => map.getSource(name).setData(`data/${name}.geojson`);
  const pending = new Map([['stops', STOPS_PRELOAD_ZOOM]]);
  const load = () => {
    for (const [name, zoom] of pending) {
      if (map.getZoom() < zoom) continue;
      pending.delete(name);
      load1(name);
    }
    if (!pending.size) map.off('zoomend', load);
  };
  map.on('zoomend', load);
  map.once('load', load);
}
