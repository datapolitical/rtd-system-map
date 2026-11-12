// Write qa/recall/finds.json from the pins below (qa/recall/README.md).
//
//   node qa/recall/pins.mjs
//
// A find is a fault a person saw. Each is pinned to the ground from a capture
// of the build it was seen on (qa/recall/capture.mjs): the view the capture
// settled at and the picture points (CSS px) where the fault is. The ground
// points are worked out here, so a pin can be checked by opening the same
// view and looking at the same pixels.
//
// `caught_by` lists the finding kinds that count as catching the find; a kind
// no detector reports yet still belongs here, so the score says what is not
// covered instead of leaving it out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PHONE = { width: 402, height: 874 };
const PINNED = 'Claude, from a capture of the build (qa/recall/capture.mjs), 2026-11-10';
const CHRIS = 'Chris, on a phone, dark mode, the union-building preview, 2026-11-08 (issue #42)';

// The views the captures settled at (zoom/lat/lon), as capture.mjs printed them.
const VIEWS = {
  fifteenth: '17/39.74760/-104.99777',
  ninemile: '16/39.65900/-104.84460',
  ninemileWest: '16/39.65960/-104.84780',
  union: '16/39.75300/-105.00050',
  unionLightRail: '16/39.75560/-105.00240',
  // 2026-11-11, the stations build (e2bae25).
  union13: '13/39.75450/-105.00180',
  union15: '15/39.75450/-105.00180',
  lincoln: '16/39.54560/-104.86955',
  airport: '16/39.84700/-104.67396',
  alameda: '16/39.70868/-104.99316',
  broadway: '11/39.70050/-104.98950',
};

// Chris's review of the stations build on 2026-11-11: his words on the
// feedback page and one phone screenshot. These pins are given as ground
// points (`at`), read from the build's data and the pictures he commented on,
// not off a gridded capture; the picture pixels are worked out from them.
const REVIEW = {
  issue: 103,
  seen: 'e2bae25',
  latestBuild: '3e38acb',
  looked: '2026-11-11',
  found: 'Chris, on the review page and his phone, the stations build, 2026-11-11 (issue #103)',
  pinned: 'Claude, from the build\'s data and the pictures he commented on (ground points, not a gridded capture), 2026-11-11',
};

const PINS = [
  // 15th Street at Lawrence (the corner #42 places "by Comedy Works, between
  // Larimer and Arapahoe"; the tiles name the cross street Lawrence).
  { id: '42-15th-short', latest: 'gone',  place: '15th Street at Lawrence', view: 'fifteenth', px: [[178, 402], [186, 410]],
    said: 'the 15th Street line stops short of the corner with two stray dots', kind: 'gap', caught_by: ['gap', 'short', 'dangling'], confidence: 'clear', radius: 25 },
  { id: '42-15th-corner', latest: 'changed: the line now follows Lawrence almost to the corner',  place: '15th Street at Lawrence', view: 'fifteenth', px: [[222, 418]],
    said: 'the cross-street line leaves its street and cuts a block corner into 15th', kind: 'off-street', caught_by: ['off-street', 'kink'], confidence: 'clear', radius: 25 },
  { id: '42-15th-arrow', latest: 'still there, about 35 px further along the bend',  place: '15th Street at Lawrence', view: 'fifteenth', px: [[260, 376]],
    said: 'a hook-shaped arrow on a short piece', kind: 'arrow', caught_by: ['arrow', 'hook', 'short'], confidence: 'clear', radius: 20 },
  { id: '42-15th-stops', latest: 'not compared',  place: '15th Street at Lawrence', view: 'fifteenth', px: [[72, 279], [385, 209], [303, 73]],
    said: 'stop circles beside the lines', kind: 'stray-stop', caught_by: ['stray-stop', 'stop-off-line'], confidence: 'approximate: which circles were meant is a reading of the capture', radius: 20 },
  { id: '42-15th-strand-step', latest: 'gone',  place: '15th Street at Lawrence', view: 'fifteenth', px: [[382, 612]],
    said: 'the edge strand steps sideways further down 15th', kind: 'step', caught_by: ['step', 'strand-step'], confidence: 'clear', radius: 25 },

  // Nine Mile.
  { id: '42-ninemile-terminal', latest: 'changed: the outline is still there, the zigzag is gone',  place: 'Nine Mile', view: 'ninemile', px: [[85, 545]],
    said: 'the terminal is a small house-shaped outline with a zigzag in it, with the name on it', kind: 'terminal-shape', caught_by: ['terminal-shape', 'name-on-terminal', 'self-crossing'], confidence: 'clear', radius: 40 },
  { id: '42-ninemile-stops', latest: 'still there', also: '430ea4a',  place: 'Nine Mile', view: 'ninemile', px: [[15, 588], [30, 578], [42, 568], [57, 556]],
    said: 'a row of stops on no line', kind: 'stray-stop', caught_by: ['stray-stop', 'stop-off-line'], confidence: 'clear', radius: 15 },
  { id: '42-ninemile-stub', latest: 'still there: the dotted line still loops and stops short',  place: 'Nine Mile', view: 'ninemile', px: [[222, 488], [232, 492]],
    said: 'the bus line loops and ends in a dotted stub short of the stops', kind: 'dangling', caught_by: ['dangling', 'gap', 'short', 'hook', 'loop', 'slot'], confidence: 'clear', radius: 25 },
  { id: '42-ninemile-step', latest: 'changed: the step is now a break in the line at the same place',  place: 'Nine Mile', view: 'ninemileWest', px: [[201, 582]],
    said: 'a step in the line west of the terminal', kind: 'step', caught_by: ['step', 'strand-step'], confidence: 'approximate: a 2 to 3 px jog, from a second capture shifted west', radius: 20 },
  { id: '42-ninemile-marks', latest: 'still there', also: '430ea4a',  place: 'Nine Mile', view: 'ninemile', px: [[151, 606], [154, 613], [110, 638]],
    said: 'three marks for the rail station', kind: 'extra-mark', caught_by: ['duplicate', 'extra-mark'], confidence: 'clear', radius: 15 },

  // Union Station.
  { id: '42-union-hairline', latest: 'still there', also: '430ea4a',  place: 'Union Station', view: 'union', px: [[20, 262], [55, 320], [100, 390]],
    said: 'the hairline between the two platform marks crosses blocks and 17th Street', kind: 'platform-join', caught_by: ['platform-join'], confidence: 'clear', radius: 20 },
  { id: '42-union-name', latest: 'still there', also: '430ea4a',  place: 'Union Station', view: 'union', px: [[10, 398]],
    said: 'the name runs into the wide bus line', kind: 'over-line', caught_by: ['over-line'], confidence: 'clear', radius: 30 },
  { id: '42-union-concourse', latest: 'still there', also: '430ea4a',  place: 'Union Station', view: 'union', px: [[80, 240]],
    said: 'the concourse is a translucent grey slab with green smears', kind: 'translucent', caught_by: ['translucent', 'fill-over'], confidence: 'approximate: the slab spans about 200 by 180 px; the point is its middle', radius: 90 },
  { id: '42-union-rail-past', latest: 'still there: C, E and W run 41 to 53 px past their mark', also: '430ea4a', place: 'Union Station', view: 'unionLightRail', px: [[165, 397], [176, 405], [185, 410]],
    said: 'light-rail lines run past their platform mark', kind: 'overshoot', caught_by: ['overshoot'], confidence: 'repinned 2026-11-10: the light-rail lines at Union (C, E, W; A, B and G are commuter rail) end at the light-rail station, at the top-left edge of the view Chris looked at, and run about 80 px past their platform capsule; first pinned by mistake at the commuter-rail capsule', radius: 30 },
  { id: '42-union-dashed', latest: 'still there, and more dashed lines wander north-east of the rail',  place: 'Union Station', view: 'union', px: [[300, 300], [260, 335]],
    said: 'dashed part-time lines wander off their solid lines', kind: 'slot', caught_by: ['slot', 'off-street', 'dangling'], confidence: 'approximate: the dashed line that runs on alone past the hook; others beside their solid lines look right', radius: 30 },
  { id: '42-union-hook', latest: 'changed: the hook is now a junction of dashed hairlines',  place: 'Union Station', view: 'union', px: [[318, 285]],
    said: 'a bus line ends in a hook', kind: 'hook', caught_by: ['hook', 'short', 'dangling'], confidence: 'clear', radius: 20 },

  // The stations build, 2026-11-11 (issue #103). Seven things Chris found by
  // eye that no check had a rule for.
  { ...REVIEW, id: '103-union-end-unmarked', latest: 'gone: the light rail\'s mark is drawn from zoom 11', place: 'Union Station', view: 'union13', at: [[-105.00303, 39.75542]],
    said: 'The Light rail lacks a terminal marker.', kind: 'end-unmarked', caught_by: ['end-unmarked', 'dangling', 'mark-short'], confidence: 'clear', radius: 12 },
  { ...REVIEW, id: '103-union-marks-parallel', latest: 'gone: both marks lie along the walk', place: 'Union Station', view: 'union15', at: [[-105.00303, 39.75542]],
    said: 'would it look better if the two station markers were parallel? the light rail is angled', kind: 'marks-not-parallel', caught_by: ['marks-not-parallel', 'mark-askew'], confidence: 'clear', radius: 15 },
  { ...REVIEW, id: '103-union-bus-on-rail', latest: 'still there', also: '3e38acb', place: 'Union Station', view: 'union15', at: [[-105.00326, 39.75481]],
    said: 'it overlaps the bus routes in a way that a hand drawn map wouldn\'t', kind: 'under-rail', caught_by: ['under-rail', 'stop-on-rail'], confidence: 'approximate: which bus line he meant is a reading of the picture', radius: 40 },
  { ...REVIEW, id: '103-lincoln-gap', latest: 'gone: the lines of a pack are on one path', place: 'Lincoln', view: 'lincoln', at: [[-104.86954, 39.54537], [-104.86958, 39.54640]],
    said: 'There\'s an unnecessary gap between the light rail lines', kind: 'uneven-gap', caught_by: ['uneven-gap', 'sliver'], confidence: 'clear', radius: 30 },
  { ...REVIEW, id: '103-lincoln-drift', latest: 'gone: E and R take their places under the mark', place: 'Lincoln', view: 'lincoln', at: [[-104.86940, 39.54420]],
    said: 'there\'s a small gap between the rail lines south of lincoln and they don\'t look straight.', kind: 'drift', caught_by: ['drift', 'steep-ease', 'step'], confidence: 'clear', radius: 40 },
  { ...REVIEW, id: '103-airport-skew', latest: 'gone: the line runs parallel to its platform', place: 'Denver Airport', view: 'airport', at: [[-104.67393, 39.84686]],
    said: 'It\'s also not parallel with the platform which is obviously wrong', kind: 'skew', caught_by: ['skew'], confidence: 'clear', radius: 40 },
  { ...REVIEW, id: '103-airport-past-roof', latest: 'gone: the line ends under the roof, 15 m short of the buffers', place: 'Denver Airport', view: 'airport', at: [[-104.67396, 39.84731]],
    said: 'the line goes too far and it should end under the canopy', kind: 'past-roof', caught_by: ['past-roof'], confidence: 'clear', radius: 20 },
  { ...REVIEW, id: '103-alameda-bus-on-rail', latest: 'still there', also: '3e38acb', place: 'Alameda', view: 'alameda', at: [[-104.99250, 39.70800], [-104.99200, 39.70778]],
    said: 'the buses aren\'t literally on top of the rail so that makes no sense.', kind: 'under-rail', caught_by: ['under-rail', 'stop-on-rail'], confidence: 'clear', radius: 40 },
  { ...REVIEW, id: '103-alameda-jerky', latest: 'gone: C and E take their places under the mark', place: 'Alameda', view: 'alameda', at: [[-104.99400, 39.70970]],
    said: 'the rail lines look jerky rather than clean and hand drawn.', kind: 'drift', caught_by: ['drift', 'steep-ease', 'step'], confidence: 'clear', radius: 40 },
  { ...REVIEW, id: '103-broadway-break', latest: 'gone: C eases over 1.4 km', place: 'I-25 / Broadway', view: 'broadway', at: [[-104.98990, 39.69910]],
    said: 'The rail line breaks at I-25 and Broadway', kind: 'steep-ease', caught_by: ['steep-ease', 'step', 'gap'], confidence: 'clear', radius: 12 },
];

// The picture point (CSS px in a phone capture of `view`) of a ground point.
const pixel = (view, [lon, lat]) => {
  const [z, vlat, vlon] = VIEWS[view].split('/').map(Number);
  const c = toWorld([vlon, vlat], z);
  const w = toWorld([lon, lat], z);
  return [Math.round(w[0] - c[0] + PHONE.width / 2), Math.round(w[1] - c[1] + PHONE.height / 2)];
};

const ground = (view, [x, y]) => {
  const [z, lat, lon] = VIEWS[view].split('/').map(Number);
  const c = toWorld([lon, lat], z);
  const [plon, plat] = toLonLat([c[0] + x - PHONE.width / 2, c[1] + y - PHONE.height / 2], z);
  return [+plon.toFixed(6), +plat.toFixed(6)];
};

const finds = PINS.map((p) => ({ ...p, px: p.px ?? p.at.map((q) => pixel(p.view, q)) })).map((p) => ({
  id: p.id,
  issue: p.issue ?? 42,
  place: p.place,
  said: p.said,
  kind: p.kind,
  caught_by: p.caught_by,
  // Seen on the build Chris looked at; `also` adds a later build where the
  // fault is unchanged at the same place (compared by eye, same capture view).
  seen_on: [p.seen ?? '0fe749b', ...(p.also ? [p.also] : [])],
  latest: { build: p.latestBuild ?? '430ea4a', looked: p.looked ?? '2026-11-10', status: p.latest },
  theme: 'dark',
  zoom: Number(VIEWS[p.view].split('/')[0]),
  points: p.at ?? p.px.map((px) => ground(p.view, px)),
  radius_px: p.radius,
  capture: { view: VIEWS[p.view], size: [PHONE.width, PHONE.height], px: p.px },
  found_by: p.found ?? CHRIS,
  pinned_by: p.pinned ?? PINNED,
  confidence: p.confidence,
}));

const out = {
  about: 'Faults people found on the map, pinned to the ground. qa/recall/recall.mjs scores every check against them. Add a find whenever a person or the release walk sees a fault (qa/recall/README.md).',
  finds,
};
fs.writeFileSync(path.join(HERE, 'finds.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${finds.length} finds to qa/recall/finds.json`);
