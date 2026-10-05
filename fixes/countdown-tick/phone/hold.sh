#!/bin/sh
# countdown-tick P-130 phone hold: profile xcode-serious, driver G-idle (fixes/countdown-tick/phone/idle-p130.json: a
# reload, 128 s with no touch at the top, one 40 px still stroke after the window), the in-page logger
# fixes/countdown-tick/phone-logger.mjs through gesture --inject. Adapted from toolbar-resize's phone/hold.sh (int-v8's
# P-114 hold.sh), with credit: S/G items replaced by idle G runs with the logger, the gate made xcode-serious
# (--accept-induced), no pre-warm (profile xcode-serious has none), a manifest for p130-block.mjs.
# Runs inside the runner's phone block and a Mac-quiet no-timing hold per part. A gesture run needs GESTURE_BUDGET_S =
# max(150 s, 3x the estimate) = 397 s left in the hold (idle-p130 estMs 132350; I-112, gesture-run refuses with less),
# so at most 2 items per part: ~150 s per item + ~60 s of checks and gates = ~360-400 s per part, declared 700 s, and the
# second item starts with ~500 s left. 5 parts (~35 min with the gaps) plus one re-run fit the 3600 s block:
#   node tools/lock.mjs run iphone --owner <runner> --block P-130 --max-seconds 3600 -- sh -c '
#     for P in "H1 wC wV" "H2 gC1 gV1" "H3 gV2 gC2" "H4 gC3 gV3" "H5 gV4 gC4"; do
#       node tools/lock.mjs run chrome-measure --owner <runner> --no-timing --max-seconds 700 --doing "countdown-tick P-130 $P" -- \
#         env TICKET=P-130 RUNNER=<runner> caffeinate -i -s sh fixes/countdown-tick/phone/hold.sh $P
#     done'
# (the counted order over the block is C V V C C V V C). Start the servers first: sh fixes/countdown-tick/phone/serve.sh.
# Items: wC / wV  uncounted warm-up (same program, --warmup) on that arm's port, first part only
#        gC<n> / gV<n>  counted run n on C (v9-final) / V (v9-final + countdown-tick)
# Before every item: the served JS/CSS of B C V are re-checked (serve.sh check; wrong = the part is VOID).
# Pinned (phone/PINS, refused when different): the logger file, the idle program file and its compiled GESTURE_HASH,
# the idle sentinel phone/idle-raf.mjs.
# A part: WDA check (iphone.mjs wda check, the G-runner rule; not ready = VOID, exit 4), start gate (thermal-gate.mjs
# --expect serious --accept-induced --max-c 44, timer page B), the idle sentinel (phone/idle-raf.mjs on page C: 5 s of rAF
# at the top, read back once, >= 58 fps, else VOID exit 5; the lead's ruling on N5, in place of the S-run control
# sentinel; its fps goes into the part's end line as idleRafFps), the items, end gate,
# the I-098 Mac sleep check. Each run's line goes to out/countdown-tick/p130/runs/manifest.jsonl; p130-block.mjs builds
# block.json from it and p130-read.mjs gives the verdict. A VOID part is re-run whole, once, at the end of the block.
# Nothing here prints the LAN address (Hard rule 12).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-130 ] || { echo "HOLD VOID TICKET must be P-130"; exit 2; }
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/countdown-tick/p130/snap; O=out/countdown-tick/p130/runs; M=$O/manifest.jsonl
LOG=fixes/countdown-tick/phone-logger.mjs; PG=fixes/countdown-tick/phone/idle-p130.json; IRS=fixes/countdown-tick/phone/idle-raf.mjs
mkdir -p $O
pin() { sed -n "s/^$1=//p" fixes/countdown-tick/phone/PINS; }
[ "$(shasum -a 256 $LOG | cut -c1-12)" = "$(pin LOGGER)" ] || { echo "HOLD $H VOID logger is not the pinned $(pin LOGGER)"; exit 4; }
[ "$(shasum -a 256 $PG | cut -c1-12)" = "$(pin PROGRAM)" ] || { echo "HOLD $H VOID idle program is not the pinned $(pin PROGRAM)"; exit 4; }
[ "$(shasum -a 256 $IRS | cut -c1-12)" = "$(pin IDLERAF)" ] || { echo "HOLD $H VOID idle sentinel is not the pinned $(pin IDLERAF)"; exit 4; }
GH=$(node -e "import('./tools/lib/gesture.mjs').then((m) => console.log(m.compileScript(JSON.parse(require('fs').readFileSync('$PG', 'utf8')), {}).hash.slice(0, 12)))")
[ "$GH" = "$(pin GESTURE_HASH)" ] || { echo "HOLD $H VOID GESTURE_HASH $GH is not the pinned $(pin GESTURE_HASH)"; exit 4; }
sh fixes/countdown-tick/phone/serve.sh check > "$O/$H-check-start.log" 2>&1 || { echo "HOLD $H VOID served hash check failed at the start"; exit 4; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $* GESTURE_HASH $GH"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p130-$H-$1" --expect serious --accept-induced --max-c 44 --url "$B"; }
IRF=null
voidp() { echo "{\"hold\":\"$H\",\"end\":true,\"void\":\"$1\",\"idleRafFps\":$IRF,\"at\":\"$(date -u +%FT%TZ)\"}" >> $M; echo "HOLD $H VOID $1"; exit "$2"; }
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1 || voidp "wda check" 4
gate start; g0=$?
[ $g0 -eq 0 ] || voidp "start gate exit $g0" 5
IRL=$(node $IRS --owner "$R" --url "$CU" --label "p130-$H"); ir=$?
echo "$IRL"
IRF=$(echo "$IRL" | awk '/^IDLERAF/ { for (i = 1; i <= NF; i++) if ($i == "fps") { print $(i + 1); exit } }')
[ -n "$IRF" ] || IRF=null
[ $ir -eq 0 ] || voidp "idle sentinel exit $ir: $(echo "$IRL" | sed -n 's/.*-> //p' | tr -d '"\\')" 5
for I in "$@"; do
  sh fixes/countdown-tick/phone/serve.sh check > "$O/$H-check-$I.log" 2>&1 || voidp "served hash check failed before $I" 4
  case $I in
    w[CV]) A=$(echo "$I" | cut -c2); W=--warmup; CNT=false ;;
    g[CV][0-9]*) A=$(echo "$I" | cut -c2); W=; CNT=true ;;
    *) voidp "unknown item $I" 4 ;;
  esac
  [ "$A" = C ] && U=$CU || U=$VU
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || voidp "open $A failed at $I" 4
  AT=$(date -u +%FT%TZ); F=$O/g-$H-$I.json
  node tools/iphone.mjs gesture "$PG" --owner "$R" $W --label "p130-$H-$I" --inject "$LOG" --out "$F" > "$O/g-$H-$I.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "{\"hold\":\"$H\",\"item\":\"$I\",\"arm\":\"$A\",\"counted\":$CNT,\"startedAt\":\"$AT\",\"file\":\"$F\",\"exit\":$r}" >> $M
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
done
gate end; g1=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g1 -ne 0 ] && voidp "end gate exit $g1" 3
[ $p -ne 0 ] && voidp "Mac sleep or dark wake in the hold (I-098)" 3
echo "{\"hold\":\"$H\",\"end\":true,\"void\":null,\"idleRafFps\":$IRF,\"gateStart\":$g0,\"gateEnd\":$g1,\"at\":\"$(date -u +%FT%TZ)\"}" >> $M
echo "HOLD $H VALID $(($(date +%s) - T0)) s"
