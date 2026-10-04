#!/bin/sh
# Committed copy of out/cd-roll-ca/serve-snap.sh (review round 4 N5): the same script; only the cd depth and the usage
# lines differ. The snapshot copies it serves stay in out/cd-roll-ca/snap (gitignored, Fastwork-derived).
# cd-roll-ca blind test: serve the immutable snapshot copies (C = cd-strip(b) on st6-rb2, V = C + cd-roll-ca round 2,
# V3 = C + cd-roll-ca round 3; C4 = cd-strip strip-rb (patch 08bedca6), V4 = C4 + cd-roll-ca cells-only, V5 = V4 + gap re-key; C5 = cd-strip strip-rw (dev, JS 5e37af69), V6 = C5 + cd-roll-ca V5 rebased; C6 = cd-strip strip-rw final (JS 5e37af69, CSS 40078cb2, patch 1f3c26a1), V7 = C6 + V6 JS; C8 = cd-strip strip-tc (accepted PR-008 rev 2, JS 6fa0e1e8, CSS 982a747d), V9 = C8 + cd-roll-ca on tc (JS 582d120c, no __crTops), VK = V9 + K (JS b43fe790, per-frame quadratic keyframes)) on plain http (I-003), --port auto, latency 150, vendors local. One command:
#   sh fixes/cd-roll-ca/phone/serve-snap.sh          # start the arms (default "C V"; ARMS="C V3" to pick), check served hashes, print ports and phone URLs
#   sh fixes/cd-roll-ca/phone/serve-snap.sh stop     # stop them
cd "$(dirname "$0")/../../.." || exit 2
S=out/cd-roll-ca/snap
ARMS=${ARMS:-C V}
if [ "$1" = stop ]; then
  for X in B C V V3 C4 V4 V5 C5 V6 C6 V7 C8 V9 VK P100; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
for X in $ARMS; do
  [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
  rm -f $S/serve-$X.json
  OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
  node tools/serve.mjs --root site-pretty $OV --port auto --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
  echo $! > $S/serve-$X.pid
done
for X in $ARMS; do
  node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --reason "cd-roll-ca snapshot $X server" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
done
for X in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  SRC=$(curl -s -D - -o /dev/null http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | tr -d '\r' | awk -F': ' 'tolower($1)=="x-mirror-source"{print $2}')
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C ($SRC) phone $(node tools/lan.mjs --url --port $P)"
done
