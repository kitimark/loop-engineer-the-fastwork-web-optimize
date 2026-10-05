#!/bin/sh
# Phone clips of the trouble spots (T-170 #101, plan approved by the lead 2026-10-05 04:3xZ): one phone hold.
# Records the iPhone screen (tools/ioscap.mjs, the only allowed recorder) while a driver runs the original page (A) or
# v8 (V); the same driver input on both sides. Thermal profile: serious (the default; Xcode heat mode on, lead's
# change of profile, T-178 #6 / T-179): the tools' start read refuses a misfit (exit 8) and posts their own step.
# Committed before any phone data. Runs as the command of the runner's own phone hold:
#   node tools/lock.mjs run iphone --owner art-worst-cases --max-seconds 900 -- \
#     caffeinate -i -s sh research/team-article/capture/phone/hold.sh H1 --dnd eA1 eV1 eV2 eA2 sA1 sV1 sV2 sA2
#   ... H2 hA1 hV1 hV2 hA2 fA1 fV1 fV2 fA2
# Items (<scene><arm><n>, C V V C order per scene):
#   e  G  fixes/v8-best/phone/g/flick-end-v1.json    end of the page: flicks into the end and out, twice
#   s  S  iphone.mjs run --driver scroll --probe std  scripted scroll top to bottom: dark section (~1,970) and switches
#   h  G  fixes/v8-best/phone/g/flick-hero-v1.json   fast flicks through the top card
#   f  G  fixes/v8-best/phone/g/flick-fresh-v1.json  flicks right after load
# --dnd: before the first item, post ONE console action step asking for Do Not Disturb (only while no other phone step
# is open: console.mjs post refuses otherwise) and wait for the user's Done.
# Per item: serve.sh check; open the arm's URL; viewport read (vv.mjs, start); clock stamp; ioscap record (background,
# --out out/iphone-screen/pc-<H>-<item>.mov) until its app says it is recording; the ready check (WDA answers and the
# tab is listed, re-open on failure; added after H1); clock stamp; the driver; clock stamp;
# viewport read (end); stop the recorder (SIGTERM: it closes the file); park Safari.
# Clock stamps (stamps.jsonl): Mac wall ns and CLOCK_UPTIME_RAW ns (mach_absolute_time, the host clock the capture's
# PTS should be on: OBSERVED-to-verify, phone-clips.mjs cross-checks it against the frames' content changes).
# Nothing here prints or stores the LAN address outside out/ (Hard rule 12); nobody views a frame (I-062).
# Last line: "HOLD <H> DONE <n ok>/<n items>" (exit 0), or "HOLD <H> STOP <why>" (exit 3/4/8).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=art-worst-cases
S=out/phone-clips/snap; O=out/phone-clips/runs; G=fixes/v8-best/phone/g; P=research/team-article/capture/phone
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
PA=$(port A); PV=$(port V)
AU=$(node tools/lan.mjs --url --port "$PA") || exit 2
VU=$(node tools/lan.mjs --url --port "$PV") || exit 2
stamp() { python3 -c "import time,json,sys; print(json.dumps({'label': sys.argv[1], 'wallNs': time.time_ns(), 'upRawNs': time.clock_gettime_ns(time.CLOCK_UPTIME_RAW)}))" "$1" >> $O/stamps.jsonl; }
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node tools/iphone.mjs profile --owner $R > $O/pc-$H-profile.log 2>&1; pr=$?
tail -3 $O/pc-$H-profile.log
[ $pr -eq 8 ] && { echo "HOLD $H STOP profile misfit at the start read (the tool posted its step); no run"; exit 8; }
[ $pr -ne 0 ] && { echo "HOLD $H STOP profile read failed (exit $pr)"; exit 4; }
if [ "$1" = --dnd ]; then
  shift
  node tools/console.mjs post --by $R --kind action --phone --title "iPhone: turn on Do Not Disturb for the screen clips" \
    --instructions "Turn on Do Not Disturb on the iPhone (Control Center, Focus), leave Safari open and don't touch the phone. Press Done when it is on; the robot then records about 10 minutes of clips." \
    > $O/pc-$H-dnd.log 2>&1 || { cat $O/pc-$H-dnd.log; echo "HOLD $H STOP could not post the DND step (another phone step open?)"; exit 4; }
  ID=$(grep -o 'C-[0-9][0-9]*' $O/pc-$H-dnd.log | head -1)
  echo "DND step $ID posted; waiting for Done"
  node tools/console.mjs wait "$ID" --until answered --timeout 900 > $O/pc-$H-dnd-wait.log 2>&1 || { tail -1 $O/pc-$H-dnd-wait.log; echo "HOLD $H STOP DND step $ID not answered"; exit 3; }
  echo "DND step $ID answered $(date -u +%TZ)"
fi
n=0; ok=0
for I in "$@"; do
  n=$((n + 1))
  sh $P/serve.sh check > $O/pc-$H-check-$I.log 2>&1 || { echo "HOLD $H STOP served hash check failed before $I"; exit 4; }
  SC=$(echo "$I" | cut -c1); A=$(echo "$I" | cut -c2)
  [ "$A" = A ] && { U=$AU; PP=$PA; } || { U=$VU; PP=$PV; }
  L=pc-$H-$I
  node tools/iphone.mjs open "$U" --owner $R > /dev/null || { echo "HOLD $H STOP open $A failed at $I"; exit 4; }
  sleep 2
  node $P/vv.mjs --port "$PP" --label "$L-start" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err
  stamp "$L-pre"
  rm -f out/iphone-screen/$L.log
  node tools/ioscap.mjs record --owner $R --seconds 150 --label "$L" --out out/iphone-screen/$L.mov > $O/$L.cap.log 2>&1 &
  CP=$!
  w=0; until grep -q 'recording the iPhone screen' out/iphone-screen/$L.log 2>/dev/null || [ $w -ge 100 ] || ! kill -0 $CP 2>/dev/null; do sleep 0.2; w=$((w + 1)); done
  sleep 1
  # H1 lesson (eA1, sV1): starting a recording can drop the phone's inspector and WDA links for a few seconds
  # (OBSERVED, cause unknown; likely the USB link re-forming). Before the driver: WDA answers and the tab is listed
  # (the viewport read, label -ready, proves both); else re-open the URL and retry, at most 6 tries.
  k=0
  until node tools/iphone.mjs wda check > /dev/null 2>&1 && node $P/vv.mjs --port "$PP" --label "$L-ready" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err; do
    k=$((k + 1)); [ $k -ge 6 ] && break
    sleep 3; node tools/iphone.mjs open "$U" --owner $R > /dev/null 2>&1
  done
  echo "READY $I after $k retries $(date -u +%TZ)"
  stamp "$L-rec"
  case $SC in
    s) node tools/iphone.mjs run --driver scroll --probe std --owner $R --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    e|h|f)
      case $SC in e) GS=$G/flick-end-v1.json ;; h) GS=$G/flick-hero-v1.json ;; f) GS=$G/flick-fresh-v1.json ;; esac
      node tools/iphone.mjs gesture "$GS" --owner $R --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    *) echo "HOLD $H STOP unknown item $I"; kill -TERM $CP; wait $CP; exit 4 ;;
  esac
  stamp "$L-post"
  node $P/vv.mjs --port "$PP" --label "$L-end" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err
  sleep 1
  kill -TERM $CP 2>/dev/null; wait $CP; c=$?
  node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  [ $r -eq 0 ] && [ $c -eq 0 ] && ok=$((ok + 1))
  echo "RUN $I driver exit $r recorder exit $c $(date -u +%TZ) $(grep -m1 -o 'frames [^,]*' $O/$L.cap.log)"
  [ $r -eq 8 ] && { echo "HOLD $H STOP profile misfit at $I"; exit 8; }
done
echo "HOLD $H DONE $ok/$n"
