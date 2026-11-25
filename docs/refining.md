# Refining the map

How a fault on the map is found, understood, fixed and released. Every piece
of drawing work goes this way, whether Chris found the fault on his phone or a
weekly round did. [evaluation.md](evaluation.md) says what evidence a fix
needs and [verification.md](verification.md) what the agent checks itself;
this is the order the work goes in. Each step below names the real case that
set it, so the reason stays with the rule.

The worked example throughout is #97: at Union Station the 15/FreeRide bus
loop ran against the E Line and its stop ring sat on it.

## The round

1. Find. Faults come from Chris's notes and picks on the review page, from
   the map's checks (`npm run check:accuracy`, `npm run check:sheets`,
   `npm run check:recall`), and from sweeps of stations at every zoom in both
   themes. Re-check an old issue on today's map before working it: of the
   four filed before the five sheets, two were already gone (v1.1 step 1).

2. Pin it. Record the build, the place, the zoom and the theme, and keep a
   capture of the fault as it is (`qa/.scratch/`, ignored by git). A fault the
   checks missed goes in `qa/recall/finds.json` on the build it was seen on
   (CLAUDE.md, "Checks"), so a check can be shown to catch it.

3. Check the ground. Compare RTD's data with OpenStreetMap and the
   satellite view before deciding what is wrong. There are three answers and
   they lead to different fixes: the rail is off its track, the bus is off its
   street, or both are right and the drawing makes them collide. At Union
   Station both were right, 12 to 16 m apart; the rail pack is drawn at a
   fixed width on screen, wider than its track.

4. Measure the drawing. On each sheet that shows the fault: distances in
   pixels against the widths the sheet draws at, which rule in
   `scripts/lib/sheets.mjs` drew the piece, and why that rule let it through.
   Draw one sheet on its own with a scratch script calling `drawSheet` rather
   than the full build, and dump the geometry the rule saw. For #97 the loop
   sat 9 px from the E Line's middle where both lines are 8 px wide; the
   turnaround rule had found the loop and made a curve that cleared the rail,
   then thrown it out because it strayed 15 px from the street.

5. Fix by rule. The code draws kinds of things, never named places
   (DESIGN.md, "Zero maintenance"), so the fix is a rule that holds wherever
   the same thing happens. Try it offline on the one place first and look at
   it. Drop what looks wrong, and say why: for #97, pushing the loop's points
   sideways off the rail kinked the line, so the fix keeps the rule's smooth
   curve instead. Only where no rule draws a place well does it go to the
   one-place fixes file (#64).

6. See what else moved. Rebuild every sheet (`npm run build:sheets`),
   list every feature that changed against the committed sheets, and look at
   each place. A rule written for one place reaches others: #97's moved two
   other loops a few pixels (Alameda, and the 48 at 48th & Brighton). Each
   one is either better, no worse, or the fix is not done.

7. Check. `npm test` with a test for the new rule on a made-up network;
   the route check on the branch and on main, compared (no new fault);
   `node scripts/publish-check.mjs`; the health check on the branch preview
   (`CHECK_URL=<preview> npm run check:health -- --trace off`); and captures
   at each zoom the fault showed at, light and dark, at phone size (402×655).

8. Chris decides. Before and after go on the review page with an `ask`
   and choices (CLAUDE.md, "Review page"). It merges on his answer. A version
   is tagged only when he says so (CLAUDE.md, "Releases").

9. Write it down. DESIGN.md gets the rule and a decision-log line in the
   same change; the issue gets a one-line progress comment at each step.

## The work log

Each piece of work keeps a log while it happens: the problem in Chris's
words, what was measured, what the ground shows, the cause, what was tried
and dropped and why, the fix, what else moved, every check and its result,
before and after pictures, and what is waiting on Chris. Entries are written
at the step they belong to, with the time, not reconstructed afterwards.

The log lives on the build machine with the roadmap page it is shown on, not
in this repository: `worklog.py new|add|state` in the work-log folder there,
whose header says how to use it. One log per issue, filed under the roadmap
step it belongs to.

## The weekly round

Once a week a round runs steps 1 and 2 over the whole map and proposes; Chris
picks what gets fixed, and each pick then goes through steps 3 to 9.

- It looks at the route check, the sheet checks and the recall set,
  each compared with last week's run; Chris's comments still open on the
  review page; and captures of a sample of stations at every sheet, both
  themes, drawn with a recorded seed so a later round can repeat it.
- It posts one review request, one item per finding, each with the
  capture, the place and zoom, what looks wrong and the rider consequence
  (evaluation.md, "Priority and evidence"), and the choices Fix and Leave.
  Findings already left once are not proposed again unless they change.
- It never changes the map. A round only finds and proposes.
