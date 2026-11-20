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
- The rail offset comparison contains 392 constant-slot pieces.
- The trial bundle, containing all nine rail/label drawings and the offset
  comparison, is approximately **307 KB gzipped**. This is an experiment's
  combined bundle, not the intended production loading strategy.

The exact pair-by-pair counts and reasons are generated at
`public/data/zoom-prototype/report.json`. The counts are a new measurement
with this trial's interpolated sizes and street-detail threshold; they are
not a rerun of the older build quoted in issue #154.

The browser checker records its commit, views, themes, drawing boundaries,
screenshots, motion timing and errors in
`qa/.scratch/zoom-prototype/browser/report.json`. Its software-rendered
Chromium timings do not establish performance on a physical phone.

## Architectural limits to decide before v2

The smooth comparison reconstructs centre lines from the **finished
reference drawing at zoom 13**, using the existing shared-track slots. That
preserves its terminal lead-ins while testing renderer offsets and joins.
It does **not** yet replace the build with one canonical centre line per
shared-track segment. Stations and letters use small GeoJSON sources updated
during zoom; this needs physical-phone performance measurement before it
can be chosen as a production approach.

The half-step comparison intentionally has no correction between its
drawings. Its spacing can therefore drift and change at the half steps.
This is a comparison for evaluating the fallback, not a claim that the
fallback is complete.

Thirty-nine station-name side changes remain. The trial does not yet carry
bus route-number lists or street-name placements across scales. The normal
picked-bus name alternatives are also excluded from this station-name
experiment; full picked-route label clearance remains follow-up work.

The size-table adapter is synchronous and restores every value after each
draw, including after an exception. It exists only in the experimental
build command. Step #155 should replace it with ordinary zoom-dependent
sizes before production use.

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
node scripts/package-zoom-preview.mjs qa/.scratch/zoom-prototype/site
```

Keep issue #154 open until the phone comparison has been reviewed and the
rail-spacing approach chosen. This trial does not change its done-when
criteria, close v1.0, begin the production refactor in #155, or tag a release.
