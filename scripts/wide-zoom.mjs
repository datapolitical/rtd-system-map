// The wide zooms (#236): build the reference rail drawings for 8.75 to 12
// from the built data on disk, and report the numbers the issue asks for:
// drawing size before and after thinning, how far a drawing drifts from a
// fresh one across its band, the rail-to-station-bar gaps at the reference
// zooms, and the whole-district framing arithmetic behind #211. Nothing here
// runs in npm run build.
//
//   node scripts/wide-zoom.mjs [--out DIR]
//
// It reads public/data (built by `npm run build:data`) and writes a report;
// it never downloads or writes into public/data.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  WIDE_MIN, WIDE_MAX, WIDE_HANDOVER, referenceAt, buildReference, referenceSummary,
  sharedPairs, terminalGaps, referenceDrift, frameFit, pitchAt, renderedPaths,
} from './lib/widezoom.mjs';
import { nearest } from './lib/sheets.mjs';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const data = {
  routes: await readJson('routes.geojson'),
  stations: await readJson('stations.geojson'),
};
const sheets = await readJson('sheets.json');

const refs = [...new Set([referenceAt(WIDE_MIN), referenceAt(WIDE_HANDOVER)])];
const references = new Map(refs.map((ref) => [ref, buildReference(data, ref)]));
const pairs = new Map(refs.map((ref) => [ref, sharedPairs(references.get(ref))]));

// Spacing at the reference zoom: adjacent lines that share track, drawn by the
// reference's own slots, should sit a whole number of pitches apart.
const spacingAtRef = refs.map((ref) => {
  const paths = renderedPaths(references.get(ref), ref);
  const get = (route, run) => paths.get(route)?.find((p) => p.run === run)?.path;
  const distances = [];
  for (const pair of pairs.get(ref)) {
    const [pa, pb] = [get(pair.a, pair.runA), get(pair.b, pair.runB)];
    if (!pa || !pb) continue;
    const mid = Math.floor((pair.from + pair.to) / 2);
    if (pa[mid]) distances.push(nearest(pb, pa[mid]).d);
  }
  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)];
  return { ref, pitch: pitchAt(ref), pairs: distances.length, median, min: distances[0], max: distances.at(-1) };
});

// Drift from a fresh drawing, at the band's ends, the handover, and mid-band.
const driftZooms = [8.75, 9, 9.5, 9.99, 10, 10.5, 11, 11.5, 12];
const drift = driftZooms.map((zoom) => referenceDrift(data, references.get(referenceAt(zoom)), zoom));

const terminals = refs.map((ref) => {
  const checks = terminalGaps(references.get(ref));
  const ds = checks.map((c) => c.distance).sort((a, b) => a - b);
  return { ref, ends: checks.length, median: ds[Math.floor(ds.length / 2)], max: ds.at(-1), over1: checks.filter((c) => c.distance > 1).length };
});

const summaries = [];
for (const ref of refs) summaries.push(await referenceSummary(references.get(ref)));

// #211: the whole district's frame on an iPhone 17 Pro, as the page frames it
// (44 px clear at the sides, DESIGN.md "Five sheets") and as qa/wholecheck.mjs
// expects it (MapLibre's own fit, 32 px).
const frame = sheets.frame;
const iphone = { width: 402, height: 874 };
const framing = {
  frame,
  page: frameFit(frame, { ...iphone, side: 44, pad: 32 }),
  check: frameFit(frame, { ...iphone, side: 32, pad: 32 }),
  landscape: {
    page: Math.max(WIDE_MIN - 0.25, frameFit(frame, { width: 874, height: 402, side: 44, pad: 32 })),
    check: frameFit(frame, { width: 874, height: 402, side: 32, pad: 32 }),
  },
};

const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'qa/.scratch/wide-zoom/report.json');
await mkdir(path.dirname(out), { recursive: true });
const report = {
  band: [WIDE_MIN, WIDE_MAX], handover: WIDE_HANDOVER, refs,
  pairsPerRef: Object.fromEntries([...pairs].map(([ref, p]) => [ref, p.length])),
  pitch: Object.fromEntries(driftZooms.map((z) => [z, pitchAt(z)])),
  summaries, spacingAtRef, drift, terminals, framing,
  scope: 'Build-side reference drawings and geometry measurements on the built data. No page, no browser. Spacing and terminal checks on the zoomable page, station-mark kinds and lettering are #157/#158/#234.',
};
await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log(`\nreport: ${out}`);
