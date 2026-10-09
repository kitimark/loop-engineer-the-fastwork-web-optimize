#!/bin/sh
# g0.0l Simulator gate (pixels only): frozen-frame pixel A/A (A = g0.0k, V = g0.0l; loads A, V, A2, V2), iPhone Simulator
# 430x775, above, in and below the people section, carousel frozen; one shared simulator slot (<= 300 s).
# usage: sh fixes/g0-0l/gates/run-sim.sh > out/g0-0l/gates-sim.log 2>&1   (background)
cd "$(dirname "$0")/../../.." || exit 2
O=fix-scrollcb-g0
PX_CAROUSEL=freeze node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner $O --doing "g0.0l gates: Simulator pixels" -- \
  node tools/sim.mjs session --functional --owner $O -- node fixes/g0-0l/gates/px-sim.mjs 0,548,900,1300,1600,2300,3000 A=C,V=V
echo "EXIT $?"
