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
    ground: '#0e141d', water: '#15202f', park: '#101a1c', road: '#131a25', street: '#121923', building: '#121924',
    // Bus streets, quietest to busiest: one family, brighter as buses come more often.
    bus: { c60: '#3c4a63', c30: '#55668a', c15: '#93a3c2', c10: '#c3cde2', c5: '#f0f3fa', c3: '#f0f3fa' },
    mark: '#ffffff', markEdge: '#0e141d', name: '#f3f5f9', place: '#5f6b82', streetName: '#4b566b', number: '#c9d2e4', stop: '#aab6cf',
  },
  light: {
    ground: '#f5f3ef', water: '#d3e1ec', park: '#e7ecdf', road: '#e9e6e0', street: '#ebe8e3', building: '#ebe8e2',
    bus: { c60: '#c0c5ce', c30: '#a5adbb', c15: '#7d889c', c10: '#566179', c5: '#232d45', c3: '#232d45' },
    mark: '#ffffff', markEdge: '#1b2230', name: '#161c28', place: '#8b8f98', streetName: '#a3a6ad', number: '#3a4560', stop: '#566179',
  },
};

// Bus street widths by class, per sheet.
const BUS_WIDTH = {
  1: { c60: 0.8, c30: 1, c15: 1.5, c10: 1.9, c5: 2.3, c3: 2.3 },
  2: { c60: 0.9, c30: 1.2, c15: 1.8, c10: 2.4, c5: 3.1, c3: 3.1 },
  3: { c60: 1.4, c30: 1.8, c15: 2.4, c10: 3, c5: 3.6, c3: 3.6 },
  4: { c60: 2.2, c30: 2.8, c15: 3.6, c10: 4.4, c5: 5.2, c3: 5.2 },
};

// Station name size per sheet (SIZES.name in the build).
const NAME_SIZE = { 1: 11.5, 2: 11.5, 3: 13, 4: 14.5 };

const FONT = { regular: ['Overpass Regular'], medium: ['Overpass Medium'], semibold: ['Overpass SemiBold'], bold: ['Overpass ExtraBold'] };
const byClass = (table) => ['match', ['get', 'cls'], ...Object.entries(table).flat(), Object.values(table)[0]];
const kind = (k, ...more) => ['all', ['==', ['get', 'kind'], k], ...more];
const ROUND = { 'line-cap': 'round', 'line-join': 'round' };

/** The whole style: the ground, then each sheet's layers, each shown only around its own zoom. */
export function sheetStyle(theme) {
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
      paint: { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], c.road, c.street],
        'line-width': ['match', ['get', 'class'], 'motorway', [1, 2, 5, 12][i], ['trunk', 'primary'], [0, 1.2, 4, 10][i], [0, 0, 2.4, 7][i]] } });
    if (n === 4) layers.push({ id: 'buildings-4', type: 'fill', source: 'ground', 'source-layer': 'building', ...band, paint: { 'fill-color': c.building } });

    // Bus streets, quietest first so the busiest are on top; the busiest get a rim of ground to sit clear.
    const order = ['c60', 'c30', 'c15', 'c10', 'c5', 'c3'];
    layer('bus-rim', 'line', { filter: kind('bus', ['in', ['get', 'cls'], ['literal', ['c10', 'c5', 'c3']]]), layout: ROUND,
      paint: { 'line-color': c.ground, 'line-width': ['+', byClass(BUS_WIDTH[n]), 1.6] } });
    layer('bus', 'line', { filter: kind('bus'), layout: { ...ROUND, 'line-sort-key': ['match', ['get', 'cls'], ...order.flatMap((k, j) => [k, j]), 0] },
      paint: { 'line-color': byClass(c.bus), 'line-width': byClass(BUS_WIDTH[n]) } });

    // Bus stops: a hint on the third sheet, each one a ring on the fourth.
    if (n >= 3) layers.push({ id: `stop-${n}`, type: 'circle', source: 'stops', ...band,
      paint: n === 3 ? { 'circle-radius': 1.3, 'circle-color': c.stop, 'circle-opacity': 0.7 } : { 'circle-radius': 3, 'circle-color': c.ground, 'circle-stroke-color': c.stop, 'circle-stroke-width': 1.4 } });

    // Rail: every line whole, with a rim of ground so lines side by side stay apart.
    layer('rail-rim', 'line', { filter: kind('rail'), layout: ROUND, paint: { 'line-color': c.ground, 'line-width': w + 2 * GAP[n] } });
    layer('rail', 'line', { filter: kind('rail'), layout: ROUND, paint: { 'line-color': ['get', 'color'], 'line-width': w } });

    // Stations: one white bar across the lines that stop there; the hub's is heavier.
    const bar = kind('station', ['==', ['get', 'shape'], 'bar']);
    const heavy = ['case', ['get', 'hub'], 2.2, 0];
    layer('station-edge', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': c.markEdge, 'line-width': ['+', w * 0.72 + 2.4, heavy] } });
    layer('station', 'line', { filter: bar, layout: ROUND, paint: { 'line-color': c.mark, 'line-width': ['+', w * 0.72, heavy] } });

    // Lettering, least important first (MapLibre places the last layer first).
    if (n >= 3) layers.push({ id: `street-name-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'transportation_name', ...band,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 320, 'text-field': ['get', 'name'], 'text-font': FONT.regular, 'text-size': n === 3 ? 9 : 10.5, 'text-max-angle': 25, 'text-padding': 8 },
      paint: { 'text-color': c.streetName, 'text-halo-color': c.ground, 'text-halo-width': 1.2 } });
    // Route numbers along each bus street, from the second sheet.
    if (n >= 2) layer('bus-number', 'symbol', { filter: kind('bus'),
      layout: { 'symbol-placement': 'line', 'symbol-spacing': [0, 200, 260, 320][i], 'text-field': ['get', 'label'], 'text-font': FONT.semibold, 'text-size': [0, 8.5, 10, 11.5][i], 'text-max-angle': 25, 'text-padding': 4,
        'text-letter-spacing': 0.02, 'symbol-sort-key': ['-', 0, ['get', 'n']] },
      paint: { 'text-color': c.number, 'text-halo-color': c.ground, 'text-halo-width': 1.8 } });
    layers.push({ id: `place-${n}`, type: 'symbol', source: 'ground', 'source-layer': 'place', ...band,
      filter: ['in', ['get', 'class'], ['literal', n < 3 ? ['city', 'town'] : ['suburb', 'neighbourhood', 'quarter']]],
      layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': FONT.medium, 'text-size': 10.5, 'text-letter-spacing': 0.22, 'text-padding': 12, 'text-max-width': 8 },
      paint: { 'text-color': c.place, 'text-halo-color': c.ground, 'text-halo-width': 1.6 } });
    // Station names: the build has chosen each one's side of its mark (scripts/lib/sheets.mjs, names).
    layer('name', 'symbol', { filter: kind('station', ['==', ['get', 'shape'], 'name']),
      layout: { 'text-field': ['get', 'text'], 'text-font': FONT.semibold, 'text-size': NAME_SIZE[n], 'text-max-width': 40, 'text-line-height': 1.12,
        'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'], 'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-padding': 3 },
      paint: { 'text-color': c.name, 'text-halo-color': c.ground, 'text-halo-width': 2 } });
    // Line letters, placed by the build where each line runs alone: a disc in the line's colour.
    const disc = [7.4, 8.2, 9.4, 10.6][i];
    layer('letter-disc', 'circle', { filter: kind('letter'), paint: { 'circle-radius': disc, 'circle-color': ['get', 'color'], 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5 } });
    layer('letter', 'symbol', { filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': FONT.bold, 'text-size': disc * 1.42, 'text-allow-overlap': true, 'text-offset': [0, 0.06] },
      paint: { 'text-color': ['get', 'ink'] } });
    // Names keep off the lines: unseen marks along rail and the busiest streets hold their ground.
    // (MapLibre places the last layer first, so this comes after the names.)
    layer('keep-off', 'symbol', { filter: n === 1 ? kind('rail') : ['any', kind('rail'), kind('bus', ['in', ['get', 'cls'], ['literal', ['c10', 'c5', 'c3']]])],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 6, 'text-field': 'o', 'text-font': FONT.medium, 'text-size': 7, 'text-allow-overlap': true, 'text-padding': 0, 'text-rotation-alignment': 'viewport' },
      paint: { 'text-opacity': 0 } });
  });
  return {
    version: 8,
    glyphs: new URL('../../vendor/glyphs/{fontstack}/{range}.pbf', import.meta.url).href.replace(/%7B/g, '{').replace(/%7D/g, '}'),
    sources: {
      ground: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      stops: { type: 'geojson', data: new URL('../../data/stops.geojson', import.meta.url).href },
      ...Object.fromEntries(SHEETS.map((s) => [`sheet-${s.id}`, { type: 'geojson', data: new URL(`../../data/sheet-${s.id}.geojson`, import.meta.url).href, tolerance: 0.1 }])),
    },
    layers,
  };
}
