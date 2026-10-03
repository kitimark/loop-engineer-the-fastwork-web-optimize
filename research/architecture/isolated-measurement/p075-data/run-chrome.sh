#!/bin/sh
# Pilot Chrome slots: FULL then FRZ, each its own shared-lane hold (probe weight, <= 300 s).
WT=<checkout>
S=<scratch>
VF=<main checkout>/.claude/worktrees/agent-a097ffbf8f44a4d14/out/countdown-faces/snap-x1/poc
SS=<main checkout>/.claude/worktrees/agent-a0966ab688224905d/out/cd-strip/snap/st6rb2
C6=<main checkout>/.claude/worktrees/agent-a65f148991747deb7/out/cd-roll-ca/snap/C6
V7=<main checkout>/.claude/worktrees/agent-a65f148991747deb7/out/cd-roll-ca/snap/V7
ARMS="C=-=4606120cf392 C2=-=4606120cf392 Vf=$VF=638b8e03e81c S=$SS=7bf7c4657d21 C6=$C6=5e37af69bcc4 V7=$V7=73dff152e454"
cd "$WT" || exit 1
for MODE in full freeze; do
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-isolated-measure \
    --doing "countdown isolation pilot, Chrome counts, $MODE (no timing)" -- \
    node "$S/chrome-hold.mjs" "$MODE" "$S/pilot-chrome-$MODE.json" 3 $ARMS
  echo "SLOT $MODE EXIT $?"
done
echo EXIT
