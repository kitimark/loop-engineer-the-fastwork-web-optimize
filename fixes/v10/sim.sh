#!/bin/sh
# v10 Simulator parity (int-v8): shared simulator holds, each capped at MAXS s (default 180; lead 2026-10-06), functional
# session, nothing timed; DEFERRED during a marked phone block. Pixels run in stop groups (fixes/v10/px-split.sh), counts
# one arm per hold. Logs out/v10/sim-*.log.
#   px-nl     A = N, V = V (v10 pre-nolift / with nolift): nlregion (inside the earn button only)
#   px-tryit  A = the nolift Try-it build, V = v10: nlregion --identical
#   aa        A = V = v10: the Simulator A/A (noise floor), nlregion --identical
#   cnt-<x>   em-sim counts: v10, n (pre-nolift), meas (4da641f828bb), 1b2e (main), 647c (v9-final)
# Usage (worktree root, in the background, after fixes/v10/chrome.sh made the Try-it dir): sh fixes/v10/sim.sh [part ...]
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}; MAXS=${MAXS:-180}; export MAXS
W=$(pwd)
S=out/v10/snap-f5068db34a32-a4ed5432f2f7; MEAS=out/emp1v9f/snap-4da641f828bb; V9F=out/emv9f/snap-a6426953727a
TRY=out/v10/tryit-nolift-4da641f828bb-a4ed5432f2f7
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $S/HASHES.txt)" = 0f91ea014cb3 ] && (cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "v10 snapshot changed: refuse"; exit 3; }
[ "$(h $TRY/_app/immutable/nodes/2.DyWL8TcE.js)" = 4da641f828bb ] && [ "$(h $TRY/_app/immutable/assets/2.gBuqKVzi.css)" = a4ed5432f2f7 ] || { echo "$TRY missing or changed: refuse"; exit 3; }
PARTS=${*:-px-nl px-tryit aa cnt-v10 cnt-n cnt-meas cnt-1b2e cnt-647c}
cnt() { # cnt <part> <dir> <label>
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds $MAXS --owner "$OWNER" --doing "v10 parity: Simulator counts $3 (counts only)" -- \
    node tools/sim.mjs session --functional --owner "$OWNER" -- node fixes/v10/em-sim.mjs --arms "$W/$2" --label $3 > out/v10/sim-$1.log 2>&1
  echo "$1 EXIT $?" | tee -a out/v10/sim-$1.log
}
for P in $PARTS; do
  case $P in
    px-nl) sh fixes/v10/px-split.sh sim $S/N $S/V v10-nl ;;
    px-tryit) sh fixes/v10/px-split.sh sim $TRY $S/V v10-vs-tryit --identical ;;
    aa) sh fixes/v10/px-split.sh sim $S/V $S/V aa-v10 --identical ;;
    cnt-v10) cnt $P $S/V v10 ;;
    cnt-n) cnt $P $S/N v10n ;;
    cnt-meas) cnt $P $MEAS/V meas ;;
    cnt-1b2e) cnt $P $S/C 1b2e ;;
    cnt-647c) cnt $P $V9F/C 647c ;;
    *) echo "part $P?"; exit 2 ;;
  esac
done
echo "SIM DONE"
