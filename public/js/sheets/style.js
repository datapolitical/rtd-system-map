// What each sheet draws, and at what size (DESIGN.md, "Four sheets"). One
// table per sheet; nothing here depends on the zoom except which sheet shows.
// The build draws the geometry for each sheet (scripts/lib/sheets.mjs); this
// file is only ink.
import { contrast, darkenTo, liftTo, lightness } from '../color.js';

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
export const BUS_STEP = { c60: 0, c30: 0, c15: 1, c10: 2, c5: 2, c3: 2 };
// Widths, per sheet. The busiest step is as wide as the sheet's rail, never wider: where frequent
// streets lie a block apart downtown, anything wider fills the grid. It reads first among the bus
// streets by a lit core (BUS_CORE), not by width. The middle step (a bus every 15 minutes) is a
// little under it, so a corridor such as the Flatiron Flyer reads as a corridor; the quiet step is
// rail's width over 1.6 twice, and on the opening sheet a one-pixel hairline (there it is the whole
// outer street grid).
export const MID_UNDER_TOP = 1.4;
const QUIET = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n, n === '1' ? 1 : w / 1.6 ** 2]));
// The busiest step's core: this share of its width, in a grey with more contrast than the band's.
export const BUS_CORE = 0.36;
const steps = (quiet, mid, top) => Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, [quiet, mid, top][s]]));

export const PALETTES = {
  dark: {
    ground: '#0e141d', water: '#15202f', park: '#101a1c', freeway: '#1b2535', road: '#131a25', street: '#151d2a', building: '#121924',
    // Bus streets, quietest to busiest: one cool grey, evenly spaced in lightness (OKLab L 0.43, 0.515, 0.60).
    // The busiest stays under the dimmest rail line (railInk), so rail reads first by its colour; it is no
    // brighter than that, so a deep red lifted over it is still red, not salmon.
    bus: steps('#49505b', '#606873', '#79818d'),
    // The quiet step on the opening sheet, half a step nearer the ground (OKLab L 0.3875): there it is the
    // whole outer street grid, which should sit back behind the frequent streets, not read as chart gridlines.
    busHairline: '#3e454f',
    // The lit core of the busiest step: a stripe of light down the band.
    busCore: '#b3bbc7', busCoreMid: '#959daa',
    hall: '#243147', hallEdge: '#6a7a98',
    mark: '#ffffff', markEdge: '#0e141d', name: '#f3f5f9', place: '#5f6b82', city: '#9ba5b8', streetName: '#5c6780', busStreetName: '#7b869b', number: '#c9d2e4', stop: '#aab6cf',
  },
  light: {
    ground: '#f5f3ef', water: '#d3e1ec', park: '#e7ecdf', freeway: '#e0dcd4', road: '#e9e6e0', street: '#ebe8e3', building: '#ebe8e2',
    // OKLab L 0.74, 0.65, 0.56.
    bus: steps('#a6abb3', '#8b8f97', '#70757c'),
    // OKLab L 0.785.
    busHairline: '#b4b9c1',
    busCore: '#3b4047', busCoreMid: '#575c64',
    hall: '#dcd8cf', hallEdge: '#979ba3',
    mark: '#ffffff', markEdge: '#1b2230', name: '#161c28', place: '#8b8f98', city: '#555a63', streetName: '#8a8d95', busStreetName: '#73777f', number: '#3a4560', stop: '#566179',
  },
};

// Bus street widths by class, per sheet.
export const BUS_WIDTH = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n,
  Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, Math.round([QUIET[n], w / MID_UNDER_TOP, w][s] * 100) / 100]))]));

// Rail stands out from the busiest bus street by at least this much more contrast with the ground.
export const RAIL_OVER_BUS = 1.15;
// In the light, a colour is darkened no more than this (OKLab L) to reach the floor; past it,
// orange turns brown and lime olive, so the line keeps RTD's colour and gets a casing instead.
export const LIGHT_SHADE_MOST = 0.12;
// A cased line's casing, each side, per sheet: it sits in the gap between lines that share track.
const CASING = { 1: 0.6, 2: 0.7, 3: 0.8, 4: 1 };

/** Each bus class's grey on one sheet: the opening sheet draws its quiet step as a faint hairline. */
export const busInk = (theme, n) => {
  const c = PALETTES[theme];
  return n === 1 ? Object.fromEntries(Object.entries(c.bus).map(([k, x]) => [k, BUS_STEP[k] === 0 ? c.busHairline : x])) : c.bus;
};

/** How each theme inks one of RTD's line colours: `{ line, casing, ink }`. No colour is named here. */
export function railInk(theme, color) {
  const c = PALETTES[theme];
  const floor = contrast(c.bus.c3, c.ground) * RAIL_OVER_BUS;
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

// A stop-group table (scripts/lib/sheets.mjs, SIZES.group, which lays it out at these sizes): a
// plate in the ground's colour with a hairline edge in the numbers' ink at `edge` opacity, a title
// in that ink at `titleInk`, and a row per letter, its letter in a small square of ink. On sheet
// 3, which draws no stops, each lettered stop's letter sits on its street in the table's own square, with
// a rim of ground `streetRim` wide, as a line's letter sits on its line (SIZES.groupStreetRim).
// On sheet 4 a lettered stop shows its letter in a square `stopBadge` wide in the stops' grey,
// with a rim of ground `stopRim` wide so it stands off its street as a stop's ring does.
export const GROUP = { title: 9, titleSpacing: 0.12, titleInk: 0.7, row: 10.5, rowSpacing: 0.02, letter: 8.5, badge: 12, badgeCorner: 3,
  corner: 5, edge: 0.35, streetRim: 1.5, stopBadge: 11, stopRim: 1, stopLetter: 8 };
const GROUP_FONT = { title: ['Overpass Bold'], row: ['Overpass SemiBold'] };

// Station name size per sheet (SIZES.name in the build).
const NAME_SIZE = { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 };

// A city at or under this rank in the tiles (Denver, Boulder, Aurora) is set a size up and a little brighter.
export const PLACE_MAJOR_RANK = 8;
const PLACE_SIZE = { 1: 10.5, 2: 10.5, 3: 10, 4: 10.5 };

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

    // The ground's own lines: freeways only on the first sheet, more as the sheets get closer.
    const roads = n === 1 ? ['motorway'] : n === 2 ? ['motorway', 'trunk', 'primary'] : ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
    layers.push({ id: `roads-${n}`, type: 'line', source: 'ground', 'source-layer': 'transportation', ...band,
      filter: ['all', ['in', ['get', 'class'], ['literal', roads]], ['!=', ['get', 'brunnel'], 'tunnel']], layout: ROUND,
      paint: { 'line-color': ['match', ['get', 'class'], 'motorway', n <= 2 ? c.freeway : c.road, ['trunk', 'primary'], c.road, c.street],
        'line-width': ['match', ['get', 'class'], 'motorway', [2.2, 3, 5, 12][i], ['trunk', 'primary'], [0, 1.2, 4, 10][i], [0, 0, 2.4, 7][i]] } });
    if (n === 4) layers.push({ id: 'buildings-4', type: 'fill', source: 'ground', 'source-layer': 'building', ...band, paint: { 'fill-color': c.building } });


    // Bus streets, quietest first so the busiest are on top; the busiest get a rim of ground to sit clear.
    const order = ['c60', 'c30', 'c15', 'c10', 'c5', 'c3'];
    layer('bus-rim', 'line', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]]), layout: ROUND,
      paint: { 'line-color': c.ground, 'line-width': ['+', byClass(BUS_WIDTH[n]), 1.6] } });
    layer('bus', 'line', { filter: kind('bus'), layout: { ...ROUND, 'line-sort-key': ['match', ['get', 'cls'], ...order.flatMap((k, j) => [k, j]), 0] },
      paint: { 'line-color': byClass(busInk(theme, n)), 'line-width': byClass(BUS_WIDTH[n]) } });
    // The two frequent steps carry a lit core down their middle: more contrast than the band, no more width.
    // The middle step's is thinner and a step dimmer, so the steps still read in order.
    layer('bus-core', 'line', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]]), layout: ROUND,
      paint: { 'line-color': ['match', ['get', 'cls'], 'c15', c.busCoreMid, c.busCore], 'line-width': ['match', ['get', 'cls'], 'c15', RAIL[n] * BUS_CORE * 0.7, RAIL[n] * BUS_CORE] } });
    // Where a bus line ends: a ring on its end, ground inside, in the line's own grey, a little
    // wider than the line, so the line stops on something (a stop) rather than in the open.
    if (n <= 3) layer('bus-end', 'circle', { filter: kind('bus-end'), paint: {
      'circle-radius': ['+', ['/', byClass(BUS_WIDTH[n]), 2], BUS_END.stroke + 0.9], 'circle-color': c.ground,
      'circle-stroke-color': byClass(busInk(theme, n)), 'circle-stroke-width': BUS_END.stroke } });

    // A bus station's hall: a quiet room edged like a quiet street, which the streets of its buses
    // end on. It is drawn over them, so a street ends flat on the wall, not in a round blob across it.
    layer('hall', 'fill', { filter: kind('hall'), paint: { 'fill-color': c.hall } });
    layer('hall-edge', 'line', { filter: kind('hall'), layout: ROUND, paint: { 'line-color': c.hallEdge, 'line-width': [0, 1, 1.2, 1.6][i] } });

    // Bus stops: each one a ring, on the closest sheet.
    if (n >= 4) layers.push({ id: `stop-${n}`, type: 'circle', source: `sheet-${n}`, filter: ['all', ['==', ['get', 'kind'], 'stop'], ['!', ['has', 'letter']]], ...band,
      paint: n === 3 ? { 'circle-radius': 1.3, 'circle-color': c.stop, 'circle-opacity': 0.7 } : { 'circle-radius': STOP_RING.radius, 'circle-color': c.ground, 'circle-stroke-color': c.stop, 'circle-stroke-width': STOP_RING.stroke } });
    // A stop RTD letters (one of a street's stop groups, scripts/lib/sheets.mjs, stopGroups) shows
    // its letter in place of the ring: a small square in the stops' grey, the letter in the ground's.
    if (n >= 4) layer('stop-letter', 'symbol', { filter: kind('stop', ['has', 'letter']),
      layout: { 'icon-image': `stopgroup-stop-${theme}`, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.stopLetter, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': c.ground } });

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

    // Where a tap finds a stop-group table: its plate's ground, unseen (the plate itself is lettering, below).
    if (n >= 2) layer('group-area', 'fill', { filter: kind('group-area'), paint: { 'fill-color': c.ground, 'fill-opacity': 0 } });

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
    // Route numbers along each bus street, from the second sheet.
    const unseen = { layout: { 'symbol-placement': 'line', 'symbol-spacing': 6, 'text-field': 'o', 'text-font': FONT.medium, 'text-size': 7, 'text-allow-overlap': true, 'text-padding': 0, 'text-rotation-alignment': 'viewport' }, paint: { 'text-opacity': 0 } };
    layer('keep-off-bus', 'symbol', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]]), ...unseen });
    // Bus streets' names from sheet 3, beside the street like its route numbers and placed after them
    // (scripts/lib/sheets.mjs names them from their stops), quieter than the numbers.
    const besideStreet = (n2, shift = 0) => ['case', ['==', ['get', 'side'], -1],
      byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n2]).map(([k, w]) => [k, ['literal', [0, -numberOffset(n2, w) + shift]]]))),
      byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n2]).map(([k, w]) => [k, ['literal', [0, numberOffset(n2, w) - shift]]])))];
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
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w)]]]))),
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w)]]])))],
        'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']] },
      paint: { 'text-color': c.number, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // A list too long for its stretch in one row is stacked in two (scripts/lib/sheets.mjs, labelRuns): one piece
    // of lettering turned the way its street runs, so both rows show or neither does. Its middle sits half a row
    // farther off the street than a single row's, so the nearer row is where a single row would be.
    if (n >= 2) layer('bus-stack', 'symbol', { filter: kind('bus-stack'),
      layout: { 'text-field': ['get', 'label'], 'text-font': FONT.semibold, 'text-size': NUMBER_SIZE[n], 'text-max-width': 100, 'text-line-height': ROW_HEIGHT, 'text-justify': 'center', 'text-padding': 2,
        'text-rotate': ['get', 'angle'], 'text-rotation-alignment': 'map', 'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']],
        'text-offset': ['case', ['==', ['get', 'side'], -1],
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w) + ROW_HEIGHT / 2]]]))),
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w) - ROW_HEIGHT / 2]]])))] },
      paint: { 'text-color': c.number, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // Place names: on the first two sheets cities and towns, closer in a city's own neighbourhoods. They are
    // placed by rank (the tiles' importance, cities before towns, a city's statistical neighbourhoods before
    // OSM's smaller ones), after rail, its letters and station names but before route numbers and the marks
    // that keep lettering off bus streets: a town's name sits over bus streets on its halo, never over rail
    // or a station. A listing such as "Quality Hill Historic District" is a register entry, not a name people
    // use for where they are, so it is not set.
    const classes = n < 3 ? ['city', 'town'] : ['suburb', 'quarter', 'neighbourhood'];
    const major = ['all', ['==', ['get', 'class'], 'city'], ['<=', ['to-number', ['get', 'rank'], 99], PLACE_MAJOR_RANK]];
    layers.push({ id: `place-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'place', ...band,
      filter: ['all', ['in', ['get', 'class'], ['literal', classes]], ['!', ['in', ['upcase', ['get', 'name']], ['literal', named]]],
        ['!', ['in', 'historic district', ['downcase', ['get', 'name']]]]],
      layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': ['case', major, ['literal', FONT.semibold], ['literal', FONT.medium]],
        'text-size': ['case', major, PLACE_SIZE[n] + 2, PLACE_SIZE[n]], 'text-letter-spacing': ['case', major, 0.26, 0.22], 'text-padding': 4, 'text-max-width': 8,
        // Where the place's own point is taken (a city's point is often its busiest corner), its name may sit just beside it.
        'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.6,
        'symbol-sort-key': ['+', ['*', 100, ['index-of', ['get', 'class'], ['literal', classes]]], ['to-number', ['get', 'rank'], 99]] },
      paint: { 'text-color': ['case', major, c.city, c.place], 'text-halo-color': c.ground, 'text-halo-width': 2.2, 'text-halo-blur': 0.4 } });
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
    // Stop-group tables, placed before everything else: the build found each one room clear of
    // rail, bus streets, station names and route numbers, so place and street names give way to
    // it. Each piece hangs off one point, the plate's middle, by an offset in pixels or ems, so
    // the table holds together as the map zooms. The plate and badges are drawn by the page
    // (main.js, groupImage).
    if (n >= 2) {
      const fixed = { 'icon-allow-overlap': true, 'text-allow-overlap': true, 'text-max-width': 60, 'text-anchor': 'left', 'icon-anchor': 'top-left' };
      layer('group-plate', 'symbol', { filter: kind('group-plate'),
        layout: { ...fixed, 'icon-image': ['concat', `stopgroup-plate-${theme}-`, ['to-string', ['get', 'w']], 'x', ['to-string', ['get', 'h']]], 'icon-offset': ['get', 'off'] } });
      layer('group-badge', 'symbol', { filter: kind('group-badge'),
        layout: { ...fixed, 'icon-anchor': 'center', 'text-anchor': 'center', 'icon-image': `stopgroup-badge-${theme}`, 'icon-offset': ['get', 'off'],
          'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.letter, 'text-offset': ['get', 'toff'] },
        paint: { 'text-color': c.ground } });
      layer('group-text', 'symbol', { filter: kind('group-text'),
        layout: { ...fixed, 'text-field': ['get', 'text'], 'text-offset': ['get', 'off'],
          'text-font': ['case', ['==', ['get', 'role'], 'title'], ['literal', GROUP_FONT.title], ['literal', GROUP_FONT.row]],
          'text-size': ['case', ['==', ['get', 'role'], 'title'], GROUP.title, GROUP.row],
          'text-letter-spacing': ['case', ['==', ['get', 'role'], 'title'], GROUP.titleSpacing, GROUP.rowSpacing] },
        paint: { 'text-color': c.number, 'text-opacity': ['case', ['==', ['get', 'role'], 'title'], GROUP.titleInk, 1] } });
      // A lettered stop's letter on its street, in the table's square: placed first of all, so
      // nothing is set over it (the build kept route numbers and names off it).
      layer('group-stop', 'symbol', { filter: kind('group-stop'),
        layout: { 'icon-image': `stopgroup-street-${theme}`, 'icon-allow-overlap': true, 'text-allow-overlap': true,
          'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.letter },
        paint: { 'text-color': c.ground } });
    }
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
