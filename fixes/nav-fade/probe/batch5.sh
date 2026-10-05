#!/bin/sh
# nav-fade batch 5: frozen-frame parity with the fixed freeze (only animations the state change started are set to t;
# batches 1-3 also rewound the long-finished top sweep at the end scenes), reduced motion in the Simulator, and
# repeated counts (one block per engine, same control C). Counts and frozen frames only, no timing.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
A=C,nav-fade--maskr,nav-fade--clip,nav-fade--abr,nav-fade--layer
cd "$W" || exit 1
$L --weight probe --doing "nav-fade: look check, GPU sweep arms (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--maskr,nav-fade--mask --passes parity --label p5a > out/nav-fade/b5-chrome-p5a.log 2>&1; echo "EXIT c5a $?"
$L --weight probe --doing "nav-fade: look check, GPU clip arms (Chrome)" -- $P --engine chrome --arms C,C2=fixes/v9c/overlay,nav-fade--clip,nav-fade--abr --passes parity --label p5b > out/nav-fade/b5-chrome-p5b.log 2>&1; echo "EXIT c5b $?"
$L --weight simulator --doing "nav-fade: look check, GPU sweep arm (Simulator)" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskr --passes parity --label p5a > out/nav-fade/b5-sim-p5a.log 2>&1; echo "EXIT s5a $?"
$L --weight simulator --doing "nav-fade: look check, combined arm (Simulator)" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--abr --passes parity --label p5b > out/nav-fade/b5-sim-p5b.log 2>&1; echo "EXIT s5b $?"
$L --weight simulator --doing "nav-fade: look check, GPU clip arm (Simulator)" -- $S -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--clip --passes parity --label p5c > out/nav-fade/b5-sim-p5c.log 2>&1; echo "EXIT s5c $?"
$L --weight simulator --doing "nav-fade: look check with reduced motion (Simulator)" -- $S --reduce-motion on -- $P --engine sim --arms C,C2=fixes/v9c/overlay,nav-fade--maskr,nav-fade--abr --passes parity --pscen topIn,endOut --label red > out/nav-fade/b5-sim-red.log 2>&1; echo "EXIT sr $?"
$L --weight probe --doing "nav-fade: repaint counts per arm (Chrome) run 1 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n1 > out/nav-fade/b5-chrome-n1.log 2>&1; echo "EXIT cn1 $?"
$L --weight probe --doing "nav-fade: repaint counts per arm (Chrome) run 2 of 2" -- $P --engine chrome --arms $A --passes counts --scen topIn,glideThru,end --label n2 > out/nav-fade/b5-chrome-n2.log 2>&1; echo "EXIT cn2 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 1 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n1 > out/nav-fade/b5-sim-n1.log 2>&1; echo "EXIT sn1 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 2 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n2 > out/nav-fade/b5-sim-n2.log 2>&1; echo "EXIT sn2 $?"
$L --weight simulator --doing "nav-fade: repaint counts per arm (Simulator) run 3 of 3" -- $S -- $P --engine sim --arms $A --passes counts --scen topIn --label n3 > out/nav-fade/b5-sim-n3.log 2>&1; echo "EXIT sn3 $?"
echo "EXIT batch5"
