// tools/bench.mjs gain | calibrate end to end with the fake Chrome (bench mode: per-side
// Performance.getMetrics steps from the served /bench-fake.json) and the fake host (FW_TEST_HOST, from
// ts-i017's tools/lib/host.mjs): ABBA order, 6x throttle, the normal lane, calibration refused on a warn
// host, contaminated runs -> INCONCLUSIVE, authoring from a clean HOLDS, experiments, device iphone.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
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
