// One command, one report (issue #45): run every fault check the drawn model
// has over the whole district and write findings.json plus a readable
// report.html. Node only — no browser, no screenshots, no vision.
//
//   node qa/checks/report.mjs                     # reads public/data
//   CHECK_URL=https://... node qa/checks/report.mjs  # reads the site's data
//
// Every finding carries the place on the ground and a link that opens the map
// there at the zoom the fault was found at.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_SOURCES, openModel } from '../drawn/model.mjs';
import { lineFaults } from '../drawn/lines.mjs';
import { labelFaults } from '../drawn/labels.mjs';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
import { markFaults } from '../drawn/marks.mjs';
import { streetFaults } from '../drawn/streets.mjs';
import { seededViews } from '../lib/views.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const THEMES = arg('theme', 'dark,light').split(',');
const ZOOMS = arg('zooms', '12,14,16,17').split(',').map(Number);
const VIEWS = Number(arg('views', '10'));
const OUT = arg('out', path.join('qa', 'findings'));
const SITE = arg('url', process.env.CHECK_URL ?? 'https://drawn-map.rtd-system-map.pages.dev').replace(/\/$/, '');
const BASE = (process.env.CHECK_URL ?? '').replace(/\/$/, '');

const readData = async (name) => {
  if (BASE) return (await fetch(`${BASE}/data/${name}`)).json();
  return JSON.parse(fs.readFileSync(path.join('public', 'data', name), 'utf8'));
};

const data = Object.fromEntries(await Promise.all(DATA_SOURCES.map(async (n) => [n, await readData(`${n}.geojson`)])));
const meta = await readData('meta.json');

const line = (fault, zoom) => {
  const [lon, lat] = toLonLat(fault.px, zoom);
  return {
    check: 'lines',
    kind: fault.kind,
    layer: fault.layer,
    route: fault.route ?? null,
    zoom,
    lat,
    lon,
    msg: fault.msg,
    link: `${SITE}/#${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`,
  };
};

const SEVERITY = { gap: 1, 'off-street': 2, 'stray-stop': 3, duplicate: 4, 'over-line': 5, step: 6, hidden: 7, far: 8, translucent: 9 };
const atPlace = (px, view, width = 390, height = 664) => {
  const centre = toWorld([view.lon, view.lat], view.zoom);
  const [lon, lat] = toLonLat([centre[0] + px[0] - width / 2, centre[1] + px[1] - height / 2], view.zoom);
  return { lon, lat };
};
const framed = (fault, check, view) => ({
  check,
  kind: fault.kind,
  layer: fault.layer,
  route: fault.route ?? null,
  zoom: view.zoom,
  ...atPlace(fault.px, view),
  msg: fault.msg,
  link: `${SITE}/#${view.zoom}/${view.lat.toFixed(5)}/${view.lon.toFixed(5)}`,
});
const label = (fault, view) => ({
  check: 'labels',
  kind: fault.kind,
  layer: fault.layer,
  route: null,
  zoom: view.zoom,
  lat: view.lat,
  lon: view.lon,
  msg: fault.msg,
  link: `${SITE}/#${view.zoom}/${view.lat.toFixed(5)}/${view.lon.toFixed(5)}`,
});

const findings = [];
for (const theme of THEMES) {
  const model = await openModel({ theme, data, meta });
  const nameLayers = model.style.layers.filter((l) => l.type === 'symbol'
    && l.layout?.['text-field'] !== undefined
    && l.layout?.['icon-image'] === undefined
    && l.layout?.['symbol-placement'] !== 'line' && model.data[l.source]).map((l) => l.id);

  for (const zoom of ZOOMS) {
    for (const fault of lineFaults(model.zoom(zoom))) findings.push({ theme, ...line(fault, zoom) });
  }

  // Labels are placed per screen, so check them on screens: the busiest
  // interchanges (where names are densest) and a seeded walk over the network.
  const served = data.stations.features.filter((f) => f.properties?.served && f.properties.label);
  const busiest = served.sort((a, b) => (b.properties.links ?? 0) - (a.properties.links ?? 0)).slice(0, 12);
  const places = busiest.map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  for (const s of seededViews(data.routes, { count: VIEWS, zooms: [17], seed: 7 })) places.push({ lon: s.lon, lat: s.lat });
  const seen = new Set();
  for (const place of places) {
    for (const zoom of [17, 14]) {
      const key = `${zoom}/${place.lat.toFixed(4)}/${place.lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const frame = await model.frame({ zoom, center: [place.lon, place.lat], width: 390, height: 664, basemap: zoom === 17 });
      for (const fault of labelFaults(frame, { layers: nameLayers })) findings.push({ theme, ...label(fault, { ...place, zoom }) });
      if (zoom === 17) {
        for (const fault of markFaults(frame)) findings.push({ theme, ...framed(fault, 'marks', { ...place, zoom }) });
        for (const fault of streetFaults(frame)) findings.push({ theme, ...framed(fault, 'streets', { ...place, zoom }) });
      }
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of findings) f.severity = SEVERITY[f.kind] ?? 9;
findings.sort((a, b) => a.severity - b.severity || a.check.localeCompare(b.check) || a.theme.localeCompare(b.theme));
const payload = { generated: new Date().toISOString(), site: SITE, themes: THEMES, zooms: ZOOMS, total: findings.length, findings };
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(payload, null, 2));

const counts = {};
for (const f of findings) {
  const k = `${f.check}/${f.kind} (${f.theme})`;
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log(`${findings.length} findings over ${THEMES.length} theme(s), zooms ${ZOOMS.join(', ')}`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

const rows = findings.map((f) => `      <tr class="${f.check}">
        <td>${f.check}</td><td>${f.kind}</td><td>${f.theme}</td><td>z${f.zoom}</td>
        <td>${f.route ?? f.layer}</td><td>${f.msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
        <td><a href="${f.link}">open</a></td>
      </tr>`).join('\n');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Map findings</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.3rem; } p { color: #444; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f6f6f6; }
  tr.labels td { background: #fffbe8; }
  a { color: #0645ad; }
</style>
<h1>${findings.length} findings</h1>
<p>${new Date().toISOString()} · ${THEMES.join(', ')} · zooms ${ZOOMS.join(', ')} · <a href="${SITE}">${SITE}</a></p>
<table><thead><tr><th>check</th><th>kind</th><th>theme</th><th>zoom</th><th>route / layer</th><th>finding</th><th></th></tr></thead>
<tbody>
${rows}
</tbody></table>
</html>`;
fs.writeFileSync(path.join(OUT, 'report.html'), html);
console.log(`wrote ${OUT}/findings.json and ${OUT}/report.html`);
