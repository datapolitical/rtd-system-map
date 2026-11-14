// The sheets page's address is its share link (issue #14, DESIGN.md "Four sheets").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readView, writeView, drawsRoute } from '../public/js/sheets/address.js';

test('a view written to the address reads back the same, its centre to within half a pixel', () => {
  for (const zoom of [10, 12, 14, 16]) {
    const view = { zoom, center: [-104.987654321, 39.743219876], pick: { mode: 'bus', route: '15L' } };
    const back = readView(writeView(view));
    assert.equal(back.zoom, zoom);
    assert.deepEqual(back.pick, view.pick);
    // A degree of longitude is 512 * 2^zoom / 360 pixels wide.
    const px = (512 * 2 ** zoom) / 360;
    assert.ok(Math.abs(back.center[0] - view.center[0]) * px < 0.5, `lon at ${zoom}`);
    assert.ok(Math.abs(back.center[1] - view.center[1]) * px < 0.5, `lat at ${zoom}`);
  }
  assert.equal(writeView({ zoom: 14, center: [-104.98765, 39.74321] }), '#14/39.74321/-104.98765');
  assert.equal(writeView({ zoom: 14, center: [-105, 39.7], pick: { mode: 'rail', route: 'A' } }), '#14/39.70000/-105.00000/rail/A');
  assert.deepEqual(readView('#12/39.7/-105/rail/W').pick, { mode: 'rail', route: 'W' });
});

test("the address MapLibre wrote before still opens its view, and a bad one opens the page's own", () => {
  assert.deepEqual(readView('#10/39.7192/-105.0018'), { zoom: 10, center: [-105.0018, 39.7192], pick: null });
  assert.deepEqual(readView('#14.3'), { zoom: 14.3, center: null, pick: null }, 'the zoom alone, as the page read it');
  for (const bad of ['', '#', '#abc', '#1e3/1/1', '#99/39.7/-105', '#-3/39.7/-105', '#route=15', '#14x/39/-105']) {
    assert.equal(readView(bad), null, bad);
  }
  assert.equal(readView('#12/91/-105').center, null, 'a latitude off the world');
  assert.equal(readView('#12/39.7/east').center, null);
  assert.equal(readView('#12/39.7/-105/bus/%E0%A4%A').pick, null, 'a broken escape');
  assert.equal(readView('#12/39.7/-105/tram/15').pick, null, 'not a mode the sheets draw');
  assert.equal(readView('#12/39.7/-105/bus/<b>').pick, null, 'not a route name');
  assert.equal(readView('#12/39.7/-105/bus/').pick, null);
  assert.equal(readView('#12/39.7/-105/bus/15/0/0').pick?.route, '15', 'MapLibre bearing and pitch after it are ignored');
});

test("a route the sheet's data draws is found in its text, and one it doesn't isn't", () => {
  const text = '{"features":[{"properties":{"kind":"rail","route":"W"}},{"properties":{"kind":"bus","routes":"0, 115, 15L"}}]}';
  assert.ok(drawsRoute(text, { mode: 'rail', route: 'W' }));
  assert.ok(!drawsRoute(text, { mode: 'rail', route: 'A' }));
  assert.ok(drawsRoute(text, { mode: 'bus', route: '0' }));
  assert.ok(drawsRoute(text, { mode: 'bus', route: '115' }));
  assert.ok(drawsRoute(text, { mode: 'bus', route: '15L' }));
  assert.ok(!drawsRoute(text, { mode: 'bus', route: '15' }), 'not part of 115 or 15L');
  assert.ok(!drawsRoute(text, { mode: 'bus', route: '1' }));
});
