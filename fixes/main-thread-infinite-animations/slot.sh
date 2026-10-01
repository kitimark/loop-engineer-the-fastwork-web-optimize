#!/bin/sh
# N3 probe slot: start the servers inside the lock hold, probe, stop them.
# usage: TARGETS="base:- n3base:n3-base" sh out/n3/slot.sh <out.json> <probe2 args...>
#   each target label:topic; topic "-" = the plain baseline (serve.mjs --root site-pretty).
#   All servers use the calibrated flags (--vendors=local --https --latency 150).
set -u
OUTJ="$1"; shift
PIDS=""; ARGS=""
for T in ${TARGETS:-base:-}; do
  L=${T%%:*}; TOP=${T#*:}; LOG=out/n3/slot-serve-$L.log
  if [ "$TOP" = "-" ]; then
    node tools/serve.mjs --root site-pretty --port 0 --vendors=local --https --latency 150 > "$LOG" 2>&1 &
  else
    node tools/fix.mjs serve "$TOP" -- --vendors=local --https --latency 150 > "$LOG" 2>&1 &
  fi
  PIDS="$PIDS $!"
  URL=""
  for i in $(seq 1 60); do URL=$(grep -o 'MIRROR_URL=[^ ]*' "$LOG" | head -1 | cut -d= -f2); [ -n "$URL" ] && break; sleep 0.5; done
  if [ -z "$URL" ]; then echo "server $L did not start"; cat "$LOG"; kill $PIDS 2>/dev/null; exit 1; fi
  echo "$L ($TOP) -> $URL"; ARGS="$ARGS $L=$URL"
done
uptime
node fixes/main-thread-infinite-animations/probe.mjs $ARGS --out "$OUTJ" "$@"; RC=$?
uptime
kill $PIDS 2>/dev/null
exit $RC
