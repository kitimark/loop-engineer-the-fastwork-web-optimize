// tools/lib/stats.mjs + tools/stats.mjs (protocol v2 §3.2, §3.4, §5.3; item T3) against hand-computed
// values: tick quantisation at the 8.333 ms midpoints, type-7 quartiles, the exact Mann-Whitney U = 0 at
// 4 vs 4 (p = 1/70 ~ 0.014, the protocol's own example), the HL shift, the exact van Elteren over two
// blocks, every branch of the sequential decision, the block orders, and crossing placement per unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';
import {
  TICK_MS, tick, tickThresholdMs, quantile, median, summary, frameCounts, runMetrics, mannWhitney, hodgesLehmann,
  vanElteren, stratifiedShift, aligned, compareBlock, compareBlocks, sequentialDecision, blockOrder,
  crossingY, placeFrame, placeFrames, normalizeFrame, runsFromJson, blocksFromRuns,
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
  assert.deepEqual(c, { n: 5, k5: 3, k7: 1, onTime: 1, gt34: 4, gt50: 2, hist: { 2: 1, 5: 1, 7: 1, 4: 1, 6: 1 } });
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

test('sequential decision, block 2: stratified p and HL >= 1 tick; no-win with a small shift; worse is flagged', () => {
  let d = sequentialDecision({ blocks: [COOL, HOT], unit: 'ms' });
  assert.equal(d.decision, 'no-win', 'HL 8 ms < 1 tick');
  assert.match(d.reason, /HL 8 \(need p <= 0.05, HL >= 8.333\)/);
  assert.match(d.rule, /a third block only by the lead/);
  d = sequentialDecision({ blocks: [COOL, HOT], unit: 'ms', minShift: 5 });
  assert.equal(d.decision, 'win', d.reason);
  assert.equal(d.stats.aligned.test, 'aligned Mann-Whitney (diagnostic)');
  d = sequentialDecision({ blocks: [{ control: COOL.variant, variant: COOL.control }, { control: HOT.variant, variant: HOT.control }], unit: 'ms' });
  assert.equal(d.decision, 'no-win');
  assert.match(d.reason, /significantly WORSE/);
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
});

test('input: Chrome [t, dt, y] and §5.5 tuples and objects normalise; iPhone run files; blocks per arm', () => {
  assert.deepEqual(normalizeFrame([10, 40, 120], 100, 932), { t: 10, dt: 40, yStart: 100, yEnd: 120, innerHeight: 932, m: null, jsMs: null, probeMs: null });
  assert.deepEqual(normalizeFrame([10, 40, 100, 120, 775, 0.5, 3, 0.2]), { t: 10, dt: 40, yStart: 100, yEnd: 120, innerHeight: 775, m: 0.5, jsMs: 3, probeMs: 0.2 });
  assert.deepEqual(normalizeFrame({ t: 1, dt: 2, y: 5 }, 3), { t: 1, dt: 2, yStart: 3, yEnd: 5, innerHeight: null, m: null, jsMs: null, probeMs: null });
  const v = runsFromJson({ results: [{ label: 'base', run: 0, frameLog: { scroll: [[0, 16, 0], [16, 40, 30]] } }, { diff: true }] }, { innerHeight: 932 });
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].frames[1], { t: 16, dt: 40, yStart: 0, yEnd: 30, innerHeight: 932, m: null, jsMs: null, probeMs: null });
  const ip = runsFromJson({ frames: [[0, 16, 0, 0, 775, null, 1], [16, 40, 0, 30, 775, null, 2], [56, 16, 30, 40, 775, null, 1]], marks: { scroll: [10, 60] }, meta: { label: 'x', block: 1, arm: 'V', driver: 'S' }, tops: { io: 1 } });
  assert.deepEqual([ip[0].frames.length, ip[0].arm, ip[0].block, ip[0].driver, ip[0].tops.io], [2, 'V', 1, 'S', 1]);
  // blocks from runs: k>=5 count per run; the warm-up and a voided run are skipped
  const run = (block, arm, nLong, extra = {}) => ({ block, arm, warmup: false, void: false, ...extra, frames: [...Array(nLong).fill(40), 16, 16].map((dt) => ({ dt })) });
  const runs = [run(1, 'C', 9, { warmup: true }), run(1, 'C', 6), run(1, 'V', 3), run(1, 'V', 4), run(1, 'C', 7), run(1, 'C', 7), run(1, 'V', 4), run(1, 'V', 4), run(1, 'C', 8), run(1, 'V', 1, { void: true })];
  const by = blocksFromRuns(runs, 'k5');
  assert.deepEqual(by, { V: [{ block: 1, control: [6, 7, 7, 8], variant: [3, 4, 4, 4] }] });
  assert.throws(() => blocksFromRuns(runs, 'fps'), /unknown metric/);
  assert.throws(() => blocksFromRuns([run(1, null, 1)], 'k5'), /no arm/);
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
  assert.match(r.stdout, /test: exact Mann-Whitney, one-sided; dir lower .* unit ms; min shift 8.333; medians compared as ticks/);
  r = node(tool('stats.mjs'), ['decide', '--c', '40,42,44,46', '--v', '30,32,34,36', '--c', '50,52,54,56', '--v', '44,46,48,50', '--json']);
  const j = JSON.parse(r.stdout);
  assert.equal(j.decision, 'no-win');
  assert.equal(j.stats.test, 'exact van Elteren, one-sided, stratified by block');
  r = node(tool('stats.mjs'), ['decide', '--c', '40,42,44,46', '--v', '30,32,34,36', '--c', '50,52,54,56', '--v', '44,46,48,50', '--min-shift', '5']);
  assert.match(r.stdout, /^DECISION WIN: van Elteren p 0 <= 0.05, HL 8 >= 5$/m);
  assert.match(r.stdout, /aligned \(diagnostic\): U 1/);
  assert.equal(node(tool('stats.mjs'), ['decide', '--c', '1,2']).code, 2);
  assert.equal(node(tool('stats.mjs'), ['decide', '--c', '1,x', '--v', '1']).code, 2);
  assert.equal(node(tool('stats.mjs'), []).code, 2);

  const d = tempDir('fw-stats-');
  mkdirSync(join(d, 'blk'));
  const frames = (nLong) => { const out = []; let t = 0, y = 0; for (let i = 0; i < 20; i++) { const dt = i < nLong ? 40 : 16; out.push([t, dt, y, y + 10, 775, null, 1]); t += dt; y += 10; } return out; };
  const order = blockOrder(2), longs = { C: [6, 7, 7, 8], V: [3, 4, 4, 4] }, seen = { C: 0, V: 0 };
  writeFileSync(join(d, 'blk', 'r00-warm.json'), JSON.stringify({ frames: frames(12), meta: { block: 1, arm: 'C', warmup: true } }));
  order.forEach((arm, i) => writeFileSync(join(d, 'blk', `r${String(i + 1).padStart(2, '0')}.json`), JSON.stringify({ frames: frames(longs[arm][seen[arm]++]), meta: { block: 1, arm, pos: i, driver: 'S' } })));
  r = node(tool('stats.mjs'), ['runs', join(d, 'blk'), '--metric', 'k5']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /9 run\(s\), 1 warm-up\/void skipped/);
  assert.match(r.stdout, /^arm V vs C: DECISION WIN: U = 0, p 0.014, HL 3 >= 1$/m);
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
  assert.equal(node(tool('stats.mjs'), ['place', join(d, 'tops.json')]).code, 2);
});
