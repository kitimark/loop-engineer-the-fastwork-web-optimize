#!/bin/sh
# P-169 (window B only, v0 / g0.0f / f-B2): a copy of p168-run.sh; start detached with out/g0box/watchdog2.sh.
#   nohup sh fixes/g0-box/phone/p169-run.sh P-169 B > out/g0box/p169-partB.log 2>&1 &   (CM_DRY=1: no phone)
# Header below is P-168's.
# P-168 phone kit (card: fixes/g0-box/README.md "P-168"; DRAFT until the lead signs): one part = one window = one phone
# hold with the block mark, profile tool-serious (a copy of p168-run.sh). Arms v0 (0) · g0.0f (e) · k = window A f-cv25,
# window B g0.0g (p168-build.py, p168-serve.sh). The servers keep their ports for both parts (warm-ups are per arm port);
# the first part (P168_FIRST, default A) starts them if they are not up; they stop after the last part (P168_LAST, default B).
#   part A (window A, 0 -> 750; the user's ready step first unless P168_READY=0):
#     H1:Aw0,Awe,Awk,AsC,A01  H2:Ae1,Ak1,Ae2,Ak2  H3:A02,Ak3,A03,Ae3  H4:TAILA (re-runs, then the S heat sentinel AsC)
#   part B (window B, 4000 -> 5000):
#     H5:Bw0,Bwe,Bwk,BsC  H6:B01,Be1,Bk1,Be2  H7:Bk2,B02,Bk3  H8:B03,Be3  H9:TAILB
#   Latin square per window (X Y K · Y K X · K X Y): A01 Ae1 Ak1 · Ae2 Ak2 A02 · Ak3 A03 Ae3 (B the same).
#   <S>sC: ONE uncounted Timeline-OFF S control run on v0 (--heat-sentinel), the only sentinel judged (lead ruling 11:1xZ).
# The block runs with CM_THERMAL=serious (p168-block.sh: `iphone.mjs rearm` owns the condition); right after
# `lock.mjs run iphone` returns (any exit code) this script ends the condition: `node tools/thermal.mjs clear`.
# Start detached: nohup sh fixes/g0-box/phone/p168-run.sh P-168 A > out/g0box/p168-partA.log 2>&1 &
#   CM_DRY=1: servers, pins, tools head and plans only, no phone, no condition.
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/g0-box/phone/p169-run.sh <ticket> B"; exit 2; }
T=$1; P=$2; LG=out/p169ph; mkdir -p $LG
case $P in
  B) SPECS="H5:Bw0,Bwe,Bwk,BsC H6:B01,Be1,Bk1,Be2 H7:Bk2,B02,Bk3 H8:B03,Be3 H9:TAILB"; RD=0 ;;
  *) echo "P-169 has one part: B (window B)"; exit 2 ;;
esac
RD=${P169_READY:-$RD}
export P169_K=fB2   # P-169: k = f-B2 (PR-039 option keep-phase), the only test arm
export P168_ARMS="B v0 f fB2"   # p168-serve.sh reads P168_ARMS; P-169 serves these four
if sh fixes/g0-box/phone/p168-serve.sh check > $LG/serve-pre-$P.log 2>&1; then echo "servers up: $(grep -c ' ok$' $LG/serve-pre-$P.log) ok"
elif [ "$P" = B ]; then sh fixes/g0-box/phone/p168-serve.sh start || { echo "BLOCK STOP: servers"; echo "EXIT 4"; exit 4; }
else echo "BLOCK STOP: the first part's servers are not up with the pinned hashes (ports must stay for the block)"; echo "EXIT 4"; exit 4; fi
if [ "$CM_DRY" = 1 ]; then
  CM_TICKET=$T CM_DRY=1 sh fixes/g0-box/phone/p169-block.sh $SPECS; rc=$?
else
  CM_TICKET=$T CM_READY=$RD CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-g0-box --block "$T" --max-seconds 3600 --keep 120 -- \
    sh fixes/g0-box/phone/p169-block.sh $SPECS
  rc=$?
  node tools/thermal.mjs clear --owner fix-g0-box > $LG/thermal-clear-$(date +%s).log 2>&1; echo "thermal.mjs clear exit $? (the induced condition ended)"
fi
echo "part $P ended (exit $rc)"
# the servers stop after the last part (default B; P168_FIRST / P168_LAST follow the signed order)
[ "$P" = B ] && [ "$CM_DRY" != 1 ] && sh fixes/g0-box/phone/p168-serve.sh stop
echo "EXIT $rc"
exit $rc
