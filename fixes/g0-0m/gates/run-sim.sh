#!/bin/sh
# g0.0m Simulator gate (pixels only): frozen-frame pixel A/A (A = g0.0l, V = g0.0m; loads A, V, A2, V2), iPhone Simulator
# 430x775, above, in and below the people section and back up, carousel frozen; one shared simulator slot (<= 300 s).
# usage: sh fixes/g0-0m/gates/run-sim.sh > out/g0-0m/gates-sim.log 2>&1   (background)
cd "$(dirname "$0")/../../.." || exit 2
O=fix-reveal-paint
PX_T0=${PX_T0:-14000} PX_CAROUSEL=freeze node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner $O --doing "g0.0m gates: Simulator pixels" -- \
  node tools/sim.mjs session --functional --owner $O -- node fixes/g0-0m/gates/px-sim.mjs 0,300,548,900,1300,2300,548u,0u A=C,V=V
echo "EXIT $?"
