// tools/lib/frames.mjs + tools/frames.mjs (experiment E5): long frames clustered by scrollY across runs,
// on a synthetic frame log: stable positions are found on both sides of an A/A, jitter of a few px
// between runs doesn't split a cluster, and one-off long frames are not clusters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';
import { runsFromJson, clusters, compare } from '../../tools/lib/frames.mjs';

/** One run's frame log: 16.7 ms frames every 10 px of scroll from 0 to 3000, with long frames at `long` = {y: dt}. */
function log(long, jitter = 0) {
  const out = []; let t = 0;
  for (let y = 0; y <= 3000; y += 10) { const dt = long[y] ?? 16.7; t += dt; out.push([t, dt, y + jitter]); }
  return out;
}
// every run: long frames near y 600 and y 1800 (jittered by up to 20 px); run 0 also has a one-off at y 2500
const RUNS = [0, 1, 2, 3, 4].map((i) => ({ 600: 45, 1800: 60, ...(i === 0 ? { 2500: 80 } : {}), ...(i === 3 ? { 610: 40 } : {}) }));
function verifyJson() {
  const results = [];
  RUNS.forEach((long, run) => { for (const label of ['base', 'base2']) results.push({ label, run, viewport: 'mobile', frameLog: { idle: log({}), scroll: log(long, (run * 7) % 21 - 10), morph: log({}) } }); });
  results.push({ diff: true, shot: 'top' });
  return { results };
}

test('clusters: stable positions per label with frames and ms per run; one-offs are dropped; A/A sides match', () => {
  const runs = runsFromJson(verifyJson(), { file: 'verify.json' });
  assert.equal(runs.length, 10);
  const res = clusters(runs, { minMs: 34, bucketPx: 50, minShare: 0.6 });
  assert.deepEqual(res.map((r) => r.label), ['base', 'base2']);
  for (const r of res) {
    assert.equal(r.runs, 5);
    assert.deepEqual(r.clusters.map((c) => [c.share, c.runsHit, c.framesPerRun, c.msPerRun]), [[1, 5, 1.2, 53], [1, 5, 1, 60]], r.label);
    assert.ok(r.clusters[0].y0 <= 600 && r.clusters[0].y1 > 600 && r.clusters[0].y1 - r.clusters[0].y0 <= 150, JSON.stringify(r.clusters[0]));
    assert.ok(r.clusters[1].y0 <= 1800 && r.clusters[1].y1 > 1800);
  }
  const c = compare(res[0], res[1]);
  assert.equal(c.common.length, 2);
  assert.deepEqual([c.onlyA, c.onlyB], [[], []]);
  // a higher bar: the one-off at 2500 is never a cluster, and minMs filters the 45/40 ms frames out
  assert.deepEqual(clusters(runs, { minMs: 50 })[0].clusters.map((x) => x.framesPerRun), [1]);
  assert.equal(clusters(runs, { minShare: 0.2 })[0].clusters.length, 3, 'with a 20 % bar the one-off (1 of 5 runs) counts');
});

test('iPhone logs: frames inside marks.<phase>, labelled by meta.label', () => {
  const frames = log({ 600: 45 });
  const j = { frames, marks: { scroll: [frames[10][0], frames[200][0]] }, meta: { label: 'baseline' } };
  const [r] = runsFromJson(j, { file: 'out/iphone/x-baseline-1.json' });
  assert.equal(r.label, 'baseline');
  assert.equal(r.frames.length, 191);
  assert.deepEqual(runsFromJson({ nothing: 1 }), []);
  // fw-iphone-run/1: index 2 is yStart; the frame ends at yEnd (by name). A frame without a y gets no bucket.
  const v1 = { fields: ['t', 'dt', 'yStart', 'yEnd', 'innerHeight'], frames: [[0, 60, 90, 130, 775], [60, 60, null, null, 775]], meta: { label: 'v1' } };
  const [s] = runsFromJson(v1);
  assert.deepEqual(s.frames, [[0, 60, 130], [60, 60, null]]);
  assert.deepEqual(clusters([s], { minShare: 1 })[0].clusters.map((x) => [x.y0, x.y1, x.framesPerRun]), [[100, 150, 1]]);
});

test('frames.mjs CLI: prints clusters per label and the A/A comparison; --json; usage errors', () => {
  const d = tempDir('fw-frames-');
  mkdirSync(join(d, 'run'));
  writeFileSync(join(d, 'run', 'verify.json'), JSON.stringify(verifyJson()));
  const r = node(tool('frames.mjs'), [join(d, 'run')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^base: 5 run\(s\), 2 stable cluster\(s\)$/m);
  assert.match(r.stdout, /^base vs base2: 2 shared, 0 only base \(-\), 0 only base2 \(-\)$/m);
  const j = JSON.parse(node(tool('frames.mjs'), [join(d, 'run', 'verify.json'), '--json', '--min-ms', '50']).stdout);
  assert.equal(j.minMs, 50);
  assert.equal(j.labels[0].clusters.length, 1);
  assert.equal(node(tool('frames.mjs'), []).code, 2);
  writeFileSync(join(d, 'nolog.json'), JSON.stringify({ results: [{ label: 'a', run: 0 }] }));
  const n = node(tool('frames.mjs'), [join(d, 'nolog.json')]);
  assert.equal(n.code, 1);
  assert.match(n.stderr, /needs --frame-log/);
});
