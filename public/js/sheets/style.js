// What each sheet draws, and at what size (DESIGN.md, "Four sheets"). One
// table per sheet; nothing here depends on the zoom except which sheet shows.
// The build draws the geometry for each sheet (scripts/lib/sheets.mjs); this
// file is only ink.

export const SHEETS = [
  { id: 1, zoom: 10 },
  { id: 2, zoom: 12 },
  { id: 3, zoom: 14 },
  { id: 4, zoom: 16 },
];

// Must match SIZES in scripts/lib/sheets.mjs: the build places lines side by side at these widths.
const RAIL = { 1: 3.6, 2: 4.4, 3: 5.6, 4: 8 };
const GAP = { 1: 1.4, 2: 1.6, 3: 2, 4: 2.5 };

export const PALETTES = {
  dark: {
    ground: '#0e141d', water: '#15202f', park: '#101a1c', freeway: '#1b2535', road: '#131a25', street: '#151d2a', building: '#121924',
    // Bus streets, quietest to busiest: one family, brighter as buses come more often.
    bus: { c60: '#4f5d79', c30: '#64759a', c15: '#8291ae', c10: '#aab5cb', c5: '#ccd4e3', c3: '#ccd4e3' },
    hall: '#243147', hallEdge: '#6a7a98',
    mark: '#ffffff', markEdge: '#0e141d', name: '#f3f5f9', place: '#5f6b82', streetName: '#4b566b', number: '#c9d2e4', stop: '#aab6cf',
  },
  light: {
    ground: '#f5f3ef', water: '#d3e1ec', park: '#e7ecdf', freeway: '#e0dcd4', road: '#e9e6e0', street: '#ebe8e3', building: '#ebe8e2',
    bus: { c60: '#b3b6bd', c30: '#9ca0a8', c15: '#868a93', c10: '#5f636c', c5: '#3c4048', c3: '#3c4048' },
    hall: '#dcd8cf', hallEdge: '#979ba3',
    mark: '#ffffff', markEdge: '#1b2230', name: '#161c28', place: '#8b8f98', streetName: '#a3a6ad', number: '#3a4560', stop: '#566179',
  },
};

// Bus street widths by class, per sheet.
export const BUS_WIDTH = {
  1: { c60: 0.8, c30: 1, c15: 1.4, c10: 1.8, c5: 2.1, c3: 2.1 },
  2: { c60: 0.9, c30: 1.2, c15: 1.8, c10: 2.4, c5: 3.1, c3: 3.1 },
  3: { c60: 1.4, c30: 1.8, c15: 2.4, c10: 3, c5: 3.6, c3: 3.6 },
  4: { c60: 2.2, c30: 2.8, c15: 3.6, c10: 4.4, c5: 5.2, c3: 5.2 },
};

// Route number size per sheet, and how far off its street's middle a number is set, in ems:
// the street's half width, a pixel and a half of air, and half the figures' height.
export const NUMBER_SIZE = { 1: 0, 2: 8.5, 3: 10, 4: 11.5 };
export const numberOffset = (n, width) => -((width / 2 + 1.5) / NUMBER_SIZE[n] + 0.36);

// A stop's ring: radius and stroke on sheet 4, and the type size of the unseen mark that keeps
// lettering off it (a letter's box is about as tall as its size: the ring's width and some air).
export const STOP_RING = { radius: 3, stroke: 1.4 };
export const STOP_ROOM = 2 * (STOP_RING.radius + STOP_RING.stroke / 2) + 2;

// Station name size per sheet (SIZES.name in the build).
const NAME_SIZE = { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 };

const FONT = { regular: ['Overpass Regular'], medium: ['Overpass Medium'], semibold: ['Overpass SemiBold'], bold: ['Overpass ExtraBold'] };
const byClass = (table) => ['match', ['get', 'cls'], ...Object.entries(table).flat(), Object.values(table)[0]];
const kind = (k, ...more) => ['all', ['==', ['get', 'kind'], k], ...more];
const ROUND = { 'line-cap': 'round', 'line-join': 'round' };
// Rail ends square, so a line stops at its last station's mark and doesn't poke past it.
const FLAT = { 'line-cap': 'butt', 'line-join': 'round' };

/** The whole style: the ground, then each sheet's layers, each shown only around its own zoom. */
export function sheetStyle(theme, stations = []) {
  // A place that shares a station's name is not lettered twice: the station's own name says it.
  const named = stations.map((s) => s.toUpperCase());
  const c = PALETTES[theme];
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
    layer('bus-rim', 'line', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c10', 'c5', 'c3']]]), layout: ROUND,
      paint: { 'line-color': c.ground, 'line-width': ['+', byClass(BUS_WIDTH[n]), 1.6] } });
    layer('bus', 'line', { filter: kind('bus'), layout: { ...ROUND, 'line-sort-key': ['match', ['get', 'cls'], ...order.flatMap((k, j) => [k, j]), 0] },
      paint: { 'line-color': byClass(c.bus), 'line-width': byClass(BUS_WIDTH[n]) } });

    // A bus station's hall: a quiet room edged like a quiet street, which the streets of its buses
    // end on. It is drawn over them, so a street ends flat on the wall, not in a round blob across it.
    layer('hall', 'fill', { filter: kind('hall'), paint: { 'fill-color': c.hall } });
    layer('hall-edge', 'line', { filter: kind('hall'), layout: ROUND, paint: { 'line-color': c.hallEdge, 'line-width': [0, 1, 1.2, 1.6][i] } });

    // Bus stops: each one a ring, on the closest sheet.
    if (n >= 4) layers.push({ id: `stop-${n}`, type: 'circle', source: `sheet-${n}`, filter: ['==', ['get', 'kind'], 'stop'], ...band,
      paint: n === 3 ? { 'circle-radius': 1.3, 'circle-color': c.stop, 'circle-opacity': 0.7 } : { 'circle-radius': STOP_RING.radius, 'circle-color': c.ground, 'circle-stroke-color': c.stop, 'circle-stroke-width': STOP_RING.stroke } });

    // Rail: every line whole, with a rim of ground so lines side by side stay apart.
    layer('rail-rim', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': c.ground, 'line-width': w + 2 * GAP[n] } });
    layer('rail', 'line', { filter: kind('rail'), layout: FLAT, paint: { 'line-color': ['get', 'color'], 'line-width': w } });

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
    if (n >= 3) layers.push({ id: `street-name-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'transportation_name', ...band,
      filter: ['in', ['get', 'class'], ['literal', n === 3 ? ['primary', 'secondary', 'tertiary', 'trunk'] : ['primary', 'secondary', 'tertiary', 'trunk', 'minor']]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': ['get', 'name'], 'text-font': FONT.regular, 'text-size': n === 3 ? 9 : 10.5, 'text-max-angle': 25, 'text-padding': 14, 'text-offset': [0, n === 4 ? 1.3 : 0] },
      paint: { 'text-color': c.streetName, 'text-halo-color': c.ground, 'text-halo-width': 1.2 } });
    layers.push({ id: `place-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'place', ...band,
      filter: ['all', ['in', ['get', 'class'], ['literal', n < 3 ? ['city', 'town'] : ['suburb', 'neighbourhood', 'quarter']]], ['!', ['in', ['upcase', ['get', 'name']], ['literal', named]]]],
      layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': FONT.medium, 'text-size': 10.5, 'text-letter-spacing': 0.22, 'text-padding': 4, 'text-max-width': 8 },
      paint: { 'text-color': c.place, 'text-halo-color': c.ground, 'text-halo-width': 1.6 } });
    const unseen = { layout: { 'symbol-placement': 'line', 'symbol-spacing': 6, 'text-field': 'o', 'text-font': FONT.medium, 'text-size': 7, 'text-allow-overlap': true, 'text-padding': 0, 'text-rotation-alignment': 'viewport' }, paint: { 'text-opacity': 0 } };
    layer('keep-off-bus', 'symbol', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c15', 'c10', 'c5', 'c3']]]), ...unseen });
    // Route numbers along each bus street, from the second sheet.
    if (n >= 2) layer('bus-number', 'symbol', { filter: kind('bus-label'),
      // Set just beside the street, not on it: on it, the line shows between the figures and a
      // comma reads as a dash. The offset is the street's half width and a little air, in ems.
      layout: { 'symbol-placement': 'line', 'symbol-spacing': [0, 200, 260, 320][i], 'text-field': ['get', 'label'], 'text-font': FONT.semibold, 'text-size': NUMBER_SIZE[n], 'text-max-angle': 25, 'text-padding': 4,
        // The build says which side has room (`side` -1: below the figures, where a street runs close above).
        'text-offset': ['case', ['==', ['get', 'side'], -1],
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, -numberOffset(n, w)]]]))),
          byClass(Object.fromEntries(Object.entries(BUS_WIDTH[n]).map(([k, w]) => [k, ['literal', [0, numberOffset(n, w)]]])))],
        'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']] },
      paint: { 'text-color': c.number, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    // Station names: the build has chosen each one's side of its mark (scripts/lib/sheets.mjs, names).
    layer('name', 'symbol', { filter: kind('station', ['==', ['get', 'shape'], 'name']),
      layout: { 'text-field': ['get', 'text'], 'text-font': ['case', ['get', 'minor'], ['literal', FONT.medium], ['literal', FONT.semibold]], 'text-size': ['case', ['get', 'minor'], 10, NAME_SIZE[n]], 'text-max-width': 40, 'text-line-height': 1.12,
        'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'], 'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-padding': 3 },
      paint: { 'text-color': c.name, 'text-halo-color': c.ground, 'text-halo-width': 2 } });
    // Line letters, placed by the build where each line runs alone: a disc in the line's colour.
    const disc = [7.4, 8.2, 9.4, 10.6][i];
    // Beside a station's name the letters are smaller (scripts/lib/sheets.mjs, SIZES.nameLetter).
    const small = [5.6, 6, 6.6, 7.4][i];
    layer('letter-disc', 'circle', { filter: kind('letter'), paint: { 'circle-radius': ['case', ['to-boolean', ['get', 'small']], small, disc], 'circle-color': ['get', 'color'], 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5 } });
    layer('letter', 'symbol', { filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': FONT.bold, 'text-size': ['case', ['to-boolean', ['get', 'small']], small * 1.42, disc * 1.42], 'text-allow-overlap': true, 'text-offset': [0, 0.06] },
      paint: { 'text-color': ['get', 'ink'] } });
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
      ...Object.fromEntries(SHEETS.map((s) => [`sheet-${s.id}`, { type: 'geojson', data: new URL(`../../data/sheet-${s.id}.geojson`, import.meta.url).href, tolerance: 0.1,
        // Big tiles with a wide margin, so a label's stretch of street is whole in the tile that places it.
        maxzoom: s.zoom - 1, buffer: 256 }])),
    },
    layers,
  };
}
