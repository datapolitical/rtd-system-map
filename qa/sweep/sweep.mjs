// The sweep: tiles the district at a phone's screen and runs the detectors
// (../lib/detect.mjs: continuity, marks, labels, letters, contrast) on every
// tile that holds part of the network, then writes a report ranked by
// severity (broken line > overlapping marks > missing letter > label under
// a card > contrast) with a circled capture per finding.
//
//   npm run sweep                    both themes, zooms 10.5, 12 and 14
//   npm run sweep -- --quick         a sample: every 8th tile, light only unless --theme
//   npm run sweep -- --zoom 12 --theme dark
//   npm run sweep -- --estimate      count the tiles and stop
//   CHECK_URL=https://... npm run sweep
//
// Tiles come from meta.json's bounds and keep only those that hold rail,
// the strongest bus tier (below 14) or a station in the open part of the
// screen, read from the site's own data. One headless
// Chromium (software GL, as qa/playwright.config.mjs), one page at a time;
// the context is recycled every 30 tiles, and the run stops, closing the
// browser, if the Mac's free memory falls under 25% (memory_pressure).
// Output: qa/sweep/out/report.html, findings.json and captures/ (ignored).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { annotate, crop, detect, jump, measure, SEVERITY_NAME } from '../lib/detect.mjs';
import { BASE, launch, open } from '../lib/page.mjs';
import { alongPoints, tiles } from '../lib/views.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null; };
const QUICK = flag('quick');
const ZOOMS = opt('zoom') ? opt('zoom').split(',').map(Number) : [10.5, 12, 14];
const THEMES = opt('theme') ? opt('theme').split(',') : QUICK ? ['light'] : ['light', 'dark'];
const EVERY = QUICK ? Number(opt('every') || 8) : 1;
const RECYCLE = 30;
const MIN_FREE = 25;
const WHICH = ['continuity', 'marks', 'labels', 'letters', 'contrast'];

const freeMemory = () => {
  try { return Number(execFileSync('memory_pressure', { encoding: 'utf8' }).match(/free percentage: (\d+)%/)[1]); } catch { return 100; }
};
const get = async (name) => {
  const r = await fetch(`${BASE}/data/${name}`).catch(() => null);
  if (!r || !r.ok) throw new Error(`no server at ${BASE} (data/${name}: ${r ? r.status : 'unreachable'}); start it with npm run dev`);
  return r.json();
};

async function main() {
  const [routes, stations, meta] = [await get('routes.geojson'), await get('stations.geojson'), await get('meta.json')];
  // The strongest bus tier, as meta.json lists the tiers (strongest first).
  const strong = meta.tiers ? Object.keys(meta.tiers)[0] : null;
  const stationPts = stations.features.map((f) => f.geometry.coordinates);
  const rail = alongPoints(routes.features.filter((f) => f.properties.mode === 'rail'));
  const bus = alongPoints(routes.features.filter((f) => f.properties.mode === 'bus' && f.properties.tier === strong));
  // Below 14, tiles with rail, the strongest bus tier or a station; at 14,
  // where a frequent bus line alone would add half again as many tiles and
  // the run past 45 minutes, rail or a station only (the strongest bus tier
  // is still judged wherever it shares a tile with them).
  const pointsAt = (zoom) => (zoom >= 14 ? [...rail, ...stationPts] : [...rail, ...bus, ...stationPts]);
  const bounds = meta.bounds.routes ?? meta.bounds.network;

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'captures'), { recursive: true });
  const browser = await launch();
  const t0 = Date.now();
  const findings = [], log = [], seen = { tiles: 0 };
  let peakLow = 100, stopped = null;
  try {
    // The open part of the screen, from the page's own uncovered().
    const [lon0, lat0] = stations.features[0].geometry.coordinates;
    let s = await open(browser, THEMES[0], { zoom: ZOOMS[0], lat: lat0, lon: lon0 });
    const { area, screen } = await s.page.evaluate(() => ({ area: window.__qa.area(), screen: { w: innerWidth, h: innerHeight } }));
    await s.context.close();
    const plan = [];
    for (const theme of THEMES) for (const zoom of ZOOMS) {
      const t = tiles({ bounds, zoom, screen, area, points: pointsAt(zoom) }).tiles.filter((_, i) => i % EVERY === 0);
      for (const v of t) plan.push({ ...v, theme });
    }
    const per = THEMES.flatMap((th) => ZOOMS.map((z) => `${th} ${z}: ${plan.filter((p) => p.theme === th && p.zoom === z).length}`));
    console.log(`${plan.length} tiles (${per.join(', ')}); open area ${JSON.stringify(area)} of ${screen.w}x${screen.h}`);
    if (flag('estimate')) return;

    let n = 0;
    s = null;
    for (const v of plan) {
      if (!s || s.theme !== v.theme || n % RECYCLE === 0) {
        const free = freeMemory();
        peakLow = Math.min(peakLow, free);
        if (free < MIN_FREE) { stopped = `free memory ${free}% < ${MIN_FREE}% after ${seen.tiles} tiles`; break; }
        if (s) await s.context.close();
        s = { ...(await open(browser, v.theme, v)), theme: v.theme };
      }
      n++;
      const t1 = Date.now();
      try {
        await jump(s.page, v);
        const raw = await measure(s.page, { bus: v.zoom >= 14, lines: true });
        const fs_ = detect(raw, WHICH);
        seen.tiles++;
        const tag = `${v.theme}-z${v.zoom}-r${v.row}c${v.col}`;
        if (fs_.length) {
          const useBare = fs_.every((f) => f.detector === 'continuity');
          const file = `captures/${tag}.png`;
          fs.writeFileSync(path.join(OUT, file), await annotate(useBare ? raw.bare : raw.capture, fs_, raw.view.dpr, { scale: 0.5 }));
          for (const [k, f] of fs_.entries()) {
            const cf = `captures/${tag}-${k + 1}.jpg`;
            fs.writeFileSync(path.join(OUT, cf), await crop(f.detector === 'continuity' ? raw.bare : raw.capture, f, raw.view.dpr));
            findings.push({ ...f, tile: tag, capture: file, crop: cf, center: { zoom: v.zoom, lat: +v.lat.toFixed(5), lon: +v.lon.toFixed(5) } });
          }
        }
        log.push({ tag, ms: Date.now() - t1, findings: fs_.length });
        if (seen.tiles % 10 === 0) console.log(`${seen.tiles}/${plan.length} tiles, ${findings.length} findings, ${((Date.now() - t0) / 60000).toFixed(1)} min, free ${freeMemory()}%`);
      } catch (e) {
        log.push({ tag: `${v.theme}-z${v.zoom}-r${v.row}c${v.col}`, error: String(e).slice(0, 300) });
        console.log(`tile ${v.theme} ${v.zoom} r${v.row}c${v.col}: ${String(e).slice(0, 200)}`);
        if (/Target closed|has been closed|crash/i.test(String(e))) { try { await s.context.close(); } catch {} s = null; }
        try { await get('meta.json'); } catch (err) { stopped = String(err); break; }
      }
      if (s?.errors.length) { log.push({ pageErrors: s.errors.splice(0) }); }
    }
    if (s) await s.context.close();
  } finally {
    await browser.close();
  }
  const minutes = (Date.now() - t0) / 60000;
  // A finding about the whole style (the bus tiers' order) is the same on
  // every tile: keep the first per theme and zoom.
  const whole = new Set();
  for (let i = findings.length - 1; i >= 0; i--) if (findings[i].whole) { const k = `${findings[i].theme}|${findings[i].zoom}|${findings[i].msg}`; if (whole.has(k)) findings.splice(i, 1); else whole.add(k); }
  findings.sort((a, b) => a.severity - b.severity || a.zoom - b.zoom || a.lat - b.lat);
  const run = { base: BASE, zooms: ZOOMS, themes: THEMES, quick: QUICK, tiles: seen.tiles, minutes: +minutes.toFixed(1), lowestFreeMemory: peakLow, stopped, at: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify({ run, findings, log }, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.html'), report(run, findings));
  console.log(`${seen.tiles} tiles in ${minutes.toFixed(1)} min, ${findings.length} findings${stopped ? `; STOPPED: ${stopped}` : ''}`);
  const by = {};
  for (const f of findings) by[SEVERITY_NAME[f.severity]] = (by[SEVERITY_NAME[f.severity]] || 0) + 1;
  console.log(JSON.stringify(by));
  console.log(`report: ${path.relative(process.cwd(), path.join(OUT, 'report.html'))}`);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function report(run, findings) {
  const groups = new Map();
  for (const f of findings) { const k = SEVERITY_NAME[f.severity]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const link = (f) => `${run.base}/#${f.zoom}/${f.lat}/${f.lon}`;
  const rows = [...groups].map(([name, fs]) => `
    <h2>${esc(name)} <small>${fs.length}</small></h2>
    <div class="grid">${fs.map((f, i) => `
      <figure>
        <a href="${esc(f.capture)}"><img loading="lazy" src="${esc(f.crop)}" alt=""></a>
        <figcaption><b>${i + 1}. ${esc(f.kind)}</b> <span class="t">${esc(f.theme)} z${f.zoom}</span><br>
        <a href="${esc(link(f))}">${f.lat}, ${f.lon}</a><br>${esc(f.msg)}<br><a class="t" href="${esc(f.capture)}">whole screen (${esc(f.tile)})</a></figcaption>
      </figure>`).join('')}
    </div>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Map sweep</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mute:#666;--card:#f4f4f4}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mute:#999;--card:#222}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px}
h2 small,.t{color:var(--mute);font-weight:normal}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
figure{margin:0;background:var(--card);border-radius:8px;padding:8px}
img{width:100%;border-radius:4px;display:block}
a{color:inherit}
</style>
<h1>Map sweep</h1>
<p>${esc(run.base)}, ${run.themes.join(' and ')} at ${run.zooms.join(', ')}${run.quick ? ' (quick sample)' : ''}: ${run.tiles} tiles in ${run.minutes} min, ${findings.length} findings, ranked by severity. Lowest free memory ${run.lowestFreeMemory}%.${run.stopped ? ` <b>Stopped early: ${esc(run.stopped)}.</b>` : ''} ${esc(run.at)}</p>
<p>Each card is a crop around one finding (circled); the link under it opens the whole screen with every finding there numbered, and the coordinates open the map at that place.</p>
${rows || '<p>No findings.</p>'}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
