# The rules the map is checked against

A check can only find a fault it has a rule for. Until 2026-11-11 the rules
came from faults Chris reported, one at a time. That evening he found seven
by eye that no rule described, and asked why the checker was waiting for him.
This folder is the answer: every rule we know of for how the map must be
drawn, where it comes from, and whether anything checks it.

| File | What it holds |
|---|---|
| [`fault-classes.md`](fault-classes.md) | The checker's scope: every class of fault a transit map can have, from first principles, each with how a detector sees it and where it runs. Reported finds measure recall against it; they don't define it (#114). |
| [`design-invariants.md`](design-invariants.md) | The 109 drawing rules DESIGN.md states, each with its line, how it could be measured on the drawn model, and what checks it today. Also a table of every detector and where it runs. Audit of main at `3e38acb`. |
| [`literature.md`](literature.md) | 77 rules from published practice (metro-map layout research, line bundling, label placement, minimum sizes on phone screens, agency standards), each with its source and the page that was loaded. 75 have a source; 2 are marked as having none. Thresholds are tagged `(source)` or `(suggested)`. |

## Where we stand

The audit below is of main at `3e38acb`, before the checks in "What gets
built first" existed. Since then the report runs at every half zoom from 10
to 17 (27 seconds a theme) with the rows marked "yes" in that table. On the
build Chris reviewed (`e2bae25`) it reports 687 findings; on the live build
that evening (`3e38acb`), with his finds fixed, 140. All ten pins made from
his seven comments are caught on the first, and the two still open (bus
lines under rail) on the second.

| DESIGN.md's 109 rules | |
|---|---|
| Checked in full on the drawn map | 5 |
| Checked in part (some zooms, or part of the rule) | 29 |
| Not checked | 75 |

- The line checks run on the whole district but only at zoom 12, 14, 16 and
  17. The label, mark and street checks run at 22 places. Nothing looks at
  zoom 9 to 11.5, 13 or 15.
- The deeper browser checks (continuity, marks, labels, contrast) are tagged
  `@deep` and no workflow runs them.
- The model has no measure of the spacing between lines, the angle of a
  mark, or a line against its platform or roof.
- Some checks excuse the very case that was reported: `line-covered` skips a
  bus under rail, `over-line` skips a station's own lines (so the hub's name
  is never flagged), `hook` and `tick` are excused within 60 m of a station.

## What gets built first

Ordered by how likely a broken rule is to show on a phone. The first seven
are Chris's finds of 2026-11-11, pinned on the frozen build he saw them on
(`e2bae25`) so the score shows each one caught.

| # | Rule | DESIGN.md | Literature | Measure | Checked today |
|---|---|---|---|---|---|
| 1 | Every rail line ends in a mark of its own, at every zoom from 11 | SM08 | LN-01 | each free rail end inside an own-line mark's box, per half zoom 11 to 17 | yes: `end-unmarked`, in pixels against drawn marks, every half zoom |
| 2 | The marks of one station are parallel | PG02 | ST-02 | difference of the marks' turn at most 1 degree | yes: `marks-not-parallel` |
| 3 | The gaps in a pack of lines are equal | ST02 | PL-02, PL-03 | spread of the gaps between neighbouring centrelines at most 0.3 px | yes: `uneven-gap` at 0.5 px (0.3 px flags 19 places of 0.2 m on the live build) |
| 4 | Lines that run on after another ends do not drift | RL10 | PL-11, PL-12 | sideways offset constant within 0.5 px away from the end mark | yes: `drift`, within 150 m of the end of a line beside it |
| 5 | A line runs parallel to its platform and ends under its roof | SS02, SS03 | ST-01 | angle of the line's last 100 m to the platform's long axis at most 2 degrees; the end not past the roof | yes: `skew`, `past-roof`, `off-platform` |
| 6 | A bus line and its stops are not hidden under rail | BS12 | KD-02, KD-03, PL-01 | share of a bus stroke covered by rail strokes; stops outside the rail's casing | yes: `under-rail`, `stop-on-rail`, from zoom 15 |
| 7 | A line eases between places without a kink, at every zoom | RL09 | JN-01, LN-05, PL-13 | sideways change per pixel along the track below a limit, per half zoom from 10 | yes: `steep-ease`, more than 0.6 px across per px along |
| 8 | The two marks, the walk and the hall are one straight line | PG01 | ST-02 | bearing between the marks against the hall's axis within 2 degrees | yes: `walk-bent` (no real case yet; unit test and a planted one) |
| 9 | Lines that end at one station end flush | RL04 | LE-01 | spread of the ends along the track at most 1 px | yes: `ends-uneven` |
| 10 | Lines never swap sides along a corridor | ST04 | PL-05, PL-06 | the sign of each pair's offset is constant | yes: `swap` (no real case; unit test and a planted one) |
| 11 | A mark is square to its lines and as wide as them | SM01 | ST-01, ST-04 | mark turn against the track within 2 degrees; length against lines times width | yes: `mark-askew`, `mark-short`, from zoom 11 |
| 12 | A second mark does not overlap the station's own | SM09 | ST-07 | box overlap of marks sharing a station id | yes: `marks-overlap` (Union Station's two marks overlap at zoom 11 to 12 on purpose; reported) |
| 13 | No name sits on the walk or on a second mark; one name per station | PG05 | LB-02 | name boxes against the walk's dots and group marks | no |
| 14 | Platforms and roofs end at the mark | SS04 | | polygon extent along the track against the mark | yes: `past-mark` |
| 15 | No bus line is drawn through a hall | TH03 | | length of bus stroke inside hall polygons is zero | yes: `bus-in-hall` |
| 16 | A stop only trains call at is not drawn as a bus stop | SP01 | | no `stops` mark with rail-only lines | yes: `rail-only-stop` |
| 17 | Rail letters: evenly spaced, on their own line, none past or against an end mark | LT02, LT05, LT06 | LB-04 | distance along the line between a route's letters; letter to mark distance | no |
| 18 | Names of places and streets, and highway shields, never cover a line | LN05, LN06, LN07 | LB-02 | basemap label boxes against line strokes | no (the model has no basemap labels) |
| 19 | The hub's name stays off rail and frequent buses from zoom 15 | LN10 | LB-02 | name box against strokes, own lines included | no (`over-line` exempts own lines) |
| 20 | No sliver between strokes at any zoom: side by side with a visible gap, or merged | | PL-03, CZ-02, JN-04 | no edge-to-edge gap between 0 and 1.2 px (Ledermann 2022) | yes: `sliver`, between rail strokes only |
| 21 | Branches leave without a kink and not at a tiny angle | | JN-01, JN-02 | tangent jump at a node; smallest angle at least 15 degrees (suggested) | no |
| 22 | No zig-zag and no bend at a station | | LN-03, LN-04, LN-06 | inflections per 10 line widths; turning across a mark | part: `zig-zag`, `sharp-bend`, quiet on the live build; no real case pinned |
| 23 | Width says the class: one class one width, classes visibly apart | CW rows | KD-04, LN-08 | same class within 0.25 px; neighbouring classes at least 1.6 px apart (Ledermann 2022) | part |
| 24 | A line is not cut: no gap mid-line, at any zoom from 9 (#115) | | LN-01 | two facing free ends of one route within 12 line widths | yes: `break`, with tiling's sliver drop modelled (geojson-vt tolerance) |
| 25 | No line end hidden under a mark that covers it (#115) | | LN-01 | length of a free end under an opaque mark, read from the mark's pixels, at most 1.5 widths + 2 px | yes: `end-hidden` |

Rows 20 to 23 come from the literature and are not in DESIGN.md. A check for
one of them is a proposal: its findings are leads until the rule is written
into DESIGN.md.

## How a rule becomes a check

1. Pin a real case in `qa/recall/pins.mjs`, on a frozen build, before the
   fault is fixed (qa/recall/README.md).
2. Write the detector in `qa/drawn/`, with a unit test on made-up geometry.
3. Run `npm run check:recall`: the pin is caught, nothing else is lost, and
   `baseline.json` is updated in the same commit.
4. Change this page's "Checked today" cell and the row in
   `design-invariants.md`.

A rule's threshold marked `(suggested)` in `literature.md` is a starting
point: it is set by what separates the pinned faults from the rest of the
map, not by the number in the paper.
