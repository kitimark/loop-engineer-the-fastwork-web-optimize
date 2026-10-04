#!/usr/bin/env node
// gpu-preview: the best build (main 60df1cf) + cd-strip (main, landed) + three GPU fixes, for the user's hands-on Try-it
// (T-073 #2). Counts and pixels only; no timing. Method as fixes/best-build/build.mjs (its strict applier, imported):
//   1. builds every input from its own baseline-relative patch (or delta) and checks it against the hashes its owner
//      measured (refused on any difference);
//   2. derives each fix's own delta against the build it was made on (diff -u):
//        cd-strip    = cd-strip build (C8)        - st6-rb2
//        cd-roll-ca  = cd-roll-ca build (V9)      - cd-strip build (C8)       (cd-roll-ca is stacked on cd-strip)
//        hero-r2     = hero R2 build              - morph-inherit build (mi)  (R2 = st6-rb2 + morph-inherit + hero)
//        morph-gpu   = morph-gpu build (rv)       - best build                (its committed delta.diff, re-derived)
//   3. applies them to the best build with the strict applier (exact context, no fuzz; offsets reported), in every
//      order of the three independent groups [cd-strip, cd-roll-ca], [hero-r2], [morph-gpu]; all orders must give the
//      same bytes, and changed lines of two groups closer than 3 lines (shared diff context) stop it with CONFLICT;
//   4. identity: the bundle with the other groups' deltas reversed equals each fix's own build on its own base:
//        bundle - morph - cd               = hero owner's B-R2 (best + R2)
//        bundle - hero - cd                = morph-gpu owner's rv (best + morph-gpu)
//        bundle - hero - morph - (best - st6-rb2) = cd-roll-ca owner's V9 (st6-rb2 + cd-strip + roll)
//   5. node --check on the JS (ES module); writes fixes/gpu-preview/overlay/ (gitignored) and, with --snapshot, a
//      read-only copy out/snapshots/gpu-<js12>/ for serving.
// Inputs not on main are read with `git show <pinned sha>:<path>` from the owners' branches (shas below), so the build
// is reproducible from this repo without copying their files.
//   node fixes/gpu-preview/build.mjs [--snapshot] [--no-expect] [--json out/gpu-preview/build.json]
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff, spans } from '../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const die = (m) => { console.error(m); process.exit(1); };
const exp = (js, css) => ({ [JS]: js, [CSS]: css });

// Sources: rev null = this checkout (main's committed file); else a commit on the owner's branch.
export const SRC = {
  st6:   { rev: null, path: 'fixes/st6-rb2/patch.diff', on: 'baseline', expect: exp('7bf7c4657d21', 'f523598b2a24') },
  best:  { rev: null, path: 'fixes/best-build/patch.diff', on: 'baseline', expect: exp('65052c4a3902', 'e0f92804c521') },
  mi:    { rev: null, path: 'fixes/morph-inherit/patch.diff', on: 'baseline', expect: exp('7c61fe7d0662', 'f523598b2a24') },
  strip: { rev: null, path: 'fixes/cd-strip/patch.diff', on: 'st6', expect: exp('6fa0e1e8a221', '982a747d9263') },
  // fix-cd-roll-ca, branch worktree-agent-a65f148991747deb7: V9 = strip-tc (C8) + roll
  roll:  { rev: '3f7ce94a', path: 'fixes/cd-roll-ca/patch.diff', on: 'strip', expect: exp('582d120c9f8f', '982a747d9263') },
  // fix-hero-exit-threaded, branch worktree-agent-ae86b805e8f947ff0: R2 = st6-rb2 + morph-inherit + hero (gate: touch phones)
  r2:    { rev: '93705754', path: 'fixes/hero-exit-threaded/patch.diff', on: 'baseline', expect: exp('924be86afac8', 'cc74cd980e72') },
  // fix-morph-gpu, branch worktree-agent-a4e37c413d9ae3d5b: rv = best + morph-gpu (PR-012 rev 1 accepted)
  rv:    { rev: '9693eb5e', path: 'fixes/morph-gpu/delta.diff', on: 'best', expect: exp('372b99478871', '257507365449') },
};
// The hero owner's own best-build stack (README "B-R2"), checked as an identity.
export const BR2_EXPECT = exp('8018ce062d30', '71b65c667720');
// The bundle, pinned after the checks passed (null: not pinned).
export const BUILD_EXPECT = exp('c0c8ad4e36cb', 'd0f1017e692d');

const readSrc = (s) => (s.rev ? execFileSync('git', ['show', `${s.rev}:${s.path}`], { cwd: WT, encoding: 'utf8', maxBuffer: 1 << 28 }) : readFileSync(join(WT, s.path), 'utf8'));
const srcSha = (s) => sha(readSrc(s));
const applyDiff = (text, start, name, { reverse = false } = {}) => {
  const d = typeof text === 'string' ? parseDiff(text) : text; const out = { ...start }; const offs = {};
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: touches ${f}, unknown file`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`);
    out[f] = r.text; offs[f] = r.offsets;
  }
  return { tree: out, offs };
};
const hashes = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
const fmt = (h) => `js ${h[JS]} / css ${h[CSS]}`;

export function build({ quiet = false } = {}) {
  const log = (...a) => quiet || console.log(...a);
  const work = join(WT, 'out/gpu-preview/work'); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  const baseDir = resolveTree('site-pretty');
  const baseline = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
  const T = { baseline };
  for (const [k, s] of Object.entries(SRC)) {
    T[k] = applyDiff(readSrc(s), T[s.on], k).tree;
    const h = hashes(T[k]);
    for (const f of FILES) if (h[f] !== s.expect[f]) die(`${k} (${s.rev || 'main'}:${s.path}): ${f} is ${h[f]}, its owner measured ${s.expect[f]}: refused`);
    log(`input ${k.padEnd(6)} ${fmt(h)}  (= owner's hashes; source ${s.rev || 'main'}:${s.path} ${srcSha(s)})`);
  }
  const delta = (name, a, b) => {
    const text = FILES.map((f) => udiff(T[a][f], T[b][f], `${a}/${f}`, `${b}/${f}`, work)).join('');
    if (!text) die(`${name}: empty delta`);
    writeFileSync(join(work, `delta-${name}.diff`), text);
    return { name, text, d: parseDiff(text), sha: sha(text) };
  };
  const D = {
    strip: delta('cd-strip', 'st6', 'strip'),
    roll: delta('cd-roll-ca', 'strip', 'roll'),
    hero: delta('hero-r2', 'mi', 'r2'),
    morph: delta('morph-gpu', 'best', 'rv'),
    best: delta('best-over-st6', 'st6', 'best'),
  };
  // morph-gpu's derived delta must apply like its committed delta.diff (same hunks); its own build is the check
  const groups = { cd: [D.strip, D.roll], hero: [D.hero], morph: [D.morph] };
  const stack = (order) => {
    let t = T.best; const offs = {};
    for (const g of order) for (const dd of groups[g]) { const r = applyDiff(dd.d, t, dd.name); t = r.tree; offs[dd.name] = r.offs; }
    return { tree: t, offs };
  };
  const perms = [['cd', 'hero', 'morph'], ['cd', 'morph', 'hero'], ['hero', 'cd', 'morph'], ['hero', 'morph', 'cd'], ['morph', 'cd', 'hero'], ['morph', 'hero', 'cd']];
  const fwd = stack(perms[0]);
  for (const p of perms.slice(1)) { const r = stack(p); for (const f of FILES) if (r.tree[f] !== fwd.tree[f]) die(`order matters for ${f} (${p.join(',')}: ${sha(r.tree[f])} vs ${sha(fwd.tree[f])}): not mechanical, report it`); }
  log(`order: all ${perms.length} orders of the groups [cd-strip+cd-roll-ca], [hero-r2], [morph-gpu] give the same bytes`);
  const G = fwd.tree;
  // proximity in bundle coordinates: each group's changed bundle lines = old side of diff(bundle -> bundle minus group)
  const newSpans = (g, f) => { let minus = G; for (const dd of [...groups[g]].reverse()) minus = applyDiff(dd.d, minus, dd.name, { reverse: true }).tree;
    const t = udiff(G[f], minus[f], 'a/' + f, 'b/' + f, work); return t ? spans(parseDiff(t)[f]) : []; }; // old side of (G -> minus) = bundle lines
  const near = []; let closest = Infinity, closestAt = '';
  const gs = Object.keys(groups);
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) for (const f of FILES) {
    for (const [a0, a1] of newSpans(gs[i], f)) for (const [b0, b1] of newSpans(gs[j], f)) {
      const gap = Math.max(b0 - a1, a0 - b1) - 1;
      if (gap < closest) { closest = gap; closestAt = `${gs[i]} ${f.split('/').pop()}:${a0 + 1}-${a1 + 1} vs ${gs[j]} :${b0 + 1}-${b1 + 1}`; }
      if (gap < 3) near.push(`${gs[i]} ${f}:${a0 + 1}-${a1 + 1} vs ${gs[j]} :${b0 + 1}-${b1 + 1} (${gap < 0 ? 'overlap' : gap + ' lines apart'})`);
    }
  }
  if (near.length) { for (const c of near) console.error(`CONFLICT ${c}`); die(`${near.length} conflict(s): not resolved here, report it`); }
  log(`conflicts: none; closest changed lines of two groups ${closest} lines apart (bundle coordinates: ${closestAt})`);
  // identities
  const minusGroups = (list) => { let t = G; for (const g of list) for (const dd of [...groups[g]].reverse()) t = applyDiff(dd.d, t, dd.name, { reverse: true }).tree; return t; };
  const id = [];
  const a = minusGroups(['morph', 'cd']); id.push({ check: 'bundle - morph-gpu - cd = B-R2 (hero owner)', got: hashes(a), want: BR2_EXPECT });
  const b = minusGroups(['hero', 'cd']); id.push({ check: 'bundle - hero-r2 - cd = rv (morph-gpu owner)', got: hashes(b), want: SRC.rv.expect, exact: same(b, T.rv) });
  const c0 = minusGroups(['hero', 'morph']); const c = applyDiff(D.best.d, c0, 'best-over-st6', { reverse: true }).tree;
  id.push({ check: 'bundle - hero-r2 - morph-gpu - (best - st6-rb2) = V9 (cd-roll-ca owner)', got: hashes(c), want: SRC.roll.expect, exact: same(c, T.roll) });
  const e = minusGroups(['hero', 'morph', 'cd']); id.push({ check: 'bundle - all three groups = best build', got: hashes(e), want: SRC.best.expect, exact: same(e, T.best) });
  for (const x of id) { const ok = FILES.every((f) => x.got[f] === x.want[f]); x.ok = ok; log(`identity ${ok ? 'ok  ' : 'FAIL'} ${x.check}: ${fmt(x.got)}`); if (!ok) die('identity failed: report it'); }
  // the derived morph delta equals the committed delta.diff hunk for hunk (labels aside)
  const committed = parseDiff(readSrc(SRC.rv)); const derived = D.morph.d;
  const hk = (d) => JSON.stringify(Object.fromEntries(Object.entries(d).map(([f, hs]) => [f, hs.map((h) => [h.oldStart, h.oldLen, h.newStart, h.newLen, h.body])])));
  const morphDeltaSame = hk(committed) === hk(derived);
  log(`morph-gpu delta derived = committed delta.diff: ${morphDeltaSame}`);
  const result = {
    snapshot: JSON.parse(readFileSync(join(WT, 'baseline.json'), 'utf8')).id,
    inputs: Object.fromEntries(Object.entries(SRC).map(([k, s]) => [k, { source: `${s.rev || 'main'}:${s.path}`, sourceSha: srcSha(s), on: s.on, build: hashes(T[k]) }])),
    deltas: Object.fromEntries(Object.entries(D).map(([k, dd]) => [dd.name, { sha: dd.sha, hunks: Object.fromEntries(Object.entries(dd.d).map(([f, hs]) => [f, hs.map((h) => `-${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen}`)])), offsetsWhenStacked: fwd.offs[dd.name] }])),
    orders: perms.map((p) => p.join(',')), orderIndependent: true, closestGroupGapLines: closest, closestGroupGapAt: closestAt,
    identities: id.map(({ check, got, ok }) => ({ check, got, ok })), morphDeltaSameAsCommitted: morphDeltaSame,
    build: hashes(G),
  };
  return { T, G, baseline, result, trees: { br2: a, rv: b, v9: c, bc: c0, best: e } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const { G, baseline, result } = build();
  console.log(`bundle ${fmt(result.build)}`);
  if (!argv.includes('--no-expect') && BUILD_EXPECT) for (const f of FILES) if (result.build[f] !== BUILD_EXPECT[f]) die(`bundle ${f} is ${result.build[f]}, pinned ${BUILD_EXPECT[f]}: refused`);
  execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: G[JS] });
  console.log('node --check: ok');
  const outs = [join(WT, 'fixes/gpu-preview/overlay')];
  if (argv.includes('--snapshot')) outs.push(join(WT, 'out/snapshots', `gpu-${result.build[JS]}`));
  for (const dir of outs) {
    if (dir.includes('/out/snapshots/') && existsSync(join(dir, JS))) { console.log(`snapshot exists: ${dir}`); continue; }
    rmSync(dir, { recursive: true, force: true });
    for (const f of FILES) { if (G[f] === baseline[f]) continue; mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), G[f]); }
    if (dir.includes('/out/snapshots/')) for (const f of FILES) if (existsSync(join(dir, f))) chmodSync(join(dir, f), 0o444);
    console.log(`wrote ${dir}`);
  }
  const jp = opt('--json') || join(WT, 'out/gpu-preview/build.json');
  mkdirSync(dirname(jp), { recursive: true }); writeFileSync(jp, JSON.stringify(result, null, 2) + '\n');
  console.log(`wrote ${jp}`);
}
