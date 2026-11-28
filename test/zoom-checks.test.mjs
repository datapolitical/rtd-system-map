import assert from 'node:assert/strict';
import test from 'node:test';
import { toLonLat, toWorld } from '../qa/drawn/mercator.mjs';
import { runZoomChecks } from '../qa/zoom/report.mjs';
import { continuityFindings, overlapFindings, sampleZooms } from '../qa/zoom/rules.mjs';

const center = [-105, 40];
const near = (x, y, zoom = 14) => toLonLat(toWorld(center, zoom).map((v, i) => v + [x, y][i]), zoom);
const label = (id, x = 0, y = 0, options = {}) => ({ id, at: near(x, y), room: [10, 4], angle: 0, ...options });

test('samples the entire range at tenths and brackets exact handovers, including at 16', () => {
  const zooms = sampleZooms([{ kind: 'handover', zoom: 9.25 }, { kind: 'arrival', zoom: 10.08 }, { kind: 'handover', zoom: 16 }]);
  assert.equal(zooms[0], 8.75);
  assert.equal(zooms.at(-1), 16);
  assert.ok(zooms.slice(1).every((z, i) => z - zooms[i] <= 0.100001));
  assert.deepEqual(zooms.filter((z) => z > 9.2 && z < 9.3), [9.24, 9.25, 9.26]);
  assert.ok(zooms.includes(10.08));
  assert.ok(zooms.includes(15.99));
});

test('rotated lettering is checked against other lettering and stroke ink', () => {
  const strokes = [{ id: 'bar', path: [near(-15, 3), near(15, 3)], width: 2.5 }];
  assert.deepEqual(overlapFindings([label('name'), label('list', 8, 0, { angle: 20 })], strokes, 14)
    .map((f) => f.kind), ['label-on-stroke', 'label-on-stroke', 'label-overlap']);
  assert.deepEqual(overlapFindings([label('name'), label('list', 11, 0)], [{ ...strokes[0], width: 1 }], 14), []);
});

test('checks disappearance and displacement at the same zoom to exclude camera scaling', () => {
  const before = [label('station'), label('lost')];
  assert.deepEqual(continuityFindings(before, [label('station', 3)], 14).map((f) => f.kind), ['label-moved', 'label-disappeared']);
  assert.deepEqual(continuityFindings(before, [label('station'), label('continuation')], 14, [{ from: 'lost', to: 'continuation' }]), []);
});

function build({ broken = false } = {}) {
  return {
    commit: 'abcd1234',
    minZoom: 8.75,
    maxZoom: 16,
    center,
    events: [{ zoom: 14, kind: 'handover' }, { zoom: 13, kind: 'arrival' }],
    plan: { version: 1, labels: [{ id: 'name', kind: 'station-name', stops: [{ zoom: 8.75, at: center, room: [6, 4], angle: 0 }] },
      { id: 'list', kind: 'route-list', stops: [{ zoom: 13, at: near(0, 55, 13), room: [6, 4], angle: 0 }] }] },
    frameAt(zoom) {
      const at = (x, y) => near(x, y, zoom);
      const path = [at(-15, 25), at(15, 25)];
      const second = path.map((_, i) => at(i ? 15 : -15, broken && Math.abs(zoom - 14) <= 0.011 ? 26 : 29));
      const bar = { id: 'bar', kind: 'bar', width: 2, path: [at(15, 23), at(15, 31)] };
      return {
        strokes: [bar, { id: 'rail', kind: 'rail', width: 2, path }, { id: 'other', kind: 'rail', width: 2, path: second }],
        packs: [{ ids: ['rail', 'other'], paths: [path, second], widths: [2, 2], minimum: 1.75 }],
        ends: [{ id: 'end', bar: 'bar', at: broken ? at(18, 25) : path[1] }],
      };
    },
  };
}

test('full-range report has clean and failing geometry controls and review cameras', async () => {
  const clean = await runZoomChecks(build());
  assert.deepEqual(clean.results.flatMap((r) => r.findings), []);
  assert.deepEqual(clean.cameras.filter((v) => v.reasons.includes('handover z14')).map((v) => v.zoom), [13.99, 14, 14.01]);
  assert.ok(clean.cameras.some((v) => v.zoom === 13 && v.reasons.includes('arrival z13')));
  const failed = await runZoomChecks(build({ broken: true }));
  assert.deepEqual(failed.results.filter((r) => r.findings.some((f) => f.kind === 'rail-spacing')).map((r) => r.zoom), [13.99, 14, 14.01]);
  assert.ok(failed.results.every((r) => r.findings.some((f) => f.kind === 'rail-end')));
  await assert.rejects(runZoomChecks({ ...build(), minZoom: 12 }), /covers 12 to 16/);
  await assert.rejects(runZoomChecks({ ...build(), frameAt: () => ({ strokes: [], packs: [], ends: [] }) }), /missing or invalid drawing evidence/i);
});
