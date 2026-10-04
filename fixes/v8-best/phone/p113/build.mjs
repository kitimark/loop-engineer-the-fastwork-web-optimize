#!/usr/bin/env node
// P-113 arms (v8 hero-flick cluster attribution; PHONE TICKET in fixes/v8-best/README.md "P-113"). Builds read-only
// snapshot copies out/p113/snap/{C,F,R}/ (gitignored) + HASHES.txt from committed patches, with best-build's strict
// applier (exact context, no fuzz), and refuses on any identity failure or if out/p113/snap exists:
//   C  v8-best                              = fixes/v8-best/patch.diff on the baseline (3e3e94cb6e9f / f836404b3728)
//   F  v8 minus countdown-faces and the glue = C, glue-heup.diff reversed, then faces-delta.diff reversed
//   R  v8 with the V9 roll for K             = C, the (V9 -> K) delta reversed (cd-roll-ca at 1bb87be9 = V9; the
//                                              current fixes/cd-roll-ca/patch.diff = K; both on the cd-strip build)
// Identity checks (both arms must close back onto accent-ca-v7, 8c90da217745 / 7eda63cc7015, the build that README's
// reversal list already proves equal to v8pure - morph - faces - K + V9; morph rev 3 is CSS only and stays in F and R):
//   F - (V9 -> K) = accent-ca-v7 + morph rev 3 CSS, i.e. JS 8c90da217745, CSS f836404b3728
//   R - glue - faces = the same tree
//   F's and R's CSS = v8's CSS (faces, glue, K and V9 are JS only); F's JS != C's, R's JS != C's, F's JS != R's
//   node fixes/v8-best/phone/p113/build.mjs
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff } from '../../../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUT = join(WT, 'out/p113/snap');
if (existsSync(OUT)) { console.error(`${OUT} exists: refuse (immutable)`); process.exit(3); }
const die = (m) => { console.error(m); process.exit(3); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f]).slice(0, 12)]));
const fmt = (t) => { const h = H(t); return `${h[JS]} / ${h[CSS]}`; };
const apply = (d, start, name, reverse = false) => {
  d = typeof d === 'string' ? parseDiff(d) : d; const out = { ...start };
  for (const f of Object.keys(d)) { const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`); out[f] = r.text; }
  return out;
};
const rd = (p) => readFileSync(join(WT, p), 'utf8');
const gitShow = (rev, p) => { const r = spawnSync('git', ['show', `${rev}:${p}`], { cwd: WT, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) die(`git show ${rev}:${p}: ${r.stderr}`); return r.stdout; };
const baseDir = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
const pin = (name, t, js, css) => { const h = H(t); if (h[JS] !== js || h[CSS] !== css) die(`${name}: ${fmt(t)} != ${js} / ${css}: refused`); console.log(`ok  ${name} ${fmt(t)}`); };

const st6 = apply(rd('fixes/st6-rb2/patch.diff'), base, 'st6'); pin('st6-rb2', st6, '7bf7c4657d21', 'f523598b2a24');
const strip = apply(rd('fixes/cd-strip/patch.diff'), st6, 'strip'); pin('cd-strip', strip, '6fa0e1e8a221', '982a747d9263');
const V9 = apply(gitShow('1bb87be9', 'fixes/cd-roll-ca/patch.diff'), strip, 'V9'); pin('cd-roll-ca V9 (1bb87be9)', V9, '582d120c9f8f', '982a747d9263');
const K = apply(rd('fixes/cd-roll-ca/patch.diff'), strip, 'K'); pin('cd-roll-ca K', K, 'b43fe790c20c', '982a747d9263');
const work = join(WT, 'out/p113/work'); mkdirSync(work, { recursive: true });
const VK = {}; for (const f of FILES) { const d = udiff(V9[f], K[f], `a/${f}`, `b/${f}`, work); if (d) Object.assign(VK, parseDiff(d)); }
if (Object.keys(VK).join() !== JS) die(`V9 -> K delta touches ${Object.keys(VK).join()}, expected the JS only`);

const C = apply(rd('fixes/v8-best/patch.diff'), base, 'v8'); pin('C = v8-best', C, '3e3e94cb6e9f', 'f836404b3728');
const acc = apply(rd('fixes/accent-ca-v7/patch.diff'), base, 'accent-ca-v7'); pin('accent-ca-v7', acc, '8c90da217745', '7eda63cc7015');
const glue = rd('fixes/v8-best/glue-heup.diff'), faces = rd('fixes/v8-best/faces-delta.diff'), rev3 = rd('fixes/morph-gpu/rev3/delta.diff');
const target = apply(rev3, acc, 'accent-ca-v7 + morph rev 3'); pin('accent-ca-v7 + morph rev 3 (identity target)', target, '8c90da217745', 'f836404b3728');

const F = apply(faces, apply(glue, C, '-glue', true), '-faces', true);
const R = apply(VK, C, '-(V9 -> K)', true);
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
if (!same(apply(VK, F, 'F -(V9 -> K)', true), target)) die('F - (V9 -> K) != accent-ca-v7 + morph rev 3: refused');
console.log('ok  F - (V9 -> K) = accent-ca-v7 + morph rev 3');
if (!same(apply(faces, apply(glue, R, 'R -glue', true), 'R -faces', true), target)) die('R - glue - faces != accent-ca-v7 + morph rev 3: refused');
console.log('ok  R - glue - faces = accent-ca-v7 + morph rev 3');
if (F[CSS] !== C[CSS] || R[CSS] !== C[CSS]) die('F or R CSS differs from v8: refused');
if (F[JS] === C[JS] || R[JS] === C[JS] || F[JS] === R[JS]) die('an arm JS equals another arm: refused');
console.log(`ok  F ${fmt(F)}; R ${fmt(R)}; CSS = v8's in both; three different JS`);

const lines = [];
for (const [arm, t] of Object.entries({ C, F, R })) {
  const d = join(OUT, arm);
  for (const f of FILES) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); lines.push(`${createHash('sha256').update(t[f]).digest('hex')}  ${arm}/${f.replace(/^\//, '')}`); }
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(OUT, 'HASHES.txt'), 0o444);
console.log(lines.join('\n'));
console.log('snap ok');
