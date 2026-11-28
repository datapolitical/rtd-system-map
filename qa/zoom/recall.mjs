import { readFileSync } from 'node:fs';
import { toWorld } from '../drawn/mercator.mjs';
import { continuityFindings, measureGap, railOrderFindings, spacingFinding } from './rules.mjs';

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));

export function zoomRecall(finds, catches) {
  const spacing = read('../recall/prototype-spacing.json');
  const origin = toWorld(spacing.origin, spacing.zoom);
  const order = read('../recall/prototype-layer-order.json');
  const anchors = read('../../test/fixtures/zoom-anchor-observations.json');
  const [before, after] = anchors.captures.map(({ actual }) => actual);
  const quarter = read('../recall/prototype-name-quarter-step.json');
  const [wider, closer] = quarter.frames;
  const names = ({ names }) => names.map(({ id, anchor }) => ({ id, anchorSide: anchor }));
  const controls = [
    {
      id: '154-prototype-tapered-pack',
      build: spacing.build,
      zooms: [spacing.zoom],
      findings: spacing.pairs.map((pair) => {
        const [a, b] = pair.map((id) => spacing.paths[id]);
        const gap = measureGap(a, b, spacing.width, spacing.bounds);
        return spacingFinding(gap, spacing.pitch - spacing.width - 0.25, spacing.zoom, pair, spacing.origin, origin);
      }).filter(Boolean),
    },
    {
      id: '154-prototype-bus-over-rail',
      build: order.build,
      zooms: [14],
      findings: railOrderFindings(order),
    },
    {
      id: '159-prototype-quarter-zoom-name-moved',
      build: quarter.build,
      zooms: [wider.zoom, closer.zoom],
      findings: continuityFindings(wider.labels, closer.labels, closer.zoom),
    },
    {
      id: '159-prototype-station-name-moved',
      build: anchors.sourceCommit,
      zooms: [before.zoom, after.zoom],
      findings: continuityFindings(names(before), names(after), after.zoom).map((f) => ({ ...f, at: after.center })),
    },
  ];
  return controls.map(({ id, build, zooms, findings }) => {
    const pin = finds.find((f) => f.id === id);
    if (!pin?.seen_on.some((commit) => build.startsWith(commit))) throw new Error(`Missing zoom recall pin for ${id} on ${build}`);
    // A style-order fault applies throughout its view, so use its pin as the location.
    const hits = catches(pin, findings.map((f) => {
      const [lon, lat] = f.at ?? pin.points[0];
      return { ...f, lon, lat };
    }), { refZoom: pin.zoom });
    return { id, build, zooms, caught: hits.length > 0, findings: hits };
  });
}
