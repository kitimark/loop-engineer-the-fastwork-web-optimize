#!/usr/bin/env node
// Self-test of p129-read.mjs on synthetic records (no Fastwork data, no device). Prints SELFTEST PASS <n> or throws.
//   node research/serious-heat/p129-selftest.mjs
import assert from 'node:assert/strict';
import { unionLen, subtract, gapWork, flatten, classify, readRun, readBlock, GATE, FS_HASH } from './p129-read.mjs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// --- interval helpers (N1: nested records count once)
eq(unionLen([[0, 10], [2, 5], [8, 12], [20, 25]]), 17, 'union of overlapping and nested intervals');
eq(unionLen([]), 0, 'empty union');
eq(subtract([0, 50], [[10, 20], [30, 60]]), [[0, 10], [20, 30]], 'subtract children from a span');

// --- synthetic run generator
const OFF = 1000; // offsetMs: Timeline ms = page ms + 1000
const rec = (type, a, b, extra = {}) => ({ type, startTime: (a + OFF) / 1000, endTime: (b + OFF) / 1000, ...extra });
/**
 * idle: s from ready to the first touch; frames: count; slow: {index: kind} with kind MAIN | RENDER | RFSELF | LAYOUT;
 * heroSlow: number of slow RENDER frames to place in the hero (index < 90 is hero: 10 px per frame, hero < 900).
 * opts: drift, noFaf (share of frames without a FireAnimationFrame), segs, noTl.
 */
function mkRun({ idle = 4.6, frames = 400, slow = {}, drift = 0, noFaf = 0, segs = 1, stopped = true } = {}) {
  const ready = 1600, t0 = ready + idle * 1000 - 100;
  const fr = [], recs = [];
  let t = t0;
  for (let i = 0; i < frames; i++) {
    const dt = slow[i] ? 50 : 16.7;
    if (i) t += dt;
    fr.push([Math.round(t * 10) / 10, i ? dt : 16.7, i * 10, 775]);
    if (!(noFaf && i % Math.round(1 / noFaf) === 0)) recs.push(rec('FireAnimationFrame', t + 1, t + 1.5));
    const k = slow[i];
    if (k === 'MAIN') recs.push(rec('EventDispatch', t - dt + 1, t - 1, { children: [rec('FunctionCall', t - dt + 2, t - 2)] }));
    if (k === 'RENDER') recs.push(rec('RenderingFrame', t - dt + 1, t - 1, { children: [rec('Composite', t - dt + 2, t - 2)] }));
    if (k === 'RFSELF') recs.push(rec('RenderingFrame', t - dt + 1, t - 1));
    if (k === 'LAYOUT') recs.push(rec('RenderingFrame', t - dt + 1, t - 1, { children: [rec('Layout', t - dt + 2, t - dt + 12), rec('Composite', t - dt + 12, t - 2)] }));
  }
  const touches = [[ready + idle * 1000, 's', 1, 0, 0, 0, 600, 0]];
  const g = { program: { name: 'ms-fastshort-v1', hash: `${FS_HASH}0000` }, run: { segments: Array.from({ length: segs }, () => ({ docH: 6850, docH1: 6850, frames: fr, touches })), reloads: [{ seg: 0, readyPageMs: ready }], aborted: false } };
  const tl = { kind: 'gesture-timeline', seg: 0, syncT: 500, syncTL: 1.5, offsetMs: OFF, recs, end: { syncT: 9e4, syncTL: 91, offsetMs: OFF + drift }, stopped };
  return { g, tl };
}
const slowAt = (idx, kind) => Object.fromEntries(idx.map((i) => [i, kind]));

// --- flatten maps Timeline seconds to page ms
const fl = flatten([rec('Layout', 100, 110)], OFF);
eq([fl[0].a, fl[0].b].map((x) => Math.round(x * 1000) / 1000), [100, 110], 'Timeline -> page ms mapping');

// --- gapWork: busy union, RenderingFrame self-span (C2)
{
  const f = flatten([
    rec('EventDispatch', 0, 20, { children: [rec('FunctionCall', 5, 15)] }),
    rec('RenderingFrame', 25, 50, { children: [rec('Layout', 26, 30), rec('Composite', 30, 49)] }),
  ], OFF);
  const w = gapWork(f, 0, 50);
  eq(Math.round(w.busy), 24, 'busy = EventDispatch (20, nested FunctionCall once) + Layout (4)');
  eq(Math.round(w.busyRF), 26, 'busyRF adds the RenderingFrame self-span only (25-26, 49-50), not Composite');
  eq(Math.round(w.maxLR), 4, 'maxLR = the Layout overlap');
}
// --- classify
eq(classify(40, 50, 0), 'MAIN', 'busy >= dt - 16.7 is MAIN');
eq(classify(5, 50, 3), 'RENDER', 'busy < 8 and maxLR <= 4 is RENDER');
eq(classify(5, 50, 6), 'MIXED', 'a long Layout makes it MIXED');
eq(classify(20, 50, 0), 'MIXED', 'middle busy is MIXED');

// --- run gates
{
  const { g, tl } = mkRun({ slow: slowAt([20, 120], 'MAIN') });
  const r = readRun(g, tl, 'E');
  eq(r.why, [], 'a clean E run passes every gate');
  ok(r.align.share === 1, 'every moving frame finds its FireAnimationFrame');
  const s20 = r.rows.find((x) => x.i === 20);
  eq([s20.cls, s20.band, s20.win], ['MAIN', 'hero', 'W1'], 'slow frame 20: MAIN, hero band, window W1');
  ok(readRun(g, null, 'E').why.some((w) => w.startsWith('G1')), 'no Timeline: G1');
  ok(readRun(g, { ...tl, stopped: false }, 'E').why.some((w) => w.startsWith('G1')), 'not stopped: G1');
  ok(readRun(g, { ...tl, epochs: [{}] }, 'E').why.some((w) => w.startsWith('G1')), 'one reconnect (epochs[] holds epoch 1): G1');
  ok(readRun(g, { ...tl, syncTL: null }, 'E').why.some((w) => w.startsWith('G1')), 'no sync TimeStamp: G1');
  ok(readRun(g, tl, 'L').why.some((w) => w.startsWith('G4')), 'E-length idle is outside the L gate');
}
ok(readRun(...Object.values(mkRun({ drift: 2.5 })), 'E').why.some((w) => w.startsWith('G2')), 'drift 2.5 ms: G2');
ok(!readRun(...Object.values(mkRun({ drift: 1.9 })), 'E').why.length, 'drift 1.9 ms passes');
ok(readRun(...Object.values(mkRun({ noFaf: 0.1 })), 'E').why.some((w) => w.startsWith('G3')), '10 % frames without FireAnimationFrame: G3');
ok(!readRun(...Object.values(mkRun({ noFaf: 0.02 })), 'E').why.length, '2 % missing passes G3 (>= 95 %)');
ok(readRun(...Object.values(mkRun({ idle: 3.9 })), 'E').why.some((w) => w.startsWith('G4')), 'E idle 3.9 s: G4');
ok(!readRun(...Object.values(mkRun({ idle: 21.5 })), 'L').why.length, 'L idle 21.5 s passes');
ok(readRun(...Object.values(mkRun({ idle: 24 })), 'L').why.some((w) => w.startsWith('G4')), 'L idle 24 s: G4');
ok(readRun(...Object.values(mkRun({ segs: 2 })), 'E').why.some((w) => w.startsWith('G5')), 'two segments: G5');
{ // no touch at all: G4, no crash
  const { g, tl } = mkRun();
  g.run.segments[0] = { ...g.run.segments[0], touches: [] };
  ok(readRun(g, tl, 'L').why.some((w) => w.startsWith('G4')), 'no touchstart: G4 without a crash');
}
{
  const { g, tl } = mkRun();
  ok(readRun({ ...g, program: { hash: 'abcdef123456' } }, tl, 'E').why.some((w) => w.startsWith('G6')), 'another script: G6');
  ok(readRun({ ...g, program: { hash: 'abcdef123456' } }, null, 'S').sentinel === 'FAIL', 'a sentinel on another script fails');
}
{ // G3 never borrows the next update's callback: FireAnimationFrame shifted by +12 ms misses
  const { g, tl } = mkRun();
  tl.recs = tl.recs.map((r) => (r.type === 'FireAnimationFrame' ? { ...r, startTime: r.startTime + 0.011, endTime: r.endTime + 0.011 } : r));
  ok(readRun(g, tl, 'E').why.some((w) => w.startsWith('G3')), 'a FireAnimationFrame 12 ms late is no match');
}
{ // a 3 ms clock error: every frame still matches, the median lag fails
  const { g, tl } = mkRun();
  const r = readRun(g, { ...tl, offsetMs: OFF - 3, end: { ...tl.end, offsetMs: OFF - 3 } }, 'E');
  ok(r.align.share === 1 && r.why.some((w) => w.startsWith('G3 median')), 'offset off by 3 ms: G3 median lag');
}

// --- sentinel (C3)
{
  const s = readRun(mkRun({ slow: slowAt([10, 50, 90], 'MAIN') }).g, null, 'S');
  eq(s.sentinel, 'PASS', 'a smooth sentinel passes');
  const bad = readRun(mkRun({ slow: slowAt(Array.from({ length: 40 }, (_, k) => 5 + k * 9), 'MAIN') }).g, null, 'S');
  ok(bad.slowShare > 0.06 && bad.sentinel === 'FAIL', 'slow share 10 % fails the sentinel');
}

// --- whole blocks
const S = { S0: readRun(mkRun().g, null, 'S'), S1: readRun(mkRun().g, null, 'S') };
const E = (slow, idle = 4.6) => { const { g, tl } = mkRun({ idle, slow }); return readRun(g, tl, 'E'); };
const L = (slow, idle = 21.5) => { const { g, tl } = mkRun({ idle, slow }); return readRun(g, tl, 'L'); };
const heroIdx = (k) => Array.from({ length: k }, (_, j) => 5 + j * 10); // hero: index < 90
const midIdx = (k) => Array.from({ length: k }, (_, j) => 150 + j * 12);
{ // RENDER-LED, LOAD
  const runs = { ...S };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E({ ...slowAt(heroIdx(8), 'RENDER'), ...slowAt(midIdx(4), 'RENDER') });
  for (const k of [1, 2, 3, 4]) runs[`L${k}`] = L(slowAt(midIdx(4), 'RENDER'));
  const b = readBlock(runs);
  eq(b.reading.partA, 'RENDER-LED', 'all slow frames RENDER: RENDER-LED');
  eq(b.reading.partB, 'LOAD', 'hero slow only when the hero is visited early: LOAD');
  ok(b.partB.rL === 0 && b.partB.rE > 0.08, 'rE and rL pooled');
  eq(b.descriptive.toolbarStep.testable, false, 'no toolbar steps: prediction 6 untestable (N3)');
}
{ // ATTRIBUTION-SENSITIVE: busy says RENDER, busyRF says MAIN
  const runs = { ...S };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E(slowAt([...heroIdx(5), ...midIdx(6)], 'RFSELF'));
  for (const k of [1, 2, 3, 4]) runs[`L${k}`] = L(slowAt(midIdx(6), 'RFSELF'));
  const b = readBlock(runs);
  ok(b.reading.partA.startsWith('ATTRIBUTION-SENSITIVE'), 'busy RENDER vs busyRF MAIN: ATTRIBUTION-SENSITIVE (C2)');
}
{ // MAIN-LED, HERO
  const runs = { ...S };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E(slowAt(heroIdx(9), 'MAIN'));
  for (const k of [1, 2, 3, 4]) runs[`L${k}`] = L(slowAt(heroIdx(9), 'MAIN'));
  const b = readBlock(runs);
  eq(b.reading.partA, 'MAIN-LED', 'all slow frames MAIN: MAIN-LED');
  eq(b.reading.partB, 'HERO', 'hero slow equal early and late: HERO');
}
{ // MIXED via long layouts, SPLIT
  const runs = { ...S };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E(slowAt(heroIdx(8), 'LAYOUT'));
  for (const k of [1, 2, 3, 4]) runs[`L${k}`] = L(slowAt(heroIdx(5), 'LAYOUT'));
  const b = readBlock(runs);
  eq(b.reading.partA, 'MIXED', 'long layouts inside a render: MIXED');
  eq(b.reading.partB, 'SPLIT', 'L hero at 5/9 of E: SPLIT');
}
{ // THIN part A (< 30 frames) and invalid runs drop out
  const runs = { ...S };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E(slowAt([20, 200], 'MAIN'));
  for (const k of [1, 2, 3, 4]) runs[`L${k}`] = L(slowAt([200], 'MAIN'), 25);
  const b = readBlock(runs);
  eq(b.reading.partA, 'THIN', '8 slow frames: THIN');
  eq(Object.keys(b.invalid).sort(), ['L1', 'L2', 'L3', 'L4'], 'L runs outside the idle gate are invalid');
  eq(b.reading.partB, 'THIN', 'no valid L run: part B THIN');
}
{ // a failing sentinel voids the block
  const runs = { S0: S.S0, S1: readRun(mkRun({ slow: slowAt(Array.from({ length: 40 }, (_, k) => 5 + k * 9), 'MAIN') }).g, null, 'S') };
  for (const k of [1, 2, 3, 4]) runs[`E${k}`] = E(slowAt(heroIdx(8), 'MAIN'));
  const b = readBlock(runs);
  ok(String(b.reading).startsWith('VOID'), 'failed end sentinel: VOID');
}
eq(GATE.drift, 2, 'drift gate is 2 ms');
console.log(`SELFTEST PASS ${n}`);
