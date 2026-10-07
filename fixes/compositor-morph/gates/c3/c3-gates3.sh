#!/bin/sh
# c3 (rev 2: toolbar re-measure debounced 300 ms, no per-resize timer) gates, all again on the final build.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a69d59b114a666097
cd $W
sess() {
  node $W/tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds "$1" --owner arch-compositor-morph \
    --doing "c3 Simulator check (counts and pixels only)" -- node $W/tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c "$2"
}
probe() {
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-compositor-morph --doing "c3 Chrome check (classes, no timing)" -- sh -c "$1"
}
sess 300 'node tools/sim.mjs wda start && node out/cm/open0-sim.mjs V12=out/cm/v12 C3=out/cm/c3' > out/cm/c3r2-open0.log 2>&1; echo "open0 exit $?"
sess 300 'node tools/sim.mjs wda start && node out/cm/stale-sim.mjs C3=out/cm/c3' > out/cm/c3r2-stale.log 2>&1; echo "stale exit $?"
probe 'node fixes/compositor-morph/gates/c2trace.mjs --arms V12=out/cm/v12,C3=out/cm/c3 > out/cm/c3r2trace-AB.log 2>&1'; echo "trace exit $?"
probe 'node fixes/compositor-morph/gates/c2cover.mjs --arms V12=out/cm/v12,C3=out/cm/c3 --h 775 > out/cm/c3r2cover-775.log 2>&1'; echo "cover 775 exit $?"
probe 'node fixes/compositor-morph/gates/c2cover.mjs --arms V12=out/cm/v12,C3=out/cm/c3 --h 815 > out/cm/c3r2cover-815.log 2>&1'; echo "cover 815 exit $?"
sess 300 'node out/cm/simswitch2.mjs --arms C3=out/cm/c3 --ref out/cm/simswitch-2026-10-07T06-16-50-628Z' > out/cm/c3r2-glass.log 2>&1; echo "glass exit $?"
for r in 1 2 3; do
  sess 180 "node fixes/compositor-morph/gates/cm-sim.mjs --arms $W/out/cm/c3 --cold --stack 6 --label c3r2B$r" > out/cm/c3r2sim-B$r.log 2>&1; echo "sim B$r exit $?"
done
echo EXIT-C3-GATES3
