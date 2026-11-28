// The landmark-grounds tint and the major-building rule (#243): which OSM-tagged areas the map
// tints, which buildings stay once ordinary building outlines go, and that a transit line keeps
// its contrast against the tint (DESIGN.md, "Basemap", "Quality floor"). Nothing here names a
// place: the rules read the ground tiles' OpenMapTiles `class` and `render_height`, so a place
// RTD serves that is added or renamed in OpenStreetMap flows through on the next tile rebuild.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANDMARK_GROUNDS, AIRPORT_GROUND, MAJOR_BUILDING_HEIGHT, PALETTES, railInk, sheetStyle,
} from '../public/js/sheets/style.js';
import { groundNeeds, groundDraws } from '../scripts/lib/basemap.mjs';
import { contrast } from '../public/js/color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Whether the ground tiles, once rebuilt, keep a feature for the map to draw (groundDraws is the
// same test scripts/basemap.mjs runs over every tile as it trims them).
const draws = groundDraws(14);
const keeps = (layer, properties) => draws(14, layer, { properties, type: 3 });

// The line colors DESIGN.md documents as reference (not the map's source: the map reads RTD's
// route_color at build time), plus the current build's, to cover the whole range a tint must stay
// clear of. Used only to prove the tint keeps the Quality floor's 3:1 line contrast.
const REFERENCE_COLORS = ['#57C1E9', '#4E9D2D', '#F79239', '#008348', '#552683', '#F6B221', '#9F26B5', '#C4D600', '#B71318', '#009DAA'];
function railColors() {
  const set = new Set(REFERENCE_COLORS);
  const sheets = path.join(ROOT, 'public', 'data', 'sheets.json');
  if (existsSync(sheets)) {
    try { for (const c of JSON.parse(readFileSync(sheets, 'utf8')).colors ?? []) set.add(c); } catch { /* the data is not built: the reference set stands */ }
  }
  return [...set];
}

test('landmark grounds are the OSM tags for a hospital, a campus, a stadium and the airport', () => {
  for (const cls of ['hospital', 'university', 'college', 'stadium']) {
    assert.ok(LANDMARK_GROUNDS.includes(cls), `landuse ${cls} is a landmark ground`);
    assert.ok(keeps('landuse', { class: cls }), `landuse ${cls} is tinted`);
  }
  assert.equal(AIRPORT_GROUND, 'aerodrome', 'the airport is the aeroway aerodrome area');
  assert.ok(keeps('aeroway', { class: 'aerodrome' }), 'the airport ground is tinted');
  // The airport's runway, taxiways, aprons and gates are its workings, not its ground.
  for (const cls of ['runway', 'taxiway', 'apron', 'gate']) {
    assert.ok(!keeps('aeroway', { class: cls }), `aeroway ${cls} is not the airport ground`);
  }
});

test('ordinary grounds are not landmark grounds', () => {
  // Everything else the tags call a landuse stays quiet: homes, shops, schools, pitches, parks ...
  for (const cls of ['residential', 'commercial', 'retail', 'industrial', 'pitch', 'playground', 'track',
    'school', 'kindergarten', 'library', 'cemetery', 'quarry', 'parking', 'suburb', 'quarter', 'neighbourhood', 'railway', 'military', 'bus_station']) {
    assert.ok(!LANDMARK_GROUNDS.includes(cls), `landuse ${cls} is not a landmark ground`);
    assert.ok(!keeps('landuse', { class: cls }), `landuse ${cls} is not tinted`);
  }
});

test('a building stays only when it is tall enough to be a point of reference', () => {
  assert.ok(keeps('building', { render_height: MAJOR_BUILDING_HEIGHT }), 'a building at the height is kept');
  assert.ok(keeps('building', { render_height: 94 }), 'a tall building is kept');
  assert.ok(!keeps('building', { render_height: MAJOR_BUILDING_HEIGHT - 1 }), 'a building just under is dropped');
  assert.ok(!keeps('building', { render_height: 5 }), 'an ordinary building is dropped');
  assert.ok(!keeps('building', {}), 'a building with no recorded height is dropped');
});

test('the ground tiles keep the class and height the rules read', () => {
  const needs = groundNeeds();
  assert.deepEqual(needs.landuse, ['class'], 'the tiles keep the landuse class');
  assert.deepEqual(needs.aeroway, ['class'], 'the tiles keep the aeroway class');
  assert.ok(needs.building.includes('render_height'), 'the tiles keep each building\'s height');
});

test('the style draws the tint and only the major buildings', () => {
  for (const theme of ['light', 'dark']) {
    const layers = sheetStyle(theme).layers;
    const landmark = layers.find((l) => l.id === 'landmark');
    const airport = layers.find((l) => l.id === 'landmark-airport');
    const buildings = layers.find((l) => l.id === 'buildings-4');
    assert.ok(landmark && landmark.type === 'fill' && landmark['source-layer'] === 'landuse', `${theme}: the landuse landmark layer is there`);
    assert.ok(airport && airport.type === 'fill' && airport['source-layer'] === 'aeroway', `${theme}: the airport layer is there`);
    assert.ok(buildings && buildings['source-layer'] === 'building', `${theme}: the buildings layer is there`);
    assert.deepEqual(buildings.filter, ['>=', ['to-number', ['get', 'render_height'], 0], MAJOR_BUILDING_HEIGHT], `${theme}: the buildings layer keeps only major buildings`);
    assert.equal(buildings.minzoom, 15, `${theme}: buildings show only on the closest sheet, as before`);
  }
});

test('a transit line keeps its 3:1 contrast against the landmark tint in both themes (Quality floor)', () => {
  for (const theme of ['light', 'dark']) {
    const c = PALETTES[theme];
    for (const color of railColors()) {
      const ink = railInk(theme, color);
      // The outline is what gives a line its contrast (DESIGN.md, "Rail line colors").
      const edge = ink.casing ?? ink.line;
      const r = contrast(edge, c.landmark);
      assert.ok(r >= 3, `${theme} ${color}: ${r.toFixed(2)}:1 against the landmark tint`);
    }
  }
});

test('the landmark tint reads as ground, not as another competing element', () => {
  for (const theme of ['light', 'dark']) {
    const c = PALETTES[theme];
    // As quiet as the park tint: close to the ground in lightness, a different hue.
    assert.ok(contrast(c.landmark, c.ground) <= 1.3, `${theme}: the landmark tint stays close to the ground (${contrast(c.landmark, c.ground).toFixed(2)}:1)`);
    assert.ok(contrast(c.landmark, c.ground) > 1, `${theme}: the landmark tint still reads as a tint`);
  }
});
