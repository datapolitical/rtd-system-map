# Daily review: find new problems

You review the RTD system map (datapolitical/rtd-system-map). Today you
review the running site under the lens below and file what you find as
GitHub issues. Nothing is committed in this part.

## The site

Run `npm ci` and `npm run build`, then serve the site with
`npx wrangler pages dev public --port 8797` and set `CHECK_URL` to
`http://127.0.0.1:8797` for any check script. Stop the server when you
are done. Do not use port 8788 or 8795.

## The ledger

Read the ledger first: fetch the orphan branch `daily-ledger` and read
`ledger.json` from it (`git show origin/daily-ledger:ledger.json`, or
check the branch out in a detached worktree; do not commit to it in
this part). It records which lenses ran and what they found, which
places, routes, zoom levels and DESIGN.md sections have been looked at
and when, the rider trips tried, the last main commit and GTFS feed
reviewed, and every issue this job filed with its outcome, plus `rounds`
per issue and the model that did each run. Prefer places, routes and
zooms the ledger has never seen or saw longest ago. Pick them from the
built data (`public/data/`), never from memory.

## Today

1. Outcomes first: for each issue in the ledger's `filed` list that is
   still marked open, check it on GitHub. If the issue was closed as not
   planned, mark it `not planned` and add a one-line summary to
   `dont_refile`. If fixed and closed, mark it `fixed`.
2. Triggers: if origin/main has commits since `last_main_sha`, look
   first at the parts of the map those commits touched. If the GTFS feed
   in the build differs from `last_feed` (feed_info or the service
   dates), check what changed in the network and whether the map shows
   it.
3. The lens (below), over today's places: at least six views, phone
   viewport 402x874, Chromium, both themes where it matters, zooms
   spread over the range the lens covers, at places the ledger has not
   seen. Wait for the map to go idle the way `qa/checks` does (see
   `qa/lib/inpage.js`: an `idle` then the letters the page places, up to
   three rounds) before reading a view.
4. Two rider trips: pick two pairs of real places from the data that the
   ledger has not tried (an address-like spot near a stop, a
   neighborhood, the airport, a Park-n-Ride) and try the matching
   DESIGN.md "Validation" tasks on the phone viewport, as a rider would,
   only by looking and tapping. Note where you got stuck or got a wrong
   answer.
5. Satellite check: for every place you assess under the lens, render
   its satellite overlay with `qa/sat/render.py`
   (`python3 qa/sat/render.py public/data/ <out.png> W,S,E,N`, needs only
   a plain `python3` plus Pillow; the workflow installs it) and check
   every shape the map draws against the real structure in the photo.
   Save every capture you look at under `qa/.scratch/daily/` in the
   worktree.

## Filing

- Before filing, search all issues, open and closed
  (`gh issue list --state all --search "<words>"`), and the ledger's
  `dont_refile`. Do not refile anything already there; if an open issue
  covers it and you have new evidence, add a one-line comment instead.
- File only real, specific problems you saw or measured, at most four a
  day. Each issue: what is wrong, where (place, zoom, theme), how you saw
  it, why it matters for a rider, and what done looks like, in the style
  of the existing issues. Include a `places` hint for the builder: a
  small bounds box (a few hundred metres) and, if the fault is visible
  only at some zooms, how to check it (for example "check at zoom 16 in
  the satellite overlay"). Label `found daily` (plus `bug` when it is
  one), put it in the right milestone, and add `Estimate: N min of agent
  time`.
- Public repo: issue text about the map only. No budgets, costs, usage
  numbers, machine names or personal details.
- Nothing found under a lens is a valid result. Do not pad.

## Finish

Write `daily-summary.txt` in the worktree root (the workflow uploads it;
do not commit it): at most three short plain lines (issues filed with
numbers and titles, or "nothing new under <lens>"). The ledger is
written back by the workflow, not by you in this part.
