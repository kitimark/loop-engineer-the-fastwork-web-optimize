#!/usr/bin/env node
// P-116 arms (v8 hero-flick (GH) attribution; PHONE TICKET research/management/p116-v8-gh-attribution.md). Builds
// read-only snapshot copies out/p116/snap/{C,X,Y}/ (gitignored) + HASHES.txt (full sha256) from committed patches, with
// best-build's strict applier (exact context, no fuzz); a successor of fixes/v8-best/phone/p113/build.mjs. It refuses
// (exit 3, nothing written) on any identity failure, or if out/p116/snap exists:
//   C  v8-best                  = fixes/v8-best/patch.diff on the baseline (3e3e94cb6e9f / f836404b3728)
//   X  v8 minus the countdown group (cd-strip + cd-roll-ca K + countdown-faces + glue-heup), i.e. v8 with v6's countdown:
//      by reversal, C - glue - faces' - K - strip (ticket open item 4: the forward build v6 + rest + accent exact + morph
//      rev 3 is built too and must give the same bytes; the snapshot is the reversal's, which the forward one equals)
//   Y  v8 minus rest-script v4  = C - rest, by reversal (the forward build without rest must give the same bytes)
// Components are derived exactly as fixes/v8-best/check.mjs derives them (every input checked against its owner's
// hashes): hero = fixes/v7-best/hero-r2-delta.diff; strip = cd-strip - st6; K = cd-roll-ca K - cd-strip; faces' =
// fixes/v8-best/faces-delta.diff; rest = rest-script - st6; accent = fixes/accent-ca/e1-delta.diff; morph =
// fixes/morph-gpu/rev3/delta.diff; glue = fixes/v8-best/glue-heup.diff.
// Identities (the ticket's): every input = its owner's build; the forward v8 = C; X + (strip, K, faces', glue) = C and
// Y + rest = C by forward application; X - rest - accent - morph = v6 byte for byte (8018ce062d30 / 71b65c667720);
// three different JS; node --check on X and Y (ES module).
//   node fixes/v8-best/phone/p116/build.mjs [--dry]      (--dry: all checks, write nothing)
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff } from '../../../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const DRY = process.argv.includes('--dry');
const OUT = join(WT, 'out/p116/snap');
if (!DRY && existsSync(OUT)) { console.error(`${OUT} exists: refuse (immutable)`); process.exit(3); }
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(3); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const fmt = (t) => { const h = H(t); return `${h[JS]} / ${h[CSS]}`; };
const full = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
const apply = (d, start, name, reverse = false) => {
  d = typeof d === 'string' ? parseDiff(d) : d; const out = { ...start };
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`); out[f] = r.text;
  }
  return out;
};
const ok = (name, pass, detail = '') => { if (!pass) die(`${name}${detail ? '  ' + detail : ''}`); console.log(`ok  ${name}${detail ? '  ' + detail : ''}`); };
const rd = (p) => readFileSync(join(WT, p), 'utf8');
const pin = (name, t, js, css) => ok(`input ${name} = owner's build`, H(t)[JS] === js && H(t)[CSS] === css, `${fmt(t)} (want ${js} / ${css})`);

const baseDir = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
const T = {};
T.st6 = apply(rd('fixes/st6-rb2/patch.diff'), base, 'st6'); pin('st6-rb2', T.st6, '7bf7c4657d21', 'f523598b2a24');
T.best = apply(rd('fixes/best-build/patch.diff'), base, 'best'); pin('best-build', T.best, '65052c4a3902', 'e0f92804c521');
T.v6 = apply(rd('fixes/v7-best/hero-r2-delta.diff'), T.best, 'v6'); pin('v6 (best + hero R2 delta)', T.v6, '8018ce062d30', '71b65c667720');
T.strip = apply(rd('fixes/cd-strip/patch.diff'), T.st6, 'strip'); pin('cd-strip', T.strip, '6fa0e1e8a221', '982a747d9263');
T.K = apply(rd('fixes/cd-roll-ca/patch.diff'), T.strip, 'K'); pin('cd-roll-ca K', T.K, 'b43fe790c20c', '982a747d9263');
T.rest = apply(rd('fixes/rest-script/patch.diff'), T.st6, 'rest'); pin('rest-script v4', T.rest, '520d5f1139c7', 'f523598b2a24');
T.v7 = apply(rd('fixes/v7-best/patch.diff'), base, 'v7'); pin('v7-best', T.v7, '8c90da217745', '308f0da70c3a');
T.acc = apply(rd('fixes/accent-ca/e1-delta.diff'), T.v7, 'accent'); pin('accent-ca exact (e1 on v7)', T.acc, '8c90da217745', '7eda63cc7015');
T.fd = apply(rd('fixes/morph-gpu/rev3/delta.diff'), T.best, 'morph'); pin('morph-gpu rev 3 (on best)', T.fd, '65052c4a3902', 'e4c80db5e0a8');
T.C = apply(rd('fixes/v8-best/patch.diff'), base, 'v8'); pin('C = v8-best (patch.diff)', T.C, '3e3e94cb6e9f', 'f836404b3728');

const work = join(WT, 'out/p116/work'); mkdirSync(work, { recursive: true });
const delta = (a, b) => { const o = {}; for (const f of FILES) { const d = udiff(T[a][f], T[b][f], `a/${f}`, `b/${f}`, work); if (d) Object.assign(o, parseDiff(d)); } return o; };
const D = {
  hero: parseDiff(rd('fixes/v7-best/hero-r2-delta.diff')), strip: delta('st6', 'strip'), K: delta('strip', 'K'),
  faces: parseDiff(rd('fixes/v8-best/faces-delta.diff')), rest: delta('st6', 'rest'), acc: parseDiff(rd('fixes/accent-ca/e1-delta.diff')),
  morph: parseDiff(rd('fixes/morph-gpu/rev3/delta.diff')), glue: parseDiff(rd('fixes/v8-best/glue-heup.diff')),
};
const fwd = (start, names, tag) => names.reduce((t, d) => apply(D[d], t, `${tag} +${d}`), start);
const rev = (start, names, tag) => names.reduce((t, d) => apply(D[d], t, `${tag} -${d}`, true), start);
const ORDER = ['hero', 'strip', 'K', 'faces', 'rest', 'acc', 'morph', 'glue'];
ok('forward v8 (best + hero, strip, K, faces\', rest, accent, morph, glue) = C', same(fwd(T.best, ORDER, 'v8'), T.C), fmt(T.C));
ok('the rest-script delta touches the JS only', Object.keys(D.rest).join() === JS, Object.keys(D.rest).join());

// X: reversal first (the ticket's way); open item 4's forward build must give the same bytes
const Xrev = rev(T.C, ['glue', 'faces', 'K', 'strip'], 'X');
ok('X = C - glue - faces\' - K - strip (strict reversal applies)', true, fmt(Xrev));
const Xfwd = fwd(T.v6, ['rest', 'acc', 'morph'], 'Xfwd');
ok('X by reversal = v6 + rest + accent exact + morph rev 3 (forward): same bytes', same(Xrev, Xfwd), fmt(Xfwd));
const X = Xrev;
ok('X + strip + K + faces\' + glue = C (forward)', same(fwd(X, ['strip', 'K', 'faces', 'glue'], 'X>C'), T.C));
ok('X - rest - accent - morph = v6 byte for byte (8018ce062d30 / 71b65c667720)', same(rev(X, ['morph', 'acc', 'rest'], 'X>v6'), T.v6));

// Y
const Yrev = rev(T.C, ['rest'], 'Y');
ok('Y = C - rest (strict reversal applies)', true, fmt(Yrev));
const Yfwd = fwd(T.best, ORDER.filter((d) => d !== 'rest'), 'Yfwd');
ok('Y by reversal = best + hero, strip, K, faces\', accent, morph, glue (forward, no rest): same bytes', same(Yrev, Yfwd), fmt(Yfwd));
const Y = Yrev;
ok('Y + rest = C (forward)', same(fwd(Y, ['rest'], 'Y>C'), T.C));

ok('three different JS (C, X, Y)', X[JS] !== T.C[JS] && Y[JS] !== T.C[JS] && X[JS] !== Y[JS]);
ok('Y CSS = C CSS (rest-script is JS only)', Y[CSS] === T.C[CSS]);
console.log(`    X CSS ${X[CSS] === T.C[CSS] ? '= C CSS' : '!= C CSS (cd-strip changes the CSS): X is served with its own CSS'}`);
for (const [arm, t] of Object.entries({ X, Y })) {
  const tmp = join(work, `${arm}.mjs`); writeFileSync(tmp, t[JS]);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  ok(`node --check (ES module) on ${arm}'s JS`, r.status === 0, r.stderr.trim());
}

const arms = { C: T.C, X, Y };
const lines = [];
for (const [arm, t] of Object.entries(arms)) for (const f of FILES) lines.push(`${full(t[f])}  ${arm}/${f}`);
console.log(lines.join('\n'));
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
for (const [arm, t] of Object.entries(arms)) {
  const d = join(OUT, arm);
  for (const f of FILES) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); }
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(OUT, 'HASHES.txt'), 0o444);
console.log('snap ok');
