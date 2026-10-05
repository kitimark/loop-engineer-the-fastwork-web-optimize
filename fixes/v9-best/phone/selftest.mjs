#!/usr/bin/env node
// v9 scorer self-test (run before the pre-data read; needs P-111's own records in this checkout's out/p111/runs and
// P-111's committed result out/p111/score.json, both gitignored, from int-v8's P-111 block):
//   node fixes/v9-best/phone/selftest.mjs   -> "SELFTEST OK <n> checks" (exit 0), the first failure (exit 1), or
//                                              "SELFTEST NO DATA" (exit 2) when the P-111 records are not here
// Checks: (1) re-scoring P-111's M leg and G parts M and E (its own files, in its block order) with P-111's pins gives
// exactly P-111's Mmoving, Mtweens, GM and GE gates; (2) the v9 block verdict is built from those four gates only;
// (3) under the v9 pins the same records are void as "served not arm" (v7 is no v8, v8 is no v9), so the re-pin
// reaches P-111's served check; (4) item mapping: sCo/sCc -> sC, every warm-up skipped, unknown items refused.
// Amendment A2 (P-120, after H1; also needs H1's M records out/pv9/runs/pv9-m{C1,V2,V3,C4}.json, gitignored):
// (5) the open-start replay: H1's V records (rev 7c: m = 1 at the driver's start) fail P-111's EXPECT as m items and
// are void as n items (cycles 3); (6) synthetic cycles-4 replays built from H1's real rows (each run's last open..end
// segment appended once, times shifted; self-test only, never scored): V's (open start, 7 tweens) and C's (8 tweens)
// both cut to exactly O1 C1 O2 C2 O3 C3 from m = 0 with no void, V's counted O1 / C1 = its original O1 / C2, C's =
// its original O2 / C2, the drive mark starts at the cut; (7) the void rules: no close, two opens before the first
// close, driver and probe cuts apart; (8) a block mixing m and n items is refused; (9) hold.sh runs n items with
// --cycles 4, refuses m items, runs wda check before a G hold; (10) VALID refused on a failed item (hold.sh: non-zero
// exit or no run file -> ITEM VOID, a failed counted item -> HOLD VOID before the VALID line; scorer: no record, an
// empty record, zero moving frames in an n record after the cut or in a G record's part window; needs P-111's gMC1);
// (11) mgmt-ops-10's A2 re-check: the synthetic cycles-4 records scored untrimmed void; hold.sh run for real in a temp
// stub checkout (stub iphone/lock/lan/gate/serve/pmcheck, no device): VALID clean, an earlier run file moved aside and
// a re-run item without a new file void (exit 6), a G item exiting 1 voids the hold, an m item stops it before any run.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pin, P111, V9, mapItem, scoreV9, loadEntries, GATED, S, trimM } from './score.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const R = join(root, 'out/p111/runs'), ref = join(root, 'out/p111/score.json');
if (!existsSync(R) || !existsSync(ref)) { console.log('SELFTEST NO DATA (out/p111/runs or out/p111/score.json missing)'); process.exit(2); }
let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.log(`SELFTEST FAIL ${name}: ${e.message}`); process.exit(1); } };
const f = (x) => `${x}:${join(R, `p111-${x}.json`)}`;
const sc = (h) => `sC:${join(R, `p111-sC-${h}.json`)}`;
// P-111's block order for these legs (H3, H4 = M; H7 = G part M; H8 = G part E; each G hold opens and closes with sC)
const pairs = [
  ...['mC1', 'mV2', 'mV3', 'mC4', 'mC5', 'mV6', 'mV7', 'mC8'].map(f),
  sc('H7'), ...['gMC1', 'gMV1', 'gMV2', 'gMC2', 'gMC3', 'gMV3'].map(f), sc('H7'),
  sc('H8'), ...['gEC1', 'gEV1', 'gEV2', 'gEC2', 'gEC3', 'gEV3'].map(f), sc('H8'),
];
const want = JSON.parse(readFileSync(ref, 'utf8'));

pin(P111);
const p = scoreV9(loadEntries(pairs));
for (const k of GATED) check(`P-111 ${k} reproduced`, () => assert.deepEqual(p.gates[k], want.gates[k]));
check('only the four v9 gates', () => assert.deepEqual(Object.keys(p.gates), GATED));
check('verdict from the four gates', () => {
  const vs = GATED.map((k) => want.gates[k].verdict);
  const exp = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  assert.equal(p.verdict, exp);
});
check('no run void under P-111 pins beyond P-111 itself', () => {
  const mine = Object.fromEntries(p.runs.filter((r) => r.item !== 'sC').map((r) => [r.item, r.void.length > 0]));
  const theirs = Object.fromEntries(want.runs.filter((r) => mine[r.item] !== undefined).map((r) => [r.item, r.void.length > 0]));
  assert.deepEqual(mine, theirs);
});

pin(V9);
check('re-pinned EXPECT is v9', () => { assert.equal(S.EXPECT.V.js, V9.V.js); assert.equal(S.EXPECT.C.css, V9.C.css); });
const v = scoreV9(loadEntries(pairs));
check('v7 record on C is void under v9 pins', () => assert.ok(v.runs.find((r) => r.item === 'mC1').void.some((x) => /served not arm C/.test(x))));
check('v8 record on V is void under v9 pins', () => assert.ok(v.runs.find((r) => r.item === 'mV2').void.some((x) => /served not arm V/.test(x))));
check('v9 pins leave every M gate insufficient on P-111 data', () => { assert.match(v.gates.Mmoving.verdict, /^insufficient/); assert.equal(v.verdict, 'insufficient'); });

check('sCo/sCc map to sC', () => { assert.equal(mapItem('sCo'), 'sC'); assert.equal(mapItem('sCc'), 'sC'); });
check('warm-ups skipped', () => { for (const w of ['wC', 'wV', 'wgMC', 'wgMV', 'wgEC', 'wgEV']) assert.equal(mapItem(w), null); });
check('counted items kept', () => { for (const w of ['mC1', 'mV6', 'gMC3', 'gEV2']) assert.equal(mapItem(w), w); });
check('unknown items refused', () => { for (const w of ['C1', 'gHC1', 'gFV2', 'wgHC', 'x', 'nX1', 'n1']) assert.throws(() => mapItem(w)); });
check('A2 n items map to P-111 M items', () => { assert.equal(mapItem('nC1'), 'mC1'); assert.equal(mapItem('nV6'), 'mV6'); });

// ---- Amendment A2 (H1's records, gitignored; written after H1) ----
const H1 = join(root, 'out/pv9/runs');
const h1 = (x) => join(H1, `pv9-${x}.json`);
if (!['mC1', 'mV2', 'mV3', 'mC4'].every((x) => existsSync(h1(x)))) { console.log('SELFTEST NO DATA (H1 M records out/pv9/runs/pv9-m*.json missing)'); process.exit(2); }
const load = (x) => JSON.parse(readFileSync(h1(x), 'utf8'));
const entry = (item, j) => ({ item, file: '(synthetic)', j, checkLog: null });
const run = (item, j) => scoreV9([entry(item, j)]).runs[0];
const TW = ['O1', 'C1', 'O2', 'C2', 'O3', 'C3'];
// synthetic cycles-4 replay: append one copy of the run's last open..end segment (driver rows; probe frames in the
// drive window, later probe frames shifted after it; the probe tween list's last two entries), params.cycles 4
function extend(j0) {
  const j = structuredClone(j0), D = j.driverResult.driver.frames;
  let qo = -1; for (let q = 1; q < D.length; q++) if (D[q - 1][3] <= 0.001 && D[q][3] > 0.001) qo = q;
  const sh = D.at(-1)[0] - D[qo - 1][0];
  D.push(...D.slice(qo).map((r) => [r[0] + sh, r[1], r[2], r[3]]));
  const F = j.frames, mk = j.marks.drive;
  const idx = F.map((f, i) => i).filter((i) => F[i][1] !== null && F[i][0] >= mk[0] && F[i][0] <= mk[1]);
  let po = -1; for (let k = 1; k < idx.length; k++) if ((F[idx[k - 1]][5] ?? 0) <= 0.001 && (F[idx[k]][5] ?? 0) > 0.001) po = k;
  const last = idx.at(-1), shF = F[last][0] - F[idx[po - 1]][0];
  const seg = idx.slice(po).map((i) => { const r = [...F[i]]; r[0] += shF; return r; });
  for (let i = last + 1; i < F.length; i++) F[i][0] += shF;
  F.splice(last + 1, 0, ...seg);
  j.marks.drive = [mk[0], mk[1] + shF];
  j.summary.tweens.push(...structuredClone(j.summary.tweens.slice(-2)));
  j.meta.params.cycles = 4;
  return j;
}
const orig = (x) => S.driverTweens(load(x).driverResult.driver.frames);
// (5) the open-start replay
for (const x of ['mV2', 'mV3']) {
  check(`${x}: rev 7c open start fails P-111's EXPECT as an m item`, () => assert.ok(run(x, load(x)).void.some((s) => /driver tweens C1,O1,C2,O2,C3, expected O1,C1,O2,C2,O3,C3/.test(s))));
  check(`${x}: void as an n item (cycles 3)`, () => assert.ok(run('n' + x.slice(1), load(x)).void.some((s) => /A2 cycles 3, not 4/.test(s))));
}
// (6) synthetic cycles-4 replays from H1's real rows
for (const [x, opens, firstO, firstC] of [['mV2', 0, 'O1', 'C2'], ['mV3', 0, 'O1', 'C2'], ['mC1', 1, 'O2', 'C2'], ['mC4', 1, 'O2', 'C2']]) {
  const e = extend(load(x)), item = 'n' + x.slice(1), r = run(item, e), o = orig(x);
  check(`${item} synthetic: ${Object.keys(S.driverTweens(e.driverResult.driver.frames)).length} driver tweens before the cut`, () => assert.equal(Object.keys(S.driverTweens(e.driverResult.driver.frames)).length, opens ? 8 : 7));
  check(`${item} synthetic: valid, no void`, () => assert.deepEqual(r.void, []));
  check(`${item} synthetic: 6 counted tweens O1..C3 from m = 0`, () => assert.deepEqual(Object.keys(r.tweens), TW));
  check(`${item} synthetic: cut after the first close (${opens} open before it)`, () => { assert.equal(r.a2.opensBefore, opens); assert.equal(r.a2.droppedTweens, opens + 1); });
  check(`${item} synthetic: counted O1 / C1 = original ${firstO} / ${firstC}`, () => { assert.deepEqual(r.tweens.O1, o[firstO]); assert.deepEqual(r.tweens.C1, o[firstC]); });
  check(`${item} synthetic: drive mark starts at the cut`, () => { const t = trimM(e); assert.equal(t.j.marks.drive[0], t.trim.cutT); assert.ok(t.trim.cutT > e.marks.drive[0]); });
  check(`${item} synthetic: the record itself is not changed`, () => assert.equal(e.meta.params.cycles, 4));
}
// (7) the void rules
check('A2 void: no close', () => { const e = extend(load('mC1')); for (const r of e.driverResult.driver.frames) r[3] = 0; assert.ok(run('nC1', e).void.some((s) => /A2 no close back to m = 0 in the driver rows/.test(s))); });
check('A2 void: two opens before the first close', () => {
  const e = extend(load('mC1')), D = e.driverResult.driver.frames; D[1][3] = 0.5; D[2][3] = 0;
  assert.ok(run('nC1', e).void.some((s) => /A2 2 opens before the first close \(driver\)/.test(s)));
});
check('A2 void: driver and probe cuts apart', () => { const e = extend(load('mC1')); for (const r of e.driverResult.driver.frames) r[0] += 1000; assert.ok(run('nC1', e).void.some((s) => /A2 driver cut .* > 50 ms apart/.test(s))); });
// (8) H1 M data never pooled
check('A2: a block with m and n items is refused', () => assert.throws(() => scoreV9([entry('mC1', load('mC1')), entry('nV2', extend(load('mV2')))]), /never pooled/));
check('A2: G items unaffected (P-111 reproduction above ran through the same scoreV9)', () => assert.equal(mapItem('gMC1'), 'gMC1'));
// (9) hold.sh
const hold = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'hold.sh'), 'utf8');
check('hold.sh: n items run --cycles 4', () => assert.match(hold, /n\[CV\]\[0-9\]\*\) A=.*--run \$\{I#n\?\} --cycles 4"/));
check('hold.sh: m items refused before the gate', () => assert.match(hold, /m\[CV\]\[0-9\]\*\) echo "HOLD \$H VOID item \$I: H1 M items are void under A2/));
check('hold.sh: a failed counted item voids the hold', () => { assert.match(hold, /n\[CV\]\[0-9\]\*\|g\[ME\]\[CV\]\[0-9\]\*\) BAD=/); assert.match(hold, /VOID counted item\(s\) failed/); });
check('hold.sh: a non-zero exit or a missing run file marks the item void', () => assert.match(hold, /if \[ \$r -ne 0 \] \|\| \[ ! -s "\$O\/\$L\.json" \]; then/));
check('hold.sh: VALID only after the failed-item check', () => { const a = hold.indexOf('VOID counted item(s) failed'), b = hold.indexOf('echo "HOLD $H VALID'); assert.ok(a > 0 && b > a); });
check('A2: an n item with no run record is void (P-111\'s "no run record")', () => assert.ok(run('nC1', null).void.includes('no run record')));
check('A2: an empty n record is void', () => assert.ok(run('nC1', {}).void.includes('no run record')));
check('A2: an n item with zero moving frames after the cut is void', () => {
  const e = extend(load('mC1')), cut = trimM(e).trim.cutT;
  for (const f of e.frames) if (f[0] >= cut) f[5] = 0;
  assert.ok(run('nC1', e).void.some((s) => /A2 no data: zero moving frames after the cut/.test(s)));
});
const g = JSON.parse(readFileSync(join(R, 'p111-gMC1.json'), 'utf8'));
check('A2: a real G record keeps its moving frames (no A2 void)', () => assert.ok(!run('gMC1', g).void.some((s) => /A2/.test(s))));
check('A2: a G record with zero moving frames is void', () => {
  const z = structuredClone(g); for (const s of z.run.segments) for (const f of s.frames || []) f[2] = 0;
  assert.ok(run('gMC1', z).void.some((s) => /errors: A2 no data: zero moving frames in part M/.test(s)));
});
check('A2: an empty or missing G record is void', () => { assert.ok(run('gMC1', null).void.length > 0); assert.ok(run('gEV1', {}).void.length > 0); });
check('hold.sh: wda check before a G hold', () => assert.match(hold, /iphone\.mjs wda check/));
// (11) mgmt-ops-10's A2 re-check: (a) the same synthetic cycles-4 records, scored untrimmed (as P-111 m items), void;
// (b) hold.sh run for real in a stub checkout (stubbed iphone/lock/lan/gate/serve/pmcheck; nothing touches a device):
// an earlier hold's run file is moved aside, so a re-run item that exits 0 but writes nothing is void, not scored stale
for (const x of ['mV2', 'mV3', 'mC1', 'mC4'])
  check(`${x} synthetic cycles 4, untrimmed as an m item: void (driver tweens)`, () => assert.ok(run(x, extend(load(x))).void.some((s) => /driver tweens .*expected O1,C1,O2,C2,O3,C3/.test(s))));
{
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const T = mkdtempSync(join(tmpdir(), 'pv9-hold-')), put = (p, s) => { mkdirSync(dirname(join(T, p)), { recursive: true }); writeFileSync(join(T, p), s); };
  const ok = 'process.exit(0)\n';
  put('tools/lan.mjs', 'console.log("http://stub:1/")\n'); put('tools/lock.mjs', ok);
  put('research/phone-thermal-gate/thermal-gate.mjs', ok); put('fixes/rest-script/tools/pmcheck.mjs', ok);
  put('fixes/v9-best/phone/serve.sh', 'exit 0\n'); put('fixes/v9-best/phone/hold.sh', hold);
  for (const a of 'BCV') put(`out/pv9/snap/serve-${a}.json`, '{"port":1}');
  // iphone.mjs stub: run/gesture write --out unless the label is in STUB_NOFILE; exit STUB_EXIT_<label> (default 0)
  put('tools/iphone.mjs', `const a = process.argv.slice(2), v = (k) => a[a.indexOf(k) + 1];
if (a[0] === 'run' || a[0] === 'gesture') { const l = v('--label');
  if (!(process.env.STUB_NOFILE || '').split(',').includes(l)) (await import('node:fs')).writeFileSync(v('--out'), JSON.stringify({ stub: 'new', label: l }));
  process.exit(Number(process.env['STUB_EXIT_' + l.replace(/-/g, '_')] || 0)); }
process.exit(0);
`);
  const O = join(T, 'out/pv9/runs');
  const hs = (env, ...items) => spawnSync('sh', [join(T, 'fixes/v9-best/phone/hold.sh'), ...items], { encoding: 'utf8', env: { ...process.env, TICKET: 'P-TEST', RUNNER: 'stub', ...env } });
  try {
    const a = hs({}, 'H9', 'wC', 'wV', 'nC1', 'nV2');
    check('hold.sh stub: a clean hold is VALID', () => { assert.equal(a.status, 0, a.stdout + a.stderr); assert.match(a.stdout, /HOLD H9 VALID/); });
    const b = hs({ STUB_NOFILE: 'pv9-nC1' }, 'H10', 'wC', 'wV', 'nC1', 'nV2');
    check('hold.sh stub: a re-run item with no new file moves the old one aside', () => assert.match(b.stdout, /MOVED pv9-nC1\.json aside/));
    check('hold.sh stub: ... and is void, never scored stale', () => { assert.match(b.stdout, /ITEM nC1 VOID exit 0, no run file/); assert.match(b.stdout, /HOLD H10 VOID counted item\(s\) failed: nC1/); assert.equal(b.status, 6); });
    check('hold.sh stub: the earlier file is kept as .prev-<hold>-<epoch>', () => assert.ok(readdirSync(O).some((x) => /^pv9-nC1\.json\.prev-H10-\d+$/.test(x))));
    const c = hs({ STUB_EXIT_pv9_gMV1: '1' }, 'H11', 'sCo', 'gMC1', 'gMV1', 'sCc');
    check('hold.sh stub: a counted G item exiting 1 voids the hold (H3a)', () => { assert.match(c.stdout, /ITEM gMV1 VOID exit 1/); assert.equal(c.status, 6); assert.doesNotMatch(c.stdout, /VALID/); });
    const d = hs({}, 'H12', 'wC', 'mC1');
    check('hold.sh stub: an m item ends the hold before anything runs', () => { assert.equal(d.status, 4); assert.doesNotMatch(d.stdout, /^RUN /m); });
  } finally { rmSync(T, { recursive: true, force: true }); }
}
console.log(`SELFTEST OK ${n} checks`);
