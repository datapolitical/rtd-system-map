# Headless checks

Playwright Test specs that open the site in headless Chromium (an iPhone 14
profile, in light and dark) and measure what the map draws. They are the
measurements behind the "Done when" lines of DESIGN.md, milestone 3. The
"Done when" sentence each one verifies is at the top of its file.

| Spec | Step | What it checks |
|---|---|---|
| `letters.spec.mjs` | 4 | Twenty seeded phone views at 10 to 12 show a letter for every rail line. |
| `stations.spec.mjs` | 2, 3 | Station marks at 10 and 10.5 do not overlap or crowd; names stay within 25 px of their mark; the hub is named at every zoom. |
| `buses.spec.mjs` | 5 | Bus arrows at 14: count, ring contrast; dark tier contrasts. |
| `key.spec.mjs` | 6 | The Key's images are the map's, at the map's sizes and pixels. |
| `live.spec.mjs` | 7 | Live on at 9.75, 10.3 and 11 shows trains or says why not; the pill never shows a clock time. |

They are not unit tests. `npm test` stays pure Node and needs no browser.

## Running

1. `npm run build` once, so `public/data/` exists.
2. Start the site with `npm run dev` (port 8788). For `live.spec.mjs`, also
   start the relay with `npm run dev:live` (port 8789). The checks do not
   start a server: one started from the config would hide a server that
   had died mid-run, and `npm run dev` is what the page is developed on.
3. `npm run check` runs everything. To narrow it:
   - one spec: `npm run check -- stations`
   - one project: `npm run check -- --project=phone-dark`
   - one test: `npm run check -- -g "Key matches the map at 10"`
4. `npm run check:report` opens the HTML report (`qa/report/`) with the
   captures and numbers each test attached.

Set `CHECK_URL` to point at another server. The browsers are Playwright's own
(`@playwright/test` is a dev dependency); `npx playwright install chromium`
fetches them if they are missing.

`buses.spec.mjs` counts bus arrows but does not fail on the count, since it
depends on the live feed. Failures leave a trace and screenshot under
`qa/checks/out/` (ignored by git).

`fixtures.mjs` holds the shared `mapPage` fixture: it exposes the map as
`window.__map`, turns Live on or off, goes to `#zoom/lat/lon`, waits for the
map to be loaded and idle, and samples pixels from captures. The seeded views
and the hub's position are test inputs, read from the built data.

For a human or AI pass over the whole site, see [../BRIEF.md](../BRIEF.md).
