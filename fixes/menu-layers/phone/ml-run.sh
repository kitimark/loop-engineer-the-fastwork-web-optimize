#!/bin/sh
# menu-layers phone kit (T-253 #10 item 2): a copy of fix-g0-box's eop kit (fixes/g0-box/phone/eop-*.sh on main, 55f5cacd;
# credit fix-g0-box), made by a text substitution only: logs out/mlp, labels ml-, owner fix-menu-layers, snapshot
# out/menu-layers/snap1 and these pins (the header below still names the eop kit's g0.0e / g0.0f arms; the pins in the code are these):
#   C = g0.0h (fixes/g0-0h, landed 55f5cacd)                  JS 9162843e750f  CSS 26d28a0a263b
#   V = g0.0h + the panel clock layer (fixes/menu-layers)     JS 9162843e750f  CSS adb875d94c1f
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8) and gates (p129-gates-g0.mjs); no K arm (ml-k.env empty).
# end-of-page (eop, lead 2026-10-09, user T-228 #98): a copy of the P-164 g0b kit with its own log dir (out/mlp), labels
# eop-, items up to n = 6, and a third arm K (a candidate) pinned in fixes/menu-layers/phone/ml-k.env (K_NAME, K_DIR =
# an immutable snapshot dir with K/<JS>, K/<CSS> and HASHES.txt, K_JS, K_CSS, K_HASHES; K_NAME empty = no K arm).
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8), the same gates (p129-gates-g0.mjs), Timeline on in counted runs.
# Header below is the g0b kit's.
# Usage: sh fixes/menu-layers/phone/ml-run.sh <ticket> H1:<item> ... H<n>:TAIL   (the order is the card's; CM_DRY=1: no phone)
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the block wrapper (servers, the hold, thermal clear, servers stop). A copy of fix-menu-layers's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-menu-layers, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 5c39f7a96e41  CSS d4e684032482
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# snapshot out/menu-layers/snap1 (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-menu-layers.
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
[ -n "$1" ] && [ $# -gt 1 ] || { echo "usage: sh fixes/menu-layers/phone/ml-run.sh <ticket> H1:<item> ... H<n>:TAIL"; exit 2; }
T=$1; shift; LG=out/mlp; mkdir -p $LG
sh fixes/menu-layers/phone/ml-serve.sh start || { echo "BLOCK STOP: servers"; exit 4; }
if [ "$CM_DRY" = 1 ]; then CM_TICKET=$T CM_DRY=1 sh fixes/menu-layers/phone/ml-block.sh "$@"; rc=$?; sh fixes/menu-layers/phone/ml-serve.sh stop; echo "EXIT $rc"; exit $rc; fi
CM_TICKET=$T CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-menu-layers --block "$T" --max-seconds 3600 --keep 120 -- \
  sh fixes/menu-layers/phone/ml-block.sh "$@"
rc=$?
node tools/thermal.mjs clear --owner fix-menu-layers > $LG/thermal-clear-$(date +%s).log 2>&1; cr=$?
echo "hold ended (exit $rc); thermal condition cleared after the hold (exit $cr)"
sh fixes/menu-layers/phone/ml-serve.sh stop
echo "EXIT $rc"
exit $rc
