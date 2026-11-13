"""Review page: a two-way channel between Chris and the Claude sessions working on the RTD map.

Chris uploads screenshots, comments and picks; sessions post review requests. This
service serves the page (static/index.html at /) and its API (/shots/api/*) on
127.0.0.1, behind `tailscale serve`. Gates: a loopback peer, Chris's
Tailscale-User-Login, same-origin + CSRF on writes, upload checks and a rate limit.
Two Linux-only gates from the original deployment are optional and off by default: a
proxy token added by a reverse proxy (RTD_REVIEW_PROXY_TOKEN) and a check that the
connection came from root (RTD_REVIEW_ROOT_INGRESS=1, systemd socket table).
Settings: README.md, "Service".
"""
from collections import deque
import hmac
import os
import secrets
import threading
import time
from pathlib import Path

from flask import Flask, abort, g, jsonify, redirect, request, send_file, session
from werkzeug.exceptions import HTTPException

import shots

MAX_FILES = 12
MAX_BODY = 120 * 1024 * 1024
PAGE = "/"
STATIC = Path(__file__).resolve().parent / "static"


def create_app(config=None):
    app = Flask(__name__, static_url_path="/shots/assets")
    app.config.update(
        HOME=str(shots.HOME),
        ALLOWED_LOGIN=os.environ.get("RTD_REVIEW_LOGIN", ""),
        PROXY_TOKEN=os.environ.get("RTD_REVIEW_PROXY_TOKEN", ""),  # optional
        SECRET=os.environ.get("RTD_REVIEW_SESSION_SECRET", ""),
        PUBLIC_ORIGIN=os.environ.get("RTD_REVIEW_ORIGIN", "").rstrip("/"),
        MAX_CONTENT_LENGTH=MAX_BODY,
        SESSION_COOKIE_NAME="__Secure-map-shots",
        SESSION_COOKIE_PATH="/shots/",
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        PERMANENT_SESSION_LIFETIME=12 * 3600,
    )
    # Optional extra check on the peer's port (the Linux root-connection gate).
    app.config["TRUSTED_INGRESS"] = lambda _port: True
    if config:
        app.config.update(config)
    if (not app.config["ALLOWED_LOGIN"] or len(app.config["SECRET"]) < 32
            or not app.config["PUBLIC_ORIGIN"].startswith("https://")
            or (app.config["PROXY_TOKEN"] and len(app.config["PROXY_TOKEN"]) < 32)):
        raise RuntimeError("Set RTD_REVIEW_LOGIN, RTD_REVIEW_ORIGIN (https://...) and a "
                           "RTD_REVIEW_SESSION_SECRET of 32+ characters (README.md, \"Service\").")
    app.secret_key = app.config["SECRET"]
    home = Path(app.config["HOME"])
    recent = deque()
    rate_lock = threading.Lock()

    @app.before_request
    def authenticate():
        if (request.remote_addr != "127.0.0.1"
                or not app.config["TRUSTED_INGRESS"](
                    str(request.environ.get("REMOTE_PORT", "")))):
            abort(403)
        if app.config["PROXY_TOKEN"] and not hmac.compare_digest(
                request.headers.get("X-Map-Shots-Proxy", ""), app.config["PROXY_TOKEN"]):
            abort(403)
        login = request.headers.get("Tailscale-User-Login", "")
        if not hmac.compare_digest(login, app.config["ALLOWED_LOGIN"]):
            abort(403)
        g.login = login
        if request.method not in ("GET", "HEAD", "POST", "DELETE"):
            abort(405)
        if request.method in ("POST", "DELETE"):
            if request.headers.get("Origin") != app.config["PUBLIC_ORIGIN"]:
                abort(403)
            if request.headers.get("Sec-Fetch-Site", "same-origin") != "same-origin":
                abort(403)
            token = request.headers.get("X-CSRF-Token", "")
            if not token or not hmac.compare_digest(token, session.get("csrf", "")):
                abort(403)
            with rate_lock:
                now = time.monotonic()
                while recent and recent[0] < now - 60:
                    recent.popleft()
                if len(recent) >= 40:
                    abort(429)
                recent.append(now)

    @app.after_request
    def secure_headers(response):
        response.headers.update({
            "Cache-Control": "private, no-store, max-age=0",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": ("default-src 'none'; img-src 'self' blob:; style-src 'self'; "
                                        "script-src 'self'; connect-src 'self'; base-uri 'none'; "
                                        "form-action 'self'; frame-ancestors 'none'"),
            "Strict-Transport-Security": "max-age=31536000",
        })
        if request.path.startswith("/shots/api/image/") and response.status_code == 200:
            # Image files never change once written; let the phone keep them.
            response.headers["Cache-Control"] = "private, max-age=604800, immutable"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        messages = {403: "Open this page with your own Tailscale account, then reload it.",
                    404: "Not found.",
                    413: "That upload is too large (25 MB per image).",
                    415: "Only PNG, JPEG, WebP, HEIC or GIF images are accepted.",
                    429: "Too many sends in a minute. Wait a moment."}
        return jsonify(error=messages.get(error.code, "Request could not be completed.")), error.code

    @app.errorhandler(shots.ShotsError)
    def shots_error(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(Exception)
    def unexpected_error(error):
        app.logger.error("Map shots request failed (%s)", type(error).__name__)
        return jsonify(error="That could not be saved. Try again."), 500

    @app.get("/")
    def page():
        return send_file(STATIC / "index.html", mimetype="text/html", conditional=False, etag=False)

    @app.get("/shots/")
    def index():
        return redirect(PAGE, 302)

    @app.get("/shots/api/session")
    def new_session():
        if "csrf" not in session:
            session["csrf"] = secrets.token_urlsafe(32)
            session.permanent = True
        return jsonify(csrf=session["csrf"])

    @app.get("/shots/api/items")
    def items():
        by_target = shots.comments_by_target(home)
        mine = [shots.describe_shot(home, p, by_target) for p in reversed(shots.pending_shots(home))]
        mine += [shots.describe_shot(home, p, by_target) for p in shots.done_shots(home)]
        issues = shots.list_issues(home, by_target)
        return jsonify(reviews=shots.list_reviews(home, by_target), shots=mine,
                       issues=issues["issues"], issues_synced=issues["synced"])

    @app.post("/shots/api/items")
    def upload():
        files = request.files.getlist("files")
        if not files or len(files) > MAX_FILES:
            abort(400)
        note = (request.form.get("note") or "").strip()[:shots.MAX_NOTE]
        prepared = []
        for f in files:
            data = f.read(shots.MAX_IMAGE + 1)
            if len(data) > shots.MAX_IMAGE:
                abort(413)
            ext = shots.sniff(data[:16])
            if not ext:
                abort(415)
            prepared.append((data, ext, (f.filename or "")[:200]))
        saved = []
        now = time.time()
        box = shots.inbox(home)
        for i, (data, ext, original) in enumerate(prepared):
            final = box / shots.new_name(ext, now)
            # Metadata first, so the hook never sees an image without its note.
            shots.write_json_atomic(shots.meta_path(final), {
                "note": note, "original": original, "uploaded_by": g.login,
                "uploaded_at": now, "batch_index": i, "batch_size": len(prepared),
            })
            tmp = box / f".tmp-{secrets.token_hex(6)}"
            with open(tmp, "wb") as out:
                out.write(data)
            os.replace(tmp, final)
            saved.append(final.name)
        return jsonify(saved=saved), 201

    @app.delete("/shots/api/items/<name>")
    def delete(name):
        img = shots.inbox(home) / name
        if not shots.SHOT_RE.match(name) or not shots.is_image(img):
            abort(404)
        img.unlink()
        shots.unlink_quiet(shots.meta_path(img), shots.claim_path(home, name))
        return jsonify(deleted=True)

    @app.post("/shots/api/comments")
    def comment():
        if request.mimetype != "application/json":
            abort(415)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            abort(400)
        choice = data.get("choice")
        if choice is not None and not isinstance(choice, str):
            abort(400)
        record = shots.add_comment(home, str(data.get("target", "")), str(data.get("text", "")),
                                   g.login, choice)
        return jsonify(id=record["id"]), 201

    def image_response(path: Path):
        if not shots.is_image(path):
            abort(404)
        return send_file(path, mimetype=shots.MIME.get(path.suffix.lower(), "application/octet-stream"),
                         conditional=False, etag=False)

    @app.get("/shots/api/image/shot/<name>")
    def shot_image(name):
        if not shots.SHOT_RE.match(name):
            abort(404)
        path = shots.find_shot(home, name)
        if not path:
            abort(404)
        return image_response(path)

    @app.get("/shots/api/image/review/<rid>/<name>")
    def review_image(rid, name):
        if not shots.REVIEW_RE.match(rid) or not shots.FILE_RE.match(name):
            abort(404)
        return image_response(shots.reviews_dir(home) / rid / name)

    @app.get("/shots/api/image/issue/<name>")
    def issue_image(name):
        if not shots.ISSUE_IMG_RE.match(name):
            abort(404)
        return image_response(home / "issues" / "img" / name)

    return app


def main():
    from waitress import serve
    port = int(os.environ.get("RTD_REVIEW_PORT", "8796"))
    config = {}
    if os.environ.get("RTD_REVIEW_ROOT_INGRESS") == "1":  # Linux + systemd only
        from ingress import socket_owner, systemd_tcp_table_fd
        table_fd = systemd_tcp_table_fd()
        config["TRUSTED_INGRESS"] = lambda peer: socket_owner(peer, port, table_fd) == 0
    app = create_app(config)
    serve(app, host="127.0.0.1", port=port, threads=4,
          max_request_body_size=MAX_BODY, max_request_header_size=16384,
          channel_timeout=120, clear_untrusted_proxy_headers=True)


if __name__ == "__main__":
    main()
