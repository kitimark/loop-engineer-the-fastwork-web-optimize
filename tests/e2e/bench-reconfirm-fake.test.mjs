// tools/bench.mjs reconfirm end to end with the fake Chrome (bench mode) and the fake host (FW_TEST_HOST):
// the _landed overlay rebuilt from main's committed patches in landing order, Tier A of every landed topic
// with a bench.json in one normal hold, Tier B per --gain topic in its own hold (an A/A first when its floor
// is stale); MISSING (no bench.json), CONFLICT (a landed patch no longer applies), report.json / report.md.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, TESTS, git } from '../helpers.mjs';
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
  repo = makeTempRepo({ worktree: 'reconfirm-wt' });
  const fx = makeFixtureHome(repo.main);
  for (const d of [fx.site, fx.pretty]) writeFileSync(join(d, 'bench-fake.json'), JSON.stringify(BASE_FAKE));
});

test('reconfirm: _landed from main in landing order, Tier A in one hold, Tier B (A/A first) in its own, MISSING, CONFLICT', async () => {
  const m = repo.main;
  const commit = (msg) => { git(m, 'add', '-A', 'fixes'); git(m, 'commit', '-q', '-m', msg); };
  makeTopic(m, 'fast-nav', '/bench-fake.json', JSON.stringify(PATCH_FAKE), spec('fast-nav'));
  commit('land fast-nav');
  makeTopic(m, 'robots-fix', '/robots.txt', 'User-agent: *\nDisallow:\n', spec('robots-fix', { gain: undefined }));
  commit('land robots-fix');
  makeTopic(m, 'no-bench', '/page.html', '<!doctype html><title>page</title><p>changed</p>\n');
  commit('land no-bench');
  let r = await bench('rc', ['reconfirm', '--gain', 'fast-nav', '--runs', '4']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^bench reconfirm main \([0-9a-f]+\): landed fast-nav, robots-fix, no-bench; Tier A on fast-nav, robots-fix; Tier B on fast-nav/m);
  assert.match(r.stdout, /A\/A first: the calibration of fast-nav is missing or stale/);
  assert.match(r.stdout, /^GAIN HOLDS fast-nav styleLayoutMs: HL shift 100/m);
  assert.match(r.stdout, /^\| fast-nav \| PASS \| HOLDS \|/m);
  assert.match(r.stdout, /^\| robots-fix \| PASS \| - \|/m, 'robots-fix passes on _landed: fast-nav removed the lookups there');
  assert.match(r.stdout, /^\| no-bench \| MISSING \| - \| no bench.json/m);
  assert.match(r.stdout, /^RECONFIRM PASS main [0-9a-f]+ -> out\/bench\/reconfirm\/[0-9a-f]+\/report.md$/m);
  const sha = git(m, 'rev-parse', '--short', 'main');
  const rep = JSON.parse(readFileSync(join(repo.wt, 'out', 'bench', 'reconfirm', sha, 'report.json'), 'utf8'));
  assert.deepEqual(rep.landed, ['fast-nav', 'robots-fix', 'no-bench']);
  assert.equal(rep.tierB['fast-nav'].calibration, 'reconfirm A/A');
  assert.equal(readFileSync(join(repo.wt, 'out', 'bench', 'overlays', '_landed', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow:\n');
  assert.ok(existsSync(join(repo.wt, 'out', 'bench', 'overlays', '_landed', 'page.html')));
  // one normal hold for Tier A, then one per --gain topic (review-bench b), each announcing 600 s (I-020, review-bench a);
  // the last grant (Tier B) came after Tier A's page loads, and every hold is released
  assert.deepEqual(rep.holds, [{ what: 'tier A', gateTimeout: false, expectSec: 600 }, { what: 'tier B fast-nav', gateTimeout: false, expectSec: 600 }]);
  const lg = JSON.parse(readFileSync(join(env('rc').FW_STATE_DIR, 'locks', 'chrome-measure.last-grant.json'), 'utf8'));
  const firstLoad = readLog(env('rc').FAKE_CHROME_LOG).find((l) => l.method === '(bench-fake)').t;
  assert.ok(Date.parse(lg.at) > firstLoad, 'Tier B took its own hold after Tier A');
  assert.deepEqual([lg.owner, lg.short], ['bench-reconfirm', false]);
  assert.equal(existsSync(join(env('rc').FW_STATE_DIR, 'locks', 'chrome-measure.json')), false);
  // T8+ (I-033): the display / wake state over Tier B's gain runs
  assert.deepEqual([rep.tierB['fast-nav'].hostState.tag, rep.tierB['fast-nav'].hostState.display], [null, ['on']]);
  // ... and when the display sleeps inside the first gain run: the A/A floor takes 8 runs = 16 hostPower readings, so
  // readings 17-18 are gain run 1 (side A): on at its start, off at its end
  r = await bench('rc-dark', ['reconfirm', '--gain', 'fast-nav', '--runs', '4'], { FAKE_HOST_DARKWAKE_AFTER: '17' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /A\/A first: the calibration of fast-nav is missing or stale/);
  assert.match(r.stdout, /^GAIN HOST-DISPLAY-CHANGED: HOLDS fast-nav styleLayoutMs: /m);
  assert.match(r.stdout, /^\| fast-nav \| PASS \| HOLDS \| HOST-DISPLAY-CHANGED: A run 1: display on, FullWake at the start, display off, DarkWake at the end; load1 /m);
  assert.match(r.stdout, /^RECONFIRM HOST-DISPLAY-CHANGED: PASS main /m);
  const repDark = JSON.parse(readFileSync(join(repo.wt, 'out', 'bench', 'reconfirm', sha, 'report.json'), 'utf8'));
  assert.equal(repDark.tierB['fast-nav'].hostState.tag, 'HOST-DISPLAY-CHANGED');
  // a later landing whose patch no longer applies on top: CONFLICT, never skipped
  makeTopic(m, 'late-nav', '/bench-fake.json', JSON.stringify({ ...BASE_FAKE, probes: { navQs: 1 } }), spec('late-nav'));
  commit('land late-nav (made on the plain baseline)');
  r = await bench('rc2', ['reconfirm']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^CONFLICT late-nav: /m);
  assert.match(r.stdout, /^RECONFIRM FAIL: 1 landed patch\(es\) no longer apply/m);
  assert.equal(existsSync(join(env('rc2').FW_STATE_DIR, 'locks')), false, 'never took the lock');
});

test('I-034: a non-finite gain metric ends that topic INCONCLUSIVE naming it; the later --gain topics still run', async () => {
  // its own repo: null-p95 lands first, its patched page logs a frame list whose p95 is null (fake perfFrames);
  // later-topic lands after it and is measured on the same _landed overlay with a finite metric
  const r2 = makeTempRepo({ worktree: 'reconfirm-nf' });
  const fx = makeFixtureHome(r2.main);
  for (const d of [fx.site, fx.pretty]) writeFileSync(join(d, 'bench-fake.json'), JSON.stringify(BASE_FAKE));
  const m = r2.main;
  const commit = (msg) => { git(m, 'add', '-A', 'fixes'); git(m, 'commit', '-q', '-m', msg); };
  makeTopic(m, 'null-p95', '/bench-fake.json', JSON.stringify({ ...PATCH_FAKE, perfFrames: [null] }), spec('null-p95', { gain: { ...spec('x').gain, metric: 'p95' } }));
  commit('land null-p95');
  makeTopic(m, 'later-topic', '/robots.txt', 'User-agent: *\nDisallow:\n', spec('later-topic'));
  commit('land later-topic');
  const e = { ...env('nf'), FW_STATE_DIR: join(r2.root, 'state-nf'), FAKE_CHROME_LOG: join(r2.root, 'nf.jsonl') };
  const r = await nodeAsync(join(r2.wt, 'tools', 'bench.mjs'), ['reconfirm', '--gain', 'all', '--runs', '4'], { cwd: r2.wt, env: e, timeout: 115000 });
  assert.equal(r.code, 3, r.out);
  assert.doesNotMatch(r.out, /is not a finite number \(null\); fix or drop that run/, 'never handed to bench-stats');
  assert.match(r.stdout, /^GAIN INCONCLUSIVE null-p95 p95 \(.*\): scenario errors: p95 not a finite number \(null\) on side B$/m);
  assert.match(r.stdout, /^GAIN HOLDS later-topic styleLayoutMs: HL shift 100/m);
  assert.match(r.stdout, /^\| null-p95 \| PASS \| INCONCLUSIVE \|/m);
  assert.match(r.stdout, /^\| later-topic \| PASS \| HOLDS \|/m);
  assert.match(r.stdout, /^RECONFIRM INCONCLUSIVE main [0-9a-f]+ -> /m);
  const sha = git(m, 'rev-parse', '--short', 'main');
  const rep = JSON.parse(readFileSync(join(r2.wt, 'out', 'bench', 'reconfirm', sha, 'report.json'), 'utf8'));
  assert.deepEqual(Object.keys(rep.tierB), ['null-p95', 'later-topic']);
  assert.deepEqual([rep.tierB['null-p95'].verdict, rep.tierB['null-p95'].values.patched.length, rep.tierB['null-p95'].values.baseline.length], ['INCONCLUSIVE', 0, 4]);
});
