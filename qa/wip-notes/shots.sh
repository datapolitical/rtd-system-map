#!/bin/bash
# usage: shots.sh build lat lon zoom out [w h s theme]
cd /srv/projects/rtd-system-map-wt/rules-bus
flock -w 3000 /srv/projects/rtd-system-map-wt/.scratch/heavy.lock timeout 900 nice -n 10 env NODE_OPTIONS=--max-old-space-size=4096 node qa/.scratch/draw.mjs "$@"
