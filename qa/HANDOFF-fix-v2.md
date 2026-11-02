# Fix work order — RTD system map V2

**This is the single file to work from.** It merges the QA pass's own report
(`qa/FINDINGS-v2.md`, still on disk as the raw record) with the source location for
every finding. Where the two disagree, this file is current: the raw report's
`main.js:68` reference for `CORRIDOR_LABELS_FROM` is wrong (it is `:59`).

- Repo: `/home/chris/code/rtd-v2` (worktree of `datapolitical/rtd-system-map`)
- Branch `feat/v2-finish`, HEAD `9d3f347`. Nothing under `public/`, `scripts/`,
  `test/` or `DESIGN.md` has been modified by the QA pass — every defect is live.
- Authority: `/home/chris/code/rtd-v2/DESIGN.md`. Two findings (F-01, F-03) are
  *deliberate* code choices that contradict the spec. For those, decide explicitly:
  change the code, or amend `DESIGN.md` with a one-line reason. Do not leave the
  spec false.
- Severity as the QA pass defined it: **high** = breaks a stated acceptance test or
  the quality floor; **medium** = a rider sees something wrong or unnamed where the
  design promises otherwise; **low** = cosmetic or a half-step spec drift.

## How to run and measure

```
cd /home/chris/code/rtd-v2
PORT=8830 node qa/scripts/serve.mjs          # serves public/, brotli
bash qa/vision/setup-copy.sh                 # instrumented copy of public/ on 8831
                                             # (adds window.__map = map; copy only)
npm test                                      # 31/31 pass today
node qa/scripts/audit-corridors.mjs           # corridor invariants, exits 0 today
```

Playwright is **not** installed in this repo. Import it by absolute path:
`/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs`
(`@axe-core/playwright` sits beside it). **Never `npm install`.**

Harnesses, all runnable as-is, outputs in `qa/vision/results/`:
`opening.mjs`, `zoom-sweep.mjs`, `missing-labels.mjs`, `suppression.mjs`,
`suppression-all.mjs`, `denver.mjs`, `density.mjs`, `edge-labels.mjs`, `zooms17.mjs`,
`a11y.mjs`, `focus-pixels.mjs`, `focus-diff.py`, `perf.mjs`.

## Definition of done

1. Every finding below is fixed, or closed as "spec amended" with the `DESIGN.md`
   edit in the same commit.
2. `node qa/vision/opening.mjs 390 844` and `... 1440 900` satisfy
   `DESIGN.md:1150-1152`: every line drawn has a name or number on screen, and the
   airport, downtown, Boulder and every rail end are labeled.
3. `npm test` green; `node qa/scripts/audit-corridors.mjs` still exits 0.
4. `node qa/vision/perf.mjs 5` reports median usable under 2,000 ms
   (`DESIGN.md:966`).

---

## F-01 · HIGH · 85 corridors drawn, 0 numbered at the opening view

**Rider sees.** The opening zoom draws 85 merged corridor lines — 40 of them "every
15 minutes or better" — and not one carries a number. Numbers arrive at 11.5 and
disappear at 13.

**Spec.** `DESIGN.md:744` — "Frequent buses and corridors, **each with one number**";
acceptance at `DESIGN.md:1150-1151`.

**Source.** `public/js/main.js:59` `const CORRIDOR_LABELS_FROM = 11.5;` → used as
`minzoom` at `public/js/main.js:423`, `maxzoom: CORRIDOR_LABELS_UNTIL` at `:424`,
inside layer `corridor-labels` at `public/js/main.js:419-434`. The comment at
`public/js/main.js:415-418` states this is deliberate: "at that zoom a corridor is a
few pixels long and the numbers cannot fit."

**Repro.**
```
node qa/vision/opening.mjs 390 844
node qa/vision/opening.mjs 1440 900
```

**Real output (phone; desktop identical for corridors).**
```
"corridors": 85, "corridor-labels": 0,
"corridorFeatures": 85, "corridorLabels": 0,
"corridorTiers": {"frequent": 40, "every30": 32, "hourly": 13}
```
Even at 11.5 only a fraction place: centred on Union Station, phone `corridors 12,
corridor-labels 2`; desktop `corridors 29, corridor-labels 5`
(`node qa/vision/opening.mjs 390 844 11.5 -105.0,39.7528`).

**Open question.** Why labels place so rarely at 11.5 is *not* measured — may be label
width versus visible corridor length, or collision with route numbers arriving at the
same zoom. Measure before choosing a fix; the counts alone do not tell you which.

---

## F-02 · HIGH · 4 frequent routes carry no number on the phone opening view

**Rider sees.** Of the 21 routes running every 15 minutes or better, **121, 17, 73,
FREE** have no number anywhere on the phone opening view; desktop misses **121, 15L,
FREE**. Every one of those labels is inside the viewport — collision drops them, not
geometry.

**Spec.** `DESIGN.md:1146-1147` ("one tag per frequent route at the opening zoom"),
`DESIGN.md:1151` (every drawn line carries a name or number).

**Source.** `public/js/main.js:401-414` — layer `bus-tags-region`: `maxzoom: 11.5`,
`text-field: ['get','route']`, `text-padding: 1` at `:411`, and **no**
`text-allow-overlap`, so MapLibre's default collision silently drops labels. The tier
gate that decides eligibility is `bus-numbers` at `public/js/main.js:442-448`
(`minzoom: 11.5`) — the numbers arrive after the opening view has gone by.

**Repro.**
```
node qa/vision/opening.mjs 390 844
node qa/vision/missing-labels.mjs
```

**Real output.** Phone `"busRoutes": 108, "busNamed": 17`; unnamed frequent:
`121, 17, 73, FREE`. Desktop `"busNamed": 18`, missing `121, 15L, FREE`. `labels.geojson`
has exactly 21 `kind:"bus"` features, one per frequent route, so the data is complete.
Forcing `text-allow-overlap: true` on `bus-tags-region` renders all 21:
```
"allowOverlap": ["0","0L","105","121","15","153","15L","16","17","21","30","31",
                 "40","43","73","83","BOND","FF","FREE","JUMP","SKIP"]
```

---

## F-03 · MEDIUM · Union Station hub sign never renders at the opening view

**Rider sees.** Seven rail lines end at Union Station and the hub sign naming them is
absent from both opening views; it appears only from zoom 11.

**Spec.** `DESIGN.md:762-765` — one ink sign at Union Station, "phones open wide
enough to show them all."

**Source.** The `city-label` layer (`public/js/basemap.js:275`, `text-padding: 1` at
`basemap.js:270`) is **reordered to sit above `line-signs`** at
`public/js/main.js:164-165`:
```js
const [city] = layers.splice(layers.findIndex((l) => l.id === 'city-label'), 1);
layers.splice(layers.findIndex((l) => l.id === 'line-signs'), 0, city);
```
Symbol layers collide in layer order; that splice decides who wins. The hub sign is
added by `sign('hub-signs', 'hub')` at `public/js/main.js:523`; the comment at
`:521-522` claims this give-way behaviour is deliberate ("The hub, where most lines
end, gives way to the city it's in"), which contradicts the spec. Resolve it.

**Repro.** `node qa/vision/suppression.mjs`

**Real output.**
```
baseline            hub: []
hidden city-label   hub: ["Union Station"]     bus: [... "121" ...]
hidden line-signs   hub: []
```

---

## F-04 · MEDIUM · "Denver" absent from the phone opening view

**Rider sees.** The phone view labels Aurora, Boulder, Broomfield, Longmont and
Thornton — and not Denver. Desktop shows it.

**Spec.** `DESIGN.md:1151` names downtown among the things the phone opening
screenshot must label; `DESIGN.md:744` requires "every town and city in the district".

**Source.** Same splice as F-03 (`public/js/main.js:164-165`): `city-label` is placed
beneath the line-end signs, and `line-signs` (`public/js/main.js:524`) wins the space.

**Repro.** `node qa/vision/denver.mjs`

**Real output.**
```
baseline            city: ["Aurora","Boulder","Broomfield","Longmont","Thornton"]
hidden line-signs   city: ["Aurora","Boulder","Broomfield","Denver","Lakewood","Longmont","Parker","Thornton"]
```

**Note.** F-03 and F-04 are one defect — one ordering decision, two casualties. Fix
together or not at all.

---

## F-05 · MEDIUM · T line's Lincoln end sign missing on the phone opening

**Rider sees.** Nine of ten rail end signs place on the phone; the T line's southern
end, "Lincoln", is missing although its anchor (`-104.8696, 39.5458`) is inside the
viewport. Desktop places all ten.

**Spec.** `DESIGN.md:744` ("a sign at both ends of each line"), `DESIGN.md:765`.

**Source.** `public/js/main.js:550` `const SIGNS_UNTIL = 13;` — end signs live below
zoom 13 only (`line-signs` at `public/js/main.js:520-535`, `maxzoom: SIGNS_UNTIL` at
`:533`), while `station-labels` is filtered to exclude line ends below that zoom
(`public/js/main.js:506`). So below 13 the sign is the only name, and this one loses a
collision. Check `scripts/lib/labels.mjs` (referenced at `main.js:399`) only if the
sign turns out never to be generated.

**Repro.**
```
node qa/vision/opening.mjs 390 844   # signNames: 9, no Lincoln
node qa/vision/opening.mjs 1440 900  # signNames: 10, Lincoln present
```
Phone signs: 124th–Eastlake, Alameda, Denver Airport, Jeffco, Mineral, Peoria,
RidgeGate, Westminster, Wheat Ridge Ward.

---

## F-06 · MEDIUM · No stop names at zoom 16+ (spec's last row unimplemented)

**Rider sees.** At zoom 17 over a busy corner: stop dots and route tags, no stop
names, no list of routes serving each stop.

**Spec.** `DESIGN.md:749` — "Stop names, with the routes that serve each stop."

**Source.** `public/js/main.js:317-329` adds `stops` as **circles only**; no symbol
layer reads the `stops` source anywhere in `main.js` (`grep -n "stop-name"
public/js/main.js` → no match). This is missing work, not a broken setting.

**Repro.** `node qa/vision/zooms17.mjs`

**Real output** at zoom 17 over Civic Center (`-104.9903, 39.7392`):
```
"stopCount": 3,
"textLayersOnStopsSource": 0,
"sampleStops": ["Court Pl & 14th St","W Colfax Ave & Bannock St","W Colfax Ave & 14th St"]
```

---

## F-07 · MEDIUM · Shared rail lanes overlap instead of leaving a gap

**Rider sees.** Where lines share track, adjacent lanes bleed together; at the widest
zoom a lane sits up to 3.5 px inside its neighbour, and the white casing overlaps more
than the lines do. The comment at `public/js/main.js:28` promises "a white gap between
them".

**Source.** `public/js/main.js:33` `RAIL_WIDTH = [3, 4, 5.6, 9]` (at zoom 9, 11, 13,
16), `:40` `RAIL_GAP = 2`, `:74` `railOffset = ... slot * (w + RAIL_GAP)`; slots step
by 0.5, so centre-to-centre is `0.5 * (w + 2)`. Casing is `railWidth(RAIL_GAP + 1)` at
`public/js/main.js:285`.

**Arithmetic (not pixel-measured).**

| Zoom | Width w | Lane step | Overlap |
|---|---|---|---|
| 9 | 3.0 | 2.5 px | 0.5 px |
| 11 | 4.0 | 3.0 px | 1.0 px |
| 13 | 5.6 | 3.8 px | 1.8 px |
| 16 | 9.0 | 5.5 px | 3.5 px |

**Open.** If you change `railOffset`, re-check that the widest multi-line bundle stays
inside its own corridor width — the offsets are also what keeps 9 rail letters legible
at 10.5.

---

## F-08 · MEDIUM · Station marks smear at the opening view

**Rider sees.** 67 station marks in one phone screen, 32 pairs closer than 12 px, 10
closer than 8 px, closest 2.09 px — downtown reads as a blob.

**Spec.** `DESIGN.md:744` asks for stations at the opening view; `DESIGN.md:1143-1144`
requires stations to read first in a screenshot at every zoom.

**Source.** `public/js/main.js:344-358` — layer `stations`: **no `minzoom`**, plus
`icon-allow-overlap: true` (`:355`) and `icon-ignore-placement: true` (`:356`). That
pair is the direct cause: every station draws at every zoom and placement is
explicitly disabled, so nothing is suppressed for crowding.

**Repro.** `node qa/vision/density.mjs "" "" 390 844`

**Real output.**
```
{"stations":67,"pairsUnder12px":32,"pairsUnder8px":10,"minDistance":2.09,"zoom":8.752}
```
At 11.5: `minDistance 13.9`, 0 pairs under 12 px — the defect is specific to low zoom,
so a `minzoom` or a graduated size is sufficient; the layer itself is fine.

---

## F-09 · MEDIUM · Keyboard focus is invisible on the map canvas

**Rider sees.** Tabbing into the map changes nothing on screen.

**Spec.** `DESIGN.md:1153-1155` (V2 step 5): keyboard access to all of it.

**Source.** `public/css/app.css:55-57` — `:focus-visible { outline: 2px solid
var(--focus); outline-offset: 2px; }`. The rule is correct; the **geometry** defeats
it. The canvas fills the viewport (`#map` at `public/css/app.css:50-53`,
`position:absolute; inset:0`) at `(0,0,390,844)`, so a 2 px outline with a 2 px offset
sits entirely outside the canvas box and off-screen.

**Repro.**
```
node qa/vision/focus-pixels.mjs
python3 qa/vision/focus-diff.py canvas
```

**Real output.** `canvas  changed_px=5  blue_focused=2273  blue_unfocused=2273`
(computed outline `solid 2px rgb(31,111,235)`, rect `(0,0,390,844)`).

**Fix direction.** Move the ring inside the element (`outline-offset: -3px`, or an
inset `box-shadow`), not the color.

---

## F-10 · LOW · Control focus ring is clipped and below contrast

**Rider sees.** Geolocate and zoom buttons get a faint pale-blue inner glow when
focused, not a ring; the outer half of MapLibre's glow is cut by the control group's
`overflow: hidden` and rounded corners.

**Source.** `public/css/app.css:271-274` styles only
`.maplibregl-ctrl-group button:focus:first-child / :last-child` and only sets
`border-radius: inherit` — mid-group buttons get no ring at all, which is why they fall
back to MapLibre's `box-shadow` glow. Vendor stylesheet: `public/vendor/maplibre-gl.css`.

**Repro.** `node qa/vision/focus-pixels.mjs && python3 qa/vision/focus-diff.py geolocate zoomin deskzoom`

**Real output.**
```
geolocate  changed_px=244   blue_focused=0    (pale #c4e2f7 glow on white)
zoomin     changed_px=952   blue_focused=162  (13 device px of #0f9cff at the edge)
```
`#c4e2f7` on white is ≈1.3:1, below the 3:1 WCAG 2.4.11 asks of a focus indicator.
The Key button is fine (solid 2 px `#1f6feb`, fully visible) and Enter toggles it —
do not regress that.

---

## F-11 · LOW · Loading toast overlaps the Key button at 320 px

**Rider sees.** "Loading the network…" covers part of the Key button on a 320 px
phone.

**Source.** `public/index.html:43` (`<p class="status" id="status" role="status">`) and
`public/css/app.css:402-413` — `.status` is `position:absolute; top:16px; left:50%;
transform:translateX(-50%)` with `z-index:3`, while the Key sits top-left.

**Repro.** `node qa/vision/a11y.mjs` (see `toast320`).

**Real output.** `toast [80,16,160,55]  key [12,10,81,44]  overlap [13,38]` — a 13 × 38
px overlap at 320 × 568.

---

## F-12 · LOW · Labels cut by the viewport edge

**Rider sees.** Half-words at the edges of the phone view.

**Spec.** No rule stated; `DESIGN.md:1150-1152` only requires the named anchors to be
labeled. Decide whether clipping is acceptable and record it.

**Source.** No label layer sets `symbol-avoid-edges`: basemap labels at
`public/js/basemap.js:233-295` (`text-padding: 1` at `:270`, `:285`), transit labels at
`public/js/main.js:484-540` (`text-padding: 1` at `:411`, `:432`).

**Repro.**
```
node qa/vision/edge-labels.mjs 390 844 "" "" 50
node qa/vision/edge-labels.mjs 390 844 14 -105.0,39.7528 50
```

**Real output (CSS px, canvas 390 wide).** Opening: `Boulder` x=8, `Hudson` x=393,
`Denver Airport` sign x=374, `BOND`/`SKIP` x=18. Zoom 14: `Ball Arena / Elitch Gardens
Station` x=−31, `Auraria West Campus Station` x=−56, `18th St / Stout Station` x=416.
An anchor outside the canvas is definitively clipped, not merely near the edge.

---

## F-13 · LOW · Zoom-ladder drifts (rendered counts confirm each)

**Source: all values verified by grep in this file's preparation.**

| Spec | Code | Measured |
|---|---|---|
| Neighbourhoods from 11 (`DESIGN.md:745`) | `public/js/basemap.js:235` minzoom 12 | 0 at 11.5, 8 at 12 |
| Park-n-Rides, transit centres from 12 (`DESIGN.md:746`) | `public/js/main.js:335` minzoom 12.5 | 0 at 12, 4 at 12.5 |
| Unserved stations from 12 (`DESIGN.md:746`) | `public/js/main.js:363` minzoom 12.5 | 0 at 12, 4 at 12.5 |
| Bus stops from 14.5 (`DESIGN.md:748`) | `public/js/main.js:45` `STOPS_ZOOM = 15`, applied `:322` | 0 at 14.5, 5 at 15 |
| Main campuses at the opening view (`DESIGN.md:744`) | `public/js/basemap.js:210` minzoom 14 | 0 below 14 |

Also noted, not filed separately: villages/hamlets start at 10.5
(`public/js/basemap.js:250`), so "every town and city" is not fully true on the phone
opening (2 towns, 5 cities render); the airport-label layer starts at 10
(`public/js/basemap.js:228`) but the A-line sign already says "Denver Airport" at the
opening view, so the airport is named.

---

## F-14 · HIGH · Usable map at 4,368 ms against a 2,000 ms floor

**Rider sees.** On 1.6 Mbps with a 4× slower CPU the loading toast clears after more
than four seconds.

**Spec.** `DESIGN.md:966` — "a usable map in under 2 seconds on a mid-range phone over
4G"; `DESIGN.md:966-970` also requires loading interaction data (trips, stop names)
only when needed and pausing live updates on a hidden tab.

**Repro.**
```
node qa/vision/perf.mjs 5              # throttled 1.6 Mbps + CPU 4x
UNTHROTTLED=1 node qa/vision/perf.mjs 2
```

**Real output.** `{"throttled":true,"runs":5,"usable":[4330,4331,4368,4493,4624],
"median":4368,"min":4330,"max":4624}` (`qa/vision/results/perf-throttled.txt`).
Per run: `load` 1.87–1.91 s, `dcl` ≈1.885 s, `fcp` ≈0.65 s. Unthrottled on this host:
943–1,284 ms.

**Diagnosis (not yet isolated).** Roughly **2.4 s of the 4.4 s is main-thread work
after the document has loaded** — building geometry and adding sources/layers, not
downloading. Profile before optimising; there is no source pointer here because the
cause has not been measured.

---

## Do not chase these — the vision model got them wrong

| Claim | Check | Verdict |
|---|---|---|
| A road shield reading **"6"** at the left edge | `queryRenderedFeatures(['highway-shield'])` returns exactly three: 25, 36, 287. No "6" exists; the crop sits where the **36** is cut by the edge. | **false** |
| A route badge **"18"** cut at the right edge | No bus tag "18" renders. The text is the station name "18th St / Stout Station", anchor x=416. | **false as stated** |
| **"Theatre District / Convention Center"** cut at the right edge | Landmark labels there are Ball Arena, Bellco Theatre, Garner Galleria Theatre, Auraria Higher Education Center. No such label renders. | **false** |
| **"T/E — Alameda"**, "Alameda station with red T" | At 11.5 Alameda is a **line-end sign** for T; no E line ends there (E ends at RidgeGate). | **partly false** |
| "Union Station" not visible | `hub-signs` renders 0; no station labels below 10.5. | **true** (F-03) |
| "Boulder" cut at the left edge | Anchor x=8 in a 390 px canvas. | **true** (F-12) |
| "Ball Arena / Elitch Gardens" cut at the left edge | Anchor x=−31. | **true** (F-12) |
| Station names at 11.5 (15 names) | All 15 appear verbatim in `station-labels` + `hub-signs`. | **true** |
| "BOND", "SKIP", "JUMP", "FF" on the map | Real RTD route names, present in `labels.geojson`. (An earlier session wrongly assumed "T" was a misread; T is real.) | **true** |
| "Denver" is the largest label | `city-label` renders Denver on desktop. | **true** |

Pattern: the model reliably notices *that* something is at an edge or crowded, and
reliably reads large well-spaced text; it misidentifies *what* the thing is when it is
clipped or small. Nothing above became a finding without a `queryRenderedFeatures` or
GeoJSON check.

## Checked and fine — do not regress

- **Corridors.** `node qa/scripts/audit-corridors.mjs` exits 0: 85 features, six
  invariants, 0 violations, 0 stale ids, 0 overstated headways.
- **Data.** 21 frequent bus routes and exactly 21 bus label features; tiers match
  headways; 30 rail features for 9 letters; rail bullets and station names at 10.5.
- **axe.** 0 violations at 390×844 (`qa/vision/results/a11y.json`).
- **Keyboard order.** 14 tab stops: canvas → attribution → geolocate → zoom in → zoom
  out → Key → …; Enter opens and closes the Key.
- **Runtime.** 0 page errors, 0 console errors, 0 failed requests across 14 zoom steps
  on phone and 3 on desktop.
- **Tests.** `npm test` 31/31 pass. The "35 expected" in `qa/KICKOFF-qa-vision.md:61`
  is stale — the repo has 31 `test()` calls in `test/*.test.mjs`.

## Not measured / unsure — do not present these as known

- Why corridor labels place so rarely at 11.5 (2 of 16 on phone).
- Whether edge clipping is acceptable; the design states no rule.
- F-07 was derived from shipped constants, not from a pixel cross-section.
- The older 6,551 ms performance figure could not be reproduced with this harness.

## Screenshot reference

Saved at `/home/chris/.hermes/cache/scratch/qa-vision/` (phone 390×844 DPR 2, desktop
1440×900 DPR 1; 11.5 and 14 centred on Union Station `-105.0, 39.7528`):
`phone-open.png`, `phone-115.png`, `phone-14.png`, `desktop-open.png`,
`desktop-115.png`, `desktop-14.png` — one-sentence legibility notes for each are in
`qa/FINDINGS-v2.md` § "What the map looks like".

---

*Provenance: findings, numbers and repro commands come from the QA pass's measured
artifacts (`qa/vision/results/`, `qa/FINDINGS-v2.md`) — the QA session is
`@session:default/123ece83183e`. Source `path:line` references were added here and each
one was verified against the file at HEAD `9d3f347` (37 references checked; the raw
report's `main.js:68` was corrected to `:59`).*
