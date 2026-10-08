#!/bin/sh
# P-167 phone kit (card: fixes/g0-box/README.md "P-167"; DRAFT until the lead signs): one part = one window = one phone
# hold with the block mark, profile tool-serious (a copy of p166-run.sh). Arms v0 (0) · g0.0e (e) · k = the knock-out
# named by P167_K (default ko2; p167-build.py, p167-serve.sh). The servers keep their ports for both parts (warm-ups are
# per arm port); part A starts them if they are not up, part B stops them at its end.
#   part A (window A, 0 -> 750; the user's ready step first unless P167_READY=0):
#     H1:Aw0,Awe,Awk,AsC,A01  H2:Ae1,Ak1,Ae2,Ak2  H3:A02,Ak3,A03,Ae3  H4:TAILA (re-runs, then the S heat sentinel AsC)
#   part B (window B, 4000 -> 5000):
#     H5:Bw0,Bwe,Bwk,BsC  H6:B01,Be1,Bk1,Be2  H7:Bk2,B02,Bk3  H8:B03,Be3  H9:TAILB
#   Latin square per window (X Y K · Y K X · K X Y): A01 Ae1 Ak1 · Ae2 Ak2 A02 · Ak3 A03 Ae3 (B the same).
#   <S>sC: ONE uncounted Timeline-OFF S control run on v0 (--heat-sentinel), the only sentinel judged (lead ruling 11:1xZ).
# The block runs with CM_THERMAL=serious (p167-block.sh: `iphone.mjs rearm` owns the condition); right after
# `lock.mjs run iphone` returns (any exit code) this script ends the condition: `node tools/thermal.mjs clear`.
# Start detached: nohup sh fixes/g0-box/phone/p167-run.sh P-167 A > out/g0box/p167-partA.log 2>&1 &
#   CM_DRY=1: servers, pins, tools head and plans only, no phone, no condition.
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/g0-box/phone/p167-run.sh <ticket> A|B"; exit 2; }
T=$1; P=$2; LG=out/p167ph; mkdir -p $LG
case $P in
  A) SPECS="H1:Aw0,Awe,Awk,AsC,A01 H2:Ae1,Ak1,Ae2,Ak2 H3:A02,Ak3,A03,Ae3 H4:TAILA"; RD=1 ;;
  B) SPECS="H5:Bw0,Bwe,Bwk,BsC H6:B01,Be1,Bk1,Be2 H7:Bk2,B02,Bk3 H8:B03,Be3 H9:TAILB"; RD=0 ;;
  *) echo "part must be A or B"; exit 2 ;;
esac
RD=${P167_READY:-$RD}
export P167_K=${P167_K:-ko2}   # the card's k (Simulator census 12:5xZ: only ko2 moves the layer count toward v0)
export P167_ARMS="B v0 e $P167_K"
if sh fixes/g0-box/phone/p167-serve.sh check > $LG/serve-pre-$P.log 2>&1; then echo "servers up: $(grep -c ' ok$' $LG/serve-pre-$P.log) ok"
elif [ "$P" = A ]; then sh fixes/g0-box/phone/p167-serve.sh start || { echo "BLOCK STOP: servers"; echo "EXIT 4"; exit 4; }
else echo "BLOCK STOP: the part A servers are not up with the pinned hashes (ports must stay for the block)"; echo "EXIT 4"; exit 4; fi
if [ "$CM_DRY" = 1 ]; then
  CM_TICKET=$T CM_DRY=1 sh fixes/g0-box/phone/p167-block.sh $SPECS; rc=$?
else
  CM_TICKET=$T CM_READY=$RD CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-g0-box --block "$T" --max-seconds 3600 --keep 120 -- \
    sh fixes/g0-box/phone/p167-block.sh $SPECS
  rc=$?
  node tools/thermal.mjs clear --owner fix-g0-box > $LG/thermal-clear-$(date +%s).log 2>&1; echo "thermal.mjs clear exit $? (the induced condition ended)"
fi
echo "part $P ended (exit $rc)"
[ "$P" = B ] && [ "$CM_DRY" != 1 ] && sh fixes/g0-box/phone/p167-serve.sh stop
echo "EXIT $rc"
exit $rc
