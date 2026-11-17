import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeName, sheetName, pickSaid, cardSaid, contrast, inkOn } from '../public/js/sheets/say.js';

test('routes, sheets and picks are said in words (#14)', () => {
  assert.equal(routeName({ mode: 'bus', route: '15L' }), 'Route 15L');
  assert.equal(routeName({ mode: 'rail', route: 'W' }), 'W Line');
  assert.equal(sheetName(2, 4), 'Sheet 3 of 4');
  assert.equal(pickSaid({ mode: 'bus', route: '15' }), 'Route 15 shown, the rest faded');
  assert.equal(pickSaid(null), 'Cleared');
});

test('an opened card is said as its title, what it is, and its routes', () => {
  const rail = (...r) => r.map((route) => ({ mode: 'rail', route }));
  assert.equal(cardSaid({ title: 'Union Station', note: 'Rail station', routes: rail('A', 'B', 'G', 'N', 'W') }), 'Union Station. Rail station. 5 routes');
  assert.equal(cardSaid({ title: 'Line', note: 'Rail', routes: rail('E') }), 'Line. Rail. E Line');
  assert.equal(cardSaid({ title: 'Colfax Ave', lead: 'Routes by the letter of their stop', routes: [{ mode: 'bus', route: '15' }, { mode: 'bus', route: '15L' }] }),
    'Colfax Ave. Routes by the letter of their stop. Route 15, Route 15L');
  assert.equal(cardSaid({ title: 'Route', note: '' }), 'Route');
});

test("a line's label ink reads at AA on its colour, whatever the colour", () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  for (let i = 0; i < 4096; i += 7) {
    const color = `#${[i >> 8, (i >> 4) & 15, i & 15].map((c) => (c * 17).toString(16).padStart(2, '0')).join('')}`;
    // The pick is the better of the two inks, so where either reaches AA, the label does.
    const best = Math.max(contrast(color, '#10151d'), contrast(color, '#ffffff'));
    assert.equal(contrast(color, inkOn(color)), best, color);
    if (best >= 4.5) assert.ok(contrast(color, inkOn(color)) >= 4.5, `${color} with ${inkOn(color)}`);
  }
});

test("the sheets page's quieter text and rings meet AA in both themes", async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const light = tokens(html.match(/:root \{([^}]*)\}/)[1]);
  const dark = { ...light, ...tokens(html.match(/prefers-color-scheme: dark\) \{ :root \{([^}]*)\}/)[1]) };
  for (const [name, t] of Object.entries({ light, dark })) {
    for (const bg of ['card', 'ground']) {
      assert.ok(contrast(t.note, t[bg]) >= 4.5, `${name}: --note on --${bg}`);
      assert.ok(contrast(t.ink, t[bg]) >= 4.5, `${name}: --ink on --${bg}`);
    }
    assert.ok(contrast(t.rim, t.card) >= 3, `${name}: a route button's ring on the card`);
  }
});
