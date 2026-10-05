#!/bin/sh
# P-147 (PHONE TICKET P-147 in fixes/cd-roll-ca/README.md): serve the immutable snapshot copies out/p147/snap (C =
# current v9-final JS 1b2eecc66011, V = C + the P-097 delta JS 2cfd990c788d; CSS e1359ab9994a both; HASHES.txt there)
# on plain http (I-003), --port 0 (a fresh OS port per start, I-131), latency 150, vendors local. A copy of
# serve-snap.sh with only the folder, the arms and these lines changed. Nothing here prints the LAN address.
#   sh fixes/cd-roll-ca/phone/p147-serve.sh        # start C and V, check the served hashes, print ports
#   sh fixes/cd-roll-ca/phone/p147-serve.sh stop   # stop them
cd "$(dirname "$0")/../../.." || exit 2
S=out/p147/snap
ARMS="C V"
if [ "$1" = stop ]; then
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
