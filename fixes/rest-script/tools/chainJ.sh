#!/bin/sh
# rest-script P-089 run list (README "P-089 registration" + "P-089 addendum"). Started only after mgmt-ops-10's read of
# the addendum passed, one part at a time, each when its lane turn is announced (sim and reduced: after
# fix-carousel-leaver's P-090 Holds A and B; chrome: after fix-morph-gpu's re-runs). Every hold: shared lane, <= 300 s,
# queue wait <= 7200 s, one Sim session per hold. Refuses any overlay but 520d5f1139c7 and any tool whose hash is not
# the registered one.
# Addendum rules, per hold:
#   - pmcheck.mjs over the hold's window (command start .. hold end): a Sleep / DarkWake / Maintenance inside it (I-098)
#     makes the hold VOID;
#   - rc != 0 (124 = killed at 300 s, a lock timeout, any fatal), no "EXIT 0" line, a FATAL, or a run-level VOID in a
#     SIM2 summary line makes the hold VOID;
#   - a VOID hold is re-run once at once (it queues again, same hashes); a second VOID makes the LEG VOID: no further
#     hold of that leg and no scoring of it (no partial files are scored). Other legs go on. A VOID leg is re-run once
#     in a later lane turn (chainJ.sh leg <name>); a second VOID leg goes to the lead with no claim.
#   - a leg whose holds all passed is scored, then checked: t2aux coverage (rest/quiet/intoview non-VOID, >= 10 of 12
#     moving frames in fw-sim, fw-ipad and Chrome 1440; else LEG VOID) and t2aux unmasked (MASK-DEPENDENT labels go
#     to the lead, not into a PASS).
# Every leg moves its previous output files to out/rest-script/chainJ/prev-<leg>-<epoch>/ before its first hold.
# Option A (lead, P-089 Chrome legs; mgmt-ops-10):
#   - every hold appends a HASHES line (overlay, every tool, p089.hashes, chainJ.sh itself) to its log after it ends;
#     a line that differs from the one taken at chain start makes the hold VOID (hash-changed);
#   - coverage also reads the record run and the replays: a record shot with `void` or mutAfter > 0 is VOID, and a
#     quiet or intoview replay with since < 1500 ms (rot2 option A) is VOID;
#   - Chrome legs need quiet and intoview (rest is transient-exposed: recorded, scored, compared with quiet, not in the
#     verdict; REST-QUIET DISAGREE goes to the lead); Chrome 1440 also needs >= 10 of 12 moving frames.
# usage: chainJ.sh sim | reduced | chrome | leg <fw-sim|fw-sim-pins|fw-ipad|fw-sim-rm|chrome-430r|chrome-1440|chrome-1440r>
PART=$1
WT=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633
T=fixes/rest-script/tools
cd $WT || exit 1
L=out/rest-script/chainJ; mkdir -p $L
P=out/rest-script/p089
h() { shasum -a 256 "$1" | cut -c1-12; }
reg() { sed -n "s/^$1=//p" $T/p089.hashes; }
[ "$(h fixes/rest-script/overlay/_app/immutable/nodes/2.DyWL8TcE.js)" = 520d5f1139c7 ] || { echo "overlay is not 520d5f1139c7"; exit 1; }
[ "$(h $T/t2score.mjs)" = 3e236a71ef6b ] || { echo "t2score.mjs hash"; exit 1; }
[ "$(h $T/analyse.mjs)" = 03b2df89340e ] || { echo "analyse.mjs hash"; exit 1; }
[ "$(h $T/simrot2.mjs)" = "$(reg SIMROT2)" ] || { echo "simrot2.mjs hash"; exit 1; }
[ "$(h $T/rot2.mjs)" = "$(reg ROT2)" ] || { echo "rot2.mjs hash"; exit 1; }
[ "$(h $T/t2aux.mjs)" = "$(reg T2AUX)" ] || { echo "t2aux.mjs hash"; exit 1; }
[ "$(h $T/pmcheck.mjs)" = "$(reg PMCHECK)" ] || { echo "pmcheck.mjs hash"; exit 1; }
[ "$(h $T/p089-sim.sh)" = "$(reg P089SIM)" ] || { echo "p089-sim.sh hash"; exit 1; }
[ "$(h $T/p089-chrome.sh)" = "$(reg P089CHROME)" ] || { echo "p089-chrome.sh hash"; exit 1; }
node $T/pmcheck.mjs --selftest > /dev/null || { echo "pmcheck.mjs selftest"; exit 1; }
node $T/t2aux.mjs --selftest > /dev/null || { echo "t2aux.mjs selftest"; exit 1; }
hashes() { echo "HASHES overlay=$(h fixes/rest-script/overlay/_app/immutable/nodes/2.DyWL8TcE.js) t2score=$(h $T/t2score.mjs) analyse=$(h $T/analyse.mjs) simrot2=$(h $T/simrot2.mjs) rot2=$(h $T/rot2.mjs) t2aux=$(h $T/t2aux.mjs) pmcheck=$(h $T/pmcheck.mjs) p089sim=$(h $T/p089-sim.sh) p089chrome=$(h $T/p089-chrome.sh) p089hashes=$(h $T/p089.hashes) chainJ=$(h $T/chainJ.sh)"; }
H0=$(hashes); echo "$H0"

# one hold, re-run once when VOID; returns 0 when a try passed, 1 when both were VOID
hold() { # name, weight, doing, cmd...
  N=$1; WGT=$2; D=$3; shift 3
  for TRY in 1 2; do
    rm -f $L/$N.t0
    S0=$(date +%s)
    echo "[$(date -u +%H:%M:%SZ)] start $N try $TRY"
    node tools/lock.mjs run chrome-measure --shared --weight $WGT --max-seconds 300 --timeout 7200 --owner rest-script --doing "$D" -- sh -c 'date +%s > "$0"; exec "$@"' $L/$N.t0 "$@" > $L/$N.log 2>&1
    RC=$?
    E=$(date +%s)
    B=$S0; [ -s $L/$N.t0 ] && B=$(cat $L/$N.t0)
    PM=$(node $T/pmcheck.mjs $B $E); PMRC=$?
    WHY=""
    [ $RC = 0 ] || WHY="$WHY rc=$RC"
    grep -q '^EXIT 0' $L/$N.log || WHY="$WHY no-EXIT-0"
    grep -q ' FATAL ' $L/$N.log && WHY="$WHY FATAL"
    grep -q '^SIM2 .* VOID ' $L/$N.log && WHY="$WHY SIM2-VOID"
    [ $PMRC = 0 ] || WHY="$WHY pmset"
    echo "$PM" >> $L/$N.log
    HN=$(hashes); echo "$HN" >> $L/$N.log
    [ "$HN" = "$H0" ] || WHY="$WHY hash-changed"
    if [ -z "$WHY" ]; then
      echo "[$(date -u +%H:%M:%SZ)] end $N try $TRY OK ($PM, window $B-$E)"
      return 0
    fi
    echo "[$(date -u +%H:%M:%SZ)] end $N try $TRY HOLD VOID:$WHY ($PM, window $B-$E)"
    mv $L/$N.log $L/$N.try$TRY.log
  done
  return 1
}
legvoid() { echo "LEG $1 VOID: $2 (no scoring; re-run once in a later lane turn: chainJ.sh leg $1; a second VOID goes to the lead)"; }
prev() { # leg, files...
  G=$1; shift; DST=$L/prev-$G-$(date +%s); mkdir -p $DST
  for F in "$@"; do [ -e "$F" ] && mv "$F" $DST/; done
  rmdir $DST 2>/dev/null; true
}
# coverage + mask check of a scored leg; t2 json, parts json, need list, moving minimum, run, replay
check() { # leg, t2, parts, need, moving, run, replay
  node $T/t2aux.mjs coverage --t2 $2 --parts $3 --run $6 --replay $7 --need $4 --moving $5 --out $L/$1-coverage.json || { legvoid $1 "coverage"; return 1; }
  node $T/t2aux.mjs unmasked --run $6 --replay $7 --t2 $2 --out $L/$1-unmasked.json | tail -1
  echo "LEG $1 SCORED"
}
# one Simulator leg: st6 record (mechanism check), fix record, replays, A/A replays, then scoring (file reads only)
simleg() { # name, device, RM value (on or empty), words for --doing
  N0=$1; DEV=$2; RMV=$3; WD=$4; S=${RMV:+-rm}; O=$P/$DEV
  prev $N0 $L/$N0-coverage.json $L/$N0-unmasked.json $O/st6$S.json $O/fix$S.json $O/rep-fix$S.json $O/rep-st6$S.json $O/t2$S.json $O/parts$S.json
  hold $N0-st6 simulator "rest-script P-089: Simulator avatar row record, st6-rb2, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh st6 || { legvoid $N0 "st6 hold"; return 1; }
  if [ -z "$RMV" ]; then
    if grep -q 'hook starts 0 ' $L/$N0-st6.log || ! grep -q '^SIM2 st6: prefers-reduced-motion no-preference' $L/$N0-st6.log; then echo "mechanism check failed on $N0: stop (VOID)"; exit 2; fi
  else
    if ! grep -q '^SIM2 st6 reduced: prefers-reduced-motion reduce' $L/$N0-st6.log; then echo "reduced motion not in effect on $N0: stop (VOID)"; exit 2; fi
  fi
  hold $N0-fix simulator "rest-script P-089: Simulator avatar row record, rest-script, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh fix || { legvoid $N0 "fix hold"; return 1; }
  hold $N0-repfix simulator "rest-script P-089: Simulator pixel replays, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh repfix || { legvoid $N0 "repfix hold"; return 1; }
  hold $N0-repst6 simulator "rest-script P-089: Simulator pixel replays A/A, $WD (no timing)" env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh repst6 || { legvoid $N0 "repst6 hold"; return 1; }
  env RM=$RMV FW_SIM_DEVICE=$DEV sh $T/p089-sim.sh score > $L/$N0-score.log 2>&1
  if [ -n "$RMV" ]; then MV=0; else MV=10; fi
  check $N0 $O/t2$S.json $O/parts$S.json rest,quiet,intoview $MV $O/fix$S.json $O/rep-fix$S.json
}
pinsleg() { # needs a scored fw-sim leg (its fix.json)
  O=$P/fw-sim
  [ -s $L/fw-sim-coverage.json ] && grep -q '"void": false' $L/fw-sim-coverage.json || { legvoid fw-sim-pins "fw-sim leg not scored"; return 1; }
  prev fw-sim-pins $L/fw-sim-pins-done $O/repq-fix.json $O/reps-fix.json $O/t2-vs-q.json $O/pair-x-vs-s.json $O/pair-x-vs-q.json
  hold fw-sim-pins simulator "rest-script P-089: Simulator image-rendering pin replays, F-200 diagnostic (no timing)" env FW_SIM_DEVICE=fw-sim sh $T/p089-sim.sh pins || { legvoid fw-sim-pins "pins hold"; return 1; }
  env FW_SIM_DEVICE=fw-sim sh $T/p089-sim.sh score > $L/fw-sim-score2.log 2>&1
  echo "LEG fw-sim-pins SCORED"; date -u > $L/fw-sim-pins-done
}
chromefiles() { echo $L/$2-coverage.json $L/$2-unmasked.json; for K in st6 fix rep-fix rep-st6 analysis t2 parts; do echo $P/$K-$1.json; done; }
chromeleg() { # 430r | 1440 | 1440r
  case $1 in
    430r) prev chrome-430r $(chromefiles w430r chrome-430r)
      hold chrome-430r 2 "rest-script P-089: avatar row identity, width 430 reduced motion (headless, no timing)" sh $T/p089-chrome.sh 430 all --reduced || { legvoid chrome-430r "hold"; return 1; }
      check chrome-430r $P/t2-w430r.json $P/parts-w430r.json quiet,intoview 0 $P/fix-w430r.json $P/rep-fix-w430r.json ;;
    1440) prev chrome-1440 $(chromefiles w1440 chrome-1440)
      hold chrome-1440-rec 2 "rest-script P-089: avatar row record, width 1440 (headless, no timing)" sh $T/p089-chrome.sh 1440 rec || { legvoid chrome-1440 "rec hold"; return 1; }
      hold chrome-1440-rep 2 "rest-script P-089: avatar row replays + scoring, width 1440 (headless, no timing)" sh $T/p089-chrome.sh 1440 rep || { legvoid chrome-1440 "rep hold"; return 1; }
      check chrome-1440 $P/t2-w1440.json $P/parts-w1440.json quiet,intoview 10 $P/fix-w1440.json $P/rep-fix-w1440.json ;;
    1440r) prev chrome-1440r $(chromefiles w1440r chrome-1440r)
      hold chrome-1440r 2 "rest-script P-089: avatar row identity, width 1440 reduced motion (headless, no timing)" sh $T/p089-chrome.sh 1440 all --reduced || { legvoid chrome-1440r "hold"; return 1; }
      check chrome-1440r $P/t2-w1440r.json $P/parts-w1440r.json quiet,intoview 0 $P/fix-w1440r.json $P/rep-fix-w1440r.json ;;
  esac
}
case $PART in
  sim)
    simleg fw-sim fw-sim "" "phone width"
    pinsleg
    simleg fw-ipad fw-ipad "" "iPad desktop width" ;;
  reduced)
    simleg fw-sim-rm fw-sim on "phone width, reduced motion" ;;
  chrome)
    chromeleg 430r; chromeleg 1440; chromeleg 1440r ;;
  leg)
    case $2 in
      fw-sim) simleg fw-sim fw-sim "" "phone width" ;;
      fw-sim-pins) pinsleg ;;
      fw-ipad) simleg fw-ipad fw-ipad "" "iPad desktop width" ;;
      fw-sim-rm) simleg fw-sim-rm fw-sim on "phone width, reduced motion" ;;
      chrome-430r) chromeleg 430r ;;
      chrome-1440) chromeleg 1440 ;;
      chrome-1440r) chromeleg 1440r ;;
      *) echo "usage: chainJ.sh leg fw-sim|fw-sim-pins|fw-ipad|fw-sim-rm|chrome-430r|chrome-1440|chrome-1440r"; exit 1 ;;
    esac ;;
  *) echo "usage: chainJ.sh sim|reduced|chrome|leg <name>"; exit 1 ;;
esac
echo "CHAINJ $PART${2:+ $2} DONE"
