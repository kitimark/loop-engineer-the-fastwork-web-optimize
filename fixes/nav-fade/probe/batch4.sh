#!/bin/sh
# nav-fade batch 4 (after batch 3): look check of the combined rest-state arm (abr = A+B, mask carriers fill backwards)
# and repeated counts (n=3 per arm, one block per engine, same control C) for the D card. No timing.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
A=C,nav-fade--maskr,nav-fade--clip,nav-fade--abr,nav-fade--layer
cd "$W" || exit 1
node tools/wait.mjs file "$1" --match '^EXIT batch3' --owner fix-nav-fade --reason "nav-fade batch 3 to finish" --timeout 7000 || exit 3
$L --weight simulator --doing "nav-fade: look check of the combined arm (Simulator)" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--abr --passes parity --label par5 > out/nav-fade/b4-sim-par5.log 2>&1; echo "EXIT sp5 $?"
$L --weight probe --doing "nav-fade: look check of the combined arm (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--abr --passes parity --label par5 > out/nav-fade/b4-chrome-par5.log 2>&1; echo "EXIT cp5 $?"
$L --weight probe --doing "nav-fade: repaint counts per arm (Chrome) run 1 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n1 > out/nav-fade/b4-chrome-n1.log 2>&1; echo "EXIT cn1 $?"
$L --weight probe --doing "nav-fade: repaint counts per arm (Chrome) run 2 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n2 > out/nav-fade/b4-chrome-n2.log 2>&1; echo "EXIT cn2 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 1 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n1 > out/nav-fade/b4-sim-n1.log 2>&1; echo "EXIT sn1 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 2 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n2 > out/nav-fade/b4-sim-n2.log 2>&1; echo "EXIT sn2 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 3 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n3 > out/nav-fade/b4-sim-n3.log 2>&1; echo "EXIT sn3 $?"
echo "EXIT batch4"
