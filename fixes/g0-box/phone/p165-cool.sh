#!/bin/sh
# P-165 cooling after a ceiling BLOCK STOP (lead ruling 08:5xZ, after H10 read Critical at 41.0 C battery): the phone
# lies idle with Safari parked, no runs, at most 15 min. Every ~3 min one state read (thermal-gate.mjs --no-timer, ~25 s,
# no page) in its own short phone hold, so the lease is free between reads. Ends when a read is no longer Critical: exit 0
# on Serious (PASS) or too cool (Nominal/Fair: the next hold's pre-warm heats). Critical after 15 min: exit 3 (BLOCK STOP,
# message the lead). The decision does not wait on battery C: Critical came below 42 C.
#   sh fixes/g0-box/phone/p165-cool.sh <ticket>
cd "$(dirname "$0")/../../.." || exit 2
T=${1:-P-165}; O=fix-g0-box; LG=out/p165; mkdir -p $LG
T0=$(date +%s); n=0
node tools/lock.mjs run iphone --owner $O --block "$T" --max-seconds 120 -- node tools/iphone.mjs park --owner $O > /dev/null 2>&1
echo "COOL parked Safari (exit $?)"
while :; do
  n=$((n + 1))
  node tools/lock.mjs run iphone --owner $O --block "$T" --max-seconds 120 -- \
    node research/phone-thermal-gate/thermal-gate.mjs --owner $O --label "p165-cool-$n" --expect serious --max-c 44 --no-timer > $LG/cool-$n.log 2>&1
  rc=$?
  echo "COOL read $n at +$(( $(date +%s) - T0 )) s exit $rc: $(grep '^GATE' $LG/cool-$n.log | tail -1)"
  case $rc in
    0|2) echo "COOLED: no longer Critical (exit $rc)"; exit 0 ;;
    3) ;;
    *) echo "COOL read error (exit $rc), retry at the next read" ;;
  esac
  [ $(( $(date +%s) - T0 + 180 )) -le 900 ] || { echo "COOL STOP: still Critical after $(( $(date +%s) - T0 )) s"; exit 3; }
  sleep 150
done
