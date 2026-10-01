// OPT-IN (npm run test:chrome): the functional check in a real headless Chrome (ts-headless). A real `fix.mjs check`
// in a temp repo + worktree over the fixture baseline: the baseline page is clean; an overlay whose page script throws
// and loads a missing chunk gives new errors and a new 404 (exit 1). check.mjs on its own: the page sees no
// "Headless" in navigator.userAgent, and the screen before emulation is the pinned 1512x982 at DPR 2. Through the
// REAL chrome-measure lock (FW_STATE_DIR = this repository's shared lock dir); the file holds it once (chromeLock,
// I-022), the tools re-enter that hold.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, run, REPO, chromeLock, startServe } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();
const OWNER = `test-chrome-check-${process.pid}`;
// shared: re-enters test:chrome:fn's shared hold (ts-lock-share's lane); main's chromeLock ignores the options
const lock = chromeLock(OWNER, { cmd: 'check.chrome test', chromeMode: 'headless' }, { shared: true, weight: 1, maxSec: 300 });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());
const toolEnv = () => ({ ...lock.env, FW_STATE_DIR: join(common, 'fastwork-mirror'), FW_LOCK_OWNER: OWNER, FW_TEST_HOST: '' });

let repo;
before(() => {
  repo = makeTempRepo({ worktree: 'check-chrome' });
  makeFixtureHome(repo.main);
});

test('fix.mjs check: a page that throws and loads a missing chunk gives new errors and a new 404 (exit 1); the baseline side is clean', async () => {
  const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
  assert.equal(fix('new', 'breaks-page').code, 0);
  assert.equal(fix('edit', 'breaks-page', PAGE_JS).code, 0);
  const f = join(repo.wt, 'fixes', 'breaks-page', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8') + `setTimeout(() => { throw new Error("check-chrome-boom"); }, 0);
const s = document.createElement("script");
s.src = "/_app/immutable/chunks/missing.fixture.js";
document.head.append(s);
`);
  const r = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['check', 'breaks-page'], { cwd: repo.wt, env: { ...lock.env, ...toolEnv() }, timeout: 280000 });
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /\[lock chrome-measure\] busy/, 'check.mjs re-entered the hold instead of queueing');
  const d = join(repo.wt, 'out', 'check', 'breaks-page');
  const dir = join(d, readdirSync(d).sort().pop());
  const res = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8'));
  const raw = JSON.parse(readFileSync(join(dir, 'check-raw.json'), 'utf8'));
  const base = raw.results.find((x) => x.label === 'base');
  assert.deepEqual([base.errors, base.notFound, base.failures], [[], [], []], `the baseline fixture page is clean: ${JSON.stringify(base)}`);
  assert.ok(res.regressions.newErrors.some((e) => /check-chrome-boom/.test(e)), res.regressions.newErrors.join(' | '));
  assert.deepEqual(res.regressions.new404s, ['404 /_app/immutable/chunks/missing.fixture.js']);
  assert.match(res.verdict, /^REGRESSED: /);
  assert.equal(res.chromeMode, 'headless');
  assert.deepEqual([base.preEmulation.dpr, base.preEmulation.screen], [2, [1512, 982]], 'the pinned --screen-info');
  assert.equal(base.walk.y, base.walk.maxY, 'scrolled to the bottom');
});

test('check.mjs: navigator.userAgent has no "Headless" (the override), the page DPR is the emulated 3', async (t) => {
  const s = await startServe(['--port', '0', '--quiet', '--vendors=local'], { env: { FW_MIRROR_HOME: repo.main } });
  t.after(() => s.stop());
  const out = join(repo.root, 'check-ua');
  const r = await nodeAsync(join(repo.main, 'tools', 'check.mjs'), [`base=${s.url}`, '--no-screens', '--probe', 'ua=navigator.userAgent', '--probe', 'dpr=devicePixelRatio', '--out', out, '--result', join(out, 'check.json'), '--owner', OWNER],
    { cwd: repo.main, env: { ...lock.env, ...toolEnv(), FW_MIRROR_HOME: repo.main }, timeout: 280000 });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(out, 'check.json'), 'utf8'));
  const p = res.results[0];
  assert.doesNotMatch(p.probes.ua, /Headless/i);
  assert.match(p.probes.ua, /\bChrome\/\d+/);
  assert.equal(p.probes.dpr, 3);
  assert.match(p.preEmulation.ua, /HeadlessChrome\//, 'the browser itself is headless');
  assert.match(res.lock.mode, /^reentrant/);
});
