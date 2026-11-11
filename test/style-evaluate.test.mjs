// The page works out some of its own style expressions itself, with
// public/js/evaluate.js, so the key (legend.js) can draw a mark the way its
// layer does. MapLibre accepts more operators than evaluate.js implements, so
// a layer can use one MapLibre is happy with and still throw "evaluate: no
// has" in the page, which stopped the map loading (#58). Nothing else in the
// tests built the page's style and ran its expressions through evaluate.js.
//
// This builds the page's style for both themes, the way the drawn model does
// (qa/drawn/style.mjs, from a small fixture meta.json: test/fixtures/), takes
// the expressions the key evaluates (EVALUATED, below), and fails, naming the
// layer, the property and the operator, when one uses an operator evaluate.js
// does not implement. The operators it implements are read from evaluate.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../public/js/evaluate.js';
import { RUNTIME_ONLY, ROOT, buildStyle } from '../qa/drawn/model.mjs';

const META = path.join(ROOT, 'test', 'fixtures', 'meta.json');
const JS = path.join(ROOT, 'public', 'js');

// ---- The operators evaluate.js implements ---------------------------------

// Every `case '<op>':` of the switch in evaluate(). Checked against the
// function itself in the first test, so a rewrite that moves the operators
// out of a switch fails loudly rather than finding none.
const evaluateSource = fs.readFileSync(path.join(JS, 'evaluate.js'), 'utf8');
const switchAt = evaluateSource.indexOf('switch (op)');
const IMPLEMENTED = new Set(
  [...evaluateSource.slice(switchAt).matchAll(/case '((?:[^'\\]|\\.)+)':/g)].map((m) => m[1]),
);

// ---- Walking an expression ------------------------------------------------

// Arguments evaluate.js does not work out as expressions are data, not
// operators: `(index, count) => whether argument `index` is worked out`.
// Anything not listed here works out all of its arguments.
const WORKED_OUT = {
  literal: () => false, // ['literal', [..]] holds a value
  get: () => false, // a property name
  'global-state': () => false, // a state name
  // ['match', input, label, out, label, out, ..., fallback]: labels are data
  match: (i, n) => i === 0 || i === n - 1 || i % 2 === 0,
  // ['step', input, first, stop, out, stop, out, ...]: stops are numbers
  step: (i) => i < 2 || i % 2 === 1,
  // ['interpolate', ['linear'], input, stop, out, stop, out, ...]: the type and stops are data
  interpolate: (i) => i % 2 === 1,
};

// Every operator evaluate.js would be asked to work out in `expr`, with where
// it is (indexes from the top of the expression). A plain value, such as the
// dash `[3, 2]`, is not an expression: evaluate.js hands an array whose first
// item is not a string back as it is.
function* operatorsIn(expr, at = []) {
  if (!Array.isArray(expr) || typeof expr[0] !== 'string') return;
  const [op, ...args] = expr;
  yield { op, at };
  const workedOut = WORKED_OUT[op];
  for (const [i, arg] of args.entries()) {
    if (!workedOut || workedOut(i, args.length)) yield* operatorsIn(arg, [...at, i + 1]);
  }
}

const missingFrom = (expr) => [...operatorsIn(expr)].filter(({ op }) => !IMPLEMENTED.has(op));
const where = (at) => at.map((i) => `[${i}]`).join('');

// ---- What the page evaluates itself ---------------------------------------

// The four opacity keys strengthAt() (evaluate.js) looks for; it evaluates
// the first the layer has.
const OPACITY = ['icon-opacity?', 'circle-opacity?', 'fill-opacity?', 'line-opacity?'];

// Everything public/js/legend.js hands to evaluate.js (the key; evaluate.js
// has no other importer in public/js, which the next test checks), by layer.
// `filter`: drawsAt() or strengthAt() evaluates the layer's filter. `paint` and
// `layout`: the properties evaluate() is called on. A trailing `?` marks one
// the page copes with the layer not having (`?? 1`, `?? 0`, or only one of a
// pair is used); the others must be there, so a rename can't quietly drop a
// layer out of this test. Only the map's own layers are here, not the basemap's.
const EVALUATED = [
  // drawTiers() > swatch(): drawsAt(layer, ...) for the street, then its
  // width, dashes and color. oneWay() evaluates the street's width and color again.
  {
    layer: 'street',
    where: 'legend.js drawTiers() swatch(), oneWay()',
    filter: true,
    paint: ['line-width', 'line-color', 'line-dasharray?'],
  },
  // drawTiers(): the part-time looks come from whichever of these two draws the tier.
  {
    layer: 'bus-part-time',
    where: 'legend.js drawTiers() swatch(), through drawsAt()',
    filter: true,
    paint: ['line-width', 'line-color', 'line-dasharray?'],
  },
  {
    layer: 'bus-limited',
    where: 'legend.js drawTiers() swatch(), through drawsAt()',
    filter: true,
    paint: ['line-width', 'line-color', 'line-dasharray?'],
  },
  // drawSymbols() > marks(): strengthAt() for the station marks (filter and
  // opacity), then icon() for the picture and its size.
  {
    layer: 'stations-dot',
    where: 'legend.js drawSymbols() marks(), icon()',
    filter: true,
    paint: OPACITY,
    layout: ['icon-image', 'icon-size?'],
  },
  {
    layer: 'stations',
    where: 'legend.js drawSymbols() marks(), icon()',
    filter: true,
    paint: OPACITY,
    layout: ['icon-image', 'icon-size?'],
  },
  // The hub's ring: strengthAt(hubLayer, ...) and icon(hubLayer, ...).
  {
    layer: 'stations-hub',
    where: 'legend.js drawSymbols() strengthAt(hubLayer), icon()',
    filter: true,
    paint: OPACITY,
    layout: ['icon-image', 'icon-size?'],
  },
  // circleImage(): a circle layer's radius, stroke and color.
  {
    layer: 'stations-unserved',
    where: 'legend.js drawSymbols() > circleImage()',
    paint: ['circle-radius', 'circle-stroke-width?', 'circle-color', 'circle-stroke-color?'],
  },
  {
    layer: 'stops',
    where: 'legend.js drawSymbols() > circleImage()',
    paint: ['circle-radius', 'circle-stroke-width?', 'circle-color', 'circle-stroke-color?'],
  },
  // icon(): the P sign's image and size, and the transit-center sign's size.
  {
    layer: 'facilities',
    where: 'legend.js drawSymbols() icon(), evaluate(icon-size)',
    layout: ['icon-image', 'icon-size'],
  },
  // areaImage(): a fill layer's opacity, then its pattern or its color.
  {
    layer: 'bus-terminal',
    where: 'legend.js drawSymbols() > areaImage() fill',
    paint: ['fill-opacity?', 'fill-pattern?', 'fill-color?'],
  },
  {
    layer: 'bus-terminal-under',
    where: 'legend.js drawSymbols() > areaImage() fill',
    paint: ['fill-opacity?', 'fill-pattern?', 'fill-color?'],
  },
  {
    layer: 'station-platform',
    where: 'legend.js drawSymbols() > areaImage() fill',
    paint: ['fill-opacity?', 'fill-pattern?', 'fill-color?'],
  },
  // areaImage(): the roof over the platform, its opacity and its color.
  {
    layer: 'station-canopy',
    where: 'legend.js drawSymbols() > areaImage() over',
    paint: ['fill-opacity?', 'fill-color?'],
  },
  {
    layer: 'flexride-fill',
    where: 'legend.js drawSymbols() > areaImage() fill',
    paint: ['fill-opacity?', 'fill-pattern?', 'fill-color?'],
  },
  // areaImage(): the edge layer's width, opacity, dashes and color.
  {
    layer: 'flexride-line',
    where: 'legend.js drawSymbols() > areaImage() edge',
    paint: ['line-width', 'line-opacity?', 'line-dasharray?', 'line-color'],
  },
  // The Live rows: vehicle() asks drawsAt() (filter), then icon() for the
  // picture and its size.
  {
    layer: 'vehicles-rail',
    where: 'legend.js drawSymbols() vehicle(), icon()',
    filter: true,
    layout: ['icon-image', 'icon-size?'],
  },
  {
    layer: 'vehicles-bus',
    where: 'legend.js drawSymbols() vehicle(), icon()',
    filter: true,
    layout: ['icon-image', 'icon-size?'],
  },
  // oneWay(): settledFrom() reads the shape of its icon-opacity (is it an
  // interpolate on the zoom?) and evaluates nothing. Listed so that every
  // layer the key looks up by name is accounted for.
  { layer: 'street-oneway', where: 'legend.js oneWay(): settledFrom() reads its icon-opacity, evaluates nothing' },
];

// The property names of a spec, as [kind, key, optional].
function propertiesOf(spec) {
  const split = (kind, keys = []) => keys.map((k) => [kind, k.replace(/\?$/, ''), k.endsWith('?')]);
  return [...split('paint', spec.paint), ...split('layout', spec.layout)];
}

// ---- The tests ------------------------------------------------------------

test('evaluate.js: the operators read from its switch are the ones it implements', () => {
  assert.ok(switchAt > 0, 'evaluate.js has no `switch (op)` any more: change IMPLEMENTED in test/style-evaluate.test.mjs');
  for (const op of ['get', 'literal', 'coalesce', 'match', 'interpolate', 'zoom', '==', 'all']) {
    assert.ok(IMPLEMENTED.has(op), `${op} should be among the operators read from evaluate.js: ${[...IMPLEMENTED].join(' ')}`);
  }
  // Each one really is implemented (any other error, such as from having no
  // arguments, is fine) and an invented one really is not.
  for (const op of IMPLEMENTED) {
    assert.doesNotThrow(
      () => {
        try {
          evaluate([op]);
        } catch (e) {
          if (e.message === `evaluate: no ${op}`) throw e;
        }
      },
      `evaluate.js lists case '${op}' but evaluate([${JSON.stringify(op)}]) says it has none`,
    );
  }
  assert.throws(() => evaluate(['no-such-operator-x']), /^Error: evaluate: no no-such-operator-x$/);
  assert.ok(!IMPLEMENTED.has('has'), 'evaluate.js now implements `has`: this test no longer needs its example');
});

test('the walker reports an operator evaluate.js lacks, and nothing for a valid expression', () => {
  // The #58 filter, as a street layer had it.
  const bad = ['all', ['any', ['has', 'zoom'], ['==', ['get', 'zoom'], 'far']], ['>', ['coalesce', ['get', 'n'], 0], 0]];
  assert.deepEqual(missingFrom(bad), [{ op: 'has', at: [1, 1] }]);
  assert.deepEqual(missingFrom(['!', ['has', 'zoom']]), [{ op: 'has', at: [1] }]);
  // The same filter as it is now.
  const good = ['all', ['any', ['==', ['coalesce', ['get', 'zoom'], ''], ''], ['all', ['==', ['get', 'zoom'], 'far'], ['<', ['zoom'], 16]]]];
  assert.deepEqual(missingFrom(good), []);

  // Data is not operators: a literal's value, match labels, step and
  // interpolate stops and types, a plain array value.
  const data = [
    'case',
    ['in', ['get', 'tier'], ['literal', ['has', 'to-number', 'format']]],
    ['match', ['get', 'cls'], ['has', 'at'], 1, 'image', 2, 3],
    ['step', ['zoom'], 1, 10, 2, 12, 3],
    ['interpolate', ['exponential', 1.4], ['zoom'], 9, 1, 12, ['*', 2, 3]],
  ];
  assert.deepEqual(missingFrom(data), []);
  assert.deepEqual(missingFrom([3, 2]), []);
  assert.deepEqual(missingFrom(['literal', [3, 2]]), []);
  assert.deepEqual(missingFrom('has'), []);
  assert.deepEqual(missingFrom(null), []);

  // Outputs, fallbacks and the input are expressions.
  assert.deepEqual(
    missingFrom(['match', ['has', 'a'], 'x', ['has', 'b'], ['has', 'c']]).map((m) => m.at),
    [[1], [3], [4]],
  );
  assert.deepEqual(
    missingFrom(['step', ['has', 'a'], ['has', 'b'], 10, ['has', 'c']]).map((m) => m.at),
    [[1], [2], [4]],
  );
  assert.deepEqual(
    missingFrom(['interpolate', ['linear'], ['has', 'a'], 10, ['has', 'b'], 12, ['has', 'c']]).map((m) => m.at),
    [[2], [4], [6]],
  );
});

test('evaluate.js has no importer in public/js but legend.js, and legend.js looks up only layers listed here', () => {
  const importers = fs
    .readdirSync(JS, { recursive: true })
    .filter((f) => f.endsWith('.js') && path.basename(f) !== 'evaluate.js')
    .filter((f) => /\bimport\b[^;]*?['"]\.{1,2}\/(?:[\w-]+\/)*evaluate\.js['"]/.test(fs.readFileSync(path.join(JS, f), 'utf8')));
  assert.deepEqual(
    importers,
    ['legend.js'],
    `public/js/${importers.join(', ')} imports evaluate.js: add the expressions it evaluates to EVALUATED in test/style-evaluate.test.mjs`,
  );

  // A new row in the key looks its layer up by name.
  const legend = fs.readFileSync(path.join(JS, 'legend.js'), 'utf8');
  const named = new Set([...legend.matchAll(/layers\.get\('([^']+)'\)/g)].map((m) => m[1]));
  const listed = new Set(EVALUATED.map((s) => s.layer));
  assert.ok(named.size > 5, `found only ${[...named].join(', ')} in legend.js: change the pattern in this test`);
  const unlisted = [...named].filter((id) => !listed.has(id));
  assert.deepEqual(unlisted, [], `legend.js looks up ${unlisted.join(', ')}, which EVALUATED in test/style-evaluate.test.mjs does not list`);
});

for (const theme of ['light', 'dark']) {
  test(`every expression the page evaluates itself uses only operators evaluate.js implements (${theme} theme)`, async () => {
    const style = await buildStyle(ROOT, theme, META);
    const sources = style.metadata?.['rtd:data-sources'];
    assert.ok(Array.isArray(sources) && sources.length, 'the style lists no rtd:data-sources');
    // The map's own layers: drawn from the build's files, or from data the page fills in itself.
    const own = new Set([...sources, ...Object.keys(RUNTIME_ONLY)]);

    const problems = [];
    let examined = 0;
    for (const spec of EVALUATED) {
      const layer = style.layers.find((l) => l.id === spec.layer);
      if (!layer) {
        problems.push(`layer ${spec.layer}: not in the ${theme} style any more (${spec.where})`);
        continue;
      }
      if (!own.has(layer.source)) {
        problems.push(`layer ${spec.layer}: draws from ${layer.source}, which is not one of the map's own sources`);
        continue;
      }
      const found = [];
      if (spec.filter && layer.filter != null) found.push(['filter', layer.filter]);
      for (const [kind, key, optional] of propertiesOf(spec)) {
        const value = layer[kind]?.[key];
        if (value === undefined) {
          if (!optional) problems.push(`layer ${spec.layer}: no ${kind}.${key}, which the page evaluates (${spec.where})`);
          continue;
        }
        found.push([`${kind}.${key}`, value]);
      }
      if (!found.length && (spec.filter || spec.paint || spec.layout)) {
        problems.push(`layer ${spec.layer}: none of the expressions the page evaluates are there to check (${spec.where})`);
      }
      for (const [property, expr] of found) {
        examined++;
        for (const { op, at } of missingFrom(expr)) {
          problems.push(
            `layer ${spec.layer}, ${property}${where(at)}: operator ${op} is not implemented by evaluate.js (${theme} theme; evaluated by ${spec.where})`,
          );
        }
      }
    }
    assert.ok(examined > EVALUATED.length, `only ${examined} expressions examined`);
    assert.ok(
      problems.length === 0,
      `public/js/evaluate.js cannot work out ${problems.length === 1 ? 'an expression' : 'expressions'} the page evaluates itself, so the key throws and the map does not load. Implement the operator in evaluate.js, or use one it has:\n  ${problems.join('\n  ')}`,
    );
  });
}
