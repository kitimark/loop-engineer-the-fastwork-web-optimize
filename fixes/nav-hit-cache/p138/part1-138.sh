#!/bin/sh
# P-138 part 1 runner (README "D card P-138"). Committed before any P-138 data. Counts only, nothing timed: every
# step is its own shared chrome-measure slot (Chrome: --weight probe; Simulator: --weight simulator, last in the drain).
# Refuses to run unless TICKET=P-138, and refuses to overwrite a record (a re-run needs the lead's word).
# Usage (in the background):
#   TICKET=P-138 sh fixes/nav-hit-cache/p138/part1-138.sh aa       Chrome A/A on K bytes: mobile slot, then desktop slot
#   TICKET=P-138 sh fixes/nav-hit-cache/p138/part1-138.sh kv       Chrome K / V: mobile slot, then desktop slot (needs aa)
#   TICKET=P-138 sh fixes/nav-hit-cache/p138/part1-138.sh sim      Simulator A/A then K / V, two slots each (3 loads a slot)
#   sh fixes/nav-hit-cache/p138/part1-138.sh score                  node p138/counts.mjs on whatever exists
# Order is fixed: aa before kv (the tolerance rule in p138/counts.mjs is committed before the A/A runs).
cd "$(dirname "$0")/../../.." || exit 2
P=fixes/nav-hit-cache/p138
OWNER=${FW_AGENT:-fix-nav-morph}
red() { perl -pe 's/\b(?:10|172|192)\.\d+\.\d+\.\d+\b/<LAN>/g'; }
if [ "$1" = score ]; then
  CH=""; for f in $P/kv-mobile.json $P/kv-desktop.json; do [ -f $f ] && CH="${CH:+$CH,}$f"; done
  AA=""; for f in $P/aa-mobile.json $P/aa-desktop.json; do [ -f $f ] && AA="${AA:+$AA,}$f"; done
  set -- node $P/counts.mjs --json $P/counts-result.json
  [ -n "$CH" ] && set -- "$@" --chrome "$CH"
  [ -n "$AA" ] && set -- "$@" --aa "$AA"
  [ -f $P/sim-kv.json ] && set -- "$@" --sim $P/sim-kv.json
  [ -f $P/sim-aa.json ] && set -- "$@" --sim-aa $P/sim-aa.json
  exec "$@"
fi
[ "$TICKET" = P-138 ] || { echo "TICKET is not P-138: no run"; exit 2; }
fresh() { for f in "$@"; do [ -e "$f" ] && { echo "$f exists: refuse (no re-run without the lead's word)"; exit 3; }; done; }
chrome() { # $1 = base arm, $2 = vp, $3 = out, $4 = what
  echo "START $4 $2 $(date -u +%TZ)"
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner "$OWNER" \
    --doing "nav-hit-cache P-138 part 1: Chrome $4 $2 (counts only)" -- \
    node fixes/nav-hit-cache/probe.mjs count --base "$1" --ctl v9f7d --reps 3 --vp "$2" --out "$3" 2>&1 | red
  r=$?; echo "EXIT $4 $2 $r $(date -u +%TZ)"; [ -s "$3" ] || { echo "no record $3: stop"; exit 4; }
}
simslot() { # $1 = base arm, $2 = out, $3 = what, rest = arm:rep tokens
  b=$1; o=$2; w=$3; shift 3
  echo "START sim $w $* $(date -u +%TZ)"
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner "$OWNER" \
    --doing "nav-hit-cache P-138 part 1: Simulator $w $* (counts only)" -- \
    node tools/sim.mjs session --functional --owner "$OWNER" -- \
    node fixes/nav-hit-cache/simcount.mjs "$o" "$@" --base "$b" --ctl v9f7d 2>&1 | red
  echo "EXIT sim $w $? $(date -u +%TZ)"
}
case $1 in
  aa) fresh $P/aa-mobile.json $P/aa-desktop.json
      chrome v9f7d mobile $P/aa-mobile.json A/A; chrome v9f7d desktop $P/aa-desktop.json A/A ;;
  kv) [ -s $P/aa-mobile.json ] && [ -s $P/aa-desktop.json ] || { echo "no Chrome A/A yet: run aa first"; exit 3; }
      fresh $P/kv-mobile.json $P/kv-desktop.json
      chrome v9f7du2 mobile $P/kv-mobile.json K/V; chrome v9f7du2 desktop $P/kv-desktop.json K/V ;;
  sim) fresh $P/sim-aa.json $P/sim-kv.json
      simslot v9f7d $P/sim-aa.json A/A K:1 V:1 V:2; simslot v9f7d $P/sim-aa.json A/A K:2 K:3 V:3
      simslot v9f7du2 $P/sim-kv.json K/V K:1 V:1 V:2; simslot v9f7du2 $P/sim-kv.json K/V K:2 K:3 V:3 ;;
  *) echo "usage: TICKET=P-138 sh $0 aa|kv|sim  |  sh $0 score"; exit 1 ;;
esac
echo "PART1 STEP $1 DONE"
