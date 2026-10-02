#!/bin/sh
# inside sim.mjs session --functional; env from vhold.sh. MODE may list several modes ("T C"), run in order; each vfix
# run parks Safari on about:blank at its end (I-050), so the tab is put back on the first arm before every mode.
cd "$W" || exit 1
for m in $MODE; do
  node tools/sim.mjs open "$FIRST" 2>&1 | tail -1 | cut -c1-100
  echo "vfix $m at $(( $(date +%s) - T0 ))s"
  MODE=$m node $S/vfix.mjs $O/vres/$TAG $URLS 2>&1 | grep -v '^tab try' | cut -c1-900
done
echo "inner done at $(( $(date +%s) - T0 ))s"
