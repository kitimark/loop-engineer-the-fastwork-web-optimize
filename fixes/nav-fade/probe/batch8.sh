#!/bin/sh
# nav-fade batch 8: the landed v9-final as control (fix.mjs apply v9-best --reset at d4830f1e: JS 647c9ef2b1e2 / CSS
# e1359ab9994a) and nav-fade rebuilt on it (delta nav-fade-on-v9final.diff). Counts, frozen frames with per-frame
# geometry (mask edge, button, earn box) for the 1-device-px check. No timing.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
A=C=fixes/v9-best/overlay,C2=fixes/v9-best/overlay,nav-fade
B=C=fixes/v9-best/overlay,nav-fade
cd "$W" || exit 1
$L --weight probe --doing "nav-fade on landed v9-final: look + geometry (Chrome)" -- $P --engine chrome --arms $A --passes parity --label p8 > out/nav-fade/b8-chrome-p8.log 2>&1; echo "EXIT c8p $?"
$L --weight probe --doing "nav-fade on landed v9-final: repaint counts (Chrome) 1 of 2" -- $P --engine chrome --arms $B --passes counts --scen topIn,glideThru,end --label n8a > out/nav-fade/b8-chrome-n8a.log 2>&1; echo "EXIT c8n1 $?"
$L --weight probe --doing "nav-fade on landed v9-final: repaint counts (Chrome) 2 of 2" -- $P --engine chrome --arms $B --passes counts --scen topIn,glideThru,end --label n8b > out/nav-fade/b8-chrome-n8b.log 2>&1; echo "EXIT c8n2 $?"
$L --weight probe --doing "nav-fade on landed v9-final: look, reduced motion (Chrome)" -- $P --engine chrome --reduce --arms $A --passes parity --pscen topIn,endOut --label red8 > out/nav-fade/b8-chrome-red8.log 2>&1; echo "EXIT c8r $?"
$L --weight simulator --doing "nav-fade on landed v9-final: look + geometry (Simulator)" -- $S -- $P --engine sim --arms $A --passes parity --label p8 > out/nav-fade/b8-sim-p8.log 2>&1; echo "EXIT s8p $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts top (Simulator) 1 of 2" -- $S -- $P --engine sim --arms $B --passes counts --scen topIn --label t8a > out/nav-fade/b8-sim-t8a.log 2>&1; echo "EXIT s8t1 $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts end (Simulator) 1 of 2" -- $S -- $P --engine sim --arms $B --passes counts --scen end --label e8a > out/nav-fade/b8-sim-e8a.log 2>&1; echo "EXIT s8e1 $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts top (Simulator) 2 of 2" -- $S -- $P --engine sim --arms $B --passes counts --scen topIn --label t8b > out/nav-fade/b8-sim-t8b.log 2>&1; echo "EXIT s8t2 $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts end (Simulator) 2 of 2" -- $S -- $P --engine sim --arms $B --passes counts --scen end --label e8b > out/nav-fade/b8-sim-e8b.log 2>&1; echo "EXIT s8e2 $?"
$L --weight simulator --doing "nav-fade on landed v9-final: look, reduced motion (Simulator)" -- $S --reduce-motion on -- $P --engine sim --arms $A --passes parity --pscen topIn,endOut --label red8 > out/nav-fade/b8-sim-red8.log 2>&1; echo "EXIT s8r $?"
echo "EXIT batch8"
