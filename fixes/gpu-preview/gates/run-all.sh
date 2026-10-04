#!/bin/sh
# gpu-preview checks, all in the shared lane (no timing, no phone), one queue entry at a time. From the worktree root,
# after `node fixes/gpu-preview/build.mjs --snapshot && node fixes/gpu-preview/snap.mjs` and
# `node tools/fix.mjs apply best-build --reset` (the A side of the functional check). Logs: out/gpu-preview/run-*.log
O=wi-gpu-bundle
L=out/gpu-preview; mkdir -p $L
run() { # <weight> <log> <doing> -- cmd...
  w=$1; log=$2; doing=$3; shift 4
  node tools/lock.mjs run chrome-measure --shared --weight $w --max-seconds 300 --owner $O --doing "$doing" --for gpu-preview -- "$@" > $L/run-$log.log 2>&1
  echo "EXIT $log $?" | tee -a $L/run-$log.log
}
run check check "GPU preview: Chrome functional check vs best build (no timing)" -- node tools/fix.mjs check gpu-preview --on best-build --viewport both --save
run probe census "GPU preview: Chrome work counts, best build vs preview (no timing)" -- node fixes/gpu-preview/gates/census-run.mjs A,G
SIM="node tools/sim.mjs session --functional --owner $O --"
run simulator simpx "GPU preview: Simulator countdown frames, roll alone vs preview" -- $SIM node fixes/gpu-preview/gates/simpx.mjs V9,G fade50 wrap
run simulator morph "GPU preview: Simulator morph frames, morph fix alone vs preview" -- $SIM node fixes/gpu-preview/gates/morph-frames.mjs M,G,M2
run simulator hero "GPU preview: Simulator hero frames, hero fix alone vs preview" -- $SIM node fixes/gpu-preview/gates/sim-hero-counts.mjs frames H,G,H2
run simulator counts "GPU preview: Simulator work counts, best build vs preview" -- $SIM node fixes/gpu-preview/gates/sim-hero-counts.mjs counts A,G,A2,G2
echo "EXIT all"
