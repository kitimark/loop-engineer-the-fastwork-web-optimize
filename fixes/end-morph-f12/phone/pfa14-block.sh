#!/bin/sh
# pfa14-block.sh: wrapper for a tool-serious PR-029 phone block (kit fix after P-162, lead ruling 2026-10-07).
# Runs pfa14-run.sh inside the phone hold, then clears the thermal condition right after `lock.mjs run iphone`
# returns, so lock.mjs's end-of-hold condition read still sees the Serious the block ran under (no profileDrift).
# Run it in the background:
#   sh fixes/end-morph-f12/phone/pfa14-block.sh <ticket> <C port> <V port>
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ -n "$2" ] && [ -n "$3" ] || { echo "usage: sh fixes/end-morph-f12/phone/pfa14-block.sh <ticket> <C port> <V port>"; exit 2; }
O=out/fade/pfa14; mkdir -p $O
node tools/lock.mjs run iphone --owner fix-end-morph --block "$1" --max-seconds 1800 -- sh fixes/end-morph-f12/phone/pfa14-run.sh "$2" "$3"
rc=$?
node tools/thermal.mjs clear > $O/thermal-clear-$(date +%s).log 2>&1; cr=$?
echo "hold ended (exit $rc); thermal condition cleared after the hold (exit $cr)"
exit $rc
