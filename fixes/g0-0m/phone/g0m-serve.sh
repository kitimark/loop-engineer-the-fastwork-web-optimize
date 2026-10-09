#!/bin/sh
# g0.0m phone kit (fix-reveal-paint, 2026-10-09; card: fixes/g0-0m/README.md "Phone check card"): a text-substitution copy of
# P-174's kit (fixes/g0-0l/phone/, fix-scrollcb-g0; credit it and its lineage below) with: logs out/g0mp, labels g0m-, owner
# fix-reveal-paint, snapshot out/g0-0m/snap (fixes/g0-0m/phone/g0m-snap.sh, HASHES.txt e7947589f4c9) and these pins (the
# headers below name the older arms; the code's pins are these):
#   C = g0.0l (best on main, fixes/g0-0l)                  JS 4106679e0a8a  CSS 440582cec781
#   V = g0.0m rev 3 = g0.0l + reveal-paint (fixes/g0-0m)  JS 37af49aef32b  CSS 7a8ecdd8f8e4
# The two G programs are byte-identical copies of P-174's (compiled 22b636f36a82 / 65f6de58009c).
# g0.0l phone kit (card: fixes/g0-0l/README.md "Phone check card"; fix-scrollcb-g0, 2026-10-09): a text-substitution copy of
# fix-cm-return's P-173 kit (fixes/g0-0k/phone/g0k-*.sh; credit fix-cm-return and its lineage below) with: logs out/g0mp,
# labels g0l-, owner fix-scrollcb-g0, snapshot out/g0-0m/snap (fixes/g0-0m/phone/g0m-snap.sh, HASHES.txt fa8ce0315555), no K arm,
# hold script g0l-hold.sh (FLICK + APPROACH programs) and these pins (older headers below name older arms; the code's pins are these):
#   C = g0.0k (best on main, fixes/g0-0k)                  JS e0b7b1e7e158  CSS a9d4fa8992d9
#   V = g0.0l = g0.0k + people-blink--b2 (fixes/g0-0l)    JS 4106679e0a8a  CSS 440582cec781
# g0.0k phone kit for P-173 (lead signed 2026-10-09 ~04:25Z; card fixes/g0-0k/README.md): a text-substitution copy of
# fix-scrollcb-g0's P-172 kit (fixes/sticky-walk/phone/sw-*.sh; credit fix-scrollcb-g0, fix-menu-layers, fix-g0-box):
# logs out/g0kp, labels g0k-, owner fix-cm-return, snapshot out/g0kp-snap (C from out/cm-return/snapk/A, V from
# out/cm-return/snapk/V) and these pins (older headers below name older arms; the code's pins are these):
#   C = g0.0j (best on main, fixes/g0-0j)                         JS 9162843e750f  CSS bee7fce9ad56
#   V = g0.0k = g0.0j + PR-040's end + html.fw-bx (fixes/g0-0k)   JS e0b7b1e7e158  CSS a9d4fa8992d9
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8) and gates (p129-gates-g0.mjs); no K arm; no user step (lead T-256).
# sticky-walk phone kit for P-172 (lead signed 2026-10-09): a text-substitution copy of fix-menu-layers' P-170b kit
# (fixes/menu-layers/phone/ml-*.sh, credit fix-menu-layers, fix-g0-box): logs out/g0kp, labels sw-, owner fix-cm-return,
# snapshot out/g0kp-snap (HASHES.txt 903966683b4f) and these pins (older headers below name older arms; the code's pins are these):
#   C = g0.0i (fixes/g0-0i, landed e32d8495)          JS 9162843e750f  CSS adb875d94c1f
#   V = g0.0i + fixcq (fixes/sticky-walk/patch.diff)   JS 9162843e750f  CSS bee7fce9ad56
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8: its `approach` phase is the G approach) and gates (p129-gates-g0.mjs);
# no K arm. One change beyond the substitution: no user step (lead, P-172): a phone that is not ready stops the block (exit 9).
# menu-layers phone kit (T-253 #10 item 2): a copy of fix-g0-box's eop kit (fixes/g0-box/phone/eop-*.sh on main, 55f5cacd;
# credit fix-g0-box), made by a text substitution only: logs out/g0kp, labels ml-, owner fix-cm-return, snapshot
# out/g0kp-snap and these pins (the header below still names the eop kit's g0.0e / g0.0f arms; the pins in the code are these):
#   C = g0.0h (fixes/g0-0h, landed 55f5cacd)                  JS 9162843e750f  CSS 26d28a0a263b
#   V = g0.0h + the panel clock layer (fixes/menu-layers)     JS 9162843e750f  CSS adb875d94c1f
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8) and gates (p129-gates-g0.mjs); no K arm (ml-k.env empty).
# end-of-page (eop, lead 2026-10-09, user T-228 #98): a copy of the P-164 g0b kit with its own log dir (out/g0kp), labels
# eop-, items up to n = 6, and a third arm K (a candidate) pinned in fixes/g0-0k/phone/g0k-k.env (K_NAME, K_DIR =
# an immutable snapshot dir with K/<JS>, K/<CSS> and HASHES.txt, K_JS, K_CSS, K_HASHES; K_NAME empty = no K arm).
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8), the same gates (p129-gates-g0.mjs), Timeline on in counted runs.
# Header below is the g0b kit's.
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the servers (B baseline timer page, C, V). A copy of fix-cm-return's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-cm-return, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 5c39f7a96e41  CSS d4e684032482
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# snapshot out/g0kp-snap (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-cm-return.
# The P-161..P-163 lessons are kept unchanged (tool-serious via iphone.mjs rearm, Safari parked before the rearm, thermal
# clear after the hold, the get-ready step on preflight AUTH or "Failed to initialize for UI testing", the --block mark).
# Original header of the copied file:
# end-of-page-fresh phone pair (card: research/end-of-page-fresh/README.md §8): C = v14 (c3b-a + K6, the current best,
# BEST_BUILDS 349ea688; out/s0/k6 = P-161's V) against V = D1b with __cmBarMode = v14 (c3b-a with the CM tree kept built
# in WebKit; out/s0/d1b-a = s1b-d1b.diff with the one flag line set to v14, lead: the block measures D1's layers, not
# the PR-033 bar choice). Snapshot out/g0kp-snap. A copy of arch-compositor-morph's fixes/compositor-morph/phone-c3bk6/cm-serve.sh (credit:
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
S=out/g0mp; D=out/g0-0m/snap
[ -f fixes/g0-0m/phone/g0m-k.env ] && . fixes/g0-0m/phone/g0m-k.env
ARMS="B C V${K_NAME:+ K}"
OWNER=${FW_AGENT:-fix-reveal-paint}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=4106679e0a8a; C_CSS=440582cec781
V_JS=37af49aef32b; V_CSS=7a8ecdd8f8e4
HASHES_PIN=${CM_HASHES_PIN:-e7947589f4c9}
case "$1" in snap|start|check|stop) ;; *) echo "usage: sh fixes/g0-0m/phone/g0m-serve.sh snap|start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V K; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
if [ "$1" = snap ]; then echo "the snapshot is built by fixes/g0-0m/phone/g0m-snap.sh"; exit 2; fi
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "g0.0l phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
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
