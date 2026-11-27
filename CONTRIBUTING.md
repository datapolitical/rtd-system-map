# Contributing

Thanks for helping. This is a map of RTD's buses and trains for riders on
phones. A change is good when it makes the map more correct, easier to read
or easier to use.

## What's welcome

- Bug reports: something drawn wrong, missing, hard to read or broken on
  your phone. Use the bug report form.
- Data questions: a route, stop or frequency that doesn't match what RTD
  publishes. Use the data question form.
- Fixes to the build, the drawing, the interface, accessibility, tests and
  docs, as pull requests.

Open an issue before a large change, so we can agree on the approach first.

## Who builds and deploys

The maintainer builds RTD's data and deploys the site. You open a pull
request and never deploy. A merge publishes nothing; the maintainer rebuilds
and publishes after it. You can build the data on your own machine to try a
change, but don't commit what it makes.

## Your first change

You need Node 22 and git. Wrangler and Playwright come with `npm install`.

```sh
npm install                      # also copies MapLibre and the font into public/vendor/
npx playwright install chromium  # the browser the checks and the build's pictures use
npm test                         # unit tests, plain Node, no browser
npm run build:data               # downloads RTD's public data into public/data/
npm run dev                      # serves the site at http://127.0.0.1:8788
npm run check                    # in a second terminal, with npm run dev running
```

`npm run build:data` needs the internet and no keys. `npm run check` runs
the current map in Chromium in light and dark: health at every sheet scale,
route selection, theme switching, reload, Escape and old links.
[docs/development.md](docs/development.md) explains the branches and the
longer checks, and [qa/checks/README.md](qa/checks/README.md) lists every
check.

Work on a branch from `main`. Open the pull request against `main`.

## Checks a pull request must pass

- GitHub runs these on every pull request: `npm test`, `npm run check:recall`
  and a test bundle of the Live relay. All three must pass.
- If your change affects what the map shows or how it behaves, run
  `npm run check` against your local server. For a change to the interface,
  also run `npm run check:a11y`.
- If you change a check's rule or threshold, `npm run check:recall` must not
  score lower ([qa/recall/README.md](qa/recall/README.md)).
- For a drawing change, attach before and after pictures of the same place,
  zoom and theme. The pull request form asks for them.
  [docs/evaluation.md](docs/evaluation.md) has the full standard of evidence.

## Rules every change follows

- **Never hardcode RTD's network.** No layer URLs, route lists, rail colors,
  station IDs, corridor assignments or service dates in the code. The build
  derives them from RTD's data, so RTD's changes flow through with no code
  change. See DESIGN.md, "Zero maintenance".
- **Never commit a server or tailnet address.** The repo is public.
  `test/no-tailnet-addresses.test.mjs` fails on any tracked file that holds
  one. Use a path that starts at the root, like `/shots/`, or a placeholder
  such as `HOST.TAILNET.ts.net`.
- **Never commit `public/data/` or `public/poster/`.** They are built from
  RTD's data and are not in git.

## DESIGN.md

[DESIGN.md](DESIGN.md) is the full specification and its decision log. It is
long. Don't read it first; search it for the part you're changing. If your
change alters a decision, update DESIGN.md and add a line to its decision
log in the same pull request.

## Conduct, security and licence

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report security problems
privately, as [SECURITY.md](SECURITY.md) explains, not in a public issue.
Changes you send are taken under the [Apache License 2.0](LICENSE).
