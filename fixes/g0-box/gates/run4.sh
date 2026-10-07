#!/bin/sh
# g0-box: run the seek harness, one shared-lane hold per arm (A = g0.0, V = g0-box), then score.
#   sh fixes/g0-box/gates/run4.sh <outdir> [harness args...]     (engine chrome; sim: ENGINE=sim)
cd "$(dirname "$0")/../../.." || exit 2
O=$1; shift
A=${A:-out/g0box/g00}; V=${V:-fixes/g0-box/overlay}
for arm in ${ARMS:-A V A2 V2}; do
  if [ "${ENGINE:-chrome}" = sim ]; then
    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box --doing "g0-box seek $arm (Simulator pixels)" -- \
      node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/gates/seek.mjs --engine sim --a "$A" --v "$V" --arms $arm --outdir "$O" "$@"
  else
    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-box --doing "g0-box seek $arm (Chrome pixels)" -- \
      node fixes/g0-box/gates/seek.mjs --engine chrome --a "$A" --v "$V" --arms $arm --outdir "$O" "$@"
  fi
  echo "ARM $arm exit $?"
done
node fixes/g0-box/gates/seek.mjs --score --outdir "$O" "$@" > "$O.score" 2>&1
echo "EXIT score $?"
