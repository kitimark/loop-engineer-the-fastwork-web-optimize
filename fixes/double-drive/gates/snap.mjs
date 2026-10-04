#!/usr/bin/env node
// double-drive gate arms: read-only snapshot copies out/double-drive/snap/<arm>/ (gitignored) + HASHES.txt.
//   A  v8-best            = fixes/v8-best/patch.diff                     3e3e94cb6e9f / f836404b3728
//   V  v8 + double-drive  = fixes/v8-best/patch.diff + fixes/double-drive/delta.diff
// Both rebuilt from committed patches with best-build's strict applier (exact context, no fuzz); A is refused on any
// hash difference from v8's pin, V must equal the topic overlay (fixes/double-drive/overlay) when one exists.
//   node fixes/double-drive/gates/snap.mjs
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const A = apply(base, 'fixes/v8-best/patch.diff');
const V = apply(A, 'fixes/double-drive/delta.diff');
const PIN = { [JS]: '3e3e94cb6e9f', [CSS]: 'f836404b3728' };
for (const f of FILES) if (sha(A[f]).slice(0, 12) !== PIN[f]) throw new Error(`A ${f}: ${sha(A[f]).slice(0, 12)} != v8 pin ${PIN[f]}: refused`);
for (const f of FILES) {
  const o = join(WT, 'fixes/double-drive/overlay', f);
  if (existsSync(o) && sha(readFileSync(o, 'utf8')) !== sha(V[f])) throw new Error(`V ${f} differs from the topic overlay: refused`);
}
const OUT = join(WT, 'out/double-drive/snap'); const lines = [];
for (const [arm, t] of Object.entries({ A, V })) {
  const d = join(OUT, arm); rmSync(d, { recursive: true, force: true });
  for (const f of FILES) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); lines.push(`${sha(t[f])} ${arm}/${f}`); }
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
