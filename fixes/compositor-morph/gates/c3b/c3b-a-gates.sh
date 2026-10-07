#!/bin/sh
# c3b-a gates (arch-compositor-morph): v13 (out/cm/snap160/V) against the frozen c3b-a (out/cm/c3ba), no timing verdicts.
#   part chrome: node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-compositor-morph -- sh fixes/compositor-morph/gates/c3b/c3b-a-gates.sh chrome
#   part snap:   (same as chrome, with "snap": the chrome part alone runs about 280 s, so the settle check has its own job)
#   part sim:    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh fixes/compositor-morph/gates/c3b/c3b-a-gates.sh sim
cd "$(dirname "$0")/../../../.." || exit 2
G=fixes/compositor-morph/gates/c3b; A=out/cm/snap160/V; B=out/cm/c3ba; L=out/cm/c3ba-gates; mkdir -p $L
case "$1" in
  chrome)
    node $G/settle-css.mjs --arms A=$A,B=$B --h 775 > $L/settle-775.log 2>&1
    node $G/settle-css.mjs --arms A=$A,B=$B --h 815 > $L/settle-815.log 2>&1
    node $G/settle-css.mjs --arms A=$A,B=$B --h 775 --reduce > $L/settle-775-reduce.log 2>&1
    node $G/pf-io.mjs --arms A=$A,B=$B --h 775 > $L/pfio-775.log 2>&1
    node $G/pf-io.mjs --arms B=$B --h 815 > $L/pfio-815.log 2>&1
    grep -h '^wrote' $L/settle-775.log $L/settle-815.log $L/settle-775-reduce.log | sed 's/^wrote //' | while read f; do node $G/settle-read.mjs "$f"; done
    grep -h '^== \|DIFF' $L/pfio-775.log $L/pfio-815.log ;;
  snap)
    node $G/settle-snap.mjs --arms A=$A,B=$B --h 775 > $L/snap-775.log 2>&1
    grep -h '^== ' $L/snap-775.log ;;
  sim)
    node tools/sim.mjs wda start > $L/wda.log 2>&1 || exit 3
    node $G/timer-open.mjs V13=$A C3BA=$B > $L/timer-open.log 2>&1
    node $G/pf-io.mjs --arms B=$B --sim > $L/pfio-sim.log 2>&1
    node $G/settle-css.mjs --arms A=$A,B=$B --sim > $L/settle-sim.log 2>&1
    grep -h '^wrote' $L/settle-sim.log | sed 's/^wrote //' | while read f; do node $G/settle-read.mjs "$f"; done
    grep -h '^V13\|^C3BA\|^== ' $L/timer-open.log $L/pfio-sim.log ;;
  *) echo "usage: sh fixes/compositor-morph/gates/c3b/c3b-a-gates.sh chrome|snap|sim"; exit 2 ;;
esac
