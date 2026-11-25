# Keeping the map working

What happens when RTD changes its data, what watches the live site, and what
has broken before and how it was fixed. DESIGN.md, "Zero maintenance", says
why it works this way; this is how to run it. A drawing fault found on the way
is worked through [refining.md](refining.md).

## When RTD changes its data

RTD changes its schedules three times a year (January, May, and late August or
September) and edits its map or republishes its feed now and then between.

1. The hourly check on the build machine (`refresh/watch.mjs`, run by the
   user timer in `refresh/systemd/`) asks RTD and the basemap whether anything
   changed since the live site's data was built, and sends one phone alert
   naming what changed. It rebuilds nothing. `node refresh/watch.mjs --dry-run`
   shows what it would say.
2. In a worktree from main, run `npm run build:data`. It downloads RTD's
   layers and GTFS, draws the five sheets and takes the loading pictures.
3. Look at the result before committing: `npm test`, the route check
   (`npm run check:accuracy`) against the last build's, and the sheets at
   phone size in both themes where the change is (new routes, moved stops, a
   new runboard's frequencies). Anything the new data draws badly is fixed as
   in refining.md before it goes live.
4. Commit `public/data`, `public/poster`, `public/index.html`, `public/icons`,
   `public/manifest.webmanifest` and `public/og.png` together, push a branch,
   check its preview, and merge.
5. Cloudflare publishes. Its build (`npm run build`) downloads nothing; it
   runs `scripts/publish-check.mjs`, which refuses to publish when a file is
   missing or the committed data was not made by the code going live. The
   live site then stays as it was.

## When the drawing code changes

`npm run build:sheets` redraws the sheets, pictures and icons from the
committed data, so a drawing fix does not bring in RTD's newer data with it.
Commit what it changes with the code. `node scripts/publish-check.mjs` run
locally gives the same answer Cloudflare's build will.

## What watches the live site

- Each night a GitHub workflow (`.github/workflows/checks-nightly.yml`) loads
  the live map and fails on a console error, a failed request or a style
  error. A failure opens an issue labelled `found by checks`; the next pass
  closes it.
- The hourly check above, for RTD's data and the basemap.
- The weekly round (refining.md, `qa/round/`), for how the map looks. Its
  files are in `~/.local/state/rtd-map-round/` of the account that runs it,
  one folder per week; `journalctl --user -u rtd-map-round` shows its runs.

## What has broken before

- The full build stopped at the loading pictures in a fresh worktree:
  `public/vendor` (the map library and fonts) is made by `scripts/vendor.mjs`
  and not committed. `build:sheets` and `build:data` now run it first; a hand
  run of a single script may still need `node scripts/vendor.mjs`.
- A branch preview's state is a GitHub check run named "Cloudflare Pages",
  not a commit status: read it with
  `gh api repos/OWNER/REPO/commits/SHA/check-runs`. Confirm a preview carries
  the new build by comparing its `/data/sheets.json` with the committed one.
- An icon cropped from the map looked the same at two zooms: the map draws in
  steps, so a fractional zoom shows the same sheet. `scripts/icons.mjs` takes
  a wider square at the same zoom and shrinks it instead.

Add each new failure here with how it was found and fixed.
