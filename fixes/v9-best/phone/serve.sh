#!/bin/sh
# v9 phone no-worse check (less-work rule; PHONE TICKET draft in fixes/v9-best/README.md): serve the arms from immutable
# snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local. A copy of
# fix-double-drive's P-118 serve.sh (fixes/double-drive/phone/serve.sh, itself from int-v8's P-116 serve.sh) with this
# ticket's arms; only the arms, the folder (out/pv9/snap), the snapshot source and the labels changed.
#   B = the plain baseline (no overlay): the thermal gate's timer page; no counted run on it
#   C = v8-best                          (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/pv9/snap/C
#   V = v9 step 4 (v8 + PR-018 rev 7c + double-drive + scroll-cb + PR-021 rev 3)
#                                        (JS de237379b556, CSS e1359ab9994a), copy out/pv9/snap/V
#   Source: out/v9/snap-de237379b556/{A = C, V}, written by fixes/v9-best/build.mjs (strict applier, every legal order
#   gives the same bytes, each component reverses) with its own HASHES.txt. If the v9 set changes, the arms below and
#   the source folder are re-pinned in one commit before any phone data, and the ticket's hashes with them.
# Usage: sh fixes/v9-best/phone/serve.sh snap    copy the source once; refuses if out/pv9/snap exists or a hash differs
#        sh fixes/v9-best/phone/serve.sh         start B C V, check the copies and the served hashes, print ports
#        sh fixes/v9-best/phone/serve.sh check   re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v9-best/phone/serve.sh stop    stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/pv9/snap
SRC=out/v9/snap-de237379b556
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
CJ=3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16
CC=f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43
VJ=de237379b556dc898bcabb49f7940c7d5b58c6f920d9089f0c1752bf5c08cd5d
VC=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  for X in C V; do
    F=A; [ $X = V ] && F=V
    mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets
    cp $SRC/$F/$JS $S/$X/$JS && cp $SRC/$F/$CSS $S/$X/$CSS || exit 3
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v9 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|V:de237379b556:e1359ab9994a) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
