import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import * as sheetModel from '../scripts/lib/sheets.mjs';
import { WHOLE_ZOOMS, measureDrawing, wholeZoomPlan, writeZoomDrawings } from '../scripts/zoom-drawings.mjs';

const DATA = path.resolve('public/data');
const read = async (name) => readFile(path.join(DATA, name), 'utf8');

test('whole-zoom plan covers 11 through 16 and never imitates the missing #155 adapter', () => {
  const plan = wholeZoomPlan({ SHEETS: sheetModel.SHEETS, drawSheet: sheetModel.drawSheet });
  assert.deepEqual(plan.map((d) => d.zoom), WHOLE_ZOOMS);
  assert.deepEqual(plan.filter((d) => d.sheet).map((d) => d.anchor), [2, 3, 4]);
  assert.deepEqual(plan.filter((d) => d.blocked).map((d) => d.zoom), [11, 13, 15]);
  for (const item of plan.filter((d) => d.blocked)) assert.match(item.blocked, /#155/);

  const withZoomRules = wholeZoomPlan({
    SHEETS: sheetModel.SHEETS,
    sheetAt: (zoom) => ({ id: zoom / 2, zoom, streets: 'far' }),
  });
  assert.ok(withZoomRules.every((d) => d.sheet && !d.blocked));
  assert.deepEqual(withZoomRules.filter((d) => d.anchor == null).map((d) => d.sheet.id), [5.5, 6.5, 7.5]);
});

test('real zoom-12 drawing measures separate drawing and route downloads', async () => {
  const drawing = JSON.parse(await read('sheet-2.geojson'));
  const routes = JSON.parse(await read('sheet-2-routes.geojson'));
  const measured = measureDrawing({ ...drawing, features: [...drawing.features, ...routes.features] }, 12.4);
  const r = measured.report;
  assert.ok(r.features > 1000, `features ${r.features}`);
  assert.ok(r.busStreets > 100, `bus streets ${r.busStreets}`);
  assert.ok(r.rail > 0 && r.stationNames > 0 && r.letters > 0);
  assert.equal(r.routeFeatures, routes.features.length);
  assert.equal(r.elapsedMs, 12);
  assert.equal(r.rawBytes, Buffer.byteLength(JSON.stringify(drawing)));
  assert.equal(r.gzipBytes, gzipSync(JSON.stringify(drawing)).length);
  assert.equal(r.totalRawBytes, r.rawBytes + r.routesRawBytes);
  assert.equal(r.totalGzipBytes, r.gzipBytes + r.routesGzipBytes);
});

test('writer reproduces the real zoom-12 anchor byte for byte and reports blockers without drawing', async (t) => {
  const out = await mkdtemp(path.join(tmpdir(), 'rtd-zoom-drawings-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const drawing = JSON.parse(await read('sheet-2.geojson'));
  const routes = JSON.parse(await read('sheet-2-routes.geojson'));
  let calls = 0;
  const report = await writeZoomDrawings({
    dir: DATA,
    out,
    data: {},
    zooms: [11, 12],
    draw: () => { calls++; return { ...drawing, features: [...drawing.features, ...routes.features] }; },
  });
  assert.equal(calls, 1, 'the blocked intermediate zoom must not call drawSheet');
  assert.equal(report.complete, false);
  assert.equal(report.drawings[0].zoom, 11);
  assert.match(report.drawings[0].blocked, /#155/);
  assert.equal(report.drawings[1].drawingMatchesSheet, true);
  assert.equal(report.drawings[1].routesMatchesSheet, true);
  assert.equal(await readFile(path.join(out, 'zoom-12.geojson'), 'utf8'), await read('sheet-2.geojson'));
  assert.equal(await readFile(path.join(out, 'zoom-12-routes.geojson'), 'utf8'), await read('sheet-2-routes.geojson'));
  assert.equal(JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8')).drawings.length, 2);
});
