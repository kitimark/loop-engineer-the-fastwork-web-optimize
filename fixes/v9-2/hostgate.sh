#!/bin/sh
# P-142 part 1 host clause (N4; lead ruling, as P-141 rev 1.1), run inside each step's hold: prints the step-start load1;
# load1 > 200 -> VOID-HOST, exit 9 without running the step (part1.sh re-runs it once, a second VOID-HOST stops part 1);
# else runs the step's command. FW_HOSTGATE_LOAD overrides the read load1 (self-test only).
l=${FW_HOSTGATE_LOAD:-$(sysctl -n vm.loadavg | cut -d' ' -f2)}
echo "STEP-START load1 $l"
if awk -v l="$l" 'BEGIN { exit !(l > 200) }'; then echo "VOID-HOST load1 $l > 200"; exit 9; fi
"$@"
