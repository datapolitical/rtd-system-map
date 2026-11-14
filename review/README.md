# Review page

A two-way page between Chris and the Claude sessions working on the map. He
opens it on his phone over the tailnet (the address is `RTD_REVIEW_ORIGIN` in
the service's settings, below; `shotctl publish` prints it).

- **To review:** a session posts a review request: what it needs from Chris
  (`ask`), optional one-tap **choices** shown as big buttons right under the
  question, then before/after pictures (tap to flip), plain items and links.
  Every item has its own comment box, and the review as a whole has one.
- **Issues:** open GitHub issues that name a place on the live map, with a
  picture of each place. On this Mac the tab is empty for now: the sync that
  fills it (`issues_sync.py` on the old mini deployment) is not ported.
- **Screenshots:** Chris uploads screenshots with an optional note, sees each
  one's status (new, seen, done), Claude's reply, and can reply back.

Everything Chris sends (screenshots, comments, picks) reaches the working map
session at its next tool call through a Claude Code hook (`hook.py`).

## For agents

```bash
CTL="review/.venv/bin/python review/shotctl.py"   # use the absolute path the hook prints
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
away.

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

To see what it would announce now without claiming anything:

```bash
echo '{"session_id": "x", "cwd": "'"$PWD"'"}' | review/.venv/bin/python review/hook.py --dry-run
```

## Service

```bash
cd review
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python app.py          # 127.0.0.1:$RTD_REVIEW_PORT (default 8796)
tailscale serve --bg --https=10001 http://127.0.0.1:8796
```

On Chris's Mac it runs as the launch agent `com.chris.rtd-review` (log in
`~/Library/Logs/rtd-review.log`; restart with `launchctl kickstart -k
gui/$(id -u)/com.chris.rtd-review`).

Settings come from the environment, then from a private file outside the repo,
`~/.config/rtd-review/service.env` (`RTD_REVIEW_ENV_FILE`; must be mode 0600):

| Setting | What |
|---|---|
| `RTD_REVIEW_LOGIN` | the only `Tailscale-User-Login` let in (required) |
| `RTD_REVIEW_ORIGIN` | the page's https origin, for same-origin checks and links (required) |
| `RTD_REVIEW_SESSION_SECRET` | 32+ random characters, signs the CSRF session (required) |
| `RTD_REVIEW_HOME` | data folder (default `review/data`, ignored by git) |
| `RTD_REVIEW_PORT` | port on 127.0.0.1 (default 8796) |
| `RTD_REVIEW_CWD_PREFIX` | which sessions the hook speaks in (see above) |
| `RTD_REVIEW_PROXY_TOKEN` | optional: require this token from a reverse proxy in `X-Map-Shots-Proxy` |
| `RTD_REVIEW_ROOT_INGRESS=1` | optional, Linux with systemd only: accept only connections from root (`ingress.py`) |

Gates: the peer must be 127.0.0.1 (only `tailscale serve` reaches it), the
`Tailscale-User-Login` header must be the allowed login, and writes need the
same origin plus the CSRF token, at most 40 a minute. Uploads must be
PNG/JPEG/WebP/HEIC/GIF by magic bytes, at most 25 MB each and 12 at a time.
Any local process can reach 127.0.0.1 and set the header itself; the Linux
root-connection check that closed that gap does not exist on macOS.

Data layout under `RTD_REVIEW_HOME`:

| Path | What |
|---|---|
| `inbox/` | Chris's screenshots + `NAME.json` notes; `done/` once handled; `.claims/` |
| `comments/` | his comments and picks, one JSON each; `done/` once handled (gains `reply`) |
| `reviews/ID/` | review requests: `meta.json` + copied images |
| `issues/` | Issues tab: `state.json` + `img/` |
