#!/bin/sh
# i219-hydrate: the probe holds, each its own shared probe hold of at most 180 s (phone block P-152 runs; nothing timed).
#   cost  hydrate-probe.mjs cost C,F,C,F   (load cost; trace-load.mjs / frames.mjs read it offline)
#   dom   hydrate-probe.mjs dom C,F,C2,F2  (DOM serialization + whole-page frozen shots, A = C, V = F)
#   g1-g4 em-px.mjs (int-v8's v10 end-zone gate, 20 stops in four groups as fixes/v10/px-split.sh), A = C, V = F
# Usage (worktree root, in the background): sh fixes/i219-hydrate/probe/run.sh [cost dom g1 g2 g3 g4]
cd "$(dirname "$0")/../../.." || exit 2
OWNER=fix-i219-hydrate; C=out/i219/C; F=fixes/i219-hydrate/overlay
hold() { # hold <name> <doing> <cmd...>
  P=$1; D=$2; shift 2
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner $OWNER --doing "I-219: $D (counts and pixels only)" -- "$@" > out/i219/$P.log 2>&1
  echo "$P EXIT $?" | tee -a out/i219/$P.log
}
for P in ${*:-cost dom g1 g2 g3 g4}; do
  case $P in
    cost) hold $P "load cost C/F" node fixes/i219-hydrate/probe/hydrate-probe.mjs cost --builds C,F,C,F ;;
    dom) hold $P "DOM and page pixels C/F" node fixes/i219-hydrate/probe/hydrate-probe.mjs dom ;;
    g1) hold px-$P "end-zone pixels $P" node fixes/i219-hydrate/probe/em-px.mjs --engine chrome --a $C --v $F --label i219-$P --ms 0.02,0.05,0.1,0.15 --down "" ;;
    g2) hold px-$P "end-zone pixels $P" node fixes/i219-hydrate/probe/em-px.mjs --engine chrome --a $C --v $F --label i219-$P --ms 0.19,0.25,0.4,0.5 --down "" ;;
    g3) hold px-$P "end-zone pixels $P" node fixes/i219-hydrate/probe/em-px.mjs --engine chrome --a $C --v $F --label i219-$P --ms 0.54,0.6,0.8,0.95 --down "" ;;
    g4) hold px-$P "end-zone pixels $P" node fixes/i219-hydrate/probe/em-px.mjs --engine chrome --a $C --v $F --label i219-$P --ms 0.99,1 --down 0.5,0.1,0 ;;
    *) echo "part $P?"; exit 2 ;;
  esac
done
