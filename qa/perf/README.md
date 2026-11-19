# Page speed measurements

Scripts used for #105 (symbols read back off the GPU) and #108 (relief). They are
measurements, not checks: nothing here runs in CI. Run them from the repo root
with a build in `public/data/`. Captures go to `qa/.scratch/perf/` (ignored by git).

- `serve.mjs <root> <port>`: a static server on 127.0.0.1 (gzip, no caching),
  so a branch and main can be served side by side on the same data.
- `load.mjs <url> [cpuSlowdown]`: one cold load as a Pixel 7 at the "Quality
  floor" profile (170 ms, 9 Mbps; CPU slowed 4x by default), then a scripted
  pan and zoom. Prints JSON: paint times, long tasks, bytes per host for the
  opening view (`openBytes`) and for the pan and zoom (`panBytes`), the
  biggest files, and frame gaps during the interaction.
- `prof.mjs <url>`: CPU profile of one load; main-thread self time by script
  and by function. `WRF=1` forces `willReadFrequently` on every 2D canvas.
- `same.mjs <urlA> <urlB> [tag] [views]`: the key's pictures and the map at
  four views in both themes, A against B, pixel by pixel. Run A against A
  first to see the noise.
- `relief-zooms.mjs [zooms] [views]`: relief at several elevation-tile maxzooms
  (rewrites `basemap.js` on the fly), screenshots and elevation bytes per view.

Browser: Playwright's Chromium by default; `CHROMIUM=/path` to pick one, and
`SOFTWARE_GL=1` on a machine with no GPU (frame timings are then meaningless).
