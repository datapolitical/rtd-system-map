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
