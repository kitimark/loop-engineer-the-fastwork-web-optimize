#!/bin/sh
# One shared-lane hold of the breakpoint sweep: serve the baseline and the immutable fix copy, run sweep.mjs, stop both.
# usage (from the worktree root, inside the hold):
#   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner de-breakpoints -- \
#     sh research/breakpoints/run.sh <pix|pixr|census|resize> | probe <args of the probe script>
# env: OVL   overlay dir(s) of the S arm, comma-separated, first wins (default out/breakpoints/snap/st6-rb2)
#      BOVL  overlay dir(s) of the B/B2 control arm (default none: the plain snapshot)
#      OUTNAME  output dir name under out/breakpoints/ (default the mode)
#      PROBE    probe script for `probe` (default probe-anims; probe-accent)
#      CONFIGS / BUDGET / ONLY / SETTLE pass through to sweep.mjs. Output: out/breakpoints/<OUTNAME>/ (gitignored).
# Serve immutable copies (cp -R an overlay to out/breakpoints/snap/<name> and check its hashes), never a live overlay.
MODE=${1:?mode}
OVL=${OVL:-out/breakpoints/snap/st6-rb2}
OUT=out/breakpoints/${OUTNAME:-$MODE}
mkdir -p "$OUT"
rm -f out/breakpoints/serve-B.json out/breakpoints/serve-S.json
node tools/serve.mjs --root site-pretty --host 127.0.0.1 --https --no-http-twin --vendors=local --no-cache --quiet ${BOVL:+--overlay "$BOVL"} --state out/breakpoints/serve-B.json > "$OUT/serve-B.log" 2>&1 &
PB=$!
node tools/serve.mjs --root site-pretty --host 127.0.0.1 --https --no-http-twin --vendors=local --no-cache --quiet --overlay "$OVL" --state out/breakpoints/serve-S.json > "$OUT/serve-S.log" 2>&1 &
PS=$!
trap 'kill $PB $PS 2>/dev/null' EXIT INT TERM
UB=$(node tools/wait.mjs serve out/breakpoints/serve-B.json --pid $PB --timeout 60 --reason "baseline server for the breakpoint sweep" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
US=$(node tools/wait.mjs serve out/breakpoints/serve-S.json --pid $PS --timeout 60 --reason "fix-stack server for the breakpoint sweep" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
[ -n "$UB" ] && [ -n "$US" ] || { echo "servers did not come up: B=$UB S=$US"; cat "$OUT"/serve-*.log | tail -20; exit 2; }
echo "B=$UB S=$US (B overlay: ${BOVL:-none}; S overlay: $OVL)"
if [ "$MODE" = probe ]; then shift; node "research/breakpoints/${PROBE:-probe-anims}.mjs" "$@" "B=$UB" "S=$US"; else node research/breakpoints/sweep.mjs "$MODE" "$OUT" "B=$UB" "S=$US"; fi
