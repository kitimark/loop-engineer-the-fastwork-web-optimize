// The committed baseline snapshot, end to end in a temp repo whose main checkout has the fixture
// snapshot committed and pinned (baseline.json), like the real repo after the lead's snapshot commit:
//   git worktree add (full copy) -> fix.mjs new makes it sparse -> doctor / show / serve / verify read the
//   main checkout's snapshot and record its id -> a re-mirror in the main checkout (BASELINE-MODIFIED):
//   fix.mjs, serve.mjs, verify.mjs, bench.mjs refuse with exit 3 before any server, lock or browser ->
//   FW_BASELINE_ALLOW_MODIFIED=1 (the user's) warns and records it -> `baseline.mjs sparse --off` keeps
//   the worktree measuring its own committed copy -> restore -> sparse again.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, git, startServe, request, tempDir, TESTS } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
let repo, wt, pin;
const tool = (name, args, env = {}) => node(join(wt, 'tools', name), args, { cwd: wt, env });
const serveArgs = (state) => ['--root', 'site-pretty', '--port', '0', '--quiet', '--state', state];

before(() => {
  repo = makeTempRepo({ worktree: null });
  makeFixtureHome(repo.main);
  git(repo.main, 'add', 'site', 'site-pretty');
  const r = node(join(repo.main, 'tools', 'baseline.mjs'), ['pin', '--prettier', '3.9.9'], { cwd: repo.main });
  assert.equal(r.code, 0, r.out);
  git(repo.main, 'add', 'baseline.json');
  git(repo.main, 'commit', '-q', '-m', 'baseline: snapshot');
  pin = JSON.parse(readFileSync(join(repo.main, 'baseline.json'), 'utf8'));
  wt = join(repo.main, '.claude', 'worktrees', 'fix-snap');
  git(repo.main, 'worktree', 'add', '-q', wt, '-b', 'fix/snap');
});

test('a new fix worktree goes sparse and reads the main checkout\'s committed snapshot', async (t) => {
  assert.ok(existsSync(join(wt, 'site-pretty', 'index.html')), 'git worktree add checks out the full snapshot');
  const n = tool('fix.mjs', ['new', 'snap']);
  assert.equal(n.code, 0, n.out);
  assert.match(n.stdout, /^SPARSE: site\/ and site-pretty\/ are not checked out/m);
  assert.match(n.stdout, new RegExp(`baseline: ${repo.main}/site-pretty\\)`));
  assert.equal(existsSync(join(wt, 'site')), false);
  assert.equal(existsSync(join(wt, 'site-pretty')), false);
  const d = tool('fix.mjs', ['doctor']);
  assert.equal(d.code, 0, d.out);
  assert.match(d.stdout, new RegExp(`^baseline\\s+${repo.main}/site-pretty OK$`, 'm'));
  assert.match(d.stdout, new RegExp(`^baseline snapshot\\s+${pin.snapshot} ok$`, 'm'));
  assert.match(d.stdout, /^worktree copy of snapshot\s+no \(sparse checkout\)$/m);
  assert.equal(tool('fix.mjs', ['show', PAGE_JS, '--lines', '1-2']).code, 0);
  // serve records the snapshot it serves (state file and /__mirror/info)
  const state = join(tempDir('fw-snap-'), 'serve.json');
  const s = await startServe(serveArgs(state), { cwd: wt, script: join(wt, 'tools', 'serve.mjs') });
  t.after(() => s.stop());
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')).baseline, { snapshot: pin.snapshot, state: 'ok' });
  assert.deepEqual(JSON.parse((await request(s.url + '__mirror/info')).text).baseline, { snapshot: pin.snapshot, state: 'ok' });
  await s.stop();
  // verify (fake Chrome) records it in its result JSON
  const v = tempDir('fw-snap-v-');
  const r = await nodeAsync(join(wt, 'tools', 'verify.mjs'), ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--idle', '0', '--max-wait', '0', '--out', join(v, 'out'), '--result', join(v, 'r.json'), '--profile', join(v, 'profile')],
    { cwd: wt, env: { CHROME: FAKE, FW_STATE_DIR: join(v, 'state') } });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(readFileSync(join(v, 'r.json'), 'utf8')).baseline, { snapshot: pin.snapshot, state: 'ok' });
});

test('a changed snapshot in the main checkout: every baseline reader refuses (exit 3) before serving or measuring', async (t) => {
  const f = join(repo.main, 'site-pretty', PAGE_JS.slice(1));
  const orig = readFileSync(f, 'utf8');
  writeFileSync(f, orig.replace('measure', 'measureNewBuild')); // a re-mirror + prettify the user is reviewing
  t.after(() => git(repo.main, 'checkout', '--', 'site-pretty'));
  const refused = (r, who) => {
    assert.equal(r.code, 3, `${who}: ${r.out}`);
    assert.match(r.stderr, new RegExp(`^${who}: BASELINE-MODIFIED: the committed snapshot ${pin.snapshot} in ${repo.main} has local changes`, 'm'));
    assert.match(r.stderr, /node tools\/baseline\.mjs sparse --off/);
  };
  refused(tool('fix.mjs', ['show', PAGE_JS]), 'fix.mjs');
  refused(tool('fix.mjs', ['edit', 'snap', PAGE_JS]), 'fix.mjs');
  assert.equal(existsSync(join(wt, 'fixes', 'snap', 'overlay', PAGE_JS.slice(1))), false, 'nothing copied from a changed baseline');
  refused(tool('serve.mjs', serveArgs(join(tempDir('fw-snap-'), 's.json'))), 'serve.mjs');
  const v = tempDir('fw-snap-v-');
  refused(tool('verify.mjs', ['a=http://127.0.0.1:9/', '--runs', '1', '--out', join(v, 'out')], { CHROME: FAKE, FW_STATE_DIR: join(v, 'state') }), 'verify.mjs');
  assert.equal(existsSync(join(v, 'state')), false, 'verify refused before taking the lock');
  refused(tool('bench.mjs', ['mech', 'snap'], { CHROME: FAKE, FW_STATE_DIR: join(v, 'state') }), 'bench.mjs');
  const d = tool('fix.mjs', ['doctor']);
  assert.equal(d.code, 0, 'doctor reports, it does not refuse');
  assert.match(d.stdout, new RegExp(`^baseline snapshot\\s+${pin.snapshot} modified$`, 'm'));
  assert.match(d.stdout, /^BASELINE-MODIFIED: /m);
  // the user, reviewing the new build, may measure it anyway: warned, and recorded as such
  const state = join(tempDir('fw-snap-'), 'serve.json');
  const s = await startServe(serveArgs(state), { cwd: wt, script: join(wt, 'tools', 'serve.mjs'), env: { FW_BASELINE_ALLOW_MODIFIED: '1' } });
  t.after(() => s.stop());
  assert.match(s.stderr(), /^WARNING serve\.mjs: FW_BASELINE_ALLOW_MODIFIED=1: using a baseline that is NOT the pinned snapshot \(state modified\)/m);
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')).baseline, { snapshot: pin.snapshot, state: 'modified' });
  await s.stop();
  // the worktree keeps measuring the committed snapshot on its own copy
  const off = tool('baseline.mjs', ['sparse', '--off']);
  assert.equal(off.code, 0, off.out);
  const own = tool('fix.mjs', ['show', PAGE_JS, '--lines', '1-3']);
  assert.equal(own.code, 0, own.out);
  assert.doesNotMatch(own.stdout, /measureNewBuild/);
  assert.match(tool('fix.mjs', ['doctor']).stdout, /^worktree copy of snapshot\s+yes \(own copy/m);
  assert.equal(tool('baseline.mjs', ['sparse']).code, 3, 'cannot go sparse while the main checkout is changed');
  git(repo.main, 'checkout', '--', 'site-pretty');
  const sp = tool('baseline.mjs', ['sparse']);
  assert.equal(sp.code, 0, sp.out);
  assert.equal(existsSync(join(wt, 'site-pretty')), false);
  assert.equal(tool('fix.mjs', ['show', PAGE_JS, '--lines', '1-2']).code, 0);
});

// review-snapshot notes 1 and 4: an A/B that did not measure the pinned snapshot throughout can't pass unnoticed
const ab = (env) => nodeAsync(join(wt, 'tools', 'fix.mjs'), ['ab', 'snap', '--runs', '1', '--idle', '0', '--no-screens', '--max-wait', '0'],
  { cwd: wt, env: { CHROME: FAKE, FW_STATE_DIR: join(tempDir('fw-snap-ab-'), 'state'), ...env } });
const abResult = () => JSON.parse(readFileSync(join(wt, 'fixes', 'snap', 'results.json'), 'utf8'));
const verdicts = (res) => Object.values(res.metrics).flatMap((ms) => Object.values(ms).map((x) => x.verdict));
function makeOverlay() {
  if (existsSync(join(wt, 'fixes', 'snap', 'overlay', PAGE_JS.slice(1)))) return;
  const e = tool('fix.mjs', ['edit', 'snap', PAGE_JS]);
  assert.equal(e.code, 0, e.out);
  const f = join(wt, 'fixes', 'snap', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8') + '\n// patched\n');
}

test('ab on a baseline that is not the pinned snapshot (FW_BASELINE_ALLOW_MODIFIED=1): every verdict says BASELINE-MODIFIED', async (t) => {
  makeOverlay();
  const f = join(repo.main, 'site-pretty', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('measure', 'measureNewBuild'));
  t.after(() => git(repo.main, 'checkout', '--', 'site-pretty'));
  const r = await ab({ FW_BASELINE_ALLOW_MODIFIED: '1' });
  assert.equal(r.code, 0, r.out);
  const res = abResult();
  assert.ok(verdicts(res).length > 0);
  for (const v of verdicts(res)) assert.match(v, /^BASELINE-MODIFIED: /);
  const { flaggedRuns, ...snap } = res.config.baselineSnapshot;
  assert.deepEqual(snap, { snapshot: pin.snapshot, state: 'modified', tag: 'BASELINE-MODIFIED' });
  assert.deepEqual(flaggedRuns.map((x) => [x.label, x.run, x.state, x.tag]).sort(), [['base', 0, 'modified', 'BASELINE-MODIFIED'], ['fix', 0, 'modified', 'BASELINE-MODIFIED']]);
  assert.match(res.markdown, /\*\*BASELINE-MODIFIED: not measured on the pinned snapshot .* verdicts invalid\*\*/);
  assert.match(r.stdout, /^\*\*BASELINE-MODIFIED: /m);
  const raw = JSON.parse(readFileSync(join(wt, res.raw), 'utf8'));
  assert.deepEqual(raw.baseline, { snapshot: pin.snapshot, state: 'modified', flaggedRuns: 2 });
});

test('a re-mirror in the middle of an A/B: verify flags the run after it, ab prefixes the verdicts; a clean A/B has no flag', async (t) => {
  makeOverlay();
  const clean = await ab({});
  assert.equal(clean.code, 0, clean.out);
  let res = abResult();
  assert.deepEqual(res.config.baselineSnapshot, { snapshot: pin.snapshot, state: 'ok' });
  for (const v of verdicts(res)) assert.doesNotMatch(v, /BASELINE/);
  let raw = JSON.parse(readFileSync(join(wt, res.raw), 'utf8'));
  assert.deepEqual(raw.baseline, { snapshot: pin.snapshot, state: 'ok' });
  assert.ok(raw.results.filter((x) => !x.diff).every((x) => !('baseline' in x)), 'unflagged runs carry no baseline field');
  // the fake Chrome changes the main checkout's snapshot at the first navigation of run 1
  const f = join(repo.main, 'site-pretty', PAGE_JS.slice(1));
  t.after(() => git(repo.main, 'checkout', '--', 'site-pretty'));
  const r = await ab({ FAKE_CHROME_APPEND_AT: 'Page.navigate', FAKE_CHROME_APPEND_FILE: f });
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(f, 'utf8'), /changed mid-run/);
  assert.match(r.stdout, /BASELINE-MODIFIED: baseline state modified after this run/);
  res = abResult();
  for (const v of verdicts(res)) assert.match(v, /^BASELINE-MODIFIED: /);
  assert.equal(res.config.baselineSnapshot.state, 'ok', 'it started on the pinned snapshot');
  assert.equal(res.config.baselineSnapshot.tag, 'BASELINE-MODIFIED');
  assert.equal(res.config.baselineSnapshot.flaggedRuns.length, 2);
  raw = JSON.parse(readFileSync(join(wt, res.raw), 'utf8'));
  assert.deepEqual(raw.results.filter((x) => !x.diff).map((x) => x.baseline), [{ snapshot: pin.snapshot, state: 'modified', tag: 'BASELINE-MODIFIED' }, { snapshot: pin.snapshot, state: 'modified', tag: 'BASELINE-MODIFIED' }]);
});
