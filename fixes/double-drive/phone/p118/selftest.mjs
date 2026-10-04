#!/usr/bin/env node
// P-118 scorer self-test (no P-118 data): node fixes/double-drive/phone/p118/selftest.mjs [--p105 <dir>]
// A copy of P-117's self-test (fixes/v8-best/phone/p117/selftest.mjs) with P-118's arms, plus V's own CSS: a V JS with
// C's CSS (or P-117's V) is refused in both the S and the G served check.
// 1. Items and the served checks (S: meta.served against P-118's arms; G: the check log's B / C / V hashes) (synthetic).
// 2. A synthetic block through P-105's scoreS / scoreG / applySentinel / gate / clusters (unchanged): no-worse, WORSE,
//    NEW CLUSTER, voids, the sentinel chain, insufficient, the > 100 ms report.
// 3. The card's check on P-105's own records (iphone-runner's out/p105/runs; default <dir> out/p105/runs, a copy; input
//    sha256s printed): the S leg (H1r wC wV C1 V2 V3 C4, H2 C5 V6 V7 C8) and G part M (H5 sC-H5-open as sCo, gMC1 gMV1
//    gMV2 gMC2 gMC3 gMV3, sC-H5 as sCc), with C = P-105's C (v6) and V = P-105's V (v7). It must give P-105's S gate
//    (d -1 at > 50) and GM gate (d 0, no new cluster), the same gate objects as P-105's scorer run directly on those
//    items, and the deltas P-105's committed result shows (S -1 / +0.5 / -0.5, GM 0 / +1 / 0 at > 50 / > 46 / > 54).
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S, P118, mapItem, checkOk, scoreP118 } from './score.mjs';
let bad = 0;
const t = (name, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}`); if (!pass) bad++; };
const throws = (f) => { try { f(); return false; } catch { return true; } };
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSSP = '/_app/immutable/assets/2.gBuqKVzi.css';

// 1. units
t('warm-ups wC wV wgC wgV skipped', ['wC', 'wV', 'wgC', 'wgV'].every((x) => mapItem(x).warmup));
t('sCo / sCc: S sentinels on C, uncounted', ['sCo', 'sCc'].every((x) => mapItem(x).sentinelOnly && mapItem(x).arm === 'C' && mapItem(x).kind === 'S'));
t('C1 / V6 counted S; gMC1 / gMV3 counted G part M', mapItem('C1').kind === 'S' && mapItem('V6').arm === 'V' && mapItem('gMC1').part === 'M' && mapItem('gMV3').run === 3);
t('gHC1, gFV1, sC, mC1, X1 refused', ['gHC1', 'gFV1', 'sC', 'mC1', 'X1'].every((x) => throws(() => mapItem(x))));
const LOG = 'B pid 1 port 2 served JS 4606120cf392 CSS 27776f3d4138 ok\nC pid 1 port 3 served JS 3e3e94cb6e9f CSS f836404b3728 ok\nV pid 1 port 4 served JS 3076c5a8c9a3 CSS 2f7197880ffd ok\n';
t('G served check: B C V with P-118 hashes passes', checkOk(LOG) === true);
t('G served check: V serving P-117\'s V (e8d8323f674b / f836404b3728) fails', checkOk(LOG.replace('JS 3076c5a8c9a3 CSS 2f7197880ffd', 'JS e8d8323f674b CSS f836404b3728')) === false);
t('G served check: V\'s JS with C\'s CSS fails (V has its own CSS)', checkOk(LOG.replace('CSS 2f7197880ffd', 'CSS f836404b3728')) === false);
t('G served check: C\'s JS with V\'s CSS on the V line fails', checkOk(LOG.replace('JS 3076c5a8c9a3', 'JS 3e3e94cb6e9f')) === false);
t('G served check: V\'s CSS on the C line fails', checkOk(LOG.replace('JS 3e3e94cb6e9f CSS f836404b3728', 'JS 3e3e94cb6e9f CSS 2f7197880ffd')) === false);
t('G served check: a missing B line fails', checkOk(LOG.split('\n').filter((l) => !l.startsWith('B')).join('\n')) === false);
t('G served check: WRONG fails; no log is null', checkOk(LOG + 'X WRONG\n') === false && checkOk(null) === null);

// 2. synthetic block
const SV = (arm) => ({ [NODE]: P118.expect[arm].js.slice(0, 16), [CSSP]: P118.expect[arm].css.slice(0, 16) });
const Srec = (arm, slow, { pass = true, served = SV(arm), dt = 60 } = {}) => {
  const frames = []; let tt = 1000;
  for (let i = 0; i < 400; i++) { const d = i < slow ? dt : 16; tt += d; frames.push([tt, d, i * 20]); }
  return { meta: { schema: 'fw-iphone-run/1', driver: 'S', served, sentinel: arm === 'C' ? { pass } : null, mac: { start: { load1: 3.5 }, end: { load1: 4 } } }, marks: { idle: [1000], bottom: [tt + 1] }, frames };
};
const G = (slow, { dt = 60, y0 = 0 } = {}) => {
  const frames = []; let tt = 0, y = y0;
  frames.push([tt, 16, y, 775]);
  for (let i = 0; i < 300; i++) { const d = i < slow ? dt : 16; tt += d; y += 7; frames.push([tt, d, y, 775]); }
  return { run: { segments: [{ marks: [[1, 'mid1'], [tt + 1, 'end']], frames }], errors: [], aborted: null } };
};
const block = (sc, sv, gc, gv, edit = (e) => e) => [
  { item: 'wC', j: Srec('C', 9) }, { item: 'wV', j: Srec('V', 9) },
  ...['C1', 'V2', 'V3', 'C4', 'C5', 'V6', 'V7', 'C8'].map((it) => { const a = it[0], k = +it.slice(1); const idx = { C1: 0, C4: 1, C5: 2, C8: 3, V2: 0, V3: 1, V6: 2, V7: 3 }[it]; return { item: it, j: Srec(a, (a === 'C' ? sc : sv)[idx]), k }; }),
  { item: 'sCo', j: Srec('C', 0) }, { item: 'wgC', j: G(5) }, { item: 'wgV', j: G(5) },
  ...['gMC1', 'gMV1', 'gMV2', 'gMC2', 'gMC3', 'gMV3'].map((it) => { const a = it[2], n = +it[3]; return { item: it, j: (a === 'C' ? gc : gv)[n - 1], checkLog: LOG }; }),
  { item: 'sCc', j: Srec('C', 0) },
].map(edit);
const flat = (n) => [G(n), G(n), G(n)];
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 3, 3, 4], flat(1), flat(2)));
  t(`synthetic: S d +1, GM d +1, no new cluster -> no-worse (got S ${o.gates.S.delta?.gt50}, GM ${o.gates.GM.delta?.gt50}, ${o.verdict})`, o.gates.S.delta.gt50 === 1 && o.gates.GM.delta.gt50 === 1 && o.verdict === 'no-worse');
  t('synthetic: warm-ups skipped; 4 + 4 S and 3 + 3 GM valid', o.skipped.join() === 'wC,wV,wgC,wgV' && o.gates.S.nC === 4 && o.gates.S.nV === 4 && o.gates.GM.nC === 3 && o.gates.GM.nV === 3);
  t('synthetic: load1 kept per item', o.loads.find((l) => l.item === 'C1').start === 3.5);
}
{
  const o = scoreP118(block([2, 2, 2, 2], [5, 5, 5, 5], flat(1), flat(1)));
  t(`synthetic: S d +3 -> WORSE (got ${o.gates.S.verdict}, ${o.verdict})`, o.gates.S.verdict.startsWith('WORSE') && o.verdict === 'WORSE');
}
{
  // V's slow frames at scrollY 2000-2249 (bin 8) in all three V runs; C's slow frames at bins 0 only: a new cluster
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), [G(1, { y0: 2000 }), G(1, { y0: 2000 }), G(1, { y0: 2000 })]));
  t(`synthetic: GM d 0 but a NEW CLUSTER -> WORSE (got ${o.gates.GM.verdict})`, /^NEW CLUSTER at 2000-2249/.test(o.gates.GM.verdict) && o.verdict === 'WORSE');
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'V3' ? { ...e, j: Srec('V', 2, { served: { [NODE]: 'e8d8323f674b', [CSSP]: 'f836404b3728' } }) } : e)));
  const r = o.runs.find((x) => x.item === 'V3');
  t(`synthetic: an S run serving another V voids it (${r.void.join('; ')}), S V n 3`, /^served not arm V/.test(r.void[0]) && o.gates.S.nV === 3);
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'V7' ? { ...e, j: Srec('V', 2, { served: { [NODE]: SV('V')[NODE], [CSSP]: SV('C')[CSSP] } }) } : e)));
  const r = o.runs.find((x) => x.item === 'V7');
  t(`synthetic: an S run serving V's JS with C's CSS voids it (${r.void.join('; ')})`, /^served not arm V/.test(r.void[0]) && o.gates.S.nV === 3);
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'V2' ? { ...e, j: Srec('V', 2, { served: SV('C') }) } : e)));
  t('synthetic: an S run serving C for V voids it', o.runs.find((x) => x.item === 'V2').void.length === 1 && o.gates.S.nV === 3);
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'gMV2' ? { ...e, checkLog: LOG.replace('3076c5a8c9a3', '4c48e372ecdd') } : e.item === 'gMC2' ? { ...e, checkLog: null } : e)));
  const v = o.runs.find((x) => x.item === 'gMV2'), c = o.runs.find((x) => x.item === 'gMC2');
  t(`synthetic: a check log with V's hash wrong voids that run (${v.void.join('; ')}); no log voids (${c.void.join('; ')}) -> GM insufficient`,
    v.void.includes('served check not ok') && c.void.includes('no served check log') && /^insufficient/.test(o.gates.GM.verdict) && o.verdict === 'insufficient');
}
{
  // C5 (a counted C S run, so a sentinel) fails: it voids itself and the runs since C4, the last passing one (none)
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'C5' ? { ...e, j: Srec('C', 2, { pass: false }) } : e)));
  t(`synthetic: a failing counted C S sentinel voids itself (C n ${o.gates.S.nC})`, o.gates.S.nC === 3 && o.runs.find((x) => x.item === 'C5').void.includes('sentinel failed'));
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], flat(1), flat(1), (e) => (e.item === 'sCc' ? { ...e, j: Srec('C', 0, { pass: false }) } : e)));
  t(`synthetic: a failing closing sentinel voids every G run since sCo -> insufficient (got ${o.gates.GM.verdict})`, /^insufficient \(C 0, V 0/.test(o.gates.GM.verdict) && o.verdict === 'insufficient');
}
{
  const o = scoreP118(block([2, 2, 2, 2], [2, 2, 2, 2], [G(3, { dt: 120 }), G(1), G(1)], flat(1), (e) => (e.item === 'V6' ? { ...e, j: Srec('V', 2, { dt: 130 }) } : e)));
  const g = o.perRun.find((p) => p.item === 'gMC1'), s = o.perRun.find((p) => p.item === 'V6');
  t(`synthetic: > 100 ms frames and the largest dt reported (gMC1 ${g.over100.length} max ${g.maxDt}; V6 ${s.over100.length} max ${s.maxDt})`, g.over100.length === 3 && g.maxDt === 120 && s.over100.length === 2 && s.maxDt === 130);
}

// 3. P-105's own records
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ai = process.argv.indexOf('--p105'); const R = ai > 0 ? process.argv[ai + 1] : join(WT, 'out/p105/runs');
const ITEMS = [['wC', 'p105-wC-H1r.json'], ['wV', 'p105-wV-H1r.json'], ['C1'], ['V2'], ['V3'], ['C4'], ['C5'], ['V6'], ['V7'], ['C8'],
  ['sCo', 'p105-sC-H5-open.json'], ['gMC1'], ['gMV1'], ['gMV2'], ['gMC2'], ['gMC3'], ['gMV3'], ['sCc', 'p105-sC-H5.json']];
const fileOf = ([item, f]) => f ?? `p105-${item}.json`;
const logOf = ([item]) => (item.startsWith('gM') ? `p105-H5-check-${item}.log` : null);
if (!ITEMS.every((e) => existsSync(join(R, fileOf(e))))) t(`P-105 records in ${R} (copy them from iphone-runner's out/p105/runs)`, false);
else {
  const rd = (f) => readFileSync(join(R, f), 'utf8');
  for (const e of ITEMS) for (const f of [fileOf(e), logOf(e)].filter(Boolean)) console.log(`     input ${f} ${createHash('sha256').update(rd(f)).digest('hex').slice(0, 12)}`);
  const cfg = { expect: { C: { js: '8018ce062d30', css: '71b65c667720' }, V: { js: '8c90da217745', css: '308f0da70c3a' } }, check: P118.check };
  const ent = ITEMS.map((e) => ({ item: e[0], j: JSON.parse(rd(fileOf(e))), checkLog: logOf(e) ? rd(logOf(e)) : null }));
  const mine = scoreP118(ent, cfg);
  const s = mine.gates.S, g = mine.gates.GM;
  t(`P-105 data: S n 4 + 4, GM n 3 + 3, every run valid (got ${s.nC}+${s.nV}, ${g.nC}+${g.nV})`, s.nC === 4 && s.nV === 4 && g.nC === 3 && g.nV === 3 && mine.perRun.every((p) => p.valid));
  t(`P-105 data: S gate d -1 at > 50, no-worse (got ${JSON.stringify(s.delta)})`, s.delta.gt50 === -1 && s.delta.gt46 === 0.5 && s.delta.gt54 === -0.5 && s.verdict === 'no-worse');
  t(`P-105 data: GM gate d 0 at > 50, no new cluster, no-worse (got ${JSON.stringify(g.delta)}, new ${JSON.stringify(g.cluster?.newClusters)})`, g.delta.gt50 === 0 && g.delta.gt46 === 1 && g.delta.gt54 === 0 && g.cluster.newClusters.length === 0 && g.verdict === 'no-worse');
  const direct = S.scoreBlock(ent.filter((e) => !/^wg/.test(e.item)).map((e) => ({ ...e, item: /^sC[oc]$/.test(e.item) ? 'sC' : e.item })));
  t(`P-105 data: the same S gate as P-105's scorer run directly (${JSON.stringify(direct.gates.S)})`, JSON.stringify(direct.gates.S) === JSON.stringify(s));
  const strip = ({ clusterTwins, ...x }) => x;
  t(`P-105 data: the same GM gate as P-105's scorer run directly (${JSON.stringify(direct.gates.GM)})`, JSON.stringify(direct.gates.GM) === JSON.stringify(strip(g)));
  t(`P-105 data: block no-worse (got ${mine.verdict}${mine.thresholdSensitive ? ', threshold-sensitive' : ''}; GM new clusters at > 46 / > 54 ${JSON.stringify(g.clusterTwins)})`, mine.verdict === 'no-worse');
}
console.log(bad ? `${bad} FAILED` : 'all OK');
process.exit(bad ? 1 : 0);
