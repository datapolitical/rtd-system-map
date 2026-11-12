#!/bin/bash
# one heavy job at a time across the machine
exec flock -w 3000 /srv/projects/rtd-system-map-wt/.scratch/heavy.lock timeout 1500 nice -n 10 env NODE_OPTIONS=--max-old-space-size=4096 node "$@"
