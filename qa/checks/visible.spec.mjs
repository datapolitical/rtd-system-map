// What the model says is drawn must be on the screen (#103).
//
// drawn.spec.mjs compares where things are, at whole zooms. This compares
// whether a station's mark is there at all, between whole zooms: the page's
// renderer works out a fade that reads both the zoom and the feature at whole
// zooms only and blends between them, so a mark the style says is solid at
// 13.25 was a ghost on the phone until 14, and the model, reading the style
// as written, called it drawn. The checks that ask "does every line end at a
// mark" are only as good as that answer.
//
// At every station where a line ends, and every station with a second mark,
// at zooms between the whole ones: a mark the model draws at full strength
// must show its fill over the lines under it, and one the model fades out
// must not. The pixels read are the middles of the lines the mark lies
// across, where a missing mark leaves the line's own colour.
import { test, expect, siteData, pixels } from './fixtures.mjs';
import { openModel, pageSources } from '../drawn/model.mjs';
import { quadOf, stationMarks } from '../drawn/ends.mjs';

const ZOOMS = (process.env.VISIBLE_ZOOMS ?? '11.25,11.75,12.5,13.25,13.75,14.5,15.5').split(',').map(Number);
const ROOT = process.env.DRAWN_ROOT || undefined;
// A pixel is the mark's fill when each channel is within this of it.
const FILL_TOLERANCE = 48;
// The capsule is drawn 13 units deep and 11 a line (public/js/symbols.js).
const DEEP = 13;
const PITCH = 11;

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b) => a && Math.abs(a[0] - b[0]) <= FILL_TOLERANCE && Math.abs(a[1] - b[1]) <= FILL_TOLERANCE && Math.abs(a[2] - b[2]) <= FILL_TOLERANCE;

// The middles of the lines a capsule lies across, in frame px: along its
// long side, a line's pitch apart, centred on its middle.
export function lineMiddles(mark) {
  const { corners } = quadOf(mark);
  const centre = [0, 1].map((k) => corners.reduce((s, c) => s + c[k], 0) / corners.length);
  const sides = [0, 1].map((i) => [corners[i + 1][0] - corners[i][0], corners[i + 1][1] - corners[i][1]]);
  const [long, short] = Math.hypot(...sides[0]) >= Math.hypot(...sides[1]) ? sides : [sides[1], sides[0]];
  const [length, depth] = [Math.hypot(...long), Math.hypot(...short)];
  if (!depth) return [centre];
  const lines = Math.max(1, Math.round(((length / depth) * DEEP - DEEP) / PITCH) + 1);
  const pitch = (depth * PITCH) / DEEP;
  const along = [long[0] / (length || 1), long[1] / (length || 1)];
  return Array.from({ length: lines }, (_, k) => {
    const t = (k - (lines - 1) / 2) * pitch;
    return [centre[0] + along[0] * t, centre[1] + along[1] * t];
  });
}

async function setup(mapPage) {
  const meta = await siteData('meta.json');
  const data = Object.fromEntries(await Promise.all((await pageSources(ROOT)).map(async (name) => [name, await siteData(`${name}.geojson`)])));
  const groups = new Set((data.platforms?.features ?? []).filter((f) => f.properties.kind === 'mark').map((f) => f.properties.id));
  const stations = data.stations.features.filter((f) => f.properties.served && (f.properties.end || groups.has(f.properties.id)));
  const views = stations.flatMap((f) => ZOOMS.map((zoom) => ({ zoom, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.label })));
  await mapPage.goto(views[0], { settle: 800 });
  const model = await openModel({ ...(ROOT ? { root: ROOT } : {}), theme: mapPage.theme, data, meta });
  const fill = hexToRgb(model.palette?.station?.fill ?? (mapPage.theme === 'dark' ? '#0f1317' : '#ffffff'));
  return { model, views, fill, data };
}

// The screen as pixels, with the way from frame px to picture px.
async function shot(mapPage, v) {
  await mapPage.jump(v);
  await mapPage.page.waitForTimeout(400);
  await mapPage.jump(v);
  await mapPage.page.waitForTimeout(700);
  const view = await mapPage.page.evaluate(() => {
    const m = window.__map;
    const c = m.getCenter();
    const s = m.getCanvas().getBoundingClientRect();
    return { zoom: m.getZoom(), lon: c.lng, lat: c.lat, left: s.left, top: s.top, width: s.width, height: s.height, ratio: window.devicePixelRatio };
  });
  const picture = await pixels(await mapPage.page.screenshot());
  const at = ([x, y]) => picture.at([(view.left + x) * view.ratio, (view.top + y) * view.ratio]);
  return { view, at };
}

const onScreen = (p, view) => p[0] >= 8 && p[1] >= 8 && p[0] <= view.width - 8 && p[1] <= view.height - 8;

test('a mark the model draws is on the screen, and one it fades out is not', async ({ mapPage }) => {
  test.setTimeout(1_200_000);
  const { model, views, fill } = await setup(mapPage);
  const wrong = [];
  let solid = 0, faded = 0;
  for (const v of views) {
    const { view, at } = await shot(mapPage, v);
    if (view.zoom < 11) continue; // ticks, dots and the hub's ring: other pictures
    const frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });
    for (const mark of stationMarks(frame, { minOpacity: 0 })) {
      const middles = lineMiddles(mark).filter((p) => onScreen(p, view));
      if (!middles.length || middles.length < lineMiddles(mark).length) continue;
      const filled = middles.filter((p) => near(at(p), fill)).length;
      const where = `${v.name} z${view.zoom.toFixed(2)} ${mark.layer} (${mark.properties?.lines ?? ''}) at ${view.lat.toFixed(5)},${view.lon.toFixed(5)}`;
      if (mark.opacity >= 0.9) {
        solid += 1;
        if (filled < Math.ceil(middles.length * 0.6)) wrong.push(`${where}: the model draws it, the page shows its fill on ${filled} of ${middles.length} lines`);
      } else if (mark.opacity <= 0.1) {
        faded += 1;
        if (filled > Math.floor(middles.length * 0.4)) wrong.push(`${where}: the model fades it out (${mark.opacity.toFixed(2)}), the page shows its fill on ${filled} of ${middles.length} lines`);
      }
    }
  }
  console.log(`${views.length} views, ${solid} marks the model draws solid, ${faded} it fades out, ${wrong.length} the page disagrees on`);
  for (const w of wrong) console.log(`  ${w}`);
  // A run that looked at almost nothing is a broken run, not a pass.
  expect(solid).toBeGreaterThan(views.length / 2);
  expect(wrong, 'the model and the page disagree on whether a mark is drawn').toEqual([]);
});

// The test above has to fail when the model is wrong: a mark the model
// invents, put on a line a mark's length away from a real one, must be found
// missing from the page.
test('a mark the page does not draw is noticed', async ({ mapPage }) => {
  test.setTimeout(300_000);
  const { model, views, fill } = await setup(mapPage);
  const v = views.find((x) => x.zoom >= 13) ?? views[0];
  const { view, at } = await shot(mapPage, v);
  const frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });
  const real = stationMarks(frame, { minOpacity: 0.9 }).find((m) => lineMiddles(m).every((p) => onScreen(p, view)));
  expect(real, 'a drawn mark to copy').toBeTruthy();
  // The same mark, moved 40 px back along its line: nothing is drawn there.
  const { corners } = quadOf(real);
  const sides = [0, 1].map((i) => [corners[i + 1][0] - corners[i][0], corners[i + 1][1] - corners[i][1]]);
  const short = Math.hypot(...sides[0]) < Math.hypot(...sides[1]) ? sides[0] : sides[1];
  const d = Math.hypot(...short) || 1;
  const moved = (sign) => lineMiddles(real).map((p) => [p[0] + (sign * 40 * short[0]) / d, p[1] + (sign * 40 * short[1]) / d]);
  const counts = [1, -1].map((sign) => moved(sign).filter((p) => onScreen(p, view) && near(at(p), fill)).length);
  const here = lineMiddles(real).filter((p) => near(at(p), fill)).length;
  console.log(`${v.name} z${view.zoom.toFixed(2)}: fill on ${here} of ${lineMiddles(real).length} lines at the mark, ${counts.join(' and ')} forty px either way along the line`);
  expect(here).toBeGreaterThanOrEqual(Math.ceil(lineMiddles(real).length * 0.6));
  expect(Math.min(...counts)).toBeLessThan(Math.ceil(lineMiddles(real).length * 0.6));
});
