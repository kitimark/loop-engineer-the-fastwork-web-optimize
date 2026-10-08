#!/bin/sh
# P-165 phone kit (card: fixes/g0-box/README.md "P-165", signed c31626f2): one part of the block = one phone hold.
# Starts the servers (part 1; they keep their ports to the end of part 3), clears any thermal condition of ours ONCE before part 1 (thermal.mjs clear; nothing in the kit ever
# sets one), runs the part's holds in one phone hold with the block mark, and stops the servers after part 3.
#   part 1 (S leg, with the user's ready step first): H1:wC,wV,C1,V2 H2:V3,C4,C5,V6 H3:V7,C8
#   part 2 (G leg, first half):                       H4:WC H5:WV H6:sC,EC1 H7:EV1 H8:sC,EV2
#   part 3 (G leg, second half and the TAIL):         H9:EC2 H10:sC,EC3 H11:EV3 H12:sC,EV4 H13:EC4 H14:TAIL
# Run each part as a Bash background job (timeout 7200000 ms), the next one as soon as the previous ends:
#   sh fixes/g0-box/phone/p165-run.sh P-165 1|2|3        (CM_DRY=1: servers, pins and plans only, no phone)
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/g0-box/phone/p165-run.sh <ticket> 1|2|3"; exit 2; }
T=$1; P=$2; LG=out/p165; mkdir -p $LG
case $P in
  1) SPECS="H1:wC,wV,C1,V2 H2:V3,C4,C5,V6 H3:V7,C8"; RD=1; FH=1 ;;
  2) SPECS="H4:WC H5:WV H6:sC,EC1 H7:EV1 H8:sC,EV2"; RD=0; FH=0 ;;
  3) SPECS="H9:EC2 H10:sC,EC3 H11:EV3 H12:sC,EV4 H13:EC4 H14:TAIL"; RD=0; FH=0 ;;
  # 2b (user T-248, lead 08:2xZ): part 2 was stopped in H8 to hand the iPhone to the user; H8 re-runs alone after the
  # user's Done, with a first heat (the phone cooled), before part 3
  2b) SPECS="H8:sC,EV2"; RD=0; FH=1 ;;
  *) echo "part must be 1, 2, 2b or 3"; exit 2 ;;
esac
# P165_READY=0: part 1 again after the user already answered its ready step in this block (no second step)
RD=${P165_READY:-$RD}
# the servers keep their ports for the whole block (the warm-ups are per arm port, A3/U5): part 1 starts them, parts 2
# and 3 only check them, part 3 stops them (or: sh fixes/g0-box/phone/p165-serve.sh stop)
if [ "$P" = 1 ] || [ "$CM_DRY" = 1 ]; then sh fixes/g0-box/phone/p165-serve.sh start || { echo "BLOCK STOP: servers"; exit 4; }
else sh fixes/g0-box/phone/p165-serve.sh check || { echo "BLOCK STOP: the part 1 servers are not up with the pinned hashes (ports must stay for the block)"; exit 4; }; fi
if [ "$CM_DRY" = 1 ]; then
  CM_TICKET=$T CM_DRY=1 CM_FIRSTHEAT=$FH sh fixes/g0-box/phone/p165-block.sh $SPECS; rc=$?
else
  [ "$P" = 1 ] && { node tools/thermal.mjs clear --owner fix-g0-box > $LG/thermal-clear-$(date +%s).log 2>&1; echo "thermal clear before the block (exit $?)"; }
  CM_TICKET=$T CM_READY=$RD CM_FIRSTHEAT=${P165_FIRSTHEAT:-$FH} node tools/lock.mjs run iphone --owner fix-g0-box --block "$T" --max-seconds 3600 --keep 120 -- \
    sh fixes/g0-box/phone/p165-block.sh $SPECS
  rc=$?
fi
echo "part $P ended (exit $rc)"
{ [ "$P" = 3 ] || [ "$CM_DRY" = 1 ]; } && sh fixes/g0-box/phone/p165-serve.sh stop
echo "EXIT $rc"
exit $rc
