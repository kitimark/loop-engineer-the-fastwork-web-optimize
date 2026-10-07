#!/bin/sh
# P-161 phone pair (C vs c3b-a + K6) (copy of phone-c3bk (itself of phone-c3ba); V is c3b-a + K6 = out/cm/c3bk6, c3b-k6-on-c3b-a.diff: JS d23ee885d54f, CSS 4fafb83f1e72;
# snapshot out/cm/snap163 with C and P from out/cm/snap160, V from out/cm/c3bk6). Original header follows.
# c3b-a phone pair (copy of phone-c3, the P-160 kit; V is c3b-a = v13 + c3b-a, out/cm/c3ba, c3b-a-on-v13.diff, landed da69ea0c). Original header: P-160 pair (C = v9-final rev 7d, the same file as P-158's out/cm/snap11/C; V = c3b-a = v13 + c3b-a, out/cm/c3, proved by ../v13-build.sh): copy of
# fixes/compositor-morph/phone-v11/cm-serve.sh (itself a copy of fixes/compositor-morph/phone/cm-serve.sh).
# compositor-morph phone servers (card: fixes/compositor-morph/README.md "Phone card"). A copy of fix-end-morph's
# fixes/end-morph-f12/phone/p155-serve.sh (credit: fix-end-morph) with two arms. Plain http (I-003), OS-assigned ports,
# --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final rev 7d (int-v11)                 JS 1b2eecc66011  CSS e1359ab9994a
#   V = c3b-a + K6 (out/cm/c3bk6)                 JS d23ee885d54f  CSS 4fafb83f1e72 (pinned below)
#   P = the probe page out/cm/probe (attribution runs only, after the end sentinel; served from the snapshot too)
# The snapshot: out/cm/snap163 (C and P copied from out/cm/snap160, V from out/cm/c3ba, then read-only; HASHES.txt pinned below), checked before every start and check.
# Usage: sh fixes/compositor-morph/phone-c3bk6/cm-serve.sh snap|start|check|stop
# State: out/cmp163/serve-{B,C,V,P}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/cmp163; D=out/cm/snap163
OWNER=${FW_AGENT:-arch-compositor-morph}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=1b2eecc66011; C_CSS=e1359ab9994a
V_JS=d23ee885d54f; V_CSS=4fafb83f1e72
HASHES_PIN=${CM_HASHES_PIN:-b3c356f6d76f}
case "$1" in snap|start|check|stop) ;; *) echo "usage: sh fixes/compositor-morph/phone-c3bk6/cm-serve.sh snap|start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V P; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
if [ "$1" = snap ]; then
  [ -e $D/HASHES.txt ] && { echo "snapshot exists at $D (read-only): refuse to rebuild"; exit 3; }
  mkdir -p $D/C/_app/immutable/nodes $D/C/_app/immutable/assets $D/V/_app/immutable/nodes $D/V/_app/immutable/assets $D/P
  cp out/cm/snap160/C/$JS $D/C/$JS && cp out/cm/snap160/C/$CSS $D/C/$CSS && cp out/cm/c3bk6/$JS $D/V/$JS && cp out/cm/c3bk6/$CSS $D/V/$CSS || exit 3
  cp out/cm/snap160/P/index.html out/cm/snap160/P/probe.js $D/P/ || exit 3
  (cd $D && find C V P -type f | sort | xargs shasum -a 256 > HASHES.txt)
  chmod -R a-w $D/C $D/V $D/P $D/HASHES.txt
  echo "snapshot $D: HASHES.txt $(shasum -a 256 $D/HASHES.txt | cut -c1-12)"; cat $D/HASHES.txt; exit 0
fi
mkdir -p $S
[ -e $D/HASHES.txt ] || { echo "no snapshot at $D: run snap first"; exit 3; }
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = "$HASHES_PIN" ] || { echo "HASHES.txt is $(shasum -a 256 $D/HASHES.txt | cut -c1-12), not the pinned $HASHES_PIN: refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in B C V P; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    case $A in B) R="--root site-pretty" ;; P) R="--root $D/P" ;; *) R="--root site-pretty --overlay $D/$A" ;; esac
    node tools/serve.mjs $R --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V P; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "compositor-morph phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  K=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$K" in
    B:4606120cf392:27776f3d4138|C:$C_JS:$C_CSS|V:$V_JS:$V_CSS) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $K $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
