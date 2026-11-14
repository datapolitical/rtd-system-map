"""Command-line side of the RTD map review page (review/README.md).

  shotctl.py list                          pending screenshots, comments and open reviews
  shotctl.py done ID [--note TEXT]         mark a screenshot (file name) or comment/pick (c-...) handled;
                                           the note is shown to Chris as your reply
  shotctl.py publish MANIFEST.json         post a review request (see shots.py for the format)
  shotctl.py ask --title T --ask Q [--text X] IMG...   post a one-item review request from images
  shotctl.py close REVIEW_ID [--note TEXT] close a review request
  shotctl.py release ID                    drop a session's claim so the hook announces it again
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shots  # noqa: E402

PAGE = shots.page_url()


def cmd_list(home: Path) -> None:
    by_target = shots.comments_by_target(home)
    pend = shots.pending_shots(home)
    print(f"Screenshots waiting: {len(pend)}")
    for p in pend:
        d = shots.describe_shot(home, p)
        print(f"  {d['status']:5} {d['received']}  {p}")
        if d["note"]:
            print(f"        note: {d['note']}")
    pc = shots.pending_comments(home)
    print(f"Comments waiting: {len(pc)}")
    for p in pc:
        c = shots.read_json(p)
        if "choice" in c:
            text = f"picked {c['choice']}" + (f" — {c['text'][:200]}" if c.get("text") else "")
            if c.get("previous_choice"):
                text += f" (was {c['previous_choice']})"
        else:
            text = c.get("text", "")[:200]
        print(f"  {p.stem}  on {c.get('target')}: {text}")
    open_reviews = [r for r in shots.list_reviews(home, by_target) if r["status"] != "closed"]
    print(f"Open review requests: {len(open_reviews)}")
    for r in open_reviews:
        n = sum(len(i["comments"]) for s in r["sections"] for i in s["items"]) + len(r["comments"])
        print(f"  {r['id']}  {r['status']:9} {r['created']}  {r['title']}  ({n} comment(s))")
        for label, choices, picked in [("review", r["choices"], r["picked"])] + [
                (f"item {i['id']}", i["choices"], i["picked"]) for s in r["sections"] for i in s["items"]]:
            if choices:
                now = (f"picked {picked['choice']}" + (f" — {picked['text']}" if picked["text"] else "")
                       if picked else "not picked yet")
                print(f"        {label} choices: {' / '.join(choices)}; {now}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    dn = sub.add_parser("done")
    dn.add_argument("ids", nargs="+")
    dn.add_argument("--note", default="")
    pb = sub.add_parser("publish")
    pb.add_argument("manifest")
    ak = sub.add_parser("ask")
    ak.add_argument("--title", required=True)
    ak.add_argument("--ask", required=True, help="what Chris must do or decide, and how to answer")
    ak.add_argument("--text", default="")
    ak.add_argument("images", nargs="+")
    cl = sub.add_parser("close")
    cl.add_argument("review")
    cl.add_argument("--note", default="")
    rl = sub.add_parser("release")
    rl.add_argument("ids", nargs="+")
    args = ap.parse_args()
    home = shots.HOME
    session = os.environ.get("CLAUDE_SESSION_ID", "")
    try:
        if args.cmd == "list":
            cmd_list(home)
        elif args.cmd == "done":
            for i in args.ids:
                print(f"done: {shots.mark_done(home, i, args.note)}")
        elif args.cmd == "publish":
            rid = shots.create_review(home, Path(args.manifest), session)
            print(f"published {rid}: {PAGE}")
        elif args.cmd == "ask":
            rid = shots.quick_review(home, args.title, args.text, [Path(p) for p in args.images], session, args.ask)
            print(f"published {rid}: {PAGE}")
        elif args.cmd == "close":
            shots.close_review(home, args.review, args.note)
            print(f"closed {args.review}")
        else:
            for i in args.ids:
                key = Path(i).name.removesuffix(".json")
                p = shots.claim_path(home, key)
                if p.exists():
                    p.unlink()
                    print(f"released: {key}")
                else:
                    print(f"not claimed: {key}")
    except shots.ShotsError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
