# RTD system map

Read [DESIGN.md](DESIGN.md) before changing the map, interface, or data
pipeline. It is the source of truth for the objective, audience, data sources,
visual design, and milestones. If a decision changes, update DESIGN.md and add
a line to its decision log in the same change.

Never hardcode anything about RTD's network: layer URLs, route lists, rail
colors, station IDs, corridor assignments, or service dates. Derive them from
RTD's data at build time so RTD's changes flow through with no code change
(DESIGN.md, "Zero maintenance").

- `npm run build` downloads RTD's public ArcGIS layers and GTFS into
  `public/data/` (generated, not committed).
- `npm run dev` serves the site locally with `wrangler pages dev` on port 8788;
  `npm run dev:live` runs the Live relay (a Durable Object in `live/`) beside
  it on 8789, which the site finds on its own.

## What's left to do: GitHub Issues

Open work lives in this repo's Issues, not in chat or `status.json`. Each open
milestone is one stage of work, and Chris's status page draws its "How close
we are" section from them (closed issues show as done).

- Start with `gh issue list --milestone "<stage>"`. Before working an issue,
  add the `in progress` label and comment the branch you are on.
- Post progress as a one-line comment. The status page shows the first line
  of the newest comment under the step.
- Close work with `Fixes #N` in the commit message. It closes when the commit
  reaches main on GitHub. Close it by hand if the work lands another way.
- When something waits on Chris (a phone check, a decision, the go-ahead to
  publish), add the `needs Chris` label and say what is needed in a comment.
- New work gets its own issue in the right milestone. Add a line
  `Estimate: N min of agent time` to the body when you can guess one.
- The repo is public. Keep issues about the map: no usage or budget numbers,
  no personal details.
