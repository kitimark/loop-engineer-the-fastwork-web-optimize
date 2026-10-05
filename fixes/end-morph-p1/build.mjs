#!/usr/bin/env node
// end-morph-p1 (fix-end-morph-p1): PR-012 rev 1 (fix-morph-gpu's composited clip reveal, accepted by the user
// 2026-10-04) ported onto v9-final (rev 7c engine). Strict applier (fixes/best-build/build.mjs: exact context, no fuzz).
//   C   = v9-final: baseline + fixes/v9-best/patch.diff, must be JS 647c9ef2b1e2 / CSS e1359ab9994a
//   V   = C + fixes/end-morph-p1/delta.diff (the __rv* JS block and the [data-fw-rv] CSS block, byte for byte
//         fix-morph-gpu's fixes/morph-gpu/delta.diff except the credit comments)
//   R1  = PR-012 rev 1 as accepted (fixes/morph-gpu/patch.diff on the baseline = JS 372b99478871 / CSS 257507365449)
//   BB  = its base, best-build (fixes/best-build/patch.diff on the baseline = JS 65052c4a3902 / CSS e0f92804c521)
// Checks: every pin above; the delta's added lines equal morph-gpu's delta's added lines except the two credit
// comment lines; V - delta (reverse apply) = C; node --check on V's JS; the patch.diff written here reproduces V.
// Writes (unless --dry): out/em1/{v9f,p1,rv1,bb}/ (overlay dirs, gitignored), fixes/end-morph-p1/overlay (= V),
// fixes/end-morph-p1/patch.diff (baseline-relative), out/em1/build.json.
//   node fixes/end-morph-p1/build.mjs [--dry]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff } from '../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const DRY = process.argv.includes('--dry');
const PRETTY = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(PRETTY, f), 'utf8')]));
const die = (m) => { console.error('REFUSED: ' + m); process.exit(3); };
const apply = (src, diffPath, opts) => {
  const d = parseDiff(readFileSync(join(WT, diffPath), 'utf8')); const out = {};
  for (const f of FILES) {
    if (!d[f]) { out[f] = src[f]; continue; }
    const r = applyHunks(src[f], d[f], opts); if (r.error) die(`${diffPath} on ${f}: ${r.error}`);
    if (r.offsets && r.offsets.some((o) => o)) console.log(`  ${diffPath} ${f}: offsets ${JSON.stringify(r.offsets)}`);
    out[f] = r.text;
  }
  return out;
};
const hashes = (t) => FILES.map((f) => sha(t[f]));
const pin = (name, t, js, css) => { const [a, b] = hashes(t); if (a !== js || b !== css) die(`${name} is ${a} / ${b}, expected ${js} / ${css}`); console.log(`${name.padEnd(4)} ${a} / ${b} ok`); };

const C = apply(base, 'fixes/v9-best/patch.diff'); pin('C', C, '647c9ef2b1e2', 'e1359ab9994a');
const R1 = apply(base, 'fixes/morph-gpu/patch.diff'); pin('R1', R1, '372b99478871', '257507365449');
const BB = apply(base, 'fixes/best-build/patch.diff'); pin('BB', BB, '65052c4a3902', 'e0f92804c521');
const DELTA = 'fixes/end-morph-p1/delta.diff';
const V = apply(C, DELTA);
const [vjs, vcss] = hashes(V); console.log(`V    ${vjs} / ${vcss}`);
// added lines: ours vs fix-morph-gpu's rev 1 delta, only the credit comment lines may differ
const added = (p) => readFileSync(join(WT, p), 'utf8').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
const ours = added(DELTA), rev1 = added('fixes/morph-gpu/delta.diff');
const diffs = [];
for (let i = 0; i < Math.max(ours.length, rev1.length); i++) if (ours[i] !== rev1[i]) diffs.push([i, rev1[i], ours[i]]);
const credit = (l) => l && /perf\(morph-gpu, N2 reveal;/.test(l);
if (ours.length !== rev1.length || diffs.some(([, a, b]) => !(credit(a) && credit(b)))) die(`delta differs from rev 1 beyond the credit comments: ${JSON.stringify(diffs).slice(0, 600)}`);
console.log(`delta = rev 1's added lines (${ours.length}), ${diffs.length} credit comment lines differ`);
const back = apply(V, DELTA, { reverse: true });
if (hashes(back).join() !== hashes(C).join()) die('V - delta != C');
console.log('reverse ok: V - delta = C');
const tmp = join(WT, 'out/em1/tmp'); mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'v.js'), V[JS]);
const chk = spawnSync(process.execPath, ['--check', join(tmp, 'v.js')], { encoding: 'utf8' });
if (chk.status !== 0) die('node --check: ' + chk.stderr);
console.log('node --check ok');
const patch = FILES.map((f) => udiff(base[f], V[f], `a/${f}`, `b/${f}`, tmp)).join('');
const pPath = join(tmp, 'patch.diff'); writeFileSync(pPath, patch);
const fromPatch = (() => { const d = parseDiff(patch); const o = {}; for (const f of FILES) { const r = applyHunks(base[f], d[f] || []); if (r.error) die('patch.diff: ' + r.error); o[f] = r.text; } return o; })();
if (hashes(fromPatch).join() !== hashes(V).join()) die('patch.diff does not reproduce V');
console.log('patch.diff reproduces V');
if (DRY) process.exit(0);
const put = (dir, t) => { rmSync(dir, { recursive: true, force: true }); for (const f of FILES) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t[f]); } };
put(join(WT, 'out/em1/v9f'), C); put(join(WT, 'out/em1/p1'), V); put(join(WT, 'out/em1/rv1'), R1); put(join(WT, 'out/em1/bb'), BB);
put(join(WT, 'fixes/end-morph-p1/overlay'), V);
writeFileSync(join(WT, 'fixes/end-morph-p1/patch.diff'), patch);
writeFileSync(join(WT, 'out/em1/build.json'), JSON.stringify({ at: new Date().toISOString(), C: hashes(C), V: hashes(V), R1: hashes(R1), BB: hashes(BB), patch: sha(patch), delta: sha(readFileSync(join(WT, DELTA))) }, null, 1));
console.log(`wrote out/em1/{v9f,p1,rv1,bb}, fixes/end-morph-p1/overlay, patch.diff ${sha(patch)}`);
