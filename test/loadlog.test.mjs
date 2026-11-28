import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP, MAX_BYTES, MAX_FILES, addRun, asJson, formatAll, formatRun, makeRun, parseRuns, pathOf } from '../public/js/loadlog.js';

const seen = (n = 3, extra = {}) => ({
  at: '2026-11-28T12:00Z', ready: 4200, paint: 800, nav: { responseEnd: 300, domInteractive: 500 },
  resources: Array.from({ length: n }, (_, i) => ({ name: `https://example.test/data/f${i}.json?token=secret`, startTime: i * 10, responseEnd: 100 + i * 20, transferSize: 2048 })),
  net: { type: '4g', downlink: 1.5, rtt: 300, saveData: false }, screen: '390×664 @3x', theme: 'dark', repeat: false, agent: 'UA', build: 'abc1234', ...extra,
});

test('addRun keeps the newest five, newest first', () => {
  let list = [];
  for (let i = 1; i <= 8; i++) list = addRun(list, { v: 1, ready: i });
  assert.equal(list.length, KEEP);
  assert.deepEqual(list.map((r) => r.ready), [8, 7, 6, 5, 4]);
  assert.deepEqual(addRun(null, { v: 1 }), [{ v: 1 }]);
});

test('a run drops query strings and addresses, and holds no personal fields', () => {
  assert.equal(pathOf('https://example.test/data/a.json?x=1#y'), 'example.test/data/a.json');
  assert.equal(pathOf('/data/a.json?x=1'), '/data/a.json');
  const run = makeRun(seen());
  assert.ok(!JSON.stringify(run).includes('secret'));
  assert.deepEqual(Object.keys(run).sort(), ['agent', 'at', 'build', 'files', 'net', 'ready', 'repeat', 'requests', 'screen', 'stages', 'theme', 'v']);
});

test('a run stays small however many requests there were', () => {
  const run = makeRun(seen(500, { ready: 1e6 }));
  assert.equal(run.requests.n, 500);
  assert.ok(run.files.length <= MAX_FILES);
  assert.ok(JSON.stringify(run).length <= MAX_BYTES);
  const long = makeRun(seen(500, { ready: 1e6, agent: 'x'.repeat(100), resources: Array.from({ length: 500 }, (_, i) => ({ name: `/${'p'.repeat(400)}${i}`, startTime: 0, responseEnd: 10 + i })) }));
  assert.ok(JSON.stringify(long).length <= MAX_BYTES);
});

test('requests that finished after the map was ready are left out', () => {
  const run = makeRun(seen(3, { ready: 130 }));
  assert.equal(run.requests.n, 2);
});

test('slowest requests come first', () => {
  const run = makeRun(seen(4));
  assert.equal(run.files[0].f, 'example.test/data/f3.json');
});

test('the text export names the stages, connection, screen, theme and build', () => {
  const text = formatRun(makeRun(seen()), 'Last load');
  for (const part of ['Last load: 2026-11-28T12:00Z (first visit)', 'Map ready: 4.2 s', 'First paint 800 ms', 'page arrived 300 ms', 'first sheet drawn 4200 ms', '4g, 1.5 Mbit/s, 300 ms round trip', '390×664 @3x, dark theme', 'Build: abc1234']) assert.ok(text.includes(part), part);
});

test('missing facts read as dashes, not as errors', () => {
  const text = formatRun(makeRun({ at: null, ready: NaN, resources: [] }));
  assert.ok(text.includes('Map ready: –'));
  assert.ok(text.includes('Connection: not reported'));
  assert.ok(text.includes('Build: unknown'));
});

test('formatAll lists every run, or says there are none; json round-trips', () => {
  assert.match(formatAll([]), /No loads recorded/);
  const runs = [makeRun(seen()), makeRun(seen(2))];
  const text = formatAll(runs);
  assert.ok(text.includes('Last load:') && text.includes('Load 2 back:'));
  assert.deepEqual(parseRuns(asJson(runs)), runs);
});

test('parseRuns survives junk in storage', () => {
  for (const bad of [null, '', 'not json', '{"a":1}', '[1,null,{"v":2}]']) assert.deepEqual(parseRuns(bad), []);
  assert.equal(parseRuns(JSON.stringify(Array.from({ length: 9 }, () => ({ v: 1 })))).length, KEEP);
});
