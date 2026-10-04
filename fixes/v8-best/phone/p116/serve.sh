#!/bin/sh
# P-116 (v8 hero-flick (GH) attribution block, G part H only; PHONE TICKET research/management/p116-v8-gh-attribution.md):
# serve the arms from immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150,
# --vendors=local. A copy of P-114's fixes/v8-best/phone/p114/serve.sh (04b793255e19) with the ticket's three arms; only
# the arms, the folder (out/p116/snap), the snapshot source (p116/build.mjs) and the labels changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v8-best                         (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/p116/snap/C
#   X = v8 minus the countdown group    (JS 65d72981246f, CSS 4c9a9b4fc7bf), copy out/p116/snap/X
#   Y = v8 minus rest-script v4         (JS 528c09e97de6, CSS f836404b3728), copy out/p116/snap/Y
# Usage: sh fixes/v8-best/phone/p116/serve.sh snap     build the copies once (node fixes/v8-best/phone/p116/build.mjs: from
#                                                 the committed patches, strict applier, identity checks; refuses if
#                                                 out/p116/snap exists or any check fails), then pin-check them
#        sh fixes/v8-best/phone/p116/serve.sh          start B C X Y, check the copies and the served hashes, print ports
#        sh fixes/v8-best/phone/p116/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v8-best/phone/p116/serve.sh stop     stop them (only these four, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/p116/snap
OWNER=${FW_AGENT:-int-v8}
if [ "$1" = snap ]; then
  node fixes/v8-best/phone/p116/build.mjs || exit 3
  chmod -R a-w $S/C $S/X $S/Y
  grep -q '^3e3e94cb6e9f.* C/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* C/_app/immutable/assets' $S/HASHES.txt &&
    grep -q '^65d72981246f.* X/_app/immutable/nodes' $S/HASHES.txt && grep -q '^4c9a9b4fc7bf.* X/_app/immutable/assets' $S/HASHES.txt &&
    grep -q '^528c09e97de6.* Y/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* Y/_app/immutable/assets' $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for A in B C X Y; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for A in B C X Y; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $S/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C X Y; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-116 server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C X Y; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|X:65d72981246f:4c9a9b4fc7bf|Y:528c09e97de6:f836404b3728) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
