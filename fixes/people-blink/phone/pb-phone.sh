#!/bin/sh
# people-blink phone attribution part (lead 2026-10-09, user T-228 #149/#151): the deck-landing fling on the real iPhone.
# Runs INSIDE one phone hold (no block, no counted runs, attribution only):
#   node tools/lock.mjs run iphone --owner fix-scrollcb-g0 --max-seconds 900 -- sh fixes/people-blink/phone/pb-phone.sh
# Servers: fixes/sticky-walk/phone/sw-serve.sh (snapshot out/sticky-walk/snap-i, hashes checked; V = g0.0j, B = baseline),
# started by the caller. Arms: V (g0.0j), B (baseline), K (g0.0j + the reveal knock-out, injected by pb-log.mjs for a
# label ending in -K). Per arm: Safari opens the arm's plain-http twin, ioscap records the screen (numbers only, I-062;
# the user allowed recording, T-228 #151; nobody views or decodes frames), and one G run of pb-land.json (4 reloads,
# each with one fast flick that should land with the deck in view) with the page logger and a WebKit Timeline.
# Thermal: --profile fair in tool mode (attribution, no heat induction); a refusal retries once with real-serious.
# Nothing here prints the LAN address: URLs are http://lan:<port>/ (I-073, I-119; Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
O=fix-scrollcb-g0; S=out/swp; OUT=out/pbp; mkdir -p $OUT
export FW_PHONE_CONDITION=tool
TS=$(date -u +%Y%m%dT%H%M%SZ)
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
node tools/iphone.mjs wda ensure --owner $O || { echo "PB STOP: WDA not ready"; exit 3; }
PROFILE=fair
for ARM in ${PB_ARMS:-V B K}; do
  case $ARM in K) SRV=V ;; *) SRV=$ARM ;; esac
  P=$(port $SRV)
  node tools/iphone.mjs open "http://lan:$P/" --owner $O > $OUT/open-$ARM-$TS.log 2>&1 || { echo "PB open failed for $ARM"; continue; }
  node -e "const t=process.hrtime.bigint();console.log(JSON.stringify({arm:'$ARM',wallMs:Date.now(),hostSec:Number(t)/1e9}))" > $OUT/clock-$ARM-$TS.json
  node tools/ioscap.mjs record --owner $O --seconds 170 --label pb-$ARM-$TS > $OUT/ioscap-$ARM-$TS.log 2>&1 &
  CP=$!
  sleep 2
  for TRY in 1 2 3; do
    node tools/iphone.mjs gesture fixes/people-blink/phone/pb-land.json --owner $O --label pb-$ARM \
      --inject fixes/people-blink/phone/pb-log.mjs --timeline $OUT/tl-$ARM-$TS.json --profile $PROFILE \
      --out $OUT/g-$ARM-$TS.json > $OUT/g-$ARM-$TS.log 2>&1
    rc=$?
    [ $rc -eq 8 ] && [ $TRY -eq 1 ] && { echo "PB $ARM: profile $PROFILE refused, retry with real-serious"; tail -3 $OUT/g-$ARM-$TS.log; PROFILE=real-serious; continue; }
    # first try 06:43Z: B and K lost the tab right after open ("no Safari tab", proxy targets none): open again, retry
    if [ $rc -eq 1 ] && grep -q "no Safari tab" $OUT/g-$ARM-$TS.log && [ $TRY -lt 3 ]; then
      echo "PB $ARM: no Safari tab after open (try $TRY), opening again"; sleep 3
      node tools/iphone.mjs open "http://lan:$P/" --owner $O >> $OUT/open-$ARM-$TS.log 2>&1; sleep 3; continue
    fi
    break
  done
  echo "PB $ARM gesture exit $rc"; tail -4 $OUT/g-$ARM-$TS.log
  sleep 2; kill -TERM $CP 2>/dev/null; wait $CP
  tail -5 $OUT/ioscap-$ARM-$TS.log
  [ $rc -eq 8 ] && { echo "PB STOP: thermal gate refused both profiles"; break; }
done
node tools/iphone.mjs park --owner $O > /dev/null 2>&1
echo "PB DONE $TS"
