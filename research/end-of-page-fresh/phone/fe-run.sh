#!/bin/sh
# end-of-page-fresh block wrapper (card: research/end-of-page-fresh/README.md §8), after the P-161/P-162 lessons:
# servers, then the block in ONE phone hold marked with the ticket, then `thermal.mjs clear` right after
# `lock.mjs run iphone` returns (not in an exit trap, b161bece / e713da95), then the servers stop.
# Inside the hold fe-block.sh: tool-serious via `iphone.mjs rearm` with Safari parked first (c181d248), no Xcode step
# (FW_PHONE_CONDITION=tool, user T-228 #15), a locked phone waits on a user unlock step instead of exiting.
# Run it as a Bash background job (timeout 7200000 ms):
#   sh research/end-of-page-fresh/phone/fe-run.sh <ticket>
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] || { echo "usage: sh research/end-of-page-fresh/phone/fe-run.sh <ticket>"; exit 2; }
T=$1; LG=out/fep1; mkdir -p $LG
sh research/end-of-page-fresh/phone/fe-serve.sh start || { echo "BLOCK STOP: servers"; exit 4; }
CM_TICKET=$T CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-end-fresh --block "$T" --max-seconds 3600 --keep 120 -- \
  sh research/end-of-page-fresh/phone/fe-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL
rc=$?
node tools/thermal.mjs clear > $LG/thermal-clear-$(date +%s).log 2>&1; cr=$?
echo "hold ended (exit $rc); thermal condition cleared after the hold (exit $cr)"
sh research/end-of-page-fresh/phone/fe-serve.sh stop
exit $rc
