// tools/lib/bench-verdict.mjs (Tier A verdicts, parity diffs, experiment rows) and tools/lib/bench-overlay.mjs
// (patch headers, baseline drift, overlays rebuilt from patches with conflicts, landing order on main).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, git, sha256 } from '../helpers.mjs';
import { checkRepeat, combineRepeats, isStalled, baselineChanged, parityDiff, parityVerdict, experimentVerdict, exitCode } from '../../tools/lib/bench-verdict.mjs';
import { patchHeader, baselineDrift, buildOverlay, landedTopics, gitShow } from '../../tools/lib/bench-overlay.mjs';

const check = { baseline: '>= 20', patched: '== 0' };

test('checkRepeat: PASS, FAIL, VACUOUS (or ALREADY-REMOVED with --on), ERROR on a missing value; baseline-relative expectations', () => {
  assert.equal(checkRepeat(check, 150, 0), 'PASS');
  assert.equal(checkRepeat(check, 150, 3), 'FAIL');
  assert.equal(checkRepeat(check, 5, 0), 'VACUOUS', 'a check that passes on both sides guards nothing');
  assert.equal(checkRepeat(check, 5, 0, { on: 'all-wave1' }), 'ALREADY-REMOVED');
  assert.equal(checkRepeat(check, null, 0), 'ERROR');
  assert.equal(checkRepeat(check, 150, NaN), 'ERROR');
  const ratio = { baseline: '>= 100', patched: '<= 0.25 * baseline' };
  assert.equal(checkRepeat(ratio, 231, 13), 'PASS');
  assert.equal(checkRepeat(ratio, 231, 60), 'FAIL');
  assert.equal(checkRepeat({ baseline: '>= 20', patched: '>= 0.5 * baseline' }, 120, 118), 'PASS');
});

test('combineRepeats / isStalled / baselineChanged / exitCode', () => {
  assert.equal(combineRepeats(['PASS', 'PASS']), 'PASS');
  assert.equal(combineRepeats(['FAIL', 'FAIL']), 'FAIL');
  assert.equal(combineRepeats(['PASS', 'FAIL']), 'FLAKY', 'repeats disagree: never retried until green');
  assert.equal(combineRepeats(['PASS', 'PASS'], { stalled: true }), 'FLAKY');
  assert.equal(combineRepeats(['PASS', 'ERROR']), 'ERROR');
  assert.equal(isStalled(2, 2), false);
  assert.equal(isStalled(3, 7), true);
  assert.equal(isStalled(5, 30), false);
  assert.equal(isStalled(9, 30), true);
  assert.equal(baselineChanged('FAIL', true), 'BASELINE-CHANGED');
  assert.equal(baselineChanged('VACUOUS', true), 'BASELINE-CHANGED');
  assert.equal(baselineChanged('PASS', true), 'PASS');
  assert.equal(baselineChanged('FAIL', false), 'FAIL');
  assert.equal(exitCode(['PASS', 'ALREADY-REMOVED']), 0);
  assert.equal(exitCode(['PASS', 'FLAKY']), 3);
  assert.equal(exitCode(['BASELINE-CHANGED', 'PASS']), 3);
  assert.equal(exitCode(['FLAKY', 'FAIL']), 1);
  assert.equal(exitCode(['MISMATCH']), 1);
  assert.equal(exitCode(['VACUOUS']), 1);
});

test('parityDiff: classes, props with tolerance (same unit), attrs, step-count mismatch; parityVerdict', () => {
  const entry = { classes: ['.pain'], props: [['.future', '--future-shrink', 0.001], ['.future', '--x']], attrs: [['body', 'data-y']] };
  const snap = (cls, v, x, y) => ({ 'class .pain': [cls], 'prop .future --future-shrink': v, 'prop .future --x': x, 'attr body data-y': [y] });
  const base = [{ y: 0, snap: snap('pain', '0.5', '1px', '0') }, { y: 150, snap: snap('is-pain-dark pain', '0.2', '1px', '150') }];
  assert.deepEqual(parityDiff(entry, base, base), { total: 0, diffs: [] });
  const near = [{ y: 0, snap: snap('pain', '0.5004', '1px', '0') }, { y: 150, snap: snap('is-pain-dark pain', '0.2', '1px', '150') }];
  assert.equal(parityDiff(entry, base, near).total, 0, 'within tolerance');
  const far = [{ y: 0, snap: snap('pain', '0.51', '2px', '0') }, { y: 150, snap: snap('pain', '0.2', '1px', '151') }];
  const d = parityDiff(entry, base, far);
  assert.equal(d.total, 4);
  assert.deepEqual(d.diffs.map((x) => [x.step, x.key]), [[0, 'prop .future --future-shrink'], [0, 'prop .future --x'], [1, 'class .pain'], [1, 'attr body data-y']]);
  assert.deepEqual(parityDiff(entry, base, base.slice(0, 1)).diffs[0], { step: null, key: 'steps', baseline: 2, patched: 1 });
  assert.equal(parityDiff({ props: [['.a', '--p', 0.1]] }, [{ snap: { 'prop .a --p': '1px' } }], [{ snap: { 'prop .a --p': '1.05em' } }]).total, 1, 'units must match');
  assert.equal(parityVerdict([0, 0]), 'PASS');
  assert.equal(parityVerdict([2, 3]), 'FAIL');
  assert.equal(parityVerdict([0, 3]), 'FLAKY');
  assert.equal(parityVerdict([0, 0], { stalled: true }), 'FLAKY');
});

test('experimentVerdict: expected per check and parity; MISMATCH; VACUOUS/FLAKY pass through', () => {
  const checks = [{ id: 'a', verdict: 'PASS' }, { id: 'b', verdict: 'FAIL' }];
  assert.equal(experimentVerdict({ mech: { a: 'pass', b: 'fail' } }, checks, []).verdict, 'PASS');
  assert.equal(experimentVerdict({ mech: 'pass' }, checks, []).verdict, 'MISMATCH');
  const r = experimentVerdict({ mech: { b: 'pass' }, parity: 'fail' }, checks, [{ verdict: 'FAIL' }, { verdict: 'PASS' }]);
  assert.deepEqual(r.rows, [{ id: 'b', expected: 'pass', observed: 'FAIL', match: 'MISMATCH' }, { id: 'parity', expected: 'fail', observed: 'FAIL', match: 'as expected' }]);
  assert.equal(r.verdict, 'MISMATCH');
  assert.equal(experimentVerdict({ mech: 'fail' }, [{ id: 'a', verdict: 'VACUOUS' }], []).verdict, 'VACUOUS');
  assert.equal(experimentVerdict({ parity: 'pass' }, [], [{ verdict: 'FLAKY' }]).verdict, 'FLAKY');
  assert.equal(experimentVerdict({ gain: 'within-noise' }, checks, []).verdict, 'PASS', 'no Tier A expectation: nothing to judge here');
});

function repoWithBase() {
  const repo = tempDir('fw-ovl-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const base = join(repo, 'base');
  mkdirSync(join(base, 'js'), { recursive: true });
  writeFileSync(join(base, 'js', 'a.js'), 'one\ntwo\nthree\n');
  writeFileSync(join(base, 'b.css'), 'x{}\n');
  return { repo, base };
}
const patch = (base, rel, from, to, extra = '') => `# fastwork mirror fix: t\n${extra}# base-sha256 ${rel} ${sha256(readFileSync(join(base, rel)))}\ndiff --git a/${rel} b/${rel}\n--- a/${rel}\n+++ b/${rel}\n@@ -1,3 +1,3 @@\n one\n-${from}\n+${to}\n three\n`;

test('patchHeader, baselineDrift, buildOverlay (in order, conflicts reported and skipped, seeds)', () => {
  const { repo, base } = repoWithBase();
  const p1 = patch(base, 'js/a.js', 'two', 'TWO');
  assert.deepEqual(patchHeader(p1), { stackedOn: null, baseShas: { 'js/a.js': sha256('one\ntwo\nthree\n') }, files: ['js/a.js'] });
  assert.equal(patchHeader('# STACKED on fixes/all-wave1/overlay: apply all-wave1 first\n').stackedOn, 'all-wave1');
  assert.deepEqual(baselineDrift(p1, base), []);
  const moved = p1.replace(/base-sha256 js\/a.js [0-9a-f]+/, `base-sha256 js/a.js ${'1'.repeat(64)}`);
  assert.equal(baselineDrift(moved, base)[0].file, 'js/a.js');
  assert.deepEqual(baselineDrift(moved.replace('# fastwork', '# STACKED on fixes/o/overlay\n# fastwork'), base), [], 'stacked patches are checked against their base, not the mirror');
  // p2 applies on top of p1; p3 (made on the plain baseline) conflicts with p1
  const p2 = `diff --git a/js/a.js b/js/a.js\n--- a/js/a.js\n+++ b/js/a.js\n@@ -1,3 +1,3 @@\n one\n TWO\n-three\n+THREE\n`;
  const p3 = patch(base, 'js/a.js', 'two', 'deux');
  const dest = join(repo, 'out', 'ov');
  const rep = buildOverlay({ repo, dest, base, patches: [{ name: 'p1', text: p1 }, { name: 'p3', text: p3 }, { name: 'p2', text: p2 }] });
  assert.deepEqual(rep.map((r) => [r.name, r.ok]), [['p1', true], ['p3', false], ['p2', true]]);
  assert.match(rep[1].error, /patch does not apply/);
  assert.equal(readFileSync(join(dest, 'js', 'a.js'), 'utf8'), 'one\nTWO\nTHREE\n');
  assert.equal(readFileSync(join(base, 'js', 'a.js'), 'utf8'), 'one\ntwo\nthree\n', 'baseline untouched');
  // seed dirs (a live combined overlay), then a patch on top; the dest is rebuilt from scratch
  const seed = join(repo, 'seed');
  mkdirSync(join(seed, 'js'), { recursive: true });
  writeFileSync(join(seed, 'js', 'a.js'), 'one\nTWO\nthree\n');
  writeFileSync(join(seed, 'b.css'), 'y{}\n');
  const rep2 = buildOverlay({ repo, dest, base, seedDirs: [seed], patches: [{ name: 'p2', text: p2 }] });
  assert.deepEqual(rep2.map((r) => r.ok), [true]);
  assert.equal(readFileSync(join(dest, 'b.css'), 'utf8'), 'y{}\n');
  assert.equal(readFileSync(join(dest, 'js', 'a.js'), 'utf8'), 'one\nTWO\nTHREE\n');
  assert.throws(() => buildOverlay({ repo, dest: tempDir('fw-out-'), base }), /must be inside/);
});

test('landedTopics: first-parent landing order of fixes/*/patch.diff at a ref; removed patches drop out', () => {
  const { repo } = repoWithBase();
  const commit = (files, msg) => { for (const [f, c] of Object.entries(files)) { mkdirSync(join(repo, f, '..'), { recursive: true }); if (c == null) git(repo, 'rm', '-q', f); else writeFileSync(join(repo, f), c); } git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', msg); };
  commit({ 'README.md': 'x' }, 'init');
  commit({ 'fixes/b-topic/patch.diff': 'b1', 'fixes/b-topic/README.md': 'b' }, 'land b');
  commit({ 'fixes/a-topic/patch.diff': 'a1' }, 'land a');
  commit({ 'fixes/b-topic/patch.diff': 'b2' }, 'rework b');
  commit({ 'fixes/c-topic/README.md': 'no patch' }, 'c docs only');
  commit({ 'fixes/d-topic/patch.diff': 'd' }, 'land d');
  commit({ 'fixes/d-topic/patch.diff': null }, 'revert d');
  assert.deepEqual(landedTopics(repo, 'main'), ['b-topic', 'a-topic']);
  assert.equal(gitShow(repo, 'main', 'fixes/b-topic/patch.diff'), 'b2');
  assert.equal(gitShow(repo, 'main', 'fixes/d-topic/patch.diff'), null);
  assert.throws(() => landedTopics(repo, 'nope'), /no such ref/);
  assert.equal(existsSync(join(repo, 'out')), false);
});
