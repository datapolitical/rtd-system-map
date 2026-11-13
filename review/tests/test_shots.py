import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
# Never read the real service.env in tests.
os.environ["RTD_REVIEW_ENV_FILE"] = str(HERE / "tests" / "no-such-service.env")

import shots  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
LOGIN = "chris@example.com"
TOKEN = "t" * 40
ORIGIN = "https://review.example.ts.net:10001"
PREFIX = "/work/rtd-system-map"


def make_home(tmp: str) -> Path:
    home = Path(tmp)
    for d in ("inbox/done", "inbox/.claims", "comments/done", "reviews", "issues/img"):
        (home / d).mkdir(parents=True, exist_ok=True)
    return home


def make_manifest(base: Path, **extra) -> Path:
    (base / "img").mkdir(exist_ok=True)
    (base / "img" / "a-before.jpg").write_bytes(JPG)
    (base / "img" / "a-after.jpg").write_bytes(JPG)
    (base / "img" / "c.png").write_bytes(PNG)
    spec = {
        "title": "Review of today", "ask": "Tell me which station marks look wrong.", "intro": "Tap to flip.", "status": "Merged as PR #91.",
        "links": [{"label": "PR", "url": "https://github.com/x/y/pull/91"},
                  {"label": "bad", "url": "javascript:alert(1)"}],
        "sections": [
            {"heading": "Stations", "items": [
                {"id": "union-15", "title": "Union Station", "text": "Marks at platforms.",
                 "before": "img/a-before.jpg", "after": "img/a-after.jpg",
                 "links": [{"label": "Open", "url": "https://rtd-system-map.pages.dev/#15/39.7/-105"}]},
                {"id": "gallery", "title": "Gallery", "images": ["img/c.png"]}]},
            {"heading": "Not fixed yet", "items": [{"id": "blob", "title": "A blob at the concourse"}]},
        ],
    }
    spec.update(extra)
    m = base / "manifest.json"
    m.write_text(json.dumps(spec))
    return m


def with_choices(base: Path) -> Path:
    m = make_manifest(base, choices=["Blue", "Ink", "Tint"])
    spec = json.loads(m.read_text())
    spec["sections"][1]["items"][0]["choices"] = ["Keep", "Drop"]
    m.write_text(json.dumps(spec))
    return m


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = make_home(self.tmp.name + "/home")
        self.src = Path(self.tmp.name) / "src"
        self.src.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_publish_copies_images_and_drops_unsafe_links(self):
        rid = shots.create_review(self.home, make_manifest(self.src))
        r = shots.list_reviews(self.home)[0]
        self.assertEqual(r["id"], rid)
        self.assertEqual([l["label"] for l in r["links"]], ["PR"])
        item = r["sections"][0]["items"][0]
        self.assertTrue((self.home / "reviews" / rid / item["before"]).is_file())
        self.assertNotEqual(item["before"], item["after"])
        self.assertEqual(r["status"], "open")

    def test_requires_an_ask(self):
        m = make_manifest(self.src)
        spec = json.loads(m.read_text())
        del spec["ask"]
        m.write_text(json.dumps(spec))
        with self.assertRaises(shots.ShotsError):
            shots.create_review(self.home, m)

    def test_rejects_duplicate_ids_and_non_images(self):
        m = make_manifest(self.src)
        spec = json.loads(m.read_text())
        spec["sections"][1]["items"][0]["id"] = "union-15"
        m.write_text(json.dumps(spec))
        with self.assertRaises(shots.ShotsError):
            shots.create_review(self.home, m)
        (self.src / "img" / "evil.png").write_text("<script>")
        spec["sections"][1]["items"][0] = {"id": "x", "images": ["img/evil.png"]}
        m.write_text(json.dumps(spec))
        with self.assertRaises(shots.ShotsError):
            shots.create_review(self.home, m)
        self.assertEqual(list((self.home / "reviews").iterdir()), [])

    def test_item_comment_and_reply(self):
        rid = shots.create_review(self.home, make_manifest(self.src))
        c = shots.add_comment(self.home, f"item:{rid}/blob", "still there at z17", LOGIN)
        with self.assertRaises(shots.ShotsError):
            shots.add_comment(self.home, f"item:{rid}/nope", "x", LOGIN)
        with self.assertRaises(shots.ShotsError):
            shots.add_comment(self.home, "item:../../etc/x", "x", LOGIN)
        shots.mark_done(self.home, c["id"], "fixed in #94")
        r = shots.list_reviews(self.home, shots.comments_by_target(self.home))[0]
        com = r["sections"][1]["items"][0]["comments"][0]
        self.assertEqual((com["status"], com["reply"]), ("done", "fixed in #94"))
        self.assertEqual(r["status"], "commented")
        shots.close_review(self.home, rid, "all done")
        self.assertEqual(shots.list_reviews(self.home)[0]["status"], "closed")


def write_issue_state(home: Path) -> str:
    """An Issues tab entry as issues_sync.py on the mini writes it."""
    name = "97-0123abcd-light-1762900000.jpg"
    (home / "issues" / "img" / name).write_bytes(JPG)
    shots.write_json_atomic(home / "issues" / "state.json", {"synced": time.time(), "issues": {"97": {
        "number": 97, "title": "Bus lines under rail", "url": "https://github.com/x/y/issues/97",
        "labels": ["bus"], "summary": "", "updated": time.time(),
        "locations": [{"key": "17/39.7080/-104.9925", "label": "Alameda", "theme": "light",
                       "current": {"img": name, "at": time.time()}}]}}})
    return name


class ChoiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = make_home(self.tmp.name + "/home")
        self.src = Path(self.tmp.name) / "src"
        self.src.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_choices_are_published_per_review_and_item(self):
        rid = shots.create_review(self.home, with_choices(self.src))
        r = shots.list_reviews(self.home)[0]
        self.assertEqual((r["id"], r["choices"], r["picked"]), (rid, ["Blue", "Ink", "Tint"], None))
        self.assertEqual(r["sections"][1]["items"][0]["choices"], ["Keep", "Drop"])
        self.assertEqual(r["sections"][0]["items"][0]["choices"], [])
        # A review without choices still publishes and lists none.
        shots.create_review(self.home, make_manifest(self.src))
        self.assertEqual(sorted(len(x["choices"]) for x in shots.list_reviews(self.home)), [0, 3])

    def test_flip_pair_labels(self):
        m = make_manifest(self.src)
        spec = json.loads(m.read_text())
        spec["sections"][0]["items"][0]["labels"] = ["Blue", "Tint"]
        m.write_text(json.dumps(spec))
        shots.create_review(self.home, m)
        items = shots.list_reviews(self.home)[0]["sections"][0]["items"]
        self.assertEqual(items[0]["labels"], ["Blue", "Tint"])
        self.assertNotIn("labels", items[1])
        for bad in (["Blue"], "Blue", ["Blue", " "], ["Blue", 3]):
            spec["sections"][0]["items"][0]["labels"] = bad
            m.write_text(json.dumps(spec))
            with self.assertRaises(shots.ShotsError, msg=bad):
                shots.create_review(self.home, m)

    def test_note_without_pick_leaves_choice_open(self):
        rid = shots.create_review(self.home, with_choices(self.src))
        shots.add_comment(self.home, f"review:{rid}", "Show me blue next to tint", LOGIN)
        r = shots.list_reviews(self.home, shots.comments_by_target(self.home))[0]
        self.assertIsNone(r["picked"])
        self.assertEqual([c["text"] for c in r["comments"]], ["Show me blue next to tint"])

    def test_bad_choices_are_refused(self):
        for bad in (["Only"], ["Blue", "Blue"], "Blue", ["Blue", 3], ["Blue", " "], [str(i) for i in range(9)]):
            with self.assertRaises(shots.ShotsError, msg=bad):
                shots.create_review(self.home, make_manifest(self.src, choices=bad))
        self.assertEqual(list((self.home / "reviews").iterdir()), [])

    def test_pick_change_and_reply(self):
        rid = shots.create_review(self.home, with_choices(self.src))
        target = f"review:{rid}"
        with self.assertRaises(shots.ShotsError):
            shots.add_comment(self.home, target, "", LOGIN, choice="Red")
        with self.assertRaises(shots.ShotsError):
            shots.add_comment(self.home, f"item:{rid}/union-15", "", LOGIN, choice="Blue")  # no item choices
        first = shots.add_comment(self.home, target, "", LOGIN, choice="Ink")
        second = shots.add_comment(self.home, target, "a touch darker", LOGIN, choice="Blue")
        self.assertEqual(second["previous_choice"], "Ink")
        # The unhandled earlier pick is replaced, not delivered as well.
        self.assertEqual([p.stem for p in shots.pending_comments(self.home)], [second["id"]])
        old = shots.read_json(self.home / "comments" / "done" / (first["id"] + ".json"))
        self.assertEqual(old["superseded_by"], second["id"])
        r = shots.list_reviews(self.home, shots.comments_by_target(self.home))[0]
        self.assertEqual((r["picked"]["choice"], r["picked"]["text"], r["status"]), ("Blue", "a touch darker", "commented"))
        self.assertEqual([c.get("status") for c in r["comments"]], ["changed", "new"])
        shots.mark_done(self.home, second["id"], "using Blue")
        item = shots.add_comment(self.home, f"item:{rid}/blob", "", LOGIN, choice="Drop")
        self.assertNotIn("previous_choice", item)
        r = shots.list_reviews(self.home, shots.comments_by_target(self.home))[0]
        self.assertEqual((r["picked"]["status"], r["picked"]["reply"]), ("done", "using Blue"))
        self.assertEqual(r["sections"][1]["items"][0]["picked"]["choice"], "Drop")
        # Changing a handled pick keeps the handled one and says what it was.
        third = shots.add_comment(self.home, target, "", LOGIN, choice="Tint")
        self.assertEqual(third["previous_choice"], "Blue")
        self.assertTrue((self.home / "comments" / "done" / (second["id"] + ".json")).is_file())


class IssueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = make_home(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_issue_comment_reaches_hook(self):
        write_issue_state(self.home)
        with self.assertRaises(shots.ShotsError):
            shots.add_comment(self.home, "issue:12", "x", LOGIN)
        c = shots.add_comment(self.home, "issue:97", "still under the rail", LOGIN)
        env = dict(os.environ, RTD_REVIEW_HOME=str(self.home), RTD_REVIEW_CWD_PREFIX=PREFIX)
        data = {"session_id": "s1", "hook_event_name": "PostToolUse", "cwd": PREFIX}
        p = subprocess.run([sys.executable, "-I", str(HERE / "hook.py")], input=json.dumps(data),
                           capture_output=True, text=True, env=env, timeout=20)
        ctx = json.loads(p.stdout)["hookSpecificOutput"]["additionalContext"]
        self.assertIn(c["id"], ctx)
        self.assertIn("GitHub issue #97", ctx)
        self.assertIn(str(self.home / "issues" / "img"), ctx)


class AppTests(unittest.TestCase):
    def setUp(self):
        from app import create_app
        self.tmp = tempfile.TemporaryDirectory()
        self.home = make_home(self.tmp.name + "/home")
        self.inbox = self.home / "inbox"
        self.app = create_app({
            "HOME": str(self.home), "ALLOWED_LOGIN": LOGIN, "PROXY_TOKEN": "",
            "SECRET": "s" * 40, "PUBLIC_ORIGIN": ORIGIN,
        })
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def headers(self, **over):
        h = {"Tailscale-User-Login": LOGIN}
        h.update(over)
        return {k: v for k, v in h.items() if v is not None}

    def csrf(self):
        r = self.client.get("/shots/api/session", headers=self.headers())
        self.assertEqual(r.status_code, 200)
        return r.get_json()["csrf"]

    def post(self, files, note="", **over):
        token = self.csrf()
        data = {"files": [(io.BytesIO(b), n) for b, n in files], "note": note}
        h = self.headers(**{"Origin": ORIGIN, "X-CSRF-Token": token, **over})
        return self.client.post("/shots/api/items", data=data, headers=h,
                                content_type="multipart/form-data")

    def comment(self, target, text, **over):
        token = self.csrf()
        h = self.headers(**{"Origin": ORIGIN, "X-CSRF-Token": token, **over})
        return self.client.post("/shots/api/comments", json={"target": target, "text": text}, headers=h)

    def test_rejects_without_gates(self):
        for over in ({"Tailscale-User-Login": "someone@else"}, {"Tailscale-User-Login": None}):
            for path in ("/", "/shots/api/items"):
                self.assertEqual(self.client.get(path, headers=self.headers(**over)).status_code, 403, over)
        far = self.client.get("/shots/api/items", headers=self.headers(), environ_base={"REMOTE_ADDR": "10.0.0.1"})
        self.assertEqual(far.status_code, 403)

    def test_optional_gates(self):
        from app import create_app
        app = create_app({"HOME": str(self.home), "ALLOWED_LOGIN": LOGIN, "PROXY_TOKEN": TOKEN,
                          "SECRET": "s" * 40, "PUBLIC_ORIGIN": ORIGIN,
                          "TRUSTED_INGRESS": lambda port: port == "5555"})
        c = app.test_client()
        ok = {"REMOTE_ADDR": "127.0.0.1", "REMOTE_PORT": "5555"}
        h = self.headers(**{"X-Map-Shots-Proxy": TOKEN})
        self.assertEqual(c.get("/shots/api/items", headers=h, environ_base=ok).status_code, 200)
        self.assertEqual(c.get("/shots/api/items", headers=self.headers(), environ_base=ok).status_code, 403)
        self.assertEqual(c.get("/shots/api/items", headers=h, environ_base={**ok, "REMOTE_PORT": "9999"}).status_code, 403)
        with self.assertRaises(RuntimeError):
            create_app({"HOME": str(self.home), "ALLOWED_LOGIN": LOGIN, "SECRET": "s" * 40, "PUBLIC_ORIGIN": ""})

    def test_serves_page_and_redirects_old_path(self):
        r = self.client.get("/", headers=self.headers())
        self.assertEqual((r.status_code, r.mimetype), (200, "text/html"))
        self.assertIn(b"/shots/assets/app.js", r.data)
        self.assertIn("script-src 'self'", r.headers["Content-Security-Policy"])
        r = self.client.get("/shots/", headers=self.headers())
        self.assertEqual((r.status_code, r.headers["Location"]), (302, "/"))
        self.assertEqual(self.client.get("/shots/assets/app.js", headers=self.headers()).status_code, 200)

    def test_upload_saves_image_and_note_and_serves_it(self):
        r = self.post([(PNG, "IMG_1.PNG"), (PNG, "IMG_2.PNG")], note="Red line jog")
        self.assertEqual(r.status_code, 201, r.get_data(as_text=True))
        saved = r.get_json()["saved"]
        for name in saved:
            self.assertEqual((self.inbox / name).read_bytes(), PNG)
            self.assertEqual(json.loads((self.inbox / (name + ".json")).read_text())["note"], "Red line jog")
        shots_ = self.client.get("/shots/api/items", headers=self.headers()).get_json()["shots"]
        self.assertEqual({s["status"] for s in shots_}, {"new"})
        img = self.client.get(f"/shots/api/image/shot/{saved[0]}", headers=self.headers())
        self.assertEqual((img.status_code, img.mimetype, img.data), (200, "image/png", PNG))
        self.assertIn("immutable", img.headers["Cache-Control"])
        self.assertEqual(self.client.get("/shots/api/image/shot/..%2f..%2fapp.py", headers=self.headers()).status_code, 404)

    def test_rejects_non_image(self):
        self.assertEqual(self.post([(b"#!/bin/sh\necho hi", "x.png")]).status_code, 415)
        self.assertEqual([p for p in self.inbox.iterdir() if p.is_file()], [])

    def test_post_needs_csrf_and_origin(self):
        self.assertEqual(self.post([(PNG, "a.png")], **{"X-CSRF-Token": "nope"}).status_code, 403)
        self.assertEqual(self.post([(PNG, "a.png")], Origin="https://evil.example").status_code, 403)
        self.assertEqual(self.comment("shot:x", "hi", Origin="https://evil.example").status_code, 403)

    def test_comment_on_shot_and_review_item(self):
        name = self.post([(PNG, "a.png")]).get_json()["saved"][0]
        self.assertEqual(self.comment(f"shot:{name}", "also at z16").status_code, 201)
        self.assertEqual(self.comment(f"shot:{name}", "   ").status_code, 400)
        self.assertEqual(self.comment("shot:20990101-000000-abcdef.png", "x").status_code, 400)
        src = Path(self.tmp.name) / "src"
        src.mkdir()
        rid = shots.create_review(self.home, make_manifest(src))
        self.assertEqual(self.comment(f"item:{rid}/union-15", "looks right").status_code, 201)
        self.assertEqual(self.comment(f"review:{rid}", "good day").status_code, 201)
        data = self.client.get("/shots/api/items", headers=self.headers()).get_json()
        self.assertEqual(data["shots"][0]["comments"][0]["text"], "also at z16")
        r = data["reviews"][0]
        self.assertEqual(r["sections"][0]["items"][0]["comments"][0]["text"], "looks right")
        self.assertEqual(r["comments"][0]["text"], "good day")
        before = r["sections"][0]["items"][0]["before"]
        img = self.client.get(f"/shots/api/image/review/{rid}/{before}", headers=self.headers())
        self.assertEqual((img.status_code, img.mimetype), (200, "image/jpeg"))

    def test_pick_through_api(self):
        src = Path(self.tmp.name) / "src"
        src.mkdir()
        rid = shots.create_review(self.home, with_choices(src))
        token = self.csrf()
        h = self.headers(**{"Origin": ORIGIN, "X-CSRF-Token": token})
        post = lambda body: self.client.post("/shots/api/comments", json=body, headers=h)  # noqa: E731
        self.assertEqual(post({"target": f"review:{rid}", "choice": "Blue", "text": ""}).status_code, 201)
        self.assertEqual(post({"target": f"review:{rid}", "choice": "Mauve", "text": ""}).status_code, 400)
        self.assertEqual(post({"target": f"review:{rid}", "choice": ["Blue"], "text": ""}).status_code, 400)
        self.assertEqual(post({"target": f"review:{rid}", "text": ""}).status_code, 400)
        self.assertEqual(self.client.post("/shots/api/comments", json={"target": f"review:{rid}", "choice": "Ink"},
                                          headers=self.headers(Origin=ORIGIN)).status_code, 403)  # no CSRF
        self.assertEqual(post({"target": f"review:{rid}", "choice": "Ink", "text": "on second thought"}).status_code, 201)
        r = self.client.get("/shots/api/items", headers=self.headers()).get_json()["reviews"][0]
        self.assertEqual((r["choices"], r["picked"]["choice"], r["picked"]["text"]),
                         (["Blue", "Ink", "Tint"], "Ink", "on second thought"))

    def test_issues_in_items_with_images(self):
        write_issue_state(self.home)
        data = self.client.get("/shots/api/items", headers=self.headers()).get_json()
        it = data["issues"][0]
        self.assertEqual((it["number"], it["fixed"]), (97, False))
        name = it["locations"][0]["current"]["img"]
        r = self.client.get(f"/shots/api/image/issue/{name}", headers=self.headers())
        self.assertEqual((r.status_code, r.mimetype), (200, "image/jpeg"))
        self.assertEqual(self.client.get("/shots/api/image/issue/state.json", headers=self.headers()).status_code, 404)
        self.assertEqual(self.comment("issue:97", "please").status_code, 201)

    def test_delete_pending(self):
        name = self.post([(PNG, "a.png")]).get_json()["saved"][0]
        token = self.csrf()
        h = self.headers(Origin=ORIGIN, **{"X-CSRF-Token": token})
        self.assertEqual(self.client.delete(f"/shots/api/items/{name}", headers=h).status_code, 200)
        self.assertFalse((self.inbox / name).exists())
        self.assertEqual(self.client.delete("/shots/api/items/..%2fapp.py", headers=h).status_code, 404)


class HookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = make_home(self.tmp.name + "/home")
        self.inbox = self.home / "inbox"
        self.env = dict(os.environ, RTD_REVIEW_HOME=str(self.home), RTD_REVIEW_CWD_PREFIX=PREFIX,
                        RTD_REVIEW_ORIGIN=ORIGIN)

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, name="20261111-120000-abcdef.png", note="look here", age=10):
        img = self.inbox / name
        img.write_bytes(PNG)
        (self.inbox / (name + ".json")).write_text(json.dumps({"note": note}))
        t = time.time() - age
        os.utime(img, (t, t))
        return img

    def run_hook(self, sid="s1", *args, **extra):
        data = {"session_id": sid, "hook_event_name": "PostToolUse", "cwd": PREFIX + "-review/qa",
                "transcript_path": "/home/u/.claude/projects/-work-rtd-system-map-review/x.jsonl"}
        data.update(extra)
        p = subprocess.run([sys.executable, "-I", str(HERE / "hook.py"), *args], input=json.dumps(data),
                           capture_output=True, text=True, env=self.env, timeout=20)
        self.assertEqual(p.returncode, 0, p.stderr)
        return json.loads(p.stdout) if p.stdout.strip() else None

    def ctl(self, *args):
        p = subprocess.run([sys.executable, "-I", str(HERE / "shotctl.py"), *args],
                           capture_output=True, text=True, env=self.env, timeout=20)
        self.assertEqual(p.returncode, 0, p.stderr)
        return p.stdout

    def test_announces_once_per_claim(self):
        img = self.add()
        out = self.run_hook()
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn(str(img), ctx)
        self.assertIn("look here", ctx)
        self.assertIsNone(self.run_hook())
        self.assertIsNone(self.run_hook(sid="s2"))

    def test_stale_claim_moves_on(self):
        img = self.add()
        self.run_hook()
        claim = self.inbox / ".claims" / (img.name + ".json")
        data = json.loads(claim.read_text())
        data["at"] -= 3600
        claim.write_text(json.dumps(data))
        self.assertIn(str(img), self.run_hook(sid="s2")["hookSpecificOutput"]["additionalContext"])

    def test_skips_subagents_other_projects_and_fresh_files(self):
        self.add(age=0)
        self.assertIsNone(self.run_hook())
        self.add(name="20261111-120001-abcdef.png")
        self.assertIsNone(self.run_hook(agent_id="a1"))
        self.assertIsNone(self.run_hook(cwd="/work/hvac", transcript_path="/x/-work-hvac/y.jsonl"))
        self.assertIsNone(self.run_hook(cwd="/work", transcript_path="/x/-work/y.jsonl"))
        self.assertIsNotNone(self.run_hook(cwd="/work/hvac",
                                           transcript_path="/x/-work-rtd-system-map-sheets/y.jsonl"))

    def test_comment_on_review_item_is_delivered_with_images(self):
        src = Path(self.tmp.name) / "src"
        src.mkdir()
        rid = shots.create_review(self.home, make_manifest(src))
        c = shots.add_comment(self.home, f"item:{rid}/union-15", "the walk dots are off-centre", LOGIN)
        ctx = self.run_hook()["hookSpecificOutput"]["additionalContext"]
        self.assertIn(c["id"], ctx)
        self.assertIn("the walk dots are off-centre", ctx)
        self.assertIn("Union Station", ctx)
        self.assertIn(str(self.home / "reviews" / rid), ctx)
        self.assertIsNone(self.run_hook())
        self.ctl("done", c["id"], "--note", "moved the walk to the centre line")
        self.assertEqual(json.loads((self.home / "comments" / "done" / (c["id"] + ".json")).read_text())["reply"],
                         "moved the walk to the centre line")
        self.assertIsNone(self.run_hook(sid="s9"))

    def test_pick_is_announced_and_listed(self):
        src = Path(self.tmp.name) / "src"
        src.mkdir()
        rid = shots.create_review(self.home, with_choices(src))
        c = shots.add_comment(self.home, f"review:{rid}", "a touch darker", LOGIN, choice="Blue")
        listed = self.ctl("list")
        self.assertIn("review choices: Blue / Ink / Tint; picked Blue — a touch darker", listed)
        self.assertIn("item blob choices: Keep / Drop; not picked yet", listed)
        self.assertIn(f"{c['id']}  on review:{rid}: picked Blue — a touch darker", listed)
        for _ in range(2):  # a dry run claims nothing
            dry = self.run_hook("s1", "--dry-run")["hookSpecificOutput"]["additionalContext"]
            self.assertIn("Chris picked: Blue — a touch darker", dry)
        self.assertEqual(list((self.inbox / ".claims").iterdir()), [])
        out = self.run_hook()
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn("Chris picked: Blue — a touch darker", ctx)
        self.assertIn("(choices: Blue, Ink, Tint)", ctx)
        self.assertIn("1 pick", out["systemMessage"])
        self.assertIsNone(self.run_hook())
        c2 = shots.add_comment(self.home, f"review:{rid}", "", LOGIN, choice="Tint")
        ctx = self.run_hook()["hookSpecificOutput"]["additionalContext"]
        self.assertIn(c2["id"], ctx)
        self.assertIn("Chris picked: Tint\n", ctx)
        self.assertIn("changes his earlier pick: Blue", ctx)
        self.assertNotIn(c["id"], ctx)
        self.assertIsNone(self.run_hook(sid="s2"))

    def test_done_moves_shot(self):
        img = self.add()
        self.run_hook()
        self.ctl("done", img.name, "--note", "fixed")
        self.assertFalse(img.exists())
        self.assertEqual(json.loads((self.inbox / "done" / (img.name + ".json")).read_text())["done_note"], "fixed")
        self.assertIsNone(self.run_hook(sid="s9"))

    def test_publish_and_list(self):
        src = Path(self.tmp.name) / "src"
        src.mkdir()
        out = self.ctl("publish", str(make_manifest(src)))
        self.assertIn(ORIGIN, out)
        self.assertIn("Review of today", self.ctl("list"))

    def test_bad_input_is_silent(self):
        p = subprocess.run([sys.executable, "-I", str(HERE / "hook.py")], input="not json",
                           capture_output=True, text=True, env=self.env, timeout=20)
        self.assertEqual((p.returncode, p.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
