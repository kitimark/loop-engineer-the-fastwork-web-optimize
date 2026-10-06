#!/bin/sh
# A gate, protocol v2 position-bin census, Chrome side (fix-end-morph-p1; lead ruling 09:35Z). ONE timing hold:
# C1 and A1 from out/p1b/snapi served like fix.mjs ab (root site-pretty, --https --latency 150 --vendors=local),
# verify.mjs --frame-log (mobile 430x932 DPR 3, CPU 6x, idle 6, alternating order), then census.mjs bins the frames of
# every phase by 250 px of scrollY. Run only after P-155 (lead: no timing hold during the phone block), in the background:
#   node tools/lock.mjs run chrome-measure --owner fix-end-morph-p1 --max-seconds 300 --doing "census C vs A (timing)" -- \
#     sh fixes/end-morph-p1/p1b/census-run.sh 2
RUNS=${1:-2}
OUT=out/end-morph-p1/p1b/census-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT"
node tools/serve.mjs --root site-pretty --overlay out/p1b/snapi/C1 --https --latency 150 --vendors=local --port auto --quiet --no-http-twin --state "$OUT/serve-C.json" &
PC=$!
node tools/serve.mjs --root site-pretty --overlay out/p1b/snapi/A1 --https --latency 150 --vendors=local --port auto --quiet --no-http-twin --state "$OUT/serve-A.json" &
PA=$!
trap 'kill $PC $PA 2>/dev/null' EXIT
UC=$(node tools/wait.mjs serve "$OUT/serve-C.json" --pid $PC --owner fix-end-morph-p1 --timeout 60 | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
UA=$(node tools/wait.mjs serve "$OUT/serve-A.json" --pid $PA --owner fix-end-morph-p1 --timeout 60 | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
if [ -z "$UC" ] || [ -z "$UA" ]; then echo "servers did not start"; exit 4; fi
node tools/verify.mjs "C=$UC" "A=$UA" --viewport mobile --cpu 6 --runs "$RUNS" --idle 6 --frame-log --no-screens --out "$OUT" --result "$OUT/verify.json" --owner fix-end-morph-p1
RC=$?
node fixes/end-morph-p1/p1b/census.mjs "$OUT/verify.json"
exit $RC
