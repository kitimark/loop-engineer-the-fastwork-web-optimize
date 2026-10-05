#!/usr/bin/env node
// v9-best (int-v8, user T-159 #9, board row v9-best): v8 + six fixes, each added as it passes. Every component is a delta
// against v8 (3e3e94cb6e9f / f836404b3728) with the hashes of its owner's own build (v8 + delta). Built with
// best-build's strict applier (exact context, no fuzz; line offsets are reported).
// Identity checks (refuse, exit 3, nothing written, on any failure):
//   - v8 = fixes/v8-best/patch.diff on the baseline; every component's delta file has its pinned sha256/12, and
//     v8 + delta = its owner's build;
//   - every legal order of the components gives the same bytes (`carry` and `after` constraints; JOINS: owners' joined builds);
//   - by reversal: v9 - component (reverse apply) = v8 + all the others, for each component;
//   - node --check on v9's JS; V9_EXPECT when pinned; fixes/v9-best/patch.diff (baseline -> v9) reproduces v9.
// Writes (unless --dry): fixes/v9-best/overlay/ (gitignored; for fix.mjs check/serve), fixes/v9-best/patch.diff,
// out/v9/snap-<js12>[-<css12>]/{A,V}/ read-only (A = v8, V = v9; the arm names fixes/v9-best/gates expects) + HASHES.txt (full sha256), out/v9/build.json.
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
  { name: 'PR-021 Join button rev 3 (nav-earn; user accepted rev 3, final; fix-nav-earn cb3c052c)', key: 'earn',
    rev: 'cb3c052c2cb806042026156b946cd39cf518e3bf', delta: 'fixes/nav-earn/delta.diff', file: 'f214ed00081f',
    expect: exp('8df0a9eb3ec7', '29bade2fe964') },
  // nav-hit-cache (fix-nav-morph, arm A 2026-10-05): U1 (1 context line) must come after rev 7c (7c's 3-line context
  // meets nav's inserted lines), then the glue for 7c's on-dark microtask. `after`: order constraint (and v9 - X also
  // takes out every component that comes after X by constraint). `on`: the base of the component's own check.
  // expect null: the owner pins the joined build (JOINS below), not v8 + U1 alone.
  { name: 'nav-hit-cache U1 (fix-nav-morph arm A; with the re-measure fix, parity PASS 13d29af1, ops AGREE 820dfe22)', key: 'nav',
    delta: 'fixes/nav-hit-cache/patch-on-v8-u1.diff', file: '929268181c61', after: ['ms7c'], expect: null },
  { name: 'nav-hit-cache glue for rev 7c\'s on-dark microtask (fix-nav-morph)', key: 'glue',
    delta: 'fixes/nav-hit-cache/glue-ms7c.diff', file: '5d63660a9e62', after: ['ms7c', 'nav'], on: ['ms7c', 'nav'], expect: null },
];
// Out of v9 (lead ruling 2026-10-05, after the gM split): scroll-cb shortens the first page-up fling in the middle
// (Simulator, OBSERVED: step 4 minus scb 2190 px vs C 2204; with scb 1666, v9-final with scb 1255). It rejoins as a v9.1
// step once its owner finds the mechanism and it passes the same Simulator parity check. Kept here, not built.
export const DROPPED = [
  { name: 'scroll-cb alone (side scroll jobs gated; fix-scroll-cb, split check ebee20a5: v8 + scroll-cb = v8 in Simulator nav parity)', key: 'scb',
    delta: 'fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff', file: '3abcd7008e61', expect: exp('4c48e372ecdd', 'f836404b3728'),
    // its commission-job hunks overlap double-drive's (both declare after `_ch`; dd rewrote the rAF line scb uses as
    // context): with dd in the set, the carry (scb on v8 + dd, the same changed lines, both texts kept) is applied instead
    carry: { over: 'dd', delta: 'fixes/v9-best/scroll-cb-on-v8dd.diff', file: '7b4a7ee04d85', expect: exp('bf40f48acd24', '2f7197880ffd') } },
  // Out of v9 (lead ruling 2026-10-05 ~06:10Z, after the rest-work split): with the close rule, Chrome restyles at rest
  // (census mainFrames/s rest-0 / rest-2796: 60 / 22-34 over 4 loads, styleRecalc only; v9-final minus close 39.3 / 2.2,
  // v8 38.5-39.3 / 2.2-3; OBSERVED, cause unknown). It rejoins as a v9.1 step once fix-morph-gpu fixes or explains it.
  { name: 'morph-close-peak close rule (fix-morph-gpu, v9 #6; landed 48918dd7)', key: 'close',
    delta: 'fixes/morph-gpu/close/delta.diff', file: '60eba2d73b68', expect: exp('3e3e94cb6e9f', 'f673c6cbc770') },
];
// Joined builds the owners pinned on their own cards: checked whenever all their keys are in the set.
export const JOINS = [
  { name: 'step 4 (P-120/P-122 arm)', keys: ['ms7c', 'dd', 'scb', 'earn'], expect: exp('de237379b556', 'e1359ab9994a') },
  { name: 'fix-nav-morph arm A: step 4 + nav + glue (= step 4 + patch-on-v9s4.diff 9814fdad848e)', keys: ['ms7c', 'dd', 'scb', 'earn', 'nav', 'glue'], expect: exp('c3d36476c3ce', 'e1359ab9994a') },
  { name: 'step 4 minus scb (gM split build Rs, int-v8 2026-10-05; --only ms7c,dd,earn)', keys: ['ms7c', 'dd', 'earn'], expect: exp('366636504b84', 'e1359ab9994a') },
  { name: 'fix-morph-gpu arm A: step 4 + close (= step 4 + close-on-A.diff d7ce6edee0eb)', keys: ['ms7c', 'dd', 'scb', 'earn', 'close'], expect: exp('de237379b556', 'bdecf48c5b32') },
];
// v9 as pinned after the last component change (null: not pinned yet). Superseded: c3d36476c3ce / bdecf48c5b32 (with scb
// and close), 647c9ef2b1e2 / bdecf48c5b32 (with close).
export const V9_EXPECT = exp('647c9ef2b1e2', 'e1359ab9994a');

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
for (const c of comps) for (const k of c.after || []) if (!comps.some((x) => x.key === k)) die(`${c.key} needs ${k} in the set (after: ${c.after.join(',')})`);
for (const c of comps) {
  c.text = c.rev ? show(c.rev, c.delta) : rd(c.delta);
  ok(`${c.key} delta file ${c.delta}${c.rev ? ` @${c.rev}` : ''}`, sha(c.text) === c.file, sha(c.text));
  c.d = parseDiff(c.text);
  const onBase = (c.on || []).reduce((t, k) => strip(apply(comps.find((x) => x.key === k).d, t, `${k} (base of ${c.key})`)), C);
  const own = apply(c.d, onBase, c.key);
  const where = c.on?.length ? `v8 + ${c.on.join(' + ')}` : 'v8';
  if (c.expect) ok(`${c.key} on ${where} = owner's build ${c.expect[JS]} / ${c.expect[CSS]}`, H(own)[JS] === c.expect[JS] && H(own)[CSS] === c.expect[CSS], `${fmt(own)}${own.offs.length ? ` offsets ${own.offs.join(',')}` : ''}`);
  else ok(`${c.key} applies strictly on ${where} (no owner pin for this build; see JOINS)`, true, `${fmt(own)}${own.offs.length ? ` offsets ${own.offs.join(',')}` : ''}`);
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
const legal = (order) => order.every((c, i) => (!c.carry?.d || !order.some((x, j) => x.key === c.carry.over && j > i))
  && (c.after || []).every((k) => order.findIndex((x) => x.key === k) < i));
const build = (order) => order.reduce((t, c) => strip(apply(dOf(c, order), t, `${c.key}@${order.map((x) => x.key).join('+')}`)), C);
if (!legal(comps)) die('COMPONENTS order puts a carry before the component it is carried over, or a component before one it must come after');
const V = build(comps);
let orders = perms(comps).slice(1).filter(legal);
for (const o of orders) if (!same(build(o), V)) die(`order ${o.map((c) => c.key).join(' + ')} gives other bytes than ${comps.map((c) => c.key).join(' + ')}`);
ok(`${orders.length + 1} legal order(s) of ${comps.length} component(s) give the same bytes (orders with a carry before its base, or against an "after", skipped)`, true, fmt(V));
for (const j of JOINS) if (j.keys.every((k) => comps.some((x) => x.key === k))) {
  const t = build(comps.filter((x) => j.keys.includes(x.key)));
  ok(`join ${j.name} = ${j.expect[JS]} / ${j.expect[CSS]}`, H(t)[JS] === j.expect[JS] && H(t)[CSS] === j.expect[CSS], fmt(t));
}
// the components that come after c by constraint (transitively): v9 - c takes them out too
const deps = (c) => { const out = []; const add = (k) => { for (const x of comps) if ((x.after || []).includes(k) && !out.includes(x)) { out.push(x); add(x.key); } }; add(c.key); return comps.filter((x) => out.includes(x)); };
if (comps.length > 1) for (const c of comps) {
  // dependents (by `after`) are reversed first, latest first; a component others are carried over: reverse those carriers,
  // then c, then put the carriers' own deltas back
  const dep = deps(c);
  const carriers = comps.filter((x) => x.carry?.d && x.carry.over === c.key && !dep.includes(x));
  let t = V;
  for (const x of [...dep].reverse()) t = strip(apply(dOf(x, comps), t, `v9-${x.key}(after ${c.key})`, true));
  for (const x of carriers) t = strip(apply(x.carry.d, t, `v9-${x.key}(carry)`, true));
  t = strip(apply(dOf(c, comps), t, `v9-${c.key}`, true));
  for (const x of carriers) t = strip(apply(x.d, t, `+${x.key}`));
  const rest = comps.filter((x) => x !== c && !dep.includes(x));
  ok(`v9 - ${c.key}${dep.length ? ` (and ${dep.map((x) => x.key).join(',')}, which come after it)` : ''} (reverse${carriers.length ? `, via ${carriers.map((x) => x.key).join(',')}'s carry and back` : ''}) = v8 + ${rest.map((x) => x.key).join(' + ') || 'nothing'}`, same(t, build(rest)), fmt(t));
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
// A build that changes only the CSS has the same js12 as an earlier one (v9-final without close vs with it): an existing
// snap-<js12> is reused only when its HASHES.txt lists exactly this build, else the snapshot is snap-<js12>-<css12>.
const want = lines.join('\n') + '\n';
const sameSnap = (d) => readFileSync(join(d, 'HASHES.txt'), 'utf8') === want;
let snap = join(WT, `out/v9/snap-${js12}`);
if (existsSync(snap) && !sameSnap(snap)) snap = join(WT, `out/v9/snap-${js12}-${H(V)[CSS]}`);
if (existsSync(snap) && !sameSnap(snap)) die(`${snap} exists with other content (HASHES.txt differs)`);
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
writeFileSync(join(WT, 'out/v9/build.json'), JSON.stringify({ v9: H(V), v9full: { [JS]: full(V[JS]), [CSS]: full(V[CSS]) }, components: comps.map(({ key, name, delta, rev, file, after, on, expect }) => ({ key, name, delta, rev, file, after, on, expect })), patch: sha(patch), snap: snap.slice(WT.length + 1), checks }, null, 2) + '\n');
console.log(`wrote fixes/v9-best/overlay, fixes/v9-best/patch.diff (${sha(patch)}), out/v9/build.json`);
