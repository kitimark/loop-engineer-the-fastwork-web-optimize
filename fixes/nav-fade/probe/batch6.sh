#!/bin/sh
# nav-fade batch 6 (after batch 5): look check of the variants without isolation on .fw-nf-mki (maski, abri), normal
# and reduced motion, Chrome and Simulator. Frozen frames only, no timing.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
cd "$W" || exit 1
node tools/wait.mjs file "$1" --match '^EXIT batch5' --owner fix-nav-fade --reason "nav-fade batch 5 to finish" --timeout 7000 || exit 3
$L --weight probe --doing "nav-fade: look check without isolation (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--maski,nav-fade--abri --passes parity --label p6 > out/nav-fade/b6-chrome-p6.log 2>&1; echo "EXIT c6 $?"
$L --weight probe --doing "nav-fade: look check without isolation, reduced motion (Chrome)" -- $P --engine chrome --reduce --arms C,C2=fixes/v9c/overlay,nav-fade--maski,nav-fade--abri --passes parity --pscen topIn,endOut --label red6 > out/nav-fade/b6-chrome-red6.log 2>&1; echo "EXIT c6r $?"
$L --weight simulator --doing "nav-fade: look check without isolation (Simulator) 1/2" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maski --passes parity --label p6a > out/nav-fade/b6-sim-p6a.log 2>&1; echo "EXIT s6a $?"
$L --weight simulator --doing "nav-fade: look check without isolation (Simulator) 2/2" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--abri --passes parity --label p6b > out/nav-fade/b6-sim-p6b.log 2>&1; echo "EXIT s6b $?"
$L --weight simulator --doing "nav-fade: look check without isolation, reduced motion (Simulator)" -- $S --reduce-motion on -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maski,nav-fade--abri --passes parity --pscen topIn,endOut --label red6 > out/nav-fade/b6-sim-red6.log 2>&1; echo "EXIT s6r $?"
echo "EXIT batch6"
