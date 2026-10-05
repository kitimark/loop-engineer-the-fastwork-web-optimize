#!/bin/sh
# P-142 part 1 (counts, no timing; fixes/v9-2/README.md "P-142"): Chrome census, the NF-C nav reveal band, the Simulator
# whole-page census. C = F = v9-final, V = v9.2, Mnf = v9.2 - nav-fade; arms from out/v92/snap-6468db04395c (HASHES.txt
# checked here and served hashes checked by every probe). Each step is its own shared hold (<= 300 s; one queue entry at a
# time). Committed before any part 1 data; runs only after the lead's sign and the pre-data read. Log out/v92/part1.log.
#   sh fixes/v9-2/part1.sh            (in the background)
cd "$(dirname "$0")/../.." || exit 2
S=out/v92/snap-6468db04395c
L=out/v92/part1.log
mkdir -p out/v92/sim
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse" >> $L; exit 3; }
echo "PIN part1 $(date -u +%FT%TZ) head $(git rev-parse --short=8 HEAD) part1.sh $(shasum -a 256 fixes/v9-2/part1.sh | cut -c1-12) motion.mjs $(shasum -a 256 fixes/v9-2/nf/motion.mjs | cut -c1-12) chromecount.mjs $(shasum -a 256 fixes/v9-2/nf/chromecount.mjs | cut -c1-12) sim92.mjs $(shasum -a 256 fixes/v9-2/sim92.mjs | cut -c1-12) census-run.mjs $(shasum -a 256 fixes/v9-best/gates/census-run.mjs | cut -c1-12) HASHES $(shasum -a 256 $S/HASHES.txt | cut -c1-12)" >> $L
probe() { # $1 weight, $2 doing, rest: command. N4 (lead, as P-141 rev 1.1): load1 > 200 when the step starts inside its
  # hold -> VOID-HOST (exit 9 before the command runs, so no record is written; a record from a step that started
  # VOID-HOST would be moved to -void1), one re-run; a second VOID-HOST stops part 1.
  w="$1"; d="$2"; shift 2
  for try in 1 2; do
    echo "=== $* $(date -u +%H:%M:%SZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2) try $try" >> $L
    touch out/v92/part1.mark
    node tools/lock.mjs run chrome-measure --shared --weight "$w" --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: $d (no timing)" -- \
      sh fixes/v9-2/hostgate.sh "$@" >> $L 2>&1
    e=$?
    # the step's records (N6): census-run writes out/v9/census-<arm>-<ts>.json beside older files; motion.mjs out/nav-fade/motion-chrome-nfc*
    find out/v9 out/nav-fade -maxdepth 1 -newer out/v92/part1.mark \( -name 'census-*.json' -o -name 'motion-chrome-nfc*' \) | sed 's/^/RECORD /' >> $L
    echo "EXIT $e $d $(date -u +%H:%M:%SZ) load1-end $(sysctl -n vm.loadavg | cut -d' ' -f2)" >> $L
    [ $e -ne 9 ] && return 0
  done
  echo "VOID-HOST twice at $d: part 1 stopped (to the lead)" >> $L; exit 9
}
# 1. Chrome census (whole page, work counts per s; 430x932 mobile, CPU 1x as every census so far), F and V alternating
probe probe "Chrome census v9-final vs v9.2, loads 1-4" env V9_SNAP=$S node fixes/v9-best/gates/census-run.mjs F,V,V2,F2
probe probe "Chrome census v9-final vs v9.2, loads 5-6" env V9_SNAP=$S node fixes/v9-best/gates/census-run.mjs V3,F3
# 2. NF-C: the nav reveal band, v9.2 - nav-fade (Mnf) vs v9.2 (V), nav-fade's motion.mjs counts pass (CPU 1x, its default)
probe probe "nav reveal band counts, run 1" node fixes/v9-2/nf/motion.mjs --engine chrome --arms Mnf=$S/Mnf,V=$S/V,Mnf2=$S/Mnf --passes counts --scen topIn,glideThru,end --label nfc1
probe probe "nav reveal band counts, run 2" node fixes/v9-2/nf/motion.mjs --engine chrome --arms V=$S/V,Mnf=$S/Mnf,V2=$S/V --passes counts --scen topIn,glideThru,end --label nfc2
probe probe "nav reveal band counts, run 3" node fixes/v9-2/nf/motion.mjs --engine chrome --arms Mnf=$S/Mnf,V=$S/V,Mnf2=$S/Mnf --passes counts --scen topIn,glideThru,end --label nfc3
# 3. Simulator whole-page census (WebKit Timeline record counts), F and V alternating, two loads a session
for P in "F:1 V:1" "V:2 F:2" "F:3 V:3"; do
  probe simulator "Simulator census v9-final vs v9.2 ($P)" node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-2/sim92.mjs out/v92/sim/p142.json $P
done
echo "PART1DONE $(date -u +%H:%M:%SZ)" >> $L
