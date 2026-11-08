# Findings — v2 map, measured and seen

Date: 2026-11-01. Branch `feat/v2-finish` at `9d3f347`. Server on 8830
(`PORT=8830 node qa/scripts/serve.mjs`); map queries against an instrumented
copy on 8831 (`bash qa/vision/setup-copy.sh`), which is `public/` plus one line,
`window.__map = map;`. Nothing under `public/`, `scripts/`, `test/` or
`DESIGN.md` was modified. Raw outputs are in `qa/vision/results/`.

Severity: **high** = the map breaks a stated acceptance test or the quality
floor; **medium** = a rider sees something wrong or unnamed where the design
promises otherwise; **low** = cosmetic or a spec drift of half a zoom step.

## Summary

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F-01 | high | 85 corridors are drawn, 0 are numbered at the opening view | `opening.mjs` |
| F-02 | high | 4 frequent routes have no number on the phone opening (121, 17, 73, FREE); 3 on desktop (121, 15L, FREE) | `opening.mjs`, `missing-labels.mjs` |
| F-03 | medium | Union Station's hub sign never renders at the opening view (both viewports) | `suppression.mjs` |
| F-04 | medium | "Denver" is absent from the phone opening view | `suppression.mjs`/`denver.mjs` |
| F-05 | medium | The T line's Lincoln end sign is missing on the phone opening (9 of 10 signs) | `opening.mjs` |
| F-06 | medium | No stop names at zoom 16+; the spec's last table row is unimplemented | `zooms17.mjs` |
| F-07 | medium | Shared rail lanes overlap by 0.5–3.5 px instead of leaving the promised gap | `main.js:33-74` arithmetic |
| F-08 | medium | 67 station dots at the opening view, 32 pairs under 12 px, closest 2.1 px | `density.mjs` |
| F-09 | medium | Keyboard focus is invisible on the map canvas | `focus-pixels.mjs` + `focus-diff.py` |
| F-10 | low | MapLibre control focus ring is clipped and falls below contrast | `focus-diff.py` |
| F-11 | low | Loading toast overlaps the Key button at 320 px | `a11y.mjs` |
| F-12 | low | Place labels and one rail sign are cut by the viewport edge | `edge-labels.mjs` |
| F-13 | low | Five zoom-ladder drifts (neighborhoods, park-n-rides, stops, campuses, airport label) | `zoom-sweep.mjs`, `basemap.js` |
| F-14 | high | Usable map at 4,368 ms median against a 2,000 ms floor | `perf.mjs` |

---

## F-01 — Corridors are drawn but never numbered at the opening view (high)

**What a rider sees.** At the opening zoom the map draws 85 merged corridor
lines — 40 of them "every 15 minutes or better" — and not one carries a number.
The numbers arrive at 11.5 and vanish again at 13.

**Reproduce.**

```
node qa/vision/opening.mjs 390 844
node qa/vision/opening.mjs 1440 900
```

**Real output** (phone; desktop identical for corridors):

```
"corridors": 85, "corridor-labels": 0,
"corridorFeatures": 85, "corridorLabels": 0,
"corridorTiers": {"frequent": 40, "every30": 32, "hourly": 13}
```

At 11.5, where the numbers are supposed to exist, only a fraction place. Centred
on Union Station: phone `corridors 12, corridor-labels 2`; desktop `corridors
29, corridor-labels 5` (`qa/vision/opening.mjs 390 844 11.5 -105.0,39.7528`).
At the desktop opening centre it is `corridors 9, corridor-labels 3`
(`qa/vision/results/sweep-desktop.json`).

**Cause.** `public/js/main.js:423` sets `minzoom: CORRIDOR_LABELS_FROM` and
`:59` defines that as 11.5; `:424` stops them at 13. The comment at `:415-418`
says this is deliberate — "at that zoom a corridor is a few pixels long and the
numbers cannot fit" — but `DESIGN.md:744` still promises "Frequent buses and
corridors, each with one number" at the opening view, and the V2 step 4
done-when (`DESIGN.md:1254-1255`) says every line drawn must have a name or number
in the opening screenshot. One of the two has to change; today the spec is
false.

## F-02 — Frequent routes drawn without a number at the opening view (high)

**What a rider sees.** Of the 21 routes that run every 15 minutes or better, 4
have no number anywhere on the phone opening view: **121, 17, 73, FREE**. On
desktop 3 are missing: **121, 15L, FREE**. All four phone labels sit inside the
viewport; they are dropped by collision, not by geometry.

**Reproduce.**

```
node qa/vision/opening.mjs 390 844
node qa/vision/missing-labels.mjs
```

**Real output.** Phone:

```
"busRoutes": 108, "busNamed": 17
busUnnamed (frequent only): 121, 17, 73, FREE
```

Desktop: `"busNamed": 18`, missing 121, 15L, FREE. Labels exist for every
frequent route (`labels.geojson`: 21 `kind:"bus"` features, exactly the 21
frequent routes). Setting `text-allow-overlap: true` on `bus-tags-region`
renders all 21:

```
"allowOverlap": ["0","0L","105","121","15","153","15L","16","17","21","30","31",
                 "40","43","73","83","BOND","FF","FREE","JUMP","SKIP"]
```

so the cause is collision, not missing data. `DESIGN.md:1250-1251` promises "one tag
per frequent route at the opening zoom"; `:1151` requires every drawn line to
carry a name or number in the opening screenshot on phone and desktop.

## F-03 — Union Station's hub sign never renders at the opening view (medium)

**What a rider sees.** Seven rail lines end at Union Station and the hub sign
that should name them all is absent from both opening views. It appears only
from zoom 11.

**Reproduce.**

```
node qa/vision/suppression.mjs
```

**Real output.**

```
baseline            hub: []
hidden city-label   hub: ["Union Station"]     bus: [... "121" ...]
hidden line-signs   hub: []
```

Hiding `city-label` reveals the sign, so the city label is taking its space.
`main.js:533` gives `hub-signs` no minzoom; it is present in the style and lost
to collision. The comment at `main.js:521-523` says this is deliberate — "The
hub, where most lines end, gives way to the city it's in" — but `DESIGN.md:762-763`
requires one ink sign at Union Station from the opening view. As with F-01, the
code and the spec disagree, and the spec is the one that is published.

## F-04 — "Denver" is missing from the phone opening view (medium)

**What a rider sees.** The phone opening view labels Aurora, Boulder,
Broomfield, Longmont and Thornton — and not Denver, the city the map is of.
Desktop shows it.

**Reproduce.**

```
node qa/vision/denver.mjs
```

**Real output.**

```
baseline            city: ["Aurora","Boulder","Broomfield","Longmont","Thornton"]
hidden line-signs   city: ["Aurora","Boulder","Broomfield","Denver","Lakewood","Longmont","Parker","Thornton"]
```

Hiding the line-end signs brings Denver, Lakewood and Parker back: the signs win
the space. `DESIGN.md:1255` names "downtown" as one of the things that must be
labeled in the phone opening screenshot.

## F-05 — The T line's Lincoln end sign is missing on the phone opening (medium)

**What a rider sees.** Nine of ten rail end signs place on the phone; the T
line's southern end, "Lincoln", is not among them, although its anchor
(`-104.8696, 39.5458`) is inside the phone viewport. On desktop all ten place.

**Reproduce.**

```
node qa/vision/opening.mjs 390 844   # signNames: 9, no Lincoln
node qa/vision/opening.mjs 1440 900  # signNames: 10, Lincoln present
```

**Real output.** Phone `signNames`: 124th – Eastlake, Alameda, Denver Airport,
Jeffco, Mineral, Peoria, RidgeGate, Westminster, Wheat Ridge Ward. Desktop adds
Lincoln. `DESIGN.md:744` requires "a sign at both ends of each line", and `:765`
says phones open wide enough to show them all.

## F-06 — No stop names at zoom 16+ (medium)

**What a rider sees.** Zooming to a busy corner at 17 shows stop dots and route
tags but no stop names, and no list of the routes serving each stop. The last
row of the spec's zoom table is simply not implemented.

**Reproduce.**

```
node qa/vision/zooms17.mjs
```

**Real output** at zoom 17 over Civic Center (`-104.9903, 39.7392`):

```
"stopCount": 3,
"textLayersOnStopsSource": 0,
"sampleStops": ["Court Pl & 14th St","W Colfax Ave & Bannock St","W Colfax Ave & 14th St"]
```

`main.js:319-329` adds `stops` as circles only; no symbol layer reads the stops
source. `DESIGN.md:749`: "Stop names, with the routes that serve each stop."

## F-07 — Shared rail lanes overlap instead of leaving a gap (medium)

**What a rider sees.** Where lines share track on adjacent half-slots — 13 of
30 rail features sit on a half slot (0.5, 1.5, −0.5, −1.5) — lanes bleed into
each other; at zoom 16 a lane sits 3.5 px inside its neighbour. The
comment at `main.js:26-28` says lines "run side by side with a white gap between
them"; the arithmetic says otherwise.

**Reproduce (arithmetic on the shipped constants).**

```
public/js/main.js:33  RAIL_WIDTH = [3, 4, 5.6, 9]   // at zoom 9, 11, 13, 16
public/js/main.js:40  RAIL_GAP = 2
public/js/main.js:74  railOffset = slot * (width + RAIL_GAP)
```

Slots step by 0.5, so the centre-to-centre distance is `0.5 * (w + 2)`. For a
line in the top frequency band (≤15 min, the usual case on shared track):

| Zoom | Width w | Lane step | Overlap |
|---|---|---|---|
| 9 | 3.0 | 2.5 px | 0.5 px |
| 11 | 4.0 | 3.0 px | 1.0 px |
| 13 | 5.6 | 3.8 px | 1.8 px |
| 16 | 9.0 | 5.5 px | 3.5 px |

The white casing is `w + 3` wide (`main.js:285`), so casings overlap more than
the lines do. Not separately pixel-measured; the constants are unambiguous.

## F-08 — Station dots collide into a smear at the opening view (medium)

**What a rider sees.** 67 station marks in one phone screen, with 32 pairs
closer than 12 px and 10 closer than 8 px; the closest two are 2.09 px apart, so
downtown reads as a blob rather than a set of stations.

**Reproduce.**

```
node qa/vision/density.mjs "" "" 390 844
```

**Real output.**

```
{"stations":67,"pairsUnder12px":32,"pairsUnder8px":10,"minDistance":2.09,...,"zoom":8.752}
```

At 11.5 the same measure is clean (`minDistance 13.9`, 0 pairs under 12 px), so
this is specific to the opening view, where `DESIGN.md:744` explicitly asks for
"Stations".

## F-09 — Keyboard focus is invisible on the map canvas (medium)

**What a rider sees.** Tabbing into the map moves focus to the canvas, but
nothing on screen changes.

**Reproduce.**

```
node qa/vision/focus-pixels.mjs
python3 qa/vision/focus-diff.py canvas
```

**Real output.**

```
canvas  changed_px=5  blue_focused=2273  blue_unfocused=2273
```

Computed style is `outline: solid 2px rgb(31,111,235)` with `outline-offset:
2px` on a canvas at `(0,0,390,844)` — the ring occupies the 2 px band from −4 to
−2 px outside the element, entirely off-screen. Five changed pixels is noise.
(`:focus-visible` in `app.css:55-57` is correct; the geometry is what defeats
it.)

## F-10 — Control focus ring is clipped and low-contrast (low)

**What a rider sees.** The geolocate and zoom buttons get a faint pale-blue
inner glow when focused, not a ring; the outer half of MapLibre's glow is cut
off by the control group's `overflow: hidden` and rounded corners.

**Reproduce.** `node qa/vision/focus-pixels.mjs && python3 qa/vision/focus-diff.py geolocate zoomin deskzoom`

**Real output.**

```
geolocate  changed_px=244   blue_focused=0    (pale #c4e2f7 glow on white)
zoomin     changed_px=952   blue_focused=162  (13 device px of #0f9cff at the edge)
deskzoom   changed_px=952   blue_focused=162
```

`#c4e2f7` on white is about 1.3:1 — below the 3:1 WCAG 2.4.11 asks of a focus
indicator. The Key button is fine: solid 2 px `#1f6feb`, fully visible.

## F-11 — Loading toast overlaps the Key button at 320 px (low)

**Reproduce.** `node qa/vision/a11y.mjs` (see `toast320`).

**Real output.**

```
toast [80,16,160,55]  key [12,10,81,44]  overlap [13,38]
```

A 13 × 38 px overlap at 320 × 568, while the toast says "Loading the network…".

## F-12 — Labels cut by the viewport edge (low)

**What a rider sees.** Half-words at the edges of the phone view.

**Reproduce.**

```
node qa/vision/edge-labels.mjs 390 844 "" "" 50
node qa/vision/edge-labels.mjs 390 844 14 -105.0,39.7528 50
```

**Real output** (anchors in CSS px, canvas 390 wide):

- opening: `Boulder` x=8, `Hudson` x=393, `Denver Airport` sign x=374,
  `BOND`/`SKIP` x=18.
- zoom 14: `Ball Arena / Elitch Gardens Station` x=−31, `Auraria West Campus
  Station` x=−56, `18th St / Stout Station` x=416.

An anchor outside the canvas means the label is clipped, not merely near the
edge. `symbol-avoid-edges` is not set on the basemap or transit label layers.

## F-13 — Five zoom-ladder drifts (low)

Measured against `DESIGN.md:742-749`; each is a layer `minzoom` in the code.
`node qa/vision/zoom-sweep.mjs` confirms the rendered counts.

| Spec | Code | Measured |
|---|---|---|
| Neighbourhoods from 11 | `basemap.js:235` minzoom 12 | 0 at 11.5, 8 at 12 |
| Park-n-Rides, transit centres from 12 | `main.js:335` minzoom 12.5 | 0 at 12, 4 at 12.5 |
| Unserved stations from 12 | `main.js:363` minzoom 12.5 | rings first paint at 12.5 (pixel test on one station: 394 ring px at 12.5 vs ~220 background at 11.9/12) |
| Bus stops from 14.5 | `main.js:322` / `STOPS_ZOOM = 15` | 0 at 14.5, 5 at 15 |
| Main campuses at the opening view | `basemap.js:210` minzoom 14 | 0 below 14; campuses only appear as POIs at 14 |

Also noted, not counted as separate findings: villages/hamlets start at 10.5
(`basemap.js:250`) so "every town and city" is not fully true at the phone
opening (2 towns, 5 cities); the airport label layer starts at 10
(`basemap.js:228`) but the A-line sign already says "Denver Airport" at the
opening, so the airport is named.

## F-14 — Usable map at 4,368 ms against a 2,000 ms floor (high)

**What a rider sees.** On a 1.6 Mbps connection with a 4× slower CPU, the
loading toast clears after more than four seconds; the spec's floor is two.

**Reproduce.**

```
node qa/vision/perf.mjs 5              # throttled 1.6 Mbps + CPU 4x
UNTHROTTLED=1 node qa/vision/perf.mjs 2
```

**Real output.**

```
{"throttled":true,"runs":5,"usable":[4330,4331,4368,4493,4624],"median":4368,"min":4330,"max":4624}
```

Per-run detail: `load` fires at 1.87–1.91 s and `fcp` at 0.64 s, so roughly
2.4 s of the 4.4 s is main-thread work after the document has loaded.
Unthrottled on this host: 943–1,284 ms. The earlier note's median of 6,551 ms
was measured with a different harness and is not directly comparable; both are
well over 2,000 ms.

---

## Vision: what it claimed, and what was true

The lane (provider `opencode-go`, model `deepseek-v4.1-flash`) answers narrow
questions but spends most of its 4,000 tokens on reasoning, and on an
open-ended "read every label" request it returned no answer at all. Treat every
statement as a lead, never as evidence.

| Claim | Image | Check | Verdict |
|---|---|---|---|
| A road shield reading **"6"** at the left edge | phone opening | `queryRenderedFeatures(['highway-shield'])` returns exactly three shields — 25, 36, 287. No "6" exists. The crop sits at x≈0–12 where the **36** shield is cut by the edge. | **false** (misread of a clipped 36) |
| A route badge **"18"** cut at the right edge | phone 14 | No bus tag "18" is rendered. The text is the station name **"18th St / Stout Station"**, anchor x=416. | **false as stated** |
| **"Theatre District / Convention Center"** cut at the right edge | phone 14 | Landmark labels at that view are Ball Arena, Bellco Theatre, Garner Galleria Theatre, Auraria Higher Education Center, etc. No such label is rendered. | **false** |
| **"T/E — Alameda"**, "Alameda station with red T" | phone opening, 11.5 | Alameda at 11.5 is a **line-end sign** for T, not a station label; no E line ends there (E ends at RidgeGate). | **partly false** |
| "Union Station" is not visible | phone opening | `hub-signs` renders 0; no station labels below 10.5. | **true** |
| "Boulder" is cut at the left edge | phone opening | Anchor x=8 in a 390 px canvas. | **true** |
| "Ball Arena / Elitch Gardens" cut at the left edge | phone 14 | Anchor x=−31. | **true** |
| Station names at 11.5: Ball Arena, Auraria West Campus, 10th/Osage, Clear Creek/Federal, Pecos Junction, 60th/Sheridan-Arvada, 48th Ave, 38th/Blake, 41st/Fox, Evans, Louisiana/Pearl, I-25/Broadway, Union Station | phone 11.5 | All 15 appear verbatim in `station-labels` + `hub-signs`. | **true** |
| "BOND", "SKIP", "JUMP", "FF" are on the map | phone opening | These are real RTD route names and are in `labels.geojson`; the earlier session's assumption that "T" was a misread was also wrong — T is real. | **true** |
| "Denver" is the largest label | desktop 11.5 | `city-label` renders Denver. | **true** |

The pattern: the model reliably notices **that** something is at an edge or
crowded, and reliably reads large, well-spaced text; it misidentifies **what**
the thing is when it is clipped or small. Every claim above that became a
finding was checked against `queryRenderedFeatures` or the GeoJSON first.

---

## What the map looks like

Screenshots at `/home/chris/.hermes/cache/scratch/qa-vision/` (phone at DPR 2,
780×1688, with exact-size 390×844 copies as `*-390.png`; desktop 1440×900 at
DPR 1; 11.5 and 14 centred on Union Station `-105.0, 39.7528`).

| File | One sentence |
|---|---|
| `phone-open.png` | Legible: the rail skeleton, nine end signs (Denver Airport, 124th–Eastlake, Westminster …), 17 bus numbers, five city names; not legible: any corridor number, Union Station, Denver, campuses, and the numbers for 121/17/73/FREE — and Boulder is cut at the left edge. |
| `phone-115.png` | Legible: 15 station names downtown plus Union Station, 26 bus numbers, 2 corridor numbers; not legible: the other 10 of 12 corridors in view have no number, and the centre is dense enough that labels compete for the same 390 px column. |
| `phone-14.png` | Legible: station and landmark names around Union Station (3 station labels, 12 landmarks); not legible: labels at both edges are cut (Ball Arena x=−31, Auraria West x=−56, 18th St/Stout x=416), the 3 corridors in view carry no number, and stop names never appear. |
| `desktop-open.png` | Legible: the whole district — 19 towns, 9 cities including Denver, 10 rail end signs, 18 bus numbers, 15 shields; not legible: corridor numbers (0 of 85), the Union Station hub sign, campuses, and 121/15L/FREE. |
| `desktop-115.png` | Legible: Denver, 41 stations, 123 bus features, 29 corridors; not legible: only 5 corridor numbers place for those 29 corridors. |
| `desktop-14.png` | Legible: landmarks and neighbourhoods (Ball Arena, Bellco Theatre, Auraria Higher Education Center, Civic Center, Denver), 98 bus features, 10 unserved stations; not legible: no stop names, and all 6 corridors in view draw unnumbered. |

---

## Checked and fine

- **Corridors.** `node qa/scripts/audit-corridors.mjs` exits 0: 85 features, six
  invariants, 0 violations, 0 stale ids, 0 overstated headways. The only change
  to `qa/CORRIDOR-AUDIT.md` on re-run was the date line.
- **Tests.** `npm test`: 31/31 pass. The brief says "35 expected"; the repo has
  31 `test()` calls (`test/*.test.mjs`), so the brief is stale, not the suite.
- **axe.** 0 violations at 390×844 (`qa/vision/results/a11y.json`).
- **Keyboard order.** 14 tab stops: canvas → attribution → geolocate → zoom in →
  zoom out → Key → …; Enter opens and closes the Key
  (`{"before":false,"afterEnter":true,"afterSecond":false}`).
- **Runtime.** 0 page errors, 0 console errors and 0 failed requests across 14
  zoom steps on phone and 3 on desktop. (Four `ERR_ABORTED` elevation tiles
  appeared once when jumping the desktop map mid-load; not reproducible in the
  sweep.)
- **Data.** 21 frequent bus routes and exactly 21 bus label features; tiers
  match headways; 30 rail features for 9 letters; rail bullets appear at 10.5;
  station names appear at 10.5.

## Not measured / unsure

- **Why corridor labels place so rarely at 11.5** (2 of 12 at the Union Station
  view on phone, 2 of 16 at the phone opening centre). It may be
  label width versus the visible length of each corridor, or collision with the
  route numbers that arrive at the same zoom. I measured the counts, not the
  per-corridor cause.
- **Whether edge clipping is considered acceptable** for basemap labels. It is
  measurable (anchors outside the canvas) but the design does not state a rule.
- **F-07 was not pixel-measured.** The overlap follows from the shipped
  constants; I did not sample a cross-section of the rendered track.
- **`queryRenderedFeatures` over-reports circle layers at fractional zoom.** At
  map zoom 12 it returns 10 `stations-unserved` features although the layer's
  minzoom is 12.5; a pixel crop of one station shows its ring only at 12.5. The
  count in F-13 uses the pixel result, not the query.
- **The earlier 6,551 ms performance figure** could not be reproduced with this
  harness; my measured median is 4,368 ms. Different throttle settings are the
  likely reason, but I did not have the old script to compare.
