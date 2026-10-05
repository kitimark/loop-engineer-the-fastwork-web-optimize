#!/bin/sh
# P-147 phone no-worse check (PHONE TICKET P-147 in fixes/cd-roll-ca/README.md): one block in one phone hold (rev 1.1,
# ops-reader-P147 N2/N3/N6/N8 and the lead's rulings). Profile xcode-serious (iphone.mjs run's default --profile serious: Xcode Device
# Conditions > Thermal State Serious, no heat pre-warm, no cooling wait; never thermal.mjs). Run only inside the iphone
# hold, with the servers up (sh fixes/cd-roll-ca/phone/p147-serve.sh):
#   node tools/lock.mjs run iphone --owner fix-cd-roll-ca-r4 --block P-147 --max-seconds 3600 -- \
#     node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner fix-cd-roll-ca-r4 \
#       --doing "P-147 phone block <B>" -- caffeinate -i -s sh fixes/cd-roll-ca/phone/p147-hold.sh <SET> <B>
# <SET> = the pin set the lead named (A or B, served by p147-serve.sh <SET>); <B> = the block number (1 or 2: the
# budget is 2 blocks for P-147, whatever the reason), or 'smoke' (N5, uncounted, recorded under out/p147/runs/<SET>-smoke):
# step 0 as below, then ONE C run in the counted geometry (label p147-smoke-C, heat sentinel judged), the scorer on it
# (served pins of the set), and the fixed go/no-go: scroll >= 44 fps and sentinel phase >= 58 fps -> 'SMOKE GO' (exit 0),
# else 'SMOKE NO-GO' (exit 7: stop, report to the lead, no block). Low Power Mode is declared off (--low-power off): the runner
# checks it on the phone before the hold and the block log says so.
# Steps:
#   0. per arm (C, then V), uncounted, each run with --no-park and checked by its exit code:
#      0a. W jump to the page end (--from 999999 --to 999999 --idle 3 --hold 2 --sentinel 0 --warmup), then
#          p147-mread.mjs: the page end at rest (its maxY) and m (recorded, not the gate).
#      0b. W in the counted geometry (--from <C's 0a page end - 2400> --to 999999 --idle 3 --hold 12 --sentinel 3
#          --warmup; also the arm's warm-up), then p147-mread.mjs: the GATE read. Both reads exactly '1' on both arms
#          -> go on; else PRE-READ STOP (exit 5, no counted run; report to the lead).
#      A warm-up run that exits non-zero, or a read tool error (mread exit 1), is a tool fault: HOLD VOID (exit 4).
#   1. counted runs C1 V2 V3 C4 C5 V6 V7 C8 in the counted geometry (each run parks Safari). Exit 8 (the profile
#      refuses: misfit or ceiling, Critical or battery >= 44 C) ends the hold: HOLD VOID profile (exit 6). Any other
#      non-zero exit: the same position is run once more at once (label p147-<I>r); a second failure: HOLD VOID tool
#      fault (exit 4).
#   2. the I-098 sleep check over the hold (pmcheck.mjs): a Mac sleep -> HOLD VOID (exit 3).
# Last lines: "SCORE <arm>:<file> ..." (the run file of each position, in block order) and "HOLD <B> VALID" (exit 0),
# or "HOLD <B> VOID <why>" / "HOLD <B> PRE-READ STOP <why>". Nothing here prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
SET=${1:?pin set A or B}; B=${2:?block number 1 or 2}
case $SET in A|B) ;; *) echo "usage: p147-hold.sh A|B 1|2|smoke"; exit 2 ;; esac
case $B in 1|2|smoke) ;; *) echo "usage: p147-hold.sh A|B 1|2|smoke"; exit 2 ;; esac
S=out/p147; O=out/p147/runs/$SET-b$B; [ $B = smoke ] && O=out/p147/runs/$SET-smoke
[ -e "$O" ] && { echo "HOLD $B VOID $O exists (a block number is used once)"; exit 4; }
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
PC=$(port C); PV=$(port V)
CU=$(node tools/lan.mjs --url --port "$PC") || exit 2
VU=$(node tools/lan.mjs --url --port "$PV") || exit 2
T0=$(date +%s)
echo "HOLD $B start $(date -u +%FT%TZ) block P-147 set $SET"
R="node tools/iphone.mjs run --driver window --probe std --owner fix-cd-roll-ca-r4 --block P-147 --low-power off"
park() { node tools/iphone.mjs park --owner fix-cd-roll-ca-r4 > /dev/null; }
open() { node tools/iphone.mjs open "$1" --owner fix-cd-roll-ca-r4 > /dev/null || { echo "HOLD $B VOID open failed ($2)"; exit 4; }; }
mread() { node fixes/cd-roll-ca/phone/p147-mread.mjs --port $1 --arm $2 > "$O/p147-mread-$3.json"; r=$?; cat "$O/p147-mread-$3.json"
  [ $r -eq 1 ] && { echo "HOLD $B VOID m-read tool error ($3)"; park; exit 4; }; return $r; }
warm() { $R --arm $1 --warmup --no-park $2 --label "p147-b$B-$3" --out "$O/p147-$3.json" > "$O/p147-$3.log" 2>&1; r=$?
  [ $r -eq 8 ] && { echo "HOLD $B VOID profile refused ($3)"; park; exit 6; }
  [ $r -ne 0 ] && { echo "HOLD $B VOID warm-up $3 exit $r (tool fault)"; park; exit 4; }; return 0; }
# 0a: the page end at rest, from C (V read for the record)
for A in C V; do
  if [ $A = C ]; then U=$CU; P=$PC; else U=$VU; P=$PV; fi
  open "$U" "0a $A"; warm $A "--from 999999 --to 999999 --idle 3 --hold 2 --sentinel 0" "w0a$A"; mread $P $A "0a$A"; park
done
MAXY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$O/p147-mread-0aC.json','utf8')).facts[1].maxY)")
FROM=$((MAXY - 2400)); [ $FROM -lt 0 ] && FROM=0
GEO="--from $FROM --to 999999 --idle 3 --hold 12 --sentinel 3"
echo "page end (C, at rest) $MAXY; counted geometry: $GEO"
# 0b: the gate read after the counted geometry's scroll-in
for A in C V; do
  if [ $A = C ]; then U=$CU; P=$PC; else U=$VU; P=$PV; fi
  open "$U" "0b $A"; warm $A "$GEO" "w0b$A"; mread $P $A "0b$A"; g=$?; park
  [ $g -eq 0 ] || { echo "HOLD $B PRE-READ STOP: arm $A menu not open at rest after the scroll-in (STOP, report to the lead)"; exit 5; }
done
if [ $B = smoke ]; then
  open "$CU" smoke
  $R $GEO --arm C --run smoke --label p147-smoke-C --out "$O/p147-smoke-C.json" > "$O/p147-smoke-C.log" 2>&1; r=$?
  echo "RUN smoke-C exit $r $(date -u +%TZ)"
  node fixes/cd-roll-ca/phone/p147-score.mjs --set $SET C:$O/p147-smoke-C.json
  node -e "const s=JSON.parse(require('fs').readFileSync('$O/p147-smoke-C.json','utf8')).meta.sentinel;console.log('sentinel',JSON.stringify(s));process.exit(s&&s.pass===true?0:7)"; g=$?
  [ $r -eq 0 ] && [ $g -eq 0 ] && { echo "SMOKE GO (set $SET)"; exit 0; }
  echo "SMOKE NO-GO (set $SET; run exit $r): stop, report to the lead, no block"; exit 7
fi
LIST=""
for I in C1 V2 V3 C4 C5 V6 V7 C8; do
  case $I in C*) A=C; U=$CU ;; V*) A=V; U=$VU ;; esac
  L=$I
  for try in 1 2; do
    open "$U" "$L"
    $R $GEO --arm $A --run ${I#?} --label "p147-b$B-$L" --out "$O/p147-$L.json" > "$O/p147-$L.log" 2>&1; r=$?
    echo "RUN $L exit $r $(date -u +%TZ)"
    [ $r -eq 8 ] && { echo "HOLD $B VOID profile refused at $L"; exit 6; }
    [ $r -eq 0 ] && break
    [ $try -eq 2 ] && { echo "HOLD $B VOID tool fault: $I failed twice"; exit 4; }
    L=${I}r
  done
  LIST="$LIST $A:$O/p147-$L.json"
done
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $p -ne 0 ] && { echo "HOLD $B VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "SCORE --set $SET$LIST"
echo "HOLD $B VALID"
