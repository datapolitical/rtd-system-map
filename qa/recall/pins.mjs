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
];

const ground = (view, [x, y]) => {
  const [z, lat, lon] = VIEWS[view].split('/').map(Number);
  const c = toWorld([lon, lat], z);
  const [plon, plat] = toLonLat([c[0] + x - PHONE.width / 2, c[1] + y - PHONE.height / 2], z);
  return [+plon.toFixed(6), +plat.toFixed(6)];
};

const finds = PINS.map((p) => ({
  id: p.id,
  issue: 42,
  place: p.place,
  said: p.said,
  kind: p.kind,
  caught_by: p.caught_by,
  // Seen on the build Chris looked at; `also` adds a later build where the
  // fault is unchanged at the same place (compared by eye, same capture view).
  seen_on: ['0fe749b', ...(p.also ? [p.also] : [])],
  latest: { build: '430ea4a', looked: '2026-11-10', status: p.latest },
  theme: 'dark',
  zoom: Number(VIEWS[p.view].split('/')[0]),
  points: p.px.map((px) => ground(p.view, px)),
  radius_px: p.radius,
  capture: { view: VIEWS[p.view], size: [PHONE.width, PHONE.height], px: p.px },
  found_by: CHRIS,
  pinned_by: PINNED,
  confidence: p.confidence,
}));

const out = {
  about: 'Faults people found on the map, pinned to the ground. qa/recall/recall.mjs scores every check against them. Add a find whenever a person or the release walk sees a fault (qa/recall/README.md).',
  finds,
};
fs.writeFileSync(path.join(HERE, 'finds.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${finds.length} finds to qa/recall/finds.json`);
