// What each sheet draws, and at what size (DESIGN.md, "Four sheets"). One
// table per sheet; nothing here depends on the zoom except which sheet shows.
// The build draws the geometry for each sheet (scripts/lib/sheets.mjs); this
// file is only ink.
import { contrast, darkenTo, liftTo, lightness, toOklch, fromOklch } from '../color.js';

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
// streets by its spine (BUS_SPINE), not by width. The middle step (a bus every 15 minutes) is a
// little under it, so a corridor such as the Flatiron Flyer reads as a corridor; the quiet step is
// rail's width over 1.6 twice, and on the opening sheet a one-pixel hairline (there it is the whole
// outer street grid).
export const MID_UNDER_TOP = 1.4;
// The busiest streets, a bus every 5 minutes or better (the build's two top classes), are a size
// up on sheets 1 to 3: wider than rail by this much, core and all, so the city's busiest street
// reads above the frequent grid. They are a few streets, not a district (downtown on sheet 3, about
// an eighth of the bus ink), so they do not make a mat. Sheet 4 keeps them at rail's width, under
// a stop's ring. Rail still reads first by its colour.
export const BUSIEST = ['c5', 'c3'];
export const BUSIEST_OVER_RAIL = { 1: 1.3, 2: 1.3, 3: 1.3, 4: 1 };
const QUIET = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n, n === '1' ? 1 : w / 1.6 ** 2]));
// The frequent steps (a bus every 15 minutes or better) are a tinted band with a spine down the
// middle: the band is the street's width in a pale wash of the bus blue, the spine this share of
// it in the step's own ink. The quiet step is a plain line in its ink.
export const BUS_SPINE = { mid: 0.45, top: 0.42 };
// The express (the streets the build marks `express`: today the Flatiron Flyer) is drawn as any bus street of its frequency,
// band, spine, width and order alike, in a rose (OKLCh hue, degrees) in place of the blue: clear of
// the purple lines and the red one, and never red.
export const EXPRESS_HUE = 355;
// The dashed line down the express's and the airport buses' spine.
const DASH = { light: '#ffffff', dark: '#f1eef3' };
// Airport buses (the streets the build marks `airport`: the routes RTD files as SkyRide) are drawn the
// same way again, in an indigo: between the bus blue and the E Line's purple, a little stronger than
// the blue so the colour shows even on a quiet street, and a little lighter than the E Line in the
// light theme so the two don't meet as near twins. Its tones: chroma × `chroma` (× `quiet` more on the
// quiet step, a thin line), and each tone lifted by `lift` in OKLab L.
export const AIRPORT = { hue: 278, chroma: 1.5, quiet: 1.8, lift: { light: 0.02, dark: 0.04 } };
const steps = (quiet, mid, top) => Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, [quiet, mid, top][s]]));

// The bus blue's hue: the middle of the widest gap RTD's rail colours leave round the colour
// wheel, so no bus street reads as a rail line (DESIGN.md, "Four sheets"). Greys don't count.
// With no line colours to go by (a test), a blue.
export const BUS_HUE_FALLBACK = (267 * Math.PI) / 180;
export function busHue(colors = []) {
  const turn = 2 * Math.PI;
  const hues = colors.map(toOklch).filter(([, C]) => C >= 0.04).map(([, , h]) => h).sort((a, b) => a - b);
  let best = null;
  hues.forEach((h, i) => {
    const gap = (i + 1 < hues.length ? hues[i + 1] : hues[0] + turn) - h;
    if (!best || gap > best.gap) best = { gap, h: (h + gap / 2) % turn };
  });
  return best ? best.h : BUS_HUE_FALLBACK;
}

export const PALETTES = {
  dark: {
    ground: '#0e141d', water: '#15202f', park: '#101a1c', freeway: '#1b2535', road: '#131a25', street: '#151d2a', building: '#121924',
    // Bus streets, quietest to busiest, as OKLCh [lightness, chroma] in the bus hue (busHue): a quiet
    // blue, lighter and a little stronger each step. The quiet step on the opening sheet (hairline)
    // sits nearer the ground: there it is the whole outer street grid, which should sit back.
    busTone: { hairline: [0.4, 0.045], quiet: [0.48, 0.05], mid: [0.66, 0.07], top: [0.74, 0.085] },
    // The frequent steps' band, and how strongly it is laid over the ground (it is mixed, not see-through,
    // so streets that cross show no darker knot).
    busWash: { mid: [0.55, 0.09], top: [0.6, 0.11], strength: 0.7 },
    // Rail stands RAIL_OVER_BUS above this grey's contrast with the ground (railInk): the weight the
    // busiest bus street had when bus streets were grey. Rail's own inks were set against it.
    railFloor: '#79818d',
    hall: '#243147', hallEdge: '#6a7a98',
    mark: '#ffffff', markEdge: '#0e141d', name: '#f3f5f9', place: '#5f6b82', city: '#9ba5b8', streetName: '#5c6780', busStreetName: '#7b869b', number: '#c9d2e4', stop: '#aab6cf',
    // A picked bus route: the brightest ink on the sheet, nearly the station names', and no rail line's hue.
    pick: '#eef1f6',
  },
  light: {
    ground: '#f5f3ef', water: '#d3e1ec', park: '#e7ecdf', freeway: '#e0dcd4', road: '#e9e6e0', street: '#ebe8e3', building: '#ebe8e2',
    busTone: { hairline: [0.79, 0.045], quiet: [0.7, 0.055], mid: [0.56, 0.08], top: [0.47, 0.095] },
    busWash: { mid: [0.78, 0.07], top: [0.72, 0.09], strength: 0.9 },
    railFloor: '#70757c',
    hall: '#dcd8cf', hallEdge: '#979ba3',
    mark: '#ffffff', markEdge: '#1b2230', name: '#161c28', place: '#8b8f98', city: '#555a63', streetName: '#8a8d95', busStreetName: '#73777f', number: '#3a4560', stop: '#566179',
    pick: '#1d2433',
  },
};

// Bus street widths by class, per sheet.
export const BUS_WIDTH = Object.fromEntries(Object.entries(RAIL).map(([n, w]) => [n,
  Object.fromEntries(Object.entries(BUS_STEP).map(([k, s]) => [k, Math.round([QUIET[n], w / MID_UNDER_TOP, BUSIEST.includes(k) ? w * BUSIEST_OVER_RAIL[n] : w][s] * 100) / 100]))]));

// Rail stands out from the busiest bus street by at least this much more contrast with the ground.
export const RAIL_OVER_BUS = 1.15;
// In the light, a colour is darkened no more than this (OKLab L) to reach the floor; past it,
// orange turns brown and lime olive, so the line keeps RTD's colour and gets a casing instead.
export const LIGHT_SHADE_MOST = 0.12;
// A cased line's casing, each side, per sheet: it sits in the gap between lines that share track.
const CASING = { 1: 0.6, 2: 0.7, 3: 0.8, 4: 1 };

/** The same, in the express's rose, and in the airport buses' indigo. */
export const expressInk = (theme, n) => busInk(theme, n, [], (EXPRESS_HUE * Math.PI) / 180);
export const expressWash = (theme) => busWash(theme, [], (EXPRESS_HUE * Math.PI) / 180);
const AIRPORT_TINT = (theme) => ({ chroma: AIRPORT.chroma, quiet: AIRPORT.quiet, lift: AIRPORT.lift[theme] });
export const airportInk = (theme, n) => busInk(theme, n, [], (AIRPORT.hue * Math.PI) / 180, AIRPORT_TINT(theme));
export const airportWash = (theme) => busWash(theme, [], (AIRPORT.hue * Math.PI) / 180, AIRPORT_TINT(theme));
const PLAIN = { chroma: 1, quiet: 1, lift: 0 };
/** Each bus class's ink on one sheet (a frequent step's spine): the opening sheet draws its quiet step as a faint hairline. */
export const busInk = (theme, n, colors = [], h = busHue(colors), { chroma, quiet, lift } = PLAIN) => {
  const t = PALETTES[theme].busTone;
  return steps(...[n === 1 ? t.hairline : t.quiet, t.mid, t.top].map(([L, C], j) => fromOklch(L + lift, C * chroma * (j === 0 ? quiet : 1), h)));
};
/** The frequent steps' band, laid over the ground: `{ c15, c10, c5, c3 }`. */
export const busWash = (theme, colors = [], h = busHue(colors), { chroma } = PLAIN) => {
  const c = PALETTES[theme];
  const [mid, top] = [c.busWash.mid, c.busWash.top].map(([L, C]) => mix(fromOklch(L, C * chroma, h), c.ground, 1 - c.busWash.strength));
  return Object.fromEntries(Object.entries(BUS_STEP).filter(([, s]) => s > 0).map(([k, s]) => [k, s === 1 ? mid : top]));
};

/** How each theme inks one of RTD's line colours: `{ line, casing, ink }`. No colour is named here. */
export function railInk(theme, color) {
  const c = PALETTES[theme];
  const floor = contrast(c.railFloor, c.ground) * RAIL_OVER_BUS;
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

// --- A picked route (DESIGN.md, "Four sheets": tap a route to highlight it) ----------------
// The page sets MapLibre global state `bus` or `rail` to the route the reader picked ('' for
// none; main.js). It is a layer of state over the drawing: every sheet's layers carry the rule
// once, so a pick is one property write, holds on every sheet, and no tile is made again.
// Everything not on the route is inked nearer the ground rather than made see-through, so
// pieces that overlap at a corner do not show darker knots.
export const STATE = { bus: { default: '' }, rail: { default: '' } };
const BUS = ['global-state', 'bus'];
const RAIL_PICK = ['global-state', 'rail'];
export const PICKED = ['any', ['!=', BUS, ''], ['!=', RAIL_PICK, '']];
// The picked route is one of a list: "0, 1, 15L" (a stacked list breaks a row after a comma).
const listed = (prop, pick) => ['any',
  ['in', ['concat', ' ', pick, ','], ['concat', ' ', ['get', prop], ',']],
  ['in', ['concat', '\n', pick, ','], ['concat', ' ', ['get', prop], ',']]];
export const onBus = (prop = 'routes') => ['all', ['!=', BUS, ''], listed(prop, BUS)];
export const onRail = ['all', ['!=', RAIL_PICK, ''], ['==', ['get', 'route'], RAIL_PICK]];
// A station on the picked line ("A B C").
export const atStation = ['all', ['!=', RAIL_PICK, ''], ['in', ['concat', ' ', RAIL_PICK, ' '], ['concat', ' ', ['get', 'lines'], ' ']]];
// How far toward the ground what is off the route goes: lines to about a fifth of their
// strength, lettering a little less so the streets and stations around the route still read.
export const FADE = { line: 0.8, text: 0.68, station: 0.72, stationNearBus: 0.45 };
/** `color` a fraction `t` of the way to `ground` (sRGB), as #rrggbb. */
export function mix(color, ground, t) {
  const rgb = (h) => [1, 3, 5].map((at) => parseInt(String(h).slice(at, at + 2), 16));
  const [a, b] = [rgb(color), rgb(ground)];
  return `#${a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join('')}`;
}
// Ink that stays whole on the route (or when nothing is picked) and fades off it. `full` and
// `faded` are the same expression with each colour mixed toward the ground.
const unless = (hit, full, faded) => ['case', ['any', ['!', PICKED], hit], full, faded];

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
  const byColor = (key, fallback, t = 0) => (inks.length ? ['match', ['get', 'color'], ...inks.flatMap((x) => [x.color, t ? mix(x[key] ?? x.line, c.ground, t) : x[key] ?? x.line]), fallback] : fallback);
  const lineInk = byColor('line', ['get', 'color']);
  const fadeTo = (color, t) => mix(color, c.ground, t);
  const fadeTable = (table, t) => Object.fromEntries(Object.entries(table).map(([k, x]) => [k, fadeTo(x, t)]));
  // Off the picked line, a rail line or letter disc takes its faded ink.
  const railLine = unless(onRail, lineInk, byColor('line', ['get', 'color'], FADE.line));
  const railCasing = unless(onRail, byColor('casing', c.ground), byColor('casing', c.ground, FADE.line));
  const textInk = (color, hit) => unless(hit, color, fadeTo(color, FADE.text));
  // A station's mark: whole on the picked line; off it, faded with the lines, and only half
  // as far when a bus is picked, so the stations it passes still read as places.
  const stationInk = (color) => ['case', ['any', ['!', PICKED], atStation], color, ['!=', BUS, ''], fadeTo(color, FADE.stationNearBus), fadeTo(color, FADE.station)];
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


    // Bus streets, quietest first so the busiest are on top; the frequent steps get a rim of ground to sit clear.
    const order = ['c60', 'c30', 'c15', 'c10', 'c5', 'c3'];
    const frequent = ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]];
    const ink = busInk(theme, n, colors);
    const rose = expressInk(theme, n);
    const air = airportInk(theme, n);
    // A quiet street is a line in its ink; a frequent one is its band (busWash), with its spine on top.
    // An express street is the same in rose, an airport bus's in indigo (the express wins where both run).
    const body = { ...ink, ...busWash(theme, colors) };
    const roseBody = { ...rose, ...expressWash(theme) };
    const airBody = { ...air, ...airportWash(theme) };
    const onExpress = ['==', ['get', 'express'], true];
    const onAirport = ['all', ['==', ['get', 'airport'], true], ['!', onExpress]];
    const inks = (blue, red, indigo) => ['case', onExpress, byClass(red), onAirport, byClass(indigo), byClass(blue)];
    const whole = (blue, red, indigo) => ['case', PICKED,
      inks(fadeTable(blue, FADE.line), fadeTable(red, FADE.line), fadeTable(indigo, FADE.line)), inks(blue, red, indigo)];
    layer('bus-rim', 'line', { filter: kind('bus', frequent), layout: ROUND,
      paint: { 'line-color': c.ground, 'line-width': ['+', byClass(BUS_WIDTH[n]), 1.6] } });
    layer('bus', 'line', { filter: kind('bus'), layout: { ...ROUND, 'line-sort-key': ['match', ['get', 'cls'], ...order.flatMap((k, j) => [k, j]), 0] },
      // The picked route's own streets are drawn again on top (pick-bus, below), so all of them fade here.
      paint: { 'line-color': whole(body, roseBody, airBody), 'line-width': byClass(BUS_WIDTH[n]) } });
    // The frequent steps' spine: the step's ink down the band's middle, a share of its width, so the
    // busiest streets keep their extra width in spine and band alike.
    const spine = Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, x]) => [k, x * (BUS_STEP[k] === 1 ? BUS_SPINE.mid : BUS_SPINE.top)]));
    layer('bus-spine', 'line', { filter: kind('bus', frequent), layout: ROUND,
      paint: { 'line-color': whole(ink, rose, air), 'line-width': byClass(spine) } });
    // The express and the airport buses where they run often: a thin pale dashed line down the spine,
    // highway style. A quiet one stays a plain line, so neither looks more frequent than it is.
    layer('marked-dash', 'line', { filter: kind('bus', ['all', ['any', onExpress, onAirport], frequent]), layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': unless(onBus(), DASH[theme], fadeTo(DASH[theme], FADE.line)), 'line-width': Math.max(0.8, w * 0.16), 'line-dasharray': [3, 2.5] } });
    // Where a bus line ends: a ring on its end, ground inside, in the line's own ink, a little
    // wider than the line, so the line stops on something (a stop) rather than in the open.
    if (n <= 3) layer('bus-end', 'circle', { filter: kind('bus-end'), paint: {
      'circle-radius': ['+', ['/', byClass(BUS_WIDTH[n]), 2], BUS_END.stroke + 0.9], 'circle-color': c.ground,
      'circle-stroke-color': whole(ink, rose, air), 'circle-stroke-width': BUS_END.stroke } });

    // A bus station's hall: a quiet room edged like a quiet street, which the streets of its buses
    // end on. It is drawn over them, so a street ends flat on the wall, not in a round blob across it.
    layer('hall', 'fill', { filter: kind('hall'), paint: { 'fill-color': c.hall } });
    layer('hall-edge', 'line', { filter: kind('hall'), layout: ROUND, paint: { 'line-color': ['case', PICKED, fadeTo(c.hallEdge, FADE.text), c.hallEdge], 'line-width': [0, 1, 1.2, 1.6][i] } });

    // Bus stops: each one a ring, on the closest sheet.
    if (n >= 4) layers.push({ id: `stop-${n}`, type: 'circle', source: `sheet-${n}`, filter: ['all', ['==', ['get', 'kind'], 'stop'], ['!', ['has', 'letter']]], ...band,
      paint: n === 3 ? { 'circle-radius': 1.3, 'circle-color': c.stop, 'circle-opacity': 0.7 } : { 'circle-radius': STOP_RING.radius, 'circle-color': c.ground, 'circle-stroke-color': ['case', PICKED, fadeTo(c.stop, FADE.line), c.stop], 'circle-stroke-width': STOP_RING.stroke } });
    // A stop RTD letters (one of a street's stop groups, scripts/lib/sheets.mjs, stopGroups) shows
    // its letter in place of the ring: a small square in the stops' grey, the letter in the ground's.
    // Off a picked route it fades with the stops (pick-stop rings it again when it is on the route).
    if (n >= 4) layer('stop-letter', 'symbol', { filter: kind('stop', ['has', 'letter']),
      layout: { 'icon-image': `stopgroup-stop-${theme}`, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.stopLetter, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': c.ground, 'icon-opacity': unless(onBus(), 1, 1 - FADE.line), 'text-opacity': unless(onBus(), 1, 1 - FADE.line) } });

    // Rail: every line whole, with a rim of ground so lines side by side stay apart.
    layer('rail-rim', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': c.ground, 'line-width': w + 2 * GAP[n] } });
    // A pale line that can't stand off the ground in its own hue has a thin casing of its own colour, darker.
    if (cased.length) layer('rail-casing', 'line', { filter: kind('rail', ['in', ['get', 'color'], ['literal', cased.map((x) => x.color)]]), layout: FLAT,
      paint: { 'line-color': railCasing, 'line-width': w + 2 * CASING[n] } });
    layer('rail', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': railLine, 'line-width': w } });

    // The picked bus route, whole, over everything but the stations: one weight and one ink from
    // end to end on a rim of ground, its pieces joined round, so it reads as one line however
    // many streets it takes. Its stops are ringed again on top of it.
    const pickBus = ['all', ['==', ['get', 'kind'], 'bus'], onBus()];
    layer('pick-bus-rim', 'line', { filter: pickBus, layout: ROUND, paint: { 'line-color': c.ground, 'line-width': w + 2 * GAP[n] } });
    layer('pick-bus', 'line', { filter: pickBus, layout: ROUND, paint: { 'line-color': c.pick, 'line-width': w } });
    if (n >= 4) layers.push({ id: `pick-stop-${n}`, type: 'circle', source, ...band, filter: ['all', ['==', ['get', 'kind'], 'stop'], onBus()],
      paint: { 'circle-radius': STOP_RING.radius, 'circle-color': c.ground, 'circle-stroke-color': c.pick, 'circle-stroke-width': STOP_RING.stroke } });

    // Stations: one white bar across the lines that stop there; the hub's is heavier.
    const bar = kind('station', ['==', ['get', 'shape'], 'bar']);
    // A station on one line is a dot a little wider than its line, so it reads as a station.
    const thin = ['case', ['get', 'single'], w + 1.4, ['get', 'hub'], w * 0.72 + 2.2, w * 0.72];
    // Lines that meet back to back at a bar get a fat one, about half again as thick, with a divider down it.
    const mark = ['case', ['get', 'fat'], ['+', ['*', 1.6, thin], 1], thin];
    layer('station-edge', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': stationInk(c.markEdge), 'line-width': ['+', mark, 2.6] } });
    layer('station', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': stationInk(c.mark), 'line-width': mark } });
    layer('station-divider', 'line', { filter: ['all', bar, ['==', ['get', 'fat'], true]], layout: FLAT, paint: { 'line-color': stationInk(c.markEdge), 'line-width': 1.2 } });

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
    // Repeated along them: the express's slanted shield with its name from RTD's data (`shield`), and the
    // airport buses' small plane, pointing along the line. Above keep-off-bus so they are placed first and
    // the labels below keep clear of them; they keep clear of each other.
    const markOpacity = unless(onBus(), 1, 1 - FADE.line);
    const along = { 'symbol-placement': 'line', 'symbol-spacing': [160, 200, 260, 320][i], 'symbol-sort-key': -1000, 'icon-padding': 6 };
    layer('express-shield', 'symbol', { filter: kind('bus', onExpress),
      layout: { ...along, 'icon-image': `express-shield-${theme}`, 'icon-rotation-alignment': 'viewport',
        'text-field': ['get', 'shield'], 'text-font': FONT.bold, 'text-size': 7, 'text-letter-spacing': -0.02, 'text-rotation-alignment': 'viewport', 'text-padding': 6 },
      paint: { 'text-color': theme === 'dark' ? c.ground : '#ffffff', 'icon-opacity': markOpacity, 'text-opacity': markOpacity } });
    layer('airport-plane', 'symbol', { filter: kind('bus', onAirport),
      layout: { ...along, 'icon-image': `airport-plane-${theme}`, 'icon-rotation-alignment': 'map' },
      paint: { 'icon-opacity': markOpacity } });
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
      paint: { 'text-color': textInk(c.number, onBus('label')), 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // A list too long for its stretch in one row is stacked in two (scripts/lib/sheets.mjs, labelRuns): one piece
    // of lettering turned the way its street runs, so both rows show or neither does. Its middle sits half a row
    // farther off the street than a single row's, so the nearer row is where a single row would be.
    if (n >= 2) layer('bus-stack', 'symbol', { filter: kind('bus-stack'),
      layout: { 'text-field': ['get', 'label'], 'text-font': FONT.semibold, 'text-size': NUMBER_SIZE[n], 'text-max-width': 100, 'text-line-height': ROW_HEIGHT, 'text-justify': 'center', 'text-padding': 2,
        'text-rotate': ['get', 'angle'], 'text-rotation-alignment': 'map', 'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']],
        'text-offset': ['case', ['==', ['get', 'side'], -1],
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w) + ROW_HEIGHT / 2]]]))),
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w) - ROW_HEIGHT / 2]]])))] },
      paint: { 'text-color': textInk(c.number, onBus('label')), 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
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
    // A picked bus route holds its ground like rail: placed before the place names, so a town's
    // name and its halo move off the route instead of cutting it.
    layer('keep-off-pick', 'symbol', { filter: ['all', ['==', ['get', 'kind'], 'bus'], onBus()], ...unseen });
    // Station names: the build has chosen each one's side of its mark (scripts/lib/sheets.mjs, names).
    layer('name', 'symbol', { filter: kind('station', ['==', ['get', 'shape'], 'name']),
      layout: { 'text-field': ['get', 'text'], 'text-font': ['case', ['get', 'minor'], ['literal', FONT.medium], ['literal', FONT.semibold]], 'text-size': ['case', ['get', 'minor'], 10, NAME_SIZE[n]], 'text-max-width': 40, 'text-line-height': 1.12,
        'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'], 'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-padding': 3 },
      paint: { 'text-color': textInk(c.name, ['any', atStation, ['!=', BUS, '']]), 'text-halo-color': c.ground, 'text-halo-width': 2 } });
    // Line letters, placed by the build where each line runs alone: a disc in the line's colour.
    const disc = [7.4, 8.2, 9.4, 10.6][i];
    // Beside a station's name the letters are smaller (scripts/lib/sheets.mjs, SIZES.nameLetter).
    const small = [5.6, 6, 6.6, 7.4][i];
    layer('letter-disc', 'circle', { filter: kind('letter'), paint: { 'circle-radius': ['case', ['to-boolean', ['get', 'small']], small, disc], 'circle-color': railLine, 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5 } });
    layer('letter', 'symbol', { filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': FONT.bold, 'text-size': ['case', ['to-boolean', ['get', 'small']], small * 1.42, disc * 1.42], 'text-allow-overlap': true, 'text-offset': [0, 0.06] },
      paint: { 'text-color': unless(onRail, letterInk, byColor('ink', ['get', 'ink'], FADE.line)) } });
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
        layout: { ...fixed, 'icon-image': ['concat', `stopgroup-plate-${theme}-`, ['to-string', ['get', 'w']], 'x', ['to-string', ['get', 'h']]], 'icon-offset': ['get', 'off'] },
        // A picked route fades the table with the rest of the lettering; the card still lists it.
        paint: { 'icon-opacity': ['case', PICKED, 1 - FADE.text, 1] } });
      layer('group-badge', 'symbol', { filter: kind('group-badge'),
        layout: { ...fixed, 'icon-anchor': 'center', 'text-anchor': 'center', 'icon-image': `stopgroup-badge-${theme}`, 'icon-offset': ['get', 'off'],
          'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.letter, 'text-offset': ['get', 'toff'] },
        paint: { 'text-color': c.ground, 'icon-opacity': ['case', PICKED, 1 - FADE.text, 1], 'text-opacity': ['case', PICKED, 1 - FADE.text, 1] } });
      layer('group-text', 'symbol', { filter: kind('group-text'),
        layout: { ...fixed, 'text-field': ['get', 'text'], 'text-offset': ['get', 'off'],
          'text-font': ['case', ['==', ['get', 'role'], 'title'], ['literal', GROUP_FONT.title], ['literal', GROUP_FONT.row]],
          'text-size': ['case', ['==', ['get', 'role'], 'title'], GROUP.title, GROUP.row],
          'text-letter-spacing': ['case', ['==', ['get', 'role'], 'title'], GROUP.titleSpacing, GROUP.rowSpacing] },
        paint: { 'text-color': c.number, 'text-opacity': ['*', ['case', ['==', ['get', 'role'], 'title'], GROUP.titleInk, 1], ['case', PICKED, 1 - FADE.text, 1]] } });
      // A lettered stop's letter on its street, in the table's square: placed first of all, so
      // nothing is set over it (the build kept route numbers and names off it).
      layer('group-stop', 'symbol', { filter: kind('group-stop'),
        layout: { 'icon-image': `stopgroup-street-${theme}`, 'icon-allow-overlap': true, 'text-allow-overlap': true,
          'text-field': ['get', 'letter'], 'text-font': GROUP_FONT.title, 'text-size': GROUP.letter },
        // A picked route keeps its own stops' letters whole; the others fade as far as the lines,
        // so the route reads unbroken where it passes a stop it doesn't use.
        paint: { 'text-color': c.ground, 'icon-opacity': unless(onBus(), 1, 1 - FADE.line), 'text-opacity': unless(onBus(), 1, 1 - FADE.line) } });
    }
  });
  return {
    version: 8,
    state: STATE,
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
