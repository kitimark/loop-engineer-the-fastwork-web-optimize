#!/bin/sh
# nav-fade batch 7 (after batch 6): counts for the current candidates (maski, maskj = mask only during the sweep,
# abri) and the look check of maskj (normal + reduced motion), Chrome and Simulator. Counts and frozen frames only.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
A=C=fixes/v9c/overlay,nav-fade--maski,nav-fade--maskj,nav-fade--abri
cd "$W" || exit 1
node tools/wait.mjs file "$1" --match '^EXIT batch6' --owner fix-nav-fade --reason "nav-fade batch 6 to finish" --timeout 7000 || exit 3
$L --weight probe --doing "nav-fade: repaint counts, candidates (Chrome) run 1 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n7a > out/nav-fade/b7-chrome-n7a.log 2>&1; echo "EXIT c7n1 $?"
$L --weight probe --doing "nav-fade: repaint counts, candidates (Chrome) run 2 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n7b > out/nav-fade/b7-chrome-n7b.log 2>&1; echo "EXIT c7n2 $?"
$L --weight probe --doing "nav-fade: look check, mask only during the sweep (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--maskj --passes parity --label p7 > out/nav-fade/b7-chrome-p7.log 2>&1; echo "EXIT c7p $?"
$L --weight probe --doing "nav-fade: look check, mask only during the sweep, reduced motion (Chrome)" -- $P --engine chrome --reduce --arms C,C2=fixes/v9c/overlay,nav-fade--maskj --passes parity --pscen topIn,endOut --label red7 > out/nav-fade/b7-chrome-red7.log 2>&1; echo "EXIT c7r $?"
$L --weight simulator --doing "nav-fade: look check, mask only during the sweep (Simulator)" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskj --passes parity --label p7 > out/nav-fade/b7-sim-p7.log 2>&1; echo "EXIT s7p $?"
$L --weight simulator --doing "nav-fade: repaint counts at the top (Simulator) run 1 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen topIn --label t7a > out/nav-fade/b7-sim-t7a.log 2>&1; echo "EXIT s7t1 $?"
$L --weight simulator --doing "nav-fade: repaint counts at the end (Simulator) run 1 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen end --label e7a > out/nav-fade/b7-sim-e7a.log 2>&1; echo "EXIT s7e1 $?"
$L --weight simulator --doing "nav-fade: repaint counts at the top (Simulator) run 2 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen topIn --label t7b > out/nav-fade/b7-sim-t7b.log 2>&1; echo "EXIT s7t2 $?"
$L --weight simulator --doing "nav-fade: repaint counts at the end (Simulator) run 2 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen end --label e7b > out/nav-fade/b7-sim-e7b.log 2>&1; echo "EXIT s7e2 $?"
$L --weight simulator --doing "nav-fade: repaint counts at the top (Simulator) run 3 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen topIn --label t7c > out/nav-fade/b7-sim-t7c.log 2>&1; echo "EXIT s7t3 $?"
$L --weight simulator --doing "nav-fade: repaint counts at the end (Simulator) run 3 of 3" -- $S -- $P --engine sim --arms C,nav-fade--maskj,nav-fade--abri --passes counts --scen end --label e7c > out/nav-fade/b7-sim-e7c.log 2>&1; echo "EXIT s7e3 $?"
$L --weight simulator --doing "nav-fade: look check, mask only during the sweep, reduced motion (Simulator)" -- $S --reduce-motion on -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskj --passes parity --pscen topIn,endOut --label red7 > out/nav-fade/b7-sim-red7.log 2>&1; echo "EXIT s7r $?"
echo "EXIT batch7"
