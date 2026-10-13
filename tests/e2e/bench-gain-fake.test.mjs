// tools/bench.mjs gain | calibrate end to end with the fake Chrome (bench mode: per-side
// Performance.getMetrics steps from the served /bench-fake.json) and the fake host (FW_TEST_HOST, from
// ts-i017's tools/lib/host.mjs): ABBA order, 6x throttle, the normal lane, calibration refused on a warn
// host, contaminated runs -> INCONCLUSIVE, authoring from a clean HOLDS, experiments, device iphone.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, TESTS } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const FAKE_HOST = join(TESTS, 'fixtures', 'fake-host.mjs');
let repo;
const fix = (cwd, ...a) => node(join(cwd, 'tools', 'fix.mjs'), a, { cwd, env: { FW_ALLOW_MAIN: '1' } });
const env = (name, extra = {}) => ({ CHROME: FAKE, FAKE_CHROME_BENCH: '1', FW_BENCH_TEST_FAST: '1', FW_TEST_HOST: FAKE_HOST, FW_STATE_DIR: join(repo.root, `state-${name}`), FAKE_CHROME_LOG: join(repo.root, `${name}.jsonl`), ...extra });
const bench = (name, a, extra = {}, cwd = repo.wt) => nodeAsync(join(cwd, 'tools', 'bench.mjs'), a, { cwd, env: env(name, extra), timeout: 115000 });
const results = (t) => JSON.parse(readFileSync(join(repo.wt, 'fixes', t, 'bench-results.json'), 'utf8'));
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// Tier B reads getMetrics twice per scenario: the delta is one step. styleLayoutMs = 1000 * (style + layout s)
const BASE_FAKE = { probes: { navQs: 30 }, snapshot: {}, metricsStep: { RecalcStyleDuration: 0.2, LayoutDuration: 0.05, LayoutCount: 10 } };
const PATCH_FAKE = { probes: { navQs: 0 }, snapshot: {}, metricsStep: { RecalcStyleDuration: 0.1, LayoutDuration: 0.05, LayoutCount: 4 } };
const spec = (topic, extra = {}) => ({
  schema: 1, topic, status: 'authored', evidence: 'fixture: style+layout 250 -> 150 ms per scenario',
  segments: { page: { from: 'top', to: 'end', step: 150 } },
  probes: { navQs: { kind: 'querySelector', selector: '.start-selling-top-nav' } },
  mechanism: [{ id: 'nav-cached', viewport: 'mobile', segment: 'page', probe: 'navQs', baseline: '>= 10', patched: '== 0', why: 'looked up once' }],
  gain: { scenario: { viewport: 'mobile', segment: 'page' }, metric: 'styleLayoutMs', direction: 'lower', device: 'chrome', dwellFrames: 2 },
  ...extra,
});
function makeTopic(cwd, t, file, content, benchSpec) {
  assert.equal(fix(cwd, 'new', t).code, 0);
  assert.equal(fix(cwd, 'edit', t, file).code, 0);
  writeFileSync(join(cwd, 'fixes', t, 'overlay', file.replace(/^\//, '')), content);
  const d = fix(cwd, 'diff', t);
  assert.equal(d.code, 0, d.out);
  if (benchSpec) writeFileSync(join(cwd, 'fixes', t, 'bench.json'), JSON.stringify(benchSpec, null, 1));
  rmSync(join(cwd, 'fixes', t, 'overlay'), { recursive: true, force: true });
}

before(() => {
  repo = makeTempRepo({ worktree: 'gain-wt' });
  const fx = makeFixtureHome(repo.main);
  for (const d of [fx.site, fx.pretty]) writeFileSync(join(d, 'bench-fake.json'), JSON.stringify(BASE_FAKE));
  makeTopic(repo.wt, 'fast-nav', '/bench-fake.json', JSON.stringify(PATCH_FAKE), spec('fast-nav', {
    experiments: [
      { id: 'fast-nav/01', variant: 'final', expect: { mech: 'pass', gain: 'better' } },
      { id: 'fast-nav/02', variant: 'variants/02.diff', expect: { gain: 'within-noise' }, why: 'a no-op variant' },
      { id: 'fast-nav/03', variant: 'variants/03.diff', expect: { gain: 'better' }, why: 'claimed a win that is not there' },
      { id: 'fast-nav/04', variant: 'variants/04.diff', expect: { mech: { 'nav-cached': 'fail' }, gain: 'broke' }, why: 'broke something' },
    ],
  }));
  // variants 02-04: a no-op change of another file (the metrics stay the baseline's)
  mkdirSync(join(repo.wt, 'fixes', 'fast-nav', 'variants'), { recursive: true });
  makeTopic(repo.wt, 'noop-variant', '/robots.txt', 'User-agent: *\nAllow: /x\n');
  for (const nn of ['02', '03', '04']) writeFileSync(join(repo.wt, 'fixes', 'fast-nav', 'variants', `${nn}.diff`), readFileSync(join(repo.wt, 'fixes', 'noop-variant', 'patch.diff')));
  rmSync(join(repo.wt, 'fixes', 'noop-variant'), { recursive: true, force: true });
  assert.equal(node(join(repo.wt, 'tools', 'bench.mjs'), ['lint'], { cwd: repo.wt }).code, 0);
});

test('gain before calibrate: INCONCLUSIVE; calibrate on a warn host is refused; on a quiet host it stores the floor', async () => {
  let r = await bench('nocal', ['gain', 'fast-nav']);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^GAIN INCONCLUSIVE fast-nav styleLayoutMs \(load1 1-1, other CPU <= [\d.-]+ %, HOST STUBBED\): no calibration: run bench.mjs calibrate first/m);
  assert.match(r.stdout, /HOST STUBBED/);
  // FW_GATE_MAX_LOAD1: the lock's host gate (I-016) admits the hold; the runs themselves see the warn / dirty host
  r = await bench('calwarn', ['calibrate', 'fast-nav'], { FAKE_HOST_LOAD1: '8', FW_GATE_MAX_LOAD1: '20' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^CALIBRATION REFUSED fast-nav: the host was warn/m);
  assert.equal(results('fast-nav').calibration, undefined);
  assert.equal(results('fast-nav').calibrationRefused.band, 'warn');
  r = await bench('cal', ['calibrate', 'fast-nav']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CALIBRATED fast-nav styleLayoutMs: minEffect 0 /m);
  assert.match(r.stdout, /relative spread per metric \(Q3: pick the smallest\): styleLayoutMs 0/);
  const c = results('fast-nav').calibration;
  assert.deepEqual([c.band, c.minEffect, c.runsPerSide, c.cpu, c.timeDomain, c.setting], ['clean', 0, 5, 6, 'timeTicks', 'timeTicks 6x --vendors=local --https test-fast']);
  assert.equal(c.chromeMajor, 1, 'FakeChrome/1.0');
  assert.deepEqual(c.values, { baseline: [250, 250, 250, 250, 250], patched: [250, 250, 250, 250, 250] }, 'A/A: both sides baseline');
  assert.equal(c.runs.length, 10);
  assert.ok(c.runs.every((x) => x.host.stub && x.host.loadInvalid === false), 'host records per run, stub marked');
});

test('gain: HOLDS from ABBA runs at 6x in the normal lane, authors the effect on a clean host; contaminated runs are INCONCLUSIVE', async () => {
  let r = await bench('gain', ['gain', 'fast-nav', '--max-load', '6']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN HOLDS fast-nav styleLayoutMs: HL shift 100 \[100, 100\], p 0\.004, budget 0 \(minEffect 0\) \(load1 1-1, other CPU <= [\d.-]+ %, HOST STUBBED\) \[authored: later runs must keep >= half of this shift\]/m);
  const res = results('fast-nav');
  assert.equal(res.gain.verdict, 'HOLDS');
  assert.deepEqual(res.gain.values, { baseline: [250, 250, 250, 250, 250], patched: [150, 150, 150, 150, 150] });
  assert.equal(res.authored.shift, 100);
  const log = readLog(env('gain').FAKE_CHROME_LOG);
  assert.deepEqual(log.filter((l) => l.method === '(bench-fake)').map((l) => l.params.data.metricsStep.RecalcStyleDuration), [0.2, 0.1, 0.1, 0.2, 0.2, 0.1, 0.1, 0.2, 0.2, 0.1], 'ABBA');
  assert.deepEqual([...new Set(log.filter((l) => l.method === 'Emulation.setCPUThrottlingRate').map((l) => l.params.rate))], [6, 1]);
  assert.equal(log.filter((l) => l.method === 'Page.addScriptToEvaluateOnNewDocument').every((l) => !/benchPage/.test(JSON.stringify(l.params))), true, 'no Tier A probes in Tier B');
  const lg = JSON.parse(readFileSync(join(env('gain').FW_STATE_DIR, 'locks', 'chrome-measure.last-grant.json'), 'utf8'));
  assert.deepEqual([lg.owner, lg.short], ['bench-fast-nav', false], 'normal lane');
  // later: the budget is half the authored shift; still holds
  r = await bench('gain2', ['gain', 'fast-nav']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /budget 50 /);
  // a contaminated host: never a verdict
  r = await bench('dirty', ['gain', 'fast-nav'], { FAKE_HOST_LOAD1: '12', FW_GATE_MAX_LOAD1: '20' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^GAIN INCONCLUSIVE fast-nav .*contaminated: run 1: load1 12 > 10 at run start/m);
  // the lock's host gate (I-016) granted the hold only after its cap: every run is contaminated
  r = await bench('gated', ['gain', 'fast-nav'], { FW_GATE_MAX_LOAD1: '0.5', FW_GATE_MAX_WAIT: '0' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^GAIN INCONCLUSIVE fast-nav .*contaminated: run 1: lock granted by gate timeout/m);
  // a warn host decides, marked
  // a host sleep inside a run (I-026) contaminates it (the gate's 10 s window is fake time: runs start after it)
  r = await bench('slept', ['gain', 'fast-nav'], { FAKE_HOST_SUSPEND: '10600:30,11200:30,11800:30,12400:30' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^GAIN INCONCLUSIVE fast-nav .*contaminated: .*host slept 30 s during the run \(I-026\)/m);
  assert.match(r.stdout, /slept 30 s CONTAMINATED/);
  r = await bench('warn', ['gain', 'fast-nav'], { FAKE_HOST_LOAD1: '8', FW_GATE_MAX_LOAD1: '20' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN HOLDS .*\(WARN band, load1 8-8/m);
});

test('calibrate needs no patch.diff: the A/A measures the baseline only (I-029); gain still needs one', async () => {
  mkdirSync(join(repo.wt, 'fixes', 'fresh-topic'), { recursive: true });
  writeFileSync(join(repo.wt, 'fixes', 'fresh-topic', 'bench.json'), JSON.stringify(spec('fresh-topic'), null, 1));
  let r = await bench('fresh-cal', ['calibrate', 'fresh-topic']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /A\/A: site-pretty twice/);
  assert.match(r.stdout, /^CALIBRATED fresh-topic styleLayoutMs: minEffect /m);
  const c = results('fresh-topic').calibration;
  assert.deepEqual([c.patch, c.band], [null, 'clean']);
  r = await bench('fresh-gain', ['gain', 'fresh-topic']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /fixes\/fresh-topic\/patch.diff not found/);
  rmSync(join(repo.wt, 'fixes', 'fresh-topic'), { recursive: true, force: true });
});

test('gain --experiment: expected outcome per row; broke and iphone rows are skipped', async () => {
  let r = await bench('e1', ['gain', 'fast-nav', '--experiment', 'fast-nav/01']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN PASS fast-nav fast-nav\/01: expected better, observed better/m);
  r = await bench('e2', ['gain', 'fast-nav', '--experiment', 'fast-nav/02']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN PASS fast-nav fast-nav\/02: expected within-noise, observed within-noise/m);
  r = await bench('e3', ['gain', 'fast-nav', '--experiment', 'fast-nav/03']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^GAIN MISMATCH fast-nav fast-nav\/03: expected better, observed within-noise/m);
  assert.equal(results('fast-nav').experiments['fast-nav/03'].gain.verdict, 'MISMATCH');
  r = await bench('e4', ['gain', 'fast-nav', '--experiment', 'fast-nav/04']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN SKIPPED fast-nav\/04: expect.gain is broke/m);
  const s = spec('phone-only'); s.gain.device = 'iphone';
  mkdirSync(join(repo.wt, 'fixes', 'phone-only'), { recursive: true });
  writeFileSync(join(repo.wt, 'fixes', 'phone-only', 'bench.json'), JSON.stringify(s));
  r = await bench('iph', ['gain', 'phone-only']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GAIN SKIPPED phone-only: device iphone/m);
  assert.equal(existsSync(join(env('iph').FW_STATE_DIR, 'locks')), false, 'never queued');
  for (const cmd of ['mech', 'gain', 'calibrate']) {
    r = await bench('nolock', [cmd, 'fast-nav', '--no-lock']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /there is no --no-lock/);
  }
});

test('review-snapshot note 1: on a baseline that is not the pinned snapshot (FW_BASELINE_ALLOW_MODIFIED=1) calibrate is refused, gain is prefixed, exits 3 and authors nothing', async (t) => {
  // a pin in the worktree, but the main checkout's fixture baseline is not a committed snapshot and its files do not match the pin: state modified (I-268; before it: untracked)
  const pinFile = join(repo.wt, 'baseline.json');
  writeFileSync(pinFile, JSON.stringify({ snapshot: 'b1-0123abcd', trees: { site: 'a'.repeat(40), 'site-pretty': 'b'.repeat(40) } }));
  const resFile = join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json');
  const keep = readFileSync(resFile, 'utf8');
  t.after(() => { rmSync(pinFile, { force: true }); writeFileSync(resFile, keep); });
  let r = await bench('flag-refused', ['gain', 'fast-nav']);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /^bench\.mjs: BASELINE-MODIFIED: /m);
  const ALLOW = { FW_BASELINE_ALLOW_MODIFIED: '1' };
  r = await bench('flag-cal', ['calibrate', 'fast-nav'], ALLOW);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^CALIBRATION REFUSED fast-nav: BASELINE-MODIFIED: not measured on the pinned snapshot b1-0123abcd throughout/m);
  assert.equal(results('fast-nav').calibration.band, 'clean', 'the stored calibration is kept');
  assert.equal(results('fast-nav').calibrationRefused.refused, 'BASELINE-MODIFIED');
  // no authored effect yet: a flagged HOLDS must not author one
  const res = results('fast-nav');
  delete res.authored;
  writeFileSync(resFile, JSON.stringify(res, null, 1));
  r = await bench('flag-gain', ['gain', 'fast-nav'], ALLOW);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^GAIN BASELINE-MODIFIED: HOLDS fast-nav styleLayoutMs: .* \[not authored: BASELINE-MODIFIED\] -> /m);
  const after = results('fast-nav');
  assert.equal(after.authored, undefined);
  assert.equal(after.gain.verdict, 'BASELINE-MODIFIED: HOLDS');
  assert.deepEqual(after.gain.baselineSnapshot, { snapshot: 'b1-0123abcd', state: 'modified', tag: 'BASELINE-MODIFIED' });
});

test('I-034: a non-finite gain metric (p95 null on the patched side) ends GAIN INCONCLUSIVE naming it, not a bench-stats throw', async () => {
  makeTopic(repo.wt, 'null-p95', '/bench-fake.json', JSON.stringify({ ...PATCH_FAKE, perfFrames: [null] }), spec('null-p95', { gain: { ...spec('x').gain, metric: 'p95' } }));
  let r = await bench('np-cal', ['calibrate', 'null-p95']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CALIBRATED null-p95 p95: minEffect /m, 'the A/A is the baseline: finite');
  r = await bench('np-gain', ['gain', 'null-p95']);
  assert.equal(r.code, 3, r.out);
  assert.doesNotMatch(r.out, /is not a finite number \(null\); fix or drop that run/, 'never handed to bench-stats');
  assert.match(r.stdout, /^GAIN INCONCLUSIVE null-p95: scenario errors: p95 not a finite number \(null\) on side B$/m);
  rmSync(join(repo.wt, 'fixes', 'null-p95'), { recursive: true, force: true });
});

test('T8+ (I-033): display / wake recorded per run; a change refuses calibration, tags gain HOST-DISPLAY-CHANGED, exits 3 and authors nothing', async (t) => {
  const resFile = join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json');
  const keep = readFileSync(resFile, 'utf8');
  t.after(() => writeFileSync(resFile, keep));
  // FAKE_HOST_DARKWAKE_AFTER=1: run 1 (side A) starts with the display on, FullWake and ends with it off, DarkWake
  const DARK = { FAKE_HOST_DARKWAKE_AFTER: '1' };
  let r = await bench('dark-cal', ['calibrate', 'fast-nav'], DARK);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^CALIBRATION REFUSED fast-nav: HOST-DISPLAY-CHANGED: A run 1: display on, FullWake at the start, display off, DarkWake at the end/m);
  assert.equal(results('fast-nav').calibration.band, 'clean', 'the stored calibration is kept');
  assert.equal(results('fast-nav').calibrationRefused.refused, 'HOST-DISPLAY-CHANGED');
  const res = results('fast-nav');
  delete res.authored;
  writeFileSync(resFile, JSON.stringify(res, null, 1));
  r = await bench('dark-gain', ['gain', 'fast-nav'], DARK);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^host state: display on\/off, FullWake\/DarkWake, power AC, display-sleep assertion yes; HOST-DISPLAY-CHANGED: A run 1: /m);
  assert.match(r.stdout, /^GAIN HOST-DISPLAY-CHANGED: HOLDS fast-nav styleLayoutMs: .* \[not authored: HOST-DISPLAY-CHANGED\] -> /m);
  const after = results('fast-nav');
  assert.equal(after.authored, undefined);
  assert.equal(after.gain.verdict, 'HOST-DISPLAY-CHANGED: HOLDS');
  assert.equal(after.gain.hostState.tag, 'HOST-DISPLAY-CHANGED');
  const p0 = after.gain.runs[0].host.power;
  assert.deepEqual([p0.start.display, p0.start.fullWake, p0.end.display, p0.end.fullWake, p0.end.powerSource], ['on', true, 'off', false, 'AC']);
  assert.deepEqual(Object.keys(after.gain.chromeProfile), ['featureStateSha256', 'featureStateMtime', 'variationsSeedSha256', 'variationsSeedDate']);
  // one state throughout: no tag, the record and line say so
  r = await bench('lit-gain', ['gain', 'fast-nav']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^host state: display on, FullWake, power AC, display-sleep assertion yes$/m);
  assert.deepEqual([results('fast-nav').gain.verdict, results('fast-nav').gain.hostState.tag, results('fast-nav').gain.hostState.display], ['HOLDS', null, ['on']]);
});

test('review-host-state N2 (ts-lock-bundle c): a gain judged against a calibration stored in another display / wake state is tagged HOST-DISPLAY-CHANGED and exits 3', async (t) => {
  const resFile = join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json');
  const keep = readFileSync(resFile, 'utf8');
  t.after(() => writeFileSync(resFile, keep));
  // the A/A runs with the display asleep in DarkWake throughout: one state, so it is stored
  const ASLEEP = { FAKE_HOST_DISPLAY: '0', FAKE_HOST_FULLWAKE: '0' };
  let r = await bench('n2-cal', ['calibrate', 'fast-nav'], ASLEEP);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^host state: display off, DarkWake, /m);
  assert.deepEqual([results('fast-nav').calibration.hostState.tag, results('fast-nav').calibration.runs[0].host.power.start.display], [null, 'off']);
  const res = results('fast-nav');
  delete res.authored;
  writeFileSync(resFile, JSON.stringify(res, null, 1));
  // the gain runs lit, one state throughout: the floor came from another state
  r = await bench('n2-gain', ['gain', 'fast-nav']);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^host state: display off\/on, DarkWake\/FullWake, .*; HOST-DISPLAY-CHANGED: the arms differ: calibration-[AB] display off, DarkWake vs calibration-[AB] display off, DarkWake vs [AB] display on, FullWake vs [AB] display on, FullWake$/m);
  assert.match(r.stdout, /^GAIN HOST-DISPLAY-CHANGED: HOLDS fast-nav styleLayoutMs: .* \[not authored: HOST-DISPLAY-CHANGED\] -> /m);
  const after = results('fast-nav');
  assert.equal(after.authored, undefined);
  assert.deepEqual([after.gain.verdict, after.gain.hostState.tag], ['HOST-DISPLAY-CHANGED: HOLDS', 'HOST-DISPLAY-CHANGED']);
  assert.deepEqual(Object.keys(after.gain.hostState.byLabel).sort(), ['A', 'B', 'calibration-A', 'calibration-B']);
  // calibrate fits its own floor: the stored one's state is never compared
  r = await bench('n2-recal', ['calibrate', 'fast-nav']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([results('fast-nav').calibration.hostState.tag, Object.keys(results('fast-nav').calibration.hostState.byLabel).sort()], [null, ['A', 'B']]);
});

test('ts-headless: gain / calibrate measure timing headed only: --headless / --functional and a headless $CHROME are refused (exit 2), nothing stored', async () => {
  const before = readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json'), 'utf8');
  for (const [cmd, f] of [['gain', '--headless'], ['calibrate', '--functional']]) {
    const r = await bench(`hl-${cmd}`, [cmd, 'fast-nav', f]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /bench gain\/calibrate measures timing and runs headed only.*tools\/check\.mjs/);
    assert.equal(existsSync(env(`hl-${cmd}`).FAKE_CHROME_LOG), false, 'refused before any browser');
  }
  // a $CHROME that runs headless anyway (FAKE_CHROME_HEADLESS=1: its User-Agent says HeadlessChrome)
  const r = await bench('hl-env', ['calibrate', 'fast-nav'], { FAKE_CHROME_HEADLESS: '1' });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /Chrome runs headless \(User-Agent .*HeadlessChrome.*\): refused/);
  const log = readLog(env('hl-env').FAKE_CHROME_LOG);
  assert.ok(log.some((l) => l.method === '(started)'));
  assert.equal(log.filter((l) => l.method === 'Page.navigate').length, 0, 'no page measured');
  assert.equal(existsSync(join(env('hl-env').FW_STATE_DIR, 'locks', 'chrome-measure.json')), false, 'lock released');
  assert.equal(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json'), 'utf8'), before, 'nothing stored');
});

test('I-063 review-i063 B2/N1/N2 (MEASUREMENT CODE): a warm Simulator found inside the hold is shut down by bench before run 1, then a quiet wait; one before the hold (keeper dead) at the host gate; both recorded as simWarm in bench-results.json; one whose shutdown fails stops bench before any Chrome (WAIT, exit 1)', async () => {
  // a warm fw-sim on the fake simctl (tests/fixtures/fake-simctl.mjs): config, device, warm.json, no keeper
  const warmEnv = (name, { shutdownFail = false } = {}) => {
    const e = env(name);
    const simDir = join(e.FW_STATE_DIR, 'sim');
    mkdirSync(simDir, { recursive: true });
    const udid = 'F00DF00D-0000-4000-8000-000000000063'; // made up
    const simctl = join(repo.root, `simctl-${name}.sh`);
    writeFileSync(simctl, `#!/bin/sh\nexec "${process.execPath}" "${join(TESTS, 'fixtures', 'fake-simctl.mjs')}" "$@"\n`, { mode: 0o755 });
    const state = join(repo.root, `simctl-${name}.json`);
    writeFileSync(state, JSON.stringify({ runtimes: [], devices: [{ udid, name: 'fw-sim 15 Pro Max', state: 'Booted', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max', runtimeId: 'rt', shutdownFail }] }));
    writeFileSync(join(simDir, 'config.json'), JSON.stringify({ udid }), { mode: 0o600 });
    const now = new Date().toISOString();
    writeFileSync(join(simDir, 'warm.json'), JSON.stringify({ id: 'w1', udid, runtimeId: 'rt', bootedAt: now, sessions: 1, lastOwner: 'me', lastSessionEndedAt: now, idleSec: 300, idleUntil: new Date(Date.now() + 300000).toISOString() }), { mode: 0o600 });
    return { extra: { FW_SIMCTL: simctl, FAKE_SIMCTL_STATE: state }, dev: () => JSON.parse(readFileSync(state, 'utf8')).devices[0], warm: () => existsSync(join(simDir, 'warm.json')), simDir, state };
  };
  // N2: a warm device that appears inside the hold (after its gate): bench's own backstop shuts it down, then waits for
  // a quiet host before run 1 (bench has no recheck before it without --max-load), recorded as simWarm.settle
  let w = warmEnv('simown');
  renameSync(join(w.simDir, 'warm.json'), join(w.simDir, 'warm.pending'));
  const mk = `const fs = require('fs'); fs.renameSync(${JSON.stringify(join(w.simDir, 'warm.pending'))}, ${JSON.stringify(join(w.simDir, 'warm.json'))}); const s = JSON.parse(fs.readFileSync(${JSON.stringify(w.state)}, 'utf8')); s.devices[0].state = 'Booted'; fs.writeFileSync(${JSON.stringify(w.state)}, JSON.stringify(s));`;
  { const s = JSON.parse(readFileSync(w.state, 'utf8')); s.devices[0].state = 'Shutdown'; writeFileSync(w.state, JSON.stringify(s)); }
  let r = await nodeAsync(join(repo.wt, 'tools', 'lock.mjs'), ['run', 'chrome-measure', '--owner', 'bench-own', '--', 'sh', '-c', `"${process.execPath}" -e "$MK" && "${process.execPath}" tools/bench.mjs calibrate fast-nav`], { cwd: repo.wt, env: { ...env('simown'), ...w.extra, MK: mk }, timeout: 115000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /NOTE: a warm Simulator \(fw-sim, idle since \S+, keeper not running\) was still booted at the start of this bench hold: shut down before the first run/);
  assert.match(r.stdout, /\[bench\] after the Simulator shutdown: quiet after [\d.]+ s \(I-063\)/);
  let sw = results('fast-nav').calibration.simWarm;
  assert.deepEqual([sw.action, sw.ok, sw.shutDown, sw.settle.quiet, 'gate' in sw], ['shut down', true, true, true, false]);
  assert.ok(w.dev().state === 'Shutdown' && !w.warm());
  // N1: a warm device before the hold: the host gate shuts it down (its keeper is dead)
  w = warmEnv('simwarm');
  r = await bench('simwarm', ['calibrate', 'fast-nav'], w.extra);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /\[lock chrome-measure\] a warm Simulator \(fw-sim\) at the host gate: shut down \(I-063\)/);
  assert.match(r.stdout, /NOTE: the host gate of this hold found a warm Simulator \(fw-sim\): shut down, before the grant \(I-063; recorded as simWarm\)/);
  sw = results('fast-nav').calibration.simWarm;
  assert.deepEqual([sw.action, sw.ok, sw.gate, sw.keeperAlive], ['shut down', true, true, false]);
  assert.ok(w.dev().state === 'Shutdown' && !w.warm());
  // the shutdown fails: the gate stays closed (granted at its cap, FW_GATE_MAX_WAIT 2 s, before its second attempt at
  // 30 s would end the wait: tests/e2e/sim-warm.test.mjs n1), then bench's own backstop
  // refuses before any Chrome starts; nothing is stored
  const before = readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json'), 'utf8');
  w = warmEnv('simfail', { shutdownFail: true });
  r = await bench('simfail', ['calibrate', 'fast-nav'], { ...w.extra, FW_GATE_MAX_WAIT: '2' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /a warm Simulator \(fw-sim\) at the host gate: shutdown FAILED \(.*\); attempt 1 of 2 \(I-063\)/);
  assert.match(r.stdout, /WAIT: a warm Simulator \(fw-sim\) may still be booted and its shutdown failed \(.*\): nothing is timed beside it, so this bench hold stops here/);
  assert.equal(existsSync(env('simfail').FAKE_CHROME_LOG), false, 'no Chrome started');
  assert.ok(w.dev().state === 'Booted' && w.warm(), 'the record stays');
  assert.equal(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'bench-results.json'), 'utf8'), before, 'nothing stored');
  assert.equal(existsSync(join(env('simfail').FW_STATE_DIR, 'locks', 'chrome-measure.json')), false, 'lock released');
});
