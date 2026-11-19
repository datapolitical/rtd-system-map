"""Sync the Issues tab: open GitHub issues that name a place on the map, with live captures.

  issues_sync.py            sync once (gh + captures), then exit
  issues_sync.py --dry-run  print what would be captured, capture nothing, write nothing

For every open issue in datapolitical/rtd-system-map whose body or comments link to a
place on the live map (https://rtd-system-map.pages.dev/#z/lat/lon, or a bare `#z/lat/lon`):
  - capture the live map there (phone width, as the link opens it) the first time it is
    seen; that first capture is kept as the issue's "before";
  - re-capture every RECAPTURE seconds so the tab shows the map as it is now.
When such an issue is closed, capture once more as its "after"; it stays on the tab under
"Recently fixed" for KEEP_CLOSED seconds, then drops off (its images are deleted).
State: issues/state.json; images: issues/img/, under RTD_REVIEW_HOME. Run on a timer
(systemd/rtd-review-issues.timer). `gh` uses its own sign-in, or the config folder in
RTD_REVIEW_GH_CONFIG_DIR when that is set. The captures need capture/node_modules
(`npm ci` in capture/).
"""
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shots  # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = "datapolitical/rtd-system-map"
SITE = "https://rtd-system-map.pages.dev"
RECAPTURE = 6 * 3600
KEEP_CLOSED = 7 * 86400
MAX_LOCATIONS = 4
CAPTURE_TIMEOUT = 420

FULL = re.compile(r"(?:\[([^\]\n]{1,80})\]\()?https://rtd-system-map\.pages\.dev/#(\d{1,2}(?:\.\d+)?)/(-?\d{1,3}\.\d+)/(-?\d{1,3}\.\d+)")
BARE = re.compile(r"(?<![\w/.])#(\d{1,2}(?:\.\d+)?)/(-?\d{1,3}\.\d+)/(-?\d{1,3}\.\d+)")
# Planning and tooling issues cite example places; they are not faults on the map.
SKIP_LABELS = {"enhancement", "documentation", "research"}
GENERIC = {"open", "here", "check", "live", "link", "map", "view", "open on the live map"}


def issues_dir(home: Path = shots.HOME) -> Path:
    return home / "issues"


def gh(*args: str) -> list | dict:
    env = dict(os.environ, GH_REPO=REPO, GH_PROMPT_DISABLED="1")
    config = os.environ.get("RTD_REVIEW_GH_CONFIG_DIR")
    if config:
        # A sign-in kept for this job alone: use it and nothing else.
        env["GH_CONFIG_DIR"] = config
        env.pop("GH_TOKEN", None)
        env.pop("GITHUB_TOKEN", None)
    out = subprocess.run(["gh", *args], capture_output=True, text=True, env=env, timeout=90)
    if out.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:3])} failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout)


def in_area(z: float, lat: float, lon: float) -> bool:
    return 8 <= z <= 20 and 39.0 <= lat <= 40.8 and -105.8 <= lon <= -104.0


def locations(texts: list[str], dark: bool) -> list[dict]:
    seen, out = set(), []
    for text in texts:
        found = [(m.group(1), m.group(2), m.group(3), m.group(4), m.start()) for m in FULL.finditer(text)]
        spans = [m.span() for m in FULL.finditer(text)]
        for m in BARE.finditer(text):
            if not any(a <= m.start() < b for a, b in spans):
                found.append((None, m.group(1), m.group(2), m.group(3), m.start()))
        for label, z, lat, lon, _pos in sorted(found, key=lambda f: f[4]):
            z, lat, lon = float(z), float(lat), float(lon)
            if not in_area(z, lat, lon):
                continue
            key = f"{z:g}/{lat:.4f}/{lon:.4f}"
            if key in seen:
                continue
            seen.add(key)
            nice = (label or "").strip()
            if not nice or nice.lower() in GENERIC:
                nice = f"zoom {z:g}"
            out.append({"key": key, "label": nice, "z": z, "lat": lat, "lon": lon,
                        "theme": "dark" if dark else "light"})
            if len(out) >= MAX_LOCATIONS:
                return out
    return out


def summary(body: str) -> str:
    """The issue's opening, in plain text: paragraphs and bullets until about 200 characters."""
    parts = []
    for para in re.split(r"\n\s*\n", body or ""):
        p = para.strip()
        if not p or p.startswith(("#", "<!--", "|", "```")) or p.lower().startswith("made by"):
            continue
        if re.fullmatch(r"\*\*[^*]+\*\*:?", p):
            continue  # a bold line used as a heading
        p = re.sub(r"\s*\[(?:open|here|check|live|link)\]\([^)]+\)", "", p, flags=re.I)
        p = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", p)
        p = re.sub(r"^\s*[-*]\s+", "", p, flags=re.M)
        p = re.sub(r"[*_`]+", "", p)
        p = re.sub(r"\s+", " ", p).strip()
        parts.append(p)
        if sum(len(x) for x in parts) >= 200:
            break
    text = " ".join(parts)
    return text[:420].rstrip() + ("…" if len(text) > 420 else "")


def fetch() -> list[dict]:
    fields = "number,title,url,labels,body,comments,updatedAt,state,closedAt"
    open_ = gh("issue", "list", "--state", "open", "--limit", "200", "--json", fields)
    since = (datetime.now(timezone.utc) - timedelta(seconds=KEEP_CLOSED)).strftime("%Y-%m-%d")
    closed = gh("issue", "list", "--state", "closed", "--limit", "100", "--search", f"closed:>={since}",
                "--json", fields)
    return open_ + closed


def iso(ts: str | None) -> float:
    if not ts:
        return 0.0
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


def capture(views: list[dict]) -> dict:
    """Run capture.mjs for views [{out, z, lat, lon, theme}]; returns {out: ok}."""
    if not views:
        return {}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"site": SITE, "views": views}, f)
        jobs = f.name
    try:
        p = subprocess.run(["nice", "-n", "10", "node", str(HERE / "capture" / "capture.mjs"), jobs],
                           cwd=HERE / "capture", capture_output=True, text=True, timeout=CAPTURE_TIMEOUT)
    finally:
        os.unlink(jobs)
    results = {}
    for line in p.stdout.splitlines():
        try:
            r = json.loads(line)
            results[r["out"]] = r.get("ok", False)
            if not r.get("ok"):
                print(f"capture failed: {r['out']}: {r.get('error')}", file=sys.stderr)
        except (ValueError, KeyError):
            pass
    if p.returncode != 0:
        print(f"capture exited {p.returncode}: {p.stderr.strip()[-500:]}", file=sys.stderr)
    return results


def sync(home: Path = shots.HOME, dry_run: bool = False, fetched: list[dict] | None = None,
         capturer=capture, now: float | None = None) -> dict:
    now = now or time.time()
    d = issues_dir(home)
    img = d / "img"
    img.mkdir(parents=True, exist_ok=True)
    state = shots.read_json(d / "state.json")
    old = state.get("issues", {})
    new: dict[str, dict] = {}
    jobs: list[tuple[dict, str, dict]] = []  # (location, slot, view)

    for it in fetched if fetched is not None else fetch():
        n = str(it["number"])
        if SKIP_LABELS & {l["name"] for l in it.get("labels") or []}:
            continue
        texts = [it.get("body") or ""] + [c.get("body") or "" for c in it.get("comments") or []]
        dark = bool(re.search(r"\bdark\b", it.get("title", ""), re.I))
        locs = locations(texts, dark)
        if not locs:
            continue
        closed_at = iso(it.get("closedAt")) if it.get("state") == "CLOSED" else 0.0
        if closed_at and n not in old:
            continue  # closed before we ever pictured it: no before to show
        if closed_at and now - closed_at > KEEP_CLOSED:
            continue
        prev = {l["key"]: l for l in old.get(n, {}).get("locations", [])}
        merged = []
        for loc in locs:
            p = prev.get(loc["key"], {})
            loc = {**loc, **{k: p[k] for k in ("first", "current", "after") if k in p}}
            stem = f"{n}-{hashlib.sha1(loc['key'].encode()).hexdigest()[:8]}-{loc['theme']}"
            if closed_at:
                if "first" in loc and "after" not in loc:
                    jobs.append((loc, "after", {"out": str(img / f"{stem}-after-{int(now)}.jpg"), **_view(loc)}))
            elif "current" not in loc or now - loc["current"]["at"] > RECAPTURE:
                jobs.append((loc, "current", {"out": str(img / f"{stem}-{int(now)}.jpg"), **_view(loc)}))
            merged.append(loc)
        new[n] = {
            "number": it["number"], "title": it.get("title", ""), "url": it.get("url", ""),
            "labels": [l["name"] for l in it.get("labels") or []], "summary": summary(it.get("body") or ""),
            "updated": iso(it.get("updatedAt")), "closed_at": closed_at, "locations": merged,
        }

    if dry_run:
        for loc, slot, view in jobs:
            print(f"would capture {slot}: {loc['key']} {loc['theme']} -> {view['out']}")
        print(f"{len(new)} issue(s) with places, {len(jobs)} capture(s)")
        return {"issues": new}

    results = capturer([v for _, _, v in jobs])
    for loc, slot, view in jobs:
        if not results.get(view["out"]):
            continue
        rec = {"img": Path(view["out"]).name, "at": now}
        if slot == "current":
            old_img = loc.get("current", {}).get("img")
            loc["current"] = rec
            loc.setdefault("first", rec)
            if old_img and old_img != loc["first"]["img"]:
                shots.unlink_quiet(img / old_img)
        else:
            loc["after"] = rec

    keep = {l[k]["img"] for i in new.values() for l in i["locations"] for k in ("first", "current", "after") if k in l}
    for f in img.iterdir():
        if f.suffix == ".jpg" and f.name not in keep and now - f.stat().st_mtime > 3600:
            shots.unlink_quiet(f)
    out = {"synced": now, "issues": new}
    shots.write_json_atomic(d / "state.json", out)
    return out


def _view(loc: dict) -> dict:
    return {"z": loc["z"], "lat": loc["lat"], "lon": loc["lon"], "theme": loc["theme"]}


def main() -> None:
    dry = "--dry-run" in sys.argv
    d = issues_dir()
    d.mkdir(parents=True, exist_ok=True)
    with open(d / ".lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("another sync is running")
            return
        state = sync(dry_run=dry)
        if not dry:
            n = sum(1 for i in state["issues"].values() if not i["closed_at"])
            print(f"synced: {n} open issue(s) with places, {len(state['issues']) - n} recently fixed")


if __name__ == "__main__":
    main()
