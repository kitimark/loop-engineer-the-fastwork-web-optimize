#!/bin/sh
# P-136 (nav-hit-cache U2 vs v9-final + rev 7d) phone servers: a copy of P-122's fixes/v9-best/phone/p122/serve122.sh
# (0198b72d3ad9) with the arms, the folder and the source changed. Immutable snapshot copies, plain http (I-003),
# OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
#   B = the plain baseline (no overlay): the thermal gate's timer page; no counted run on it
#   C = v9-final + rev 7d (main 189ca7ed)  (JS 1b2eecc66011, CSS e1359ab9994a), copy out/p136/snap/C
#   V = C + nav-hit-cache U2               (JS c7435c24dc56, CSS e1359ab9994a), copy out/p136/snap/V
#   Source: out/snapshots/nhcv9f7d-1b2eecc66011 (C) and out/snapshots/nhcu2-c7435c24dc56 (V), written by
#   fixes/nav-hit-cache/build.mjs --base v9f7d / --base v9f7du2 (expect pins; README "P-136").
# Usage: sh fixes/nav-hit-cache/p136/serve136.sh snap    copy the source once; refuses if out/p136/snap exists or a hash differs
#        sh fixes/nav-hit-cache/p136/serve136.sh         start B C V, check the copies and the served hashes, print ports
#        sh fixes/nav-hit-cache/p136/serve136.sh check   re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/nav-hit-cache/p136/serve136.sh stop    stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/p136/snap
SRC_C=out/snapshots/nhcv9f7d-1b2eecc66011
SRC_V=out/snapshots/nhcu2-c7435c24dc56
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
CJ=1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428
CC=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
VJ=c7435c24dc5619bf4dd761c9d7653c2541062ba4e347aafe78d8e71daf62f015
VC=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  for X in C V; do
    SRC=$SRC_C; [ $X = V ] && SRC=$SRC_V
    mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets
    cp $SRC/$JS $S/$X/$JS && cp $SRC/$CSS $S/$X/$CSS || exit 3
  done
  (cd $S && shasum -a 256 C/$JS C/$CSS V/$JS V/$CSS > HASHES.txt)
  chmod -R a-w $S/C $S/V; chmod a-w $S/HASHES.txt
  cat $S/HASHES.txt
  grep -q "^$CJ  C/$JS" $S/HASHES.txt && grep -q "^$CC  C/$CSS" $S/HASHES.txt &&
    grep -q "^$VJ  V/$JS" $S/HASHES.txt && grep -q "^$VC  V/$CSS" $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $S/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-136 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:1b2eecc66011:e1359ab9994a|V:c7435c24dc56:e1359ab9994a) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
