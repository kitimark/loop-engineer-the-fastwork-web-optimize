#!/bin/sh
# c3b-K gates (arch-compositor-morph): v13 (out/cm/snap160/V) against the frozen K (out/cm/c3bk1), counts/pixels only.
# Each part takes its own shared lock jobs (<= 300 s each); run the script itself in the background, not under a lock.
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh look-chrome 775|815
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh look-sim
#   sh fixes/compositor-morph/gates/c3b/k-gates.sh sim-cost
#   A=<base> K=<K> sh fixes/compositor-morph/gates/c3b/k-gates.sh sim-runs
#   K=<frozen K dir> picks the build (default out/cm/c3bk1)
cd "$(dirname "$0")/../../../.." || exit 2
G=fixes/compositor-morph/gates/c3b; A=${A:-out/cm/snap160/V}; K=${K:-out/cm/c3bk1}; L=out/cm/c3bk-gates; mkdir -p $L
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
  sim-runs)
    # open-frame composite, rest and layers: K (OAL once, then O twice), A (OAL once, then O twice), C (O twice)
    S="node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c"
    $LK --weight simulator --doing "c3b-K Simulator runs: K once" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K=$K" > $L/runs-$(basename $K)-oal.log 2>&1
    $LK --weight simulator --doing "c3b-K Simulator runs: base once" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs A=$A" > $L/runs-$(basename $A)-oal.log 2>&1
    $LK --weight simulator --doing "c3b-K Simulator runs: K opens x2" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K2=$K K3=$K --pass O" > $L/runs-$(basename $K)-o2.log 2>&1
    $LK --weight simulator --doing "c3b-K Simulator runs: base opens x2" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs A2=$A A3=$A --pass O" > $L/runs-$(basename $A)-o2.log 2>&1
    $LK --weight simulator --doing "c3b-K Simulator runs: C opens x2" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs C2=out/cm/snap160/C C3=out/cm/snap160/C --pass O" > $L/runs-C-o2.log 2>&1
    echo "EXIT $?" ;;
  sim-k8)
    # K8 (pre ends after 3 s of rest): rest segments against K6 and the base; opens after long rests (P) x3 against
    # the base; normal opens (O) x3; K7 (K6 + paused clipper animations under pre) rest, for attribution
    S="node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c"
    $LK --weight simulator --doing "c3b-K8 Simulator: rest K8, K6, base" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8=$K K6=out/cm/c3bk6 A=$A --pass A" > $L/k8-rest.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 1" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8=$K A=$A --pass P" > $L/k8-p1.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 2" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs A=$A K8=$K --pass P" > $L/k8-p2.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 3" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8=$K A=$A --pass P" > $L/k8-p3.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: opens x3" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8a=$K K8b=$K K8c=$K --pass O" > $L/k8-o3.log 2>&1
    $LK --weight simulator --doing "c3b-K7 Simulator: rest, paused animations" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K7=out/cm/c3bk7 --pass A" > $L/k7-rest.log 2>&1
    echo "EXIT $?" ;;
  sim-k8p)
    # the long-rest opens again (the first sim-k8 ran pass P without a WDA session)
    S="node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c"
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 1" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8=$K A=$A --pass P" > $L/k8-p1.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 2" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs A=$A K8=$K --pass P" > $L/k8-p2.log 2>&1
    $LK --weight simulator --doing "c3b-K8 Simulator: long-rest opens 3" -- $S "node tools/sim.mjs wda start && node $G/k-sim.mjs K8=$K A=$A --pass P" > $L/k8-p3.log 2>&1
    echo "EXIT $?" ;;
  *) echo "usage: k-gates.sh look-chrome 775|815 | look-sim | sim-cost | sim-runs | sim-k8 | sim-k8p"; exit 2 ;;
esac
