#!/bin/sh
# nav-fade batch 2 (after batch 1): Chrome per-frame values again (batch 1's Chrome motion passes hit a sampler bug)
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-aba87d90ba0eb8282
cd "$W" || exit 1
node tools/wait.mjs file "$1" --match '^EXIT batch' --owner fix-nav-fade --reason "nav-fade batch 1 to finish" --timeout 7000 || exit 3
node tools/lock.mjs run chrome-measure --shared --max-seconds 300 --owner fix-nav-fade --weight probe --doing "nav-fade arms: per-frame values (Chrome)" -- node fixes/nav-fade/probe/motion.mjs --engine chrome --arms C,nav-fade--mask,nav-fade--clip,nav-fade--layer,nav-fade --passes motion --scen topIn,topOut,glideThru,end --label mo > out/nav-fade/b2-chrome-mo.log 2>&1; echo "EXIT cm $?"
echo "EXIT batch2"
