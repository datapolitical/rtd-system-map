// Tap a route on a sheet to highlight it (issue #118, DESIGN.md "Four sheets").
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../public/js/evaluate.js';
import { sheetStyle, PALETTES, STATE, mix } from '../public/js/sheets/style.js';
import { pickFrom, routeList } from '../public/js/sheets/pick.js';

const layer = (style, id) => style.layers.find((l) => l.id === id);
const none = { bus: '', rail: '' };

test("a drawn route list reads as its routes, a stacked one too, and a tap names what is under it", () => {
  assert.deepEqual(routeList('0, 1, 15L,\n19, RX'), ['0', '1', '15L', '19', 'RX']);
  assert.deepEqual(pickFrom({ bus: { routes: '15, 15L', n: 2, hw: 6 } }).bus, '15, 15L');
  assert.deepEqual(pickFrom({ station: { name: 'Union Station', lines: 'A B W' }, bus: { routes: '0' } }).rail, ['A', 'B', 'W']);
  assert.deepEqual(pickFrom({ letter: { route: 'W' }, rail: [{ route: 'E' }] }).rail, ['W']);
  assert.equal(pickFrom({ label: { label: '0, 1' } }).bus, '0, 1');
  assert.equal(pickFrom({}), null, 'empty ground names nothing');
});

test('a picked route holds on every sheet: its pieces are drawn on top, the rest fades toward the ground', () => {
  assert.deepEqual(Object.keys(STATE).sort(), ['bus', 'rail']);
  for (const theme of ['light', 'dark']) {
    const style = sheetStyle(theme, [], ['#57C1E9', '#E31837']);
    assert.deepEqual(style.state, STATE);
    const c = PALETTES[theme];
    for (const n of [1, 2, 3, 4]) {
      const pick = layer(style, `pick-bus-${n}`);
      assert.ok(pick, `sheet ${n} has the picked route's layer`);
      const on15 = { kind: 'bus', routes: '1, 15, 15L', cls: 'c10' };
      const on15L = { kind: 'bus', routes: '15L', cls: 'c10' };
      assert.equal(evaluate(pick.filter, { props: on15, state: { ...none, bus: '15' } }), true);
      assert.equal(evaluate(pick.filter, { props: on15L, state: { ...none, bus: '15' } }), false, '15 is not 15L');
      assert.equal(evaluate(pick.filter, { props: on15, state: none }), false, 'nothing picked, nothing drawn on top');
      // One ink and one weight from end to end, whatever street the route is on.
      assert.equal(pick.paint['line-color'], c.pick);
      assert.equal(typeof pick.paint['line-width'], 'number');
      // The bus streets underneath: whole with nothing picked, faded with anything picked.
      const bus = layer(style, `bus-${n}`).paint['line-color'];
      const full = evaluate(bus, { props: on15, state: none });
      assert.equal(evaluate(bus, { props: on15, state: { ...none, rail: 'W' } }), mix(full, c.ground, 0.8));
      // Rail: the picked line whole, the others faded; stations on it whole.
      const rail = layer(style, `rail-${n}`).paint['line-color'];
      const W = { kind: 'rail', route: 'W', color: '#57C1E9' };
      const E = { kind: 'rail', route: 'E', color: '#E31837' };
      assert.equal(evaluate(rail, { props: W, state: { ...none, rail: 'W' } }), evaluate(rail, { props: W, state: none }));
      assert.notEqual(evaluate(rail, { props: E, state: { ...none, rail: 'W' } }), evaluate(rail, { props: E, state: none }));
      const bar = layer(style, `station-${n}`).paint['line-color'];
      assert.equal(evaluate(bar, { props: { lines: 'A W' }, state: { ...none, rail: 'W' } }), c.mark);
      assert.notEqual(evaluate(bar, { props: { lines: 'A E' }, state: { ...none, rail: 'W' } }), c.mark);
    }
    // On the closest sheet the picked route's stops are ringed over it.
    const stop = layer(style, 'pick-stop-4');
    assert.equal(evaluate(stop.filter, { props: { kind: 'stop', routes: '15, 15L' }, state: { ...none, bus: '15L' } }), true);
  }
});
