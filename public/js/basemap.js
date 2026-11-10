// Our own basemap on OpenFreeMap's vector tiles (OpenMapTiles schema). Its
// colors stay quiet so the network leads, but its words carry the sense of
// place (DESIGN.md, "Basemap"): street names you can find an intersection by,
// highway numbers, neighborhoods and landmarks. No railways, no POI icons.
// Every colour is in the palette (palette.js), one set for each theme. The
// layer lists are functions, called again when the system theme changes.

import { P } from './palette.js';
import { DETAIL_FROM, PART_TIME, STREETS, TIERS, classWidth, tierWidth } from './shared.js';
import { OVERVIEW_UNTIL, RAIL_GAP, RAIL_WIDTH, ZOOMS } from './sizes.js';

// Overpass, the interface's own face, drawn from glyphs the site makes itself
// (scripts/glyphs.mjs).
export const FONT = {
  regular: ['Overpass Regular'],
  medium: ['Overpass Medium'],
  semibold: ['Overpass SemiBold'],
  bold: ['Overpass Bold'],
  heavy: ['Overpass ExtraBold'],
  italic: ['Overpass Italic'],
};

export const BASEMAP_SOURCES = {
  openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
};

export const GLYPHS = `${new URL('vendor/glyphs/', document.baseURI).href}{fontstack}/{range}.pbf`;

const omt = (id, layer, rest) => ({ id, source: 'openmaptiles', 'source-layer': layer, ...rest });
const zoom = (...stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
const linear = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
const cls = (...names) => ['in', ['get', 'class'], ['literal', names]];
const name = ['coalesce', ['get', 'name:en'], ['get', 'name']];
// One value for features of `klass`, another for the rest. Zoom has to be the
// outermost expression, so per-class widths go inside each zoom stop.
const byClass = (klass, value, otherwise) => ['match', ['get', 'class'], klass, value, otherwise];

// Road classes from biggest to smallest, with their widths (px) at zoom 10,
// 13, 16 and 19, and the zoom each first appears.
const ROADS = [
  { id: 'minor', classes: ['minor', 'service'], from: 13, width: [0, 0.6, 5, 18] },
  { id: 'street', classes: ['tertiary', 'secondary'], from: 11, width: [0.4, 1.4, 7, 22] },
  { id: 'arterial', classes: ['primary', 'trunk'], from: 9, width: [0.7, 2, 9, 26] },
  { id: 'motorway', classes: ['motorway'], from: 7, width: [1, 2.6, 10, 28] },
];
const roadWidth = (w, extra = 0) => zoom(10, w[0] + extra, 13, w[1] + extra, 16, w[2] + extra, 19, w[3] + extra);

// Fills and roads: everything beneath the transit lines.
export function basemapBelow() {
  const layers = [
    { id: 'land', type: 'background', paint: { 'background-color': P.land } },
    omt('wood', 'landcover', {
      type: 'fill',
      filter: cls('wood', 'forest'),
      paint: { 'fill-color': P.wood, 'fill-opacity': linear(6, 0.8, 13, 0.5) },
    }),
    omt('park', 'park', { type: 'fill', paint: { 'fill-color': P.park } }),
    omt('grass', 'landcover', {
      type: 'fill',
      minzoom: 11,
      filter: cls('grass'),
      paint: { 'fill-color': P.park, 'fill-opacity': 0.6 },
    }),
    omt('water', 'water', { type: 'fill', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': P.water } }),
    omt('waterway', 'waterway', {
      type: 'line',
      minzoom: 9,
      filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel'], cls('river', 'canal', 'stream')],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': P.water,
        'line-width': zoom(9, byClass('river', 0.8, 0), 11, byClass('river', 1.4, 0.3), 14, byClass('river', 3, 1), 18, byClass('river', 10, 4)),
      },
    }),
    omt('runway', 'aeroway', {
      type: 'line',
      minzoom: 10,
      filter: cls('runway', 'taxiway'),
      paint: {
        'line-color': P.runway,
        'line-width': zoom(10, byClass('runway', 1.5, 0), 12, byClass('runway', 5, 0.5), 14, byClass('runway', 14, 3), 17, byClass('runway', 50, 14)),
      },
    }),
    omt('building', 'building', {
      type: 'fill',
      minzoom: 14,
      paint: { 'fill-color': P.building, 'fill-outline-color': P.buildingEdge, 'fill-opacity': linear(14, 0, 15, 1) },
    }),
  ];

  // Casings first, then fills, so every crossing reads as one road network.
  const roads = (road) => ['all', ['!=', ['get', 'brunnel'], 'tunnel'], cls(...road.classes)];
  for (const road of ROADS) {
    layers.push(
      omt(`road-${road.id}-edge`, 'transportation', {
        type: 'line',
        minzoom: Math.max(road.from, 11),
        filter: roads(road),
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': road.id === 'motorway' ? P.motorwayEdge : P.roadEdge,
          'line-width': roadWidth(road.width, 1.5),
          'line-opacity': linear(Math.max(road.from, 11), 0, Math.max(road.from, 11) + 1, 1),
        },
      }),
    );
  }
  for (const road of ROADS) {
    layers.push(
      omt(`road-${road.id}`, 'transportation', {
        type: 'line',
        minzoom: road.from,
        filter: roads(road),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // Below zoom 11 there's no casing, so roads draw as quiet gray lines.
          'line-color': linear(10, road.id === 'motorway' ? P.motorwayFar : P.roadFar, 11.5, P.road),
          'line-width': roadWidth(road.width),
        },
      }),
    );
  }
  return layers;
}

// Street names sit just beside their street, not on it: a bus line runs down
// the middle of the street, and a name drawn on the line and the line fight
// (the route numbers are knocked out of their lines; a name can't be).
// Ems, enough to clear the street's half width, a bus line and its keep-out
// margin, and half the text's height: 1.3 em leaves about 3 px of street
// between a name and the line. From the first zoom streets are named: a name
// on its street would be on the bus line, and so not drawn at all.
const STREET_NAME_OFFSET = ['interpolate', ['linear'], ['zoom'], 14, ['literal', [0, -1.3]], 17, ['literal', [0, -1.45]]];

// Keep-out layers: symbols that take up room and draw nothing (the 'clear'
// image, scaled by icon-size into a box), so other labels step aside. A symbol
// is placed after every layer above it and loses to what is already placed, so
// a keep-out layer sits above the labels it is meant to hold back.
const clear =(id, source, rest) => ({
  id,
  type: 'symbol',
  source,
  layout: { 'icon-image': 'clear', 'icon-allow-overlap': true, 'icon-ignore-placement': false, 'icon-padding': 0, ...rest.layout },
  ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'layout')),
});
// Rail's footprint in px at the ZOOMS stops: RAIL_WIDTH and RAIL_GAP
// (sizes.js, a line's width, and the gap between lines sharing track).
const byZoom = (values) => ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [z, values[i]])];
const slot = ['abs', ['coalesce', ['get', 'slot'], 0]];
const KEEP_OUT = 2; // px of clear space on each side, besides the shield's own icon-padding

// No name covers a line: not a station's, a city's, a street's, or a highway
// number. The lines are what the map is of, and a name can sit a little to
// one side where a line can't. Every rail and bus line that is drawn takes up
// its own room, and every name is placed after it. Only what names a line is
// placed before: its letter or number, which sits on it (network.js puts these
// layers just under those and above the station names).
//
// Rail and the strongest bus tier are kept clear at every zoom. The other bus
// lines are kept clear from THIN_CLEAR_FROM: further out they are closer
// together than a word is long (a mile is 30 px at zoom 10), so a name that
// had to clear them all would have nowhere to go, and they are drawn light
// there for the same reason they carry no numbers yet.
//
// The two kinds differ in one more way: a station's name is placed after
// rail and the strongest tier but before the other bus lines, so it never
// sits on the first two and can cross one of the others. Downtown the lighter
// lines are a block apart, and a station with no name is worse than a name
// across one of them. Every other name is placed after them all.
const THIN_CLEAR_FROM = 11.5;
// Where the lighter streets, then the part-time routes, start to be drawn.
const LIGHT_FROM = [Math.min(...STREETS.filter((c) => c.from > 0).map((c) => c.from)), Math.min(...TIERS.filter((t) => PART_TIME.includes(t.id)).map((t) => t.from))];
const alongLine = { 'symbol-placement': 'line', 'symbol-spacing': 4, 'icon-rotation-alignment': 'viewport' };
// The streets, by class: the heaviest (every 15 or better) in the first
// layer, which every name stays off; the lighter ones from THIN_CLEAR_FROM;
// and last the part-time routes, drawn by route.
const HEAVY = STREETS.filter((c) => c.from === 0).map((c) => c.id);
const busKeepOut = () => [
  clear('keep-out-bus-0', 'streets', {
    filter: ['in', ['get', 'cls'], ['literal', HEAVY]],
    layout: { ...alongLine, 'icon-size': classWidth(1) },
  }),
  clear('keep-out-bus-1', 'streets', {
    minzoom: THIN_CLEAR_FROM,
    filter: ['!', ['in', ['get', 'cls'], ['literal', HEAVY]]],
    layout: { ...alongLine, 'icon-size': classWidth(1) },
  }),
  clear('keep-out-bus-2', 'routes', {
    minzoom: THIN_CLEAR_FROM,
    filter: ['all', ['==', ['get', 'mode'], 'bus'], ['in', ['get', 'tier'], ['literal', PART_TIME]]],
    layout: { ...alongLine, 'icon-size': tierWidth(1) },
  }),
];
// Rail and the strongest bus tier: what station names stay off (network.js).
export const lineKeepOut = () => [
  busKeepOut()[0],
  clear('keep-out-rail', 'routes', {
    filter: ['==', ['get', 'mode'], 'rail'],
    layout: {
      ...alongLine,
      // Box side: the line, its casing, and the lines beside it, plus the margin.
      'icon-size': byZoom(RAIL_WIDTH.map((w) => ['+', w + 3 + 2 * KEEP_OUT, ['*', 2 * (w + RAIL_GAP), slot]])),
    },
  }),
];

// Highway numbers stay off every bus line that is drawn, at every zoom: a
// shield on a bus line reads as that line's number, and a bus line with a
// shield on it reads as the highway (DESIGN.md, "Basemap"). From
// THIN_CLEAR_FROM the lighter lines' own room (markKeepOut) does that; below
// it these copies do, placed after every name but the shields and street
// names, so they hold back only those.
const shieldKeepOut = () =>
  busKeepOut()
    .slice(1)
    .map((l, i) => ({ ...l, id: `keep-out-bus-shields-${i + 1}`, minzoom: LIGHT_FROM[i], maxzoom: THIN_CLEAR_FROM }));

// Stations and stops hold back the basemap's names too, and so do the lighter
// bus lines. Not the stations' own names: those sit beside their mark.
const markKeepOut = () => [
  ...busKeepOut().slice(1),
  clear('keep-out-stops', 'stops', {
    minzoom: 15,
    layout: { 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 9, 18, 14] },
  }),
  clear('keep-out-stations', 'stations', {
    minzoom: OVERVIEW_UNTIL,
    layout: {
      // A capsule as long as the lines it spans, and as wide as a line.
      'icon-size': byZoom(RAIL_WIDTH.map((w) => ['+', w + 4 + 2 * KEEP_OUT, ['*', w + RAIL_GAP, ['-', ['coalesce', ['get', 'span'], 1], 1]]])),
    },
  }),
];

// Where a name can go when its own point is taken: on the point, then a
// step at a time up, down and to each side (ems), nearest first. Steps small
// enough to find a gap between two lines, and never further than ASIDE_REACH,
// so a name doesn't end up beside the place next door. A name with nowhere
// clear inside that isn't drawn: a line is worth more than a place's name.
const ASIDE_REACH = 3.4;
const steps = (step, n) => Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * step);
const ASIDE = steps(0.6, 4)
  .flatMap((y) => steps(0.75, 4).map((x) => [x, y]))
  .filter((at) => Math.hypot(...at) <= ASIDE_REACH)
  .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
  .flatMap((at) => ['center', at]);

// Place names fade out over the zoom before they go (cities 12.5 to 13.5,
// towns and villages 13.5 to 14.5), so they thin out rather than pop off.
const CITY_FADE = linear(12.5, 1, 13.5, 0);
const TOWN_FADE = linear(13.5, 1, 14.5, 0);

// Place, street and water names: above the transit lines, below our stations.
export function basemapLabels() {
  const halo = { 'text-halo-color': P.land, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  const labels = [
    omt('water-label', 'water_name', {
      type: 'symbol',
      minzoom: 11,
      // Not intermittent ones: seasonal puddles and gravel pits carry whatever
      // name a mapper gave them, and a rider doesn't orient by them.
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'intermittent'], 1]],
      layout: { 'text-field': name, 'text-font': FONT.italic, 'text-size': 11.5, 'text-max-width': 7, 'text-variable-anchor-offset': ASIDE },
      paint: { 'text-color': P.waterLabel, ...halo, 'text-halo-color': P.water },
    }),
    // Street names, early and clear enough on the main streets to find an
    // intersection by.
    omt('road-label-minor', 'transportation_name', {
      type: 'symbol',
      minzoom: 14.5,
      filter: cls('tertiary', 'minor'),
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': FONT.medium,
        'text-size': linear(14.5, 10.5, 17, 12.5),
        'symbol-spacing': 350,
        'text-offset': STREET_NAME_OFFSET,
      },
      paint: { 'text-color': P.roadLabel, 'text-halo-color': P.road, 'text-halo-width': 2.4 },
    }),
    omt('road-label', 'transportation_name', {
      type: 'symbol',
      minzoom: 12,
      filter: cls('primary', 'trunk', 'secondary'),
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': FONT.semibold,
        'text-size': linear(12, 10.5, 14, 11.5, 17, 13.5),
        'text-letter-spacing': 0.02,
        // More places to try while bus lines cross a street every few
        // hundred px: a name is only drawn on a stretch no line crosses.
        'symbol-spacing': linear(12, 120, 15, 300),
        'text-offset': STREET_NAME_OFFSET,
        'symbol-sort-key': ['match', ['get', 'class'], ['primary', 'trunk'], 0, 1],
      },
      // Wide enough to meet across a word space, so a bus line on the street
      // doesn't show between the words.
      paint: { 'text-color': P.street, 'text-halo-color': P.road, 'text-halo-width': 2.6 },
    }),
    // Interstate and US highway numbers in quiet gray shields: how people say
    // where they are ("east of I-25"). The US shield has its own outline (a
    // notched shield, not a box), and only shows while streets are unnamed
    // and bus routes unlabeled; from 13.5 the street name says "East Colfax",
    // and a "40" beside the bus 15 and 16 is one more number to misread.
    // Interstates keep their shape and stay longer: the shape can't be taken
    // for a bus tag, and "I-25" still helps at street scale. State highway
    // refs ('us-state' and the rest) were never drawn. Until DETAIL_FROM only
    // the main Interstates (one or two digits) are numbered: they're the ones
    // people steer by, and a spur's or a US route's number that far out is
    // one more number beside the bus numbers.
    ...[
      { id: 'highway-shield', network: 'us-interstate', minzoom: 8.5, maxzoom: 15, main: ['any', ['<=', ['get', 'ref_length'], 2], ['>=', ['zoom'], DETAIL_FROM]] },
      { id: 'highway-shield-us', network: 'us-highway', minzoom: DETAIL_FROM, maxzoom: 13.5, main: true },
    ].map(({ id, network, minzoom, maxzoom, main }) =>
      omt(id, 'transportation_name', {
        type: 'symbol',
        minzoom,
        maxzoom,
        filter: ['all', ['has', 'ref'], ['<=', ['get', 'ref_length'], 3], ['==', ['get', 'network'], network], main],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': ['step', ['zoom'], 260, 12, 420],
          'icon-image': ['concat', 'shield-', ['get', 'network'], '-', ['get', 'ref_length']],
          'icon-rotation-alignment': 'viewport',
          'text-rotation-alignment': 'viewport',
          'text-field': ['get', 'ref'],
          'text-font': FONT.bold,
          'text-size': 9.5,
          'text-offset': [0, 0.15],
          'icon-padding': 6,
        },
        // Fade out over the last half zoom instead of vanishing.
        paint: {
          'text-color': P.shield,
          'icon-opacity': linear(maxzoom - 0.5, 1, maxzoom, 0),
          'text-opacity': linear(maxzoom - 0.5, 1, maxzoom, 0),
        },
      }),
    ),
    // Landmarks people give directions by, once you're close enough to use them.
    omt('landmark-label', 'poi', {
      type: 'symbol',
      minzoom: 14,
      filter: [
        'any',
        ['in', ['get', 'subclass'], ['literal', ['hospital', 'university', 'college', 'stadium', 'museum', 'zoo', 'theme_park', 'arts_centre', 'theatre', 'library', 'townhall']]],
        ['all', ['==', ['get', 'class'], 'park'], ['<=', ['get', 'rank'], 20]],
      ],
      layout: {
        'text-field': name,
        'text-font': ['match', ['get', 'class'], 'park', ['literal', FONT.italic], ['literal', FONT.medium]],
        'text-size': linear(14, 10.5, 17, 12.5),
        'text-max-width': 7,
        'text-padding': 6,
        'text-variable-anchor-offset': ASIDE,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': ['match', ['get', 'class'], 'park', P.parkLabel, P.landmark], ...halo },
    }),
    omt('airport-label', 'aerodrome_label', {
      type: 'symbol',
      minzoom: 10,
      filter: ['has', 'iata'],
      layout: { 'text-field': name, 'text-font': FONT.semibold, 'text-size': 12, 'text-max-width': 8, 'text-variable-anchor-offset': ASIDE },
      paint: { 'text-color': P.town, ...halo },
    }),
    omt('neighborhood-label', 'place', {
      type: 'symbol',
      minzoom: 12,
      filter: cls('suburb', 'quarter', 'neighbourhood'),
      layout: {
        'text-field': name,
        'text-font': FONT.medium,
        'text-size': linear(12, 11.5, 16, 14),
        'text-letter-spacing': 0.06,
        'text-max-width': 7,
        'text-variable-anchor-offset': ASIDE,
      },
      paint: { 'text-color': P.neighborhood, ...halo },
    }),
    // Towns and villages, from DETAIL_FROM: further out the cities say where
    // things are, and a town's name in the gaps of the network read as one
    // more station. They're set like the cities (small spaced capitals, the
    // way a map names an area), smaller, so a place is never taken for a
    // station, whose name is bold and in sentence case.
    omt('village-label', 'place', {
      type: 'symbol',
      minzoom: DETAIL_FROM + 0.5,
      maxzoom: 14.5,
      filter: cls('village', 'hamlet'),
      layout: {
        'text-field': name,
        'text-transform': 'uppercase',
        'text-font': FONT.medium,
        'text-size': linear(11.5, 9.5, 14, 11),
        'text-letter-spacing': 0.1,
        'text-max-width': 8,
        'text-variable-anchor-offset': ASIDE,
        'symbol-sort-key': 30,
      },
      paint: { 'text-color': P.town, ...halo, 'text-opacity': TOWN_FADE },
    }),
    omt('town-label', 'place', {
      type: 'symbol',
      minzoom: DETAIL_FROM,
      // Towns give way a zoom after the cities, once street names have taken
      // over (Golden's name sat on its bus lines at 14).
      maxzoom: 14.5,
      filter: cls('town'),
      layout: {
        'text-field': name,
        'text-transform': 'uppercase',
        'text-font': FONT.semibold,
        'text-size': linear(11, 10, 13, 11.5, 15, 12.5),
        'text-letter-spacing': 0.1,
        'text-max-width': 8,
        'text-padding': 1,
        'text-variable-anchor-offset': ASIDE,
        'symbol-sort-key': ['+', 10, ['coalesce', ['get', 'rank'], 10]],
      },
      paint: { 'text-color': P.town, ...halo, 'text-opacity': TOWN_FADE },
    }),
    // City names. A city's point is its middle, which is where its lines
    // meet, so the name is set beside its point, in the nearest gap between
    // lines, rather than on them.
    omt('city-label', 'place', {
      type: 'symbol',
      // Gone by 13.5, where neighborhoods and street names take over: a city
      // name is one word spread over a whole city, and at street scale it
      // lands on the busiest corner (Denver on Colfax and Broadway).
      maxzoom: 13.5,
      filter: cls('city'),
      layout: {
        // Background, not a headline: small spaced capitals in the towns'
        // gray say "this is the name of an area" and stay out of the way of
        // the network, which is what the map is of.
        'text-field': name,
        'text-transform': 'uppercase',
        'text-font': FONT.semibold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'rank'], [1, 2, 3], 11, 10], 12, ['match', ['get', 'rank'], [1, 2, 3], 13, 12]],
        'text-letter-spacing': 0.1,
        'text-max-width': 8,
        // No padding: the gap between two frequent bus lines is often only
        // just wider than the name.
        'text-padding': 0,
        'text-variable-anchor-offset': ASIDE,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 5],
      },
      paint: { 'text-color': P.town, ...halo, 'text-halo-width': 1.8, 'text-opacity': CITY_FADE },
    }),
  ];
  // Stacking is placement priority (the top goes first), and every one of
  // these is placed after the lines, the stations and their names (network.js).
  // From the top: stations and stops, which hold all of these back; city
  // names; the other place names; the lighter bus lines' room below
  // THIN_CLEAR_FROM; highway numbers; street names.
  const streets = ['water-label', 'road-label-minor', 'road-label'];
  const shields = ['highway-shield', 'highway-shield-us'];
  const pick = (ids) => ids.map((id) => labels.find((l) => l.id === id));
  const places = labels.filter((l) => ![...streets, ...shields].includes(l.id));
  return [...pick(streets), ...pick(shields), ...shieldKeepOut(), ...places, ...markKeepOut()];
}

// Relief: the mountains are west, the region's best sense of direction, and
// the Front Range is what makes this place look like itself. A quiet tint by
// elevation lifts the foothills and mountains off the plains, and shading lit
// from the northwest gives them form. Added after the network has loaded, so
// its tiles never hold up the transit data.
const DEM = {
  type: 'raster-dem',
  encoding: 'terrarium',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256,
  maxzoom: 12,
  attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain: Mapzen, USGS and others</a>',
};

export const TERRAIN = {
  source: DEM,
  get layers() {
    return terrainLayers();
  },
  // Relief goes over the land and parks, under water and roads.
  before: 'water',
};

function terrainLayers() {
  return [
    {
      id: 'elevation',
      type: 'color-relief',
      source: 'terrain',
      maxzoom: 14,
      paint: {
        // Meters. The plains stay the land color; the tint starts at the
        // foothills (about 1,800 m) and deepens toward the Divide.
        'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...P.relief.flat()],
        'color-relief-opacity': linear(7, 1, 12, 0.7, 14, 0),
      },
    },
    {
      id: 'relief',
      type: 'hillshade',
      source: 'terrain',
      maxzoom: 15,
      paint: {
        'hillshade-method': 'multidirectional',
        'hillshade-illumination-direction': [270, 315, 0, 330],
        'hillshade-illumination-altitude': [30, 30, 30, 30],
        'hillshade-highlight-color': P.hillshade.highlight,
        'hillshade-shadow-color': P.hillshade.shadow,
        'hillshade-exaggeration': linear(7, 0.55, 11, 0.45, 14, 0.15),
      },
    },
  ];
}
