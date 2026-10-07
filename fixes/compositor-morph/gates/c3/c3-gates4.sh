#!/bin/sh
# c3 rev 3 (answers kept only when the last real hit test was near the end zone): stale proof, open-0 stacks,
# Chrome parity and coverage again.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a69d59b114a666097
cd $W
sess() {
  node $W/tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds "$1" --owner arch-compositor-morph \
    --doing "c3 Simulator check (counts only)" -- node $W/tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c "$2"
}
probe() {
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-compositor-morph --doing "c3 Chrome check (classes, no timing)" -- sh -c "$1"
}
sess 300 'node tools/sim.mjs wda start && node out/cm/stale-sim.mjs C3=out/cm/c3' > out/cm/c3r3-stale.log 2>&1; echo "stale exit $?"
sess 300 'node tools/sim.mjs wda start && node out/cm/open0-sim.mjs V12=out/cm/v12 C3=out/cm/c3' > out/cm/c3r3-open0.log 2>&1; echo "open0 exit $?"
probe 'node fixes/compositor-morph/gates/c2trace.mjs --arms V12=out/cm/v12,C3=out/cm/c3 > out/cm/c3r3trace-AB.log 2>&1'; echo "trace exit $?"
probe 'node fixes/compositor-morph/gates/c2cover.mjs --arms V12=out/cm/v12,C3=out/cm/c3 --h 775 > out/cm/c3r3cover-775.log 2>&1'; echo "cover 775 exit $?"
probe 'node fixes/compositor-morph/gates/c2cover.mjs --arms V12=out/cm/v12,C3=out/cm/c3 --h 815 > out/cm/c3r3cover-815.log 2>&1'; echo "cover 815 exit $?"
echo EXIT-C3-GATES4
