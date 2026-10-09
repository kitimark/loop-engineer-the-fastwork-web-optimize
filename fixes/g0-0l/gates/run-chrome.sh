#!/bin/sh
# g0.0l Chrome gates (counts and pixels only, no timing), each in its own shared chrome-measure slot (<= 300 s):
#  1. fix.mjs check on g0.0k (fixes/people-blink overlay = g0.0k) and g0.0l: console errors and 404s, mobile + desktop
#  2. frozen-frame pixel A/A (A = g0.0k, V = g0.0l; loads A, V, A2, V2) above, in and below the people section:
#     mobile 430x932, mobile with prefers-reduced-motion, desktop 1440x900
# usage: sh fixes/g0-0l/gates/run-chrome.sh > out/g0-0l/gates-chrome.log 2>&1   (background)
cd "$(dirname "$0")/../../.." || exit 2
O=fix-scrollcb-g0
YS=0,300,600,900,1300,1600,2300,3000
L() { node tools/lock.mjs run chrome-measure --shared --weight "$1" --max-seconds 300 --owner $O --doing "g0.0l gates: $2" -- sh -c "$3"; echo "STEP $2 exit $?"; }
L check "errors and 404s, g0.0k" 'node tools/fix.mjs check people-blink --viewport both --no-screens'
L check "errors and 404s, g0.0l" 'node tools/fix.mjs check g0-0l --viewport both --no-screens'
L probe "pixels mobile" "PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=$YS node fixes/g0-0l/gates/px-chrome.mjs mobile A=C,V=V"
L probe "pixels mobile reduced motion" "PX_RM=1 PX_CAROUSEL=freeze PX_YS=$YS node fixes/g0-0l/gates/px-chrome.mjs mobile A=C,V=V"
L probe "pixels desktop" "PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=0,300,600,900,1300,1600,2300,3000 node fixes/g0-0l/gates/px-chrome.mjs desktop A=C,V=V"
echo EXIT 0
