// Tap a route on a sheet to highlight it (issue #118, DESIGN.md "Four sheets").
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../public/js/evaluate.js';
import { sheetStyle, PALETTES, STATE, mix } from '../public/js/sheets/style.js';
import { pickFrom, pickCard, routeList } from '../public/js/sheets/pick.js';
import fs from 'node:fs';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';

const layer = (style, id) => style.layers.find((l) => l.id === id);
const none = { bus: '', rail: '' };

test("a drawn route list reads as its routes, a stacked one too, and a tap names what is under it", () => {
  assert.deepEqual(routeList('0, 1, 15L,\n19, RX'), ['0', '1', '15L', '19', 'RX']);
  assert.deepEqual(pickFrom({ bus: { routes: '15, 15L', n: 2, hw: 6 } }).bus, '15, 15L');
  assert.deepEqual(pickFrom({ station: { name: 'Union Station', lines: 'A B W' }, bus: { routes: '0' } }).rail, ['A', 'B', 'W']);
  assert.deepEqual(pickFrom({ letter: { route: 'W' }, rail: [{ route: 'E' }] }).rail, ['W']);
  assert.equal(pickFrom({ label: { label: '0, 1' } }).bus, '0, 1');
  assert.equal(pickFrom({}), null, 'empty ground names nothing');
  assert.match(pickFrom({ bus: { routes: 'FF1', n: 1, hw: 15, express: true } }).note, /^Express · /);
  assert.match(pickFrom({ bus: { routes: 'AT', n: 1, hw: 60, airport: true } }).note, /^Airport bus · /, 'an airport bus says so, never RTD\'s category');
  assert.doesNotMatch(pickFrom({ bus: { routes: 'AT', n: 1, hw: 60, airport: true } }).note, /SKYRIDE|SkyRide|BRT|rapid/i);
});

test('a picked route holds on every sheet: its pieces are drawn on top, the rest fades toward the ground', () => {
  assert.deepEqual(Object.keys(STATE).sort(), ['bus', 'clipped', 'edgeNames', 'rail']);
  for (const theme of ['light', 'dark']) {
    const style = sheetStyle(theme, [], ['#57C1E9', '#E31837']);
    assert.deepEqual(style.state, STATE);
    const c = PALETTES[theme];
    for (const n of [1, 2, 3, 4]) {
      const pick = layer(style, `pick-bus-${n}`);
      assert.ok(pick, `sheet ${n} has the picked route's layer`);
      const on15 = { kind: 'bus', routes: '1, 15, 15L', cls: 'c10' };
      // The picked route is drawn from its own composed line (routeLine), not the streets' pieces.
      const line15 = { kind: 'route-line', routes: '15' };
      const line15L = { kind: 'route-line', routes: '15L' };
      assert.equal(evaluate(pick.filter, { props: line15, state: { ...none, bus: '15' } }), true);
      assert.equal(evaluate(pick.filter, { props: line15L, state: { ...none, bus: '15' } }), false, '15 is not 15L');
      assert.equal(evaluate(pick.filter, { props: on15, state: { ...none, bus: '15' } }), false, 'the street pieces are not drawn again');
      assert.equal(evaluate(pick.filter, { props: line15, state: none }), false, 'nothing picked, nothing drawn on top');
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

test('a link with a picked route opens that route\'s card, the one a tap on its number gives (#117)', () => {
  // Chris: "when I click the link, the route is highlighted, but there is no modal box that comes up
  // showing which route it is until I click on the route again".
  assert.deepEqual(pickCard({ mode: 'bus', route: '28' }), { title: 'Route', note: 'Bus', bus: '28' });
  assert.deepEqual(pickCard({ mode: 'rail', route: 'W' }), { title: 'W Line', note: 'Rail', rail: ['W'] });
  const { title, note, bus } = pickFrom({ label: { label: '28' } });
  assert.deepEqual(pickCard({ mode: 'bus', route: '28' }), { title, note, bus }, 'the same card as a tap on the route\'s number');
  assert.equal(pickCard({}), null);
  // Address changes, validation, focus and dismissal are exercised on the page by qa/sheets.mjs.
});

test('a tap names the actual rail lines, including shared track', () => {
  assert.equal(pickFrom({ letter: { route: 'W' } }).title, 'W Line');
  assert.equal(pickFrom({ rail: [{ route: 'G' }, { route: 'B' }] }).title, 'G and B Lines');
  assert.equal(pickFrom({ rail: [{ route: 'A' }, { route: 'B' }, { route: 'C' }] }).title, 'A, B and C Lines');
});

test('the stop-group table stays readable and distinguishes only the selected route row', () => {
  for (const theme of ['light', 'dark']) {
    const style = sheetStyle(theme, [], ['#57C1E9']);
    const state = { ...none, bus: '15L' };
    assert.equal(layer(style, 'group-plate-3').paint['icon-opacity'], 1);
    assert.equal(layer(style, 'group-badge-3').paint['text-opacity'], 1);
    const text = layer(style, 'group-text-3');
    const selected = { role: 'row', routes: '1, 15, 15L, 20' };
    const other = { role: 'row', routes: '10, 28, 32' };
    assert.equal(evaluate(text.paint['text-opacity'], { props: selected, state }), 1);
    assert.equal(evaluate(text.paint['text-opacity'], { props: other, state }), 1);
    assert.notEqual(evaluate(text.paint['text-color'], { props: selected, state }), evaluate(text.paint['text-color'], { props: other, state }));
    assert.deepEqual(evaluate(text.layout['text-font'], { props: selected, state: { ...none, bus: '15' } }), evaluate(text.layout['text-font'], { props: selected, state }));
    assert.notDeepEqual(evaluate(text.layout['text-font'], { props: selected, state: { ...none, bus: '5' } }), evaluate(text.layout['text-font'], { props: selected, state }), 'not a substring of a route number');
  }
});

test('street names accept number-only roads and shorten ordinary names without null warnings', () => {
  const text = layer(sheetStyle('light'), 'street-name-3').layout['text-field'];
  const compiled = createExpression(text, 'layers[street-name-3].layout.text-field');
  assert.equal(compiled.result, 'success');
  for (const [props, wanted] of [[{ name: null, ref: '120' }, '120'], [{ ref: 7 }, '7'], [{ name: '', ref: '36' }, '36'], [{}, ''], [{ name: 'West Colfax Avenue' }, 'W Colfax Ave']]) {
    assert.equal(compiled.value.evaluate({ zoom: 14 }, { properties: props, type: 2 }), wanted);
  }
});

test('a station name keeps off a picked route: moved where it can be, under a tight halo where not (#117)', () => {
  // Chris: "The Union Station label sits on top of route 28".
  for (const theme of ['light', 'dark']) {
    const style = sheetStyle(theme, [], ['#57C1E9']);
    for (const n of [1, 2, 3, 4]) {
      const name = layer(style, `name-${n}`);
      const shows = (props, bus) => evaluate(name.filter, { props: { kind: 'station', shape: 'name', ...props }, state: { ...none, bus } });
      // The first place gives way to its second only for the routes it names, "28" not "28X".
      assert.equal(shows({ under: '|28|0|' }, ''), true);
      assert.equal(shows({ under: '|28|0|' }, '28'), false);
      assert.equal(shows({ under: '|28|0|' }, '15'), true);
      assert.equal(shows({ alt: '|28|' }, '28'), true);
      assert.equal(shows({ alt: '|28|' }, '2'), false);
      assert.equal(shows({ alt: '|28|' }, ''), false, 'nothing picked: the first place only');
      assert.equal(shows({}, '28'), true);
      // The name's letters go with it.
      for (const id of [`letter-${n}`, `letter-disc-${n}`]) {
        assert.equal(evaluate(layer(style, id).filter, { props: { kind: 'letter', small: true, alt: '|28|' }, state: { ...none, bus: '28' } }), true);
        assert.equal(evaluate(layer(style, id).filter, { props: { kind: 'letter', small: true, under: '|28|' }, state: { ...none, bus: '28' } }), false);
      }
      // A name with nowhere off the route lets the line run on under a tight halo, not a knockout
      // that reads as a gap (Chris), and its letters step aside, only while that route is picked.
      const halo = name.paint['text-halo-width'];
      assert.ok(evaluate(halo, { props: { cover: '|28|' }, state: { ...none, bus: '28' } }) < evaluate(halo, { props: { cover: '|28|' }, state: none }));
      for (const id of [`letter-${n}`, `letter-disc-${n}`]) {
        assert.equal(evaluate(layer(style, id).filter, { props: { kind: 'letter', small: true, cover: '|28|' }, state: { ...none, bus: '28' } }), false);
        assert.equal(evaluate(layer(style, id).filter, { props: { kind: 'letter', small: true, cover: '|28|' }, state: none }), true);
      }
      assert.equal(evaluate(halo, { props: { cover: '|28|' }, state: { ...none, bus: '15' } }), evaluate(halo, { props: {}, state: none }));
    }
  }
});

test('a picked route\'s card says what the route is, from RTD\'s directory, in two short lines (#117)', () => {
  // Chris: "'Route / Bus / 28' says almost nothing" and "it covers about a quarter of the screen".
  const r = { route: '28', mode: 'bus', name: '28th Avenue', tier: 'hourly', wk: 60, goes: [{ name: 'Olde Town Arvada Station' }, { name: 'Central Park Station' }] };
  const card = pickCard({ mode: 'bus', route: '28' }, r);
  assert.equal(card.kind, 'route');
  assert.equal(card.name, '28th Avenue');
  assert.equal(card.line, 'Olde Town Arvada – Central Park · Every 60 min');
  assert.equal(card.bus, '28', 'its chip still picks and unpicks it');
  const rail = pickCard({ mode: 'rail', route: 'W' }, { route: 'W', mode: 'rail', name: 'Union Station to Jefferson County Government Center-Golden Station', tier: 'frequent', wk: 15, goes: [{ name: 'Union Station' }, { name: 'Jeffco' }] });
  assert.equal(rail.name, 'W Line');
  assert.equal(rail.line, 'Union Station – Jeffco · Every 15 min');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /#card\.route \{[^}]*padding: 6px/, 'the route card is compact');
});
