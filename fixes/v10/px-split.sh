#!/bin/sh
# v10 pixel gate in short holds (int-v8; lead 2026-10-06: during phone blocks every shared job --max-seconds <= 180).
# Runs fixes/v10/gates/em-px.mjs once per stop group, each in its own shared hold, then nlregion per group. Every
# group also gets em-px's fixed stops pre, up0 and post. The scroll path differs from a full run (fewer up stops), but
# it is the same for all four loads of a group, so A~V and the A/A pairs compare as before.
#   g1  up 0.02 0.05 0.1 0.15        g2  up 0.19 0.25 0.4 0.5
#   g3  up 0.54 0.6 0.8 0.95         g4  up 0.99 1, down 0.5 0.1 0
#   halves (Simulator): g1a g1b g2a g2b g3a g3b (two up stops each), g4a up 0.99 1, g4b up 1 down 0.5, g4c up 1 down 0.1 0
# Usage (worktree root, in the background):
#   sh fixes/v10/px-split.sh <chrome|sim> <A dir> <V dir> <label> [--identical] [g1 g2 g3 g4]
# Logs out/v10/<engine>-px-<label>-<g>.log; MAXS (default 180) caps each hold.
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}; MAXS=${MAXS:-180}
ENG=$1; A=$2; V=$3; LAB=$4; shift 4
ID=""; [ "$1" = --identical ] && { ID=--identical; shift; }
GRPS=${*:-g1 g2 g3 g4}
for G in $GRPS; do
  case $G in
    g1) MS=0.02,0.05,0.1,0.15; DN="" ;;
    g2) MS=0.19,0.25,0.4,0.5; DN="" ;;
    g3) MS=0.54,0.6,0.8,0.95; DN="" ;;
    g4) MS=0.99,1; DN=0.5,0.1,0 ;;
    # half groups for the Simulator: a cold boot plus the quiet wait leaves ~85 s of a 180 s hold, three loads' worth
    g1a) MS=0.02,0.05; DN="" ;;  g1b) MS=0.1,0.15; DN="" ;;
    g2a) MS=0.19,0.25; DN="" ;;  g2b) MS=0.4,0.5; DN="" ;;
    g3a) MS=0.54,0.6; DN="" ;;   g3b) MS=0.8,0.95; DN="" ;;
    g4a) MS=0.99,1; DN="" ;;     g4b) MS=1; DN=0.5 ;;     g4c) MS=1; DN=0.1,0 ;;
    *) echo "group $G?"; exit 2 ;;
  esac
  L=out/v10/$ENG-px-$LAB-$G.log
  if [ $ENG = sim ]; then
    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds $MAXS --owner "$OWNER" --doing "v10 parity: Simulator pixels $LAB $G (pixels only)" -- \
      node tools/sim.mjs session --functional --owner "$OWNER" -- node fixes/v10/gates/em-px.mjs --engine sim --a $A --v $V --label sim-$LAB-$G --ms $MS --down "$DN" > $L 2>&1
  else
    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds $MAXS --owner "$OWNER" --doing "v10 parity: pixels $LAB $G (pixels only)" -- \
      node fixes/v10/gates/em-px.mjs --engine chrome --a $A --v $V --label $LAB-$G --ms $MS --down "$DN" > $L 2>&1
  fi
  echo "$ENG px-$LAB-$G EXIT $?" | tee -a $L
  J=$(sed -n 's/^wrote \(.*px\.json\)$/\1/p' $L | tail -1)
  [ -n "$J" ] && node fixes/v10/nlregion.mjs "$J" $ID | tee -a $L
done
