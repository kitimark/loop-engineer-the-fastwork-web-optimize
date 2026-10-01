#!/bin/sh
# One-off (ts-headless, 2026-10-02), round 2: does a UA override (HeadlessChrome -> Chrome) make headless match headed
# (Hotjar's bootstrap skips /headless/i UAs)? Does --screen-info with the host's DSF change layers or pixels? Within-mode
# noise (headed twice), and 3 headless probes in parallel (wall, CPU). ONE chrome-measure hold:
#   node tools/lock.mjs run chrome-measure --owner ts-headless --max-seconds 420 -- sh research/architecture/headless-functional/run2.sh <outdir>
set -u
OUT=${1:?outdir}
H=research/architecture/headless-functional
mkdir -p "$OUT"
WRAP="$OUT/chrome-headless-screen.sh"
cat > "$WRAP" <<'EOF'
#!/bin/sh
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new "--screen-info={0,0 1512x982 devicePixelRatio=2}" "$@"
EOF
chmod +x "$WRAP"
SERVE="--vendors=local --https --latency 150"
node tools/serve.mjs --root site-pretty --port 0 --quiet --state "$OUT/serve-base.json" $SERVE >/dev/null & SB=$!
node tools/serve.mjs --root site-pretty --overlay fixes/all-wave1/overlay --port 0 --quiet --state "$OUT/serve-fix.json" $SERVE >/dev/null & SF=$!
trap 'kill $SB $SF 2>/dev/null' EXIT
node tools/wait.mjs serve "$OUT/serve-base.json" --pid $SB >/dev/null || exit 1
node tools/wait.mjs serve "$OUT/serve-fix.json" --pid $SF >/dev/null || exit 1
B=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-base.json','utf8')).url)")
F=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-fix.json','utf8')).url)")
p() { node $H/treecpu.mjs "$OUT/cpu-$1.json" -- node $H/probe.mjs probe $2 "$OUT/$1/probe.json" base=$B fix=$F; }
echo "== A headed";               p A headed
echo "== B headless-ua";          p B headless-ua
# NOTE: as run on 2026-10-02 this line read `CHROME="$WRAP" p C headless-ua-screen`; a prefix assignment before a
# shell FUNCTION persists in POSIX sh, so A2 and P1-P3 also ran with the wrapper (see equivalence-2026-10-02.json note).
# Fixed for re-runs with a subshell:
echo "== C headless-ua-screen";   (CHROME="$WRAP"; export CHROME; p C headless-ua-screen)
echo "== A2 headed";              p A2 headed
echo "== P: 3 x headless-ua in parallel"
node $H/treecpu.mjs "$OUT/cpu-P.json" -- sh -c "node $H/probe.mjs probe headless-ua $OUT/P1/probe.json base=$B fix=$F & node $H/probe.mjs probe headless-ua $OUT/P2/probe.json base=$B fix=$F & node $H/probe.mjs probe headless-ua $OUT/P3/probe.json base=$B fix=$F & wait"
echo "== diffs"
P=""
for t in base fix; do
  P="$P $OUT/A/headed-$t-top.png:$OUT/A2/headed-$t-top.png $OUT/A/headed-$t-top.png:$OUT/B/headless-ua-$t-top.png $OUT/A/headed-$t-top.png:$OUT/C/headless-ua-screen-$t-top.png $OUT/B/headless-ua-$t-top.png:$OUT/P1/headless-ua-$t-top.png $OUT/P1/headless-ua-$t-top.png:$OUT/P2/headless-ua-$t-top.png"
done
node $H/probe.mjs diff "$OUT/diff.json" $P
echo "== done"
