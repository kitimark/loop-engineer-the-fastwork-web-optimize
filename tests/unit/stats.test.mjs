// tools/lib/stats.mjs + tools/stats.mjs (protocol v2 §3.2, §3.4, §5.3; item T3) against hand-computed
// values: tick quantisation at the 8.333 ms midpoints, type-7 quartiles, the exact Mann-Whitney U = 0 at
// 4 vs 4 (p = 1/70 ~ 0.014, the protocol's own example), the HL shift, the exact van Elteren over two
// blocks, every branch of the sequential decision, the block orders, and crossing placement per unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';
import {
  TICK_MS, tick, tickThresholdMs, quantile, median, summary, frameCounts, runMetrics, mannWhitney, hodgesLehmann,
  vanElteren, stratifiedShift, aligned, compareBlock, compareBlocks, sequentialDecision, blockOrder,
  crossingY, placeFrame, placeFrames, normalizeFrame, runsFromJson, blocksFromRuns, blockWarnings,
  compareBlockIds, METRICS, TWIN, twinKind, twinsFor, K_FORMS, PHONE_TWINS, driverOf, deviceOf, deviceAssumed, assertOneDevice, nearByBlock,
} from '../../tools/lib/stats.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('ticks: k = round(dt / 8.333); midpoints 37.5 -> 5 and 54.17 -> 7; the protocol thresholds', () => {
  close(TICK_MS, 8.333333333);
  assert.deepEqual([0, 8.333, 16.67, 33.3, 37.4, 37.5, 45.8, 54.1, 54.2, 100].map((x) => tick(x)), [0, 1, 2, 4, 4, 5, 5, 6, 7, 12]);
  assert.equal(tickThresholdMs(5), 37.5);
  close(tickThresholdMs(7), 54.1666666667);
  assert.equal(tick(tickThresholdMs(7)), 7);
  assert.equal(tick(tickThresholdMs(7) - 0.01), 6);
});

test('frameCounts: tick histogram, k>=5, k>=7, on-time, legacy >34 / >50 side by side', () => {
  // ticks 2, 5, 7, 4, 6: 35 ms is ">34" in legacy ms but only k = 4; 50.5 is legacy ">50" but k = 6
  const c = frameCounts([16.7, 37.5, 54.2, 35, 50.5]);
  // phone +-4 ms: >30 and >38 4 / 2 (near34 = 30 < dt <= 38: 37.5, 35), >46 and >54 2 / 1 (near50: 50.5)
  assert.deepEqual(c, { n: 5, k5: 3, k7: 1, onTime: 1, gt30: 4, gt34: 4, gt38: 2, gt46: 2, gt50: 2, gt54: 1, near34: 2, near50: 1, hist: { 2: 1, 5: 1, 7: 1, 4: 1, 6: 1 } });
  // strict ">": a frame exactly on a threshold is not over it, and is near it
  assert.deepEqual(['gt30', 'gt34', 'gt38', 'gt46', 'gt50', 'gt54', 'near34', 'near50'].map((k) => frameCounts([30, 34, 38, 46, 50, 54])[k]), [5, 4, 3, 2, 1, 0, 2, 2]);
  const m = runMetrics([10, 20, 30, 40, 50]);
  assert.equal(m.p50Ms, 30);
  close(m.p95Ms, 48); // h = 4 * 0.95 = 3.8: 40 + 0.8 * 10
  assert.deepEqual([m.p50Ticks, m.p95Ticks], [4, 6]);
});

test('median, quartiles (linear interpolation, R type 7) and IQR', () => {
  assert.equal(median([3, 1, 2, 4]), 2.5);
  assert.deepEqual(summary([1, 2, 3, 4]), { n: 4, median: 2.5, q1: 1.75, q3: 3.25, iqr: 1.5, min: 1, max: 4 });
  assert.deepEqual(summary([40, 10, 30, 20, 50]), { n: 5, median: 30, q1: 20, q3: 40, iqr: 20, min: 10, max: 50 });
  assert.equal(quantile([], 0.5), null);
  assert.equal(summary([]).n, 0);
  assert.equal(quantile([7, null, NaN], 0.5), 7, 'non-numbers are ignored');
});

test('exact Mann-Whitney at 4 vs 4: U = 0 gives p = 1/70 ~ 0.014 (protocol §5.3), U = 1 gives 2/70; HL shift', () => {
  const C = [40, 42, 44, 46], V = [30, 32, 34, 36];
  const r = mannWhitney(C, V, 'lower');
  assert.equal(r.u, 0);
  close(r.p, 1 / 70);
  assert.equal(Math.round(r.p * 1000) / 1000, 0.014);
  const r1 = mannWhitney(C, [30, 32, 34, 41], 'lower');
  assert.equal(r1.u, 1);
  close(r1.p, 2 / 70);
  // a_i - b_j = 10 + 2(i - j): 4, 6, 6, 8, 8, 8, 10, 10, 10, 10, 12, ... -> median 10
  assert.equal(hodgesLehmann(C, V, 'lower'), 10);
  assert.equal(hodgesLehmann(C, V, 'higher'), -10);
  // tied tick values: U counts ties as 1/2; a full tie is p = 1
  close(mannWhitney([5, 5, 5, 5], [5, 5, 5, 5]).p, 1);
  const b = compareBlock(C, V);
  assert.equal(b.test, 'exact Mann-Whitney, one-sided');
  assert.deepEqual([b.u, b.shift, b.control.median, b.variant.median], [0, 10, 43, 33]);
  close(b.pWorse, 1);
});

test('van Elteren (exact, within-block splits only): two 4v4 blocks, unequal blocks, ties, one block = MW', () => {
  const B1 = { control: [40, 42, 44, 46], variant: [30, 32, 34, 36] };
  const B1u1 = { control: [40, 42, 44, 46], variant: [30, 32, 34, 41] };
  let r = vanElteren([B1, B1]);
  assert.equal(r.t, 0);
  close(r.p, 1 / 4900);
  assert.equal(r.total, 4900);
  // U1 + U2 <= 1: splits (0,0), (0,1), (1,0) -> 3 / 4900
  r = vanElteren([B1, B1u1]);
  close(r.t, 1 / 9);
  close(r.p, 3 / 4900);
  // 4v4 (w 1/9) and 3v3 (w 1/7), both U = 0: 1 / (70 * 20)
  close(vanElteren([B1, { control: [9, 10, 11], variant: [1, 2, 3] }]).p, 1 / 1400);
  close(vanElteren([{ control: [5, 5, 5, 5], variant: [5, 5, 5, 5] }]).p, 1);
  close(vanElteren([B1u1]).p, mannWhitney(B1u1.control, B1u1.variant).p);
  assert.throws(() => vanElteren([]), /no blocks/);
  assert.throws(() => vanElteren([{ control: [], variant: [1] }]), /empty arm/);
});

// Block 2 runs 10 ms hotter (heat moves p50 between blocks). Block-2 differences a - b = 6 + 2(i - j);
// the pooled 32 within-block differences have their 16th/17th values at 8 -> stratified HL 8 < 1 tick.
const HOT = { control: [50, 52, 54, 56], variant: [44, 46, 48, 50] };
const COOL = { control: [40, 42, 44, 46], variant: [30, 32, 34, 36] };

test('stratified comparison: van Elteren p with a cross-group tie, stratified HL, aligned diagnostic', () => {
  const s = compareBlocks([COOL, HOT]);
  assert.equal(s.test, 'exact van Elteren, one-sided, stratified by block');
  assert.deepEqual(s.n, [8, 8]);
  // block 2 has U = 0.5 (the two 50s); P(U2 <= 0.5) = 2/70 (either 50 in the variant), P(U1 = 0) = 1/70
  assert.equal(s.perBlock[1].u, 0.5);
  close(s.t, 0.5 / 9);
  close(s.p, 2 / 4900);
  assert.equal(s.shift, 8);
  assert.equal(stratifiedShift([COOL, HOT]), 8);
  // aligned: controls [-3, -1, 1, 3] x2, variants [-13..-7] and [-9..-3]: only -3 ties (x2) -> U = 1
  const a = aligned([COOL, HOT]);
  assert.equal(a.test, 'aligned Mann-Whitney (diagnostic)');
  assert.deepEqual(a.variant, [-13, -11, -9, -7, -9, -7, -5, -3]);
  assert.equal(a.u, 1);
});

test('sequential decision, block 1: win (U = 0, p 1/70, HL >= 1 tick), prediction raises the bar, futile, block 2', () => {
  let d = sequentialDecision({ blocks: [COOL], unit: 'ms' });
  assert.equal(d.decision, 'win', d.reason);
  close(d.stats.need, TICK_MS);
  assert.equal(d.stats.choices.medianCompare, 'ticks');
  // predicted 30 ms: need max(8.33, 15) = 15 > HL 10 -> not a win; medians 43 (k 5) vs 33 (k 4) -> block 2
  d = sequentialDecision({ blocks: [COOL], unit: 'ms', predicted: 30 });
  assert.equal(d.decision, 'block2', d.reason);
  assert.equal(d.stats.need, 15);
  // variant median worse -> futile
  d = sequentialDecision({ blocks: [{ control: COOL.variant, variant: COOL.control }], unit: 'ms' });
  assert.equal(d.decision, 'futile');
  assert.match(d.reason, /variant median worse \(medians 4 vs 5 ticks\)/);
  // equal tick medians (41.5 and 39.5 are both k 5) but HL 2 > 0: a sub-tick gain goes to block 2 (arch-lead)
  d = sequentialDecision({ blocks: [{ control: [40, 41, 42, 43], variant: [38, 39, 40, 41] }], unit: 'ms' });
  assert.equal(d.decision, 'block2', d.reason);
  assert.equal(d.stats.shift, 2);
  // equal medians and HL <= 0 -> futile
  d = sequentialDecision({ blocks: [{ control: [40, 41, 42, 43], variant: [40, 41, 42, 43] }], unit: 'ms' });
  assert.equal(d.decision, 'futile');
  assert.match(d.reason, /equal and HL 0 <= 0/);
  // counts: k>=5 frames per run, 1 frame per run minimum, raw medians; U = 0 with HL 3 -> win
  d = sequentialDecision({ blocks: [{ control: [6, 7, 7, 8], variant: [3, 4, 4, 4] }], unit: 'count' });
  assert.equal(d.decision, 'win', d.reason);
  assert.equal(d.stats.choices.minShift, 1);
  // U = 0 but HL 0.5 < 1 frame (12 differences of 0.5, 4 of 1.5) -> not a win; median 3.5 better than 4 -> block 2
  d = sequentialDecision({ blocks: [{ control: [4, 4, 4, 5], variant: [3.5, 3.5, 3.5, 3.5] }], unit: 'count' });
  assert.equal(d.stats.shift, 0.5);
  assert.equal(d.decision, 'block2', d.reason);
  // 3-arm block: 3 vs 3, U = 0 has p = 1/20 > 1/70 -> never a block-1 win
  d = sequentialDecision({ blocks: [{ control: [40, 42, 44], variant: [20, 22, 24] }], unit: 'ms' });
  assert.equal(d.decision, 'block2');
  close(d.stats.p, 1 / 20);
  // higher is better (fps)
  assert.equal(sequentialDecision({ blocks: [{ control: [50, 51, 52, 53], variant: [60, 61, 62, 63] }], dir: 'higher', unit: 'count', minShift: 2 }).decision, 'win');
});

// block 1 = U 1 (41 > 40), medians 43 (k 5) vs 33 (k 4): neither win nor futile -> block 2 is due
const B1_CONT = { control: [40, 42, 44, 46], variant: [30, 32, 34, 41] };
// block 1 with equal tick medians and HL 2 > 0 -> block 2 is due
const B1_SUBTICK = { control: [40, 41, 42, 43], variant: [38, 39, 40, 41] };

test('sequential decision, block 2: stratified p and HL >= 1 tick; no-win with a small shift', () => {
  // HOT2 = U 0, differences 9 + 2(i - j). T = 1/9: P(U1 + U2 <= 1) = 3/4900. Pooled 32 differences of
  // B1_CONT (10,12,14,16, 8,10,12,14, 6,8,10,12, -1,1,3,5) and HOT2 (3,5,5,7,7,7,9,9,9,9,11,...): 16th/17th = 9
  const HOT2 = { control: [50, 52, 54, 56], variant: [41, 43, 45, 47] };
  let d = sequentialDecision({ blocks: [B1_CONT, HOT2], unit: 'ms' });
  assert.equal(d.decision, 'win', d.reason);
  assert.equal(d.stoppedAt, undefined);
  close(d.stats.p, 3 / 4900);
  assert.equal(d.stats.shift, 9);
  assert.equal(d.stats.test, 'exact van Elteren, one-sided, stratified by block');
  assert.equal(d.stats.aligned.test, 'aligned Mann-Whitney (diagnostic)');
  // B1_SUBTICK + HOT: pooled differences -1,0,0,0,1,1,1,2x6,3,3,3,4x5,...: 16th/17th = 3, 4 -> HL 3.5 < 1 tick
  d = sequentialDecision({ blocks: [B1_SUBTICK, HOT], unit: 'ms' });
  assert.equal(d.decision, 'no-win', d.reason);
  assert.match(d.reason, /HL 3.5 \(need p <= 0.05, HL >= 8.333\)/);
  assert.match(d.rule, /a third block only by the lead/);
  assert.equal(sequentialDecision({ blocks: [B1_SUBTICK, HOT], unit: 'ms', minShift: 3 }).decision, 'win');
  // the reverse direction of COOL/HOT is the forward p by symmetry: 2/4900
  close(compareBlocks([{ control: COOL.variant, variant: COOL.control }, { control: HOT.variant, variant: HOT.control }]).pWorse, 2 / 4900);
  assert.throws(() => sequentialDecision({ blocks: [COOL, COOL, COOL] }), /at most 2 blocks/);
  assert.throws(() => sequentialDecision({ blocks: [COOL], unit: 'fps' }), /bad unit/);
  assert.throws(() => sequentialDecision({ blocks: [COOL], dir: 'down' }), /bad dir/);
});

test('block orders: ABBA C V V C C V V C; 3-arm rotated Latin square C A B / A B C / B C A', () => {
  assert.deepEqual(blockOrder(2), ['C', 'V', 'V', 'C', 'C', 'V', 'V', 'C']);
  assert.deepEqual(blockOrder(3), ['C', 'A', 'B', 'A', 'B', 'C', 'B', 'C', 'A']);
  for (const arm of ['C', 'A', 'B']) assert.equal(blockOrder(3).filter((x) => x === arm).length, 3);
  assert.throws(() => blockOrder(4), /2 or 3 arms/);
});

test('review-stats blocker 2: a block 1 that already stopped stands; block 2 never re-opens it', () => {
  // the review's input: block 1 is futile (medians 40 -> k 5 vs 51 -> k 6); with a strong block 2 the
  // stratified rule alone would say WIN (van Elteren p 0.021, HL 16)
  const futile1 = { control: [20, 20, 60, 60], variant: [10, 50, 52, 52] };
  const strong2 = { control: [40, 42, 44, 46], variant: [20, 22, 24, 26] };
  assert.equal(sequentialDecision({ blocks: [futile1], unit: 'ms' }).decision, 'futile');
  let d = sequentialDecision({ blocks: [futile1, strong2], unit: 'ms' });
  assert.equal(d.decision, 'futile', d.reason);
  assert.equal(d.stoppedAt, 1);
  assert.match(d.reason, /^block 1 stopped \(futile\): variant median worse \(medians 5 vs 6 ticks\); block 2 is outside the protocol \(lead only\)/);
  // a block-1 win followed by an unneeded block 2 stays a win of block 1 (not a fresh stratified verdict)
  d = sequentialDecision({ blocks: [COOL, HOT], unit: 'ms' });
  assert.deepEqual([d.decision, d.stoppedAt], ['win', 1]);
  assert.equal(d.stats.test, 'exact Mann-Whitney, one-sided');
  // the CLI says the same
  const r = node(tool('stats.mjs'), ['decide', '--c', '20,20,60,60', '--v', '10,50,52,52', '--c', '40,42,44,46', '--v', '20,22,24,26']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^DECISION FUTILE: block 1 stopped \(futile\)/m);
});

test('review-stats blocker 1: non-finite or missing run values throw, never count as an improvement', () => {
  // the review's input 3: a NaN in the variant arm
  const nanBlock = { control: [40, 42, 44, 46], variant: [30, 32, 34, NaN] };
  assert.throws(() => sequentialDecision({ blocks: [nanBlock] }), /sequentialDecision: block 1 variant: run 4 has no finite value \(NaN\)/);
  assert.throws(() => stratifiedShift([nanBlock]), /no finite value/);
  assert.throws(() => vanElteren([nanBlock]), /no finite value/);
  assert.throws(() => aligned([nanBlock]), /no finite value/);
  assert.throws(() => compareBlock([40, null, 44, 46], [30, 32, 34, 36]), /control: run 2 has no finite value \(null\)/);
  assert.throws(() => sequentialDecision({ blocks: [COOL, { control: [1, 2, 3, 4], variant: [1, 2, undefined, 4] }] }), /block 2 variant: run 3/);
  // the review's inputs 1 and 2: four counted V runs with empty frame logs (k5 would read 0, p50Ms null)
  const run = (arm, nLong, extra = {}) => ({ block: 1, arm, warmup: false, void: false, source: `${arm}${nLong}.json`, ...extra, frames: nLong == null ? [] : [...Array(nLong).fill(40), 16, 16].map((dt) => ({ dt })) });
  const runs = [run('C', 6), run('V', null), run('V', null), run('C', 7), run('C', 7), run('V', null), run('V', null), run('C', 8)];
  for (const metric of ['k5', 'p50Ms']) assert.throws(() => blocksFromRuns(runs, metric), /4 counted run\(s\) have no frames with a finite frame time in the phase .*void them or fix the log/);
  // voided empty runs are fine (T2 voids them); a file with marks but none for the phase has no frames + a warning
  assert.doesNotThrow(() => blocksFromRuns(runs.map((r) => (r.frames.length ? r : { ...r, void: true })), 'k5'));
  const [noPhase] = runsFromJson({ frames: [[0, 40, 0, 10, 775]], marks: { idle: [0, 1] }, meta: { arm: 'V', block: 1 } });
  assert.deepEqual([noPhase.frames.length, noPhase.warning], [0, 'no marks.scroll (has idle)']);
  assert.throws(() => blocksFromRuns([noPhase, run('C', 6)], 'k5'), /no marks.scroll/);
  const [noMarks] = runsFromJson({ frames: [[0, 40, 0, 10, 775]], meta: {} });
  assert.match(noMarks.warning, /no marks: all 1 frames used/);
  const [all] = runsFromJson({ frames: [[0, 40, 0, 10, 775]], marks: { idle: [0, 1] } }, { phase: 'all' });
  assert.deepEqual([all.frames.length, all.warning], [1, undefined]);
});

test('review-stats round 2: frames whose dt are all non-finite throw; partly non-finite runs are listed; block ids sort numerically', () => {
  const run = (arm, frames, extra = {}) => ({ block: 1, arm, warmup: false, void: false, source: `${arm}.json`, ...extra, frames });
  const longs = (n) => [...Array(n).fill(40), 16, 16].map((dt) => ({ dt }));
  // the review's failing input: four V runs with frames [{dt:null},{dt:NaN},{dt:undefined}] vs controls k5 6,7,7,8 (was a WIN, k5 = 0)
  const bad = [{ dt: null }, { dt: NaN }, { dt: undefined }];
  const runs = [run('C', longs(6)), run('V', bad), run('V', bad), run('C', longs(7)), run('C', longs(7)), run('V', bad), run('V', bad), run('C', longs(8))];
  for (const metric of ['k5', 'k7', 'gt34', 'p50Ms', 'p95Ticks']) assert.throws(() => blocksFromRuns(runs, metric), /4 counted run\(s\) have no frames with a finite frame time .*V.json: 3 frame\(s\), dt all non-finite.*void them or fix the log/);
  // partly non-finite: scored on the finite frames, listed in `partial`
  const some = runs.map((r) => (r.arm === 'V' ? { ...r, frames: [...longs(3), { dt: null }] } : r));
  const g = blocksFromRuns(some, 'k5');
  assert.deepEqual(g.arms.V[0].variant, [3, 3, 3, 3]);
  assert.equal(g.partial.length, 4);
  assert.deepEqual(g.partial[0], { source: 'V.json', block: 1, arm: 'V', frames: 6, finite: 5 });
  // nit a: block ids in numeric-aware order, null first (was file order for strings)
  assert.deepEqual([10, 2, null, 1].sort(compareBlockIds), [null, 1, 2, 10]);
  assert.deepEqual(['b10', 'b2', 'b1'].sort(compareBlockIds), ['b1', 'b2', 'b10']);
  const two = (id, c, v) => [run('C', longs(c), { block: id }), run('V', longs(v), { block: id })];
  const sb = blocksFromRuns([...two('b10', 9, 1), ...two('b2', 5, 2)], 'k5');
  assert.deepEqual(sb.arms.V.map((x) => x.block), ['b2', 'b10']);
  assert.deepEqual(blockWarnings([...two('b10', 9, 1), ...two('b2', 5, 2)]).filter((w) => /warm-up/.test(w)), ['block b2: 0 warm-up runs (expected 1)', 'block b10: 0 warm-up runs (expected 1)']);
  // Chrome: every tick or legacy metric has a twin, both ways (arch-unknowns U2); the phone's +-4 ms counts have none there
  for (const m of Object.keys(METRICS).filter((x) => !['gt30', 'gt38', 'gt46', 'gt54'].includes(x))) assert.equal(TWIN[TWIN[m]], m, `${m} has a twin`);
  assert.deepEqual([twinsFor('k7'), twinsFor('gt50'), twinsFor('gt46'), twinsFor('p50Ms')], [['gt50'], ['k7'], [], ['p50Ticks']]);
  // phone: no k forms; gt50 and gt34 at +-4 ms
  assert.deepEqual([twinsFor('gt50', 'phone'), twinsFor('gt34', 'phone'), twinsFor('p50Ms', 'phone'), twinsFor('gt46', 'phone')], [['gt46', 'gt54'], ['gt30', 'gt38'], [], []]);
  for (const k of K_FORMS) assert.deepEqual(twinsFor(k, 'phone'), []);
  for (const ts of Object.values(PHONE_TWINS)) for (const m of ts) assert.ok(METRICS[m] && !K_FORMS.has(m), m);
  assert.deepEqual([twinKind('k5'), twinKind('gt50'), twinKind('p50Ms'), twinKind('p95Ticks')], ['threshold-sensitive', 'threshold-sensitive', 'tick-sensitive', 'tick-sensitive']);
});

test('van Elteren weights matter: 4v4 U = 1 (w 1/9) + 3v3 U = 0 (w 1/7) -> 2/1400 (unweighted would be 3/1400)', () => {
  // T = 1/9; splits with T* <= 1/9: (U1, U2) = (0, 0), (1, 0); (0, 1) has T* = 1/7 > 1/9
  const r = vanElteren([{ control: [40, 42, 44, 46], variant: [30, 32, 34, 41] }, { control: [9, 10, 11], variant: [1, 2, 3] }]);
  close(r.p, 2 / 1400);
  close(vanElteren([{ control: [9, 10, 11], variant: [1, 2, 3] }, { control: [40, 42, 44, 46], variant: [30, 32, 34, 41] }]).p, 2 / 1400, 1e-12);
});

test('crossings: y = top - f * base per unit (ih = frame innerHeight, lvh/svh = device), run tops override, delta sign', () => {
  const io = { id: 'io', top: 2000, f: 0.5, unit: 'ih' };
  const st = { id: 'st', top: 3000, f: 1, unit: 'lvh' };
  const viewport = { lvh: 815, svh: 775 };
  assert.deepEqual(crossingY(io, 775), { y: 1612.5, topSource: 'static' });
  assert.deepEqual(crossingY(io, 815), { y: 1592.5, topSource: 'static' }, 'ih follows the toolbar');
  assert.deepEqual(crossingY(st, 775, { viewport }), { y: 2185, topSource: 'static' }, 'lvh does not');
  assert.equal(crossingY({ ...st, unit: 'svh' }, 815, { viewport }).y, 2225);
  assert.equal(crossingY({ ...io, unit: 'dvh' }, 775).y, 1612.5);
  assert.deepEqual(crossingY(io, 775, { tops: { io: 2100 } }), { y: 1712.5, topSource: 'run' });
  assert.deepEqual(crossingY({ id: 'abs', y: 500 }, 775), { y: 500, topSource: 'absolute' });
  assert.throws(() => crossingY({ ...st, unit: 'svh' }, 775, { viewport: { lvh: 815 } }), /needs viewport.svh/);
  assert.throws(() => crossingY({ id: 'x', f: 0 }, 775), /no top/);
  assert.throws(() => crossingY({ ...io, unit: 'vw' }, 775), /bad unit/);
  const ths = [io, st, { id: 'abs', y: 500 }];
  const fr = (yStart, yEnd, ih = 775) => ({ t: 0, dt: 40, yStart, yEnd, innerHeight: ih });
  assert.deepEqual(placeFrame(fr(1600, 1620), ths, { viewport }).nearest, { id: 'io', unit: 'ih', y: 1612.5, delta: 0, topSource: 'static' });
  assert.equal(placeFrame(fr(1620, 1640), ths, { viewport }).nearest.delta, 7.5, 'past the threshold: +');
  assert.equal(placeFrame(fr(1590, 1600), ths, { viewport }).nearest.delta, -12.5, 'before it: -');
  assert.equal(placeFrame(fr(1640, 1620), ths, { viewport }).nearest.delta, 7.5, 'scrolling up: same interval');
  assert.equal(placeFrame(fr(2180, 2200), ths, { viewport }).nearest.id, 'st');
  assert.equal(placeFrame(fr(520, 530), ths, { viewport }).nearest.delta, 20);
  const placed = placeFrames([fr(1600, 1620), { ...fr(2180, 2200), dt: 37.4 }, { ...fr(510, 530), dt: 60 }], ths, { viewport });
  assert.deepEqual(placed.map((p) => [p.crossing, p.k, p.delta]), [['io', 5, 0], ['abs', 7, 10]], 'frames under 37.5 ms are left out');
  // --y-source none: yStart/yEnd null -> not placed (Math.min(null, null) used to read as y = 0)
  const noY = { ...fr(null, null), dt: 60 };
  assert.deepEqual(placeFrame(noY, ths, { viewport }), { nearest: null, all: [], noY: true });
  assert.deepEqual(placeFrames([noY], ths, { viewport }).map((p) => [p.noY, p.crossing, p.delta]), [[true, null, null]]);
});

test('input: Chrome [t, dt, y] and §5.5 tuples and objects normalise; iPhone run files; blocks per arm', () => {
  assert.deepEqual(normalizeFrame([10, 40, 120], 100, 932), { t: 10, dt: 40, yStart: 100, yEnd: 120, innerHeight: 932, m: null, jsMs: null, probeMs: null, docH: null });
  assert.deepEqual(normalizeFrame([10, 40, 100, 120, 775, 0.5, 3, 0.2]), { t: 10, dt: 40, yStart: 100, yEnd: 120, innerHeight: 775, m: 0.5, jsMs: 3, probeMs: 0.2, docH: null });
  // fw-iphone-run/1 final fields (ts-iphone-run e96e5b5): docH appended; rafJsMs read as jsMs
  assert.deepEqual(normalizeFrame([10, 40, 100, 120, 775, 0.5, 3, 0.2, 5600]), { t: 10, dt: 40, yStart: 100, yEnd: 120, innerHeight: 775, m: 0.5, jsMs: 3, probeMs: 0.2, docH: 5600 });
  assert.deepEqual(normalizeFrame({ t: 1, dt: 2, yStart: 0, yEnd: 4, rafJsMs: 3, docH: 9 }), { t: 1, dt: 2, yStart: 0, yEnd: 4, innerHeight: null, m: null, jsMs: 3, probeMs: null, docH: 9 });
  assert.deepEqual(normalizeFrame({ t: 1, dt: 2, y: 5 }, 3), { t: 1, dt: 2, yStart: 3, yEnd: 5, innerHeight: null, m: null, jsMs: null, probeMs: null, docH: null });
  const v = runsFromJson({ results: [{ label: 'base', run: 0, frameLog: { scroll: [[0, 16, 0], [16, 40, 30]] } }, { diff: true }] }, { innerHeight: 932 });
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].frames[1], { t: 16, dt: 40, yStart: 0, yEnd: 30, innerHeight: 932, m: null, jsMs: null, probeMs: null, docH: null });
  const ip = runsFromJson({ frames: [[0, 16, 0, 0, 775, null, 1], [16, 40, 0, 30, 775, null, 2], [56, 16, 30, 40, 775, null, 1]], marks: { scroll: [10, 60] }, meta: { label: 'x', block: 1, arm: 'V', driver: 'S' }, tops: { io: 1 } });
  assert.deepEqual([ip[0].frames.length, ip[0].arm, ip[0].block, ip[0].driver, ip[0].tops.io], [2, 'V', 1, 'S', 1]);
  // blocks from runs: k>=5 count per run; the warm-up and a voided run are skipped
  const run = (block, arm, nLong, extra = {}) => ({ block, arm, warmup: false, void: false, ...extra, frames: [...Array(nLong).fill(40), 16, 16].map((dt) => ({ dt })) });
  const runs = [run(1, 'C', 9, { warmup: true }), run(1, 'C', 6), run(1, 'V', 3), run(1, 'V', 4), run(1, 'C', 7), run(1, 'C', 7), run(1, 'V', 4), run(1, 'V', 4), run(1, 'C', 8), run(1, 'V', 1, { void: true })];
  const by = blocksFromRuns(runs, 'k5');
  assert.deepEqual(by, { arms: { V: [{ block: 1, control: [6, 7, 7, 8], variant: [3, 4, 4, 4] }] }, dropped: [], partial: [] });
  assert.throws(() => blocksFromRuns(runs, 'fps'), /unknown metric/);
  assert.throws(() => blocksFromRuns([run(1, null, 1)], 'k5'), /no arm/);
  // a block whose controls are all voided is dropped and reported, not silently skipped
  const two = [...runs, run(2, 'C', 6, { void: true }), run(2, 'V', 3), run(2, 'C', 7, { void: true })];
  assert.deepEqual(blocksFromRuns(two, 'k5').dropped, [{ arm: 'V', block: 2, reason: '0 counted control and 1 counted V run(s)' }]);
});

test('blockWarnings: n per arm, one warm-up first, ABBA order by pos, missing sentinel records', () => {
  const order = blockOrder(2);
  const ok = [{ block: 1, arm: 'C', warmup: true, void: false, pos: 0, sentinel: { pass: true }, driver: 'S' }, ...order.map((arm, i) => ({ block: 1, arm, warmup: false, void: false, pos: i + 1, sentinel: arm === 'C' ? { pass: true } : null, driver: 'S' }))];
  assert.deepEqual(blockWarnings(ok), []);
  const noSentinel = ok.map((r) => ({ ...r, sentinel: null }));
  assert.deepEqual(blockWarnings(noSentinel), ['block 1: sentinel not checked here (T2 sets void); 4 control run(s) carry no sentinel record']);
  const swapped = ok.map((r) => (r.pos === 1 ? { ...r, pos: 2 } : r.pos === 2 ? { ...r, pos: 1 } : r));
  assert.deepEqual(blockWarnings(swapped), ['block 1: run order V C V C C V V C is not C V V C C V V C']);
  const late = ok.map((r) => (r.warmup ? { ...r, pos: 9 } : r));
  assert.ok(blockWarnings(late).includes('block 1: the warm-up is not before the first counted run'));
  const short = ok.filter((r) => r.pos !== 8);
  assert.ok(blockWarnings(short).includes('block 1: arm C has 3 counted runs (expected 4)'));
  assert.ok(blockWarnings(ok.filter((r) => !r.warmup)).includes('block 1: 0 warm-up runs (expected 1)'));
  assert.ok(blockWarnings(ok.map((r) => ({ ...r, pos: null }))).includes('block 1: run positions (meta.pos) missing: order not checked'));
  const latin = blockOrder(3).map((arm, i) => ({ block: 2, arm, warmup: false, void: false, pos: i + 1, sentinel: 1, driver: 'W' }));
  assert.deepEqual(blockWarnings([{ block: 2, arm: 'C', warmup: true, pos: 0, driver: 'W' }, ...latin]), []);
});

test('stats.mjs CLI: ticks, summary, decide (1 and 2 blocks, --json), runs over a dir, place, usage errors', () => {
  let r = node(tool('stats.mjs'), ['ticks', '16.7', '37.5', '54.2']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ticks 2 5 7 {2}\| k>=5 2 {2}k>=7 1/m);
  r = node(tool('stats.mjs'), ['summary', '1,2,3,4']);
  assert.match(r.stdout, /median 2.5 \[1.75-3.25\] {2}IQR 1.5/);
  r = node(tool('stats.mjs'), ['decide', '--c', '40,42,44,46', '--v', '30,32,34,36']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^DECISION WIN: U = 0, p 0.014, HL 10 >= 8.333$/m);
  assert.match(r.stdout, /test: exact Mann-Whitney, one-sided; platform chrome; dir lower .* unit ms; min shift 8.333; medians compared as ticks/);
  r = node(tool('stats.mjs'), ['decide', '--c', '40,41,42,43', '--v', '38,39,40,41', '--c', '50,52,54,56', '--v', '44,46,48,50', '--json']);
  const j = JSON.parse(r.stdout);
  assert.equal(j.decision, 'no-win');
  assert.equal(j.stats.test, 'exact van Elteren, one-sided, stratified by block');
  r = node(tool('stats.mjs'), ['decide', '--c', '40,42,44,46', '--v', '30,32,34,41', '--c', '50,52,54,56', '--v', '41,43,45,47']);
  assert.match(r.stdout, /^DECISION WIN: van Elteren p 0.001 <= 0.05, HL 9 >= 8.333$/m);
  assert.match(r.stdout, /aligned \(diagnostic\): U /);
  r = node(tool('stats.mjs'), ['decide', '--c', '40,42,44,NaN', '--v', '30,32,34,36']);
  assert.equal(r.code, 2, 'a NaN is refused at parse time');
  assert.equal(node(tool('stats.mjs'), ['decide', '--c', '1,2']).code, 2);
  assert.equal(node(tool('stats.mjs'), ['decide', '--c', '1,x', '--v', '1']).code, 2);
  assert.equal(node(tool('stats.mjs'), []).code, 2);

  const d = tempDir('fw-stats-');
  mkdirSync(join(d, 'blk'));
  const frames = (nLong) => { const out = []; let t = 0, y = 0; for (let i = 0; i < 20; i++) { const dt = i < nLong ? 40 : 16; out.push([t, dt, y, y + 10, 775, null, 1]); t += dt; y += 10; } return out; };
  const order = blockOrder(2), longs = { C: [6, 7, 7, 8], V: [3, 4, 4, 4] }, seen = { C: 0, V: 0 };
  writeFileSync(join(d, 'blk', 'r00-warm.json'), JSON.stringify({ frames: frames(12), meta: { block: 1, arm: 'C', warmup: true, pos: 0 } }));
  order.forEach((arm, i) => writeFileSync(join(d, 'blk', `r${String(i + 1).padStart(2, '0')}.json`), JSON.stringify({ frames: frames(longs[arm][seen[arm]++]), meta: { block: 1, arm, pos: i + 1, driver: 'S' } })));
  writeFileSync(join(d, 'blk', 'r99-truncated.json'), '{"frames": [[0, 4');
  r = node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--device', 'chrome', '--metric', 'k5']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /WARN unreadable JSON skipped: .*r99-truncated.json/);
  assert.match(r.stdout, /9 run\(s\), 1 warm-up\/void skipped, 1 unreadable/);
  assert.match(r.stdout, /^WARN unreadable JSON skipped: .*r99-truncated.json$/m);
  assert.match(r.stdout, /^WARN block 1: sentinel not checked here \(T2 sets void\); 4 control run\(s\) carry no sentinel record$/m);
  assert.doesNotMatch(r.stdout, /threshold-sensitive|run order/);
  assert.match(r.stdout, /^arm V vs C: DECISION WIN: U = 0, p 0.014, HL 3 >= 1$/m);
  const rj = JSON.parse(node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--device', 'chrome', '--metric', 'k5', '--json']).stdout);
  assert.deepEqual([rj.twin, rj.thresholdSensitive, rj.unreadable.length, rj.dropped], ['gt34', false, 1, []]);
  // threshold-sensitive: 35 ms frames are legacy ">34" but k = 4; variant runs carry them instead of 40 ms ones
  mkdirSync(join(d, 'ts'));
  const fr2 = (n40, n35) => frames(0).map((x, i) => (i < n40 ? [x[0], 40, ...x.slice(2)] : i < n40 + n35 ? [x[0], 35, ...x.slice(2)] : x));
  seen.C = 0; seen.V = 0;
  order.forEach((arm, i) => writeFileSync(join(d, 'ts', `r${i}.json`), JSON.stringify({ frames: arm === 'C' ? fr2(longs.C[seen.C++], 0) : fr2(longs.V[seen.V], 6 - longs.V[seen.V++] + 4), meta: { block: 1, arm, pos: i + 1 } })));
  r = node(tool('stats.mjs'), ['runs', join(d, 'ts'), '--device', 'chrome', '--metric', 'k5']);
  assert.match(r.stdout, /^WARN threshold-sensitive: arm V: k5 win vs gt34 futile$/m);
  assert.match(r.stdout, /^ {2}both ways: k5 WIN \| gt34 FUTILE \(.*\) {2}THRESHOLD-SENSITIVE$/m);
  // both ways also when the twins agree (arch-unknowns U2), and for p50Ms / p50Ticks
  r = node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--device', 'chrome', '--metric', 'gt34']);
  assert.match(r.stdout, /^ {2}both ways: gt34 WIN \| k5 WIN \(U = 0, p 0.014, HL 3 >= 1\)$/m);
  r = node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--device', 'chrome', '--metric', 'p50Ms', '--json']);
  const pj = JSON.parse(r.stdout);
  assert.deepEqual([pj.twin, pj.sensitivity, pj.twinSensitive, pj.thresholdSensitive, Object.keys(pj.twinArms)], ['p50Ticks', 'tick-sensitive', false, undefined, ['V']]);
  // partly non-finite frame times: warned, scored on the finite ones
  mkdirSync(join(d, 'part'));
  order.forEach((arm, i) => writeFileSync(join(d, 'part', `r${i}.json`), JSON.stringify({ frames: [...frames(arm === 'C' ? 7 : 3), ...(i === 1 ? [[999, null, 0, 0, 775]] : [])], meta: { block: 1, arm, pos: i + 1 } })));
  r = node(tool('stats.mjs'), ['runs', join(d, 'part'), '--device', 'chrome', '--metric', 'k5']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^WARN .*r1.json \(block 1, arm V\): 1 of 21 frame time\(s\) not finite; scored on 20$/m);
  // the review's input via the CLI: V runs whose frame times are all null -> error, not a WIN
  mkdirSync(join(d, 'nul'));
  order.forEach((arm, i) => writeFileSync(join(d, 'nul', `r${i}.json`), JSON.stringify({ frames: arm === 'C' ? frames(7) : frames(0).map((x) => [x[0], null, ...x.slice(2)]), meta: { block: 1, arm, pos: i + 1 } })));
  r = node(tool('stats.mjs'), ['runs', join(d, 'nul'), '--device', 'chrome', '--metric', 'k5']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /4 counted run\(s\) have no frames with a finite frame time .*dt all non-finite/);
  // a counted run with no frames in the phase is an error, not a zero
  writeFileSync(join(d, 'blk', 'r05.json'), JSON.stringify({ frames: frames(4), marks: { idle: [0, 1] }, meta: { block: 1, arm: 'V', pos: 5 } }));
  r = node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--device', 'chrome', '--metric', 'k5']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /1 counted run\(s\) have no frames with a finite frame time in the phase .*r05.json: no marks.scroll/);
  assert.equal(node(tool('stats.mjs'), ['runs', join(d, 'blk')]).code, 2, '--metric is required');

  writeFileSync(join(d, 'th.json'), JSON.stringify({ viewport: { lvh: 815, svh: 775 }, thresholds: [{ id: 'io', top: 400, f: 0.5, unit: 'ih' }, { id: 'abs', y: 15 }] }));
  writeFileSync(join(d, 'tops.json'), JSON.stringify({ frames: frames(3), meta: { label: 'p', run: 2 }, tops: { io: 410 } }));
  r = node(tool('stats.mjs'), ['place', join(d, 'tops.json'), '--thresholds', join(d, 'th.json'), '--json']);
  assert.equal(r.code, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.equal(p.minDt, 37.5);
  // frames 0-2 are long: y 0->10 (abs 15: delta -5), 10->20 (abs 15 inside: 0), 20->30 (abs: +5; io at 410 - 387.5 = 22.5: 0)
  assert.deepEqual(p.runs[0].frames.map((x) => [x.crossing, x.delta, x.topSource]), [['abs', -5, 'absolute'], ['abs', 0, 'absolute'], ['io', 0, 'run']]);
  r = node(tool('stats.mjs'), ['place', join(d, 'tops.json'), '--thresholds', join(d, 'th.json')]);
  assert.match(r.stdout, /io @ 22.5 \[ih, top run\] {2}delta 0/);
  writeFileSync(join(d, 'noy.json'), JSON.stringify({ frames: frames(2).map((x) => [x[0], x[1], null, null, 775, null, 1, 0.1, null]), meta: { label: 'n', ySource: 'none' } }));
  r = node(tool('stats.mjs'), ['place', join(d, 'noy.json'), '--thresholds', join(d, 'th.json')]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^WARN .*noy.json: 2 of 2 frame\(s\) have no scroll position \(y source none\?\): not placed$/m);
  assert.match(r.stdout, /^ {2}dt 40 \(k 5\) {2}no y: not placed$/m);
  assert.equal(node(tool('stats.mjs'), ['place', join(d, 'tops.json')]).code, 2);
});

test('phone: medians compare raw (no ticks), legacy drivers, legacy finger rows, mixed-driver warning (F-071)', () => {
  // 35 vs 36 ms: one tick (4) apart in neither, so as ticks the medians tie and HL 4 > 0 goes on to block 2;
  // raw, the variant median is worse: futile. HL by hand: improvements -6 x6, 4 x6, 10 x2, 20 x2 -> median 4.
  const b = { control: [30, 30, 40, 40], variant: [36, 36, 36, 20] };
  let d = sequentialDecision({ blocks: [b], unit: 'ms' });
  assert.equal(d.decision, 'block2', d.reason);
  assert.match(d.reason, /medians 4 vs 4 ticks/);
  d = sequentialDecision({ blocks: [b], unit: 'ms', medianCompare: 'raw' });
  assert.equal(d.decision, 'futile', d.reason);
  assert.equal(d.stats.choices.medianCompare, 'raw');
  assert.throws(() => sequentialDecision({ blocks: [b], unit: 'ms', medianCompare: 'k' }), /bad medianCompare/);
  assert.throws(() => sequentialDecision({ blocks: [b], unit: 'ms', platform: 'tv' }), /bad platform/);
  // phone ms metrics (arch-claims): min shift 4 ms, medians in whole ms. Medians 35.1 vs 35.4 differ by < 1 ms:
  // a tie (35 vs 35), and HL 4.8 > 0 -> block 2, not futile (raw they'd be futile). HL by hand: -5.4 x6, 4.8 x6,
  // 10 x2, 20.2 x2 -> 4.8.
  const sub1 = { control: [30, 30, 40.2, 40.2], variant: [35.4, 35.4, 35.4, 20] };
  d = sequentialDecision({ blocks: [sub1], unit: 'ms', platform: 'phone' });
  assert.equal(d.decision, 'block2', d.reason);
  assert.match(d.reason, /medians 35 vs 35 ms \(whole ms\)/);
  assert.deepEqual([d.stats.choices.platform, d.stats.choices.minShift, d.stats.choices.medianCompare], ['phone', 4, 'ms1']);
  assert.equal(sequentialDecision({ blocks: [sub1], unit: 'ms', platform: 'phone', medianCompare: 'raw' }).decision, 'futile');
  // HL 5 ms with U = 0 at 4 vs 4: meets the phone's 4 ms, not Chrome's 8.333 (Chrome: medians 5 vs 4 ticks -> block 2)
  const hl5 = { control: [40, 41, 42, 43], variant: [35, 36, 37, 38] };
  d = sequentialDecision({ blocks: [hl5], unit: 'ms', platform: 'phone' });
  assert.equal(d.decision, 'win', d.reason);
  assert.match(d.reason, /HL 5 >= 4$/);
  d = sequentialDecision({ blocks: [hl5], unit: 'ms' });
  assert.equal(d.decision, 'block2', d.reason);
  assert.deepEqual([d.stats.choices.platform, d.stats.choices.minShift, d.stats.choices.medianCompare], ['chrome', 8.333333333333334, 'ticks']);
  // counts and an explicit minShift are unchanged by the platform
  d = sequentialDecision({ blocks: [{ control: [6, 7, 7, 8], variant: [3, 4, 4, 4] }], unit: 'count', platform: 'phone' });
  assert.deepEqual([d.decision, d.stats.choices.minShift, d.stats.choices.medianCompare], ['win', 1, 'raw']);
  assert.equal(sequentialDecision({ blocks: [hl5], unit: 'ms', platform: 'phone', minShift: 6 }).decision, 'block2');
  // device and driver per run; files from before T1a: record -> F, scroll -> S, else unknown
  assert.deepEqual([driverOf({ meta: { driver: 'M' } }), driverOf({ summary: { whileScrollYChanges: {} } }), driverOf({ maxY: 9, marks: { scroll: [0, 1] } }), driverOf({ frames: [] })], ['M', 'F', 'S', null]);
  assert.equal(runsFromJson({ results: [{ label: 'a', run: 1, frameLog: { scroll: [[0, 16, 0]] } }] })[0].device, 'chrome');
  // the platform comes from the data: meta.device first (iphone-run.mjs DEVICE, legacy files), else a frame-log file is phone
  assert.deepEqual([
    deviceOf({ results: [] }), deviceOf({ frames: [], meta: { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', schema: 'fw-iphone-run/1' } }),
    deviceOf({ frames: [], meta: { device: 'HeadlessChrome 154 (430x775 emulation)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } }),
    deviceOf({ frames: [] }),
  ], ['chrome', 'phone', 'chrome', 'phone']);
  // a name that mentions two platforms: simulator first, then Chrome, then the phone patterns (review-stats on ae62afa)
  assert.deepEqual([
    deviceOf({ frames: [], meta: { device: 'HeadlessChrome 154, iPhone 15 emulation' } }),
    deviceOf({ frames: [], meta: { device: 'iOS Simulator (iPhone 15 Pro Max, iOS 26.0)' } }),
    deviceOf({ frames: [], meta: { device: 'Safari on iPhone' } }),
  ], ['chrome', 'simulator', 'phone']);
  // no (or an unknown) meta.device: phone assumed, and said so; a named device or verify.json is not assumed
  assert.deepEqual([
    deviceAssumed({ frames: [] }), deviceAssumed({ frames: [], meta: { device: 'Pixel 9' } }), deviceAssumed({ results: [] }),
    deviceAssumed({ frames: [], meta: { device: 'iPhone 15 Pro Max' } }), deviceAssumed({ frames: [], meta: { device: 'simulator' } }),
  ], [true, true, false, false, false]);
  assert.deepEqual([runsFromJson({ frames: [[0, 16, 0]] }, { phase: 'all' })[0].deviceAssumed, 'deviceAssumed' in runsFromJson({ frames: [[0, 16, 0]], meta: { device: 'iPhone 15' } }, { phase: 'all' })[0]], [true, false]);
  assert.equal(runsFromJson({ frames: [[0, 16, 0]], meta: { device: 'Chrome 154' } }, { phase: 'all' })[0].device, 'chrome');
  // a legacy finger row [t, dt, y, innerHeight] is not a fw-iphone-run/1 tuple: y is y, innerHeight is innerHeight
  const fin = runsFromJson({ frames: [[0, 16, 0, 775], [16, 40, 30, 815]], summary: { whileScrollYChanges: {} }, meta: {} }, { phase: 'all' })[0];
  assert.deepEqual([fin.device, fin.driver, fin.frames[1].yStart, fin.frames[1].yEnd, fin.frames[1].innerHeight], ['phone', 'F', 0, 30, 815]);
  const v1 = runsFromJson({ fields: ['t', 'dt', 'yStart', 'yEnd'], frames: [[0, 16, 5, 9]], meta: { driver: 'S' } }, { phase: 'all' })[0];
  assert.deepEqual([v1.frames[0].yStart, v1.frames[0].yEnd, v1.frames[0].innerHeight], [5, 9, null]);
  // F-071: one block mixing drivers is warned (counted runs only; '?' = no meta.driver)
  const order = blockOrder(2);
  const blk = (drv, b = 1, warm = 'S') => [{ block: b, arm: 'C', warmup: true, pos: 0, driver: warm, sentinel: 1 }, ...order.map((arm, i) => ({ block: b, arm, warmup: false, void: false, pos: i + 1, sentinel: 1, driver: drv(i) }))];
  assert.deepEqual(blockWarnings(blk(() => 'S')), []);
  // no driver at all, and a warm-up of another driver, are warned too
  assert.deepEqual(blockWarnings(blk(() => null, 1, null)), ['block 1: no meta.driver on its 8 counted run(s): driver unknown (a block names one driver)']);
  assert.deepEqual(blockWarnings(blk(() => 'S', 1, 'F')), ["block 1: warm-up driver F is not the counted runs' (S)"]);
  // review-stats B1: block 1 all S + block 2 all F passes each block's check, but one decision would pool them
  assert.deepEqual(blockWarnings([...blk(() => 'S', 1), ...blk(() => 'F', 2, 'F')]), ['arm V: blocks 1 S, 2 F: one decision mixes drivers (F-071)']);
  assert.deepEqual(blockWarnings([...blk(() => 'S', 1), ...blk(() => 'S', 2)]), []);
  assert.deepEqual(blockWarnings(blk((i) => (i < 6 ? 'S' : i === 6 ? 'F' : null))), ["block 1: mixed drivers ? 1, F 1, S 6 (a block names one driver; F-071: fps and frame totals of F/G and S/W/M runs don't compare; '?' = no meta.driver)"]);
});

test('stats.mjs runs on phone files: gt50 at +-4 ms, threshold-sensitive, near totals, no k forms, raw medians', () => {
  const d = tempDir('fw-stats-phone-');
  const order = blockOrder(2);
  // control runs: 6-8 frames of 52 ms; variant runs: 3-4 frames of 52 ms and 6 of 48 ms (over 46, not over 50); V near50 = 15 + 24
  const frames = (n52, n48) => { const out = []; let t = 0; for (let i = 0; i < 20; i++) { const dt = i < n52 ? 52 : i < n52 + n48 ? 48 : 16; out.push([t, dt, i * 10, i * 10 + 10, 775, null, 1, 0.1, 9000]); t += dt; } return out; };
  const longs = { C: [6, 7, 7, 8], V: [3, 4, 4, 4] }, seen = { C: 0, V: 0 };
  mkdirSync(join(d, 'p'));
  const fields = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs', 'docH'];
  const IPH = 'iPhone 15 Pro Max, iOS 26.6.1 Safari'; // as iphone-run.mjs DEVICE writes it
  writeFileSync(join(d, 'p', 'r0.json'), JSON.stringify({ fields, frames: frames(9, 0), marks: { scroll: [0, 1e9] }, meta: { device: IPH, block: 1, arm: 'C', warmup: true, pos: 0, driver: 'S' } }));
  order.forEach((arm, i) => writeFileSync(join(d, 'p', `r${i + 1}.json`), JSON.stringify({ fields, frames: arm === 'C' ? frames(longs.C[seen.C++], 0) : frames(longs.V[seen.V++], 6), marks: { scroll: [0, 1e9] }, meta: { device: IPH, block: 1, arm, pos: i + 1, driver: 'S', sentinel: { pass: true } } })));
  // gt50 wins (C 6-8 vs V 3-4); gt54 counts 0 everywhere (tie, HL 0) -> futile; gt46 (C 6-8 vs V 9-10) is worse
  let r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'gt50']);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /--device/);
  assert.match(r.stdout, /^metric gt50 \(count, lower is better\) on phone, twins gt46, gt54; 9 run\(s\), 1 warm-up\/void skipped/m);
  assert.match(r.stdout, /^arm V vs C: DECISION WIN: U = 0, p 0.014, HL 3 >= 1$/m);
  assert.match(r.stdout, /^ {2}both ways: gt50 WIN \| gt46 FUTILE \(.*\) \| gt54 FUTILE \(.*\) {2}THRESHOLD-SENSITIVE$/m);
  assert.match(r.stdout, /^WARN threshold-sensitive: arm V: gt50 win vs gt46 futile$/m);
  // review-stats B2 (§5.3, never pooled): per run, and median [IQR] per arm and block. V runs (pos 2 3 6 7):
  // near50 = 52 + 48 ms frames 9 10 10 10 -> 10 [9.75-10]; gt50 3 4 4 4 -> 4 [3.75-4]; near34 0; gt34 = near50
  assert.match(r.stdout, /^ {2}arm V block 1: near50 10 \[9.75-10\] {2}near34 0 \[0-0\] {2}gt50 4 \[3.75-4\] {2}gt34 10 \[9.75-10\]$/m);
  assert.match(r.stdout, /^ {4}pos 2 .*r2.json: 20 frames {2}near50 9 {2}near34 0 {2}gt50 3 {2}gt34 9$/m);
  assert.match(r.stdout, /^ {2}arm C block 1: near50 7 \[6.75-7.25\]/m);
  assert.doesNotMatch(r.stdout, /counted run\(s\), \d+ frames\)/, 'no frame totals pooled across runs');
  assert.doesNotMatch(r.stdout, /mixed drivers|sentinel not checked/);
  const j = JSON.parse(node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'gt50', '--json']).stdout);
  assert.deepEqual([j.device, j.medianCompare, j.twin, j.twins, j.thresholdSensitive, j.sensitiveArms, Object.keys(j.twinsArms)], ['phone', 'raw', 'gt46', ['gt46', 'gt54'], true, ['V'], ['gt46', 'gt54']]);
  assert.deepEqual(j.near.C.map((b) => [b.block, b.runs.map((x) => x.pos), b.runs.map((x) => x.near50), b.near50.median, b.near50.q1, b.near50.q3]), [[1, [1, 4, 5, 8], [6, 7, 7, 8], 7, 6.75, 7.25]]);
  assert.deepEqual(j.near.V[0].runs[0], { source: join(d, 'p', 'r2.json'), run: 0, pos: 2, frames: 20, near50: 9, near34: 0, gt50: 3, gt34: 9 });
  assert.equal(j.arms.V.stats.choices.medianCompare, 'raw');
  // a metric without a twin on the phone: decided alone
  r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'p50Ms']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ {2}both ways: p50Ms \S+ \(no twin\)$/m);
  assert.match(r.stdout, /unit ms; min shift 4; medians compared as ms1/);
  // no k forms on the phone; --device chrome reads the same files the Chrome way
  for (const k of ['k5', 'k7', 'p50Ticks', 'p95Ticks']) {
    r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', k]);
    assert.equal(r.code, 2, k);
    assert.match(r.stderr, /no k forms on the phone/);
  }
  r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'k7', '--device', 'chrome']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ {2}both ways: k7 FUTILE \| gt50 WIN \(.*\) {2}THRESHOLD-SENSITIVE$/m); // 52 ms is k = 6, not k >= 7
  assert.match(r.stdout, /^WARN PLATFORM OVERRIDE: --device chrome on phone files: Chrome rules \(k forms, 8.333 ms min shift, tick medians\) on phone data$/m);
  assert.match(r.stderr, /^WARN PLATFORM OVERRIDE: --device chrome on phone files/m);
  assert.match(r.stdout, /platform chrome;/);
  // without --device the platform comes from the data: iPhone files decide by the phone rules
  r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'p95Ms', '--json']);
  assert.deepEqual(Object.values(JSON.parse(r.stdout).arms).map((x) => [x.stats.choices.platform, x.stats.choices.minShift, x.stats.choices.medianCompare]), [['phone', 4, 'ms1']]);
  assert.doesNotMatch(r.stderr, /PLATFORM OVERRIDE/);
  assert.doesNotMatch(r.stderr, /device not recorded/);
  // the same files without meta.device (legacy logs): phone rules assumed, and a WARN says so (stderr and stdout)
  mkdirSync(join(d, 'q'));
  for (const n of readdirSync(join(d, 'p'))) { const x = JSON.parse(readFileSync(join(d, 'p', n), 'utf8')); delete x.meta.device; writeFileSync(join(d, 'q', n), JSON.stringify(x)); }
  r = node(tool('stats.mjs'), ['runs', join(d, 'q'), '--metric', 'p95Ms']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /^WARN device not recorded: phone rules assumed for 9 file\(s\) without a known meta.device \(.*r0.json, .*, \.\.\.\); pass --device to state it$/m);
  assert.match(r.stdout, /^WARN device not recorded: phone rules assumed for 9 file\(s\)/m);
  assert.match(r.stdout, /platform phone; .* min shift 4; medians compared as ms1/);
  r = node(tool('stats.mjs'), ['runs', join(d, 'q'), '--metric', 'p95Ms', '--device', 'phone']);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /device not recorded|PLATFORM OVERRIDE/);
  // decide takes bare values: --platform phone gives the phone rules; without it a NOTE says Chrome rules apply
  r = node(tool('stats.mjs'), ['decide', '--c', '40,41,42,43', '--v', '35,36,37,38', '--platform', 'phone']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^DECISION WIN: U = 0, p 0.014, HL 5 >= 4$/m);
  assert.match(r.stdout, /platform phone; .* min shift 4; medians compared as ms1/);
  assert.doesNotMatch(r.stderr, /NOTE/);
  r = node(tool('stats.mjs'), ['decide', '--c', '40,41,42,43', '--v', '35,36,37,38']);
  assert.match(r.stdout, /^DECISION BLOCK2: /m);
  assert.match(r.stderr, /^NOTE decide: platform chrome \(default\).*--platform phone/m);
  assert.equal(node(tool('stats.mjs'), ['decide', '--c', '1,2', '--v', '1,2', '--platform', 'tv']).code, 2);
  assert.equal(node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'gt50', '--device', 'tv']).code, 2);
  // phone and Chrome runs in one analysis are refused
  writeFileSync(join(d, 'p', 'verify.json'), JSON.stringify({ results: [{ label: 'a', run: 1, block: 1, arm: 'C', frameLog: { scroll: [[0, 16, 0]] } }] }));
  r = node(tool('stats.mjs'), ['runs', join(d, 'p'), '--metric', 'gt50']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^runs: refusing to pool devices: (phone \(9\) with chrome \(1\)|chrome \(1\) with phone \(9\)); analyse each device on its own/m);
});

test('simulator runs (tools/sim.mjs) are their own device: never pooled with phone or Chrome runs; decided by the phone rules', () => {
  const sim = { fields: ['t', 'dt', 'yStart', 'yEnd'], frames: [[0, 16, 0, 10]], meta: { device: 'simulator', sim: { runtime: 'iOS 26' } } };
  assert.equal(deviceOf(sim), 'simulator');
  const mk = (device, arm, nLong, block = 1) => ({ device, block, arm, warmup: false, void: false, frames: [...Array(nLong).fill(52), 16].map((dt) => ({ dt })) });
  const simRuns = [mk('simulator', 'C', 6), mk('simulator', 'C', 7), mk('simulator', 'C', 7), mk('simulator', 'C', 8), mk('simulator', 'V', 3), mk('simulator', 'V', 4), mk('simulator', 'V', 4), mk('simulator', 'V', 4)];
  // one simulator run among phone runs: an error, not a warning
  assert.throws(() => blocksFromRuns([...simRuns.slice(1), mk('phone', 'C', 6)], 'gt50'), /blocksFromRuns: refusing to pool devices: simulator \(7\) with phone \(1\); analyse each device on its own \(research\/simulator\/README.md §7\)/);
  assert.throws(() => nearByBlock([...simRuns, mk('chrome', 'V', 1)]), /nearByBlock: refusing to pool devices/);
  assert.doesNotThrow(() => assertOneDevice([{ device: 'phone' }, { device: 'phone' }, {}]));
  // simulator only: decided normally, by the phone's thresholds and rules
  const g = blocksFromRuns(simRuns, 'gt50');
  assert.deepEqual(g.arms.V[0], { block: 1, control: [6, 7, 7, 8], variant: [3, 4, 4, 4] });
  assert.deepEqual([twinsFor('gt50', 'simulator'), twinsFor('k7', 'simulator')], [['gt46', 'gt54'], []]);
  const dd = sequentialDecision({ blocks: [{ control: [40, 41, 42, 43], variant: [35, 36, 37, 38] }], unit: 'ms', platform: 'simulator' });
  assert.deepEqual([dd.decision, dd.stats.choices.platform, dd.stats.choices.minShift, dd.stats.choices.medianCompare], ['win', 'simulator', 4, 'ms1']);
  // CLI: simulator files decide on their own; k forms refused like the phone's; mixed with a phone file -> exit 2
  const d = tempDir('fw-stats-sim-');
  mkdirSync(join(d, 's'));
  const fields = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs', 'docH'];
  const frames = (n) => Array.from({ length: 20 }, (_, i) => [i * 20, i < n ? 52 : 16, i * 10, i * 10 + 10, 775, null, 1, 0.1, 9000]);
  const longs = { C: [6, 7, 7, 8], V: [3, 4, 4, 4] }, seen = { C: 0, V: 0 };
  writeFileSync(join(d, 's', 'r0.json'), JSON.stringify({ fields, frames: frames(9), marks: { scroll: [0, 1e9] }, meta: { device: 'simulator', block: 1, arm: 'C', warmup: true, pos: 0, driver: 'S' } }));
  blockOrder(2).forEach((arm, i) => writeFileSync(join(d, 's', `r${i + 1}.json`), JSON.stringify({ fields, frames: frames(longs[arm][seen[arm]++]), marks: { scroll: [0, 1e9] }, meta: { device: 'simulator', block: 1, arm, pos: i + 1, driver: 'S', sentinel: { pass: true } } })));
  let r = node(tool('stats.mjs'), ['runs', join(d, 's'), '--metric', 'gt50']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /on simulator, twins gt46, gt54/);
  assert.match(r.stdout, /^arm V vs C: DECISION WIN: U = 0, p 0.014, HL 3 >= 1$/m);
  assert.match(r.stdout, /^ {2}arm V block 1: near50 /m);
  assert.equal(node(tool('stats.mjs'), ['runs', join(d, 's'), '--metric', 'k7']).code, 2);
  writeFileSync(join(d, 's', 'phone.json'), JSON.stringify({ fields, frames: frames(5), marks: { scroll: [0, 1e9] }, meta: { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', block: 1, arm: 'C', pos: 9, driver: 'S' } }));
  r = node(tool('stats.mjs'), ['runs', join(d, 's'), '--metric', 'gt50']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /runs: refusing to pool devices: (simulator \(9\) with phone \(1\)|phone \(1\) with simulator \(9\))/);
});
