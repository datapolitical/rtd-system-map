// The model evaluates the style the way MapLibre draws it (qa/drawn/expressions.mjs):
// a paint property that reads both the zoom and a feature's property is worked
// out at the tile's whole zoom and the next one and blended, so a stop between
// two whole zooms does nothing; a filter sees the zoom as a whole number.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterOf, inZoom, property, setState } from '../qa/drawn/expressions.mjs';

setState({});

// A mark that arrives at zoom `from` over a quarter of a zoom, only where its
// feature says `on`: it reads the zoom and a property, so MapLibre blends the
// values at the whole zooms either side of the zoom on screen.
const ghost = (from) => ({
  id: 'mark',
  type: 'symbol',
  paint: {
    'icon-opacity': ['interpolate', ['linear'], ['zoom'], from, 0, from + 0.25, ['case', ['==', ['get', 'on'], 1], 1, 0], from + 1, ['case', ['==', ['get', 'on'], 1], 1, 0]],
  },
});
const opacity = (layer, z, properties = { on: 1 }) => property(layer, 'icon-opacity', 'paint', z, properties, 1);

test('a paint property with the zoom and a feature property is blended between whole zooms', () => {
  const layer = ghost(13);
  // Read at the zoom on screen this would be 1 from 13.25; MapLibre has 0 at
  // 13 and 1 at 14 and draws a straight line between them.
  assert.equal(opacity(layer, 13), 0);
  assert.equal(opacity(layer, 13.25), 0.25);
  assert.equal(opacity(layer, 13.5), 0.5);
  assert.equal(opacity(layer, 13.75), 0.75);
  assert.equal(opacity(layer, 14), 1);
  assert.equal(opacity(layer, 15.5), 1);
});

test('the same ramp with no feature property is read at the zoom on screen', () => {
  const layer = {
    id: 'mark',
    type: 'symbol',
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.25, 1, 14, 1] },
  };
  assert.equal(opacity(layer, 13.125), 0.5);
  assert.equal(opacity(layer, 13.5), 1);
});

test('a stop at a half zoom in a zoom-and-feature expression does nothing', () => {
  const layer = {
    id: 'mark',
    type: 'symbol',
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, ['case', ['==', ['get', 'on'], 1], 1, 0], 13, 0] },
  };
  // 12.5 is a stop, but MapLibre never evaluates it: 0 at 12 and 0 at 13.
  assert.equal(opacity(layer, 12.5), 0);
  assert.equal(opacity(layer, 12.25), 0);
});

test('a step on the zoom holds the value at the whole zoom below', () => {
  const layer = {
    id: 'mark',
    type: 'symbol',
    paint: { 'icon-opacity': ['step', ['zoom'], 0, 12, ['case', ['==', ['get', 'on'], 1], 1, 0.2], 13.5, 0.8] },
  };
  assert.equal(opacity(layer, 12), 1);
  assert.equal(opacity(layer, 12.9), 1);
  // 13.5 is a step between whole zooms: floor(13.7) = 13, so it is not in force.
  assert.equal(opacity(layer, 13.7), 1);
  assert.equal(opacity(layer, 14), 0.8);
});

test('the feature decides the blend: the same layer for a feature that is off', () => {
  const layer = ghost(13);
  assert.equal(opacity(layer, 13.5, { on: 0 }), 0);
});

test('an exponential curve is blended by its own factor, not by a straight line', () => {
  const layer = {
    id: 'line',
    type: 'line',
    paint: { 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, ['case', ['==', ['get', 'on'], 1], 0, 0], 12, 4] },
  };
  // value(10) = 0, value(11) = 4 * (2^1 - 1) / (2^2 - 1) = 4/3; at 10.5 the
  // blend uses the curve's factor over [10, 11]: (2^0.5 - 1) / (2^1 - 1).
  const f = Math.SQRT2 - 1;
  const width = property(layer, 'line-width', 'paint', 10.5, { on: 1 }, 1);
  assert.ok(Math.abs(width - (4 / 3) * f) < 1e-9, String(width));
});

test('a layout property is read at the zoom on screen', () => {
  const layer = { id: 'mark', type: 'symbol', layout: { 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 1, 11, ['case', ['==', ['get', 'on'], 1], 3, 1]] } };
  assert.equal(property(layer, 'icon-size', 'layout', 10.5, { on: 1 }, 1), 2);
});

test('a filter that reads the zoom sees it floored', () => {
  const layer = { id: 'mark', type: 'symbol', filter: ['<=', ['get', 'from'], ['zoom']] };
  const f = filterOf(layer);
  assert.equal(f(12.9, { from: 13 }), false);
  assert.equal(f(13, { from: 13 }), true);
  assert.equal(f(13.9, { from: 13 }), true);
  // A group mark due at 13.5 waits for 14: the filter never sees 13.5.
  assert.equal(f(13.9, { from: 13.5 }), false);
  assert.equal(f(14, { from: 13.5 }), true);
});

test('a layer is in zoom from its minzoom up to, not including, its maxzoom', () => {
  const layer = { minzoom: 11, maxzoom: 13 };
  assert.equal(inZoom(layer, 10.75), false);
  assert.equal(inZoom(layer, 11), true);
  assert.equal(inZoom(layer, 12.99), true);
  assert.equal(inZoom(layer, 13), false);
});
