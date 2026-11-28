// #237: the zoomable map's drawings served as tiles — the cutting rules, the seam check and the
// manifest that derives each drawing's zooms from what the build made. The last test runs against
// the trial's real drawings when public/data/zoom-prototype has been built (#154; #157 will
// build it from main's build), and skips loudly, not silently, where it has not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { wholeInOneTile, seamFaults, seamControls, px, labelKey } from '../scripts/lib/zoom-seam.mjs';
import { zoomDrawings, listsOf, cutZoomDrawings } from '../scripts/zoom-tiles.mjs';
import { cutData } from '../scripts/tiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRIAL = path.join(ROOT, 'public/data/zoom-prototype');
// Around the district's middle, so every fixture sits inside the cut's tiles.
const AT = [-104.99, 39.74];
const point = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const line = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });

test('a tile holds a label whole within its buffer, and a label too long for any tile is cut', () => {
  const step = 360 / 2 ** 12;
  // One tile wide, straddling the tile edge through AT: both tiles beside the edge hold it whole.
  const straddling = [[AT[0] - 0.45 * step, AT[1]], [AT[0] + 0.45 * step, AT[1]]];
  assert.ok(wholeInOneTile([AT[0] - 0.45 * step, AT[1], AT[0] + 0.45 * step, AT[1]], 12), 'a tile holds it, buffer included');
  // Three tiles wide: no tile's buffered extent reaches that far, on either axis.
  const long = [[AT[0] - 1.5 * step, AT[1]], [AT[0] + 1.5 * step, AT[1]]];
  assert.equal(wholeInOneTile([long[0][0], AT[1], long[1][0], AT[1]], 12), null, 'no tile holds it');
  // The same, the tall way.
  assert.equal(wholeInOneTile([AT[0], AT[1] - 1.5 * step * 1.4, AT[0], AT[1] + 1.5 * step * 1.4], 12), null);
  // The tile it names holds the label whole, its buffer included.
  const tiny = [AT[0] - 1e-6, AT[1], AT[0] + 1e-6, AT[1]];
  const holds = wholeInOneTile(tiny, 12);
  const [Ex, Ny] = px([tiny[2], tiny[3]], 12), [Wx, Sy] = px([tiny[0], tiny[1]], 12);
  assert.ok(holds && Wx >= holds.x * 512 - 256 && Ex <= (holds.x + 1) * 512 + 256 && Ny >= holds.y * 512 - 256 && Sy <= (holds.y + 1) * 512 + 256, 'the tile it names holds it, buffer included');
});

test('the seam check names the faults it plants and no others', () => {
  const controls = seamControls();
  assert.deepEqual(controls.planted, ['cut', 'whole', 'doubled', 'apart']);
  assert.ok(controls.caught >= 2, 'the planted cut and doubled faults, at least');
});

test('a carried label is one per set, not one placed twice', () => {
  // The rail bundle carries each station bar and line letter once per drawing (`ref`), and the
  // page shows one drawing's at a time: the check must not call those a doubling.
  const carried = [point({ kind: 'letter', key: 'A:0', ref: 13, route: 'A', angle: 0 }, AT),
    point({ kind: 'letter', key: 'A:0', ref: 15, route: 'A', angle: 0 }, [AT[0] + 1e-4, AT[1]])];
  assert.deepEqual(seamFaults(carried, { zooms: [12] }), []);
  // The same key in one set, twice at one place, is: the page draws every placed label.
  const doubled = [point({ kind: 'letter', key: 'A:0', ref: 13, route: 'A', angle: 0 }, AT),
    point({ kind: 'letter', key: 'A:0', ref: 13, route: 'A', angle: 90 }, AT)];
  assert.deepEqual(seamFaults(doubled, { zooms: [12] }).map((f) => f.fault), ['doubled']);
  assert.match(seamFaults(doubled, { zooms: [12] })[0].detail, /differing/);
});

test('two lists with one text on different streets are not one label placed twice', () => {
  const apart = [point({ kind: 'bus-list', label: '15, 15L', angle: 0 }, AT),
    point({ kind: 'bus-list', label: '15, 15L', angle: 90 }, [AT[0] + 0.5, AT[1]])];
  assert.deepEqual(seamFaults(apart, { zooms: [12] }), []);
});

test('a drawing between the sheets is cut at its own zoom; a sheet\'s own drawing one under it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-tiles-'));
  fs.writeFileSync(path.join(dir, 'bus-13.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [line({ kind: 'bus' }, [AT, [AT[0] + 0.01, AT[1]]])] }));
  fs.writeFileSync(path.join(dir, 'bus-13-routes.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [] }));
  fs.writeFileSync(path.join(dir, 'bus-14.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [line({ kind: 'bus' }, [AT, [AT[0] + 0.01, AT[1]]])] }));
  fs.writeFileSync(path.join(dir, 'trial.json'), JSON.stringify({
    rails: { type: 'FeatureCollection', features: [
      line({ kind: 'rail', ref: 13 }, [AT, [AT[0] + 0.01, AT[1]]]),
      line({ kind: 'rail', ref: 15 }, [AT, [AT[0] + 0.01, AT[1]]])] },
    attached: { type: 'FeatureCollection', features: [line({ kind: 'station', id: 1, ref: 13 }, [AT, [AT[0] + 0.001, AT[1]]])] },
  }));
  const drawings = await zoomDrawings(dir);
  const zoomsOf = Object.fromEntries(drawings.map((d) => [d.name, d.zooms]));
  assert.deepEqual(zoomsOf['zoom-bus-13'], [13], 'a drawing between sheets is cut at its own zoom, as the trial\'s page cut it');
  assert.deepEqual(zoomsOf['zoom-bus-14'], [13], 'a sheet\'s own drawing is cut one under it, as the sheets are');
  assert.deepEqual(zoomsOf['zoom-rail'], [12, 13, 14], 'the rail drawings serve the whole zooms from the first ref less one to the last ref less one');
  assert.deepEqual(drawings.map((d) => d.name).sort(), ['zoom-attached', 'zoom-bus-13', 'zoom-bus-13-routes', 'zoom-bus-14', 'zoom-rail']);
  assert.equal(await zoomDrawings(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))), null, 'a directory with no drawings has none');
});

test('a tile carries a list as text the table names, and the page reads it back whole', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-cut-'));
  const attachment = [871461.6, 1592024.0, -2.3, 6.9];
  const features = [
    { ...point({ kind: 'letter', key: 'A:0', ref: 13, route: 'A' }, AT), attachment },
    point({ kind: 'name', key: '89:0', text: 'Union Station', anchor: 'bottom-right', offset: [-2.86, -4.29] }, AT),
  ];
  const lists = listsOf(structuredClone(features));
  const [attached, named] = [lists[Object.keys(lists)[0]], lists[Object.keys(lists)[1]]];
  assert.deepEqual(attached, attachment, 'the attachment goes in as text and comes back by the table');
  assert.deepEqual(named, [-2.86, -4.29], 'and so does a name\'s offset');
  // The cut of the same features, with their lists hoisted, decodes back to what went in.
  const ready = structuredClone(features);
  listsOf(ready);
  await cutData({ type: 'FeatureCollection', features: ready }, 'zoom-roundtrip', { minzoom: 12, maxzoom: 12 }, out);
  const tile = fs.readdirSync(path.join(out, 'zoom-roundtrip', '12'))[0];
  const files = fs.readdirSync(path.join(out, 'zoom-roundtrip', '12', tile));
  const layer = new VectorTile(new PbfReader(fs.readFileSync(path.join(out, 'zoom-roundtrip', '12', tile, files[0])))).layers['_geojsonTileLayer'];
  assert.equal(layer.length, 2);
  const byKey = new Map([...Array(layer.length).keys()].map((i) => [layer.feature(i).properties.key, layer.feature(i)]));
  assert.deepEqual(byKey.get('A:0').properties.attachment, String(attachment), 'the tile holds the attachment as its text');
  assert.deepEqual(byKey.get('89:0').properties.offset, '-2.86,-4.29', 'and the offset the same way');
  assert.deepEqual(byKey.get('A:0').properties.route, 'A');
});

test('the trial\'s real drawings cut with no seam faults', { timeout: 120000 }, async () => {
  if (!fs.existsSync(path.join(TRIAL, 'trial.json'))) {
    console.log(`zoom tiles: ${path.relative(ROOT, TRIAL)} is not built here (the #154 trial builds it; #157 will from main's build): the real-data check skipped`);
    return;
  }
  const drawings = await zoomDrawings(TRIAL);
  assert.equal(drawings.length, 12, 'five bus drawings with their route lines, the rail and what rides it');
  for (const d of drawings) {
    const faults = seamFaults(structuredClone(d.features), { zooms: d.zooms });
    assert.deepEqual(faults, [], `${d.name} at zooms ${d.zooms}`);
  }
});

test('the report the cut writes says what each set holds', { timeout: 240000 }, async () => {
  if (!fs.existsSync(path.join(TRIAL, 'trial.json'))) {
    console.log('zoom tiles: the real drawings are not built here: the report check skipped');
    return;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-report-'));
  const drawings = await zoomDrawings(TRIAL);
  const report = await cutZoomDrawings(structuredClone(drawings), fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-report-')), out);
  assert.deepEqual(report.controls.planted, ['cut', 'whole', 'doubled', 'apart']);
  for (const set of report.sets) {
    assert.ok(set.tiles > 0, `${set.name} cut some tiles`);
    assert.ok(set.gzip > 0);
    assert.equal(set.seamFaults, undefined, `${set.name} cut with no seam faults`);
    assert.deepEqual(set.zooms, [...new Set(set.zooms)], 'whole zooms, ascending and unique');
  }
  assert.ok(Object.keys(report.lists).length > 0, 'the lists a tile names by text are in the table');
});
