#!/bin/sh
# nav-fade batch 3 (after batch 2): frozen-frame parity of the rest-state variants (maskr: mask carriers fill
# backwards only, so they drop their layer at rest; maskn: maskr without the button's clip-path, diagnostic) and the
# reduced-motion parity, Chrome and Simulator. Counts and frozen frames only, no timing.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
cd "$W" || exit 1
node tools/wait.mjs file "$1" --match '^EXIT batch2' --owner fix-nav-fade --reason "nav-fade batch 2 to finish" --timeout 7000 || exit 3
$L --weight probe --doing "nav-fade: look check of the rest-state variants (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--maskr,nav-fade--maskn --passes parity --label par3 > out/nav-fade/b3-chrome-par3.log 2>&1; echo "EXIT cp3 $?"
$L --weight probe --doing "nav-fade: look check with reduced motion (Chrome)" -- $P --engine chrome --reduce --arms C,C2=fixes/v9c/overlay,nav-fade--maskr,nav-fade --passes parity --pscen topIn,topOut,endOut --label red > out/nav-fade/b3-chrome-red.log 2>&1; echo "EXIT cr $?"
$L --weight simulator --doing "nav-fade: look check of the rest-state variant (Simulator) 1/2" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskr --passes parity --label par3 > out/nav-fade/b3-sim-par3.log 2>&1; echo "EXIT sp3 $?"
$L --weight simulator --doing "nav-fade: look check of the rest-state variant (Simulator) 2/2" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskn --passes parity --pscen topIn,endOut --label par4 > out/nav-fade/b3-sim-par4.log 2>&1; echo "EXIT sp4 $?"
$L --weight simulator --doing "nav-fade: look check with reduced motion (Simulator)" -- $S --reduce-motion on -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskr,nav-fade --passes parity --pscen topIn,endOut --label red > out/nav-fade/b3-sim-red.log 2>&1; echo "EXIT sr $?"
echo "EXIT batch3"
