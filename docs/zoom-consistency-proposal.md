# RTD map: one design across zooms, a proposal

Written 2026-11-26 in answer to `docs/zoom-consistency-brief.md`. It proposes
a design. Nothing has been built and no file in the repo has been changed.
DESIGN.md stays the source of truth until Chris decides.

## In short

The map changes its mind as you zoom because three programs each decide part
of the lettering: our build, MapLibre on the phone, and the base map's tile
generator. The proposal is to make the build the only one that decides.

1. The build writes one lettering plan for the whole map: every label, where
   it sits, its angle and size, and the zooms it shows at. The page draws the
   plan and decides nothing.
2. The plan follows one rule: zooming in only adds. A label on the map stays
   where it is at every closer zoom. It may change in three ways, each
   written into the plan with its reason.
3. A hand fix is a pin the plan starts from. It lives in the #64 file and
   holds for the label's whole life across zooms unless it says otherwise.
4. We own the base map's lettering and leave its ground alone. Main already
   carries its own copy of the base tiles, and they hold every name the
   build needs.
5. The first route list on a stretch of street stays ahead of a
   neighbourhood name. The name moves within its area, because it can.
6. Checks read the plan, which states what the map shows at every zoom.
   One check needs a browser: that the page drew the plan.

## What the code shows

Counted in the trial's style and the sheets' style on this branch
(`style-count.mjs`, see "Where the working is"):

| Lettering and small-mark layers | Trial page | Sheets |
|---|---|---|
| All | 83 of 147 layers | 76 of 162 |
| MapLibre decides whether the label shows | 53 | 43 |
| Always shown, but takes room from other labels | 21 | 29 |
| Always shown and takes no room: wholly the build's | 9 | 4 |
| Placed along a line by MapLibre | 47 | 45 |

In the trial MapLibre decides whether the label shows in two of every three
lettering layers. For a label placed along a line it goes further: on every
frame it tests whether the letters still fit the line as cut by the tile,
and hides the label if they do not (`src/symbol/projection.ts`,
`updateLineLabels`, in MapLibre 6.15.0). Route lists and bus street names
are drawn this way. That is a second decider even with collision switched
off.

The lettering that stopped misbehaving in the trial is the lettering the
build places completely: station names and line letters. Of the four things
the brief lists as still open, two are lettering that MapLibre or the base
map decides (route lists hidden briefly, base-map names and shields). The
other two are decisions the build still makes afresh for each drawing (bus
street names and the streets themselves, and the size tables).

Today's fix for route lists has the build copy MapLibre's collision boxes
(`roomOf`, `roomTaken`, `takeRoom` in `scripts/lib/sheets.mjs`, from line
3903) so that the page will not drop what the build kept. That is the build
imitating the second decider. It holds while the imitation is exact, and a
MapLibre update, a font change or a padding change breaks it without a
build error.

The base map's third set of decisions is in OpenMapTiles' own code, which
decides which names a tile holds at each zoom. Places that OpenStreetMap
records as neighbourhoods or quarters are left out below zoom 14 (`city.sql`
in its place layer). The larger districts it records as suburbs are in from
zoom 11. At 12 and 13 a street name is included only where OpenMapTiles
judges that it fits its line (`transportation_name.sql`). So most
neighbourhood names cannot be on the map before 14, whatever our style asks
for, and when they arrive they take spots route lists already had. Main's
committed copy of the tiles (`basemap/ground.bin`, 7,717 tiles, zooms 8 to
14) holds 59 district names at zoom 13 and 340 district and neighbourhood
names at zoom 14, and 28 street names at zoom 12, 1,370 at 13 and 32,341 at
14. The zoom-14 tiles
hold every name, so the build can read them all and decide for itself when
each one first shows.

Street merging is not carried between drawings. Each drawing merges bus
streets that are closer than a set number of pixels (`busMerge`,
`sheets.mjs` line 199), which is this far on the ground:

| Zoom | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|
| Merge distance, pixels | 7 | 7 | 7 | 15.5 | 24 |
| On the ground, metres | 103 | 51 | 26 | 29 | 22 |

The distance on the ground grows from 14 to 15. By these numbers two streets
27 m apart are two lines at 14, one line at 15 and two again at 16. I did
not look for a place where this happens.

Route lists carried between bus drawings, by a stricter test than the
brief's (same wording, distance measured in pixels at the closer zoom,
`carry-check.mjs`):

| From, to | Lists | Within 2 px | 2 to 6 px | 6 to 48 px | No match |
|---|---|---|---|---|---|
| 12 to 13 | 617 | 67% | 23% | 5% | 5% |
| 13 to 14 | 931 | 66% | 19% | 10% | 5% |
| 14 to 15 | 1,592 | 73% | 18% | 5% | 4% |
| 15 to 16 | 2,654 | 69% | 20% | 6% | 5% |

Counting everything within 48 px as staying gives 95 to 96%, in line with
the brief's 93 to 97%. Some of the lists with no match are meant: a merged
trunk's list is replaced by the lists of the streets it splits into. Nothing
in the build's output says which, so no check can tell a meant change from a
fault.

Two measurements make the proposal practical. From zoom 12 to 16 the map
grows sixteen times while a route list grows from 8.5 to 11.5 px and a
station name from 11.5 to 14.5, so labels that fit at a drawing's zoom
nearly always still fit at the next drawing, and the page has nothing to
decide in between. And 84 to 94% of route lists (78 to 89% of bus street
names) sit on a stretch that strays 2 px or less from a straight line
(`straight.mjs`), so most can be drawn as a straight label at a point, which
MapLibre draws exactly where it is told.

## 1. One decider?

Yes, and it should be the build.

The build writes a lettering plan. Each label in it has an id that stays the
same across zooms and rebuilds (made from what it names: RTD's ids, the
street, the place, and which copy), its kind, wording, place, angle and
size, the first and last zoom it shows at, the label it took over from if
any, the reason for any change, and whether it is pinned. Station name
placings already carry a stable id and a measured box (`sheets.mjs` line
4055); the plan extends that to every label.

The page draws the plan with MapLibre's overlap handling switched off on
every lettering layer (`text-allow-overlap` and `text-ignore-placement`,
and the same for icons). Labels are points that carry their own angle
(`text-rotate` with `text-rotation-alignment: map`), not labels placed along
a line. The unseen keep-off layers go. In MapLibre 6.15.0 a label set this
way is always shown: `placement.ts` forces it visible whether or not it was
placed (`alwaysShowText`, lines 458 to 473 and 845 to 847). What MapLibre
still does is load tiles and glyphs and lay text out at whole zooms.

A list on a bent stretch is first slid to a straighter part of the same
stretch. Where there is none, it is drawn along a short path the build cut
for it (`symbol-placement: line-center`). MapLibre can still drop or hide
that kind, so the build checks that the letters fit the path at the largest
size, and the check that the page drew the plan covers it.

A label that starts at a drawing's zoom needs nothing new: a layer's
`minzoom` and `maxzoom` are exact at fractions of a zoom. A label that must
start between drawings is switched on by its id (feature-state opacity, 0 or
1). A filter on zoom cannot do this, because MapLibre evaluates filters only
at whole zooms.

Inside the build, every placer reads and writes one shared record of taken
room per drawing, in priority order. Today there are separate tests that do
not see each other: the ink grid for names, `roomGrid` for lists,
`onSquare`, `onStop`, `listedOn`, `again`, `oneTile`, and in the page the
keep-off layers. A bitmap of taken pixels is the known fast way to hold such
a record (Kittivorawong and others, 2020).

Tapping a route needs no new decisions. Its labels are already in the plan,
drawn in a stronger ink, and a name that crosses the picked line takes the
second place the build already gives it. Live vehicles stay as they are;
they are not lettering.

The two other shapes, and why not:

- Keep two deciders and keep teaching the build to imitate MapLibre. This is
  today's path. Each kind of lettering needs its own imitation, each breaks
  without notice when MapLibre or a font changes, and the base map stays a
  third decider.
- Give all placement to the page, as general-purpose web maps do. MapLibre
  decides again on every frame from a priority order alone. It cannot hold a
  decision from one zoom to the next, cannot keep a list on every stretch of
  street, and a person cannot look at its result before it is committed
  (Rule 2). Mapbox's stated reasons for placing on the device are rotation,
  tilt, several data sources and speed. This map has rotation and tilt off
  and one source of truth.

What it costs:

- New build code to place the base map's street names, place names and
  highway shields.
- Build time. The trial build takes about 100 minutes and this adds
  lettering to place. The shared record of room should take time off, and I
  have not measured either.
- A mistake shows as two labels on top of each other, where today a label
  quietly goes missing. The plan check has to fail the build on any overlap.
- No gain in speed on the phone. With MapLibre's fade off it runs its
  placement pass on every frame even when nothing can collide
  (`style.ts` line 1971).
- The build's letter widths must match the phone's. The build already
  measures text from the same glyph files the page loads
  (`scripts/glyphs.mjs`). A glyph file that fails to load on the phone would
  change widths.
- Main must be merged into the zoom branch first. The branch is 11 commits
  behind main, and main's base tiles are among them.

The precedent is research, not a shipped product. Been, Daiches and Yap
(2006) place and select every label beforehand, so that "no label conflict
computations are performed in the interaction phase". Vector tile schemas
(Mapbox Streets, OpenMapTiles, Tilezen) decide ranks and first zooms
beforehand and leave collisions to the device. I found no shipped vector web
map that documents placing all of its lettering beforehand. The nearest
evidence is this map's own station names.

## 2. What carries, and when something may change

The rule: zooming in only adds. Whatever is on the map at one zoom is on the
map at every closer zoom, in the same place against the thing it names,
saying the same or more.

A label may change in three ways. Each happens at one zoom and is written
into the plan with its reason.

1. It appears, because there is room now.
2. It hands over to a more detailed drawing of the same thing, which starts
   where it was. A merged trunk's list hands over to the lists of its
   streets, and a short name to the full name. The plan links the old label
   to the new ones.
3. It gives way to something that outranks it and moves the least it can,
   once.

Anything else is a fault, and the check counts it.

What carries: which streets, routes, stops and names show; which side a
label sits on and where along its stretch; the steps of its wording; the
order of lines in a pack; and which streets are drawn as one. What is worked
out afresh at each zoom is only what follows a rule of zoom (sizes, widths,
spacing, #155) and the new labels that fill the room left.

The plan is made rank by rank, then from far to near. The top ranks (rail
station names, line letters) are placed for every zoom first. Each lower
rank then takes places that stay clear of everything above it for the
label's whole life, at this zoom and every closer one. A list placed at 12
then never sits where a neighbourhood name will need to be at 14, or the
name finds a spot clear of the list, whichever of the two ranks higher.
Within a rank, labels carried from the farther zoom claim their room before
new ones. This is the rule Been and others set out and did not build (a
label active in one level "should be given a high enough priority" in the
next "so that it will also be active" there), and it is what the trial
already does for station names, line letters and, since today, route lists.
The change is to do it through one mechanism for every label and to record
why each change happened.

Street merging needs the same treatment. Each drawing's groups of merged
streets should split the groups of the drawing before it and never join
across them, so two streets that have separated stay separate.

This also steadies the map between RTD's updates. A fixed order, ties broken
the same way every time and ids that persist mean a small change by RTD
makes a small change to the plan. The build can report how many labels moved
since the last committed plan, for the person who looks at each build
(Rule 2).

Mapping agencies split on method. Some derive every scale from the base
data and some derive each from the one above, and the one controlled test I
found (USGS: Buttenfield, Stanislawski and Brewer, 2011) found no overall
winner. What it did call mandatory is the property proposed here: features
removed at one scale "do not suddenly reappear" at the next. The recent
work on maps made for zooming (Courtial and Touya, 2024) prefers a method
that "orders the transformations and then decides at which zoom level each
transformation occurs", which is what a plan of recorded changes is, and
asks that changes be spread so that no one step between zooms "contains
huge changes". Neither paper tests this on a transit map.

## 3. Hand fixes

They live in the #64 file, extended to hold label decisions as pins.

A pin is something the plan starts from. Pins are placed first, carried
labels give way to pins, and new labels give way to both. Two pins that
conflict stop the build with a message naming both.

A pin holds for the label's whole life across zooms. That is the default
because it is the consistency rule. A pin may name a zoom range instead, and
then each end of the range is a change that shows in the change report like
any other.

A pin may choose a label's side, its place along its stretch, the first zoom
it shows at, or drop one copy of a repeated label. It may not add a label,
remove the only label a thing has, or change wording.

It names its label by RTD's ids, as #64 says: a station id, or route ids
with the stops at each end of the stretch. A base-map name has no RTD id, so
it is named by its text and kind, and its position goes in the fingerprint.

The pin is skipped and reported when its fingerprint no longer matches, as
#64 says. The same happens when its id is no longer in RTD's data, and when
the pinned place fails a check every label must pass (on rail, on a station,
on another pinned label). The fingerprint is of RTD's geometry, which is the
same at every zoom, so one fingerprint covers the pin's whole range.

The build reports how many pins are live. Esri's guidance on its own
overrides is that "numerous overrides on a map is an indication that your
current set of rules is inadequate". DESIGN.md already prefers a rule where
a place is one case of a pattern.

One entry:

```json
{
  "what": {
    "kind": "station-name",
    "station": "<RTD station id>"
  },
  "set": { "side": "left" },
  "why": "Right side hits the hall's name",
  "fingerprint": "<hash of mark and lines>",
  "issue": 64
}
```

Mapping agencies that automate their maps either allow no hand edits in the
automated step and rerun everything (Kadaster) or keep hand work as a last
step (swisstopo, IGN). IGN and USGS both name a missing permanent id for
each object as what blocks carrying hand work through an update. The #64
design answers that with RTD's ids and the fingerprint.

The nearest mapping precedent is Esri's feature-linked annotation, which
keeps its place against its feature and is thrown away and placed again by
rule when the feature's shape is edited. Esri's overrides have no check
that they are out of date. The one mapping mechanism I found that has such a
check is Ordnance Survey's: a permanent id for each feature and a version
number that rises on any change. The fingerprint does the same job without
needing RTD to number its versions, and it is the ordinary practice in
software (git refuses a patch when the lines around it have changed).

Every precedent I found ties a hand edit to one scale. None spans a range
of scales, so the whole-life default is this proposal's own reasoning from
the consistency rule and has no source behind it.

## 4. How much of the base map to own

The lettering, now. The ground, not now.

Lettering adds no new source to keep up. Main already builds and commits its
own copy of the base tiles (`npm run build:basemap`, about 40 minutes,
`docs/upkeep.md`), and the names are in them. The build reads the names and
decides their zooms and ranks, and the page's tiles then need no name layers
at all. One thing to handle: the pack keeps only what the style draws
(`groundNeeds` in `scripts/lib/basemap.mjs`), so once the style stops
drawing names the pack would drop them. The build's own needs have to be
declared, or the names kept in a file only the build reads.

Drawing the ground ourselves is the larger job: choosing which streets show
and smoothing their shapes, per drawing. It is not the cause of any fault
still open in the brief. The one ground fault seen, streets going white on a
fast pinch, was fixed by holding the road bands. It can be taken up once the
plan is in, and the same rule would then govern which streets show.

Lettering areas and rivers the way printed maps do is a separate piece for
later. The pack keeps no water or park names today. The tiles give a
neighbourhood as a point, not an area, so spacing a name across its area
needs a source of neighbourhood outlines the project does not have yet.

Tinting landmark grounds and dropping building outlines does not depend on
any of this. It is a style change that can be made on main at any time.

## 5. Which label wins

DESIGN.md today ("Four sheets"): a place's name gives way to rail, line
letters and station names, sits over bus streets, "and route numbers give
way to it".

Proposed, for labels arriving at a zoom, strongest first:

1. Rail station names
2. Line letters
3. Hall and bus station names
4. The first route list on each stretch of bus street
5. City and neighbourhood names
6. Further copies of a route list
7. Bus street names
8. Base-map street names
9. Highway shields

The change from today is line 4. The first list on a stretch is how a rider
tells which routes run on that line, and it can only be on that stretch.
A neighbourhood name can sit anywhere near the middle of its area. DESIGN.md
gives the same reason for putting lines ahead of place names: "a name can
move where a line can't". Further copies of a list stay below the name, so
the name is not crowded out by repetition.

The neighbourhood name also changes how it competes. Today it is one fixed
point with one chance, so it either takes its spot or is dropped, and that
comes from how MapLibre places a point label. In the plan the build tries
several places within the area and takes the first that is clear. If none
is, the name first shows at the next closer zoom.

Because the plan looks ahead (section 2), this order should rarely be
called on. It decides the cases where a list and a name cannot both fit.

No source answers this question, and none discusses lists of route numbers
on streets at all. What the sources say points one way. An area name is the
label with freedom: Ordnance Survey, Penn State's cartography course and
Transport for London's street map standard all describe spreading it across
its area and moving it into free ground. Where TfL's standard lets one name
displace another, the name dropped is of the same kind, and "the road names
should still be shown". The transit sources quieten background names so
routes stay on top: Jarrett Walker on TriMet's 2015 map, where the old one
had text "overlapping the most important features (the transit routes)". The
argument the other way is orientation. The designer Ilya Birman said of
Vignelli's New York subway map, which showed no geography, that "the eye
had nothing to catch on". That is a reason to keep neighbourhood names on
the map, which this order does. It is not a reason for them to take a
list's place.

TfL sets its area names translucent so that they may lie across other
things. That would end the competition for room altogether, and it would
change how the map looks, so I have not proposed it.

## 6. How to check

Check the plan. With one decider it is a complete statement of what the map
shows at every zoom, so most checks are arithmetic on it, over the whole
district, with no browser.

1. Nothing overlaps: label on label, label on rail or a station. Tested at
   each drawing's zoom and each quarter zoom between.
2. Zooming in only adds. Every label shows over one unbroken stretch of
   zooms. Every label at one zoom is at the next, within 2 px of its place
   and with the same or longer wording, or the plan records its hand-over
   or its giving way. The check reports the count of each kind of change.
   The count of labels giving way has a ceiling, set from the first full
   run and only ever lowered. A step between zooms with far more changes
   than the steps beside it is flagged.
3. No stretch of bus street runs further without a list than its spacing
   rule allows (`busLabelEvery`).
4. The page drew the plan. At sampled places and zooms, compare what
   MapLibre reports as drawn (`queryRenderedFeatures`) with the plan: every
   label present, in its place, its width within a pixel or two. This is the
   one check that needs a browser.
5. Known faults stay pinned in `qa/recall/finds.json`. A check that reports
   nothing at a known fault is broken.
6. Pictures are for eyes. The plan check picks the worst places (the most
   crowded, the largest moves) for the agent's visual review (#160) and for
   Chris. A real phone is for smoothness only.

The trial's sweep from 12 to 16 in tenths stays as a regression test of the
page. It catches what the plan cannot know about, such as a tile arriving
late.

The parent links in section 2 are what make check 2 possible. Without them
the 4 to 5% of lists with no match in the table above cannot be sorted into
meant and not meant.

Check 2 is the published form of the rule. Barth and others (2016) write
Been's rules as intervals: a labelling is valid when each label has "at
most one activity interval" while it is in view and no two shown labels
overlap. In their tests the strictest version, where a label never changes
state while in view, showed 3 to 12% less than looser ones. Their data was
place names for car navigation, not a transit map. The reason every change
carries a recorded reason is the mapping agencies' own experience of rule
checking: "Violation may be intended", and a score for one rule is a poor
guide to the whole (Stoter and others, 2011). I found no published measure
for a whole sweep of zooms and no number for how much change in one step a
reader notices, so the 2 px, the ceiling and the flag are design choices.

## The brief's other proposals

- Base-map lettering in our build: yes, it is the centre of this proposal.
- Drawing the ground ourselves: not now (section 4).
- Lettering areas and rivers: later, and it needs names and outlines we do
  not hold yet.
- Tinting landmark grounds: independent, any time.
- The one-place fix file (#64): yes, extended to pins (section 3).
- One rule of zoom for each size table (#155): yes. It is part of what
  carries (section 2).

## The work, in order

Chris ranks these. The order below is the one I would take, because step 1
tests the riskiest assumption before the larger work starts.

| Step | What | Size | Issue |
|---|---|---|---|
| 0 | Merge main into the zoom branch | small | |
| 1 | Trial at 13 and 14: route lists as point labels the build places, overlap handling off for them. Done when every planned list shows at every tenth of a zoom from 13 to 15 at downtown and one suburban place, nothing overlaps, and it holds on the phone | small | #156 |
| 2 | The plan's format, with parent links, and the plan checks | medium | #159 |
| 3 | One record of taken room in the build | medium | #156 |
| 4 | Base-map lettering in the build, neighbourhood names first | large | #156 |
| 5 | Street merging that only splits; one rule of zoom per size table; whole zooms | medium | #155, #157 |
| 6 | Pins | medium | #64 |
| 7 | All of 12 to 16, the page, visual review, close | medium | #158, #160, #161 |

Sizes are by how much new code each needs against how much it reuses. Step 4
is the largest because the base map has far more names than the map's own
lettering (32,341 street names at zoom 14 against 1,592 route lists) and
the build has never placed them.

## Not tested

- Nothing here was run in a browser. What MapLibre does is from reading its
  6.15.0 source.
- Whether the build's letter widths match the phone's to the pixel for every
  label.
- How lists on bent stretches look as straight labels, and how many need the
  path fallback.
- Build time with the base map's lettering added.
- The phone's cost when every label in view is always drawn.
- File sizes once names leave the page's tiles and the plan is added.
- A place where street merging flips between 14, 15 and 16. The arithmetic
  says it can happen.
- The causes of the briefly hidden lists the brief calls unknown. The
  proposal removes the mechanism that hides them and does not explain each.

## Where the working is

Scratch files, not in the repo, in `qa/.scratch/consistency/` of the
`zoom-154` worktree:

- `RESEARCH-C.md`: how mapping agencies and web maps keep scales
  consistent, who decides, hand corrections, which label wins and how to
  check, with a source list that marks each source read in full, read in
  part, seen as a snippet or not opened.
- `RESEARCH-D.md`: what MapLibre 6.15.0 still decides with collision off,
  with file and line for each claim and a list of what was not verified.
- `tools/style-count.mjs`, `tools/ground-count.mjs`, `tools/straight.mjs`,
  `tools/carry-check.mjs`: the counts above.
- `omt/`: the OpenMapTiles files quoted (master at 6c11838).

The earlier research (`RESEARCH-A.md` on label consistency, `RESEARCH-B.md`
on MapLibre and delivery) is in `qa/.scratch/continuous-zoom/` of the
`full-system-view` worktree.

## Sources

Read in full or in the parts quoted unless marked.

- Been, Daiches, Yap. Dynamic Map Labeling. IEEE TVCG, 2006.
  [cs.nyu.edu](https://cs.nyu.edu/visual/home/pub/infovis06.pdf)
- Buttenfield, Stanislawski, Brewer. A Comparison of Star and Ladder
  Generalization Strategies. ICA workshop, 2011.
  [kartographie.geo.tu-dresden.de](https://kartographie.geo.tu-dresden.de/downloads/ica-gen/workshop2011/genemr2011_Buttenfield.pdf)
- Kittivorawong, Moritz, Wongsuphasawat, Heer. Fast and Flexible Overlap
  Detection for Chart Labeling with Occupancy Bitmap. IEEE VIS, 2020.
  [idl.uw.edu](https://idl.uw.edu/papers/fast-labels) (search summary only)
- MapLibre GL JS 6.15.0 source: `src/symbol/placement.ts`,
  `src/symbol/projection.ts`, `src/symbol/symbol_layout.ts`,
  `src/symbol/quads.ts`, `src/style/style.ts`, `src/style/style_layer.ts`.
  [github.com](https://github.com/maplibre/maplibre-gl-js/tree/v6.15.0)
- OpenMapTiles source, under `layers/`: `place/city.sql` and
  `transportation_name/` `transportation_name.sql`.
  [github.com](https://github.com/openmaptiles/openmaptiles)
- Mapbox GL native wiki, Collision Detection (fetched summary).
  [github.com](https://github.com/mapbox/mapbox-gl-native/wiki/Collision-Detection)
- Mapbox Streets v8 reference (fetched summary).
  [docs.mapbox.com](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)
- Esri ArcMap, Understanding representation overrides (fetched summary).
  [desktop.arcgis.com](https://desktop.arcgis.com/en/arcmap/latest/map/working-with-layers/understanding-representation-overrides.htm)
- Esri ArcMap, About editing feature-linked annotation (fetched summary).
  [desktop.arcgis.com](https://desktop.arcgis.com/en/arcmap/latest/manage-data/creating-new-features/about-editing-feature-linked-annotation.htm)
- Curtinot (IGN France). Recent developments at IGN France. 2015.
  [kartographie.geo.tu-dresden.de](https://kartographie.geo.tu-dresden.de/downloads/ica-gen/symposium2015/Amsterdam_NMA_Meeting_IGNFrance.pdf)
- van Altena, Post, Nijhuis, Stoter (Kadaster). Generalisation of 1:50k
  roads centrelines. 2013 (read in part).
  [kartographie.geo.tu-dresden.de](https://kartographie.geo.tu-dresden.de/downloads/ica-gen/workshop2013/genemappro2013_submission_18.pdf)
- Käuferle (swisstopo). New national maps for Switzerland. 2015.
  [cartography.tuwien.ac.at](https://cartography.tuwien.ac.at/eurocarto/wp-content/uploads/2015/09/7_4_ppt.pdf)
- Courtial, Touya. Strategies for pan-scalar map generalisation. ICA
  Abstracts 7, 2024.
  [ica-abs.copernicus.org](https://ica-abs.copernicus.org/articles/7/25/2024/ica-abs-7-25-2024.pdf)
- Barth, Niedermann, Nöllenburg, Strash. Temporal Map Labeling: A New
  Unified Framework with Experiments. 2016 (read in part).
  [arxiv.org](https://arxiv.org/pdf/1609.06327)
- Stoter and others. ICA tutorial, lecture 4: Constraints in requirement
  analysis and evaluation. 2011 (read in part).
  [kartographie.geo.tu-dresden.de](https://kartographie.geo.tu-dresden.de/downloads/ica-gen/tutorial2011/4-Evaluation_ICATutorial.pdf)
- Transport for London. Street map design standard, issue 2. 2011 (read in
  part; it is for walking maps).
  [content.tfl.gov.uk](https://content.tfl.gov.uk/tfl-street-map-design-standard-issue-02.pdf)
- Ordnance Survey. Text on maps (fetched summary).
  [docs.os.uk](https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps)
- Penn State GEOG 486. Label Placement (fetched summary).
  [courses.ems.psu.edu](https://courses.ems.psu.edu/geog486/node/557)
- Walker. Portland: New Transit Map Underscores Frequent Network. Human
  Transit, 2015 (fetched summary).
  [humantransit.org](https://humantransit.org/2015/10/new-trimet-map-focuses-more-heavily-on-the-frequent-network.html)
- Smashing Magazine. Things To Keep In Mind When Designing A Transportation
  Map. 2017 (fetched summary; the Birman quotation).
  [smashingmagazine.com](https://smashingmagazine.com/2017/07/transportation-map-design)
- Ordnance Survey. OS MasterMap Topography Layer: feature lifecycles and
  tracking change (fetched summary).
  [docs.os.uk](https://docs.os.uk/os-downloads/products/maps-and-imagery-portfolio/os-mastermap-topography-layer/os-mastermap-topography-layer-technical-specification/feature-lifecycles-and-tracking-change)
- git-apply documentation (fetched summary). [git-scm.com](https://git-scm.com/docs/git-apply)

Looked for and not found, or not opened: Imhof (1975) and Wood (2000) in
full; any transit agency's rule for neighbourhood names against route
numbers; any shipped web map that documents placing all lettering
beforehand; any published check of label stability across a sweep of zooms;
Touya and Girres, ScaleMaster 2.0 (blocked). The full lists are in the two
research files.
