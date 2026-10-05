#!/bin/sh
# nav-fade D-card batch 1: every job its own shared-lane hold (counts and frozen frames only, no timing)
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade --"
SC=topIn,topOut,glideThru,end
cd "$W" || exit 1
$L --weight probe --doing "nav-fade arms: per-frame values and repaint counts (Chrome) 1/2" -- $P --engine chrome --arms C,nav-fade--mask,nav-fade--layer --scen $SC --label d1 > out/nav-fade/b1-chrome-1.log 2>&1; echo "EXIT c1 $?"
$L --weight probe --doing "nav-fade arms: per-frame values and repaint counts (Chrome) 2/2" -- $P --engine chrome --arms C,nav-fade--clip,nav-fade --scen $SC --label d2 > out/nav-fade/b1-chrome-2.log 2>&1; echo "EXIT c2 $?"
$L --weight probe --doing "nav-fade arms: frozen-frame pixel parity (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--mask,nav-fade--clip,nav-fade --passes parity --label par > out/nav-fade/b1-chrome-par.log 2>&1; echo "EXIT cp $?"
$L --weight simulator --doing "nav-fade arms: per-frame values and repaint counts (Simulator) 1/2" -- $S $P --engine sim --arms C,nav-fade--mask,nav-fade--clip --scen topIn,glideThru,end --label d1 > out/nav-fade/b1-sim-1.log 2>&1; echo "EXIT s1 $?"
$L --weight simulator --doing "nav-fade arms: per-frame values and repaint counts (Simulator) 2/2" -- $S $P --engine sim --arms nav-fade--layer,nav-fade --scen topIn,glideThru,end --label d2 > out/nav-fade/b1-sim-2.log 2>&1; echo "EXIT s2 $?"
$L --weight simulator --doing "nav-fade arms: frozen-frame pixel parity (Simulator) 1/2" -- $S $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--mask --passes parity --label par1 > out/nav-fade/b1-sim-par1.log 2>&1; echo "EXIT sp1 $?"
$L --weight simulator --doing "nav-fade arms: frozen-frame pixel parity (Simulator) 2/2" -- $S $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--clip,nav-fade --passes parity --label par2 > out/nav-fade/b1-sim-par2.log 2>&1; echo "EXIT sp2 $?"
echo "EXIT batch"
