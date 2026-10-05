#!/bin/sh
# P-132 (v9.1 vs v9-final) phone servers: a copy of P-122's fixes/v9-best/phone/serve122.sh with only the C and V
# arms, the folder and the sources changed. Immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0,
# I-131), --latency 150, --vendors=local.
#   B = the plain baseline (no overlay): the thermal gate's timer page; no counted run on it
#   C = v9-final (landed 8b5ce9b3)                 (JS 647c9ef2b1e2, CSS e1359ab9994a), copy out/p132/snap/C
#   V = v9.1 = v9-final + scroll-cb (carry over dd) + the g11 close rule (fix-morph-gpu d677884838c7)
#                                                  (JS c3d36476c3ce, CSS f1997edf5309), copy out/p132/snap/V
#   Sources: C out/v9/snap-647c9ef2b1e2-e1359ab9994a/V; V out/v91/snap-c3d36476c3ce/V, written by fixes/v9-best/build.mjs
#   --target v91 (V91_EXPECT pinned; 420 legal orders give the same bytes, each component reverses, joins match).
# Usage: sh fixes/v9-1/phone/serve132.sh snap    copy the source once; refuses if out/p132/snap exists or a hash differs
#        sh fixes/v9-1/phone/serve132.sh         start B C V, check the copies and the served hashes, print ports
#        sh fixes/v9-1/phone/serve132.sh check   re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v9-1/phone/serve132.sh stop    stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/p132/snap
SRCC=out/v9/snap-647c9ef2b1e2-e1359ab9994a/V; SRCV=out/v91/snap-c3d36476c3ce/V
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
CJ=647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2
CC=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
VJ=c3d36476c3ce04cf475a33c4f59e5592b5cfb1e964230614f86b6c41231926b8
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v9.1 P-132 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:647c9ef2b1e2:e1359ab9994a|V:c3d36476c3ce:f1997edf5309) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
