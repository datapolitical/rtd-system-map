import { getJson } from './http.mjs';

const itemUrl = (portal, id) => `${portal.replace(/\/$/, '')}/sharing/rest/content/items/${id}`;

async function getItem(portal, id) {
  const [info, data] = await Promise.all([
    getJson(`${itemUrl(portal, id)}?f=json`),
    getJson(`${itemUrl(portal, id)}/data?f=json`),
  ]);
  return { info, data };
}

/**
 * Follow an Experience Builder item to its web map, and the web map to the
 * feature layers it shows. Returns one entry per layer, carrying the filter
 * RTD's map applies to it and the layer's own schema and edit date.
 */
export async function discoverLayers(portal, experienceId) {
  const experience = await getItem(portal, experienceId);
  const maps = Object.values(experience.data.dataSources ?? {}).filter((d) => d.type === 'WEB_MAP');
  if (maps.length !== 1) {
    throw new Error(`Expected RTD's Experience to use one web map, found ${maps.length}`);
  }
  const webmap = await getItem(maps[0].portalUrl ?? portal, maps[0].itemId);

  // The same layer can appear several times with different filters (RTD shows
  // its route layer once per service type). Collect every use of each layer.
  const uses = new Map();
  (function walk(layers) {
    for (const layer of layers ?? []) {
      walk(layer.layers);
      if (layer.layerType !== 'ArcGISFeatureLayer' || !layer.url) continue;
      const url = layer.url.replace(/\/$/, '');
      const use = uses.get(url) ?? { titles: [], filters: [] };
      use.titles.push(layer.title);
      use.filters.push(layer.layerDefinition?.definitionExpression || null);
      uses.set(url, use);
    }
  })(webmap.data.operationalLayers);

  const layers = await Promise.all(
    [...uses].map(async ([url, use]) => {
      const meta = await getJson(`${url}?f=json`);
      return {
        url,
        titles: use.titles,
        // Draw whatever RTD's map draws: everything if any use is unfiltered,
        // otherwise anything that passes one of its filters.
        where: use.filters.includes(null) ? '1=1' : use.filters.map((f) => `(${f})`).join(' OR '),
        name: meta.name,
        geometryType: meta.geometryType,
        fields: meta.fields.map((f) => f.name),
        objectIdField: meta.objectIdField ?? 'OBJECTID',
        maxRecordCount: meta.maxRecordCount ?? 1000,
        lastEditDate: meta.editingInfo?.lastEditDate ?? null,
      };
    }),
  );

  return {
    experience: { id: experienceId, title: experience.info.title, modified: experience.info.modified },
    webmap: { id: maps[0].itemId, title: webmap.info.title, modified: webmap.info.modified },
    layers,
  };
}

/** Download every feature RTD's map shows from a layer, as WGS84 GeoJSON. */
export async function downloadLayer(layer, { simplify = 0, precision = 6 } = {}) {
  const query = (params) =>
    getJson(`${layer.url}/query?${new URLSearchParams({ where: layer.where, f: 'json', ...params })}`);
  const { count } = await query({ returnCountOnly: 'true' });
  const pageSize = layer.maxRecordCount;
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / pageSize) }, (_, page) =>
      query({
        f: 'geojson',
        outFields: '*',
        outSR: '4326',
        geometryPrecision: String(precision),
        orderByFields: layer.objectIdField,
        resultOffset: String(page * pageSize),
        resultRecordCount: String(pageSize),
        ...(simplify ? { maxAllowableOffset: String(simplify) } : {}),
      }),
    ),
  );
  const features = pages.flatMap((p) => p.features);
  if (features.length !== count) {
    throw new Error(`${layer.name}: expected ${count} features, downloaded ${features.length}`);
  }
  return features.filter((f) => f.geometry).map((f) => ({ ...f, geometry: nestRings(f.geometry) }));
}

/**
 * ArcGIS's GeoJSON output can list a polygon's holes as separate polygons
 * (RTD's boundary mask comes back that way), which fills the holes in.
 * Rebuild the nesting from the geometry: a ring inside an odd number of other
 * rings is a hole in the smallest of them.
 */
function nestRings(geometry) {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return geometry;
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  const bySize = rings.map((ring) => ({ ring, size: Math.abs(ringArea(ring)) })).sort((a, b) => b.size - a.size);
  const polygons = [];
  const placed = []; // largest first, so the last container found is the smallest
  for (const { ring } of bySize) {
    const parent = placed.findLast((p) => insideRing(ring[0], p.ring));
    const depth = parent ? parent.depth + 1 : 0;
    const polygon = depth % 2 ? parent.polygon : [];
    if (!(depth % 2)) polygons.push(polygon);
    polygon.push(ring);
    placed.push({ ring, depth, polygon });
  }
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum / 2;
}

function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
