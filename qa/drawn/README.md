# The drawn model

What the map draws, worked out in plain Node: every line, mark, terminal and
label as geometry in screen pixels, at any zoom, in either theme, without a
browser. The checks in `qa/checks/` measure a phone screen; this measures the
same map anywhere, including the zooms a phone rarely reaches, and it can say
why a gap or an overlap is there.

`qa/checks/README.md` says how the checks run. `DESIGN.md` ("Zero
maintenance") is why nothing here restates anything about RTD's network: the
model imports the page's own definitions and reads the build's own output.

## What it reads

| Source | What it gives |
|---|---|
| `public/js/network.js`, `basemap.js` | the style's layers, filters, paint and layout, as the page builds them (`style.mjs` already did this) |
| `public/js/{palette,sizes,shared,symbols}.js` | colours per theme, sizes, and the images the page draws itself: station ticks, capsules, bullets, signs |
| `public/data/*.geojson`, `meta.json` | the network's geometry and each feature's properties; a caller can pass a deployed build's copies instead (`data`, `meta` below) |
| `public/vendor/glyphs/<font>/<range>.pbf` | text metrics: each glyph's advance and ink box, drawn by `scripts/glyphs.mjs` |
| the style's vector source (OpenFreeMap) | the basemap's streets, water, land and buildings, tile by tile |

There is no copy of any width, colour, offset, filter, font size or label
metric here. Change `network.js` and the model changes with it; change the
palette and both themes change.

## Using it

```js
import { openModel } from './qa/drawn/model.mjs';

const model = await openModel({ theme: 'dark' });   // one theme per process
model.style;            // the style JSON the page builds
model.data;             // every GeoJSON the style's sources name, by source id
model.zoom(14);         // the whole district at zoom 14 (cache-friendly)
await model.frame({ zoom: 14, center: [-105.0005, 39.753], width: 390, height: 664 });
```

Pass `data` (a FeatureCollection for each build file the page draws, named
by the page's own `DATA_SOURCES`; `pageSources()` reads that list) and `meta`
to read a deployed build's output instead of the checkout's `public/data`:
`qa/checks/drawn.spec.mjs` does that, because a CI checkout has not built the
data and the preview under test is that commit's build.

`zoom(z)` returns, in world pixels at zoom `z` (512 px tiles: world pixels at
zoom `z` are screen pixels at zoom `z`):

- `lines` — one per feature per line layer: `layer`, `source`, `route`,
  `properties`, `parts` (its centrelines), `drawn` (the same moved by its
  offset as MapLibre draws it, `strokes.mjs`), `width`, `gapWidth`,
  `drawnWidth` (what it is drawn and hit-tested at), `dash`, `color`,
  `opacity`, `offset`, `cap`, `join`. The checks measure `drawn` with
  `drawnWidth` and `cap`: a gap is land between two ends after their caps.
- `marks` — `kind: 'icon'` with `image`, size, rotation, anchor, `box`; or
  `kind: 'circle'` with `radius`, `stroke`, colours and `box`.
- `labels` — `text`, `size`, `font`, `block` (lines and measured width and
  height), `candidates` (one per anchor: `anchor`, `offset`, `box`), `at`,
  `properties`, colour.
- `areas` — the terminals' polygons.

`frame({ zoom, center, width, height, basemap })` clips all four to a screen
and moves them to screen pixels, so a check can ask "what is on this phone
screen"; with `basemap: true` it also reads the tiles under it and returns
`basemap.streets` and `basemap.fills` (each with the tile layer's properties
and its parts in screen px).

`district({ zooms })` (an async generator, default zoom 9 to 17 by halves)
walks the whole network zoom by zoom, so nothing holds more than one zoom.
`node qa/drawn/describe.mjs dark` prints the same walk with counts and time.

## The checks on it

`qa/checks/run.mjs` runs these over the model; `npm run check:map` writes their
findings, and `npm run check:recall` (`qa/recall/`) scores them.

- `lines.mjs`: short pieces standing alone, and sideways steps between
  parallel runs, on the lines as drawn.
- `routes.mjs` (#43): each route followed across every piece that carries it
  (stretches of track, the street features a bus runs on, parts of a
  MultiLineString), on the lines as drawn. A **gap** is a line end that
  dangles (no line at least 60% as wide is drawn over it) while its route
  carries on within 30 m in the direction the end points, across empty land:
  the break a rider sees. A route turning off a street whose line carries on
  for other routes is no break. A **hook** is a dangling end that turns back
  more than 110 degrees in its last few px. A rail line's free end that runs
  more than 3 px past the mark of its station **overshoots**, and one with no
  station of its line within 150 m **dangles**.
- `marks.mjs`, `labels.mjs`, `streets.mjs`: stops off their lines, station
  marks drawn twice, translucent fills; names over lines; lines off their
  street. These run per screen, at the report's places.

## How the numbers are made

- **Zoom in filters, fractional zoom in paint.** Filter expressions see the
  whole zoom (`Math.floor`), paint and layout expressions the fractional one,
  as MapLibre evaluates them.
- **Collision boxes are the bucket's.** MapLibre builds a symbol's collision
  box from the layout size at the next whole zoom (`sizes.layoutTextSize`), so
  a label's box is measured at `floor(zoom) + 1` while its text is drawn at
  `zoom`; the box also grows by `text-padding` away from the text and by the
  baseline (7 of 24 font units) where an anchor asks for it. Icons likewise
  use `icon-size` at `floor(zoom) + 1`.
- **Text is shaped from the glyphs the map downloads.** The line breaker is
  MapLibre's own (`determineLineBreaks`): fit on one line, else aim every line
  at the same width and take the breaks with the least raggedness.
- **Images are measured by drawing them.** `symbols.js` runs in Node with a
  canvas for `document.createElement` and a map that records `addImage`, so
  an icon's size, anchor and pixel ratio are the page's.
- **Tiles come from the style.** The vector source's TileJSON is fetched once
  and its tiles cached under `qa/drawn/.cache/tiles/<version>/` (git ignores
  the folder), keyed by the folder the TileJSON names, so a new basemap
  version downloads its own tiles instead of mixing with the old.

## The drift test

`qa/checks/drawn.spec.mjs` is the tie between the model and the page. At
seeded views over the network, the busiest interchanges and every place in
`qa/recall/finds.json`, it reads both sides' data from the site under test
(so it runs on a CI checkout with no `public/data`) and fails with the layer
and the distance when they part:

- **Lines, page to model.** Every vertex the page's `queryRenderedFeatures`
  returns is within 1 px of the model's line for its layer and route. That
  geometry is the source's, so this ties the projection and the filters.
- **Lines as drawn.** `queryRenderedFeatures` doesn't return offsets or
  widths, but MapLibre's hit-test applies both (`queryIntersectsFeature`,
  `line_style_layer.ts`). At sample points on straight stretches of the
  model's drawn lines, `probeLines` (`compare.mjs`) walks out along the normal
  until the page stops returning that feature, and does the same on the model
  (`modelHitMap`). The centres must agree within 1 px, the widths within
  0.6 px. Samples sit mid-segment, because the hit-test offsets corners with
  its own simpler rule (where a corner is drawn is not tested here), and only
  where the line stands alone: the hit-test can't tell two lines of one
  feature apart (a route's two directions, a px apart at low zoom), and the
  page's tiles simplify each a little differently, so their combined band is
  not a measure of either.
- **Lines, model to page.** Every line the model draws on the screen is among
  the page's features for that layer.
- **Marks** within 1 px; **names and rail letters**: MapLibre's collision
  boxes within 2 px of one of the model's.

A second test plants errors in the model at one view and checks each fails:
an offset 2 px off, a width 1 px off, a layer left out, a line the page
doesn't draw (`test/drawn-strokes.test.mjs` does the same against a fake page
in `npm test`). A source the model doesn't load fails in `openModel`: the
style may draw only from the page's `DATA_SOURCES` and the runtime-only
sources in `RUNTIME_ONLY`.

Not compared yet: one-way arrows and edge letters (#56), and which names are
placed or hidden (#57).

```sh
npm run dev                                     # or a server of your own
CHECK_URL=http://127.0.0.1:8788 npm run check -- 'qa/checks/drawn\.spec' --project=phone-dark --list   # check what runs
CHECK_URL=http://127.0.0.1:8788 npm run check -- 'qa/checks/drawn\.spec' --project=phone-dark
```

`DRAWN_ROOT=qa/recall/fixtures/<commit>` builds the model from a frozen
build's own page code, to test against that commit's preview (`CHECK_URL`).
`DRAWN_VIEWS=n` sets how many seeded views the run takes, `DRAWN_PROBES=n`
the most drawn-line samples per view. Playwright matches a file filter
against the whole path, so a bare `drawn` also matches a checkout whose
folder name has it in; anchor it as above and list before running.

Two things about reading the page, learned the hard way, that any check
reading `qa.placed()` or `queryRenderedFeatures` should know:

- `queryRenderedFeatures` without a geometry answers for every tile MapLibre
  holds, on screen or not; pass a box. A polygon of four points is not the
  same thing and quietly returns almost nothing.
- MapLibre keeps collision boxes for tiles it loaded under an earlier camera;
  those boxes hold the old positions (and the old layout size). Jump to a
  view, let it settle, then jump to it again before reading, and only trust
  boxes whose feature is on screen now.

## Calibration

The model's numbers were checked against the page at zooms 10 to 16, in both
themes, before the drift test existed: line vertices agree to 0.07 px, mark
centres to 0.06 px, label boxes to 0.1 px. Two rules came out of that and are
not guessable from the source alone:

- a text or icon box grows by its padding **away from the text** (twice the
  padding on the far sides, once on a centred side, none where the text meets
  its point), which is why a label's box measured from the outside looks
  lopsided;
- `text-padding` and `icon-padding` arrive from the style spec as four-sided
  values, not numbers; placement uses the largest side.
