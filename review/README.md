# Review page

A two-way page between Chris and the Claude sessions working on the map. He
opens it on his phone over the tailnet (the address is `RTD_REVIEW_ORIGIN` in
the service's settings, below; `shotctl publish` prints it).

- **To review:** a session posts a review request: what it needs from Chris
  (`ask`), optional one-tap **choices** shown as big buttons right under the
  question, then before/after pictures (tap to flip), plain items and links.
  Every item has its own comment box, and the review as a whole has one.
- **Issues:** open GitHub issues that name a place on the live map, with a
  picture of each place as its link opens it now. `issues_sync.py` fills the
  tab on a timer (below).
- **Screenshots:** Chris uploads screenshots with an optional note, sees each
  one's status (new, seen, done), Claude's reply, and can reply back.

Everything Chris sends (screenshots, comments, picks) reaches the working map
session at its next tool call through a Claude Code hook (`hook.py`).

## For agents

```bash
CTL="review/.venv/bin/python review/shotctl.py"   # or the absolute path the hook prints
$CTL list                                  # what is waiting, open reviews, their choices and picks
$CTL done NAME_OR_COMMENT_ID --note "..."  # handled; the note is shown to Chris as your reply
$CTL publish path/to/manifest.json         # post a review request
$CTL ask --title "..." --ask "..." [--text "..."] a.png b.png   # quick one-item review request
$CTL close REVIEW_ID --note "..."          # finished with a review request
$CTL release ID                            # make the hook announce it again
```

Every review request must say what Chris has to do (`ask`): publish refuses
one without it. A report that needs nothing from him does not go on the review
tab. When the answer is one of a few options, give `choices` so he can tap one
instead of typing. Items that need their own answer get their own `ask` (and
optionally their own `choices`); the rest show as "For information". The To
review tab counts only requests still waiting on him; answered ones move to
"You've answered". Closing one (`close --note`) should say what happened to
each of his comments and picks.

Manifest format (plain text throughout; links must be https; image paths are
relative to the manifest; item ids are unique `a-z0-9-`; `choices` are 2 to 8
different short labels):

```json
{
  "title": "Which look for the frequent buses?",
  "ask": "Tap the look you want. Comment under any picture that still looks wrong.",
  "choices": ["Blue", "Ink", "Tint"],
  "intro": "Tap a picture to flip between before and after.",
  "status": "Prototypes on the sheets branch, not live.",
  "links": [{"label": "Issue #117", "url": "https://github.com/..."}],
  "sections": [
    {"heading": "Look 1, blue", "note": "optional", "items": [
      {"id": "blue-10-light", "title": "Opening view, light", "text": "...",
       "before": "img/now.jpg", "after": "img/blue.jpg",
       "links": [{"label": "Open on the live map", "url": "https://rtd-system-map.pages.dev/#10/39.74/-104.99"}]},
      {"id": "names", "title": "Lines strike through names", "ask": "Fix this first?",
       "choices": ["Yes", "Later"], "images": ["img/a.png"]},
      {"id": "plain-item", "title": "Text only, still commentable"}
    ]}
  ]
}
```

Publishing copies the images into the data folder, so the source folder can go
away. `shotctl` and the hook need only Python's standard library, and they
find the data folder through the account's settings file (below), so any
checkout's copy works.

A pick is saved like a comment with a `choice` field (and his note, if any, as
its text). If he changes his mind, the new pick replaces an earlier one no
session has handled yet, and the hook says what it changes.

## How messages reach Claude

`hook.py` runs on `PostToolUse` (every tool) and `UserPromptSubmit`. It speaks
only in main sessions (never subagents) whose working folder starts with
`RTD_REVIEW_CWD_PREFIX` (default: the folder next to this checkout named
`rtd-system-map`, so every `rtd-system-map*` checkout), or that were launched
there. Each pending screenshot, comment or pick is claimed by one session
(`inbox/.claims/`); if it is still pending 30 minutes later it is announced
again. Comments on a review item come with the item's title and image paths;
picks come as "Chris picked: Blue — his note". It prints nothing when there is
nothing new and never fails a tool call. An idle session hears about things
only when Chris next sends it a message.

The hook goes in the Claude Code settings of each account that runs map
sessions, as a `PostToolUse` hook (matcher `*`) and a `UserPromptSubmit` hook
with the command `/usr/bin/python3 -I /path/to/review/hook.py`. Point it at a
checkout that stays on main, not at a working branch. Two accounts on one
machine share one data folder: each has its own settings file naming it.

To see what it would announce now without claiming anything:

```bash
echo '{"session_id": "x", "cwd": "'"$PWD"'"}' | review/.venv/bin/python review/hook.py --dry-run
```

## Service

```bash
cd review
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python app.py          # 127.0.0.1:$RTD_REVIEW_PORT (default 8796)
```

It reaches the tailnet one of two ways:

- **Straight from Tailscale:** `tailscale serve --bg --https=10001
  http://127.0.0.1:8796`. The page is at `/`.
- **Behind a reverse proxy** that already answers on the tailnet name. The
  proxy forwards `/shots/*` unchanged and adds a token and who connected to
  it; the page is at `/shots/`. Set `RTD_REVIEW_PATH=/shots/`,
  `RTD_REVIEW_PROXY_TOKEN` and `RTD_REVIEW_PROXY_PORT`. In Caddy:

  ```
  handle /shots/* {
      reverse_proxy 127.0.0.1:8902 {
          header_up X-Map-Shots-Proxy "{$MAP_SHOTS_PROXY_TOKEN}"
          header_up X-Map-Shots-Client-Host {remote_host}
          header_up X-Map-Shots-Client-Port {remote_port}
      }
  }
  ```

It runs on mini, the second way, as the systemd user unit
`systemd/rtd-review.service`, from a checkout pinned to main and used for
nothing else (`git worktree add --detach ../rtd-system-map-review
origin/main`), with its data in `rtd-system-map-review-data` beside it. The
unit files are written for that layout. To update it, check out the newer
origin/main there, run `pip install -r requirements.txt` if that file
changed, and restart the unit.

`systemd/rtd-review-issues.timer` runs `issues_sync.py` every 30 minutes. It
reads the issues with `gh` and pictures each place with
`capture/capture.mjs` (Playwright; run `npm ci` in `capture/` once).
`issues_sync.py --dry-run` lists what it would picture.

On macOS it runs the first way, kept up by a launch agent. Until 2026-11-18
it ran that way on Chris's Mac.

Settings come from the environment, then from a private file outside the repo,
`~/.config/rtd-review/service.env` (`RTD_REVIEW_ENV_FILE`; must be mode 0600):

| Setting | What |
|---|---|
| `RTD_REVIEW_LOGIN` | the only `Tailscale-User-Login` let in (required) |
| `RTD_REVIEW_ORIGIN` | the page's https origin, for same-origin checks and links (required) |
| `RTD_REVIEW_PATH` | the page's path on that origin: `/` (default), or `/shots/` behind a reverse proxy |
| `RTD_REVIEW_SESSION_SECRET` | 32+ random characters, signs the CSRF session (required) |
| `RTD_REVIEW_HOME` | data folder (default `review/data`, ignored by git) |
| `RTD_REVIEW_PORT` | port on 127.0.0.1 (default 8796) |
| `RTD_REVIEW_CWD_PREFIX` | which sessions the hook speaks in (see above) |
| `RTD_REVIEW_PROXY_TOKEN` | optional: require this token from a reverse proxy in `X-Map-Shots-Proxy` (32+ characters) |
| `RTD_REVIEW_PROXY_PORT` | optional: the reverse proxy's own port; the service then checks who connected to the proxy (`X-Map-Shots-Client-Host`, `X-Map-Shots-Client-Port`). Needs the token |
| `RTD_REVIEW_ROOT_INGRESS=1` | optional, Linux with systemd only: accept only connections owned by root, which Tailscale's are (`ingress.py`; the unit passes in the kernel's socket table) |
| `RTD_REVIEW_GH_CONFIG_DIR` | optional: a `gh` config folder for `issues_sync.py` to use instead of the account's own sign-in |

Only the service needs the login, the secret and the token. An account that
only runs sessions needs `RTD_REVIEW_HOME`, `RTD_REVIEW_ORIGIN` and
`RTD_REVIEW_PATH` in its file.

Gates: the peer must be 127.0.0.1, the `Tailscale-User-Login` header must be
the allowed login, and writes need the same origin plus the CSRF token, at
most 40 a minute. Uploads must be PNG/JPEG/WebP/HEIC/GIF by magic bytes, at
most 25 MB each and 12 at a time. Any local process can reach 127.0.0.1 and
set the login header itself. `RTD_REVIEW_ROOT_INGRESS=1` closes that on
Linux; nothing does on macOS.

Data layout under `RTD_REVIEW_HOME`:

| Path | What |
|---|---|
| `inbox/` | Chris's screenshots + `NAME.json` notes; `done/` once handled; `.claims/` |
| `comments/` | his comments and picks, one JSON each; `done/` once handled (gains `reply`) |
| `reviews/ID/` | review requests: `meta.json` + copied images |
| `issues/` | Issues tab: `state.json` + `img/` (written by `issues_sync.py`) |
| `cache/view/` | phone-sized JPEG copies of review PNGs, made when first asked for (Pillow, or macOS `sips` without it) |
