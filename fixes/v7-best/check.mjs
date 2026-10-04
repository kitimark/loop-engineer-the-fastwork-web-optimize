#!/usr/bin/env node
// v7-best identity checks (text only; no browser). Rebuilds every component from its committed patch on this branch,
// checks each against its owner's hashes, builds v7 with best-build's strict applier (exact context, no fuzz; offsets
// reported) in every order of the independent groups, compares with fix.mjs combine's overlay, and proves by reversal
// that wherever only one component changed the code, v7 is that component's own build, byte for byte.
//   node fixes/v7-best/check.mjs [--json out/v7-best/check.json]
// Components (apply order of `fix.mjs combine v7-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca rest-script`):
//   v6 = best-build + hero R2 delta (= B-R2 8018ce062d30 / 71b65c667720)
//   + cd-strip (stacked on st6-rb2) + cd-roll-ca (stacked on cd-strip) + rest-script v4 (stacked on st6-rb2)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff, spans } from '../best-build/build.mjs';

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
const applyDiff = (d, start, name, { reverse = false } = {}) => {
  if (typeof d === 'string') d = parseDiff(d);
  const out = { ...start }; const offs = {};
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`);
    out[f] = r.text; offs[f] = r.offsets;
  }
  return { tree: out, offs };
};

const SRC = {
  st6:   { path: 'fixes/st6-rb2/patch.diff', on: 'baseline', expect: exp('7bf7c4657d21', 'f523598b2a24') },
  best:  { path: 'fixes/best-build/patch.diff', on: 'baseline', expect: exp('65052c4a3902', 'e0f92804c521') },
  mi:    { path: 'fixes/morph-inherit/patch.diff', on: 'baseline', expect: exp('7c61fe7d0662', 'f523598b2a24') },
  r2:    { path: 'fixes/hero-exit-threaded/patch.diff', on: 'baseline', expect: exp('924be86afac8', 'cc74cd980e72') },
  v6:    { path: 'fixes/v7-best/hero-r2-delta.diff', on: 'best', expect: exp('8018ce062d30', '71b65c667720') },
  strip: { path: 'fixes/cd-strip/patch.diff', on: 'st6', expect: exp('6fa0e1e8a221', '982a747d9263') },
  roll:  { path: 'fixes/cd-roll-ca/patch.diff', on: 'strip', expect: exp('582d120c9f8f', '982a747d9263') },
  rest:  { path: 'fixes/rest-script/patch.diff', on: 'st6', expect: exp('520d5f1139c7', 'f523598b2a24') },
  restlive: { path: 'fixes/rest-script-live/patch.diff', on: 'baseline', expect: exp('520d5f1139c7', 'f523598b2a24') },
  gpu:   { path: 'fixes/gpu-preview/patch.diff', on: 'baseline', expect: exp('c0c8ad4e36cb', 'd0f1017e692d') },
  mgpu:  { path: 'fixes/morph-gpu/delta.diff', on: 'best', expect: exp('372b99478871', '257507365449') },
};
const work = join(WT, 'out/v7-best/work'); mkdirSync(work, { recursive: true });
const baseDir = resolveTree('site-pretty');
const T = { baseline: Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')])) };
const srcSha = {};
for (const [k, s] of Object.entries(SRC)) {
  const text = readFileSync(join(WT, s.path), 'utf8'); srcSha[k] = sha(text);
  T[k] = applyDiff(text, T[s.on], k).tree;
  const h = H(T[k]);
  ok(`input ${k} = owner's build`, eqH(h, s.expect), `${fmt(h)} (${s.path} ${srcSha[k]})`);
}
ok('rest-script (stacked) build = rest-script-live build', same(T.rest, T.restlive));
// deltas, each against the build its owner made it on
const delta = (a, b) => { const o = {}; for (const f of FILES) { const d = udiff(T[a][f], T[b][f], `a/${f}`, `b/${f}`, work); if (d) Object.assign(o, parseDiff(d)); } return o; };
const D = { hero: parseDiff(readFileSync(join(WT, SRC.v6.path), 'utf8')), strip: delta('st6', 'strip'), roll: delta('strip', 'roll'), rest: delta('st6', 'rest'), bestSt6: delta('st6', 'best'), mgpu: delta('best', 'mgpu') };
ok('hero delta file on the morph-inherit build = R2 build', same(applyDiff(D.hero, T.mi, 'hero->mi').tree, T.r2));
// groups: [hero], [strip, roll], [rest]; every order must give the same bytes
const groups = { hero: ['hero'], cd: ['strip', 'roll'], rest: ['rest'] };
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
let first = null; const offsets = {};
for (const order of perms(Object.keys(groups))) {
  let t = T.best; const offs = {};
  for (const g of order) for (const d of groups[g]) { const r = applyDiff(D[d], t, d); t = r.tree; offs[d] = r.offs; }
  if (!first) { first = t; Object.assign(offsets, offs); ok(`strict build, order ${order.join(',')}`, true, fmt(H(t))); }
  else ok(`order ${order.join(',')} gives the same bytes`, same(t, first));
}
const V7 = first;
// fix.mjs combine's overlay
const ovl = join(WT, 'fixes/v7-best/overlay');
const O = Object.fromEntries(FILES.map((f) => [f, existsSync(join(ovl, f)) ? readFileSync(join(ovl, f), 'utf8') : null]));
ok('fix.mjs combine overlay = strict build (git apply = no-fuzz applier)', same(O, V7), fmt(H(O)));
// patch.diff (baseline-relative) reproduces it
if (existsSync(join(WT, 'fixes/v7-best/patch.diff'))) {
  const P = applyDiff(readFileSync(join(WT, 'fixes/v7-best/patch.diff'), 'utf8'), T.baseline, 'v7 patch.diff').tree;
  ok('fixes/v7-best/patch.diff on the baseline = v7', same(P, V7));
}
// identities by reversal
const rev = (t, names) => names.reduce((x, d) => applyDiff(D[d], x, `-${d}`, { reverse: true }).tree, t);
ok('v7 - rest - roll - strip = v6-best-br2 (B-R2)', same(rev(V7, ['rest', 'roll', 'strip']), T.v6), fmt(H(rev(V7, ['rest', 'roll', 'strip']))));
ok('v7 - hero - rest - (best-st6) = cd-roll-ca V9 (st6 + strip + roll)', same(rev(V7, ['hero', 'rest', 'bestSt6']), T.roll));
ok('v7 - hero - rest - roll - (best-st6) = cd-strip build', same(rev(V7, ['hero', 'rest', 'roll', 'bestSt6']), T.strip));
ok('v7 - hero - roll - strip - (best-st6) = rest-script v4 build', same(rev(V7, ['hero', 'roll', 'strip', 'bestSt6']), T.rest));
const p094 = rev(V7, ['hero', 'roll', 'strip']);
ok('v7 - hero - roll - strip = P-094 best+rest (e9b94ba7c560 / e0f92804c521)', eqH(H(p094), exp('e9b94ba7c560', 'e0f92804c521')), fmt(H(p094)));
const gpuMinus = applyDiff(D.mgpu, T.gpu, '-mgpu', { reverse: true }).tree;
ok('v7 - rest = gpu-preview - morph-gpu (same cd-strip, roll and hero bytes as the preview)', same(rev(V7, ['rest']), gpuMinus));
ok('v7 - all four = best build', same(rev(V7, ['rest', 'roll', 'strip', 'hero']), T.best));
// closest changed lines between groups, in st6-rb2 coordinates (hero: mi = st6 above JS 13490)
const sp = (d) => Object.fromEntries(Object.entries(d).map(([f, h]) => [f, spans(h)]));
const gap = (a, b) => { let m = Infinity; for (const f of FILES) for (const [x0, x1] of a[f] || []) for (const [y0, y1] of b[f] || []) m = Math.min(m, Math.max(0, Math.max(x0, y0) - Math.min(x1, y1))); return m; };
// roll is in strip coordinates; map both cd deltas to st6 by spans of (st6 -> roll) at once
const cdSt6 = delta('st6', 'roll');
const S = { hero: sp(D.hero), cd: sp(cdSt6), rest: sp(D.rest), bestSt6: sp(D.bestSt6) };
const gaps = {};
for (const [a, b] of [['hero', 'cd'], ['hero', 'rest'], ['cd', 'rest'], ['hero', 'bestSt6'], ['cd', 'bestSt6'], ['rest', 'bestSt6']]) gaps[`${a}~${b}`] = gap(S[a], S[b]);
console.log('closest changed lines between groups (st6-rb2 lines):', JSON.stringify(gaps));
ok('no two groups share diff context (gap >= 7 lines)', Object.values(gaps).every((g) => g >= 7));
// node --check
const tmp = join(work, 'v7.mjs'); writeFileSync(tmp, V7[JS]);
const nc = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
ok('node --check (ES module) on the v7 JS', nc.status === 0, nc.stderr.trim());
const out = { v7: H(V7), v7Full: Object.fromEntries(FILES.map((f) => [f, (spawnSync('shasum', ['-a', '256'], { input: V7[f], encoding: 'utf8' }).stdout || '').split(' ')[0]])), srcSha, offsets, gaps, results };
const j = process.argv.indexOf('--json'); if (j > 0) { mkdirSync(dirname(process.argv[j + 1]), { recursive: true }); writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1)); }
console.log(`\nv7 ${fmt(out.v7)}; ${results.length - bad}/${results.length} ok`);
process.exitCode = bad ? 1 : 0;
