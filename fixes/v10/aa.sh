#!/bin/sh
# v10 pixel-gate noise floor (int-v8): em-px with the same build on both sides (A = V = <dir>), one shared hold per
# repeat, then nlregion --identical. Residues here are the gate's own noise at that stop.
#   sh fixes/v10/aa.sh [repeats] [dir] [label] [chrome|sim]
#   defaults: 1, the nolift Try-it build, tryit, chrome. Chrome: a probe hold; sim: a simulator hold + functional session
#   (DEFERRED during a marked phone block). Logs out/v10/<engine>-px-aa-<label><i>.log (the first runs, before the
#   label existed, are out/v10/chrome-px-aa1.log / -aa2.log for the Try-it build).
# Usage (worktree root, in the background, after fixes/v10/chrome.sh made the Try-it dir).
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}
N=${1:-1}; DIR=${2:-out/v10/tryit-nolift-4da641f828bb-a4ed5432f2f7}; LAB=${3:-tryit}; ENG=${4:-chrome}
h() { shasum -a 256 "$1" | cut -c1-12; }
[ -f $DIR/_app/immutable/nodes/2.DyWL8TcE.js ] || { echo "$DIR: no build: refuse"; exit 3; }
echo "A/A on $DIR: JS $(h $DIR/_app/immutable/nodes/2.DyWL8TcE.js) CSS $(h $DIR/_app/immutable/assets/2.gBuqKVzi.css), $ENG, $N repeats"
i=1
while [ $i -le $N ]; do
  L=out/v10/$ENG-px-aa-$LAB$i.log
  if [ $ENG = sim ]; then
    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner "$OWNER" --doing "v10 parity: Simulator pixel gate A/A $LAB $i (pixels only)" -- \
      node tools/sim.mjs session --functional --owner "$OWNER" -- node fixes/v10/gates/em-px.mjs --engine sim --a $DIR --v $DIR --label sim-aa-$LAB$i > $L 2>&1
  else
    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner "$OWNER" --doing "v10 parity: pixel gate A/A $LAB $i (pixels only)" -- \
      node fixes/v10/gates/em-px.mjs --engine chrome --a $DIR --v $DIR --label aa-$LAB$i > $L 2>&1
  fi
  echo "$ENG px-aa-$LAB$i EXIT $?" | tee -a $L
  node fixes/v10/nlregion.mjs "$(sed -n 's/^wrote \(.*px\.json\)$/\1/p' $L | tail -1)" --identical | tee -a $L
  i=$((i + 1))
done
