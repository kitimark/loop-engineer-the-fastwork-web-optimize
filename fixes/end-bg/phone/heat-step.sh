#!/bin/sh
# Heat step before each chrome-measure hold of a phone block (P-137o block 2 and P-095o, cap-end-orig, 2026-10-11).
# Why: part 1's end gate read Critical at 41.5 C (the battery rose ~0.4 C/min of runs under tool-held Serious). It runs in
# the phone hold BETWEEN the block's chrome-measure holds, so the 600 s Mac hold and its time guard start after it (a
# first try inside the Mac hold ate 240 s of it and the next gesture was refused for budget, I-112: block 2 try 1, H2).
#   sh fixes/end-bg/phone/heat-step.sh <owner> <log dir> <hold name>
# 1. iphone.mjs profile (one thermal read). Misfit (exit 8, e.g. Critical): iphone.mjs rearm --settle 120 (clear, wait for
#    Fair, set Serious, settle); rearm failing -> exit 5.
# 2. wait.mjs phone-temp --below 39 (at most 10 min) under the held condition.
# Prints HEAT lines; exit 0, or 5 when the re-arm failed. Prints no LAN address.
cd "$(dirname "$0")/../../.." || exit 2
R=$1; L=$2; H=$3
[ -n "$R" ] && [ -n "$L" ] && [ -n "$H" ] || { echo "usage: sh fixes/end-bg/phone/heat-step.sh <owner> <log dir> <hold>"; exit 2; }
mkdir -p "$L"
export FW_PHONE_CONDITION=tool
node tools/iphone.mjs profile --owner "$R" > "$L/$H-heat.log" 2>&1; hp=$?
echo "HEAT pre $H profile exit $hp: $(tail -1 "$L/$H-heat.log" | cut -c1-160)"
if [ $hp -eq 8 ]; then
  node tools/iphone.mjs rearm --owner "$R" --settle 120 > "$L/$H-rearm.log" 2>&1; re=$?
  echo "HEAT rearm exit $re: $(grep '^REARM' "$L/$H-rearm.log" | tail -1 | cut -c1-160)"
  [ $re -eq 0 ] || exit 5
fi
node tools/wait.mjs phone-temp --below 39 --timeout 600 --owner "$R" --reason "cool below 39 C before hold $H" > "$L/$H-cool.log" 2>&1; ce=$?
echo "HEAT cool exit $ce: $(tail -1 "$L/$H-cool.log" | cut -c1-160)"
exit 0
