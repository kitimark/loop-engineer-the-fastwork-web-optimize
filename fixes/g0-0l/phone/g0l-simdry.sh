#!/bin/sh
# g0.0l card pre-data check (counts only, no timing; I-184): both G programs on the iPhone Simulator, arm C (g0.0k) then
# V (g0.0l), the FLICK with pb-lite injected. Answers: does the flick land with the deck in view, does V set the
# instant attribute and C not, are the deck photos loaded before the flick on V, does the approach reach y >= 3400.
# Runs INSIDE a functional Simulator session (servers from g0l-serve.sh, started by the caller):
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
#     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- sh fixes/g0-0l/phone/g0l-simdry.sh
cd "$(dirname "$0")/../../.." || exit 2
SV=out/g0lp
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
node tools/sim.mjs wda start || { echo "SIMDRY wda start failed"; exit 3; }
for A in C V; do
  P=$(port $A)
  node tools/sim.mjs open "http://localhost:$P/" > /dev/null || { echo "SIMDRY open $A failed"; continue; }
  node tools/sim.mjs gesture fixes/g0-0l/phone/g-flick-g0l.json --count-only --inject fixes/g0-0l/phone/pb-lite.mjs --label g0l-simdry-$A-f 2>&1 | grep -E '^(COUNT_ONLY|wrote|GESTURE_HASH|ERROR)' | cut -c1-300
  node tools/sim.mjs gesture fixes/g0-0l/phone/g-approach-g0l.json --count-only --label g0l-simdry-$A-a 2>&1 | grep -E '^(COUNT_ONLY|wrote|GESTURE_HASH|ERROR)' | cut -c1-300
done
node tools/sim.mjs wda stop > /dev/null 2>&1
echo "SIMDRY DONE"
