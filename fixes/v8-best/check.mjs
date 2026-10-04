#!/usr/bin/env node
// v8-best identity checks (text only; no browser). Rebuilds every component from its committed patch, checks each
// against its owner's hashes, builds v8 with best-build's strict applier (exact context, no fuzz), compares with
// fix.mjs combine's overlay and patch.diff, and proves by reversal that each part's change in v8 is its owner's.
//   node fixes/v8-best/check.mjs [--json out/v8-best/check.json] [--write-faces-delta]
// v8 = v7-best with cd-roll-ca K in place of V9, + countdown-faces (b) + accent-ca exact (e1) + morph-gpu rev 3, + one glue
// line (glue-heup.diff, F-235). Reversal identities below start from the pure composition (v8pure = v8 - glue).
// Apply order (= `fix.mjs combine v8-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca
//   fixes/v8-best/faces-delta.diff rest-script fixes/accent-ca/e1-delta.diff fixes/morph-gpu/rev3/delta.diff
//   fixes/v8-best/glue-heup.diff`).
// faces-delta.diff: countdown-faces' patch.diff (made on mi + strip + V9, JS 3d70edb5bf31) moved onto v6 + strip + K.
// Its +/- lines are the owner's, hunk for hunk; only one hunk's context differs: the hero R2 delta inserted its
// CSS-mode block between `o = !1,` and `s = () => {` (the exit writer), so that hunk's one leading context line (`o = !1,`) is
// dropped (unique placement checked). The hero delta in turn has faces' first s() line as context, so the hero goes
// before faces in every order; the same trim, done the other way round, proves the two commute.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff, lines } from '../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const exp = (js, css) => ({ [JS]: js, [CSS]: css });
const results = []; let bad = 0;
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); if (!pass) bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const die = (m) => { console.error(m); process.exit(1); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const fmt = (h) => `js ${h[JS]} / css ${h[CSS]}`;
const eqH = (h, e) => FILES.every((f) => h[f] === e[f]);
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
const P = (d) => (typeof d === 'string' ? parseDiff(d) : d);
const applyDiff = (d, start, name, { reverse = false } = {}) => {
  d = P(d); const out = { ...start }; const offs = {};
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`);
    out[f] = r.text; offs[f] = r.offsets;
  }
  return { tree: out, offs };
};
// Context-trimming applier for the one shared-context pair (hero R2 / countdown-faces): each hunk is tried strictly;
// a hunk that does not fit drops up to 3 context lines from its ends (leading first) until its remaining lines match
// at exactly ONE place in the file. The +/- lines are never changed. Returns the tree and what was trimmed.
const looseHunk = (text, h, reverse) => {
  for (let lead = 0; lead <= 3; lead++) for (let tail = 0; tail <= 3; tail++) {
    let b = h.body, k = 0;
    for (; k < lead && b[0]?.[0] === ' '; k++) b = b.slice(1);
    if (k < lead) continue; let j = 0;
    for (; j < tail && b.at(-1)?.[0] === ' '; j++) b = b.slice(0, -1);
    if (j < tail) continue;
    const want = [], put = [];
    for (const [op, t, noNl] of b) { const s = t + (noNl ? '' : '\n'); if (op === ' ') { want.push(s); put.push(s); } else if (op === (reverse ? '+' : '-')) want.push(s); else if (op === (reverse ? '-' : '+')) put.push(s); }
    const src = lines(text); const at = [];
    for (let i = 0; i + want.length <= src.length; i++) if (want.every((w, q) => src[i + q] === w)) at.push(i);
    if (at.length === 1) return { text: [...src.slice(0, at[0]), ...put, ...src.slice(at[0] + want.length)].join(''), lead, tail, line: at[0] + 1 };
    if (at.length > 1 && (lead || tail)) return { error: `ambiguous after trimming ${lead}/${tail}` };
  }
  return { error: 'no unique placement' };
};
const looseDiff = (d, start, name, { reverse = false } = {}) => {
  d = P(d); const out = { ...start }; const trims = [];
  for (const f of Object.keys(d)) {
    const hs = reverse ? [...d[f]].reverse() : d[f]; // reverse: bottom-up keeps the remaining hunks' search valid
    for (const h of hs) { const r = looseHunk(out[f], h, reverse); if (r.error) die(`CONFLICT ${name} ${f} @@ -${h.oldStart}: ${r.error}`); if (r.lead || r.tail) trims.push(`${f.split('/').pop()} @@ -${h.oldStart}: ${r.lead} leading / ${r.tail} trailing context lines dropped`); out[f] = r.text; }
  }
  return { tree: out, trims };
};

const work = join(WT, 'out/v8-best/work'); mkdirSync(work, { recursive: true });
const gitShow = (rev, p) => { const r = spawnSync('git', ['show', `${rev}:${p}`], { cwd: WT, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) die(`git show ${rev}:${p}: ${r.stderr}`); return r.stdout; };
const SRC = {
  st6:   { path: 'fixes/st6-rb2/patch.diff', on: 'baseline', expect: exp('7bf7c4657d21', 'f523598b2a24') },
  best:  { path: 'fixes/best-build/patch.diff', on: 'baseline', expect: exp('65052c4a3902', 'e0f92804c521') },
  mi:    { path: 'fixes/morph-inherit/patch.diff', on: 'baseline', expect: exp('7c61fe7d0662', 'f523598b2a24') },
  r2:    { path: 'fixes/hero-exit-threaded/patch.diff', on: 'baseline', expect: exp('924be86afac8', 'cc74cd980e72') },
  v6:    { path: 'fixes/v7-best/hero-r2-delta.diff', on: 'best', expect: exp('8018ce062d30', '71b65c667720') },
  strip: { path: 'fixes/cd-strip/patch.diff', on: 'st6', expect: exp('6fa0e1e8a221', '982a747d9263') },
  V9:    { rev: '1bb87be9', path: 'fixes/cd-roll-ca/patch.diff', on: 'strip', expect: exp('582d120c9f8f', '982a747d9263') },
  K:     { path: 'fixes/cd-roll-ca/patch.diff', on: 'strip', expect: exp('b43fe790c20c', '982a747d9263') },
  rest:  { path: 'fixes/rest-script/patch.diff', on: 'st6', expect: exp('520d5f1139c7', 'f523598b2a24') },
  v7:    { path: 'fixes/v7-best/patch.diff', on: 'baseline', expect: exp('8c90da217745', '308f0da70c3a') },
  acc:   { path: 'fixes/accent-ca-v7/patch.diff', on: 'baseline', expect: exp('8c90da217745', '7eda63cc7015') },
  accD:  { path: 'fixes/accent-ca/e1-delta.diff', on: 'v7', expect: exp('8c90da217745', '7eda63cc7015') },
  fd:    { path: 'fixes/morph-gpu/rev3/delta.diff', on: 'best', expect: exp('65052c4a3902', 'e4c80db5e0a8') },
};
const baseDir = resolveTree('site-pretty');
const T = { baseline: Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')])) };
const srcSha = {}; const TXT = {};
const input = (k, s) => {
  const text = s.text ?? (s.rev ? gitShow(s.rev, s.path) : readFileSync(join(WT, s.path), 'utf8')); TXT[k] = text; srcSha[k] = sha(text);
  T[k] = applyDiff(text, T[s.on], k).tree; const h = H(T[k]);
  ok(`input ${k} = owner's build`, eqH(h, s.expect), `${fmt(h)} (${s.rev ? s.rev + ':' : ''}${s.path} ${srcSha[k]})`);
};
for (const [k, s] of Object.entries(SRC)) input(k, s);
const delta = (a, b) => { const o = {}; for (const f of FILES) { const d = udiff(T[a][f], T[b][f], `a/${f}`, `b/${f}`, work); if (d) Object.assign(o, parseDiff(d)); } return o; };
const D = { hero: P(TXT.v6), strip: delta('st6', 'strip'), V9: delta('strip', 'V9'), K: delta('strip', 'K'), rest: delta('st6', 'rest'), acc: P(TXT.accD), morph: P(TXT.fd), bestSt6: delta('st6', 'best'), bestMi: delta('mi', 'best'), faces: P(readFileSync(join(WT, 'fixes/countdown-faces/patch.diff'), 'utf8')) };
// countdown-faces as its owner built it: C = mi + strip + V9 (3d70edb5bf31) + faces = 9c098e608a0f
T.C = applyDiff(D.V9, applyDiff(D.strip, T.mi, 'strip>mi').tree, 'V9>mi').tree;
ok("countdown-faces' base C = mi + strip + V9", eqH(H(T.C), exp('3d70edb5bf31', '982a747d9263')), fmt(H(T.C)));
T.faces = applyDiff(D.faces, T.C, 'faces').tree;
ok("input faces = owner's build (V on C)", eqH(H(T.faces), exp('9c098e608a0f', '982a747d9263')), `${fmt(H(T.faces))} (fixes/countdown-faces/patch.diff ${sha(readFileSync(join(WT, 'fixes/countdown-faces/patch.diff')))})`);
// faces on K (no hero): strict, offsets only, and the K swap commutes with faces
T.CK = applyDiff(D.K, applyDiff(D.strip, T.mi, 'strip>mi').tree, 'K>mi').tree;
const fK = applyDiff(D.faces, T.CK, 'faces>CK'); T.facesK = fK.tree;
ok('countdown-faces patch applies on mi + strip + K unchanged (exact context, offsets only)', true, `${fmt(H(T.facesK))} offsets ${JSON.stringify(fK.offs[JS])}`);
// faces is stacked on cd-roll-ca (it edits $E's roll code), so the swap is shown with K's follow-up alone: V9 -> K
D.VK = delta('V9', 'K');
ok('faces build (on V9) + (V9 -> K) = facesK, and facesK - (V9 -> K) = faces build: the K follow-up and faces commute', same(applyDiff(D.VK, T.faces, 'VK>faces').tree, T.facesK) && same(applyDiff(D.VK, T.facesK, '-VK', { reverse: true }).tree, T.faces));
// v8, strict, in apply order; faces' = faces moved onto v6 + strip + K
let t = T.best; const offsets = {};
const step = (name, d) => { const r = applyDiff(d, t, name); offsets[name] = r.offs; t = r.tree; };
step('hero', D.hero); step('strip', D.strip); step('K', D.K);
const preFaces = t;
const fl = looseDiff(D.faces, preFaces, 'faces>v6K');
ok('faces on v6 + strip + K: +/- lines unchanged, context trimmed only where the hero changed it', fl.trims.length === 1, fl.trims.join('; '));
const facesDeltaText = (() => { let s = ''; for (const f of FILES) s += udiff(preFaces[f], fl.tree[f], `a/${f}`, `b/${f}`, work); return s; })();
const fdPath = join(WT, 'fixes/v8-best/faces-delta.diff');
const HDR = `# v8-best component: countdown-faces (b) (fixes/countdown-faces/patch.diff, made on mi + strip + cd-roll-ca V9, JS 3d70edb5bf31)\n` +
  `# moved onto best-build + hero R2 delta + cd-strip + cd-roll-ca K: the same +/- lines; one hunk (the hero exit writer s()) lost one\n` +
  `# leading context line ('o = !1,'): the hero delta inserted its CSS-mode block there. Written by node fixes/v8-best/check.mjs --write-faces-delta; local branches only, never push\n`;
if (process.argv.includes('--write-faces-delta')) writeFileSync(fdPath, HDR + facesDeltaText);
D.facesP = P(readFileSync(fdPath, 'utf8'));
ok('fixes/v8-best/faces-delta.diff = faces moved onto v6 + strip + K', same(applyDiff(D.facesP, preFaces, "faces'").tree, fl.tree));
// +/- lines per hunk identical to the owner's patch
const chg = (hs) => hs.map((h) => h.body.filter(([o]) => o === '+' || o === '-').map(([o, s]) => o + s).join('\n'));
ok("faces-delta.diff's +/- lines = countdown-faces patch.diff's, hunk for hunk", JSON.stringify(chg(D.facesP[JS])) === JSON.stringify(chg(D.faces[JS])) && !D.facesP[CSS], `${D.facesP[JS].length} hunks`);
step("faces'", D.facesP); step('rest', D.rest); step('acc', D.acc); step('morph', D.morph);
const V8p = t; // the pure composition of the 8 parts
ok('strict build, the 8 parts (pure composition)', true, fmt(H(V8p)));
// component 9: glue-heup.diff (lead ruling, F-235; agreed by fix-hero-exit-threaded and de-countdown), applied last
D.glue = P(readFileSync(join(WT, 'fixes/v8-best/glue-heup.diff'), 'utf8'));
step('glue', D.glue);
const V8 = t;
ok('strict build v8 = pure composition + glue', true, fmt(H(V8)));
ok('glue changes one line (heUp) and adds two comment lines, JS only', !D.glue[CSS] && D.glue[JS].length === 1 && D.glue[JS][0].body.filter(([o]) => o === '-').length === 1 && D.glue[JS][0].body.filter(([o]) => o === '+').length === 3);
ok('v8 - glue = pure composition', same(applyDiff(D.glue, V8, '-glue', { reverse: true }).tree, V8p));
{ let g = applyDiff(D.glue, applyDiff(D.facesP, applyDiff(D.K, applyDiff(D.strip, applyDiff(D.hero, T.best, 'hero').tree, 'strip').tree, 'K').tree, "faces'").tree, 'glue').tree;
  for (const d of ['rest', 'acc', 'morph']) g = applyDiff(D[d], g, d).tree;
  ok('glue right after faces (before rest, accent, morph): same bytes', same(g, V8)); }
// commutation of hero and faces: faces (original, offsets) on best + strip + K, then the hero with its context trimmed
const noHero = applyDiff(D.faces, applyDiff(D.K, applyDiff(D.strip, T.best, 'strip').tree, 'K').tree, 'faces>bestK');
const heroAfter = looseDiff(D.hero, noHero.tree, 'hero>faces');
ok("hero then faces = faces then hero (the hero's s() context line trimmed)", same(heroAfter.tree, fl.tree), heroAfter.trims.join('; '));
ok('best + strip + K + faces - (best - mi) = facesK (faces on mi + strip + K)', same(applyDiff(D.bestMi, noHero.tree, '-(best-mi)', { reverse: true }).tree, T.facesK));
// every order of the independent groups gives the same bytes; [hero, cd] is one group (shared context, see above)
const groups = { heroCd: ['hero', 'strip', 'K', 'facesP'], rest: ['rest'], acc: ['acc'], morph: ['morph'] };
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
let n = 0;
for (const order of perms(Object.keys(groups))) {
  let u = T.best; for (const g of order) for (const d of groups[g]) u = applyDiff(D[d], u, d).tree;
  if (!same(u, V8p)) ok(`order ${order.join(',')} gives the same bytes`, false); else n++;
}
ok(`all ${n} orders of [hero+countdown], [rest], [accent], [morph] give the same bytes`, n === 24);
let u2 = T.best; for (const d of ['strip', 'K', 'hero', 'rest', 'acc', 'morph']) u2 = applyDiff(D[d], u2, d).tree;
ok("[strip, K] before the hero, then faces': same bytes", same(applyDiff(D.facesP, u2, "faces'").tree, V8p));
// fix.mjs combine's overlay and patch.diff
const ovl = join(WT, 'fixes/v8-best/overlay');
const O = Object.fromEntries(FILES.map((f) => [f, existsSync(join(ovl, f)) ? readFileSync(join(ovl, f), 'utf8') : null]));
ok('fix.mjs combine overlay = strict build (git apply = no-fuzz applier)', same(O, V8), fmt(H(O)));
if (existsSync(join(WT, 'fixes/v8-best/patch.diff'))) ok('fixes/v8-best/patch.diff on the baseline = v8', same(applyDiff(readFileSync(join(WT, 'fixes/v8-best/patch.diff'), 'utf8'), T.baseline, 'v8 patch.diff').tree, V8));
// identities by reversal
const rev = (x, names) => names.reduce((y, d) => applyDiff(D[d], y, `-${d}`, { reverse: true }).tree, x);
// faces' carries the hero's last line as context: once the hero is reversed, faces' is reversed with that line trimmed
const revL = (x, names) => names.reduce((y, d) => (d === 'facesP' ? looseDiff(D[d], y, `-${d}`, { reverse: true }).tree : applyDiff(D[d], y, `-${d}`, { reverse: true }).tree), x);
const v7K = rev(V8p, ['morph', 'acc', 'facesP']);
ok('v8pure - morph - accent - faces = v7 with K for V9: (that) - K + V9 = v7-best (8c90da217745 / 308f0da70c3a)', same(applyDiff(D.V9, rev(v7K, ['K']), '+V9').tree, T.v7), fmt(H(v7K)));
ok('v8pure - morph - faces - K + V9 = accent-ca-v7 build (8c90da217745 / 7eda63cc7015)', same(applyDiff(D.V9, rev(V8p, ['morph', 'facesP', 'K']), '+V9').tree, T.acc));
ok('v8pure - morph - accent - rest - faces - K - strip = v6-best-br2 (B-R2)', same(rev(V8p, ['morph', 'acc', 'rest', 'facesP', 'K', 'strip']), T.v6));
ok('v8pure - accent - rest - faces - K - strip - hero = morph-gpu rev 3 build fd (65052c4a3902 / e4c80db5e0a8)', same(rev(V8p, ['acc', 'rest', 'facesP', 'K', 'strip', 'hero']), T.fd));
ok('v8pure - hero - morph - accent - rest - faces - (best - st6) = cd-roll-ca K build (b43fe790c20c)', same(revL(looseDiff(D.hero, V8p, '-hero', { reverse: true }).tree, ['morph', 'acc', 'rest', 'facesP', 'bestSt6']), T.K));
const v8noHero = looseDiff(D.hero, V8p, '-hero', { reverse: true });
ok('v8pure - hero (s() context trimmed) - morph - accent - rest - (best - mi) = facesK (= countdown-faces build + V9 -> K, above)', same(rev(v8noHero.tree, ['morph', 'acc', 'rest', 'bestMi']), T.facesK), v8noHero.trims.join('; '));
ok('v8pure - hero - morph - accent - faces - K - strip - (best - st6) = rest-script v4 build', same(revL(v8noHero.tree, ['morph', 'acc', 'facesP', 'K', 'strip', 'bestSt6']), T.rest));
ok('v8pure - all = best build', same(revL(v8noHero.tree, ['morph', 'acc', 'rest', 'facesP', 'K', 'strip']), T.best));
// node --check
const tmp = join(work, 'v8.mjs'); writeFileSync(tmp, V8[JS]);
const nc = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
ok('node --check (ES module) on the v8 JS', nc.status === 0, nc.stderr.trim());
const full = (s) => (spawnSync('shasum', ['-a', '256'], { input: s, encoding: 'utf8' }).stdout || '').split(' ')[0];
const out = { v8: H(V8), v8pure: H(V8p), v8Full: Object.fromEntries(FILES.map((f) => [f, full(V8[f])])), srcSha, offsets, facesTrims: fl.trims, heroTrims: heroAfter.trims, results };
const j = process.argv.indexOf('--json'); if (j > 0) { mkdirSync(dirname(process.argv[j + 1]), { recursive: true }); writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1)); }
console.log(`\nv8 ${fmt(out.v8)}; offsets ${JSON.stringify(offsets)}; ${results.length - bad}/${results.length} ok`);
process.exitCode = bad ? 1 : 0;
