#!/bin/sh
# v10 U2 parity (int-v8): fixes/nav-hit-cache/probe.mjs parity --base v10u2 in three shared probe holds (the 300 s cap),
# cases as for end-morph-v9f: a mobile,desktop  b desktop-rtl,mobile-rtl  c mobile-shift. COUNTS ONLY, nothing timed.
# Usage (worktree root, in the background): sh fixes/v10/parity.sh [a b c]
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}
PARTS=${*:-a b c}
for P in $PARTS; do
  case $P in a) CASES=mobile,desktop ;; b) CASES=desktop-rtl,mobile-rtl ;; c) CASES=mobile-shift ;; *) echo "part $P?"; exit 2 ;; esac
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner "$OWNER" \
    --doing "v10 U2 parity part $P (counts only)" -- \
    node fixes/nav-hit-cache/probe.mjs parity --base v10u2 --cases $CASES --out out/v10/parity-$P.json > out/v10/parity-$P.log 2>&1
  echo "part $P EXIT $?" | tee -a out/v10/parity-$P.log
done
