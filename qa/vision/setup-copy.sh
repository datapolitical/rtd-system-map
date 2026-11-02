#!/bin/bash
# Build the instrumented copy the vision scripts query, and start both servers.
#   bash qa/vision/setup-copy.sh
# 8830 serves the real public/ (load-time measurement); 8831 serves the copy
# with `window.__map = map;` added, so the QA scripts can query the map.
set -e
REPO=/home/chris/code/rtd-v2
D=/home/chris/.hermes/cache/scratch/qa-vision
mkdir -p "$D"
rm -rf "$D/public"
cp -r "$REPO/public" "$D/public"
python3 - "$D/public/js/main.js" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');"
new = "  window.__map = map;\n" + old
assert s.count(old) == 1, "anchor not found exactly once"
open(p, "w").write(s.replace(old, new))
PY
sed "s#path.resolve(import.meta.dirname, '..', '..', 'public')#path.resolve(import.meta.dirname, 'public')#" \
  "$REPO/qa/scripts/serve.mjs" > "$D/serve-copy.mjs"
for p in $(pgrep -f "$D/serve-copy.mjs" || true); do kill "$p" 2>/dev/null || true; done
PORT=8830 nohup node "$REPO/qa/scripts/serve.mjs" > "$D/serve-8830.log" 2>&1 &
echo "8830 pid $!"
PORT=8831 nohup node "$D/serve-copy.mjs" > "$D/serve-8831.log" 2>&1 &
echo "8831 pid $!"
sleep 1
curl -s -o /dev/null -w "8830=%{http_code} " http://localhost:8830/
curl -s -o /dev/null -w "8831=%{http_code}\n" http://localhost:8831/
curl -s http://localhost:8831/js/main.js | grep -c "__map = map"
