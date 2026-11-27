# Keeping the map working

What happens when RTD changes its data, what watches the live site, and what
has broken before and how it was fixed. DESIGN.md, "Zero maintenance", says
why it works this way; this is how to run it. A drawing fault found on the way
is worked through [refining.md](refining.md).

## When RTD changes its data

RTD changes its schedules three times a year (January, May, and late August or
September) and edits its map or republishes its feed now and then between.

1. The hourly check on the build machine (`refresh/watch.mjs`, run by the
   user timer in `refresh/systemd/`) asks RTD whether anything
   changed since the live site's data was built, and sends one phone alert
   naming what changed. It rebuilds nothing. `node refresh/watch.mjs --dry-run`
   shows what it would say.
2. In a worktree from main, run `npm run build:data`. It downloads RTD's
   layers and GTFS, draws the five sheets and takes the loading pictures.
3. Look at the result before deploying: `npm test`, the route check
   (`npm run check:accuracy`) against the last build's, and the sheets at
   phone size in both themes where the change is (new routes, moved stops, a
   new runboard's frequencies). Anything the new data draws badly is fixed as
   in refining.md before it goes live.
4. Commit `public/index.html`, `public/icons`, `public/manifest.webmanifest`
   and `public/og.png` (the build rewrites them). `public/data` and
   `public/poster` are not committed. Push a branch, run `npm run deploy`
   from it, check the preview at `<branch>.rtd-system-map.pages.dev`, and
   merge.
5. A merge does not publish. From `main`, with the merged commit checked out
   and the data built from it, run `npm run deploy`: that publishes the live
   site.

## Deploying

Cloudflare builds nothing. `npm run deploy` (`scripts/deploy.mjs`) runs the
publish check (`scripts/publish-check.mjs`) against the build on disk and
refuses to upload when it fails, or when the worktree has uncommitted changes
(`--allow-dirty` overrides that). It writes `public/deploy-manifest.json`
(commit, branch, dirty or not, when the data was built) and runs
`wrangler pages deploy public` for the project `rtd-system-map`, with the
current branch name and commit. A branch other than `main` becomes a preview
at `<branch>.rtd-system-map.pages.dev`; `main` becomes the live site. Open
`/deploy-manifest.json` on the site to see which commit it is.

Wrangler reads its credentials from the environment: `CLOUDFLARE_API_TOKEN`
is the contents of `~/.config/cloudflare/mini-sites.token` in the account that
runs the build on mini, and `CLOUDFLARE_ACCOUNT_ID` is the Cloudflare account's
ID. Neither is kept in the repository.

Cloudflare's Git integration no longer builds previews. Set it to stop
building production too when this change is merged.

A fresh checkout has no `public/data` or `public/poster`, so run
`npm run build:data` (about six minutes) before `npm run deploy`, `npm run dev`
or the tests that read the built map; those tests skip when it is missing.
The smooth-zoom trial's build is never committed or deployed from `main`.

## When the basemap should be newer

The basemap's tiles are the site's own (`basemap/`, DESIGN.md, "Data"),
read out of OpenFreeMap's weekly planet build, so nothing changes under the
live site when OpenFreeMap publishes. To bring in newer streets and places,
in a worktree from main run `npm run build:basemap` (about 40 minutes: it
reads the district's tiles one by one out of the planet file), then
`npm run build:sheets` for new loading pictures. Commit `basemap/` with
what `build:sheets` changes. A style change that draws a new ground layer,
property or zoom needs it too: the basemap keeps only what the style draws,
and the publish check fails when the style asks for a property the basemap
left out.

## When the drawing code changes

`npm run build:sheets` redraws the sheets, pictures and icons from the
data on disk, so a drawing fix does not bring in RTD's newer data with it.
Commit what it changes outside `public/data` and `public/poster` with the
code. `node scripts/publish-check.mjs` run locally gives the same answer
`npm run deploy` will.

## What watches the live site

- Each night a GitHub workflow (`.github/workflows/checks-nightly.yml`) loads
  the live map and fails on a console error, a failed request or a style
  error. A failure opens an issue labelled `found by checks`; the next pass
  closes it.
- The hourly check above, for RTD's data.
- The weekly round (refining.md, `qa/round/`), for how the map looks. Its
  files are in `~/.local/state/rtd-map-round/` of the account that runs it,
  one folder per week; `journalctl --user -u rtd-map-round` shows its runs.

## What has broken before

- The full build stopped at the loading pictures in a fresh worktree:
  `public/vendor` (the map library and fonts) is made by `scripts/vendor.mjs`
  and not committed. `build:sheets` and `build:data` now run it first; a hand
  run of a single script may still need `node scripts/vendor.mjs`.
- A branch preview is made by `npm run deploy`, not by Cloudflare, so no
  check run appears on the commit. Confirm a preview carries the build by
  reading its `/deploy-manifest.json`: the commit must be the branch's head.
- An icon cropped from the map looked the same at two zooms: the map draws in
  steps, so a fractional zoom shows the same sheet. `scripts/icons.mjs` takes
  a wider square at the same zoom and shrinks it instead.

Add each new failure here with how it was found and fixed.
