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

## Route lists the build places (#156, 2026-11-26)

Between one tenth of a zoom and the next, route lists came and went. Each list
was a stretch of street for MapLibre to set a label along, and MapLibre hides a
label whenever its own tests fail: the stretch must reach two glyph sizes past
the lettering at each end, and must not turn more than 25 degrees under it.
Both answers change with the zoom. No stretch was shorter than its lettering
(0 of 911 at 13, 0 of 1,577 at 14), so the room was there and the tests were
the cause.

At zooms 13 and 14 (`LISTS_PLACED`, `public/js/zoom/model.js`) the build now
decides which lists there are and where each stands (`placedLists`,
`scripts/zoom-prototype.mjs`), and the page draws every one of them at every
zoom its drawing serves:

- A list stands straight where its street is straight for the lettering's
  whole length (within 1.5 px at the drawing's zoom), at the clear place
  nearest the middle of its stretch. It is a point with the street's angle,
  drawn whatever else is placed. MapLibre gives a turned point the upright box
  around it as room, several times the lettering on downtown's diagonal grid,
  so the list takes no room of its own; unseen marks along the lettering's
  length take it, and the street and place names MapLibre still sets keep off
  them.
- Where the street bends under it, the list follows the street about the
  middle of its stretch, if the turn is under 25 degrees.
- MapLibre fits a label to a line at the size it will have at zoom 18, not the
  size it is drawn. The lists' size therefore stops growing where the next
  drawing takes over, the build measures a list on a bend at that size, and the
  unseen mark is the narrowest glyph, so a list of one figure still has room
  for one.
- A clear place has no other list on it, and none of the trial's rail, station
  marks, line letters or station names at any zoom the drawing serves. With
  no clear place a list drops its street's name; failing that it is tried on
  the other side of its street, where it must be clear of the bus lines too.
- A list with no place is left out. `trial.json` names each one and says why.
- The drawing at 14 looks for each list first where it stood at 13, on the
  side it stood, before the lists new at 14 take their places.

| | Zoom 13 | Zoom 14 |
|---|---|---|
| Lists the sheets' build planned | 931 | 1,592 |
| Standing straight | 854 | 1,438 |
| Following a bend | 9 | 98 |
| Stacked in two rows (points already) | 17 | 14 |
| Left out: on rail | 27 | 21 |
| Left out: no straight or gently bending place | 21 | 16 |
| Left out: on a station's name, a line letter or another bus line | 3 | 5 |

Of the lists placed, 11 and 14 stand off the middle of their stretch, 10 and
38 stand across their street from where the sheets' build had them, and 44 at
zoom 14 go without their street's name. Every route on a list that was left
out is still named on other lists of the same drawing: at least three at 13
and seven at 14.

When the drawing at 14 takes over, 756 of the 880 lists placed at 13 stand
within 5 px of where they stood (540 within 1 px). The drawing at 14 sets bus
lines side by side at its own widths, so a street can shift a few pixels at
the handover and its list goes with it. The rest move further along their
street or are grouped differently at 14 (one list at 13, two at 14).

A neighbourhood's name gives way to a route list (Chris, 2026-11-26: the first
list on a stretch stays and the name moves). The names are still MapLibre's to
place, so for now a name with a list in its way is left out; it moves when the
build places names too.

`npm run check:zoom-lists -- <origin>` (`qa/zoom-lists.mjs`) opens the page at
the phone's size and, at each tenth of a zoom from 13.0 to 14.9, asks for every
list the build placed that is in view: that MapLibre drew it where the build
put it, that the picture has its ink there, that no two lists overlap, that
none lies on rail, a station's mark or lettering, that nothing MapLibre places
afterwards lies on one, and that each list standing straight has its unseen
marks. Run on this build in the light theme at 19th and Curtis, Union Station,
Colfax and Colorado, and Nine Mile: 80 steps, 629 lists looked for (298, 190,
91 and 50), nothing found, no page errors. The check has found what it is for.
On the first cut of this change, which set every list at its stretch's middle
and tested nothing against rail, it found two lists MapLibre refused on bends
and eight lying on rail or a line letter in four steps at 19th and Curtis. On
a later cut it found a street's name set against a one-figure list from 14.6
to 14.9: MapLibre had refused that list's marks, and the check, asked for
marks, then found 19 one-figure lists without them in six steps. The dark
theme, a picked route and a real phone are not in this check.

Lists that came and went were counted on the page before this change and
after it, at each tenth of a zoom from 13.0 to 14.9. At 19th and Curtis, 8
lists were drawn at some tenths of their drawing's range and not at others
before; after, none, and all 41 lists the build places there are drawn at
every tenth. At Nine Mile it was one before and none after. Union Station and
Colfax and Colorado were not counted this way.

The names MapLibre still places were compared at four views. At 19th and
Curtis at 14.4 the list "FF, RX", which MapLibre had hidden, now stands where
the base map's "West 21st Street" was, and that name, "Ballpark" and "Central
Business District" are left out. At 13.7 "Curtis Street" is left out beside
the list "48, ART" (see the limits), and "Park Avenue West" shows where a
stacked list was left out on rail. Colfax and Colorado at 13.6 kept every
name, and Union Station at 13.2 gained one.

Limits:

- A list's room is measured at its drawing's zoom, and the room grows with the
  map while the lettering nearly keeps its size. By the last tenth before the
  next drawing a list keeps names off about one and three-quarter times its
  lettering's length, which is what costs "Curtis Street" at 13.7. When the
  build places the street names too (#158) it can measure the room at each
  zoom.

- The lists left out on rail run beside rail for their whole stretch, with
  rail or another bus line on each side. The sheets' build chooses a list's
  side from the bus streets alone. When it knows the trial's rail it can give
  such a list a stretch that is clear.
- A stacked list has one place, so it is kept there or left out, and it still
  takes MapLibre's upright box as room.
- A list left out at 13 or 14 is still handed to the next drawing, which
  places it by its own rule: the build's at 14, MapLibre's at 15.
- Zooms 12, 15 and 16 set their lists MapLibre's way, as before.
- With a route picked, the other routes' lists are drawn, dimmed, even where
  the picked route's line passes over them. On the sheets they give way to it.
- The room lines make the drawings 3 to 4 percent larger as sent (bus-13
  132 to 136 kB gzipped, bus-14 202 to 210 kB).

## One line for a divided road below 16 (2026-11-26)

Chris sent three screenshots near 41st / Fox, at 12.75, 13.34 and 14.49:
"Here's my main issue with the zoom", meaning the express line. At 12.75 and
13.34 I-25's express lanes were one dashed line that forks near 38th. At
14.49 they were two lines side by side, with ramps crossing and a loop that
ended in a stub.

The streets file holds two street graphs (`streets.mjs`): one with each
divided road joined into its centre line (`zoom: 'far'`) and one with both
carriageways (`'near'`). DESIGN.md's rule is one line out to zoom 16 and the
two carriageways from 16 in. The sheets' zoom-14 sheet uses the carriageways
(`SHEETS` in `sheets.mjs`), and the trial's `withZoom` used them from 13. RTD
files the two directions of the express routes on separate lanes and ramps
here, 30 to 60 m apart and crossing. Each drawing joins only what lies within
7 px at its own zoom, which is 103 m at 12, 51 m at 13 and 26 m at 14, so the
two directions were one line at 12 and 13 and a braid from 14.

Every drawing below 16 now uses the joined streets (`CARRIAGEWAYS_FROM` in
`scripts/zoom-prototype.mjs`). The drawings at 12 and 16 come out as they
were, line for line.

`node qa/zoom-doubled.mjs [--all] <drawing> ...` measures line that has a
second line beside it (8 to 70 m to its side, within 30 degrees), and counts
loops under 400 m round:

| Zoom | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|
| Express line doubled, before, km | 4.4 | 8.6 | 38.6 | 31.4 | 65.1 |
| Express line doubled, now, km | 4.4 | 9.3 | 16.7 | 15.8 | 65.1 |
| Every bus street doubled, before, km | 46.7 | 81.5 | 276.4 | 279.3 | 550.4 |
| Every bus street doubled, now, km | 46.7 | 79.9 | 183.4 | 194.8 | 550.4 |
| Small loops, before | 1 | 16 | 75 | 202 | 355 |
| Small loops, now | 1 | 13 | 54 | 168 | 355 |

Comparing the two builds' drawings at 14, 89 km of line went and 44 km came,
in 316 places 600 m across (line with none of the other build's within 12 m).
Looked at before and after, as lines at one ground scale and on the page at
the phone's size, dark: 41st / Fox at 12.75, 13.34, 14.49, 15.2, 15.9 and 16,
and at 14.5 6th Avenue Parkway, Speer Boulevard and 19th and Curtis; as lines
alone, the Colfax viaduct, the Diagonal Highway and Civic Center. At 41st /
Fox the express is one line that forks near 38th from 12 to just under 16.
The parkways and Speer become one line. Broadway and Lincoln, and the downtown
one-way pairs, a block apart, are as they were. Captures are in
`qa/.scratch/consistency/express/`.

The route lists on this build (the table under "Route lists the build places"
is the build before it):

| | Zoom 13 | Zoom 14 |
|---|---|---|
| Lists the sheets' build planned | 895 | 1,561 |
| Standing straight | 811 | 1,418 |
| Following a bend | 11 | 81 |
| Stacked in two rows (points already) | 22 | 13 |
| Left out: on rail | 22 | 18 |
| Left out: no straight or gently bending place | 26 | 27 |
| Left out: on a station's name, a line letter or another bus line | 3 | 4 |

Every route on a list that was left out is still named on at least two other
lists at 13 and five at 14. At the handover to 14, 762 of the 844 lists
placed at 13 stand within 5 px of where they stood (556 within 1 px).
LIST_CHECK_RESULT

Limits:

- (Until 2026-11-27) from 16 the two carriageways came in, with the bus stops.
  Chris has since picked one line at every zoom; see the next section.
- The join leaves small loops, and each closer drawing shows more of them
  (the table). Two are on the express near 41st / Fox from 14, where a ramp
  runs 25 to 50 m from the main lanes, and Speer has two at 14 that its two
  carriageways did not have. Where the join does not pair an express road's
  two directions, the express is still two lines from 14. The fix is in the
  street build, which is main's.
- The sheets' zoom-14 sheet on main still draws both carriageways. The live
  map shows the braid at 41st / Fox on that sheet (2026-11-26).

## Lists at 15 and 16, and one line at 16 (2026-11-27)

Chris's answers to review r-20261127-163552-8bb921:

- **Route lists at 15 and 16.** He saw lists still come and go between 13 and
  15. Counted at every tenth from 14.8 to 16 at 19th and Curtis and Union
  Station (lists well inside the screen at both steps), they held between
  handovers, but at 15 one to two went and three came, and at 16 one went and
  up to two came: from 15 MapLibre placed each drawing's lists afresh. The
  build now places them at 15 and 16 too (`LISTS_PLACED` in `model.js`),
  carrying each from the zoom before wherever it still fits:

  | Drawing | 13 | 14 | 15 | 16 |
  |---|---|---|---|---|
  | Lists placed | 811 | 1,418 | 2,400 | 4,219 |
  | Carried from the zoom before | | 599 | 1,065 | 1,661 |
  | Left out | 51 | 49 | 40 | 43 |

  Every route on a list left out is still named on other lists of the same
  drawing (at least 2 times at 13, 5 at 14, 8 at 15 and 19 at 16). The
  neighbourhood names of the 15 to 16 band give way to the lists, as at 13
  and 14. The drawing at 16 serves its own zoom alone, the trial's last.
- **One line at 16.** He was unsure whether the express on I-25 should be one
  line or two, and asked what other maps do; the sources are in DESIGN.md's
  decision log. He picked one line unless the directions use different
  streets. Every drawing now uses the joined street graph
  (`CARRIAGEWAYS_FROM` in `scripts/zoom-prototype.mjs` is past the last
  zoom); `TRIAL_CARRIAGEWAYS_FROM=16` with `--bus` draws the old way for a
  comparison. Downtown's one-way pairs stay two lines. Bus line that moves
  more than 2 px at the handover to 16 fell from 15% to 4.5% (more than 6 px:
  3.9% to 0.5%). Limit: the joining step leaves a small hook on Speer at
  Lincoln, and small loops where a ramp runs 25 to 50 m from its road; their
  fix is in the street build.
- **The jump at 14** (the rail drawing changing) is left for later: #256 has
  the measurements and the options.

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
npm run check:zoom-lists -- http://127.0.0.1:8804
node qa/zoom-doubled.mjs public/data/zoom-prototype/bus-1[2-6].geojson
node qa/zoom-spacing-browser.mjs http://127.0.0.1:8804
THEMES=light,dark node qa/zoom-crowding-browser.mjs http://127.0.0.1:8804
node scripts/package-zoom-preview.mjs qa/.scratch/zoom-prototype/site
```

Keep issue #154 open until the phone performance check is done. This trial does not change its done-when
criteria, close v1.0, begin the production refactor in #155, or tag a release.
