#!/bin/sh
# v10 pixel-gate noise floor (int-v8): em-px with the same build on both sides (A = V = the nolift Try-it build), in one
# shared probe hold per repeat, then nlregion --identical. Residues here are the gate's own noise at that stop.
# Usage (worktree root, in the background, after fixes/v10/chrome.sh made the Try-it dir): sh fixes/v10/aa.sh [repeats]
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}
TRY=out/v10/tryit-nolift-4da641f828bb-a4ed5432f2f7
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $TRY/_app/immutable/nodes/2.DyWL8TcE.js)" = 4da641f828bb ] && [ "$(h $TRY/_app/immutable/assets/2.gBuqKVzi.css)" = a4ed5432f2f7 ] || { echo "$TRY missing or changed: refuse"; exit 3; }
N=${1:-1}; i=1
while [ $i -le $N ]; do
  L=out/v10/chrome-px-aa$i.log
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner "$OWNER" --doing "v10 parity: pixel gate A/A noise floor $i (pixels only)" -- \
    node fixes/v10/gates/em-px.mjs --engine chrome --a $TRY --v $TRY --label tryit-aa$i > $L 2>&1
  echo "px-aa$i EXIT $?" | tee -a $L
  node fixes/v10/nlregion.mjs "$(sed -n 's/^wrote \(.*px\.json\)$/\1/p' $L | tail -1)" --identical | tee -a $L
  i=$((i + 1))
done
