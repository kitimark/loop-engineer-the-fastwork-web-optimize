#!/bin/sh
# P-153 part S: one blind swipe A/B of the end-of-page menu (card: fixes/end-morph-p1/README.md "P-153", part S). The
# user's finger (F) judges C (v9-final + F1 + U2) against V (C + P1) on the same snapshot servers as the block
# (p153-serve.sh; served hashes checked first). Runs AFTER the block's last part has ended (no phone step during a
# timed block: memory "no-phone-steps-during-blocks"), inside the runner's own phone hold, and posts the console step
# from inside it (one phone step at a time, I-123):
#   TICKET=P-153 node tools/lock.mjs run iphone --owner iphone-runner --max-seconds 900 -- sh fixes/end-morph-p1/phone/p153-swipe.sh
# Runner side, per the console protocol (tools/console.mjs header, "Swipe pair, runner side"):
#   coin flip -> page 1 / page 2 = C / V or V / C (the key goes only into the step's private --meta and into
#   out/p153/swipe-key.json); iphone.mjs profile (the hold's thermal read before the user's Start); post; then per part:
#   ack loading -> iphone.mjs open -> ack ready -> wait --until started -> iphone.mjs record (45 s, --poll 5) ->
#   ack recording -> wait --until done -> the recorder ends; finally wait --until answered.
#   Every wait passes --epoch (the last epoch seen) and handles exit 5 REDO (the user's Start over or a redo): the
#   recorder is stopped and the step resumes at the reset part with its new attempt; exit 6 NOT-READY: ack ready again.
#   A recorder that does not start within 30 s (e.g. Mac-quiet WAIT) does not hold the user up: the part is acked
#   "recording" with the message "not recorded" and the answer still counts (the records are descriptive only).
# Output (gitignored out/p153/): swipe-key.json, swipe-answer.json (value, notes, scale, meta; the pick unblinded in
# "pick"), swipe-p<N>-a<attempt>.log (recorder logs). Last line: "SWIPE PICK C|V|same" or "SWIPE STOP <why>".
# P153_DRY=1: the served-hash check and the coin flip only (no profile read, no post, no phone).
# Nothing here prints the LAN address: URLs are http://lan:<port>/, resolved by the tools (I-073, I-119; Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
R=${RUNNER:-iphone-runner}; SV=out/p153; CON="node tools/console.mjs"
sh fixes/end-morph-p1/phone/p153-serve.sh check > $SV/swipe-serve-check.log 2>&1 || { echo "SWIPE STOP served hashes not ok (see $SV/swipe-serve-check.log)"; exit 4; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) || { echo "SWIPE STOP no server state"; exit 4; }
if [ $(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 2 )) -eq 0 ]; then A1=C; A2=V; P1=$PC; P2=$PV; else A1=V; A2=C; P1=$PV; P2=$PC; fi
KEY="{\"ticket\":\"P-153\",\"part\":\"S\",\"key\":{\"1\":\"$A1\",\"2\":\"$A2\"},\"C\":\"a6426953727a/e1359ab9994a\",\"V\":\"4da641f828bb/a81b9af7b2c9\"}"
if [ "$P153_DRY" = 1 ]; then echo "SWIPE DRY ok: served hashes ok, page 1 / page 2 = $A1 / $A2 (dry key, not stored), would post a swipe-pair as $R with http://lan:<C|V port>/"; exit 0; fi
echo "$KEY" > $SV/swipe-key.json
node tools/iphone.mjs profile --owner "$R" > $SV/swipe-profile.log 2>&1; pr=$?
[ $pr -ne 0 ] && { echo "SWIPE STOP thermal profile read exit $pr (see $SV/swipe-profile.log; no step posted)"; exit 8; }
PO=$($CON post --by "$R" --kind swipe-pair --topic end-morph-p1 \
  --title "End-of-page menu: which page follows your finger better?" \
  --instructions "On each page, swipe down to the very end, then swipe up and down there so the menu at the end opens and closes a few times (about 30 seconds). Judge only that end-of-page menu." \
  --url "http://lan:$P1/" --url2 "http://lan:$P2/" --scale 1-5 --scale-label "How different did they feel?" --meta "$KEY" 2>&1)
ID=$(echo "$PO" | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p')
[ -n "$ID" ] || { echo "SWIPE STOP post refused: $(echo "$PO" | head -2)"; exit 1; }
echo "POSTED $ID (part S of P-153; key in $SV/swipe-key.json)"
EP=0
js() { node -e "const j=JSON.parse(process.argv[1]);console.log(j[process.argv[2]] ?? '')" "$1" "$2"; }
att() { node -e "const j=JSON.parse(process.argv[1]);console.log(j.attempts[process.argv[2]-1])" "$1" "$2"; }
N=1; A=1; REC=""
stoprec() { [ -n "$REC" ] && kill "$REC" 2>/dev/null; REC=""; }
redo_from() { # $1 = the REDO JSON: resume at its part, with its new attempt and epoch
  stoprec; N=$(js "$1" part); A=$(att "$1" "$N"); EP=$(js "$1" epoch); echo "REDO from part $N attempt $A epoch $EP"; }
while [ $N -le 2 ]; do
  [ $N = 1 ] && U="http://lan:$P1/" || U="http://lan:$P2/"
  $CON ack $ID --by "$R" --part $N --state loading --attempt $A > /dev/null || { echo "SWIPE STOP ack loading refused (part $N attempt $A)"; exit 1; }
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "SWIPE STOP open failed (part $N)"; exit 4; }
  $CON ack $ID --by "$R" --part $N --state ready --attempt $A > /dev/null || { echo "SWIPE STOP ack ready refused (part $N attempt $A)"; exit 1; }
  W=$($CON wait $ID --until started --part $N --epoch $EP --json --quiet --timeout 3000); e=$?
  case $e in
    0) EP=$(js "$W" epoch) ;;
    5) redo_from "$W"; continue ;;
    6) continue ;;
    *) echo "SWIPE STOP wait started part $N exit $e"; exit 3 ;;
  esac
  L=$SV/swipe-p$N-a$A.log
  node tools/iphone.mjs record --owner "$R" --seconds 45 --poll 5 --label "p153-swipe-p$N-a$A" > $L 2>&1 & REC=$!
  if node tools/wait.mjs file $L --match '^RECORDING' --pid $REC --timeout 30 --owner "$R" --reason "P-153 swipe recorder start" > /dev/null; then
    $CON ack $ID --by "$R" --part $N --state recording --attempt $A > /dev/null
  else
    echo "RECORD-SKIPPED part $N attempt $A: $(grep -v '^$' $L | tail -1 | cut -c1-120)"; stoprec
    $CON ack $ID --by "$R" --part $N --state recording --attempt $A --message "not recorded; swipe and judge anyway" > /dev/null
  fi
  W=$($CON wait $ID --until done --part $N --epoch $EP --json --quiet --timeout 1800); e=$?
  case $e in
    0) EP=$(js "$W" epoch) ;;
    5) redo_from "$W"; continue ;;
    *) stoprec; echo "SWIPE STOP wait done part $N exit $e"; exit 3 ;;
  esac
  [ -n "$REC" ] && { node tools/wait.mjs pid $REC --timeout 60 --owner "$R" --reason "P-153 swipe recorder end" > /dev/null || stoprec; REC=""; }
  echo "PART $N done (attempt $A, page $N = arm $( [ $N = 1 ] && echo $A1 || echo $A2 ), log $L)"
  N=$((N + 1)); A=1
  [ $N = 2 ] && A=$(node -e "const s=JSON.parse(process.argv[1]);const p=s.parts[1];console.log(p.attempt || 1)" "$($CON show $ID --json)" 2>/dev/null || echo 1)
done
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
W=$($CON wait $ID --until answered --json --quiet --timeout 1800); e=$?
[ $e -eq 0 ] || { echo "SWIPE STOP wait answered exit $e"; exit 3; }
V=$(js "$W" value)
case $V in 1) PICK=$A1 ;; 2) PICK=$A2 ;; *) PICK=$V ;; esac
node -e "const w=JSON.parse(process.argv[1]);w.pick=process.argv[2];require('fs').writeFileSync('$SV/swipe-answer.json',JSON.stringify(w,null,1))" "$W" "$PICK"
echo "SWIPE PICK $PICK (answer $V, scale $(js "$W" scale); notes in $SV/swipe-answer.json, not printed: the user's text stays local)"
