# Recall: how much of what is wrong the checks catch

A check that finds nothing has two explanations: the map is right, or the
check is blind. The report (`npm run check:map`) cannot tell them apart. This
folder can: it scores the same checks against faults we know are there.

```sh
npm run check:recall                         # score; fail if worse than baseline.json
npm run check:recall -- --update-baseline    # after a detector gets better
```

It prints, for each frozen build, which known faults the checks caught and
how many planted faults of each kind they caught, and writes
`qa/recall/out/recall.json` and `recall.txt`.

## What it scores against

**Finds** (`finds.json`): faults a person saw, pinned to the ground. Each has
the words it was reported in, the build it was seen on, the zoom and theme,
the points on the ground, a radius in px, and `caught_by`: the finding kinds
that count as catching it. A kind no detector reports yet (`hook`,
`overshoot`, `terminal-shape`, ...) still goes in `caught_by`, so the score
shows what is not covered instead of leaving it out. `latest` says what the
fault looks like on the newest frozen build.

`pins.mjs` writes `finds.json`. Each pin keeps the capture view and the
picture pixels it was read from, so anyone can open the same view and check
it. To add a find:

1. Freeze the build it was seen on, if it is not already (below).
2. `node qa/recall/capture.mjs --url <preview> --view z/lat/lon --theme dark --out qa/.scratch/recall/x.png --grid`
3. Read the fault's pixels off the grid; add a pin to `pins.mjs`; run `node qa/recall/pins.mjs`.

**Planted faults** (`plant.mjs`): the newest frozen build's own data, broken
on purpose at places picked by a seeded walk, five of each kind, the way real
faults break it, and only in features the page draws at z16 or z17 (a fault
in a feature no layer draws is not a fault anyone can see). Each kind has its
own random stream and its own spacing (1.2 km between its plants, 400 m from
any find), so changing how one kind is planted never moves another. A rail
line is carried past its end only at a real terminus, with a station of the
line within 150 m. The kinds: a 20 m cut in a bus street or a
rail line, an 80 m stretch moved 5 m sideways, a stray 6 m piece, a rail end
carried past its station, a hook at a route end, a street pulled off its
street, a part-time stretch moved off its line, a stop moved away from its
lines, a station drawn twice, a terminal outline that crosses itself. Each
kind lists the finding kinds that catch it. A finding counts for a planted
fault only if the unplanted build does not already have it there.

Label faults are not planted yet: moving a station beside another does not
make a fault by itself (MapLibre tries every anchor and usually places both
names), so a label plant needs the placement replay to know its name really
lands on a line or is hidden. That comes with the label work (#47).

## Two numbers for each

- **caught by the report**: by `qa/checks/run.mjs` as `check:map` runs it,
  at its own places and zooms.
- **when pointed there**: the same checks, also run at the fault's place.

A fault caught only when pointed there means the detector works but the
report never looks there: label, mark and street checks run at 22 places,
not the whole district. A fault caught by neither means the detector is
blind to it.

## Frozen builds (`fixtures/`)

A build cannot be repeated: `scripts/build-data.mjs` reads RTD's ArcGIS layers
and OpenStreetMap live. So a fixture is the deployed output itself, taken
from the commit's Cloudflare Pages preview:

```sh
node qa/recall/snapshot.mjs --url https://<id>.rtd-system-map.pages.dev --commit <sha> --out qa/recall/fixtures/<sha7>
```

It holds the page's code (checked against git at the commit), the build's
data, the glyph ranges the labels use, the basemap's TileJSON and the tiles
read so far. The model opens it with `root: <dir>`.

| Fixture | Why |
|---|---|
| `0fe749b` | The build Chris looked at on 2026-11-08 when he listed the faults in #42 (the `union-building` preview until 74d93c6 landed at 18:11). |
| `74d93c6` | The next `union-building` build. |
| `430ea4a` | The newest `evaluator` build when this was made; faults are planted in it (`plant_on` in `fixtures.json`). |

Fixtures are not in git: at 7 to 17 MB each (the tiles they read included)
they would make every clone of a 5 MB repository several times larger. They
are tarballs on the `checks-fixtures` release, listed with their sha256 in
`fixtures.json`; `recall.mjs` downloads and checks one when
`qa/recall/fixtures/<id>` (ignored by git) is missing. `RECALL_FIXTURES_BASE` points it at a mirror
of the release instead. To add one: snapshot
it, run `check:recall` once so the tiles it needs are cached in it, pack it
reproducibly, upload it to the release, and add it to `fixtures.json`:

```sh
tar --sort=name --mtime='2026-11-10 00:00Z' --owner=0 --group=0 --numeric-owner \
  -cf - -C qa/recall/fixtures <sha7> | gzip -n -9 > <sha7>.tar.gz
gh release upload checks-fixtures <sha7>.tar.gz
```

## The ratchet

`baseline.json` is the last accepted score. `check:recall` fails when any
find it caught is missed, or any kind of planted fault is caught fewer times,
with the same seed. When a detector gets better, update the baseline in the
same commit. A detector change that lowers the score is a detector that got
blinder, whatever the report's count of findings did.
