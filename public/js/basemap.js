// Our own basemap on OpenFreeMap's vector tiles (OpenMapTiles schema). Its
// colors stay quiet so the network leads, but its words carry the sense of
// place (DESIGN.md, "Basemap"): street names you can find an intersection by,
// highway numbers, neighborhoods and landmarks. No railways, no POI icons.

export const PALETTE = {
  land: '#f4f5f6',
  wash: '#e3e7ea',
  water: '#bcd5e4',
  waterLabel: '#4f7f9c',
  park: '#e0eadb',
  wood: '#e6ece2',
  building: '#e7eaed',
  buildingEdge: '#dde2e6',
  road: '#ffffff',
  roadEdge: '#dfe4e8',
  motorwayEdge: '#cbd2d8',
  runway: '#e3e7eb',
  city: '#2c3844',
  town: '#4c5a69',
  neighborhood: '#6f7c89',
  street: '#4f5b67',
  roadLabel: '#75818d',
  landmark: '#66727e',
  parkLabel: '#56744f',
  shield: '#8a96a2',
};

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

const P = PALETTE;
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
          'line-color': linear(10, road.id === 'motorway' ? P.motorwayEdge : P.roadEdge, 11.5, P.road),
          'line-width': roadWidth(road.width),
        },
      }),
    );
  }
  return layers;
}

// Place, street and water names: above the transit lines, below our stations.
export function basemapLabels() {
  const halo = { 'text-halo-color': P.land, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  return [
    omt('water-label', 'water_name', {
      type: 'symbol',
      minzoom: 11,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': name, 'text-font': FONT.italic, 'text-size': 11.5, 'text-max-width': 7 },
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
        'symbol-spacing': 300,
        'symbol-sort-key': ['match', ['get', 'class'], ['primary', 'trunk'], 0, 1],
      },
      // Wide enough to meet across a word space, so a bus line on the street
      // doesn't show between the words.
      paint: { 'text-color': P.street, 'text-halo-color': P.road, 'text-halo-width': 2.6 },
    }),
    // Interstate and US highway numbers in quiet gray shields: how people say
    // where they are ("east of I-25").
    omt('highway-shield', 'transportation_name', {
      type: 'symbol',
      minzoom: 8.5,
      filter: ['all', ['has', 'ref'], ['<=', ['get', 'ref_length'], 3], ['in', ['get', 'network'], ['literal', ['us-interstate', 'us-highway']]]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': ['step', ['zoom'], 260, 12, 420],
        'icon-image': ['concat', 'shield-', ['get', 'network'], '-', ['get', 'ref_length']],
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'ref'],
        'text-font': FONT.bold,
        'text-size': 9.5,
        'text-offset': ['match', ['get', 'network'], 'us-interstate', ['literal', [0, 0.15]], ['literal', [0, 0]]],
        'icon-padding': 6,
      },
      paint: { 'text-color': P.shield },
    }),
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
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': ['match', ['get', 'class'], 'park', P.parkLabel, P.landmark], ...halo },
    }),
    omt('airport-label', 'aerodrome_label', {
      type: 'symbol',
      minzoom: 10,
      filter: ['has', 'iata'],
      layout: { 'text-field': name, 'text-font': FONT.semibold, 'text-size': 12, 'text-max-width': 8 },
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
      },
      paint: { 'text-color': P.neighborhood, ...halo },
    }),
    // Places: every town in the district from the opening view, smaller
    // and lighter than the cities so more of them fit, bigger places first.
    omt('village-label', 'place', {
      type: 'symbol',
      minzoom: 10.5,
      filter: cls('village', 'hamlet'),
      layout: {
        'text-field': name,
        'text-font': FONT.medium,
        'text-size': linear(10.5, 11, 14, 13),
        'text-max-width': 7,
        'symbol-sort-key': 30,
      },
      paint: { 'text-color': P.town, ...halo },
    }),
    omt('town-label', 'place', {
      type: 'symbol',
      minzoom: 8,
      filter: cls('town'),
      layout: {
        'text-field': name,
        'text-font': FONT.semibold,
        'text-size': linear(8, 10.5, 10, 11.5, 12, 13.5, 15, 15),
        'text-max-width': 7,
        'text-padding': 1,
        'symbol-sort-key': ['+', 10, ['coalesce', ['get', 'rank'], 10]],
      },
      paint: { 'text-color': P.town, ...halo },
    }),
    omt('city-label', 'place', {
      type: 'symbol',
      maxzoom: 15,
      filter: cls('city'),
      layout: {
        'text-field': name,
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'rank'], [1, 2, 3], 14, 11.5], 12, ['match', ['get', 'rank'], [1, 2, 3], 19, 15]],
        'text-letter-spacing': 0.01,
        'text-max-width': 8,
        'text-padding': 1,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 5],
      },
      paint: { 'text-color': P.city, ...halo, 'text-halo-width': 1.8 },
    }),
  ];
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
  layers: [
    {
      id: 'elevation',
      type: 'color-relief',
      source: 'terrain',
      maxzoom: 14,
      paint: {
        // Meters. The plains stay the land color; the tint starts at the
        // foothills (about 1,800 m) and deepens toward the Divide.
        'color-relief-color': [
          'interpolate',
          ['linear'],
          ['elevation'],
          1700, 'rgba(232, 236, 230, 0)',
          1900, 'rgba(226, 232, 223, 0.55)',
          2500, 'rgba(214, 222, 211, 0.8)',
          3300, 'rgba(206, 213, 207, 0.85)',
          4000, 'rgba(226, 230, 233, 0.9)',
        ],
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
        'hillshade-highlight-color': ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.2)'],
        'hillshade-shadow-color': ['rgba(70, 88, 104, 0.32)', 'rgba(70, 88, 104, 0.28)', 'rgba(70, 88, 104, 0.18)', 'rgba(70, 88, 104, 0.18)'],
        'hillshade-exaggeration': linear(7, 0.55, 11, 0.45, 14, 0.15),
      },
    },
  ],
  // Relief goes over the land and parks, under water and roads.
  before: 'water',
};
