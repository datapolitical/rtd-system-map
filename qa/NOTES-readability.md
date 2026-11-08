# Notes: the phone screenshot, and what I actually know

Status: notes, not findings. Nothing here is a confirmed defect unless it says
"verified".

## 1. How the screenshot was read, and why I don't trust it

The configured vision model (`deepseek-v4-flash-vision-exp` via opencode-go)
returns `400 Model is unavailable` on every call. The image in
`~/.hermes/images/dashboard_20261101_193839_a2c5f718_IMG_4977.jpg` (569,232
bytes) was therefore described by `gemini-3.8-flash` through the Google key in
`~/.hermes/.env`.

That relay produced a plausible description, but it is a description of a
downscaled JPEG, not of the live page. It already got one thing wrong in a way
that matters: I took its "T" badge for a misread letter and asserted RTD has no
T line. The feed has one.

Rule from here: **the image is not evidence.** Any claim about what a rider
sees has to come from the page or the data.

## 2. Verified from data or code

- **T exists.** `routes.geojson` has `route: "T"`, "Lincoln Station to Alameda
  Station", tier frequent, `wk: 15`, 5 drawn segments. The badges are correct.
- **Rail is drawn as 30 features for 9 letters**, each with its own `slot`
  (A×2, B×3, C×4, E×6, G×3, N×2, R×3, T×5, W×2). Slots run −1.5 to +1.5 in
  steps of 0.5.
- **Lane spacing is smaller than the line.** `RAIL_WIDTH = [3, 4, 5.6, 9]`,
  `RAIL_GAP = 2`, offset = `slot × (width + gap)`. A 0.5 slot step is therefore
  2.5 px at the opening zoom, against a 3 px line: adjacent lanes overlap.
  This is the most likely cause of the striped southern trunk. Not yet
  confirmed by pixel measurement.
- **Stations paint at every zoom.** The `stations` layer has no `minzoom`
  (all other station layers do). At zoom 8.75, **224 pairs of the 77 stations
  are closer than 12 px**, and the closest are 0.5 px apart.

## 3. Spec vs what the map can do

`DESIGN.md:744` (zoom up to 10, the opening view) asks for:

> Frequent buses and corridors, each with one number. Stations.

Both parts are in tension with the scale:

- a 1.1 km corridor is **6 px** long at 8.75, so "one number" cannot be placed
  on it (MapLibre drops labels that don't fit) — measured: 0 corridor labels at
  the opening view, 2 at 11.5;
- stations are drawn as asked, but 224 near-coincident pairs means the busiest
  part of the map is a smear of dots.

The spec is not wrong about intent, it is wrong about scale. Either the opening
view has to be closer in, or those two promises have to change.

`DESIGN.md:756-765` (line-end signs) says the name is the GTFS headsign minus
the line's own name, and that lines ending together share one sign, placed on
the side covering the least track and no other sign. Worth testing directly:
the screenshot subjectively reads "A Denver Airport" as one word, but that may
be a JPEG artefact.

## 4. Things still to test, in order

1. Zoom-by-zoom: which labels and layers are actually present at 8.75, 9, 10,
   10.5, 11, 11.5, 12, 13, 14, 15, 16, 17 — against the table at
   `DESIGN.md:742-749`.
2. Whether every drawn line carries a name or number at some zoom (the V2 step
   4 "done when").
3. Whether any label is drawn outside the viewport or cut by its edge.
4. Corridor correctness against raw GTFS: every member serves every shared
   stop; combined headway no slower than the fastest member; no corridor
   shorter than 3 stops.
5. Runtime health on this branch: console errors, MapLibre style errors, missing
   glyphs, across the zoom sweep.
6. Opening-view load under mobile throttling (spec floor 2 s,
   `DESIGN.md:1067`), now with the extra corridors request.
7. Keyboard order and axe, to confirm the new layers did not regress either.


## 5. Audit results (three independent passes, 2026-11-01)

Reports: `~/.hermes/cache/scratch/audit-a/report.md` (zoom ladder),
`qa/CORRIDOR-AUDIT.md` (raw-GTFS corridor audit),
`~/.hermes/cache/scratch/audit-c/report.md` (runtime, a11y, perf, layout).

### 5a. Zoom ladder — 14 drifts, all measured
- Corridor labels: 0 at 8.75/9/10 while 67/66/32 corridor features draw.
- Union Station hub sign: 0 before zoom 11, collision-suppressed (renders if
  `city-label` is hidden). Spec wants a sign at both ends of every line from
  the opening view.
- 9 of 10 line-end signs at 8.75; the missing one is the T Line's Lincoln,
  which is inside the viewport but unplaced.
- Airport label: minzoom 10, so none at the opening view.
- "Denver" absent from the phone opening view (present at 9.0 and on desktop).
- Towns: 2 at the phone opening view, 9 at zoom 9. Villages/hamlets start 10.5.
- Campuses: no layer; only via `landmark-label` at zoom 14.
- Neighborhoods 12 (spec 11); park-n-rides and unserved stations 12.5 (spec 12);
  bus stops 15 (spec 14.5).
- No stop-name layer at all: 0 stop names at 16 and 17.

### 5b. Corridors — 17 of 67 wrong, caused by mergeCorridors()
- 17 features are two or three runs stitched end to end; no trip contains the
  whole sequence. All 17 carry a stale id. 3 overstate frequency
  (22-25 declared vs 26.9-29.3 measured). 1 claims 60 min where route 225
  alone runs every 53.
- Everything else passes: tiers, duplicates, geometry, and the whole route
  table (125 non-null headways match the feed, largest gap 0 min).

### 5c. Runtime, accessibility, performance
- Runtime clean: 42 zoom steps across 3 viewports, 0 page errors, 0 MapLibre
  errors, 0 HTTP failures, 0 missing-glyph warnings.
- axe: 0 violations. Keyboard order intact; Key reachable and toggles.
- Focus is invisible on the map canvas, the geolocate button and (desktop) the
  zoom buttons — the MapLibre ring is clipped by `overflow: hidden`.
- Load: median 6,551 ms at 1.6 Mbps / CPU 4x against the 2 s floor. Unthrottled
  baseline on this host is 2,220 ms, so the absolute number is not portable,
  but there is no headroom.
- At 320x568 the loading toast overlaps the Key button by 13x38 px.
