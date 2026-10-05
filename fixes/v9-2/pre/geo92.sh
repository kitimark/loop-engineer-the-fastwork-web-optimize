#!/bin/sh
# int-v8, P-142 pre-data: nav-fade window geometry (geo92.mjs, Chrome 430x775), after look92.sh, one shared probe.
cd /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05 || exit 2
L=out/v92/looks.log
node tools/wait.mjs file $L --match '^LOOK92DONE' --owner int-v8 --reason "P-142 pre-data checks to finish" --timeout 7000 || exit 3
echo "=== geo92 F,V $(date -u +%H:%M:%SZ)" >> $L
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: nav-fade window geometry check (no timing)" -- node fixes/v9-2/geo92.mjs F,V >> $L 2>&1
echo "EXIT $? geo92" >> $L
echo "GEO92DONE $(date -u +%H:%M:%SZ)" >> $L
