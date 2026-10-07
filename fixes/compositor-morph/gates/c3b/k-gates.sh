#!/bin/sh
# c3b-K gates (arch-compositor-morph): v13 (out/cm/snap160/V) against the frozen K (out/cm/c3bk1), counts/pixels only.
# Each part takes its own shared lock jobs (<= 300 s each); run the script itself in the background, not under a lock.
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh look-chrome 775|815
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh look-sim
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh sim-cost
#   K=<frozen K dir> picks the build (default out/cm/c3bk1)
cd "$(dirname "$0")/../../../.." || exit 2
G=fixes/compositor-morph/gates/c3b; A=out/cm/snap160/V; K=${K:-out/cm/c3bk1}; L=out/cm/c3bk-gates; mkdir -p $L
LK="node tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner arch-compositor-morph"
case "$1" in
  look-chrome)
    D=out/cm/prelook-$(basename $K)-chrome$2
    $LK --weight probe --doing "c3b-K look gate, Chrome $2, loads A V" -- node $G/pre-look.mjs --engine chrome --a $A --v $K --h $2 --outdir $D --arms A,V > $L/look-$(basename $K)-chrome$2-1.log 2>&1
    $LK --weight probe --doing "c3b-K look gate, Chrome $2, loads A2 V2" -- node $G/pre-look.mjs --engine chrome --a $A --v $K --h $2 --outdir $D --arms A2,V2 > $L/look-$(basename $K)-chrome$2-2.log 2>&1
    echo "EXIT $?" ;;
  look-sim)
    D=out/cm/prelook-$(basename $K)-sim
    $LK --weight simulator --doing "c3b-K look gate, Simulator, loads A V" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --a $A --v $K --outdir $D --arms A,V > $L/look-$(basename $K)-sim-1.log 2>&1
    $LK --weight simulator --doing "c3b-K look gate, Simulator, loads A2 V2" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --a $A --v $K --outdir $D --arms A2,V2 > $L/look-$(basename $K)-sim-2.log 2>&1
    echo "EXIT $?" ;;
  sim-cost)
    # one Simulator session per arm (each about 120-150 s): v13, then K
    $LK --weight simulator --doing "c3b-K Simulator cost probe, v13" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c "node tools/sim.mjs wda start && node $G/k-sim.mjs V13=$A" > $L/ksim-v13.log 2>&1
    $LK --weight simulator --doing "c3b-K Simulator cost probe, K" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c "node tools/sim.mjs wda start && node $G/k-sim.mjs K=$K" > $L/ksim-$(basename $K).log 2>&1
    echo "EXIT $?" ;;
  *) echo "usage: k-gates.sh look-chrome 775|815 | look-sim"; exit 2 ;;
esac
