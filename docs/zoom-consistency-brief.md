# One map at every zoom: the problem and its constraints

Written 2026-11-26 for a holistic review of the zoomable map (v2). It sets
out what we are trying to make, how it is made today, the problem we keep
running into, what has been tried, and the limits any answer has to work
within. It does not propose a design. DESIGN.md is the source of truth for
everything here; where this brief and DESIGN.md disagree, DESIGN.md wins.

## 1. What the map is

A map of all of Denver's transit (RTD) for phones: where service goes, how
often it comes, and where you are. The full map shows a typical weekday;
Live shows the next 90 minutes. Most people use it on a phone, often on the
move.

DESIGN.md ranks six principles. When two conflict, the higher one wins:

1. Nothing a rider acts on is wrong: which line, which station, how often,
   where it goes.
2. Everything can be read, in light and in dark, on a phone.
3. How often service comes is obvious at a glance.
4. Every label clearly belongs to one thing. A label that can't be tied to
   its line or place is dropped, not nudged.
5. The map is calm, not crowded.
6. The map looks designed by a person: even packs, clean branches, lines that
   end together.

Chris's standard is a map that is both useful and beautiful, closer to a
printed transit map than to a web map with lines on it.

## 2. How it is made today

The data comes from RTD's public ArcGIS layers (the official system map) and
its GTFS feed. A build on our own machine (`npm run build:data`, then the
sheets in `scripts/lib/sheets.mjs`) turns that into finished drawings, and
its output is committed. Cloudflare Pages only publishes static files.

The front page today is five fixed drawings ("sheets") at zooms 8.75, 10, 12,
14 and 16. Each is a complete map for one scale. The build decides
everything in phone pixels at that one zoom:

- Rail lines that share track are set side by side, and the sideways shift
  is baked into each line's shape.
- Bus streets are merged, rounded and thinned by pixel rules.
- Station names, line letters, route-number lists and bus street names are
  placed by the build.

The page (MapLibre GL JS 6.15) draws those GeoJSON drawings over a base map.
The pinch snaps from one sheet to the next. Nobody ever sees a sheet at any
zoom but its own.

The base map is OpenFreeMap's vector tiles (OpenMapTiles schema) with our own
style: land, water, parks, roads, buildings at 16, street names, highway
shields and place names. OpenFreeMap decides which roads and names exist at
each zoom. Our style picks from them by sheet. The glyphs are our own, made
from the pinned Overpass font, so exact letter widths are known to the build.

## 3. The zoomable map (v2) and the trial

v2 replaces the five snapping sheets with one map you can stop at any zoom.
The roadmap is GitHub milestone "v2: One zoomable map" (#129 the plan, #154
the trial, #155 to #161 the work). The trial lives on branch
`zoom-prototype-154` at `/zoom/`. It covers zooms 12 to 16, and its write-up
is `docs/zoom-prototype.md`.

The approach chosen so far: drawings at whole zooms, each enlarged until the
next takes over, with sizes gliding in the page between them. In detail:

- **Rail:** two drawings, at 13 (serves 12 to 14) and 15 (serves 14 to 16).
  Spacing between side-by-side lines is corrected live in the page so the
  pack holds a set pixel pitch at every zoom.
- **Buses:** five drawings, at 12, 13, 14, 15 and 16. Each serves from its
  own zoom to the next.
- **Station names:** planned once over 17 quarter-zoom steps (12 to 16), so
  a name keeps its side. When a name does change side, it fades out and in.
- **Handover:** each drawing replaces the last in one frame, with no
  cross-fade. The page keeps updating while sources load.

The trial was checked on a real iPhone 17 Pro through AWS Device Farm, and
Chris reviews each round on his own phone.

## 4. The problem: the map is not one design across zooms

Each drawing is designed on its own. Nothing made neighbouring drawings
agree, and MapLibre makes a second set of decisions on top at the moment of
drawing. On the fixed sheets this never showed, because the reader jumps two
zooms at a time and sees each sheet alone. On a map you can glide through,
every disagreement between two drawings shows up as something that jumps,
blinks or changes its mind.

Chris put it this way: the issue is that we want consistent design. A
decision made once (where a label sits, what a line looks like, which
streets show) should hold as you zoom. Things should change only for a
reason, like "there's room now, so add this."

The same failure has come up in different forms. Each was fixed for its
own case:

| Seen | Cause | What was done |
|---|---|---|
| Station names jumped side between zooms (19 of 67 from 12 to 12.25) | Each drawing placed names fresh | Names planned across all quarter zooms. Now 8 side changes from 12 to 16, each faded, none lost |
| Line letters moved (only 28 of 54 stayed within 40 px from 12 to 12.25) | Placed fresh per drawing | Placed outward from 12, keeping earlier spots |
| Rail packs pulled apart or overlapped between sheets | Sideways offsets baked at one zoom | Live spacing correction in the page; two rail drawings, handing over at 14 |
| Bus route labels vanished from 13 to 14 | MapLibre lays labels out at whole zooms, so the zoom-14 drawing's labels did not fit at 13 | A zoom-13 bus drawing |
| On the phone: loading in steps, doubled rail near 14, half-faded names, Union Station's name sliding into its circles | Fades and loads not tied together | One reveal; drawings switch in one frame; names placed on the map |
| Streets went white for a moment on a fast pinch | The base map switches road sets at 13 and 15 on its own schedule | Road bands held, unseen, a zoom either side |
| Route lists appeared, vanished and came back (Chris, 2026-11-26) | Each bus drawing spaced its lists fresh, so only 20 to 33% stayed through a step | Each drawing keeps the last one's lists in place and fills between (93 to 97% stay); the build checks the page will have room |

Still open:

- **Route lists the page still hides briefly,** mostly right after a
  handover at 13 or 14. The drawing keeps the list, but MapLibre's own
  collision hides it for a moment. Some are hidden by the base map's
  neighbourhood names: that layer starts at 14 and outranks route lists, so
  it takes a spot a list already had. The causes of the others are not yet
  known.
- **Base-map names and shields:** street and place names follow
  OpenFreeMap's bands, not our drawings. On a fast pinch they can arrive
  late.
- **Other lettering:** bus street names and the streets themselves are not
  yet carried from one drawing to the next the way station names and route
  lists are.
- **Sizes:** about 20 per-sheet tables in the build and 8 or more in the
  page give one value per sheet. Trials found 16 of 21 build tables already
  fit one rule of zoom. The real per-sheet differences are street merging,
  the "far" and "near" street sets, and the on/off switches.

The underlying point: there are two deciders, our build and MapLibre, plus a
third source of decisions, the base map's own zoom bands. As long as all
three decide independently, consistency has to be patched case by case.

## 5. The trade-off Chris named

Two goals pull against each other:

- **Easy to update.** RTD changes schedules three times a year and edits its
  map in between. Routes, stops, stations and lines must flow through from
  RTD's data with no code change. DESIGN.md "Zero maintenance", Rule 1:
  nothing about the network is hardcoded; sources are discovered;
  prominence follows rules, not lists.
- **Details that look right.** A printed map looks right because a
  cartographer made specific choices for specific places. Doing that by rule
  alone sometimes means writing a general algorithm to tidy one place. For
  example, the build's platform-group logic exists for Union Station, the
  only station with more than one group.

DESIGN.md already draws a line here (Chris, 2026-11-10; issue #64, not built):

- Facts are never set by hand. That means routes, stations, frequencies,
  colours, names, and what stops where.
- A visual fix for one named place is allowed. It lives in one small file
  the build reads, names its place by RTD's own ids, and records a
  fingerprint of the geometry it was written for.
- When RTD changes that place, the fingerprint no longer matches, the fix is
  skipped, and the build log says so. A stale fix can never draw.
- A fix may move or reshape within the limits of "It looks designed": some
  meters, never onto another street or past a station. It cannot add,
  remove or rename anything.
- A general rule is still preferred where a place is one case of a pattern.

Not yet decided: whether that file also holds label placements (for
example, "this station's name goes left"), how fixes behave across zooms (at
one zoom, a range, or all), and how a fix interacts with the carry-over
rules above.

## 6. Constraints any answer must work within

Product:

- The six principles, in their order.
- Light and dark themes, both readable.
- iPhone first. Chris's phone is an iPhone 17 Pro; his Safari viewport for
  the map is 402 × 655.
- Taps explain anything.

Data and upkeep:

- No facts by hand. RTD's changes must draw correctly with no code change,
  or fail safe; a bad update never breaks the site (Rule 3).
- A person runs the build and looks at the result before it is committed
  (Rule 2). There is no unattended rebuild.
- Base-map data comes from OpenStreetMap through OpenFreeMap, which updates
  on its own schedule. Anything we take over from it, we must refresh
  ourselves.

Delivery and performance:

- Static files on Cloudflare Pages.
- Pages ignores HTTP range requests (checked on the live site), so plain
  PMTiles will not work. Pages also limits how many files a site can hold.
- Today's drawings are GeoJSON fetched on demand. One bus drawing at 15 is
  about 8,300 features and 300 KB gzipped. Each added drawing adds download
  and build time. The full trial build takes about 100 minutes, almost all
  of it placing names at the closer zooms.
- It must feel smooth on a real iPhone, including a fast pinch from 14 to 16.

Renderer (MapLibre 6.15, verified in the trial's research):

- MapLibre lays labels out, and evaluates filters and layout properties,
  only at whole zooms. Paint properties and text size glide.
- It re-runs label collision every frame. A label rotated with the map gets
  an upright collision box, which is very large on downtown's 45° grid.
- `line-offset` is one amount per feature, though it can vary with zoom and
  feature properties.
- MapLibre's label fade is off (`fadeDuration: 0`). Rotation and pitch are
  off.

Process:

- Drawing work follows `docs/refining.md`.
- Chris reviews on his phone through the review page.
- The repo is public, so keep it about the map.
- Main owns the current sheets. Shared fixes land on main first, then merge
  into the zoom branch.

## 7. What has been proposed, not decided

- **Bring the base map's lettering into our build:** place names, street
  names, highway shields. The build would become the only one placing
  labels, with exact letter widths, and the page would show what was drawn
  and drop nothing. Chris agreed in principle on 2026-11-26.
- **Draw the ground ourselves:** streets, water, parks, per drawing. We would
  choose which streets show at each zoom and smooth their shapes.
- **Letter areas and rivers the way printed maps do:** neighbourhood names
  spaced across their area, river names along the river. Today rivers and
  lakes have no names.
- **Tint landmark grounds** (hospitals, campuses, stadiums, the airport) and
  drop ordinary building outlines.
- **The one-place fix file (#64).**
- **One rule of zoom** for each size table in place of per-sheet values.

Most of these are not specific to continuous zoom. They would improve the
fixed sheets as much.

## 8. Questions for the review

1. What is the right general shape: one decider (the build makes every mark
   and label, the page only draws), or something else? What does it cost?
2. Which decisions must carry from one zoom to the next, and which may be
   remade at each zoom? What is the rule for when something may change?
3. Where should hand fixes for one place live, and how should they behave
   across zooms, so they coexist with RTD's data flowing through?
4. How much of the base map should we own (lettering, ground, both) given
   the upkeep it adds?
5. Which priorities should hold where labels compete? For example, a
   neighbourhood name against a route list. Today the neighbourhood name
   wins. DESIGN.md has a place name give way to the lines themselves, but
   it doesn't say whether that extends to the lines' route lists.
6. How should consistency be checked? A continuous map has no finite set of
   pictures to approve. The trial's current check zooms from 12 to 16 in
   tenths and flags any label that shows, goes and comes back while on
   screen.

## Where to look

- `DESIGN.md`: Principles, Objective, Zero maintenance (Rules 1 to 3), Map
  design, Basemap, Four sheets, Continuous zoom trial, Decision log.
- `docs/zoom-prototype.md`: the trial's architecture, measurements and
  limits.
- `docs/development.md`: branches. `docs/refining.md`: how drawing work is
  done.
- `scripts/lib/sheets.mjs`: the build's drawing rules.
  `scripts/zoom-prototype.mjs`: the trial's build.
- `public/js/sheets/style.js`: the sheets' style, including the base map.
  `public/js/zoom/`: the trial's page.
- Issues #129 and #154 to #161 (v2), #64 (one-place fixes), #156 (lettering
  carry-over).
- `qa/fixes/register.json`: the fault register (RTD-001 to RTD-019).
