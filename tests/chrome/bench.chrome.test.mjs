// OPT-IN (npm run test:chrome): a real `bench.mjs mech` in a temp repo + worktree over the fixture baseline,
// through the REAL chrome-measure lock: the file holds it once (chromeLock, I-022) and bench.mjs
// re-enters that hold (lock.env). The fixture page calls
// document.querySelector('.start-selling-top-nav') every frame; the topic's overlay caches it. Checks the
// real page probes (querySelector, the style accessor wrapper on this Chrome, layout reads, perfMetrics),
// parity on body[data-y], that a deliberately wrong expectation fails, and that the stepped scroll ends.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, run, REPO, chromeLock } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();
const lock = chromeLock(`test-chrome-bench-${process.pid}`, { cmd: 'bench.chrome test' });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());

test('bench mech with real Chrome: counts discriminate, parity holds, a wrong expectation fails', async () => {
  const repo = makeTempRepo({ worktree: 'bench-chrome' });
  makeFixtureHome(repo.main);
  const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
  assert.equal(fix('new', 'nav-cache').code, 0);
  assert.equal(fix('edit', 'nav-cache', PAGE_JS).code, 0);
  const f = join(repo.wt, 'fixes', 'nav-cache', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('function tick() {\n  const n = document.querySelector(".start-selling-top-nav");', 'const nav = document.querySelector(".start-selling-top-nav");\nfunction tick() {\n  const n = nav;'));
  assert.equal(fix('diff', 'nav-cache').code, 0);
  const spec = {
    schema: 1, topic: 'nav-cache', status: 'authored', evidence: 'fixture: one nav lookup per frame -> once',
    // the fixture page scrolls ~1000 px at 430x932: 100 px steps walk ~10 steps of >= 2 quiet frames each,
    // so the per-frame lookups / reads / writes reach the >= 10 baselines (300 px steps gave 4 steps,
    // 8 frames: VACUOUS, I-028)
    segments: { page: { from: 'top', to: 'end', step: 100 } },
    spots: { idle: { at: 'top', wait: 0.5, window: 1 } },
    probes: {
      navQs: { kind: 'querySelector', selector: '.start-selling-top-nav' },
      navTransform: { kind: 'styleWrite', prop: 'transform', selector: '.start-selling-top-nav' },
      heroRect: { kind: 'layoutRead', method: 'getBoundingClientRect', selector: '.hero' },
      layouts: { kind: 'perfMetrics', metric: 'LayoutCount' },
      perFrame: { kind: 'layoutsPerFrame', metric: 'RecalcStyleCount' },
      scrollListeners: { kind: 'listeners', target: 'window', type: 'scroll', passive: true },
    },
    mechanism: [
      { id: 'nav-cached', viewport: 'mobile', segment: 'page', probe: 'navQs', baseline: '>= 10', patched: '== 0', why: 'looked up once' },
      { id: 'nav-cached-idle', viewport: 'mobile', spot: 'idle', probe: 'navQs', baseline: '>= 10', patched: '== 0', why: 'also at idle' },
      { id: 'transform-still-written', viewport: 'mobile', segment: 'page', probe: 'navTransform', baseline: '>= 10', patched: '>= 0.5 * baseline', why: 'the style accessor wrapper sees el.style.transform writes' },
      { id: 'hero-read', viewport: 'mobile', segment: 'page', probe: 'heroRect', baseline: '>= 10', patched: '>= 0.5 * baseline', why: 'layout reads are counted' },
      { id: 'layouts-counted', viewport: 'mobile', spot: 'idle', probe: 'layouts', baseline: '>= 0', patched: '>= 0', why: 'getMetrics deltas' },
      { id: 'per-frame', viewport: 'mobile', spot: 'idle', probe: 'perFrame', baseline: '>= 0', patched: '>= 0', why: 'ratio per frame' },
      { id: 'passive-scroll', viewport: 'mobile', segment: 'page', probe: 'scrollListeners', baseline: '>= 1', patched: '>= 1', why: 'DOMDebugger listeners' },
    ],
    parity: [{ viewport: 'mobile', segment: 'page', attrs: [['body', 'data-y']] }],
  };
  writeFileSync(join(repo.wt, 'fixes', 'nav-cache', 'bench.json'), JSON.stringify(spec, null, 1));
  // the real host (FW_TEST_HOST ''), like the other Chrome tests; each mech run stays under 120 s (review-bench c)
  const env = { ...lock.env, FW_STATE_DIR: join(common, 'fastwork-mirror'), FW_LOCK_OWNER: `test-chrome-bench-${process.pid}`, FW_TEST_HOST: '' };
  const t0 = Date.now();
  const r = await nodeAsync(join(repo.wt, 'tools', 'bench.mjs'), ['mech', 'nav-cache'], { cwd: repo.wt, env, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /\[lock chrome-measure\] busy/, 'bench.mjs re-entered the hold instead of queueing');
  const res = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'nav-cache', 'bench-results.json'), 'utf8')).mech;
  const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
  for (const c of res.checks) assert.equal(c.verdict, 'PASS', `${c.id}: ${JSON.stringify(c)}`);
  assert.ok(byId['nav-cached'].baseline.values.every((v) => v >= 10));
  assert.deepEqual(byId['nav-cached'].patched.values, [0, 0]);
  assert.equal(res.parity[0].verdict, 'PASS');
  assert.ok(res.parity[0].steps >= 3, 'the stepped scroll walked the page');
  assert.match(res.chrome, /Chrome\/\d+/);
  for (const side of ['baseline', 'patched']) for (const s of res.sessions.mobile[side]) assert.deepEqual(s.errors, [], 'no probe or page errors');
  console.log(`bench mech (real Chrome): ${res.seconds} s, nav-cached baseline ${byId['nav-cached'].baseline.values}, transform ${byId['transform-still-written'].baseline.values} -> ${byId['transform-still-written'].patched.values}, capped ${JSON.stringify(res.sessions.mobile.baseline.map((s) => s.capped))}; wall ${Math.round((Date.now() - t0) / 1000)} s`);
  assert.ok(res.seconds < 60, `mech took ${res.seconds} s`);

  // a deliberately wrong expectation: FAIL, exit 1
  const t2 = 'nav-wrong';
  mkdirSync(join(repo.wt, 'fixes', t2));
  cpSync(join(repo.wt, 'fixes', 'nav-cache', 'patch.diff'), join(repo.wt, 'fixes', t2, 'patch.diff'));
  writeFileSync(join(repo.wt, 'fixes', t2, 'bench.json'), JSON.stringify({ ...spec, topic: t2, spots: undefined, mechanism: [{ ...spec.mechanism[0], patched: '>= 1' }] }, null, 1));
  const w = await nodeAsync(join(repo.wt, 'tools', 'bench.mjs'), ['mech', t2, '--repeat', '1'], { cwd: repo.wt, env, timeout: 120000 });
  assert.equal(w.code, 1, w.out);
  assert.match(w.stdout, /FAIL +nav-cached/);
});
