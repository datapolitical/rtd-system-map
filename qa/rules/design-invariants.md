# DESIGN.md invariants against the checker

Read-only audit of main at `3e38acb` (2026-11-11).

What was read: all 3,961 lines of `DESIGN.md`; `qa/drawn/{model,lines,routes,marks,labels,streets,README}`, `qa/lib/{detect,inpage,views}`, `qa/checks/{report,run,map-diff,fixtures,README}` and every `*.spec.mjs` header or body, `qa/recall/{README,plant,baseline.json,finds.json}`, `qa/sweep/sweep.mjs`, `.github/workflows` run lines, and the test names in `test/`. `compare.mjs`, `strokes.mjs`, `expressions.mjs`, `glyphs.mjs`, `icons.mjs`, `tiles.mjs`, `style.mjs` were not read line by line: they implement the model and the drift test, not detectors.

How to read the coverage column:

- **full**: a detector measures the whole statement on the real drawn map.
- **part**: it measures some of it. The reason is in the "checked by" cell.
- **part (zoom)**: the property is measured, but only at some of the zooms or views where the rule applies, or only in a spec that CI does not run (`@deep`). The fix is configuration, not a new rule.
- **none**: nothing in `qa/` measures it. "unit only" means `test/` holds the rule on a made-up network (build code, not the drawn map), so a real-network fault passes unseen.

---

## Detectors

### What runs where

| Entry point | What it runs | Zooms | Views | Themes | In CI |
|---|---|---|---|---|---|
| `npm run check:map` (`qa/checks/report.mjs`, `run.mjs`) | the model detectors below (Node, no browser) | lines: **12, 14, 16, 17** (`--zooms`) | lines: whole district; labels, marks, streets: 22 places (12 busiest served stations by `links`, 10 seeded rail points, seed 7), 390x664 frame; labels at z17 and z14; marks and streets only at z17 (`DETAIL_FROM` 16) | dark and light | nightly (live site) and every branch preview, branch against main (`map-diff.mjs`, status `checks/map`) |
| `npm run check:recall` (`qa/recall/`) | the same detectors scored on 16 pinned finds and 12 kinds of planted fault in frozen builds | 12, 14, 16, 17 plus the fault's place | frozen builds `0fe749b`, `74d93c6`, `430ea4a` | dark | `test.yml` (every push to main and PR) |
| `npm run check` (fast set, Playwright, headless Chromium) | specs without `@deep`: letters, stations, buses, key, live, health, a11y, visual, drawn | 8.5 to 14 at fixed zooms, see rows | hub-centred or seeded views | phone-light and phone-dark | nightly and every branch preview |
| `npm run check:deep` | specs with `@deep`: continuity, marks, labels, contrast and extra letters | 9.75 to 14 | all stations tiled, or seeded views | both | **not run anywhere automatically** (checks-nightly.yml comment: "@deep stays out for now") |
| `npm run sweep` (`qa/sweep/`) | continuity, marks, labels, letters, contrast on every tile holding network | 10.5, 12, 14 | tiles of the whole district | both | no (manual) |
| `npm test` | unit tests of build modules on made-up networks | n/a | n/a | n/a | `test.yml` |

Zooms never run by `check:map`: 9 to 11.5, 13, 15 and everything between the listed halves. Faults the owner saw at z13 (missing end mark) and z11 (kink read as a break) are in that gap.

### Model detectors (`qa/drawn/`, Node, from the page's own style and the build's data)

| kind | file | what it measures | threshold | zooms and views |
|---|---|---|---|---|
| `short` | `lines.mjs` `lineFaults` | A drawn piece of a route line shorter than `minPiece` that stands alone: no other route line within max(2 px, half its width) of any point, and neither neighbour joined within 30 m | 3 px | check:map, district, z12/14/16/17 |
| `step` | `lines.mjs` | Two near-parallel runs (within 30 degrees) joined by a connector 1 to 8 px long, 60 to 120 degrees to both, each run at least twice the connector. Measured on the drawn (offset-applied) vertices of any route line (rail, bus, street, strand) | reported at 2 px or more | same |
| `gap` | `routes.mjs` `routeFaults` | A route-line end that dangles (no line at least 60% as wide drawn over it) while its own route carries on within `maxGap` metres, ahead within 45 degrees, across at least 3 px of empty land after both caps; not within 3 px of a terminal hall | 30 m, 45 degrees, 3 px | same |
| `hook` | `routes.mjs` | A dangling end whose last max(20, 4 w) px turn back more than 110 degrees. Excused within 60 m of a station, facility or platform mark or a hall, which a rail end normally has (its line ends at its station's mark) | 110 degrees, 60 m | same |
| `tick` | `routes.mjs` | A dangling end that stands out 2 to 15 px from a line it leaves at 30 degrees or more, with no place within 60 m and no stop within 20 m. Excused at a rail end in the same way | 2 to 15 px, 30 degrees | same |
| `overshoot` | `routes.mjs` | A rail free end more than 3 px past the box of the nearest mark of a station serving that route, with the mark behind the end | 3 px | same |
| `dangling` | `routes.mjs` | A rail free end with no mark of a station serving that route within 150 m (marks as drawn at that zoom) | 150 m | same |
| `over-line` | `labels.mjs` `labelFaults` | A placed station name (MapLibre placement replayed) whose box, grown by half the line's width, touches rail or a street of class c3/c5/c10/c15, unless that line serves the station (`lines`, `buses`). Only the page's own text layers with no icon: `station-labels*`. Basemap names are not in the model | box touch | check:map, 22 places, z14 and z17 |
| `far` | `labels.mjs` | A placed name box more than `maxFromMark` from a mark with the same `id` | 25 px | same |
| `hidden` | `labels.mjs` | A name with no clear candidate anchor (not drawn). A lead, since hiding is by design | n/a | same |
| `duplicate` | `marks.mjs` `markFaults` | Two marks of one `id` in layers named `stations*` within 3 px. The `platform` and `platform-dot` group-mark layers do not match | 3 px | check:map, 22 places, **z17 only** |
| `stray-stop` | `marks.mjs` | A `stops` mark more than 50 px from every line of the routes it carries (names with Gate/Track/Platform/Bay skipped) | 50 px | same |
| `translucent` | `marks.mjs` | A fill with 0 < opacity < 1 lying over lines or marks. A lead, no DESIGN.md rule behind it | n/a | same |
| `off-street` | `streets.mjs` `streetFaults` | A non-rail route line with two or more consecutive vertices more than 12 px from every basemap street centreline (not inside terminal or platform areas) | 12 px | check:map, 22 places, **z17 only** (needs basemap tiles) |

Recall baseline (`qa/recall/baseline.json`): on build `0fe749b` the checks catch 4 of 16 pinned finds (`short`, stub, translucent concourse, rail past its mark); on `430ea4a` 2 of the 6 still present. Planted faults: `gap` 5/5, `rail-gap` 5/5, `step` 5/5, `stray-piece` 5/5, `tick` 5/5, `overshoot` 2/2, `hook` 2/5; the report itself catches `off-street` 0 of 5 (1 when pointed at it), `slot` 0 of 5 (1 pointed), `stray-stop` 0 of 5 (5 pointed), `extra-mark` 0 of 5 even when pointed at it (`duplicate` needs two marks within 3 px; a plant is 15 m, about 30 px at z17, away), `terminal-shape` 0 of 1. Finding kinds named in `finds.json` `caught_by` that no detector emits: `arrow`, `kink`, `loop`, `slot`, `strand-step`, `platform-join`, `extra-mark`, `stop-off-line`, `terminal-shape`, `self-crossing`, `name-on-terminal`, `fill-over`.

### Browser detectors (`qa/lib/detect.mjs`, `inpage.js`, run through Playwright specs and the sweep)

| kind | file | what it measures | threshold | zooms and views |
|---|---|---|---|---|
| `line-gap`, `line-covered` | `detect.mjs` `continuity` | In a capture with every symbol hidden, walk each rail line (and the strongest bus class from z14) every 1.5 px: a run with no pixel of the line's own colour within max(1, min(0.35 w, 2)) px is a gap; the same run showing another rail's colour is covered. Excused: crossings over 20 degrees, rail over bus, under controls | 4 px run, colour tolerance 48 per channel | `continuity.spec` **@deep**: 20 seeded views (z10 to 12.9), 8 at z14, regression at I-25 / Broadway z12 to 16 in quarter zooms; sweep z10.5/12/14; both themes |
| `line-jog` | `detect.mjs` | The drawn ends of two joined pieces of a line more than max(`jogPx`, 0.4 w) apart sideways | 2 px and 0.4 w | same |
| `slot-jump`, `near-miss` | `detect.mjs` `routeJoins` | From `routes.geojson` alone: joined rail pieces (ends under 0.3 m apart) whose slots, signed by direction, differ by more than one easing step, unless within 40 m of another line's end (excused); pieces whose ends are 0.3 to 30 m apart without meeting | 1/16 width, 30 m | `continuity.spec` @deep (data, once); `test/detect-joins.test.mjs` |
| `mark-overlap`, `mark-crowded` | `detect.mjs` `marks` | Separating-axis overlap of turned boxes of ticks, dots, capsules, hub rings, Park-n-Ride and unserved marks (layers `stations-dot`, `stations`, `stations-hub`, `facilities`, `stations-unserved`; **not** `platform`, `platform-dot`); crowded when centres are nearer than the longer side of either | box overlap, centre < longer side | `marks.spec` **@deep**: every station at z9.75, 10, 10.5, 11, 12, 13, 14 (strict below 11, reported from 11). `stations.spec` (CI) has its own copy of the test on the hub view only at z10 to 14 (strict at 10 and 10.5) |
| `label-far` | `detect.mjs` `labels` | A station name box more than max(25 px, 1.4 sqrt2 ems) from its station | 25 px | `labels.spec` **@deep** z10 to 14 (all stations to 12, within about 6 km of the hub at 13 and 14); `stations.spec` (CI) hub view, 25 px, z10 to 14 |
| `label-under-card` | `detect.mjs` | A station name, edge letter or line sign whose centre is in the top or bottom band the controls leave out and over 30% under a control | 30% | labels.spec @deep |
| `label-overlap` | `detect.mjs` | A network label (station name, edge letter, line sign) overlapping another placed box by over 2 px on both axes, or a station mark's turned box. Overlaps with basemap labels are reported, not failed | 2 px | labels.spec @deep |
| `letter-missing` (a `note` under 130 px) | `detect.mjs` `letters` | A rail line with a stretch in the uncovered part of the screen and no letter there | 130 px | `letters.spec` **CI**: 20 seeded views (z10 to 12.9) per theme; @deep: 20 more (seed 7); sweep |
| `contrast` | `detect.mjs` `contrastOf` | (a) rail and frequent-bus fill or edge against land 3 px past the casing, median over at least 8 samples; (b) each station mark against the ring around it, 95th percentile; (c) dark-mode tick median luma; (d) rail letter text on its bullet; (e) bus tiers in order of strength against land | 3:1, 3:1, luma 70, 4.5:1, order within 0.05 | `contrast.spec` **@deep**: 6 seeded views z10 to 12, 4 at z14; both themes; sweep |

### Other specs (no finding kind)

| spec | in CI | what it asserts | zooms and views |
|---|---|---|---|
| `stations.spec` | yes | At the hub: no overlapping and no too-close station marks (soft, only z10 and 10.5); every station name within 25 px of its mark; the hub is named | z10, 10.5, 11, 12, 13, 14, both themes |
| `buses.spec` | yes (Live feed) | Bus arrow ring median contrast at least 3:1 against its line; in dark, each bus tier at least 3:1 against land, frequent at least 6:1 and others at least 2.5:1 against a road | z14 downtown |
| `key.spec` | yes | Each symbol image in the Key exists as a map layer's image, at the layer's icon-size, and matches the map's own drawing (mean difference at most 8/255, at least 90% of pixels within 24). Swatches drawn from paint (bus rows, FlexRide) are skipped | z8.5, 10, 10.6, 12, 14 near Union Station, both themes, Live on |
| `live.spec` | yes (relay) | Live on shows trains or says why; the pill never reads as a clock time | z9.75, 10.3, 11 |
| `health.spec` | yes | No console warnings, page errors, failed requests; style validates | z9, 10.5, 12, 14 |
| `a11y.spec` | yes | axe WCAG 2.0/2.1 A/AA on the interface (canvas excluded) | z12 |
| `visual.spec` | yes | Three baseline screenshots per theme, 1% of pixels may differ | hub at z9, 11.5, 14 |
| `drawn.spec` | yes | Drift between the Node model and the page (vertices 1 px, drawn offset 1 px, width 0.6 px, boxes 2 px). Not a rule about the map | seeded views, busiest interchanges, finds' places |
| `review-captures.mjs`, `qa/sat/render.py` | n/a | Pictures for a human or agent reviewer (rubric views: z10.5, 10.7, 10.2, 12.5, 14.5). No measurement | n/a |

### Unit tests that hold a rule on a made-up network (`test/`)

`sharedtrack.test.mjs` (sides, easing, ends level, one path, abreast of a line's end, letters per zoom, letter side, `endAtMarks`), `stationmarks.test.mjs` (tick or dot, collapse, hub), `platforms.test.mjs` (groups, in line with the hall, along the walk, `clearFrom`), `structures.test.mjs` (platform end, parallel to platform, `platformsToMarks`, terminal shape), `halls.test.mjs` (no line through a hall), `footprints.test.mjs` (terminal footprint), `streets.test.mjs`, `streets-rules.test.mjs` (divided road, ramp, loop, gap rules), `track.test.mjs` (train 200 m off track), `detect-joins.test.mjs`, `drawn-*.test.mjs` (the detectors on fixtures). These prove the build code obeys the rule on the fixture. None reads the real build's output.

### Detectors with no DESIGN.md statement behind them

`short`, `stray-stop`, `translucent`, `near-miss`, `hidden`, and the visual baselines. They find odd things, not breaches of a stated rule.

---

## Invariants

Subjects 1 to 16. Rail letters and numbers are in "letters and numbers"; Live is a 16th group added because several statements are about vehicles and alerts the matrix list did not name. Interface behaviour (panels, search, links, loading, offline, install) is not a drawing statement and is excluded. So are history, sources and data-pipeline text (Rule 1 to 3, GTFS measures, route naming).

The `DESIGN.md line` column is the first line of the statement; ranges are inclusive.

### 1. Rail lines (RL)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| RL01 | 96-98, 1340-41 | A drawn rail line stays within tens of metres of its surveyed track and never lies on another street. | Distance from each drawn rail vertex (before offset) to the GTFS shape or source geometry; the street nearest the drawn line is the street of the source track. | none (`off-street` skips rail: `streets.mjs:64`) | none |
| RL02 | 513-514 | A rail line's track is drawn once: no second copy of the same line running parallel. | Pairs of same-route rail features within 20 m and parallel for over 100 m outside a pack. | none | none |
| RL03 | 517-518, 1300-05, 3858-66 | A rail line ends at its end station's mark and no track runs on past it (tail track is cut). | For each free rail end, signed distance past the nearest own-line mark box at most 3 px. | `overshoot` (3 px past the box of the nearest own-line mark), `dangling` (no own-line mark within 150 m); check:map z12/14/16/17 | part (zoom) |
| RL04 | 88-94, 1342-43, 1359-62, 2460 | Lines that end at one station end together: level, square across the track, flush. | Cluster rail free ends within 150 m heading the same way within 20 degrees; spread of their positions along the track direction at most 1 px. | none (unit only: `sharedtrack.test` "end side by side end level") | none |
| RL05 | 1353-56, 1388-91, 2460 | A rail path has no spikes, out-and-back stretches, sideways hops, zigzag or wobble; corners are smooth curves. | Per drawn rail polyline: reversals over 150 degrees, hops, turn per px, curvature sign changes inside 60 m. | `step` (sideways hop, 1 to 8 px, runs within 30 degrees), `short`; spikes, out-and-back, wobble, corner roundness not measured | part |
| RL06 | 2460 | No stubs or hooks at a rail line's end. | Free end whose last 20 px turn back over 110 degrees, or that stands out 2 to 15 px from the line it leaves. | `hook`, `tick` exist but are excused within 60 m of a station mark, which a rail end normally has; `short` only | part |
| RL07 | 1402-03, 2460, 3727-32, 3827-30 | A rail line is one unbroken stroke at every zoom, also where pieces join. | Follow the route across all pieces; an end that dangles while the route carries on within 30 m across at least 3 px of land. | `gap` (check:map z12/14/16/17); `line-gap`, `line-covered` (continuity.spec @deep z10-12.9, z14, hub z12-16) | part (zoom) |
| RL08 | 1402, 1425-27 | Joined pieces of one line meet without a sideways step: slots differ by at most 1/16 of a width, drawn ends within max(2 px, 0.4 width). | Drawn end positions of joined pieces across the line; slot difference of joined pieces. | `line-jog`, `slot-jump`, `near-miss` (continuity.spec @deep, not in CI); `step` inside one part | part (zoom) |
| RL09 | 1392-1402, 1384-87, 3827-30 | A line eases from one slot to the next over a long run (up to 1.5 km, in steps of 1/32 width), finishing before the next station, and never reads as a kink or a break (a slot in 300 m is a kink at z11: 10 px along, 6 across). | Lateral offset of the line from its former neighbour against distance along the track; maximum slope (px across per px along) at each zoom. | none (`slot-jump` tests step size at piece joins only, not slope; check:map does not run z11) | none |
| RL10 | 1402-11, 3841-42 | Where a line of a pack ends, the lines that run on take their final places abreast of the end, under its mark, and run straight on both sides; they do not drift sideways afterwards. | Lateral offset of each run-on line before, at and for 300 m after the end: constant within 0.5 px; heading change under 2 degrees. | none (`slot-jump` excuses any step within 40 m of another line's end: `detect.mjs:332`; unit only: `sharedtrack.test` "abreast of its end") | none |
| RL11 | 28-29, 2460 | Packs have concentric corners and clean branches: lines in a pack stay at their fixed offsets round a bend; a branch leaves a pack in one clean curve. | Offset between adjacent drawn centrelines round bends against the slot difference; turn rate along a branch leaving a pack. | none | none |

### 2. Shared track (ST)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| ST01 | 458-460, 1329-30, 2654-56, 2829 | Lines sharing track are drawn side by side, never on top of each other (no line overlaps another anywhere). | For rail features of different routes within 20 m: drawn centreline distance at least 0.88 of a width at every zoom. | `line-covered` (another line's colour drawn where the line's own is missing for 4 px or more; continuity.spec @deep) | part (zoom) |
| ST02 | 1378-83, 1413-27, 3840-41 | The gaps between neighbouring lines in a pack are equal: lines of a pack lie on one path within 0.1 m (mean 0.06 m); T beside E and R at Lincoln. | Perpendicular distance between adjacent drawn centrelines minus slot difference times width, at most 0.3 px; compare successive gaps of one pack along its length. | none (unit only: `sharedtrack.test` "gaps in a pack are even") | none |
| ST03 | 1375-77, 2688-91 | Slot offsets are the same width on screen at every zoom. | Gap in px between adjacent pack lines the same at z9 to z17. | none | none |
| ST04 | 1369-74, 3364-71 | Two lines never swap sides from one shared place to the next and never cross where a third joins or leaves. | Sign of the signed offset between each pair is constant along a shared corridor; drawn centrelines never cross. | none (unit only: `sharedtrack.test` "each on the side it leaves toward"; `continuity` excuses crossings over 20 degrees) | none |
| ST05 | 1331-34 | One-way couplet directions on separate streets are treated as one line, not as two lines sharing a corridor. | Needs couplet data in the build; none drawn today. | none | none |

### 3. Stations and marks (SM)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| SM01 | 1132, 3171-72 | From z11 a served station is a white capsule with an ink edge laid across the track, as wide as the lines it serves and turned to the track's direction (a circle where one line stops). | Mark `rot` against the local track bearing (within 2 degrees); mark length against lines times line width. | none (unit only: `stationmarks.test`; `contrast` tests only mark against surround) | none |
| SM02 | 1145-57, 2879-81 | A tick spans its lines only where they stay the same distance apart (within a pixel at z9, 10, 11) along its length; elsewhere the station is a dot. A tick is turned to the track's direction over that stretch, square to both lines at a split. | For each tick: perpendicular distance between the lines it spans at plus and minus half its length; tick `rot` against the bearing. | none (unit only: `stationmarks.test` "tick spans its lines where they run together") | none |
| SM03 | 1158-63, 2879-87 | Stations too close to tell apart collapse to the strongest: no two station marks overlap or crowd (centres at least the longer mark plus 4 px apart). | Separating-axis overlap of mark boxes; centre distance against longer side plus 4 px. | `mark-overlap`, `mark-crowded` (stations.spec CI at the hub only, strict at z10 and 10.5; marks.spec @deep every station z9.75-14, strict below 11); threshold has no +4 px; platform-group marks not included | part (zoom) |
| SM04 | 1164-69, 2632-34 | The hub (where most lines meet) has a ring from z9.75 as wide as a tick across its lines plus 12 px, not turned, crossfading into its capsule 10.25 to 11; nothing else is a ring that size. | Hub ring present at 9.75 to 11 with `rot` 0 and the width; no other ring of that size. | none (stations.spec asserts the hub's name, not its ring) | none |
| SM05 | 1170-77, 2878 | Marks are drawn for the size they are seen at (tick edge 1.1 px, capsule 1.5, ring 2.6 before scaling; tick 10 px, dot 8), and a dark-mode tick reads dark. | Image sizes from `model.icons`; median luma across a dark tick. | `contrast` dark-tick luma at most 70 (contrast.spec @deep, dark only); sizes and edges not measured | part |
| SM06 | 1133-37 | A returning or no-service station is a hollow gray ring with a gray label, both from z13. | `stations-unserved` mark and label opacity 0 below z13, equal zoom for both. | none (`contrast` only tests that a mark stands off its surround) | none |
| SM07 | 1289-99, 3820-26, 3846-49 | A station a line ends at is marked at the line's end (the platform's head end), one line or several; the mark is drawn across the row of lines that end together (ends within 60 m). | For each rail free end: an own-line station mark within a few px of the end, long axis square to the track, spanning the lines that end there. | `dangling` (no own-line mark within 150 m), `overshoot`; position and orientation not measured | part |
| SM08 | 1225-32, 3835-40 | A platform-group mark that the group's lines end at is marked from z11 without waiting; every rail line end has a mark at every zoom from 11 (the light rail at Union Station at z13). | Per zoom 11 to 17: every free rail end sits inside an own-line mark's box. | `dangling` fires only if no own-line mark is within 150 m (about 20 px at z13), so another mark close by hides it; z13 is not in check:map | part (zoom) |
| SM09 | 1225-31, 1236-38 | A group mark whose lines run on through waits until clear of the station's own mark, so one station never shows two overlapping marks; a group that never clears gets none. | Boxes of marks sharing a station id do not overlap (station layer against `platform` layer). | none (`duplicate` matches `stations*` layers only, within 3 px, z17; group marks are layer `platform`) | none |
| SM10 | 1313-18 | A station's mark, ring and one name stand at its station building or hall (the platform group nearest the building). | Distance from the station mark to the `station-building` polygon. | none | none |
| SM11 | 1731-33 | The Park-n-Ride "P" sign sits just up and left of its spot, one size for all, and never covers a station. | `facilities` icon box against station mark boxes; `icon-size` constant. | `mark-overlap` (`facilities` is in the mark layers; marks.spec @deep z12-14) | part (zoom) |
| SM12 | 1882-83 | A transit centre is a rounded square with a bus glyph, never a "T". | Image identity of `facilities` icons. | none | none |

### 4. Platform groups and walks (PG)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| PG01 | 1200-16, 3850-52 | The two marks of a station and the walk between them are in one straight line with the bus hall's long axis; each mark stands where the axis crosses its group's track. | Bearing between the two group marks against the hall axis (within 2 degrees); marks collinear with the walk's dots. | none (unit only: `platforms.test` "in line with the hall between them") | none |
| PG02 | 1211-14, 3833-34, 3840-41 | The two marks of one station are parallel (they were 12 degrees apart at Union Station). | Absolute difference of `rot` of the group marks sharing a station id at most 1 degree. | none (unit only: `platforms.test` "lies along it") | none |
| PG03 | 1215-21 | Where every line of a group ends, each runs its platform's length and ends at the group mark; otherwise the mark stands abreast of the station's own mark (within 40 m) or on the track beside the stops, never in the air. | Free rail end inside the mark's box; mark within a few px of a rail line. | `overshoot`, `dangling` for the line ends; a mark off every track not measured | part |
| PG04 | 1239-44, 3854 | A row of dots in the station's edge ink joins the station's mark to each group's, dots 1.4, 2 and 2.6 px at z10, 13 and 16, a little over two dots apart; not a hairline. | `platform-joins` and `platform-dot` geometry: dot size and spacing, ends at the marks. | none | none |
| PG05 | 1243-44, 1236-38 | No name sits on the walk's dots or the second mark, and the station is named once. | Station-name boxes against walk dots and group marks; count of name labels per station id equals 1. | none (`over-line` tests rail and street layers only; `label-overlap` mark list omits `platform` layers) | none |
| PG06 | 1194-99, 3854-55 | Lines of one place whose tracks are over 20 m apart where they stop are two groups, each with its mark (A at Peoria). | Every rail free end has an own-line mark within a few px. | none (unit only: `platforms.test`; `dangling` is hidden by the station's other mark within 150 m) | none |
| PG07 | 1183-93 | Child stops within 100 m (250 m with a line in common) are one platform group, otherwise two. | Data rule: number of group marks against the GTFS grouping. | none (unit only: `platforms.test`) | none |

### 5. Station shapes (SS)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| SS01 | 1267-72, 3846-49 | A line that ends at a station whose platforms OSM draws runs along its platform to the platform's real (head) end and ends at the mark. | Distance from the line's end to the platform polygon's far end along its axis. | none (unit only: `structures.test` "runs to the platform end") | none |
| SS02 | 1273-79, 3843-44 | The line runs on parallel to its platform: its last stretch within a degree or two of the platform's long axis (the airport's 4 degrees over 120 m was wrong); a line that only crosses a platform (over 30 degrees) is not turned. | Angle between the last 100 m of the drawn line and the `station-platform` polygon's long axis. | none (unit only: `structures.test` "beside its platform, parallel to it") | none |
| SS03 | 1280-88, 3844-45 | Under a hall roof (at least 10 m wide and 600 m2) the station's mark stands abreast of the roof's middle and the lines end there, never past the canopy's tip. | Along-track position of the line end against the canopy polygon's far edge. | none | none |
| SS04 | 1306-12 | Where every line at a mark ends there, platforms and roofs are drawn only as far as the mark (2 m past); one wholly past it is not drawn. | Platform and canopy polygon extent along the track against the mark's position. | none (unit only: `structures.test` "only as far as the mark") | none |
| SS05 | 1319-25 | The station building is a faint neutral fill with no outline, platforms a step off the land, the canopy the palest wash over them; platforms and canopies from z14.2, the building from z13. | Layer paint (no outline), fill ordering against land, `minzoom`. | none (`translucent` only flags a fill over the network, as a lead) | none |

### 6. Bus streets (BS)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| BS01 | 1448-51, 1469-71 | Each street is one line, drawn once, its width saying how often a bus comes; nothing overlaps and nothing darkens. | Pairwise overlap of drawn street centrelines within half a width. | none (unit only: `streets.test`) | none |
| BS02 | 96-98, 1469-71, 1570-83 | A bus street is drawn on the street it runs on: on RTD's line, or down the middle of a divided road's carriageways. | Route vertices within 12 px of a basemap street centreline. | `off-street` (two or more vertices over 12 px away; non-rail; z17 at 22 places only) | part (zoom) |
| BS03 | 1505-07 | Streets meet at graph nodes: a branch starts on the trunk's own line where the trunk's run ends; street ends are round, so a turn shows no notch. | Branch end inside the trunk's stroke; no uncovered notch at a corner. | `gap`, `hook`, `tick` (dangling ends only) | part |
| BS04 | 1508-19 | A loose end whose own route has another line within 30 m ahead (60 degrees) or 15 m in any direction is joined to it: no gap in a bus line. | End against the same route's other lines. | `gap` (30 m, 45 degrees, 3 px of land; 15 m in any direction not tested) | part |
| BS05 | 1520-30 | From z13.5 a hairline seam runs between each pair of routes inside a shared street (each strand at least 2.6 px wide), no land showing; part-time seams dashed. | `street-strand-*` geometry against the street's width and routes. | none (`step` could flag a sideways hop in a strand, no rule for strands) | none |
| BS06 | 1530-39 | Before strands have room (from z14) a part-time route rides beside the street as a dashed hairline with 2.2 px of land between it and the street's edge, on streets at least 25 m long. | Gap between the hairline and the street edge at least 2.2 px; street length. | none | none |
| BS07 | 1540-43 | Streets with more than six routes get no strands; a core line a third of the width runs down the middle. | `street-core` present exactly where routes exceed 6, width a third of the street's. | none | none |
| BS08 | 1545-59 | One-way arrows (chevrons) from z14, about 300 px apart, one glyph at one size on every street, only on streets whose reverse traffic is at most 15%; none on a piece under 250 m, none on two-way streets or a one-way run with a twin within 60 m. | Count and spacing of chevrons per one-way street; none elsewhere. | none (`drawn.spec` says arrows are not compared) | none |
| BS09 | 1639-51 | The six street classes get wider with class at every zoom (busiest 2.8/4.4/7/14 px at z9/11/13/16), step down in strength, and come in at z0, 9, 10.5 and (part-time) 11. | Width and colour of each class by zoom from the model; `minzoom` per class. | colour order only: `contrast` bus-tier check (contrast.spec @deep); widths and zooms none | part |
| BS10 | 1024-26, 1653-61 | The busiest street is as wide as or wider than rail close in (14 against 9 px at z16, 7 against 5.6 at z13), about equal at the overview, and drawn under rail. | Width of class c3 against rail width by zoom; layer order. | none | none |
| BS11 | 1491-92, 1608-09 | Part-time routes (rush hours, few trips) keep their own dashed or dotted lines and add no width; a street with only part-time routes is drawn as their line. | Style and `n`/`tier` data against stroke width and dash. | none | none |
| BS12 | 664-66, 1656-57 (DESIGN.md has no section for the beside-rail rule yet; issue #97) | A bus street that runs along a rail pack is not hidden under it: it is drawn visibly beside the pack and its stops are not on the rail line. | Per bus segment and stop: lateral distance to the nearest rail pack centre at least pack half-width plus street half-width; share of the bus stroke covered by rail strokes. | none (`line-covered` excuses a bus under rail: `detect.mjs:227`; `stray-stop` needs a stop far from its own bus line) | none |

### 7. Divided roads, ramps and loops (DR)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| DR01 | 1570-83, 3796-98 | A divided road (two carriageways 4 to 60 m apart) is drawn as one two-way line out to z16 and as its two carriageways from z16 in. | Count of parallel street lines per road at z15.9 and z16.1 (`zoom` tag far or near). | none (unit only: `streets-rules.test` "zoom tags") | none |
| DR02 | 1584-89 | A ramp (a turn 2.5 times longer than the straight line between its ends, ends within 100 m, no wider than 220 m) is drawn straight, unless riders board on it. | Path length over chord for street runs between junctions. | none (unit only: `streets-rules.test`) | none |
| DR03 | 1590-99 | A loop that leaves a junction and returns within 220 m is a turn: a short end to the station or Park-n-Ride when riders board it, otherwise removed with a stem under 120 m; a barb stops at the tip. | Closed cycles under 220 m in the drawn street graph; hooks at ends. | `hook` (turn back over 110 degrees unless a place is within 60 m) catches some barbs | part |

### 8. Terminals and halls (TH)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| TH01 | 1611-21 | Each bus-station facility (class BUS or STN) is drawn as the hall its gates stand in; a parking structure is never the terminal. | `terminals` features against facility class; the footprint holds the gates. | none (unit only: `footprints.test`) | none |
| TH02 | 1619-22 | A hall above ground is a faint fill with no edge; one below ground is a quieter fill a shade under the land; from z13. | Layer paint (outline none), fill against land colour, `minzoom`. | none | none |
| TH03 | 1623-26 | A bus that boards in a hall is drawn only as far as the hall's edge; no line is drawn through a hall; halls lie beneath bus lines so a line ends on its hall with its round end whole. | Length of bus-street stroke inside hall polygons equals zero; layer order. | none (unit only: `halls.test`; `gap` excuses ends within 3 px of a hall) | none |
| TH04 | 1627-31 | A stop inside a hall is a gate shown from z17; a stop within 80 m of a hall that no drawn line comes within 30 m of is shown with the hall, not as a dot beside nothing. | `stops` marks within 80 m of a hall and over 30 m from any line. | `stray-stop` (over 50 px from every line of its routes; z17) catches the dot beside nothing | part |

### 9. Stops (SP)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| SP01 | 664-66, 3856 | A stop only trains call at (a platform) is not drawn as a bus stop. | No `stops` mark at a rail platform whose `lines` are rail only. | none | none |
| SP02 | 1722-23, 1628 | Bus stops are drawn from z15 (loaded from 14), gates from z17, stop names with their routes from z16. | `minzoom` of `stops`, `stops-gate` and their labels. | none | none |

### 10. Labels and names (LN)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| LN01 | 869-71, 963-67, 2890-99 | A station's name sits within about two ems of its mark (nearest corner at most 1.4 em across and 1.4 down, about 24.4 px) or is not drawn; the hub keeps the same distance. | Placed name box to its mark at most max(25 px, 1.4 sqrt2 em). | `far` (check:map z14, z17 places), `label-far` (labels.spec @deep z10-14), stations.spec (CI, hub view, 25 px, z10-14) | full |
| LN02 | 890-97, 2896-99 | The hub's (Union Station's) name is drawn at every zoom from 10 to 14. | Hub name placed. | stations.spec (CI; hub view) | full |
| LN03 | 886-99, 1719 | Below z11 the only stations named are the ends of rail lines (and the hub); every station is named from z11, the busiest first. | Set of station names placed at each zoom against the stations' `end` flag. | none | none |
| LN04 | 917-41 | No station name covers rail or a frequent bus street; it may cross a lighter bus line. | Placed name box (grown by half the line's width) against rail and class c3/c5/c10/c15 strokes. | `over-line` (check:map z14, z17 places); skips lines that serve the station, so a name on its own station's rail passes | part |
| LN05 | 917-34, 1074-78 | No city, town, neighbourhood, landmark, airport or water name covers a rail or frequent bus line (it moves up to 3.4 em or is not drawn); lighter bus lines too from z11.5. | Basemap label boxes against line strokes. | none (the model has no basemap labels; `label-overlap` is label against label) | none |
| LN06 | 935-37, 1042-46 | Street names sit beside their street (1.3 em off, 1.45 em by z17), never on it, and only on a stretch no bus line crosses. | Street label box against its street stroke and route strokes. | none | none |
| LN07 | 941, 1048-62 | A highway shield never sits on a drawn bus line, at any zoom. | Shield boxes against bus strokes. | none | none |
| LN08 | 950-58, 2456 | A network label overlaps no other label or mark. | Placed boxes of network labels against other placed boxes and marks. | `label-overlap` (labels.spec @deep z10-14; basemap overlaps only reported; `platform` marks excluded). MapLibre drops overlapping symbols, so only edge letters (overlap allowed) can show it | part (zoom) |
| LN09 | 2459 | No label a rider needs sits under a control (search, Key, buttons, panel). | Placed label box against the uncovered area. | `label-under-card` (labels.spec @deep); labels only | part (zoom) |
| LN10 | 967-73, 3871-79 | The hub's name is placed before every other name; from z15 it stays off rail and the frequent buses (extra ring of 1.8 em). | Hub name box against strokes at z15 and up. | none (`over-line` exempts the hub's own lines, which are all of them) | none |
| LN11 | 1063-68, 3867-70 | A place whose name is a served station's label is not drawn by the basemap. | Basemap place labels against station labels, text equal. | none | none |
| LN12 | 1069-78 | City names are small letter-spaced capitals in quiet gray, give way to lines, stations and names, and are set up to 3.4 em off their point or not drawn. | Type style and position of city labels. | none | none |
| LN13 | 1079-83 | Water names skip intermittent water; landmarks from z14 are names only, no icons. | Label filter; icon-image absent. | none | none |

### 11. Letters and numbers (LT)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| LT01 | 857-61, 900-04, 1116-18, 2900-04 | Every rail line on screen carries its letter at least once a screen (twenty random phone views at z10 to 12 show a letter for every line crossing them); rail is never identified by colour alone. | Per view: each rail line with a stretch in the uncovered area has a letter in that area. | `letter-missing` (letters.spec CI: 20 seeded views z10-12.9; @deep seed 7; sweep z10.5/12/14); edge letters are runtime-only | part (zoom) |
| LT02 | 900-02, 977-78, 1764-82 | Letters on a line are evenly spaced, 270 to 540 px apart (380 at mid-zoom), at the same rate per line on shared track as alone; no line shows three of its own letters on one phone screen. | Along-line screen distance between consecutive letters of one route per zoom within 270 to 540 px; letters per route per 390x844 screen. | none (unit only: `sharedtrack.test` "at least once a phone screen") | none |
| LT03 | 1759-63, 1783-95 | A letter sits just past each fork (90 px); on shared track every line is named on every piece it shares before any is named twice. | Per shared stretch: each route has at least one letter; a letter near each fork. | none (unit only: `sharedtrack.test`) | none |
| LT04 | 1806-09, 1801-05 | A letter keeps clear of stations (16 px) and of other letters (28 px, measured at the near end of its zoom). | Distances from each letter to station marks and to other letters. | `label-overlap` (letter against mark or box, only if both are drawn; a dropped letter shows only as `letter-missing`) | part |
| LT05 | 1813-16, 3387-88 | A letter sits on its own line, not in the middle of the track (the gold G on the purple N). | Letter anchor within half a line width of its own route's drawn centreline and nearer to it than to any other route's. | none (unit only: `sharedtrack.test` "which side of the track") | none |
| LT06 | 1306-12 | A rail letter past the mark (on the side the line does not come from), or within 24 px of the mark at the zoom the letter comes in, is not drawn. | Letter to mark distance and side. | none | none |
| LT07 | 857-61, 1734-53 | Below z9.75 each line's letter stands alone 14 px past each end; lines ending together share one sign ("E R"); none where more than three end together; no two signs meet; no letters along the lines yet. | Sign boxes against each other and lines at z<9.75; `rail-bullets` absent below 9.75. | none (all detectors start at z10; `line-signs` exist only below 9.75) | none |
| LT08 | 1750-51, 1791-93, 1818-19 | Signs and rail letters claim their space before station names, so a name never costs a line its letter. | No letter hidden by a name box; every line keeps its letter when names are present. | `letter-missing` catches the result when a line is left with none | part |
| LT09 | 863-68, 1669-99 | No bus route number is drawn on the map at any zoom until a scheme passes review. | No symbol layer carrying route text over bus strokes. | none | none |

### 12. Colour and weight (CW)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| CW01 | 847-51, 1021-32 | Rail is the only colour on the map; bus streets are one ink with no hue of a rail line (navy in light, periwinkle hue 265 in dark). | Hue and chroma of bus layer colours against rail colours. | none | none |
| CW02 | 1093-1101, 2443 | Every rail line reads at 3:1 against the land (its fill, or its darker outline at OKLab L x 0.72). | Median contrast of drawn fill or edge against land 3 px outside the casing. | `contrast` (contrast.spec @deep, 10 seeded views z10-14, both themes; not in CI) | full |
| CW03 | 1103-05, 2443 | Each bullet's letter is white or ink, whichever contrasts more (4.5:1). | Text colour against bullet fill. | `contrast` (letter on bullet 4.5:1; @deep) | full |
| CW04 | 1947-50 | In dark mode a rail line whose colour is under 4:1 against the dark land is lifted to 4:1. | Contrast at least 4:1 in the dark theme. | `contrast` floors lines at 3:1, not 4:1 | part |
| CW05 | 1951-55, 2443 | All map text meets 4.5:1 in both themes against what it sits on (land, road, water, park, shield). | Label colour against the fill under it, from basemap tiles. | `contrast` (letters on bullets only); a11y.spec excludes the canvas | part |
| CW06 | 1930-46, 3547-50 | Dark buses are periwinkle tiers at 9.2/5.6/3.7:1 against land and 6.7/4.1/2.7:1 against a dark road, each tier at least as strong as the next, frequent not brighter than rail. | Contrast per tier against land and road; OKLCH lightness against rail. | buses.spec (CI: land 3:1, frequent 6:1 and others 2.5:1 against road); `contrast` tier order (@deep); rail lightness cap not tested | part |
| CW07 | 1019-33, 1656-57, 2455 | Draw order is the hierarchy: rail above every bus layer with a white casing, then bus streets, stations, vehicles, quieter buses, FlexRide, hairlines, basemap. | Style layer order and casing presence. | none | none |
| CW08 | 575-98, 1122-26 | Tier looks hold: 15-min rail full width, 30 and 60 a step thinner, few-trip or rush rail dashed and beneath full-service rail; frequent bus bold, every-30 medium, hourly thin light, rush dashed, few trips dotted. | Width, dash and draw order by tier from the model at each zoom. | none (visual.spec baselines change on any difference but state no rule) | none |
| CW09 | 581, 1031, 1857-58 | A line not running at the time shown is a hairline in the lightest bus gray with no tag. | Model width and colour for tier `none`. | none | none |
| CW10 | 1861-72, 2909-15 | A bus arrow has a 2.5 px ring of casing colour; ring against line at least 3:1 (13.5 light, 10.3 dark); 20 or more arrows are countable at z14 downtown. | Pixel contrast of ring against line. | buses.spec (CI, needs the Live feed): ring contrast asserted at 3:1; the count of arrows is reported, not failed | part |
| CW11 | 1884-85 | FlexRide is a light diagonal hatch with a dashed edge, never green. | Fill pattern and hue. | none | none |

### 13. Zoom behaviour (ZB)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| ZB01 | 1132, 1718-19 | Station marks: none below z9; ticks or dots from 9; capsules from 11; ticks fade out 10.25 to 11; hub ring 9.75 to 11. | Count and kind of marks by layer at z8.9, 9, 10.25, 11. | none (visual.spec baseline at z9 only) | none |
| ZB02 | 1714-23 | Bus streets arrive by class (every-15-or-better below 9, 16 to 30 min from 9, 31+ from 10.5, part-time from 11, smaller streets from 14.5), each fading in over about a zoom. | Layer `minzoom` and opacity ramp per class. | none | none |
| ZB03 | 907-13, 1042-83, 1719-21 | Basemap ladder: towns, FlexRide, spur and US shields from 11; main streets and neighbourhoods from 12; landmarks from 14; small streets 14.5; city names out 12.5 to 13.5, towns 13.5 to 14.5; Interstate shields 8.5 to 14.5, US 11 to 13.5. | `minzoom`, `maxzoom` and opacity ramps of the basemap layers. | none | none |
| ZB04 | 1232-36 | A mark due at a whole zoom shows at that zoom, not as a ghost until the next. | Mark opacity across z13.0 to 13.99 for marks with `tickFrom` 13. | none | none |

### 14. Key and legend (KL)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| KL01 | 2221-29, 2924-27, 2458 | Every mark in the Key is the map's own image at the size its layer draws it at the map's zoom; no symbol is a second drawing. | Pixel compare of each Key image with the map's drawing. | key.spec (CI, z8.5, 10, 10.6, 12, 14, both themes, Live on) | full |
| KL02 | 2226-29, 3558-67 | Bus rows' swatches are the street layer's own width, colour, dash and cap at z13; FlexRide from its hatch and dash. | Swatch pixels against layer paint. | none (key.spec skips swatches drawn from paint) | none |
| KL03 | 2229-36, 2931-33 | The Key's station row follows the zoom: "zoom in" below 9, tick or dot 9 to 10.625, capsules after; the hub row only while its ring is at least half drawn. | Rows present at each zoom. | none (key.spec checks the images it finds, not which rows exist) | none |
| KL04 | 1138, 2206-07, 2246-50, 1325 | Rows appear only when the data has the thing (gray station only if one is unserved; no row for tier none; only the classes the network has; no counts); the Key has a row for platforms and their roof. | Key rows against `meta.json`. | none | none |

### 15. Basemap (BM)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| BM01 | 1035-40, 1903-05 | The basemap is quiet: pale cool-gray land, soft blue water, white streets with light casings, so the network leads. | Colours of basemap layers by theme against the palette. | none (visual.spec baselines only) | none |
| BM02 | 1032-34, 1886-88, 3615-19 | The basemap is the same inside RTD's district and out, to the edge of the pannable rectangle; nothing is drawn outside the district. | No district mask layer; basemap layers have no boundary filter. | none | none |
| BM03 | 1048-62, 3225-29 | Highway shields: main Interstates from 8.5, spurs and notched US-route shields from 11; no state highway numbers. | Shield layer filters and zoom ranges. | none | none |
| BM04 | 1084-89 | Relief loads after the network; basemap railways, POI icons and road colours are dropped. | Style layer list. | none | none |

### 16. Live: vehicles and alerts (LV)

| id | DESIGN.md line | invariant | how it could be measured on the drawn model | checked by | coverage |
|---|---|---|---|---|---|
| LV01 | 360-75, 1875-76 | A train more than 200 m from its own line's track is drawn at 45%. | Vehicle opacity against distance to the route's track. | none (unit only: `track.test`) | none |
| LV02 | 357-59, 1859-65 | Vehicles are rounded arrows along their heading; trains in line colour with an upright letter from z9.75; buses in ink from z13 with the number from z14.5. | `vehicles-*` layer zooms and icon rotation. | live.spec (trains or a status line at z9.75, 10.3, 11); buses.spec (ring only) | part |
| LV03 | 1877-80 | An alert mark is a triangle on the bullet, tag or station, told by shape and never by a colour that could be a rail line; a closed stop is crossed out. | Layer presence and icon identity. | none (not built) | none |

---

## Summary

Counts from the Invariants tables above (109 invariants; one row per statement or tight group of statements).

| Subject | Invariants | Fully checked | Partly checked | of which part (zoom) | Not checked | of which unit test only |
|---|---|---|---|---|---|---|
| Rail lines (RL) | 11 | 0 | 5 | 3 | 6 | 2 |
| Shared track (ST) | 5 | 0 | 1 | 1 | 4 | 2 |
| Stations and marks (SM) | 12 | 0 | 5 | 3 | 7 | 2 |
| Platform groups and walks (PG) | 7 | 0 | 1 | 0 | 6 | 4 |
| Station shapes (SS) | 5 | 0 | 0 | 0 | 5 | 3 |
| Bus streets (BS) | 12 | 0 | 4 | 1 | 8 | 1 |
| Divided roads, ramps, loops (DR) | 3 | 0 | 1 | 0 | 2 | 2 |
| Terminals and halls (TH) | 4 | 0 | 1 | 0 | 3 | 2 |
| Stops (SP) | 2 | 0 | 0 | 0 | 2 | 0 |
| Labels and names (LN) | 13 | 2 | 3 | 2 | 8 | 0 |
| Letters and numbers (LT) | 9 | 0 | 3 | 1 | 6 | 3 |
| Colour and weight (CW) | 11 | 2 | 4 | 0 | 5 | 0 |
| Zoom behaviour (ZB) | 4 | 0 | 0 | 0 | 4 | 0 |
| Key and legend (KL) | 4 | 1 | 0 | 0 | 3 | 0 |
| Basemap (BM) | 4 | 0 | 0 | 0 | 4 | 0 |
| Live (vehicles, alerts) (LV) | 3 | 0 | 1 | 0 | 2 | 1 |
| **Total** | **109** | **5** | **29** | **11** | **75** | **22** |

- Fully checked is 5 of 109 (5%): station-name distance (LN01), hub named (LN02), line and letter contrast (CW02, CW03) and the Key's images (KL01). CW02 and CW03 run only in the `@deep` contrast spec, which no workflow runs.
- Partly checked is 29 (27%). 11 of those are marked `part (zoom)`: what they measure is right, but they run only at some zooms or only in `@deep` specs (some also have a narrower threshold than DESIGN.md, noted in the row). The other 18 miss part of the property (for example `over-line` skips the station's own lines, `overshoot` sees only a line past its mark, `step` sees only a sideways hop).
- Not checked is 75 (69%). 22 of those have a unit test on a made-up network, which does not look at the real build's output.
- The zooms `check:map` runs for lines (12, 14, 16, 17) and for names, marks and streets (z14 and z17 at 22 places; marks and streets at z17 only) leave out 9 to 11.5, 13 and 15 entirely. Six of the seven owner-reported faults are in invariants rated none; the seventh (missing end mark at z13) is rated part (zoom).
- Counting method: "full" needs a detector that tests the whole statement on the real drawn map. A `part (zoom)` row can be improved by widening `--zooms` or running `check:deep`; a plain `part` row needs a new or stricter measure.

---

## Notes

### The owner's seven faults against this matrix

| fault seen | invariant | why the checker did not see it |
|---|---|---|
| Two marks of one station not parallel | PG02 (and PG01) | No detector compares `rot` of group marks. `platform` layers are outside `duplicate` and the mark-overlap layer list. Unit test only, on a made-up station. |
| Uneven gaps between parallel rail lines | ST02 | Nothing measures perpendicular spacing of adjacent lines in a pack. `line-covered` needs one line to hide another for 4 px; unit test only. |
| Lines drift sideways after another line ends | RL10 | `slot-jump` excuses steps within 40 m of another line's end by design; no drift or lateral-offset measure. |
| A line not parallel to its platform and running past its canopy | SS02, SS03 | Platform and canopy polygons (`station-platform`, `station-canopy`) are never read by a detector. |
| A bus line and its stops drawn under rail lines | BS12 | `line-covered` excuses a bus under rail (`detect.mjs:227`) because "rail is drawn over buses"; `stray-stop` looks for stops far from their own line. The rule is in an uncommitted file header, not DESIGN.md. |
| A rail line missing its end mark at z13 | SM08 | z13 is not in `check:map`'s zooms; `dangling` is hidden by any own-line mark within 150 m (about 20 px at z13). |
| A kink that read as a break at z11 | RL09 | z11 is not in `check:map`'s zooms, and the line is continuous so `gap` would not fire anyway; `slot-jump` tests step size at joins, not slope. |

### Places where DESIGN.md disagrees with itself or with the code

- L1021, L1122 and L2455 say rail is always heavier than any bus; L1024-26 and L1653-61 let the busiest street be as wide as or wider than rail close in. The matrix follows the later and more specific text (BS10, CW07).
- L890-97 and L2896-99 want the hub's name at every zoom from 10; L2082-84 lists "Union Station has no name in a phone's opening view" as a known limit. `stations.spec` asserts the name at z10, so one of the two is stale.
- `detect.mjs` `routeJoins` default step is 1/16 of a width and the header says the build steps a thirty-second (L1394); DESIGN.md L1425 also states the 1/16 tolerance, so the two agree.
- `findings.json` `caught_by` lists kinds no detector emits (see Detectors); the recall score counts them as not caught, which is correct but hides that no rule exists for them.

### What was not extracted

Statements that are judged by a person against the rubric ("calm", "gorgeous", "every label clearly belongs to one thing", L25-29, L2454-63) have no measure and are not rows. The rubric's "Drawn on purpose" row is split into RL04, RL05, RL06, RL11 and ST02. Data statements (which routes exist, tiers, frequencies, station service) and interface behaviour are excluded as stated above.
