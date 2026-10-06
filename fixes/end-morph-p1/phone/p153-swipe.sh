#!/bin/sh
# P-153 part S (rev 1.1): blind swipe A/B of the end-of-page menu (card: fixes/end-morph-p1/README.md "P-153", part S).
# The user's finger (F) judges C (v9-final + F1 + U2) against V (C + P1) on the block's snapshot servers (p153-serve.sh,
# served hashes checked and logged first). Lead rulings (2026-10-06, on ops-reader-P153 N5-N8 and memory
# perception-tests-touch-ab):
#   - runs only after a NO-WORSE PASS block (the reader's DECISION on out/p153/runs, not after VOID, INSUFFICIENT or
#     FAIL), only after part 2's last hold HA ended, never while the P-153 block mark is set, and only on the lead's go:
#     the lead asks the user in a thread first; the runner then starts this script with P153_S_GO=lead;
#   - three pairs, each its own console swipe-pair step, posted one after another from inside the runner's phone hold
#     (one phone step at a time, I-123): C/V and V/C (AB/BA; a coin decides which comes first) and a catch pair C/C (a
#     second coin puts it first, second or third); forced choice 1 or 2 per pair (--options 1,2); "not sure" goes in the
#     notes and counts as no pick; a skipped or unanswered step is no pick;
#   - landing: P1 lands only on NO-WORSE PASS, and not if the user picks C in both real pairs (then it goes back to the
#     user as a question); the catch pair is reported, never scored.
#   TICKET=P-153 P153_S_GO=lead node tools/lock.mjs run iphone --owner iphone-runner --max-seconds 900 -- sh fixes/end-morph-p1/phone/p153-swipe.sh
# Runner side per pair (tools/console.mjs header, "Swipe pair, runner side"): post; per part: ack loading ->
# iphone.mjs open -> ack ready -> wait --until started -> iphone.mjs record (45 s, --poll 5) -> ack recording -> wait
# --until done; then wait --until answered. EVERY wait passes --epoch and handles exit 5 REDO (the user's Start over or a
# redo; the final answer wait too): the recorder stops and the pair resumes at the reset part with its new attempt; exit
# 6 NOT-READY: ack ready again. A recorder that does not start within 30 s does not hold the user up: the part is acked
# "recording" with "not recorded" and the answer still counts (records are descriptive only).
# Output (gitignored out/p153/): swipe-key.json (the blind keys), swipe-answer.json (per pair: value, scale, the unblinded
# pick, the pins; the user's notes stay only in this local file), swipe-<pair>-p<N>-a<attempt>.log. A PIN line prints
# this script's sha and the served hashes. Last line: "SWIPE RESULT real <pick1>/<pick2> catch <pick>" or "SWIPE STOP <why>".
# P153_DRY=1: the served-hash check, the guards (reported, not enforced) and the coins only (no post, no phone).
# Nothing here prints the LAN address: URLs are http://lan:<port>/, resolved by the tools (I-073, I-119; Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
R=${RUNNER:-iphone-runner}; SV=out/p153; CON="node tools/console.mjs"; SELF=fixes/end-morph-p1/phone/p153-swipe.sh
mkdir -p $SV
# guards (rev 1.1): block ended, its result NO-WORSE PASS, block mark off, the lead's go
G1=$(grep -c -E '^HOLD HA (VALID|VOID)' $SV/hold-HA.log 2>/dev/null)
G2=$(node fixes/end-morph-p1/phone/p153-read.mjs $SV/runs 2>/dev/null | grep -c '^DECISION NO-WORSE PASS')
G3=$(node tools/lock.mjs status 2>/dev/null | grep -c 'phone block P-153')
GUARD="block ended ${G1:-0}, NO-WORSE PASS ${G2:-0}, block mark ${G3:-0}, go ${P153_S_GO:-none}"
if [ "$P153_DRY" = 1 ]; then echo "GUARD (dry, not enforced): $GUARD"
else
  [ "${G1:-0}" -ge 1 ] || { echo "SWIPE STOP the block has not ended (no final HOLD HA line): $GUARD"; exit 2; }
  [ "${G2:-0}" -ge 1 ] || { echo "SWIPE STOP the block is not a NO-WORSE PASS (part S runs only after one): $GUARD"; exit 2; }
  [ "${G3:-0}" -eq 0 ] || { echo "SWIPE STOP the P-153 block mark is still set: $GUARD"; exit 2; }
  [ "$P153_S_GO" = lead ] || { echo "SWIPE STOP no lead go (P153_S_GO=lead after the lead asked the user in a thread): $GUARD"; exit 2; }
fi
{ echo "== $(date -u +%FT%TZ) part S start"; sh fixes/end-morph-p1/phone/p153-serve.sh check; } >> $SV/serve-check.log 2>&1 \
  || { echo "SWIPE STOP served hashes not ok (see $SV/serve-check.log)"; exit 4; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) || { echo "SWIPE STOP no server state"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
PIN="$SELF=$(shasum -a 256 $SELF | cut -c1-12) C=$(served $PC $JS)/$(served $PC $CSS) V=$(served $PV $JS)/$(served $PV $CSS)"
echo "PIN part S $PIN"
coin() { od -An -N1 -tu1 /dev/urandom | tr -d ' '; }
[ $(( $(coin) % 2 )) -eq 0 ] && REAL="AB BA" || REAL="BA AB"
CP=$(( $(coin) % 3 ))
case $CP in 0) ORDER="CC $REAL" ;; 1) ORDER="${REAL%% *} CC ${REAL##* }" ;; *) ORDER="$REAL CC" ;; esac
KEY="{\"ticket\":\"P-153\",\"part\":\"S\",\"order\":\"$ORDER\",\"pairs\":{\"AB\":{\"1\":\"C\",\"2\":\"V\"},\"BA\":{\"1\":\"V\",\"2\":\"C\"},\"CC\":{\"1\":\"C\",\"2\":\"C\"}},\"pin\":\"$PIN\"}"
if [ "$P153_DRY" = 1 ]; then echo "SWIPE DRY ok: pair order $ORDER (dry coins, not stored); would post 3 swipe-pair steps as $R"; exit 0; fi
echo "$KEY" > $SV/swipe-key.json
node tools/iphone.mjs profile --owner "$R" > $SV/swipe-profile.log 2>&1; pr=$?
[ $pr -ne 0 ] && { echo "SWIPE STOP thermal profile read exit $pr (see $SV/swipe-profile.log; nothing posted)"; exit 8; }
js() { node -e "const j=JSON.parse(process.argv[1]);const v=j[process.argv[2]];console.log(v ?? '')" "$1" "$2"; }
att() { node -e "const j=JSON.parse(process.argv[1]);console.log(j.attempts[process.argv[2]-1])" "$1" "$2"; }
echo '{"pairs":{}}' > $SV/swipe-answer.json
pair() { # $1 = AB | BA | CC: post the step and run it to its answer; prints the unblinded pick
  P=$1
  case $P in AB) U1=$PC; U2=$PV; K1=C; K2=V ;; BA) U1=$PV; U2=$PC; K1=V; K2=C ;; CC) U1=$PC; U2=$PC; K1=C; K2=C ;; esac
  PO=$($CON post --by "$R" --kind swipe-pair --topic end-morph-p1 \
    --title "End-of-page menu: which page follows your finger better?" \
    --instructions "On each page, swipe down to the very end, then swipe up and down there so the menu at the end opens and closes a few times (about 30 seconds). Judge only that end-of-page menu. Pick 1 or 2; if you are not sure, pick either and write 'not sure' in the notes." \
    --url "http://lan:$U1/" --url2 "http://lan:$U2/" --options 1,2 --scale 1-5 --scale-label "How different did they feel?" \
    --meta "{\"ticket\":\"P-153\",\"pair\":\"$P\",\"key\":{\"1\":\"$K1\",\"2\":\"$K2\"}}" 2>&1)
  ID=$(echo "$PO" | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p')
  [ -n "$ID" ] || { echo "SWIPE STOP post refused ($P): $(echo "$PO" | head -2)"; exit 1; }
  echo "POSTED $ID (part S pair $P)"
  EP=0; N=1; A=1; REC=""
  stoprec() { [ -n "$REC" ] && kill "$REC" 2>/dev/null; REC=""; }
  redo_from() { stoprec; N=$(js "$1" part); A=$(att "$1" "$N"); EP=$(js "$1" epoch); echo "REDO $P from part $N attempt $A epoch $EP"; }
  while :; do
    while [ $N -le 2 ]; do
      [ $N = 1 ] && U="http://lan:$U1/" || U="http://lan:$U2/"
      $CON ack $ID --by "$R" --part $N --state loading --attempt $A > /dev/null || { echo "SWIPE STOP ack loading refused ($P part $N attempt $A)"; exit 1; }
      node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "SWIPE STOP open failed ($P part $N)"; exit 4; }
      $CON ack $ID --by "$R" --part $N --state ready --attempt $A > /dev/null || { echo "SWIPE STOP ack ready refused ($P part $N attempt $A)"; exit 1; }
      W=$($CON wait $ID --until started --part $N --epoch $EP --json --quiet --timeout 3000); e=$?
      case $e in 0) EP=$(js "$W" epoch) ;; 5) redo_from "$W"; continue ;; 6) continue ;; *) echo "SWIPE STOP wait started ($P part $N) exit $e (no pick)"; exit 3 ;; esac
      L=$SV/swipe-$P-p$N-a$A.log
      node tools/iphone.mjs record --owner "$R" --seconds 45 --poll 5 --label "p153-swipe-$P-p$N-a$A" > $L 2>&1 & REC=$!
      if node tools/wait.mjs file $L --match '^RECORDING' --pid $REC --timeout 30 --owner "$R" --reason "P-153 swipe recorder start" > /dev/null; then
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A > /dev/null
      else
        echo "RECORD-SKIPPED $P part $N attempt $A: $(grep -v '^$' $L | tail -1 | cut -c1-120)"; stoprec
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A --message "not recorded; swipe and judge anyway" > /dev/null
      fi
      W=$($CON wait $ID --until done --part $N --epoch $EP --json --quiet --timeout 1800); e=$?
      case $e in 0) EP=$(js "$W" epoch) ;; 5) redo_from "$W"; continue ;; *) stoprec; echo "SWIPE STOP wait done ($P part $N) exit $e (no pick)"; exit 3 ;; esac
      [ -n "$REC" ] && { node tools/wait.mjs pid $REC --timeout 60 --owner "$R" --reason "P-153 swipe recorder end" > /dev/null || stoprec; REC=""; }
      N=$((N + 1))
      A=$(node -e "const s=JSON.parse(process.argv[1]);const p=s.parts[1];console.log(p.attempt || 1)" "$($CON show $ID --json)" 2>/dev/null || echo 1)
    done
    W=$($CON wait $ID --until answered --epoch $EP --json --quiet --timeout 1800); e=$?
    case $e in 0) break ;; 5) redo_from "$W"; continue ;; *) echo "SWIPE STOP wait answered ($P) exit $e (no pick)"; exit 3 ;; esac
  done
  V=$(js "$W" value)
  case $V in 1) PK=$K1 ;; 2) PK=$K2 ;; *) PK=none ;; esac
  # "not sure" in the notes = no pick (the notes stay in the local answer file only)
  node -e "const w=JSON.parse(process.argv[1]);if(/not sure/i.test(w.notes||''))process.exit(3)" "$W" || PK=none
  node -e "const f='$SV/swipe-answer.json',a=JSON.parse(require('fs').readFileSync(f,'utf8'));const w=JSON.parse(process.argv[1]);a.pairs[process.argv[2]]={...w,pick:process.argv[3]};a.pin=process.argv[4];require('fs').writeFileSync(f,JSON.stringify(a,null,1))" "$W" "$P" "$PK" "$PIN"
  echo "PAIR $P pick $PK (answer $V, scale $(js "$W" scale))"
  eval "PICK_$P=$PK"
}
for P in $ORDER; do pair $P; done
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
LAND=ok; [ "$PICK_AB" = C ] && [ "$PICK_BA" = C ] && LAND="NOT: C picked in both real pairs (back to the user as a question)"
echo "SWIPE RESULT real AB $PICK_AB / BA $PICK_BA, catch $PICK_CC (reported, never scored); landing by part S: $LAND"
