// tools/lib/bench-gain.mjs series() (incident I-034, review-stats T3 nit 1): a run whose gain metric is missing or
// not a finite number is a scenario error (bench gain / calibrate / reconfirm end INCONCLUSIVE), never a value
// handed to bench-stats, which throws on it since f153307. Finite values pass through unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { series } from '../../tools/lib/bench-gain.mjs';

const run = (side, v, extra = {}) => ({ side, host: { load1Start: 1 }, scenarios: { s: { ms: v, ...extra } } });

test('series: finite values per side, in run order; hosts of every run that has the scenario', () => {
  const ok = series([run('A', 10), run('B', 8), run('B', 0), run('A', -1.5), { side: 'A', host: {}, scenarios: {} }], 's', 'ms');
  assert.deepEqual(ok, { a: [10, -1.5], b: [8, 0], hosts: [{ load1Start: 1 }, { load1Start: 1 }, { load1Start: 1 }, { load1Start: 1 }], errors: [] });
});

test('series: null / NaN / undefined / Infinity / a string go to errors naming the metric and side, not into a/b', () => {
  const bad = series([run('A', 10), run('B', null), run('B', NaN), run('A', undefined), run('B', 7, { error: 'timeout' }), run('B', 6), run('A', Infinity), run('B', '5')], 's', 'ms');
  assert.deepEqual([bad.a, bad.b], [[10], [6]]);
  assert.deepEqual(bad.errors, [
    'timeout',
    'ms not a finite number (null) on side B',
    'ms not a finite number (NaN) on side B',
    'ms not a finite number (undefined) on side A',
    'ms not a finite number (Infinity) on side A',
    'ms not a finite number (5) on side B',
  ]);
  assert.equal(bad.hosts.length, 8, 'every run with the scenario keeps its host record (the contamination gate)');
  assert.deepEqual(series([run('A', 1)], 's', 'other').errors, ['other not a finite number (undefined) on side A'], 'a metric the scenario never produced');
});
