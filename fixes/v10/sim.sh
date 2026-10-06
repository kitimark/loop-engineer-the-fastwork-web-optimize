#!/bin/sh
# v10 Simulator parity (int-v8): each part in its own shared simulator hold (300 s cap, functional session; nothing timed;
# DEFERRED during a marked phone block, then it starts in the next window). Logs in out/v10/sim-<part>.log.
#   px-nl     em-px --engine sim A = N, V = V (v10 pre-nolift / with nolift): nlregion (inside the earn button only)
#   px-tryit  em-px --engine sim A = the nolift Try-it build, V = v10: nlregion --identical (A/A noise: see README)
#   cnt-a     em-sim counts on V, N, the measured build
#   cnt-b     em-sim counts on main 1b2eecc66011, v9-final 647c9ef2b1e2
# Usage (worktree root, in the background, after fixes/v10/chrome.sh made the Try-it dir): sh fixes/v10/sim.sh [part ...]
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}
W=$(pwd)
S=out/v10/snap-f5068db34a32-a4ed5432f2f7; MEAS=out/emp1v9f/snap-4da641f828bb; V9F=out/emv9f/snap-a6426953727a
TRY=out/v10/tryit-nolift-4da641f828bb-a4ed5432f2f7
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $S/HASHES.txt)" = 0f91ea014cb3 ] && (cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "v10 snapshot changed: refuse"; exit 3; }
[ "$(h $TRY/_app/immutable/nodes/2.DyWL8TcE.js)" = 4da641f828bb ] && [ "$(h $TRY/_app/immutable/assets/2.gBuqKVzi.css)" = a4ed5432f2f7 ] || { echo "$TRY missing or changed: refuse"; exit 3; }
PARTS=${*:-px-nl px-tryit cnt-a cnt-b}
hold() { # hold <part> <doing> <cmd...>
  P=$1; D=$2; shift 2
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner "$OWNER" --doing "v10 parity: Simulator $D (counts and pixels only)" -- \
    node tools/sim.mjs session --functional --owner "$OWNER" -- "$@" > out/v10/sim-$P.log 2>&1
  echo "$P EXIT $?" | tee -a out/v10/sim-$P.log
}
pxjson() { sed -n 's/^wrote \(.*px\.json\)$/\1/p' out/v10/sim-$1.log | tail -1; }
for P in $PARTS; do
  case $P in
    px-nl) hold $P "pixels nolift on v10" node fixes/v10/gates/em-px.mjs --engine sim --a $S/N --v $S/V --label sim-v10-nl
      node fixes/v10/nlregion.mjs "$(pxjson $P)" | tee -a out/v10/sim-$P.log ;;
    px-tryit) hold $P "pixels v10 vs nolift Try-it" node fixes/v10/gates/em-px.mjs --engine sim --a $TRY --v $S/V --label sim-v10-vs-tryit
      node fixes/v10/nlregion.mjs "$(pxjson $P)" --identical | tee -a out/v10/sim-$P.log ;;
    cnt-a) hold $P "counts v10, pre-nolift, measured" node fixes/v10/em-sim.mjs --arms "$W/$S/V,$W/$S/N,$W/$MEAS/V" --label v10-a ;;
    cnt-b) hold $P "counts main, v9-final" node fixes/v10/em-sim.mjs --arms "$W/$S/C,$W/$V9F/C" --label v10-b ;;
    *) echo "part $P?"; exit 2 ;;
  esac
done
