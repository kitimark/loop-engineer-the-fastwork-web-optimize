#!/bin/sh
# rest-script P-089 Chrome leg for one width (inside one shared probe hold, headless, no timing): serve st6-rb2 and
# rest-script(--on st6-rb2); rec = record both arms (rot2.mjs, in parallel); rep = st6-rb2 replays both arms' frozen
# shots, then analyse.mjs (03b2df89340e), t2score.mjs (3e236a71ef6b) and t2aux.mjs parts. all = rec then rep.
# usage: p089-chrome.sh <w> rec|rep|all [--reduced]
W=$1; PH=$2; RED=$3
WT=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633
T=$WT/fixes/rest-script/tools
O=$WT/out/rest-script/p089; mkdir -p $O
TAG=w$W${RED:+r}
cd $WT || exit 1
rm -f out/serve-st6-rb2.json out/serve-rest-script.json
node tools/fix.mjs serve st6-rb2 > $O/serve-st6-$TAG.log 2>&1 & P1=$!
node tools/fix.mjs serve rest-script --on st6-rb2 > $O/serve-fix-$TAG.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null' EXIT INT TERM
node tools/wait.mjs serve out/serve-st6-rb2.json --pid $P1 --reason "st6-rb2 server" > /dev/null || exit 1
node tools/wait.mjs serve out/serve-rest-script.json --pid $P2 --reason "rest-script server" > /dev/null || exit 1
if [ "$PH" = rec ] || [ "$PH" = all ]; then
  node $T/rot2.mjs --state out/serve-st6-rb2.json --arm st6 --w $W $RED --out $O/st6-$TAG.json &
  A=$!
  node $T/rot2.mjs --state out/serve-rest-script.json --arm fix --w $W $RED --out $O/fix-$TAG.json &
  B=$!
  wait $A; wait $B
fi
if [ "$PH" = rep ] || [ "$PH" = all ]; then
  node $T/rot2.mjs --state out/serve-st6-rb2.json --arm st6 --w $W $RED --replay $O/fix-$TAG.json --out $O/rep-fix-$TAG.json &
  A=$!
  node $T/rot2.mjs --state out/serve-st6-rb2.json --arm st6 --w $W $RED --replay $O/st6-$TAG.json --out $O/rep-st6-$TAG.json &
  B=$!
  wait $A; wait $B
  kill $P1 $P2 2>/dev/null
  node $T/analyse.mjs --st6 $O/st6-$TAG.json --fix $O/fix-$TAG.json --fixreplay $O/rep-fix-$TAG.json --st6replay $O/rep-st6-$TAG.json --out $O/analysis-$TAG.json
  node $T/t2score.mjs --run $O/fix-$TAG.json --replay $O/rep-fix-$TAG.json --aarun $O/st6-$TAG.json --aareplay $O/rep-st6-$TAG.json --out $O/t2-$TAG.json
  node $T/t2aux.mjs parts --run $O/fix-$TAG.json --replay $O/rep-fix-$TAG.json --out $O/parts-$TAG.json
fi
echo EXIT $?
