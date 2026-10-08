#!/bin/sh
# P-166 stage 2 phone kit (card: fixes/g0-box/README.md "P-166", stage 2 signed 41b8b179; lead amendment 10:4xZ, user
# T-247 #12: profile tool-serious): one part = one spot = one phone hold with the block mark. The servers keep their ports
# for both parts (warm-ups are per arm port); part A starts them if they are not up, part B stops them at its end.
#   part A (spot A: v0 · g0.0e · e-nohe; the user's ready step first unless P166_READY=0):
#     H1:Aw0,Awe,Awn,AsC,A01  H2:Ae1,An1,Ae2,An2  H3:A02,An3,A03,Ae3  H4:TAILA (re-runs, then the S heat sentinel AsC)
#   part A2 (lead ruling 11:1xZ: H1 ran 11:03-11:09Z under the earlier kit and stays VALID; resume from H2, the S heat
#     sentinel first, since H1 had none):  H2:AsC,An1,Ae2,An2,A02  H3:An3,A03,Ae3  H4:TAILA
#   part B (spot B: v0 · g0.0e · g0.0f):
#     H5:Bw0,Bwe,Bwf,BsC  H6:B01,Be1,Bf1,Be2  H7:Bf2,B02,Bf3  H8:B03,Be3  H9:TAILB
#   Latin square per spot (X Y K · Y K X · K X Y): A01 Ae1 An1 · Ae2 An2 A02 · An3 A03 Ae3 (B the same with f).
#   <S>sC: ONE uncounted Timeline-OFF S control run on v0 (--heat-sentinel), the only sentinel judged (lead ruling 11:1xZ).
# The block runs with CM_THERMAL=serious (p166-block.sh: `iphone.mjs rearm` owns the condition); right after
# `lock.mjs run iphone` returns (any exit code) this script ends the condition: `node tools/thermal.mjs clear`.
# Start detached (the signature's condition 4): nohup sh fixes/g0-box/phone/p166-run.sh P-166 A > out/g0box/p166-partA.log 2>&1 &
#   CM_DRY=1: servers, pins, tools head and plans only, no phone, no condition.
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/g0-box/phone/p166-run.sh <ticket> A|A2|B"; exit 2; }
T=$1; P=$2; LG=out/p166ph; mkdir -p $LG
case $P in
  A) SPECS="H1:Aw0,Awe,Awn,AsC,A01 H2:Ae1,An1,Ae2,An2 H3:A02,An3,A03,Ae3 H4:TAILA"; RD=1 ;;
  A2) SPECS="H2:AsC,An1,Ae2,An2,A02 H3:An3,A03,Ae3 H4:TAILA"; RD=0 ;;
  B) SPECS="H5:Bw0,Bwe,Bwf,BsC H6:B01,Be1,Bf1,Be2 H7:Bf2,B02,Bf3 H8:B03,Be3 H9:TAILB"; RD=0 ;;
  *) echo "part must be A, A2 or B"; exit 2 ;;
esac
RD=${P166_READY:-$RD}
if sh fixes/g0-box/phone/p166-serve.sh check > $LG/serve-pre-$P.log 2>&1; then echo "servers up: $(grep -c ' ok$' $LG/serve-pre-$P.log) ok"
elif [ "$P" = A ]; then sh fixes/g0-box/phone/p166-serve.sh start || { echo "BLOCK STOP: servers"; echo "EXIT 4"; exit 4; }
else echo "BLOCK STOP: the part A servers are not up with the pinned hashes (ports must stay for the block)"; echo "EXIT 4"; exit 4; fi
if [ "$CM_DRY" = 1 ]; then
  CM_TICKET=$T CM_DRY=1 sh fixes/g0-box/phone/p166-block.sh $SPECS; rc=$?
else
  CM_TICKET=$T CM_READY=$RD CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-g0-box --block "$T" --max-seconds 3600 --keep 120 -- \
    sh fixes/g0-box/phone/p166-block.sh $SPECS
  rc=$?
  node tools/thermal.mjs clear --owner fix-g0-box > $LG/thermal-clear-$(date +%s).log 2>&1; echo "thermal.mjs clear exit $? (the induced condition ended)"
fi
echo "part $P ended (exit $rc)"
[ "$P" = B ] && [ "$CM_DRY" != 1 ] && sh fixes/g0-box/phone/p166-serve.sh stop
echo "EXIT $rc"
exit $rc
