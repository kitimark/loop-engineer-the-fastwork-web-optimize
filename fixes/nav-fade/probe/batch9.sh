#!/bin/sh
# nav-fade batch 9: Simulator counts on the landed v9-final base (C = fixes/v9-best overlay, JS 647c9ef2b1e2 / CSS
# e1359ab9994a; nav-fade JS a03872195d3f / CSS 9646fc3da77a). 4 runs per scene (labels t9c-t9f, e9c-e9f), topIn and end
# alternating, each run = one Simulator session with both arms (C first, then nav-fade, as in batch 8). Counts only, no
# timing. Decision rule: README "Batch 9 rule" (committed before any data). Read with probe/simcount.mjs.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
B=C=fixes/v9-best/overlay,nav-fade
cd "$W" || exit 1
for i in c d e f; do
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts top (Simulator) $i of c-f" -- $S -- $P --engine sim --arms $B --passes counts --scen topIn --label t9$i > out/nav-fade/b9-sim-t9$i.log 2>&1; echo "EXIT s9t$i $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts end (Simulator) $i of c-f" -- $S -- $P --engine sim --arms $B --passes counts --scen end --label e9$i > out/nav-fade/b9-sim-e9$i.log 2>&1; echo "EXIT s9e$i $?"
done
echo "EXIT batch9"
