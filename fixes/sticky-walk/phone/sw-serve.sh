#!/bin/sh
# sticky-walk phone kit for P-172 (lead signed 2026-10-09): a text-substitution copy of fix-menu-layers' P-170b kit
# (fixes/menu-layers/phone/ml-*.sh, credit fix-menu-layers, fix-g0-box): logs out/swp, labels sw-, owner fix-scrollcb-g0,
# snapshot out/sticky-walk/snap-i (HASHES.txt 903966683b4f) and these pins (older headers below name older arms; the code's pins are these):
#   C = g0.0i (fixes/g0-0i, landed e32d8495)          JS 9162843e750f  CSS adb875d94c1f
#   V = g0.0i + fixcq (fixes/sticky-walk/patch.diff)   JS 9162843e750f  CSS bee7fce9ad56
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8: its `approach` phase is the G approach) and gates (p129-gates-g0.mjs);
# no K arm. One change beyond the substitution: no user step (lead, P-172): a phone that is not ready stops the block (exit 9).
# menu-layers phone kit (T-253 #10 item 2): a copy of fix-g0-box's eop kit (fixes/g0-box/phone/eop-*.sh on main, 55f5cacd;
# credit fix-g0-box), made by a text substitution only: logs out/swp, labels ml-, owner fix-scrollcb-g0, snapshot
# out/sticky-walk/snap-i and these pins (the header below still names the eop kit's g0.0e / g0.0f arms; the pins in the code are these):
#   C = g0.0h (fixes/g0-0h, landed 55f5cacd)                  JS 9162843e750f  CSS 26d28a0a263b
#   V = g0.0h + the panel clock layer (fixes/menu-layers)     JS 9162843e750f  CSS adb875d94c1f
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8) and gates (p129-gates-g0.mjs); no K arm (ml-k.env empty).
# end-of-page (eop, lead 2026-10-09, user T-228 #98): a copy of the P-164 g0b kit with its own log dir (out/swp), labels
# eop-, items up to n = 6, and a third arm K (a candidate) pinned in fixes/sticky-walk/phone/sw-k.env (K_NAME, K_DIR =
# an immutable snapshot dir with K/<JS>, K/<CSS> and HASHES.txt, K_JS, K_CSS, K_HASHES; K_NAME empty = no K arm).
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8), the same gates (p129-gates-g0.mjs), Timeline on in counted runs.
# Header below is the g0b kit's.
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the servers (B baseline timer page, C, V). A copy of fix-scrollcb-g0's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-scrollcb-g0, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 5c39f7a96e41  CSS d4e684032482
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# snapshot out/sticky-walk/snap-i (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-scrollcb-g0.
# The P-161..P-163 lessons are kept unchanged (tool-serious via iphone.mjs rearm, Safari parked before the rearm, thermal
# clear after the hold, the get-ready step on preflight AUTH or "Failed to initialize for UI testing", the --block mark).
# Original header of the copied file:
# end-of-page-fresh phone pair (card: research/end-of-page-fresh/README.md §8): C = v14 (c3b-a + K6, the current best,
# BEST_BUILDS 349ea688; out/s0/k6 = P-161's V) against V = D1b with __cmBarMode = v14 (c3b-a with the CM tree kept built
# in WebKit; out/s0/d1b-a = s1b-d1b.diff with the one flag line set to v14, lead: the block measures D1's layers, not
# the PR-033 bar choice). Snapshot out/sticky-walk/snap-i. A copy of arch-compositor-morph's fixes/compositor-morph/phone-c3bk6/cm-serve.sh (credit:
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
S=out/swp; D=out/sticky-walk/snap-i
[ -f fixes/sticky-walk/phone/sw-k.env ] && . fixes/sticky-walk/phone/sw-k.env
ARMS="B C V${K_NAME:+ K}"
OWNER=${FW_AGENT:-fix-scrollcb-g0}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=9162843e750f; C_CSS=adb875d94c1f
V_JS=9162843e750f; V_CSS=bee7fce9ad56
HASHES_PIN=${CM_HASHES_PIN:-903966683b4f}
case "$1" in snap|start|check|stop) ;; *) echo "usage: sh fixes/sticky-walk/phone/sw-serve.sh snap|start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V K; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
if [ "$1" = snap ]; then
  [ -e $D/HASHES.txt ] && { echo "snapshot exists at $D (read-only): refuse to rebuild"; exit 3; }
  mkdir -p $D/C/_app/immutable/nodes $D/C/_app/immutable/assets $D/V/_app/immutable/nodes $D/V/_app/immutable/assets
  cp fixes/g0-0h/overlay/$JS $D/C/$JS && cp fixes/g0-0h/overlay/$CSS $D/C/$CSS && cp fixes/menu-layers/overlay/$JS $D/V/$JS && cp fixes/menu-layers/overlay/$CSS $D/V/$CSS || exit 3
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
