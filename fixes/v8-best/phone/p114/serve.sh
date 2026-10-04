#!/bin/sh
# P-114 (v8 vs v7 phone confirm block, M leg + G part H; PHONE TICKET in fixes/v8-best/README.md "P-114"): serve the arms from
# immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
# A copy of P-111's fixes/v8-best/phone/serve.sh (73c4bf67dba0; itself adapted from iphone-runner's P-105 serve.sh,
# with credit): the same arms (C = v7, V = v8) and hashes; only the folder (out/p114/snap) and the labels changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v7-best (JS 8c90da217745, CSS 308f0da70c3a), copy out/p114/snap/C
#   V = v8-best (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/p114/snap/V
# Usage: sh fixes/v8-best/phone/p114/serve.sh snap     make the copies once from out/v8-best/snap/{A,V} (node fixes/v8-best/
#                                                 gates/snap.mjs, which rebuilds them from the committed patches and
#                                                 refuses any hash difference); refuses if out/p114/snap exists
#        sh fixes/v8-best/phone/p114/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/v8-best/phone/p114/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v8-best/phone/p114/serve.sh stop     stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/p114/snap
OWNER=${FW_AGENT:-int-v8}
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  for X in C V; do
    F=A; [ $X = V ] && F=V
    mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets
    cp out/v8-best/snap/$F/_app/immutable/nodes/2.DyWL8TcE.js $S/$X/_app/immutable/nodes/
    cp out/v8-best/snap/$F/_app/immutable/assets/2.gBuqKVzi.css $S/$X/_app/immutable/assets/
  done
  (cd $S && shasum -a 256 C/_app/immutable/nodes/2.DyWL8TcE.js C/_app/immutable/assets/2.gBuqKVzi.css V/_app/immutable/nodes/2.DyWL8TcE.js V/_app/immutable/assets/2.gBuqKVzi.css > HASHES.txt)
  chmod -R a-w $S/C $S/V; chmod a-w $S/HASHES.txt
  cat $S/HASHES.txt
  grep -q '^8c90da217745.* C/_app/immutable/nodes' $S/HASHES.txt && grep -q '^308f0da70c3a.* C/_app/immutable/assets' $S/HASHES.txt &&
    grep -q '^3e3e94cb6e9f.* V/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* V/_app/immutable/assets' $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for X in B C V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for X in B C V; do
    [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
    rm -f $S/serve-$X.json
    OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
    echo $! > $S/serve-$X.pid
  done
  for X in B C V; do
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "P-114 server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:8c90da217745:308f0da70c3a|V:3e3e94cb6e9f:f836404b3728) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
