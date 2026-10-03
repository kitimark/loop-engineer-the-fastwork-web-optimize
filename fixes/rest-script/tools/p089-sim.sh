#!/bin/sh
# rest-script P-089 Simulator step (inside one shared simulator-weight hold: one functional Sim session, no timing).
# Device from FW_SIM_DEVICE (fw-sim = iPhone 15 Pro Max, phone width; fw-ipad = iPad Pro 13", portrait, the desktop
# width leg). Steps:
#   st6    st6-rb2 record (simrot2.mjs; its hook check is the mechanism check: 0 slide starts = VOID)
#   fix    rest-script record
#   repfix st6-rb2 replays the fix's frozen states            (X of t2score)
#   repst6 st6-rb2 replays its own frozen states              (the A/A)
#   pins   st6-rb2 pinned optimizeQuality, then optimizeSpeed, replaying the fix's rest/quiet/intoview states (F-200)
# RM=on: the reduced-motion leg (I-100, sim.mjs session --reduce-motion on; simrot2 --reduced; files *-rm.json);
# otherwise every session passes --reduce-motion off. Every step logs node tools/sim.mjs reduce-motion after its open.
#   score  no Sim: analyse-free scoring of what exists (t2score + t2aux parts, pins pair)
# usage: [RM=on] FW_SIM_DEVICE=fw-sim|fw-ipad p089-sim.sh <step>
STEP=$1
DEV=${FW_SIM_DEVICE:-fw-sim}
WT=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633
T=$WT/fixes/rest-script/tools
O=$WT/out/rest-script/p089/$DEV; mkdir -p $O
if [ "$RM" = on ]; then S=-rm; RF=--reduced; RMF=on; else S=; RF=; RMF=off; fi
cd $WT || exit 1
if [ "$STEP" = score ]; then
  node $T/t2score.mjs --run $O/fix$S.json --replay $O/rep-fix$S.json --aarun $O/st6$S.json --aareplay $O/rep-st6$S.json --out $O/t2$S.json
  node $T/t2aux.mjs parts --run $O/fix$S.json --replay $O/rep-fix$S.json --out $O/parts$S.json
  if [ -z "$S" ] && [ -f $O/repq-fix.json ]; then
    node $T/t2score.mjs --run $O/fix$S.json --replay $O/repq-fix.json --aarun $O/st6$S.json --aareplay $O/rep-st6$S.json --labels rest,quiet,intoview --out $O/t2-vs-q.json
    node $T/t2aux.mjs pair --a $O/rep-fix$S.json --b $O/reps-fix.json --labels rest,quiet,intoview --out $O/pair-x-vs-s.json
    node $T/t2aux.mjs pair --a $O/rep-fix$S.json --b $O/repq-fix.json --labels rest,quiet,intoview --out $O/pair-x-vs-q.json
  fi
  echo EXIT $?; exit 0
fi
rm -f out/serve-st6-rb2.json out/serve-rest-script.json
node tools/fix.mjs serve st6-rb2 > $O/serve-st6-$STEP.log 2>&1 & P1=$!
node tools/fix.mjs serve rest-script --on st6-rb2 > $O/serve-fix-$STEP.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null' EXIT INT TERM
node tools/wait.mjs serve out/serve-st6-rb2.json --pid $P1 --reason "st6-rb2 server" > /dev/null || exit 1
node tools/wait.mjs serve out/serve-rest-script.json --pid $P2 --reason "rest-script server" > /dev/null || exit 1
U1=http://localhost:$(node -e "console.log(require('$WT/out/serve-st6-rb2.json').httpTwin)")/
U2=http://localhost:$(node -e "console.log(require('$WT/out/serve-rest-script.json').httpTwin)")/
echo "JS st6 $(curl -s ${U1}_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12) fix $(curl -s ${U2}_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12) device $DEV"
RMC="node tools/sim.mjs reduce-motion | tail -2"
OPEN1="node tools/sim.mjs open $U1 | tail -1 | cut -c1-100; $RMC"
case $STEP in
  st6) INNER="$OPEN1; node $T/simrot2.mjs --url $U1 --arm st6 $RF --out $O/st6$S.json" ;;
  fix) INNER="node tools/sim.mjs open $U2 | tail -1 | cut -c1-100; $RMC; node $T/simrot2.mjs --url $U2 --arm fix $RF --out $O/fix$S.json" ;;
  repfix) INNER="$OPEN1; node $T/simrot2.mjs --url $U1 --arm st6 $RF --replay $O/fix$S.json --out $O/rep-fix$S.json" ;;
  repst6) INNER="$OPEN1; node $T/simrot2.mjs --url $U1 --arm st6 $RF --replay $O/st6$S.json --out $O/rep-st6$S.json" ;;
  pins) INNER="$OPEN1; node $T/simrot2.mjs --url $U1 --arm st6 --pin optimizeQuality --replay $O/fix$S.json --labels rest,quiet,intoview --out $O/repq-fix.json; node $T/simrot2.mjs --url $U1 --arm st6 --pin optimizeSpeed --replay $O/fix$S.json --labels rest,quiet,intoview --out $O/reps-fix.json" ;;
  *) echo "usage: p089-sim.sh st6|fix|repfix|repst6|pins|score"; exit 1 ;;
esac
node tools/sim.mjs session --functional --owner rest-script --window shown --reduce-motion $RMF -- sh -c "$INNER"
echo "EXIT $?"
