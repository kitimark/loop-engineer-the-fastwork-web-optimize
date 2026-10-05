#!/bin/sh
# T-194 per-writer ablation (lead GO, 2026-10-05 ~14:50Z; probe, OBSERVED, no card). Runs inside a Simulator session:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
#     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- sh fixes/morph-scroll/t194/run-abl.sh
# Arms on v9.1d (fixes/hp-base/overlay, 941aa13e5bdf): C1, countdown strips out of layout, image src swaps blocked, script
# accent out of layout, avatar carousel out of layout, deck contain: strict with its height, C2. Swipe 0 -> 2000.
cd "$(dirname "$0")/../../.." || exit 2
W=$(pwd); O=$W/fixes/hp-base/overlay; T=$W/fixes/morph-scroll/t194
exec node fixes/morph-scroll/t194/swipe-sim.mjs --to 2000 --labels C1,cd,img,accent,avatars,strict,C2 \
  --snap "$O,$O@$T/abl-countdown.css,$O@$T/abl-img.js,$O@$T/abl-accent.css,$O@$T/abl-avatars.css,$O@$T/abl-strict-deck.css,$O"
