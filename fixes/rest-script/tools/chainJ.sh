#!/bin/sh
# rest-script P-089 run list (README "P-089 registration"). Started only after mgmt-ops-10's second read passed, one part
# at a time, each when its lane turn is announced (sim and reduced: after fix-carousel-leaver's diagnostics; chrome:
# after fix-morph-gpu's re-runs). Every hold: shared lane, <= 300 s, queue wait <= 7200 s, one Sim session per hold.
# Refuses any overlay but 520d5f1139c7 and any tool whose hash is not the registered one.
# usage: chainJ.sh sim | reduced | chrome      (reduced = the WebKit reduced-motion leg, sim.mjs --reduce-motion, I-100)
PART=$1
WT=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633
T=fixes/rest-script/tools
cd $WT || exit 1
L=out/rest-script/chainJ; mkdir -p $L
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h fixes/rest-script/overlay/_app/immutable/nodes/2.DyWL8TcE.js)" = 520d5f1139c7 ] || { echo "overlay is not 520d5f1139c7"; exit 1; }
[ "$(h $T/t2score.mjs)" = 3e236a71ef6b ] || { echo "t2score.mjs hash"; exit 1; }
[ "$(h $T/analyse.mjs)" = 03b2df89340e ] || { echo "analyse.mjs hash"; exit 1; }
[ "$(h $T/simrot2.mjs)" = "$(sed -n 's/^SIMROT2=//p' $T/p089.hashes)" ] || { echo "simrot2.mjs hash"; exit 1; }
[ "$(h $T/rot2.mjs)" = "$(sed -n 's/^ROT2=//p' $T/p089.hashes)" ] || { echo "rot2.mjs hash"; exit 1; }
[ "$(h $T/t2aux.mjs)" = "$(sed -n 's/^T2AUX=//p' $T/p089.hashes)" ] || { echo "t2aux.mjs hash"; exit 1; }
[ "$(h $T/p089-sim.sh)" = "$(sed -n 's/^P089SIM=//p' $T/p089.hashes)" ] || { echo "p089-sim.sh hash"; exit 1; }
[ "$(h $T/p089-chrome.sh)" = "$(sed -n 's/^P089CHROME=//p' $T/p089.hashes)" ] || { echo "p089-chrome.sh hash"; exit 1; }
hold() { # name, weight, doing, cmd...
  N=$1; WGT=$2; D=$3; shift 3
  echo "[$(date -u +%H:%M:%SZ)] start $N"
  node tools/lock.mjs run chrome-measure --shared --weight $WGT --max-seconds 300 --timeout 7200 --owner rest-script --doing "$D" -- "$@" > $L/$N.log 2>&1
  echo "[$(date -u +%H:%M:%SZ)] end $N rc $? : $(grep -c '^EXIT 0' $L/$N.log) EXIT0"
}
# one Simulator leg: st6 record (mechanism check), fix record, replays, A/A replays, then scoring (file reads only)
simleg() { # name, device, RM value (on or empty), words for --doing
  N=$1; DEV=$2; RMV=$3; WD=$4
  hold $N-st6 simulator "rest-script P-089: Simulator avatar row record, st6-rb2, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh st6
  if [ -z "$RMV" ]; then
    if grep -q 'hook starts 0 ' $L/$N-st6.log || ! grep -q '^SIM2 st6: prefers-reduced-motion no-preference' $L/$N-st6.log; then echo "mechanism check failed on $N: stop (VOID)"; exit 2; fi
  else
    if ! grep -q '^SIM2 st6 reduced: prefers-reduced-motion reduce' $L/$N-st6.log; then echo "reduced motion not in effect on $N: stop (VOID)"; exit 2; fi
  fi
  hold $N-fix simulator "rest-script P-089: Simulator avatar row record, rest-script, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh fix
  hold $N-repfix simulator "rest-script P-089: Simulator pixel replays, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh repfix
  hold $N-repst6 simulator "rest-script P-089: Simulator pixel replays A/A, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh repst6
  env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh score > $L/$N-score.log 2>&1
}
case $PART in
  sim)
    simleg fw-sim fw-sim "" "phone width"
    hold fw-sim-pins simulator "rest-script P-089: Simulator image-rendering pin replays, F-200 diagnostic (no timing)" env FW_SIM_DEVICE=fw-sim sh $T/p089-sim.sh pins
    env FW_SIM_DEVICE=fw-sim sh $T/p089-sim.sh score > $L/fw-sim-score2.log 2>&1
    simleg fw-ipad fw-ipad "" "iPad desktop width" ;;
  reduced)
    simleg fw-sim-rm fw-sim on "phone width, reduced motion" ;;
  chrome)
    hold chrome-430r 2 "rest-script P-089: avatar row identity, width 430 reduced motion (headless, no timing)" sh $T/p089-chrome.sh 430 all --reduced
    hold chrome-1440-rec 2 "rest-script P-089: avatar row record, width 1440 (headless, no timing)" sh $T/p089-chrome.sh 1440 rec
    hold chrome-1440-rep 2 "rest-script P-089: avatar row replays + scoring, width 1440 (headless, no timing)" sh $T/p089-chrome.sh 1440 rep
    hold chrome-1440r 2 "rest-script P-089: avatar row identity, width 1440 reduced motion (headless, no timing)" sh $T/p089-chrome.sh 1440 all --reduced ;;
  *) echo "usage: chainJ.sh sim|reduced|chrome"; exit 1 ;;
esac
echo "CHAINJ $PART DONE"
