#!/bin/sh
# g0.0m Chrome gates (counts and pixels only, no timing), each in its own shared chrome-measure slot (<= 300 s):
#  1. frozen-frame pixel A/A (A = g0.0l, V = g0.0m; loads A, V, A2, V2) above, in and below the people section, then back
#     up (stops 600u, 0u): mobile 430x932 (after the page clock reaches 12 s, so g0.0l's touch photo preload has run),
#     mobile with prefers-reduced-motion, desktop 1440x900
#  2. the hidden card's a11y / focus / hit-test difference (fixes/reveal-paint/rp-dom.mjs)
# (fix.mjs check g0-0m ran on its own: out/reveal-paint/check-g0m.log)
# usage: sh fixes/g0-0m/gates/run-chrome.sh > out/g0-0m/gates-chrome.log 2>&1   (background)
cd "$(dirname "$0")/../../.." || exit 2
O=fix-reveal-paint
YS=0,300,600,900,1300,1600,2300,3000,600u,0u
L() { node tools/lock.mjs run chrome-measure --shared --weight "$1" --max-seconds 300 --owner $O --doing "g0.0m gates: $2" -- sh -c "$3"; echo "STEP $2 exit $?"; }
L probe "pixels mobile" "PX_T0=12000 PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=$YS node fixes/g0-0m/gates/px-chrome.mjs mobile A=C,V=V"
L probe "pixels mobile reduced motion" "PX_RM=1 PX_CAROUSEL=freeze PX_YS=$YS node fixes/g0-0m/gates/px-chrome.mjs mobile A=C,V=V"
L probe "pixels desktop" "PX_T0=12000 PX_IMGS=1 PX_CAROUSEL=freeze PX_YS=$YS node fixes/g0-0m/gates/px-chrome.mjs desktop A=C,V=V"
L probe "a11y focus hit-test" "node fixes/reveal-paint/rp-dom.mjs 0,300,600,1400"
echo EXIT 0
