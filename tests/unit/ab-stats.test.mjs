// tools/lib/ab-stats.mjs: fix.mjs ab's per-metric statistics. Incident I-018 review: a metric some runs
// lack must drop that run's pair only, never shift the pairs after it, and report its own n.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stats, median } from '../../tools/lib/ab-stats.mjs';

const T = { scroll: [['fps', 'fps', +1], ['gt50', 'frames >50 ms', -1], ['cdpStyleMs', 'style recalc ms (CDP)', -1]], trace: [['frames', 'frames >20 ms (traced)', -1]] };
const run = (label, i, scroll, extra = {}) => ({ label, viewport: 'mobile', run: i, scrollSummary: scroll, ...extra });

test('pairs by run index: a run missing a metric drops that pair only; n and skippedRuns per metric', () => {
  const results = [
    // run order ABBA, as verify records it
    run('base', 0, { fps: 50, gt50: 4, cdpStyleMs: 100 }), run('fix', 0, { fps: 55, gt50: 2, cdpStyleMs: 90 }),
    run('fix', 1, { fps: 56, gt50: 2 }), run('base', 1, { fps: 51, gt50: 5, cdpStyleMs: 300 }), // fix run 1: no CDP metric
    run('base', 2, { fps: 49, gt50: 4, cdpStyleMs: 110 }), run('fix', 2, { fps: 57, gt50: 1, cdpStyleMs: 80 }),
    run('fix', 3, { fps: 58, gt50: 1, cdpStyleMs: 70 }), run('base', 3, { fps: 52, gt50: 3, cdpStyleMs: 'n/a' }), // base run 3: not a number
    { diff: true, viewport: 'mobile', shot: 'top' },
  ];
  const s = stats(results, 'mobile', 'base', 'fix', T);
  const st = s.scroll.cdpStyleMs;
  // the old filter-then-zip paired base [100, 300, 110] with fix [90, 80, 70]: -10, -220, -40
  assert.deepEqual(st.pairedDeltas, [-10, -30], 'run 0: 90-100, run 2: 80-110; runs 1 and 3 dropped');
  assert.equal(st.n, 2);
  assert.deepEqual(st.skippedRuns, [1, 3]);
  assert.deepEqual(st.baseline.runs, [100, 110]);
  assert.deepEqual(st.patched.runs, [90, 80]);
  assert.equal(st.verdict, 'n=2 (need >=3 runs for a verdict)');
  const fps = s.scroll.fps;
  assert.equal(fps.n, 4);
  assert.equal('skippedRuns' in fps, false);
  assert.deepEqual(fps.pairedDeltas, [5, 5, 8, 6]);
  assert.equal(fps.verdict, 'better (ranges do not overlap)');
  assert.deepEqual(fps.baseline, { median: 50.5, min: 49, max: 52, runs: [50, 51, 49, 52] });
  assert.equal(s.scroll.gt50.verdict, 'better (ranges do not overlap)');
  assert.equal('trace' in s, false, 'a phase no run recorded is left out');
});

test('a metric without a single complete pair is left out; a side missing a whole run skips that run', () => {
  const results = [run('base', 0, { fps: 50 }), run('fix', 0, { fps: 55, cdpStyleMs: 9 }), run('base', 1, { fps: 50, cdpStyleMs: 9 }),
    run('base', 2, { fps: 50 }, { traceSummary: { frames: 3 } }), run('fix', 2, { fps: 54 }, { traceSummary: { frames: 2 } })];
  const s = stats(results, 'mobile', 'base', 'fix', T);
  assert.equal('cdpStyleMs' in s.scroll, false);
  assert.deepEqual([s.scroll.fps.n, s.scroll.fps.skippedRuns, s.scroll.fps.pairedDeltas], [2, [1], [5, 4]]);
  assert.deepEqual([s.trace.frames.n, s.trace.frames.skippedRuns, s.trace.frames.pairedDeltas], [1, [0, 1], [-1]]);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});
