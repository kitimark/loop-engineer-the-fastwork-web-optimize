#!/bin/sh
# v11 swipe (int-v11; lead 2026-10-06 18:1xZ: "make the blind swipe test C vs v11 instead of C vs Vc"): blind swipe A/B
# of the end-of-page menu, C (main's v9-final rev 7d, 1b2eecc66011 / e1359ab9994a) against V11 = v11 (Vc + V13 + H1c,
# 9b4a829d15a0 / 62743920fe1a). A credited copy of int-v8's fixes/v10/phone/v10-swipe.sh (itself a copy of
# fix-end-morph-p1's p153-swipe.sh rev 1.1) with: the arms C and V11 from the v11 snapshot, served by
# fixes/v11/phone/v11-serve.sh (out/v11phone, plain http, served hashes checked and logged first), ticket v11-swipe,
# folder out/v11swipe, the lead's go as V11_S_GO=lead, the pins of both arms in every step's meta. Unchanged: a fresh WDA
# session and Safari before the first pair (I-227: since 9b6d7c0d iphone.mjs preflight), a thermal profile read logged, never a
# gate (memory user-steps-first); three pairs, each its own console swipe-pair step posted from inside the runner's phone
# hold (I-123): C/V11 and V11/C (a coin decides which first) and a catch pair C/C (a second coin places it); forced
# choice 1 or 2; "not sure" in the notes = no pick; each side recorded (iphone.mjs record 45 s), records descriptive only.
#   TICKET=v11-swipe V11_S_GO=lead RUNNER=int-v11 node tools/lock.mjs run iphone --owner int-v11 --max-seconds 900 -- sh fixes/v11/phone/v11-swipe.sh
# Output (gitignored out/v11swipe/): swipe-key.json, swipe-answer.json (the user's notes stay only in this local file),
# swipe-<pair>-p<N>-a<attempt>.log. Last line: "SWIPE RESULT real <pick1>/<pick2> catch <pick>" or "SWIPE STOP <why>".
# V11_S_DRY=1: the served-hash check and the coins only (no post, no phone).
# Nothing here prints the LAN address: URLs are http://lan:<port>/, resolved by the tools (I-073, I-119; Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = v11-swipe ] || { echo "TICKET is not v11-swipe: no run"; exit 2; }
R=${RUNNER:-int-v11}; SV=out/v11swipe; KIT=out/v11phone; CON="node tools/console.mjs"; SELF=fixes/v11/phone/v11-swipe.sh
mkdir -p $SV
if [ "$V11_S_DRY" != 1 ]; then
  [ "$V11_S_GO" = lead ] || { echo "SWIPE STOP no lead go (V11_S_GO=lead)"; exit 2; }
fi
{ echo "== $(date -u +%FT%TZ) v11 swipe start"; sh fixes/v11/phone/v11-serve.sh check; } >> $SV/serve-check.log 2>&1 \
  || { echo "SWIPE STOP served hashes not ok (see $SV/serve-check.log)"; exit 4; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$KIT/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V11) || { echo "SWIPE STOP no server state (start fixes/v11/phone/v11-serve.sh first)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
PIN="$SELF=$(shasum -a 256 $SELF | cut -c1-12) C=$(served $PC $JS)/$(served $PC $CSS) V11=$(served $PV $JS)/$(served $PV $CSS)"
[ "$(served $PC $JS)/$(served $PC $CSS)" = 1b2eecc66011/e1359ab9994a ] && [ "$(served $PV $JS)/$(served $PV $CSS)" = 9b4a829d15a0/62743920fe1a ] \
  || { echo "SWIPE STOP served pins are not C 1b2eecc66011/e1359ab9994a and V11 9b4a829d15a0/62743920fe1a: $PIN"; exit 4; }
echo "PIN v11 swipe $PIN"
coin() { od -An -N1 -tu1 /dev/urandom | tr -d ' '; }
[ $(( $(coin) % 2 )) -eq 0 ] && REAL="AB BA" || REAL="BA AB"
CP=$(( $(coin) % 3 ))
case $CP in 0) ORDER="CC $REAL" ;; 1) ORDER="${REAL%% *} CC ${REAL##* }" ;; *) ORDER="$REAL CC" ;; esac
KEY="{\"ticket\":\"v11-swipe\",\"order\":\"$ORDER\",\"pairs\":{\"AB\":{\"1\":\"C\",\"2\":\"V11\"},\"BA\":{\"1\":\"V11\",\"2\":\"C\"},\"CC\":{\"1\":\"C\",\"2\":\"C\"}},\"pin\":\"$PIN\"}"
if [ "$V11_S_DRY" = 1 ]; then echo "SWIPE DRY ok: pair order $ORDER (dry coins, not stored); would post 3 swipe-pair steps as $R"; exit 0; fi
echo "$KEY" > $SV/swipe-key.json
node tools/iphone.mjs profile --owner "$R" > $SV/swipe-profile.log 2>&1; echo "PROFILE read exit $? (logged only, no gate): $(tail -1 $SV/swipe-profile.log | cut -c1-120)"
# a fresh WDA session and Safari before the first pair (I-227), then 60 s (I-225)
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
# ts-i227's preflight (9b6d7c0d, lead 18:3xZ): fresh WDA when the runner predates the USB attach, 60 s settle,
# automation authorized, Safari in front, at most one page. Exit 4 USB, 10 unlock / UI Automation, 11 tabs, 12 proxy,
# 3 WDA: nothing is posted; the lead posts the user step.
node tools/iphone.mjs preflight --owner "$R" > $SV/preflight.log 2>&1; pf=$?
grep -E '^usb: ' $SV/preflight.log | tail -1
[ $pf -eq 0 ] || { echo "SWIPE STOP PREFLIGHT exit $pf: $(tail -1 $SV/preflight.log | cut -c1-160) (nothing posted; message the lead)"; exit 5; }
echo "PREFLIGHT ok: $(tail -1 $SV/preflight.log | cut -c1-160)"
js() { node -e "const j=JSON.parse(process.argv[1]);const v=j[process.argv[2]];console.log(v ?? '')" "$1" "$2"; }
att() { node -e "const j=JSON.parse(process.argv[1]);console.log(j.attempts[process.argv[2]-1])" "$1" "$2"; }
echo '{"pairs":{}}' > $SV/swipe-answer.json
pair() { # $1 = AB | BA | CC: post the step and run it to its answer; prints the unblinded pick
  P=$1
  case $P in AB) U1=$PC; U2=$PV; K1=C; K2=V11 ;; BA) U1=$PV; U2=$PC; K1=V11; K2=C ;; CC) U1=$PC; U2=$PC; K1=C; K2=C ;; esac
  PO=$($CON post --by "$R" --kind swipe-pair --topic v11 \
    --title "End-of-page menu: which page follows your finger better?" \
    --instructions "On each page, swipe down to the very end, then swipe up and down there so the menu at the end opens and closes a few times (about 30 seconds). Judge only that end-of-page menu. Pick 1 or 2; if you are not sure, pick either and write 'not sure' in the notes." \
    --url "http://lan:$U1/" --url2 "http://lan:$U2/" --options 1,2 --scale 1-5 --scale-label "How different did they feel?" \
    --meta "{\"ticket\":\"v11-swipe\",\"pair\":\"$P\",\"key\":{\"1\":\"$K1\",\"2\":\"$K2\"},\"pins\":{\"C\":\"1b2eecc66011/e1359ab9994a\",\"V11\":\"9b4a829d15a0/62743920fe1a\"},\"build\":\"v11 = Vc + V13 + H1c, snapshot HASHES 1704db6c4af6\"}" 2>&1)
  ID=$(echo "$PO" | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p')
  [ -n "$ID" ] || { echo "SWIPE STOP post refused ($P): $(echo "$PO" | head -2)"; exit 1; }
  echo "POSTED $ID (v11 swipe pair $P)"
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
      node tools/iphone.mjs record --owner "$R" --seconds 45 --poll 5 --label "v11-swipe-$P-p$N-a$A" > $L 2>&1 & REC=$!
      if node tools/wait.mjs file $L --match '^RECORDING' --pid $REC --timeout 30 --owner "$R" --reason "v11 swipe recorder start" > /dev/null; then
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A > /dev/null
      else
        echo "RECORD-SKIPPED $P part $N attempt $A: $(grep -v '^$' $L | tail -1 | cut -c1-120)"; stoprec
        $CON ack $ID --by "$R" --part $N --state recording --attempt $A --message "not recorded; swipe and judge anyway" > /dev/null
      fi
      W=$($CON wait $ID --until done --part $N --epoch $EP --json --quiet --timeout 1800); e=$?
      case $e in 0) EP=$(js "$W" epoch) ;; 5) redo_from "$W"; continue ;; *) stoprec; echo "SWIPE STOP wait done ($P part $N) exit $e (no pick)"; exit 3 ;; esac
      [ -n "$REC" ] && { node tools/wait.mjs pid $REC --timeout 60 --owner "$R" --reason "v11 swipe recorder end" > /dev/null || stoprec; REC=""; }
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
echo "SWIPE RESULT real AB $PICK_AB / BA $PICK_BA, catch $PICK_CC (reported, never scored)"
