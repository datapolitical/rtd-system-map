# Continuous zoom trial, issue #154

This branch adds an isolated `/zoom/` preview between zooms 12 and 14. The
production entry point, five sheets, Classic map and normal data build do not
load this experiment. Nothing from this trial is ready to merge as v2.

## What can be reviewed

- Continuous pinch, wheel, slider and button zoom, with no sheet snapping.
- Two rail comparisons: **Smooth spacing**, using pixel offsets, and
  **Half-step drawings**, using finished drawings at 12, 12.5, 13, 13.5 and 14.
- Station names prefer their preceding side and distance, adjusting the
  distance on the same side before choosing another side. A change records
  its obstruction or station-association reason.
- Rail station bars and line letters follow the smooth model's spacing.
- The existing wider and closer bus drawings change at zoom 13. This change
  is deliberately visible for evaluation; bus geometry is not morphed.
- A route selection, geographic centre and fractional view URL survive
  zooming and changing theme. A play control sweeps the zoom range.

## Evidence

Base source: `811135ffe4230f598082667c7fda20994d1bd97d`, checked against
GitHub main on 2026-11-20. The public data were downloaded from the deployed
map on 2026-11-20; its `meta.json` says the build is
`2026-11-19T04:51:34.367Z`. No network routes, station IDs or line colours
are hardcoded in the preview. Source hashes are included in the generated
report.

Nine drawings, sampled every quarter zoom from 12 through 14:

- Independent name placement: **138** side changes over eight transitions.
- Placement preferring the preceding side: **39** side changes, a **72%**
  reduction, with **zero** names disappearing. Every drawing has 67 names.
- The rail offset comparison contains 393 constant-slot pieces.
- The trial bundle, containing all nine rail/label drawings and the offset
  comparison, is approximately **398 KB gzipped**. This is an experiment's
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

The half-step comparison intentionally has no correction between its
drawings. Its spacing can therefore drift and change at the half steps.
This is a comparison for evaluating the fallback, not a claim that the
fallback is complete.

Station-name side changes were later cut from 39 to 20; see "Names that
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
  rail packs. The page shows neither: its letters are placed once at the
  reference zoom and its rail is the reference centre line moved sideways by
  slot times pitch. A name dodged letters that were not on screen, and jumped
  when they moved. Names now keep off the rail and letters the page shows.
- A held name was allowed a fixed 8 units of ink. Its own box grows with the
  zoom, so it gathered more ink with nothing new under it, and lost its place.
- That allowance was then taken from the name's own previous cost, so it
  could compound from step to step.

Now a held name is measured against the clearest place for it at the same
zoom. It keeps its side and wording unless another name is on it, it stands
nearer another station, it crowds the station before, it would sit on more
than 6 cells of rail beyond that place (`HOLD_RAIL_SLACK`; a cell is 3 px,
so this is the name's edge brushing a line's margin), or on clearly more bus
streets (`HOLD_INK_SLACK`, 24, or half the clearest place's ink). The rule
runs only when the build passes a history; the sheets' names are unchanged
(sheets 0 to 3 compared with the old module; sheet 4 not rerun).

Over eight quarter-zoom steps from 12 to 14:

| | Fresh each drawing | First trial | Now |
|---|---|---|---|
| Side changes | 138 | 39 | 20 |
| Wording changes on the same side | 10 | — | 0 |
| Names lost | — | 0 | 0 |
| Names crossing a rail line or letter, all drawings | 2 | — | 1 |

The one crossing is Decatur-Federal at 12, where fresh placement crosses
too. The detector has a planted rail and a planted letter that it must catch
at every zoom, or the build stops. Held names sit on more bus streets than
fresh ones (3,900 against 1,700 units of ink summed over the drawings); the
captures show them over thin bus lines and still readable. Allowing more bus
ink gets to 12 changes but nearly triples it, so it was not taken.

Of the 20 left, 14 are bus-street ink, 4 are rail and 2 are names whose held wording no longer fits. Most come where the
closer street set starts at 13 or where a pack widens near a hub. Colorado's
name meets the "40, 46" route list at 14, because route lists are placed
without the names; route lists and street names get the same rule in #156.

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
node scripts/package-zoom-preview.mjs qa/.scratch/zoom-prototype/site
```

Keep issue #154 open until the phone comparison has been reviewed and the
rail-spacing approach chosen. This trial does not change its done-when
criteria, close v1.0, begin the production refactor in #155, or tag a release.
