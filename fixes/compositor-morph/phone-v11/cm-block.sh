#!/bin/sh
# compositor-morph block driver (card: fixes/compositor-morph/README.md "Phone card"). A copy of fix-end-morph's
# fixes/end-morph-f12/phone/p155-block.sh (credit: fix-end-morph; P-152 rev 1.4 + park lineage) with the cm names.
# Runs inside ONE phone hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order,
# one item each (cm-hold.sh). Start the servers first: sh fixes/compositor-morph/phone-v11/cm-serve.sh start.
#   CM_TICKET=P-NNN node tools/lock.mjs run iphone --owner <runner> --block P-NNN --max-seconds 3600 --keep 120 -- \
#     sh fixes/compositor-morph/phone-v11/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL
#   then (attribution, uncounted, after the end sentinel): ... H<n>:AN H<n+1>:AS H<n+2>:AR
# Rules as P-155: every part starts with cm-serve.sh check, `wda ensure` (I-220) and a Safari restart (I-214); Safari parked on
# every exit; before every hold: park, phone-temp --below 38 --timeout 900 (xcode-serious profile: the cooling wait is the
# lead's call, CM_COOL=0 skips it), WDA check (one restart); ONE item per hold; a time-guard VOID (7) is re-run once;
# H<n>:TAIL = the RERUN-NEEDED counted runs (at most 2), each once as <run>r, then S1.
# Logs: out/cmp11/hold-<H>.log. CM_DRY=1: calls cm-hold.sh directly (dry: pins and plan only).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: CM_TICKET=P-NNN sh fixes/compositor-morph/phone-v11/cm-block.sh H<n>:<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-arch-compositor-morph}; LG=out/cmp11; HS=fixes/compositor-morph/phone-v11/cm-hold.sh; SS=fixes/compositor-morph/phone-v11/cm-serve.sh
mkdir -p $LG
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -c .)
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it items (one item per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "$CM_TICKET $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -2 $LG/cooling.log | grep -E '^(MET|TIMEOUT|UNAVAILABLE|COOL)'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
[ "$CM_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: cm-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok$') of 3 servers"
wdarestart() { # I-220 (5803d436): wda ensure keeps a READY WDA, else restarts what is down; exit 4 = re-plug the cable
  node tools/iphone.mjs wda ensure --owner "$R" > $LG/wda-ensure-$(date +%s).log 2>&1; we=$?
  [ $we -eq 4 ] && { echo "BLOCK STOP: WDA REPLUG NEEDED (cable; see $LG/wda-ensure-*.log): message the lead"; exit 5; }
  [ $we -eq 0 ] || { echo "BLOCK STOP: wda ensure exit $we (see $LG/wda-ensure-*.log)"; exit 5; }
  echo "WDA READY (ensure)"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
}
[ "$CM_DRY" = 1 ] || wdarestart
# CM_THERMAL=serious (P-158 pre-data amendment, lead, user T-228 #15; profile tool-serious, never pooled with xcode-serious):
# the condition is held by `thermal.mjs set serious` in the background for the whole part (I-199 stage 3), never by
# Xcode; then `iphone.mjs preflight --settle 120`. A start gate that reads Critical (I-225): thermalrearm (kill the set,
# `thermal.mjs clear`, a plain read once a minute until Nominal/Fair, at most 10, set serious again, settle 120 s) and
# the hold runs once more. No user step.
TP=""
thermalset() {
  TL=$LG/thermal-$(date +%s).log
  node tools/thermal.mjs set serious > $TL 2>&1 & TP=$!
  node tools/wait.mjs file $TL --match '^SET' --pid $TP --timeout 180 --owner "$R" --reason "$CM_TICKET thermal condition serious" > /dev/null 2>&1 \
    || { echo "BLOCK STOP: thermal.mjs set serious gave no SET (see $TL)"; exit 8; }
  echo "THERMAL $(grep -m1 '^SET' $TL)"
  PL=$LG/preflight-$(date +%s).log
  node tools/iphone.mjs preflight --owner "$R" --settle 120 > $PL 2>&1; pe=$?
  [ $pe -eq 0 ] || { echo "BLOCK STOP: preflight exit $pe ($(tail -1 $PL)): message the lead"; exit 9; }
  echo "PREFLIGHT ok (settle 120 s)"
}
thermalrearm() {
  [ -n "$TP" ] && { kill $TP 2>/dev/null; wait $TP 2>/dev/null; TP=""; }
  node tools/thermal.mjs clear >> $LG/thermal-rearm.log 2>&1
  echo "REARM $(date -u +%FT%TZ): cleared; plain reads until Nominal/Fair" | tee -a $LG/thermal-rearm.log
  k=0; while [ $k -lt 10 ]; do
    node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "cm-rearm-$k" --expect fair --no-timer >> $LG/thermal-rearm.log 2>&1 && break
    k=$((k + 1)); sleep 50
  done
  [ $k -lt 10 ] || { echo "BLOCK STOP: no Nominal/Fair read in 10 reads after clear (I-225): message the lead"; exit 10; }
  echo "REARM plain read $(grep '^GATE' $LG/thermal-rearm.log | tail -1)"
  thermalset
}
if [ "$CM_THERMAL" = serious ] && [ "$CM_DRY" != 1 ]; then
  export CM_PROFILE=tool-serious
  trap '[ -n "$TP" ] && kill $TP 2>/dev/null; node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "thermal condition released, Safari parked (exit trap)"' EXIT
  thermalset
fi
prehold() {
  [ "$CM_DRY" = 1 ] && { echo "PREHOLD $1 (dry: no park, no cooling, no WDA check)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari before $1" || echo "PARK before $1 failed (the hold goes on)"
  if [ "${CM_COOL:-1}" = 1 ]; then coolwait 38 900 "cooling before $1" || { echo "BLOCK STOP: the phone did not cool below 38 °C in 900 s before $1"; exit 6; }; fi
  if node tools/iphone.mjs wda check > $LG/wda-check-$1-$(date +%s).log 2>&1; then echo "WDA READY before $1"
  else echo "WDA not ready before $1: one restart"; wdarestart; fi
}
hold() {
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$CM_DRY" = 1 ]; then CM_GATE=both sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else CM_GATE=both node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "$CM_TICKET $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID|PROG|PLAN)' $LG/hold-$h.log
  [ "$CM_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
run1() {
  prehold $1; hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; prehold $1; hold "$@"; e=$?; }
  # a start gate that read Critical (thermal-gate exit 3 -> hold VOID exit 5) under the tool-held condition: re-arm, once
  if [ $e -eq 5 ] && [ "$CM_THERMAL" = serious ] && grep -q 'VOID start gate exit 3' $LG/hold-$1.log; then
    echo "CRITICAL at $1's start gate: I-225 re-arm"; thermalrearm; prehold $1; hold "$@"; e=$?
  fi
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
}
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(ls $LG/hold-H*.log 2>/dev/null | sort -t H -k 2 -n | while read f; do sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^E[CV][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run, the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2}, then S1, one item per hold"
    N=${H#H}
    [ -n "$R1" ] && { run1 H$N ${R1}r; N=$((N + 1)); }
    [ -n "$R2" ] && { run1 H$N ${R2}r; N=$((N + 1)); }
    run1 H$N S1
  else run1 $H $items; fi
done
echo "BLOCK PART DONE: $*"
