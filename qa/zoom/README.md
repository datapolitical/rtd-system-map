# Continuous zoom checks

`npm run check:zoom -- <build-adapter.mjs> [report.json]` checks the emitted
drawing and lettering without a browser. It requires zooms 8.75 through 16.
It samples every tenth, both endpoints, every arrival, and 0.01 zoom on
each side of every handover within the range. The report lists the actual zooms,
per-rule input counts, coordinates and review cameras. Any finding fails the run.
Pass `--partial` for experiments that cover a narrower range.

Main currently serves fixed sheets. The full-range drawing, tile and renderer
work (#157, #236, #237 and #158) must supply the effective drawing data before
this check can establish acceptance. The checker has clean and deliberately
broken geometry controls in `test/zoom-checks.test.mjs`.

## Build input

The adapter is a Node ES module with one default export:

- `commit`, `minZoom`, `maxZoom` and `center` identify the emitted build,
  range and fallback review centre. Coordinates are longitude, latitude.
- `events` records each drawing handover and feature arrival as
  `{ kind: 'handover' | 'arrival', zoom, at? }`. Label stops also supply
  events. Include background and transit changes, even when lettering holds.
- `plan` is the build's v1 lettering plan (#234). Each label has an ID,
  kind and ordered stops with `zoom`, `at` (ink centre), `angle` (degrees
  clockwise), and `room` (width and height in CSS pixels). Each stop lasts
  until the next drawing or an explicit `until`. When the renderer
  interpolates between two stops, set `interpolate` on the earlier stop.
- `frameAt(zoom)` reads the build and returns the visible `strokes` (each
  with `id`, `kind`, `path` and `width`), adjacent shared-rail `packs`
  (each with two `ids`, two `paths`, two `widths` and the build's
  `minimum` visible gap), and `ends` (each with `id`, point `at` and
  intended station `bar` ID). Strokes include bars and rendered bus and
  rail lines, with offsets applied. Paths in a pack cover the same stretch
  and end before unrelated junction geometry. Widths and minimums are CSS
  pixels at the sampled zoom. Use `labelOwns` on a stroke for intentional
  contact, such as a line letter on its own line. Optional `handovers`
  are design-approved successor IDs `{from, to}` effective in that frame.

The check measures ink overlap, a 2 px displacement limit measured at the
closer zoom, label persistence, minimum rail gap, and a 1 px rail-to-bar
join limit. It works in projected CSS pixels, so zooming the camera alone
does not count as a moved label. Stroke paths approximate ink as
round-ended segments. Tile and glyph rendering need browser evidence.

## Trial and review evidence

- `npm run check:recall -- --zoom-only` replays the frozen trial captures,
  style and rail geometry listed in `qa/recall/finds.json`. The original
  Classic recall still runs by default, with the trial pins scored alongside it.
- `npm run check:zoom-spacing -- <built trial checkout>` exercises the
  trial renderer model and checks the measured approach and every rail end.
  Its report is scoped to the trial's range.
- `ZOOM_TRIAL_ROOT=<built trial checkout> npm run check:zoom-lists -- <trial origin>`
  runs the trial's route-list ink and placement check every tenth, including
  shoulders of its range where the build places lists. `--blank` is its
  missing-ink control.
- `node qa/zoom-doubled.mjs [--all] <drawing.geojson> ...` compares doubled
  bus-line length and small loop counts between drawings. The report is a
  diagnostic since those shapes can be intentional.
- `npm run check:zoom-captures -- <report.json> <exact preview page URL>`
  captures the report's cameras in both themes. Use the preview for the same
  build. The page must expose its ready MapLibre map as `window.__map` or the
  trial's `window.zoomMap`. The runner verifies the actual camera, writes a
  review-page manifest and tests trial rail layer order. The images are for
  agent inspection and for the next review step.

## Performance evidence

Use `node qa/perf/load.mjs <preview page URL> 4 <build commit>` from a cold
Chromium context. Supply `SOFTWARE_GL=1` if needed. Record the build,
renderer, Pixel 7 emulation, 170 ms and 9 Mbps, and the 4x CPU throttle.
Compare the first usable rail view to DESIGN.md's 2 s floor. Report cold
transfer size, opening long tasks and times between animation frames
during the pan and zoom. The DESIGN.md opening transfer is a comparison
point without a separate byte ceiling.

For remaining device evidence, use the same built preview on a mid-range
physical phone over the target connection. Cold-open to the district view
and time the first readable rail view. At the worst handover and arrival
from the report, pinch through both ways, including a fast pinch to 16.
Record the device, OS, browser, connection, zooms, time and any blank,
doubled or flickering frames. A software renderer can measure transfer
and show static captures. Its frame times do not establish phone performance.
