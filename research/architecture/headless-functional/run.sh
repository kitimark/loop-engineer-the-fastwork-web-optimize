#!/bin/sh
# One-off (ts-headless, 2026-10-02): headed vs --headless=new functional equivalence on the baseline and the all-wave1
# overlay, inside ONE chrome-measure hold:
#   node tools/lock.mjs run chrome-measure --owner ts-headless --max-seconds 420 -- sh research/architecture/headless-functional/run.sh <outdir>
# verify.mjs runs unchanged; headless = $CHROME pointing at a wrapper that adds --headless=new (lib/cdp.mjs chromePath()).
set -u
OUT=${1:?outdir}
H=research/architecture/headless-functional
mkdir -p "$OUT"
WRAP="$OUT/chrome-headless.sh"
printf '#!/bin/sh\nexec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new "$@"\n' > "$WRAP"
chmod +x "$WRAP"
SERVE="--vendors=local --https --latency 150"
node tools/serve.mjs --root site-pretty --port 0 --quiet --state "$OUT/serve-base.json" $SERVE & SB=$!
node tools/serve.mjs --root site-pretty --overlay fixes/all-wave1/overlay --port 0 --quiet --state "$OUT/serve-fix.json" $SERVE & SF=$!
trap 'kill $SB $SF 2>/dev/null' EXIT
node tools/wait.mjs serve "$OUT/serve-base.json" --pid $SB >/dev/null || exit 1
node tools/wait.mjs serve "$OUT/serve-fix.json" --pid $SF >/dev/null || exit 1
B=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-base.json','utf8')).url)")
F=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-fix.json','utf8')).url)")
VARGS="--runs 1 --viewport mobile --cpu 1 --idle 0 --max-wait 0 --chrome-warm 0 --owner ts-headless"
echo "== verify headed"
node $H/treecpu.mjs "$OUT/cpu-verify-headed.json" -- node tools/verify.mjs base=$B fix=$F $VARGS --out "$OUT/headed" --result "$OUT/headed/verify.json" --profile "$OUT/profile-v-headed"
echo "== verify headless"
CHROME="$WRAP" node $H/treecpu.mjs "$OUT/cpu-verify-headless.json" -- node tools/verify.mjs base=$B fix=$F $VARGS --out "$OUT/headless" --result "$OUT/headless/verify.json" --profile "$OUT/profile-v-headless"
echo "== probe headless"
node $H/treecpu.mjs "$OUT/cpu-probe-headless.json" -- node $H/probe.mjs probe headless "$OUT/probe-headless.json" base=$B fix=$F
echo "== probe headed"
node $H/treecpu.mjs "$OUT/cpu-probe-headed.json" -- node $H/probe.mjs probe headed "$OUT/probe-headed.json" base=$B fix=$F
echo "== cross-mode screenshot diffs"
P=""
for t in base fix; do for s in top middle bottom; do P="$P $OUT/headed/mobile-$t-$s.png:$OUT/headless/mobile-$t-$s.png"; done; P="$P $OUT/headed-$t-top.png:$OUT/headless-$t-top.png"; done
node $H/probe.mjs diff "$OUT/diff-cross.json" $P
echo "== done"
