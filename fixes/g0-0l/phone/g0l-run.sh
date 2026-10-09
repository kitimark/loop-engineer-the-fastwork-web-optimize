#!/bin/sh
# g0.0l phone kit (card: fixes/g0-0l/README.md "Phone check card"; fix-scrollcb-g0, 2026-10-09): a text-substitution copy of
# fix-cm-return's P-173 kit (fixes/g0-0k/phone/g0k-*.sh; credit fix-cm-return and its lineage below) with: logs out/g0lp,
# labels g0l-, owner fix-scrollcb-g0, snapshot out/g0-0l/snap (fixes/g0-0l/phone/g0l-snap.sh, HASHES.txt fa8ce0315555), no K arm,
# hold script g0l-hold.sh (FLICK + APPROACH programs) and these pins (older headers below name older arms; the code's pins are these):
#   C = g0.0k (best on main, fixes/g0-0k)                  JS e0b7b1e7e158  CSS a9d4fa8992d9
#   V = g0.0l = g0.0k + people-blink--b2 (fixes/g0-0l)    JS 4106679e0a8a  CSS 440582cec781
# P-173 amendment (lead 04:5xZ): cooling on, phone-temp --below 40.0 before every hold, stop at an end battery >= 43.0 C.
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
# Usage: sh fixes/g0-0k/phone/g0k-run.sh <ticket> H1:<item> ... H<n>:TAIL   (the order is the card's; CM_DRY=1: no phone)
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the block wrapper (servers, the hold, thermal clear, servers stop). A copy of fix-cm-return's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-cm-return, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 5c39f7a96e41  CSS d4e684032482
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# snapshot out/g0kp-snap (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-cm-return.
# The P-161..P-163 lessons are kept unchanged (tool-serious via iphone.mjs rearm, Safari parked before the rearm, thermal
# clear after the hold, the get-ready step on preflight AUTH or "Failed to initialize for UI testing", the --block mark).
# Original header of the copied file:
# end-of-page-fresh block wrapper (card: research/end-of-page-fresh/README.md §8), after the P-161/P-162 lessons:
# servers, then the block in ONE phone hold marked with the ticket, then `thermal.mjs clear` right after
# `lock.mjs run iphone` returns (not in an exit trap, b161bece / e713da95), then the servers stop.
# Inside the hold fe-block.sh: tool-serious via `iphone.mjs rearm` with Safari parked first (c181d248), no Xcode step
# (FW_PHONE_CONDITION=tool, user T-228 #15), a locked phone waits on a user unlock step instead of exiting.
# Run it as a Bash background job (timeout 7200000 ms):
#   sh fixes/g0-box/phone/g0b-run.sh <ticket>
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ $# -gt 1 ] || { echo "usage: sh fixes/g0-0l/phone/g0l-run.sh <ticket> H1:<item> ... H<n>:TAIL"; exit 2; }
T=$1; shift; LG=out/g0lp; mkdir -p $LG
sh fixes/g0-0l/phone/g0l-serve.sh start || { echo "BLOCK STOP: servers"; exit 4; }
if [ "$CM_DRY" = 1 ]; then CM_TICKET=$T CM_DRY=1 sh fixes/g0-0l/phone/g0l-block.sh "$@"; rc=$?; sh fixes/g0-0l/phone/g0l-serve.sh stop; echo "EXIT $rc"; exit $rc; fi
CM_TICKET=$T CM_COOL=1 CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-scrollcb-g0 --block "$T" --max-seconds 3600 --keep 120 -- \
  sh fixes/g0-0l/phone/g0l-block.sh "$@"
rc=$?
node tools/thermal.mjs clear --owner fix-scrollcb-g0 > $LG/thermal-clear-$(date +%s).log 2>&1; cr=$?
echo "hold ended (exit $rc); thermal condition cleared after the hold (exit $cr)"
sh fixes/g0-0l/phone/g0l-serve.sh stop
echo "EXIT $rc"
exit $rc
