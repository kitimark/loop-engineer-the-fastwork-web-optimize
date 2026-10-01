// tools/bench.mjs mech end to end with the fake Chrome in bench mode (FAKE_CHROME_BENCH=1: the fake reads
// the probe counts from the served /bench-fake.json, so the baseline and the overlay really differ), in a
// temp repo + worktree over the fixture baseline: overlays rebuilt from the committed patch.diff into
// out/bench/overlays (fixes/<t>/overlay untouched), --live, --on stacking (ALREADY-REMOVED), experiments
// (expected fail = row PASS, MISMATCH), VACUOUS, FLAKY (quiescence cap), parity diffs, BASELINE-CHANGED,
// CONFLICT, the short lane (180 s) and bench-results.json fields.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, TESTS, sha256, FAKE_HOST } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
let repo;
const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
// FW_TEST_HOST: the fake host, explicitly (real samplers refuse under node --test, I-024)
const benchEnv = (name, extra = {}) => ({ CHROME: FAKE, FAKE_CHROME_BENCH: '1', FW_BENCH_TEST_FAST: '1', FW_TEST_HOST: FAKE_HOST, ...extra, FW_STATE_DIR: join(repo.root, `state-${name}`), FAKE_CHROME_LOG: join(repo.root, `${name}.jsonl`) });
const bench = (name, ...a) => nodeAsync(join(repo.wt, 'tools', 'bench.mjs'), a, { cwd: repo.wt, env: benchEnv(name), timeout: 110000 });
const benchX = (name, extra, ...a) => nodeAsync(join(repo.wt, 'tools', 'bench.mjs'), a, { cwd: repo.wt, env: benchEnv(name, extra), timeout: 110000 });
const results = (t) => JSON.parse(readFileSync(join(repo.wt, 'fixes', t, 'bench-results.json'), 'utf8'));
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// the fake answers every window's page probes from `probes` (or a per-label `windows` entry)
const BASE_FAKE = { probes: { navQs: 30 }, snapshot: { 'attr body data-y': ['0'] }, metricsStep: { LayoutCount: 10 } };
const PATCH_FAKE = { probes: { navQs: 0 }, snapshot: { 'attr body data-y': ['0'] }, metricsStep: { LayoutCount: 2 } };
const spec = (topic, extra = {}) => ({
  schema: 1, topic, status: 'authored', evidence: 'fixture: querySelector per frame 30 -> 0',
  segments: { page: { from: 'top', to: 'end', step: 150 } },
  probes: { navQs: { kind: 'querySelector', selector: '.start-selling-top-nav' }, layouts: { kind: 'perfMetrics', metric: 'LayoutCount' } },
  mechanism: [
    { id: 'nav-cached', viewport: 'mobile', segment: 'page', probe: 'navQs', baseline: '>= 10', patched: '== 0', why: 'the nav element is looked up once' },
    { id: 'fewer-layouts', viewport: 'mobile', segment: 'page', probe: 'layouts', baseline: '>= 5', patched: '<= 0.5 * baseline', why: 'fewer layouts per window' },
  ],
  parity: [{ viewport: 'mobile', segment: 'page', attrs: [['body', 'data-y']] }],
  ...extra,
});
/** A topic whose overlay turns the served bench-fake.json into `fake`; patch.diff via fix.mjs diff. */
function makeTopic(t, fake, { on, benchSpec = spec(t) } = {}) {
  assert.equal(fix('new', t).code, 0);
  const e = fix('edit', t, '/bench-fake.json', ...(on ? ['--on', on] : []));
  assert.equal(e.code, 0, e.out);
  writeFileSync(join(repo.wt, 'fixes', t, 'overlay', 'bench-fake.json'), JSON.stringify(fake));
  const d = fix('diff', t, ...(on ? ['--on', on] : []));
  assert.equal(d.code, 0, d.out);
  writeFileSync(join(repo.wt, 'fixes', t, 'bench.json'), JSON.stringify(benchSpec, null, 1));
}

before(() => {
  repo = makeTempRepo({ worktree: 'bench-wt' });
  const fx = makeFixtureHome(repo.main);
  for (const d of [fx.site, fx.pretty]) writeFileSync(join(d, 'bench-fake.json'), JSON.stringify(BASE_FAKE));
  makeTopic('fast-nav', PATCH_FAKE, { benchSpec: spec('fast-nav', {
    experiments: [
      { id: 'fast-nav/01', variant: 'final', expect: { mech: 'pass', parity: 'pass' } },
      { id: 'fast-nav/02', variant: 'variants/02.diff', expect: { mech: { 'nav-cached': 'fail', 'fewer-layouts': 'pass' }, parity: 'pass' }, why: 'cached the wrong element' },
      { id: 'fast-nav/03', variant: 'variants/03.diff', expect: { mech: 'pass', parity: 'pass' }, why: 'claimed a win that is not there' },
      { id: 'fast-nav/04', variant: 'variants/04.diff', expect: { parity: 'fail', gain: 'broke' }, why: 'broke the data-y attribute' },
    ],
  }) });
  // variants: 02 keeps the lookups (nav-cached fails, as expected); 03 the same, but expected to pass;
  // 04 breaks parity. Built with the same overlay -> fix.mjs diff path, then saved as variants/<nn>.diff.
  const variant = (nn, fake) => {
    const ov = join(repo.wt, 'fixes', 'fast-nav', 'overlay', 'bench-fake.json');
    const keep = readFileSync(ov, 'utf8'), keepPatch = readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff'));
    writeFileSync(ov, JSON.stringify(fake));
    assert.equal(fix('diff', 'fast-nav').code, 0);
    mkdirSync(join(repo.wt, 'fixes', 'fast-nav', 'variants'), { recursive: true });
    writeFileSync(join(repo.wt, 'fixes', 'fast-nav', 'variants', `${nn}.diff`), readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff')));
    writeFileSync(ov, keep); writeFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff'), keepPatch);
  };
  const noCache = { ...PATCH_FAKE, probes: { navQs: 30 } };
  variant('02', noCache);
  variant('03', noCache);
  variant('04', { ...PATCH_FAKE, snapshot: { 'attr body data-y': [null] } });
  assert.equal(node(join(repo.wt, 'tools', 'bench.mjs'), ['lint'], { cwd: repo.wt }).code, 0);
});

test('mech: PASS from the committed patch.diff (rebuilt in out/bench/overlays), live overlay untouched; short lane; bench-results.json', async () => {
  // make the live overlay differ from the committed patch: mech must not use it
  const live = join(repo.wt, 'fixes', 'fast-nav', 'overlay', 'bench-fake.json');
  const liveBefore = readFileSync(live, 'utf8');
  writeFileSync(live, JSON.stringify(BASE_FAKE));
  const mtime = statSync(live).mtimeMs;
  try { await passAndLive(live, mtime); } finally { writeFileSync(live, liveBefore); }
});
async function passAndLive(live, mtime) {
  const r = await bench('pass', 'mech', 'fast-nav');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /PASS +nav-cached +mobile page: baseline 30, 30 \(>= 10\) {2}patched 0, 0 \(== 0\)/);
  assert.match(r.stdout, /PASS +fewer-layouts +mobile page: baseline 10, 10 \(>= 5\) {2}patched 2, 2 \(<= 0.5 \* baseline\)/);
  assert.match(r.stdout, /PASS +parity mobile page: 3 steps, diffs per repeat 0, 0/);
  assert.match(r.stdout, /^MECH PASS fast-nav \(2 checks, 1 parity, \d+ s\) -> fixes\/fast-nav\/bench-results.json$/m);
  assert.equal(statSync(live).mtimeMs, mtime, 'fixes/<t>/overlay untouched');
  assert.equal(JSON.parse(readFileSync(join(repo.wt, 'out', 'bench', 'overlays', 'fast-nav', 'bench-fake.json'), 'utf8')).probes.navQs, 0, 'rebuilt from patch.diff');
  const res = results('fast-nav');
  const m = res.mech;
  assert.equal(m.verdict, 'PASS');
  assert.equal(m.patch.kind, 'committed');
  assert.equal(m.patch.sha256, sha256(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff'))));
  assert.deepEqual(m.patch.drift, []);
  assert.match(m.toolsSha, /^[0-9a-f]{12}$/);
  assert.equal(m.chrome, 'FakeChrome/1.0');
  assert.match(m.baselineManifest, /^[0-9a-f]{16}$/);
  assert.deepEqual(m.baselineSnapshot, { snapshot: null, state: 'unpinned' }, 'the snapshot pinned by baseline.json (none in this temp repo)');
  assert.deepEqual([m.repeat, m.viewports, m.on, m.served.files, m.timing], [2, ['mobile'], null, 1, 'test-fast']);
  assert.equal(typeof m.host.load1Start, 'number');
  assert.deepEqual(m.checks.map((c) => [c.id, c.verdict, c.baseline.values, c.patched.values]), [['nav-cached', 'PASS', [30, 30], [0, 0]], ['fewer-layouts', 'PASS', [10, 10], [2, 2]]]);
  // ABBA per repeat: baseline, patched, then patched, baseline; unthrottled; probes installed before any page script
  const log = readLog(benchEnv('pass').FAKE_CHROME_LOG);
  const fakes = log.filter((l) => l.method === '(bench-fake)').map((l) => l.params.data.metricsStep.LayoutCount);
  assert.deepEqual(fakes, [10, 2, 2, 10]);
  assert.equal(log.filter((l) => l.method === 'Emulation.setCPUThrottlingRate').length, 0);
  assert.ok(log.filter((l) => l.method === 'Page.addScriptToEvaluateOnNewDocument').length === 4);
  const evals = log.filter((l) => l.method === 'Runtime.evaluate').map((l) => l.params.expression);
  assert.ok(evals.includes('window.__bench.reset("fast-nav:page")'));
  assert.ok(evals.includes('window.__bench.read("fast-nav:page")'));
  // the short lane, 180 s; released
  const lg = JSON.parse(readFileSync(join(benchEnv('pass').FW_STATE_DIR, 'locks', 'chrome-measure.last-grant.json'), 'utf8'));
  assert.deepEqual([lg.owner, lg.short, lg.maxSec], ['bench-fast-nav', true, 180]);
  assert.equal(existsSync(join(benchEnv('pass').FW_STATE_DIR, 'locks', 'chrome-measure.json')), false);
  // --live uses the owner's overlay as it is now (here: the baseline bytes) -> nav-cached FAILS
  const l = await bench('live', 'mech', 'fast-nav', '--live', '--repeat', '1');
  assert.equal(l.code, 1, l.out);
  assert.match(l.stdout, /FAIL +nav-cached/);
  assert.equal(results('fast-nav').mech.patch.kind, 'live');
}

test('mech --experiment: expected outcomes per check and parity; a claimed win that is not there is a MISMATCH', async () => {
  let r = await bench('exp2', 'mech', 'fast-nav', '--experiment', 'fast-nav/02', '--repeat', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /experiment nav-cached: expected fail, observed FAIL: as expected/);
  assert.match(r.stdout, /^MECH PASS fast-nav fast-nav\/02/m);
  const e = results('fast-nav').experiments['fast-nav/02'].mech;
  assert.equal(e.patch.file, 'fixes/fast-nav/variants/02.diff');
  assert.equal(e.experiment.verdict, 'PASS');
  r = await bench('exp3', 'mech', 'fast-nav', '--experiment', 'fast-nav/03', '--repeat', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /experiment nav-cached: expected pass, observed FAIL: MISMATCH/);
  assert.match(r.stdout, /^MECH MISMATCH fast-nav fast-nav\/03/m);
  r = await bench('exp4', 'mech', 'fast-nav', '--experiment', 'fast-nav/04', '--repeat', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /FAIL +parity mobile page: 3 steps, diffs per repeat 3\n +step 0 y 0 attr body data-y: \["0"\] -> \[null\]/);
  assert.match(r.stdout, /experiment parity: expected fail, observed FAIL: as expected/);
  r = await bench('exp9', 'mech', 'fast-nav', '--experiment', 'fast-nav/09');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no experiment "fast-nav\/09"/);
});

test('mech --on: the baseline side is the other overlay; a mechanism it already removed is ALREADY-REMOVED, not a failure', async () => {
  makeTopic('nav-b', { ...PATCH_FAKE, metricsStep: { LayoutCount: 1 } }, { on: 'fast-nav', benchSpec: { ...spec('nav-b'), mechanism: [spec('nav-b').mechanism[0]] } });
  let r = await bench('nob', 'mech', 'nav-b', '--repeat', '1');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /is stacked on fast-nav: run with --on fast-nav/);
  r = await bench('on', 'mech', 'nav-b', '--on', 'fast-nav', '--repeat', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /ALREADY-REMOVED +nav-cached/);
  assert.equal(results('nav-b').mechOn['fast-nav'].on, 'fast-nav');
  assert.ok(existsSync(join(repo.wt, 'out', 'bench', 'overlays', 'on-fast-nav', 'bench-fake.json')));
});

test('mech: VACUOUS when the baseline no longer shows the mechanism; FLAKY at the quiescence cap; exit codes', async () => {
  const vac = spec('vacuous-nav');
  vac.mechanism[0].baseline = '>= 100';
  makeTopic('vacuous-nav', PATCH_FAKE, { benchSpec: vac });
  let r = await bench('vac', 'mech', 'vacuous-nav', '--repeat', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /VACUOUS +nav-cached/);
  const fl = spec('flaky-nav');
  fl.segments.page.step = 50; // 7 steps, all at the cap on the patched side
  makeTopic('flaky-nav', { ...PATCH_FAKE, capped: true }, { benchSpec: fl });
  r = await bench('flaky', 'mech', 'flaky-nav', '--repeat', '1');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /FLAKY +nav-cached .*quiescence cap/);
  assert.match(r.stdout, /^MECH FLAKY flaky-nav/m);
  // the host slept during the run (I-026): FLAKY whatever the counts say, never PASS
  // (the patched page answers each quiesce() after 1.5 s: 3 steps >= 4.5 s, so the sleep at 2.5 s of the
  // host clock falls between the start and end snapshots)
  makeTopic('sleepy-nav', { ...PATCH_FAKE, quiesceMs: 1500 }, { benchSpec: spec('sleepy-nav') });
  r = await benchX('slept', { FAKE_HOST_SUSPEND: '2500:30' }, 'mech', 'sleepy-nav', '--repeat', '1');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /FLAKY: the host slept 30 s during the run \(I-026\)/);
  assert.match(r.stdout, /^MECH FLAKY sleepy-nav/m);
  const m = results('sleepy-nav').mech;
  assert.deepEqual([m.verdict, m.hostSlept, m.host.sleptSec >= 29], ['FLAKY', true, true]);
});

test('mech: --max-seconds stops at the budget (exit 124) and keeps the finished sessions as mechPartial, never as mech', async () => {
  const sl = spec('slow-nav');
  sl.segments.page.step = 50; // 7 steps; the patched page takes 1.5 s per quiesce: >= 10 s, past the 8 - 3 s deadline
  makeTopic('slow-nav', { ...PATCH_FAKE, quiesceMs: 1500 }, { benchSpec: sl });
  const r = await bench('budget', 'mech', 'slow-nav', '--max-seconds', '8', '--repeat', '1');
  assert.equal(r.code, 124, r.out);
  assert.match(r.stderr, /the short-lane budget of 8 s ran out/);
  assert.match(r.stderr, /partial record \(finished sessions only\) -> fixes\/slow-nav\/bench-results.json mechPartial/);
  // the fast baseline session finished (its per-window counts are logged and kept); the slow patched one did not
  assert.match(r.stdout, /slow-nav:page: \d+ steps, 60 frames; navQs 30, layouts \d+/);
  const res = results('slow-nav');
  assert.equal(res.mech, undefined, 'a partial run is never a mech record');
  const p = res.mechPartial;
  assert.deepEqual([p.verdict, p.maxSeconds, p.repeat, p.viewports], ['BUDGET', 8, 1, ['mobile']]);
  assert.equal(p.sessions.mobile.baseline.length, 1);
  assert.equal(p.sessions.mobile.baseline[0].windows['slow-nav:page'].counts['slow-nav:navQs'], 30);
  assert.equal(p.sessions.mobile.patched.length, 0);
  const lg = JSON.parse(readFileSync(join(benchEnv('budget').FW_STATE_DIR, 'locks', 'chrome-measure.last-grant.json'), 'utf8'));
  assert.deepEqual([lg.short, lg.maxSec], [true, 8]);
  const bad = await bench('budget-bad', 'mech', 'slow-nav', '--max-seconds', '300');
  assert.equal(bad.code, 2, bad.out);
  assert.match(bad.stderr, /--max-seconds must be 5-180/);
  rmSync(join(repo.wt, 'fixes', 'slow-nav'), { recursive: true, force: true });
});

test('mech: a patch made on another mirror is BASELINE-CHANGED; one that does not apply is a CONFLICT', async () => {
  makeTopic('drift-nav', PATCH_FAKE);
  cpSync(join(repo.wt, 'fixes', 'drift-nav', 'patch.diff'), join(repo.root, 'drift.diff'));
  const pf = join(repo.wt, 'fixes', 'drift-nav', 'patch.diff');
  // the header says the baseline file had other bytes, and the hunk no longer matches
  writeFileSync(pf, readFileSync(pf, 'utf8').replace(/^(# base-sha256 bench-fake.json )[0-9a-f]{64}$/m, `$1${'0'.repeat(64)}`).replace(/^-\{.*$/m, '-{"windows":{}}'));
  let r = await bench('drift', 'mech', 'drift-nav', '--repeat', '1');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^BASELINE-CHANGED drift-nav: the patch does not apply/m);
  writeFileSync(pf, readFileSync(join(repo.root, 'drift.diff'), 'utf8').replace(/^-\{.*$/m, '-{"windows":{}}'));
  r = await bench('conflict', 'mech', 'drift-nav', '--repeat', '1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^CONFLICT drift-nav: the patch does not apply/m);
  rmSync(join(repo.wt, 'fixes', 'drift-nav'), { recursive: true, force: true });
});

test('mech refuses to write results in the main checkout (Hard rule 5)', () => {
  mkdirSync(join(repo.main, 'fixes', 'fast-nav'), { recursive: true });
  cpSync(join(repo.wt, 'fixes', 'fast-nav', 'bench.json'), join(repo.main, 'fixes', 'fast-nav', 'bench.json'));
  const r = node(join(repo.main, 'tools', 'bench.mjs'), ['mech', 'fast-nav'], { cwd: repo.main, env: benchEnv('main') });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /refusing to write fixes\/\*\/bench-results.json in the main checkout/);
  assert.equal(existsSync(join(benchEnv('main').FW_STATE_DIR, 'locks')), false, 'never queued');
});

test('review-i027: mech, gain, calibrate and reconfirm refuse a stubbed host outside a test with a real Chrome (exit 2, before the lock)', () => {
  const REAL = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  for (const args of [['mech', 'fast-nav'], ['gain', 'fast-nav'], ['calibrate', 'fast-nav'], ['reconfirm']]) {
    const env = benchEnv(`stub-${args[0]}`, { CHROME: REAL });
    const r = node(join(repo.wt, 'tools', 'bench.mjs'), args, { cwd: repo.wt, env });
    assert.equal(r.code, 2, `${args[0]}: ${r.out}`);
    assert.match(r.stderr, /bench: a stubbed host \(FW_TEST_HOST=.*fake-host\.mjs\) outside a test, with a real Chrome: refused/);
    assert.equal(existsSync(join(env.FW_STATE_DIR, 'locks')), false, `${args[0]}: never queued`);
  }
  assert.equal(node(join(repo.wt, 'tools', 'bench.mjs'), ['lint'], { cwd: repo.wt, env: benchEnv('stub-lint', { CHROME: REAL }) }).stderr.includes('stubbed host'), false, 'lint never runs Chrome');
});

test('review-snapshot note 1: mech on a baseline that is not the pinned snapshot (FW_BASELINE_ALLOW_MODIFIED=1): BASELINE-<STATE>: PASS, exit 3', async (t) => {
  // a pin in the worktree, but the main checkout's fixture baseline is not a committed snapshot: state untracked
  const pinFile = join(repo.wt, 'baseline.json');
  writeFileSync(pinFile, JSON.stringify({ snapshot: 'b1-0123abcd', trees: { site: 'a'.repeat(40), 'site-pretty': 'b'.repeat(40) } }));
  t.after(() => rmSync(pinFile, { force: true }));
  let r = await bench('flag-refused', 'mech', 'fast-nav');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /^bench\.mjs: BASELINE-UNTRACKED: /m);
  r = await benchX('flag', { FW_BASELINE_ALLOW_MODIFIED: '1' }, 'mech', 'fast-nav');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /^WARNING bench\.mjs: FW_BASELINE_ALLOW_MODIFIED=1: using a baseline that is NOT the pinned snapshot \(state untracked\)/m);
  assert.match(r.stdout, /^MECH BASELINE-UNTRACKED: PASS fast-nav \(2 checks, 1 parity, \d+ s\) -> fixes\/fast-nav\/bench-results.json$/m);
  const m = results('fast-nav').mech;
  assert.equal(m.verdict, 'BASELINE-UNTRACKED: PASS');
  assert.deepEqual(m.baselineSnapshot, { snapshot: 'b1-0123abcd', state: 'untracked', tag: 'BASELINE-UNTRACKED' });
});
