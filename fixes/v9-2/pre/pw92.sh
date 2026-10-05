#!/bin/sh
# int-v8, P-142: fix-people-word's functional probe (copy out/v92pw/probe.mjs, sha 923112f9b554) on Opw (C + pw = the
# accepted Try-it B bytes, bf75ce87958c) and V (v9.2). Run inside a shared probe hold (look92b.sh).
cd /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05 || exit 2
S=${P142_SNAP:-out/v92/snap-30f6371751f4}   # rev 1.1 ran on out/v92/snap-6468db04395c (never reached: stopped)
O=out/v92pw
rm -f $O/serve-Opw.json $O/serve-V.json
node tools/serve.mjs --root site-pretty --overlay $S/Opw --port 0 --quiet --no-cache --state $O/serve-Opw.json --vendors=local --no-http-twin &
P1=$!
node tools/serve.mjs --root site-pretty --overlay $S/V --port 0 --quiet --no-cache --state $O/serve-V.json --vendors=local --no-http-twin &
P2=$!
node tools/wait.mjs serve $O/serve-Opw.json --pid $P1 --owner int-v8 --reason "P-142 people-word probe server B" --timeout 60 > $O/url-Opw.txt
node tools/wait.mjs serve $O/serve-V.json --pid $P2 --owner int-v8 --reason "P-142 people-word probe server V" --timeout 60 > $O/url-V.txt
U1=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$O/serve-Opw.json','utf8')).url)")
U2=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$O/serve-V.json','utf8')).url)")
# out/v92pw/probe.mjs = fixes/v9-2/pre/pw-probe.mjs (923112f9b554; it imports ../../tools, so it runs from out/v92pw).
# rev 1.2 fix: the first rev 1.2 run (16:52Z) had this comment inside the command line, so the targets were dropped
# and the probe wrote "results": [] with exit 0; refuse an empty result from now on.
node $O/probe.mjs $O/probe-v92-$(basename $S).json "B=$U1" "V=$U2"
E=$?
grep -q '"label"' $O/probe-v92-$(basename $S).json || { echo "pw probe: no results (VOID)"; E=5; }
kill $P1 $P2
exit $E
