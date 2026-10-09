#!/bin/sh
# g0.0l pixel attribution (round 1 found consistent resampling-level diffs in the deck photos, desktop y 900 0.60 %):
# Chrome desktop at the deck stops, C (g0.0k) against N = g0.0l without decode() (eager only) and E = g0.0l without the
# eager switch (decode only), from out/g0-0l/snapx (made by a scratch script from out/g0-0l/snap/V; not committed),
# then the Simulator re-run with the carousel's sliding state per stop. Shared slots, pixels only.
# usage: sh fixes/g0-0l/gates/run-attr.sh > out/g0-0l/gates-attr.log 2>&1   (background)
cd "$(dirname "$0")/../../.." || exit 2
O=fix-scrollcb-g0
L() { node tools/lock.mjs run chrome-measure --shared --weight "$1" --max-seconds 300 --owner $O --doing "g0.0l gates: $2" -- sh -c "$3"; echo "STEP $2 exit $?"; }
L probe "desktop photos: C vs V without decode" "PX_SNAP=out/g0-0l/snapx PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=900,1300 node fixes/g0-0l/gates/px-chrome.mjs desktop A=C,V=N"
L probe "desktop photos: C vs V without eager" "PX_SNAP=out/g0-0l/snapx PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=900,1300 node fixes/g0-0l/gates/px-chrome.mjs desktop A=C,V=E"
L probe "desktop photos: C vs V" "PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=900,1300 node fixes/g0-0l/gates/px-chrome.mjs desktop A=C,V=V"
echo EXIT 0
