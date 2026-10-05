#!/bin/sh
# int-v8, P-142 rev 1.1 pre-data (lead ruling 1-2): the Simulator leg of the PR-010 T2 gates for U2 (v9.2 - U2 vs v9.2)
# and nav-fade (v9.2 - nf vs v9.2): px-sim.mjs (frozen frames at rest, A, V, A2, V2 A/A), shared simulator slots, after the
# sim92 smoke. Log out/v92/looks.log.
cd "$(dirname "$0")/../../.." || exit 2
L=out/v92/looks.log
node tools/wait.mjs file $L --match '^SMOKEDONE' --owner int-v8 --reason "P-142 Simulator smoke to finish" --timeout 7000 || exit 3
for P in Mnhc Mnf; do
  echo "=== px-sim A=$P,V=V $(date -u +%H:%M:%SZ)" >> $L
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: Simulator pixel check $P vs v9.2 (no timing)" -- env V9_SNAP=out/v92/snap-6468db04395c node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-best/gates/px-sim.mjs auto A=$P,V=V >> $L 2>&1
  echo "EXIT $? px-sim $P" >> $L
done
echo "SIMPXDONE $(date -u +%H:%M:%SZ)" >> $L
