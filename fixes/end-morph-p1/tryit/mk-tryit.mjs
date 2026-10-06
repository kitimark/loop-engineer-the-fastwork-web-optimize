// PR-012 rev 2 Try-it patches (fix-end-morph-p1, lead's order 2026-10-06): baseline-relative patch files of the two
// P-153 snapshot arms, so the console's Try-it panel can serve them (it takes only fixes/<topic>/patch.diff paths).
//   fixes/end-morph-p1-a/patch.diff  option A = v9-final + F1 + U2   (JS a6426953727a, CSS e1359ab9994a)
//   fixes/end-morph-p1-b/patch.diff  option B = A + P1               (JS 4da641f828bb, CSS a81b9af7b2c9)
// Source bytes: out/p153/snap/{C,V} (int-v8's snapshot snap-4da641f828bb, HASHES c5138adb7dd2), checked here.
// Then each patch is applied back onto the baseline with the strict applier (exact context) and must give those bytes.
//   node fixes/end-morph-p1/tryit/mk-tryit.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, sha, parseDiff, applyHunks, udiff } from '../../best-build/build.mjs';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = resolveTree('site-pretty');
const SNAP = join(WT, 'out/p153/snap');
const PIN = { C: ['a6426953727a', 'e1359ab9994a'], V: ['4da641f828bb', 'a81b9af7b2c9'] };
const tmp = join(WT, 'out/em1/tryit-tmp'); mkdirSync(tmp, { recursive: true });
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(BASE, f), 'utf8')]));
for (const [arm, out] of [['C', 'end-morph-p1-a/patch.diff'], ['V', 'end-morph-p1-b/patch.diff']]) {
  const t = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(SNAP, arm, f), 'utf8')]));
  const got = FILES.map((f) => sha(t[f]));
  if (got.join('/') !== PIN[arm].join('/')) throw new Error(`${arm} snapshot is ${got.join('/')}, pinned ${PIN[arm].join('/')}`);
  const patch = FILES.map((f) => udiff(base[f], t[f], `a/${f}`, `b/${f}`, tmp)).join('');
  // strict re-apply
  const per = parseDiff(patch);
  for (const f of FILES) {
    const r = applyHunks(base[f], per[f] || []);
    if (r.error) throw new Error(`${out}: ${f}: ${r.error}`);
    if (sha(r.text) !== sha(t[f])) throw new Error(`${out}: re-apply of ${f} gives ${sha(r.text)}, want ${sha(t[f])}`);
  }
  writeFileSync(join(WT, 'fixes', out), patch);
  console.log(`${out}: ${arm} ${got.join('/')}, patch sha ${sha(patch)}, re-apply exact`);
}
