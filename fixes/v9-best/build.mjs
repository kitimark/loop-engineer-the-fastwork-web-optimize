#!/usr/bin/env node
// v9-best (int-v8, user T-159 #9, board row v9-best): v8 + six fixes, each added as it passes. Every component is a delta
// against v8 (3e3e94cb6e9f / f836404b3728) with the hashes of its owner's own build (v8 + delta). Built with
// best-build's strict applier (exact context, no fuzz; line offsets are reported).
// Identity checks (refuse, exit 3, nothing written, on any failure):
//   - v8 = fixes/v8-best/patch.diff on the baseline; every component's delta file has its pinned sha256/12, and
//     v8 + delta = its owner's build;
//   - every order of the components gives the same bytes (all orders up to 5 components; at 6, all rotations and reversals);
//   - by reversal: v9 - component (reverse apply) = v8 + all the others, for each component;
//   - node --check on v9's JS; V9_EXPECT when pinned; fixes/v9-best/patch.diff (baseline -> v9) reproduces v9.
// Writes (unless --dry): fixes/v9-best/overlay/ (gitignored; for fix.mjs check/serve), fixes/v9-best/patch.diff,
// out/v9/snap-<js12>/{A,V}/ read-only (A = v8, V = v9; the arm names fixes/v9-best/gates expects) + HASHES.txt (full sha256), out/v9/build.json.
//   node fixes/v9-best/build.mjs [--dry] [--no-expect] [--only a,b]   (--only: build v8 + just those components, no pin)
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff } from '../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry'), NOEXP = argv.includes('--no-expect');
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const exp = (js, css) => ({ [JS]: js, [CSS]: css });

// Components in apply order. `delta`: a diff against v8 (path in this checkout, or `rev` for a committed file elsewhere).
// `file`: sha256/12 of the delta file. `expect`: the owner's build (v8 + delta), as the owner's card states it.
export const COMPONENTS = [
  { name: 'morph-scroll rev 7c (PR-018, accepted 20:12:50Z; landed 42250648)', key: 'ms7c',
    delta: 'fixes/morph-scroll/delta.diff', file: '81ac7e1ee500', expect: exp('428961bda278', '659b02f7169d') },
  { name: 'double-drive (future + commission cards, T-157; fix-double-drive, not landed yet)', key: 'dd',
    rev: '96293d29196230e4a9fdc7f95c7284792dc423ea', delta: 'fixes/double-drive/delta.diff', file: 'baae6114cd65',
    expect: exp('3076c5a8c9a3', '2f7197880ffd') },
  { name: 'scroll-cb alone (side scroll jobs gated; fix-scroll-cb, split check ebee20a5: v8 + scroll-cb = v8 in Simulator nav parity)', key: 'scb',
    delta: 'fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff', file: '3abcd7008e61', expect: exp('4c48e372ecdd', 'f836404b3728'),
    // its commission-job hunks overlap double-drive's (both declare after `_ch`; dd rewrote the rAF line scb uses as
    // context): with dd in the set, the carry (scb on v8 + dd, the same changed lines, both texts kept) is applied instead
    carry: { over: 'dd', delta: 'fixes/v9-best/scroll-cb-on-v8dd.diff', file: '7b4a7ee04d85', expect: exp('bf40f48acd24', '2f7197880ffd') } },
  { name: 'PR-021 Join button rev 3 (nav-earn; user accepted rev 3, final; fix-nav-earn cb3c052c)', key: 'earn',
    rev: 'cb3c052c2cb806042026156b946cd39cf518e3bf', delta: 'fixes/nav-earn/delta.diff', file: 'f214ed00081f',
    expect: exp('8df0a9eb3ec7', '29bade2fe964') },
];
// v9 as pinned after the last component change (null: not pinned yet).
export const V9_EXPECT = null;

const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(3); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const fmt = (t) => { const h = H(t); return `${h[JS]} / ${h[CSS]}`; };
const full = (s) => createHash('sha256').update(s).digest('hex');
const checks = [];
const ok = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) die(`${name}${detail ? '  ' + detail : ''}`); console.log(`ok  ${name}${detail ? '  ' + detail : ''}`); };
const apply = (d, start, name, reverse = false) => {
  d = typeof d === 'string' ? parseDiff(d) : d; const out = { ...start }; const offs = [];
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`);
    out[f] = r.text; offs.push(...r.offsets.filter((o) => o));
  }
  return Object.assign(out, { offs });
};
const strip = (t) => Object.fromEntries(FILES.map((f) => [f, t[f]]));
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
const rd = (p) => readFileSync(join(WT, p), 'utf8');
const show = (rev, p) => { const r = spawnSync('git', ['-C', WT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) die(`git show ${rev}:${p}: ${r.stderr.trim()}`); return r.stdout; };
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

const baseDir = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
const C = strip(apply(rd('fixes/v8-best/patch.diff'), base, 'v8'));
ok('v8 = fixes/v8-best/patch.diff on the baseline', H(C)[JS] === '3e3e94cb6e9f' && H(C)[CSS] === 'f836404b3728', fmt(C));

const comps = COMPONENTS.filter((c) => !ONLY || ONLY.includes(c.key));
if (ONLY && comps.length !== ONLY.length) die(`--only: unknown key in ${ONLY.join(',')} (have ${COMPONENTS.map((c) => c.key).join(',')})`);
for (const c of comps) {
  c.text = c.rev ? show(c.rev, c.delta) : rd(c.delta);
  ok(`${c.key} delta file ${c.delta}${c.rev ? ` @${c.rev}` : ''}`, sha(c.text) === c.file, sha(c.text));
  c.d = parseDiff(c.text);
  const own = apply(c.d, C, c.key);
  ok(`${c.key} alone on v8 = owner's build ${c.expect[JS]} / ${c.expect[CSS]}`, H(own)[JS] === c.expect[JS] && H(own)[CSS] === c.expect[CSS], `${fmt(own)}${own.offs.length ? ` offsets ${own.offs.join(',')}` : ''}`);
}
// Carries: c.carry = c's delta re-based on v8 + the component it overlaps (`over`); used whenever `over` is in the set
// (and only after it). Checks: the carry file's sha; v8 + over + carry = its pinned build; the carry changes exactly the
// lines c's own delta changes (multiset of +/- lines), so it is c's text, only placed around the other component's.
const lineSet = (d) => { const m = new Map(); for (const hs of Object.values(d)) for (const h of hs) for (const [op, t] of h.body) if (op !== ' ') m.set(op + t, (m.get(op + t) || 0) + 1); return m; };
const sameSet = (a, b) => [...new Set([...a.keys(), ...b.keys()])].every((k) => (a.get(k) || 0) === (b.get(k) || 0));
for (const c of comps.filter((x) => x.carry && comps.some((o) => o.key === x.carry.over))) {
  const o = comps.find((x) => x.key === c.carry.over);
  c.carry.text = rd(c.carry.delta);
  ok(`${c.key} carry over ${o.key}: ${c.carry.delta}`, sha(c.carry.text) === c.carry.file, sha(c.carry.text));
  c.carry.d = parseDiff(c.carry.text);
  const own = apply(c.carry.d, strip(apply(o.d, C, o.key)), `${c.key}-carry`);
  ok(`${c.key} carry: v8 + ${o.key} + carry = ${c.carry.expect[JS]} / ${c.carry.expect[CSS]}`, H(own)[JS] === c.carry.expect[JS] && H(own)[CSS] === c.carry.expect[CSS], fmt(own));
  ok(`${c.key} carry changes exactly ${c.key}'s own lines`, sameSet(lineSet(c.carry.d), lineSet(c.d)));
}
const dOf = (c, set) => (c.carry?.d && set.some((x) => x.key === c.carry.over) ? c.carry.d : c.d);
const legal = (order) => order.every((c, i) => !c.carry?.d || !order.some((x, j) => x.key === c.carry.over && j > i));
const build = (order) => order.reduce((t, c) => strip(apply(dOf(c, order), t, `${c.key}@${order.map((x) => x.key).join('+')}`)), C);
if (!legal(comps)) die('COMPONENTS order puts a carry before the component it is carried over');
const V = build(comps);
let orders = comps.length <= 5 ? perms(comps) : [...comps.map((_, i) => [...comps.slice(i), ...comps.slice(0, i)]), [...comps].reverse()];
orders = orders.slice(1).filter(legal);
for (const o of orders) if (!same(build(o), V)) die(`order ${o.map((c) => c.key).join(' + ')} gives other bytes than ${comps.map((c) => c.key).join(' + ')}`);
ok(`${orders.length + 1} order(s) of ${comps.length} component(s) give the same bytes (orders with a carry before its base skipped)`, true, fmt(V));
if (comps.length > 1) for (const c of comps) {
  // a component others are carried over: reverse those carriers first, then c, then put the carriers' own deltas back
  const carriers = comps.filter((x) => x.carry?.d && x.carry.over === c.key);
  let t = V;
  for (const x of carriers) t = strip(apply(x.carry.d, t, `v9-${x.key}(carry)`, true));
  t = strip(apply(dOf(c, comps), t, `v9-${c.key}`, true));
  for (const x of carriers) t = strip(apply(x.d, t, `+${x.key}`));
  ok(`v9 - ${c.key} (reverse${carriers.length ? `, via ${carriers.map((x) => x.key).join(',')}'s carry and back` : ''}) = v8 + the others`, same(t, build(comps.filter((x) => x !== c))), fmt(t));
}
const work = join(WT, 'out/v9/work'); mkdirSync(work, { recursive: true });
writeFileSync(join(work, 'v9.mjs'), V[JS]);
const nc = spawnSync(process.execPath, ['--check', join(work, 'v9.mjs')], { encoding: 'utf8' });
ok('node --check (ES module) on v9\'s JS', nc.status === 0, nc.stderr.trim());
if (!ONLY && V9_EXPECT && !NOEXP) ok(`v9 = pinned V9_EXPECT ${V9_EXPECT[JS]} / ${V9_EXPECT[CSS]}`, H(V)[JS] === V9_EXPECT[JS] && H(V)[CSS] === V9_EXPECT[CSS], fmt(V));
let patch = ''; for (const f of FILES) patch += udiff(base[f], V[f], `a/${f}`, `b/${f}`, work);
ok('patch.diff (baseline -> v9) reproduces v9', same(strip(apply(patch, base, 'patch.diff')), V), `patch.diff ${sha(patch)}`);

const js12 = H(V)[JS];
const lines = [];
for (const [arm, t] of Object.entries({ A: C, V })) for (const f of FILES) lines.push(`${full(t[f])}  ${arm}/${f}`);
console.log(`v9${ONLY ? ` (--only ${ONLY.join(',')})` : ''} = ${fmt(V)}  [${comps.map((c) => c.key).join(' + ')}]`);
console.log(lines.join('\n'));
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
const snap = join(WT, `out/v9/snap-${js12}`);
if (existsSync(snap)) console.log(`${snap} exists: kept (immutable; HASHES checked below)`);
else {
  for (const [arm, t] of Object.entries({ A: C, V })) for (const f of FILES) { const p = join(snap, arm, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t[f]); chmodSync(p, 0o444); }
  writeFileSync(join(snap, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(snap, 'HASHES.txt'), 0o444);
}
const hs = spawnSync('shasum', ['-a', '256', '-c', '--quiet', 'HASHES.txt'], { cwd: snap, encoding: 'utf8' });
ok(`snapshot ${snap.slice(WT.length + 1)} matches HASHES.txt`, hs.status === 0, hs.stdout.trim());
if (ONLY) { console.log('--only: overlay and patch.diff not written'); process.exit(0); }
const ov = join(WT, 'fixes/v9-best/overlay'); rmSync(ov, { recursive: true, force: true });
for (const f of FILES) { const p = join(ov, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, V[f]); }
writeFileSync(join(WT, 'fixes/v9-best/patch.diff'), patch);
mkdirSync(join(WT, 'out/v9'), { recursive: true });
writeFileSync(join(WT, 'out/v9/build.json'), JSON.stringify({ v9: H(V), v9full: { [JS]: full(V[JS]), [CSS]: full(V[CSS]) }, components: comps.map(({ key, name, delta, rev, file, expect }) => ({ key, name, delta, rev, file, expect })), patch: sha(patch), snap: snap.slice(WT.length + 1), checks }, null, 2) + '\n');
console.log(`wrote fixes/v9-best/overlay, fixes/v9-best/patch.diff (${sha(patch)}), out/v9/build.json`);
