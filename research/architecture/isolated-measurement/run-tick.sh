#!/bin/sh
# P-076 Chrome slots: FULL then FRZ, each its own shared-lane hold (probe weight, <= 300 s). Run from the checkout root.
# Arms: the immutable copies the countdown owners keep in their worktrees' out/ (paths relative to the main checkout).
H=research/architecture/isolated-measurement
M="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
W="$M/.claude/worktrees"
OUT="${ISO_OUT:-out/isolated-measure}/tick"
mkdir -p "$OUT"
ARMS="C=-=4606120cf392 C2=-=4606120cf392 Vf=$W/agent-a097ffbf8f44a4d14/out/countdown-faces/snap-x1/poc=638b8e03e81c S=$W/agent-a0966ab688224905d/out/cd-strip/snap/st6rb2=7bf7c4657d21 C6=$W/agent-a65f148991747deb7/out/cd-roll-ca/snap/C6=5e37af69bcc4 V7=$W/agent-a65f148991747deb7/out/cd-roll-ca/snap/V7=73dff152e454"
for MODE in full freeze; do
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-isolated-measure \
    --doing "countdown per-second check P-076, Chrome counts, $MODE (no timing)" -- \
    node "$H/tick-hold.mjs" "$MODE" "$OUT/pilot-tick-$MODE.json" 3 $ARMS
  echo "SLOT $MODE EXIT $?"
done
echo EXIT
