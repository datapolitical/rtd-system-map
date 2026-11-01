# What I would do next, inside V2

An improvement review, not a fix list: nothing here is implemented. It is ordered
by what unblocks the most, and every item stays inside what the Milestones say
this phase is — V2, the visual design, in five steps.

## Where the project actually is

Reading `DESIGN.md:1111-1157` against the tree:

| V2 step | State |
|---|---|
| 1. Correctness and speed | Done, but the frequency data it fixed is still wrong for one route (F-001) |
| 2. Geometry and colour | Two of three parts done — shared track and contrast-adjusted rail colours exist. **Bus corridors are not built at all** (F-008) |
| 3. Visual pass | Most pieces present: own basemap style, symbols, hatch, loading state, attribution. The zoom ladder has drifted from the table (F-007) |
| 4. Name what you draw | Done |
| 5. Interaction | Next |

So three of my nine findings are not new work: they are **V2's own unfinished
items**. That is the frame I would use for the rest of the phase.

## 0. Settle the data before starting step 5

Step 5 builds panels that state frequencies ("Every 15 min, weekdays 9 to 3"),
station lists that state how often each line comes, and a route highlight that
labels its two ends. Every one of those repeats whatever the build computed. If
225 reads hourly now (F-001) it reads hourly in the panel, in the station list,
and in the highlight — three surfaces, one wrong number, and step 5 is where a
rider first sees it spelled out.

That is why I would finish steps 2 and 3's data items before writing any panel
code, even though panels are what the Milestones call next.

## 1. Join GTFS route variants — F-001, do this first

**What is wrong.** `scripts/build-data.mjs:63-69` returns as soon as it finds an
exact route match, so `225D` and `225T` — prefix `225`, same long name — never
reach the family fallback. Route 225 is then measured on 44 of its 92 weekday
trips and drawn as hourly.

**What I would change.** Match in the order `DESIGN.md:520-523` describes, but
make the family step additive rather than a fallback: collect *every* GTFS route
whose short name is the drawn route's number plus an optional suffix and whose
long name is identical, then sum their weekday trips for the headway. Keep the
exact match as a fast path only when it is the sole member.

**The guard that matters more than the fix.** The build already warns
`GTFS routes not on RTD's map: 225D, 225T, ATA`. That warning was true, printed
on every build, and read as noise. I would make it fail the build when an
unmatched route shares a drawn route's number and long name — a variant that
belongs to a line we draw is a contradiction, not a note.

**Test.** In `test/`, a fixture where `225` has 40 trips, `225D` 30 and `225T` 22,
asserting the drawn route's headway is computed over 92. Red on today's code.

## 2. Rail width from frequency — F-006

The Objective's first sentence is that the map shows **how often** service comes,
and every rail line currently draws at one width regardless of whether it runs
every 15 minutes or hourly. `meta.rail` already carries the tier and weekday
minutes, so this is a rendering change, not a data change: pick the width per
line from `meta.rail[].weekdayMinutes`, using the same tier boundaries as buses
(`DESIGN.md:423-428`). The spec is explicit that this is not a choice I am
inventing — `DESIGN.md:648-654`: "15-minute rail is full width; 30- and 60-minute
rail is a step thinner; rail with only a few trips or rush-hour trips is dashed
and drawn *beneath* full-service rail". The dash and the beneath-ordering do
exist (`main.js:254`), so the only missing part is the width step: 30- and
60-minute rail currently draw at the 15-minute width.

It is the cheapest change on this list with the largest effect on what the map
claims, because rail is what the eye lands on first.

## 3. Bus corridors — F-008, the missing half of step 2

Step 2's third deliverable exists nowhere: `grep -rn "combined\|corridor"
scripts/` finds only the rail side-ordering in `sharedtrack.mjs`, and
`routes.geojson` contains no combined frequency. The spec's rule is written and
unimplemented (`DESIGN.md:731-736`).

**The open question is the real work.** `DESIGN.md:1175-1178` already flags it:
how evenly must two routes be spaced before their frequencies add? Two every-30
routes leaving a minute apart are not "every 15" to a rider. My proposal, which
I would test against real data before drawing anything:

- Two routes combine only if they share the same street segment **and** both serve
  the stops at its ends.
- Their departures interleave: sort all departures, and require every gap to be
  within ±40% of the combined headway. Two evenly spaced 30-minute routes give
  ~15-minute gaps and pass; two that bunch give 0/30/0/30 and fail.
- A corridor's tier is the combined headway, and it draws as one line carrying
  both route numbers once step 4's tagging applies to it.

**Why a spike, not a straight implementation.** This changes what the map draws,
which changes what the key has to explain and what step 5's panels must say when
a rider taps a corridor. I would build it behind a flag, look at Colfax and
Broadway on a phone, and only then decide how much of it ships. Corridors that
are wrong are worse than no corridors, because the map's promise is that the
line width means something.

## 4. Contrast, computed rather than chosen — F-009 and F-003

Step 2's done-when says "every line and bullet meets its contrast target, all
computed with nothing listed by hand". Two of the four bus tiers and one text
colour miss that today. Concrete values, measured against the land `#f4f5f6`:

| Token | Now | Ratio | Proposed | Ratio |
|---|---|---|---|---|
| frequent | `#1d3044` | 12.34:1 | unchanged |  |
| every 30 | `#58697b` | 5.17:1 | unchanged |  |
| hourly | `#8995a2` | **2.79:1** | `#697683` | 4.26:1 |
| infrequent / rush / a few trips | `#9aa5b0` | **2.29:1** | `#818c97` | 3.14:1 |
| legend fine print | `#7e8b98` | **3.48:1** | `#6b7885` | 4.52:1 |
| map label text | `#7e8b98` | 3.48:1 | `#66717e` | 4.55:1 on land |

The three light tiers keep their order and their dashes, so nothing is
distinguished by colour alone. The honest way to land this is to compute the
tier colours from their labels at build time and assert the ratios in a test, so
the next palette tweak cannot quietly reintroduce this.

## 5. Route ends — F-002

Low severity today because nothing reads `goes`, but step 5 labels a highlighted
route's two ends, so it becomes visible the moment the panels ship. The fix is in
the build: take the far end from the last stop of the longest trip rather than
the stop nearest the shape's end, which is what puts AL 2.94 km short of
Longmont.

## 6. Speed — F-004, with the number corrected

My first measurement said 15.9 s; that was my static server shipping 2.4 MB of
JSON uncompressed. Pages compresses, and with brotli the same load is **4.9 s**
median (6,006 / 4,501 / 4,866) against the 2 s in the Quality floor — better than
the 6.7 s the spec records for this step, still over the floor.

What is left is not the data: 581 KB in 11 files, of which `maplibre-gl.mjs` is
234 KB and 1.6 s, and the two Overpass glyph pages are 161 KB and 2.7 s between
them. The transit data is 241 KB brotli and mostly arrives after the first draw.

So the only speed work I would do in this phase is the glyphs: subset the .pbf
pages to the characters the map actually renders. That is worth roughly a
third of the remaining payload for an afternoon's work. I would not touch the
data files for speed — they are already the cheap part.

## 7. Reconcile the zoom ladder — F-007

The table in `DESIGN.md:738-749` and the constants in `main.js` disagree on three
rows: stops arrive at 15 rather than 14.5, unserved stations and parking at 12.5
rather than 12, and no stop names appear at any zoom. Either the code or the
table is the intent; the cheap move is to make the table the source (a single
constant table checked by a test) so the next visual pass cannot drift again.

## 8. Make the done-whens executable

This is the process change I would make above all the code ones, because it is
what would have caught F-001 and F-008 without a reviewer:

- "No line overlaps another on shared track anywhere in the network" → a script
  that walks every pair of rail segments and asserts no two share a 20 m buffer
  at the same offset, run in `npm test`.
- "Every line drawn has a name or number on screen" → an assertion that every
  route appearing in `routes.geojson` above its `from` zoom has a tag in
  `labels.geojson`.
- "Every GTFS route joins a drawn route, or the build says why" → the F-001
  guard, as a failing build rather than a warning.

Each is a behaviour contract on the *output*, not on the source, which is the
kind of test this project's own tests already favour.

## What I would not do in this phase

- **Live, vehicles, alerts, the relay.** That is milestone 3, and it needs the
  schedule summary in the build first.
- **Search, From here, near me, shareable links, Directions.** Milestone 4.
- **Service worker, offline, deploy.** Milestone 6. Worth noting the offline
  promise will lean on the same payload work as item 6.
- **A framework, a bundler, or a TypeScript migration.** The page ships ES
  modules by design (`DESIGN.md:1101`) and the whole build is ~1,600 lines. This
  is not the phase where that changes.
- **New data files for the panels.** Step 5 should decide the panel contract;
  inventing a `stations.json` now would be guessing at what the sheet needs.

## If I had to pick three

1. Join the GTFS variants (F-001) and make the unmatched-route warning fatal.
2. Rail width from frequency (F-006).
3. The corridor spike (F-008), because it is the one V2 deliverable that is
   simply absent, and every week it is absent is a week the map understates
   Denver's bus network.

Steps 5's panels come after, and will be right the first time because 1 and 2
made the numbers true.
