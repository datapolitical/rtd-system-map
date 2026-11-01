// Task 2: edge cases in scripts/lib/arcgis.mjs and scripts/lib/http.mjs.
//
// These put a fake `fetch` in front of the modules, so nothing leaves the
// machine. Expectations come from the functions' doc comments.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadLayer } from '../../scripts/lib/arcgis.mjs';
import { fetchWithRetry, getJson } from '../../scripts/lib/http.mjs';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]),
});

function withFakeFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    return handler(parsed, calls.length);
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

const layer = {
  url: 'https://example.test/FeatureServer/4',
  where: '1=1',
  name: 'Test',
  objectIdField: 'OBJECTID',
  maxRecordCount: 2,
};

const features = Array.from({ length: 5 }, (_, i) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [i, i] },
  properties: { OBJECTID: i },
}));

test('downloadLayer asks for every page and reports a short read', async () => {
  // Doc comment: "Download every feature RTD's map shows from a layer, as WGS84
  // GeoJSON." The count it checked first must match what arrived.
  let fake = withFakeFetch((url) => {
    if (url.searchParams.get('returnCountOnly') === 'true') return response({ count: 5 });
    const offset = Number(url.searchParams.get('resultOffset'));
    const limit = Number(url.searchParams.get('resultRecordCount'));
    return response({ features: features.slice(offset, offset + limit) });
  });
  try {
    const out = await downloadLayer(layer);
    assert.equal(out.length, 5);
    const pages = fake.calls.slice(1).map((c) => c.url.searchParams.get('resultOffset'));
    assert.deepEqual(pages, ['0', '2', '4'], 'one request per page of maxRecordCount');
    const first = fake.calls[1].url.searchParams;
    assert.equal(first.get('outSR'), '4326', 'always WGS84');
    assert.equal(first.get('where'), '1=1', "RTD's own filter is carried over");
    assert.equal(fake.calls[1].init.headers['user-agent'], 'rtd-system-map build');
  } finally {
    fake.restore();
  }

  fake = withFakeFetch((url) => {
    if (url.searchParams.get('returnCountOnly') === 'true') return response({ count: 5 });
    const offset = Number(url.searchParams.get('resultOffset'));
    return response({ features: features.slice(offset, offset + 1) });
  });
  try {
    await assert.rejects(downloadLayer(layer), /expected 5 features, downloaded 3/);
  } finally {
    fake.restore();
  }
});

test('downloadLayer nests a polygon hole instead of filling it', async () => {
  // Doc comment: "ArcGIS's GeoJSON output can list a polygon's holes as
  // separate polygons ... a ring inside an odd number of other rings is a hole
  // in the smallest of them."
  const outer = [[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0], [0, 0]];
  const hole = [[0.002, 0.002], [0.002, 0.004], [0.004, 0.004], [0.004, 0.002], [0.002, 0.002]];
  const fake = withFakeFetch((url) => {
    if (url.searchParams.get('returnCountOnly') === 'true') return response({ count: 1 });
    return response({ features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, hole] }, properties: {} }] });
  });
  try {
    const [out] = await downloadLayer(layer);
    assert.equal(out.geometry.type, 'Polygon');
    assert.equal(out.geometry.coordinates.length, 2, 'outer ring plus its hole');
    assert.deepEqual(out.geometry.coordinates[1], hole);
  } finally {
    fake.restore();
  }
});

test('fetchWithRetry does not retry a 404', async () => {
  // "Fetch with a few retries, so one dropped request doesn't fail a build";
  // a 4xx is not a dropped request.
  const fake = withFakeFetch(() => response({}, 404));
  try {
    await assert.rejects(fetchWithRetry('https://example.test/x'), /404/);
    assert.equal(fake.calls.length, 1);
  } finally {
    fake.restore();
  }
});

test('fetchWithRetry retries a 5xx and returns the next good response', async () => {
  const fake = withFakeFetch((url, n) => (n === 1 ? response({}, 503) : response({ ok: true })));
  try {
    const res = await fetchWithRetry('https://example.test/x', { tries: 2 });
    assert.equal(res.status, 200);
    assert.equal(fake.calls.length, 2);
  } finally {
    fake.restore();
  }
});

test('fetchWithRetry gives up after its last try', async () => {
  const fake = withFakeFetch(() => response({}, 503));
  try {
    await assert.rejects(fetchWithRetry('https://example.test/x', { tries: 1 }), /503/);
    assert.equal(fake.calls.length, 1, 'tries is the number of attempts');
  } finally {
    fake.restore();
  }
});

test('getJson raises an ArcGIS error reported inside a 200', async () => {
  // getJson's comment: "ArcGIS reports errors inside a 200 response."
  const fake = withFakeFetch(() => response({ error: { message: 'Invalid where clause' } }));
  try {
    await assert.rejects(getJson('https://example.test/x'), /Invalid where clause/);
  } finally {
    fake.restore();
  }
});
