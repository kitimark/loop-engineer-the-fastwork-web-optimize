#!/bin/sh
# morph-scroll rev 4 mechanism checks in one shared-lane hold: Simulator settle (rev 4 + rev 3 for the snap contrast),
# then Chrome touch hold/release. Run from the worktree root:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- sh fixes/morph-scroll/settle-checks.sh
S=out/snapshots
REV4=$(ls -d "$PWD/$S"/${MS_NEW:-ms-5372c2d68c7d})
REV3=$(ls -d "$PWD/$S"/${MS_OLD:-ms-d661831b8797})
node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/morph-scroll/settle-sim.mjs --snap "$REV4,$REV3"
echo "SIM EXIT $?"
node fixes/morph-scroll/settle-chrome.mjs --snap "$REV4"
echo "CHROME EXIT $?"
