#!/bin/sh
# Simulator dry run of the phone clip scenes (lead, 2026-10-05: build and dry-run every new scene and crop read with no
# phone; counts only, no frame viewed). Runs as the <cmd> of a FUNCTIONAL Simulator session in a shared slot:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner art-worst-cases -- \
#     node tools/sim.mjs session --functional --owner art-worst-cases -- sh research/team-article/capture/phone/simdry.sh [rects] [gestures]
# rects: per arm, open the page and read the scene elements' geometry (rects.mjs) -> out/phone-clips/sim/rects-<arm>.json
# (env RFLAGS: extra rects.mjs flags, e.g. "--sweep --watch"; env ARMS: the arms, default "A V")
# gestures: per arm and scene script, `sim.mjs gesture <script> --count-only` (I-184: counts only, no timing) -> its log
# Needs serve.sh running (A and V ports from out/phone-clips/snap/serve-<arm>.json). Simulator numbers never pool with
# phone numbers; the geometry is a plan for the phone, re-read on the phone at every run (vv.mjs / rects.mjs).
cd "$(dirname "$0")/../../../.." || exit 2
O=out/phone-clips/sim; P=research/team-article/capture/phone; mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('out/phone-clips/snap/serve-$1.json','utf8')).port)"; }
for X in ${ARMS:-A V}; do
  PX=$(port $X)
  case " $* " in *" rects "*)
    node tools/sim.mjs open "http://127.0.0.1:$PX/" > $O/open-$X.log 2>&1 || { echo "OPEN $X failed"; tail -3 $O/open-$X.log; continue; }
    sleep 4
    node $P/rects.mjs --port "$PX" --out $O/rects-$X.json --label $X $RFLAGS || echo "RECTS $X failed" ;;
  esac
  case " $* " in *" gestures "*)
    node tools/sim.mjs wda start > $O/wda-$X.log 2>&1 || { echo "WDA start failed"; tail -3 $O/wda-$X.log; }
    for G in $P/g/*.json; do
      n=$(basename $G .json)
      node tools/sim.mjs open "http://127.0.0.1:$PX/" > /dev/null 2>&1
      node tools/sim.mjs gesture $G --count-only --label "dry-$X-$n" > $O/gesture-$X-$n.log 2>&1; r=$?
      echo "GESTURE $X $n exit $r"; tail -4 $O/gesture-$X-$n.log | cut -c1-220
    done ;;
  esac
done
echo "SIMDRY DONE"
