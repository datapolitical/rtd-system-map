// What each sheet draws, and at what size (DESIGN.md, "Four sheets"). One
// table per sheet; nothing here depends on the zoom except which sheet shows.
// The build draws the geometry for each sheet (scripts/lib/sheets.mjs); this
// file is only ink.
import { GREY_UNDER, darkenTo, freeHue, fromLch, liftTo, lightness, toLch } from '../color.js';

export const SHEETS = [
  { id: 1, zoom: 10 },
  { id: 2, zoom: 12 },
  { id: 3, zoom: 14 },
  { id: 4, zoom: 16 },
];

// Must match SIZES in scripts/lib/sheets.mjs: the build places lines side by side at these widths.
const RAIL = { 1: 3.6, 2: 4.4, 3: 5.6, 4: 8 };
const GAP = { 1: 1.4, 2: 1.6, 3: 2, 4: 2.5 };

// The build's six headway classes are drawn as three steps: a bus every 10 minutes or better,
// every 15, and every 30 or less often. More steps than three don't read as steps (DESIGN.md, "Four sheets").
// PROTOTYPE switch: ?bus=soft|raised|tint|tintfirm on the local page; absent, the map draws as built.
const BUS_VARIANT = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('bus') : null;

export const BUS_STEP = { c60: 0, c30: 0, c15: 1, c10: 2, c5: 2, c3: 2 };
// Widths, per sheet, as shares of the sheet's rail: no bus street is as wide as rail. The busiest
// step is three quarters of it and the middle step (a bus every 15 minutes) six tenths, close
// enough that the two read as one frequent network, slim enough that downtown, where frequent
// streets lie a block apart, stays a grid of lines and not a mat. The quiet step is rail's width
// over 1.6 twice, and on the opening sheet a one-pixel hairline (there it is the whole outer
// street grid).
export const BUS_UNDER_RAIL = { mid: 0.6, top: 0.75 };
const QUIET = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n, n === '1' ? 1 : w / 1.6 ** 2]));

export const PALETTES = {
  dark: {
    ground: '#0e141d', water: '#15202f', park: '#101a1c', freeway: '#1b2535', road: '#131a25', street: '#151d2a', building: '#121924',
    // Bus streets are one hue in three strengths, each an OKLCh lightness and chroma (busInk gives the
    // hue: the one RTD's rail colours leave free). No bus street is a grey, because a grey line on a map
    // is a road. The two frequent steps sit close together and well clear of the quiet one: they are one
    // network, told apart by width. `hairline` is the quiet step on the opening sheet, nearer the ground:
    // there it is the whole outer street grid, which sits back behind the frequent streets.
    bus: { hairline: [0.4, 0.045], quiet: [0.48, 0.05], mid: [0.66, 0.07], top: [0.74, 0.085] },
    // Every rail line stands off the ground by at least this (railInk): a dimmer one is lifted to it.
    railFloor: 5.4,
    hall: '#243147', hallEdge: '#6a7a98',
    // Route numbers are the bus streets' own lettering: their hue at a reading strength (numberInk).
    mark: '#ffffff', markEdge: '#0e141d', name: '#f3f5f9', place: '#5f6b82', city: '#9ba5b8', streetName: '#5c6780', busStreetName: '#7b869b', number: [0.82, 0.09], stop: '#aab6cf',
  },
  light: {
    ground: '#f5f3ef', water: '#d3e1ec', park: '#e7ecdf', freeway: '#e0dcd4', road: '#e9e6e0', street: '#ebe8e3', building: '#ebe8e2',
    bus: { hairline: [0.79, 0.045], quiet: [0.7, 0.055], mid: [0.56, 0.08], top: [0.47, 0.095] },
    // A paler one is darkened to it, or cased.
    railFloor: 4.82,
    hall: '#dcd8cf', hallEdge: '#979ba3',
    mark: '#ffffff', markEdge: '#1b2230', name: '#161c28', place: '#8b8f98', city: '#555a63', streetName: '#8a8d95', busStreetName: '#73777f', number: [0.4, 0.09], stop: '#566179',
  },
};

// Bus street widths by class, per sheet.
export const BUS_WIDTH = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n,
  Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, Math.round([QUIET[n], w * BUS_UNDER_RAIL.mid, w * BUS_UNDER_RAIL.top][s] * 100) / 100]))]));

// In the light, a colour is darkened no more than this (OKLab L) to reach the floor; past it,
// orange turns brown and lime olive, so the line keeps RTD's colour and gets a casing instead.
export const LIGHT_SHADE_MOST = 0.12;
// A cased line's casing, each side, per sheet: it sits in the gap between lines that share track.
const CASING = { 1: 0.6, 2: 0.7, 3: 0.8, 4: 1 };

/**
 * The bus network's colour, from RTD's rail colours (`colors`, as sheets.json lists them): the hue
 * farthest from every rail line's (OKLCh, radians), and the most chroma a bus street may have, the
 * weakest rail line's as this theme draws it. Rail then reads first by its width and by the strength of
 * its colour, whatever colours RTD gives its lines. With no line that has a hue, bus streets are greys.
 */
export function busHue(theme, colors = []) {
  const drawn = colors.map((color) => toLch(railInk(theme, color).line)[1]).filter((chroma) => chroma >= GREY_UNDER);
  const hue = freeHue(colors);
  return hue === null || !drawn.length ? { hue: 0, most: 0 } : { hue, most: Math.min(...drawn) };
}

/** Each bus class's colour on one sheet: the opening sheet draws its quiet step as a faint hairline. */
export const busInk = (theme, n, colors = []) => {
  const { hue, most } = busHue(theme, colors);
  const tokens = PALETTES[theme].bus;
  const ink = ([L, chroma]) => fromLch(L, Math.min(chroma, most), hue);
  return Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, ink([n === 1 ? tokens.hairline : tokens.quiet, tokens.mid, tokens.top][s])]));
};

/**
 * The route numbers' colour: the bus streets' hue at a reading strength, so the figures read as the
 * lines' own lettering and apart from the grey street names beside them. Its chroma is held under
 * the weakest rail line's, like the streets'; with no hue free it is a grey.
 */
export const numberInk = (theme, colors = []) => {
  const { hue, most } = busHue(theme, colors);
  const [L, chroma] = PALETTES[theme].number;
  return fromLch(L, Math.min(chroma, most), hue);
};

/** How each theme inks one of RTD's line colours: `{ line, casing, ink }`. No colour is named here. */
export function railInk(theme, color) {
  const c = PALETTES[theme];
  const floor = c.railFloor;
  if (theme === 'dark') return withInk({ line: liftTo(color, c.ground, floor), casing: null });
  const darker = darkenTo(color, c.ground, floor);
  if (lightness(color) - lightness(darker) <= LIGHT_SHADE_MOST) return withInk({ line: darker, casing: null });
  return withInk({ line: color, casing: darker });
}
const withInk = (x) => ({ ...x, ink: inkOn(x.line) });
// Dark or white lettering on a disc of this colour (the build's own rule, inkOn in scripts/lib/sheets.mjs).
function inkOn(color) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(String(color).slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#10151d' : '#ffffff';
}

// Route number size per sheet, and how far off its street's middle a number is set, in ems:
// the street's half width, a pixel and a half of air, and half the figures' height.
export const NUMBER_SIZE = { 1: 0, 2: 8.5, 3: 10, 4: 11.5 };
export const numberOffset = (n, width) => -((width / 2 + 1.5) / NUMBER_SIZE[n] + 0.36);

// A stop's ring: radius and stroke on sheet 4, and the type size of the unseen mark that keeps
// lettering off it (a letter's box is about as tall as its size: the ring's width and some air).
// Stacked rows of route numbers are this far apart, in ems (scripts/lib/sheets.mjs, SIZES.busRowHeight).
export const ROW_HEIGHT = 1.15;
// The ring is wider than the busiest street on that sheet (BUS_WIDTH[4].c3), so it reads as a mark on it, not a hole in it.
export const STOP_RING = { radius: 4, stroke: 1.5 };
// Where a bus line ends on the sheets that draw no stops: a ring this thick, around the line's end.
export const BUS_END = { stroke: 1.4 };
export const STOP_ROOM = 2 * (STOP_RING.radius + STOP_RING.stroke / 2) + 2;

// Station name size per sheet (SIZES.name in the build).
const NAME_SIZE = { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 };

// A city at or under this rank in the tiles (Denver, Boulder, Aurora) is set a size up and a little brighter.
export const PLACE_MAJOR_RANK = 8;
const PLACE_SIZE = { 1: 10.5, 2: 10.5, 3: 10, 4: 10.5 };
// Where a place's name may sit, tried in this order until one is clear: on its point, nudged up or down,
// then in rings around it, each a little farther off (an anchor and an offset in ems, y down: a "top"
// anchor hangs the name below the point). A town's name stays within PLACE_REACH.town ems of its point;
// a major city covers much more of the sheet, so its name may go as far as PLACE_REACH.city to find room.
export const PLACE_REACH = { town: 2.2, city: 7 };
const ring = (d) => [['bottom', [0, -d]], ['top', [0, d]], ['left', [d, 0]], ['right', [-d, 0]],
  ...[['bottom-left', 1, -1], ['bottom-right', -1, -1], ['top-left', 1, 1], ['top-right', -1, 1]].map(([a, x, y]) => [a, [x * d * 0.7, y * d * 0.7]])];
const NEAR = [['center', [0, 0]], ['center', [0, -0.7]], ['center', [0, 0.7]], ...ring(0.6), ...ring(1.4), ...ring(PLACE_REACH.town)];
export const PLACE_SPOTS = { town: NEAR, city: [...NEAR, ...ring(3.4), ...ring(4.6), ...ring(5.8), ...ring(PLACE_REACH.city)] };

// A street's name in the short form a map sets it in: "West Colfax Avenue" is "W Colfax Ave".
const STREET_PREFIX = { 'North ': 'N ', 'South ': 'S ', 'East ': 'E ', 'West ': 'W ' };
const STREET_SUFFIX = { ' Avenue': ' Ave', ' Street': ' St', ' Boulevard': ' Blvd', ' Parkway': ' Pkwy', ' Road': ' Rd', ' Drive': ' Dr',
  ' Place': ' Pl', ' Court': ' Ct', ' Lane': ' Ln', ' Highway': ' Hwy', ' Circle': ' Cir', ' Way': ' Way' };
function shortStreet(name) {
  const n = ['var', 'n'];
  const head = ['case', ...Object.entries(STREET_PREFIX).flatMap(([long, short]) => [
    ['==', ['slice', name, 0, long.length], long], ['concat', short, ['slice', name, long.length]]]), name];
  const tail = ['case', ...Object.entries(STREET_SUFFIX).flatMap(([long, short]) => [
    ['all', ['>', ['length', n], long.length], ['==', ['slice', n, ['-', ['length', n], long.length]], long]],
    ['concat', ['slice', n, 0, ['-', ['length', n], long.length]], short]]), n];
  return ['let', 'n', head, tail];
}

const FONT = { regular: ['Overpass Regular'], medium: ['Overpass Medium'], semibold: ['Overpass SemiBold'], bold: ['Overpass ExtraBold'] };
const byClass = (table) => ['match', ['get', 'cls'], ...Object.entries(table).flat(), Object.values(table)[0]];
const kind = (k, ...more) => ['all', ['==', ['get', 'kind'], k], ...more];
const ROUND = { 'line-cap': 'round', 'line-join': 'round' };
// Rail ends square, so a line stops at its last station's mark and doesn't poke past it.
const FLAT = { 'line-cap': 'butt', 'line-join': 'round' };

/** Where a sheet's drawing is; the page hands it to the map when the sheet is wanted. */
export const sheetData = (n) => new URL(`../../data/sheet-${n}.geojson`, import.meta.url).href;
const NOTHING = { type: 'FeatureCollection', features: [] };


/**
 * The whole style: the ground, then each sheet's layers, each shown only around its own zoom.
 * `wanted` is the sheets whose drawings load now (all of them when not given); the rest start
 * empty, so the opening view doesn't wait on sheets it can't show (DESIGN.md, "Quality floor").
 */
export function sheetStyle(theme, stations = [], colors = [], wanted = null) {
  // A place that shares a station's name is not lettered twice: the station's own name says it.
  const named = stations.map((s) => s.toUpperCase());
  const c = PALETTES[theme];
  // Each line's ink in this theme, from the colours the build found in RTD's data (sheets.json).
  const inks = colors.map((color) => ({ color, ...railInk(theme, color) }));
  const byColor = (key, fallback) => (inks.length ? ['match', ['get', 'color'], ...inks.flatMap((x) => [x.color, x[key] ?? x.line]), fallback] : fallback);
  const lineInk = byColor('line', ['get', 'color']);
  const letterInk = byColor('ink', ['get', 'ink']);
  const cased = inks.filter((x) => x.casing);
  const figures = numberInk(theme, colors);
  const layers = [
    { id: 'ground', type: 'background', paint: { 'background-color': c.ground } },
    { id: 'park', type: 'fill', source: 'ground', 'source-layer': 'park', paint: { 'fill-color': c.park } },
    { id: 'water', type: 'fill', source: 'ground', 'source-layer': 'water', paint: { 'fill-color': c.water } },
    { id: 'river', type: 'line', source: 'ground', 'source-layer': 'waterway', filter: ['==', ['get', 'class'], 'river'], paint: { 'line-color': c.water, 'line-width': 1.2 } },
  ];
  SHEETS.forEach((sheet, i) => {
    const n = sheet.id;
    const source = `sheet-${n}`;
    // A sheet shows from halfway to the sheet before it to halfway to the next.
    const band = { minzoom: i ? sheet.zoom - 1 : 0, maxzoom: i < SHEETS.length - 1 ? sheet.zoom + 1 : 24 };
    const layer = (id, type, rest) => layers.push({ id: `${id}-${n}`, type, source, ...band, ...rest });
    const w = RAIL[n];
    const busWidth = BUS_WIDTH[n];
    const busColor = busInk(theme, n, colors);

    // The ground's own lines: freeways only on the first sheet, more as the sheets get closer.
    const roads = n === 1 ? ['motorway'] : n === 2 ? ['motorway', 'trunk', 'primary'] : ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
    layers.push({ id: `roads-${n}`, type: 'line', source: 'ground', 'source-layer': 'transportation', ...band,
      filter: ['all', ['in', ['get', 'class'], ['literal', roads]], ['!=', ['get', 'brunnel'], 'tunnel']], layout: ROUND,
      paint: { 'line-color': ['match', ['get', 'class'], 'motorway', n <= 2 ? c.freeway : c.road, ['trunk', 'primary'], c.road, c.street],
        'line-width': ['match', ['get', 'class'], 'motorway', [2.2, 3, 5, 12][i], ['trunk', 'primary'], [0, 1.2, 4, 10][i], [0, 0, 2.4, 7][i]] } });
    if (n === 4) layers.push({ id: 'buildings-4', type: 'fill', source: 'ground', 'source-layer': 'building', ...band, paint: { 'fill-color': c.building } });


    // Bus streets, quietest first so the busiest are on top; the frequent ones get a rim of ground to sit
    // clear of the quiet streets they cross. Each is one solid line in the bus network's own colour:
    // nothing down its middle and no edge of another colour, either of which makes a street a road.
    const order = ['c60', 'c30', 'c15', 'c10', 'c5', 'c3'];
    // PROTOTYPE (?bus=soft|raised|tint|tintfirm): softer frequent-bus looks for Chris to compare. Not for main.
    const V = BUS_VARIANT;
    const FREQ = ['c15', 'c10', 'c5', 'c3'];
    const freq = kind('bus', ['in', ['get', 'cls'], ['literal', FREQ]]);
    const quietOnly = kind('bus', ['!', ['in', ['get', 'cls'], ['literal', FREQ]]]);
    const { hue: H } = busHue(theme, colors);
    const dark = theme === 'dark';
    const tone = (L, C) => fromLch(L, C, H);
    if (V === 'tint' || V === 'tintfirm') {
      const firm = V === 'tintfirm';
      const band = { top: dark ? tone(0.6, 0.11) : tone(0.72, 0.09), mid: dark ? tone(0.55, 0.09) : tone(0.78, 0.07) };
      layer('bus', 'line', { filter: quietOnly, layout: ROUND, paint: { 'line-color': byClass(busColor), 'line-width': byClass(busWidth) } });
      layer('bus-rim', 'line', { filter: freq, layout: ROUND, paint: { 'line-color': c.ground, 'line-width': ['match', ['get', 'cls'], 'c15', w * 0.8 + 1.6, w + 1.6] } });
      layer('bus-wash', 'line', { filter: freq, layout: ROUND, paint: { 'line-color': ['match', ['get', 'cls'], 'c15', band.mid, band.top],
        'line-width': ['match', ['get', 'cls'], 'c15', w * 0.8, w], 'line-opacity': firm ? (dark ? 0.7 : 0.9) : (dark ? 0.55 : 0.75) } });
      const spine = firm ? byClass(busColor) : ['match', ['get', 'cls'], 'c15', dark ? '#aab2be' : '#4a505a', dark ? '#dde3ec' : '#2b313b'];
      layer('bus-spine', 'line', { filter: freq, layout: ROUND, paint: { 'line-color': spine,
        'line-width': ['match', ['get', 'cls'], 'c15', w * (firm ? 0.32 : 0.16), w * (firm ? 0.42 : 0.22)] } });
    } else {
      const soft = V === 'soft';
      const ink = soft ? { ...busColor, ...Object.fromEntries(FREQ.map((k) => [k, k === 'c15'
        ? (dark ? tone(0.56, 0.06) : tone(0.66, 0.065)) : (dark ? tone(0.62, 0.07) : tone(0.6, 0.075))])) } : busColor;
      layer('bus-rim', 'line', { filter: freq, layout: ROUND,
        paint: { 'line-color': c.ground, 'line-width': ['+', byClass(busWidth), 1.6] } });
      if (V === 'raised') layer('bus-shadow', 'line', { filter: freq, layout: ROUND, paint: {
        'line-color': dark ? '#000000' : tone(0.3, 0.05), 'line-opacity': dark ? 0.8 : 0.45,
        'line-width': ['+', byClass(busWidth), 0.8], 'line-blur': 1.4, 'line-translate': [0.5, 1.3], 'line-translate-anchor': 'viewport' } });
      layer('bus', 'line', { filter: kind('bus'), layout: { ...ROUND, 'line-sort-key': ['match', ['get', 'cls'], ...order.flatMap((k, j) => [k, j]), 0] },
        paint: { 'line-color': byClass(ink), 'line-width': byClass(busWidth),
          ...(soft ? { 'line-blur': ['match', ['get', 'cls'], FREQ, 0.8, 0] } : {}) } });
      if (V === 'raised') layer('bus-shine', 'line', { filter: freq, layout: ROUND, paint: {
        'line-color': dark ? tone(0.92, 0.04) : tone(0.82, 0.05), 'line-opacity': dark ? 0.6 : 0.75,
        'line-width': ['*', byClass(busWidth), 0.38], 'line-blur': ['*', byClass(busWidth), 0.18],
        'line-translate': [-0.4, -0.8], 'line-translate-anchor': 'viewport' } });
    }
    // Where a bus line ends: a ring on its end, ground inside, in the line's own colour, a little
    // wider than the line, so the line stops on something (a stop) rather than in the open.
    if (n <= 3) layer('bus-end', 'circle', { filter: kind('bus-end'), paint: {
      'circle-radius': ['+', ['/', byClass(busWidth), 2], BUS_END.stroke + 0.9], 'circle-color': c.ground,
      'circle-stroke-color': byClass(busColor), 'circle-stroke-width': BUS_END.stroke } });

    // A bus station's hall: a quiet room edged like a quiet street, which the streets of its buses
    // end on. It is drawn over them, so a street ends flat on the wall, not in a round blob across it.
    layer('hall', 'fill', { filter: kind('hall'), paint: { 'fill-color': c.hall } });
    layer('hall-edge', 'line', { filter: kind('hall'), layout: ROUND, paint: { 'line-color': c.hallEdge, 'line-width': [0, 1, 1.2, 1.6][i] } });

    // Bus stops: each one a ring, on the closest sheet.
    if (n >= 4) layers.push({ id: `stop-${n}`, type: 'circle', source: `sheet-${n}`, filter: ['==', ['get', 'kind'], 'stop'], ...band,
      paint: n === 3 ? { 'circle-radius': 1.3, 'circle-color': c.stop, 'circle-opacity': 0.7 } : { 'circle-radius': STOP_RING.radius, 'circle-color': c.ground, 'circle-stroke-color': c.stop, 'circle-stroke-width': STOP_RING.stroke } });

    // Rail: every line whole, with a rim of ground so lines side by side stay apart.
    layer('rail-rim', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': c.ground, 'line-width': w + 2 * GAP[n] } });
    // A pale line that can't stand off the ground in its own hue has a thin casing of its own colour, darker.
    if (cased.length) layer('rail-casing', 'line', { filter: kind('rail', ['in', ['get', 'color'], ['literal', cased.map((x) => x.color)]]), layout: FLAT,
      paint: { 'line-color': byColor('casing', c.ground), 'line-width': w + 2 * CASING[n] } });
    layer('rail', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': lineInk, 'line-width': w } });

    // Stations: one white bar across the lines that stop there; the hub's is heavier.
    const bar = kind('station', ['==', ['get', 'shape'], 'bar']);
    // A station on one line is a dot a little wider than its line, so it reads as a station.
    const thin = ['case', ['get', 'single'], w + 1.4, ['get', 'hub'], w * 0.72 + 2.2, w * 0.72];
    // Lines that meet back to back at a bar get a fat one, about half again as thick, with a divider down it.
    const mark = ['case', ['get', 'fat'], ['+', ['*', 1.6, thin], 1], thin];
    layer('station-edge', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': c.markEdge, 'line-width': ['+', mark, 2.6] } });
    layer('station', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': c.mark, 'line-width': mark } });
    layer('station-divider', 'line', { filter: ['all', bar, ['==', ['get', 'fat'], true]], layout: FLAT, paint: { 'line-color': c.markEdge, 'line-width': 1.2 } });

    // Lettering, least important first (MapLibre places the last layer first).
    if (n <= 2) layers.push({ id: `freeway-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'transportation_name', ...band, filter: ['all', ['==', ['get', 'class'], 'motorway'], ['has', 'ref'], ['==', ['geometry-type'], 'LineString']],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 260, 'text-field': ['concat', ['match', ['get', 'network'], 'us-interstate', 'I-', 'us-highway', 'US ', ['case', ['>=', ['to-number', ['get', 'ref'], -1], 0], 'Hwy ', '']], ['get', 'ref']], 'text-font': FONT.medium, 'text-size': 9, 'text-letter-spacing': 0.04, 'text-rotation-alignment': 'viewport', 'text-padding': 6 },
      paint: { 'text-color': c.place, 'text-halo-color': c.ground, 'text-halo-width': 1.6 } });
    // The ground's street names from sheet 3, in short forms ("W 13th Ave"), on the street's centreline,
    // the main streets first. A bus street's name leads its route label (bus-number, below), so these keep
    // off the busier bus streets and name the streets between them.
    if (n >= 3) {
      const roadClasses = n === 3 ? ['trunk', 'primary', 'secondary', 'tertiary'] : ['trunk', 'primary', 'secondary', 'tertiary', 'minor'];
      layers.push({ id: `street-name-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'transportation_name', ...band,
        filter: ['in', ['get', 'class'], ['literal', roadClasses]],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': shortStreet(['get', 'name']), 'text-font': FONT.regular, 'text-size': n === 3 ? 9.5 : 10.5,
          'text-max-angle': 25, 'text-padding': 10, 'symbol-sort-key': ['index-of', ['get', 'class'], ['literal', roadClasses]] },
        paint: { 'text-color': c.streetName, 'text-halo-color': c.ground, 'text-halo-width': 1.4 } });
    }
    // Place names: on the first two sheets cities and towns, closer in a city's own neighbourhoods. They are
    // placed by rank (the tiles' importance, cities before towns, a city's statistical neighbourhoods before
    // OSM's smaller ones), after rail, its letters, station names, route numbers and the marks that keep
    // lettering off the frequent bus streets: a name moves to a clear spot near its point rather than have a
    // line strike through it, and where none is near it is not set (DESIGN.md, the order at the top). It may
    // sit over a quiet bus street on its halo. A listing such as "Quality Hill Historic District" is a
    // register entry, not a name people use for where they are, so it is not set.
    const classes = n < 3 ? ['city', 'town'] : ['suburb', 'quarter', 'neighbourhood'];
    const major = ['all', ['==', ['get', 'class'], 'city'], ['<=', ['to-number', ['get', 'rank'], 99], PLACE_MAJOR_RANK]];
    layers.push({ id: `place-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'place', ...band,
      filter: ['all', ['in', ['get', 'class'], ['literal', classes]], ['!', ['in', ['upcase', ['get', 'name']], ['literal', named]]],
        ['!', ['in', 'historic district', ['downcase', ['get', 'name']]]]],
      layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': ['case', major, ['literal', FONT.semibold], ['literal', FONT.medium]],
        'text-size': ['case', major, PLACE_SIZE[n] + 2, PLACE_SIZE[n]], 'text-letter-spacing': ['case', major, 0.26, 0.22], 'text-padding': 4, 'text-max-width': 8,
        // On its point if that is clear, else the nearest clear spot around it (a city's point is often its busiest corner).
        'text-variable-anchor-offset': ['case', major, ['literal', PLACE_SPOTS.city.flat()], ['literal', PLACE_SPOTS.town.flat()]],
        'symbol-sort-key': ['+', ['*', 100, ['index-of', ['get', 'class'], ['literal', classes]]], ['to-number', ['get', 'rank'], 99]] },
      paint: { 'text-color': ['case', major, c.city, c.place], 'text-halo-color': c.ground, 'text-halo-width': 2.2, 'text-halo-blur': 0.4 } });
    // Route numbers along each bus street, from the second sheet.
    const unseen ={ layout: { 'symbol-placement': 'line', 'symbol-spacing': 6, 'text-field': 'o', 'text-font': FONT.medium, 'text-size': 7, 'text-allow-overlap': true, 'text-padding': 0, 'text-rotation-alignment': 'viewport' }, paint: { 'text-opacity': 0 } };
    layer('keep-off-bus', 'symbol', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]]), ...unseen });
    // Bus streets' names from sheet 3, beside the street like its route numbers and placed after them
    // (scripts/lib/sheets.mjs names them from their stops), quieter than the numbers.
    const besideStreet = (n2, shift = 0) => ['case', ['==', ['get', 'side'], -1],
      byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, -numberOffset(n2, w) + shift]]]))),
      byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, numberOffset(n2, w) - shift]]])))];
    if (n >= 3) layer('bus-street', 'symbol', { filter: kind('bus-street'),
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 520, 'text-field': ['get', 'label'], 'text-font': FONT.regular, 'text-size': NUMBER_SIZE[n], 'text-max-angle': 25, 'text-padding': 6,
        'text-offset': besideStreet(n), 'text-letter-spacing': 0.02 },
      paint: { 'text-color': c.busStreetName, 'text-halo-color': c.ground, 'text-halo-width': 1.6 } });
    if (n >= 2) layer('bus-number', 'symbol', { filter: kind('bus-label'),
      // Set just beside the street, not on it: on it, the line shows between the figures and a
      // comma reads as a dash. The offset is the street's half width and a little air, in ems.
      // Where the build found room, the street's name leads its list, in the names' quieter grey and weight.
      layout: { 'symbol-placement': 'line', 'symbol-spacing': [0, 200, 260, 320][i],
        'text-field': ['case', ['has', 'street'], ['format', ['get', 'street'], { 'text-color': c.busStreetName, 'text-font': ['literal', FONT.regular] }, '\u2003', {}, ['get', 'label'], {}], ['get', 'label']],
        'text-font': FONT.semibold, 'text-size': NUMBER_SIZE[n], 'text-max-angle': 25, 'text-padding': 4,
        // The build says which side has room (`side` -1: below the figures, where a street runs close above).
        'text-offset': ['case', ['==', ['get', 'side'], -1],
          byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w)]]]))),
          byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w)]]])))],
        'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']] },
      paint: { 'text-color': figures, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // A list too long for its stretch in one row is stacked in two (scripts/lib/sheets.mjs, labelRuns): one piece
    // of lettering turned the way its street runs, so both rows show or neither does. Its middle sits half a row
    // farther off the street than a single row's, so the nearer row is where a single row would be.
    if (n >= 2) layer('bus-stack', 'symbol', { filter: kind('bus-stack'),
      layout: { 'text-field': ['get', 'label'], 'text-font': FONT.semibold, 'text-size': NUMBER_SIZE[n], 'text-max-width': 100, 'text-line-height': ROW_HEIGHT, 'text-justify': 'center', 'text-padding': 2,
        'text-rotate': ['get', 'angle'], 'text-rotation-alignment': 'map', 'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']],
        'text-offset': ['case', ['==', ['get', 'side'], -1],
          byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w) + ROW_HEIGHT / 2]]]))),
          byClass(Object.fromEntries(Object.entries(busWidth).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w) - ROW_HEIGHT / 2]]])))] },
      paint: { 'text-color': figures, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // Station names: the build has chosen each one's side of its mark (scripts/lib/sheets.mjs, names).
    layer('name', 'symbol', { filter: kind('station', ['==', ['get', 'shape'], 'name']),
      layout: { 'text-field': ['get', 'text'], 'text-font': ['case', ['get', 'minor'], ['literal', FONT.medium], ['literal', FONT.semibold]], 'text-size': ['case', ['get', 'minor'], 10, NAME_SIZE[n]], 'text-max-width': 40, 'text-line-height': 1.12,
        'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'], 'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-padding': 3 },
      paint: { 'text-color': c.name, 'text-halo-color': c.ground, 'text-halo-width': 2 } });
    // Line letters, placed by the build where each line runs alone: a disc in the line's colour.
    const disc = [7.4, 8.2, 9.4, 10.6][i];
    // Beside a station's name the letters are smaller (scripts/lib/sheets.mjs, SIZES.nameLetter).
    const small = [5.6, 6, 6.6, 7.4][i];
    layer('letter-disc', 'circle', { filter: kind('letter'), paint: { 'circle-radius': ['case', ['to-boolean', ['get', 'small']], small, disc], 'circle-color': lineInk, 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5 } });
    layer('letter', 'symbol', { filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': FONT.bold, 'text-size': ['case', ['to-boolean', ['get', 'small']], small * 1.42, disc * 1.42], 'text-allow-overlap': true, 'text-offset': [0, 0.06] },
      paint: { 'text-color': letterInk } });
    // Lettering keeps off the lines: unseen marks along rail and the busiest streets hold their
    // ground. MapLibre places the last layer first: rail's marks, then the route numbers (which
    // sit on their own streets but never on rail), then the streets' marks, then everything above.
    layer('keep-off', 'symbol', { filter: kind('rail'), ...unseen });
    // What a hall is, down its length; placed first, so a street's name gives way to it.
    layer('hall-name', 'symbol', { filter: kind('hall-name'),
      layout: { 'symbol-placement': 'line-center', 'text-field': ['upcase', ['get', 'text']], 'text-font': FONT.medium, 'text-size': 9.5, 'text-letter-spacing': 0.18, 'text-padding': 6 },
      paint: { 'text-color': c.place } });
    // A stop's ring holds its ground too: a route number never sits on a stop. One unseen
    // mark the size of the ring and a little air, placed before the numbers.
    if (n >= 4) layers.push({ id: `keep-off-stop-${n}`, type: 'symbol', source: `sheet-${n}`, filter: ['==', ['get', 'kind'], 'stop'], ...band,
      layout: { 'text-field': 'O', 'text-font': FONT.medium, 'text-size': STOP_ROOM, 'text-allow-overlap': true, 'text-padding': 1.5, 'text-rotation-alignment': 'viewport' },
      paint: { 'text-opacity': 0 } });
  });
  return {
    version: 8,
    glyphs: new URL('../../vendor/glyphs/{fontstack}/{range}.pbf', import.meta.url).href.replace(/%7B/g, '{').replace(/%7D/g, '}'),
    sources: {
      ground: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      ...Object.fromEntries(SHEETS.map((s) => [`sheet-${s.id}`, { type: 'geojson', data: !wanted || wanted.has(s.id) ? sheetData(s.id) : NOTHING, tolerance: 0.1,
        // Big tiles with a wide margin, so a label's stretch of street is whole in the tile that places it.
        maxzoom: s.zoom - 1, buffer: 256 }])),
    },
    layers,
  };
}
