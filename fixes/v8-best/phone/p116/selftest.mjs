#!/usr/bin/env node
// P-116 scorer self-test (no P-116 data): node fixes/v8-best/phone/p116/selftest.mjs [--p105 <dir>]
// 1. Items, served check, classes and block verdicts (synthetic). 2. A synthetic block through scoreG / applySentinel /
//    gate (P-105's, unchanged): COUNTDOWN, voids (no check log, failing sentinel), insufficient. 3. The ticket's check on
//    P-105's own G part H records (iphone-runner's out/p105/runs, H4: sC-H4-open, gHC1 gHV1 gHV2 gHC2 gHC3 gHV3, sC-H4;
//    default <dir> out/p105/runs, a copy; the input sha256s are printed): with C = P-105's C (v6) and X = P-105's V (v7)
//    the scorer must give d = +3 at > 50, +3 at > 46 and +1 at > 54, the same deltas as P-105's own scorer on those items.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S, P116, mapItem, checkOk, classify, blockVerdict, scoreP116 } from './score.mjs';
let bad = 0;
const t = (name, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}`); if (!pass) bad++; };
const throws = (f) => { try { f(); return false; } catch { return true; } };

// 1. units
t('warm-ups wgC wgX wgY skipped', ['wgC', 'wgX', 'wgY'].every((x) => mapItem(x).warmup));
t('sCo / sCc are sentinels on C', ['sCo', 'sCc'].every((x) => mapItem(x).sentinel && mapItem(x).arm === 'C'));
t('gHC1 / gHX4 / gHY2 kept with arm and run', mapItem('gHC1').arm === 'C' && mapItem('gHX4').run === 4 && mapItem('gHY2').arm === 'Y');
t('gHV1, mC1, C1, gFC1, sC refused', ['gHV1', 'mC1', 'C1', 'gFC1', 'sC'].every((x) => throws(() => mapItem(x))));
const LOG = 'B pid 1 port 2 served JS 4606120cf392 CSS 27776f3d4138 ok\nC pid 1 port 3 served JS 3e3e94cb6e9f CSS f836404b3728 ok\nX pid 1 port 4 served JS 65d72981246f CSS 4c9a9b4fc7bf ok\nY pid 1 port 5 served JS 528c09e97de6 CSS f836404b3728 ok\n';
t('served check: B C X Y ok passes', checkOk(LOG) === true);
t('served check: a missing Y line fails', checkOk(LOG.split('\n').filter((l) => !l.startsWith('Y')).join('\n')) === false);
t('served check: WRONG fails', checkOk(LOG.replace(/X (.*) ok/, 'X $1 WRONG')) === false);
t('served check: no log is null', checkOk(null) === null);
t('classes: -3 / -2.5 CAUSE; -2 / -1.5 / -1 PART; -0.5 / 0 / +3 NOT THE CAUSE',
  classify(-3) === 'CAUSE' && classify(-2.5) === 'CAUSE' && classify(-2) === 'PART' && classify(-1.5) === 'PART' && classify(-1) === 'PART' &&
  ['-0.5', '0', '3'].every((d) => classify(+d) === 'NOT THE CAUSE'));
const BV = [['CAUSE', 'CAUSE', 'BOTH'], ['CAUSE', 'NOT THE CAUSE', 'COUNTDOWN'], ['CAUSE', 'PART', 'COUNTDOWN'], ['NOT THE CAUSE', 'CAUSE', 'REST'],
  ['PART', 'CAUSE', 'REST'], ['PART', 'PART', 'SPLIT'], ['PART', 'NOT THE CAUSE', 'NOT LOCATED'], ['NOT THE CAUSE', 'NOT THE CAUSE', 'NOT LOCATED']];
t('block verdicts (BOTH / COUNTDOWN / REST / SPLIT / NOT LOCATED)', BV.every(([x, y, v]) => blockVerdict(x, y) === v));

// 2. synthetic block: a G record with `slow` frames of 60 ms among 16 ms frames, every frame moving
const G = (slow, dt = 60) => {
  const frames = []; let tt = 0, y = 0;
  frames.push([tt, 16, y, 775]);
  for (let i = 0; i < 300; i++) { const d = i < slow ? dt : 16; tt += d; y += 7; frames.push([tt, d, y, 775]); }
  return { run: { segments: [{ marks: [[1, 'down1'], [tt + 1, 'end']], frames }], errors: [], aborted: null } };
};
const SEN = (pass) => ({ meta: { schema: 'fw-iphone-run/1', driver: 'S', served: { '/_app/immutable/nodes/2.DyWL8TcE.js': '3e3e94cb6e9f4bab', '/_app/immutable/assets/2.gBuqKVzi.css': 'f836404b3728' }, sentinel: { pass } } });
const block = (c, x, y, over = {}) => [
  { item: 'sCo', j: SEN(true) }, { item: 'wgC', j: G(9) }, { item: 'wgX', j: G(9) }, { item: 'wgY', j: G(9) },
  ...[1, 2, 3, 4].flatMap((n, i) => [{ item: `gHC${n}`, j: G(c[i]), checkLog: LOG }, { item: `gHX${n}`, j: G(x[i]), checkLog: LOG }, { item: `gHY${n}`, j: G(y[i]), checkLog: LOG }]),
  { item: 'sCc', j: SEN(over.endSentinel ?? true) },
].map((e) => (over.noLog === e.item ? { ...e, checkLog: null } : e));
{
  const o = scoreP116(block([8, 8, 9, 7], [5, 5, 6, 4], [7, 7, 8, 6]));
  t(`synthetic: X d -3 CAUSE, Y d -1 PART -> COUNTDOWN (got X ${o.removal.X.delta?.gt50} ${o.removal.X.verdict}, Y ${o.removal.Y.delta?.gt50} ${o.removal.Y.verdict}, ${o.verdict})`,
    o.removal.X.delta.gt50 === -3 && o.removal.X.verdict === 'CAUSE' && o.removal.Y.delta.gt50 === -1 && o.removal.Y.verdict === 'PART' && o.verdict === 'COUNTDOWN');
  t('synthetic: warm-ups skipped, 4 valid runs per arm', o.skipped.join() === 'wgC,wgX,wgY' && ['C', 'X', 'Y'].every((a) => o.arms[a].n === 4));
  t('synthetic: per-run report (60 ms max, > 50 per 100 moving frames)', o.perRun[0].maxDt === 60 && o.perRun[0].gt50per100 === Math.round(1000 * 8 / 300) / 10);
}
{
  const o = scoreP116(block([8, 8, 8, 8], [8, 8, 8, 8], [5, 5, 5, 5]));
  t(`synthetic: X d 0, Y d -3 -> REST (got ${o.verdict})`, o.verdict === 'REST' && o.removal.X.verdict === 'NOT THE CAUSE');
}
{
  const o = scoreP116(block([8, 8, 8, 8], [7, 6, 7, 6], [7, 6, 7, 6]));
  t(`synthetic: X and Y d -1.5 -> SPLIT (got ${o.verdict})`, o.verdict === 'SPLIT');
}
{
  const o = scoreP116(block([8, 8, 8, 8], [8, 8, 8, 8], [8, 8, 8, 8], { noLog: 'gHX2' }));
  const r = o.runs.find((x) => x.item === 'gHX2');
  t(`synthetic: no served check log voids that run (${r.void.join('; ')}), X n 3`, r.void.includes('no served check log') && o.arms.X.n === 3);
}
{
  const bl = block([8, 8, 8, 8], [8, 8, 8, 8], [8, 8, 8, 8]); bl.find((e) => e.item === 'gHY3').checkLog = LOG.replace(/Y (.*) ok/, 'Y $1 WRONG');
  const r = scoreP116(bl).runs.find((x) => x.item === 'gHY3');
  t(`synthetic: a WRONG served line voids that run (${r.void.join('; ')})`, r.void.includes('served check not ok'));
}
{
  const o = scoreP116(block([8, 8, 8, 8], [5, 5, 5, 5], [8, 8, 8, 8], { endSentinel: false }));
  t(`synthetic: a failing closing sentinel voids every run since the opening one -> insufficient (got ${o.verdict})`, o.verdict === 'insufficient' && o.arms.C.n === 0);
}
{
  const o = scoreP116(block([8, 8, 8, 8], [8, 8, 8, 8], [8, 8, 8, 8]).map((e) => (e.item === 'gHC2' ? { ...e, j: G(8, 110) } : e)));
  t(`synthetic: frames > 100 ms counted per arm (C ${o.arms.C.over100.length} in ${o.arms.C.over100Runs} run)`, o.arms.C.over100.length === 8 && o.arms.C.over100Runs === 1 && o.arms.X.over100.length === 0);
}

// 3. P-105's own G part H records
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ai = process.argv.indexOf('--p105'); const R = ai > 0 ? process.argv[ai + 1] : join(WT, 'out/p105/runs');
const H4 = [['sCo', 'p105-sC-H4-open.json'], ['gHC1'], ['gHX1', 'p105-gHV1.json'], ['gHX2', 'p105-gHV2.json'], ['gHC2'], ['gHC3'], ['gHX3', 'p105-gHV3.json'], ['sCc', 'p105-sC-H4.json']];
const fileOf = ([item, f]) => f ?? `p105-${item}.json`;
const logOf = ([item, f]) => (item.startsWith('gH') ? `p105-H4-check-${f ? f.slice(5, -5) : item}.log` : null);
if (!H4.every((e) => existsSync(join(R, fileOf(e))))) t(`P-105 records in ${R} (copy them from iphone-runner's out/p105/runs)`, false);
else {
  const rd = (f) => readFileSync(join(R, f), 'utf8');
  for (const e of H4) for (const f of [fileOf(e), logOf(e)].filter(Boolean)) console.log(`     input ${f} ${createHash('sha256').update(rd(f)).digest('hex').slice(0, 12)}`);
  const cfg = { ...P116, checkArms: ['B', 'C', 'V'], expect: { C: { js: '8018ce062d30', css: '71b65c667720' }, X: { js: '8c90da217745', css: '308f0da70c3a' }, Y: P116.expect.Y } };
  const mine = scoreP116(H4.map((e) => ({ item: e[0], j: JSON.parse(rd(fileOf(e))), checkLog: logOf(e) ? rd(logOf(e)) : null })), cfg);
  const d = mine.removal.X.delta || {};
  t(`P-105 data: C n 3, X (= P-105's V) n 3, sentinels pass (got ${mine.arms.C.n} / ${mine.arms.X.n})`, mine.arms.C.n === 3 && mine.arms.X.n === 3);
  t(`P-105 data: d +3 at > 50, +3 at > 46, +1 at > 54 (got ${d.gt50} / ${d.gt46} / ${d.gt54}; per run C ${mine.arms.C.gt50} X ${mine.arms.X.gt50})`, d.gt50 === 3 && d.gt46 === 3 && d.gt54 === 1);
  const direct = S.scoreBlock(H4.map((e) => ({ item: e[0].startsWith('sC') ? 'sC' : e[0].replace('X', 'V'), j: JSON.parse(rd(fileOf(e))), checkLog: logOf(e) ? rd(logOf(e)) : null })));
  t(`P-105 data: the same deltas as P-105's scorer run directly (GH ${JSON.stringify(direct.gates.GH.delta)})`, JSON.stringify(direct.gates.GH.delta) === JSON.stringify(d));
  t('P-105 data: X classed NOT THE CAUSE (d > -1), block insufficient (no Y runs)', mine.removal.X.verdict === 'NOT THE CAUSE' && mine.verdict === 'insufficient');
}
console.log(bad ? `${bad} FAILED` : 'all OK');
process.exit(bad ? 1 : 0);
