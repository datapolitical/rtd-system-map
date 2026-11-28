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
  const dark = { ...light, ...tokens(html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1]) };
  for (const [name, t] of Object.entries({ light, dark })) {
    for (const bg of ['card', 'ground']) {
      assert.ok(contrast(t.note, t[bg]) >= 4.5, `${name}: --note on --${bg}`);
      assert.ok(contrast(t.ink, t[bg]) >= 4.5, `${name}: --ink on --${bg}`);
    }
    assert.ok(contrast(t.rim, t.card) >= 3, `${name}: a route button's ring on the card`);
  }
});
test("a search result's second line meets AA on the highlighted row, in both themes", async () => {
  // The highlight is a tint of ink over the card; the line on it is --note with ink mixed in
  // (index.html, #finder .opt.active). Both amounts are read from the page's own rules.
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const light = tokens(html.match(/:root \{([^}]*)\}/)[1]);
  const dark = { ...light, ...tokens(html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1]) };
  const tint = Number(html.match(/#finder \.opt\.active \{ background: color-mix\(in srgb, var\(--ink\) (\d+)%, transparent\)/)[1]) / 100;
  const firm = Number(html.match(/#finder \.opt\.active \.sub \{ color: color-mix\(in srgb, var\(--ink\) (\d+)%, var\(--note\)\)/)[1]) / 100;
  const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const mix = (a, b, share) => `#${rgb(a).map((x, i) => Math.round(x * share + rgb(b)[i] * (1 - share)).toString(16).padStart(2, '0')).join('')}`;
  for (const [name, t] of Object.entries({ light, dark })) {
    const row = mix(t.ink, t.card, tint);
    assert.ok(contrast(mix(t.ink, t.note, firm), row) >= 4.5, `${name}: the second line on the highlighted row`);
    assert.ok(contrast(t.ink, row) >= 4.5, `${name}: the first line on the highlighted row`);
  }
  // The control: --note alone does not reach AA on that row in dark, which is why the rule exists.
  assert.ok(contrast(dark.note, mix(dark.ink, dark.card, tint)) < 4.5);
});
test('visual separators are phrased as punctuation in speech', () => {
  assert.equal(cardSaid({ title: 'Route 15', note: 'Colfax · Every 10 min' }), 'Route 15. Colfax, Every 10 min');
  assert.equal(cardSaid({ title: 'Stop', note: 'Bus stop · Southwest-bound' }), 'Stop. Bus stop, Southwest-bound');
});
