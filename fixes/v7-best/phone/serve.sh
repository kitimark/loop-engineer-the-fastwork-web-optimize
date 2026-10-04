#!/bin/sh
# P-105 (v7 phone no-worse check vs v6, less-work rule): serve the arms from immutable snapshot copies, plain http
# (I-003), OS-assigned ports (--port 0, I-131: no port reuse between builds), --latency 150, --vendors=local.
# Adapted from fix-rest-script's fixes/rest-script/phone/serve.sh (P-094), with credit.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v6 = best-build + hero R2 delta (JS 8018ce062d30, CSS 71b65c667720), copy out/p105/snap/C
#   V = v7 = fixes/v7-best/patch.diff (JS 8c90da217745, CSS 308f0da70c3a), copy out/p105/snap/V
# The copies: `node tools/fix.mjs apply p105-v6 --from best-build,fixes/v7-best/hero-r2-delta.diff` and
# `node tools/fix.mjs apply p105-v7 --from v7-best`, overlays copied to out/p105/snap/{C,V}, read-only, HASHES.txt.
# Usage: sh fixes/v7-best/phone/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/v7-best/phone/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v7-best/phone/serve.sh stop     stop them (only these three, by their pid files)
# Phone URLs are printed for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/p105/snap
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
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner iphone-runner --reason "P-105 server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:8018ce062d30:71b65c667720|V:8c90da217745:308f0da70c3a) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
