"""Shared logic for the review page between Chris and the Claude map sessions (README.md).

Layout under HOME (RTD_REVIEW_HOME, default review/data next to this file; git ignores it):
  inbox/                screenshots from Chris (+ NAME.json with his note); scp target
  inbox/done/           screenshots a session has handled (json gains done_note)
  inbox/.claims/        which session was told about which pending item, and when
  comments/             Chris's comments, one JSON file each, waiting for a session
  comments/done/        comments a session has handled (json gains reply)
  reviews/ID/           review requests from a session: meta.json + the images
"""
import json
import os
import re
import secrets
import shutil
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ENV_FILE = Path(os.environ.get("RTD_REVIEW_ENV_FILE")
                or Path.home() / ".config" / "rtd-review" / "service.env")


def load_env(path: Path = ENV_FILE) -> None:
    """Read RTD_REVIEW_* settings from the private service.env (KEY=VALUE lines).

    The environment wins over the file. The file holds the allowed login and the
    session secret, so it must not be readable by others (0600)."""
    try:
        st = path.stat()
        if st.st_mode & 0o077:
            raise PermissionError(f"{path} must be private (chmod 600).")
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and key.startswith("RTD_REVIEW_") and not key.startswith("#"):
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


load_env()
HOME = Path(os.environ.get("RTD_REVIEW_HOME") or Path(__file__).resolve().parent / "data")


def page_url() -> str:
    """The page's public address, e.g. https://HOST.TAILNET.ts.net:10001/ (RTD_REVIEW_ORIGIN)."""
    origin = os.environ.get("RTD_REVIEW_ORIGIN", "")
    return origin.rstrip("/") + "/" if origin else "the review page (RTD_REVIEW_ORIGIN is not set)"
TZ = ZoneInfo("America/Denver")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".gif"}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
        ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif"}
MAX_NOTE = 4000
MAX_IMAGE = 25 * 1024 * 1024
SHOT_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}\.(png|jpg|webp|heic|gif)$")
REVIEW_RE = re.compile(r"^r-\d{8}-\d{6}-[0-9a-f]{6}$")
COMMENT_RE = re.compile(r"^c-\d{8}-\d{6}-[0-9a-f]{6}$")
FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")


class ShotsError(ValueError):
    pass


def inbox(home: Path = HOME) -> Path:
    return home / "inbox"


def comments_dir(home: Path = HOME) -> Path:
    return home / "comments"


def reviews_dir(home: Path = HOME) -> Path:
    return home / "reviews"


def sniff(head: bytes) -> str | None:
    """Return a file extension from magic bytes, or None if not an accepted image."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heis", b"hevc"):
        return ".heic"
    return None


def stamp(now: float | None = None) -> str:
    return datetime.fromtimestamp(now or time.time(), TZ).strftime("%Y%m%d-%H%M%S")


def local(ts: float | None, fmt: str = "%b %-d %H:%M") -> str:
    return datetime.fromtimestamp(ts, TZ).strftime(fmt) if ts else ""


def new_name(ext: str, now: float | None = None) -> str:
    return f"{stamp(now)}-{secrets.token_hex(3)}{ext}"


def is_image(path: Path) -> bool:
    return (path.is_file() and not path.name.startswith(".")
            and path.suffix.lower() in IMAGE_EXTS)


def meta_path(img: Path) -> Path:
    return img.with_name(img.name + ".json")


def claim_path(home: Path, key: str) -> Path:
    return inbox(home) / ".claims" / (key + ".json")


def read_json(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".tmp-{secrets.token_hex(6)}")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def unlink_quiet(*paths: Path) -> None:
    for p in paths:
        try:
            p.unlink()
        except FileNotFoundError:
            pass


def _sorted(paths, newest_first=False):
    return sorted(paths, key=lambda p: (p.stat().st_mtime, p.name), reverse=newest_first)


# ---------- screenshots from Chris ----------

def pending_shots(home: Path = HOME) -> list[Path]:
    try:
        return _sorted(p for p in inbox(home).iterdir() if is_image(p))
    except OSError:
        return []


def done_shots(home: Path = HOME, limit: int = 30) -> list[Path]:
    try:
        return _sorted((p for p in (inbox(home) / "done").iterdir() if is_image(p)), True)[:limit]
    except OSError:
        return []


def find_shot(home: Path, name: str) -> Path | None:
    for p in (inbox(home) / name, inbox(home) / "done" / name):
        if is_image(p):
            return p
    return None


def describe_shot(home: Path, img: Path, by_target: dict | None = None) -> dict:
    meta = read_json(meta_path(img))
    done = img.parent.name == "done"
    claim = {} if done else read_json(claim_path(home, img.name))
    st = img.stat()
    return {
        "name": img.name,
        "status": "done" if done else ("seen" if claim else "new"),
        "size": st.st_size,
        "received": local(st.st_mtime),
        "note": meta.get("note", ""),
        "original": meta.get("original", ""),
        "seen_at": local(claim.get("at")) if claim else "",
        "done_note": meta.get("done_note", ""),
        "done_at": local(meta.get("done_at")),
        "comments": (by_target or {}).get(f"shot:{img.name}", []),
    }


# ---------- comments from Chris ----------

def target_exists(home: Path, target: str) -> bool:
    kind, _, ident = target.partition(":")
    if kind == "shot":
        return bool(SHOT_RE.match(ident)) and find_shot(home, ident) is not None
    if kind == "review":
        return bool(REVIEW_RE.match(ident)) and (reviews_dir(home) / ident / "meta.json").is_file()
    if kind == "item":
        rid, _, iid = ident.partition("/")
        return bool(REVIEW_RE.match(rid)) and bool(review_item(home, rid, iid))
    if kind == "issue":
        return ident.isdigit() and ident in read_json(home / "issues" / "state.json").get("issues", {})
    return False


def target_choices(home: Path, target: str) -> list[str]:
    """The one-tap choices a review (or one of its items) offers, or []."""
    kind, _, ident = target.partition(":")
    if kind == "review" and REVIEW_RE.match(ident):
        return read_json(reviews_dir(home) / ident / "meta.json").get("choices") or []
    if kind == "item":
        rid, _, iid = ident.partition("/")
        if REVIEW_RE.match(rid):
            return review_item(home, rid, iid).get("choices") or []
    return []


def add_comment(home: Path, target: str, text: str, by: str, choice: str | None = None) -> dict:
    """Save a comment. With `choice`, it is Chris's pick from the target's choices and
    the text is an optional note; a newer pick replaces his earlier one."""
    text = (text or "").strip()[:MAX_NOTE]
    if choice is None and not text:
        raise ShotsError("Write a comment first.")
    if not target_exists(home, target):
        raise ShotsError("That item no longer exists.")
    if choice is not None and choice not in target_choices(home, target):
        raise ShotsError("That is not one of the choices.")
    now = time.time()
    record = {"id": f"c-{stamp(now)}-{secrets.token_hex(3)}", "target": target,
              "text": text, "by": by, "at": now}
    if choice is not None:
        record["choice"] = choice
        earlier = latest_choice(home, target)
        if earlier:
            record["previous_choice"] = earlier["choice"]
    write_json_atomic(comments_dir(home) / (record["id"] + ".json"), record)
    if choice is not None:
        # An earlier pick nobody has handled yet is replaced, not delivered as well.
        for p in pending_comments(home):
            c = read_json(p)
            if c.get("target") == target and "choice" in c and c.get("id") != record["id"]:
                c.update(done_at=now, superseded_by=record["id"])
                write_json_atomic(comments_dir(home) / "done" / p.name, c)
                unlink_quiet(p, claim_path(home, p.stem))
    return record


def latest_choice(home: Path, target: str) -> dict:
    """Chris's current pick on a target (the newest comment with a choice), or {}."""
    best: dict = {}
    for done in (False, True):
        for p in _comment_files(home, done):
            c = read_json(p)
            if c.get("target") == target and "choice" in c and c.get("at", 0) >= best.get("at", 0):
                best = c
    return best


def _comment_files(home: Path, done: bool) -> list[Path]:
    d = comments_dir(home) / "done" if done else comments_dir(home)
    try:
        return sorted(p for p in d.iterdir()
                      if p.suffix == ".json" and COMMENT_RE.match(p.stem))
    except OSError:
        return []


def pending_comments(home: Path = HOME) -> list[Path]:
    return _comment_files(home, done=False)


def comments_by_target(home: Path = HOME) -> dict:
    out: dict[str, list] = {}
    for done in (False, True):
        for p in _comment_files(home, done):
            c = read_json(p)
            if not c.get("target"):
                continue
            claim = {} if done else read_json(claim_path(home, p.stem))
            entry = {
                "id": c.get("id", p.stem), "text": c.get("text", ""), "at": local(c.get("at")),
                "ts": c.get("at", 0),
                "status": "done" if done else ("seen" if claim else "new"),
                "reply": c.get("reply", ""), "reply_at": local(c.get("done_at")),
            }
            if "choice" in c:
                entry["choice"] = c["choice"]
                if c.get("superseded_by"):
                    entry["status"], entry["superseded"] = "changed", True
            out.setdefault(c["target"], []).append(entry)
    for lst in out.values():
        lst.sort(key=lambda c: c["ts"])
    return out


# ---------- review requests from Claude ----------
#
# A review is published from a manifest (JSON):
# {
#   "title": "...", "intro": "...", "status": "...",          plain text
#   "ask": "What Chris must do or decide, and how to answer",  REQUIRED
#   "choices": ["Blue", "Ink", "Tint"],                         optional one-tap answers to "ask"
#   "links": [{"label": "...", "url": "https://..."}],          optional, shown at the end
#   "sections": [{"heading": "...", "note": "...", "items": [
#       {"id": "union-15-light", "title": "...", "text": "...",
#        "ask": "...",                                            optional: this item needs an answer
#        "choices": ["Keep", "Drop"],                             optional one-tap answers for this item
#        "before": "img/a.jpg", "after": "img/b.jpg",            a flip pair, or
#        "images": ["img/c.png"],                                 a plain gallery (or neither)
#        "links": [{"label": "...", "url": "https://..."}]}]}]
# }
# Image paths are relative to the manifest. Every item gets its own comment thread
# (target "item:REVIEW/ITEM"); the review as a whole has one too ("review:REVIEW").

ITEM_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")


def _text(v, limit=MAX_NOTE) -> str:
    return v.strip()[:limit] if isinstance(v, str) else ""


MAX_CHOICES = 8


def _choices(v) -> list[str]:
    """2-8 short, distinct labels for one-tap answers; [] when absent."""
    if v is None:
        return []
    if not isinstance(v, list) or not all(isinstance(c, str) and c.strip() for c in v):
        raise ShotsError("\"choices\" must be a list of short labels, e.g. [\"Blue\", \"Ink\"].")
    out = [c.strip()[:60] for c in v]
    if not 2 <= len(out) <= MAX_CHOICES or len(set(out)) != len(out):
        raise ShotsError(f"\"choices\" needs 2 to {MAX_CHOICES} different labels.")
    return out


def _links(v) -> list[dict]:
    out = []
    for link in v if isinstance(v, list) else []:
        if (isinstance(link, dict) and isinstance(link.get("url"), str)
                and link["url"].startswith("https://") and len(link["url"]) < 2000):
            out.append({"label": _text(link.get("label"), 120) or "Open", "url": link["url"]})
    return out[:12]


def create_review(home: Path, manifest: Path, session: str = "") -> str:
    manifest = Path(manifest).resolve()
    try:
        spec = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ShotsError(f"Cannot read manifest {manifest}: {e}")
    if not isinstance(spec, dict) or not _text(spec.get("title"), 200):
        raise ShotsError("The manifest needs a title.")
    if not _text(spec.get("ask")):
        raise ShotsError("The manifest needs an \"ask\": what Chris must do or decide, and how to answer. "
                         "A report that needs nothing from him does not belong on the review tab.")
    base = manifest.parent
    now = time.time()
    rid = f"r-{stamp(now)}-{secrets.token_hex(3)}"
    staged: list[tuple[Path, str]] = []
    used: set[str] = set()

    def image(rel) -> str:
        if not isinstance(rel, str) or not rel:
            raise ShotsError(f"Bad image reference: {rel!r}")
        src = (base / rel).resolve()
        if not src.is_file() or src.stat().st_size > MAX_IMAGE:
            raise ShotsError(f"Not a readable image under 25 MB: {src}")
        with open(src, "rb") as f:
            ext = sniff(f.read(16))
        if not ext:
            raise ShotsError(f"Not a PNG/JPEG/WebP/GIF/HEIC image: {src}")
        stem = re.sub(r"[^A-Za-z0-9_-]+", "-", src.stem).strip("-")[:60] or "image"
        name, n = f"{stem}{ext}", 2
        while name in used:
            name, n = f"{stem}-{n}{ext}", n + 1
        used.add(name)
        staged.append((src, name))
        return name

    sections, ids = [], set()
    for sec in spec.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        items = []
        for it in sec.get("items") or []:
            if not isinstance(it, dict):
                continue
            iid = it.get("id")
            if not isinstance(iid, str) or not ITEM_RE.match(iid) or iid in ids:
                raise ShotsError(f"Each item needs a unique id of a-z, 0-9 and dashes: {iid!r}")
            ids.add(iid)
            item = {"id": iid, "title": _text(it.get("title"), 200), "text": _text(it.get("text")),
                    "ask": _text(it.get("ask")), "links": _links(it.get("links"))}
            if it.get("choices") is not None:
                item["choices"] = _choices(it.get("choices"))
            if it.get("before") or it.get("after"):
                item["before"], item["after"] = image(it.get("before")), image(it.get("after"))
            item["images"] = [image(p) for p in (it.get("images") or [])][:12]
            items.append(item)
        sections.append({"heading": _text(sec.get("heading"), 120), "note": _text(sec.get("note")),
                         "items": items})
    if not ids:
        raise ShotsError("The manifest has no items to review.")
    choices = _choices(spec.get("choices"))
    d = reviews_dir(home) / rid
    d.mkdir(parents=True)
    for src, name in staged:
        shutil.copyfile(src, d / name)
    write_json_atomic(d / "meta.json", {
        "id": rid, "title": _text(spec.get("title"), 200), "ask": _text(spec.get("ask")),
        "intro": _text(spec.get("intro")), "choices": choices,
        "status_note": _text(spec.get("status")), "links": _links(spec.get("links")),
        "sections": sections, "created": now, "session": session, "status": "open",
    })
    return rid


def quick_review(home: Path, title: str, text: str, images: list[Path], session: str = "", ask: str = "") -> str:
    """One-item review from a few image files (shotctl ask --title ... --ask ... img...)."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        spec = {"title": title, "ask": ask, "sections": [{"heading": "", "items": [{
            "id": "item", "title": title, "text": text,
            "images": [str(Path(p).resolve()) for p in images]}]}]}
        m = Path(tmp) / "manifest.json"
        m.write_text(json.dumps(spec), encoding="utf-8")
        return create_review(home, m, session)


def review_item(home: Path, rid: str, iid: str) -> dict:
    m = read_json(reviews_dir(home) / rid / "meta.json")
    for sec in m.get("sections", []):
        for it in sec.get("items", []):
            if it.get("id") == iid:
                return it
    return {}


def _picked(comments: list[dict]) -> dict | None:
    """The newest pick in a thread (comments_by_target sorts oldest first)."""
    picks = [c for c in comments if "choice" in c]
    return picks[-1] if picks else None


def list_reviews(home: Path = HOME, by_target: dict | None = None) -> list[dict]:
    by_target = by_target or {}
    out = []
    try:
        dirs = [d for d in reviews_dir(home).iterdir() if REVIEW_RE.match(d.name)]
    except OSError:
        return []
    for d in dirs:
        m = read_json(d / "meta.json")
        if not m:
            continue
        n_comments = 0
        sections = []
        for sec in m.get("sections", []):
            items = []
            for it in sec.get("items", []):
                cs = by_target.get(f"item:{d.name}/{it.get('id')}", [])
                n_comments += len(cs)
                items.append({**it, "comments": cs, "choices": it.get("choices") or [],
                              "picked": _picked(cs)})
            sections.append({**sec, "items": items})
        overall = by_target.get(f"review:{d.name}", [])
        status = m.get("status", "open")
        if status == "open" and (n_comments or overall):
            status = "commented"
        out.append({
            "id": d.name, "title": m.get("title", ""), "ask": m.get("ask", ""), "intro": m.get("intro", ""),
            "status_note": m.get("status_note", ""), "links": m.get("links", []),
            "sections": sections, "created": local(m.get("created")), "ts": m.get("created", 0),
            "status": status, "close_note": m.get("close_note", ""),
            "closed_at": local(m.get("closed_at")), "comments": overall,
            "choices": m.get("choices") or [], "picked": _picked(overall),
        })
    out.sort(key=lambda r: r["ts"], reverse=True)
    return out


def close_review(home: Path, rid: str, note: str = "") -> None:
    path = reviews_dir(home) / rid / "meta.json"
    m = read_json(path)
    if not REVIEW_RE.match(rid) or not m:
        raise ShotsError(f"No such review request: {rid}")
    m.update(status="closed", close_note=note.strip()[:MAX_NOTE], closed_at=time.time())
    write_json_atomic(path, m)


# ---------- issues tab (written by issues_sync.py) ----------

ISSUE_IMG_RE = re.compile(r"^\d{1,6}-[0-9a-f]{8}-(light|dark)(-after)?-\d{10}\.jpg$")


def list_issues(home: Path = HOME, by_target: dict | None = None) -> dict:
    state = read_json(home / "issues" / "state.json")
    out = []
    for n, it in state.get("issues", {}).items():
        locs = []
        for l in it.get("locations", []):
            pic = lambda k: ({"img": l[k]["img"], "at": local(l[k]["at"])} if k in l else None)  # noqa: E731
            locs.append({"label": l.get("label", ""), "theme": l.get("theme", "light"),
                         "url": f"https://rtd-system-map.pages.dev/#{l['key']}",
                         "first": pic("first"), "current": pic("current"), "after": pic("after")})
        out.append({**{k: it.get(k) for k in ("number", "title", "url", "labels", "summary")},
                    "fixed": bool(it.get("closed_at")), "closed_at": local(it.get("closed_at")),
                    "updated": local(it.get("updated")), "ts": it.get("updated", 0),
                    "locations": locs, "comments": (by_target or {}).get(f"issue:{n}", [])})
    out.sort(key=lambda i: (i["fixed"], -i["ts"]))
    return {"synced": local(state.get("synced")), "issues": out}


# ---------- marking things handled ----------

def mark_done(home: Path, ident: str, note: str = "") -> Path:
    """Handle a pending screenshot (by file name) or comment (by id). Returns new path."""
    ident = Path(ident).name
    now = time.time()
    if COMMENT_RE.match(ident.removesuffix(".json")):
        cid = ident.removesuffix(".json")
        src = comments_dir(home) / (cid + ".json")
        c = read_json(src)
        if not c:
            raise ShotsError(f"Not a pending comment: {cid}")
        c.update(done_at=now, reply=note.strip()[:MAX_NOTE])
        dest = comments_dir(home) / "done" / src.name
        write_json_atomic(dest, c)
        unlink_quiet(src, claim_path(home, cid))
        return dest
    img = inbox(home) / ident
    if not is_image(img):
        raise ShotsError(f"Not a pending screenshot or comment: {ident}")
    meta = read_json(meta_path(img))
    meta.update(done_at=now, done_note=note.strip()[:MAX_NOTE])
    dest = inbox(home) / "done" / img.name
    write_json_atomic(meta_path(dest), meta)
    os.replace(img, dest)
    unlink_quiet(meta_path(img), claim_path(home, img.name))
    return dest
