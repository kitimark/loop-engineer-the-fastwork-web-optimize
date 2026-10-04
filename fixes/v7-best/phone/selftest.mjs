#!/usr/bin/env node
// selftest.mjs: P-105 scorer checks on synthetic records (no phone data, no out/ files). Run before the pre-data read:
//   node fixes/v7-best/phone/selftest.mjs        -> "SELFTEST OK <n> checks" (exit 0) or the first failure (exit 1)
import assert from 'node:assert/strict';
import { parseItem, scoreBlock, clusters, gate, median } from './score.mjs';

const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const SERVED = { C: { [NODE]: '8018ce062d30aaaa', [CSS]: '71b65c667720bbbb' }, V: { [NODE]: '8c90da2177455718', [CSS]: '308f0da70c3a64b0' } };
const OKLOG = 'B pid 1 port 1 served JS 4606120cf392 CSS 27776f3d4138 ok\nC pid 2 port 2 served JS 8018ce062d30 CSS 71b65c667720 ok\nV pid 3 port 3 served JS 8c90da217745 CSS 308f0da70c3a ok\n';
let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.log(`SELFTEST FAIL ${name}: ${e.message}`); process.exit(1); } };

// S record: idle 0-3000, scroll 3000-9000, bottom 9000-12000; 16.7 ms frames plus `slow` frames of the given dt in the scroll
function S(arm, { slow = [], pass = true, served = SERVED[arm], lpm = false, noMarks = false, error = null } = {}) {
  const frames = []; let t = 0;
  while (t < 12000) { t += 16.7; frames.push([t, 16.7, t > 3000 ? (t - 3000) : 0, 775]); }
  slow.forEach((dt, i) => frames.push([3100 + i * 300, dt, 100 + i * 300, 775]));
  frames.sort((a, b) => a[0] - b[0]);
  return { meta: { schema: 'fw-iphone-run/1', driver: 'S', served, settings: { lowPowerMode: lpm }, error, sentinel: { pass }, battery: { start: { temperatureC: 39 } } },
    marks: noMarks ? {} : { idle: [0, 3000], scroll: [3000, 9000], bottom: [9000, 12000] }, frames };
}
// G record: one segment with marks <start> and end; moving frames 12.5 ms apart, y += 40 each; slow frames at given y
const START = { F: 'fresh-flick', H: 'down1', M: 'mid1', E: 'into1' };
function G(part, { slowAt = [], dt = 12.5, aborted = null, errors = [], noEnd = false } = {}) {
  const frames = [[0, null, 0, 815]]; let t = 0, y = 0;
  while (y < 5000) { t += dt; y += 40; const s = slowAt.find((x) => Math.abs(x.y - y) < 20); frames.push([t, s ? s.dt : dt, y, 815]); if (s) t += s.dt - dt; }
  const marks = [[0, START[part]]]; if (!noEnd) marks.push([t + 1, 'end']);
  return { run: { segments: [{ frames, marks }], aborted, errors } };
}
const e = (item, j, checkLog = OKLOG) => ({ item, j, checkLog });
const sBlock = (cSlow, vSlow) => [e('wC', S('C')), e('wV', S('V')), e('C1', S('C', { slow: cSlow[0] })), e('V2', S('V', { slow: vSlow[0] })), e('V3', S('V', { slow: vSlow[1] })),
  e('C4', S('C', { slow: cSlow[1] })), e('C5', S('C', { slow: cSlow[2] })), e('V6', S('V', { slow: vSlow[2] })), e('V7', S('V', { slow: vSlow[3] })), e('C8', S('C', { slow: cSlow[3] }))];
const gLeg = (P, cRuns, vRuns) => [e('sC', S('C')), ...cRuns.flatMap((c, i) => [e(`g${P}C${i + 1}`, G(P, c)), e(`g${P}V${i + 1}`, G(P, vRuns[i]))]), e('sC', S('C'))];
const flat = [[], [], [], []];

check('parseItem', () => {
  assert.deepEqual(parseItem('wC'), { kind: 'S', arm: 'C', warmup: true });
  assert.deepEqual(parseItem('V12'), { kind: 'S', arm: 'V', run: 12 });
  assert.deepEqual(parseItem('gHV3'), { kind: 'G', part: 'H', arm: 'V', run: 3 });
  assert.equal(parseItem('sC').sentinelOnly, true);
  assert.throws(() => parseItem('gXC1')); assert.throws(() => parseItem('B1'));
});
check('median', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null); });
check('gate insufficient below 3', () => assert.match(gate([{ gt50: 0 }, { gt50: 0 }], [{ gt50: 0 }, { gt50: 0 }, { gt50: 0 }], 3).verdict, /^insufficient/));

check('S equal arms: no-worse; warm-ups skipped', () => {
  const o = scoreBlock(sBlock([[60], [60], [60], [60]], [[60], [60], [60], [60]]));
  assert.equal(o.gates.S.verdict, 'no-worse'); assert.equal(o.gates.S.nC, 4); assert.equal(o.gates.S.delta.gt50, 0);
  assert.equal(o.verdict, 'insufficient'); // no G leg
});
check('S +2 is still no-worse, +3 is WORSE', () => {
  const two = [55, 55], three = [55, 55, 55];
  assert.equal(scoreBlock(sBlock(flat, [two, two, two, two])).gates.S.verdict, 'no-worse');
  assert.match(scoreBlock(sBlock(flat, [three, three, three, three])).gates.S.verdict, /^WORSE/);
});
check('S threshold-sensitive (3 frames at 52 ms: >50 and >46 WORSE, >54 not)', () => {
  const s = [52, 52, 52]; const g = scoreBlock(sBlock(flat, [s, s, s, s])).gates.S;
  assert.match(g.verdict, /^WORSE.*threshold-sensitive/); assert.equal(g.thresholdSensitive, true);
});
check('S slow frame outside [idle, bottom) does not count', () => {
  const r = S('V'); r.frames.push([11000, 80, 6000, 775]); const o = scoreBlock([e('V1', r)]);
  assert.equal(o.runs[0].timed.gt50, 0);
});
check('S voids: served, LPM, marks, error', () => {
  const o = scoreBlock([e('C1', S('C', { served: SERVED.V })), e('V2', S('V', { lpm: true })), e('V3', S('V', { noMarks: true })), e('V4', S('V', { error: 'x' }))]);
  assert.match(o.runs[0].void.join(), /served not arm C/); assert.match(o.runs[1].void.join(), /Low Power/);
  assert.match(o.runs[2].void.join(), /marks/); assert.match(o.runs[3].void.join(), /run error/);
});
check('failing sentinel voids back to the last pass, across S and G', () => {
  const b = [e('sC', S('C')), e('gFC1', G('F')), e('gFV1', G('F')), e('C1', S('C', { pass: false })), e('V2', S('V')), e('C3', S('C'))];
  const o = scoreBlock(b); const v = Object.fromEntries(o.runs.map((r) => [r.item, r.void]));
  assert.equal(v.sC.length, 0); assert.match(v.gFC1.join(), /voided by failing sentinel C1/); assert.match(v.gFV1.join(), /C1/);
  assert.match(v.C1.join(), /sentinel failed/); assert.equal(v.V2.length, 0); assert.equal(v.C3.length, 0);
});
check('sentinel with no data voids too', () => { const r = S('C'); delete r.meta.sentinel; assert.match(scoreBlock([e('C1', r)]).runs[0].void.join(), /no data/); });
check('sC is a sentinel but not a counted S run', () => {
  const o = scoreBlock([e('sC', S('C', { slow: [90, 90, 90, 90, 90] })), ...sBlock(flat, flat).slice(2)]);
  assert.equal(o.gates.S.nC, 4); assert.equal(o.gates.S.delta.gt50, 0);
});
check('G equal arms: no-worse, no cluster', () => {
  const slow = [{ y: 1000, dt: 70 }]; const o = scoreBlock(gLeg('H', [{ slowAt: slow }, { slowAt: slow }, { slowAt: slow }], [{ slowAt: slow }, { slowAt: slow }, { slowAt: slow }]));
  assert.equal(o.gates.GH.verdict, 'no-worse'); assert.deepEqual(o.gates.GH.cluster.newClusters, []); assert.deepEqual(o.gates.GH.cluster.vClusters, ['1000-1249']);
  assert.match(o.gates.GF.verdict, /^insufficient/);
});
check('G new cluster fails inside +2; a neighbouring C spot clears it', () => {
  const v = { slowAt: [{ y: 3000, dt: 70 }] }, c = { slowAt: [{ y: 1000, dt: 70 }] };
  const o = scoreBlock(gLeg('M', [c, c, c], [v, v, {}]));
  assert.equal(o.gates.GM.delta.gt50, 0); assert.match(o.gates.GM.verdict, /^NEW CLUSTER at 3000-3249/); assert.equal(o.verdict, 'insufficient');
  const near = { slowAt: [{ y: 3280, dt: 70 }] };
  assert.equal(scoreBlock(gLeg('M', [near, c, c], [v, v, {}])).gates.GM.verdict, 'no-worse');
  // slow in only 1 of 3 V runs: not a cluster
  assert.equal(scoreBlock(gLeg('M', [c, c, c], [v, {}, {}])).gates.GM.verdict, 'no-worse');
});
check('G cluster threshold twins', () => {
  const v = { slowAt: [{ y: 3000, dt: 52 }] }; const g = scoreBlock(gLeg('E', [{}, {}, {}], [v, v, {}])).gates.GE;
  assert.match(g.verdict, /^NEW CLUSTER/); assert.equal(g.clusterThresholdSensitive, true);
  assert.deepEqual(clusters([{ bins: { gt50: [] } }], [{ bins: { gt50: [4] } }, { bins: { gt50: [4] } }]).newClusters, ['1000-1249']);
});
check('G only moving frames count', () => {
  const j = G('F'); const fr = j.run.segments[0].frames; fr.push([fr.at(-1)[0] + 200, 200, fr.at(-1)[2], 815]); j.run.segments[0].marks[1][0] += 300;
  assert.equal(scoreBlock([e('gFV1', j)]).runs[0].counts.gt50, 0);
});
check('G voids: aborted, errors, no mark, no end, 30 Hz, served check', () => {
  const noStart = G('F'); noStart.run.segments[0].marks = [[0, 'other']];
  const o = scoreBlock([e('gFV1', G('F', { aborted: 'x' })), e('gFV2', G('F', { errors: ['boom'] })), e('gFV3', noStart), e('gFV4', G('F', { noEnd: true })),
    e('gFV5', G('F', { dt: 33 })), e('gFV6', G('F'), OKLOG.replace('V pid 3 port 3 served JS 8c90da217745 CSS 308f0da70c3a ok', 'V pid 3 port 3 served JS 000000000000 CSS 308f0da70c3a WRONG')),
    e('gFV7', G('F'), null), e('gFV8', null)]);
  const v = o.runs.map((r) => r.void.join());
  assert.match(v[0], /aborted/); assert.match(v[1], /errors/); assert.match(v[2], /no fresh-flick mark/); assert.match(v[3], /no end mark/);
  assert.match(v[4], /30 Hz/); assert.match(v[5], /served check not ok/); assert.match(v[6], /no served check log/); assert.match(v[7], /no record/);
});
check('full block: all legs valid and equal -> no-worse', () => {
  const b = [...sBlock(flat, flat), ...['F', 'H', 'M', 'E'].flatMap((P) => gLeg(P, [{}, {}, {}], [{}, {}, {}]))];
  const o = scoreBlock(b); assert.equal(o.verdict, 'no-worse');
});
console.log(`SELFTEST OK ${n} checks`);
