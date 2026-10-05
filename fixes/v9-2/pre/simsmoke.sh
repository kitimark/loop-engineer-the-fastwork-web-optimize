#!/bin/sh
# int-v8, P-142 pre-data: sim92.mjs mechanics smoke on arm C (v9-final + 7d: not a P-142 arm), after geo92.
cd /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05 || exit 2
L=out/v92/looks.log
node tools/wait.mjs file $L --match '^GEO92DONE' --owner int-v8 --reason "P-142 geometry check to finish" --timeout 7000 || exit 3
mkdir -p out/v92/sim
echo "=== sim92 smoke C:1 $(date -u +%H:%M:%SZ)" >> $L
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: Simulator census tool smoke test on a non-ticket arm (no timing)" -- node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-2/sim92.mjs out/v92/sim/smoke.json C:1 >> $L 2>&1
echo "EXIT $? sim92 smoke" >> $L
echo "SMOKEDONE $(date -u +%H:%M:%SZ)" >> $L
