#!/bin/sh
WT=<checkout>
S=<scratch>
VF=<main checkout>/.claude/worktrees/agent-a097ffbf8f44a4d14/out/countdown-faces/snap-x1/poc
C6=<main checkout>/.claude/worktrees/agent-a65f148991747deb7/out/cd-roll-ca/snap/C6
V7=<main checkout>/.claude/worktrees/agent-a65f148991747deb7/out/cd-roll-ca/snap/V7
cd "$WT" || exit 1
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-isolated-measure \
  --doing "countdown isolation pilot, Simulator counts (no timing)" -- \
  node tools/sim.mjs session --functional --owner arch-isolated-measure -- \
  node "$S/pilot-sim.mjs" "$S/pilot-sim.json" 2 "C=-=4606120cf392" "Vf=$VF=638b8e03e81c" "C6=$C6=5e37af69bcc4" "V7=$V7=73dff152e454"
echo "EXIT $?"
