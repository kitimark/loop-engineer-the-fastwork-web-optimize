#!/bin/sh
# P-165 phone kit (card: fixes/g0-box/README.md "P-165", signed c31626f2): the servers. A copy of g0b-serve.sh (P-164,
# itself from the P-163 kit; credit: fix-g0-box, arch-compositor-morph, fix-end-morph) with P-165's arms:
#   B = the plain baseline (the pre-warm page and the thermal gate's timer page; no counted run)
#   C = v0, the original page: the plain baseline on its own port (no overlay)   JS 4606120cf392  CSS 27776f3d4138
#   V = g0.0f = g0.0e + v3-W (out/g0box/snap4/V, read-only)                     JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# Plain http (I-003), OS-assigned ports, --latency 150, --vendors=local. The snapshot out/g0box/snap4 (HASHES 3412a08fa9ac)
# is checked before every start and check (only its V copy is served).
# Usage: sh fixes/g0-box/phone/p165-serve.sh start|check|stop
# State: out/p165/serve-{B,C,V}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p165; D=out/g0box/snap4
OWNER=${FW_AGENT:-fix-g0-box}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
B_JS=4606120cf392; B_CSS=27776f3d4138
C_JS=4606120cf392; C_CSS=27776f3d4138
V_JS=30fd80ccbb3f; V_CSS=1d1e5d62a2c4
HASHES_PIN=3412a08fa9ac
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/g0-box/phone/p165-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
[ -e $D/HASHES.txt ] || { echo "no snapshot at $D"; exit 3; }
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = "$HASHES_PIN" ] || { echo "HASHES.txt is $(shasum -a 256 $D/HASHES.txt | cut -c1-12), not the pinned $HASHES_PIN: refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    case $A in V) R="--root site-pretty --overlay $D/V" ;; *) R="--root site-pretty" ;; esac
    node tools/serve.mjs $R --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-165 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  K=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$K" in
    B:$B_JS:$B_CSS|C:$C_JS:$C_CSS|V:$V_JS:$V_CSS) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $K $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
