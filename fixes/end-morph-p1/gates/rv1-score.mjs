// end-morph-p1 (fix-end-morph-p1): score fix-morph-gpu's frozen-frame run (fixes/morph-gpu/gates/frames.mjs, builds
// M = best-build + hook, R = PR-012 rev 1 + hook, M2 = a second M load) with the same PR-010 scorer as em-p1-px.mjs
// (fixes/v9-best/gates/pxlib.mjs scoreStop): per m, rev 1 ~ best-build beyond the M/M2 A/A. This is the in-session
// reference for gate (b): P1 ~ v9-final at the same m must match it within the PR-010 numbers. frames.mjs has one R
// load, so V2 = V (V/V = 0); compare the AV rows.
//   node fixes/end-morph-p1/gates/rv1-score.mjs <out/morph-gpu/frames-<stamp> dir>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { scoreStop, line } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
// Also reads fix-morph-gpu's Simulator run (fixes/morph-gpu/gates/sim-frames.mjs, simframes.json; shots <arm>-<k>-m<m>.png,
// whole Simulator screen, DPR 3; the Safari UI is in the A/A mask).
const dir = resolve(process.argv[2]);
const SIM = existsSync(join(dir, 'simframes.json'));
const res = JSON.parse(readFileSync(join(dir, SIM ? 'simframes.json' : 'frames.json'), 'utf8'));
if (SIM) res.viewport = { engine: 'sim', dpr: 3 };
const out = [];
for (let k = 0; k < res.ms.length; k++) {
  const f = (b) => (SIM ? join(dir, `${b}-${k}-m${res.ms[k]}.png`) : res.builds[b].frames[k].file);
  const row = { k, m: res.ms[k], ...scoreStop({ A: f('M'), V: f('R'), A2: f('M2'), V2: f('R') }, { V: [], V2: [] }, res.viewport.dpr) };
  out.push(row); console.log(line(`m${res.ms[k]}`, row));
}
writeFileSync(join(dir, 'rv1-score.json'), JSON.stringify({ viewport: res.viewport, rvDir: res.rvDir, rows: out }, null, 1));
console.log('wrote', join(dir, 'rv1-score.json'));
