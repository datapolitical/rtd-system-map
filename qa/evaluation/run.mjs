// npm run check:evidence -- --url http://127.0.0.1:8788 --profile sheets
// --seed picks the sampled stations; --count how many (default 3); --sample-zooms
// the zooms they are captured at (default 14 for sheets, 13.37 for the trial).
// --profile smooth-zoom requires --source-root <trial checkout> and its /zoom/ server.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { auditSheet, sampleStations } from './checks.mjs';
import { stubAnalytics } from '../lib/analytics.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const profile = arg('profile', 'sheets');
if (!['sheets', 'smooth-zoom'].includes(profile)) throw new Error('Choose --profile sheets or smooth-zoom. Classic is historical recall only.');
const root = path.resolve(arg('source-root', '.'));
const base = new URL(arg('url', 'http://127.0.0.1:8788'));
const out = path.resolve(arg('out', `qa/.scratch/evaluation/${profile}`));
const seed = Number(arg('seed', '21'));
const count = Number(arg('count', '3'));
const sampleZooms = arg('sample-zooms', null)?.split(',').map(Number);
const trial = profile === 'smooth-zoom';
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const report = {
  generated: new Date().toISOString(), profile, base: base.href, sourceCommit: git('rev-parse', 'HEAD'),
  evaluatorSha256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
  sourceDirty: Boolean(git('status', '--porcelain', '--untracked-files=no')), seed,
  count, sampleZooms, viewport: { width: 390, height: 844 }, renderer: 'Chromium software GL; deviceScaleFactor 1',
  files: {}, audits: [], captures: [], errors: [],
  acceptance: 'INCOMPLETE: automated checks and captures are evidence, not a complete rubric pass.',
  unmeasured: ['independent GTFS truth', 'blind rider task success and completion time', 'physical-phone performance and assistive technology',
    'complete rendered contrast and label association', 'visual judgment of all rubric rows', 'all locations and motion frames'],
};
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  // Validate the server against the selected source checkout and fingerprint exact
  // input bytes. A source SHA alone does not identify uncommitted generated data.
  const publicRoot = path.join(root, 'public');
  const readPublic = async (relative) => {
    const response = await context.request.get(new URL(relative, base).href);
    if (!response.ok()) throw new Error(`${relative}: HTTP ${response.status()}`);
    const bytes = await response.body();
    const expected = await fs.readFile(path.join(publicRoot, relative));
    if (hash(bytes) !== hash(expected)) throw new Error(`${relative}: server bytes differ from --source-root`);
    report.files[relative] = { sha256: hash(bytes), bytes: bytes.length };
    return bytes;
  };
  const load = async (name) => JSON.parse(await readPublic(`data/${name}`));
  const stations = (await load('stations.geojson')).features;
  const routes = (await load('routes.geojson')).features;
  report.dataBuilt = (await load('meta.json')).built;
  await load('sheets.json');
  const moduleDir = trial ? 'js/zoom' : 'js/sheets';
  for (const file of (await fs.readdir(path.join(publicRoot, moduleDir))).filter((name) => name.endsWith('.js')).sort()) {
    await readPublic(`${moduleDir}/${file}`);
  }
  await readPublic('js/color.js');
  await readPublic('js/often.js');
  if (trial) {
    await load('zoom-prototype/report.json');
    await load('zoom-prototype/trial.json');
  }
  else {
    // The built scale table is explicit evidence, independent of the drawing helper.
    for (const [id, zoom] of [[0, 8.75], [1, 10], [2, 12], [3, 14], [4, 16]]) {
      const sheet = await load(`sheet-${id}.geojson`);
      report.audits.push({ sheet: id, zoom, ...auditSheet({ features: sheet.features, stations, routes, zoom, allStations: id >= 2 }) });
    }
  }
  const served = stations.filter((f) => f.properties.served);
  const hub = served.find((f) => f.properties.hub);
  const shared = served.filter((f) => !f.properties.hub).sort((a, b) => String(b.properties.lines).split(' ').length - String(a.properties.lines).split(' ').length)[0];
  const terminal = served.find((f) => f.properties.end && !f.properties.hub);
  if (!hub || !shared || !terminal) throw new Error('Missing data-derived hub/shared/terminal coverage.');
  const views = [
    ...(trial ? [12, 12.99, 13.01, 14] : [8.75, 10, 12, 14, 16]).map((zoom) => ({ name: 'hub', station: hub, zoom })),
    { name: 'shared', station: shared, zoom: 14 }, { name: 'terminal', station: terminal, zoom: 14 },
    ...sampleStations(stations, { seed, count }).flatMap((station, i) => (sampleZooms ?? [trial ? 13.37 : 14])
      .map((zoom) => ({ name: `sample-${i}`, station, zoom }))),
  ];
  report.sample = views.map((v) => ({ view: v.name, id: v.station.properties.id, station: v.station.properties.label || v.station.properties.name, zoom: v.zoom }));
  for (const theme of ['light', 'dark']) {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: theme });
    await stubAnalytics(page);
    page.on('pageerror', (e) => report.errors.push({ theme, kind: 'page', message: e.message }));
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.errors.push({ theme, kind: 'request', url: request.url(), message: request.failure()?.errorText });
    });
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push({ theme, kind: 'http', url: response.url(), status: response.status() }); });
    await page.goto(new URL(`${trial ? 'zoom/' : ''}?theme=${theme}`, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((trial) => trial ? window.zoomReady : window.sheetsReady, trial, { timeout: 90_000 });
    for (const mode of trial ? ['offset', 'drawn'] : ['sheets']) {
      if (trial) await page.evaluate((mode) => window.zoomMode(mode), mode);
      for (const view of views) {
        const center = view.station.geometry.coordinates;
        // Use the sheet app's supported address mechanism; it decides its actual
        // settled camera. Record that camera rather than pretending a request held.
        await page.evaluate(({ trial, center, zoom }) => {
          if (trial) window.zoomMap.jumpTo({ center, zoom });
          else location.hash = `#${zoom}/${center[1]}/${center[0]}`;
        }, { trial, center, zoom: view.zoom });
        await page.waitForFunction(({ trial, zoom, center }) => {
          const map = trial ? window.zoomMap : window.sheetsMap;
          const actual = map.getCenter();
          const sameCenter = Math.abs(actual.lng - center[0]) < 1e-5 && Math.abs(actual.lat - center[1]) < 1e-5;
          const sameZoom = !trial && zoom === 8.75 ? map.getZoom() >= 8.75 && map.getZoom() < 9.375 : Math.abs(map.getZoom() - zoom) < 1e-5;
          return map.isStyleLoaded() && map.areTilesLoaded() && !map.isMoving()
            && sameCenter && sameZoom && (!trial || Math.abs(window.zoomState.zoom - zoom) < 1e-5);
        }, { trial, zoom: view.zoom, center }, { timeout: 90_000 });
        // Let the default 300 ms symbol fade finish. This is a capture setup
        // delay, never a responsiveness measurement.
        await page.waitForTimeout(350);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = `${theme}-${mode}-${view.name}-${view.zoom}.png`;
        await page.screenshot({ path: path.join(out, file) });
        const frame = await page.evaluate((trial) => {
          const map = trial ? window.zoomMap : window.sheetsMap;
          const active = map.getStyle().layers.filter((l) => l.type === 'symbol' && l.layout?.['text-field']);
          const names = map.queryRenderedFeatures({ layers: active.map((l) => l.id) })
            .map((f) => ({ layer: f.layer.id, id: f.properties.id, name: f.properties.name, text: f.properties.text, route: f.properties.route, anchor: f.properties.anchor }));
          return { zoom: map.getZoom(), center: map.getCenter().toArray(), bearing: map.getBearing(), pitch: map.getPitch(), names,
            trialState: trial ? window.zoomState : null, controls: [...document.querySelectorAll('button,[role=dialog]')].filter((el) => el.getClientRects().length).map((el) => {
              const r = el.getBoundingClientRect(); return { text: el.getAttribute('aria-label') || el.textContent, box: [r.x, r.y, r.width, r.height] };
            }) };
        }, trial);
        report.captures.push({ file, sha256: hash(await fs.readFile(path.join(out, file))), theme, mode, view: view.name,
          stationId: view.station.properties.id, requested: { center, zoom: view.zoom }, actual: frame });
        console.log(`${profile} ${file}: actual zoom ${frame.zoom}`);
      }
    }
    await page.close();
  }
  await context.close();
} catch (error) {
  report.errors.push({ kind: 'runner', message: error.stack });
} finally {
  await browser.close();
  report.findingCount = report.audits.reduce((n, r) => n + r.findings.length, 0);
  await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${path.join(out, 'report.json')}; ${report.captures.length} captures, ${report.findingCount} findings, ${report.errors.length} errors. Acceptance remains incomplete.`);
}
if (report.errors.length || report.findingCount) process.exitCode = 1;
