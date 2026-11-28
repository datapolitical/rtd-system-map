# Working on the map versions

| Branch | Role | Entry point |
|---|---|---|
| `main` | Current map; normal fixes land through small branches | `/`, running `public/js/sheets/main.js` |
| `zoom-154-merge` | Smooth-zoom trial | `/zoom/`, running `public/js/zoom/main.js` |
| `classic-archive` | Preserved Classic application | `/classic/`, running `public/js/main.js` in that archive |

Classic was archived at `811135ffe4230f598082667c7fda20994d1bd97d`.
The archive preserves the complete source snapshot, including the shared data
build and original checks. It is a source archive, not a separate hosting service.
Main redirects old `/classic/` links to the current map, preserving the view fragment.

## Parallel work

Use a separate Git worktree for each active branch. Keep the existing smooth-zoom
worktree on its branch. Do not change another session's checkout or copy its
generated data back into main.

Each worktree runs its own `npm ci`. Never link `node_modules` to another
checkout: `npm ci` and `npm install` empty a linked folder's target, so one
install in a linked worktree empties the checkout the live site deploys from.
Before installing in a worktree someone else set up, run `ls -ld node_modules`;
if it is a link, remove the link itself (`rm node_modules`, no trailing slash)
and then run `npm ci`.

Make current-map and generally applicable data fixes on a small branch from
`origin/main`, test them, and merge through a pull request. Then merge the
updated `origin/main` into the smooth-zoom branch. Resolve shared-engine
conflicts there and run both the normal tests and the trial's checks.
Trial-specific changes stay on that branch until reviewed.

The implementation agent owns routine visual and interaction review, follows
the evidence requirements in [verification.md](verification.md), and fixes
what it finds. User involvement is limited to prepared device-specific checks,
unresolved product tradeoffs and final formal-release approval. Isolated
engineering proceeds under parity and regression checks while those are pending.

The trial changes `scripts/lib/sheets.mjs`, so these branches still share an
integration boundary. Keep changes to shared drawing functions small, with
regression evidence that the current sheets still draw the same way.
Do not merge `classic-archive` into main.

## Current map

Follow the README to install, build and serve it. With that server running:

```sh
npm test
npm run check
npm run check:sheets
npm run check:a11y
```

`npm run check` runs Chromium in light and dark: health at every sheet scale,
route selection, theme switching, reload, Escape and old Classic links.
`check:sheets` is the longer existing sheet regression script.
`npm run check:evidence` collects fingerprinted version-specific views and
whole-feature diagnostics; [evaluation.md](evaluation.md) defines their scope
and limitations. It does not award overall acceptance.
Set `CHECK_URL` to a particular preview when testing that build. The nightly
workflow runs only sheet health; the branch-preview workflow remains disabled
until deliberately enabled. Neither reports smooth-zoom acceptance.

## Smooth zoom

In the trial worktree, follow `docs/zoom-prototype.md`, which exists only on
`zoom-154-merge` (PR #224), not on main. Its additional commands
are `npm run prototype:zoom`, `npm run check:zoom` and
`npm run check:zoom-spacing`. A normal `npm run build` does not generate the
trial bundle. Select its generated `/zoom/` preview explicitly and report
which commit, themes and zoom range were checked. Current-map checks do not
establish that the trial works.

## Classic and historical checks

To run the preserved application in a separate worktree:

```sh
git fetch origin
git worktree add --detach ../rtd-system-map-classic origin/classic-archive
cd ../rtd-system-map-classic
npm ci
npm run build
wrangler pages dev public --port 8877
```

Open `http://127.0.0.1:8877/classic/`. Its data build downloads today's public
inputs; use frozen QA fixtures for an exact historical drawing.

Main retains `qa/classic/js/` as a renderer fixture for the existing unit and
recall regressions. It has no page, startup script or production CSS and is
outside the deployed `public/` output. Browser checks for archived builds
live in `qa/classic/checks/` and require an explicit target:

```sh
CHECK_URL=http://127.0.0.1:8877 npm run check:classic
```

`npm run check:recall` still checks frozen historical builds. Shared geometry,
frequency, realtime protocol and data-processing code remain available for the
current map and planned smooth-zoom features.
