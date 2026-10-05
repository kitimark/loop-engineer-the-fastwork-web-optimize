#!/bin/sh
# P-134 (v9.1d vs v9-final + 7d) phone servers: a copy of P-132's fixes/v9-1/phone/serve132.sh (itself P-122's
# serve122.sh) with only the C and V arms, the folder and the sources changed. Immutable snapshot copies, plain http
# (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
#   B = the plain baseline (no overlay): the thermal gate's timer page; no counted run on it
#   C = v9-final + morph-scroll rev 7d (landed 189ca7ed; fixes/morph-scroll-v9try/patch.diff 6d1632eb0ee9)
#                                                  (JS 1b2eecc66011, CSS e1359ab9994a), copy out/p134/snap/C
#   V = v9.1d = C + scroll-cb (carry over dd) + the g11 close rule (fix-morph-gpu d677884838c7)
#                                                  (JS 941aa13e5bdf, CSS f1997edf5309), copy out/p134/snap/V
#   Sources: out/v91d/snap-941aa13e5bdf/{C,V}, written by fixes/v9-best/build.mjs --target v91d (V91D_EXPECT pinned; C is
#   checked = the landed patch on the baseline byte for byte; 420 legal orders give the same bytes, each component reverses).
# Usage: sh fixes/v9-1d/phone/serve134.sh snap    copy the source once; refuses if out/p134/snap exists or a hash differs
#        sh fixes/v9-1d/phone/serve134.sh         start B C V, check the copies and the served hashes, print ports
#        sh fixes/v9-1d/phone/serve134.sh check   re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v9-1d/phone/serve134.sh stop    stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/p134/snap
SRCC=out/v91d/snap-941aa13e5bdf/C; SRCV=out/v91d/snap-941aa13e5bdf/V
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
CJ=1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428
CC=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
VJ=941aa13e5bdf0b7a89278eae21e99630d345047377f21ea40d00c9fe97ec408e
VC=f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  for X in C V; do
    F=$SRCC; [ $X = V ] && F=$SRCV
    mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets
    cp $F/$JS $S/$X/$JS && cp $F/$CSS $S/$X/$CSS || exit 3
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v9.1d P-134 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:1b2eecc66011:e1359ab9994a|V:941aa13e5bdf:f1997edf5309) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
