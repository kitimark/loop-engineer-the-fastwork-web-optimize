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
//   node fixes/v9-best/build.mjs [--dry] [--no-expect] [--only a,b] [--target v9|v91|v91d|v92 [--with k,k]]   (--only: build v8 + just those components, no pin)
// --target v91 (v9.1 = v9-final + scroll-cb + g11 close; lead 2026-10-05 after v9-final landed 8b5ce9b3): the same checks
// over TARGETS.v91's components, plus g11 as fix-morph-gpu delivered it (on v9-final) = the same bytes; writes
// fixes/v9-1/overlay, fixes/v9-1/patch.diff, out/v91/ instead. The default (v9) is unchanged.
// --target v91d (v9.1 on rev 7d; lead 2026-10-05 after rev 7d landed 189ca7ed, P-134): v91's components with ms7c swapped
// for ms7d (delta.diff read at 189ca7ed; ms7c is now read at d683c637, the last commit with rev 7c's delta). The same
// checks, plus C = v9.1d - scb - g11 = the landed fixes/morph-scroll-v9try/patch.diff (6d1632eb0ee9) on the baseline, byte
// for byte (V9D pin), and C + g11 as delivered on v9-final = v9.1d - scb. Writes fixes/v9-1d/{overlay,patch.diff} and
// out/v91d/snap-<js12>/{A,C,V} (A = v8, C = v9-final + 7d, V = v9.1d). Usage: [--dry] [--only a,b] --target v91d.
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
  // rev d683c637: delta.diff moved on to rev 7d (4d99f3f2), so 7c is read from the commit that last had it
  { name: 'morph-scroll rev 7c (PR-018, accepted 20:12:50Z; landed 42250648)', key: 'ms7c',
    rev: 'd683c637a15a498b302f49dfd9f42c2a3a91fb10', delta: 'fixes/morph-scroll/delta.diff', file: '81ac7e1ee500', expect: exp('428961bda278', '659b02f7169d') },
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
  { name: 'fix-morph-gpu v9.1 without scb: v9-final + g11 (out/morph-gpu/v91/snap-K91)', keys: ['ms7c', 'dd', 'earn', 'nav', 'glue', 'g11'], expect: exp('647c9ef2b1e2', 'f1997edf5309') },
];
// v9 as pinned after the last component change (null: not pinned yet). Superseded: c3d36476c3ce / bdecf48c5b32 (with scb
// and close), 647c9ef2b1e2 / bdecf48c5b32 (with close).
export const V9_EXPECT = exp('647c9ef2b1e2', 'e1359ab9994a');
// v9.1's close: fix-morph-gpu's g11 (landed 6f824153), a one-shot 0.75 s visibility keyframe on the panel's children in
// place of the dropped close rule (CSS only). Delivered twice, the same 14 lines: on v8 (built here) and on v9-final (the
// lead's pin d677884838c7, checked below: v9-final + it = v9.1 without scb).
export const G11 = { name: 'morph-close-peak g11 close (fix-morph-gpu, v9.1; landed 6f824153)', key: 'g11',
  delta: 'fixes/morph-gpu/v91/close-v91-on-v8.diff', file: '3ab8a2fbbc68', expect: exp('3e3e94cb6e9f', 'b8cee7b3549b'),
  onFinal: { delta: 'fixes/morph-gpu/v91/close-v91-on-v9final.diff', file: 'd677884838c7', expect: exp('647c9ef2b1e2', 'f1997edf5309') } };
// v9.1 as pinned after its build (null: not pinned yet)
export const V91_EXPECT = exp('c3d36476c3ce', 'f1997edf5309');
// Menu rev 7d (PR-023 rev 5, accepted by the user 10:15:50Z; landed 189ca7ed) replaces rev 7c in the shipping base
// (lead 2026-10-05: P-132 retired, P-134 = v9-final + 7d vs v9.1 + 7d). Its delta against v8 is the morph-scroll
// owner's delta.diff at 189ca7ed (4d99f3f2's rev 7d; v8 + it = the owner's ms-29c0d537e0c9). In the 7d sets every
// `after`/`on` that names ms7c names ms7d instead.
export const MS7D = { name: 'morph-scroll rev 7d (PR-023 rev 5, accepted 10:15:50Z; landed 189ca7ed)', key: 'ms7d',
  rev: '189ca7ed866cd75f40e82fb678cfe942742dd49f', delta: 'fixes/morph-scroll/delta.diff', file: 'c634e3fbd90b', expect: exp('29c0d537e0c9', '659b02f7169d') };
// v9-final + 7d as landed (189ca7ed's fixes/morph-scroll-v9try/patch.diff 6d1632eb0ee9, baseline-relative): P-134's C
export const V9D = { patch: 'fixes/morph-scroll-v9try/patch.diff', rev: '189ca7ed866cd75f40e82fb678cfe942742dd49f', file: '6d1632eb0ee9', expect: exp('1b2eecc66011', 'e1359ab9994a') };
// v9.1 + 7d as pinned after its build (null: not pinned yet)
export const V91D_EXPECT = exp('941aa13e5bdf', 'f1997edf5309');
// v9.2 (lead + user T-199 #3, 2026-10-05): v9.1d + every fix whose rendering count test passed by the 15:00Z freeze
// (people-word a by the user's accepted proposal, PR-024). Each extra is a delta against C = v9-final + 7d (the
// shipping base), given either as a delta file (`delta`) or as its owner's baseline-relative patch (`basePatch`: the
// delta is then derived as C -> the owner's build, and the owner's build must be C + it). `expect`: the owner's build
// on C; `expectV`: on v9.1d (as the owner checked it). Measured against v9-final as landed (V9F).
export const EXTRAS = [
  { name: 'people-word option a (PR-024 rev 3, accepted by the user 11:42:48Z; landed 729754eb)', key: 'pw',
    rev: '729754ebd64f0bb37f35d0ce3f4e23bf8e9380b5', basePatch: 'fixes/people-word-a/patch.diff', file: 'c1cf11cbc1aa',
    expect: exp('bf75ce87958c', 'e1359ab9994a') },
  // 70435f43 replaces b72bd585 (b2ed79bdbab5): adds the parked writer's per-frame skip past the end
  { name: 'hero-park (fix-hero-exit-threaded 70435f43; card P-140)', key: 'hp',
    rev: '70435f435bc40add7e531c5bfe632d1dc20b85d8', delta: 'fixes/hero-park/delta.diff', file: '14fb7c20781c',
    expect: exp('6b28c3b9528e', 'e1359ab9994a'), expectV: exp('8ce731d584d9', 'f1997edf5309') },
  { name: 'nav-hit-cache U2 on v9-final + 7d (fix-nav-morph 41bae5af; card P-138)', key: 'nhc',
    rev: '41bae5af', delta: 'fixes/nav-hit-cache/u2-delta-on-v9f7d.diff', file: 'c0d040afe271',
    expect: exp('c7435c24dc56', 'e1359ab9994a'), expectV: exp('db0bc2262f02', 'f1997edf5309') },
  // a delta against v9-final (pre-7d); the owner checked it on v9-final, on v9-final + 7d (results.json) and on v9.1d
  { name: 'nav-fade (fix-nav-fade, card v2 69cf0dc1, conditions N1-N6 on 2d7617c5 (was 32e5172f), batch 9 CONFIRMED; land request at f4c2fa0d)', key: 'nf',
    rev: 'f4c2fa0d3375f764dab39a8a4cc64d134c4bbac1', delta: 'fixes/nav-fade/nav-fade-on-v9final.diff', file: 'f41d2854aa90',
    expectF: exp('a03872195d3f', '9646fc3da77a'), expect: exp('2ed12145e856', '9646fc3da77a'), expectV: exp('8bbe6a33dfde', '1c4161f56545') },
];
export const V9F = { patch: 'fixes/v9-best/patch.diff', rev: '8b5ce9b3', file: '4196eaa61d96', expect: V9_EXPECT };
// v9.2 as pinned after its build (null: not pinned yet)
export const V92_EXPECT = exp('6468db04395c', '1c4161f56545');   // pw + nhc + nf (lead 15:0xZ ruling: nf joins after ops-reader-navfade-b9 CONFIRMED 7720ea3a before P-142's sign); pw + nhc alone was 93028be4374f / f1997edf5309
const byKey = (k) => [...COMPONENTS, ...DROPPED, G11, MS7D].find((c) => c.key === k);
const to7d = (c) => (c.key === 'ms7c' ? MS7D : !c.after && !c.on ? c : { ...c, after: c.after?.map((k) => (k === 'ms7c' ? 'ms7d' : k)), on: c.on?.map((k) => (k === 'ms7c' ? 'ms7d' : k)) });
export const TARGETS = {
  v9: { label: 'v9', comps: COMPONENTS, expect: V9_EXPECT, dir: 'fixes/v9-best', out: 'out/v9' },
  v91: { label: 'v9.1', comps: ['ms7c', 'dd', 'scb', 'earn', 'nav', 'glue', 'g11'].map(byKey), expect: V91_EXPECT, dir: 'fixes/v9-1', out: 'out/v91' },
  // P-134's V; its control C (v9-final + 7d) is built here too (the set minus scb and g11) and must equal V9D
  v91d: { label: 'v9.1d', comps: ['ms7c', 'dd', 'scb', 'earn', 'nav', 'glue', 'g11'].map(byKey).map(to7d), expect: V91D_EXPECT, dir: 'fixes/v9-1d', out: 'out/v91d', final: V9D },
  // v9.2: v9.1d's set (checked = V91D_EXPECT first), then the extras (--with picks them; default: all of EXTRAS)
  v92: { label: 'v9.2', comps: ['ms7c', 'dd', 'scb', 'earn', 'nav', 'glue', 'g11'].map(byKey).map(to7d), expect: V92_EXPECT, dir: 'fixes/v9-2', out: 'out/v92', final: V9D, extras: EXTRAS },
};
const WITH = argv.includes('--with') ? argv[argv.indexOf('--with') + 1].split(',').filter(Boolean) : null;
const TKEY = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'v9';
if (!TARGETS[TKEY]) { console.error(`REFUSED: --target ${TKEY}: have ${Object.keys(TARGETS).join(', ')}`); process.exit(3); }
const T = TARGETS[TKEY];

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

const comps = T.comps.filter((c) => !ONLY || ONLY.includes(c.key));
if (ONLY && comps.length !== ONLY.length) die(`--only: unknown key in ${ONLY.join(',')} (have ${T.comps.map((c) => c.key).join(',')})`);
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
let V = build(comps);
let orders = perms(comps).slice(1).filter(legal);
for (const o of orders) if (!same(build(o), V)) die(`order ${o.map((c) => c.key).join(' + ')} gives other bytes than ${comps.map((c) => c.key).join(' + ')}`);
ok(`${orders.length + 1} legal order(s) of ${comps.length} component(s) give the same bytes (orders with a carry before its base, or against an "after", skipped)`, true, fmt(V));
for (const j of JOINS) if (j.keys.every((k) => comps.some((x) => x.key === k))) {
  const t = build(comps.filter((x) => j.keys.includes(x.key)));
  ok(`join ${j.name} = ${j.expect[JS]} / ${j.expect[CSS]}`, H(t)[JS] === j.expect[JS] && H(t)[CSS] === j.expect[CSS], fmt(t));
}
// P-134's control (7d target): the set minus scb and g11 = v9-final + 7d as landed (its baseline-relative patch,
// pinned); g11 as delivered on v9-final applies to it too (CSS only; its CSS is v9-final's) and gives the set minus scb
let FIN = null;
if (T.final && !ONLY) {
  FIN = build(comps.filter((x) => x.key !== 'scb' && x !== G11));
  ok(`C = ${T.label} - scb - g11 = pinned ${T.final.expect[JS]} / ${T.final.expect[CSS]}`, H(FIN)[JS] === T.final.expect[JS] && H(FIN)[CSS] === T.final.expect[CSS], fmt(FIN));
  const pt = show(T.final.rev, T.final.patch);
  ok(`${T.final.patch} @${T.final.rev.slice(0, 8)}`, sha(pt) === T.final.file, sha(pt));
  ok(`${T.final.patch} on the baseline = C, byte for byte`, same(strip(apply(pt, base, 'v9d patch')), FIN));
  const txt = rd(G11.onFinal.delta);
  ok(`g11 on v9-final: ${G11.onFinal.delta}`, sha(txt) === G11.onFinal.file, sha(txt));
  const t = strip(apply(txt, FIN, 'g11-on-C'));
  ok(`C + g11 (as delivered on v9-final) = ${T.label} - scb`, same(t, build(comps.filter((x) => x.key !== 'scb'))), fmt(t));
}
// g11 as fix-morph-gpu delivered it for v9.1 (a delta on v9-final): v9-final (as pinned) + it = this set minus scb,
// byte for byte, so the v8-based g11 built here is the lead's d677884838c7
if (comps.includes(G11) && COMPONENTS.every((c) => comps.includes(c))) {
  const fin = build(comps.filter((x) => COMPONENTS.includes(x)));
  ok(`v9-final built here = pinned V9_EXPECT ${V9_EXPECT[JS]} / ${V9_EXPECT[CSS]}`, H(fin)[JS] === V9_EXPECT[JS] && H(fin)[CSS] === V9_EXPECT[CSS], fmt(fin));
  const txt = rd(G11.onFinal.delta);
  ok(`g11 on v9-final: ${G11.onFinal.delta}`, sha(txt) === G11.onFinal.file, sha(txt));
  const t = strip(apply(txt, fin, 'g11-on-v9final'));
  ok(`v9-final + g11 (as delivered) = ${G11.onFinal.expect[JS]} / ${G11.onFinal.expect[CSS]} = v8 + ${comps.filter((x) => x.key !== 'scb').map((x) => x.key).join(' + ')} here`,
    H(t)[JS] === G11.onFinal.expect[JS] && H(t)[CSS] === G11.onFinal.expect[CSS] && same(t, build(comps.filter((x) => x.key !== 'scb'))), fmt(t));
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
  ok(`${T.label} - ${c.key}${dep.length ? ` (and ${dep.map((x) => x.key).join(',')}, which come after it)` : ''} (reverse${carriers.length ? `, via ${carriers.map((x) => x.key).join(',')}'s carry and back` : ''}) = v8 + ${rest.map((x) => x.key).join(' + ') || 'nothing'}`, same(t, build(rest)), fmt(t));
}
const work = join(WT, `${T.out}/work`); mkdirSync(work, { recursive: true });
// v9.2's extras on top of v9.1d (the set above, = V91D_EXPECT). Checks: each extra's file sha; its owner's build = C + it
// (for a basePatch extra: the owner's patch on the baseline = its pin, and the derived delta C -> it); it applies
// strictly on v9.1d (= expectV when the owner checked it); every order of the extras gives the same bytes; v9.2 - x
// (reverse) = v9.1d + the others, for each x; v9.2 minus every extra = v9.1d. Also built: X = C + the extras (the
// bisect arm without scroll-cb and g11) and F = v9-final as landed (the measurement's control).
let BASE = null, CX = null, F0 = null, xs = [];
const derived = {}, OWN = {}, MINUS = {};
if (T.extras && !ONLY) {
  ok(`${T.label}'s base = v9.1d = pinned V91D_EXPECT ${V91D_EXPECT[JS]} / ${V91D_EXPECT[CSS]}`, H(V)[JS] === V91D_EXPECT[JS] && H(V)[CSS] === V91D_EXPECT[CSS], fmt(V));
  BASE = V;
  xs = T.extras.filter((x) => !WITH || WITH.includes(x.key));
  if (WITH && xs.length !== WITH.length) die(`--with: unknown key in ${WITH.join(',')} (have ${T.extras.map((x) => x.key).join(',')})`);
  const fp = show(V9F.rev, V9F.patch);
  ok(`${V9F.patch} @${V9F.rev}`, sha(fp) === V9F.file, sha(fp));
  F0 = strip(apply(fp, base, 'v9-final patch'));
  ok(`F = v9-final as landed = pinned V9_EXPECT ${V9F.expect[JS]} / ${V9F.expect[CSS]}`, H(F0)[JS] === V9F.expect[JS] && H(F0)[CSS] === V9F.expect[CSS], fmt(F0));
  for (const x of xs) {
    if (x.basePatch) {
      const pt = show(x.rev, x.basePatch);
      ok(`${x.key} owner patch ${x.basePatch} @${x.rev.slice(0, 8)}`, sha(pt) === x.file, sha(pt));
      const own = strip(apply(pt, base, `${x.key} owner patch`));
      ok(`${x.key} owner's build (patch on the baseline) = ${x.expect[JS]} / ${x.expect[CSS]}`, H(own)[JS] === x.expect[JS] && H(own)[CSS] === x.expect[CSS], fmt(own));
      x.text = FILES.map((f) => udiff(FIN[f], own[f], `a/${f}`, `b/${f}`, work)).join('');
      x.d = parseDiff(x.text);
      ok(`${x.key} owner's build = C + derived delta (${sha(x.text)})`, same(strip(apply(x.d, FIN, `${x.key} on C`)), own));
      derived[x.key] = x.text;
      OWN[x.key] = own;
    } else {
      x.text = show(x.rev, x.delta);
      ok(`${x.key} delta file ${x.delta} @${x.rev.slice(0, 8)}`, sha(x.text) === x.file, sha(x.text));
      x.d = parseDiff(x.text);
      const own = apply(x.d, FIN, `${x.key} on C`);
      if (x.expect) ok(`${x.key} on C = owner's build ${x.expect[JS]} / ${x.expect[CSS]}`, H(own)[JS] === x.expect[JS] && H(own)[CSS] === x.expect[CSS], `${fmt(own)}${own.offs.length ? ` offsets ${own.offs.join(',')}` : ''}`);
      else ok(`${x.key} applies strictly on C (no owner pin on C)`, true, `${fmt(own)}${own.offs.length ? ` offsets ${own.offs.join(',')}` : ''}`);
      OWN[x.key] = strip(own);
    }
    if (x.expectF) { const f = apply(x.d, F0, `${x.key} on v9-final`); ok(`${x.key} on v9-final = owner's build ${x.expectF[JS]} / ${x.expectF[CSS]}`, H(f)[JS] === x.expectF[JS] && H(f)[CSS] === x.expectF[CSS], fmt(f)); }
    const onV = apply(x.d, BASE, `${x.key} on v9.1d`);
    if (x.expectV) ok(`${x.key} on v9.1d = owner's check ${x.expectV[JS]} / ${x.expectV[CSS]}`, H(onV)[JS] === x.expectV[JS] && H(onV)[CSS] === x.expectV[CSS], `${fmt(onV)}${onV.offs.length ? ` offsets ${onV.offs.join(',')}` : ''}`);
    else ok(`${x.key} applies strictly on v9.1d`, true, `${fmt(onV)}${onV.offs.length ? ` offsets ${onV.offs.join(',')}` : ''}`);
  }
  const bx = (order, from) => order.reduce((t, x) => strip(apply(x.d, t, `${x.key}@${order.map((y) => y.key).join('+')}`)), from);
  V = bx(xs, BASE);
  const xo = perms(xs).slice(1);
  for (const o of xo) if (!same(bx(o, BASE), V)) die(`extras order ${o.map((x) => x.key).join(' + ')} gives other bytes than ${xs.map((x) => x.key).join(' + ')}`);
  ok(`${xo.length + 1} order(s) of the extras ${xs.map((x) => x.key).join(', ') || '(none)'} on v9.1d give the same bytes`, true, fmt(V));
  for (const x of xs) {
    const t = strip(apply(x.d, V, `${T.label}-${x.key}`, true));
    MINUS[x.key] = t;
    ok(`${T.label} - ${x.key} (reverse) = v9.1d + ${xs.filter((y) => y !== x).map((y) => y.key).join(' + ') || 'nothing'}`, same(t, bx(xs.filter((y) => y !== x), BASE)), fmt(t));
  }
  const back = [...xs].reverse().reduce((t, x) => strip(apply(x.d, t, `${T.label}-all(${x.key})`, true)), V);
  ok(`${T.label} minus every extra (reverse) = v9.1d`, same(back, BASE), fmt(back));
  CX = bx(xs, FIN);
  ok(`X = C + extras (v9-final + 7d + ${xs.map((x) => x.key).join(' + ')}) built`, true, fmt(CX));
}
writeFileSync(join(work, 'v9.mjs'), V[JS]);
const nc = spawnSync(process.execPath, ['--check', join(work, 'v9.mjs')], { encoding: 'utf8' });
ok(`node --check (ES module) on ${T.label}'s JS`, nc.status === 0, nc.stderr.trim());
if (!ONLY && T.expect && !NOEXP) ok(`${T.label} = pinned ${{ v9: 'V9_EXPECT', v91: 'V91_EXPECT', v91d: 'V91D_EXPECT', v92: 'V92_EXPECT' }[TKEY]} ${T.expect[JS]} / ${T.expect[CSS]}`, H(V)[JS] === T.expect[JS] && H(V)[CSS] === T.expect[CSS], fmt(V));
let patch = ''; for (const f of FILES) patch += udiff(base[f], V[f], `a/${f}`, `b/${f}`, work);
ok(`patch.diff (baseline -> ${T.label}) reproduces ${T.label}`, same(strip(apply(patch, base, 'patch.diff')), V), `patch.diff ${sha(patch)}`);

const js12 = H(V)[JS];
// snapshot arms: A = v8, C = v9-final + 7d (7d targets); v9.2 adds F = v9-final as landed, B = v9.1d, X = C + extras
// (v9.2 also: O<key> = C + that extra alone, the owner's build; M<key> = v9.2 minus it; for the per-fix pixel gates)
const ARMS = { A: C, ...(FIN ? { C: FIN } : {}), ...(BASE ? { F: F0, B: BASE, X: CX } : {}),
  ...Object.fromEntries(Object.entries(OWN).map(([k, t]) => [`O${k}`, t])), ...Object.fromEntries(Object.entries(MINUS).map(([k, t]) => [`M${k}`, t])), V };
const lines = [];
for (const [arm, t] of Object.entries(ARMS)) for (const f of FILES) lines.push(`${full(t[f])}  ${arm}/${f}`);
console.log(`${T.label}${ONLY ? ` (--only ${ONLY.join(',')})` : ''} = ${fmt(V)}  [${[...comps.map((c) => c.key), ...xs.map((x) => x.key)].join(' + ')}]`);
console.log(lines.join('\n'));
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
// A build that changes only the CSS has the same js12 as an earlier one (v9-final without close vs with it): an existing
// snap-<js12> is reused only when its HASHES.txt lists exactly this build, else the snapshot is snap-<js12>-<css12>.
const want = lines.join('\n') + '\n';
const sameSnap = (d) => readFileSync(join(d, 'HASHES.txt'), 'utf8') === want;
let snap = join(WT, `${T.out}/snap-${js12}`);
if (existsSync(snap) && !sameSnap(snap)) snap = join(WT, `${T.out}/snap-${js12}-${H(V)[CSS]}`);
if (existsSync(snap) && !sameSnap(snap)) die(`${snap} exists with other content (HASHES.txt differs)`);
if (existsSync(snap)) console.log(`${snap} exists: kept (immutable; HASHES checked below)`);
else {
  for (const [arm, t] of Object.entries(ARMS)) for (const f of FILES) { const p = join(snap, arm, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t[f]); chmodSync(p, 0o444); }
  writeFileSync(join(snap, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(snap, 'HASHES.txt'), 0o444);
}
const hs = spawnSync('shasum', ['-a', '256', '-c', '--quiet', 'HASHES.txt'], { cwd: snap, encoding: 'utf8' });
ok(`snapshot ${snap.slice(WT.length + 1)} matches HASHES.txt`, hs.status === 0, hs.stdout.trim());
if (ONLY) { console.log('--only: overlay and patch.diff not written'); process.exit(0); }
const ov = join(WT, `${T.dir}/overlay`); rmSync(ov, { recursive: true, force: true });
for (const f of FILES) { const p = join(ov, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, V[f]); }
writeFileSync(join(WT, `${T.dir}/patch.diff`), patch);
mkdirSync(join(WT, T.out), { recursive: true });
// derived extra deltas (C -> owner's build) contain bundle code: kept in out/, never committed
for (const [k, txt] of Object.entries(derived)) writeFileSync(join(WT, `${T.out}/${k}-delta-on-C.diff`), txt);
writeFileSync(join(WT, `${T.out}/build.json`), JSON.stringify({ target: TKEY, v9: H(V), v9full: { [JS]: full(V[JS]), [CSS]: full(V[CSS]) }, components: comps.map(({ key, name, delta, rev, file, after, on, expect }) => ({ key, name, delta, rev, file, after, on, expect })), extras: xs.map(({ key, name, delta, basePatch, rev, file, expect, expectV, expectF, text }) => ({ key, name, delta, basePatch, rev, file, expect, expectV, expectF, deltaSha: sha(text) })), arms: Object.fromEntries(Object.entries(ARMS).map(([a, t]) => [a, H(t)])), patch: sha(patch), snap: snap.slice(WT.length + 1), checks }, null, 2) + '\n');
console.log(`wrote ${T.dir}/overlay, ${T.dir}/patch.diff (${sha(patch)}), ${T.out}/build.json`);
