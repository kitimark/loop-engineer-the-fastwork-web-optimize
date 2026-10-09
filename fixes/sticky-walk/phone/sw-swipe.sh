#!/bin/sh
# sticky-walk blind swipe A/B (lead 2026-10-09, user T-228 #121 "swipe test yes"): g0.0i (C, snap-i/C, 9162843e750f /
# adb875d94c1f) against g0.0j (V, snap-i/V, 9162843e750f / bee7fce9ad56), the drag down toward the end of the page.
# A credited copy of int-v11's fixes/v11/phone/v11-swipe.sh (itself from int-v8's v10-swipe.sh and fix-end-morph-p1's
# p153-swipe.sh) with: servers from fixes/sticky-walk/phone/sw-serve.sh (out/swp, plain http, hashes checked), folder
# out/swswipe, TWO pairs only and no catch pair (lead: about 5 minutes), counterbalanced: a coin decides whether pair 1 is
# C/V or V/C, pair 2 is the reverse; forced choice 1, 2 or same; each side recorded (iphone.mjs record 30 s, descriptive
# only). No thermal induction and no timed block (a perception test). Each pair is its own console swipe-pair step,
# posted from inside the runner's phone hold (I-123); every wait passes --epoch and treats exit 5 as the user's
# "Start over" (the redo is handled in the loop, as in v11-swipe).
#   sh fixes/sticky-walk/phone/sw-serve.sh start
#   TICKET=sw-swipe node tools/lock.mjs run iphone --owner fix-scrollcb-g0 --max-seconds 900 -- sh fixes/sticky-walk/phone/sw-swipe.sh
#   sh fixes/sticky-walk/phone/sw-serve.sh stop
# Output (gitignored out/swswipe/): swipe-key.json, swipe-answer.json (the user's notes stay only in this local file),
# swipe-<pair>-p<N>-a<attempt>.log. Last line: "SWIPE RESULT pair1 <pair> <pick> / pair2 <pair> <pick>" or "SWIPE STOP <why>".
# SW_S_DRY=1: the served-hash check and the coin only (no post, no phone).
# Nothing here prints the LAN address: URLs are http://lan:<port>/, resolved by the tools (I-073, I-119; Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = sw-swipe ] || { echo "TICKET is not sw-swipe: no run"; exit 2; }
R=${RUNNER:-fix-scrollcb-g0}; SV=out/swswipe; KIT=out/swp; CON="node tools/console.mjs"; SELF=fixes/sticky-walk/phone/sw-swipe.sh
mkdir -p $SV
# No thermal induction, no user step (lead 2026-10-09; user T-228 #15): record's default --profile serious posted Xcode
# steps (C-133/134/135) when the phone read Nominal; record now runs --profile fair in tool mode (I-186, I-225), after
# one profile read per hold made before any pair is posted (a misfit then records nothing, it never posts a step).
export FW_PHONE_CONDITION=tool
{ echo "== $(date -u +%FT%TZ) sw swipe start"; sh fixes/sticky-walk/phone/sw-serve.sh check; } >> $SV/serve-check.log 2>&1 \
  || { echo "SWIPE STOP served hashes not ok (see $SV/serve-check.log)"; exit 4; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$KIT/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) || { echo "SWIPE STOP no server state (start fixes/sticky-walk/phone/sw-serve.sh first)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
CPIN=9162843e750f/adb875d94c1f; VPIN=9162843e750f/bee7fce9ad56
PIN="$SELF=$(shasum -a 256 $SELF | cut -c1-12) C=$(served $PC $JS)/$(served $PC $CSS) V=$(served $PV $JS)/$(served $PV $CSS)"
[ "$(served $PC $JS)/$(served $PC $CSS)" = $CPIN ] && [ "$(served $PV $JS)/$(served $PV $CSS)" = $VPIN ] \
  || { echo "SWIPE STOP served pins are not C $CPIN and V $VPIN: $PIN"; exit 4; }
echo "PIN sw swipe $PIN"
coin() { od -An -N1 -tu1 /dev/urandom | tr -d ' '; }
if [ -n "$SW_ORDER" ]; then ORDER=$SW_ORDER; else [ $(( $(coin) % 2 )) -eq 0 ] && ORDER="CV VC" || ORDER="VC CV"; fi
KEY="{\"ticket\":\"sw-swipe\",\"order\":\"$ORDER\",\"pairs\":{\"CV\":{\"1\":\"C g0.0i\",\"2\":\"V g0.0j\"},\"VC\":{\"1\":\"V g0.0j\",\"2\":\"C g0.0i\"}},\"pin\":\"$PIN\"}"
if [ "$SW_S_DRY" = 1 ]; then echo "SWIPE DRY ok: pair order $ORDER (dry coin, not stored); would post 2 swipe-pair steps as $R"; exit 0; fi
# Adopt mode (SW_ADOPT_ID=C-nnn SW_ADOPT_PAIR=VC SW_ADOPT_PART=N SW_ADOPT_ATT=A SW_ADOPT_EP=E SW_ORDER="VC CV"): a runner
# restarted while the user is inside a posted pair takes that step over at "wait done" of the given part (no post, no
# park, no preflight, the key and answer files kept).
if [ -z "$SW_ADOPT_ID" ]; then
echo "$KEY" > $SV/swipe-key.json
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
node tools/iphone.mjs preflight --owner "$R" > $SV/preflight.log 2>&1; pf=$?
[ $pf -eq 0 ] || { echo "SWIPE STOP PREFLIGHT exit $pf: $(tail -1 $SV/preflight.log | cut -c1-160) (nothing posted; message the lead)"; exit 5; }
echo "PREFLIGHT ok: $(tail -1 $SV/preflight.log | cut -c1-160)"
else echo "ADOPT $SW_ADOPT_ID pair $SW_ADOPT_PAIR part $SW_ADOPT_PART attempt $SW_ADOPT_ATT epoch $SW_ADOPT_EP order $ORDER"; fi
PROF=""
profread() { # once per hold, before a pair is posted: fits fair (Nominal or Fair, not induced) -> record; else no record
  [ -n "$PROF" ] && return
  node tools/iphone.mjs profile --owner "$R" --profile fair --condition tool > $SV/profile.log 2>&1 && PROF=ok || PROF=no
  echo "PROFILE fair $PROF: $(grep -v '^$' $SV/profile.log | tail -1 | cut -c1-140)"
}
js() { node -e "const j=JSON.parse(process.argv[1]);const v=j[process.argv[2]];console.log(v ?? '')" "$1" "$2"; }
att() { node -e "const j=JSON.parse(process.argv[1]);console.log(j.attempts[process.argv[2]-1])" "$1" "$2"; }
[ -n "$SW_ADOPT_ID" ] || echo '{"pairs":{}}' > $SV/swipe-answer.json
NP=0
pair() { # $1 = CV | VC: post the step and run it to its answer; prints the unblinded pick
  P=$1; NP=$((NP + 1))
  case $P in CV) U1=$PC; U2=$PV; K1=C; K2=V ;; VC) U1=$PV; U2=$PC; K1=V; K2=C ;; esac
  SKIP=0
  if [ -n "$SW_ADOPT_ID" ] && [ "$P" = "$SW_ADOPT_PAIR" ]; then
  ID=$SW_ADOPT_ID; EP=$SW_ADOPT_EP; N=$SW_ADOPT_PART; A=$SW_ADOPT_ATT; REC=""; SKIP=1; echo "ADOPTED $ID ($P)"
  else
  profread
  PO=$($CON post --by "$R" --kind swipe-pair --topic sticky-walk \
    --title "Blind swipe: which page follows your finger better while you drag down toward the end? (pair $NP of 2)" \
    --instructions "On each page, swipe down from the top all the way to the end with your finger. Then pick the page that follows your finger better, or 'same' if you feel no difference." \
    --url "http://lan:$U1/" --url2 "http://lan:$U2/" --options 1,2,same \
    --meta "{\"ticket\":\"sw-swipe\",\"pair\":\"$P\",\"n\":$NP,\"key\":{\"1\":\"$K1\",\"2\":\"$K2\"},\"pins\":{\"C\":\"g0.0i $CPIN\",\"V\":\"g0.0j $VPIN\"}}" 2>&1)
  ID=$(echo "$PO" | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p')
  [ -n "$ID" ] || { echo "SWIPE STOP post refused ($P): $(echo "$PO" | head -2)"; exit 1; }
  echo "POSTED $ID (sw swipe pair $NP $P)"
  EP=0; N=1; A=1; REC=""
  fi
  stoprec() { [ -n "$REC" ] && kill "$REC" 2>/dev/null; REC=""; }
  redo_from() { stoprec; N=$(js "$1" part); A=$(att "$1" "$N"); EP=$(js "$1" epoch); echo "REDO $P from part $N attempt $A epoch $EP"; }
  while :; do
    while [ $N -le 2 ]; do
      if [ $SKIP = 1 ]; then SKIP=0; else
      [ $N = 1 ] && U="http://lan:$U1/" || U="http://lan:$U2/"
      $CON ack $ID --by "$R" --part $N --state loading --attempt $A > /dev/null || { echo "SWIPE STOP ack loading refused ($P part $N attempt $A)"; exit 1; }
      node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "SWIPE STOP open failed ($P part $N)"; exit 4; }
      $CON ack $ID --by "$R" --part $N --state ready --attempt $A > /dev/null || { echo "SWIPE STOP ack ready refused ($P part $N attempt $A)"; exit 1; }
      W=$($CON wait $ID --until started --part $N --epoch $EP --json --quiet --timeout 3000); e=$?
      case $e in 0) EP=$(js "$W" epoch) ;; 5) redo_from "$W"; continue ;; 6) continue ;; *) echo "SWIPE STOP wait started ($P part $N) exit $e (no pick)"; exit 3 ;; esac
      L=$SV/swipe-$P-p$N-a$A.log
      if [ "$PROF" = ok ]; then node tools/iphone.mjs record --owner "$R" --profile fair --seconds 30 --poll 5 --label "sw-swipe-$P-p$N-a$A" > $L 2>&1 & REC=$!; else echo "no record: the profile read did not fit fair" > $L; REC=""; fi
      if [ -n "$REC" ] && node tools/wait.mjs file $L --match '^RECORDING' --pid $REC --timeout 30 --owner "$R" --reason "sw swipe recorder start" > /dev/null; then
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A > /dev/null
      else
        echo "RECORD-SKIPPED $P part $N attempt $A: $(grep -v '^$' $L | tail -1 | cut -c1-120)"; stoprec
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A --message "not recorded; swipe and judge anyway" > /dev/null
      fi
      fi
      W=$($CON wait $ID --until done --part $N --epoch $EP --json --quiet --timeout 1800); e=$?
      case $e in 0) EP=$(js "$W" epoch) ;; 5) redo_from "$W"; continue ;; *) stoprec; echo "SWIPE STOP wait done ($P part $N) exit $e (no pick)"; exit 3 ;; esac
      [ -n "$REC" ] && { node tools/wait.mjs pid $REC --timeout 60 --owner "$R" --reason "sw swipe recorder end" > /dev/null || stoprec; REC=""; }
      N=$((N + 1))
      A=$(node -e "const s=JSON.parse(process.argv[1]);const p=s.parts[1];console.log(p.attempt || 1)" "$($CON show $ID --json)" 2>/dev/null || echo 1)
    done
    W=$($CON wait $ID --until answered --epoch $EP --json --quiet --timeout 1800); e=$?
    case $e in 0) break ;; 5) redo_from "$W"; continue ;; *) echo "SWIPE STOP wait answered ($P) exit $e (no pick)"; exit 3 ;; esac
  done
  V=$(js "$W" value)
  case $V in 1) PK=$K1 ;; 2) PK=$K2 ;; same) PK=same ;; *) PK=none ;; esac
  # "same" or "not sure" in the notes = same (lead 2026-10-07; the notes stay in the local answer file only)
  node -e "const w=JSON.parse(process.argv[1]);if(/not sure|\bsame\b/i.test(w.notes||''))process.exit(3)" "$W" || PK=same
  node -e "const f='$SV/swipe-answer.json',a=JSON.parse(require('fs').readFileSync(f,'utf8'));const w=JSON.parse(process.argv[1]);a.pairs[process.argv[2]]={...w,pick:process.argv[3]};a.pin=process.argv[4];require('fs').writeFileSync(f,JSON.stringify(a,null,1))" "$W" "$P" "$PK" "$PIN"
  echo "PAIR $NP $P pick $PK (answer $V)"
  eval "PICK_$P=$PK"
}
for P in $ORDER; do pair $P; done
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
P1=${ORDER%% *}; P2=${ORDER##* }
eval "A1=\$PICK_$P1; A2=\$PICK_$P2"
echo "SWIPE RESULT pair1 $P1 $A1 / pair2 $P2 $A2 (C = g0.0i, V = g0.0j)"
