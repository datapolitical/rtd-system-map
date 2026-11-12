// The second batch of rail, shared-track, station-mark, platform-group and
// station-shape detectors (qa/rules/design-invariants.md sections 1 to 5,
// qa/rules/literature.md sections 1 to 5). The rules are in two files:
//
//   rail2lines.mjs   rail lines and shared track (RL, ST, PL, JN, LE, LN)
//   rail2marks.mjs   station marks, platform groups, walks, shapes (SM, PG, SS)
//
// and this one runs them together the way ends.mjs, packs.mjs and shapes.mjs
// are run: one call per zoom of the drawn model, findings of the same shape
// ({ kind, layer, route, px, msg }).
//
// Some kinds are proposals from the literature that the numbers say are not
// right for this map, or leads a person must judge. `LEAD_KINDS` names them;
// they come back only with `leads: true` (the way shapes.mjs holds back
// `platform-covered`), and each one's reason is in the commit and the report.

import { LINE_KINDS, RAIL2, lineFaults2 } from './rail2lines.mjs';
import { MARKS2, MARK_KINDS, SIZES, markFaults2, structureStyle } from './rail2marks.mjs';

export { LINE_KINDS, MARK_KINDS, RAIL2, MARKS2, SIZES, lineFaults2, markFaults2, structureStyle };

export const RAIL2_KINDS = [...LINE_KINDS, ...MARK_KINDS];

// Leads: reported only when asked for.
export const LEAD_KINDS = new Set([
  'bundle-off-centre', 'narrow-branch', 'gaps-unequal', 'dot-for-pack', 'marks-crowded', 'end-inside', 'bead', 'hidden-separation',
  'near-touch', 'crossing', 'mark-far-from-stop', 'bent-through-station',
]);

/**
 * Every detector of this batch at one zoom.
 * @param {{z:number, lines:Array, marks:Array, labels?:Array}} zoom model.zoom(z)
 * @param {{data?:object, style?:object, leads?:boolean, kinds?:string[], limits?:object, sizes?:object}} opts
 *   `data`: model.data (stops, stations, structures); `style`: model.style
 *   (the station shapes' layers); `leads`: also the lead kinds.
 * @returns {Array<{kind, layer, route, px, msg}>}
 */
export function rail2Faults(zoom, opts = {}) {
  const kinds = opts.kinds ?? RAIL2_KINDS;
  const faults = [
    ...lineFaults2(zoom, { ...opts, kinds: kinds.filter((k) => LINE_KINDS.includes(k)), limits: opts.limits?.lines }),
    ...markFaults2(zoom, { ...opts, kinds: kinds.filter((k) => MARK_KINDS.includes(k)), limits: opts.limits?.marks }),
  ];
  return opts.leads ? faults : faults.filter((f) => !LEAD_KINDS.has(f.kind));
}
