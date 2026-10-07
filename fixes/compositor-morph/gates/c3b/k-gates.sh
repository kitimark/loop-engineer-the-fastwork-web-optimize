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
  navy)
    # c3b-d (a): the closed bar's items near the end, C vs $K (default the landed c3b-a + K6), Chrome 430x775/815,
    # 375x775, 640x775, then the Simulator
    K=${K:-out/cm/c3bk6}
    for WH in 430x775 430x815 375x775; do
      $LK --weight probe --doing "c3b-d: bar items near the end, Chrome $WH" -- node $G/navy.mjs --engine chrome --w ${WH%x*} --h ${WH#*x} C=out/cm/snap160/C V=$K > $L/navy-chrome-$WH.log 2>&1
    done
    $LK --weight simulator --doing "c3b-d: bar items near the end, Simulator" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/navy.mjs --engine sim C=out/cm/snap160/C V=$K > $L/navy-sim.log 2>&1
    echo "EXIT $?" ;;
  c3bd)
    # c3b-d (a) options against v14 (A=out/cm/snap163/V): rects (navy) and the T2 look over the open (pre-look, touch
    # held), Chrome 775 and the Simulator; K=out/cm/c3bd1|c3bd2
    # CA, not A: line 9 already set A to v13 (snap160/V), so ${A:-...} kept v13 (first c3bd run, 12:0xZ, compared v13)
    A=${CA:-out/cm/snap163/V}; MS=${MS:-0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1}
    $LK --weight probe --doing "c3b-d: bar rects, $(basename $K)" -- node $G/navy.mjs --engine chrome --w 430 --h 775 A=$A V=$K > $L/c3bd-navy-$(basename $K).log 2>&1
    D=out/cm/prelook-$(basename $K)-chrome775
    $LK --weight probe --doing "c3b-d look, Chrome 775, A V" -- node $G/pre-look.mjs --engine chrome --touch --ms $MS --a $A --v $K --h 775 --outdir $D --arms A,V > $L/c3bd-look-$(basename $K)-chrome-1.log 2>&1
    $LK --weight probe --doing "c3b-d look, Chrome 775, A2 V2" -- node $G/pre-look.mjs --engine chrome --touch --ms $MS --a $A --v $K --h 775 --outdir $D --arms A2,V2 > $L/c3bd-look-$(basename $K)-chrome-2.log 2>&1
    D=out/cm/prelook-$(basename $K)-sim
    $LK --weight simulator --doing "c3b-d look, Simulator, A V" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A,V > $L/c3bd-look-$(basename $K)-sim-1.log 2>&1
    $LK --weight simulator --doing "c3b-d look, Simulator, A2 V2" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A2,V2 > $L/c3bd-look-$(basename $K)-sim-2.log 2>&1
    echo "EXIT $?" ;;
  c3be)
    # c3b-e (no pre at m 0 after a close) against v14: opens (pass O: the first open with pre, opens after closes) and the
    # Simulator look at m 0 after a close (0c, 0c2: v14 keeps pre there, c3b-e is closed without it); Chrome has no pre
    # (WebKit-only gate), so its look is v14's by construction
    # CK, not K: line 9 already set K (c3bk1), as with A in c3bd (12:4xZ: the first c3be opens run measured c3bk1)
    A=${CA:-out/cm/snap163/V}; K=${CK:-out/cm/c3be}
    $LK --weight simulator --doing "c3b-e: opens, v14 and the fix" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c "node tools/sim.mjs wda start && node $G/k-sim.mjs V14=$A C3BE=$K --pass O" > $L/c3be-opens.log 2>&1
    D=out/cm/prelook-c3be-sim; MS=${MS:--0.5,0,1,0c,1b,0c2}
    $LK --weight simulator --doing "c3b-e look, Simulator, A V" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A,V > $L/c3be-look-sim-1.log 2>&1
    $LK --weight simulator --doing "c3b-e look, Simulator, A2 V2" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A2,V2 > $L/c3be-look-sim-2.log 2>&1
    echo "EXIT $?" ;;
  corner)
    # c3b-d (b): the card's corners and edges over the first 30 % of the open, v14 (A) against C (V: the build before CM,
    # today's own nav geometry), Simulator device pixels, held touch, 0.02 steps; read by corner-read.py
    A=${CA:-out/cm/snap163/V}; K=${CK:-out/cm/snap163/C}; D=out/cm/corner-sim; MS=${MS:-0,0.02,0.04,0.06,0.08,0.1,0.12,0.14,0.16,0.18,0.2,0.22,0.24,0.26,0.28,0.3}
    $LK --weight simulator --doing "corner check, Simulator, A V" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A,V > $L/corner-sim-1.log 2>&1
    $LK --weight simulator --doing "corner check, Simulator, A2 V2" -- node tools/sim.mjs session --functional --owner arch-compositor-morph -- node $G/pre-look.mjs --engine sim --touch --ms $MS --a $A --v $K --outdir $D --arms A2,V2 > $L/corner-sim-2.log 2>&1
    echo "EXIT $?" ;;
  *) echo "usage: k-gates.sh look-chrome 775|815 | look-sim | sim-cost | sim-runs | sim-k8 | sim-k8p"; exit 2 ;;
esac
