# Continuous zoom trial, issue #154

This branch adds an isolated `/zoom/` preview between zooms 12 and 16
(12 to 14 until 2026-11-25). The production entry point, five sheets,
Classic map and normal data build do not load this experiment. Nothing from
this trial is ready to merge as v2.

## What can be reviewed

- Continuous pinch, wheel, slider and button zoom, with no sheet snapping.
- Rail drawn twice, at zooms 13 and 15, and spaced by the page: each line
  keeps its slot in its pack and the page moves it sideways by slot times
  the pitch for the current zoom. The zoom-13 drawing serves 12 to 14 and
  the zoom-15 drawing 14 to 16; see "Zooms 14 to 16" below. The half-step
  comparison has been removed; see "Rail spacing: recommendation" below.
- Station bars and line letters ride the same spacing. Letters are placed
  outward from zoom 12: a letter placed at a wider zoom stays put, and new
  ones are added only where the closer view has room.
- Station names keep their side, wording and chip order, and move only for
  a recorded reason; see "Names that keep their place" below.
- Between drawings, a name that steps nearer or farther glides with the
  zoom; a name that changes side fades out and back in; see "How a name
  moves" below.
- Bus streets come from five drawings, at 12, 13, 14, 15 and 16, and hand
  over with a short fade; see "Bus drawings" below. Bus geometry is not
  morphed.
- A route selection, geographic centre and fractional view URL survive
  zooming and changing theme. A play control sweeps the zoom range.
- Controls are a small pill at the top (zoom, `?` notes, theme) and one row
  at the bottom (−, slider, +, play), so they leave the map clear.

## Evidence

Base source: `811135ffe4230f598082667c7fda20994d1bd97d`, checked against
GitHub main on 2026-11-20. The public data were downloaded from the deployed
map on 2026-11-20; its `meta.json` says the build is
`2026-11-19T04:51:34.367Z`. No network routes, station IDs or line colours
are hardcoded in the preview. Source hashes are included in the generated
report.

Nine drawings, sampled every quarter zoom from 12 through 14 (for 12 to 16,
see "Zooms 14 to 16" below):

- Independent name placement: **138** side changes over eight transitions.
- Placement preferring the preceding side: **39** side changes, a **72%**
  reduction, with **zero** names disappearing. Every drawing has 67 names.
- The rail offset comparison contains 393 constant-slot pieces.
- The trial bundle, containing the rail spacing data and all nine label
  drawings, is approximately **221 KB gzipped** (398 KB while it also held
  the half-step drawings). The zoom-13 bus drawing adds about **290 KB
  gzipped** (`bus-13.geojson`). This is an experiment's
  combined bundle, not the intended production loading strategy.

The exact pair-by-pair counts and reasons are generated at
`public/data/zoom-prototype/report.json`. The counts are a new measurement
with this trial's interpolated sizes and street-detail threshold; they are
not a rerun of the older build quoted in issue #154.

The browser checker records its commit, views, themes, drawing boundaries,
screenshots, motion timing and errors in
`qa/.scratch/zoom-prototype/browser/report.json`. Its software-rendered
Chromium timings do not establish performance on a physical phone.

The initial version, before the spacing correction, passed **107** unit and regression checks, followed
by **66** browser checks across both themes and both comparisons. Separate
shared-street picker checks passed in both themes through the private
server's published subpath: route choice, a 0.01 zoom change, switching
comparison and theme, reloading the selected-route URL, and Escape. Their
report is `qa/.scratch/zoom-prototype/browser/published-ui.json`.
The normal rail and name drawings at zooms 12 and 14 were also compared
against the original main-branch module on the deployed data and were
identical; hashes are in `qa/.scratch/zoom-prototype/production-equivalence.json`.

The software-rendered sweep's median frame interval was 150–217 ms; its
95th-percentile JavaScript geometry-update time was 1.7–3.8 ms. The slow
rendered animation is recorded, not counted as a performance pass. A real
phone review is needed before choosing this renderer for production.

A first preview let the closer bus drawing paint over rail. Its broken
layer order was pinned at commit `0263589` before being fixed; the new
regression check catches that frozen ordering and passes the corrected
style. See `qa/recall/prototype-layer-order.json` and find
`154-prototype-bus-over-rail` in `qa/recall/finds.json`.

## Architectural limits to decide before v2

The smooth comparison now aligns the original shared tracks onto **one
rounded spine at reference zoom 13**, before applying screen-pixel offsets.
The initial reconstruction from finished, independently offset drawings was
incorrect: those drawings retained different curves and the pack tightened
away from its station. Matching is based on the input geometry and heading,
not route names or a list of corridors. Beyond a shared run, its displacement
eases back to the branch's own curve. Terminal curves end square at the
platform bars. Stations and letters use small GeoJSON sources updated during
zoom; this still needs physical-phone performance measurement before it can
be chosen as a production approach.

Station-name side changes were later cut from 39 to 6; see "Names that
keep their place" below. The trial does not yet carry
bus route-number lists or street-name placements across scales. The normal
picked-bus name alternatives are also excluded from this station-name
experiment; full picked-route label clearance remains follow-up work.

The size-table adapter is synchronous and restores every value after each
draw, including after an exception. It exists only in the experimental
build command. Step #155 should replace it with ordinary zoom-dependent
sizes before production use.

## Shared-spine spacing correction

Chris reported the A/B/G/N approach tightening away from Union Station.
The original bad rendered geometry is pinned at `ce882eb` in
`qa/recall/prototype-spacing.json` and find `154-prototype-tapered-pack`.
At zoom 14, B–N centre spacing reached 2.68 px with 5.6 px strokes, so those
strokes overlapped. Target centre spacing is 7.6 px.

With the shared spine, adjacent G–B, B–N and N–A centre spacings at zoom 14
are 7.58–7.62 px along the reported approach. The new check passes all 33
pair/zoom combinations over 11 zooms from 12 to 14, within 0.25 px of the
target. It catches the frozen bad geometry before checking the fix. A
terminal check also verifies 198 rail-end/zoom combinations, within 1 px
of their station bars, and catches planted overshoot. These are geometry
checks; light/dark Chromium captures are reviewed separately.

The correction passes **112** affected unit and regression tests and **14**
focused Chromium render/control checks in light and dark themes. The final
captures were inspected for even spacing and terminal joins. Its
measurements and captures are under `qa/.scratch/zoom-spacing/`. The earlier
software-rendering timings above belong to the initial trial and are not
a performance sign-off for the corrected geometry.


## Names that keep their place (2026-11-23)

Three faults kept names jumping after the first trial:

- Each drawing's names steered around that drawing's own line letters and
  rail packs. The page shows neither: its letters and rail are spaced by the
  page. A name dodged letters that were not on screen, and jumped when they
  moved. Names now keep off the rail and letters the page shows.
- A held name was allowed a fixed 8 units of ink. Its own box grows with the
  zoom, so it gathered more ink with nothing new under it, and lost its place.
- That allowance was then taken from the name's own previous cost, so it
  could compound from step to step.

A held name is now measured against the clearest place for it at the same
zoom. It can be held only if no other name is on it, it does not stand
nearer another station, it does not crowd the station before, it sits on no
more than 6 cells of rail beyond that place (`HOLD_RAIL_SLACK`; a cell is
3 px, so this is the name's edge brushing a line's margin), and on not
clearly more bus streets (`HOLD_INK_SLACK`, 24, or half the clearest
place's ink). A name also keeps its wording and the order of its route
chips from the zoom before.

Names are then placed offline, as in Been, Daiches and Yap (2006). A first
pass scores every side of every name at every quarter zoom. For each name a
plan picks the run of sides with the fewest changes, using only sides that
could be held, then the lowest cost. The second pass starts each name on its
planned side and moves it only where the plan does. A move is made at the
best zoom before the old side fails, not at the moment it fails.

Over eight quarter-zoom steps from 12 to 14:

| | Fresh each drawing | First trial | Earlier fix | Now |
|---|---|---|---|---|
| Side changes | 133 | 39 | 20 | 6 |
| Wording changes on the same side | 10 | — | 0 | 0 |
| Chip order changes | — | — | 1 (Union Station) | 0 |
| Names lost | — | 0 | 0 | 0 |
| Names crossing a rail line or letter, all drawings | 1 | — | 1 | 0 |

Six is the fewest the plan allows: each of these names has a zoom where
none of its sides can be held all the way from 12 to 14.

| Zoom | Name | Why the old side fails |
|---|---|---|
| 12.25 | 48th Ave/Brighton Blvd@Nat'l Western Ctr | bus streets, 28 more than the clearest place at 12.25 |
| 12.5 | Olde Town Arvada | bus streets, 45 more at 12.75 |
| 12.5 | 60th/Sheridan-Arvada Gold Strike | bus streets, 43 more at 12.75 |
| 13 | Empower Field at Mile High | bus streets, 26 more at 13.25 |
| 13.5 | 38th / Blake | bus streets, 35 more at 13.75 |
| 14 | Union Station | light rail runs through its old place at 14 (26 rail cells) |

Thirty further changes keep the side and step the distance from the station.
The detector has a planted rail and a planted letter that it must catch at
every zoom, or the build stops. Held names sit on more bus streets than
fresh ones (4,533 against 1,615 units of ink summed over the drawings) and
touch more rail margin (411 against 32 cells, each name-drawing within the
6-cell limit); the captures show them over thin bus lines and still
readable. The rule runs only when the build passes a history; the sheets'
names are unchanged (sheets 0 to 3 compared with the old module; sheet 4
not rerun).

Colorado's name meets the "40, 46" route list at 14, because route lists are
placed without the names; route lists and street names get the same rule in
#156.

## How a name moves (2026-11-24)

The plan says where each name is at every quarter zoom. Between those
drawings the page decides how it gets there (`labelsAt` in
`public/js/zoom/model.js`):

- A name that keeps its side and wording glides: its offset and its chips
  move in step with the zoom from one drawing's place to the next, so the 30
  distance steps never jump.
- A name that changes side fades out at its old place (120 ms), then fades
  in at the new one (140 ms), with its chips. The two places never show
  together. The fade runs on a clock, not on the pinch, so stopping mid-pinch
  never leaves a name half-faded.
- It changes side only once the zoom is a fifth of a step (0.05 zoom) past
  halfway between the two drawings, and changes back only the same distance
  past halfway the other way, so a shaky pinch cannot make it blink. Turning
  back while it is still fading out brings it straight back.
- With the phone's reduced-motion setting, the change is immediate.

Sliding a name to its new side was not used. The label-transition study
this follows (Depian, Li, Nöllenburg and Wulms, "Transitions in Dynamic
Point Labeling", Cartography and Geographic Information Science, 2025)
slides labels that always touch their point, and fades labels that are
added or removed. These names stand off the track, and a slide would drag
Union Station's name across the platform and the light rail. The study ran
no user test of sliding against fading.

Tests cover the glide, the hold past halfway, the fade order, a shaky pinch,
turning back mid-fade, reduced motion, and every name shown exactly once
through a full sweep of the real build. Captures of Union Station's fade at
each stage are in `qa/.scratch/names154/fade-*.png`.

## Bus drawings (2026-11-24)

Chris saw bus route labels vanish rather than fade between 13 and 14. Two
things caused it. MapLibre lays out line labels at the whole zoom below the
camera, so from 13 to 14 it placed the zoom-14 drawing's labels, which were
cut to fit at 14, in the space of zoom 13: most did not fit and were dropped.
In the Union Station view the drawn labels went 4, 3, 2, 0, 0 at 13, 13.25,
13.5, 13.75 and 14. And a label that lost a collision was removed at once.

- The trial now draws a bus drawing at 13 with the same sheet code
  (`drawSheet` at zoom 13): 4,230 features, 1,130 labels. Each drawing serves
  from its own zoom to the next: 12 to 13, 13 to 14, 14 up. Zooming out, the
  closer drawing holds 0.05 of a zoom past its edge so a shaky pinch does not
  swap back and forth (`busDrawingAt` in `model.js`).
- At a handover the new streets come up over the first half of 260 ms and
  the old go down over the second half, so the streets never look pale.
  Labels do not overlap: the old labels fade out in 120 ms, then the new fade
  in over 140 ms, as station names do. Reduced motion swaps at once.
- `fadeDuration` is 200 ms, so a label that loses a collision while zooming
  fades instead of blinking out.

Measured in the Union Station view, the drawn labels are now 18, 13, 7, 5
and 4 at the same five zooms. While zooming within one drawing, 5 of 213
labels (13 to 14) and 3 of 274 (14 to 15) leave while still on screen, by
collision, and now fade. New labels appear by about 400 ms after a handover
in software Chromium: MapLibre's layout of the newly shown drawing plus its
fade. Captures are `qa/.scratch/names154/bus13-{light,dark}-*.png`.

Limit: the "15, 19" label touches the Union Station platform at 13. That is
the drawing's own placement, not the handover.

## Zooms 14 to 16 (2026-11-25)

Chris picked smooth zooming on his phone between 12 and 14 and asked for it
to run on to 16. The trial now covers 12 to 16.

- **Two rail drawings.** A rail drawing made at 13 does not hold at 16:
  there its rail sits a median 23 px (about 21 m) off its track, against
  2.8 px for the zoom-16 sheet's own rail. A drawing made at 15 is 5.8 px off
  at 16, the same as the zoom-13 drawing at 14. So the zoom-13 drawing serves
  12 to 14 and a zoom-15 drawing serves 14 to 16 (`RAIL_DRAWINGS` in
  `model.js`). They hand over at 14, where the bus drawing already changes,
  with the same quarter-second fade; the rail moves a median 2 px there.
  Station bars and line letters belong to their rail drawing and cross over
  with it. Every attachment is stored in the zoom-13 frame, so a letter
  keeps its place across the swap: a test checks that every letter the build
  places reaches the page at every quarter zoom, and catches a letter
  planted missing from the zoom-15 drawing.
- **Five bus drawings**, at 12, 13, 14, 15 and 16, each serving its own zoom
  to the next, so a bus drawing is only ever enlarged by less than one zoom.
  The zoom-15 drawing has 8,331 features and 3,380 labels.
- **Names** are planned over 17 quarter-zoom drawings, 12 to 16. Placed fresh
  in each drawing they would change side 271 times; planned, they change 8
  times, and none is lost. Six are the changes listed above, between 12
  and 14. The other two are Federal Center, at 14.25 and 15.5: its wording
  changes at 14.25, a name keeps its place only while its wording holds, so
  it takes the top instead of its planned place below, then moves below at
  15.5. Each change fades as described in "How a name moves". From 14.75
  Union Station has a name for each platform, A B G N on one and C E W on
  the other, as sheet 4 has at 16; the chip check now compares the order of
  each pair of routes, so the split passes and a swap is still caught.
- **Letters**: 37 at 12, 129 at 14, 452 at 16.
- **Spacing**: 72 pair checks over 24 zooms from 12 to 16 are within 0.25 px
  of their target (7.6 px at 14, 10.5 px at 16), and all 432 rail ends meet
  their station bars within 1 px.
- **Weight.** The zoom-15 rail drawing was sampled four times as densely as
  the zoom-13 one, which took the trial bundle to 922 KB gzipped. Each rail
  piece is now thinned to a tenth of a pixel at the closest zoom its drawing
  serves, which cuts the rail from about 150,000 points to 11,800 and the
  bundle to about 130 KB; the spacing and terminal checks give the same
  results thinned as unthinned (worst spacing error 0.11 px). The bus
  drawings at 13 and 15 add 138 KB and 302 KB gzipped.

The build now takes about 100 minutes, almost all of it placing names at the
closer zooms (about 6 minutes for each drawing at 16).

## Bus numbers keep off the station's lettering (RTD-006, 2026-11-25)

Bus route numbers printed over the hub's lettering. In the trial the names,
chips and line letters were drawn with `text-ignore-placement`, so MapLibre
did not reserve their room and placed numbers on them. The sheets do not do
this: their names and line letters take part in placement, above the bus
layers, so they are placed first and the numbers keep off them.

The trial now does the same for the names, the chips and the line letters.
The platform bars are lines, which take no room, so unseen marks along each
bar take its room, as `keep-off-bus` does for bus lines.

Measured in the hub view at every quarter zoom from 12 to 16, in pixels of
bus-number ink within 2 px of a name, chip, line letter or platform bar
(`qa/zoom-crowding-browser.mjs`):

| | 12 | 12.25 | 12.5 | 12.75 | 13 | 13.25 | 13.5 | 13.75 | 14 to 16 |
|---|---|---|---|---|---|---|---|---|---|
| Before (light) | 128 | 90 | 56 | 14 | 59 | 57 | 48 | 39 | 0 |
| Names and letters only | 96 | 77 | 55 | 14 | 6 | 1 | 0 | 0 | 0 |
| Now (light) | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Now (dark) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Before, at 12 the 32 ran into Union Station's W chip and platform bar and
"10, 23" sat on Auraria West Campus; at 13 "1, 10, 3" crossed Empower Field
at Mile High. The one pixel left, at 13.25 in light only, is the 9 of
"15, 19" coming within 2 px of the end of the commuter-rail platform; the
glyphs do not touch. "15, 19" is placed on the Union Station Transit Center
by the bus drawing itself, as noted above.

The cause is pinned at build `0c522dd` in `qa/recall/prototype-lettering.json`
(find `154-prototype-numbers-on-lettering`); the lettering test catches it,
passes the page as it is now and catches a planted wrong order.

## On a real iPhone (2026-11-25)

Chris found the 12 to 16 trial rough on his phone in ways the headless checks
could not see. It was run on a real iPhone 17 Pro (iOS 26.3.1, Safari) through
AWS Device Farm (`qa/devicefarm/zoom_run.py`): open cold, pinch to 16 and back
to 12, with the session video and a log of every frame. Frames came at a steady
60 a second (worst 21 ms while moving), so the roughness was in what was drawn.
Chris confirmed the four faults the video showed:

- **The opening built up in steps.** A white page, a cream "Loading map", a
  dark empty screen, rail alone, streets, bus lines, then names, over about two
  seconds. The page now sets its theme before the first paint and keeps the
  map unseen until everything at the opening zoom has drawn, then shows it at
  once. An unseen label in each font at the opening centre makes MapLibre fetch
  every font then; before, three fonts arrived partway through the first pinch.
- **Two rail drawings showed at once near 14.** They cross-faded over 260 ms
  and lie a few pixels apart, so every line looked doubled and striped, with
  ghost line letters. The rail drawing now hands over at once.
- **Names went half-clear and the streets dimmed while zooming.** MapLibre's
  own label fade (200 ms; the sheets use none) took each moved name for a new
  one and faded it in from nothing. And the page hid and showed the bus layers
  at each whole zoom; showing or hiding a layer makes MapLibre parse its whole
  source again, so the new streets came late while the old faded out. The
  label fade is off, every bus layer stays visible, lines fade by opacity
  alone (opacity 0 is not drawn), and each drawing's labels hold exactly its
  own zooms, since unseen labels would still take room.
- **Union Station's name ran into its route chips near 13.** The name was
  placed by a screen offset and the chips on the map; in a quick pinch, before
  the page's next update, the chips spread with the zoom and ran up into the
  name. The name's offset is now turned into its place on the map
  (`placedName` in `public/js/zoom/model.js`), so the two move together.

The page also keeps the theme last picked, here or on the sheets, under the
sheets' saved choice.

The before-and-after run confirmed all four gone. One fault remained in both
builds: a pinch from 14 to 16 in 0.6 s left the streets white and the bus
lines doubled and dashed for about 0.3 s. A frame log of the same pinch in a
throttled headless browser (tiles drawn per source, each frame) showed three
causes, now fixed:

- The page skipped its update until every source had loaded, so through a
  fast pinch the zoom-14 bus drawing hung on, then cross-faded with the next,
  whose streets lie a few pixels apart. The page now updates every frame once
  the style has loaded, and bus drawings hand over at once, like rail.
- A drawing could take over before it had anything to draw: the zoom-16 bus
  drawing loads from 15, and its tiles take a moment to parse. A drawing now
  takes over only once MapLibre can draw it, from its own tiles or the ones it
  stands in with from a zoom out; until then the one showing holds.
- The base map's roads and buildings change at 13 and 15. A tile holds only
  the layers showing at its own zoom, so the zoom-14 tiles MapLibre draws while
  a pinch outruns loading had no zoom-15 roads or buildings. Each banded road
  and building layer is now held a zoom either side of its band, at opacity 0
  there, which MapLibre skips. Street and place names keep their bands: unseen,
  they would still take room from the names on show, so on a fast pinch they
  can still arrive a moment late.

Run again on the iPhone (2026-11-26), the streets and bus lines held through
the fast pinch, apart from one video frame near 15. Zooming out across 14 the
two rail drawings still showed together for about 0.1 s: the rail's opacity
had no transition of its own, so a change of global state took the style's
default 300 ms one. Its transition is now 0. Read frame by frame in a headless
browser, every layer's opacity now changes in one frame at each handover (12
to 16, both ways); the same reading on the earlier build shows the rail fade.

## Line letters

Letters are placed outward from 12, like the names: the letters at 12 stay
where they are at every closer zoom, and a closer zoom adds a letter only
where its line has none within 0.6 of the usual letter spacing, there is no
other letter close by, and no name is in the way. There are 38 letters at 12
and 129 at 14. In the Union Station view at 13 and 14 the B, C, E and W
lines carry letters. The A, G and N lines leave that view without one: they
share their pack for its whole length on screen, and the sheets put a letter
only where a line can be read on its own. Their letters are just outside the
view. The same is true of today's sheets; a letter held at the screen edge
is #31.

## Rail spacing: recommendation

Use smooth spacing: draw the rail once at reference zoom 13 and let the page
set the space between lines in a pack as the zoom changes.

- Spacing is exact at every zoom. Over 11 zooms from 12 to 14, all 33
  pair/zoom checks along the Union Station approach are within 0.25 px of
  the target; at 14 the G–B, B–N and N–A centres are 7.58–7.62 px apart for
  7.6 px. The check catches the earlier tapered pack before passing the fix.
- Terminals stay square: 198 rail-end/zoom checks are within 1 px of their
  station bars, and a planted overshoot is caught.
- Bars, letters and names are positioned from the same model, so they move
  with the rail and never drift against it.
- It needs one rail drawing for each two zooms (13 for 12 to 14, 15 for 14
  to 16), not one for every half zoom.

The half-step alternative was dropped. Finished drawings at 12, 12.5, 13,
13.5 and 14 each have their own curves and spacing, so packs drift between
steps and jump at each handover; correcting that would rebuild what smooth
spacing already does. It also gave different letters and station marks in
each drawing, so it could not be compared fairly.

Limits of smooth spacing:

- Curves and corners are the zoom-13 curves from 12 to 14 and the zoom-15
  curves from 14 to 16. Wider zooms, down to 8.75, will need their own
  reference drawings (#157).
- Each line's slot in its pack is fixed. Where a pack's membership would
  change with the zoom, it cannot.
- Performance on a real phone is not measured. In software-rendered
  Chromium the JavaScript update per frame is 1.7–3.8 ms at the 95th
  percentile, but the rendered frame interval was 150–217 ms, which says
  nothing about a phone's GPU. This needs one check on Chris's phone before
  the approach is built for production.

## Reproduce

From a checkout with the project's Node 22 environment:

```sh
npm ci
npm run build
npm run prototype:zoom
node --test test/zoom-prototype.test.mjs test/sheets.test.mjs test/pages.test.mjs
python3 -m http.server 8804 --bind 127.0.0.1 --directory public
```

Open `http://127.0.0.1:8804/zoom/`. In another terminal in that checkout:

```sh
npm run check:zoom -- http://127.0.0.1:8804
npm run check:zoom-spacing
node qa/zoom-spacing-browser.mjs http://127.0.0.1:8804
THEMES=light,dark node qa/zoom-crowding-browser.mjs http://127.0.0.1:8804
node scripts/package-zoom-preview.mjs qa/.scratch/zoom-prototype/site
```

Keep issue #154 open until the phone performance check is done. This trial does not change its done-when
criteria, close v1.0, begin the production refactor in #155, or tag a release.
