# RTD system map

A map of Denver's transit that opens on the whole network and shows how often
each line comes, not just where it goes. It is for people finding out what
transit they can use at a place, riders on the move, and anyone who needs a
clear picture of where Denver has useful service. A button called Live turns
the same map into right now: what is running, and where the trains and buses
are. It is built for phones first.

**Open it: [rtd-system-map.pages.dev](https://rtd-system-map.pages.dev)**

This is unofficial. It is built only from RTD's public data and is not
affiliated with RTD.

<p align="center">
  <img src="docs/screenshot-light.jpg" width="300" alt="The map's opening view on a phone: Denver's rail lines and frequent bus corridors, light theme">
  &nbsp;
  <img src="docs/screenshot-dark.jpg" width="300" alt="The same view in the dark theme">
</p>

## Run it

You need Node 22 and Cloudflare's Wrangler CLI (`npm install -g wrangler`).

```sh
npm install        # also copies MapLibre and the font into public/vendor/
npm run build      # downloads RTD's public data into public/data/
npm run dev        # serves the site at http://127.0.0.1:8788
npm run dev:live   # the Live relay, on 8789; the site finds it on its own
npm test           # unit tests, plain Node, no browser
npm run check      # headless browser checks (see qa/checks/README.md)
```

`npm run check` needs `npm run dev` running (and `npm run dev:live` for the
Live check), and Playwright's Chromium (`npx playwright install chromium`).

## Design

[DESIGN.md](DESIGN.md) is the source of truth for the objective, audience,
data, map design, interface and milestones. Read it before changing the map,
the interface or the data pipeline (CLAUDE.md says the same). When a decision
changes, update it and add a line to its decision log. Nothing about RTD's
network is written into the code; the build derives it from RTD's data.

## Layout

- `public/`: the static site (plain ES modules in `js/`, no framework).
  `public/data/` and `public/vendor/` are generated and not committed.
- `scripts/`: the build, which fetches, checks and writes the data.
- `live/`: the Live relay, a Cloudflare Durable Object that polls RTD's
  realtime feeds and pushes changes to every open page.
- `refresh/`: a Worker that runs hourly and triggers a rebuild when RTD's
  data has changed.
- `functions/`: Pages Functions that connect the site to the relay.
- `test/`: unit tests, run with `npm test`.
- `qa/`: the QA brief and findings ([qa/BRIEF.md](qa/BRIEF.md)) and the
  headless checks in `qa/checks/`.

## Data

- Lines, stations, Park-n-Rides, bus stops and FlexRide zones come from the
  public ArcGIS layers behind RTD's own system map. They are found from RTD's
  published map on every build.
- Frequency, schedules and rail shapes come from RTD's public GTFS feed,
  `google_transit.zip`.
- Live positions come from RTD's public GTFS-realtime feeds, which need no
  key.
- Street addresses use Photon, an OpenStreetMap geocoder. The basemap uses
  OpenFreeMap's vector tiles.

All of these are public and need no key. Check each provider's terms before
reusing their data.

## Licence

The code is under the [Apache License 2.0](LICENSE), copyright 2026 Chris
Nicholson (see [NOTICE](NOTICE)). The licence covers this repository's code
and docs. It does not cover RTD's data, which the build downloads and never
commits, or RTD's name and marks, which belong to RTD. The QA baseline
screenshots in `qa/checks/` show RTD's data on OpenFreeMap's basemap
(© OpenMapTiles, © OpenStreetMap contributors).

This project is unofficial and not affiliated with RTD.

Changes you send are taken under the same licence (section 5 of the Apache
License).
