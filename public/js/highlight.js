// "Highlight, don't list" (DESIGN.md): opening a route keeps it at full
// strength and fades the rest of the network to about 20%.
//
// The fading is done with MapLibre global state, so the layer definitions in
// main.js carry the rule once and choosing a route is two cheap property
// writes (no layer is rebuilt and no tile reloads):
//   sel          the route code, or '' when nothing is chosen
//   selStations  the ids of the stations on it, as " 89 232 "
// Space-separated lists on features ("A B C", bus codes) are matched as whole
// words by padding both sides with spaces.

import { FONT } from './basemap.js';
import { PART_TIME, tierMatch, tierWidth } from './shared.js';
import { P } from './palette.js';

export const DIM = 0.2;
const SEL = ['global-state', 'sel'];
const SEL_STATIONS = ['global-state', 'selStations'];
const none = ['==', SEL, ''];

export const STATE = { sel: { default: '' }, selStations: { default: '' } };

// Full strength unless something is chosen and this feature isn't part of it.
export const fade = (hit) => ['case', none, 1, hit, 1, DIM];
// The feature is the chosen route (its own `route`, or another property).
export const isRoute = (prop = 'route') => ['==', ['get', prop], SEL];
// The chosen route is one of the words in a list property.
export const inList = (prop) => ['in', ['concat', ' ', SEL, ' '], ['concat', ' ', ['coalesce', ['get', prop], ''], ' ']];
// The feature is a station on the chosen route.
export const onRoute = ['in', ['concat', ' ', ['to-string', ['get', 'id']], ' '], ['concat', ' ', SEL_STATIONS, ' ']];

const bus = ['==', ['get', 'mode'], 'bus'];
const tierIs = (ids) => ['in', ['get', 'tier'], ['literal', ids]];
const broken = tierIs(PART_TIME);

// The chosen bus route, drawn over its faded neighbours on a casing (white on
// the light map, near-black on the dark one). Each
// stretch keeps its own tier's colour, dash and width (only a little bolder),
// so the lighter parts are still the parts that come less often. Dashes can't
// vary by feature in MapLibre, so there is one layer per dash pattern, drawn
// with the same filters as the network layers they sit over (main.js).
const SEL_PARTS = [
  { id: 'sel-bus', where: ['!', broken], cap: 'round' },
  { id: 'sel-bus-dashed', where: ['all', broken, ['!=', ['get', 'tier'], 'limited']], dash: [3, 2] },
  { id: 'sel-bus-dotted', where: ['==', ['get', 'tier'], 'limited'], dash: [0.1, 2.2], cap: 'round' },
];
const CASING = 'sel-bus-casing';
const chosen = (code) => ['all', bus, ['==', ['get', 'route'], code ?? '']];
const within = (where, code) => ['all', chosen(code), where];

export function selectionLines() {
  const layout = (cap = 'butt') => ({ 'line-cap': cap, 'line-join': 'round' });
  return [
    {
      id: CASING,
      type: 'line',
      source: 'routes',
      filter: chosen(''),
      layout: layout('round'),
      paint: { 'line-color': P.casing, 'line-width': tierWidth(4.2), 'line-opacity': 0.92 },
    },
    ...SEL_PARTS.map(({ id, where, dash, cap }) => ({
      id,
      type: 'line',
      source: 'routes',
      filter: within(where, ''),
      layout: layout(cap),
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(1.6), ...(dash ? { 'line-dasharray': dash } : {}) },
    })),
  ];
}

// The two ends of the chosen route, named on the map.
export function selectionMarks() {
  return [
    // A ring around the stop or place that is open.
    {
      id: 'sel-place',
      type: 'circle',
      source: 'selection',
      filter: ['==', ['get', 'kind'], 'place'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 9, 18, 14],
        'circle-color': P.clear,
        'circle-stroke-color': P.ink,
        'circle-stroke-width': 2.5,
      },
    },
    {
      id: 'sel-ends',
      type: 'symbol',
      source: 'selection',
      filter: ['==', ['get', 'kind'], 'end'],
      layout: {
        'icon-image': 'sel-end',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'name'],
        'text-font': FONT.bold,
        'text-size': 13,
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-max-width': 9,
        // Always shown, and it claims its space, so a city name beneath it
        // gives way instead of showing through ("DeUnion Station").
        'text-allow-overlap': true,
      },
      paint: { 'text-color': P.ink, 'text-halo-color': P.casing, 'text-halo-width': 2.2 },
    },
  ];
}

export function setHighlight(map, code, stationIds = []) {
  map.setGlobalStateProperty('sel', code ?? '');
  map.setGlobalStateProperty('selStations', code ? ` ${stationIds.join(' ')} ` : '');
  map.setFilter(CASING, chosen(code));
  for (const { id, where } of SEL_PARTS) map.setFilter(id, within(where, code));
}

// What is marked on the map for the open panel: a route's two ends, or a ring
// around a stop or place.
export function setEnds(map, goes = [], place = null) {
  const point = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
  map.getSource('selection')?.setData({
    type: 'FeatureCollection',
    features: [...goes.map((g) => point({ kind: 'end', name: g.name }, g.at)), ...(place ? [point({ kind: 'place' }, place)] : [])],
  });
}
