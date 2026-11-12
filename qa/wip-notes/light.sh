#!/bin/bash
# style-only scripts (no model.zoom, no tiles): about 2 s and 300 MB, so no lock
exec timeout 300 nice -n 10 env NODE_OPTIONS=--max-old-space-size=2048 node "$@"
