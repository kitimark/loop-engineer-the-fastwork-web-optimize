#!/bin/sh
# v11 gates (int-v11), counts and pixels only, nothing timed; each part its own shared chrome-measure hold (Chrome probe
# 300 s, Simulator 300 s; Simulator parts are DEFERRED during a marked phone block). Arms from the immutable snapshot
# out/v11/snap-9b4a829d15a0-62743920fe1a (HASHES 1704db6c4af6): Vc (b8b194b7ff56 / 62743920fe1a), V11 (9b4a829d15a0 /
# 62743920fe1a). Gate scripts are the owners' (credited, used unchanged):
#   px-cm    Chrome screencast pixels at the end-zone morph stops, A = Vc, V = V11 (fixes/v10/gates/cm-px3.mjs, int-v8 /
#            arch-compositor-morph; V13's area)
#   px-hh    Chrome functional + covered pixels at the People title, A = Vc, H = V11 (fixes/people-gpu/gates/hh-chrome.mjs,
#            fix-people-gpu; H1c's area)
#   sim-hh   Simulator rest counts: top, People title covered, page end (fixes/people-gpu/gates/hh-sim.mjs), Vc and V11
#   sim-cm   Simulator end-of-page counts: approach, open, restOpen, close, restClosed (fixes/compositor-morph/gates/cm-sim.mjs
#            --stack 6: forced layouts per phase), one arm per hold
#   sim-cold the same with --cold: the timed open is the first of the page load (c1's and V13's first open), one arm per hold
# Usage (worktree root, in the background): [RUN=-r2] sh fixes/v11/gates.sh [part ...]; logs out/v11/gate-<part>[-<arm>]<RUN>.log
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v11}; W=$(pwd)
S=out/v11/snap-9b4a829d15a0-62743920fe1a
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $S/HASHES.txt)" = 1704db6c4af6 ] && (cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "v11 snapshot changed: refuse"; exit 3; }
A=$W/$S/Vc; V=$W/$S/V11
PARTS=${*:-px-cm px-hh sim-hh sim-cm sim-cold}
chrome() { # chrome <part> <doing> <cmd...>
  G=$1; D=$2; shift 2
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner "$OWNER" --doing "v11 gate: $D (no timing)" -- "$@" > out/v11/gate-$G$RUN.log 2>&1
  echo "$G EXIT $?" | tee -a out/v11/gate-$G$RUN.log
}
sim() { # sim <part> <doing> <cmd...>
  G=$1; D=$2; shift 2
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner "$OWNER" --doing "v11 gate: $D (counts only)" -- \
    node tools/sim.mjs session --functional --owner "$OWNER" -- "$@" > out/v11/gate-$G$RUN.log 2>&1
  echo "$G EXIT $?" | tee -a out/v11/gate-$G$RUN.log
}
for P in $PARTS; do
  case $P in
    px-cm) chrome $P "Chrome pixels, end-of-page morph stops, Vc vs v11" node fixes/v10/gates/cm-px3.mjs --engine chrome --capture screencast --a $A --v $V --label v11-cm --outdir out/v11/px-cm-$(date -u +%H%M) ;;
    px-hh) chrome $P "Chrome pixels + pause check at the People title, Vc vs v11" node fixes/people-gpu/gates/hh-chrome.mjs --a $A --h $V ;;
    sim-hh) sim $P "Simulator rest counts at the People title, Vc and v11" node fixes/people-gpu/gates/hh-sim.mjs --arms $A,$V --label v11 ;;
    sim-cm) for X in Vc V11; do sim $P-$X "Simulator end-of-page counts, $X" node fixes/compositor-morph/gates/cm-sim.mjs --arms $W/$S/$X --stack 6 --label v11-$X; done ;;
    sim-cold) for X in Vc V11; do sim $P-$X "Simulator first-open counts (cold), $X" node fixes/compositor-morph/gates/cm-sim.mjs --arms $W/$S/$X --cold --stack 6 --label v11cold-$X; done ;;
    *) echo "part $P?"; exit 2 ;;
  esac
done
echo "GATES DONE"
