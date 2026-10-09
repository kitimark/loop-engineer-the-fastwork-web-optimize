#!/bin/sh
# g0.0m phone kit (fix-reveal-paint, 2026-10-09; card: fixes/g0-0m/README.md "Phone check card"): a text-substitution copy of
# P-174's kit (fixes/g0-0l/phone/, fix-scrollcb-g0; credit it and its lineage below) with: logs out/g0mp, labels g0m-, owner
# fix-reveal-paint, snapshot out/g0-0m/snap (fixes/g0-0m/phone/g0m-snap.sh, HASHES.txt e7947589f4c9) and these pins (the
# headers below name the older arms; the code's pins are these):
#   C = g0.0l (best on main, fixes/g0-0l)                  JS 4106679e0a8a  CSS 440582cec781
#   V = g0.0m rev 3 = g0.0l + reveal-paint (fixes/g0-0m)  JS 37af49aef32b  CSS 7a8ecdd8f8e4
# The two G programs are byte-identical copies of P-174's (compiled 22b636f36a82 / 65f6de58009c).
# g0.0l card pre-data check (counts only, no timing; I-184): both G programs on the iPhone Simulator, arm C (g0.0k) then
# V (g0.0l), the FLICK with pb-lite injected. Answers: does the flick land with the deck in view, does V set the
# instant attribute and C not, are the deck photos loaded before the flick on V, does the approach reach y >= 3400.
# Runs INSIDE a functional Simulator session (servers from g0l-serve.sh, started by the caller):
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-reveal-paint -- \
#     node tools/sim.mjs session --functional --owner fix-reveal-paint -- sh fixes/g0-0m/phone/g0m-simdry.sh
cd "$(dirname "$0")/../../.." || exit 2
SV=out/g0mp
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
node tools/sim.mjs wda start || { echo "SIMDRY wda start failed"; exit 3; }
for A in C V; do
  P=$(port $A)
  node tools/sim.mjs open "http://localhost:$P/" > /dev/null || { echo "SIMDRY open $A failed"; continue; }
  node tools/sim.mjs gesture fixes/g0-0m/phone/g-flick-g0m.json --count-only --inject fixes/g0-0m/phone/pb-lite.mjs --label g0m-simdry-$A-f 2>&1 | grep -E '^(COUNT_ONLY|wrote|GESTURE_HASH|ERROR)' | cut -c1-300
  node tools/sim.mjs gesture fixes/g0-0m/phone/g-approach-g0m.json --count-only --label g0m-simdry-$A-a 2>&1 | grep -E '^(COUNT_ONLY|wrote|GESTURE_HASH|ERROR)' | cut -c1-300
done
node tools/sim.mjs wda stop > /dev/null 2>&1
echo "SIMDRY DONE"
