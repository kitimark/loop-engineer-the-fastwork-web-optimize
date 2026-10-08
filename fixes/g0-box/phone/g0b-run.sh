#!/bin/sh
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): the block wrapper (servers, the hold, thermal clear, servers stop). A copy of fix-g0-box's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-g0-box, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 5c39f7a96e41  CSS d4e684032482
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# snapshot out/g0box/snap4 (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-g0-box.
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
[ -n "$1" ] || { echo "usage: sh fixes/g0-box/phone/g0b-run.sh <ticket>"; exit 2; }
T=$1; LG=out/g0bp; mkdir -p $LG
sh fixes/g0-box/phone/g0b-serve.sh start || { echo "BLOCK STOP: servers"; exit 4; }
CM_TICKET=$T CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-g0-box --block "$T" --max-seconds 3600 --keep 120 -- \
  sh fixes/g0-box/phone/g0b-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL
rc=$?
node tools/thermal.mjs clear --owner fix-g0-box > $LG/thermal-clear-$(date +%s).log 2>&1; cr=$?
echo "hold ended (exit $rc); thermal condition cleared after the hold (exit $cr)"
sh fixes/g0-box/phone/g0b-serve.sh stop
exit $rc
