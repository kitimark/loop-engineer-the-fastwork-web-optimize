// OPT-IN (npm run test:chrome): a real `fix.mjs ab <topic> --runs 1` (with screenshots) in a temp repo +
// worktree over the fixture baseline, through the REAL chrome-measure lock (FW_STATE_DIR points at this
// repository's shared lock dir, since the temp repo has its own .git). The file holds the lock once
// (chromeLock: the queue wait is outside the per-test timeout, I-022); fix.mjs ab re-enters that hold.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, run, REPO, chromeLock } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();
const lock = chromeLock(`test-chrome-ab-${process.pid}`, { cmd: 'fix-ab.chrome test' });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());

test('fix.mjs ab --runs 1 --cpu 2 with real Chrome', async () => {
  const repo = makeTempRepo({ worktree: 'ab-chrome' });
  makeFixtureHome(repo.main);
  const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
  assert.equal(fix('new', 'nav-cache').code, 0);
  assert.equal(fix('edit', 'nav-cache', PAGE_JS).code, 0);
  const f = join(repo.wt, 'fixes', 'nav-cache', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('function tick() {\n  const n = document.querySelector(".start-selling-top-nav");', 'const nav = document.querySelector(".start-selling-top-nav");\nfunction tick() {\n  const n = nav;'));
  const r = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'nav-cache', '--runs', '1', '--cpu', '2', '--idle', '1', '--max-wait', '10'], { cwd: repo.wt, env: { ...lock.env, FW_STATE_DIR: join(common, 'fastwork-mirror'), FW_LOCK_OWNER: `test-chrome-ab-${process.pid}`, FW_TEST_HOST: '', FW_GATE_MAX_WAIT: '60' }, timeout: 600000 });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /\[lock chrome-measure\] busy/, 'fix.mjs ab / verify.mjs re-entered the hold instead of queueing');
  const res = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'nav-cache', 'results.json'), 'utf8'));
  assert.equal(res.kind, 'A/B');
  assert.equal(res.config.cpu, 2);
  assert.equal(res.servedCheck[0].patched.source, 'overlay');
  for (const side of ['baseline', 'patched']) {
    assert.ok(res.metrics.scroll.fps[side].median > 0, `${side} fps`);
    assert.equal(res.metrics.scroll.fps[side].runs.length, 1);
  }
  assert.match(res.metrics.scroll.fps.verdict, /^n=1/);
  assert.equal(res.config.idle, 1, 'idle phase passed through (1 s keeps the run inside the 300 s short-lane hold)');
  for (const side of ['baseline', 'patched']) assert.ok(res.metrics.idle.fps[side].median > 0, `idle ${side} fps`);
  assert.match(res.markdown, /^\| idle: fps \|/m);
  assert.deepEqual(res.regressions.newErrors, []);
  assert.deepEqual(res.regressions.new404s, []);
  assert.deepEqual(Object.keys(res.regressions.screenshotDiffPct).sort(), ['bottom', 'middle', 'top']);
  for (const v of Object.values(res.regressions.screenshotDiffPct)) assert.equal(typeof v, 'number', 'pixel diff computed');
  assert.equal(res.regressions.morphReached.baseline.length, 1);
  assert.match(res.markdown, /^\| mobile 2x, n=1 \|/m);
  // host guard on the real host (I-017): recorded for both runs, summarised, printed
  assert.equal(res.host.recorded, true);
  assert.equal(res.host.runsTotal, 2);
  assert.equal(typeof res.host.otherCpuPctMax, 'number');
  assert.match(res.markdown, /host: \d+ of 2 runs contaminated/);
});
