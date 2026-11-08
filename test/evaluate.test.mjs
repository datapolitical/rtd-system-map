import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawsAt, evaluate, settledFrom, strengthAt } from '../public/js/evaluate.js';
import { dotStates } from '../public/js/age.js';
import { STALE_S } from '../public/js/realtime.js';

// shared.js reads the theme through palette.js, which asks the page.
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { ZOOMS, byZoom, tierMatch, tierWidth, TIERS } = await import('../public/js/shared.js');

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('byZoom gives its own values at its stops, and between them the exponential curve', () => {
  const e = byZoom([1, 2, 4, 8]);
  ZOOMS.forEach((z, i) => close(evaluate(e, { zoom: z }), [1, 2, 4, 8][i]));
  close(evaluate(e, { zoom: 5 }), 1);
  close(evaluate(e, { zoom: 20 }), 8);
  // Base 1.4 between 9 and 11: t = (1.4^1 - 1) / (1.4^2 - 1).
  close(evaluate(e, { zoom: 10 }), 1 + (0.4 / 0.96));
});

test('a linear interpolate and a step on the zoom', () => {
  close(evaluate(['interpolate', ['linear'], ['zoom'], 10, 0, 12, 1], { zoom: 11.5 }), 0.75);
  assert.equal(evaluate(['step', ['zoom'], 'a', 11, 'b', 13, 'c'], { zoom: 10.9 }), 'a');
  assert.equal(evaluate(['step', ['zoom'], 'a', 11, 'b', 13, 'c'], { zoom: 11 }), 'b');
  assert.equal(evaluate(['step', ['zoom'], 'a', 11, 'b', 13, 'c'], { zoom: 15 }), 'c');
});

test('feature properties, global state and the operators the layers use', () => {
  const props = { tick: null, span: 3, id: 89, meet: true };
  assert.equal(evaluate(['concat', 'dot-', ['coalesce', ['get', 'tick'], ['get', 'span']]], { props }), 'dot-3');
  const onRoute = ['in', ['concat', ' ', ['to-string', ['get', 'id']], ' '], ['concat', ' ', ['global-state', 'sel'], ' ']];
  assert.equal(evaluate(onRoute, { props, state: { sel: ' 89 12 ' } }), true);
  assert.equal(evaluate(onRoute, { props, state: { sel: '' } }), false);
  assert.equal(evaluate(['case', ['==', ['get', 'meet'], true], 1, 0], { props }), 1);
  assert.equal(evaluate(['match', ['get', 'span'], [1, 2], 'few', 3, 'three', 'other'], { props }), 'three');
  assert.equal(evaluate(['in', ['get', 'tier'], ['literal', ['peak', 'limited']]], { props: { tier: 'peak' } }), true);
  assert.equal(evaluate(['boolean', ['get', 'off'], false], { props }), false);
  assert.throws(() => evaluate(['let', 'x', 1, ['var', 'x']]), /no let/);
});

test('a tier width is the tier\'s own width at each of the zooms', () => {
  for (const t of TIERS) ZOOMS.forEach((z, i) => close(evaluate(tierWidth(), { zoom: z, props: { tier: t.id } }), t.width[i]));
  assert.equal(evaluate(tierMatch((t) => t.look), { props: { tier: 'hourly' } }), 'slow');
});

test('a layer draws from its minzoom up to, not including, its maxzoom, where its filter holds', () => {
  const layer = { minzoom: 9, maxzoom: 11, filter: ['==', ['get', 'served'], true], paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1] } };
  assert.equal(drawsAt(layer, 8.99, { served: true }), false);
  assert.equal(drawsAt(layer, 9, { served: true }), true);
  assert.equal(drawsAt(layer, 11, { served: true }), false);
  assert.equal(drawsAt(layer, 10, { served: false }), false);
  close(strengthAt(layer, 9.5, { served: true }), 0.5);
  assert.equal(strengthAt(layer, 12, { served: true }), 0);
  assert.equal(strengthAt({ paint: {} }, 3), 1);
});

test('a fade-in has settled at its top stop', () => {
  assert.equal(settledFrom(['interpolate', ['linear'], ['zoom'], 11, 0, 11.75, 0.6, 12.5, 0.85], 11), 12.5);
  assert.equal(settledFrom(0.72, 0), 0);
  assert.equal(settledFrom(['interpolate', ['linear'], ['zoom'], 11, 0, 11.75, 0.9], 14), 14);
});

test('the dot on the Live pill: three states, named, with the stale age from realtime.js', () => {
  const states = dotStates(STALE_S);
  assert.deepEqual(states.map((s) => s.state), ['fresh', 'stale', 'off']);
  assert.match(states[0].text, new RegExp(`${STALE_S / 60} min`));
  assert.match(states[1].text, new RegExp(`${STALE_S / 60} min`));
  assert.match(dotStates(300)[0].text, /5 min/);
});

test('has: whether the feature carries a property (the bundled layers gate on slot and flat)', () => {
  assert.equal(evaluate(['has', 'slot'], { props: { slot: 0 } }), true);
  assert.equal(evaluate(['!', ['has', 'slot']], { props: { tier: 'frequent' } }), true);
  assert.equal(evaluate(['all', ['==', ['get', 'mode'], 'bus'], ['!', ['has', 'flat']]], { props: { mode: 'bus', flat: 1 } }), false);
});
