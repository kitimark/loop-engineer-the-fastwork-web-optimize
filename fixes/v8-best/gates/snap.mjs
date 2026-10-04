#!/usr/bin/env node
// v8-best gate arms: read-only snapshot copies out/v8-best/snap/<arm>/ (gitignored) + HASHES.txt (`<sha256> <arm>/<file>`).
//   A  v7-best        = fixes/v7-best/patch.diff         8c90da217745 / 308f0da70c3a
//   V  v8-best        = fixes/v8-best/patch.diff         3e3e94cb6e9f / f836404b3728
//   Q  accent-ca-v7   = fixes/accent-ca-v7/patch.diff    8c90da217745 / 7eda63cc7015 (control: v7 + the accent only)
// All arms are rebuilt from committed patches with best-build's strict applier and refused on any hash difference.
//   node fixes/v8-best/gates/snap.mjs
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS, CSS, FILES, parseDiff, applyHunks } from '../../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const BASE = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(BASE, f), 'utf8')]));
const apply = (t, file) => {
  const d = parseDiff(readFileSync(join(WT, file), 'utf8')); const o = { ...t };
  for (const f of Object.keys(d)) { const r = applyHunks(o[f], d[f]); if (r.error) throw new Error(`${file} ${f}: ${r.error}`); o[f] = r.text; }
  return o;
};
const ARMS = { A: apply(base, 'fixes/v7-best/patch.diff'), V: apply(base, 'fixes/v8-best/patch.diff'), Q: apply(base, 'fixes/accent-ca-v7/patch.diff') };
export const PIN = { A: { [JS]: '8c90da217745', [CSS]: '308f0da70c3a' }, V: { [JS]: '3e3e94cb6e9f', [CSS]: 'f836404b3728' }, Q: { [JS]: '8c90da217745', [CSS]: '7eda63cc7015' } };
const OUT = join(WT, 'out/v8-best/snap'); const lines = [];
for (const [arm, t] of Object.entries(ARMS)) {
  for (const f of FILES) if (sha(t[f]).slice(0, 12) !== PIN[arm][f]) throw new Error(`${arm} ${f}: ${sha(t[f]).slice(0, 12)} != pin ${PIN[arm][f]}: refused`);
  const d = join(OUT, arm); rmSync(d, { recursive: true, force: true });
  for (const f of FILES) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); lines.push(`${sha(t[f])} ${arm}/${f}`); }
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
