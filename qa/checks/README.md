# Browser checks

`npm run check` exercises the current sheet map at the site's root, in Chromium,
with phone viewports in light and dark. Start `npm run dev` first and install
Chromium with `npx playwright install chromium`.

The agent also inspects actual captures and fixes visual defects; passing
scripts do not transfer routine QA to the user. See
[verification ownership](../../docs/verification.md) for evidence and the
limited cases that warrant a user/device check.

| Command | Scope |
|---|---|
| `npm run check` | Health at every sheet scale; route selection, theme switching, reload, Escape and retired Classic links |
| `npm run check:health` | The sheet-map health check only; also run nightly |
| `npm run check:sheets` | Longer existing sheet regression script, including label and card checks |
| `npm run check:a11y` | Current sheets: axe, accessibility tree, announcements and focus |
| `npm test` | Unit tests, including historical renderer regressions |
| `npm run check:recall` | Detectors scored against frozen historical builds |

Use `CHECK_URL` to select a particular preview. The current map needs no Live
relay for these checks. Browser reports go to `qa/report/` and captures to
`qa/checks/out/`; the longer scripts use `qa/.scratch/`.

The nightly workflow runs only health. The branch-preview workflow remains
disabled, as requested on 2026-11-13; changing its source does not enable it.

## Historical Classic checks

The runnable application is on `classic-archive`. Older browser specs and
baseline screenshots are under `qa/classic/checks/`. They require an explicitly
selected Classic server:

```sh
CHECK_URL=http://127.0.0.1:8877 npm run check:classic
CHECK_URL=http://127.0.0.1:8877 npm run check:classic:deep
```

A Classic-only helper rejects the current sheet page rather than silently
checking a different application. The old map-report and sweep commands are
`check:classic:map` and `sweep:classic`; their findings describe that renderer,
not the sheet map. Frozen builds retain their original page code.

The smooth-zoom trial has its own preview and checks on `zoom-prototype-154`.
See [the development guide](../../docs/development.md).
