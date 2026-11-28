import { toWorld } from '../drawn/mercator.mjs';
import { planAt, planEvents, validatePlan } from './plan.mjs';
import { continuityFindings, MAX_ZOOM, measureGap, MIN_ZOOM, overlapFindings, sampleZooms, spacingFinding, terminalFinding } from './rules.mjs';

function captureViews(events, results, center, min, max) {
  const cameras = new Map();
  function add(zoom, at, reason) {
    if (zoom < min || zoom > max) return;
    const key = JSON.stringify([zoom, at]);
    if (!cameras.has(key)) cameras.set(key, { zoom, at, reasons: [] });
    const reasons = cameras.get(key).reasons;
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  // One camera per event and zoom. Prefer the most squeezed pack or the
  // location of a fault at the boundary, then the producer's suggested view.
  const byZoom = new Map();
  for (const event of events) {
    const key = `${event.kind}/${event.zoom}`;
    if (!byZoom.has(key) || (!byZoom.get(key).at && event.at)) byZoom.set(key, event);
  }
  for (const { kind, zoom, at } of byZoom.values()) {
    const z = Number(zoom.toFixed(6));
    const steps = kind === 'handover' ? [z - 0.01, z, z + 0.01].map((v) => Number(v.toFixed(6))) : [z];
    const nearby = results.filter((row) => steps.includes(row.zoom));
    const ranks = new Map([['label-overlap', 2], ['label-on-stroke', 2], ['label-disappeared', 3], ['label-moved', 4], ['rail-end', 4], ['rail-spacing', 5]]);
    const fault = nearby.flatMap((row) => row.findings).sort((a, b) => ranks.get(b.kind) - ranks.get(a.kind))[0];
    const tightest = nearby.map((row) => row.tightest).filter(Boolean).sort((a, b) => a.gap - b.gap)[0];
    const location = fault?.at ?? at ?? tightest?.at ?? center;
    for (const step of steps) add(step, location, `${kind} z${z}`);
  }
  add(min, center, 'wide end of range');
  add(max, center, 'close end of range');
  return [...cameras.values()].sort((a, b) => a.zoom - b.zoom);
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isPath = (p) => Array.isArray(p) && p.length >= 2 && p.every(isPoint);

export async function runZoomChecks(build, { partial = false } = {}) {
  const { commit, minZoom, maxZoom, plan, center, events, frameAt } = build;
  if (!/^[a-f\d]{7,40}$/i.test(commit) || !Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || minZoom >= maxZoom
    || !isPoint(center) || !Array.isArray(events) || typeof frameAt !== 'function') throw new Error('Invalid zoom QA build metadata');
  if (!partial && (minZoom !== MIN_ZOOM || maxZoom !== MAX_ZOOM)) {
    throw new Error(`Expected zooms ${MIN_ZOOM} to ${MAX_ZOOM}; build ${commit} covers ${minZoom} to ${maxZoom}`);
  }
  validatePlan(plan);
  const schedule = [...events, ...planEvents(plan)];
  if (schedule.some(({ kind, zoom }) => !['arrival', 'handover'].includes(kind) || !Number.isFinite(zoom))) {
    throw new Error('Invalid zoom QA event');
  }
  const zooms = sampleZooms(schedule, minZoom, maxZoom);
  const results = [];
  let previous = [];
  for (const zoom of zooms) {
    const { strokes, packs, ends, handovers = [] } = await frameAt(zoom);
    const labels = planAt(plan, zoom);
    const bars = strokes.filter((s) => s.kind === 'bar');
    if (!labels.length || !bars.length || !strokes.some((s) => s.kind === 'rail') || !packs.length || !ends.length
      || strokes.some((s) => !s.id || !isPath(s.path) || !(s.width > 0 && Number.isFinite(s.width)))
      || ends.some((e) => !e.id || !e.bar || !isPoint(e.at))) throw new Error(`Missing or invalid drawing evidence at z${zoom}`);
    const findings = [
      ...overlapFindings(labels, strokes, zoom),
      ...continuityFindings(previous, labels, zoom, handovers),
      ...ends.map((end) => terminalFinding(end, bars, zoom)).filter(Boolean),
    ];
    let tightest;
    for (const { ids, paths, widths, minimum } of packs) {
      if (ids?.length !== 2 || !paths || paths.length !== 2 || paths.some((p) => !isPath(p))
        || widths?.length !== 2 || !widths.every((w) => Number.isFinite(w) && w > 0)
        || !Number.isFinite(minimum) || minimum < 0) throw new Error(`Invalid rail pack at z${zoom}`);
      const projected = paths.map((line) => [line.map((at) => toWorld(at, zoom))]);
      const gap = measureGap(...projected, (widths[0] + widths[1]) / 2);
      const finding = spacingFinding(gap, minimum, zoom, ids, paths[0][0]);
      if (finding) findings.push(finding);
      if (!tightest || gap.gap < tightest.gap) tightest = { gap: gap.gap, at: paths[0][0] };
    }
    const routeLists = labels.filter((label) => label.kind === 'route-list').length;
    results.push({ zoom, counts: { labels: labels.length, routeLists, strokes: strokes.length, packs: packs.length, ends: ends.length }, tightest, findings });
    previous = labels;
  }
  if (!results.some((row) => row.counts.routeLists)) throw new Error('Build supplied no route lists at any zoom');
  return { commit, minZoom, maxZoom, partial, zooms, results, cameras: captureViews(schedule, results, center, minZoom, maxZoom) };
}
