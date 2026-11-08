# Headless checks

Playwright Test specs that open the site in headless Chromium (an iPhone 14
profile, in light and dark, software GL) and measure what the map draws.
Some are the measurements behind the "Done when" lines of DESIGN.md,
milestone 3 (the sentence each verifies is at the top of its file); the
others are detectors that look for faults nobody has listed yet, on any
view. Every spec's header says what fault it finds and its threshold.

| Spec | Run by | What it checks |
|---|---|---|
| `letters.spec.mjs` | check (+ deep) | Twenty seeded phone views at 10 to 12 show a letter for every rail line. Deep: twenty more from another seed; a seeded fault (letters hidden). |
| `stations.spec.mjs` | check | Station marks at 10 and 10.5 do not overlap or crowd; names within 25 px of their mark; the hub is named at every zoom. |
| `buses.spec.mjs` | check | Bus arrows at 14: count, ring contrast (needs Live data); dark tier contrasts. |
| `key.spec.mjs` | check | The Key's images are the map's, at the map's sizes and pixels. |
| `live.spec.mjs` | check | Live on at 9.75, 10.3 and 11 shows trains or says why not; needs the relay. |
| `health.spec.mjs` | check (+ deep) | No console errors or warnings, page errors, failed or 4xx/5xx requests, and `validateStyleMin` passes on `map.getStyle()`. |
| `a11y.spec.mjs` | check | axe-core, WCAG 2.0/2.1 A and AA, on the map alone, Key open, a panel open, search focused; the canvas is exempt. |
| `visual.spec.mjs` | check | Three baseline screenshots per theme (hub at 9, 11.5, 14), tolerant threshold, Live masked. |
| `continuity.spec.mjs` | deep | Rail lines (and the frequent bus tier at 14) unbroken on screen: gaps, covers, sideways jogs at piece joins; routes.geojson pieces that meet and ease between slots; a regression fixture at a known break. |
| `marks.spec.mjs` | deep | Station marks overlapping or crowding at 9.75 to 14, every station. |
| `labels.spec.mjs` | deep | Station names far from their mark, network labels under a card, labels over labels or marks, at 10 to 14. |
| `contrast.spec.mjs` | deep | Lines and marks against the land, letters on bullets (4.5:1), bus tiers in order, per theme. |

Each detector spec also has a test that seeds a fault in the page (a
`setPaintProperty`, `setFilter` or `setLayoutProperty` change, restored after)
and proves the detector fires on it. The detectors live in `../lib/`:
`inpage.js` reads the map (lines from `routes.geojson` as served, sizes and
colors from the style's own expressions), `detect.mjs` judges, `views.mjs`
makes seeded views and tiles. Nothing there names a line, station, color or
place. They are not unit tests: `npm test` stays pure Node.

## Running

1. `npm run build` once, so `public/data/` exists.
2. Start the site with `npm run dev` (port 8788). For `live.spec.mjs`, also
   start the relay with `npm run dev:live` (port 8789). The checks never
   start a server: one started from the config would hide a server that
   had died mid-run.
3. `npm run check` runs the fast set (everything not tagged `@deep`,
   about 15 minutes for both themes). `npm run check:deep` runs the slow
   detectors (tiles every station at several zooms; see the durations in
   the final lines of each run). To narrow either:
   - one spec: `npm run check -- stations`
   - one project: `npm run check -- --project=phone-dark`
   - one test: `npm run check -- -g "Key matches the map at 10"`
   - skip Live when the relay is down: `npm run check -- --grep-invert "Live shows"`
4. `npm run check:report` opens the HTML report (`qa/report/`) with the
   captures and numbers each test attached. A detector that fires attaches
   a capture with each finding circled and numbered, and a JSON list of the
   findings; the same files are written under `qa/checks/out/<test>/`.

Set `CHECK_URL` to point at another server (for example production); the
detectors then read that server's own data. The browsers are Playwright's
(`npx playwright install chromium` if missing). Use Chromium only: the
config forces it, because the iPhone profile's default, WebKit, ignores the
software-GL flags and its GPU process ran a 16 GB Mac out of memory.

## On GitHub

Three workflows run the fast set there: `checks-nightly.yml` (main, nightly),
`checks-preview.yml` (every branch) and `checks-baselines.yml` (on request,
to capture the visual baselines). They are green runs on the site, not tests
of the check code itself. `CHECK_JSON` makes Playwright write
`qa/report/results.json`, which `github.mjs` reads.

- **Checks (nightly)** runs at 01:20 Denver time and on `workflow_dispatch`,
  against https://rtd-system-map.pages.dev. Each failing spec opens an issue
  labelled `found by checks` (or comments on the open one) with its failing
  tests, the findings its detectors attached and a link to the run; when the
  spec passes again the issue is commented on and closed. The HTML report and
  `qa/checks/out/` are the run's artifact.
- **Checks (branch preview)** runs on every push to a branch but main. It
  waits for that commit's `Cloudflare Pages` check run, checks the branch's
  preview URL, and puts the design review's fixed views, both themes, on
  `design-review.png` (with the individual captures and `views.json`) in the
  artifact. Its one-line result is the commit status `checks/preview`; a
  failing spec opens or comments on the same per-spec issue the nightly uses.
  A push that changes only files outside the site (the workflows, `qa/`,
  docs) gets no Cloudflare build: the run says so and checks the branch's
  earlier preview if it has one, or skips with a green status.
- **Checks (baselines)** runs on `workflow_dispatch` from main: it captures
  `visual.spec.mjs`'s views on the same runner the nightly uses, uploads what
  it took, and commits the `-linux.png` images that changed to main. A run
  that finds nothing new is green and says so.

Reading a run from the command line:

```
gh run list --workflow checks-nightly.yml --limit 5
gh run view <id> --log-failed
gh run download <id> -D <dir>          # qa/report/, qa/checks/out/, qa/review/
gh run watch <id>
```

Or open the repository's Actions tab and download the run's artifact: it
holds the HTML report (`index.html`, open it locally), every capture, the
per-test JSON the issues are written from, and on branch runs the contact
sheet. Artifacts are kept for 90 days.

The `@deep` specs are out of both workflows for now. Whether each spec behaves
on GitHub's software GL is settled by the runs: any spec that cannot be made
reliable there is left out of the set and named here.

## Visual baselines

`visual.spec.mjs` compares against images in
`visual.spec.mjs-snapshots/` (one per view, theme and platform). A failure
there means the map looks different, not that it is wrong: open the report,
look at the expected, actual and diff images, and if the change was meant,
refresh the baselines and commit the new images with the change:

- On GitHub, where the nightly compares: Actions → "Checks (baselines)" →
  Run workflow from main. It captures on GitHub's runner and commits the
  `-linux.png` files to main itself.
- On your machine: `npm run check:baselines` against the dev server, then
  commit the `-darwin.png` files it writes.

A platform with no baseline yet is not a failure: the check writes the image
from that run, says so in the job summary and the report, and passes. The
image is in the run's artifact, so a new platform's baselines can be taken
from there too.

## The sweep

`npm run sweep` (`qa/sweep/sweep.mjs`) tiles the district at the phone's
screen from `meta.json`'s bounds, at 10.5, 12 and 14 in both themes, keeps
the tiles that hold rail, the frequent bus tier or a station, and runs the
continuity, marks, labels, letters and contrast detectors on each.
Flags: `--quick` (every 8th tile, light only unless `--theme`), `--zoom
12` or `--zoom 10.5,14`, `--theme dark`, `--estimate` (count tiles and
stop). It recycles the browser context every 30 tiles and stops, closing
the browser, if free memory (`memory_pressure`) falls under 25%.

It writes `qa/sweep/out/` (ignored by git):
- `report.html`: findings ranked by severity (broken line, overlapping
  marks, crowding, missing letter, name far from its mark, label under a
  card, contrast, notes), one card each with a circled crop, what is wrong,
  the theme and zoom, and the place as a link that opens the map there;
  "whole screen" opens the tile's capture with every finding numbered.
- `findings.json`: the run (server, zooms, themes, tiles, minutes, lowest
  free memory, whether it stopped early), every finding (kind, severity,
  zoom, lat, lon, theme, message, capture), and a per-tile log.

A finding is a lead, not a verdict: look at its crop before reporting it.

For a human or AI pass over the whole site, see [../BRIEF.md](../BRIEF.md).
