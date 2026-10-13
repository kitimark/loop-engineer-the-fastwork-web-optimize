#!/bin/sh
# P-117 (combined phone no-worse block, v8 vs v8 + nav-hit-cache + scroll-cb; PHONE TICKET
# research/management/p117-combined-phone-no-worse.md): serve the arms from immutable snapshot copies, plain http (I-003),
# OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local. A copy of fixes/v8-best/phone/p116/serve.sh with the
# ticket's three arms; only the arms, the folder (out/nsc/snap, built by fixes/v8-best/phone/nsc/build.mjs) and the labels
# changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v8-best                              (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/nsc/snap/C
#   V = v8 + nav-hit-cache + scroll-cb       (JS e8d8323f674b, CSS f836404b3728), copy out/nsc/snap/V
# Usage: sh fixes/v8-best/phone/p117/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/v8-best/phone/p117/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v8-best/phone/p117/serve.sh stop     stop them (only these three, by their pid files)
# Output lines "A pid N port P served JS h CSS h ok" are what p117/score.mjs's checkOk reads from a hold's check log.
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/nsc/snap
OWNER=${FW_AGENT:-int-v8}
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
grep -q '^3e3e94cb6e9f.* C/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* C/_app/immutable/assets' $S/HASHES.txt &&
  grep -q '^e8d8323f674b.* V/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* V/_app/immutable/assets' $S/HASHES.txt ||
  { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-117 server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|V:e8d8323f674b:f836404b3728) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
