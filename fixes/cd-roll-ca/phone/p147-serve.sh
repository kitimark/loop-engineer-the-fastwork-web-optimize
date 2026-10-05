#!/bin/sh
# P-147 (PHONE TICKET P-147 in fixes/cd-roll-ca/README.md), rev 1.1: serve one pin set's immutable snapshot copies.
#   set A = out/p147/snap:  C = v9-final + rev 7d JS 1b2eecc66011, V = C + the P-097 delta JS 2cfd990c788d (CSS e1359ab9994a)
#   set B = out/p147/snapB: C = v9.2 (= v9.1d) JS 941aa13e5bdf, V = C + the same delta JS 48230d02bbae (CSS f1997edf5309)
#   (HASHES.txt in each)
# on plain http (I-003), --port 0 (a fresh OS port per start, I-131), latency 150, vendors local. A copy of
# serve-snap.sh with only the folder, the arms and these lines changed. Nothing here prints the LAN address.
#   sh fixes/cd-roll-ca/phone/p147-serve.sh A|B        # start C and V of that set, check the served hashes, print ports
#   sh fixes/cd-roll-ca/phone/p147-serve.sh A|B stop   # stop them
cd "$(dirname "$0")/../../.." || exit 2
case $1 in A) S=out/p147/snap ;; B) S=out/p147/snapB ;; *) echo "usage: p147-serve.sh A|B [stop]"; exit 2 ;; esac
ARMS="C V"
if [ "$2" = stop ]; then
  for X in $ARMS; do [ -f $S/../serve-$X.pid ] && kill "$(cat $S/../serve-$X.pid)" 2>/dev/null; rm -f $S/../serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
for X in $ARMS; do
  [ -f $S/../serve-$X.pid ] && kill "$(cat $S/../serve-$X.pid)" 2>/dev/null
  rm -f $S/../serve-$X.json
  node tools/serve.mjs --root site-pretty --overlay $S/$X --port 0 --state $S/../serve-$X.json --vendors=local --latency 150 > $S/../serve-$X.log 2>&1 &
  echo $! > $S/../serve-$X.pid
done
for X in $ARMS; do
  node tools/wait.mjs serve $S/../serve-$X.json --pid "$(cat $S/../serve-$X.pid)" --owner fix-cd-roll-ca-r4 --reason "P-147 snapshot $X server" > /dev/null || { echo "server $X failed, see $S/../serve-$X.log"; exit 1; }
done
for X in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/../serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  W=$(grep "$X/_app/immutable/nodes/2.DyWL8TcE.js" $S/HASHES.txt | cut -c1-12)
  [ "$J" = "$W" ] || { echo "VOID $X serves JS $J, snapshot $W"; exit 3; }
  echo "$X port $P served JS $J CSS $C"
done
