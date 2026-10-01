// tools/lib/bench-gain.mjs series() (incident I-034, review-stats T3 nit 1): a run whose gain metric is missing or
// not a finite number is a scenario error (bench gain / calibrate / reconfirm end INCONCLUSIVE), never a value
// handed to bench-stats, which throws on it since f153307. Finite values pass through unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { series, calibrationPower } from '../../tools/lib/bench-gain.mjs';
import { hostStateSummary } from '../../tools/lib/host.mjs';

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

test('calibrationPower (review-host-state N2, ts-lock-bundle c): a stored calibration counts in the gain host state; another display state tags it', () => {
  const p = (display, fullWake) => ({ display, fullWake, powerSource: 'AC', displaySleepPrevented: true });
  const cal = { band: 'clean', runs: [0, 1].flatMap((pair) => ['A', 'B'].map((side) => ({ side, pair, host: { load1Start: 1, power: { start: p('off', false), end: p('off', false) } } }))) };
  const cr = calibrationPower(cal);
  assert.deepEqual(cr.map((r) => [r.label, r.run, r.power.start.display]), [['calibration-A', 0, 'off'], ['calibration-B', 0, 'off'], ['calibration-A', 1, 'off'], ['calibration-B', 1, 'off']]);
  const gain = ['A', 'B'].map((side) => ({ label: side, run: 0, power: { start: p('on', true), end: p('on', true) } }));
  const h = hostStateSummary([...cr, ...gain]);
  assert.equal(h.tag, 'HOST-DISPLAY-CHANGED');
  assert.match(h.reasons[0], /^the arms differ: calibration-A display off, DarkWake vs calibration-B display off, DarkWake vs A display on, FullWake vs B display on, FullWake$/);
  assert.equal(hostStateSummary([...calibrationPower({ runs: cal.runs.map((r) => ({ ...r, host: { ...r.host, power: { start: p('on', true), end: p('on', true) } } })) }), ...gain]).tag, null, 'the same state: no tag');
  // no calibration, no runs, or one from before T8+ (no host.power): nothing known, nothing tagged
  assert.deepEqual([calibrationPower(null), calibrationPower({}), calibrationPower(undefined)], [[], [], []]);
  assert.equal(hostStateSummary([...calibrationPower({ runs: [{ side: 'A', pair: 0, host: { load1Start: 1 } }] }), ...gain]).tag, null);
});
