#!/bin/sh
# nav-fade batch 9, remainder: batch9.sh (5f86f5e7f4f7) was stopped at the 2 h background limit at 14:01Z after
# sessions c and d (t9c, e9c, t9d, e9d, all exit 0) while queued for e. These are its sessions e and f, the same
# commands. Counts only, no timing; rule README "Batch 9 rule", scorer probe/simcount.mjs.
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
L="node $W/tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade"
P="node $W/fixes/nav-fade/probe/motion.mjs"
S="node $W/tools/sim.mjs session --functional --owner fix-nav-fade"
B=C=fixes/v9-best/overlay,nav-fade
cd "$W" || exit 1
for i in e f; do
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts top (Simulator) $i of c-f" -- $S -- $P --engine sim --arms $B --passes counts --scen topIn --label t9$i > out/nav-fade/b9-sim-t9$i.log 2>&1; echo "EXIT s9t$i $?"
$L --weight simulator --doing "nav-fade on landed v9-final: repaint counts end (Simulator) $i of c-f" -- $S -- $P --engine sim --arms $B --passes counts --scen end --label e9$i > out/nav-fade/b9-sim-e9$i.log 2>&1; echo "EXIT s9e$i $?"
done
echo "EXIT batch9"
