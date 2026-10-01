// tools/lib/bench-stats.mjs against known values (design §3): exact Mann-Whitney p for 5 vs 5 and 3 vs 3,
// ties, the Hodges-Lehmann shift and Moses CI, the A/A floor, and every verdict path including the host
// gate (contaminated / warn) and stale calibrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uStat, mannWhitney, uNullCdf, hodgesLehmann, mosesCI, calibrate, hostBand, gainVerdict, experimentOutcome } from '../../tools/lib/bench-stats.mjs';

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('exact Mann-Whitney: 5 vs 5 no overlap p = 1/252, U <= 4 p = 12/252, 3 vs 3 p = 1/20; direction', () => {
  const base = [100, 101, 102, 103, 104], better = [90, 91, 92, 93, 94];
  let r = mannWhitney(base, better, 'lower');
  assert.equal(r.u, 0);
  close(r.p, 1 / 252);
  assert.deepEqual([r.count, r.total], [1, 252]);
  close(mannWhitney(base, better, 'higher').p, 1, 1e-12);
  close(mannWhitney(better, base, 'higher').p, 1 / 252);
  // U = 4: patched [95.5, 96, 97, 98, 103.5] vs base: 103.5 beats 4 baseline runs -> U = 4
  r = mannWhitney(base, [90, 91, 92, 93, 103.5], 'lower');
  assert.equal(r.u, 4);
  close(r.p, 12 / 252);
  assert.ok(r.p <= 0.05);
  r = mannWhitney(base, [90, 91, 92, 101.5, 103.5], 'lower');
  assert.ok(r.p > 0.05, 'U = 6 is not significant at n = 5');
  close(mannWhitney([10, 11, 12], [1, 2, 3], 'lower').p, 1 / 20);
  // the null distribution: cumulative counts 1, 2, 4, 7, 12 of 252
  const cdf = uNullCdf(5, 5);
  assert.deepEqual(cdf.slice(0, 5).map((x) => Math.round(x * 252)), [1, 2, 4, 7, 12]);
  close(cdf[25], 1);
  assert.throws(() => mannWhitney(new Array(11).fill(1), new Array(10).fill(2)), /limited to 20/);
  assert.throws(() => mannWhitney([], [1]), /empty/);
});

test('ties count as 1/2 in U; all-equal samples give p = 1', () => {
  assert.equal(uStat([1, 2], [2, 3], 'lower'), 0.5 + 1 + 1 + 1);
  close(mannWhitney([5, 5, 5], [5, 5, 5], 'lower').p, 1);
  const r = mannWhitney([3, 4, 4, 5, 6], [1, 2, 3, 3, 4], 'lower');
  assert.equal(r.u, 3);
  assert.ok(r.p > 1 / 252 && r.p < 0.05, `p ${r.p}`);
});

test('Hodges-Lehmann shift and Moses CI on known vectors; calibration floor', () => {
  const a = [10, 11, 12, 13, 14], b = [5, 6, 7, 8, 9];
  assert.equal(hodgesLehmann(a, b, 'lower'), 5);
  assert.equal(hodgesLehmann(b, a, 'higher'), 5);
  const ci = mosesCI(a, b, 'lower');
  assert.deepEqual([ci.lo, ci.hi, ci.k], [2, 8, 3], '5 vs 5: 3rd smallest to 3rd largest of the 25 differences');
  close(ci.coverage, 1 - 8 / 252);
  assert.deepEqual(mosesCI([1, 2, 3], [4, 5, 6]), { lo: null, hi: null, coverage: 1, k: 0 }, '3 vs 3 is too small for 95 %');
  const cal = calibrate([10, 11, 12, 13, 14], [10.5, 11.5, 12.5, 13.5, 14.5], 'lower');
  assert.equal(cal.shift, -0.5);
  assert.deepEqual([cal.ci.lo, cal.ci.hi], [-3.5, 2.5]);
  assert.equal(cal.minEffect, 3);
  assert.throws(() => calibrate([1, 2, 3], [1, 2, 3]), /too few runs/);
});

const cal = { minEffect: 3, toolsSha: 'abc', chromeMajor: 140, band: 'clean' };
const cur = { toolsSha: 'abc', chromeMajor: 140 };
const clean = new Array(10).fill({ loadInvalid: false, loadWarn: false });
const A = [100, 101, 102, 103, 104];

test('gainVerdict: HOLDS, REGRESSED (wrong direction, CI below budget), INCONCLUSIVE; budget = max(minEffect, half the authored shift)', () => {
  let v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: cal, current: cur, hosts: clean });
  assert.equal(v.verdict, 'HOLDS');
  assert.equal(v.band, 'clean');
  close(v.p, 1 / 252);
  assert.equal(v.shift, 10);
  assert.equal(v.budget, 3);
  v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: cal, current: cur, authored: { shift: 30, toolsSha: 'abc' }, hosts: clean });
  assert.equal(v.budget, 15);
  assert.equal(v.verdict, 'REGRESSED', 'confidently smaller than half the authored gain');
  assert.match(v.reason, /CI upper 13 < budget 15/);
  v = gainVerdict({ a: A, b: [110, 111, 112, 113, 114], dir: 'lower', calibration: cal, current: cur, hosts: clean });
  assert.equal(v.verdict, 'REGRESSED');
  assert.match(v.reason, /wrong direction/);
  v = gainVerdict({ a: A, b: [95, 99, 101.5, 103.5, 106], dir: 'lower', calibration: cal, current: cur, hosts: clean });
  assert.equal(v.verdict, 'INCONCLUSIVE');
  v = gainVerdict({ a: [100, 101, 102, 103, 104], b: [120, 121, 122, 123, 124], dir: 'higher', calibration: cal, current: cur, hosts: clean });
  assert.equal(v.verdict, 'HOLDS', 'fps-like metrics: higher is better');
});

test('gainVerdict: the host gate (contaminated -> INCONCLUSIVE, warn decides but is marked) and stale calibrations', () => {
  const hosts = [...clean];
  hosts[3] = { loadInvalid: true, loadWarn: false, reasons: ['load1 12.4 > 10 at run start'] };
  let v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: cal, current: cur, hosts });
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.match(v.reason, /^contaminated: run 4: load1 12.4 > 10 at run start/);
  assert.equal(v.band, 'contaminated');
  const warn = [...clean]; warn[0] = { loadInvalid: false, loadWarn: true };
  v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: cal, current: cur, hosts: warn });
  assert.equal(v.verdict, 'HOLDS');
  assert.equal(v.band, 'warn');
  assert.equal(hostBand(clean), 'clean');
  for (const [c, re] of [[null, /no calibration/], [{ ...cal, toolsSha: 'old' }, /stale calibration \(toolsSha old -> abc\)/], [{ ...cal, chromeMajor: 139 }, /Chrome 139 -> 140/], [{ ...cal, band: 'warn' }, /calibration band warn/], [{ ...cal, setting: 'threadTicks 6x' }, /setting threadTicks 6x -> undefined/]]) {
    v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: c, current: cur, hosts: clean });
    assert.equal(v.verdict, 'INCONCLUSIVE');
    assert.match(v.reason, re);
  }
  v = gainVerdict({ a: A, b: [90, 91, 92, 93, 94], dir: 'lower', calibration: cal, current: cur, authored: { shift: 10, toolsSha: 'older' }, hosts: clean });
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.match(v.reason, /re-author/);
});

test('experimentOutcome: better / within-noise / worse against the floor; inconclusive when contaminated', () => {
  const base = { a: A, dir: 'lower', calibration: cal, current: cur, hosts: clean };
  assert.equal(experimentOutcome({ ...base, b: [90, 91, 92, 93, 94] }).outcome, 'better');
  assert.equal(experimentOutcome({ ...base, b: [101, 99, 103, 100, 104] }).outcome, 'within-noise');
  assert.equal(experimentOutcome({ ...base, b: [110, 111, 112, 113, 114] }).outcome, 'worse');
  assert.equal(experimentOutcome({ ...base, b: [98.5, 99.5, 100.5, 101.5, 102.5] }).outcome, 'within-noise', 'significant but below the floor');
  assert.equal(experimentOutcome({ ...base, b: [90, 91, 92, 93, 94], hosts: [{ loadInvalid: true }] }).outcome, 'inconclusive');
});

test('non-finite values throw instead of scoring as an improvement (review-stats b on T3)', () => {
  // before: uStat([10,11,12,13], [NaN x4]) = 0 and mannWhitney p = 1/70 ("b better"), a false gain
  const a = [10, 11, 12, 13];
  for (const bad of [NaN, null, undefined, Infinity, '5']) {
    const b = [bad, bad, bad, bad];
    assert.throws(() => uStat(a, b), /uStat b: value 1 is not a finite number/);
    assert.throws(() => mannWhitney(a, b), /mannWhitney b: value 1/);
    assert.throws(() => hodgesLehmann(a, b), /shift b: value 1/);
    assert.throws(() => mosesCI(a, [1, 2, 3, bad]), /shift b: value 4/);
    assert.throws(() => uStat(b, a, 'higher'), /uStat a: value 1/);
  }
  assert.throws(() => calibrate([1, 2, null, 4, 5], [1, 2, 3, 4, 5]), /shift a: value 3/);
  assert.equal(uStat(a, [1, 2, 3, 4]), 0, 'finite input unchanged');
  assert.equal(mannWhitney(a, [1, 2, 3, 4]).count, 1);
});
