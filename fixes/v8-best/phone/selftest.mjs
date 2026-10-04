#!/usr/bin/env node
// selftest.mjs: P-111 scorer checks on synthetic records (no phone data, no out/ files). Adapted from iphone-runner's
// P-105 selftest (fixes/v7-best/phone/selftest.mjs at b9c7d1eb), with credit. Run before the pre-data read:
//   node fixes/v8-best/phone/selftest.mjs        -> "SELFTEST OK <n> checks" (exit 0) or the first failure (exit 1)
import assert from 'node:assert/strict';
import { parseItem, scoreBlock, clusters, gate, median, driverTweens } from './score.mjs';

const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const SERVED = { C: { [NODE]: '8c90da2177455718', [CSS]: '308f0da70c3a64b0' }, V: { [NODE]: '3e3e94cb6e9f4bab', [CSS]: 'f836404b37286ca6' } };
const OKLOG = 'B pid 1 port 1 served JS 4606120cf392 CSS 27776f3d4138 ok\nC pid 2 port 2 served JS 8c90da217745 CSS 308f0da70c3a ok\nV pid 3 port 3 served JS 3e3e94cb6e9f CSS f836404b3728 ok\n';
let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.log(`SELFTEST FAIL ${name}: ${e.message}`); process.exit(1); } };
const meta = (arm, driver, { pass = true, served = SERVED[arm], lpm = false, error = null } = {}) =>
  ({ schema: 'fw-iphone-run/1', driver, served, settings: { lowPowerMode: lpm }, error, sentinel: { pass }, battery: { start: { temperatureC: 40 } }, params: { cycles: 3 } });

// W record: idle 0-8000 at y 0, scroll 8000-14000 (y 0 -> 2700), hold 14000-20000 at 2700, sentinel 20000-23000.
// `top` slow frames at y 100 in the idle part, `rest` slow frames in the hold, `late` slow frames in the steps past y 1000.
function W(arm, { top = [], rest = [], late = [], noMarks = false, ...o } = {}) {
  const frames = []; let t = 0;
  while (t < 23000) { t += 16.7; const y = t < 8000 ? 0 : t < 14000 ? Math.round((t - 8000) * 0.45) : t < 20000 ? 2700 : 6000; frames.push([t, 16.7, y, y]); }
  top.forEach((dt, i) => frames.push([1000 + i * 300, dt, 0, 0]));
  rest.forEach((dt, i) => frames.push([15000 + i * 300, dt, 2700, 2700]));
  late.forEach((dt, i) => frames.push([12000 + i * 100, dt, 1800, 1800]));
  frames.sort((a, b) => a[0] - b[0]);
  return { meta: meta(arm, 'W', o), marks: noMarks ? {} : { idle: [0, 8000], scroll: [8000, 14000], hold: [14000, 20000], sentinel: [20000, 23000] }, frames, driverResult: { yHold: 2700 } };
}
// M record: drive 0-12000, 3 cycles of open (m 0 -> 1 over 10 frames) then close; probe rows [t, dt, y0, y1, ih, m];
// driver rows [t, dt, y, m]. `slow` = dt of the probe's first moving frame per tween; `f1` = the driver's O1 start dt.
function M(arm, { slow = 16.7, f1 = 16.7, p95 = 17, dropTween = false, ...o } = {}) {
  const pr = [], dr = []; let t = 0, m = 0;
  const push = (mm, dt = 16.7, dd = dt) => { t += dt; pr.push([t, dt, 5000, 5000, 815, mm]); dr.push([t, dd, 5000, mm]); };
  for (let k = 0; k < 20; k++) push(0);
  for (let c = 0; c < 3; c++) {
    for (let i = 1; i <= 10; i++) { m = i / 10; push(m, i === 1 ? slow : 16.7, i === 1 && c === 0 ? f1 : 16.7); }
    for (let k = 0; k < 60; k++) push(1);
    if (dropTween && c === 2) break;
    for (let i = 9; i >= 0; i--) { m = i / 10; push(m, i === 9 ? slow : 16.7); }
    for (let k = 0; k < 60; k++) push(0);
  }
  const tw = dropTween ? 5 : 6;
  return { meta: meta(arm, 'M', o), marks: { drive: [0, t + 1] }, frames: pr, summary: { tweens: Array(tw).fill(0) }, driverResult: { driver: { frames: dr, atOne: { p95 } } } };
}
const S = (arm, o = {}) => ({ meta: meta(arm, 'S', o), marks: {}, frames: [] });
// G record (P-105's): one segment with marks <start> and end; moving frames 12.5 ms apart, y += 40 each
const START = { F: 'fresh-flick', H: 'down1', M: 'mid1', E: 'into1' };
function G(part, { slowAt = [], dt = 12.5, aborted = null, errors = [], noEnd = false } = {}) {
  const frames = [[0, null, 0, 815]]; let t = 0, y = 0;
  while (y < 5000) { t += dt; y += 40; const s = slowAt.find((x) => Math.abs(x.y - y) < 20); frames.push([t, s ? s.dt : dt, y, 815]); if (s) t += s.dt - dt; }
  const marks = [[0, START[part]]]; if (!noEnd) marks.push([t + 1, 'end']);
  return { run: { segments: [{ frames, marks }], aborted, errors } };
}
const e = (item, j, checkLog = OKLOG) => ({ item, j, checkLog });
const ORDER = ['C', 'V', 'V', 'C', 'C', 'V', 'V', 'C'];
const wBlock = (c = [], v = []) => [e('wC', W('C')), e('wV', W('V')), ...ORDER.map((a, i) => e(`${a}${i + 1}`, W(a, (a === 'C' ? c : v)[i] || {})))];
const mBlock = (c = [], v = []) => ORDER.map((a, i) => e(`m${a}${i + 1}`, M(a, (a === 'C' ? c : v)[i] || {})));
const gLeg = (P, cRuns = [{}, {}, {}], vRuns = [{}, {}, {}]) => [e('sC', S('C')), ...cRuns.flatMap((c, i) => [e(`g${P}C${i + 1}`, G(P, c)), e(`g${P}V${i + 1}`, G(P, vRuns[i]))]), e('sC', S('C'))];
const all8 = (o) => Array(8).fill(o);

check('parseItem', () => {
  assert.deepEqual(parseItem('wC'), { kind: 'W', arm: 'C', warmup: true });
  assert.deepEqual(parseItem('V12'), { kind: 'W', arm: 'V', run: 12 });
  assert.deepEqual(parseItem('mC3'), { kind: 'M', arm: 'C', run: 3 });
  assert.deepEqual(parseItem('gMV3'), { kind: 'G', part: 'M', arm: 'V', run: 3 });
  assert.equal(parseItem('sC').sentinelOnly, true);
  assert.throws(() => parseItem('gXC1')); assert.throws(() => parseItem('mB1')); assert.throws(() => parseItem('B1'));
});
check('median', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null); });
check('gate insufficient below 3', () => assert.match(gate([{ gt50: 0 }, { gt50: 0 }], [{ gt50: 0 }, { gt50: 0 }, { gt50: 0 }], 3).verdict, /^insufficient/));

check('W equal arms: no-worse in top and rest; warm-ups skipped', () => {
  const o = scoreBlock(wBlock(all8({ top: [60] }), all8({ top: [60] })));
  assert.equal(o.gates.Wtop.verdict, 'no-worse'); assert.equal(o.gates.Wtop.nC, 4); assert.equal(o.gates.Wtop.delta.gt50, 0);
  assert.equal(o.gates.Wrest.verdict, 'no-worse'); assert.equal(o.runs[2].top.gt50, 1); assert.equal(o.runs[2].idle.gt50, 1);
  assert.equal(o.verdict, 'insufficient'); // no M or G leg
});
check('W top +2 no-worse, +3 WORSE; rest separately', () => {
  assert.equal(scoreBlock(wBlock([], all8({ top: [55, 55] }))).gates.Wtop.verdict, 'no-worse');
  assert.match(scoreBlock(wBlock([], all8({ top: [55, 55, 55] }))).gates.Wtop.verdict, /^WORSE/);
  const r = scoreBlock(wBlock([], all8({ rest: [70, 70, 70] })));
  assert.match(r.gates.Wrest.verdict, /^WORSE/); assert.equal(r.gates.Wtop.verdict, 'no-worse');
});
check('W frames past y 1000 in the steps are in neither gated window', () => {
  const o = scoreBlock(wBlock([], all8({ late: [90, 90, 90] })));
  assert.equal(o.gates.Wtop.delta.gt50, 0); assert.equal(o.gates.Wrest.delta.gt50, 0);
});
check('W threshold-sensitive (3 frames at 52 ms)', () => {
  const g = scoreBlock(wBlock([], all8({ rest: [52, 52, 52] }))).gates.Wrest;
  assert.match(g.verdict, /^WORSE.*threshold-sensitive/); assert.equal(g.thresholdSensitive, true);
});
check('W voids: served, LPM, marks, error, driver', () => {
  const s = W('V'); s.meta.driver = 'S';
  const o = scoreBlock([e('C1', W('C', { served: SERVED.V })), e('V2', W('V', { lpm: true })), e('V3', W('V', { noMarks: true })), e('V4', W('V', { error: 'x' })), e('V5', s), e('V6', null)]);
  const v = o.runs.map((r) => r.void.join());
  assert.match(v[0], /served not arm C/); assert.match(v[1], /Low Power/); assert.match(v[2], /marks/); assert.match(v[3], /run error/);
  assert.match(v[4], /driver S, not W/); assert.match(v[5], /no run record/);
});
check('M equal arms: no-worse; tweens read from the driver rows', () => {
  const o = scoreBlock(mBlock());
  assert.equal(o.gates.Mmoving.verdict, 'no-worse'); assert.equal(o.gates.Mtweens.verdict, 'no-worse');
  assert.equal(o.gates.Mtweens.keys['O1.f1'].C, 16.7); assert.equal(o.runs[0].void.length, 0);
  assert.deepEqual(Object.keys(o.runs[0].tweens), ['O1', 'C1', 'O2', 'C2', 'O3', 'C3']);
});
check('M moving > 50 +1 no-worse, +2 WORSE (P-098 bound)', () => {
  const o1 = scoreBlock(mBlock([], all8({ slow: 60 }))); // V: 6 tweens x 1 slow frame each = +6
  assert.match(o1.gates.Mmoving.verdict, /^WORSE/);
  const one = (a) => M(a); const b = mBlock(); b[1] = e('mV2', (() => { const j = one('V'); j.frames[25][1] = 60; return j; })());
  assert.equal(scoreBlock(b).gates.Mmoving.verdict, 'no-worse');
});
check('M O1.f1 +3 ms WORSE, +2 no-worse', () => {
  assert.match(scoreBlock(mBlock([], all8({ f1: 19.7 }))).gates.Mtweens.verdict, /^WORSE \(O1.f1/);
  assert.equal(scoreBlock(mBlock([], all8({ f1: 18.7 }))).gates.Mtweens.verdict, 'no-worse');
});
check('M voids: missing tween, sentinel p95 fail voids back', () => {
  const o = scoreBlock([e('mC1', M('C')), e('mV2', M('V', { dropTween: true })), e('mV3', M('V')), e('mC4', M('C', { pass: false, p95: 25 }))]);
  assert.match(o.runs[1].void.join(), /tween/); assert.match(o.runs[2].void.join(), /voided by failing sentinel mC4/);
  assert.match(o.runs[3].void.join(), /sentinel failed/); assert.equal(o.runs[0].void.length, 0);
});
check('driverTweens', () => { const t = driverTweens([[0, 16, 0, 0], [16, 40, 0, 0.2], [32, 16, 0, 0.5], [48, 16, 0, 1], [64, 16, 0, 1]]); assert.deepEqual(t.O1, { f1: 40, f2: 56, f3: 72 }); });
check('failing sentinel voids back to the last pass, across W, M and G', () => {
  const b = [e('sC', S('C')), e('gFC1', G('F')), e('gFV1', G('F')), e('mV1', M('V')), e('C1', W('C', { pass: false })), e('V2', W('V')), e('C3', W('C'))];
  const v = Object.fromEntries(scoreBlock(b).runs.map((r) => [r.item, r.void]));
  assert.equal(v.sC.length, 0); assert.match(v.gFC1.join(), /voided by failing sentinel C1/); assert.match(v.mV1.join(), /C1/);
  assert.match(v.C1.join(), /sentinel failed/); assert.equal(v.V2.length, 0); assert.equal(v.C3.length, 0);
});
check('sentinel with no data voids too', () => { const r = W('C'); delete r.meta.sentinel; assert.match(scoreBlock([e('C1', r)]).runs[0].void.join(), /no data/); });
check('G equal arms: no-worse, no cluster', () => {
  const slow = [{ y: 1000, dt: 70 }]; const s = { slowAt: slow };
  const o = scoreBlock(gLeg('H', [s, s, s], [s, s, s]));
  assert.equal(o.gates.GH.verdict, 'no-worse'); assert.deepEqual(o.gates.GH.cluster.newClusters, []); assert.deepEqual(o.gates.GH.cluster.vClusters, ['1000-1249']);
  assert.match(o.gates.GF.verdict, /^insufficient/);
});
check('G new cluster fails inside +2; a neighbouring C spot clears it', () => {
  const v = { slowAt: [{ y: 3000, dt: 70 }] }, c = { slowAt: [{ y: 1000, dt: 70 }] };
  const o = scoreBlock(gLeg('M', [c, c, c], [v, v, {}]));
  assert.equal(o.gates.GM.delta.gt50, 0); assert.match(o.gates.GM.verdict, /^NEW CLUSTER at 3000-3249/); assert.equal(o.verdict, 'WORSE');
  const near = { slowAt: [{ y: 3280, dt: 70 }] };
  assert.equal(scoreBlock(gLeg('M', [near, c, c], [v, v, {}])).gates.GM.verdict, 'no-worse');
  assert.equal(scoreBlock(gLeg('M', [c, c, c], [v, {}, {}])).gates.GM.verdict, 'no-worse');
});
check('G cluster threshold twins', () => {
  const v = { slowAt: [{ y: 3000, dt: 52 }] }; const g = scoreBlock(gLeg('E', [{}, {}, {}], [v, v, {}])).gates.GE;
  assert.match(g.verdict, /^NEW CLUSTER/); assert.equal(g.clusterThresholdSensitive, true);
  assert.deepEqual(clusters([{ bins: { gt50: [] } }], [{ bins: { gt50: [4] } }, { bins: { gt50: [4] } }]).newClusters, ['1000-1249']);
});
check('G voids: aborted, errors, no mark, no end, 30 Hz, served check', () => {
  const noStart = G('F'); noStart.run.segments[0].marks = [[0, 'other']];
  const o = scoreBlock([e('gFV1', G('F', { aborted: 'x' })), e('gFV2', G('F', { errors: ['boom'] })), e('gFV3', noStart), e('gFV4', G('F', { noEnd: true })),
    e('gFV5', G('F', { dt: 33 })), e('gFV6', G('F'), OKLOG.replace('V pid 3 port 3 served JS 3e3e94cb6e9f CSS f836404b3728 ok', 'V pid 3 port 3 served JS 000000000000 CSS f836404b3728 WRONG')),
    e('gFV7', G('F'), null), e('gFV8', null)]);
  const v = o.runs.map((r) => r.void.join());
  assert.match(v[0], /aborted/); assert.match(v[1], /errors/); assert.match(v[2], /no fresh-flick mark/); assert.match(v[3], /no end mark/);
  assert.match(v[4], /30 Hz/); assert.match(v[5], /served check not ok/); assert.match(v[6], /no served check log/); assert.match(v[7], /no record/);
});
check('full block: all legs valid and equal -> no-worse; one WORSE leg -> WORSE', () => {
  const b = [...wBlock(), ...mBlock(), ...['F', 'H', 'M', 'E'].flatMap((P) => gLeg(P))];
  assert.equal(scoreBlock(b).verdict, 'no-worse');
  const w = [...wBlock([], all8({ rest: [70, 70, 70] })), ...mBlock(), ...['F', 'H', 'M', 'E'].flatMap((P) => gLeg(P))];
  assert.equal(scoreBlock(w).verdict, 'WORSE');
});
console.log(`SELFTEST OK ${n} checks`);
