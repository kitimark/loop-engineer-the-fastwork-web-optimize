// OPT-IN (npm run test:chrome): a real `fix.mjs ab <topic> --runs 1` (with screenshots) in a temp repo +
// worktree over the fixture baseline, through the REAL chrome-measure lock (FW_STATE_DIR points at this
// repository's shared lock dir, since the temp repo has its own .git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, run, REPO } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();

test('fix.mjs ab --runs 1 --cpu 2 with real Chrome', async () => {
  const repo = makeTempRepo({ worktree: 'ab-chrome' });
  makeFixtureHome(repo.main);
  const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
  assert.equal(fix('new', 'nav-cache').code, 0);
  assert.equal(fix('edit', 'nav-cache', PAGE_JS).code, 0);
  const f = join(repo.wt, 'fixes', 'nav-cache', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('function tick() {\n  const n = document.querySelector(".start-selling-top-nav");', 'const nav = document.querySelector(".start-selling-top-nav");\nfunction tick() {\n  const n = nav;'));
  const r = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'nav-cache', '--runs', '1', '--cpu', '2'], { cwd: repo.wt, env: { FW_STATE_DIR: join(common, 'fastwork-mirror'), FW_LOCK_OWNER: `test-chrome-ab-${process.pid}` }, timeout: 600000 });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'nav-cache', 'results.json'), 'utf8'));
  assert.equal(res.kind, 'A/B');
  assert.equal(res.config.cpu, 2);
  assert.equal(res.servedCheck[0].patched.source, 'overlay');
  for (const side of ['baseline', 'patched']) {
    assert.ok(res.metrics.scroll.fps[side].median > 0, `${side} fps`);
    assert.equal(res.metrics.scroll.fps[side].runs.length, 1);
  }
  assert.match(res.metrics.scroll.fps.verdict, /^n=1/);
  assert.equal(res.config.idle, 6, 'default idle phase');
  for (const side of ['baseline', 'patched']) assert.ok(res.metrics.idle.fps[side].median > 0, `idle ${side} fps`);
  assert.match(res.markdown, /^\| idle: fps \|/m);
  assert.deepEqual(res.regressions.newErrors, []);
  assert.deepEqual(res.regressions.new404s, []);
  assert.deepEqual(Object.keys(res.regressions.screenshotDiffPct).sort(), ['bottom', 'middle', 'top']);
  for (const v of Object.values(res.regressions.screenshotDiffPct)) assert.equal(typeof v, 'number', 'pixel diff computed');
  assert.equal(res.regressions.morphReached.baseline.length, 1);
  assert.match(res.markdown, /^\| mobile 2x, n=1 \|/m);
});
