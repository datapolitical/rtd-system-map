"""Claude Code hook: hand Chris's screenshots, comments and picks to the working RTD map session.

Runs on PostToolUse (so it lands mid-task, between tool calls) and UserPromptSubmit.
Each pending screenshot or comment is claimed by one session at a time so parallel
sessions do not all act on it. A claim older than CLAIM_TTL with the item still pending
is re-announced (to the same session as a reminder, or to another session if the first
one went away). Prints nothing when there is nothing to say and never blocks work.

`hook.py --dry-run` prints what it would announce now, without claiming anything:
  echo '{"session_id": "x", "cwd": "'"$PWD"'"}' | review/.venv/bin/python review/hook.py --dry-run
"""
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shots  # noqa: E402

CLAIM_TTL = 30 * 60
SETTLE = 2  # seconds; skip files still being copied in over ssh
HERE = Path(__file__).resolve().parent
SHOTCTL = f"{HERE / '.venv' / 'bin' / 'python'} {HERE / 'shotctl.py'}"
PAGE = shots.page_url()
# Sessions working in any checkout of the map repo: by default every folder next to
# this checkout whose name starts with "rtd-system-map" (RTD_REVIEW_CWD_PREFIX).
PREFIX = os.environ.get("RTD_REVIEW_CWD_PREFIX") or str(HERE.parent.parent / "rtd-system-map")


def eligible(data: dict) -> bool:
    if data.get("agent_id") or data.get("agent_type"):
        return False  # subagent: leave it for the main thread
    cwd = data.get("cwd") or ""
    if cwd.startswith(PREFIX):
        return True
    # A session launched in the repo that has since cd'ed elsewhere.
    project = Path(data.get("transcript_path") or "").parent.name
    return project.startswith(re.sub(r"[^A-Za-z0-9]", "-", PREFIX))


DRY_RUN = "--dry-run" in sys.argv[1:]


def take(home: Path, key: str, sid: str, now: float) -> str | None:
    """Claim an item for this session. Returns 'new', 'reminder', or None (not ours to tell)."""
    path = shots.claim_path(home, key)
    claim = shots.read_json(path)
    if claim:
        if now - float(claim.get("at", 0)) < CLAIM_TTL:
            return None
        kind = "reminder" if claim.get("session") == sid else "new"
    else:
        kind = "new"
    if DRY_RUN:
        return kind
    record = {"session": sid, "at": now}
    if not claim:
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        except FileExistsError:
            return None  # another session claimed it a moment ago
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(record, f)
    else:
        shots.write_json_atomic(path, record)
    return kind


def quote(text: str) -> str:
    return json.dumps(text, ensure_ascii=False)


def shot_line(img: Path) -> str:
    meta = shots.read_json(shots.meta_path(img))
    line = f"- Screenshot {img}"
    if meta.get("note", "").strip():
        line += f"\n  Chris's note: {quote(meta['note'].strip())}"
    if img.suffix.lower() in (".heic", ".heif"):
        line += "\n  HEIC: the Read tool may not open it; tell Chris and ask for PNG/JPEG if so."
    return line


def comment_line(home: Path, path: Path) -> str:
    c = shots.read_json(path)
    target = c.get("target", "")
    kind, _, ident = target.partition(":")
    where = target
    if kind == "shot":
        img = shots.find_shot(home, ident)
        meta = shots.read_json(shots.meta_path(img)) if img else {}
        where = f"his screenshot {img or ident}"
        if meta.get("done_note"):
            where += f" (your earlier note on it: {quote(meta['done_note'])})"
    elif kind == "review":
        m = shots.read_json(shots.reviews_dir(home) / ident / "meta.json")
        where = f"your review request {quote(m.get('title', ident))} as a whole ({shots.reviews_dir(home) / ident})"
    elif kind == "item":
        rid, _, iid = ident.partition("/")
        m = shots.read_json(shots.reviews_dir(home) / rid / "meta.json")
        it = shots.review_item(home, rid, iid)
        d = shots.reviews_dir(home) / rid
        pics = [p for p in (it.get("before"), it.get("after"), *it.get("images", [])) if p]
        where = (f"item {quote(it.get('title') or iid)} of your review request {quote(m.get('title', rid))}"
                 + (f"; its images: {', '.join(str(d / p) for p in pics)}" if pics else ""))
    elif kind == "issue":
        it = shots.read_json(home / "issues" / "state.json").get("issues", {}).get(ident, {})
        img = home / "issues" / "img"
        pics = [str(img / l["current"]["img"]) for l in it.get("locations", []) if "current" in l]
        where = (f"GitHub issue #{ident} {quote(it.get('title', ''))} ({it.get('url', '')}) on the Issues tab"
                 + (f"; live-map pictures: {', '.join(pics)}" if pics else ""))
    if "choice" in c:
        offered = shots.target_choices(home, target)
        line = f"- Pick {path.stem} on {where}"
        if offered:
            line += f" (choices: {', '.join(offered)})"
        line += f"\n  Chris picked: {c['choice']}" + (f" — {c['text']}" if c.get("text") else "")
        if c.get("previous_choice"):
            line += f"\n  (this changes his earlier pick: {c['previous_choice']})"
        return line
    return f"- Comment {path.stem} on {where}\n  Chris: {quote(c.get('text', ''))}"


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    if not isinstance(data, dict) or not eligible(data):
        return 0
    home = shots.HOME
    sid = str(data.get("session_id") or "unknown")
    now = time.time()
    lines, n_shots, n_comments, n_picks = [], 0, 0, 0
    for img in shots.pending_shots(home):
        try:
            if now - img.stat().st_mtime < SETTLE:
                continue
        except OSError:
            continue
        kind = take(home, img.name, sid, now)
        if kind:
            lines.append(shot_line(img) + ("\n  (reminder: still not marked done)" if kind == "reminder" else ""))
            n_shots += 1
    for path in shots.pending_comments(home):
        kind = take(home, path.stem, sid, now)
        if kind:
            lines.append(comment_line(home, path) + ("\n  (reminder: still not marked done)" if kind == "reminder" else ""))
            if "choice" in shots.read_json(path):
                n_picks += 1
            else:
                n_comments += 1
    if not lines:
        return 0
    parts = []
    if n_shots:
        parts.append(f"{n_shots} screenshot{'s' if n_shots > 1 else ''}")
    if n_comments:
        parts.append(f"{n_comments} comment{'s' if n_comments > 1 else ''}")
    if n_picks:
        parts.append(f"{n_picks} pick{'s' if n_picks > 1 else ''}")
    what = ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1]
    context = (
        f"Chris just sent {what} about the RTD system map through the review page ({PAGE}):\n"
        + "\n".join(lines) + "\n"
        "Open any image named above with the Read tool now. Then, in your next message to Chris, say what "
        "you see and what you will do about it. Fold it into the current task if it bears on it; otherwise "
        "finish the current step and then handle it, or record it as a follow-up. When it is handled, run "
        f"{SHOTCTL} done <screenshot file name or comment/pick id> --note \"what you did\" "
        "(the note is shown to Chris on the page as your reply)."
    )
    print(json.dumps({
        "systemMessage": f"Review page: {what} from Chris passed to Claude.",
        "hookSpecificOutput": {
            "hookEventName": data.get("hook_event_name") or "PostToolUse",
            "additionalContext": context,
        },
    }))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # never break the session over a notification
        sys.exit(0)
