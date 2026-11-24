# Classic regression support

The runnable Classic application is preserved on `classic-archive` at
`811135ffe4230f598082667c7fda20994d1bd97d`.
It is no longer included in the site's `public/` output.

- `js/` is the renderer fixture required by existing unit and drawn-model tests.
  Shared modules come from `public/js/`; no Classic startup page is kept here.
- `checks/` holds older browser specs and screenshots. Use `CHECK_URL` pointing
  to a Classic archive server with `npm run check:classic`.
- `source.mjs` lets the model use this fixture or the original layout of a
  frozen historical build without changing those builds.

`npm run check` checks the current sheet map. See
[the development guide](../../docs/development.md) for the branch workflow.
