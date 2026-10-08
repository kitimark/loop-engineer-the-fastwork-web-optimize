#!/bin/sh
# P-171 (lead 2026-10-09, candidate 1 D signed NAMED): a copy of the eop kit with C = g0.0h (JS 9162843e750f, CSS 26d28a0a263b,
# from out/g0box/p168/f-B2) and V = ws (JS d0f48dc4f82e, CSS 26d28a0a263b, from out/g0box/eop8/ws), snapshot out/g0box/snap5,
# logs out/p171p, labels p171-; no K arm (p171-k.env empty). Everything else is the eop kit's (below, the copied header).
# end-of-page (eop, lead 2026-10-09, user T-228 #98): a copy of the P-164 g0b kit with its own log dir (out/p171p), labels
# eop-, items up to n = 6, and a third arm K (a candidate) pinned in fixes/g0-box/phone/p171-k.env (K_NAME, K_DIR =
# an immutable snapshot dir with K/<JS>, K/<CSS> and HASHES.txt, K_JS, K_CSS, K_HASHES; K_NAME empty = no K arm).
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8), the same gates (p129-gates-g0.mjs), Timeline on in counted runs.
# Header below is the g0b kit's.
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the servers (B baseline timer page, C, V). A copy of fix-g0-box's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-g0-box, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 9162843e750f  CSS 26d28a0a263b
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS d0f48dc4f82e  CSS 26d28a0a263b
# snapshot out/g0box/snap5 (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-g0-box.
# The P-161..P-163 lessons are kept unchanged (tool-serious via iphone.mjs rearm, Safari parked before the rearm, thermal
# clear after the hold, the get-ready step on preflight AUTH or "Failed to initialize for UI testing", the --block mark).
# Original header of the copied file:
# end-of-page-fresh phone pair (card: research/end-of-page-fresh/README.md §8): C = v14 (c3b-a + K6, the current best,
# BEST_BUILDS 349ea688; out/s0/k6 = P-161's V) against V = D1b with __cmBarMode = v14 (c3b-a with the CM tree kept built
# in WebKit; out/s0/d1b-a = s1b-d1b.diff with the one flag line set to v14, lead: the block measures D1's layers, not
# the PR-033 bar choice). Snapshot out/g0box/snap5. A copy of arch-compositor-morph's fixes/compositor-morph/phone-c3bk6/cm-serve.sh (credit:
# arch-compositor-morph, fix-end-morph) without the probe page P (no attribution runs in this block). Original header:
# compositor-morph phone servers (card: fixes/compositor-morph/README.md "Phone card"). A copy of fix-end-morph's
# fixes/end-morph-f12/phone/p155-serve.sh (credit: fix-end-morph) with two arms. Plain http (I-003), OS-assigned ports,
# --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final rev 7d (int-v11)                 JS 1b2eecc66011  CSS e1359ab9994a
#   V = c3b-a + K6 (out/cm/c3bk6)                 JS d23ee885d54f  CSS 4fafb83f1e72 (pinned below)
#   P = the probe page out/cm/probe (attribution runs only, after the end sentinel; served from the snapshot too)
# The snapshot: out/fe/snap1 (C and P copied from out/cm/snap160, V from out/cm/c3ba, then read-only; HASHES.txt pinned below), checked before every start and check.
# Usage: sh fixes/g0-box/phone/g0b-serve.sh snap|start|check|stop
# State: out/g0bp/serve-{B,C,V,P}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p171p; D=out/g0box/snap5
[ -f fixes/g0-box/phone/p171-k.env ] && . fixes/g0-box/phone/p171-k.env
ARMS="B C V${K_NAME:+ K}"
OWNER=${FW_AGENT:-fix-g0-box}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=9162843e750f; C_CSS=26d28a0a263b
V_JS=d0f48dc4f82e; V_CSS=26d28a0a263b
HASHES_PIN=${CM_HASHES_PIN:-ba2e2fc5457c}
case "$1" in snap|start|check|stop) ;; *) echo "usage: sh fixes/g0-box/phone/p171-serve.sh snap|start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V K; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
if [ "$1" = snap ]; then
  [ -e $D/HASHES.txt ] && { echo "snapshot exists at $D (read-only): refuse to rebuild"; exit 3; }
  mkdir -p $D/C/_app/immutable/nodes $D/C/_app/immutable/assets $D/V/_app/immutable/nodes $D/V/_app/immutable/assets
  cp out/g0box/p168/f-B2/$JS $D/C/$JS && cp out/g0box/p168/f-B2/$CSS $D/C/$CSS && cp out/g0box/eop8/ws/$JS $D/V/$JS && cp out/g0box/eop8/ws/$CSS $D/V/$CSS || exit 3
  (cd $D && find C V -type f | sort | xargs shasum -a 256 > HASHES.txt)
  chmod -R a-w $D/C $D/V $D/HASHES.txt
  echo "snapshot $D: HASHES.txt $(shasum -a 256 $D/HASHES.txt | cut -c1-12)"; cat $D/HASHES.txt; exit 0
fi
mkdir -p $S
[ -e $D/HASHES.txt ] || { echo "no snapshot at $D: run snap first"; exit 3; }
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = "$HASHES_PIN" ] || { echo "HASHES.txt is $(shasum -a 256 $D/HASHES.txt | cut -c1-12), not the pinned $HASHES_PIN: refuse"; exit 3; }
if [ -n "$K_NAME" ]; then
  [ -e $K_DIR/HASHES.txt ] || { echo "no K snapshot at $K_DIR"; exit 3; }
  (cd $K_DIR && shasum -a 256 -c --quiet HASHES.txt) || { echo "K SNAPSHOT CHANGED: refuse"; exit 3; }
  [ "$(shasum -a 256 $K_DIR/HASHES.txt | cut -c1-12)" = "$K_HASHES" ] || { echo "K HASHES.txt is not the pinned $K_HASHES: refuse"; exit 3; }
fi
if [ "$1" = start ]; then
  for A in $ARMS; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    case $A in B) R="--root site-pretty" ;; K) R="--root site-pretty --overlay $K_DIR/K" ;; *) R="--root site-pretty --overlay $D/$A" ;; esac
    node tools/serve.mjs $R --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in $ARMS; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "g0-box end-of-page server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  K=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$K" in
    B:4606120cf392:27776f3d4138|C:$C_JS:$C_CSS|V:$V_JS:$V_CSS|K:$K_JS:$K_CSS) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $K $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }
