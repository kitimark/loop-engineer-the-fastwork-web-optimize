#!/usr/bin/env node
// gpu-preview: read-only snapshot copies for the gates (out/gpu-preview/snap/<arm>/, gitignored) + HASHES.txt
// (`<sha256> <arm>/<file>`, the cd-roll-ca simpx format). Every arm comes out of build.mjs's checked trees:
//   A   best build (main 60df1cf)                          65052c4a3902 / e0f92804c521
//   G   the GPU preview bundle                             (build.mjs)
//   GH  G + morph-gpu's frozen-frame hook (gates only): the exact diff rv -> rvhook of fix-morph-gpu's snapshots
//   H   hero alone on best = B-R2 (bundle - morph - cd)    8018ce062d30 / 71b65c667720 (the hero owner's)
//   MH  morph-gpu alone on best + hook = rvhook            81a43009c62d / 257507365449 (fix-morph-gpu's snapshot)
//   V9  cd-roll-ca alone (st6-rb2 + cd-strip + roll)       582d120c9f8f / 982a747d9263 (the cd-roll-ca owner's)
//   BC  best + cd-strip + cd-roll-ca (bundle - hero - morph)
//   node fixes/gpu-preview/snap.mjs
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS, CSS, FILES, parseDiff, applyHunks, udiff } from '../best-build/build.mjs';
import { build } from './build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(WT, 'out/gpu-preview/snap');
const sha = (b) => createHash('sha256').update(b).digest('hex');
// fix-morph-gpu's own snapshots (read only), hash-checked
const MG = join(WT, '../agent-a4e37c413d9ae3d5b/out/snapshots');
const RV = join(MG, 'rv-372b99478871'), RVH = join(MG, 'rvhook-81a43009c62d');
const { G, trees, baseline, result } = build({ quiet: true });
const read = (d, f) => readFileSync(join(d, f), 'utf8');
const rv = Object.fromEntries(FILES.map((f) => [f, read(RV, f)])), rvh = Object.fromEntries(FILES.map((f) => [f, read(RVH, f)]));
const want = { [JS]: ['372b99478871', '81a43009c62d'], [CSS]: ['257507365449', '257507365449'] };
for (const f of FILES) {
  if (sha(rv[f]).slice(0, 12) !== want[f][0] || sha(rvh[f]).slice(0, 12) !== want[f][1]) throw new Error(`fix-morph-gpu snapshot ${f} changed: refused`);
  if (rv[f] !== trees.rv[f]) throw new Error(`rv snapshot ${f} differs from build.mjs's rv`);
}
const work = join(WT, 'out/gpu-preview/work'); mkdirSync(work, { recursive: true });
const hookDiff = udiff(rv[JS], rvh[JS], `a/${JS}`, `b/${JS}`, work);
writeFileSync(join(work, 'delta-hook.diff'), hookDiff);
const r = applyHunks(G[JS], parseDiff(hookDiff)[JS]); if (r.error) throw new Error('hook delta does not apply to the bundle: ' + r.error);
const GH = { [JS]: r.text, [CSS]: G[CSS] };
const ARMS = { A: trees.best, G, GH, H: trees.br2, MH: rvh, V9: trees.v9, BC: trees.bc };
const lines = [];
for (const [arm, t] of Object.entries(ARMS)) {
  const dir = join(OUT, arm);
  if (existsSync(dir)) for (const f of FILES) { try { chmodSync(join(dir, f), 0o644); } catch {} }
  rmSync(dir, { recursive: true, force: true });
  for (const f of FILES) {
    lines.push(`${sha(t[f])} ${arm}/${f}`);
    if (t[f] === baseline[f]) continue; // overlay holds only changed files
    mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), t[f]); chmodSync(join(dir, f), 0o444);
  }
  console.log(`${arm.padEnd(3)} js ${sha(t[JS]).slice(0, 12)} css ${sha(t[CSS]).slice(0, 12)}`);
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n');
console.log(`hook delta ${sha(hookDiff).slice(0, 12)} applied to G with offsets ${JSON.stringify(r.offsets)}; bundle ${result.build[JS]} / ${result.build[CSS]}`);
console.log(`wrote ${OUT}`);
